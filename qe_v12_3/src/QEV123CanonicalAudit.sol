// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IV123FlashBorrower {
    function onFlashLoan(uint256 amount, bytes calldata data) external;
}

contract V123Token {
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

contract V123BridgeVault {
    V123Token public immutable token;
    address public owner;
    address public controller;

    constructor(V123Token t) {
        token = t;
        owner = msg.sender;
    }

    function setController(address c) external {
        require(msg.sender == owner, "OWNER");
        controller = c;
    }

    function release(address to, uint256 amount) external {
        require(msg.sender == controller, "CTRL");
        require(token.transfer(to, amount), "TRANSFER");
    }

    function lockBalance() external view returns (uint256) {
        return token.balanceOf(address(this));
    }
}

contract V123DebtBook {
    address public owner;
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

contract V123ZeroFeeFlashVault {
    V123Token public immutable usdc;

    constructor(V123Token u) {
        usdc = u;
    }

    function flashLoan(address receiver, uint256 amount, bytes calldata data) external {
        uint256 beforeBal = usdc.balanceOf(address(this));
        require(beforeBal >= amount, "LIQ");
        require(usdc.transfer(receiver, amount), "SEND");
        IV123FlashBorrower(receiver).onFlashLoan(amount, data);
        require(usdc.balanceOf(address(this)) >= beforeBal, "NOT_REPAID");
    }
}

/// @notice External canonical venue. bonusBps models a quote advantage / subsidy,
/// feeBps models external leakage. The net external quote edge is bonusBps-feeBps.
contract V123ExternalDex {
    uint256 public constant WAD = 1e18;
    uint256 public constant BPS = 10_000;

    V123Token public immutable usdc;
    V123Token public immutable weth;
    uint256 public immutable price; // USDC per WETH, 18-dec fixed-point
    uint256 public immutable bonusBps;
    uint256 public immutable feeBps;

    constructor(V123Token u, V123Token w, uint256 p, uint256 bonus, uint256 fee) {
        require(bonus + BPS > fee, "BAD_EDGE");
        usdc = u;
        weth = w;
        price = p;
        bonusBps = bonus;
        feeBps = fee;
    }

    function usdcToWeth(uint256 amountIn, address to) external returns (uint256 wethOut) {
        require(usdc.transferFrom(msg.sender, address(this), amountIn), "IN");
        uint256 multiplier = BPS + bonusBps - feeBps;
        wethOut = amountIn * WAD * multiplier / (price * BPS);
        require(weth.transfer(to, wethOut), "OUT");
    }
}

/// @notice Asset-backed audit executor.
/// QE creates an INTERNAL premium that makes executor PnL positive, but only the
/// external venue's net canonical quote edge can change consolidated bridge NAV.
contract V123QEExecutor is IV123FlashBorrower {
    uint256 public constant WAD = 1e18;
    uint256 public constant BPS = 10_000;

    V123Token public immutable usdc;
    V123Token public immutable weth;
    V123BridgeVault public immutable ethBridge;
    V123BridgeVault public immutable usdcBridge;
    V123DebtBook public immutable debt;
    V123ZeroFeeFlashVault public immutable flash;
    V123ExternalDex public immutable dex;
    uint256 public immutable price;

    uint256 public cumulativeExecutorPnl;
    uint256 public lastExternalFairValue;
    uint256 public lastInternalPay;
    uint256 public lastQEPremium;
    uint256 public lastExecutorSurplus;

    constructor(
        V123Token u,
        V123Token w,
        V123BridgeVault eb,
        V123BridgeVault ub,
        V123DebtBook d,
        V123ZeroFeeFlashVault f,
        V123ExternalDex x,
        uint256 p
    ) {
        usdc = u;
        weth = w;
        ethBridge = eb;
        usdcBridge = ub;
        debt = d;
        flash = f;
        dex = x;
        price = p;
        u.approve(address(x), type(uint256).max);
    }

    function run(uint256 principal, uint256 qePremiumBps) external {
        require(qePremiumBps <= 20_000, "QE_TOO_LARGE");
        flash.flashLoan(address(this), principal, abi.encode(qePremiumBps));
        require(debt.debtUsd() == 0, "DEBT_LEFT");
        require(usdc.balanceOf(address(this)) == 0, "USDC_RESIDUAL");
        require(weth.balanceOf(address(this)) == 0, "WETH_RESIDUAL");
    }

    function onFlashLoan(uint256 amount, bytes calldata data) external override {
        require(msg.sender == address(flash), "FLASH_ONLY");
        uint256 qePremiumBps = abi.decode(data, (uint256));

        uint256 wethOut = dex.usdcToWeth(amount, address(this));
        uint256 externalFairValue = wethOut * price / WAD;
        uint256 internalPay = externalFairValue * (BPS + qePremiumBps) / BPS;
        uint256 qePremium = internalPay - externalFairValue;

        // The USDC bridge pays the QE-created internal premium. This is the
        // exact place where a naive ledger can mistake internal transfer for PnL.
        if (qePremium > 0) debt.issue(qePremium);
        usdcBridge.release(address(this), internalPay);

        // The acquired canonical WETH becomes actual ETH-bridge backing.
        require(weth.transfer(address(ethBridge), wethOut), "LOCK_WETH");

        // Flash principal is repaid atomically.
        require(usdc.transfer(address(flash), amount), "FLASH_REPAY");

        // Executor surplus is relocked into the USDC bridge.
        uint256 surplus = usdc.balanceOf(address(this));
        if (surplus > 0) require(usdc.transfer(address(usdcBridge), surplus), "RELOCK_USDC");

        // QT can cancel the protocol-internal QE debt, but this call moves no canonical tokens.
        debt.qtBurnAll();

        cumulativeExecutorPnl += surplus;
        lastExternalFairValue = externalFairValue;
        lastInternalPay = internalPay;
        lastQEPremium = qePremium;
        lastExecutorSurplus = surplus;
    }

    function bridgeNav() external view returns (uint256) {
        return weth.balanceOf(address(ethBridge)) * price / WAD + usdc.balanceOf(address(usdcBridge));
    }
}
