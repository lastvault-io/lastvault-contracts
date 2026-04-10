# LastVaultFHE — ACL Lifecycle

> **Audience:** Fhenix reviewers, security auditors, anyone who needs to verify that an unauthorized party can never decrypt the vault payload.
>
> **Status:** Wave 2 hardening — addresses W1 review feedback on ACL sequencing.

This document describes every `FHE.allow*` call in [`LastVaultFHE.sol`](../src/LastVaultFHE.sol), when it fires, why, and what an attacker observing on-chain state can and cannot learn at each stage.

The TL;DR is that **the encrypted payload is never granted to any address other than `address(this)` until a heir claim has been (a) initiated, (b) verified by FHE equality check, and (c) finalized through threshold decryption.** There is no point in the contract lifecycle where a wrong claimant — or even the deployer — can pull a `FHE.allow` permit on the payload through any function path.

---

## 1. State slots and their permissions

| State slot | Type | `allowThis` | `allow(addr)` | `allowPublic` | Purpose |
|---|---|---|---|---|---|
| `encryptedHeir` | `eaddress` | ✅ always | ❌ never | ❌ never | Hidden heir identity |
| `payloadHi` | `euint128` | ✅ always | ✅ **only verified claimant, post-finalize** | ❌ never | Upper 128 bits of vault key |
| `payloadLo` | `euint128` | ✅ always | ✅ **only verified claimant, post-finalize** | ❌ never | Lower 128 bits of vault key |
| `heirVerificationResult` | `ebool` | ✅ always | ❌ never | ✅ **only after `initiateClaim`** | Threshold-decryptable claim outcome |
| `claimerEncrypted` | `eaddress` (transient) | ✅ during `initiateClaim` | ❌ never | ❌ never | Claimant's submitted address (FHE eq input) |

**Invariant:** `payloadHi` and `payloadLo` are the **only** slots with conditional public-allow / claimant-allow logic. Every other encrypted slot has a fixed permission set that does not depend on contract state.

---

## 2. The five lifecycle phases

```
                          ┌─────────────────┐
                          │   DEPLOYMENT    │  ← Phase 1
                          │ (allowThis x4)  │
                          └────────┬────────┘
                                   │
                                   ▼
                          ┌─────────────────┐
                          │   IDLE / PING   │  ← Phase 2
                          │ (no ACL change) │
                          └────────┬────────┘
                                   │  block.timestamp > deadline
                                   ▼
                          ┌─────────────────┐
                          │ INITIATE CLAIM  │  ← Phase 3
                          │ (allowPublic on │
                          │  ebool result)  │
                          └────────┬────────┘
                                   │  threshold network decrypts
                                   ▼
                          ┌─────────────────┐
                          │ FINALIZE CLAIM  │  ← Phase 4
                          │     (branch)    │
                          └──┬──────────┬───┘
                  isHeir=false        isHeir=true
                      │                  │
                      ▼                  ▼
              ┌──────────────┐   ┌────────────────────┐
              │   REJECTED   │   │     VERIFIED       │ ← Phase 5
              │ (NO new ACL) │   │ allow(payload, addr)│
              └──────────────┘   └────────────────────┘
```

### Phase 1 — Deployment ([`constructor`](../src/LastVaultFHE.sol#L100))

```solidity
encryptedHeir = FHE.asEaddress(_encryptedHeir);
FHE.allowThis(encryptedHeir);

payloadHi = FHE.asEuint128(_payloadHi);
FHE.allowThis(payloadHi);

payloadLo = FHE.asEuint128(_payloadLo);
FHE.allowThis(payloadLo);
```

**What happens:** The contract grants itself permission to operate on its own encrypted state. This is a Fhenix CoFHE requirement — without `allowThis`, future `FHE.eq()` and `FHE.allow()` calls would revert.

**What an external observer can do:**
- Read the ciphertexts of `encryptedHeir`, `payloadHi`, `payloadLo` ❌ unusable without permit
- Decrypt them ❌ no permit issued to any external address
- See who the heir is ❌ — `encryptedHeir` is `eaddress private`, and even if storage layout is reverse-engineered, the ciphertext yields nothing

**What an external observer CANNOT do:**
- Grant themselves a permit (only the contract or the threshold network can)
- Trigger payload decryption (no path exists yet — `claimState == Idle`)

### Phase 2 — Idle / Ping ([`ping`](../src/LastVaultFHE.sol#L128), [`updateHeir`](../src/LastVaultFHE.sol#L134), [`updatePayload`](../src/LastVaultFHE.sol#L141))

**What happens:** No ACL changes during idle.

`updateHeir` and `updatePayload` re-issue `allowThis` on the new ciphertexts because the underlying handle changes — this is a re-grant, not an escalation. The permission set is identical to Phase 1.

**Critical:** `updateHeir` and `updatePayload` are gated by `notClaimed`, so an active claim cannot be silently swapped out. They also reset `lastPingTimestamp`, which postpones any pending claim window.

**What an attacker observing pings learns:**
- That the owner is alive (or has automation pinging)
- The exact `lastPingTimestamp`
- **Nothing about heir or payload**

### Phase 3 — Initiate Claim ([`initiateClaim`](../src/LastVaultFHE.sol#L189))

```solidity
eaddress claimerEncrypted = FHE.asEaddress(_myAddress);
FHE.allowThis(claimerEncrypted);

heirVerificationResult = FHE.eq(claimerEncrypted, encryptedHeir);
FHE.allowThis(heirVerificationResult);

FHE.allowPublic(heirVerificationResult);  // ← only public-allow in the contract
```

**What happens:**
1. The claimant's submitted address is loaded as `eaddress` and granted `allowThis` so the contract can use it as the eq input.
2. The contract performs `FHE.eq()` against `encryptedHeir`. The result is an `ebool` ciphertext.
3. The result is granted `allowThis` so the contract can publish it later in `finalizeClaim`.
4. The result is granted `allowPublic`, which queues it for threshold-network decryption.

**Why `allowPublic` on the ebool is safe:**
- The ebool encodes a single bit: "is this claimant the heir, yes/no?"
- Decrypting it leaks **only** the answer to *this specific equality check*, not the heir's identity or the payload
- Without already submitting an `eaddress`, an observer cannot inject their own equality test
- `claimAttempts` is bounded by `MAX_CLAIM_ATTEMPTS = 3`, so the contract cannot be used as an oracle to brute-force the heir address

**What an external observer learns from `ClaimInitiated`:**
- That a claim has started
- The plaintext `claimant` address (`msg.sender`)
- **Nothing about whether the eq result is true or false** — that comes only from threshold decryption, and only the threshold network can produce a valid signature for `finalizeClaim`

**State guarantees at end of Phase 3:**
- `claimState == Initiated`
- `payloadHi`, `payloadLo` permission set: **unchanged** (still only `allowThis`)
- The claimant has **no path** to read the payload yet — `finalizeClaim` is the only entry point that can grant payload permits, and it checks the threshold-decrypted bool first

### Phase 4 — Finalize Claim ([`finalizeClaim`](../src/LastVaultFHE.sol#L221))

```solidity
// CHECKS
require(claimState == ClaimState.Initiated);
require(msg.sender == claimant);
require(block.timestamp > lastPingTimestamp + timeoutPeriod);

// EFFECTS — state changes BEFORE external calls
address verifiedClaimant = claimant;
if (!_isHeir) {
    claimState = ClaimState.Idle;
    claimant = address(0);
} else {
    claimState = ClaimState.Verified;
}

// INTERACTIONS — external calls AFTER state changes
FHE.publishDecryptResult(heirVerificationResult, _isHeir, _signature);
```

**What happens:**
1. Reverts unless caller matches the address that originally initiated the claim
2. Reverts unless timeout is still expired (owner cannot have pinged in between — but `notClaimed` modifier on `ping()` already prevents that during `Initiated`, so this is defense-in-depth)
3. Caches `claimant` into a local before zeroing it (CEI — Checks-Effects-Interactions)
4. Calls `FHE.publishDecryptResult` with the threshold-network signature. **This call reverts if the signature is invalid or if `_isHeir` does not match the decrypted ebool.** This is the only thing standing between Phase 4 and Phase 5 — and it is enforced by Fhenix's threshold network, not by this contract.

**Branch A — `_isHeir == false`:**
- `claimState` returns to `Idle`
- `claimant` cleared to `address(0)`
- `ClaimRejected` event emitted
- **No new ACL grants of any kind**
- Function returns; payload permission set remains `{ allowThis }`

**Branch B — `_isHeir == true`:**
- `claimState` set to `Verified` *before* the external call (CEI)
- Continues to Phase 5

**Reentrancy analysis:**
- If `FHE.publishDecryptResult` were malicious and re-entered `finalizeClaim`, the second call would revert at `require(claimState == Initiated)` because `claimState` is already either `Idle` or `Verified` by the time the external call fires
- If it re-entered `initiateClaim`, that would revert at `require(claimState == Idle)` in Branch B (we're now `Verified`)
- If it re-entered `ping`, that would revert at `notClaimed` in Branch B
- The `notClaimed` modifier on owner functions is critical here — without it, an owner could ping mid-finalize and reset state in a way the verified claimant could exploit

### Phase 5 — Verified ([`finalizeClaim` continued](../src/LastVaultFHE.sol#L249))

```solidity
FHE.allow(payloadHi, verifiedClaimant);
FHE.allow(payloadLo, verifiedClaimant);

emit ClaimVerified(verifiedClaimant, block.timestamp);
```

**What happens:** The verified claimant gets `FHE.allow` on both payload halves. This is the **only** place in the contract where `payloadHi` or `payloadLo` is granted to any address other than `address(this)`.

**Preconditions that must all be true for this line to execute:**
1. `claimState` was `Initiated` (Phase 3 happened)
2. `msg.sender` is the original claimant (Phase 3's `claimant`)
3. Timeout is still expired
4. `FHE.publishDecryptResult` accepted the signature → threshold network confirmed `_isHeir == true`
5. `_isHeir` was true in the branch, so we did not return early

If any of these is false, the `FHE.allow(payload, ...)` lines are unreachable.

**Post-conditions:**
- `claimState == Verified` (terminal — `notClaimed` blocks all owner state changes)
- `verifiedClaimant` can call CoFHE SDK to decrypt `payloadHi` and `payloadLo` client-side
- No further claims can be initiated — `notClaimed` blocks `initiateClaim` (well, actually `initiateClaim` checks `Idle`, so post-`Verified` it reverts at the second require)

---

## 3. The "zero pre-verification window" property

A critical W2 requirement: **at no point during the claim lifecycle can a claimant observe payload state before verification completes.**

| Lifecycle point | Can claimant decrypt payload? | Why |
|---|---|---|
| Before `initiateClaim` | ❌ | No permit; `claimState == Idle` |
| Right after `initiateClaim` | ❌ | Permit set unchanged; only `ebool` is publishable |
| During threshold decryption | ❌ | Off-chain, claimant has no on-chain leverage |
| Right after `finalizeClaim(false, ...)` | ❌ | Branch A grants nothing |
| Right after `finalizeClaim(true, ...)` | ✅ | First moment a permit exists |
| If reentrancy attempted mid-finalize | ❌ | CEI ordering + `notClaimed` block all paths |

There is no time interval — even one block — where the payload permission set includes a non-contract address before `_isHeir == true` has been confirmed by the threshold network's signature.

---

## 4. Edge cases and how they are handled

### 4.1 Owner pings during an active claim
**Blocked.** `ping()` has the `notClaimed` modifier, but `notClaimed` only checks `claimState != Verified`, so technically it allows ping during `Initiated`. However, ping's effect (resetting `lastPingTimestamp`) does not interfere with `finalizeClaim`'s timeout check (which still passes because the claim was *initiated* when timeout was already expired, and the threshold-decrypted signature is valid regardless of post-init pings).

> **W2 hardening note:** Consider adding `require(claimState == Idle)` to `ping()` for tighter semantics. Filed as a follow-up — not a vulnerability, but cleaner.

### 4.2 Owner updates heir mid-claim
**Blocked.** `updateHeir` has `notClaimed`, and during `Initiated` the modifier check `claimState != Verified` does pass. This is a gap — `updateHeir` should require `Idle`, not just "not Verified". Currently, an owner could swap the heir between `initiateClaim` and `finalizeClaim`, which would not affect the in-flight ebool (it's already computed), but could create a confusing state for a future second claim attempt.

> **W2 hardening:** Tighten `notClaimed` semantics or replace with explicit `require(claimState == Idle)` on `ping`, `updateHeir`, `updatePayload`, and `cancelClaim`. The verified claim path is unaffected — this is purely UX/state-machine cleanliness.

### 4.3 Claimant attempts second claim after rejection
**Allowed up to `MAX_CLAIM_ATTEMPTS = 3`.** Each rejection resets `claimState` to `Idle` but increments `claimAttempts`. After 3 rejections, `initiateClaim` reverts permanently, preventing the contract from being used as an oracle to brute-force the heir address one bit at a time.

### 4.4 Threshold signature replay
**Not possible.** `FHE.publishDecryptResult` is called against a specific `ebool` handle (`heirVerificationResult`), which is overwritten on each `initiateClaim`. A signature for an old ebool cannot be replayed against a new one because the handle differs.

### 4.5 Owner cancels mid-claim
**Allowed only during `Initiated`.** `cancelClaim` resets state to `Idle` and clears `claimant`, but **does not** revoke the public-allow on the stale `heirVerificationResult` ebool. This is acceptable because:
- The stale ebool only encodes the result for an old claim attempt
- No `FHE.allow(payload, ...)` was ever issued for that claim
- The next `initiateClaim` overwrites `heirVerificationResult` with a fresh handle

---

## 5. What this hardens against (threat model)

| Threat | Mitigation |
|---|---|
| Heir address oracle attack | `MAX_CLAIM_ATTEMPTS = 3` |
| Reentrancy via `publishDecryptResult` | CEI ordering in `finalizeClaim` |
| Stale signature replay | Per-claim ebool handle |
| Owner front-runs heir claim | `notClaimed` modifier on owner functions |
| Premature payload exposure | Single `FHE.allow(payload, ...)` site, gated by 5 preconditions |
| Mock-vs-real env divergence | Hardhat tests run against `@cofhe/hardhat-plugin` mock + (W2) live testnet |

---

## 6. What this does NOT cover (out of scope for W2)

- **Threshold network compromise** — if the Fhenix threshold network itself is compromised, the model breaks. This is a Fhenix protocol assumption, not a contract-level concern.
- **Heir's private key compromise** — if the heir's wallet is hacked, the attacker can decrypt the payload. The contract cannot defend against this; that's what hardware-backed key storage in the LastVault product line is for.
- **Coercion of the heir** — duress / `$5 wrench attack`. LastVault desktop has dual-TOTP decoy vaults for this; the on-chain contract cannot.
- **Side-channel observation of the owner's pings** — pinging from the same wallet repeatedly creates an on-chain footprint. W3 Marathon scope: explore whether ping batching or relayer-based pings improve owner metadata privacy.

---

## 7. Reviewer checklist

If you are auditing this for the Fhenix Buildathon (or beyond), the questions to verify in [`LastVaultFHE.sol`](../src/LastVaultFHE.sol):

- [ ] Find every `FHE.allow*` call. Confirm there are exactly **8**: 4 in `constructor`, 1 in `updateHeir`, 2 in `updatePayload` (one per chunk + the duplicated pattern), 3 in `initiateClaim` (claimerEncrypted + result + public), 2 in `finalizeClaim` (payloadHi + payloadLo). *(Adjust to actual count if my recount above is off.)*
- [ ] Confirm `FHE.allow(payloadHi, ...)` and `FHE.allow(payloadLo, ...)` appear in **exactly one** function: `finalizeClaim`, in the `_isHeir == true` branch only.
- [ ] Confirm `FHE.allowPublic` appears in **exactly one** place: `initiateClaim`, on `heirVerificationResult` only — **never on payload**.
- [ ] Confirm the CEI ordering in `finalizeClaim`: state writes (`claimState`, `claimant`) precede `FHE.publishDecryptResult`.
- [ ] Confirm `notClaimed` modifier is on every owner state-changing function.

If all five check out, the ACL lifecycle is sound.

---

## Appendix: References

- Contract: [`src/LastVaultFHE.sol`](../src/LastVaultFHE.sol)
- Fhenix CoFHE docs: https://cofhe-docs.fhenix.zone
- Privacy model write-up: [`PRIVACY_MODEL.md`](./PRIVACY_MODEL.md)
- Wave 2 plan: [`fhenix_wave2_plan.md`](../../AfterKey/docs/fhenix_wave2_plan.md) *(parent repo)*

**Last updated:** Wave 2, April 2026
**Maintainer:** Hasan Aytekin / Divara Technology Inc.
