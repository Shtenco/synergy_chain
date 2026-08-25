// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20V124 {
    function balanceOf(address) external view returns (uint256);
    function transfer(address, uint256) external returns (bool);
    function transferFrom(address, address, uint256) external returns (bool);
    function approve(address, uint256) external returns (bool);
}

interface IWETHV124 is IERC20V124 {
    function deposit() external payable;
}

interface IV124FlashBorrower {
    function onFlashLoan(uint256 amount, bytes calldata data) external;
}

interface IV124UniQuoterV2 {
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

interface IV124UniRouter02 {
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

interface IV124PancakeRouter {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 deadline;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }

    function exactInputSingle(ExactInputSingleParams calldata params) external payable returns (uint256 amountOut);
}

interface IV124AeroClassicRouter {
    struct Route {
        address from;
        address to;
        bool stable;
        address factory;
    }

    function getAmountsOut(uint256 amountIn, Route[] memory routes) external view returns (uint256[] memory amounts);

    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        Route[] calldata routes,
        address to,
        uint256 deadline
    ) external returns (uint256[] memory amounts);
}

interface IV124AeroSlipQuoter {
    struct QuoteExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint256 amountIn;
        int24 tickSpacing;
        uint160 sqrtPriceLimitX96;
    }

    function quoteExactInputSingle(QuoteExactInputSingleParams memory params)
        external
        returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate);
}

interface IV124AeroSlipRouter {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        int24 tickSpacing;
        address recipient;
        uint256 deadline;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }

    function exactInputSingle(ExactInputSingleParams calldata params) external payable returns (uint256 amountOut);
}

library V124BaseAddresses {
    address internal constant WETH = 0x4200000000000000000000000000000000000006;
    address internal constant USDC = 0x833589fcd6edb6e08f4c7c32d4f71b54bda02913;

    address internal constant UNI_QUOTER = 0x3d4e44eb1374240ce5f1b871ab261cd16335b76a;
    address internal constant UNI_ROUTER = 0x2626664c2603336e57b271c5c0b26f421741e481;

    address internal constant AERO_CLASSIC_ROUTER = 0xcf77a3ba9a5ca399b7c97c74d54e5b1beb874e43;
    address internal constant AERO_CLASSIC_FACTORY = 0x420dd381b31aef6683db6b902084cb0ffece40da;
    address internal constant AERO_SLIP_ROUTER = 0xbe6d8f0d05cc4be24d5167a3ef062215be6d18a5;
    address internal constant AERO_SLIP_QUOTER = 0x254cf9e1e6e233aa1ac962cb9b05b2cfeaae15b0;

    address internal constant PANCAKE_QUOTER = 0xb048bbc1ee6b733fffcfb9e9cef7375518e25997;
    address internal constant PANCAKE_ROUTER = 0x678aa4bf4e210cf2166753e054d5b7c31cc7fa86;
}

contract V124BridgeVault {
    IERC20V124 public immutable token;
    address public immutable owner;
    address public controller;

    constructor(IERC20V124 t) {
        token = t;
        owner = msg.sender;
    }

    function setController(address c) external {
        require(msg.sender == owner, "OWNER");
        controller = c;
    }

    function release(address to, uint256 amount) external {
        require(msg.sender == controller, "CTRL");
        require(token.transfer(to, amount), "RELEASE");
    }
}

contract V124DebtBook {
    address public immutable owner;
    address public controller;
    uint256 public debtUsd;
    uint256 public issued;
    uint256 public burned;

    constructor() {
        owner = msg.sender;
    }

    function setController(address c) external {
        require(msg.sender == owner, "OWNER");
        controller = c;
    }

    function issue(uint256 amount) external {
        require(msg.sender == controller, "CTRL");
        debtUsd += amount;
        issued += amount;
    }

    function qtBurnAll() external {
        require(msg.sender == controller, "CTRL");
        burned += debtUsd;
        debtUsd = 0;
    }
}

contract V124ZeroFeeFlashVault {
    IERC20V124 public immutable usdc;
    uint256 public outstanding;

    constructor(IERC20V124 u) {
        usdc = u;
    }

    function flashLoan(address receiver, uint256 amount, bytes calldata data) external {
        uint256 beforeBal = usdc.balanceOf(address(this));
        require(beforeBal >= amount, "FLASH_LIQ");
        outstanding = amount;
        require(usdc.transfer(receiver, amount), "FLASH_SEND");
        IV124FlashBorrower(receiver).onFlashLoan(amount, data);
        require(usdc.balanceOf(address(this)) >= beforeBal, "FLASH_NOT_REPAID");
        outstanding = 0;
    }
}

/// @notice Real Base quote-and-execute adapter. There is no fixed +12 bps input.
/// The winner is selected from Uniswap V3, Aerodrome Classic, Aerodrome Slipstream,
/// and PancakeSwap V3 using on-chain quote contracts at the forked block state.
contract V124BestDex {
    uint256 internal constant BPS = 10_000;

    enum Venue {
        NONE,
        UNISWAP_V3,
        AERODROME_CLASSIC,
        AERODROME_SLIPSTREAM,
        PANCAKE_V3
    }

    struct Quote {
        Venue venue;
        uint24 fee;
        int24 tickSpacing;
        uint256 amountOut;
    }

    struct QuoteSet {
        uint256 uniswap;
        uint256 aerodromeClassic;
        uint256 aerodromeSlipstream;
        uint256 pancake;
        Quote best;
    }

    function quoteAll(address tokenIn, address tokenOut, uint256 amountIn) public returns (QuoteSet memory s) {
        (s.uniswap, s.best.fee) = _bestV3Quote(V124BaseAddresses.UNI_QUOTER, tokenIn, tokenOut, amountIn);
        if (s.uniswap > s.best.amountOut) {
            s.best = Quote(Venue.UNISWAP_V3, s.best.fee, 0, s.uniswap);
        }

        s.aerodromeClassic = _aeroClassicQuote(tokenIn, tokenOut, amountIn);
        if (s.aerodromeClassic > s.best.amountOut) {
            s.best = Quote(Venue.AERODROME_CLASSIC, 0, 0, s.aerodromeClassic);
        }

        int24 aeroTick;
        (s.aerodromeSlipstream, aeroTick) = _bestAeroSlipQuote(tokenIn, tokenOut, amountIn);
        if (s.aerodromeSlipstream > s.best.amountOut) {
            s.best = Quote(Venue.AERODROME_SLIPSTREAM, 0, aeroTick, s.aerodromeSlipstream);
        }

        uint24 pancakeFee;
        (s.pancake, pancakeFee) = _bestV3Quote(V124BaseAddresses.PANCAKE_QUOTER, tokenIn, tokenOut, amountIn);
        if (s.pancake > s.best.amountOut) {
            s.best = Quote(Venue.PANCAKE_V3, pancakeFee, 0, s.pancake);
        }
    }

    function quoteBest(address tokenIn, address tokenOut, uint256 amountIn) public returns (Quote memory) {
        return quoteAll(tokenIn, tokenOut, amountIn).best;
    }

    function swapBest(address tokenIn, address tokenOut, uint256 amountIn, uint256 slippageBps)
        external
        returns (Quote memory q, uint256 actualOut)
    {
        require(slippageBps < BPS, "SLIP");
        q = quoteBest(tokenIn, tokenOut, amountIn);
        require(q.venue != Venue.NONE && q.amountOut > 0, "NO_ROUTE");

        require(IERC20V124(tokenIn).transferFrom(msg.sender, address(this), amountIn), "PULL");
        uint256 beforeOut = IERC20V124(tokenOut).balanceOf(address(this));
        uint256 minOut = q.amountOut * (BPS - slippageBps) / BPS;

        if (q.venue == Venue.UNISWAP_V3) {
            _forceApprove(tokenIn, V124BaseAddresses.UNI_ROUTER, amountIn);
            IV124UniRouter02.ExactInputSingleParams memory p = IV124UniRouter02.ExactInputSingleParams({
                tokenIn: tokenIn,
                tokenOut: tokenOut,
                fee: q.fee,
                recipient: address(this),
                amountIn: amountIn,
                amountOutMinimum: minOut,
                sqrtPriceLimitX96: 0
            });
            IV124UniRouter02(V124BaseAddresses.UNI_ROUTER).exactInputSingle(p);
        } else if (q.venue == Venue.AERODROME_CLASSIC) {
            _forceApprove(tokenIn, V124BaseAddresses.AERO_CLASSIC_ROUTER, amountIn);
            IV124AeroClassicRouter.Route[] memory routes = new IV124AeroClassicRouter.Route[](1);
            routes[0] = IV124AeroClassicRouter.Route({
                from: tokenIn,
                to: tokenOut,
                stable: false,
                factory: V124BaseAddresses.AERO_CLASSIC_FACTORY
            });
            IV124AeroClassicRouter(V124BaseAddresses.AERO_CLASSIC_ROUTER).swapExactTokensForTokens(
                amountIn, minOut, routes, address(this), block.timestamp + 60
            );
        } else if (q.venue == Venue.AERODROME_SLIPSTREAM) {
            _forceApprove(tokenIn, V124BaseAddresses.AERO_SLIP_ROUTER, amountIn);
            IV124AeroSlipRouter.ExactInputSingleParams memory p2 = IV124AeroSlipRouter.ExactInputSingleParams({
                tokenIn: tokenIn,
                tokenOut: tokenOut,
                tickSpacing: q.tickSpacing,
                recipient: address(this),
                deadline: block.timestamp + 60,
                amountIn: amountIn,
                amountOutMinimum: minOut,
                sqrtPriceLimitX96: 0
            });
            IV124AeroSlipRouter(V124BaseAddresses.AERO_SLIP_ROUTER).exactInputSingle(p2);
        } else if (q.venue == Venue.PANCAKE_V3) {
            _forceApprove(tokenIn, V124BaseAddresses.PANCAKE_ROUTER, amountIn);
            IV124PancakeRouter.ExactInputSingleParams memory p3 = IV124PancakeRouter.ExactInputSingleParams({
                tokenIn: tokenIn,
                tokenOut: tokenOut,
                fee: q.fee,
                recipient: address(this),
                deadline: block.timestamp + 60,
                amountIn: amountIn,
                amountOutMinimum: minOut,
                sqrtPriceLimitX96: 0
            });
            IV124PancakeRouter(V124BaseAddresses.PANCAKE_ROUTER).exactInputSingle(p3);
        }

        actualOut = IERC20V124(tokenOut).balanceOf(address(this)) - beforeOut;
        require(actualOut >= minOut, "OUT_LOW");
        require(IERC20V124(tokenOut).transfer(msg.sender, actualOut), "PUSH_OUT");
    }

    function _bestV3Quote(address quoter, address tokenIn, address tokenOut, uint256 amountIn)
        internal
        returns (uint256 bestOut, uint24 bestFee)
    {
        uint24[5] memory fees = [uint24(100), uint24(500), uint24(2500), uint24(3000), uint24(10000)];
        for (uint256 i; i < fees.length; ++i) {
            IV124UniQuoterV2.QuoteExactInputSingleParams memory p = IV124UniQuoterV2.QuoteExactInputSingleParams({
                tokenIn: tokenIn,
                tokenOut: tokenOut,
                amountIn: amountIn,
                fee: fees[i],
                sqrtPriceLimitX96: 0
            });
            (bool ok, bytes memory ret) = quoter.call(abi.encodeCall(IV124UniQuoterV2.quoteExactInputSingle, (p)));
            if (ok && ret.length >= 32) {
                uint256 out;
                assembly {
                    out := mload(add(ret, 32))
                }
                if (out > bestOut) {
                    bestOut = out;
                    bestFee = fees[i];
                }
            }
        }
    }

    function _aeroClassicQuote(address tokenIn, address tokenOut, uint256 amountIn)
        internal
        view
        returns (uint256 out)
    {
        IV124AeroClassicRouter.Route[] memory routes = new IV124AeroClassicRouter.Route[](1);
        routes[0] = IV124AeroClassicRouter.Route({
            from: tokenIn,
            to: tokenOut,
            stable: false,
            factory: V124BaseAddresses.AERO_CLASSIC_FACTORY
        });
        try IV124AeroClassicRouter(V124BaseAddresses.AERO_CLASSIC_ROUTER).getAmountsOut(amountIn, routes) returns (
            uint256[] memory amounts
        ) {
            if (amounts.length > 1) out = amounts[amounts.length - 1];
        } catch {}
    }

    function _bestAeroSlipQuote(address tokenIn, address tokenOut, uint256 amountIn)
        internal
        returns (uint256 bestOut, int24 bestTick)
    {
        int24[4] memory ticks = [int24(1), int24(50), int24(100), int24(200)];
        for (uint256 i; i < ticks.length; ++i) {
            IV124AeroSlipQuoter.QuoteExactInputSingleParams memory p = IV124AeroSlipQuoter.QuoteExactInputSingleParams({
                tokenIn: tokenIn,
                tokenOut: tokenOut,
                amountIn: amountIn,
                tickSpacing: ticks[i],
                sqrtPriceLimitX96: 0
            });
            (bool ok, bytes memory ret) = V124BaseAddresses.AERO_SLIP_QUOTER.call(
                abi.encodeCall(IV124AeroSlipQuoter.quoteExactInputSingle, (p))
            );
            if (ok && ret.length >= 32) {
                uint256 out;
                assembly {
                    out := mload(add(ret, 32))
                }
                if (out > bestOut) {
                    bestOut = out;
                    bestTick = ticks[i];
                }
            }
        }
    }

    function _forceApprove(address token, address spender, uint256 amount) internal {
        require(IERC20V124(token).approve(spender, 0), "APPROVE0");
        require(IERC20V124(token).approve(spender, amount), "APPROVE");
    }
}

/// @notice Distilled QE -> BEST EXTERNAL DEX -> QT -> REPAY -> NAV executor.
/// QE premium is protocol-internal. The external DEX quote is real Base state.
contract V124QEExecutor is IV124FlashBorrower {
    uint256 internal constant BPS = 10_000;

    IERC20V124 public immutable usdc;
    IERC20V124 public immutable weth;
    V124BridgeVault public immutable ethBridge;
    V124BridgeVault public immutable usdcBridge;
    V124DebtBook public immutable debt;
    V124ZeroFeeFlashVault public immutable flash;
    V124BestDex public immutable dex;

    uint256 public cumulativeExecutorPnl;
    uint256 public lastExecutorPnl;
    uint256 public lastExternalWethOut;
    uint256 public lastInternalPay;
    uint256 public lastQEPremium;
    V124BestDex.Venue public lastVenue;

    constructor(
        IERC20V124 u,
        IERC20V124 w,
        V124BridgeVault eb,
        V124BridgeVault ub,
        V124DebtBook d,
        V124ZeroFeeFlashVault f,
        V124BestDex x
    ) {
        usdc = u;
        weth = w;
        ethBridge = eb;
        usdcBridge = ub;
        debt = d;
        flash = f;
        dex = x;
        require(u.approve(address(x), type(uint256).max), "DEX_APPROVE_USDC");
        require(w.approve(address(x), type(uint256).max), "DEX_APPROVE_WETH");
    }

    function run(uint256 principal, uint256 qePremiumBps) external {
        require(qePremiumBps <= 20_000, "QE_TOO_LARGE");
        flash.flashLoan(address(this), principal, abi.encode(qePremiumBps));
        require(debt.debtUsd() == 0, "QE_DEBT_END");
        require(flash.outstanding() == 0, "FLASH_DEBT_END");
        require(usdc.balanceOf(address(this)) == 0, "USDC_RESIDUAL");
        require(weth.balanceOf(address(this)) == 0, "WETH_RESIDUAL");
    }

    function onFlashLoan(uint256 amount, bytes calldata data) external override {
        require(msg.sender == address(flash), "FLASH_ONLY");
        uint256 qePremiumBps = abi.decode(data, (uint256));

        (V124BestDex.Quote memory q, uint256 wethOut) = dex.swapBest(
            address(usdc), address(weth), amount, 10
        );

        // Internal settlement price = external spend at QE=0, with QE applying a premium.
        // This deliberately gives QE every chance to create executor-side PnL while keeping
        // the consolidated token accounting explicit.
        uint256 internalPay = amount * (BPS + qePremiumBps) / BPS;
        uint256 qePremium = internalPay - amount;
        if (qePremium > 0) debt.issue(qePremium);

        usdcBridge.release(address(this), internalPay);
        require(weth.transfer(address(ethBridge), wethOut), "LOCK_WETH");
        require(usdc.transfer(address(flash), amount), "FLASH_REPAY");

        uint256 surplus = usdc.balanceOf(address(this));
        if (surplus > 0) require(usdc.transfer(address(usdcBridge), surplus), "RELOCK_SURPLUS");

        debt.qtBurnAll();

        cumulativeExecutorPnl += surplus;
        lastExecutorPnl = surplus;
        lastExternalWethOut = wethOut;
        lastInternalPay = internalPay;
        lastQEPremium = qePremium;
        lastVenue = q.venue;
    }

    /// @notice Executable canonical NAV: canonical USDC plus the best real Base quote
    /// for liquidating the canonical WETH bridge balance at the current fork state.
    function bridgeNavExecutable() external returns (uint256 navUsdc) {
        uint256 w = weth.balanceOf(address(ethBridge));
        uint256 u = usdc.balanceOf(address(usdcBridge));
        if (w == 0) return u;
        V124BestDex.Quote memory q = dex.quoteBest(address(weth), address(usdc), w);
        require(q.amountOut > 0, "NO_WETH_VALUATION");
        return u + q.amountOut;
    }
}
