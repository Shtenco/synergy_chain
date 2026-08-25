// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Synthetic internal pool. It owns no canonical WETH/USDC.
/// QE changes only the synthetic internal exchange price.
contract InternalMintedPool {
    uint256 public constant WAD = 1e18;

    address public immutable owner;
    uint256 public qePriceX18; // USDC per 1 WETH, 18-decimal fixed point

    mapping(address => bool) public isPump;

    uint256 public debtUsd;
    uint256 public issuedUsd;
    uint256 public burnedUsd;

    event PumpSet(address indexed pump, bool allowed);
    event QEPriceSet(uint256 oldPriceX18, uint256 newPriceX18);
    event SyntheticIssued(address indexed pump, uint256 usdClaim);
    event QTBurn(address indexed pump, uint256 burnedUsd);

    modifier onlyOwner() {
        require(msg.sender == owner, "OWNER");
        _;
    }

    modifier onlyPump() {
        require(isPump[msg.sender], "PUMP");
        _;
    }

    constructor(uint256 initialPriceX18) {
        require(initialPriceX18 > 0, "PRICE");
        owner = msg.sender;
        qePriceX18 = initialPriceX18;
    }

    function setPump(address pump, bool allowed) external onlyOwner {
        require(pump != address(0), "ZERO");
        isPump[pump] = allowed;
        emit PumpSet(pump, allowed);
    }

    function setQEPrice(uint256 newPriceX18) external onlyOwner {
        require(newPriceX18 > 0, "PRICE");
        uint256 old = qePriceX18;
        qePriceX18 = newPriceX18;
        emit QEPriceSet(old, newPriceX18);
    }

    function quoteEthToUsdc(uint256 wethAmount) public view returns (uint256) {
        return wethAmount * qePriceX18 / WAD;
    }

    function quoteUsdcToEth(uint256 usdcAmount) public view returns (uint256) {
        return usdcAmount * WAD / qePriceX18;
    }

    /// @notice Mint a synthetic sUSDC claim against WETH routed into the ETH bridge.
    /// This is accounting only; no canonical USDC is created here.
    function issueUsdcClaimFromEth(uint256 wethAmount) external onlyPump returns (uint256 claimUsd) {
        claimUsd = quoteEthToUsdc(wethAmount);
        debtUsd += claimUsd;
        issuedUsd += claimUsd;
        emit SyntheticIssued(msg.sender, claimUsd);
    }

    /// @notice Mint a synthetic sETH-equivalent claim against USDC routed into the USDC bridge.
    /// debtUsd remains denominated in USDC-equivalent units.
    function issueEthClaimFromUsdc(uint256 usdcAmount) external onlyPump returns (uint256 wethClaim) {
        wethClaim = quoteUsdcToEth(usdcAmount);
        debtUsd += usdcAmount;
        issuedUsd += usdcAmount;
        emit SyntheticIssued(msg.sender, usdcAmount);
    }

    /// @notice QT neutralizes the current internal monetary impulse.
    /// This changes no canonical token balance.
    function qtBurnAll() external onlyPump returns (uint256 burned) {
        burned = debtUsd;
        debtUsd = 0;
        burnedUsd += burned;
        emit QTBurn(msg.sender, burned);
    }
}
