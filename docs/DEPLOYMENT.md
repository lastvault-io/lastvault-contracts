# LastVaultFHE — Deployment Runbook

> **Wave 2 deliverable:** Deploy `LastVaultFHE.sol` to a live Fhenix-supported testnet so the W2 submission can show a real contract address with a real transaction trail.

This runbook walks through deploying `LastVaultFHE` to **Arbitrum Sepolia**, which is the current Fhenix CoFHE flagship testnet (April 2026). Ethereum Sepolia is supported as a fallback.

---

## 0. Prerequisites

You need:
- Node.js 20+
- A wallet with some Arbitrum Sepolia ETH (≈0.05 ETH should comfortably cover deploy + verify)
- An Arbiscan API key (free from https://arbiscan.io/myapikey)
- The plaintext heir address you want to encrypt
- A 256-bit vault master key (or IPFS CID hash)

---

## 1. Install dependencies

```bash
cd lastvault-contracts
npm install
```

If you see version mismatches around `@cofhe/sdk` or `@cofhe/hardhat-plugin`, that is expected — Fhenix is iterating fast. Cross-check the SDK API in [`scripts/encrypt-and-deploy.ts`](../scripts/encrypt-and-deploy.ts) against the canonical [`FhenixProtocol/cofhe-miniapp-template`](https://github.com/FhenixProtocol/cofhe-miniapp-template) and the [CoFHE quick-start docs](https://cofhe-docs.fhenix.zone/fhe-library/introduction/quick-start) before deploying. Update the imports if the surface has changed.

---

## 2. Generate a vault key

```bash
openssl rand -hex 32
```

Copy the 64-character output. **Keep this somewhere safe** — losing it means the vault is unrecoverable. For a real production deploy, this would be the master key for an AES-encrypted IPFS payload, not just a random number.

---

## 3. Configure environment

```bash
cp .env.example .env
```

Edit `.env`:

```bash
PRIVATE_KEY=0x<your-deployer-private-key>
HEIR_ADDRESS=0x<heir-eth-address>
VAULT_KEY_HEX=<64-hex-chars-from-step-2>
TIMEOUT_SECONDS=7776000     # 90 days; use 86400 (1 day) for fast testing
ARBISCAN_API_KEY=<your-arbiscan-key>
```

> **⚠️ Never commit `.env`.** It is in `.gitignore`. Double-check before you push.

---

## 4. Fund the deployer wallet

Get Arbitrum Sepolia ETH from any of:
- https://faucet.quicknode.com/arbitrum/sepolia
- https://www.alchemy.com/faucets/arbitrum-sepolia
- Any Arbitrum Sepolia faucet that supports your wallet address

Verify balance:

```bash
npx hardhat console --network arbitrumSepolia
> const [d] = await ethers.getSigners()
> ethers.formatEther(await ethers.provider.getBalance(d.address))
```

Aim for at least **0.05 ETH** to be safe. FHE deploys are heavier than vanilla EVM deploys because the constructor includes encrypted inputs.

---

## 5. Compile

```bash
npm run compile
```

Should produce no errors. If you get errors related to `@cofhe/hardhat-plugin` or `@fhenixprotocol/cofhe-contracts`, check the package versions in `package.json` against the latest Fhenix releases.

---

## 6. Run the test suite (mock env first)

```bash
npm test
```

Expected: **all tests passing** against the local CoFHE mock environment. **Do not deploy to live testnet if any test fails.**

---

## 7. Deploy to Arbitrum Sepolia

```bash
npm run deploy:arb-sepolia
```

The script will:
1. Validate your env
2. Encrypt the heir address and both payload halves via the CoFHE SDK
3. Deploy the contract
4. Wait for confirmation
5. Print the deployed address + Arbiscan link
6. Best-effort attempt to verify on Arbiscan automatically
7. Print a JSON deployment receipt

Save the JSON receipt — you'll need it for the W2 submission.

---

## 8. If auto-verification failed

```bash
npm run verify:arb-sepolia <deployed-address> <constructor-args-file>
```

Where `<constructor-args-file>` is a JS module exporting the four constructor args as an array. Hardhat verify cannot serialize the encrypted inputs from a CLI flag, so you may need to write a small file like:

```js
// scripts/verify-args.ts
module.exports = [
  7776000,
  /* encrypted heir from deploy receipt */,
  /* encrypted payloadHi */,
  /* encrypted payloadLo */,
];
```

If verification still fails, that's OK for the W2 submission as long as the deploy tx and contract address are public. Verification is a nice-to-have, not a blocker.

---

## 9. Sanity-check the deployed contract

```bash
npx hardhat console --network arbitrumSepolia
> const v = await ethers.getContractAt("LastVaultFHE", "<deployed-address>")
> await v.owner()
> await v.timeoutPeriod()
> await v.lastPingTimestamp()
> await v.claimState()       // should be 0 (Idle)
> await v.timeRemaining()
> await v.isExpired()         // should be false right after deploy
```

If any of these revert, something is wrong with the deploy — investigate before announcing the address.

---

## 10. End-to-end claim test (recommended for W2 submission)

For the W2 submission video, you want to show a complete claim flow on testnet. Suggested setup:

1. Deploy with `TIMEOUT_SECONDS=86400` (1 day) — the contract enforces a 1-day minimum
2. Wait 1 day, OR redeploy with `TIMEOUT_SECONDS=86400` after pinging once and waiting
3. From a separate wallet (the heir wallet), encrypt the heir address client-side via the CoFHE SDK
4. Call `initiateClaim(encryptedHeirAddress)` — this triggers the FHE eq check
5. Wait for the threshold network to decrypt the result (typically a few minutes on testnet)
6. Call `finalizeClaim(true, signature)` with the threshold-decrypted result
7. From the heir wallet, use the CoFHE SDK to decrypt `payloadHi` and `payloadLo`
8. Reconstruct the 256-bit vault key by concatenating

Record this whole flow as a screen capture for the W2 submission video.

---

## 11. Update the W2 submission

After successful deploy, update:

- [`README.md`](../README.md) — add the live contract address + Arbiscan link to the FHE section
- The AKINDO submission — paste the contract address into the W2 changelog
- [`fhenix_wave2_plan.md`](../../AfterKey/docs/fhenix_wave2_plan.md) — mark P0 task #1 as done
- Lauren on Telegram — send her the contract address as the natural second-touch (she explicitly said she'd take a look)

---

## Troubleshooting

### "Deployer has zero balance"
You forgot to fund the wallet. Use a faucet.

### "VAULT_KEY_HEX must be exactly 64 hex chars"
Make sure no `0x` prefix and no whitespace.

### `FHE.eq` reverts on the test net but works locally
This usually means the deployed CoFHE infrastructure on the target chain is in a degraded state, OR you are deploying to a chain where CoFHE is not actually live. Confirm against the [Fhenix docs](https://cofhe-docs.fhenix.zone) and ask in the buildathon Telegram.

### Verification fails with "no constructor arguments provided"
Hardhat verify needs the exact constructor args. Use the JS arg-file pattern in section 8.

### "Cannot find module '@cofhe/sdk'"
Re-run `npm install`. If the package has been renamed (Fhenix has done this before), check the [official template](https://github.com/FhenixProtocol/cofhe-miniapp-template) for the current package name and update `package.json`.

---

## Appendix: Network reference

| Network | Chain ID | Status (Apr 2026) | RPC |
|---|---|---|---|
| Arbitrum Sepolia | 421614 | ✅ CoFHE live (primary) | `https://sepolia-rollup.arbitrum.io/rpc` |
| Ethereum Sepolia | 11155111 | ✅ CoFHE live | `https://rpc.sepolia.org` |
| Base Sepolia | 84532 | ⚠️ Listed in some docs — verify before use | `https://sepolia.base.org` |
| Fhenix Frontier | — | Deprecated — use CoFHE testnets above | — |

**Last updated:** Wave 2, April 2026
