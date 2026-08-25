// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../src/InternalMintedPool.sol";
import "../src/ExternalCPMM.sol";
import "../src/ETHBridgePump.sol";
import "../src/USDCBridgePump.sol";

contract MockERC20Distilled {
    string public name;
    string public symbol;
    uint8 public constant decimals = 18;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    constructor(string memory n, string memory s) {
        name = n;
        symbol = s;
    }

    function mint(address to, uint256 amount) external {
        totalSupply += amount;
        balanceOf[to] += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        _move(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 a = allowance[from][msg.sender];
        require(a >= amount, "ALLOW");
        if (a != type(uint256).max) allowance[from][msg.sender] = a - amount;
        _move(from, to, amount);
        return true;
    }

    function _move(address from, address to, uint256 amount) internal {
        require(balanceOf[from] >= amount, "BAL");
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
    }
}

contract V11DistilledTest {
    uint256 constant WAD = 1e18;
    uint256 constant REF_PRICE = 2500e18;
    uint256 constant START_WETH = 2e14; // $0.50 at $2500/WETH
    uint256 constant START_USDC = 5e17; // $0.50
    uint256 constant PRINCIPAL_USDC = 1e17; // $0.10

    struct Env {
        MockERC20Distilled w;
        MockERC20Distilled u;
        InternalMintedPool i;
        ExternalCPMM x;
        ETHBridgePump e;
        USDCBridgePump s;
    }

    event CycleResult(
        uint256 navBefore,
        uint256 navAfter,
        uint256 ethReserveBefore,
        uint256 ethReserveAfter,
        uint256 usdcReserveBefore,
        uint256 usdcReserveAfter,
        uint256 syntheticPnlA,
        uint256 syntheticPnlB
    );

    function _env(uint256 feeBps) internal returns (Env memory z) {
        z.w = new MockERC20Distilled("WETH", "WETH");
        z.u = new MockERC20Distilled("USDC", "USDC");
        z.i = new InternalMintedPool(REF_PRICE);
        z.x = new ExternalCPMM(IERC20Distilled(address(z.w)), IERC20Distilled(address(z.u)), feeBps);
        z.e = new ETHBridgePump(
            IERC20Distilled(address(z.w)),
            IERC20Distilled(address(z.u)),
            z.i,
            z.x
        );
        z.s = new USDCBridgePump(
            IERC20Distilled(address(z.w)),
            IERC20Distilled(address(z.u)),
            z.i,
            z.x
        );

        z.e.setCounterpart(address(z.s));
        z.s.setCounterpart(address(z.e));
        z.i.setPump(address(z.e), true);
        z.i.setPump(address(z.s), true);

        // Real canonical bridge reserves: total = $1 at the fixed reference price.
        z.w.mint(address(z.e), START_WETH);
        z.u.mint(address(z.s), START_USDC);

        // Huge foreign pool: 1000 WETH / 2.5m USDC.
        z.w.mint(address(z.x), 1000e18);
        z.u.mint(address(z.x), 2_500_000e18);

        // Test-address working capital stands in for zero-fee flash liquidity.
        z.w.mint(address(this), 10e18);
        z.u.mint(address(this), 10_000e18);
        z.w.approve(address(z.e), type(uint256).max);
        z.u.approve(address(z.s), type(uint256).max);
    }

    function _nav(Env memory z) internal view returns (uint256) {
        return z.w.balanceOf(address(z.e)) * REF_PRICE / WAD + z.u.balanceOf(address(z.s));
    }

    function _oneCycle(Env memory z, uint256 highPrice, uint256 lowPrice)
        internal
        returns (uint256 wethOut, uint256 usdcOut, uint256 pnlA, uint256 pnlB)
    {
        z.i.setQEPrice(highPrice);
        (wethOut, pnlA) = z.s.pumpToEth(PRINCIPAL_USDC, 0);
        require(z.i.debtUsd() == 0, "DEBT_AFTER_A");

        z.i.setQEPrice(lowPrice);
        (usdcOut, pnlB) = z.e.pumpToUsdc(wethOut, 0);
        require(z.i.debtUsd() == 0, "DEBT_AFTER_B");
    }

    function testClosedZeroFeeTwoPumpConservesCanonicalReserves() public {
        Env memory z = _env(0);
        uint256 nav0 = _nav(z);
        uint256 e0 = z.w.balanceOf(address(z.e));
        uint256 u0 = z.u.balanceOf(address(z.s));
        uint256 actorW0 = z.w.balanceOf(address(this));
        uint256 actorU0 = z.u.balanceOf(address(this));

        (, , uint256 pnlA, uint256 pnlB) = _oneCycle(z, 2750e18, 2250e18);

        uint256 nav1 = _nav(z);
        uint256 e1 = z.w.balanceOf(address(z.e));
        uint256 u1 = z.u.balanceOf(address(z.s));

        emit CycleResult(nav0, nav1, e0, e1, u0, u1, pnlA, pnlB);

        require(pnlA > 0, "NO_QE_PNL_A");
        require(pnlB > 0, "NO_QE_PNL_B");
        require(z.i.debtUsd() == 0, "QE_DEBT_END");
        require(z.w.balanceOf(address(this)) == actorW0, "WETH_FLASH_NOT_REPAID");
        require(z.u.balanceOf(address(this)) == actorU0, "USDC_FLASH_NOT_REPAID");
        require(e1 == e0, "ETH_BRIDGE_CHANGED");
        require(u1 <= u0, "USDC_CREATED");
        require(u0 - u1 <= 10_000, "ZERO_FEE_ROUNDTRIP_LOSS_TOO_LARGE");
        require(nav1 <= nav0, "CANONICAL_NAV_CREATED");
        require(nav0 - nav1 <= 10_000, "NAV_ROUNDING_TOO_LARGE");
    }

    function testBaseLikeFeeMakesCanonicalNAVFallEvenWhileQEPnlPositive() public {
        Env memory z = _env(30); // 30 bps each external leg
        uint256 nav0 = _nav(z);
        uint256 e0 = z.w.balanceOf(address(z.e));

        (, , uint256 pnlA, uint256 pnlB) = _oneCycle(z, 2750e18, 2250e18);

        uint256 nav1 = _nav(z);
        require(pnlA > 0 && pnlB > 0, "QE_PNL_NOT_POSITIVE");
        require(nav1 < nav0, "FEE_DID_NOT_REDUCE_NAV");
        require(z.w.balanceOf(address(z.e)) == e0, "ETH_NOT_RESTORED");
        require(z.i.debtUsd() == 0, "QE_DEBT_END");
    }

    function testBiggerQEOnlyRaisesSyntheticPnlNotClosedCanonicalResult() public {
        Env memory a = _env(0);
        Env memory b = _env(0);

        _oneCycle(a, 2750e18, 2250e18);
        uint256 navA = _nav(a);
        uint256 pnlA = a.s.cumulativeExecutorPnlUsd() + a.e.cumulativeExecutorPnlUsd();

        _oneCycle(b, 3000e18, 2000e18);
        uint256 navB = _nav(b);
        uint256 pnlB = b.s.cumulativeExecutorPnlUsd() + b.e.cumulativeExecutorPnlUsd();

        require(pnlB > pnlA, "BIGGER_QE_DID_NOT_RAISE_SYNTHETIC_PNL");
        require(navB == navA, "QE_CHANGED_CLOSED_CANONICAL_RESULT");
    }

    function testTwentyClosedCyclesDoNotTurnOneDollarIntoMillions() public {
        Env memory z = _env(0);
        uint256 nav0 = _nav(z);

        for (uint256 k; k < 20; ++k) {
            _oneCycle(z, 2750e18, 2250e18);
        }

        uint256 nav1 = _nav(z);
        uint256 synthetic = z.s.cumulativeExecutorPnlUsd() + z.e.cumulativeExecutorPnlUsd();
        require(synthetic > 0, "NO_SYNTHETIC_COMPOUND_SIGNAL");
        require(nav1 <= nav0, "CLOSED_SYSTEM_COMPOUNDED_CANONICAL_NAV");
        require(nav0 - nav1 <= 200_000, "ROUNDING_TOO_LARGE");
        require(z.i.debtUsd() == 0, "QE_DEBT_END");
    }

    function testExternalCanonicalInflowCreatesMeasurableBridgeSurplus() public {
        Env memory z = _env(0);
        uint256 nav0 = _nav(z);
        uint256 e0 = z.w.balanceOf(address(z.e));
        uint256 u0 = z.u.balanceOf(address(z.s));

        z.i.setQEPrice(2750e18);
        (uint256 wethOut, uint256 pnlA) = z.s.pumpToEth(PRINCIPAL_USDC, 0);
        require(pnlA > 0, "NO_PNL_A");

        // Explicit exogenous canonical value entering the foreign market between legs.
        // This is a provenance control: if the bridges grow, the test can identify the source.
        z.u.mint(address(z.x), 25_000e18);

        z.i.setQEPrice(2250e18);
        (uint256 usdcOut, uint256 pnlB) = z.e.pumpToUsdc(wethOut, 0);
        require(pnlB > 0, "NO_PNL_B");
        require(usdcOut > PRINCIPAL_USDC, "NO_EXTERNAL_CAPTURE");

        uint256 nav1 = _nav(z);
        require(z.w.balanceOf(address(z.e)) == e0, "ETH_CHANGED");
        require(z.u.balanceOf(address(z.s)) > u0, "USDC_BRIDGE_DID_NOT_GROW");
        require(nav1 > nav0, "REAL_NAV_DID_NOT_GROW");
        require(z.i.debtUsd() == 0, "QE_DEBT_END");
    }
}
