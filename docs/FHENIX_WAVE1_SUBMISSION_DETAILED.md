# LastVault — FHE-Encrypted Digital Inheritance on Fhenix

**Privacy-by-Design dApp Buildathon | Wave 1 Submission**
**Team:** Divara Technology Inc. | **Website:** lastvault.io

---

## 1. Project Overview

LastVault is a digital inheritance platform built on a Dead Man's Switch mechanism. It solves a problem that affects every crypto holder: **what happens to your digital assets when you die?**

The core protocol is simple but powerful:

1. **Owner** creates a vault, designates an heir, and stores an encrypted payload (seed phrases, passwords, private keys, sensitive documents).
2. **Owner pings** the contract periodically (configurable: 30/90/180/365 days) to prove they are alive.
3. **If the owner stops pinging** and the timeout expires, the designated **heir can claim** the encrypted payload.

This is not a theoretical concept. LastVault is a shipping product with a .NET MAUI desktop application, a mobile companion app, a custom hardware security key (ESP32-S3 with ATECC608B secure element), a server backend, and a working Solidity smart contract already deployed on Base.

**The problem:** every existing on-chain inheritance solution stores the heir's address in plaintext. This means anyone scanning the blockchain can see exactly who will inherit your assets — creating a privacy leak, a social engineering target, and a potential physical security risk.

**Our Wave 1 contribution:** `LastVaultFHE.sol` — the first-ever fully homomorphic encrypted inheritance contract, built on Fhenix, where the heir's identity and the vault payload are encrypted at all times, even during on-chain computation.

---

## 2. Why FHE — The Privacy Gap in Digital Inheritance

### The Problem with Transparent Blockchains

Every Dead Man's Switch or inheritance contract deployed today (Safe's Recovery Module, Inheriti, legacy multisig schemes) suffers from the same fundamental flaw: **the heir relationship is public**.

When Alice designates Bob as her heir on a transparent chain, the entire world learns:

- Bob is Alice's heir (reveals family/trust relationships)
- Bob stands to receive Alice's assets (makes Bob a target)
- The timeout period (reveals when Alice might be incapacitated)
- The payload contents or pointers (reveals what is being inherited)

This is not a minor inconvenience — it is a **structural privacy violation** that makes on-chain inheritance unsuitable for real-world use. Nobody would file a public will that the entire internet can read.

### Why FHE, Not Just Encryption

Standard approaches like ECIES or commit-reveal schemes encrypt data *at rest* but must decrypt it for any computation. If you want the contract to verify "is the claimant actually the designated heir?", you need to reveal the heir's address to the EVM — defeating the purpose.

**Fully Homomorphic Encryption changes this entirely:**

- The heir address is stored as an `eaddress` — encrypted on-chain, never revealed during storage or computation
- The equality check (`heir == msg.sender`) happens **on encrypted data** via `FHE.eq()` — the contract verifies the claim without ever seeing the plaintext address
- The payload remains as `euint128` values — encrypted during storage, during the claim verification, and only decrypted via threshold decryption after a verified claim
- There is no moment where plaintext data touches the chain

FHE does not just hide data. It enables **private logic execution** — the contract enforces rules on secrets it cannot see.

---

## 3. Technical Implementation

### Contract Architecture: `LastVaultFHE.sol`

The contract is built on Fhenix's CoFHE Solidity library (`@fhenixprotocol/cofhe-contracts`) and implements the full inheritance lifecycle with encrypted state.

#### Encrypted State Variables

```solidity
eaddress private encryptedHeir;    // Heir identity — FHE-encrypted, never visible on-chain
euint128 private payloadHi;        // Upper 128 bits of 256-bit vault key — FHE-encrypted
euint128 private payloadLo;        // Lower 128 bits of 256-bit vault key — FHE-encrypted
```

The vault key is split into two `euint128` values because Fhenix's current FHE type system supports up to 128-bit encrypted unsigned integers. Together they protect a full 256-bit symmetric key that unlocks the off-chain vault.

#### ACL-Gated Access Control

Every encrypted value is registered with Fhenix's ACL system upon creation:

```solidity
FHE.allowThis(encryptedHeir);   // Contract can compute on it
FHE.allowThis(payloadHi);
FHE.allowThis(payloadLo);
```

The payload is **never** allowed to the heir until after a successful claim verification. This is the critical invariant — even the heir cannot request decryption until the contract explicitly grants access.

#### Two-Phase Claim Flow

The claim process uses Fhenix's async threshold decryption:

**Phase 1 — `initiateClaim(InEaddress _myAddress)`**

```
1. Claimant submits their address encrypted client-side via CoFHE SDK
2. Contract verifies: block.timestamp > lastPingTimestamp + timeoutPeriod
3. FHE equality check: ebool isHeir = FHE.eq(claimerEncrypted, encryptedHeir)
4. Result marked for threshold decryption: FHE.allowPublic(heirVerificationResult)
5. Claim state transitions: Idle → Initiated
```

At this point, the chain has computed whether the claimant matches the heir — but nobody knows the result yet. Not the claimant, not validators, not observers. The `ebool` is encrypted.

**Phase 2 — `finalizeClaim(bool _isHeir, bytes _signature)`**

```
1. Threshold network delivers decrypted boolean + signature
2. FHE.publishDecryptResult verifies authentic decryption
3. If true:  FHE.allow(payloadHi, heir) + FHE.allow(payloadLo, heir)
             → Heir can now decrypt payload via CoFHE SDK
             → Claim state: Initiated → Verified
4. If false: Claim state reset to Idle, no information leaked
             → Real heir can still claim
```

This two-phase design means a failed claim attempt reveals **nothing** — the attacker does not learn whether they were close, who the real heir is, or what the payload contains.

#### Owner Management Functions

```solidity
ping()           — Resets timeout countdown. Owner calls periodically to prove liveness.
updateHeir()     — Replaces encrypted heir. Old heir loses all ACL permissions.
updatePayload()  — Replaces encrypted vault key. Also resets ping timer.
cancelClaim()    — Owner cancels a pending claim (they are alive and object).
```

#### View Helpers

```solidity
isExpired()      — True if block.timestamp > lastPing + timeout
timeRemaining()  — Seconds until timeout (0 if expired)
```

These are the only plaintext values — the timeout mechanism must be transparent so heirs know when they can initiate a claim. Everything else is encrypted.

---

## 4. Privacy Comparison

| Property | Plaintext Contract (Base) | LastVaultFHE (Fhenix) |
|---|---|---|
| Heir address | PUBLIC — visible to anyone | ENCRYPTED — `eaddress`, never revealed |
| Vault payload | `bytes public` — ECIES blob readable | FHE-encrypted `euint128` pair — opaque |
| Claim verification | `require(msg.sender == heir)` — plaintext | `FHE.eq()` — encrypted comparison |
| Failed claim attempt | Heir was already public anyway | Reveals NOTHING — not even whether the guess was close |
| Observer knowledge | Sees owner, heir, timeout, payload | Sees owner, timeout only. Heir + payload fully hidden |
| Heir discovery | Trivial — read contract storage | Computationally infeasible — FHE lattice security |
| Social engineering risk | High — heir identity is public | Eliminated — nobody knows who the heir is |
| MEV/front-running | Possible — bots see heir tx in mempool | Mitigated — claim input is encrypted |

---

## 5. Demo / Working Demonstration

### What is Live Today (Production)

- **Plaintext Solidity contract** deployed on Base mainnet
- **LastVault Desktop App** (Windows/macOS) — .NET MAUI Blazor Hybrid
- **LastVault Mobile App** (iOS/Android) — companion for heir claims
- **Hardware Security Key** — ESP32-S3 + ATECC608B + ST25R3916 NFC
- **Server Backend** — ASP.NET Core, PostgreSQL, Stripe, Telegram bot
- **Patent Filed** — Turkish Patent Office, 4 independent claims (WIPO/PCT ready)

### Wave 1 Deliverable

1. **`LastVaultFHE.sol`** — Complete FHE inheritance contract
   - Compiles with Solidity 0.8.25+, Cancun EVM
   - Uses `@fhenixprotocol/cofhe-contracts`: `eaddress`, `euint128`, `ebool`
   - Full ACL pattern: `allowThis`, `allowPublic`, `allow`

2. **Test Suite** — 7 passing tests
   - Privacy verification: heir/payload NOT exposed in ABI
   - Side-by-side comparison: original public contract vs FHE private contract
   - ABI and event signature verification
   - CoFHE mock contracts deployed via `@cofhe/hardhat-plugin`

3. **React Claim Portal** — Heir-facing web UI
   - Wallet connection (MetaMask/ethers.js)
   - Vault status dashboard showing FHE-encrypted fields
   - 3-step visual claim flow
   - Privacy comparison table

4. **Deploy Scripts** — Testnet deployment ready
   - `deploy-fhe.ts` — standard deploy
   - `encrypt-and-deploy.ts` — full CoFHE SDK encryption + deploy flow

---

## 6. Roadmap

| Wave | Timeline | Goal |
|------|----------|------|
| **Wave 1** | Mar 21-28 | FHE contract + tests + claim portal *(this submission)* |
| **Wave 2** | Mar 30 - Apr 6 | Testnet deploy + CoFHE SDK full integration |
| **Wave 3** | Apr 8 - May 8 | Multi-heir + Privara payment rails + selective disclosure |
| **Wave 4** | May 11-20 | Cross-chain bridge (Fhenix ↔ Base), institutional mode |
| **Wave 5** | May 23 - Jun 1 | Production-ready + NY Tech Week demo |

---

## 7. Team

### Hasan — Solo Founder & Full-Stack Developer
**Divara Technology Inc.**

Built the entire LastVault stack solo: desktop app, mobile app, server backend, smart contracts, hardware security key PCB design. Tech stack spans C#/.NET MAUI, Solidity, ASP.NET Core, PostgreSQL, ESP32 embedded C, KiCad.

Patent filed with 4 independent claims at the Turkish Patent Office. This is not a hackathon-only project — LastVault is a real product with a hardware device in prototype and a patent filing. The FHE contract is the natural next step — turning a working inheritance platform into a **privacy-first** inheritance platform.

---

## Summary

LastVault on Fhenix is not a proof of concept searching for a problem. It is an existing, shipping product that has identified the single biggest privacy gap in on-chain inheritance — **public heir addresses** — and is using Fully Homomorphic Encryption to eliminate it entirely.

Digital inheritance is inevitable. Private digital inheritance requires FHE. LastVault is building both.

---

*LastVault — Your secrets survive you. Privately.*

**Website:** lastvault.io | **Patent:** TR Patent Office (WIPO/PCT pending) | **Company:** Divara Technology Inc.
