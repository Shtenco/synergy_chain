// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./ExternalCPMM.sol";
import "./InternalMintedPool.sol";

/// @notice Canonical WETH bridge that also executes the WETH -> external USDC pump.
contract ETHBridgePump {
    IERC20Distilled public immutable weth;
    IERC20Distilled public immutable usdc;
    InternalMintedPool public immutable internalPool;
    ExternalCPMM public immutable externalPool;
    address public immutable owner;
    address public usdcBridgePump;

    uint256 public cumulativeExecutorPnlUsd;
    uint256 public lastExecutorPnlUsd;
    uint256 public lastUsdcOut;
    uint256 public lastWethClaim;

    event CounterpartSet(address indexed usdcBridgePump);
    event PumpedToUsdc(
        uint256 wethPrincipal,
        uint256 usdcOut,
        uint256 syntheticWethClaim,
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
        require(w.approve(address(x), type(uint256).max), "APPROVE");
    }

    function setCounterpart(address pump) external onlyOwner {
        require(pump != address(0), "ZERO");
        require(usdcBridgePump == address(0), "SET");
        usdcBridgePump = pump;
        emit CounterpartSet(pump);
    }

    function reserveWeth() external view returns (uint256) {
        return weth.balanceOf(address(this));
    }

    /// @notice Flash-like caller supplies WETH principal and receives exactly that principal back.
    /// The external canonical USDC output is locked directly into the USDC bridge.
    /// QE only changes the synthetic claim/PnL counter; QT erases the synthetic debt.
    function pumpToUsdc(uint256 wethPrincipal, uint256 minUsdcOut)
        external
        returns (uint256 usdcOut, uint256 executorPnlUsd)
    {
        require(usdcBridgePump != address(0), "COUNTERPART");
        require(wethPrincipal > 0, "AMOUNT");

        require(weth.transferFrom(msg.sender, address(this), wethPrincipal), "FLASH_IN");
        usdcOut = externalPool.swapWethForUsdc(wethPrincipal, minUsdcOut, usdcBridgePump);

        uint256 syntheticWethClaim = internalPool.issueEthClaimFromUsdc(usdcOut);
        uint256 qePrice = internalPool.qePriceX18();
        if (syntheticWethClaim > wethPrincipal) {
            executorPnlUsd = (syntheticWethClaim - wethPrincipal) * qePrice / 1e18;
        }

        // Repay the exact WETH working principal from this bridge's canonical reserve.
        require(weth.balanceOf(address(this)) >= wethPrincipal, "INSOLVENT_WETH_BRIDGE");
        require(weth.transfer(msg.sender, wethPrincipal), "FLASH_REPAY");

        internalPool.qtBurnAll();

        lastUsdcOut = usdcOut;
        lastWethClaim = syntheticWethClaim;
        lastExecutorPnlUsd = executorPnlUsd;
        cumulativeExecutorPnlUsd += executorPnlUsd;

        emit PumpedToUsdc(wethPrincipal, usdcOut, syntheticWethClaim, executorPnlUsd, qePrice);
    }
}
