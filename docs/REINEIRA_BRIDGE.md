# LastVaultFHE — ReineiraOS Escrow Bridge (Architecture)

> **Status:** Planned for Wave 3 Marathon. This document describes the architecture for integrating LastVault FHE with ReineiraOS's confidential escrow system.

---

## Overview

ReineiraOS provides `ConfidentialEscrow` and `ConfidentialCoverageManager` contracts that handle privacy-preserving fund management on Arbitrum Sepolia. LastVault FHE's claim verification result can serve as the **condition resolver** for a ReineiraOS escrow, creating a bridge between FHE identity verification and confidential fund release.

---

## Architecture

```
┌──────────────────────┐     ┌──────────────────────┐
│   LastVault FHE      │     │   ReineiraOS          │
│                      │     │                       │
│  initiateClaim()     │     │  ConfidentialEscrow   │
│       │              │     │       │               │
│  FHE.eq() → ebool    │     │  IConditionResolver   │
│       │              │     │       │               │
│  finalizeClaim()     │────▶│  checkCondition()     │
│  (verified = true)   │     │       │               │
│       │              │     │  releaseFunds()       │
│  FHE.allow(payload)  │     │       │               │
│                      │     │  Heir receives both:  │
│                      │     │  - Vault payload (FHE) │
│                      │     │  - Escrowed funds      │
└──────────────────────┘     └──────────────────────┘
```

## How It Works

1. **Owner deposits** funds into a ReineiraOS `ConfidentialEscrow`, naming the LastVault FHE contract as the condition resolver
2. **Owner deploys** LastVaultFHE with encrypted heir address and payload (existing W2 flow)
3. **Owner pings** periodically (existing W2 flow)
4. **Timeout expires** → heir initiates claim (existing W2 flow)
5. **Claim verified** → `finalizeClaim(true, sig)` sets `claimState = Verified`
6. **Escrow checks condition** → `ConfidentialEscrow` calls `IConditionResolver.checkCondition()` on LastVaultFHE
7. **LastVaultFHE returns true** (claimState == Verified) → escrow releases funds to the verified claimant
8. **Heir receives both**: FHE-decryptable vault payload AND escrowed funds

## The IConditionResolver Interface

```solidity
// Implementing the ReineiraOS condition resolver interface
interface IConditionResolver {
    function checkCondition(address beneficiary) external view returns (bool);
}

// In LastVaultFHE (planned extension):
function checkCondition(address beneficiary) external view returns (bool) {
    return claimState == ClaimState.Verified && beneficiary == claimant;
}
```

## Why This Matters

- **End-to-end encrypted inheritance**: vault key (FHE) + inheritance funds (escrow) — both released atomically on verified claim
- **No trusted intermediary**: ReineiraOS escrow + LastVault FHE claim — trustless from start to finish
- **Ecosystem integration**: uses ReineiraOS and Fhenix together, demonstrating composability between the two protocols that are core to the buildathon

## Use Cases Beyond Inheritance

The escrow bridge pattern generalizes to:
- **FHE-gated payroll**: employee proves identity via encrypted verification → salary released from escrow
- **Confidential insurance claims**: claimant proves eligibility via FHE → payout from coverage pool
- **Private bounty distribution**: solver proves they have the answer via FHE → bounty released

---

## Implementation Timeline

| Wave | Scope |
|---|---|
| **Wave 2** (current) | Architecture doc (this file) + `IConditionResolver` interface stub |
| **Wave 3 Marathon** | Full integration with `@reineira-os/sdk`, deployed `ConfidentialEscrow` instance, E2E test |
| **Wave 4-5** | Production-grade escrow flow with multi-heir support |

---

## References

- ReineiraOS Docs: https://reineira.xyz/docs
- ReineiraOS SDK: https://www.npmjs.com/package/@reineira-os/sdk
- Lendi implementation (reference): https://github.com/InformalProof/documentation
- LastVault FHE contract: [`../src/LastVaultFHE.sol`](../src/LastVaultFHE.sol)

**Last updated:** Wave 2, April 2026
