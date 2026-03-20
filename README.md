# LastVault Inheritance Smart Contract

**Trustless digital inheritance via a Dead-Man's Switch on any EVM chain.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Solidity](https://img.shields.io/badge/Solidity-%5E0.8.20-blue)](https://soliditylang.org/)
[![Foundry](https://img.shields.io/badge/Built%20with-Foundry-orange)](https://getfoundry.sh/)

## Overview

LastVault's inheritance contract implements a **Dead-Man's Switch (DMS)** pattern: the vault owner periodically calls `ping()` to prove they are alive. If the owner stops pinging for a configurable timeout period, the designated heir can call `claim()` to retrieve an ECIES-encrypted payload containing the vault recovery share.

**Key properties:**
- **Fully on-chain** — no IPFS, no external storage, no trusted third party
- **Zero-knowledge** — the contract stores only encrypted bytes; only the heir's private key can decrypt
- **Multi-chain** — works on Ethereum, Base, Arbitrum, Polygon, Optimism, Avalanche
- **Gas-free reads** — `encryptedPayload()` is a view function, heir can read without gas
- **20+ year durability** — data lives as long as the blockchain exists

## How It Works

```
Owner deploys contract
        |
        v
  [ping() every 7 days]  <--- LastVault Desktop App (automatic)
        |
        v
  Owner stops pinging (death, incapacity, etc.)
        |
        v
  [timeoutPeriod passes] (default: 90 days)
        |
        v
  Heir calls claim()
        |
        v
  Contract returns ECIES-encrypted payload
        |
        v
  Heir decrypts with their secp256k1 private key
        |
        v
  Heir recovers vault master key
```

## Contract Interface

```solidity
// Owner functions
function ping() external;                              // Reset the DMS timer
function setHeir(address _newHeir) external;           // Change heir
function updatePayload(bytes memory _newPayload) external; // Rotate payload

// Heir function
function claim() external returns (bytes memory);       // Claim after timeout

// View functions (gas-free)
function owner() external view returns (address);
function heir() external view returns (address);
function lastPingTimestamp() external view returns (uint256);
function timeoutPeriod() external view returns (uint256);
function encryptedPayload() external view returns (bytes memory);
```

## Deployment

### Prerequisites

```bash
curl -L https://foundry.paradigm.xyz | bash
foundryup
```

### Build

```bash
forge build
```

### Test

```bash
forge test -vvv
```

### Deploy to Base Sepolia

```bash
forge create src/LastVaultInheritance.sol:LastVaultInheritance \
  --rpc-url https://sepolia.base.org \
  --private-key $DEPLOYER_KEY \
  --constructor-args $OWNER_ADDR $HEIR_ADDR 7776000 0x... \
  --verify --etherscan-api-key $BASESCAN_KEY
```

(`7776000` = 90 days in seconds)

## Encrypted Payload Format

The `encryptedPayload` stored on-chain is an ECIES bundle:

```
[33 bytes] Ephemeral public key (compressed secp256k1)
[12 bytes] AES-256-GCM nonce
[N  bytes] AES-256-GCM ciphertext (encrypted master key)
[16 bytes] AES-256-GCM authentication tag
```

**Decryption flow:**
1. Heir derives shared secret: `ECDH(heirPrivateKey, ephemeralPubKey)`
2. Derive AES key: `HKDF-SHA256(sharedSecret, "LastVault-ECIES")`
3. Decrypt: `AES-256-GCM.decrypt(key, nonce, ciphertext, tag)`

## Security Considerations

- **No admin keys** — the contract has no pause, upgrade, or admin functions
- **No reentrancy risk** — `claim()` only reads and returns data, no ETH transfers
- **Timing-safe** — an observer can see the last ping timestamp, but the encrypted payload is useless without the heir's private key
- **Duress protection** — the LastVault desktop app supports dual-TOTP: entering a different TOTP code opens a decoy vault with a different contract. An attacker cannot distinguish real from decoy.

## Supported Chains

| Chain | Chain ID | Status |
|-------|----------|--------|
| Base Mainnet | 8453 | Active |
| Base Sepolia | 84532 | Testnet |
| Ethereum Mainnet | 1 | Supported |
| Ethereum Sepolia | 11155111 | Testnet |
| Arbitrum One | 42161 | Supported |
| Polygon PoS | 137 | Supported |
| Optimism | 10 | Supported |
| Avalanche C-Chain | 43114 | Supported |

## Part of the LastVault Ecosystem

- **Desktop App** — .NET 9 MAUI Blazor Hybrid (Windows, macOS planned)
- **Mobile App** — Android (push approval, BLE pairing, PIN lock)
- **Hardware Security Key** — Custom USB security key with secure element + NFC
- **Heir Portal** — [heir.lastvault.io](https://heir.lastvault.io)
- **Standalone Claim** — [lastvault-claim](https://github.com/lastvault-io/lastvault-claim) (works without LastVault servers)
- **Website** — [lastvault.io](https://lastvault.io)

## License

MIT License. See [LICENSE](LICENSE).

## Patent Notice

The cryptographic architecture described in this contract is covered by patent application filed with the Turkish Patent Office (4 independent claims, WIPO/PCT ready). The MIT license grants full usage rights for the smart contract code.

---

**Built by [Divara Technology Inc.](https://lastvault.io)** | Hasan Aytekin, Founder & CTO
