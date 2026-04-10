# LastVaultFHE — Privacy Model

> **Purpose:** Explain *why* heir verification on encrypted data is meaningfully different from "encrypted at rest" inheritance — and what an external observer can and cannot learn at every stage of the contract lifecycle.
>
> **Audience:** Fhenix reviewers who scored Wave 1 a 6/10 on Privacy Architecture. The implementation was already there in W1; this doc makes the *threat model* explicit.

---

## 1. The problem with "transparent inheritance"

Most on-chain inheritance contracts work like this:

```solidity
address public heir;
bytes public encryptedPayload;

function claim() external {
    require(msg.sender == heir);
    require(block.timestamp > lastPing + timeout);
    // ... return payload
}
```

This design has three privacy holes that have nothing to do with cryptography:

1. **The heir is publicly indexed.** Anyone can query the contract and learn who inherits. For high-net-worth users, naming an heir on-chain is a kidnapping risk against the heir.
2. **The relationship is publicly observable.** Even if names are pseudonymous, the *graph* of (owner → heir) leaks. Address clustering services correlate this with off-chain identity.
3. **The verification step itself leaks.** `msg.sender == heir` is a plaintext comparison. If the heir's address ever appears in any other contract or transaction, the inheritance link becomes searchable.

Encrypting the payload at rest does **not** fix any of these. The heir address still has to be checked in plaintext for `claim()` to work — which means the address must live on-chain in plaintext somewhere.

This is the gap LastVaultFHE closes.

---

## 2. The LastVaultFHE design — encrypted verification, not just encrypted storage

The key insight: **the heir address never appears in plaintext on-chain at any point in the contract lifecycle.** Not at deployment, not during pings, not during claims, not after verification.

The address lives only as `eaddress` ciphertext. When a claimant submits their address to `initiateClaim`, it is *also* encrypted client-side, and the contract performs an **encrypted equality check** using FHE:

```solidity
heirVerificationResult = FHE.eq(claimerEncrypted, encryptedHeir);
```

Both operands are ciphertexts. The FHE library produces an `ebool` ciphertext as the result — also opaque. The contract never sees the plaintext heir address, the plaintext claimant address (as an FHE input), or the plaintext result of the comparison. Only the threshold network can decrypt the `ebool`, and only after the contract explicitly authorizes it via `FHE.allowPublic`.

This is **fundamentally different** from "store encrypted, decrypt to compare." The comparison itself is the privacy boundary, not the storage.

---

## 3. The decryption flow in detail

```
┌─────────────┐                                    ┌─────────────┐
│   Owner     │  encrypts heir + payload           │ LastVaultFHE│
│   wallet    │ ───────────────────────────────►   │   contract  │
└─────────────┘  (CoFHE SDK, client-side)          └──────┬──────┘
                                                          │
                                              stores eaddress + euint128 x2
                                              all marked allowThis
                                                          │
                                                          ▼
                          ┌────────────────────────────────────────┐
                          │  Idle — owner pings periodically        │
                          │  (no encrypted state changes)           │
                          └────────────────────────────────────────┘
                                                          │
                                       timeout expires    │
                                                          ▼
┌─────────────┐                                    ┌─────────────┐
│  Claimant   │  encrypts their address            │ initiateClaim│
│   wallet    │ ───────────────────────────────►   │              │
└─────────────┘  (CoFHE SDK, client-side)          └──────┬──────┘
                                                          │
                                          FHE.eq(encrypted, encrypted)
                                                  ↓
                                          ebool ciphertext
                                                  ↓
                                          FHE.allowPublic(ebool)
                                                          │
                                                          ▼
                          ┌────────────────────────────────────────┐
                          │  Threshold network decrypts ebool       │
                          │  (off-chain, multi-party)               │
                          │  Produces (bool, signature)             │
                          └────────────────────────────────────────┘
                                                          │
                                                          ▼
                                                    ┌──────────────┐
                                                    │ finalizeClaim│
                                                    │ (bool, sig)  │
                                                    └──────┬───────┘
                                                           │
                                       FHE.publishDecryptResult verifies sig
                                                           │
                                          ┌────────────────┴────────────────┐
                                          │                                 │
                                       false                              true
                                          │                                 │
                                          ▼                                 ▼
                                  ┌──────────────┐                ┌──────────────────┐
                                  │ ClaimRejected│                │ FHE.allow(payload│
                                  │ state→Idle   │                │ , verifiedClaim) │
                                  │ NO permits   │                │ ClaimVerified    │
                                  └──────────────┘                └──────────────────┘
                                                                           │
                                                                           ▼
                                                                  ┌─────────────────┐
                                                                  │ Heir decrypts   │
                                                                  │ payload via SDK │
                                                                  │ (client-side)   │
                                                                  └─────────────────┘
```

The critical thing about this flow: **at no point does the contract or the chain hold a plaintext value that could leak the heir's identity.** The only plaintext that ever crosses the public boundary is the *yes/no* answer to one specific equality check, after the threshold network has explicitly authorized that specific decryption.

---

## 4. What an observer can learn at each phase

### Phase 1: Deployment

| Observer can see | Observer cannot see |
|---|---|
| Owner's address (msg.sender) | Heir's identity |
| Timeout period | Vault payload contents |
| Existence of encrypted state slots | Any plaintext that maps to those slots |
| Contract bytecode | Anything decrypted |

### Phase 2: Idle pings

| Observer can see | Observer cannot see |
|---|---|
| `lastPingTimestamp` updates | Whether the heir address has been changed since deploy |
| Frequency of pings | Whether the payload has been rotated |
| `Pinged` event emissions | Any encrypted state |

A long-running observer can build a profile of "this owner pings every 7 days at roughly 10am UTC" — that's a metadata leak, but it leaks *owner* metadata, not heir metadata. The heir is still hidden.

### Phase 3: After `initiateClaim`

| Observer can see | Observer cannot see |
|---|---|
| `ClaimInitiated(claimant, timestamp)` | Whether the claimant is actually the heir |
| The plaintext `claimant` address (it's `msg.sender`) | The result of the FHE eq check (until threshold decrypts) |
| That `claimAttempts` incremented | The encrypted heir address |

This is the **only** public-facing leak in the design: the *attempted* claimant's address becomes public when they call `initiateClaim`. There is a deliberate trade-off here — making the claimant fully anonymous would require routing the call through a relayer or aggregator, which adds W3-scope complexity. For W2, we accept that the claim attempt is visible but the *outcome* and the *identity match* are not.

> **Why this trade-off is acceptable:** A wrong claimant gains nothing by claiming. The result they reveal is "I am not the heir" — which is information *about themselves*, not about the actual heir. The actual heir's identity is only revealed if and when the actual heir decides to claim. They control the disclosure timing.

### Phase 4: After threshold decryption (off-chain)

The threshold network produces `(bool result, bytes signature)`. The signature is a multi-party threshold signature — no single node can forge it. The result and signature are submitted to `finalizeClaim`.

| Observer can see | Observer cannot see |
|---|---|
| The transaction calling `finalizeClaim` | The signature's internal threshold structure |
| The boolean argument (`true` or `false`) | Why the bool is what it is (no link to plaintext heir) |

### Phase 5: After successful `finalizeClaim`

| Observer can see | Observer cannot see |
|---|---|
| `ClaimVerified(verifiedClaimant, timestamp)` event | The plaintext payload |
| That `verifiedClaimant` is now the heir | The 256-bit vault key, even though they know who the heir is |
| State has terminal-shifted to `Verified` | Anything inside the vault |

**Important:** at this point the observer *does* learn the heir's identity — because the heir publicly executed `finalizeClaim` with their own wallet. There is no way around this in the current design: someone has to call the function. **The privacy guarantee is not "the heir is forever unknown," it is "the heir is unknown until they choose to claim."** The asymmetry is critical:

- During the owner's lifetime: heir is fully hidden
- After the owner's death: heir reveals themselves *only if and when* they want to inherit

For most users, this matches the real-world threat model — you want privacy *while you are alive*, because that's when the heir is at risk of being targeted as your designated successor.

---

## 5. What private verification gives you that "encrypted at rest" doesn't

| Property | Plaintext heir + encrypted payload | LastVaultFHE |
|---|---|---|
| Heir identity hidden during owner's life | ❌ on-chain in plaintext | ✅ `eaddress` ciphertext |
| Heir → owner relationship hidden | ❌ public graph | ✅ no public edge |
| Wrong claimant learns nothing about real heir | ❌ they see the heir field directly | ✅ they only learn "I am not the heir" |
| Brute-force resistance | ⚠️ N/A (heir is public) | ✅ 3-attempt cap |
| Verification reveals nothing extra | ❌ `msg.sender == heir` is a plaintext compare | ✅ `FHE.eq` on ciphertexts |
| Owner can change heir privately | ❌ visible state change | ✅ encrypted state change |

The fifth row is the one most people miss. In a plaintext design, you have to do *something* to check whether `msg.sender` is the heir, and that something always involves revealing the heir field. With FHE, the check itself happens in ciphertext space — the plaintext heir never has to materialize.

---

## 6. What this design does NOT promise

Being explicit about limits is part of the privacy model:

1. **The claimant's address is public when they call `initiateClaim`.** They expose themselves the moment they attempt a claim. (Deliberate W2 trade-off; W3 stretch goal: relayer-based claim init.)
2. **The owner's pings are public.** Long-running pattern analysis can profile owner behavior. Mitigation is product-level (LastVault desktop can use rotating relayers), not contract-level.
3. **The threshold network is trusted.** The privacy of the FHE eq result depends on the Fhenix threshold network not being fully compromised. This is a Fhenix protocol assumption, not a LastVaultFHE assumption.
4. **Side channels.** Gas consumption of `initiateClaim` is roughly constant regardless of whether the eq returns true or false (FHE is, by design, oblivious to the plaintext). But timing of *threshold network response* could leak some metadata. We do not currently model this as in-scope for W2.
5. **No anonymity for the owner.** This contract hides the *heir*, not the owner. The owner is the deployer, and their address is permanently linked to the contract. If you need owner anonymity, deploy through a privacy-preserving relayer — that's outside this contract's scope.

The honest framing: LastVaultFHE makes inheritance **structurally private during the owner's life** and **selectively disclosed by the heir at claim time**. It is not a universal anonymity tool, and does not pretend to be.

---

## 7. Why this matters beyond inheritance

Encrypted verification — performing a comparison without revealing either operand — is a primitive that generalizes far beyond dead-man's switches:

- **Encrypted whitelists** — "is this address allowed?" without revealing who is allowed
- **Encrypted auctions** — "is this bid the highest?" without revealing bid amounts
- **Encrypted KYC checks** — "does this user satisfy the criteria?" without revealing the criteria or the user's data
- **Confidential governance** — "did this address vote yes?" without revealing the vote until aggregation

LastVaultFHE is one concrete instance of the pattern. The W3 Marathon scope explores generalizing the verification primitive — `FHE.eq` over `eaddress` is the simplest case; multi-heir threshold (`N-of-M`) and selective disclosure to executors require more interesting FHE compositions.

---

## 8. Reviewer questions, answered

**Q: Why split the payload into two `euint128` instead of one larger encrypted blob?**
A: Fhenix CoFHE's largest plaintext type is `euint256` for native arithmetic, and as of April 2026 the encrypted IO surface for arbitrary-length blobs is not first-class. Splitting a 256-bit master key into two 128-bit halves is a clean fit for `euint128` and avoids encoding the payload as a series of bits. For larger payloads (e.g. wrapping an IPFS CID + AES key + nonce), the same pattern extends to N-chunk encrypted storage.

**Q: Why use `FHE.allowPublic` on the ebool result instead of `FHE.allow(threshold_network_address)`?**
A: `FHE.allowPublic` is the canonical way to mark a ciphertext as eligible for threshold decryption in the Fhenix CoFHE design. The threshold network monitors `allowPublic` events. There is no single "threshold network address" — the network is multi-party.

**Q: What stops a malicious threshold network from decrypting the payload directly?**
A: Two things. First, the contract never grants `FHE.allowPublic` on the payload — only on the ebool result. Second, the payload's decryption requires `FHE.allow(payload, recipient)`, which is only ever called inside `finalizeClaim` with `recipient = verifiedClaimant`. The threshold network sees no path to grant itself a payload permit.

**Q: What if the owner deploys with a wrong heir encryption (e.g. all-zero ciphertext)?**
A: That would lock the vault permanently — no claimant could ever match the encrypted zero address (unless they encrypt the zero address themselves, in which case they "win" the eq check but they still need to call `finalizeClaim` and produce a legitimate threshold signature for `eq(zero, zero) == true`, which would in fact succeed). The contract trusts the deployer to provide a correct encryption. A future hardening would be a constructor-time round-trip self-test, but that has gas implications.

---

## Appendix: References

- ACL lifecycle write-up: [`ACL_LIFECYCLE.md`](./ACL_LIFECYCLE.md)
- Contract: [`../src/LastVaultFHE.sol`](../src/LastVaultFHE.sol)
- Fhenix CoFHE protocol overview: https://cofhe-docs.fhenix.zone/deep-dive/cofhe-components/overview
- Fhenix CoFHE quick start: https://cofhe-docs.fhenix.zone/fhe-library/introduction/quick-start

**Last updated:** Wave 2, April 2026
**Maintainer:** Hasan Aytekin / Divara Technology Inc.
