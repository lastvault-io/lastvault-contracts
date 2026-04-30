// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {FHE, eaddress, euint128, ebool, InEaddress, InEuint128} from "@fhenixprotocol/cofhe-contracts/FHE.sol";

/**
 * @title ConfidentialEscrow
 * @author Divara Technology Inc. (lastvault.io)
 * @notice ReineiraOS bridge: confidential payment escrow released only when
 *         a corresponding FHE inheritance claim is verified.
 *
 * @dev Wave 3 deliverable for the Fhenix Privacy-by-Design Buildathon.
 *      Architecture documented in docs/REINEIRA_BRIDGE.md (Wave 2).
 *
 *      THE PROBLEM:
 *        Inheritance often involves moving real value (ETH, ERC20, USDC).
 *        Doing this via plaintext transfers reveals heir identity.
 *        Doing it via mixers introduces regulatory friction.
 *
 *      THE SOLUTION:
 *        ConfidentialEscrow holds funds against an ENCRYPTED beneficiary
 *        commitment. Funds are released only when:
 *
 *          1. The linked FHE inheritance contract emits a verified claim
 *             (the inheritance contract has its own threshold-decrypted bool)
 *          2. The releaser provides their encrypted address, which the
 *             escrow verifies matches the encrypted beneficiary via FHE.eq
 *          3. Both checks combined via FHE.and produce a single ebool
 *
 *        The escrow then publishes the threshold-decrypted result and,
 *        if true, releases funds.
 *
 *      WHAT MAKES IT CONFIDENTIAL:
 *        - Beneficiary identity hidden on-chain (eaddress)
 *        - Amount can be hidden via euint128 if combined with confidential
 *          token implementation (Privara/Reineira pattern)
 *        - Release event reveals amount + claimant address (necessary for
 *          settlement) but not the beneficiary commitment trail
 *
 *      USE CASES:
 *        - Crypto inheritance with stablecoin distribution
 *        - Confidential employment severance / vesting
 *        - Private bug bounty payouts
 *        - Anonymous donations released on verifier signal
 *
 *      INTEGRATION POINT:
 *        The escrow is parameterized by an "inheritance verifier" — an
 *        external contract address that exposes a `claimVerified()` view
 *        function. This decouples the escrow from any specific vault
 *        implementation, allowing it to bridge with LastVaultFHE,
 *        LastVaultMultiHeir, or any future FHE-gated verifier.
 */
interface IInheritanceVerifier {
    /// @notice Returns true if the linked inheritance contract has a
    ///         verified claim ready for payout. The escrow reads this
    ///         as part of its release condition.
    function isClaimVerified() external view returns (bool);

    /// @notice Returns the encrypted address of the verified claimant
    ///         (zero handle if no verified claim).
    function getVerifiedClaimant() external view returns (eaddress);
}

contract ConfidentialEscrow {
    // ============ State ============

    address public owner;
    address public verifier;            // Inheritance verifier contract

    /// @dev Encrypted beneficiary commitment — the address authorized to release
    eaddress private _encryptedBeneficiary;

    /// @dev Plaintext escrow amount (ETH, in wei)
    uint256 public escrowAmount;

    /// @dev Whether the escrow has been released
    bool public released;

    /// @dev Cached release authorization ebool (set during initiateRelease)
    ebool private _releaseAuth;
    address public pendingReleaser;
    bool public releasePending;

    // ============ Events ============

    event EscrowFunded(uint256 amount);
    event ReleaseInitiated(address indexed releaser, uint256 timestamp);
    event ReleaseFinalized(address indexed releaser, uint256 amount, bool verified);
    event BeneficiaryUpdated();
    event VerifierUpdated(address indexed newVerifier);

    // ============ Modifiers ============

    modifier onlyOwner() {
        require(msg.sender == owner, "Escrow: not owner");
        _;
    }

    modifier notReleased() {
        require(!released, "Escrow: already released");
        _;
    }

    // ============ Constructor / Funding ============

    constructor(
        address _verifier,
        InEaddress memory _beneficiary
    ) {
        owner = msg.sender;
        verifier = _verifier;

        _encryptedBeneficiary = FHE.asEaddress(_beneficiary);
        FHE.allowThis(_encryptedBeneficiary);
    }

    /// @notice Fund the escrow. Only callable by owner; sets the lockup amount.
    function fund() external payable onlyOwner notReleased {
        require(msg.value > 0, "Escrow: zero amount");
        escrowAmount += msg.value;
        emit EscrowFunded(msg.value);
    }

    receive() external payable {
        escrowAmount += msg.value;
        emit EscrowFunded(msg.value);
    }

    // ============ Owner: Configuration ============

    function updateBeneficiary(InEaddress calldata _newBeneficiary)
        external
        onlyOwner
        notReleased
    {
        require(!releasePending, "Escrow: release in progress");
        _encryptedBeneficiary = FHE.asEaddress(_newBeneficiary);
        FHE.allowThis(_encryptedBeneficiary);
        emit BeneficiaryUpdated();
    }

    function updateVerifier(address _newVerifier) external onlyOwner notReleased {
        require(!releasePending, "Escrow: release in progress");
        require(_newVerifier != address(0), "Escrow: zero addr");
        verifier = _newVerifier;
        emit VerifierUpdated(_newVerifier);
    }

    /// @notice Owner can reclaim funds if no claim is in progress and no
    ///         release is pending. Useful for cancellation/expiry.
    function reclaim() external onlyOwner notReleased {
        require(!releasePending, "Escrow: release in progress");
        uint256 amt = escrowAmount;
        escrowAmount = 0;
        released = true;
        (bool ok, ) = owner.call{value: amt}("");
        require(ok, "Escrow: transfer failed");
    }

    // ============ Release Flow ============

    /**
     * @notice Phase 1: A claimant initiates a release request.
     *
     *  Two conditions must hold:
     *    A. The verifier contract reports `isClaimVerified() == true`
     *    B. The releaser's encrypted address matches the encrypted
     *       beneficiary commitment (FHE.eq)
     *
     *  Both are combined via FHE.and into a single ebool, which is then
     *  flagged for threshold decryption.
     */
    function initiateRelease(InEaddress calldata _myAddress)
        external
        notReleased
    {
        require(!releasePending, "Escrow: release pending");
        require(escrowAmount > 0, "Escrow: empty");

        // Check verifier signal (plaintext bool from verifier contract)
        bool verifierSignal = IInheritanceVerifier(verifier).isClaimVerified();
        require(verifierSignal, "Escrow: claim not verified");

        // Encrypted releaser identity check
        eaddress releaserEnc = FHE.asEaddress(_myAddress);
        FHE.allowThis(releaserEnc);

        ebool identityMatch = FHE.eq(releaserEnc, _encryptedBeneficiary);
        FHE.allowThis(identityMatch);

        // Optional: also cross-check against the verifier's recorded claimant
        eaddress verifiedClaimant = IInheritanceVerifier(verifier).getVerifiedClaimant();
        ebool verifierMatch = FHE.eq(releaserEnc, verifiedClaimant);
        FHE.allowThis(verifierMatch);

        // Compound: caller must be both the configured beneficiary AND
        // match the claimant on the verifier contract. This prevents
        // a verifier from authorizing a different beneficiary.
        ebool authorized = FHE.and(identityMatch, verifierMatch);
        FHE.allowThis(authorized);

        _releaseAuth = authorized;
        FHE.allowPublic(_releaseAuth);

        pendingReleaser = msg.sender;
        releasePending = true;

        emit ReleaseInitiated(msg.sender, block.timestamp);
    }

    /**
     * @notice Phase 2: After threshold network decrypts the authorization
     *         ebool, the releaser publishes it. If true, funds are sent
     *         to msg.sender.
     */
    function finalizeRelease(bool _authorized, bytes memory _signature) external {
        require(releasePending, "Escrow: no pending release");
        require(msg.sender == pendingReleaser, "Escrow: not pending releaser");
        require(!released, "Escrow: already released");

        // CHECKS-EFFECTS-INTERACTIONS
        address releaser = pendingReleaser;
        uint256 amount = escrowAmount;

        FHE.publishDecryptResult(_releaseAuth, _authorized, _signature);

        if (!_authorized) {
            // Failed authorization — reset for another attempt
            releasePending = false;
            pendingReleaser = address(0);
            emit ReleaseFinalized(releaser, 0, false);
            return;
        }

        // EFFECTS
        released = true;
        escrowAmount = 0;
        releasePending = false;
        pendingReleaser = address(0);

        // INTERACTIONS — release funds
        (bool ok, ) = releaser.call{value: amount}("");
        require(ok, "Escrow: transfer failed");

        emit ReleaseFinalized(releaser, amount, true);
    }

    /**
     * @notice Owner can cancel a pending release request (e.g., if the
     *         decryption stalls or the releaser disappears).
     */
    function cancelRelease() external onlyOwner {
        require(releasePending, "Escrow: no pending release");
        releasePending = false;
        pendingReleaser = address(0);
    }

    // ============ View Helpers ============

    function isFunded() external view returns (bool) {
        return escrowAmount > 0 && !released;
    }

    function balance() external view returns (uint256) {
        return address(this).balance;
    }

    // ============ Ownership ============

    function transferOwnership(address _newOwner) external onlyOwner {
        require(_newOwner != address(0), "Escrow: zero addr");
        owner = _newOwner;
    }
}
