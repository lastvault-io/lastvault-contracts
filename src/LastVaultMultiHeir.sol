// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {FHE, euint8, euint64, euint128, eaddress, ebool, InEuint8, InEuint64, InEuint128, InEaddress} from "@fhenixprotocol/cofhe-contracts/FHE.sol";
import {EncryptedAllowlist} from "./EncryptedAllowlist.sol";

/**
 * @title LastVaultMultiHeir
 * @author Divara Technology Inc. (lastvault.io)
 * @notice Multi-heir threshold inheritance with encrypted weights and a hidden threshold.
 *
 * @dev Wave 3 of the Fhenix Privacy-by-Design Buildathon. This contract extends
 *      the Wave 2 single-heir model to support multiple heirs, each with an
 *      encrypted "weight" (e.g., percentage share). Recovery requires the sum
 *      of presenting heirs' weights to meet or exceed an ENCRYPTED THRESHOLD.
 *
 *      KEY INNOVATIONS OVER WAVE 2:
 *
 *      1. Multi-heir array via EncryptedAllowlist primitive
 *         - eaddress[] storage, identity matched in ciphertext via FHE.eq
 *         - List size is plaintext (acceptable: knowing "there are 5 heirs"
 *           doesn't help an attacker who can't see WHO they are)
 *
 *      2. Encrypted weights per heir (euint8)
 *         - Each heir has a hidden "share" (0-100)
 *         - Owner can configure: equal split, weighted, or sole-heir-with-backup
 *         - Observer sees N heirs but not their relative power
 *
 *      3. Hidden threshold (euint8)
 *         - The minimum sum of weights required for recovery is encrypted
 *         - Even insiders don't know if the threshold is "1" (any heir alone)
 *           or "60" (must coordinate)
 *         - Prevents threshold-knowledge attacks
 *
 *      4. Encrypted accumulation (FHE.add)
 *         - As heirs declare presence, their weights are summed in ciphertext
 *         - FHE.gte checks accumulated weight against hidden threshold
 *         - Compound boolean reveals only "threshold met" / "threshold not met"
 *
 *      USE CASES:
 *        - Family inheritance: 3 children, any 2 can claim (encrypted threshold)
 *        - Corporate treasury: 5 officers, weighted by seniority (CEO=40, CFO=30, etc.)
 *        - DAO recovery: 10 multisig members, 7-of-10 with hidden weights
 *        - Estate planning: spouse=80, children=20 each (any combo summing to 100)
 *
 *      The same FHE primitive (FHE.eq + FHE.add + FHE.gte) generalizes to any
 *      threshold-based encrypted access control.
 */
contract LastVaultMultiHeir {
    using EncryptedAllowlist for EncryptedAllowlist.List;

    // ============ Encrypted State ============

    address public owner;
    address public pendingOwner;

    /// @dev Encrypted heir allowlist (eaddress[])
    EncryptedAllowlist.List private _heirs;

    /// @dev Encrypted weights per heir (parallel to _heirs.entries)
    ///      weights[i] corresponds to _heirs.entries[i]
    euint8[] private _weights;

    /// @dev Encrypted recovery threshold (sum of weights required to claim)
    euint8 private _encryptedThreshold;

    /// @dev Encrypted vault payload (256-bit master key, split across two 128-bit chunks)
    euint128 private _payloadHi;
    euint128 private _payloadLo;

    /// @dev Encrypted last ping timestamp (W2 carry-over: no behavioral profiling)
    euint64 private _encryptedLastPing;

    /// @dev Encrypted timeout window (W2 carry-over)
    euint64 private _encryptedTimeout;

    uint256 public immutable timeoutPeriodPlaintext;

    // ============ Claim Session State ============

    /// @dev Tracks an in-progress recovery session (multiple heirs declaring)
    struct ClaimSession {
        bool active;
        address initiator;
        uint256 startedAt;
        // Accumulated encrypted weight from declared heirs
        euint8 accumulatedWeight;
        // Set of addresses that have already declared in this session
        // (plaintext set is fine — "Alice declared" is observable but
        // her ENCRYPTED weight contribution is not)
        mapping(address => bool) hasDeclared;
        address[] declarants;
        // Final compound verification (set once threshold is reached)
        ebool thresholdMet;
        bool finalized;
    }

    ClaimSession private _session;

    // ============ Events ============

    event HeirAdded(uint256 idx);
    event HeirRemoved(uint256 idx);
    event Pinged(uint256 timestamp);
    event ClaimSessionStarted(address indexed initiator, uint256 timestamp);
    event HeirDeclared(address indexed heir, uint256 declarantIndex);
    event ThresholdReached(uint256 timestamp);
    event ClaimFinalized(bool verified, uint256 timestamp);
    event ClaimSessionAborted(uint256 timestamp);
    event PayloadUpdated();
    event ThresholdUpdated();

    // ============ Modifiers ============

    modifier onlyOwner() {
        require(msg.sender == owner, "MultiHeir: not owner");
        _;
    }

    modifier sessionInactive() {
        require(!_session.active, "MultiHeir: session active");
        _;
    }

    // ============ Constructor ============

    /**
     * @param _timeoutPeriod      Plaintext timeout (used as min for safety)
     * @param _payloadHiInput     Encrypted upper 128 bits of master key
     * @param _payloadLoInput     Encrypted lower 128 bits
     * @param _encryptedTimeoutIn Encrypted timeout window (private DMS comparison)
     * @param _thresholdIn        Encrypted threshold (sum of weights required)
     */
    constructor(
        uint256 _timeoutPeriod,
        InEuint128 memory _payloadHiInput,
        InEuint128 memory _payloadLoInput,
        InEuint64 memory _encryptedTimeoutIn,
        InEuint8 memory _thresholdIn
    ) {
        require(_timeoutPeriod >= 1 days, "MultiHeir: timeout >= 1 day");
        owner = msg.sender;
        timeoutPeriodPlaintext = _timeoutPeriod;

        _payloadHi = FHE.asEuint128(_payloadHiInput);
        FHE.allowThis(_payloadHi);
        _payloadLo = FHE.asEuint128(_payloadLoInput);
        FHE.allowThis(_payloadLo);

        _encryptedLastPing = FHE.asEuint64(uint256(block.timestamp));
        FHE.allowThis(_encryptedLastPing);

        _encryptedTimeout = FHE.asEuint64(_encryptedTimeoutIn);
        FHE.allowThis(_encryptedTimeout);

        _encryptedThreshold = FHE.asEuint8(_thresholdIn);
        FHE.allowThis(_encryptedThreshold);
    }

    // ============ Owner: Heir Management ============

    /**
     * @notice Add a heir with an encrypted weight.
     * @param _heir   Encrypted heir address (client-side via @cofhe/sdk)
     * @param _weight Encrypted weight (0-100 conventional, but any euint8 OK)
     */
    function addHeir(InEaddress calldata _heir, InEuint8 calldata _weight)
        external
        onlyOwner
        sessionInactive
    {
        _heirs.add(_heir);

        euint8 w = FHE.asEuint8(_weight);
        FHE.allowThis(w);
        _weights.push(w);

        // Reset DMS timer
        _encryptedLastPing = FHE.asEuint64(uint256(block.timestamp));
        FHE.allowThis(_encryptedLastPing);

        emit HeirAdded(_heirs.size() - 1);
    }

    /**
     * @notice Remove a heir by index. Note: order changes (swap-with-last).
     */
    function removeHeir(uint256 idx) external onlyOwner sessionInactive {
        require(idx < _heirs.size(), "MultiHeir: out of bounds");

        // Match the swap-with-last in the library
        uint256 last = _weights.length - 1;
        if (idx != last) {
            _weights[idx] = _weights[last];
        }
        _weights.pop();

        _heirs.remove(idx);

        _encryptedLastPing = FHE.asEuint64(uint256(block.timestamp));
        FHE.allowThis(_encryptedLastPing);

        emit HeirRemoved(idx);
    }

    /**
     * @notice Update the recovery threshold (encrypted).
     */
    function updateThreshold(InEuint8 calldata _newThreshold)
        external
        onlyOwner
        sessionInactive
    {
        _encryptedThreshold = FHE.asEuint8(_newThreshold);
        FHE.allowThis(_encryptedThreshold);

        _encryptedLastPing = FHE.asEuint64(uint256(block.timestamp));
        FHE.allowThis(_encryptedLastPing);

        emit ThresholdUpdated();
    }

    /**
     * @notice Update the encrypted vault payload (key rotation).
     */
    function updatePayload(InEuint128 calldata _hi, InEuint128 calldata _lo)
        external
        onlyOwner
        sessionInactive
    {
        _payloadHi = FHE.asEuint128(_hi);
        FHE.allowThis(_payloadHi);
        _payloadLo = FHE.asEuint128(_lo);
        FHE.allowThis(_payloadLo);

        _encryptedLastPing = FHE.asEuint64(uint256(block.timestamp));
        FHE.allowThis(_encryptedLastPing);

        emit PayloadUpdated();
    }

    // ============ Owner: Liveness ============

    function ping() external onlyOwner sessionInactive {
        _encryptedLastPing = FHE.asEuint64(uint256(block.timestamp));
        FHE.allowThis(_encryptedLastPing);
        emit Pinged(block.timestamp);
    }

    /**
     * @notice Owner can abort any in-progress claim session.
     */
    function abortClaimSession() external onlyOwner {
        require(_session.active, "MultiHeir: no active session");
        _resetSession();
        emit ClaimSessionAborted(block.timestamp);
    }

    // ============ Recovery Flow ============

    /**
     * @notice Phase 1: Any heir can start a recovery session.
     *
     *  Encrypted timeout check happens here. If the timeout has not passed,
     *  the session aborts via FHE.select silent gating (no info leak).
     *
     * @param _myAddress  Caller's address, encrypted client-side.
     */
    function startClaimSession(InEaddress calldata _myAddress) external sessionInactive {
        require(_heirs.size() > 0, "MultiHeir: no heirs configured");

        // Encrypted timeout check (W2 pattern carried forward)
        euint64 currentTime = FHE.asEuint64(uint256(block.timestamp));
        FHE.allowThis(currentTime);

        euint64 elapsed = FHE.sub(currentTime, _encryptedLastPing);
        FHE.allowThis(elapsed);

        ebool timeoutReached = FHE.gte(elapsed, _encryptedTimeout);
        FHE.allowThis(timeoutReached);

        // Verify caller is a known heir (encrypted membership check)
        ebool isHeir = _heirs.isAllowed(_myAddress);
        FHE.allowThis(isHeir);

        // Caller's encrypted starting weight contribution
        // Find the index of the matching heir (in ciphertext) — for the initiator
        // we accumulate their weight into the session.
        // Implementation: compute, for each heir i,
        //   contribution_i = select(eq(query, heirs[i]), weights[i], 0)
        // Then sum: total = add(contribution_0, contribution_1, ..., contribution_n-1)
        euint8 initiatorWeight = _computeWeightContribution(_myAddress);

        // Initialize session
        _session.active = true;
        _session.initiator = msg.sender;
        _session.startedAt = block.timestamp;
        _session.accumulatedWeight = initiatorWeight;
        FHE.allowThis(_session.accumulatedWeight);
        _session.hasDeclared[msg.sender] = true;
        _session.declarants.push(msg.sender);
        _session.finalized = false;

        // Mark the timeout-and-membership precondition; we'll AND it with
        // the final threshold check at finalize time so rejected sessions
        // leak nothing about WHICH condition failed.
        ebool precondition = FHE.and(timeoutReached, isHeir);
        FHE.allowThis(precondition);

        // Combine with current accumulated threshold-check (against single-heir contribution)
        ebool thresholdMetNow = FHE.gte(initiatorWeight, _encryptedThreshold);
        FHE.allowThis(thresholdMetNow);

        _session.thresholdMet = FHE.and(precondition, thresholdMetNow);
        FHE.allowThis(_session.thresholdMet);

        emit ClaimSessionStarted(msg.sender, block.timestamp);
        emit HeirDeclared(msg.sender, 0);
    }

    /**
     * @notice Phase 2: Additional heirs declare presence to accumulate weight.
     *
     *  Each call adds the declarant's encrypted weight to the running total
     *  (in ciphertext). The threshold check is recomputed via FHE.gte.
     */
    function declareHeir(InEaddress calldata _myAddress) external {
        require(_session.active, "MultiHeir: no active session");
        require(!_session.hasDeclared[msg.sender], "MultiHeir: already declared");

        // Verify membership (encrypted)
        ebool isHeir = _heirs.isAllowed(_myAddress);
        FHE.allowThis(isHeir);

        // Compute this declarant's encrypted weight contribution
        euint8 contribution = _computeWeightContribution(_myAddress);

        // Add to accumulator (ciphertext)
        _session.accumulatedWeight = FHE.add(_session.accumulatedWeight, contribution);
        FHE.allowThis(_session.accumulatedWeight);

        _session.hasDeclared[msg.sender] = true;
        _session.declarants.push(msg.sender);

        // Re-evaluate threshold check
        ebool thresholdMetNow = FHE.gte(_session.accumulatedWeight, _encryptedThreshold);
        FHE.allowThis(thresholdMetNow);

        // Combine with membership AND existing precondition (from session start)
        // Note: timeout was checked at session start; we maintain the AND chain.
        ebool combined = FHE.and(thresholdMetNow, isHeir);
        FHE.allowThis(combined);

        _session.thresholdMet = FHE.and(_session.thresholdMet, combined);
        FHE.allowThis(_session.thresholdMet);

        emit HeirDeclared(msg.sender, _session.declarants.length - 1);
    }

    /**
     * @notice Phase 3: Submit decrypted threshold result. If true, payload
     *         access is granted to the session initiator.
     */
    function finalizeClaim(bool _verified, bytes memory _signature) external {
        require(_session.active, "MultiHeir: no active session");
        require(!_session.finalized, "MultiHeir: already finalized");
        require(msg.sender == _session.initiator, "MultiHeir: not initiator");

        address initiator = _session.initiator;

        FHE.publishDecryptResult(_session.thresholdMet, _verified, _signature);

        if (_verified) {
            // Threshold met — grant payload access to the initiator
            FHE.allow(_payloadHi, initiator);
            FHE.allow(_payloadLo, initiator);
            emit ThresholdReached(block.timestamp);
        }

        _session.finalized = true;
        emit ClaimFinalized(_verified, block.timestamp);

        // Reset session whether verified or not (failed = back to idle)
        _resetSession();
    }

    // ============ Internal Helpers ============

    /**
     * @dev Compute the encrypted weight contribution for a query address.
     *      For each heir i:
     *        contribution_i = FHE.select(eq(query, heir_i), weight_i, 0)
     *      Sum all contributions in ciphertext.
     *
     *      If the query address matches no heir, the sum is 0. If it matches
     *      exactly one (the expected case), the sum is that heir's weight.
     */
    function _computeWeightContribution(InEaddress calldata _addr)
        internal
        returns (euint8)
    {
        eaddress queryEnc = FHE.asEaddress(_addr);
        FHE.allowThis(queryEnc);

        euint8 zero = FHE.asEuint8(uint256(0));
        FHE.allowThis(zero);

        euint8 total = zero;
        FHE.allowThis(total);

        uint256 n = _heirs.size();
        for (uint256 i = 0; i < n; i++) {
            ebool match_i = FHE.eq(queryEnc, _heirs.entryAt(i));
            FHE.allowThis(match_i);

            // Conditional contribution: weight if match, 0 otherwise
            euint8 contrib = FHE.select(match_i, _weights[i], zero);
            FHE.allowThis(contrib);

            total = FHE.add(total, contrib);
            FHE.allowThis(total);
        }

        return total;
    }

    function _resetSession() internal {
        // Clear declarants set
        for (uint256 i = 0; i < _session.declarants.length; i++) {
            _session.hasDeclared[_session.declarants[i]] = false;
        }
        delete _session.declarants;
        _session.active = false;
        _session.initiator = address(0);
        _session.startedAt = 0;
        _session.finalized = false;
    }

    // ============ View Helpers ============

    function heirCount() external view returns (uint256) {
        return _heirs.size();
    }

    function isSessionActive() external view returns (bool) {
        return _session.active;
    }

    function sessionInfo()
        external
        view
        returns (address initiator, uint256 startedAt, uint256 declarantCount, bool finalized)
    {
        return (_session.initiator, _session.startedAt, _session.declarants.length, _session.finalized);
    }

    function timeoutPeriod() external view returns (uint256) {
        return timeoutPeriodPlaintext;
    }

    // ============ Ownership Transfer ============

    function transferOwnership(address _newOwner) external onlyOwner {
        require(_newOwner != address(0), "MultiHeir: invalid address");
        pendingOwner = _newOwner;
    }

    function acceptOwnership() external {
        require(msg.sender == pendingOwner, "MultiHeir: not pending owner");
        owner = pendingOwner;
        pendingOwner = address(0);
    }
}
