// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/**
 * @title ReentrancyGuard (minimal, no external dependencies)
 * @notice Single-slot mutex preventing reentrant calls on functions marked
 *         with the `nonReentrant` modifier.
 *
 * @dev Designed as a defence-in-depth layer for LastVault FHE contracts. The
 *      contracts already follow Checks-Effects-Interactions and FHE precompile
 *      calls are not expected to re-enter, but Slither flagged the pattern
 *      and a future Fhenix runtime change could break the assumption. This
 *      adds a 1-bit storage flag and ~2.1k gas per call — cheap insurance.
 *
 *      Wave 5 hardening: see docs/SECURITY_AUDIT_W5.md
 */
abstract contract ReentrancyGuard {
    uint256 private constant _NOT_ENTERED = 1;
    uint256 private constant _ENTERED = 2;

    uint256 private _status;

    constructor() {
        _status = _NOT_ENTERED;
    }

    modifier nonReentrant() {
        require(_status == _NOT_ENTERED, "ReentrancyGuard: reentrant call");
        _status = _ENTERED;
        _;
        _status = _NOT_ENTERED;
    }
}
