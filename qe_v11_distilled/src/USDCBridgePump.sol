// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./ExternalCPMM.sol";
import "./InternalMintedPool.sol";

/// @notice Canonical USDC bridge that also executes the USDC -> external WETH pump.
contract USDCBridgePump {
    IERC20Distilled public immutable weth;
    IERC20Distilled public immutable usdc;
    InternalMintedPool public immutable internalPool;
    ExternalCPMM public immutable externalPool;
    address public immutable owner;
    address public ethBridgePump;

    uint256 public cumulativeExecutorPnlUsd;
    uint256 public lastExecutorPnlUsd;
    uint256 public lastWethOut;
    uint256 public lastUsdcClaim;

    event CounterpartSet(address indexed ethBridgePump);
    event PumpedToEth(
        uint256 usdcPrincipal,
        uint256 wethOut,
        uint256 syntheticUsdcClaim,
        uint256 executorPnlUsd,
        uint256 qePriceX18
    );

    modifier onlyOwner() {
        require(msg.sender == owner, "OWNER");
        _;
    }

    constructor(
        IERC20Distilled w,
        IERC20Distilled u,
        InternalMintedPool i,
        ExternalCPMM x
    ) {
        weth = w;
        usdc = u;
        internalPool = i;
        externalPool = x;
        owner = msg.sender;
        require(u.approve(address(x), type(uint256).max), "APPROVE");
    }

    function setCounterpart(address pump) external onlyOwner {
        require(pump != address(0), "ZERO");
        require(ethBridgePump == address(0), "SET");
        ethBridgePump = pump;
        emit CounterpartSet(pump);
    }

    function reserveUsdc() external view returns (uint256) {
        return usdc.balanceOf(address(this));
    }

    /// @notice Flash-like caller supplies USDC principal and receives exactly that principal back.
    /// The external canonical WETH output is locked directly into the ETH bridge.
    function pumpToEth(uint256 usdcPrincipal, uint256 minWethOut)
        external
        returns (uint256 wethOut, uint256 executorPnlUsd)
    {
        require(ethBridgePump != address(0), "COUNTERPART");
        require(usdcPrincipal > 0, "AMOUNT");

        require(usdc.transferFrom(msg.sender, address(this), usdcPrincipal), "FLASH_IN");
        wethOut = externalPool.swapUsdcForWeth(usdcPrincipal, minWethOut, ethBridgePump);

        uint256 syntheticUsdcClaim = internalPool.issueUsdcClaimFromEth(wethOut);
        if (syntheticUsdcClaim > usdcPrincipal) {
            executorPnlUsd = syntheticUsdcClaim - usdcPrincipal;
        }

        // Repay the exact USDC working principal from this bridge's canonical reserve.
        require(usdc.balanceOf(address(this)) >= usdcPrincipal, "INSOLVENT_USDC_BRIDGE");
        require(usdc.transfer(msg.sender, usdcPrincipal), "FLASH_REPAY");

        internalPool.qtBurnAll();

        lastWethOut = wethOut;
        lastUsdcClaim = syntheticUsdcClaim;
        lastExecutorPnlUsd = executorPnlUsd;
        cumulativeExecutorPnlUsd += executorPnlUsd;

        emit PumpedToEth(usdcPrincipal, wethOut, syntheticUsdcClaim, executorPnlUsd, internalPool.qePriceX18());
    }
}
