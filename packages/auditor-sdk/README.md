# @lastvault/auditor-sdk

> **Audit FHE-protected attestations in 3 lines of TypeScript.**

A focused SDK for compliance auditors, lawyers, notaries, and regulators who need to verify the integrity of LastVault inheritance flows **without learning the heir's identity**.

Built on top of [Fhenix CoFHE](https://cofhe-docs.fhenix.zone) and the LastVault [`SelectiveDisclosure`](https://github.com/lastvault-io/lastvault-contracts/blob/master/src/SelectiveDisclosure.sol) contract.

---

## Why this exists

The CoFHE SDK is powerful but learning to use it for audit-only reads takes a few hundred lines of boilerplate (permits, decryption, retry on expiry, chain config). This SDK reduces auditor onboarding to:

```typescript
import { LastVaultAuditor } from '@lastvault/auditor-sdk';

const auditor = new LastVaultAuditor({
  rpcUrl: 'https://sepolia-rollup.arbitrum.io/rpc',
  disclosureAddress: '0xF23774a8c8a4A4FdA675EA56e44Ee7B4B07fDc36',
  auditorPrivateKey: process.env.AUDITOR_PK!,
});

const attestations = await auditor.listAttestations();
const verified = await auditor.decryptVerifiedStatus(0);
const totalClaims = await auditor.countVerifiedOfKind('ClaimVerified');
```

That's it. The SDK handles permit caching, expiry retries, chain config, and the CoFHE handshake under the hood.

---

## Install

```bash
npm install @lastvault/auditor-sdk @cofhe/sdk ethers viem
```

The CoFHE SDK, ethers, and viem are listed as peer dependencies so they share versions with your existing setup.

---

## API

### `new LastVaultAuditor(config)`

Configure with RPC URL, target `SelectiveDisclosure` contract address, and the auditor's private key.

```typescript
interface AuditorConfig {
  rpcUrl: string;
  disclosureAddress: `0x${string}`;
  auditorPrivateKey: `0x${string}`;
  chainName?: 'arbitrumSepolia' | 'sepolia';  // default: arbitrumSepolia
}
```

### `await auditor.listAttestations()`

Enumerate all attestations (plaintext metadata only — kind, timestamp, context hash). Returns:

```typescript
interface AttestationMeta {
  index: number;
  timestamp: bigint;
  kind: 'VaultDeployed' | 'HeirAdded' | 'ClaimVerified' | ...;
  contextHash: `0x${string}`;
}
```

### `await auditor.decryptVerifiedStatus(attestationIdx)`

Decrypt the `verified` boolean of a specific attestation using the auditor's CoFHE permit. Automatically retries on permit expiry.

Returns `true` (event verified successfully) or `false` (event recorded as failure).

### `await auditor.countVerifiedOfKind(kind)`

Encrypted aggregate query: counts the number of attestations of a given kind where `verified == true`. The count is computed in ciphertext on-chain (`FHE.select + FHE.add` chain) and decrypted client-side using the auditor's permit.

```typescript
const totalSuccessfulClaims = await auditor.countVerifiedOfKind('ClaimVerified');
// 17
```

### `await auditor.isRegisteredAuditor()`

Convenience check whether the configured private key corresponds to an auditor registered on the contract.

---

## Privacy model

The SDK respects the per-field permit model of `SelectiveDisclosure`:

✅ **Decryptable to all auditors** — `verified` boolean per attestation (the compliance summary)
✅ **Decryptable by aggregate** — `countVerifiedOfKind` (auditor-allowed at compute time)
❌ **NOT decryptable without explicit owner disclosure** — `involvedParty` (the heir's address)

Heir identity remains encrypted on-chain even from auditors, until the vault owner explicitly calls `discloseIdentity(idx, auditor)` for a specific attestation (a court-order pattern).

---

## Live target

The SDK is built against the production `SelectiveDisclosure` deployment on Arbitrum Sepolia:

[`0xF23774a8c8a4A4FdA675EA56e44Ee7B4B07fDc36`](https://sepolia.arbiscan.io/address/0xF23774a8c8a4A4FdA675EA56e44Ee7B4B07fDc36#code) — verified

---

## License

MIT — see [LICENSE](./LICENSE).

---

## Links

- 🔗 Main repo: [lastvault-io/lastvault-contracts](https://github.com/lastvault-io/lastvault-contracts)
- 🌐 Live demo: [lastvault.io/fhenix](https://lastvault.io/fhenix)
- 📚 Companion package: [`@lastvault/encrypted-allowlist`](../encrypted-allowlist)
