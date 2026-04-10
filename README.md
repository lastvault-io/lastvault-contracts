# LastVault FHE — Private On-Chain Identity Verification

**The first FHE system where a smart contract verifies WHO you are without ever seeing your identity.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Solidity](https://img.shields.io/badge/Solidity-%5E0.8.25-blue)](https://soliditylang.org/)
[![Fhenix CoFHE](https://img.shields.io/badge/Fhenix-CoFHE%20Encrypted-purple)](https://fhenix.io/)
[![FHE Ops](https://img.shields.io/badge/FHE%20Operations-12%2B%20distinct-green)]()
[![Tests](https://img.shields.io/badge/Tests-24%20passing-green)]()

> **Fhenix Buildathon Wave 2** — A private identity verification primitive built on Fully Homomorphic Encryption. Inheritance is the first application; the primitive generalizes to encrypted allowlists, anonymous authorization, private DAO membership, and confidential access control.

---

## The Primitive

LastVault FHE introduces **encrypted identity matching**: the ability for a smart contract to answer "is this person authorized?" without ever learning who that person is.

```
Traditional:  if (msg.sender == heir)     → heir identity PUBLIC forever
ZK approach:  if (verify(proof, hash))     → hash is brute-forceable fingerprint
TEE approach: if (tee.verify(identity))    → single point of trust failure
FHE approach: if (FHE.eq(encrypted, encrypted)) → NO plaintext, ever
```

The core operation — `FHE.eq(eaddress, eaddress)` — compares two ciphertexts and produces an encrypted boolean. Neither the stored identity nor the submitted identity nor the comparison result ever materializes in plaintext on-chain. Only the threshold network can decrypt the boolean, and only after the contract explicitly authorizes it.

**This is not possible with traditional encryption** (must decrypt to compare → privacy lost at verification).
**This is not practical with ZK alone** (verifier needs plaintext hash → brute-forceable fingerprint).
**This is not safe with TEE** (single point of trust → hardware vulnerability = full exposure).
**Only FHE enables this** — encrypted comparison where both inputs and the output remain ciphertext.

---

## Why This Matters Beyond Inheritance

Inheritance is the first application — but the primitive is general-purpose:

| Application | FHE Primitive Used | What Stays Private |
|---|---|---|
| **Digital Inheritance** (this contract) | `FHE.eq(claimant, heir)` | Heir's identity until they choose to claim |
| **Encrypted Allowlists** | `FHE.eq(user, entry)` for each entry | Who is on the list |
| **Anonymous Authorization** | `FHE.eq(requestor, authorized)` | Who has permission |
| **Private DAO Membership** | `FHE.eq(voter, member)` | Member roster |
| **Confidential Access Control** | `FHE.eq(key, storedKey)` | Valid key set |

Any system that currently does `if (msg.sender == someAddress)` can be upgraded to `if (FHE.eq(encrypted_sender, encrypted_someAddress))` to gain private verification without architectural changes.

---

## FHE Operations Used (12 Distinct)

This contract uses **12 distinct FHE operations** — not just an `eaddress` wrapper:

| # | Operation | Purpose | Why It's Necessary |
|---|---|---|---|
| 1 | `FHE.asEaddress()` | Encrypt address input | Heir identity stored as ciphertext |
| 2 | `FHE.asEuint128()` | Encrypt 128-bit payload | Vault key halves protected |
| 3 | `FHE.asEuint64()` | Encrypt timestamp | Ping timing hidden — no behavioral profiling |
| 4 | `FHE.asEuint8()` | Encrypt counter | Attempt count hidden from attacker |
| 5 | **`FHE.eq()`** | **Encrypted equality** | **Core primitive — identity verification** |
| 6 | `FHE.ne()` | Encrypted inequality | State validation without plaintext |
| 7 | `FHE.gte()` | Encrypted >= comparison | Timeout threshold + attempt limit check |
| 8 | `FHE.sub()` | Encrypted subtraction | Time elapsed computation |
| 9 | `FHE.add()` | Encrypted addition | Attempt counter increment |
| 10 | **`FHE.select()`** | **Encrypted conditional** | **Replaces `require()` to prevent info leak** |
| 11 | `FHE.and()` | Compound encrypted condition | identity AND limit AND timeout — all in ciphertext |
| 12 | `FHE.not()` | Encrypted boolean negation | Invert overLimit → withinLimit |

**Plus**: `allowThis`, `allow`, `allowPublic`, `publishDecryptResult` for access control.

### The `FHE.select()` Pattern (from CipherRoll)

Traditional Solidity uses `require()` for validation, but revert messages leak information:
```solidity
// BAD: attacker learns the max attempt count from the revert
require(attempts < maxAttempts, "Max attempts reached");

// GOOD: FHE.select silently caps — no information leaked
encryptedAttempts = FHE.select(withinLimit, newCount, oldCount);
```

---

## Encrypted State — What's Hidden

| State | W1 (plaintext) | W2 (FHE-encrypted) | Privacy Gain |
|---|---|---|---|
| Heir address | `address public heir` | `eaddress private` | Identity invisible |
| Vault payload | `bytes public` | `euint128 private` x2 | Key material opaque |
| Ping timestamp | `uint256 public` | `euint64 private` | No behavioral profiling |
| Claim attempts | `uint256 public` | `euint8 private` | Attacker can't count tries |
| Timeout period | `uint256 public immutable` | `euint64 private` | DMS window hidden |
| Max attempts | `uint256 public constant` | `euint8 private` | Limit unknown to attacker |
| Verification result | `ebool` (W1 too) | `ebool` + compound `FHE.and()` | Multi-condition private |

---

## Two-Phase Claim Flow

```
Owner deploys with encrypted(heir) + encrypted(payload) + encrypted(timeout)
        │
        ▼
  [Owner calls ping() — encrypted timestamp update, no metadata leak]
        │
        ▼
  Timeout expires (verified via FHE.gte in ciphertext space)
        │
        ▼
  Heir calls initiateClaim(encryptedAddress)
        │
        ├── FHE.eq(claimerEncrypted, storedHeir)      ← identity match
        ├── FHE.gte(elapsed, encryptedTimeout)         ← timeout check
        ├── FHE.gte(attempts, maxAttempts) → FHE.not() ← attempt limit
        └── FHE.and(identity, limit, timeout)          ← compound result
        │
        ▼
  FHE.allowPublic(compoundResult) → threshold network decrypts ebool
        │
        ▼
  Heir calls finalizeClaim(true, signature)
        │
        ├── FHE.publishDecryptResult() — verify threshold signature
        └── FHE.allow(payload, verifiedHeir) — grant decryption access
        │
        ▼
  Heir decrypts 256-bit vault key via @cofhe/sdk client-side
```

---

## Quick Start

### Local development (mock CoFHE)

```bash
npm install
npm run compile    # Compiles with @cofhe/hardhat-plugin
npm test           # 24 tests passing (47 total with MultiSig)
```

### Live testnet deploy

See [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) for the full runbook.

```bash
cp .env.example .env
# Fill in PRIVATE_KEY, HEIR_ADDRESS, VAULT_KEY_HEX, ARBISCAN_API_KEY, MAX_ATTEMPTS
npm run deploy:arb-sepolia    # PRIMARY — Fhenix CoFHE flagship testnet
```

---

## Documentation

| Doc | Purpose |
|---|---|
| [`docs/ACL_LIFECYCLE.md`](docs/ACL_LIFECYCLE.md) | Every `FHE.allow*` call — when it fires, what it grants, zero pre-verification window proof |
| [`docs/PRIVACY_MODEL.md`](docs/PRIVACY_MODEL.md) | Threat model — what observers can/cannot learn, why FHE beats ZK/TEE/plaintext |
| [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) | Step-by-step testnet deploy runbook |

---

## Tech Stack

- **Fhenix CoFHE** — `eaddress`, `euint128`, `euint64`, `euint8`, `ebool` encrypted types + 12 distinct FHE operations
- **Solidity 0.8.25** — Smart contract with `@fhenixprotocol/cofhe-contracts`
- **@cofhe/sdk** — Client-side encryption (builder-pattern API, migrated from cofhejs)
- **Hardhat + @cofhe/hardhat-plugin** — Local mock CoFHE environment + testnet deploy
- **React + ethers.js** — Heir claim portal

---

## Contracts

| Contract | Purpose | Status |
|---|---|---|
| [`LastVaultFHE.sol`](src/LastVaultFHE.sol) | **Private identity verification primitive** — FHE-encrypted heir, payload, timestamps, attempts | **Wave 2** |
| [`LastVaultInheritance.sol`](src/LastVaultInheritance.sol) | Original plaintext inheritance — heir address public | Deployed on Base |
| [`LastVaultMultiSig.sol`](src/LastVaultMultiSig.sol) | Multi-signature DMS with threshold pings | Tested |

---

## Part of the LastVault Ecosystem

- **Desktop App** — .NET 9 MAUI Blazor Hybrid (Windows)
- **Mobile App** — Android (push approval, BLE pairing)
- **Hardware Security Key** — Custom USB key with secure element + NFC
- **FHE Claim Portal** — [lastvault.io/fhenix](https://lastvault.io/fhenix/)
- **Heir Portal** — [heir.lastvault.io](https://heir.lastvault.io)
- **Website** — [lastvault.io](https://lastvault.io)

---

## License

MIT License. See [LICENSE](LICENSE).

---

**Built by [Divara Technology Inc.](https://lastvault.io)** | Hasan Aytekin, Founder & CTO
