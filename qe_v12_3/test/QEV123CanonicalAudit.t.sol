// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../src/QEV123CanonicalAudit.sol";

contract QEV123CanonicalAuditTest {
    uint256 constant WAD = 1e18;
    uint256 constant BPS = 10_000;
    uint256 constant PRICE = 2500e18;
    uint256 constant START_ETH = 2e14; // 0.0002 WETH = $0.50 at $2500
    uint256 constant START_USDC = 5e17; // $0.50
    uint256 constant PRINCIPAL = 1e17; // $0.10 flash notional

    struct Env {
        V123Token usdc;
        V123Token weth;
        V123BridgeVault ethBridge;
        V123BridgeVault usdcBridge;
        V123DebtBook debt;
        V123ZeroFeeFlashVault flash;
        V123ExternalDex dex;
        V123QEExecutor exec;
    }

    function env(uint256 bonusBps, uint256 feeBps) internal returns (Env memory z) {
        z.usdc = new V123Token("USDC", "USDC");
        z.weth = new V123Token("WETH", "WETH");
        z.ethBridge = new V123BridgeVault(z.weth);
        z.usdcBridge = new V123BridgeVault(z.usdc);
        z.debt = new V123DebtBook();
        z.flash = new V123ZeroFeeFlashVault(z.usdc);
        z.dex = new V123ExternalDex(z.usdc, z.weth, PRICE, bonusBps, feeBps);
        z.exec = new V123QEExecutor(
            z.usdc,
            z.weth,
            z.ethBridge,
            z.usdcBridge,
            z.debt,
            z.flash,
            z.dex,
            PRICE
        );

        z.ethBridge.setController(address(z.exec));
        z.usdcBridge.setController(address(z.exec));
        z.debt.setController(address(z.exec));

        // Exactly $1 of canonical bridge capital.
        z.weth.mint(address(z.ethBridge), START_ETH);
        z.usdc.mint(address(z.usdcBridge), START_USDC);

        // External working liquidity; never counted as protocol bridge NAV.
        z.usdc.mint(address(z.flash), 10_000e18);
        z.weth.mint(address(z.dex), 10_000e18);
    }

    function nav(Env memory z) internal view returns (uint256) {
        return z.weth.balanceOf(address(z.ethBridge)) * PRICE / WAD
            + z.usdc.balanceOf(address(z.usdcBridge));
    }

    function absDiff(uint256 a, uint256 b) internal pure returns (uint256) {
        return a >= b ? a - b : b - a;
    }

    function testClosedNoQEConservesCanonicalBridgeNAV() public {
        Env memory z = env(0, 0);
        uint256 beforeNav = nav(z);
        z.exec.run(PRINCIPAL, 0);
        uint256 afterNav = nav(z);
        require(absDiff(afterNav, beforeNav) <= 5_000, "CLOSED_NAV_CREATED");
        require(z.exec.cumulativeExecutorPnl() <= 5_000, "NO_QE_PNL_CREATED");
        require(z.debt.debtUsd() == 0, "DEBT_LEFT");
    }

    function testQECanCreateExecutorPnLButNotCanonicalNAVInClosedMarket() public {
        Env memory z = env(0, 0);
        uint256 beforeNav = nav(z);
        uint256 eth0 = z.weth.balanceOf(address(z.ethBridge));
        uint256 usdc0 = z.usdc.balanceOf(address(z.usdcBridge));

        z.exec.run(PRINCIPAL, 1_000); // +10% QE-created internal premium

        uint256 afterNav = nav(z);
        require(z.exec.cumulativeExecutorPnl() > 0, "NO_EXECUTOR_PNL");
        require(z.exec.lastQEPremium() > 0, "NO_QE_PREMIUM");
        require(absDiff(afterNav, beforeNav) <= 5_000, "QE_CREATED_CANONICAL_NAV");
        require(z.weth.balanceOf(address(z.ethBridge)) > eth0, "ETH_DID_NOT_RISE");
        require(z.usdc.balanceOf(address(z.usdcBridge)) < usdc0, "USDC_DID_NOT_FALL");
        require(z.debt.debtUsd() == 0, "QT_NOT_COMPLETE");
        require(z.usdc.balanceOf(address(z.exec)) == 0, "USDC_RESIDUAL");
        require(z.weth.balanceOf(address(z.exec)) == 0, "WETH_RESIDUAL");
    }

    function testBaseLikeExternalFeeMakesCanonicalNAVFallEvenWithQE() public {
        Env memory z = env(0, 30); // -30 bps external net quote
        uint256 beforeNav = nav(z);
        z.exec.run(PRINCIPAL, 1_000);
        uint256 afterNav = nav(z);
        require(afterNav < beforeNav, "FEE_DID_NOT_REDUCE_NAV");
        require(z.exec.cumulativeExecutorPnl() > 0, "EXECUTOR_PNL_NOT_POSITIVE");
        require(z.debt.debtUsd() == 0, "DEBT_LEFT");
    }

    function testTwelveBpsCanonicalGainRequiresTwelveBpsExternalNetQuote() public {
        // 42 bps venue quote advantage minus 30 bps fee = +12 bps net external quote.
        Env memory z = env(42, 30);
        uint256 beforeNav = nav(z);
        z.exec.run(PRINCIPAL, 1_000);
        uint256 afterNav = nav(z);
        require(afterNav > beforeNav, "NO_CANONICAL_GAIN");

        uint256 delta = afterNav - beforeNav;
        uint256 expected = PRINCIPAL * 12 / BPS;
        require(absDiff(delta, expected) <= 5_000, "NOT_12_BPS");
        require(z.debt.debtUsd() == 0, "DEBT_LEFT");
    }

    function testQEPremiumChangesExecutorPnLButNotCanonicalCapture() public {
        Env memory noQE = env(42, 30);
        Env memory withQE = env(42, 30);

        uint256 a0 = nav(noQE);
        noQE.exec.run(PRINCIPAL, 0);
        uint256 a1 = nav(noQE);
        uint256 deltaNoQE = a1 - a0;

        uint256 b0 = nav(withQE);
        withQE.exec.run(PRINCIPAL, 1_000);
        uint256 b1 = nav(withQE);
        uint256 deltaWithQE = b1 - b0;

        require(absDiff(deltaNoQE, deltaWithQE) <= 5_000, "QE_CHANGED_CANONICAL_SOURCE");
        require(withQE.exec.cumulativeExecutorPnl() > noQE.exec.cumulativeExecutorPnl(), "QE_DID_NOT_RAISE_EXEC_PNL");
    }

    function testQEAloneCannotManufactureV11TwelveBps() public {
        Env memory z = env(0, 0); // no external quote advantage and no fee
        uint256 beforeNav = nav(z);
        z.exec.run(PRINCIPAL, 2_000); // deliberately large +20% internal QE premium
        uint256 afterNav = nav(z);

        uint256 claimed12bps = PRINCIPAL * 12 / BPS;
        uint256 actualGain = afterNav > beforeNav ? afterNav - beforeNav : 0;
        require(actualGain + 5_000 < claimed12bps, "QE_ALONE_CREATED_12BPS");
        require(z.exec.cumulativeExecutorPnl() > claimed12bps, "TEST_NOT_STRONG_ENOUGH");
    }
}
