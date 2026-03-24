# LastVault Buildathon Tracker

**Last updated:** 2026-03-24
**Owner:** Hasan Aytekin — Divara Technology Inc.
**Repo:** https://github.com/lastvault-io/lastvault-contracts
**Website:** https://lastvault.io

---

## Buildathon Overview

| | Fhenix (PRIMARY) | Aleo (SECONDARY) |
|---|---|---|
| **Buildathon** | Privacy-by-Design dApp Buildathon | Build a Privacy-focused App on Aleo |
| **Grant Pool** | $50,000 | $50,000 |
| **Tech** | Solidity + FHE (CoFHE) on EVM | Leo (Rust-like) on Aleo L1 |
| **Duration** | Mar 20 — Jun 5, 2026 (5 waves) | Jan 20 — ~Apr 2026 (10 waves) |
| **AKINDO Product** | [LastVault FHE — Private Inheritance](https://app.akindo.io/communities/K8vAJg8mlHQxwELpx/products/Z4Vn3ZQe6iM1zxRW) | [LastVault DMS — Private Inheritance on Aleo](https://app.akindo.io/communities/K8vAJg8mlHQxwELpx/products/d867jMqJpCRenxVB) |
| **Buildathon Page** | https://app.akindo.io/wave-hacks/Nm2qjzEBgCqJD90W | https://app.akindo.io/wave-hacks/gXdXJvJXxTJKBELvo |
| **Telegram** | https://t.me/+rA9gI3AsW8c3YzIx | — |

---

## Fhenix — Wave Schedule

| Wave | Build Period | Deadline | Grant | Status | Deliverables |
|------|-------------|----------|-------|--------|-------------|
| **Wave 1** | Mar 21 — 28 | **Mar 28** | $3,000 | ✅ SUBMITTED | FHE contract + 7 tests + claim portal + videos |
| **Wave 2** | Mar 30 — Apr 6 | **Apr 6** | $5,000 | ⏳ NEXT | Testnet deploy + CoFHE SDK e2e flow |
| **Wave 3** | Apr 8 — May 8 | **May 8** | $12,000 | ⏳ | Multi-heir + selective disclosure + Privara |
| **Wave 4** | May 11 — 20 | **May 20** | $14,000 | ⏳ | Cross-chain bridge + institutional mode |
| **Wave 5** | May 23 — Jun 1 | **Jun 1** | $16,000 | ⏳ | Production-ready + audit + NY Tech Week |

### Wave 1 — Submitted (Mar 24)

**What we delivered:**
- `LastVaultFHE.sol` — eaddress heir, euint128 payload, 2-phase claim with FHE.eq()
- 7/7 Hardhat tests passing (CoFHE mock environment)
- React claim portal with animated demo mode
- Deploy scripts (deploy-fhe.ts + encrypt-and-deploy.ts)
- 2 demo videos (test suite + claim portal)
- 5 screenshots (contract code, privacy table, tests, portal UI)
- Full submission docs on AKINDO
- GitHub pushed + README updated

### Wave 2 — TODO (Apr 6 deadline)

- [ ] Deploy LastVaultFHE to testnet (Sepolia / Arb Sepolia / Base Sepolia)
- [ ] End-to-end CoFHE SDK flow (encrypt address client-side → claim → decrypt payload)
- [ ] Connect claim portal to live deployed contract
- [ ] Desktop app integration with Fhenix network
- [ ] Update AKINDO with testnet contract address + live demo link

### Wave 3 — TODO (May 8 deadline) — MARATHON, $12K

- [ ] Multi-heir support (encrypted heir array)
- [ ] Selective disclosure (prove identity to auditor, not public)
- [ ] Privara SDK for confidential payments
- [ ] Full React frontend with CoFHE hooks (useEncrypt, useDecrypt)

### Wave 4 — TODO (May 20 deadline)

- [ ] Cross-chain bridge (Fhenix <> Base)
- [ ] Multi-sig owner with encrypted threshold approval
- [ ] Security audit prep

### Wave 5 — TODO (Jun 1 deadline)

- [ ] Production-ready module
- [ ] NY Tech Week demo
- [ ] Security audit
- [ ] Open-source FHE inheritance library

---

## Aleo — Wave Schedule

| Wave | Period | Status |
|------|--------|--------|
| Wave 1-4 | Jan 20 — Mar 16 | ❌ MISSED |
| **Wave 5** | Mar 17 — Mar 30 | ✅ SUBMITTED |
| Wave 6 | Mar 31 — Apr 13 | ⏳ NEXT |
| Wave 7-10 | Apr 14 — ~mid Apr | ⏳ |

**Current status:** Submitted to Wave 5. No Leo code yet — Fhenix is priority.

---

## Deadline Calendar

| Date | What | Buildathon | Priority |
|------|------|------------|----------|
| **Mar 28** | Wave 1 evaluation starts | Fhenix | Check results |
| **Mar 30** | Wave 1 results + Wave 2 starts | Fhenix | Start testnet deploy |
| **Mar 30** | Aleo Wave 5 deadline | Aleo | Already submitted |
| **Apr 4** | 2 days before Wave 2 deadline | Fhenix | Must be ready |
| **Apr 6** | **WAVE 2 DEADLINE** | Fhenix | SUBMIT |
| **Apr 8** | Wave 3 Marathon starts | Fhenix | Plan big ($12K) |
| **Apr 13** | Aleo Wave 6 deadline | Aleo | Submit if time |
| **May 6** | 2 days before Wave 3 deadline | Fhenix | Must be ready |
| **May 8** | **WAVE 3 DEADLINE** | Fhenix | SUBMIT |
| **May 18** | 2 days before Wave 4 deadline | Fhenix | Must be ready |
| **May 20** | **WAVE 4 DEADLINE** | Fhenix | SUBMIT |
| **May 30** | 2 days before Wave 5 deadline | Fhenix | Must be ready |
| **Jun 1** | **WAVE 5 FINAL DEADLINE** | Fhenix | LAST SUBMIT |

---

## Links & Resources

### AKINDO
| | URL |
|---|---|
| Fhenix Product | https://app.akindo.io/communities/K8vAJg8mlHQxwELpx/products/Z4Vn3ZQe6iM1zxRW |
| Aleo Product | https://app.akindo.io/communities/K8vAJg8mlHQxwELpx/products/d867jMqJpCRenxVB |
| Fhenix Buildathon | https://app.akindo.io/wave-hacks/Nm2qjzEBgCqJD90W |
| Aleo Buildathon | https://app.akindo.io/wave-hacks/gXdXJvJXxTJKBELvo |

### Fhenix Dev
| | URL |
|---|---|
| Fhenix Docs | https://docs.fhenix.io |
| CoFHE Docs | https://cofhe-docs.fhenix.zone |
| CoFHE Quick Start | https://cofhe-docs.fhenix.zone/fhe-library/introduction/quick-start |
| Architecture | https://cofhe-docs.fhenix.zone/deep-dive/cofhe-components/overview |
| Fhenix GitHub | https://github.com/FhenixProtocol/awesome-fhenix |
| Privara SDK | https://www.npmjs.com/package/@reineira-os/sdk |
| Privara Docs | https://reineira.xyz/docs |

### Aleo Dev
| | URL |
|---|---|
| Aleo Docs | https://developer.aleo.org/ |
| Leo Language | https://developer.aleo.org/leo/ |

### Social
| | URL |
|---|---|
| Fhenix Telegram | https://t.me/+rA9gI3AsW8c3YzIx |
| Privara Telegram | https://t.me/ReineiraOS |
| Fhenix Twitter | https://x.com/fhenix |

---

## For AI Assistant (OpenClaw)

**Role:** Track buildathon deadlines. Remind Hasan via Telegram or WhatsApp.

### Reminders to Set

| Date | Time | Message |
|------|------|---------|
| Mar 28 | 10:00 | Fhenix Wave 1 evaluation started. Check AKINDO for results: https://app.akindo.io/communities/K8vAJg8mlHQxwELpx/products/Z4Vn3ZQe6iM1zxRW |
| Mar 30 | 09:00 | Fhenix Wave 2 starts TODAY. Goal: deploy contract to testnet + CoFHE SDK e2e flow. Deadline: Apr 6. |
| Apr 4 | 10:00 | Fhenix Wave 2 deadline in 2 DAYS. Is testnet deploy done? Submit update on AKINDO before Apr 6! |
| Apr 6 | 09:00 | LAST DAY — Fhenix Wave 2. Submit NOW on AKINDO. |
| Apr 8 | 10:00 | Fhenix Wave 3 Marathon starts. 30 days, $12K prize. Plan: multi-heir + selective disclosure + Privara. |
| May 6 | 10:00 | Fhenix Wave 3 deadline in 2 DAYS. Submit on AKINDO before May 8! |
| May 8 | 09:00 | LAST DAY — Fhenix Wave 3. Submit NOW. |
| May 18 | 10:00 | Fhenix Wave 4 deadline in 2 DAYS. Submit before May 20! |
| May 20 | 09:00 | LAST DAY — Fhenix Wave 4. Submit NOW. |
| May 30 | 10:00 | Fhenix FINAL Wave 5 deadline in 2 DAYS. Last chance! |
| Jun 1 | 09:00 | LAST DAY — Fhenix Wave 5 FINAL. Submit everything. |
| Apr 11 | 10:00 | Aleo Wave 6 deadline in 2 days (Apr 13). Submit if you have Leo code ready. |

### Context for Each Wave (so assistant can answer "what do I need to do?")

**Fhenix Wave 2 (Apr 6):** Deploy LastVaultFHE.sol to testnet. Use CoFHE SDK to encrypt heir address client-side, submit to contract, execute claim, decrypt payload. Connect React claim portal to live contract. Show working e2e demo.

**Fhenix Wave 3 (May 8):** Multi-heir with eaddress array. Selective disclosure — heir proves identity to specific party (lawyer, auditor) without revealing to everyone. Integrate Privara SDK for confidential payments. Full React frontend with CoFHE hooks.

**Fhenix Wave 4 (May 20):** Cross-chain bridge between Fhenix (privacy) and Base (liquidity). Institutional multi-sig owner. Security audit preparation.

**Fhenix Wave 5 (Jun 1):** Production-ready. Security audit. NY Tech Week demo showcase. Open-source the FHE inheritance library for other Fhenix developers.

**Aleo (any wave):** Need to learn Leo language and write DMS contract from scratch. Lower priority than Fhenix. Only pursue if Fhenix waves are on track.
