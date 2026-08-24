// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20Lite {
    function balanceOf(address a) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);
}

contract MockERC20 {
    string public name;
    string public symbol;
    uint8 public constant decimals = 18;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    constructor(string memory n, string memory s) { name=n; symbol=s; }
    function mint(address to, uint256 amount) external { totalSupply += amount; balanceOf[to] += amount; }
    function approve(address s, uint256 a) external returns (bool) { allowance[msg.sender][s]=a; return true; }
    function transfer(address to, uint256 a) external returns (bool) { _move(msg.sender,to,a); return true; }
    function transferFrom(address f,address t,uint256 a) external returns (bool) {
        uint256 x=allowance[f][msg.sender]; require(x>=a,"ALLOW");
        if(x!=type(uint256).max) allowance[f][msg.sender]=x-a;
        _move(f,t,a); return true;
    }
    function _move(address f,address t,uint256 a) internal { require(balanceOf[f]>=a,"BAL"); balanceOf[f]-=a; balanceOf[t]+=a; }
}

contract BridgeVault {
    IERC20Lite public immutable token;
    address public owner;
    address public controller;
    constructor(IERC20Lite t) { token=t; owner=msg.sender; }
    function setController(address c) external { require(msg.sender==owner,"OWNER"); controller=c; }
    function lockBalance() external view returns(uint256){ return token.balanceOf(address(this)); }
    function releaseTo(address to,uint256 amount) external {
        require(msg.sender==controller,"CTRL");
        require(token.transfer(to,amount),"TRANSFER");
    }
}

contract InternalQEDebtBook {
    address public owner;
    address public controller;
    uint256 public debtUsd;
    uint256 public cumulativeIssued;
    uint256 public cumulativeBurned;
    constructor(){ owner=msg.sender; }
    function setController(address c) external { require(msg.sender==owner,"OWNER"); controller=c; }
    function issue(uint256 a) external { require(msg.sender==controller,"CTRL"); debtUsd+=a; cumulativeIssued+=a; }
    function qtBurn(uint256 a) external { require(msg.sender==controller,"CTRL"); uint256 b=a>debtUsd?debtUsd:a; debtUsd-=b; cumulativeBurned+=b; }
}

interface IFlashBorrower { function onFlashLoan(address token,uint256 amount,bytes calldata data) external; }

contract ZeroFeeFlashVault {
    function flashLoan(IERC20Lite token,uint256 amount,address receiver,bytes calldata data) external {
        uint256 beforeBal=token.balanceOf(address(this));
        require(beforeBal>=amount,"LIQ");
        require(token.transfer(receiver,amount),"SEND");
        IFlashBorrower(receiver).onFlashLoan(address(token),amount,data);
        require(token.balanceOf(address(this))>=beforeBal,"NOT_REPAID");
    }
}

contract HugeFixedPriceDex {
    uint256 public constant WAD=1e18;
    uint256 public constant BPS=10_000;
    IERC20Lite public immutable eth;
    IERC20Lite public immutable usdc;
    uint256 public immutable priceUsdPerEthWad;
    uint256 public immutable feeBps;
    constructor(IERC20Lite e,IERC20Lite u,uint256 p,uint256 f){ require(f<BPS,"FEE"); eth=e; usdc=u; priceUsdPerEthWad=p; feeBps=f; }
    function swapUsdcForEth(uint256 usdcIn,address to) external returns(uint256 ethOut){
        require(usdc.transferFrom(msg.sender,address(this),usdcIn),"IN");
        uint256 gross=usdcIn*WAD/priceUsdPerEthWad;
        ethOut=gross*(BPS-feeBps)/BPS;
        require(eth.transfer(to,ethOut),"OUT");
    }
    function swapEthForUsdc(uint256 ethIn,address to) external returns(uint256 usdcOut){
        require(eth.transferFrom(msg.sender,address(this),ethIn),"IN");
        uint256 gross=ethIn*priceUsdPerEthWad/WAD;
        usdcOut=gross*(BPS-feeBps)/BPS;
        require(usdc.transfer(to,usdcOut),"OUT");
    }
}

contract AtomicQEExecutor is IFlashBorrower {
    uint256 public constant WAD=1e18;
    uint256 public constant BPS=10_000;
    IERC20Lite public immutable eth;
    IERC20Lite public immutable usdc;
    BridgeVault public immutable ethBridge;
    BridgeVault public immutable usdcBridge;
    InternalQEDebtBook public immutable debt;
    HugeFixedPriceDex public immutable dex;
    ZeroFeeFlashVault public immutable flash;
    uint256 public immutable price;
    uint256 public cumulativeExecutorPnlUsd;
    constructor(IERC20Lite e,IERC20Lite u,BridgeVault eb,BridgeVault ub,InternalQEDebtBook d,HugeFixedPriceDex x,ZeroFeeFlashVault f,uint256 p){
        eth=e;usdc=u;ethBridge=eb;usdcBridge=ub;debt=d;dex=x;flash=f;price=p;
        e.approve(address(x),type(uint256).max); u.approve(address(x),type(uint256).max);
    }
    function runPositive(uint256 flashUsdc,uint256 qePremiumBps) external { flash.flashLoan(usdc,flashUsdc,address(this),abi.encode(uint8(1),qePremiumBps)); }
    function runNegative(uint256 flashEth,uint256 qePremiumBps) external { flash.flashLoan(eth,flashEth,address(this),abi.encode(uint8(2),qePremiumBps)); }
    function onFlashLoan(address token,uint256 amount,bytes calldata data) external override {
        require(msg.sender==address(flash),"FLASH");
        (uint8 dir,uint256 prem)=abi.decode(data,(uint8,uint256));
        require(prem<=5_000,"PREM_CAP");
        if(dir==1){ require(token==address(usdc),"TOKEN"); _positive(amount,prem); }
        else { require(dir==2 && token==address(eth),"TOKEN"); _negative(amount,prem); }
    }
    function _positive(uint256 flashUsdc,uint256 prem) internal {
        uint256 ethGot=dex.swapUsdcForEth(flashUsdc,address(this));
        require(eth.transfer(address(ethBridge),ethGot),"LOCK_ETH");
        uint256 payout=flashUsdc*(BPS+prem)/BPS;
        uint256 qePnl=payout-flashUsdc;
        debt.issue(qePnl);
        usdcBridge.releaseTo(address(this),payout);
        require(usdc.transfer(address(flash),flashUsdc),"REPAY");
        uint256 half=qePnl/2;
        if(half>0){ uint256 ethRe=dex.swapUsdcForEth(half,address(this)); require(eth.transfer(address(ethBridge),ethRe),"REINV_ETH"); }
        uint256 rest=qePnl-half;
        if(rest>0) require(usdc.transfer(address(usdcBridge),rest),"REINV_USDC");
        cumulativeExecutorPnlUsd += qePnl;
        debt.qtBurn(qePnl);
    }
    function _negative(uint256 flashEth,uint256 prem) internal {
        uint256 usdcGot=dex.swapEthForUsdc(flashEth,address(this));
        require(usdc.transfer(address(usdcBridge),usdcGot),"LOCK_USDC");
        uint256 payoutEth=flashEth*(BPS+prem)/BPS;
        uint256 pnlEth=payoutEth-flashEth;
        uint256 pnlUsd=pnlEth*price/WAD;
        debt.issue(pnlUsd);
        ethBridge.releaseTo(address(this),payoutEth);
        require(eth.transfer(address(flash),flashEth),"REPAY");
        uint256 halfEth=pnlEth/2;
        if(halfEth>0) require(eth.transfer(address(ethBridge),halfEth),"REINV_ETH");
        uint256 swapEth=pnlEth-halfEth;
        if(swapEth>0){ uint256 u=dex.swapEthForUsdc(swapEth,address(this)); require(usdc.transfer(address(usdcBridge),u),"REINV_USDC"); }
        cumulativeExecutorPnlUsd += pnlUsd;
        debt.qtBurn(pnlUsd);
    }
    function bridgeNavUsd() external view returns(uint256){ return eth.balanceOf(address(ethBridge))*price/WAD + usdc.balanceOf(address(usdcBridge)); }
}

contract UnsafeFreeCancelAccounting {
    uint256 public reportedEthLockUsd;
    uint256 public reportedUsdcLockUsd;
    uint256 public debtUsd;
    constructor(uint256 e,uint256 u){ reportedEthLockUsd=e; reportedUsdcLockUsd=u; }
    function fakeCycle(uint256 qePnlUsd) external {
        debtUsd += qePnlUsd;
        reportedEthLockUsd += qePnlUsd/2;
        reportedUsdcLockUsd += qePnlUsd-qePnlUsd/2;
        debtUsd = 0;
    }
}
