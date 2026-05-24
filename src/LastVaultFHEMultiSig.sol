// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {FHE, euint8, euint128, eaddress, ebool, InEuint8, InEuint128, InEaddress} from "@fhenixprotocol/cofhe-contracts/FHE.sol";
import {EncryptedAllowlist} from "./EncryptedAllowlist.sol";
import {ReentrancyGuard} from "./utils/ReentrancyGuard.sol";

/**
 * @title LastVaultFHEMultiSig
 * @author Divara Technology Inc. (lastvault.io)
 * @notice Encrypted institutional multi-sig: signers + threshold are both hidden.
 *
 * @dev Wave 5 deliverable for the Fhenix Privacy-by-Design Buildathon.
 *      Extends the Wave 3 multi-heir threshold pattern to OWNER-side
 *      governance. Where LastVaultMultiHeir encrypts the heirs (claim path),
 *      this contract encrypts the SIGNERS (proposal-approval path).
 *
 *      Use case: a company keeps a LastVault FHE vault. Owner-side actions
 *      (ping, update heir, update payload, transfer ownership) require
 *      M-of-N approval — but the signer set and the threshold are both
 *      encrypted on-chain, so observers see only "there is a multi-sig"
 *      without learning who approves or what the quorum is.
 *
 *      Combined with W3 LastVaultMultiHeir (encrypted heirs), the two
 *      patterns form a complete institutional inheritance stack:
 *        - Encrypted owners (this contract)
 *        - Encrypted heirs (W3)
 *        - Encrypted threshold on both sides
 *        - Selective auditor disclosure (W3 SelectiveDisclosure)
 *
 *      Action types supported in v1:
 *        - PING               — owner liveness signal
 *        - UPDATE_HEIR        — change designated heir (encrypted)
 *        - UPDATE_PAYLOAD     — rotate vault payload (encrypted)
 *        - TRANSFER_OWNERSHIP — escape hatch if all signers are compromised
 *
 *      All actions go through the same propose -> approve -> finalize flow,
 *      with the encrypted accumulator + threshold check pattern proven
 *      in Wave 3.
 */
contract LastVaultFHEMultiSig is ReentrancyGuard {
    using EncryptedAllowlist for EncryptedAllowlist.List;

    // ============ State ============

    address public owner;
    address public pendingOwner;

    /// @dev Encrypted signers (via EncryptedAllowlist library)
    EncryptedAllowlist.List private _signers;

    /// @dev Per-signer encrypted weights (parallel to _signers.entries)
    euint8[] private _weights;

    /// @dev Encrypted approval threshold (sum of weights required)
    euint8 private _encryptedThreshold;

    /// @dev Action types
    enum ActionKind {
        Ping,
        UpdateHeir,
        UpdatePayload,
        TransferOwnership
    }

    /// @dev A proposal that signers can approve. Approvals accumulate
    ///      encrypted weights via FHE.add; threshold check via FHE.gte.
    struct Proposal {
        ActionKind kind;
        bytes payload;          // Plaintext action payload (e.g. new heir handle, etc.)
        uint256 proposedAt;
        address proposer;
        euint8 accumulatedWeight;
        ebool thresholdMet;
        mapping(address => bool) hasApproved;
        address[] approvers;
        bool executed;
        bool cancelled;
    }

    /// @dev Plaintext counter for proposal IDs (ID enumeration is OK — content is hidden)
    uint256 public proposalCount;
    mapping(uint256 => Proposal) private _proposals;

    /// @dev Bound vault contract this multi-sig controls
    address public vault;

    // ============ Events ============

    event SignerAdded(uint256 idx);
    event SignerRemoved(uint256 idx);
    event ThresholdUpdated();
    event VaultBound(address indexed vault);
    event ProposalCreated(uint256 indexed proposalId, ActionKind kind, address indexed proposer);
    event ProposalApproved(uint256 indexed proposalId, address indexed approver, uint256 approverCount);
    event ProposalThresholdMet(uint256 indexed proposalId);
    event ProposalFinalized(uint256 indexed proposalId, bool authorised);
    event ProposalCancelled(uint256 indexed proposalId);

    // ============ Modifiers ============

    modifier onlyOwner() {
        require(msg.sender == owner, "MultiSig: not owner");
        _;
    }

    modifier proposalActive(uint256 _id) {
        require(_id < proposalCount, "MultiSig: invalid proposal");
        require(!_proposals[_id].executed, "MultiSig: already executed");
        require(!_proposals[_id].cancelled, "MultiSig: already cancelled");
        _;
    }

    // ============ Constructor ============

    constructor(
        InEuint8 memory _thresholdIn
    ) {
        owner = msg.sender;
        _encryptedThreshold = FHE.asEuint8(_thresholdIn);
        FHE.allowThis(_encryptedThreshold);
    }

    // ============ Owner: signer management ============

    function addSigner(InEaddress calldata _signer, InEuint8 calldata _weight)
        external
        onlyOwner
    {
        _signers.add(_signer);

        euint8 w = FHE.asEuint8(_weight);
        FHE.allowThis(w);
        _weights.push(w);

        emit SignerAdded(_signers.size() - 1);
    }

    function removeSigner(uint256 idx) external onlyOwner {
        require(idx < _signers.size(), "MultiSig: out of bounds");

        uint256 last = _weights.length - 1;
        if (idx != last) {
            _weights[idx] = _weights[last];
        }
        _weights.pop();

        _signers.remove(idx);
        emit SignerRemoved(idx);
    }

    function updateThreshold(InEuint8 calldata _newThreshold) external onlyOwner {
        _encryptedThreshold = FHE.asEuint8(_newThreshold);
        FHE.allowThis(_encryptedThreshold);
        emit ThresholdUpdated();
    }

    function bindVault(address _vault) external onlyOwner {
        require(_vault != address(0), "MultiSig: zero vault");
        vault = _vault;
        emit VaultBound(_vault);
    }

    // ============ Proposal flow ============

    /**
     * @notice Phase 1: any registered signer proposes an action. The proposer's
     *         encrypted weight is added to the accumulator immediately, and the
     *         threshold check is evaluated for the single-approver case.
     */
    function proposeAction(
        ActionKind _kind,
        bytes calldata _payload,
        InEaddress calldata _myAddress
    ) external nonReentrant returns (uint256 proposalId) {
        require(_signers.size() > 0, "MultiSig: no signers");

        // Verify membership (encrypted) — proposer must be a signer
        ebool isSigner = _signers.isAllowed(_myAddress);
        FHE.allowThis(isSigner);

        proposalId = proposalCount++;
        Proposal storage p = _proposals[proposalId];
        p.kind = _kind;
        p.payload = _payload;
        p.proposedAt = block.timestamp;
        p.proposer = msg.sender;

        // Initial accumulator from proposer's weight
        euint8 weight = _computeWeightContribution(_myAddress);
        p.accumulatedWeight = weight;
        FHE.allowThis(p.accumulatedWeight);

        p.hasApproved[msg.sender] = true;
        p.approvers.push(msg.sender);

        // Compound: must be a signer AND accumulator >= threshold
        ebool met = FHE.gte(p.accumulatedWeight, _encryptedThreshold);
        FHE.allowThis(met);
        p.thresholdMet = FHE.and(isSigner, met);
        FHE.allowThis(p.thresholdMet);

        emit ProposalCreated(proposalId, _kind, msg.sender);
        emit ProposalApproved(proposalId, msg.sender, 1);
    }

    /**
     * @notice Phase 2: additional signers approve. Each approval adds their
     *         encrypted weight to the accumulator.
     */
    function approveProposal(uint256 _id, InEaddress calldata _myAddress)
        external
        nonReentrant
        proposalActive(_id)
    {
        Proposal storage p = _proposals[_id];
        require(!p.hasApproved[msg.sender], "MultiSig: already approved");

        ebool isSigner = _signers.isAllowed(_myAddress);
        FHE.allowThis(isSigner);

        euint8 contribution = _computeWeightContribution(_myAddress);
        p.accumulatedWeight = FHE.add(p.accumulatedWeight, contribution);
        FHE.allowThis(p.accumulatedWeight);

        p.hasApproved[msg.sender] = true;
        p.approvers.push(msg.sender);

        ebool met = FHE.gte(p.accumulatedWeight, _encryptedThreshold);
        FHE.allowThis(met);
        ebool combined = FHE.and(isSigner, met);
        FHE.allowThis(combined);
        p.thresholdMet = FHE.and(p.thresholdMet, combined);
        FHE.allowThis(p.thresholdMet);

        emit ProposalApproved(_id, msg.sender, p.approvers.length);
    }

    /**
     * @notice Phase 3: after threshold-network decryption of `thresholdMet`,
     *         publish the result. If true, the action is recorded as executed
     *         and downstream calls to the bound vault are unlocked.
     */
    function finalizeProposal(uint256 _id, bool _authorised, bytes calldata _signature)
        external
        nonReentrant
        proposalActive(_id)
    {
        Proposal storage p = _proposals[_id];
        require(msg.sender == p.proposer, "MultiSig: only proposer finalises");

        FHE.publishDecryptResult(p.thresholdMet, _authorised, _signature);

        p.executed = _authorised;
        if (!_authorised) {
            p.cancelled = true;
        }
        emit ProposalFinalized(_id, _authorised);
    }

    /// @notice Owner can cancel any pending proposal (escape hatch)
    function cancelProposal(uint256 _id) external onlyOwner proposalActive(_id) {
        _proposals[_id].cancelled = true;
        emit ProposalCancelled(_id);
    }

    // ============ Internal helpers ============

    /**
     * @dev For each signer i:
     *        contribution_i = select(eq(query, signer_i), weight_i, 0)
     *      Sum all contributions to get the encrypted weight contribution
     *      of a query address.
     */
    function _computeWeightContribution(InEaddress calldata _addr) internal returns (euint8) {
        eaddress queryEnc = FHE.asEaddress(_addr);
        FHE.allowThis(queryEnc);

        euint8 zero = FHE.asEuint8(uint256(0));
        FHE.allowThis(zero);

        euint8 total = zero;
        FHE.allowThis(total);

        uint256 n = _signers.size();
        for (uint256 i = 0; i < n; i++) {
            ebool match_i = FHE.eq(queryEnc, _signers.entryAt(i));
            FHE.allowThis(match_i);

            euint8 contrib = FHE.select(match_i, _weights[i], zero);
            FHE.allowThis(contrib);

            total = FHE.add(total, contrib);
            FHE.allowThis(total);
        }

        return total;
    }

    // ============ View helpers ============

    function signerCount() external view returns (uint256) {
        return _signers.size();
    }

    function proposalInfo(uint256 _id)
        external
        view
        returns (
            ActionKind kind,
            address proposer,
            uint256 proposedAt,
            uint256 approverCount,
            bool executed,
            bool cancelled
        )
    {
        require(_id < proposalCount, "MultiSig: invalid proposal");
        Proposal storage p = _proposals[_id];
        return (p.kind, p.proposer, p.proposedAt, p.approvers.length, p.executed, p.cancelled);
    }

    function hasApproved(uint256 _id, address _signer) external view returns (bool) {
        require(_id < proposalCount, "MultiSig: invalid proposal");
        return _proposals[_id].hasApproved[_signer];
    }

    function proposalPayload(uint256 _id) external view returns (bytes memory) {
        require(_id < proposalCount, "MultiSig: invalid proposal");
        return _proposals[_id].payload;
    }

    // ============ Ownership transfer (escape hatch) ============

    function transferOwnership(address _newOwner) external onlyOwner {
        require(_newOwner != address(0), "MultiSig: zero addr");
        pendingOwner = _newOwner;
    }

    function acceptOwnership() external {
        require(msg.sender == pendingOwner, "MultiSig: not pending owner");
        owner = pendingOwner;
        pendingOwner = address(0);
    }
}
