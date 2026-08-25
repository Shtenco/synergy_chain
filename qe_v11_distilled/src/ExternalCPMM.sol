// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20Distilled {
    function balanceOf(address) external view returns (uint256);
    function transfer(address, uint256) external returns (bool);
    function transferFrom(address, address, uint256) external returns (bool);
    function approve(address, uint256) external returns (bool);
}

/// @notice Large foreign canonical WETH/USDC pool used as the external market boundary.
/// It never reads the QE price.
contract ExternalCPMM {
    uint256 public constant BPS = 10_000;

    IERC20Distilled public immutable weth;
    IERC20Distilled public immutable usdc;
    uint256 public immutable feeBps;

    constructor(IERC20Distilled w, IERC20Distilled u, uint256 fee) {
        require(fee < BPS, "FEE");
        weth = w;
        usdc = u;
        feeBps = fee;
    }

    function reserves() public view returns (uint256 wethReserve, uint256 usdcReserve) {
        wethReserve = weth.balanceOf(address(this));
        usdcReserve = usdc.balanceOf(address(this));
    }

    function quoteUsdcForWeth(uint256 usdcIn) public view returns (uint256 wethOut) {
        (uint256 rw, uint256 ru) = reserves();
        require(rw > 0 && ru > 0, "NO_LIQ");
        uint256 effective = usdcIn * (BPS - feeBps) / BPS;
        wethOut = rw * effective / (ru + effective);
    }

    function quoteWethForUsdc(uint256 wethIn) public view returns (uint256 usdcOut) {
        (uint256 rw, uint256 ru) = reserves();
        require(rw > 0 && ru > 0, "NO_LIQ");
        uint256 effective = wethIn * (BPS - feeBps) / BPS;
        usdcOut = ru * effective / (rw + effective);
    }

    function swapUsdcForWeth(uint256 usdcIn, uint256 minWethOut, address to) external returns (uint256 wethOut) {
        require(to != address(0), "TO");
        wethOut = quoteUsdcForWeth(usdcIn);
        require(wethOut >= minWethOut && wethOut > 0, "OUT");
        require(usdc.transferFrom(msg.sender, address(this), usdcIn), "IN");
        require(weth.transfer(to, wethOut), "SEND_WETH");
    }

    function swapWethForUsdc(uint256 wethIn, uint256 minUsdcOut, address to) external returns (uint256 usdcOut) {
        require(to != address(0), "TO");
        usdcOut = quoteWethForUsdc(wethIn);
        require(usdcOut >= minUsdcOut && usdcOut > 0, "OUT");
        require(weth.transferFrom(msg.sender, address(this), wethIn), "IN");
        require(usdc.transfer(to, usdcOut), "SEND_USDC");
    }
}
