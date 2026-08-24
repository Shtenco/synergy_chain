// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import "../src/QEV9.sol";

contract QEV9Test {
    uint256 constant WAD=1e18;
    uint256 constant PRICE=2500e18;
    struct Env { MockERC20 eth; MockERC20 usdc; BridgeVault eb; BridgeVault ub; InternalQEDebtBook debt; ZeroFeeFlashVault flash; HugeFixedPriceDex dex; AtomicQEExecutor exec; }

    function _env(uint256 feeBps) internal returns(Env memory z){
        z.eth=new MockERC20("ETH","ETH"); z.usdc=new MockERC20("USDC","USDC");
        z.eb=new BridgeVault(IERC20Lite(address(z.eth))); z.ub=new BridgeVault(IERC20Lite(address(z.usdc)));
        z.debt=new InternalQEDebtBook(); z.flash=new ZeroFeeFlashVault();
        z.dex=new HugeFixedPriceDex(IERC20Lite(address(z.eth)),IERC20Lite(address(z.usdc)),PRICE,feeBps);
        z.exec=new AtomicQEExecutor(IERC20Lite(address(z.eth)),IERC20Lite(address(z.usdc)),z.eb,z.ub,z.debt,z.dex,z.flash,PRICE);
        z.eb.setController(address(z.exec)); z.ub.setController(address(z.exec)); z.debt.setController(address(z.exec));
        z.eth.mint(address(z.eb),2e14); z.usdc.mint(address(z.ub),5e17);
        z.eth.mint(address(z.dex),1_000_000e18); z.usdc.mint(address(z.dex),2_500_000_000e18);
        z.eth.mint(address(z.flash),100_000e18); z.usdc.mint(address(z.flash),250_000_000e18);
    }
    function _nav(Env memory z) internal view returns(uint256){ return z.eth.balanceOf(address(z.eb))*PRICE/WAD + z.usdc.balanceOf(address(z.ub)); }

    function testDebtIssueBurnDoesNotCreateCanonicalAssets() public {
        Env memory z=_env(0); uint256 beforeNav=_nav(z);
        z.exec.runPositive(1e16,1000);
        require(z.debt.debtUsd()==0,"DEBT_NOT_BURNED");
        uint256 afterNav=_nav(z);
        require(afterNav<=beforeNav+10,"FREE_CANCEL_CREATED_VALUE"); require(afterNav+10>=beforeNav,"ROUNDING_TOO_LARGE");
    }

    function testZeroFeeAlternatingQERoundsCannotGrowBothBridgeCapitals() public {
        Env memory z=_env(0); uint256 startEth=z.eth.balanceOf(address(z.eb)); uint256 startUsdc=z.usdc.balanceOf(address(z.ub)); uint256 startNav=_nav(z);
        for(uint256 i=0;i<20;i++){ z.exec.runPositive(5e15,1000); z.exec.runNegative(2e12,1000); }
        uint256 endNav=_nav(z);
        require(endNav<=startNav+200,"QE_CREATED_CANONICAL_NAV"); require(endNav+200>=startNav,"ROUNDING_TOO_LARGE");
        bool both=z.eth.balanceOf(address(z.eb))>startEth && z.usdc.balanceOf(address(z.ub))>startUsdc;
        require(!both,"BOTH_LOCKS_GREW_FROM_CLOSED_QE"); require(z.debt.debtUsd()==0,"DEBT_LEFT"); require(z.exec.cumulativeExecutorPnlUsd()>0,"NO_QE_PNL");
    }

    function testExternalFeesMakeCanonicalBridgeNAVFall() public {
        Env memory base=_env(30); Env memory poly=_env(5); uint256 s1=_nav(base); uint256 s2=_nav(poly);
        for(uint256 i=0;i<10;i++){
            base.exec.runPositive(5e15,1000); base.exec.runNegative(2e12,1000);
            poly.exec.runPositive(5e15,1000); poly.exec.runNegative(2e12,1000);
        }
        uint256 e1=_nav(base); uint256 e2=_nav(poly);
        require(e1<s1,"BASE_NO_LOSS"); require(e2<s2,"POLY_NO_LOSS"); require(s1-e1 > s2-e2,"POLY_NOT_CHEAPER");
    }

    function testLargeFlashCannotBypassOneDollarBridgeSolvency() public {
        Env memory z=_env(0);
        (bool ok,)=address(z.exec).call(abi.encodeWithSelector(z.exec.runPositive.selector,1e18,1000));
        require(!ok,"UNBACKED_FLASH_SHOULD_REVERT"); require(_nav(z)==1e18,"REVERT_CHANGED_NAV");
    }

    function testUnsafeV8ShortcutReportsGrowthWithoutTokenGrowth() public {
        Env memory z=_env(0); UnsafeFreeCancelAccounting bad=new UnsafeFreeCancelAccounting(5e17,5e17); uint256 realBefore=_nav(z);
        bad.fakeCycle(1e18); uint256 reported=bad.reportedEthLockUsd()+bad.reportedUsdcLockUsd(); uint256 realAfter=_nav(z);
        require(reported==2e18,"BAD_MODEL_NOT_GROWING"); require(realAfter==realBefore,"REAL_TOKENS_MOVED"); require(reported>realAfter,"SHORTCUT_NOT_DETECTED");
    }
}
