// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20Base {
    function balanceOf(address) external view returns (uint256);
    function transfer(address, uint256) external returns (bool);
    function transferFrom(address, address, uint256) external returns (bool);
    function approve(address, uint256) external returns (bool);
}

interface IUniV3PoolBase {
    function token0() external view returns (address);
    function token1() external view returns (address);
    function fee() external view returns (uint24);
}

interface IQuoterV2Base {
    struct QuoteExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint256 amountIn;
        uint24 fee;
        uint160 sqrtPriceLimitX96;
    }
    function quoteExactInputSingle(QuoteExactInputSingleParams memory params)
        external
        returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate);
}

interface ISwapRouter02Base {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }
    function exactInputSingle(ExactInputSingleParams calldata params) external payable returns (uint256 amountOut);
}

/// @notice Hard-pinned adapter to the dominant Base Mainnet WETH/USDC Uniswap V3 0.30% pool.
/// Pool: 0x6c561B446416E1A00E8E93E221854d6eA4171372
contract BaseExternalPool {
    address public constant WETH = 0x4200000000000000000000000000000000000006;
    address public constant USDC = 0x833589fcd6edb6e08f4c7c32d4f71b54bda02913;
    address public constant POOL = 0x6c561b446416e1a00e8e93e221854d6ea4171372;
    address public constant QUOTER_V2 = 0x3d4e44eb1374240ce5f1b871ab261cd16335b76a;
    address public constant SWAP_ROUTER_02 = 0x2626664c2603336e57b271c5c0b26f421741e481;
    uint24 public constant FEE = 3000;

    function verifyPinnedPool() external view returns (bool) {
        IUniV3PoolBase p = IUniV3PoolBase(POOL);
        address a = p.token0();
        address b = p.token1();
        bool pairOk = (a == WETH && b == USDC) || (a == USDC && b == WETH);
        return pairOk && p.fee() == FEE;
    }

    function quoteUsdcForWeth(uint256 usdcIn) public returns (uint256 amountOut) {
        IQuoterV2Base.QuoteExactInputSingleParams memory q = IQuoterV2Base.QuoteExactInputSingleParams({
            tokenIn: USDC,
            tokenOut: WETH,
            amountIn: usdcIn,
            fee: FEE,
            sqrtPriceLimitX96: 0
        });
        (amountOut,,,) = IQuoterV2Base(QUOTER_V2).quoteExactInputSingle(q);
    }

    function quoteWethForUsdc(uint256 wethIn) public returns (uint256 amountOut) {
        IQuoterV2Base.QuoteExactInputSingleParams memory q = IQuoterV2Base.QuoteExactInputSingleParams({
            tokenIn: WETH,
            tokenOut: USDC,
            amountIn: wethIn,
            fee: FEE,
            sqrtPriceLimitX96: 0
        });
        (amountOut,,,) = IQuoterV2Base(QUOTER_V2).quoteExactInputSingle(q);
    }

    function swapUsdcForWeth(uint256 usdcIn, uint256 minWethOut, address recipient) external returns (uint256 out) {
        require(recipient != address(0), "RECIPIENT");
        require(IERC20Base(USDC).transferFrom(msg.sender, address(this), usdcIn), "PULL_USDC");
        _approve(USDC, SWAP_ROUTER_02, usdcIn);
        ISwapRouter02Base.ExactInputSingleParams memory p = ISwapRouter02Base.ExactInputSingleParams({
            tokenIn: USDC,
            tokenOut: WETH,
            fee: FEE,
            recipient: address(this),
            amountIn: usdcIn,
            amountOutMinimum: minWethOut,
            sqrtPriceLimitX96: 0
        });
        out = ISwapRouter02Base(SWAP_ROUTER_02).exactInputSingle(p);
        require(IERC20Base(WETH).transfer(recipient, out), "SEND_WETH");
    }

    function swapWethForUsdc(uint256 wethIn, uint256 minUsdcOut, address recipient) external returns (uint256 out) {
        require(recipient != address(0), "RECIPIENT");
        require(IERC20Base(WETH).transferFrom(msg.sender, address(this), wethIn), "PULL_WETH");
        _approve(WETH, SWAP_ROUTER_02, wethIn);
        ISwapRouter02Base.ExactInputSingleParams memory p = ISwapRouter02Base.ExactInputSingleParams({
            tokenIn: WETH,
            tokenOut: USDC,
            fee: FEE,
            recipient: address(this),
            amountIn: wethIn,
            amountOutMinimum: minUsdcOut,
            sqrtPriceLimitX96: 0
        });
        out = ISwapRouter02Base(SWAP_ROUTER_02).exactInputSingle(p);
        require(IERC20Base(USDC).transfer(recipient, out), "SEND_USDC");
    }

    function _approve(address token, address spender, uint256 amount) internal {
        require(IERC20Base(token).approve(spender, 0), "APPROVE0");
        require(IERC20Base(token).approve(spender, amount), "APPROVE");
    }
}
