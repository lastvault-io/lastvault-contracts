// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title LastVaultInheritance
 * @author Divara Technology Inc. (lastvault.io)
 * @notice A trustless Dead-Man's Switch for digital inheritance.
 * @dev Stores an on-chain ECIES-encrypted payload containing the vault
 *      recovery share. Fully on-chain — zero external storage dependency.
 *
 *  Flow:
 *    1. Owner deploys with heir address, timeout period, and encrypted payload.
 *    2. Owner calls ping() periodically (e.g. every 7 days via LastVault Desktop).
 *    3. If owner stops pinging for `timeoutPeriod` seconds, heir can call claim().
 *    4. claim() returns the encrypted payload — heir decrypts with their private key.
 *
 *  Security:
 *    - The encrypted payload is an ECIES bundle (secp256k1): ephemeral pubkey +
 *      AES-256-GCM ciphertext. Only the heir's private key can decrypt it.
 *    - The contract stores NO plaintext secrets. Even if read on-chain, the
 *      payload is useless without the heir's private key.
 *    - Works on any EVM chain: Ethereum, Base, Arbitrum, Polygon, Optimism, Avalanche.
 *
 *  Patent: Turkish Patent Office — 4 independent claims (WIPO/PCT ready)
 */
contract LastVaultInheritance {
    address public owner;
    address public heir;

    // On-chain encrypted ECIES bundle (~125 bytes)
    bytes public encryptedPayload;

    // Time tracking
    uint256 public lastPingTimestamp;
    uint256 public timeoutPeriod; // in seconds

    // Events
    event Pinged(address indexed owner, uint256 timestamp);
    event HeirChanged(address indexed oldHeir, address indexed newHeir);
    event SecretClaimed(address indexed heir);

    modifier onlyOwner() {
        require(msg.sender == owner, "LastVault: Not the owner");
        _;
    }

    modifier onlyHeir() {
        require(msg.sender == heir, "LastVault: Not the designated heir");
        _;
    }

    /**
     * @dev Constructor sets the initial state
     * @param _owner The wallet address of the vault owner (the user)
     * @param _heir The wallet address of the designated heir
     * @param _timeoutPeriod Time in seconds before the heir can claim
     * @param _encryptedPayload The ECIES-encrypted master key bundle (on-chain)
     */
    constructor(
        address _owner,
        address _heir,
        uint256 _timeoutPeriod,
        bytes memory _encryptedPayload
    ) {
        require(_owner != address(0), "LastVault: Invalid owner address");
        require(_heir != address(0), "LastVault: Invalid heir address");
        require(_timeoutPeriod > 0, "LastVault: Timeout must be > 0");

        owner = _owner;
        heir = _heir;
        timeoutPeriod = _timeoutPeriod;
        encryptedPayload = _encryptedPayload;
        lastPingTimestamp = block.timestamp;
    }

    /**
     * @dev Reset the dead-man's switch timer. Called periodically by the LastVault Desktop App.
     */
    function ping() external onlyOwner {
        lastPingTimestamp = block.timestamp;
        emit Pinged(msg.sender, block.timestamp);
    }

    /**
     * @dev Changes the designated heir. Only the owner can do this.
     */
    function setHeir(address _newHeir) external onlyOwner {
        require(_newHeir != address(0), "LastVault: Invalid heir address");
        emit HeirChanged(heir, _newHeir);
        heir = _newHeir;
    }

    /**
     * @dev Updates the on-chain encrypted payload (e.g. vault key rotation).
     */
    function updatePayload(bytes memory _newPayload) external onlyOwner {
        encryptedPayload = _newPayload;
        lastPingTimestamp = block.timestamp; // Reset ping timer on update
    }

    /**
     * @dev The heir calls this function to retrieve the encrypted payload.
     * Reverts if the timeout period has not yet passed since the last ping.
     */
    function claim() external onlyHeir returns (bytes memory) {
        require(block.timestamp > lastPingTimestamp + timeoutPeriod, "LastVault: Owner is still alive (timeout not reached)");

        emit SecretClaimed(msg.sender);

        return encryptedPayload;
    }
}
