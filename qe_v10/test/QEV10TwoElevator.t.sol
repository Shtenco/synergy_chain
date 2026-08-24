// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import "../src/QEV10TwoElevator.sol";

contract QEV10TwoElevatorTest {
    uint256 constant WAD=1e18; uint256 constant P=2500e18;
    struct Env {T10Token e;T10Token u;T10BridgeVault eb;T10BridgeVault ub;T10DebtBook d;T10FixedDex dex;T10TwoElevatorPump pump;}
    function env(uint256 fee) internal returns(Env memory z){
        z.e=new T10Token("ETH","ETH"); z.u=new T10Token("USDC","USDC"); z.eb=new T10BridgeVault(z.e); z.ub=new T10BridgeVault(z.u); z.d=new T10DebtBook(); z.dex=new T10FixedDex(z.e,z.u,P,fee); z.pump=new T10TwoElevatorPump(z.e,z.u,z.eb,z.ub,z.d,z.dex,P);
        z.eb.setController(address(z.pump));z.ub.setController(address(z.pump));z.d.setController(address(z.pump));
        z.e.mint(address(z.eb),2e14); z.u.mint(address(z.ub),5e17); // $0.50 + $0.50
        z.e.mint(address(z.dex),1_000_000e18);z.u.mint(address(z.dex),2_500_000_000e18);
        z.e.mint(address(z.pump),1e18);z.u.mint(address(z.pump),2500e18); // flash-principal stand-ins
    }
    function nav(Env memory z) internal view returns(uint256){return z.e.balanceOf(address(z.eb))*P/WAD+z.u.balanceOf(address(z.ub));}

    function testAsymmetricZeroFeeSupercycleConservesCanonicalNAV() public {
        Env memory z=env(0); uint256 s=nav(z);
        z.pump.positive(12e16,7000,3500,8000,10000);
        z.pump.negative(36e12,18000,2000,1500,10000);
        uint256 e=nav(z); require(e+30>=s && e<=s+30,"NAV_CREATED"); require(z.d.debtUsd()==0,"DEBT_LEFT");
    }

    function testTwoElevatorsCannotRaiseBothAtZeroFeeAfterFullQT() public {
        Env memory z=env(0); uint256 e0=z.e.balanceOf(address(z.eb)); uint256 u0=z.u.balanceOf(address(z.ub));
        z.pump.positive(8e16,10000,5000,3000,10000);
        z.pump.negative(32e12,5000,7000,7000,10000);
        bool both=z.e.balanceOf(address(z.eb))>e0 && z.u.balanceOf(address(z.ub))>u0;
        require(!both,"BOTH_LIFTS_ROSE"); require(z.d.debtUsd()==0,"DEBT_LEFT");
    }

    function testBaseFeeMakesPumpLoseCanonicalNAV() public {
        Env memory z=env(30); uint256 s=nav(z);
        z.pump.positive(8e16,10000,5000,5000,10000);
        z.pump.negative(32e12,10000,5000,5000,10000);
        require(nav(z)<s,"NO_FEE_LOSS");
    }

    function testDeferredDebtQTDoesNotMoveCanonicalBalances() public {
        Env memory z=env(0); uint256 e0=z.e.balanceOf(address(z.eb)); uint256 u0=z.u.balanceOf(address(z.ub));
        z.pump.positive(5e16,20000,0,5000,0);
        uint256 afterLegE=z.e.balanceOf(address(z.eb)); uint256 afterLegU=z.u.balanceOf(address(z.ub));
        require(z.d.debtUsd()>0,"NO_DEBT");
        z.pump.negative(1e10,0,0,5000,10000);
        require(z.d.debtUsd()==0,"QT_FAILED");
        require(afterLegE>e0 && afterLegU<u0,"LEG_DIRECTION_BAD");
    }
}
