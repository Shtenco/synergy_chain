// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract T10Token {
    string public name; string public symbol; uint8 public constant decimals=18;
    uint256 public totalSupply; mapping(address=>uint256) public balanceOf; mapping(address=>mapping(address=>uint256)) public allowance;
    constructor(string memory n,string memory s){name=n;symbol=s;}
    function mint(address to,uint256 a) external {totalSupply+=a; balanceOf[to]+=a;}
    function approve(address s,uint256 a) external returns(bool){allowance[msg.sender][s]=a;return true;}
    function transfer(address to,uint256 a) external returns(bool){_move(msg.sender,to,a);return true;}
    function transferFrom(address f,address t,uint256 a) external returns(bool){uint256 x=allowance[f][msg.sender];require(x>=a,"ALLOW");if(x!=type(uint256).max)allowance[f][msg.sender]=x-a;_move(f,t,a);return true;}
    function _move(address f,address t,uint256 a) internal {require(balanceOf[f]>=a,"BAL");balanceOf[f]-=a;balanceOf[t]+=a;}
}

contract T10BridgeVault {
    T10Token public immutable token; address public owner; address public controller;
    constructor(T10Token t){token=t;owner=msg.sender;}
    function setController(address c) external {require(msg.sender==owner,"OWNER");controller=c;}
    function release(address to,uint256 a) external {require(msg.sender==controller,"CTRL");require(token.transfer(to,a),"TRANSFER");}
    function lockBalance() external view returns(uint256){return token.balanceOf(address(this));}
}

contract T10DebtBook {
    address public owner; address public controller; uint256 public debtUsd; uint256 public issued; uint256 public burned;
    constructor(){owner=msg.sender;}
    function setController(address c) external {require(msg.sender==owner,"OWNER");controller=c;}
    function issue(uint256 a) external {require(msg.sender==controller,"CTRL");debtUsd+=a;issued+=a;}
    function qtBurn(uint256 a) external {require(msg.sender==controller,"CTRL");uint256 b=a>debtUsd?debtUsd:a;debtUsd-=b;burned+=b;}
}

contract T10FixedDex {
    uint256 public constant WAD=1e18; uint256 public constant BPS=10_000;
    T10Token public immutable eth; T10Token public immutable usdc; uint256 public immutable price; uint256 public immutable feeBps;
    constructor(T10Token e,T10Token u,uint256 p,uint256 f){require(f<BPS,"FEE");eth=e;usdc=u;price=p;feeBps=f;}
    function usdcToEth(uint256 u,address to) external returns(uint256 eout){require(usdc.transferFrom(msg.sender,address(this),u),"IN");eout=(u*WAD/price)*(BPS-feeBps)/BPS;require(eth.transfer(to,eout),"OUT");}
    function ethToUsdc(uint256 e,address to) external returns(uint256 uout){require(eth.transferFrom(msg.sender,address(this),e),"IN");uout=(e*price/WAD)*(BPS-feeBps)/BPS;require(usdc.transfer(to,uout),"OUT");}
}

contract T10TwoElevatorPump {
    uint256 public constant WAD=1e18; uint256 public constant BPS=10_000;
    T10Token public immutable eth; T10Token public immutable usdc; T10BridgeVault public immutable eb; T10BridgeVault public immutable ub;
    T10DebtBook public immutable debt; T10FixedDex public immutable dex; uint256 public immutable price;
    uint256 public cumulativeQEPnl;
    constructor(T10Token e,T10Token u,T10BridgeVault _eb,T10BridgeVault _ub,T10DebtBook d,T10FixedDex x,uint256 p){eth=e;usdc=u;eb=_eb;ub=_ub;debt=d;dex=x;price=p;e.approve(address(x),type(uint256).max);u.approve(address(x),type(uint256).max);}

    function positive(uint256 usdcPrincipal,uint256 premBps,uint256 settleBps,uint256 reinvestEthBps,uint256 qtBps) external {
        require(premBps<=30_000 && settleBps<=BPS && reinvestEthBps<=BPS && qtBps<=BPS,"PARAM");
        uint256 e=dex.usdcToEth(usdcPrincipal,address(this)); require(eth.transfer(address(eb),e),"LOCK_E");
        uint256 grossProfit=usdcPrincipal*premBps/BPS; uint256 realized=grossProfit*settleBps/BPS; uint256 deferred=grossProfit-realized;
        ub.release(address(this),usdcPrincipal+realized);
        require(usdc.transfer(address(0xBEEF),usdcPrincipal),"REPAY_U");
        uint256 toEth=realized*reinvestEthBps/BPS; uint256 toU=realized-toEth;
        if(toEth>0){uint256 er=dex.usdcToEth(toEth,address(this));require(eth.transfer(address(eb),er),"REINV_E");}
        if(toU>0) require(usdc.transfer(address(ub),toU),"REINV_U");
        if(deferred>0) debt.issue(deferred); if(qtBps>0) debt.qtBurn(debt.debtUsd()*qtBps/BPS);
        cumulativeQEPnl+=realized;
    }

    function negative(uint256 ethPrincipal,uint256 premBps,uint256 settleBps,uint256 reinvestEthBps,uint256 qtBps) external {
        require(premBps<=30_000 && settleBps<=BPS && reinvestEthBps<=BPS && qtBps<=BPS,"PARAM");
        uint256 u=dex.ethToUsdc(ethPrincipal,address(this)); require(usdc.transfer(address(ub),u),"LOCK_U");
        uint256 grossProfitEth=ethPrincipal*premBps/BPS; uint256 realizedEth=grossProfitEth*settleBps/BPS; uint256 deferredUsd=(grossProfitEth-realizedEth)*price/WAD;
        eb.release(address(this),ethPrincipal+realizedEth);
        require(eth.transfer(address(0xCAFE),ethPrincipal),"REPAY_E");
        uint256 toEth=realizedEth*reinvestEthBps/BPS; uint256 toSwap=realizedEth-toEth;
        if(toEth>0) require(eth.transfer(address(eb),toEth),"REINV_E");
        if(toSwap>0){uint256 ur=dex.ethToUsdc(toSwap,address(this));require(usdc.transfer(address(ub),ur),"REINV_U");}
        if(deferredUsd>0) debt.issue(deferredUsd); if(qtBps>0) debt.qtBurn(debt.debtUsd()*qtBps/BPS);
        cumulativeQEPnl+=realizedEth*price/WAD;
    }

    function bridgeNav() external view returns(uint256){return eth.balanceOf(address(eb))*price/WAD + usdc.balanceOf(address(ub));}
}
