// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../ace/IPolicy.sol";

contract MockPolicy is IPolicy {
    bool public active = true;
    bool public shouldPass = true;
    string public failReason = "Mock policy failed";
    string public name = "MockPolicy";

    bool public postExecutionCalled;
    address public lastCaller;

    function setActive(bool _active) external {
        active = _active;
    }

    function setShouldPass(bool _shouldPass) external {
        shouldPass = _shouldPass;
    }

    function setFailReason(string calldata _reason) external {
        failReason = _reason;
    }

    function validate(
        address caller,
        address,
        bytes4,
        bytes calldata
    ) external view override returns (bool valid, string memory reason) {
        if (!shouldPass) return (false, failReason);
        return (true, "");
    }

    function postExecutionUpdate(
        address caller,
        address,
        bytes4,
        bytes calldata
    ) external override {
        postExecutionCalled = true;
        lastCaller = caller;
    }

    function policyName() external view override returns (string memory) {
        return name;
    }

    function isActive() external view override returns (bool) {
        return active;
    }
}
