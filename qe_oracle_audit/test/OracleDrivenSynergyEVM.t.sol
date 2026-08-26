// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {OracleDrivenSynergyEVM} from "../src/OracleDrivenSynergyEVM.sol";

contract OracleDrivenSynergyEVMTest {
    event Audit(
        string label,
        uint256 oracleNav6,
        uint256 marketNav6,
        uint256 wethBridge,
        uint256 usdcBridge,
        uint256 externalSpot6,
        uint256 cycles,
        uint256 rebalances
    );

    uint256 internal constant E18 = 1e18;
    uint256 internal constant E6 = 1e6;

    function _deploy() internal returns (OracleDrivenSynergyEVM s) {
        s = new OracleDrivenSynergyEVM(
            2_000 * E6,
            100 * E18,
            200_000 * E6,
            30,
            100 * E18,
            250_000 * E6,
            100_000 * E18,
            250_000_000 * E6,
            5
        );
    }

    function _emit(string memory label, OracleDrivenSynergyEVM s) internal {
        emit Audit(
            label,
            s.oracleNav6(),
            s.marketMarkedNav6(),
            s.wethBridgeReserve(),
            s.usdcBridgeReserve(),
            s.externalSpotPrice6(),
            s.cycles(),
            s.rebalances()
        );
    }

    function testForward100_OurOracleReportsPositiveProfit() external {
        OracleDrivenSynergyEVM s = _deploy();
        uint256 oracleBefore = s.oracleNav6();
        uint256 marketBefore = s.marketMarkedNav6();
        _emit("START_100_FORWARD", s);

        s.runForwardCycles(100, 500 * E6);
        _emit("END_100_FORWARD", s);

        require(s.oracleNav6() > oracleBefore, "our oracle should report positive forward profit");
        require(s.oracleNav6() - oracleBefore > 12_000 * E6, "expected >$12k oracle gain");
        require(s.marketMarkedNav6() < marketBefore, "market-marked NAV should not gain");
        require(s.wethBridgeReserve() < 76 * E18, "WETH bridge must be depleted");
    }

    function testClosed100_RestoringBridgeRemovesOracleProfit() external {
        OracleDrivenSynergyEVM s = _deploy();
        uint256 oracleBefore = s.oracleNav6();
        _emit("START_100_CLOSED", s);

        s.runForwardCycles(100, 500 * E6);
        s.finalRebalance();
        _emit("END_100_CLOSED", s);

        require(s.wethBridgeReserve() == 100 * E18, "WETH bridge not restored");
        require(s.oracleNav6() < oracleBefore, "closed loop retained false oracle profit");
        uint256 loss6 = oracleBefore - s.oracleNav6();
        require(loss6 > 62 * E6 && loss6 < 63 * E6, "100-cycle loss outside expected band");
    }

    function testClosed500_BandRebalance() external {
        OracleDrivenSynergyEVM s = _deploy();
        uint256 oracleBefore = s.oracleNav6();
        _emit("START_500", s);

        s.runCyclesWithBandRebalance(500, 500 * E6, 80 * E18);
        s.finalRebalance();
        _emit("END_500", s);

        require(s.cycles() == 500, "500 cycles not executed");
        require(s.wethBridgeReserve() == 100 * E18, "WETH bridge not restored");
        require(s.oracleNav6() < oracleBefore, "closed 500 cycle unexpectedly profitable");
        uint256 loss6 = oracleBefore - s.oracleNav6();
        require(loss6 > 310 * E6 && loss6 < 312 * E6, "500-cycle loss outside expected band");
    }

    function testClosed1000_AllSystemUsesOurOracle_BothBridgesWork() external {
        OracleDrivenSynergyEVM s = _deploy();
        uint256 oracleBefore = s.oracleNav6();
        uint256 marketBefore = s.marketMarkedNav6();
        _emit("START_1000", s);

        s.runCyclesWithBandRebalance(1000, 500 * E6, 80 * E18);
        s.finalRebalance();
        _emit("END_1000", s);

        require(s.cycles() == 1000, "1000 cycles not executed");
        require(s.wethBridgeReserve() == 100 * E18, "WETH bridge target not restored");
        require(s.ethBridgeForkToBase() > 0, "ETH bridge Fork->Base unused");
        require(s.ethBridgeBaseToFork() > 0, "ETH bridge Base->Fork unused");
        require(s.usdBridgeBaseToFork() > 0, "USD bridge Base->Fork unused");
        require(s.usdBridgeForkToBase() > 0, "USD bridge Fork->Base unused");

        require(s.oracleNav6() < oracleBefore, "same-oracle closed loop unexpectedly profitable");
        uint256 oracleLoss6 = oracleBefore - s.oracleNav6();
        require(oracleLoss6 > 621 * E6 && oracleLoss6 < 623 * E6, "1000-cycle oracle loss outside expected band");
        require(s.marketMarkedNav6() < marketBefore, "market NAV unexpectedly profitable");
    }

    function testChangingOurOracleChangesReportedProfit_NotCanonicalBalances() external {
        OracleDrivenSynergyEVM s = _deploy();
        s.runCyclesWithBandRebalance(1000, 500 * E6, 80 * E18);
        s.finalRebalance();

        uint256 wethBefore = s.wethBridgeReserve();
        uint256 usdcBefore = s.usdcBridgeReserve();
        uint256 marketBefore = s.marketMarkedNav6();
        uint256 oracleAt2000 = s.oracleNav6();
        _emit("BEFORE_ORACLE_REMARK", s);

        s.setOraclePrice6(3_000 * E6);
        uint256 oracleAt3000 = s.oracleNav6();
        _emit("AFTER_ORACLE_REMARK_3000", s);

        require(oracleAt3000 > oracleAt2000 + 99_999 * E6, "oracle remark should add about $100k");
        require(s.wethBridgeReserve() == wethBefore, "oracle created WETH");
        require(s.usdcBridgeReserve() == usdcBefore, "oracle created USDC");
        require(s.marketMarkedNav6() == marketBefore, "oracle changed foreign-market NAV");
    }
}
