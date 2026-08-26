// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

contract OracleDrivenSynergyEVM {
    uint256 public constant BPS = 10_000;
    uint256 public constant ONE_WETH = 1e18;

    uint256 public oraclePrice6;
    uint256 public immutable targetEthS;
    uint256 public immutable targetSUSD;
    uint256 public immutable internalFeeBps;

    uint256 public wethBridgeReserve;
    uint256 public usdcBridgeReserve;
    uint256 public immutable targetWethBridge;

    uint256 public externalWeth;
    uint256 public externalUsdc;
    uint256 public immutable externalFeeBps;

    uint256 public cycles;
    uint256 public rebalances;
    uint256 public qeMintedSUSD;
    uint256 public qeAbsorbedSUSD;
    uint256 public qeAbsorbedEthS;
    uint256 public ethBridgeForkToBase;
    uint256 public ethBridgeBaseToFork;
    uint256 public usdBridgeForkToBase;
    uint256 public usdBridgeBaseToFork;

    error InsufficientWethBridge();
    error InsufficientUsdcBridge();
    error InvalidOracle();
    error InvalidFee();
    error ExternalLiquidity();

    constructor(
        uint256 oraclePrice6_,
        uint256 targetEthS_,
        uint256 targetSUSD_,
        uint256 internalFeeBps_,
        uint256 initialWethBridge_,
        uint256 initialUsdcBridge_,
        uint256 externalWeth_,
        uint256 externalUsdc_,
        uint256 externalFeeBps_
    ) {
        if (oraclePrice6_ == 0) revert InvalidOracle();
        if (internalFeeBps_ >= BPS || externalFeeBps_ >= BPS) revert InvalidFee();
        oraclePrice6 = oraclePrice6_;
        targetEthS = targetEthS_;
        targetSUSD = targetSUSD_;
        internalFeeBps = internalFeeBps_;
        wethBridgeReserve = initialWethBridge_;
        usdcBridgeReserve = initialUsdcBridge_;
        targetWethBridge = initialWethBridge_;
        externalWeth = externalWeth_;
        externalUsdc = externalUsdc_;
        externalFeeBps = externalFeeBps_;
    }

    function setOraclePrice6(uint256 newPrice6) external {
        if (newPrice6 == 0) revert InvalidOracle();
        oraclePrice6 = newPrice6;
    }

    /// SYNERGY's own NAV: the controller trusts ONLY our oracle.
    function oracleNav6() public view returns (uint256) {
        return usdcBridgeReserve + (wethBridgeReserve * oraclePrice6) / ONE_WETH;
    }

    /// Foreign pool price is audit telemetry only; SYNERGY never uses it for its own gate.
    function externalSpotPrice6() public view returns (uint256) {
        return (externalUsdc * ONE_WETH) / externalWeth;
    }

    function marketMarkedNav6() public view returns (uint256) {
        return usdcBridgeReserve + (wethBridgeReserve * externalSpotPrice6()) / ONE_WETH;
    }

    /// QE resets the Fork pool to these targets after every action, so each quote starts here.
    function quoteInternalSUSDToEthS(uint256 susdIn) public view returns (uint256 ethOut) {
        uint256 netIn = (susdIn * (BPS - internalFeeBps)) / BPS;
        ethOut = (targetEthS * netIn) / (targetSUSD + netIn);
    }

    function quoteInternalEthSToSUSD(uint256 ethIn) public view returns (uint256 susdOut) {
        uint256 netIn = (ethIn * (BPS - internalFeeBps)) / BPS;
        susdOut = (targetSUSD * netIn) / (targetEthS + netIn);
    }

    function _forkEthSToBaseWeth(uint256 ethAmount) internal returns (uint256 wethOut) {
        if (wethBridgeReserve < ethAmount) revert InsufficientWethBridge();
        wethBridgeReserve -= ethAmount;
        ethBridgeForkToBase += ethAmount;
        return ethAmount;
    }

    function _baseWethToForkEthS(uint256 wethAmount) internal returns (uint256 ethSOut) {
        wethBridgeReserve += wethAmount;
        ethBridgeBaseToFork += wethAmount;
        return wethAmount;
    }

    function _forkSusdToBaseUsdc(uint256 susdAmount) internal returns (uint256 usdcOut) {
        if (usdcBridgeReserve < susdAmount) revert InsufficientUsdcBridge();
        usdcBridgeReserve -= susdAmount;
        usdBridgeForkToBase += susdAmount;
        return susdAmount;
    }

    function _baseUsdcToForkSusd(uint256 usdcAmount) internal returns (uint256 susdOut) {
        usdcBridgeReserve += usdcAmount;
        usdBridgeBaseToFork += usdcAmount;
        return usdcAmount;
    }

    function quoteExternalWethToUsdc(uint256 wethIn) public view returns (uint256 usdcOut) {
        uint256 netIn = (wethIn * (BPS - externalFeeBps)) / BPS;
        usdcOut = (externalUsdc * netIn) / (externalWeth + netIn);
    }

    function _externalSwapWethToUsdc(uint256 wethIn) internal returns (uint256 usdcOut) {
        usdcOut = quoteExternalWethToUsdc(wethIn);
        if (usdcOut >= externalUsdc) revert ExternalLiquidity();
        externalWeth += wethIn;
        externalUsdc -= usdcOut;
    }

    function quoteExternalUsdcForExactWeth(uint256 wethOut) public view returns (uint256 usdcIn) {
        if (wethOut >= externalWeth) revert ExternalLiquidity();
        uint256 num = externalUsdc * wethOut;
        uint256 den = externalWeth - wethOut;
        uint256 netIn = (num + den - 1) / den;
        uint256 feeDen = BPS - externalFeeBps;
        usdcIn = (netIn * BPS + feeDen - 1) / feeDen;
    }

    function _externalSwapUsdcForExactWeth(uint256 wethOut, uint256 usdcIn) internal {
        if (wethOut >= externalWeth) revert ExternalLiquidity();
        externalUsdc += usdcIn;
        externalWeth -= wethOut;
    }

    /// Forward lift: every SYNERGY decision is based on OUR oracle/internal targets.
    /// Both bridge rails are used: ethS->WETH then Base USDC->Fork sUSD.
    function forwardOracleCycle(uint256 qeSusdIn) public returns (uint256 wethSold, uint256 usdcReceived) {
        qeMintedSUSD += qeSusdIn;
        uint256 ethSOut = quoteInternalSUSDToEthS(qeSusdIn);

        wethSold = _forkEthSToBaseWeth(ethSOut);
        usdcReceived = _externalSwapWethToUsdc(wethSold);

        uint256 forkSusdReturned = _baseUsdcToForkSusd(usdcReceived);
        qeAbsorbedSUSD += forkSusdReturned;
        cycles += 1;
    }

    /// Reverse rebalance closes the inventory loop using BOTH rails in reverse.
    function rebalanceWethToTarget() public returns (uint256 usdcSpent, uint256 wethBought) {
        if (wethBridgeReserve >= targetWethBridge) return (0, 0);
        wethBought = targetWethBridge - wethBridgeReserve;
        usdcSpent = quoteExternalUsdcForExactWeth(wethBought);

        uint256 canonicalUsdc = _forkSusdToBaseUsdc(usdcSpent);
        _externalSwapUsdcForExactWeth(wethBought, canonicalUsdc);
        uint256 forkEthS = _baseWethToForkEthS(wethBought);
        qeAbsorbedEthS += forkEthS;
        rebalances += 1;
    }

    function runForwardCycles(uint256 n, uint256 qeSusdPerCycle) external {
        for (uint256 i = 0; i < n; ++i) forwardOracleCycle(qeSusdPerCycle);
    }

    function runCyclesWithBandRebalance(uint256 n, uint256 qeSusdPerCycle, uint256 rebalanceBelowWeth) external {
        for (uint256 i = 0; i < n; ++i) {
            forwardOracleCycle(qeSusdPerCycle);
            if (wethBridgeReserve < rebalanceBelowWeth) rebalanceWethToTarget();
        }
    }

    function finalRebalance() external {
        rebalanceWethToTarget();
    }
}
