// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title LastVaultMultiSig
 * @author Divara Technology Inc. (lastvault.io)
 * @notice M-of-N multi-sig Dead-Man's Switch for digital inheritance.
 * @dev Extends the LastVault DMS pattern for B2B use: multiple signers must
 *      approve a ping within the timeout window. If threshold is not met,
 *      the heir can claim the encrypted payload.
 *
 *  Flow:
 *    1. Deploy with N signer addresses, M threshold, heir, timeout, payload.
 *    2. Each ping cycle (epoch), M of N signers must call approvePing().
 *    3. When M-th approval arrives, timer resets and epoch increments.
 *    4. If signers fail to reach threshold before timeout, heir calls claim().
 *
 *  Design:
 *    - Epoch-based approvals: each successful ping resets all approvals.
 *    - No Gnosis Safe dependency — minimal, purpose-built multi-sig.
 *    - Signers set at deploy time (rotation in v2).
 *
 *  Patent: Turkish Patent Office — 4 independent claims (WIPO/PCT ready)
 */
contract LastVaultMultiSig {
    // ── State ──────────────────────────────────────────────────────────────

    address[] public signers;
    mapping(address => bool) public isSigner;
    uint256 public requiredApprovals;

    address public heir;
    bytes public encryptedPayload;

    uint256 public lastPingTimestamp;
    uint256 public immutable timeoutPeriod;

    // Epoch-based ping approvals
    uint256 public currentPingEpoch;
    mapping(uint256 => mapping(address => bool)) public hasApproved;
    mapping(uint256 => uint256) public approvalCount;

    // ── Events ─────────────────────────────────────────────────────────────

    event PingApproved(address indexed signer, uint256 indexed epoch);
    event Pinged(uint256 indexed epoch, uint256 timestamp);
    event HeirChanged(address indexed oldHeir, address indexed newHeir);
    event PayloadUpdated(uint256 timestamp);
    event SecretClaimed(address indexed heir);

    // ── Modifiers ──────────────────────────────────────────────────────────

    modifier onlySigner() {
        require(isSigner[msg.sender], "LastVault: Not a signer");
        _;
    }

    modifier onlyHeir() {
        require(msg.sender == heir, "LastVault: Not the designated heir");
        _;
    }

    // ── Constructor ────────────────────────────────────────────────────────

    /**
     * @param _signers Array of signer addresses (N)
     * @param _requiredApprovals Threshold (M) — must be > 0 and <= N
     * @param _heir Designated heir address
     * @param _timeoutPeriod Timeout in seconds before heir can claim
     * @param _encryptedPayload ECIES-encrypted master key bundle
     */
    constructor(
        address[] memory _signers,
        uint256 _requiredApprovals,
        address _heir,
        uint256 _timeoutPeriod,
        bytes memory _encryptedPayload
    ) {
        require(_signers.length > 0, "LastVault: No signers");
        require(_requiredApprovals > 0, "LastVault: Threshold must be > 0");
        require(_requiredApprovals <= _signers.length, "LastVault: Threshold exceeds signer count");
        require(_heir != address(0), "LastVault: Invalid heir address");
        require(_timeoutPeriod >= 1 days, "LastVault: Timeout must be >= 1 day");

        // Validate no duplicates and no zero addresses
        for (uint256 i = 0; i < _signers.length; i++) {
            address s = _signers[i];
            require(s != address(0), "LastVault: Zero address signer");
            require(!isSigner[s], "LastVault: Duplicate signer");
            isSigner[s] = true;
        }

        signers = _signers;
        requiredApprovals = _requiredApprovals;
        heir = _heir;
        timeoutPeriod = _timeoutPeriod;
        encryptedPayload = _encryptedPayload;
        lastPingTimestamp = block.timestamp;
    }

    // ── Signer Functions ───────────────────────────────────────────────────

    /**
     * @dev Signer approves the current ping epoch. When M approvals are
     *      reached, the DMS timer resets and epoch increments.
     */
    function approvePing() external onlySigner {
        uint256 epoch = currentPingEpoch;
        require(!hasApproved[epoch][msg.sender], "LastVault: Already approved this epoch");

        hasApproved[epoch][msg.sender] = true;
        approvalCount[epoch]++;

        emit PingApproved(msg.sender, epoch);

        // Check if threshold reached
        if (approvalCount[epoch] >= requiredApprovals) {
            lastPingTimestamp = block.timestamp;
            currentPingEpoch++;
            emit Pinged(epoch, block.timestamp);
        }
    }

    // ── Heir Functions ─────────────────────────────────────────────────────

    /**
     * @dev Heir claims the encrypted payload after timeout.
     */
    function claim() external onlyHeir returns (bytes memory) {
        require(
            block.timestamp > lastPingTimestamp + timeoutPeriod,
            "LastVault: Signers are still active (timeout not reached)"
        );

        emit SecretClaimed(msg.sender);
        return encryptedPayload;
    }

    // ── View Functions ─────────────────────────────────────────────────────

    function isExpired() public view returns (bool) {
        return block.timestamp > lastPingTimestamp + timeoutPeriod;
    }

    function timeRemaining() public view returns (uint256) {
        uint256 deadline = lastPingTimestamp + timeoutPeriod;
        if (block.timestamp >= deadline) return 0;
        return deadline - block.timestamp;
    }

    function getSigners() external view returns (address[] memory) {
        return signers;
    }

    function getSignerCount() external view returns (uint256) {
        return signers.length;
    }

    function getApprovalStatus(uint256 _epoch) external view returns (uint256 count, uint256 required) {
        return (approvalCount[_epoch], requiredApprovals);
    }

    function hasSignerApproved(uint256 _epoch, address _signer) external view returns (bool) {
        return hasApproved[_epoch][_signer];
    }
}
