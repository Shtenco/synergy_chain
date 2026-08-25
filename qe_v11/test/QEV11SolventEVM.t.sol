// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../src/QEV11SolventEVM.sol";

contract QEV11SolventEVMTest {
    uint256 constant WAD = 1e18;
    uint256 constant PRICE = 2500e18;

    struct Env {
        V11Token weth;
        V11Token usdc;
        V11Vault ethVault;
        V11Vault usdcVault;
        V11DebtBook debt;
        V11SolventAccountingGuard guard;
        V11ExternalEdge wethEdge;
        V11ExternalEdge usdcEdge;
        V11FlashLender wethLender;
        V11FlashLender usdcLender;
        V11CycleExecutor executor;
    }

    function env() internal returns (Env memory z) {
        z.weth = new V11Token("WETH", "WETH");
        z.usdc = new V11Token("USDC", "USDC");
        z.ethVault = new V11Vault(z.weth);
        z.usdcVault = new V11Vault(z.usdc);
        z.debt = new V11DebtBook();
        z.guard = new V11SolventAccountingGuard(z.weth, z.usdc, z.ethVault, z.usdcVault, PRICE);
        z.wethEdge = new V11ExternalEdge(z.weth);
        z.usdcEdge = new V11ExternalEdge(z.usdc);
        z.wethLender = new V11FlashLender(z.weth);
        z.usdcLender = new V11FlashLender(z.usdc);
        z.executor = new V11CycleExecutor();

        // $1 canonical bridge start: $0.50 WETH + $0.50 USDC.
        z.weth.mint(address(z.ethVault), 2e14);
        z.usdc.mint(address(z.usdcVault), 5e17);

        // External flash liquidity and external edge reserves are NOT bridge capital.
        z.weth.mint(address(z.wethLender), 1e18);
        z.usdc.mint(address(z.usdcLender), 1_000e18);
        z.weth.mint(address(z.wethEdge), 1e18);
        z.usdc.mint(address(z.usdcEdge), 1_000e18);
    }

    function testInternalQEBurnCannotFakeCanonicalGrowth() public {
        Env memory z = env();
        uint256 beforeNav = z.guard.canonicalNavWad();
        require(beforeNav == 1e18, "BAD_START_NAV");

        z.guard.startCycle();
        z.debt.issue(10e18);
        z.debt.qtBurn(10e18);
        require(z.debt.debtUsdWad() == 0, "DEBT_LEFT");
        require(z.guard.canonicalNavWad() == beforeNav, "BOOKKEEPING_MOVED_TOKENS");

        (bool ok,) = address(z.guard).call(abi.encodeWithSelector(z.guard.settleCycle.selector));
        require(!ok, "FAKE_GROWTH_ACCEPTED");
    }

    function testZeroEdgeFlashCannotCreateBridgeCapital() public {
        Env memory z = env();
        uint256 nav0 = z.guard.canonicalNavWad();
        uint256 lender0 = z.usdc.balanceOf(address(z.usdcLender));
        uint256 lock0 = z.usdc.balanceOf(address(z.usdcVault));

        z.guard.startCycle();
        z.usdcLender.flash(address(z.executor), address(z.usdcEdge), address(z.usdcVault), 100e18, 0);

        require(z.usdc.balanceOf(address(z.usdcLender)) == lender0, "FLASH_PRINCIPAL_CHANGED");
        require(z.usdc.balanceOf(address(z.usdcVault)) == lock0, "ZERO_EDGE_CREATED_LOCK");
        require(z.guard.canonicalNavWad() == nav0, "ZERO_EDGE_CREATED_NAV");
        (bool ok,) = address(z.guard).call(abi.encodeWithSelector(z.guard.settleCycle.selector));
        require(!ok, "ZERO_EDGE_SETTLED_AS_GROWTH");
    }

    function testSequentialTwoElevatorExternalCaptureRaisesBothCanonicalLocks() public {
        Env memory z = env();
        uint256 nav0 = z.guard.canonicalNavWad();
        uint256 eth0 = z.weth.balanceOf(address(z.ethVault));
        uint256 usdc0 = z.usdc.balanceOf(address(z.usdcVault));
        uint256 wethLender0 = z.weth.balanceOf(address(z.wethLender));
        uint256 usdcLender0 = z.usdc.balanceOf(address(z.usdcLender));

        z.guard.startCycle();

        // QE may arm the opportunity, but this debt is accounting-only.
        z.debt.issue(24e16);

        // Elevator A: 100 USDC flash notional, 12 bps real external capture -> +0.12 USDC lock.
        z.usdcLender.flash(address(z.executor), address(z.usdcEdge), address(z.usdcVault), 100e18, 12);

        // Elevator B: 0.04 WETH ($100) flash notional, 12 bps capture -> +0.000048 WETH = +$0.12 lock.
        z.wethLender.flash(address(z.executor), address(z.wethEdge), address(z.ethVault), 4e16, 12);

        // Full QT clears internal debt but does not itself move canonical tokens.
        z.debt.qtBurn(type(uint256).max);

        require(z.debt.debtUsdWad() == 0, "DEBT_LEFT");
        require(z.usdc.balanceOf(address(z.usdcLender)) == usdcLender0, "USDC_FLASH_NOT_REPAID");
        require(z.weth.balanceOf(address(z.wethLender)) == wethLender0, "WETH_FLASH_NOT_REPAID");
        require(z.usdc.balanceOf(address(z.usdcVault)) > usdc0, "USDC_LIFT_DID_NOT_RISE");
        require(z.weth.balanceOf(address(z.ethVault)) > eth0, "ETH_LIFT_DID_NOT_RISE");

        uint256 growth = z.guard.settleCycle();
        require(growth == 24e16, "WRONG_CANONICAL_GROWTH");
        require(z.guard.canonicalNavWad() == nav0 + 24e16, "NAV_MISMATCH");
        require(z.executor.realizedExternalProfit(address(z.usdc)) == 12e16, "USDC_PNL_MISMATCH");
        require(z.executor.realizedExternalProfit(address(z.weth)) == 48e12, "WETH_PNL_MISMATCH");
    }

    function testInsolventExternalVenueMakesAtomicFlashCycleRevert() public {
        Env memory z = env();
        V11ExternalEdge emptyEdge = new V11ExternalEdge(z.usdc);
        uint256 lender0 = z.usdc.balanceOf(address(z.usdcLender));
        uint256 vault0 = z.usdc.balanceOf(address(z.usdcVault));

        (bool ok,) = address(z.usdcLender).call(
            abi.encodeWithSelector(
                z.usdcLender.flash.selector,
                address(z.executor), address(emptyEdge), address(z.usdcVault), 100e18, 12
            )
        );
        require(!ok, "INSOLVENT_EDGE_ACCEPTED");
        require(z.usdc.balanceOf(address(z.usdcLender)) == lender0, "ATOMICITY_BROKEN_LENDER");
        require(z.usdc.balanceOf(address(z.usdcVault)) == vault0, "ATOMICITY_BROKEN_VAULT");
    }
}
