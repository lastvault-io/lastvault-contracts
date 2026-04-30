// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {FHE, eaddress, euint8, euint64, ebool, InEaddress} from "@fhenixprotocol/cofhe-contracts/FHE.sol";

/**
 * @title SelectiveDisclosure
 * @author Divara Technology Inc. (lastvault.io)
 * @notice Enables auditors to verify the integrity of an inheritance event
 *         WITHOUT learning the heir's identity or the vault contents.
 *
 * @dev Wave 3 deliverable for the Fhenix Privacy-by-Design Buildathon.
 *
 *      THE PROBLEM:
 *        Estate planning often involves third parties (lawyers, notaries,
 *        regulators, executors) who must verify "the inheritance was
 *        processed correctly" — but learning WHO inherited or WHAT they
 *        received would be a privacy breach.
 *
 *      TRADITIONAL APPROACHES FAIL:
 *        - Public ledger: full disclosure to the world
 *        - Permissioned chain: trust shifts to chain operators
 *        - ZK proofs: requires plaintext hash of identity (brute-forceable)
 *        - TEE: single point of trust
 *
 *      OUR APPROACH (FHE-NATIVE):
 *        The vault contract emits ENCRYPTED ATTESTATIONS at every state
 *        transition. Auditors are granted FHE permits (via ACL) to decrypt
 *        ONLY specific summary fields:
 *
 *          - "claim was finalized" (bool, decryptable)
 *          - "verification passed" (bool, decryptable)
 *          - "timestamp of claim" (encrypted, may or may not be disclosable)
 *
 *        But NOT:
 *          - Heir identity (eaddress, never disclosed to auditor)
 *          - Vault payload (euint128, never disclosed)
 *          - Weight contributions (euint8, never disclosed)
 *
 *      THIS IS NOT POSSIBLE WITHOUT FHE.
 *      In a transparent chain, "auditor sees claim happened" implies
 *      "auditor sees heir address." With FHE, the contract can prove
 *      properties of encrypted data to specific parties without revealing
 *      the underlying data.
 *
 *      USAGE:
 *        1. Inheritance contract calls `attestEvent()` after each lifecycle
 *           event (claim initiated, claim verified, etc.)
 *        2. Owner pre-registers auditor addresses with `grantAuditorPermit()`
 *        3. Auditors call `getAttestation()` and decrypt allowed fields
 *           via threshold network using their FHE permit
 *        4. Auditors can prove integrity to regulators without
 *           ever learning identities
 */
contract SelectiveDisclosure {
    // ============ State ============

    address public owner;

    /// @dev Plaintext set of authorized auditors (registered by owner)
    mapping(address => bool) public auditors;
    address[] public auditorList;

    /// @dev An attestation describes a vault event without leaking sensitive data
    struct Attestation {
        uint256 timestamp;          // Plaintext (acceptable: knowing WHEN is OK)
        AttestationKind kind;       // Plaintext (event type is observable)
        ebool verified;             // Encrypted: did verification pass?
        eaddress involvedParty;     // Encrypted: who was involved (only owner+auditors with permit can decrypt)
        bytes32 contextHash;        // Plaintext keccak hash of contextual metadata
    }

    enum AttestationKind {
        VaultDeployed,
        HeirAdded,
        HeirRemoved,
        Pinged,
        ClaimInitiated,
        ClaimVerified,
        ClaimRejected,
        PayloadUpdated,
        ThresholdUpdated
    }

    Attestation[] public attestations;

    // ============ Events ============

    event AuditorRegistered(address indexed auditor);
    event AuditorRemoved(address indexed auditor);
    event AttestationRecorded(uint256 indexed idx, AttestationKind kind, uint256 timestamp);
    event PermitGranted(address indexed auditor, uint256 attestationIdx);

    // ============ Modifiers ============

    modifier onlyOwner() {
        require(msg.sender == owner, "Disclosure: not owner");
        _;
    }

    modifier onlyAuditor() {
        require(auditors[msg.sender], "Disclosure: not auditor");
        _;
    }

    constructor(address _owner) {
        owner = _owner;
    }

    // ============ Auditor Management ============

    function grantAuditorPermit(address _auditor) external onlyOwner {
        require(_auditor != address(0), "Disclosure: zero addr");
        require(!auditors[_auditor], "Disclosure: already auditor");
        auditors[_auditor] = true;
        auditorList.push(_auditor);
        emit AuditorRegistered(_auditor);
    }

    function revokeAuditorPermit(address _auditor) external onlyOwner {
        require(auditors[_auditor], "Disclosure: not auditor");
        auditors[_auditor] = false;
        // Remove from list (swap with last, pop)
        for (uint256 i = 0; i < auditorList.length; i++) {
            if (auditorList[i] == _auditor) {
                auditorList[i] = auditorList[auditorList.length - 1];
                auditorList.pop();
                break;
            }
        }
        emit AuditorRemoved(_auditor);
    }

    function auditorCount() external view returns (uint256) {
        return auditorList.length;
    }

    // ============ Attestation Recording ============

    /**
     * @notice Record an encrypted attestation. Called by the vault contract
     *         (or owner) after each lifecycle event.
     *
     *         The encrypted fields are stored with ACL permissions:
     *           - allowThis: the SelectiveDisclosure contract can compute on them
     *           - allow(auditor): each registered auditor can request decryption
     *
     *         The auditor's view permit lets them decrypt ONLY the fields
     *         this contract has explicitly authorized.
     *
     * @param _kind        Type of event (plaintext)
     * @param _verified    Encrypted boolean: did the event succeed?
     * @param _involvedParty Encrypted address of the party involved
     *                       (e.g., the heir on ClaimVerified — but only auditor sees,
     *                        and only via FHE permit)
     * @param _contextHash Hash of additional context (off-chain encrypted data ref)
     */
    function attestEvent(
        AttestationKind _kind,
        ebool _verified,
        eaddress _involvedParty,
        bytes32 _contextHash
    ) external onlyOwner returns (uint256 idx) {
        idx = attestations.length;

        // Grant ACL access: this contract + all current auditors
        FHE.allowThis(_verified);
        FHE.allowThis(_involvedParty);

        // Note: auditor list can grow over time. New auditors registered
        // AFTER this attestation will need to call `requestPermit(idx)` to
        // be granted access retroactively (gas-efficient — only on demand).
        for (uint256 i = 0; i < auditorList.length; i++) {
            // Verified status: decryptable by auditors (this is the
            // "did the event succeed" summary they need for compliance)
            FHE.allow(_verified, auditorList[i]);
            // Involved party: decryptable by auditors ONLY if owner explicitly
            // grants this permit per-attestation. By default, identity stays
            // hidden even from auditors. Owner can override via `discloseIdentity()`.
        }

        attestations.push(Attestation({
            timestamp: block.timestamp,
            kind: _kind,
            verified: _verified,
            involvedParty: _involvedParty,
            contextHash: _contextHash
        }));

        emit AttestationRecorded(idx, _kind, block.timestamp);
    }

    /**
     * @notice Owner can selectively disclose the involved-party identity for
     *         a specific attestation to a specific auditor (e.g., for legal
     *         compliance after a court order).
     *
     *         Without this call, identity remains encrypted even to auditors.
     */
    function discloseIdentity(uint256 _idx, address _auditor) external onlyOwner {
        require(_idx < attestations.length, "Disclosure: invalid idx");
        require(auditors[_auditor], "Disclosure: not auditor");

        FHE.allow(attestations[_idx].involvedParty, _auditor);
    }

    /**
     * @notice An auditor can request retroactive permit on an old attestation
     *         (for the verified bool only — identity still requires explicit
     *         disclosure).
     */
    function requestPermit(uint256 _idx) external onlyAuditor {
        require(_idx < attestations.length, "Disclosure: invalid idx");
        FHE.allow(attestations[_idx].verified, msg.sender);
        emit PermitGranted(msg.sender, _idx);
    }

    // ============ View / Audit Helpers ============

    function attestationCount() external view returns (uint256) {
        return attestations.length;
    }

    /**
     * @notice Returns the plaintext metadata of an attestation. Encrypted
     *         fields must be decrypted via threshold network using auditor permits.
     */
    function getAttestationMeta(uint256 _idx)
        external
        view
        returns (uint256 timestamp, AttestationKind kind, bytes32 contextHash)
    {
        require(_idx < attestations.length, "Disclosure: invalid idx");
        Attestation storage a = attestations[_idx];
        return (a.timestamp, a.kind, a.contextHash);
    }

    /**
     * @notice Returns the encrypted handles for an attestation. Auditors
     *         use these handles in client-side decryption calls via the SDK.
     */
    function getEncryptedFields(uint256 _idx)
        external
        view
        returns (ebool verified, eaddress involvedParty)
    {
        require(_idx < attestations.length, "Disclosure: invalid idx");
        Attestation storage a = attestations[_idx];
        return (a.verified, a.involvedParty);
    }

    // ============ Compound Query (encrypted) ============

    /**
     * @notice Compute, in ciphertext, the count of "verified=true" attestations
     *         of a specific kind. Auditors can decrypt this aggregate without
     *         learning which individual events succeeded/failed.
     *
     *         Returns an encrypted euint8 (saturating at 255 — for >255
     *         events of the same kind, use multiple queries).
     */
    function countVerifiedOfKind(AttestationKind _kind)
        external
        returns (euint8 count)
    {
        euint8 zero = FHE.asEuint8(uint256(0));
        FHE.allowThis(zero);
        euint8 one = FHE.asEuint8(uint256(1));
        FHE.allowThis(one);

        count = zero;
        FHE.allowThis(count);

        for (uint256 i = 0; i < attestations.length; i++) {
            if (attestations[i].kind != _kind) continue;
            // Add 1 if verified, 0 otherwise — all in ciphertext
            euint8 contribution = FHE.select(attestations[i].verified, one, zero);
            FHE.allowThis(contribution);
            count = FHE.add(count, contribution);
            FHE.allowThis(count);
        }

        // Grant decryption to all current auditors
        for (uint256 i = 0; i < auditorList.length; i++) {
            FHE.allow(count, auditorList[i]);
        }
        FHE.allowPublic(count);
    }
}
