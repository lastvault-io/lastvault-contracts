import { useState } from 'react'

/**
 * Wave5Panel — Cross-Chain Relay + FHE Multi-Sig + Auditor SDK + NPM Package
 *
 * Showcases the final Wave 5 deliverables:
 *   1. Cross-Chain Claim Relay (source/destination architecture)
 *   2. Encrypted Institutional Multi-Sig (eaddress[] signers + hidden threshold)
 *   3. Auditor TypeScript SDK
 *   4. @lastvault/encrypted-allowlist npm package
 */

type W5SubTab = 'overview' | 'crosschain' | 'multisig' | 'sdk' | 'npm'

const W5_MULTI_SIG_ADDRESS = import.meta.env.VITE_W5_MULTI_SIG_ADDRESS || '0x...'
const W5_RELAY_SOURCE = import.meta.env.VITE_W5_RELAY_SOURCE || '0x...'
const W5_RELAY_DEST = import.meta.env.VITE_W5_RELAY_DEST || '0x...'

export function Wave5Panel() {
  const [tab, setTab] = useState<W5SubTab>('overview')

  return (
    <div className="w5-panel">
      <div className="w5-header">
        <h2>Wave 5 — Cross-Chain + FHE Multi-Sig + NPM Package + Auditor SDK</h2>
        <p className="w5-subtitle">
          The final wave. Cross-chain trigger relay shipping verified claims to liquidity chains ·
          Institutional multi-sig with encrypted signers and hidden threshold ·
          EncryptedAllowlist as a reusable npm primitive · Auditor SDK with one-import API.
        </p>
      </div>

      <nav className="w5-subtabs">
        {(['overview', 'crosschain', 'multisig', 'sdk', 'npm'] as W5SubTab[]).map((t) => (
          <button
            key={t}
            className={tab === t ? 'w5-subtab active' : 'w5-subtab'}
            onClick={() => setTab(t)}
          >
            {t === 'overview' && 'Overview'}
            {t === 'crosschain' && 'Cross-Chain'}
            {t === 'multisig' && 'FHE Multi-Sig'}
            {t === 'sdk' && 'Auditor SDK'}
            {t === 'npm' && 'NPM Package'}
          </button>
        ))}
      </nav>

      <div className="w5-content">
        {tab === 'overview' && <OverviewSection />}
        {tab === 'crosschain' && <CrossChainSection />}
        {tab === 'multisig' && <MultiSigSection />}
        {tab === 'sdk' && <AuditorSDKSection />}
        {tab === 'npm' && <NpmPackageSection />}
      </div>
    </div>
  )
}

function OverviewSection() {
  return (
    <div className="w5-card">
      <h3>The Final Wave</h3>
      <p className="w5-desc">
        Wave 5 ships four deliverables that complete the LastVault FHE suite:
      </p>

      <div className="w5-feature-grid">
        <W5Card
          icon="⇄"
          title="Cross-Chain Trigger Relay"
          desc="Source-chain FHE inheritance emits a ClaimVerifiedSignal event. Off-chain relayers deliver to the destination chain (Base Sepolia for high liquidity). Destination ConfidentialEscrow contracts settle based on the relayed signal. Encrypted state stays on source — only the boolean signal crosses."
          ops={['CrossChainClaimRelay.sol', 'Replay protection', 'Multi-relayer support']}
        />
        <W5Card
          icon="◐"
          title="Encrypted FHE Multi-Sig"
          desc="Institutional governance with FHE-encrypted signer identities (eaddress[]) and a hidden encrypted threshold (euint8). Composes with Wave 3 multi-heir to form full encrypted institutional inheritance: encrypted owners controlling a vault with encrypted heirs."
          ops={['LastVaultFHEMultiSig.sol', 'Proposal/Approve/Finalize', '4 action kinds']}
        />
        <W5Card
          icon="◇"
          title="Auditor TypeScript SDK"
          desc="Reduces auditor onboarding from 200+ lines of CoFHE boilerplate to three method calls: listAttestations, decryptVerifiedStatus, countVerifiedOfKind. Handles permits, expiry retries, chain config, and the CoFHE handshake under the hood."
          ops={['@lastvault/auditor-sdk', 'Permit caching', 'Auto-retry']}
        />
        <W5Card
          icon="◈"
          title="NPM Package"
          desc="EncryptedAllowlist published as @lastvault/encrypted-allowlist — the first reusable encrypted access-control primitive on Fhenix. Plus a companion auditor SDK. Both shared back to the Fhenix ecosystem for any builder to compose."
          ops={['@lastvault/encrypted-allowlist', 'README + examples', 'Production-tested']}
        />
      </div>

      <div className="w5-card-inner" style={{ marginTop: 24 }}>
        <h4>Wave 1 → 5 Journey</h4>
        <ul className="w5-progression">
          <li><span className="w5-tag wave1">W1</span> 3 FHE ops · single heir · plaintext metadata</li>
          <li><span className="w5-tag wave2">W2</span> 12 FHE ops · encrypted state machine · FHE.select · compound boolean</li>
          <li><span className="w5-tag wave3">W3</span> 4-contract institutional suite · multi-heir threshold · selective disclosure · encrypted allowlist library · ReineiraOS bridge</li>
          <li><span className="w5-tag wave5">W5</span> Cross-chain trigger relay · encrypted FHE multi-sig · auditor SDK · npm package · production hardening (160+ tests)</li>
        </ul>
      </div>

      <div className="w5-card-inner" style={{ marginTop: 16 }}>
        <h4>Hardening summary</h4>
        <ul className="w5-progression">
          <li>ReentrancyGuard applied to 4 contracts (FHE, MultiHeir, Escrow, FHEMultiSig)</li>
          <li>SECURITY_AUDIT_W5.md re-run — all findings from W3 audit resolved</li>
          <li>29 new behavioural tests on top of W3 ABI tests</li>
          <li>160+ tests passing (W1: 7 · W2: 22 · MultiSig: 18 · W3: 35 · W5 behavioural: 29 · FHE MultiSig: 25 · Cross-chain: 24)</li>
        </ul>
      </div>
    </div>
  )
}

function CrossChainSection() {
  const [phase, setPhase] = useState<'idle' | 'verifying' | 'emitted' | 'relayed' | 'released'>('idle')

  function advance() {
    if (phase === 'idle') setPhase('verifying')
    else if (phase === 'verifying') setPhase('emitted')
    else if (phase === 'emitted') setPhase('relayed')
    else if (phase === 'relayed') setPhase('released')
    else setPhase('idle')
  }

  return (
    <div className="w5-card">
      <h3>Cross-Chain Claim Relay</h3>
      <p className="w5-desc">
        Encrypted vault on Arbitrum Sepolia (FHE-enabled) → claim verified → ClaimVerifiedSignal event emitted →
        off-chain relayer delivers to Base Sepolia (high-liquidity) → ConfidentialEscrow on Base releases funds
        to the verified claimant. Encrypted heir identity stays on the source chain; only the plaintext
        claimant address crosses (necessary for settlement).
      </p>

      <div className="w5-chain-diagram">
        <div className={`w5-chain ${phase === 'verifying' || phase === 'emitted' ? 'active' : ''}`}>
          <h4>Source — Arbitrum Sepolia</h4>
          <div className="w5-chain-step">LastVaultMultiHeir</div>
          <div className="w5-chain-arrow">↓ finalizeClaim()</div>
          <div className="w5-chain-step">CrossChainClaimRelay</div>
          <div className="w5-chain-arrow">↓ emit ClaimVerifiedSignal</div>
        </div>

        <div className={`w5-chain-bridge ${phase === 'relayed' ? 'active' : ''}`}>
          <div className="w5-bridge-label">Off-chain Relayer</div>
          <div className="w5-bridge-arrow">⇨</div>
          <div className="w5-bridge-info">replay protection<br/>multi-relayer<br/>idempotent</div>
        </div>

        <div className={`w5-chain ${phase === 'relayed' || phase === 'released' ? 'active' : ''}`}>
          <h4>Destination — Base Sepolia</h4>
          <div className="w5-chain-step">CrossChainClaimRelay</div>
          <div className="w5-chain-arrow">↓ ingestClaimSignal()</div>
          <div className="w5-chain-step">ConfidentialEscrow</div>
          <div className="w5-chain-arrow">↓ finalizeRelease()</div>
          <div className="w5-chain-step success">Funds released</div>
        </div>
      </div>

      <button className="w5-btn primary" onClick={advance} style={{ marginTop: 16 }}>
        {phase === 'idle' && 'Start Demo Flow'}
        {phase === 'verifying' && 'Step 1: Source contract verifies claim →'}
        {phase === 'emitted' && 'Step 2: Source emits ClaimVerifiedSignal →'}
        {phase === 'relayed' && 'Step 3: Relayer delivers to destination →'}
        {phase === 'released' && 'Done. Click to reset.'}
      </button>

      <div className="w5-stat-grid" style={{ marginTop: 20 }}>
        <div className="w5-stat">
          <label>Source contract</label>
          <code>{W5_RELAY_SOURCE.slice(0, 10)}…</code>
        </div>
        <div className="w5-stat">
          <label>Destination contract</label>
          <code>{W5_RELAY_DEST.slice(0, 10)}…</code>
        </div>
        <div className="w5-stat">
          <label>Replay key</label>
          <code>keccak(srcChainId, vault, claimant, txHash)</code>
        </div>
      </div>

      <div className="w5-code">
        <h4>Trust model + migration path</h4>
        <pre>{`// v1: event-relay pattern
//   - Owner registers N off-chain relayers
//   - Any honest relayer can deliver the signal
//   - Replay protection: idempotent on (chainId, vault, claimant, txHash)
//   - Trust assumption: at least 1 honest relayer

// v2 (Wave 6): LayerZero V2 OApp
//   - Same IInheritanceVerifier interface on destination
//   - Trust shifts to LZ DVN config
//   - No relayer setup needed
`}</pre>
      </div>
    </div>
  )
}

function MultiSigSection() {
  const [proposal, setProposal] = useState<{
    active: boolean
    approvers: string[]
    accumulated: number
    threshold: number
    finalized: boolean
    authorised: boolean
  }>({
    active: false,
    approvers: [],
    accumulated: 0,
    threshold: 60,
    finalized: false,
    authorised: false,
  })

  function propose() {
    setProposal({
      ...proposal,
      active: true,
      approvers: ['CFO (0xAA...)'],
      accumulated: 40,
      finalized: false,
      authorised: false,
    })
  }

  function approve(name: string, weight: number) {
    setProposal({
      ...proposal,
      approvers: [...proposal.approvers, name],
      accumulated: proposal.accumulated + weight,
    })
  }

  function finalize() {
    const ok = proposal.accumulated >= proposal.threshold
    setProposal({ ...proposal, finalized: true, authorised: ok })
  }

  function reset() {
    setProposal({
      active: false,
      approvers: [],
      accumulated: 0,
      threshold: 60,
      finalized: false,
      authorised: false,
    })
  }

  return (
    <div className="w5-card">
      <h3>Encrypted Institutional Multi-Sig</h3>
      <p className="w5-desc">
        Owner-side governance with encrypted signers (eaddress[]) and a hidden encrypted threshold (euint8).
        Approvals accumulate signers' encrypted weights via FHE.add; the threshold check stays in ciphertext
        until the proposer finalizes. Composes with W3 multi-heir for fully encrypted institutional
        inheritance: encrypted owners controlling a vault with encrypted heirs.
      </p>

      <div className="w5-stat-grid">
        <div className="w5-stat">
          <label>Signers (encrypted on-chain)</label>
          <strong>3 (CFO=40, CTO=30, COO=30)</strong>
        </div>
        <div className="w5-stat">
          <label>Threshold (encrypted on-chain)</label>
          <strong className="w5-encrypted">FHE.encrypt({proposal.threshold})</strong>
        </div>
        <div className="w5-stat">
          <label>Current proposal accumulator</label>
          <strong className="w5-encrypted">{proposal.active ? `FHE.add(...) = ${proposal.accumulated}` : '—'}</strong>
        </div>
      </div>

      {!proposal.active && (
        <button className="w5-btn primary" onClick={propose} style={{ marginTop: 16 }}>
          1. CFO proposes "Ping" action (weight 40 contributed)
        </button>
      )}

      {proposal.active && !proposal.finalized && (
        <>
          <div className="w5-actions" style={{ marginTop: 16 }}>
            {!proposal.approvers.some((a) => a.startsWith('CTO')) && (
              <button className="w5-btn" onClick={() => approve('CTO (0xBB...)', 30)}>
                CTO approves (+30)
              </button>
            )}
            {!proposal.approvers.some((a) => a.startsWith('COO')) && (
              <button className="w5-btn" onClick={() => approve('COO (0xCC...)', 30)}>
                COO approves (+30)
              </button>
            )}
            <button
              className={proposal.accumulated >= proposal.threshold ? 'w5-btn primary' : 'w5-btn'}
              onClick={finalize}
            >
              Finalize (threshold network decrypts)
            </button>
          </div>

          <div className="w5-session" style={{ marginTop: 16 }}>
            <div className="w5-session-row">
              <label>Approvers ({proposal.approvers.length})</label>
              <span>{proposal.approvers.join(', ')}</span>
            </div>
            <div className="w5-session-row">
              <label>Encrypted threshold check</label>
              <span className="w5-encrypted">
                FHE.gte(accumulator, threshold) → {proposal.accumulated >= proposal.threshold ? 'true' : 'false'}
              </span>
            </div>
          </div>
        </>
      )}

      {proposal.finalized && (
        <div className={proposal.authorised ? 'w5-result ok' : 'w5-result warn'}>
          <h4>{proposal.authorised ? 'Proposal Authorised' : 'Threshold Not Met'}</h4>
          <p>
            {proposal.authorised
              ? `Compound ebool decrypted as TRUE. Action executes on the bound vault.`
              : `Compound ebool decrypted as FALSE. Proposal cancelled. No information about WHICH approver failed leaks.`}
          </p>
          <button className="w5-btn" onClick={reset}>Reset Demo</button>
        </div>
      )}

      <div className="w5-code" style={{ marginTop: 20 }}>
        <h4>Proposal lifecycle</h4>
        <pre>{`// Phase 1 — proposer
proposeAction(ActionKind.Ping, payload, encryptedAddress)

// Phase 2 — each additional signer
approveProposal(id, encryptedAddress)
  → FHE.add(accumulator, FHE.select(eq(sender, signer[i]), weight[i], 0))
  → FHE.gte(accumulator, encryptedThreshold)
  → FHE.and(isSigner, thresholdMet)

// Phase 3 — proposer finalises (after threshold decryption)
finalizeProposal(id, decryptedBool, signature)
  → if true: action executes on bound vault
  → if false: proposal cancelled, no info leak`}</pre>
      </div>

      <div className="w5-stat-grid" style={{ marginTop: 16 }}>
        <div className="w5-stat">
          <label>Live contract</label>
          <code>{W5_MULTI_SIG_ADDRESS.slice(0, 10)}…</code>
        </div>
      </div>
    </div>
  )
}

function AuditorSDKSection() {
  return (
    <div className="w5-card">
      <h3>Auditor TypeScript SDK</h3>
      <p className="w5-desc">
        Three-line audit. Reduces compliance auditor onboarding from "read 200 lines of CoFHE SDK docs"
        to a single import. Handles permit caching, expiry retries, chain config, and the CoFHE handshake
        under the hood — auditors see only the audit primitives.
      </p>

      <div className="w5-code">
        <h4>Install</h4>
        <pre>npm install @lastvault/auditor-sdk @cofhe/sdk ethers viem</pre>
      </div>

      <div className="w5-code">
        <h4>Use</h4>
        <pre>{`import { LastVaultAuditor } from '@lastvault/auditor-sdk';

const auditor = new LastVaultAuditor({
  rpcUrl: 'https://sepolia-rollup.arbitrum.io/rpc',
  disclosureAddress: '0xF23774...Dc36',
  auditorPrivateKey: process.env.AUDITOR_PK!,
});

// List all attestations (plaintext metadata only)
const attestations = await auditor.listAttestations();

// Decrypt verified status via FHE permit
const verified = await auditor.decryptVerifiedStatus(0);

// Encrypted aggregate query (FHE.select + FHE.add chain)
const totalClaims = await auditor.countVerifiedOfKind('ClaimVerified');`}</pre>
      </div>

      <div className="w5-card-inner" style={{ marginTop: 16 }}>
        <h4>What the SDK handles for you</h4>
        <ul className="w5-progression">
          <li>✓ CoFHE client initialisation with correct chain config (Arb Sepolia / Sepolia)</li>
          <li>✓ Permit fetching via getOrCreateSelfPermit + automatic retry on expiry</li>
          <li>✓ Decryption flow with proper FheTypes typing</li>
          <li>✓ Encrypted aggregate query handle resolution via staticCall</li>
          <li>✓ Compatible with both ethers and viem (peer deps)</li>
        </ul>
      </div>

      <div className="w5-card-inner" style={{ marginTop: 16 }}>
        <h4>Privacy model</h4>
        <p>
          The SDK enforces the per-field permit model of SelectiveDisclosure:
        </p>
        <ul className="w5-progression">
          <li><strong>Decryptable to all auditors:</strong> verified boolean (compliance summary)</li>
          <li><strong>Decryptable as aggregate:</strong> countVerifiedOfKind</li>
          <li><strong>NOT decryptable without explicit disclosure:</strong> involvedParty (heir identity)</li>
        </ul>
        <p>
          The auditor sees compliance state without ever learning who the heir was. Owner can selectively
          disclose identity per-attestation via discloseIdentity(idx, auditor) — the court-order pattern.
        </p>
      </div>
    </div>
  )
}

function NpmPackageSection() {
  const [copied, setCopied] = useState(false)

  function copyInstall() {
    navigator.clipboard.writeText('npm install @lastvault/encrypted-allowlist @fhenixprotocol/cofhe-contracts')
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="w5-card">
      <h3>@lastvault/encrypted-allowlist NPM Package</h3>
      <p className="w5-desc">
        The first reusable encrypted access-control primitive on Fhenix CoFHE — extracted from the
        Wave 3 LastVault inheritance suite and published as a standalone npm package. Any Fhenix
        builder can drop this into their project.
      </p>

      <div className="w5-install-box">
        <code>npm install @lastvault/encrypted-allowlist @fhenixprotocol/cofhe-contracts</code>
        <button className="w5-btn-mini" onClick={copyInstall}>
          {copied ? '✓ Copied' : 'Copy'}
        </button>
      </div>

      <div className="w5-code">
        <h4>Use as a library</h4>
        <pre>{`import {EncryptedAllowlist} from "@lastvault/encrypted-allowlist/contracts/EncryptedAllowlist.sol";

contract MyPrivateDAO {
    using EncryptedAllowlist for EncryptedAllowlist.List;
    EncryptedAllowlist.List private _members;

    function addMember(InEaddress calldata _addr) external onlyAdmin {
        _members.add(_addr);
    }

    function isMember(InEaddress calldata _query) external returns (ebool) {
        return _members.isAllowed(_query);
    }
}`}</pre>
      </div>

      <div className="w5-feature-grid" style={{ marginTop: 16 }}>
        <W5Card
          icon="◉"
          title="Private DAO Membership"
          desc="Vote without revealing your identity. Membership stored as eaddress[], verified via FHE.eq OR-reduce."
          ops={['examples/PrivateDAO.sol']}
        />
        <W5Card
          icon="◎"
          title="Confidential Whitelist"
          desc="Token-sale eligibility hidden on-chain. Common attack surface (leaked allowlists) eliminated."
          ops={['examples/ConfidentialWhitelist.sol']}
        />
        <W5Card
          icon="◍"
          title="Anonymous Authorization"
          desc="Emergency guardian whose identity stays hidden to prevent targeted attacks. Verified per-call via FHE."
          ops={['examples/AnonymousAuth.sol']}
        />
      </div>

      <div className="w5-card-inner" style={{ marginTop: 16 }}>
        <h4>Why this matters</h4>
        <p>
          Every encrypted access-control use case on Fhenix today reinvents the same FHE.eq OR-reduce
          pattern. Shipping it as a reusable library means:
        </p>
        <ul className="w5-progression">
          <li>Builders skip 200 lines of FHE boilerplate per project</li>
          <li>Battle-tested in LastVault's 4-contract production suite</li>
          <li>De Morgan OR composition documented (FHE has no native or)</li>
          <li>Gas costs published per list size (1 / 10 / 50 / 100 members)</li>
          <li>Shared back to the Fhenix ecosystem as MIT-licensed code</li>
        </ul>
      </div>
    </div>
  )
}

function W5Card({
  icon, title, desc, ops,
}: {
  icon: string
  title: string
  desc: string
  ops: string[]
}) {
  return (
    <div className="w5-feature-card">
      <div className="w5-feature-icon">{icon}</div>
      <h4>{title}</h4>
      <p>{desc}</p>
      <div className="w5-feature-ops">
        {ops.map((op) => (
          <span key={op} className="w5-op-chip">{op}</span>
        ))}
      </div>
    </div>
  )
}
