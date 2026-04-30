import { useState } from 'react'

/**
 * Wave3Panel — Multi-Heir + Selective Disclosure + Confidential Escrow
 *
 * Demonstrates the Wave 3 contract suite via four interactive sub-tabs:
 *   1. Multi-Heir setup    (N-of-M with encrypted weights)
 *   2. Recovery session    (declarants accumulate weight)
 *   3. Auditor view        (decrypt selective disclosures)
 *   4. Escrow release      (FHE-gated payment)
 */

type W3SubTab = 'overview' | 'multiheir' | 'session' | 'auditor' | 'escrow'

export function Wave3Panel() {
  const [tab, setTab] = useState<W3SubTab>('overview')

  return (
    <div className="w3-panel">
      <div className="w3-header">
        <h2>Wave 3 — Multi-Heir + Selective Disclosure + ReineiraOS Bridge</h2>
        <p className="w3-subtitle">
          N-of-M threshold inheritance with encrypted weights · Auditor permits without identity disclosure ·
          Confidential escrow released by FHE claim verification
        </p>
      </div>

      <nav className="w3-subtabs">
        {(['overview', 'multiheir', 'session', 'auditor', 'escrow'] as W3SubTab[]).map((t) => (
          <button
            key={t}
            className={tab === t ? 'w3-subtab active' : 'w3-subtab'}
            onClick={() => setTab(t)}
          >
            {t === 'overview' && 'Overview'}
            {t === 'multiheir' && 'Multi-Heir'}
            {t === 'session' && 'Recovery'}
            {t === 'auditor' && 'Auditor'}
            {t === 'escrow' && 'Escrow'}
          </button>
        ))}
      </nav>

      <div className="w3-content">
        {tab === 'overview' && <OverviewSection />}
        {tab === 'multiheir' && <MultiHeirSection />}
        {tab === 'session' && <SessionSection />}
        {tab === 'auditor' && <AuditorSection />}
        {tab === 'escrow' && <EscrowSection />}
      </div>
    </div>
  )
}

function OverviewSection() {
  return (
    <div className="w3-card">
      <h3>What's New in Wave 3</h3>

      <div className="w3-feature-grid">
        <FeatureCard
          icon="◈"
          title="Multi-Heir Threshold"
          desc="N-of-M heirs with encrypted weights (euint8). Recovery requires the sum of presenting heirs' weights to exceed an ENCRYPTED threshold. Even insiders don't know the threshold."
          ops={['FHE.add (weight accumulation)', 'FHE.gte (threshold check)', 'FHE.eq (per-heir match)']}
        />
        <FeatureCard
          icon="◇"
          title="Selective Disclosure"
          desc="Auditors verify 'claim was processed correctly' WITHOUT learning heir identity or payload. FHE permits gate per-field decryption. Owner-controlled identity disclosure."
          ops={['FHE.allow (per-auditor permit)', 'FHE.select (encrypted aggregates)', 'FHE.add (verified count)']}
        />
        <FeatureCard
          icon="◆"
          title="Encrypted Allowlist"
          desc="Reusable Solidity library extracting FHE.eq(eaddress, eaddress) into a generic primitive. Powers private DAO membership, anonymous authorization, confidential whitelists."
          ops={['FHE.eq (membership match)', 'FHE.not (boolean negation)', 'FHE.and (compound queries)']}
        />
        <FeatureCard
          icon="◊"
          title="ReineiraOS Bridge"
          desc="ConfidentialEscrow holds funds against an encrypted beneficiary commitment. Released only when the FHE inheritance verifier confirms a valid claim AND the releaser matches the beneficiary."
          ops={['FHE.eq (beneficiary check)', 'FHE.and (compound auth)', 'External verifier integration']}
        />
      </div>

      <div className="w3-card-inner" style={{ marginTop: 24 }}>
        <h4>Architectural Progression</h4>
        <ul className="w3-progression">
          <li><span className="w3-tag wave1">W1</span> 3 FHE operations · Single heir · Plaintext metadata</li>
          <li><span className="w3-tag wave2">W2</span> 12 FHE operations · Encrypted timestamps + counters · Compound verification · FHE.select</li>
          <li><span className="w3-tag wave3">W3</span> 12+ ops with new compositions · Multi-party threshold · Auditor permits · Cross-contract verification · Reusable library</li>
        </ul>
      </div>
    </div>
  )
}

function MultiHeirSection() {
  const [heirs, setHeirs] = useState<{ address: string; weight: number }[]>([
    { address: '0xAA...spouse', weight: 50 },
    { address: '0xBB...child1', weight: 25 },
    { address: '0xCC...child2', weight: 25 },
  ])
  const [threshold] = useState(60)
  const [newAddr, setNewAddr] = useState('')
  const [newWeight, setNewWeight] = useState(20)

  function addHeir() {
    if (newAddr && newWeight > 0) {
      setHeirs([...heirs, { address: newAddr, weight: newWeight }])
      setNewAddr('')
      setNewWeight(20)
    }
  }

  function removeHeir(idx: number) {
    setHeirs(heirs.filter((_, i) => i !== idx))
  }

  const totalWeight = heirs.reduce((s, h) => s + h.weight, 0)
  const recoverable = totalWeight >= threshold

  return (
    <div className="w3-card">
      <h3>Multi-Heir with Encrypted Weights</h3>
      <p className="w3-desc">
        Each heir has an encrypted weight (euint8). The recovery threshold (sum of weights required) is also
        encrypted (euint8). On-chain observers see only the COUNT of heirs — not WHO they are or HOW MUCH
        weight each one has.
      </p>

      <div className="w3-heir-list">
        {heirs.map((h, i) => (
          <div key={i} className="w3-heir-row">
            <span className="w3-heir-idx">#{i}</span>
            <span className="w3-heir-addr">{h.address}</span>
            <span className="w3-heir-weight">
              weight: <code>FHE.encrypt({h.weight})</code>
            </span>
            <button className="w3-btn-mini" onClick={() => removeHeir(i)}>×</button>
          </div>
        ))}
      </div>

      <div className="w3-add-heir">
        <input
          type="text"
          placeholder="Heir address (0x...)"
          value={newAddr}
          onChange={(e) => setNewAddr(e.target.value)}
        />
        <input
          type="number"
          min="1"
          max="100"
          value={newWeight}
          onChange={(e) => setNewWeight(parseInt(e.target.value) || 0)}
        />
        <button className="w3-btn" onClick={addHeir}>Add Heir (encrypted)</button>
      </div>

      <div className="w3-stats">
        <div className="w3-stat">
          <label>Total weight (plaintext sum, off-chain only)</label>
          <strong>{totalWeight}</strong>
        </div>
        <div className="w3-stat">
          <label>Threshold (encrypted on-chain)</label>
          <strong className="w3-encrypted">FHE.encrypt({threshold})</strong>
        </div>
        <div className="w3-stat">
          <label>Recovery feasible?</label>
          <strong className={recoverable ? 'w3-ok' : 'w3-warn'}>
            {recoverable ? 'YES — sum >= threshold' : 'NO — increase weights or lower threshold'}
          </strong>
        </div>
      </div>

      <div className="w3-code">
        <h4>Smart contract call</h4>
        <pre>{`// Each addHeir() call:
const [encAddr, encWeight] = await client
  .encryptInputs([
    Encryptable.address(heir.address),
    Encryptable.uint8(BigInt(heir.weight))
  ])
  .execute()

await multiHeir.addHeir(encAddr, encWeight)
// On-chain: eaddress + euint8 stored. Order/values invisible.`}</pre>
      </div>
    </div>
  )
}

function SessionSection() {
  const [session, setSession] = useState<{
    active: boolean
    declarants: string[]
    accumulatedWeight: number
    threshold: number
    finalized: boolean
  }>({ active: false, declarants: [], accumulatedWeight: 0, threshold: 60, finalized: false })

  function startSession() {
    setSession({
      ...session,
      active: true,
      declarants: ['0xAA...spouse'],
      accumulatedWeight: 50,
      finalized: false,
    })
  }

  function declareNext(name: string, weight: number) {
    setSession({
      ...session,
      declarants: [...session.declarants, name],
      accumulatedWeight: session.accumulatedWeight + weight,
    })
  }

  function finalize() {
    setSession({ ...session, finalized: true })
  }

  function reset() {
    setSession({ active: false, declarants: [], accumulatedWeight: 0, threshold: 60, finalized: false })
  }

  const thresholdMet = session.accumulatedWeight >= session.threshold

  return (
    <div className="w3-card">
      <h3>Recovery Session — Encrypted Weight Accumulation</h3>
      <p className="w3-desc">
        Heirs declare presence one at a time. Each declaration adds the heir's encrypted weight to the running
        total via FHE.add(). The accumulator is checked against the encrypted threshold via FHE.gte() — but
        the comparison stays in ciphertext until finalize.
      </p>

      {!session.active && (
        <button className="w3-btn primary" onClick={startSession}>
          Start Recovery Session (heir #0 declares)
        </button>
      )}

      {session.active && (
        <>
          <div className="w3-session">
            <div className="w3-session-row">
              <label>Active</label>
              <span className="w3-ok">YES</span>
            </div>
            <div className="w3-session-row">
              <label>Declarants ({session.declarants.length})</label>
              <span>{session.declarants.join(', ')}</span>
            </div>
            <div className="w3-session-row">
              <label>Accumulated weight (encrypted on-chain)</label>
              <span className="w3-encrypted">FHE.add(...) = {session.accumulatedWeight}</span>
            </div>
            <div className="w3-session-row">
              <label>Threshold check (encrypted)</label>
              <span className="w3-encrypted">FHE.gte(weights, {session.threshold}) → {thresholdMet ? 'true' : 'false'}</span>
            </div>
          </div>

          {!session.finalized && (
            <div className="w3-actions">
              {!session.declarants.includes('0xBB...child1') && (
                <button className="w3-btn" onClick={() => declareNext('0xBB...child1', 25)}>
                  Declare child1 (weight 25)
                </button>
              )}
              {!session.declarants.includes('0xCC...child2') && (
                <button className="w3-btn" onClick={() => declareNext('0xCC...child2', 25)}>
                  Declare child2 (weight 25)
                </button>
              )}
              <button
                className={thresholdMet ? 'w3-btn primary' : 'w3-btn'}
                onClick={finalize}
              >
                Finalize (threshold network decryption)
              </button>
            </div>
          )}

          {session.finalized && (
            <div className={thresholdMet ? 'w3-result w3-ok' : 'w3-result w3-warn'}>
              <h4>{thresholdMet ? 'Recovery Authorized' : 'Threshold Not Met'}</h4>
              <p>
                {thresholdMet
                  ? 'Compound ebool decrypted as TRUE. Payload access granted to session initiator via FHE.allow().'
                  : 'Compound ebool decrypted as FALSE. Session reset. No information about WHICH condition failed leaks.'}
              </p>
              <button className="w3-btn" onClick={reset}>Reset Demo</button>
            </div>
          )}
        </>
      )}

      <div className="w3-code">
        <h4>FHE accumulation logic</h4>
        <pre>{`function declareHeir(InEaddress _myAddress) external {
    // Compute encrypted weight contribution (FHE.eq + FHE.select)
    euint8 contribution = _computeWeightContribution(_myAddress);

    // Add to encrypted accumulator
    accumulatedWeight = FHE.add(accumulatedWeight, contribution);

    // Threshold check stays encrypted
    ebool thresholdMet = FHE.gte(accumulatedWeight, encryptedThreshold);
    // ... continue to finalize for threshold decryption
}`}</pre>
      </div>
    </div>
  )
}

function AuditorSection() {
  const [attestations] = useState([
    { idx: 0, kind: 'VaultDeployed', verified: true, party: 'FHE.encrypt(0xowner)', timestamp: 'block 1' },
    { idx: 1, kind: 'HeirAdded', verified: true, party: 'FHE.encrypt(0xspouse)', timestamp: 'block 5' },
    { idx: 2, kind: 'Pinged', verified: true, party: 'FHE.encrypt(0xowner)', timestamp: 'block 100' },
    { idx: 3, kind: 'ClaimInitiated', verified: false, party: 'FHE.encrypt(0xstranger)', timestamp: 'block 500' },
    { idx: 4, kind: 'ClaimVerified', verified: true, party: 'FHE.encrypt(0xspouse)', timestamp: 'block 1000' },
  ])

  const [auditorPermit, setAuditorPermit] = useState<'none' | 'verified-only' | 'full'>('none')

  return (
    <div className="w3-card">
      <h3>Auditor View — Selective Disclosure</h3>
      <p className="w3-desc">
        Auditors verify the integrity of an inheritance event WITHOUT learning the heir's identity. The
        contract grants per-field FHE permits: <code>verified</code> bool can be decrypted by any auditor;
        <code> involvedParty</code> requires explicit per-attestation disclosure by the owner.
      </p>

      <div className="w3-permit-selector">
        <label>Your auditor permit level:</label>
        <select value={auditorPermit} onChange={(e) => setAuditorPermit(e.target.value as any)}>
          <option value="none">No permit (public observer)</option>
          <option value="verified-only">Verified-only permit (compliance auditor)</option>
          <option value="full">Full permit (court order / legal)</option>
        </select>
      </div>

      <table className="w3-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Event Kind</th>
            <th>Verified?</th>
            <th>Party Involved</th>
            <th>Block</th>
          </tr>
        </thead>
        <tbody>
          {attestations.map((a) => (
            <tr key={a.idx}>
              <td>{a.idx}</td>
              <td>{a.kind}</td>
              <td>
                {auditorPermit === 'none' ? (
                  <span className="w3-encrypted">[encrypted]</span>
                ) : (
                  <span className={a.verified ? 'w3-ok' : 'w3-warn'}>
                    {a.verified ? 'YES' : 'NO'}
                  </span>
                )}
              </td>
              <td>
                {auditorPermit === 'full' ? (
                  <code>{a.party.replace('FHE.encrypt(', '').replace(')', '')}</code>
                ) : (
                  <span className="w3-encrypted">{a.party}</span>
                )}
              </td>
              <td>{a.timestamp}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="w3-aggregate">
        <h4>Encrypted aggregate query: countVerifiedOfKind(ClaimVerified)</h4>
        <p>
          {auditorPermit !== 'none' ? (
            <>
              Sum computed in ciphertext via FHE.select + FHE.add chain:
              <strong> {attestations.filter((a) => a.kind === 'ClaimVerified' && a.verified).length}</strong>
            </>
          ) : (
            <span className="w3-encrypted">[FHE.encrypt(...)] — request a permit to decrypt</span>
          )}
        </p>
      </div>

      <div className="w3-code">
        <h4>SelectiveDisclosure permit grant</h4>
        <pre>{`// Owner grants verified-only access to auditor
disclosure.grantAuditorPermit(auditor.address);

// Owner explicitly discloses identity per-attestation (court order)
disclosure.discloseIdentity(attestationIdx, auditor.address);

// Auditor decrypts via @cofhe/sdk threshold network
const verified = await client.decryptForView(verifiedHandle, FheTypes.Bool)
  .withPermit(permit)
  .execute();`}</pre>
      </div>
    </div>
  )
}

function EscrowSection() {
  const [escrow, setEscrow] = useState<{
    funded: boolean
    amount: number
    verifierClaim: boolean
    releaseInitiated: boolean
    released: boolean
  }>({
    funded: true,
    amount: 0.5,
    verifierClaim: false,
    releaseInitiated: false,
    released: false,
  })

  return (
    <div className="w3-card">
      <h3>ConfidentialEscrow — ReineiraOS Bridge</h3>
      <p className="w3-desc">
        Funds are held against an encrypted beneficiary commitment. Release requires both:
        (1) the linked inheritance verifier reports a valid claim, and (2) the releaser's encrypted
        address matches the encrypted beneficiary AND the verifier's recorded claimant via FHE.eq
        composed with FHE.and.
      </p>

      <div className="w3-escrow-state">
        <div className="w3-stat">
          <label>Escrow status</label>
          <strong className={escrow.funded ? 'w3-ok' : 'w3-warn'}>
            {escrow.funded ? `FUNDED (${escrow.amount} ETH)` : 'EMPTY'}
          </strong>
        </div>
        <div className="w3-stat">
          <label>Beneficiary</label>
          <span className="w3-encrypted">FHE.encrypt(0x...)</span>
        </div>
        <div className="w3-stat">
          <label>Verifier signal</label>
          <strong className={escrow.verifierClaim ? 'w3-ok' : 'w3-warn'}>
            {escrow.verifierClaim ? 'CLAIM VERIFIED' : 'NO CLAIM YET'}
          </strong>
        </div>
        <div className="w3-stat">
          <label>Released</label>
          <span>{escrow.released ? 'YES' : 'NO'}</span>
        </div>
      </div>

      <div className="w3-actions">
        {!escrow.verifierClaim && (
          <button
            className="w3-btn"
            onClick={() => setEscrow({ ...escrow, verifierClaim: true })}
          >
            1. Simulate inheritance claim verified
          </button>
        )}
        {escrow.verifierClaim && !escrow.releaseInitiated && (
          <button
            className="w3-btn primary"
            onClick={() => setEscrow({ ...escrow, releaseInitiated: true })}
          >
            2. Initiate release (FHE.eq + FHE.and authorization)
          </button>
        )}
        {escrow.releaseInitiated && !escrow.released && (
          <button
            className="w3-btn primary"
            onClick={() => setEscrow({ ...escrow, released: true })}
          >
            3. Finalize release (threshold network confirms)
          </button>
        )}
        {escrow.released && (
          <div className="w3-result w3-ok">
            <h4>Released</h4>
            <p>
              {escrow.amount} ETH transferred to the verified beneficiary. The release event is on-chain
              (necessary for settlement) but the trail of encrypted commitments leaves no link to the heir's
              identity.
            </p>
          </div>
        )}
      </div>

      <div className="w3-code">
        <h4>Compound authorization</h4>
        <pre>{`function initiateRelease(InEaddress _myAddress) external {
    require(verifier.isClaimVerified(), "Claim not verified");

    // Encrypted releaser must match BOTH:
    //   1. The configured beneficiary
    //   2. The verifier's recorded claimant
    eaddress releaserEnc = FHE.asEaddress(_myAddress);
    ebool identityMatch = FHE.eq(releaserEnc, encryptedBeneficiary);
    ebool verifierMatch = FHE.eq(releaserEnc, verifier.getVerifiedClaimant());
    ebool authorized = FHE.and(identityMatch, verifierMatch);

    // Single ebool to threshold network — observer learns nothing
    FHE.allowPublic(authorized);
}`}</pre>
      </div>
    </div>
  )
}

function FeatureCard({
  icon,
  title,
  desc,
  ops,
}: {
  icon: string
  title: string
  desc: string
  ops: string[]
}) {
  return (
    <div className="w3-feature-card">
      <div className="w3-feature-icon">{icon}</div>
      <h4>{title}</h4>
      <p>{desc}</p>
      <div className="w3-feature-ops">
        {ops.map((op) => (
          <span key={op} className="w3-op-chip">{op}</span>
        ))}
      </div>
    </div>
  )
}
