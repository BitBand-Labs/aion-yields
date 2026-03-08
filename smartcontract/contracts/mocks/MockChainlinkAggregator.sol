// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title MockChainlinkAggregator
/// @notice Configurable mock for Chainlink AggregatorV3Interface used in tests.
contract MockChainlinkAggregator {
    int256 private _answer;
    uint256 private _updatedAt;
    uint8 private _decimals;
    uint80 private _roundId;
    bool private _shouldRevert;

    constructor(int256 initialAnswer, uint8 decimals_) {
        _answer = initialAnswer;
        _updatedAt = block.timestamp;
        _decimals = decimals_;
        _roundId = 1;
    }

    function setAnswer(int256 answer) external {
        _answer = answer;
        _updatedAt = block.timestamp;
        _roundId++;
    }

    function setAnswerWithTimestamp(int256 answer, uint256 updatedAt) external {
        _answer = answer;
        _updatedAt = updatedAt;
        _roundId++;
    }

    function setShouldRevert(bool shouldRevert) external {
        _shouldRevert = shouldRevert;
    }

    function setUpdatedAt(uint256 updatedAt) external {
        _updatedAt = updatedAt;
    }

    function latestRoundData()
        external
        view
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        )
    {
        require(!_shouldRevert, "MockAggregator: forced revert");
        return (_roundId, _answer, _updatedAt, _updatedAt, _roundId);
    }

    function decimals() external view returns (uint8) {
        return _decimals;
    }
}
