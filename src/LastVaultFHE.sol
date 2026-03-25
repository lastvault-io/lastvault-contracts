// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {FHE, euint128, eaddress, ebool, InEaddress, InEuint128} from "@fhenixprotocol/cofhe-contracts/FHE.sol";

/**
 * @title LastVaultFHE
 * @author Divara Technology Inc. (lastvault.io)
 * @notice Dead-Man's Switch for digital inheritance — powered by Fhenix FHE.
 * @dev Unlike the plaintext version, this contract hides:
 *      - The heir's address (eaddress — invisible on-chain)
 *      - The encrypted payload (euint128 x2 — 256-bit vault key, FHE-protected)
 *
 *  Privacy guarantees:
 *    - No one can see WHO the heir is by reading on-chain state
 *    - No one can read the payload, even if they have direct chain access
 *    - Only the verified heir can decrypt the payload, and only after timeout
 *
 *  Flow:
 *    1. Owner deploys with encrypted heir address + encrypted payload
 *    2. Owner calls ping() periodically (resets dead-man's switch)
 *    3. After timeout, heir calls initiateClaim() with their encrypted address
 *    4. FHE eq-check runs on-chain; result goes to async decryption
 *    5. Threshold network decrypts the boolean; heir calls finalizeClaim()
 *    6. If verified, heir gets FHE.allow() on payload — can decrypt via SDK
 *
 *  Security fixes (v1.1 — 2026-03-24):
 *    - [H-05] Reentrancy: Checks-Effects-Interactions pattern in finalizeClaim()
 *    - [H-06] Ownership: 2-step ownership transfer (transferOwnership + acceptOwnership)
 *    - [M-05] Oracle attack: MAX_CLAIM_ATTEMPTS = 3 to prevent heir address brute-force
 *    - [M-06] Timestamp: Minimum timeout period >= 1 day
 *    - [L-01] Gas: timeoutPeriod marked immutable
 *    - [L-02] Event: Pinged emitted in updatePayload()
 *
 *  Fhenix Buildathon — Wave 1 submission (Mar 21-28, 2026)
 */
contract LastVaultFHE {
    // ============ State ============

    address public owner;
    address public pendingOwner;

    /// @dev Heir address encrypted — hidden from chain observers
    eaddress private encryptedHeir;

    /// @dev Vault payload split into two 128-bit FHE-encrypted chunks
    ///      Together they hold a 256-bit master key or IPFS CID
    euint128 private payloadHi;
    euint128 private payloadLo;

    /// @dev Plaintext timestamps — needed for block.timestamp comparison
    uint256 public lastPingTimestamp;
    uint256 public immutable timeoutPeriod;

    /// @dev Claim state machine
    enum ClaimState { Idle, Initiated, Verified }
    ClaimState public claimState;

    /// @dev Stored ebool from the FHE eq-check, pending async decryption
    ebool private heirVerificationResult;

    /// @dev The address that initiated the claim (for granting access)
    address public claimant;

    /// @dev Claim attempt tracking — prevents heir address oracle attack
    uint256 public claimAttempts;
    uint256 public constant MAX_CLAIM_ATTEMPTS = 3;

    // ============ Events ============

    event Pinged(address indexed owner, uint256 timestamp);
    event HeirUpdated(uint256 timestamp);
    event PayloadUpdated(uint256 timestamp);
    event ClaimInitiated(address indexed claimant, uint256 timestamp);
    event ClaimVerified(address indexed heir, uint256 timestamp);
    event ClaimRejected(uint256 timestamp);
    event OwnershipTransferStarted(address indexed previousOwner, address indexed newOwner);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    // ============ Modifiers ============

    modifier onlyOwner() {
        require(msg.sender == owner, "LastVault: Not the owner");
        _;
    }

    modifier notClaimed() {
        require(claimState != ClaimState.Verified, "LastVault: Already claimed");
        _;
    }

    // ============ Constructor ============

    /**
     * @param _timeoutPeriod  Seconds before heir can claim (min 1 day, e.g. 7776000 = 90 days)
     * @param _encryptedHeir  Client-encrypted heir address (via CoFHE SDK)
     * @param _payloadHi      Upper 128 bits of encrypted vault key
     * @param _payloadLo      Lower 128 bits of encrypted vault key
     */
    constructor(
        uint256 _timeoutPeriod,
        InEaddress memory _encryptedHeir,
        InEuint128 memory _payloadHi,
        InEuint128 memory _payloadLo
    ) {
        require(_timeoutPeriod >= 1 days, "LastVault: Timeout must be >= 1 day");

        owner = msg.sender;
        timeoutPeriod = _timeoutPeriod;
        lastPingTimestamp = block.timestamp;
        claimState = ClaimState.Idle;

        // Store encrypted heir — nobody can read this from chain state
        encryptedHeir = FHE.asEaddress(_encryptedHeir);
        FHE.allowThis(encryptedHeir);

        // Store encrypted payload chunks
        payloadHi = FHE.asEuint128(_payloadHi);
        FHE.allowThis(payloadHi);

        payloadLo = FHE.asEuint128(_payloadLo);
        FHE.allowThis(payloadLo);
    }

    // ============ Owner Functions ============

    /// @notice Reset the dead-man's switch timer
    function ping() external onlyOwner notClaimed {
        lastPingTimestamp = block.timestamp;
        emit Pinged(msg.sender, block.timestamp);
    }

    /// @notice Change the designated heir (encrypted)
    function updateHeir(InEaddress calldata _newHeir) external onlyOwner notClaimed {
        encryptedHeir = FHE.asEaddress(_newHeir);
        FHE.allowThis(encryptedHeir);
        emit HeirUpdated(block.timestamp);
    }

    /// @notice Update the encrypted vault payload (e.g. key rotation)
    function updatePayload(
        InEuint128 calldata _newHi,
        InEuint128 calldata _newLo
    ) external onlyOwner notClaimed {
        payloadHi = FHE.asEuint128(_newHi);
        FHE.allowThis(payloadHi);

        payloadLo = FHE.asEuint128(_newLo);
        FHE.allowThis(payloadLo);

        lastPingTimestamp = block.timestamp; // reset timer on update
        emit PayloadUpdated(block.timestamp);
        emit Pinged(msg.sender, block.timestamp); // [L-02] explicit ping event
    }

    /// @notice Owner can cancel a pending claim (before finalization)
    function cancelClaim() external onlyOwner notClaimed {
        require(claimState == ClaimState.Initiated, "LastVault: No pending claim");
        claimState = ClaimState.Idle;
        claimant = address(0);
    }

    // ============ Ownership Transfer (2-step) ============

    /// @notice Start ownership transfer — new owner must call acceptOwnership()
    function transferOwnership(address _newOwner) external onlyOwner {
        require(_newOwner != address(0), "LastVault: Invalid address");
        pendingOwner = _newOwner;
        emit OwnershipTransferStarted(owner, _newOwner);
    }

    /// @notice Complete ownership transfer — must be called by pending owner
    function acceptOwnership() external {
        require(msg.sender == pendingOwner, "LastVault: Not pending owner");
        emit OwnershipTransferred(owner, pendingOwner);
        owner = pendingOwner;
        pendingOwner = address(0);
    }

    // ============ Heir Claim Flow (2-phase) ============

    /**
     * @notice Phase 1: Heir initiates claim by submitting their encrypted address.
     *         The contract performs an FHE equality check against the stored heir.
     *         The result (ebool) is marked for async decryption by the threshold network.
     *         Limited to MAX_CLAIM_ATTEMPTS to prevent heir address oracle attack.
     * @param _myAddress  The claimant's address, encrypted client-side via CoFHE SDK
     */
    function initiateClaim(InEaddress calldata _myAddress) external {
        require(
            block.timestamp > lastPingTimestamp + timeoutPeriod,
            "LastVault: Timeout not reached"
        );
        require(claimState == ClaimState.Idle, "LastVault: Claim already in progress");
        require(claimAttempts < MAX_CLAIM_ATTEMPTS, "LastVault: Max claim attempts reached");

        claimAttempts++;
        claimant = msg.sender;
        claimState = ClaimState.Initiated;

        // FHE equality check — runs on encrypted data, no plaintext leaks
        eaddress claimerEncrypted = FHE.asEaddress(_myAddress);
        FHE.allowThis(claimerEncrypted);

        heirVerificationResult = FHE.eq(claimerEncrypted, encryptedHeir);
        FHE.allowThis(heirVerificationResult);

        // Mark the boolean for public decryption by threshold network
        FHE.allowPublic(heirVerificationResult);

        emit ClaimInitiated(msg.sender, block.timestamp);
    }

    /**
     * @notice Phase 2: After the threshold network decrypts the ebool,
     *         the claimant publishes the result and (if true) gets payload access.
     *         Follows Checks-Effects-Interactions pattern to prevent reentrancy.
     * @param _isHeir     The decrypted boolean from threshold network
     * @param _signature  Threshold signature proving authentic decryption
     */
    function finalizeClaim(bool _isHeir, bytes memory _signature) external {
        // CHECKS
        require(claimState == ClaimState.Initiated, "LastVault: No pending claim");
        require(msg.sender == claimant, "LastVault: Not the claimant");
        require(
            block.timestamp > lastPingTimestamp + timeoutPeriod,
            "LastVault: Timeout not reached"
        );

        // Cache claimant before state changes
        address verifiedClaimant = claimant;

        // EFFECTS — state changes BEFORE external calls
        if (!_isHeir) {
            claimState = ClaimState.Idle;
            claimant = address(0);
        } else {
            claimState = ClaimState.Verified;
        }

        // INTERACTIONS — external calls AFTER state changes
        FHE.publishDecryptResult(heirVerificationResult, _isHeir, _signature);

        if (!_isHeir) {
            emit ClaimRejected(block.timestamp);
            return;
        }

        FHE.allow(payloadHi, verifiedClaimant);
        FHE.allow(payloadLo, verifiedClaimant);

        emit ClaimVerified(verifiedClaimant, block.timestamp);
    }

    // ============ View Helpers ============

    /// @notice Check if the dead-man's switch has expired
    function isExpired() external view returns (bool) {
        return block.timestamp > lastPingTimestamp + timeoutPeriod;
    }

    /// @notice Seconds remaining until the switch expires (0 if already expired)
    function timeRemaining() external view returns (uint256) {
        uint256 deadline = lastPingTimestamp + timeoutPeriod;
        if (block.timestamp >= deadline) return 0;
        return deadline - block.timestamp;
    }

    /// @notice Remaining claim attempts before lockout
    function remainingClaimAttempts() external view returns (uint256) {
        if (claimAttempts >= MAX_CLAIM_ATTEMPTS) return 0;
        return MAX_CLAIM_ATTEMPTS - claimAttempts;
    }
}
