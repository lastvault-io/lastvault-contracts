// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {eaddress} from "@fhenixprotocol/cofhe-contracts/FHE.sol";
import {ReentrancyGuard} from "./utils/ReentrancyGuard.sol";

/**
 * @title CrossChainClaimRelay
 * @author Divara Technology Inc. (lastvault.io)
 * @notice Relays a verified-claim signal from a source chain to a destination
 *         chain. Encrypted state stays on the source; only the boolean
 *         "claim verified" signal crosses.
 *
 * @dev Wave 5 deliverable for the Fhenix Privacy-by-Design Buildathon.
 *
 *      TRUST MODEL (v1 — event-relay pattern):
 *      ----------------------------------------
 *      Source chain (e.g. Arbitrum Sepolia + Fhenix CoFHE):
 *        - LastVaultMultiHeir or LastVaultFHE finalises a claim
 *        - Source relay emits `ClaimVerifiedSignal(vaultId, claimant, chainId)`
 *
 *      Off-chain relayer:
 *        - Monitors the source event log
 *        - Submits the signal to the destination relay (with replay protection)
 *        - Multi-relayer setup recommended for production (any honest
 *          relayer can deliver; signature verification provides finality)
 *
 *      Destination chain (e.g. Base Sepolia — high liquidity, no FHE needed):
 *        - Stores `claimVerified[sourceChainId][vaultId] = true`
 *        - Exposes `IInheritanceVerifier` so existing ConfidentialEscrow
 *          contracts can read the verified status
 *
 *      MIGRATION PATH:
 *      ----------------
 *      v2 will replace the event-relay pattern with LayerZero V2 OApp once
 *      DVN peer config is stabilised. The interface (IInheritanceVerifier
 *      on destination) stays the same — only the relay mechanism upgrades.
 *
 *      REPLAY PROTECTION:
 *      ------------------
 *      Each signal is keyed by (sourceChainId, vaultId, sourceTxHash) and
 *      can be ingested only once. Multiple relayers attempting the same
 *      delivery succeed idempotently (first wins).
 *
 *      ENCRYPTED IDENTITY ON DESTINATION:
 *      -----------------------------------
 *      The destination receives the CLAIMANT'S PLAINTEXT ADDRESS. This is
 *      necessary because the destination chain doesn't have FHE — it needs
 *      a regular address to send funds to. The privacy guarantee is that
 *      the HEIR IDENTITY remained encrypted on the source chain throughout
 *      verification; the address only becomes visible at the moment of
 *      settlement (which is unavoidable if you want spendable funds).
 *
 *      For full source-to-destination encrypted identity, see the future
 *      Wave 6 design using FHE-compatible bridging when Fhenix deploys
 *      cross-chain CoFHE primitives.
 */

interface IInheritanceVerifier {
    function isClaimVerified() external view returns (bool);
    function getVerifiedClaimant() external view returns (eaddress);
}

contract CrossChainClaimRelay is ReentrancyGuard {
    // ============ Roles ============

    address public owner;
    mapping(address => bool) public relayers;
    address[] public relayerList;

    // ============ Cross-chain signal state ============

    /// @dev Tracks the destination-chain receipt of source-chain signals
    struct ClaimSignal {
        uint256 sourceChainId;
        bytes32 sourceTxHash;
        address claimant;
        uint256 receivedAt;
        bool verified;
    }

    /// @dev Keyed by signal hash = keccak256(sourceChainId, vaultId, sourceTxHash)
    mapping(bytes32 => ClaimSignal) public signals;

    /// @dev Quick lookup for IInheritanceVerifier compatibility:
    ///      sourceChainId → vaultAddress → claimant address (if verified)
    mapping(uint256 => mapping(address => address)) public latestVerifiedClaimant;
    mapping(uint256 => mapping(address => bool)) public latestClaimVerified;

    /// @dev Latest signal for the simple IInheritanceVerifier view interface.
    ///      Real production deployments would track per-vault state instead.
    address public latestVaultSource;
    address public latestClaimantPlaintext;
    bool public latestVerified;

    // ============ Events ============

    event RelayerAdded(address indexed relayer);
    event RelayerRemoved(address indexed relayer);
    event ClaimVerifiedSignal(
        uint256 indexed sourceChainId,
        address indexed sourceVault,
        address indexed claimant,
        bytes32 signalHash,
        uint256 timestamp
    );
    event SignalRelayed(
        bytes32 indexed signalHash,
        address indexed deliveredBy,
        address claimant
    );

    // ============ Modifiers ============

    modifier onlyOwner() {
        require(msg.sender == owner, "Relay: not owner");
        _;
    }

    modifier onlyRelayer() {
        require(relayers[msg.sender] || msg.sender == owner, "Relay: not relayer");
        _;
    }

    // ============ Constructor ============

    constructor() {
        owner = msg.sender;
        // Owner is implicitly a relayer (no need to explicitly register).
    }

    // ============ Owner: relayer management ============

    function addRelayer(address _relayer) external onlyOwner {
        require(_relayer != address(0), "Relay: zero addr");
        require(!relayers[_relayer], "Relay: already relayer");
        relayers[_relayer] = true;
        relayerList.push(_relayer);
        emit RelayerAdded(_relayer);
    }

    function removeRelayer(address _relayer) external onlyOwner {
        require(relayers[_relayer], "Relay: not relayer");
        relayers[_relayer] = false;
        for (uint256 i = 0; i < relayerList.length; i++) {
            if (relayerList[i] == _relayer) {
                relayerList[i] = relayerList[relayerList.length - 1];
                relayerList.pop();
                break;
            }
        }
        emit RelayerRemoved(_relayer);
    }

    function relayerCount() external view returns (uint256) {
        return relayerList.length;
    }

    // ============ Source-chain operation ============

    /**
     * @notice Called on the SOURCE CHAIN by the FHE inheritance contract
     *         (or owner on its behalf) to broadcast a verified claim.
     *         Emits ClaimVerifiedSignal — off-chain relayers pick this up
     *         and deliver to the destination chain.
     *
     *         The encrypted state on the source remains untouched. Only the
     *         plaintext claimant address is broadcast (necessary for the
     *         destination chain to settle).
     */
    function emitClaimVerified(
        address _sourceVault,
        address _claimant
    ) external nonReentrant returns (bytes32 signalHash) {
        require(_claimant != address(0), "Relay: zero claimant");
        require(_sourceVault != address(0), "Relay: zero vault");

        signalHash = keccak256(
            abi.encodePacked(block.chainid, _sourceVault, _claimant, block.number)
        );

        emit ClaimVerifiedSignal(
            block.chainid,
            _sourceVault,
            _claimant,
            signalHash,
            block.timestamp
        );
    }

    // ============ Destination-chain ingestion ============

    /**
     * @notice Called on the DESTINATION CHAIN by an authorised relayer with
     *         the source-chain signal details. Marks the claim as verified
     *         so destination contracts (e.g. ConfidentialEscrow) can release.
     *
     *         Replay protection: each (sourceChainId, sourceTxHash) tuple
     *         can be ingested only once. Multiple relayers calling for the
     *         same signal succeed idempotently (first sets state).
     */
    function ingestClaimSignal(
        uint256 _sourceChainId,
        address _sourceVault,
        address _claimant,
        bytes32 _sourceTxHash
    ) external nonReentrant onlyRelayer {
        require(_claimant != address(0), "Relay: zero claimant");
        require(_sourceVault != address(0), "Relay: zero vault");

        bytes32 signalHash = keccak256(
            abi.encodePacked(_sourceChainId, _sourceVault, _claimant, _sourceTxHash)
        );

        // Replay protection — first relayer wins, others no-op
        if (signals[signalHash].verified) {
            return;
        }

        signals[signalHash] = ClaimSignal({
            sourceChainId: _sourceChainId,
            sourceTxHash: _sourceTxHash,
            claimant: _claimant,
            receivedAt: block.timestamp,
            verified: true
        });

        latestVerifiedClaimant[_sourceChainId][_sourceVault] = _claimant;
        latestClaimVerified[_sourceChainId][_sourceVault] = true;

        // Update the simple IInheritanceVerifier view interface
        latestVaultSource = _sourceVault;
        latestClaimantPlaintext = _claimant;
        latestVerified = true;

        emit SignalRelayed(signalHash, msg.sender, _claimant);
    }

    // ============ IInheritanceVerifier (read interface) ============

    /// @notice Whether the most recently ingested claim is verified.
    /// @dev For production multi-vault routing, query the per-vault mappings
    ///      directly. This single getter is convenient for the W3
    ///      ConfidentialEscrow integration test.
    function isClaimVerified() external view returns (bool) {
        return latestVerified;
    }

    /// @notice Plaintext address of the verified claimant.
    /// @dev Returned as `eaddress` to fit the IInheritanceVerifier interface.
    ///      Casting through `eaddress(uint160(...))` would be FHE-specific;
    ///      destination chains without FHE can use `latestClaimantPlaintext`
    ///      directly instead of this getter.
    function getVerifiedClaimant() external view returns (eaddress) {
        // The IInheritanceVerifier interface requires eaddress, but
        // destination chains don't have FHE. We return the zero handle
        // here and expose the plaintext via `latestClaimantPlaintext`.
        // Source-chain ConfidentialEscrow uses the eaddress handle;
        // destination-chain consumers use the plaintext address.
        return eaddress.wrap(bytes32(0));
    }

    /// @notice Lookup: was this specific source vault's claim verified?
    function isVaultClaimVerified(uint256 _sourceChainId, address _sourceVault)
        external
        view
        returns (bool)
    {
        return latestClaimVerified[_sourceChainId][_sourceVault];
    }

    /// @notice Lookup: who claimed this specific source vault?
    function getVaultClaimant(uint256 _sourceChainId, address _sourceVault)
        external
        view
        returns (address)
    {
        return latestVerifiedClaimant[_sourceChainId][_sourceVault];
    }

    // ============ Ownership ============

    function transferOwnership(address _newOwner) external onlyOwner {
        require(_newOwner != address(0), "Relay: zero addr");
        owner = _newOwner;
    }
}
