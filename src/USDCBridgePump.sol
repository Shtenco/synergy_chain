// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./InternalMintedPool.sol";
import "./BaseExternalPool.sol";

/// @notice USDC bridge that also acts as the USDC -> WETH arbitrage pump.
contract USDCBridgePump {
    address public immutable owner;
    IERC20Base public immutable usdc;
    IERC20Base public immutable weth;
    InternalMintedPool public immutable internalPool;
    BaseExternalPool public immutable externalPool;

    address public ethBridgePeer;
    uint256 public cumulativeSyntheticExecutorPnlUsdc6;

    modifier onlyOwner() { require(msg.sender == owner, "OWNER"); _; }

    constructor(InternalMintedPool p, BaseExternalPool x) {
        owner = msg.sender;
        internalPool = p;
        externalPool = x;
        usdc = IERC20Base(x.USDC());
        weth = IERC20Base(x.WETH());
        require(usdc.approve(address(x), type(uint256).max), "APPROVE_USDC");
    }

    function setEthBridgePeer(address peer) external onlyOwner {
        require(peer != address(0), "PEER");
        ethBridgePeer = peer;
    }

    function canonicalReserveUsdc6() external view returns (uint256) {
        return usdc.balanceOf(address(this));
    }

    /// @dev QE must make internal ETH dearer than the real external executable quote.
    function pumpToEth(uint256 usdcIn, uint256 minWethOut)
        external
        onlyOwner
        returns (uint256 wethOut, uint256 syntheticPnlUsdc6)
    {
        require(ethBridgePeer != address(0), "NO_PEER");
        require(usdc.balanceOf(address(this)) >= usdcIn, "RESERVE");

        uint256 quotedWeth = externalPool.quoteUsdcForWeth(usdcIn);
        require(quotedWeth > 0, "NO_QUOTE");
        uint256 externalPriceX18 = usdcIn * 1e30 / quotedWeth;
        uint256 qePrice = internalPool.qePriceX18();
        require(qePrice > externalPriceX18, "NO_QE_GRADIENT");

        wethOut = externalPool.swapUsdcForWeth(usdcIn, minWethOut, address(this));
        uint256 internalValueUsdc6 = wethOut * qePrice / 1e30;
        if (internalValueUsdc6 > usdcIn) syntheticPnlUsdc6 = internalValueUsdc6 - usdcIn;

        if (syntheticPnlUsdc6 > 0) {
            internalPool.recordImpulse(syntheticPnlUsdc6);
            cumulativeSyntheticExecutorPnlUsdc6 += syntheticPnlUsdc6;
        }
        internalPool.qtBurnAll();
        require(weth.transfer(ethBridgePeer, wethOut), "SEND_PEER_WETH");
    }
}
