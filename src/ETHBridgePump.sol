// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./InternalMintedPool.sol";
import "./BaseExternalPool.sol";

/// @notice WETH bridge that also acts as the WETH -> USDC arbitrage pump.
contract ETHBridgePump {
    address public immutable owner;
    IERC20Base public immutable usdc;
    IERC20Base public immutable weth;
    InternalMintedPool public immutable internalPool;
    BaseExternalPool public immutable externalPool;

    address public usdcBridgePeer;
    uint256 public cumulativeSyntheticExecutorPnlUsdc6;

    modifier onlyOwner() { require(msg.sender == owner, "OWNER"); _; }

    constructor(InternalMintedPool p, BaseExternalPool x) {
        owner = msg.sender;
        internalPool = p;
        externalPool = x;
        usdc = IERC20Base(x.USDC());
        weth = IERC20Base(x.WETH());
        require(weth.approve(address(x), type(uint256).max), "APPROVE_WETH");
    }

    function setUsdcBridgePeer(address peer) external onlyOwner {
        require(peer != address(0), "PEER");
        usdcBridgePeer = peer;
    }

    function canonicalReserveWeth() external view returns (uint256) {
        return weth.balanceOf(address(this));
    }

    /// @dev QE must make internal ETH cheaper than the real external executable quote.
    function pumpToUsdc(uint256 wethIn, uint256 minUsdcOut)
        external
        onlyOwner
        returns (uint256 usdcOut, uint256 syntheticPnlUsdc6)
    {
        require(usdcBridgePeer != address(0), "NO_PEER");
        require(weth.balanceOf(address(this)) >= wethIn, "RESERVE");

        uint256 quotedUsdc = externalPool.quoteWethForUsdc(wethIn);
        require(quotedUsdc > 0, "NO_QUOTE");
        uint256 externalPriceX18 = quotedUsdc * 1e30 / wethIn;
        uint256 qePrice = internalPool.qePriceX18();
        require(qePrice < externalPriceX18, "NO_QE_GRADIENT");

        usdcOut = externalPool.swapWethForUsdc(wethIn, minUsdcOut, address(this));
        uint256 internalCostUsdc6 = wethIn * qePrice / 1e30;
        if (usdcOut > internalCostUsdc6) syntheticPnlUsdc6 = usdcOut - internalCostUsdc6;

        if (syntheticPnlUsdc6 > 0) {
            internalPool.recordImpulse(syntheticPnlUsdc6);
            cumulativeSyntheticExecutorPnlUsdc6 += syntheticPnlUsdc6;
        }
        internalPool.qtBurnAll();
        require(usdc.transfer(usdcBridgePeer, usdcOut), "SEND_PEER_USDC");
    }
}
