// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract V11Token {
    string public name;
    string public symbol;
    uint8 public constant decimals = 18;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    constructor(string memory n, string memory s) { name = n; symbol = s; }
    function mint(address to, uint256 amount) external { totalSupply += amount; balanceOf[to] += amount; }
    function approve(address spender, uint256 amount) external returns (bool) { allowance[msg.sender][spender] = amount; return true; }
    function transfer(address to, uint256 amount) external returns (bool) { _move(msg.sender, to, amount); return true; }
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

contract V11Vault {
    V11Token public immutable token;
    constructor(V11Token t) { token = t; }
    function lockBalance() external view returns (uint256) { return token.balanceOf(address(this)); }
}

/// Internal QE debt is deliberately accounting-only. It has no ERC-20 redemption path.
contract V11DebtBook {
    uint256 public debtUsdWad;
    uint256 public totalIssued;
    uint256 public totalBurned;

    function issue(uint256 amount) external { debtUsdWad += amount; totalIssued += amount; }
    function qtBurn(uint256 amount) external {
        uint256 b = amount > debtUsdWad ? debtUsdWad : amount;
        debtUsdWad -= b;
        totalBurned += b;
    }
}

/// Solvency guard: only actual canonical token balances count as bridge capital.
contract V11SolventAccountingGuard {
    uint256 public constant WAD = 1e18;
    V11Token public immutable weth;
    V11Token public immutable usdc;
    V11Vault public immutable ethVault;
    V11Vault public immutable usdcVault;
    uint256 public immutable wethPriceUsdWad;

    bool public cycleOpen;
    uint256 public navBefore;
    uint256 public lastCanonicalGrowth;

    constructor(V11Token e, V11Token u, V11Vault ev, V11Vault uv, uint256 price) {
        weth = e; usdc = u; ethVault = ev; usdcVault = uv; wethPriceUsdWad = price;
    }

    function canonicalNavWad() public view returns (uint256) {
        return weth.balanceOf(address(ethVault)) * wethPriceUsdWad / WAD
            + usdc.balanceOf(address(usdcVault));
    }

    function startCycle() external {
        require(!cycleOpen, "OPEN");
        cycleOpen = true;
        navBefore = canonicalNavWad();
    }

    function settleCycle() external returns (uint256 growth) {
        require(cycleOpen, "CLOSED");
        uint256 navAfter = canonicalNavWad();
        require(navAfter > navBefore, "no canonical NAV growth");
        growth = navAfter - navBefore;
        lastCanonicalGrowth = growth;
        cycleOpen = false;
    }
}

/// A test-only external venue funded with canonical tokens by an outside counterparty.
/// Profit therefore comes from a real token balance, not from QE bookkeeping.
contract V11ExternalEdge {
    uint256 public constant BPS = 10_000;
    V11Token public immutable token;
    constructor(V11Token t) { token = t; }

    function trade(uint256 notional, uint256 gainBps, address to) external returns (uint256 out) {
        require(gainBps <= 1000, "GAIN");
        require(token.transferFrom(msg.sender, address(this), notional), "IN");
        uint256 profit = notional * gainBps / BPS;
        out = notional + profit;
        require(token.transfer(to, out), "OUT");
    }
}

interface IV11FlashBorrower {
    function onFlashLoan(address token, address edge, address vault, uint256 amount, uint256 gainBps) external;
}

/// Zero-fee flash lender. It verifies that principal is fully returned atomically.
contract V11FlashLender {
    V11Token public immutable token;
    constructor(V11Token t) { token = t; }

    function flash(address borrower, address edge, address vault, uint256 amount, uint256 gainBps) external {
        uint256 beforeBal = token.balanceOf(address(this));
        require(beforeBal >= amount, "LIQ");
        require(token.transfer(borrower, amount), "LEND");
        IV11FlashBorrower(borrower).onFlashLoan(address(token), edge, vault, amount, gainBps);
        require(token.balanceOf(address(this)) >= beforeBal, "FLASH_NOT_REPAID");
    }
}

/// Protocol-owned executor: flash principal is repaid first; only realized external surplus is locked.
contract V11CycleExecutor is IV11FlashBorrower {
    mapping(address => uint256) public realizedExternalProfit;

    function onFlashLoan(address tokenAddr, address edgeAddr, address vault, uint256 amount, uint256 gainBps) external override {
        V11Token token = V11Token(tokenAddr);
        V11ExternalEdge edge = V11ExternalEdge(edgeAddr);
        require(address(edge.token()) == tokenAddr, "EDGE_TOKEN");
        require(address(V11FlashLender(msg.sender).token()) == tokenAddr, "LENDER_TOKEN");

        token.approve(edgeAddr, amount);
        uint256 out = edge.trade(amount, gainBps, address(this));
        require(out >= amount, "LOSS");

        require(token.transfer(msg.sender, amount), "REPAY");
        uint256 profit = out - amount;
        if (profit > 0) {
            require(token.transfer(vault, profit), "LOCK_PROFIT");
            realizedExternalProfit[tokenAddr] += profit;
        }
    }
}
