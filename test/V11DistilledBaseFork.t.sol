// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../src/InternalMintedPool.sol";
import "../src/BaseExternalPool.sol";
import "../src/USDCBridgePump.sol";
import "../src/ETHBridgePump.sol";

interface VmDistilled {
    function createSelectFork(string calldata rpcUrl) external returns (uint256 forkId);
    function deal(address who, uint256 newBalance) external;
}

interface IWETHDepositDistilled {
    function deposit() external payable;
}

contract V11DistilledBaseForkTest {
    VmDistilled internal constant vm = VmDistilled(address(uint160(uint256(keccak256("hevm cheat code")))));

    address internal constant WETH = 0x4200000000000000000000000000000000000006;
    address internal constant USDC = 0x833589fcd6edb6e08f4c7c32d4f71b54bda02913;
    uint256 internal constant START_WETH = 2e14; // about $0.50 near $2500/WETH
    uint256 internal constant START_USDC = 500_000; // $0.50
    uint256 internal constant LEG_USDC = 100_000; // $0.10

    InternalMintedPool internal internalPool;
    BaseExternalPool internal externalPool;
    USDCBridgePump internal usdcPump;
    ETHBridgePump internal ethPump;

    event CycleMetrics(
        uint256 navBeforeUsdc6,
        uint256 navAfterUsdc6,
        uint256 syntheticPnlAUsdc6,
        uint256 syntheticPnlBUsdc6,
        uint256 qeDebtEndUsdc6
    );

    function setUp() public {
        vm.createSelectFork("https://mainnet.base.org");
        require(block.chainid == 8453, "NOT_BASE");

        internalPool = new InternalMintedPool(2500e18);
        externalPool = new BaseExternalPool();
        require(externalPool.verifyPinnedPool(), "PINNED_POOL_MISMATCH");

        usdcPump = new USDCBridgePump(internalPool, externalPool);
        ethPump = new ETHBridgePump(internalPool, externalPool);
        usdcPump.setEthBridgePeer(address(ethPump));
        ethPump.setUsdcBridgePeer(address(usdcPump));
        internalPool.setController(address(usdcPump), true);
        internalPool.setController(address(ethPump), true);

        // Obtain setup USDC through the real pinned Base pool before the measured experiment.
        vm.deal(address(this), 1 ether);
        IWETHDepositDistilled(WETH).deposit{value: 0.02 ether}();
        require(IERC20Base(WETH).approve(address(externalPool), type(uint256).max), "APPROVE_SETUP");
        externalPool.swapWethForUsdc(0.005 ether, 0, address(this));

        require(IERC20Base(WETH).transfer(address(ethPump), START_WETH), "SEED_WETH");
        require(IERC20Base(USDC).transfer(address(usdcPump), START_USDC), "SEED_USDC");
    }

    function testPinnedLargestWethUsdcPoolIdentity() public view {
        require(externalPool.POOL() == 0x6c561b446416e1a00e8e93e221854d6ea4171372, "POOL");
        require(externalPool.FEE() == 3000, "FEE");
        require(externalPool.verifyPinnedPool(), "POOL_IDENTITY");
    }

    function testOneFullQEGradientTwoPumpCycleOnRealBasePool() public {
        uint256 navBefore = _nav();
        (uint256 pnlA, uint256 pnlB) = _cycle();
        uint256 navAfter = _nav();

        emit CycleMetrics(navBefore, navAfter, pnlA, pnlB, internalPool.qeDebtUsdc6());

        require(pnlA > 0 && pnlB > 0, "QE_DID_NOT_CREATE_SYNTHETIC_GRADIENT_PNL");
        require(internalPool.qeDebtUsdc6() == 0, "QT_NOT_CLOSED");
        // On the same external pool with no intervening outside flow, a round trip should not mint canonical wealth.
        require(navAfter <= navBefore, "UNEXPLAINED_CANONICAL_GAIN");
    }

    function testTwentyCyclesDoNotTurnOneDollarIntoMillionsWithoutExternalFlow() public {
        uint256 navBefore = _nav();
        for (uint256 i; i < 20; ++i) {
            _cycle();
        }
        uint256 navAfter = _nav();
        uint256 synthetic = usdcPump.cumulativeSyntheticExecutorPnlUsdc6()
            + ethPump.cumulativeSyntheticExecutorPnlUsdc6();

        require(synthetic > 0, "NO_SYNTHETIC_PNL");
        require(internalPool.qeDebtUsdc6() == 0, "QE_DEBT_LEFT");
        require(navAfter <= navBefore, "CLOSED_LOOP_CREATED_CANONICAL_NAV");
    }

    function _cycle() internal returns (uint256 pnlA, uint256 pnlB) {
        uint256 quotedWeth = externalPool.quoteUsdcForWeth(LEG_USDC);
        uint256 externalPriceA = LEG_USDC * 1e30 / quotedWeth;
        internalPool.setQEPrice(externalPriceA * 110 / 100); // QE creates +10% internal gradient.

        (uint256 wethOut, uint256 a) = usdcPump.pumpToEth(LEG_USDC, 0);
        pnlA = a;

        uint256 quotedUsdc = externalPool.quoteWethForUsdc(wethOut);
        uint256 externalPriceB = quotedUsdc * 1e30 / wethOut;
        internalPool.setQEPrice(externalPriceB * 90 / 100); // reverse QE gradient.

        (, uint256 b) = ethPump.pumpToUsdc(wethOut, 0);
        pnlB = b;
        internalPool.resetNeutral();
    }

    function _nav() internal returns (uint256 navUsdc6) {
        uint256 u = IERC20Base(USDC).balanceOf(address(usdcPump));
        uint256 w = IERC20Base(WETH).balanceOf(address(ethPump));
        uint256 quotedW = w == 0 ? 0 : externalPool.quoteWethForUsdc(w);
        navUsdc6 = u + quotedW;
    }
}
