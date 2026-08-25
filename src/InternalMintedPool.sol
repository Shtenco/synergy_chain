// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract InternalMintedPool {
    address public immutable owner;
    mapping(address => bool) public controller;

    uint256 public neutralPriceX18;
    uint256 public qePriceX18;
    uint256 public qeDebtUsdc6;
    uint256 public cumulativeSyntheticPnlUsdc6;

    event QEPrice(uint256 oldPriceX18, uint256 newPriceX18);
    event Impulse(uint256 syntheticPnlUsdc6, uint256 debtAfterUsdc6);
    event QT(uint256 burnedUsdc6);

    modifier onlyOwner() { require(msg.sender == owner, "OWNER"); _; }
    modifier onlyController() { require(controller[msg.sender], "CTRL"); _; }

    constructor(uint256 neutralPrice_) {
        require(neutralPrice_ > 0, "PRICE");
        owner = msg.sender;
        neutralPriceX18 = neutralPrice_;
        qePriceX18 = neutralPrice_;
    }

    function setController(address who, bool ok) external onlyOwner { controller[who] = ok; }

    function setQEPrice(uint256 newPriceX18) external onlyOwner {
        require(newPriceX18 > 0, "PRICE");
        uint256 old = qePriceX18;
        qePriceX18 = newPriceX18;
        emit QEPrice(old, newPriceX18);
    }

    function resetNeutral() external onlyOwner { qePriceX18 = neutralPriceX18; }

    function setNeutralPrice(uint256 newNeutralX18) external onlyOwner {
        require(newNeutralX18 > 0, "PRICE");
        neutralPriceX18 = newNeutralX18;
    }

    function recordImpulse(uint256 syntheticPnlUsdc6) external onlyController {
        if (syntheticPnlUsdc6 == 0) return;
        qeDebtUsdc6 += syntheticPnlUsdc6;
        cumulativeSyntheticPnlUsdc6 += syntheticPnlUsdc6;
        emit Impulse(syntheticPnlUsdc6, qeDebtUsdc6);
    }

    function qtBurnAll() external onlyController returns (uint256 burned) {
        burned = qeDebtUsdc6;
        qeDebtUsdc6 = 0;
        emit QT(burned);
    }
}
