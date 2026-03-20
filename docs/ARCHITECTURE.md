# LastVault Technical Architecture

> Decentralized Digital Inheritance with Hardware-Backed Security

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Inheritance Flow](#inheritance-flow)
3. [Cryptographic Primitives](#cryptographic-primitives)
4. [Smart Contract Architecture](#smart-contract-architecture)
5. [Standalone Claim Tool](#standalone-claim-tool)
6. [Supported Chains](#supported-chains)
7. [Security Model](#security-model)

---

## 1. System Overview

LastVault employs a 4-layer defense-in-depth security model. Each layer operates independently, so compromise of any single layer does not expose vault contents.

```
+========================================================================+
|                                                                        |
|  LAYER 4: SMART CONTRACT INHERITANCE                                   |
|  ┌──────────────────────────────────────────────────────────────────┐  |
|  │  Dead Man's Switch (DMS) + ECIES-encrypted payload on-chain     │  |
|  │  Owner pings periodically; timeout triggers heir claim window   │  |
|  │  Payload: ECIES(heir_pubkey, vault_recovery_bundle)             │  |
|  └──────────────────────────────────────────────────────────────────┘  |
|                                                                        |
|  LAYER 3: ENCRYPTED VAULT                                              |
|  ┌──────────────────────────────────────────────────────────────────┐  |
|  │  AES-256-GCM encrypted vault file                               │  |
|  │  Shamir SSS: K-of-N threshold key splitting                     │  |
|  │  Dual-TOTP Decoy: real vault vs plausible-deniability vault     │  |
|  └──────────────────────────────────────────────────────────────────┘  |
|                                                                        |
|  LAYER 2: CONTEXT-AWARE KEY DERIVATION                                 |
|  ┌──────────────────────────────────────────────────────────────────┐  |
|  │  HKDF-SHA256 with environmental context vector                  │  |
|  │  Reed-Solomon error correction for GPS/MAC drift tolerance      │  |
|  │  Fuzzy Extractor for biometric/environmental entropy            │  |
|  └──────────────────────────────────────────────────────────────────┘  |
|                                                                        |
|  LAYER 1: PHYSICAL HARDWARE                                            |
|  ┌──────────────────────────────────────────────────────────────────┐  |
|  │  Custom microcontroller with secure element                      │  |
|  │  Hardware-isolated ECDSA signing + FIDO2 key storage            │  |
|  │  NFC controller (CTAP2 over NFC + USB HID)                     │  |
|  │  Encrypted flash storage                                        │  |
|  └──────────────────────────────────────────────────────────────────┘  |
|                                                                        |
+========================================================================+
```

### Layer Interactions

```
  ┌─────────────┐     ┌─────────────────┐     ┌───────────────┐
  │  Hardware    │────>│  Key Derivation  │────>│  Encrypted    │
  │  Key (L1)   │     │  Pipeline (L2)   │     │  Vault (L3)   │
  └─────────────┘     └─────────────────┘     └───────┬───────┘
                                                       │
                                                       v
                                              ┌───────────────┐
                                              │  Smart Contract│
                                              │  Payload (L4)  │
                                              └───────────────┘
```

**Layer 1 -- Physical Hardware:** The custom hardware key stores FIDO2 credentials and ECDSA signing keys inside a dedicated secure element. Private keys never leave the chip. Communication occurs over USB HID or NFC (CTAP2 protocol).

**Layer 2 -- Context-Aware Key Derivation:** The master vault key is not stored directly. Instead, it is derived at unlock time using HKDF-SHA256 with a context vector composed of hardware attestation, location data, and user secrets. Reed-Solomon coding tolerates minor environmental drift (GPS accuracy, rotating MAC addresses). A fuzzy extractor handles noisy biometric or environmental inputs.

**Layer 3 -- Encrypted Vault:** Vault contents are encrypted with AES-256-GCM. The encryption key can be split via Shamir Secret Sharing (K-of-N) across multiple shares distributed to heirs, devices, or cloud backups. A dual-TOTP mechanism supports plausible deniability: one TOTP seed unlocks the real vault, another unlocks a decoy vault with plausible but non-sensitive content.

**Layer 4 -- Smart Contract Inheritance:** A Dead Man's Switch contract holds an ECIES-encrypted payload on-chain. The owner pings the contract periodically to prove liveness. If the timeout elapses, heirs can claim the payload, decrypt it with their private key, and recover the vault.

---

## 2. Inheritance Flow

### Normal Operation

```
  Owner                        Smart Contract                 Blockchain
    │                               │                             │
    │  deployVault(config)          │                             │
    │──────────────────────────────>│  Store encrypted payload    │
    │                               │────────────────────────────>│
    │                               │                             │
    │  ping() [every N days]        │                             │
    │──────────────────────────────>│  Reset timeout counter      │
    │                               │────────────────────────────>│
    │                               │                             │
    │  ping() [automatic via app]   │                             │
    │──────────────────────────────>│  Reset timeout counter      │
    │                               │────────────────────────────>│
    │                               │                             │
```

### Inheritance Trigger

```
  Owner (inactive)     Smart Contract       Heir                  Claim Tool
    │                       │                 │                       │
    │  [timeout elapsed]    │                 │                       │
    │                       │                 │                       │
    │                       │  CLAIMABLE      │                       │
    │                       │<────────────────│  checkStatus()        │
    │                       │                 │                       │
    │                       │                 │  claim()              │
    │                       │<────────────────│──────────────────────>│
    │                       │                 │                       │
    │                       │  Return ECIES   │                       │
    │                       │  encrypted blob │                       │
    │                       │────────────────>│                       │
    │                       │                 │                       │
    │                       │                 │  ECIES decrypt with   │
    │                       │                 │  heir private key     │
    │                       │                 │<──────────────────────│
    │                       │                 │                       │
    │                       │                 │  Recover vault keys   │
    │                       │                 │  + access vault       │
    │                       │                 │<──────────────────────│
    │                       │                 │                       │
```

### Step-by-Step Inheritance Process

1. **Vault Deployment:** Owner creates a vault and selects heirs. The desktop app generates an ECIES-encrypted recovery bundle using each heir's public key and deploys it to the smart contract along with DMS parameters (timeout period, ping interval).

2. **Periodic Pings:** The LastVault desktop application automatically pings the contract at configured intervals (default: every 30 days). Each ping resets the inactivity timer. Manual pings are also supported.

3. **Timeout Expiry:** If the owner fails to ping within the configured timeout window, the contract transitions to `CLAIMABLE` state. This is irreversible until the owner pings again (if within a grace period) or the heir completes the claim.

4. **Heir Claim:** The heir (or anyone with the heir's wallet) calls `claim()` on the contract. The contract verifies the caller matches the registered heir address and releases the ECIES-encrypted payload.

5. **ECIES Decryption:** The heir uses their private key to decrypt the payload. This can be done entirely client-side using the standalone claim tool (no LastVault servers required).

6. **Vault Recovery:** The decrypted payload contains the vault recovery bundle -- sufficient cryptographic material to reconstruct the vault encryption key and access the vault contents.

---

## 3. Cryptographic Primitives

### ECIES (Elliptic Curve Integrated Encryption Scheme)

Used for encrypting the inheritance payload so only the designated heir can decrypt it.

```
  Encryption (Owner):
  ┌──────────────────────────────────────────────────────────────────┐
  │                                                                  │
  │  1. Generate ephemeral key pair (e, E = e*G) on secp256k1       │
  │  2. Compute shared secret: S = e * heir_pubkey                  │
  │  3. Derive keys: (enc_key, mac_key) = HKDF-SHA256(S)           │
  │  4. Encrypt: ciphertext = AES-256-GCM(enc_key, plaintext)      │
  │  5. Output: (E, ciphertext, auth_tag)                           │
  │                                                                  │
  └──────────────────────────────────────────────────────────────────┘

  Decryption (Heir):
  ┌──────────────────────────────────────────────────────────────────┐
  │                                                                  │
  │  1. Parse ephemeral public key E from payload                   │
  │  2. Compute shared secret: S = heir_privkey * E                 │
  │  3. Derive keys: (enc_key, mac_key) = HKDF-SHA256(S)           │
  │  4. Decrypt: plaintext = AES-256-GCM_dec(enc_key, ciphertext)  │
  │                                                                  │
  └──────────────────────────────────────────────────────────────────┘
```

- **Curve:** secp256k1 (Ethereum-native, hardware wallet compatible)
- **KDF:** HKDF-SHA256 with application-specific info string
- **AEAD:** AES-256-GCM (128-bit auth tag)

### Shamir Secret Sharing (SSS)

Splits the vault master key into N shares, any K of which can reconstruct the original secret.

```
  Master Key ──> SSS Split (K=3, N=5)
                    │
        ┌───────┬───┴───┬───────┬───────┐
        v       v       v       v       v
     Share 1  Share 2  Share 3  Share 4  Share 5
     (Heir A) (Heir B) (Device) (Cloud)  (Paper)

  Any 3 shares ──> SSS Reconstruct ──> Master Key
```

- **Field:** GF(2^8) -- operations in Galois Field with 256 elements
- **Polynomial:** Random polynomial of degree K-1 with secret as constant term
- **Share format:** (x, y) coordinate pairs where x is the share index
- **Security:** Information-theoretic security; fewer than K shares reveal zero information about the secret

### Reed-Solomon Error Correction

Provides tolerance for environmental drift in context-aware key derivation.

```
  Context Vector Components:
  ┌────────────────────┬──────────────────┬─────────────────┐
  │  GPS Coordinates   │  WiFi MAC/BSSID  │  Hardware ID    │
  │  (±50m tolerance)  │  (rotating MACs) │  (stable)       │
  └────────────────────┴──────────────────┴─────────────────┘
                           │
                           v
              Reed-Solomon Encode/Decode
              (tolerates up to T symbol errors)
                           │
                           v
              Stable context fingerprint
```

- **Symbol size:** 8 bits (GF(2^8))
- **Error tolerance:** Configurable based on expected drift magnitude
- **Use case:** Allows vault unlocking even when GPS has minor drift or network environment changes slightly

### HKDF-SHA256 (HMAC-based Key Derivation Function)

Derives cryptographic keys from environmental context and user secrets.

```
  Input Keying Material (IKM):
    hardware_attestation || user_password || context_vector

  HKDF-Extract:
    PRK = HMAC-SHA256(salt, IKM)

  HKDF-Expand:
    OKM = HMAC-SHA256(PRK, info || 0x01) || HMAC-SHA256(PRK, T1 || info || 0x02) || ...

  Output: 256-bit vault encryption key
```

### Dual-TOTP Decoy Mechanism

Provides plausible deniability under coercion.

```
  TOTP Seed A (Real)  ──> Generates OTP ──> Unlocks REAL vault
  TOTP Seed B (Decoy) ──> Generates OTP ──> Unlocks DECOY vault

  Both vaults appear identical in structure.
  Decoy vault contains plausible but non-sensitive data.
  No cryptographic evidence distinguishes which is "real."
```

- **Algorithm:** RFC 6238 TOTP (HMAC-SHA1, 6-digit, 30-second window)
- **Key property:** Given only one TOTP code, an adversary cannot determine whether it unlocks the real or decoy vault
- **Heir awareness:** Heirs are informed which seed is real via the ECIES-encrypted inheritance payload

---

## 4. Smart Contract Architecture

### Contract State Machine

```
                    deployVault()
                         │
                         v
                ┌─────────────────┐
                │                 │
                │     ACTIVE      │<──────────────────────┐
                │                 │                        │
                └────────┬────────┘                        │
                         │                                 │
                    [timeout]                          ping()
                         │                            (within grace)
                         v                                 │
                ┌─────────────────┐                        │
                │                 │────────────────────────┘
                │   CLAIMABLE     │
                │                 │
                └────────┬────────┘
                         │
                    claim()
                    (by verified heir)
                         │
                         v
                ┌─────────────────┐
                │                 │
                │    CLAIMED      │
                │                 │
                └────────┬────────┘
                         │
                    [optional]
                    reClaim()
                         │
                         v
                ┌─────────────────┐
                │                 │
                │   RE-CLAIMED    │
                │                 │
                └─────────────────┘
```

### Contract States

| State | Description | Allowed Actions |
|-------|-------------|-----------------|
| `ACTIVE` | Owner is alive and pinging | `ping()`, `updateConfig()`, `updatePayload()` |
| `CLAIMABLE` | Timeout elapsed, awaiting heir | `claim()`, `ping()` (grace period only) |
| `CLAIMED` | Heir has claimed the payload | `reClaim()`, read payload |
| `RE-CLAIMED` | Heir re-claimed (e.g., after key rotation) | Read payload |

### Gas Analysis

| Operation | Estimated Gas | Cost (at 30 gwei, ETH L1) | Cost (Base L2) |
|-----------|--------------|---------------------------|-----------------|
| `deployVault()` | ~350,000 | ~$3.50 | ~$0.02 |
| `ping()` | ~45,000 | ~$0.45 | ~$0.001 |
| `claim()` | ~120,000 | ~$1.20 | ~$0.005 |
| `updatePayload()` | ~80,000 | ~$0.80 | ~$0.003 |
| `reClaim()` | ~90,000 | ~$0.90 | ~$0.004 |

> Gas estimates are approximate. L2 costs assume typical Base/Arbitrum fee levels. Actual costs vary with network congestion.

### Multi-Chain Deployment Strategy

```
                    ┌──────────────────────┐
                    │   Deployment Script  │
                    │   (Foundry + Forge)  │
                    └──────────┬───────────┘
                               │
            ┌──────────────────┼──────────────────┐
            │                  │                  │
            v                  v                  v
     ┌─────────────┐   ┌─────────────┐   ┌─────────────┐
     │    Base      │   │  Arbitrum   │   │  Polygon    │
     │  (Primary)   │   │  (Secondary)│   │  (Secondary)│
     └─────────────┘   └─────────────┘   └─────────────┘
```

- **Primary chain:** Base (lowest fees, Coinbase ecosystem, broad wallet support)
- **Contract standard:** Same Solidity source deployed across all chains via `CREATE2` for deterministic addresses
- **Verification:** Contracts verified on Etherscan/Basescan/Arbiscan at deploy time
- **Upgrade path:** Immutable contracts (no proxy pattern) -- new versions deployed as new contracts, migration tooling provided

---

## 5. Standalone Claim Tool

The standalone claim tool ensures heirs can recover vault contents even if LastVault (the company) ceases to exist. It is a fully client-side, zero-dependency web application.

### How It Works

```
  ┌─────────────────────────────────────────────────────────────┐
  │                    STANDALONE CLAIM TOOL                     │
  │                   (Static HTML + JS)                         │
  │                                                              │
  │  ┌─────────────┐    ┌──────────────┐    ┌───────────────┐  │
  │  │  Connect     │───>│  Read Chain   │───>│  ECIES        │  │
  │  │  Wallet      │    │  Contract     │    │  Decrypt      │  │
  │  │  (heir key)  │    │  (RPC call)   │    │  (Web Crypto) │  │
  │  └─────────────┘    └──────────────┘    └───────┬───────┘  │
  │                                                  │          │
  │                                          ┌───────v───────┐  │
  │                                          │  Display      │  │
  │                                          │  Recovery     │  │
  │                                          │  Bundle       │  │
  │                                          └───────────────┘  │
  │                                                              │
  │  NO backend servers. NO API calls. NO tracking.             │
  │  Runs entirely in the browser.                               │
  └─────────────────────────────────────────────────────────────┘
```

### Cryptographic Verification Flow

1. **Wallet Connection:** Heir connects their Ethereum wallet (MetaMask, WalletConnect, or any EIP-1193 provider). The tool verifies the connected address matches a registered heir on-chain.

2. **Contract Read:** The tool calls the contract's `getPayload()` function via a public RPC endpoint (Alchemy, Infura, or any Ethereum JSON-RPC node). This is a read-only call -- no gas required.

3. **ECIES Decryption:** The encrypted payload is decrypted entirely in the browser:
   - Parse the ephemeral public key from the payload header
   - Request an ECDH shared secret computation from the wallet (via `eth_getEncryptionPublicKey` or manual key export)
   - Derive AES-256-GCM key via HKDF-SHA256 using the Web Crypto API
   - Decrypt the payload using `SubtleCrypto.decrypt()` with AES-256-GCM

4. **Recovery Bundle Display:** The decrypted recovery bundle is displayed to the heir. It contains the vault encryption key (or Shamir shares) and instructions for vault recovery.

### Browser-Based ECIES via Web Crypto API

```javascript
// Simplified flow (conceptual)
// 1. Import heir's private key
const heirKey = await crypto.subtle.importKey("raw", heirPrivBytes, { name: "ECDH", namedCurve: "P-256" }, false, ["deriveBits"]);

// 2. Compute ECDH shared secret
const shared = await crypto.subtle.deriveBits({ name: "ECDH", public: ephemeralPubKey }, heirKey, 256);

// 3. HKDF key derivation
const aesKey = await crypto.subtle.deriveKey({ name: "HKDF", hash: "SHA-256", salt, info }, sharedKeyMaterial, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);

// 4. AES-GCM decrypt
const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, aesKey, ciphertext);
```

> Note: The production implementation uses secp256k1 (not P-256) for Ethereum compatibility, using a lightweight JS library for the ECDH step since Web Crypto does not natively support secp256k1.

### Offline Capability

The claim tool can be saved as a single HTML file and run offline. The only network requirement is a single JSON-RPC call to read the contract state. This call can be made manually (e.g., via `curl`) and the result pasted into the tool.

---

## 6. Supported Chains

| Chain | Type | Chain ID | Status | Explorer | Notes |
|-------|------|----------|--------|----------|-------|
| **Base** | L2 (OP Stack) | 8453 | Primary | basescan.org | Default deployment chain, lowest fees |
| **Ethereum** | L1 | 1 | Supported | etherscan.io | Highest security, higher gas costs |
| **Arbitrum One** | L2 (Nitro) | 42161 | Supported | arbiscan.io | Large DeFi ecosystem |
| **Polygon PoS** | Sidechain | 137 | Supported | polygonscan.com | Wide adoption, low fees |
| **Optimism** | L2 (OP Stack) | 10 | Supported | optimistic.etherscan.io | OP Stack compatibility with Base |
| **Avalanche C-Chain** | L1 | 43114 | Planned | snowtrace.io | Sub-second finality |

### Chain Selection Criteria

- **Immutability:** Only chains with strong finality guarantees (no reorgs after confirmation)
- **RPC availability:** Multiple public and commercial RPC providers must exist for standalone claim tool
- **Wallet support:** MetaMask, WalletConnect, and major hardware wallets must support the chain
- **Longevity:** Preference for chains with strong ecosystem backing and long-term viability (critical for inheritance use case spanning years/decades)

---

## 7. Security Model

### Threat Model

LastVault is designed to protect against the following threats:

| Threat | Mitigation |
|--------|------------|
| **Server compromise** | No secrets stored server-side. ECIES payload on-chain. Vault encrypted client-side. |
| **Hardware key theft** | Secure element prevents key extraction. FIDO2 user presence required. |
| **Coercion / duress** | Dual-TOTP decoy vault provides plausible deniability. |
| **Key loss** | Shamir SSS distributes recovery across multiple parties/locations. |
| **Environmental change** | Reed-Solomon + fuzzy extractor tolerate GPS/MAC/biometric drift. |
| **Chain censorship** | Multi-chain deployment. Standalone claim tool works with any RPC. |
| **LastVault disappears** | Standalone claim tool is fully client-side. Contracts are immutable on-chain. |
| **Heir impersonation** | Heir address verified on-chain. ECIES requires heir's private key. |
| **Front-running** | Claim transaction can only succeed from registered heir address. |
| **Quantum computing** | Future consideration: migration path to post-quantum ECIES (CRYSTALS-Kyber). |

### Trust Assumptions

```
  TRUSTED:
  ┌──────────────────────────────────────────────────────────────┐
  │  - Ethereum / L2 consensus (chain finality)                  │
  │  - secp256k1 / AES-256-GCM / SHA-256 (cryptographic prims)  │
  │  - Secure element hardware isolation                          │
  │  - Heir's private key management (wallet security)           │
  └──────────────────────────────────────────────────────────────┘

  NOT TRUSTED:
  ┌──────────────────────────────────────────────────────────────┐
  │  - LastVault servers (zero-knowledge architecture)           │
  │  - Network layer (all payloads encrypted end-to-end)        │
  │  - RPC providers (read-only, verifiable via Merkle proofs)  │
  │  - Browser environment (secrets never persist in memory)     │
  └──────────────────────────────────────────────────────────────┘
```

### What Happens If LastVault Disappears

This is the critical design constraint for an inheritance product. LastVault is engineered so that the company's existence is **not required** for heir recovery.

```
  LastVault Shutdown Scenario:
  ┌─────────────────────────────────────────────────────────────────┐
  │                                                                 │
  │  1. Smart contracts remain on-chain (immutable, no admin key)  │
  │  2. ECIES payloads remain on-chain (stored in contract state)  │
  │  3. Standalone claim tool works offline (static HTML/JS)       │
  │  4. Any Ethereum RPC node can serve contract reads             │
  │  5. Heir needs only: their wallet + the contract address       │
  │                                                                 │
  │  Recovery path:                                                 │
  │  Heir wallet ──> Public RPC ──> Contract read ──> ECIES decrypt│
  │                                                                 │
  │  No LastVault servers involved at any step.                    │
  │                                                                 │
  └─────────────────────────────────────────────────────────────────┘
```

**Guarantees after shutdown:**

- All deployed vaults continue to function (pings are owner-initiated, not server-dependent)
- DMS timeout continues to count based on block timestamps
- Heirs can claim using any Ethereum-compatible wallet
- The standalone claim tool (open-source, archived on IPFS/GitHub) handles the full recovery flow
- No API keys, no authentication tokens, no server dependencies

---

## License

This documentation is part of the LastVault project. See [LICENSE](../LICENSE) for details.
