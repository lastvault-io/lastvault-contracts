# LastVault — FHE-Encrypted Digital Inheritance

**Fhenix Buildathon Wave 1 Submission | March 2026**
**Team:** Divara Technology Inc. — Solo Founder
**Website:** [lastvault.io](https://lastvault.io)
**Category:** RWA & Compliance — Private Identity & Encrypted Financial Data

---

## Problem

Digital inheritance is broken. When someone dies, their crypto wallets, passwords, and digital assets are often lost forever. Existing solutions (multisig wallets, social recovery) either require trusted third parties or **expose sensitive data on-chain**.

The critical privacy gap: on every existing inheritance smart contract, **the heir's identity is publicly visible** on the blockchain. Anyone can see who will inherit, creating:
- Social engineering attack vectors
- Targeted scam risks for known heirs
- Privacy violations for family financial planning

## Solution: LastVault with Fhenix FHE

LastVault is a **Dead-Man's Switch** for digital inheritance. The owner periodically "pings" to prove they're alive. If they stop, the heir can claim the encrypted vault.

**What makes our Fhenix version unique:**

Using Fully Homomorphic Encryption, we've built the **first inheritance contract where the heir's identity is completely invisible on-chain**:

| Feature | Traditional Contract | LastVault FHE |
|---------|---------------------|---------------|
| Heir Identity | `address public heir` — visible to everyone | `eaddress private` — FHE-encrypted, invisible |
| Vault Payload | `bytes public` — ECIES blob, readable | `euint128 private` x2 — FHE opaque, unreadable |
| Claim Verification | `msg.sender == heir` — plaintext comparison | `FHE.eq()` — encrypted comparison, zero leakage |
| Access Control | Anyone can read payload bytes | `FHE.allow()` — only verified heir decrypts |

## Technical Architecture

### Smart Contract: `LastVaultFHE.sol`

Built on `@fhenixprotocol/cofhe-contracts`, our contract uses three core FHE types:

```
eaddress encryptedHeir    — heir address, hidden on-chain
euint128 payloadHi        — upper 128 bits of vault key
euint128 payloadLo        — lower 128 bits of vault key
```

### Two-Phase Claim Flow

The claim process leverages FHE's async decryption via the Threshold Network:

```
Phase 1: initiateClaim(InEaddress _myAddress)
  ├── Heir submits their address, encrypted client-side via CoFHE SDK
  ├── Contract: FHE.eq(claimerEncrypted, encryptedHeir)
  ├── ebool result marked for public decryption
  └── Threshold Network decrypts the boolean (not the addresses)

Phase 2: finalizeClaim(bool _isHeir, bytes _signature)
  ├── Threshold signature verifies authentic decryption
  ├── If true: FHE.allow(payloadHi, heir) + FHE.allow(payloadLo, heir)
  ├── If false: state resets, actual heir can retry
  └── Heir decrypts 256-bit vault key via CoFHE SDK
```

### Key Privacy Properties

1. **Pre-trigger:** Nobody can identify the heir by reading chain state
2. **During claim:** FHE equality check runs on ciphertext — no plaintext comparison
3. **Post-claim:** Only the verified heir gets decryption access via ACL
4. **Failed claims:** A wrong claimant learns nothing about the real heir

### Contract Features

- **Owner functions:** `ping()`, `updateHeir()`, `updatePayload()`, `cancelClaim()`
- **Heir functions:** `initiateClaim()`, `finalizeClaim()`
- **View helpers:** `isExpired()`, `timeRemaining()`
- **State machine:** Idle → Initiated → Verified (with rollback on rejection)

## Working Demonstration

### What's Built (Wave 1)

1. **`LastVaultFHE.sol`** — Full FHE-encrypted DMS contract
   - Compiles with Solidity 0.8.25+, Cancun EVM target
   - Uses `@fhenixprotocol/cofhe-contracts` for `eaddress`, `euint128`, `ebool`
   - All FHE ACL patterns: `allowThis`, `allowPublic`, `allow`

2. **Test Suite** — 7 passing tests including:
   - Privacy verification: heir/payload NOT exposed in ABI
   - Side-by-side comparison: original public contract vs FHE private contract
   - Full ABI and event signature verification

3. **Hardhat Setup** — with `@cofhe/hardhat-plugin`
   - CoFHE mock contracts auto-deployed for local testing
   - Ready for Sepolia / Arbitrum Sepolia / Base Sepolia deployment

4. **React Claim Portal** — Heir-facing web UI
   - Wallet connection (MetaMask)
   - Vault status dashboard showing FHE-encrypted fields
   - 3-step claim flow visualization
   - Privacy comparison table

5. **Deploy Scripts** — `deploy-fhe.ts` + `encrypt-and-deploy.ts`
   - CoFHE SDK integration for client-side encryption of constructor args

## The Bigger Picture

LastVault is not just a smart contract — it's a complete digital inheritance platform:

- **Desktop App** (macOS/Windows) — .NET MAUI, manages vault + auto-ping
- **Mobile App** (iOS/Android) — heir notifications + claim
- **Hardware Security Key** — ESP32-S3 USB/NFC FIDO2 device
- **Server Backend** — ASP.NET, heir management + notifications
- **Patent Filed** — Turkish Patent Office, 4 independent claims (WIPO/PCT ready)

The Fhenix FHE module adds the missing privacy layer that makes on-chain inheritance truly confidential.

## Roadmap

| Wave | Timeline | Goal |
|------|----------|------|
| **Wave 1** | Mar 21-28 | FHE contract + tests + claim portal *(this submission)* |
| **Wave 2** | Mar 30 - Apr 6 | Testnet deployment + CoFHE SDK full integration |
| **Wave 3** | Apr 8 - May 8 | Multi-heir support + Privara payment rails |
| **Wave 4** | May 11-20 | Selective disclosure for auditors/regulators |
| **Wave 5** | May 23 - Jun 1 | Production-ready + NY Tech Week demo |

## Repository Structure

```
lastvault-contracts/
├── src/
│   ├── LastVaultInheritance.sol   # Original plaintext contract (Base mainnet)
│   └── LastVaultFHE.sol           # NEW: FHE-encrypted version (Fhenix)
├── test-hardhat/
│   └── LastVaultFHE.test.ts       # 7 tests — privacy + ABI verification
├── scripts/
│   ├── deploy-fhe.ts              # Testnet deploy script
│   └── encrypt-and-deploy.ts      # Full CoFHE encryption + deploy flow
├── claim-portal/                  # React claim UI (Vite + ethers.js)
├── hardhat.config.ts              # Solidity 0.8.26, Cancun, @cofhe/hardhat-plugin
└── docs/
    └── FHENIX_WAVE1_SUBMISSION.md # This document
```

## Why This Matters

Digital inheritance affects everyone. An estimated **$140B in crypto** is permanently lost due to owner death without proper succession planning.

FHE solves the fundamental tension: you need inheritance data **on-chain** for trustless execution, but you need it **private** to protect heirs from targeting. Fhenix makes this possible without complex ZK circuits — just Solidity with encrypted types.

LastVault + Fhenix = the first truly private digital inheritance protocol.

---

**Built by Divara Technology Inc.**
**Powered by Fhenix FHE**
