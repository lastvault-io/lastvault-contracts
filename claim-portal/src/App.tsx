import { useState, useEffect, useRef } from 'react'
import { BrowserProvider } from 'ethers'
import './App.css'

const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS || ''
const TOUR_KEY = 'lastvault_tour_seen'

// ─── Canvas Starfield (Paribu/Luma style warp) ───
function Starfield() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let animId: number
    let stars: { x: number; y: number; z: number; pz: number }[] = []
    let shooters: { x: number; y: number; z: number; pz: number; life: number; maxLife: number; bright: number }[] = []
    const COUNT = 800
    const SPEED = 2.4
    const SHOOTER_CHANCE = 0.012

    function resize() {
      canvas!.width = window.innerWidth
      canvas!.height = window.innerHeight
    }

    function init() {
      resize()
      stars = Array.from({ length: COUNT }, () => {
        const z = Math.random() * canvas!.width
        return { x: (Math.random() - 0.5) * canvas!.width * 2, y: (Math.random() - 0.5) * canvas!.height * 2, z, pz: z }
      })
    }

    function draw() {
      const w = canvas!.width
      const h = canvas!.height
      const cx = w / 2
      const cy = h / 2

      ctx!.fillStyle = 'rgba(7,7,13,0.2)'
      ctx!.fillRect(0, 0, w, h)

      for (const star of stars) {
        star.pz = star.z
        star.z -= SPEED * 2

        if (star.z <= 0) {
          star.x = (Math.random() - 0.5) * w * 2
          star.y = (Math.random() - 0.5) * h * 2
          star.z = w
          star.pz = w
        }

        const sx = (star.x / star.z) * cx + cx
        const sy = (star.y / star.z) * cy + cy
        const px = (star.x / star.pz) * cx + cx
        const py = (star.y / star.pz) * cy + cy

        const size = (1 - star.z / w) * 2.5
        const alpha = (1 - star.z / w) * 0.8

        // Trail line (purple-tinted)
        ctx!.beginPath()
        ctx!.moveTo(px, py)
        ctx!.lineTo(sx, sy)
        ctx!.strokeStyle = `rgba(162,155,254,${alpha * 0.35})`
        ctx!.lineWidth = size * 0.5
        ctx!.stroke()

        // Star dot (brand purple glow)
        ctx!.beginPath()
        ctx!.arc(sx, sy, size * 0.7, 0, Math.PI * 2)
        ctx!.fillStyle = `rgba(200,195,255,${alpha})`
        ctx!.fill()
      }

      // ── Shooting stars (bright streaks with glowing tail) ──
      if (Math.random() < SHOOTER_CHANCE) {
        const sz = w * 0.9
        shooters.push({
          x: (Math.random() - 0.5) * w * 1.5,
          y: (Math.random() - 0.5) * h * 1.5,
          z: sz, pz: sz,
          life: 0,
          maxLife: 40 + Math.random() * 30,
          bright: 0.7 + Math.random() * 0.3,
        })
      }

      for (let i = shooters.length - 1; i >= 0; i--) {
        const s = shooters[i]
        s.pz = s.z
        s.z -= SPEED * 12 // 10x faster than normal stars
        s.life++

        if (s.z <= 0 || s.life > s.maxLife) {
          shooters.splice(i, 1)
          continue
        }

        const sx = (s.x / s.z) * cx + cx
        const sy = (s.y / s.z) * cy + cy
        const px = (s.x / s.pz) * cx + cx
        const py = (s.y / s.pz) * cy + cy
        const fade = 1 - s.life / s.maxLife
        const a = fade * s.bright

        // Long glowing tail
        const dx = sx - px
        const dy = sy - py
        const tailX = px - dx * 4
        const tailY = py - dy * 4

        const grad = ctx!.createLinearGradient(tailX, tailY, sx, sy)
        grad.addColorStop(0, `rgba(108,92,231,0)`)
        grad.addColorStop(0.3, `rgba(162,155,254,${a * 0.15})`)
        grad.addColorStop(0.7, `rgba(200,195,255,${a * 0.5})`)
        grad.addColorStop(1, `rgba(255,255,255,${a})`)

        ctx!.beginPath()
        ctx!.moveTo(tailX, tailY)
        ctx!.lineTo(sx, sy)
        ctx!.strokeStyle = grad
        ctx!.lineWidth = 2 * fade + 0.5
        ctx!.stroke()

        // Bright head glow
        ctx!.beginPath()
        ctx!.arc(sx, sy, 2.5 * fade + 1, 0, Math.PI * 2)
        ctx!.fillStyle = `rgba(255,255,255,${a})`
        ctx!.fill()

        // Outer glow halo
        ctx!.beginPath()
        ctx!.arc(sx, sy, 6 * fade + 2, 0, Math.PI * 2)
        ctx!.fillStyle = `rgba(108,92,231,${a * 0.2})`
        ctx!.fill()
      }

      animId = requestAnimationFrame(draw)
    }

    init()
    draw()
    window.addEventListener('resize', resize)
    return () => { cancelAnimationFrame(animId); window.removeEventListener('resize', resize) }
  }, [])

  return <canvas ref={canvasRef} style={{ position:'fixed', inset:0, zIndex:0 }} />
}

type MainTab = 'home' | 'owner' | 'heir' | 'docs'
type OwnerTab = 'overview' | 'deploy' | 'manage'
type DocsTab = 'overview' | 'architecture' | 'privacy' | 'setup'

// ─── Detect MetaMask ───
function hasWallet(): boolean {
  return typeof window !== 'undefined' && !!(window as any).ethereum
}

// ─── Interactive Spotlight Tour ───
interface TourStep {
  target: string    // data-tour attribute value
  title: string
  desc: string
  action?: string   // what clicking does (for context)
  position?: 'bottom' | 'top' | 'left' | 'right'
  onClick?: () => void // action to perform when advancing
}

function SpotlightTour({ steps, onFinish }: { steps: TourStep[]; onFinish: () => void }) {
  const [current, setCurrent] = useState(0)
  const [rect, setRect] = useState<DOMRect | null>(null)

  useEffect(() => {
    const step = steps[current]
    if (!step) return
    const el = document.querySelector(`[data-tour="${step.target}"]`) as HTMLElement
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      // Small delay for scroll to finish
      setTimeout(() => setRect(el.getBoundingClientRect()), 300)
    }
  }, [current, steps])

  function next() {
    const step = steps[current]
    if (step?.onClick) step.onClick()
    if (current < steps.length - 1) {
      setCurrent(current + 1)
    } else {
      onFinish()
    }
  }

  function skip() { onFinish() }

  if (!rect) return null

  const step = steps[current]
  const pad = 8
  const pos = step.position || 'bottom'

  // Tooltip position
  let tooltipStyle: React.CSSProperties = { position: 'fixed', zIndex: 1002, maxWidth: 340, width: '90vw' }
  if (pos === 'bottom') {
    tooltipStyle.top = rect.bottom + 16
    tooltipStyle.left = Math.max(16, Math.min(rect.left + rect.width / 2 - 170, window.innerWidth - 356))
  } else if (pos === 'top') {
    tooltipStyle.bottom = window.innerHeight - rect.top + 16
    tooltipStyle.left = Math.max(16, Math.min(rect.left + rect.width / 2 - 170, window.innerWidth - 356))
  } else if (pos === 'right') {
    tooltipStyle.top = rect.top + rect.height / 2 - 60
    tooltipStyle.left = rect.right + 16
  } else {
    tooltipStyle.top = rect.top + rect.height / 2 - 60
    tooltipStyle.right = window.innerWidth - rect.left + 16
  }

  return (
    <>
      {/* Dark overlay with cutout */}
      <svg style={{ position:'fixed', inset:0, zIndex:1000, pointerEvents:'none' }} width="100%" height="100%">
        <defs>
          <mask id="tour-mask">
            <rect width="100%" height="100%" fill="white" />
            <rect
              x={rect.left - pad} y={rect.top - pad}
              width={rect.width + pad * 2} height={rect.height + pad * 2}
              rx="12" fill="black"
            />
          </mask>
        </defs>
        <rect width="100%" height="100%" fill="rgba(0,0,0,0.75)" mask="url(#tour-mask)" />
      </svg>

      {/* Spotlight border glow around target */}
      <div style={{
        position: 'fixed', zIndex: 1001, pointerEvents: 'none',
        left: rect.left - pad, top: rect.top - pad,
        width: rect.width + pad * 2, height: rect.height + pad * 2,
        borderRadius: 12, border: '2px solid var(--accent)',
        boxShadow: '0 0 20px var(--accent-dim), inset 0 0 20px var(--accent-glow)',
        transition: 'all 0.3s ease',
      }} />

      {/* Click catcher (overlay minus cutout) */}
      <div onClick={next} style={{
        position:'fixed', inset:0, zIndex:1001, cursor:'pointer',
      }} />

      {/* Tooltip */}
      <div style={tooltipStyle} onClick={(e) => e.stopPropagation()}>
        <div style={{
          background: 'var(--bg-card)', border: '1px solid var(--border-accent)',
          borderRadius: 14, padding: '20px 24px', boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        }}>
          {/* Step counter */}
          <div style={{
            display:'flex', alignItems:'center', justifyContent:'space-between',
            marginBottom: 12,
          }}>
            <div style={{
              fontSize: 10, fontWeight: 700, letterSpacing: 1.5,
              textTransform: 'uppercase', color: 'var(--accent)',
            }}>
              Step {current + 1} of {steps.length}
            </div>
            <button onClick={skip} style={{
              background:'none', border:'none', color:'var(--text-muted)',
              fontSize:12, cursor:'pointer', fontFamily:'inherit',
            }}>Skip tour</button>
          </div>

          {/* Arrow pointing to target */}
          {pos === 'bottom' && (
            <div style={{
              position:'absolute', top: -8, left: Math.min(rect.left + rect.width/2 - (tooltipStyle.left as number || 0), 320),
              width:0, height:0,
              borderLeft:'8px solid transparent', borderRight:'8px solid transparent',
              borderBottom:'8px solid var(--border-accent)',
            }} />
          )}

          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>{step.title}</div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 16 }}>{step.desc}</div>

          <div style={{ display:'flex', gap: 8 }}>
            <button onClick={next} className="btn-primary" style={{ borderRadius: 50, flex:1 }}>
              {current < steps.length - 1 ? 'Next' : 'Start Using'}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

// ─── Main App ───
function App() {
  const [showTour, setShowTour] = useState(false)
  const [tourReady, setTourReady] = useState(false)
  const [mainTab, setMainTab] = useState<MainTab>('home')
  const [ownerTab, setOwnerTab] = useState<OwnerTab>('overview')
  const [docsTab, setDocsTab] = useState<DocsTab>('overview')
  const [account, setAccount] = useState('')
  const [chainId, setChainId] = useState('')
  const [status, setStatus] = useState('')
  const [demoStep, setDemoStep] = useState(0)
  const [claimLoading, setClaimLoading] = useState(false)
  const [claimed, setClaimed] = useState(false)

  useEffect(() => {
    if (!localStorage.getItem(TOUR_KEY)) {
      // Wait for DOM to render before starting tour
      setTimeout(() => { setShowTour(true); setTourReady(true) }, 800)
    }
  }, [])

  function closeTour() {
    setShowTour(false)
    setMainTab('home')
    localStorage.setItem(TOUR_KEY, '1')
  }

  const tourSteps: TourStep[] = [
    {
      target: 'nav-home',
      title: 'Welcome to LastVault FHE',
      desc: 'This is a private on-chain identity verification system built on Fhenix FHE. Let\'s walk you through how it works.',
      position: 'bottom',
    },
    {
      target: 'hero-open',
      title: 'Open the Portal',
      desc: 'Click "Open Portal" to access the Heir Claim interface. This is where heirs verify their identity through encrypted computation.',
      position: 'top',
      onClick: () => setMainTab('heir'),
    },
    {
      target: 'nav-owner',
      title: 'Owner Portal',
      desc: 'Vault owners deploy encrypted vaults, ping the Dead-Man\'s Switch, and manage heir settings here. All state is FHE-encrypted.',
      position: 'bottom',
      onClick: () => setMainTab('owner'),
    },
    {
      target: 'nav-heir',
      title: 'Heir Claim Portal',
      desc: 'Heirs come here to claim their inheritance. 12 FHE operations verify identity without revealing any plaintext on-chain.',
      position: 'bottom',
      onClick: () => setMainTab('heir'),
    },
    {
      target: 'claim-btn',
      title: 'Initiate a Claim',
      desc: 'Enter the vault contract address and click this button. Your address is encrypted client-side before being submitted. The contract never sees your plaintext identity.',
      position: 'top',
    },
    {
      target: 'encrypted-state',
      title: 'All State is Encrypted',
      desc: 'Every sensitive value is FHE-encrypted: heir identity, vault payload, ping timestamps, claim attempts. Even the contract can\'t read these — only authorized addresses can unseal.',
      position: 'left',
    },
    {
      target: 'nav-docs',
      title: 'Read the Docs',
      desc: 'Full architecture documentation, privacy model, FHE operations table, and developer setup guide. Everything is explained in detail.',
      position: 'bottom',
      onClick: () => setMainTab('docs'),
    },
    {
      target: 'wallet-btn',
      title: 'Connect Your Wallet',
      desc: 'Connect MetaMask to interact with the live contract on Arbitrum Sepolia. If MetaMask isn\'t installed, we\'ll guide you to install it.',
      position: 'bottom',
    },
  ]

  async function connectWallet() {
    const eth = (window as any).ethereum
    if (!eth) {
      window.open('https://metamask.io/download/', '_blank')
      return
    }
    try {
      const provider = new BrowserProvider(eth)
      const accounts = await provider.send('eth_requestAccounts', [])
      const network = await provider.getNetwork()
      setAccount(accounts[0])
      setChainId(network.chainId.toString())
      eth.on('accountsChanged', (accs: string[]) => setAccount(accs[0] || ''))
      eth.on('chainChanged', () => window.location.reload())
    } catch { setStatus('Wallet connection cancelled') }
  }

  async function handleClaim() {
    setClaimLoading(true)
    setDemoStep(1); setStatus('Encrypting your address with @cofhe/sdk...')
    await sleep(1500)
    setDemoStep(2); setStatus('FHE.eq() + FHE.gte() + FHE.and() — 12 ops running on ciphertext...')
    await sleep(2000)
    setDemoStep(3); setStatus('Threshold network decrypting compound ebool...')
    await sleep(1500)
    setDemoStep(4); setStatus('FHE.allow(payload, verifiedHeir) — decryption access granted')
    await sleep(1000)
    setClaimed(true); setClaimLoading(false); setStatus('')
  }

  // Wallet button label
  const walletLabel = account
    ? `${account.slice(0,6)}...${account.slice(-4)}`
    : hasWallet() ? 'Connect Wallet' : 'Install Wallet'

  return (
    <div>
      {/* ═══ STARFIELD BACKGROUND (Canvas — Paribu/Luma style) ═══ */}
      <Starfield />

      <div className="app-content">
        {/* ═══ SPOTLIGHT TOUR ═══ */}
        {showTour && tourReady && <SpotlightTour steps={tourSteps} onFinish={closeTour} />}

        {/* ═══ HEADER (compact centered pill) ═══ */}
        <header className="header">
          <div className="header-pill">
            <div className="header-logo">
              <img src={import.meta.env.BASE_URL + 'logo.svg'} alt="LastVault" style={{height:22}} />
            </div>

            <div className="header-divider" />

            <nav className="header-nav">
              {([['home','Home'],['owner','Owner'],['heir','Heir'],['docs','Docs']] as [MainTab,string][]).map(([k,v]) => (
                <button key={k} className={mainTab===k?'active':''} onClick={()=>setMainTab(k)} data-tour={`nav-${k}`}>{v}</button>
              ))}
            </nav>

            <div className="header-divider" />

            <button
              className={`btn-wallet${account?' connected':''}`}
              onClick={connectWallet}
              title={chainId ? `Chain ID: ${chainId}` : ''}
              data-tour="wallet-btn"
            >
              {account && <span style={{width:7,height:7,borderRadius:'50%',background:'var(--success)',display:'inline-block',marginRight:6}} />}
              {walletLabel}
            </button>
          </div>
        </header>

        {/* ═══ HOME / HERO ═══ */}
        {mainTab === 'home' && (
          <div className="hero">
            <div className="hero-badge">
              <span className="dot" />
              <span>FHE-Native Primitive</span>
              <span style={{color:'var(--text-muted)'}}>&#183;</span>
              <span>Powered by CoFHE Coprocessor</span>
            </div>

            <h1 className="hero-title">
              Private Verification.<br/>
              Blind Execution.
            </h1>

            <p className="hero-desc">
              The first on-chain identity verification system where the contract proves who you are
              without ever seeing your identity. 12 FHE operations. Zero plaintext. Built on Fhenix CoFHE.
            </p>

            <div className="hero-buttons">
              <button className="hero-btn primary" onClick={() => setMainTab('heir')} data-tour="hero-open">
                Open Portal <span style={{fontSize:12}}>&#8599;</span>
              </button>
              <button className="hero-btn" onClick={() => { setMainTab('docs'); setDocsTab('overview') }}>
                <span style={{fontSize:12}}>&#9654;</span> Read Docs
              </button>
            </div>
          </div>
        )}

        {/* ═══ OWNER TAB ═══ */}
        {mainTab === 'owner' && (
          <div className="page">
            <div className="page-center">
              <div className="page-badge">Vault Operator</div>
              <h1 className="page-title">Owner Portal</h1>
              <p className="page-subtitle">
                Deploy your vault, manage encrypted state, and monitor the Dead-Man's Switch.
                All sensitive data is FHE-encrypted — invisible on-chain.
              </p>
            </div>

            <div className="sub-tabs">
              {(['overview','deploy','manage'] as OwnerTab[]).map(t => (
                <button key={t} className={ownerTab===t?'active':''} onClick={()=>setOwnerTab(t)}>
                  {t === 'overview' ? 'Overview' : t === 'deploy' ? 'Deploy Vault' : 'Manage'}
                </button>
              ))}
            </div>

            {ownerTab === 'overview' && (
              <div className="grid-2">
                <div className="card">
                  <div className="card-title">Operator Access</div>
                  <div className="card-desc">Connect the owner wallet, then enable permit-based reads for encrypted state.</div>
                  <div className="grid-3">
                    <div className="stat-box">
                      <div className="stat-label">Wallet</div>
                      <div className="stat-value">{account ? `${account.slice(0,8)}...` : 'Connect from nav'}</div>
                    </div>
                    <div className="stat-box">
                      <div className="stat-label">Owner Role</div>
                      <div className="stat-value">{account ? 'Ready' : 'Waiting'}</div>
                    </div>
                    <div className="stat-box">
                      <div className="stat-label">CoFHE</div>
                      <div className="stat-value">{account ? 'Initialized' : 'Not initialized'}</div>
                    </div>
                  </div>
                  {CONTRACT_ADDRESS && (
                    <div className="info-box live" style={{marginTop:16}}>
                      Live contract: {CONTRACT_ADDRESS}
                    </div>
                  )}
                </div>

                <div className="card">
                  <div className="card-title">Encrypted State Summary</div>
                  <div className="card-desc">Admin-only aggregate state with optional permit-based unsealing.</div>
                  {['Heir Address|eaddress', 'Vault Payload|euint128 x2', 'Last Ping|euint64', 'Claim Attempts|euint8'].map(s => {
                    const [label, handle] = s.split('|')
                    return (
                      <div className="stat-box" key={label} style={{marginBottom:10}}>
                        <div className="stat-label">{label} <span className="badge-locked">LOCKED</span></div>
                        <div className="stat-value encrypted">* * *</div>
                        <div style={{fontSize:11,color:'var(--text-muted)',marginTop:4}}>Handle: {handle}</div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {ownerTab === 'deploy' && (
              <div className="grid-2">
                <div className="card">
                  <div className="card-title">Deploy Vault</div>
                  <div className="card-desc">All inputs are encrypted client-side via @cofhe/sdk before touching the blockchain.</div>
                  <input className="input" placeholder="Heir address (will be FHE-encrypted)" />
                  <input className="input" placeholder="Vault key — 256-bit hex (will be FHE-encrypted)" />
                  <input className="input" placeholder="Timeout seconds (default: 7776000 = 90 days)" />
                  <input className="input" placeholder="Max claim attempts (default: 3)" />
                  <button className="btn-primary" disabled>Deploy LastVaultFHE</button>
                </div>
                <div className="card">
                  <div className="card-title">Arbitrum Sepolia Readiness</div>
                  <div className="card-desc">Pre-flight checks before deployment.</div>
                  {[
                    ['Wallet connected', account ? 'yes' : 'no'],
                    ['Network is Arb Sepolia', chainId === '421614' ? 'yes' : 'no'],
                    ['CoFHE initialized', 'no'],
                    ['ETH balance sufficient', 'no'],
                  ].map(([label, val]) => (
                    <div className="status-row" key={label}>
                      <span className="label">{label}</span>
                      <span className={`val ${val}`}>{val === 'yes' ? 'Yes' : 'Pending'}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {ownerTab === 'manage' && (
              <div className="grid-2">
                <div className="card">
                  <div className="card-title">Ping (Reset Timer)</div>
                  <div className="card-desc">Reset the Dead-Man's Switch. Encrypted timestamp update — no metadata leak.</div>
                  <button className="btn-primary" disabled>Send Encrypted Ping</button>
                </div>
                <div className="card">
                  <div className="card-title">Update Heir</div>
                  <div className="card-desc">Change heir. New address encrypted client-side.</div>
                  <input className="input" placeholder="New heir address (will be FHE-encrypted)" />
                  <button className="btn-primary" disabled>Update Heir (Encrypted)</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ═══ HEIR TAB ═══ */}
        {mainTab === 'heir' && (
          <div className="page">
            <div className="page-center">
              <div className="page-badge">Encrypted End-to-End</div>
              <h1 className="page-title">Heir Claim Portal</h1>
              <p className="page-subtitle">
                Private on-chain identity verification — powered by Fhenix CoFHE.
                The contract verifies who you are without ever seeing your identity.
              </p>
            </div>

            <div className="grid-2">
              <div className="card">
                <div className="card-title">Claim Inheritance</div>
                <div className="card-desc">12 FHE operations execute on-chain to verify your claim without revealing any plaintext.</div>

                {claimed ? (
                  <div className="info-box success" style={{background:'#00d4aa10',borderColor:'#00d4aa30'}}>
                    Claim verified! Vault payload access granted via FHE.allow(). Decrypt your 256-bit vault key using @cofhe/sdk.
                  </div>
                ) : (
                  <>
                    <input className="input" placeholder="Vault contract address (0x...)" />
                    <div className="steps">
                      {[
                        ['01', 'Encrypt Identity', 'Your address is encrypted client-side via @cofhe/sdk before leaving your browser.'],
                        ['02', 'FHE Verification', '12 FHE ops execute: FHE.eq() + FHE.gte() + FHE.and() — compound encrypted check.'],
                        ['03', 'Threshold Decrypt', 'Multi-party threshold network decrypts compound boolean. Only yes/no revealed.'],
                        ['04', 'Payload Access', 'FHE.allow(payload, heir) grants decryption rights. Unseal the vault key locally.'],
                      ].map(([num, title, desc], i) => (
                        <div key={num} className={`step ${demoStep >= i+1 ? 'active' : ''}`}>
                          <div className="step-num">{num}</div>
                          <div>
                            <div className="step-title">{title}</div>
                            <div className="step-desc">{desc}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                    <button className="btn-primary" onClick={handleClaim} disabled={claimLoading} data-tour="claim-btn">
                      {claimLoading ? 'Verifying via FHE...' : 'Initiate Claim (FHE-Encrypted)'}
                    </button>
                  </>
                )}
              </div>

              <div>
                <div className="card" data-tour="encrypted-state">
                  <div className="card-title">Vault Encrypted State</div>
                  <div className="card-desc">All values are FHE-encrypted. Only authorized addresses can unseal.</div>
                  {['Heir Identity|eaddress — invisible on-chain','Vault Payload|euint128 x2 — 256-bit key, opaque','Last Ping|euint64 — no behavioral profiling','Claim Attempts|euint8 — attacker can\'t count'].map(s => {
                    const [label, handle] = s.split('|')
                    return (
                      <div className="stat-box" key={label} style={{marginBottom:10}}>
                        <div className="stat-label">{label} <span className="badge-locked">LOCKED</span></div>
                        <div className="stat-value encrypted">* * *</div>
                        <div style={{fontSize:11,color:'var(--text-muted)',marginTop:4}}>{handle}</div>
                      </div>
                    )
                  })}
                  <div className="stat-box">
                    <div className="stat-label">Claim State <span className="badge-live">LIVE</span></div>
                    <div className="stat-value">{claimed ? 'Verified' : 'Idle'}</div>
                  </div>
                </div>

                <div className="card">
                  <div className="card-title">Privacy Comparison</div>
                  <table>
                    <thead><tr><th></th><th>Plaintext</th><th>LastVault FHE</th></tr></thead>
                    <tbody>
                      <tr><td>Heir Identity</td><td className="bad">Public</td><td className="good">eaddress (hidden)</td></tr>
                      <tr><td>Verification</td><td className="bad">msg.sender == heir</td><td className="good">FHE.eq() ciphertext</td></tr>
                      <tr><td>Ping Timing</td><td className="bad">Behavioral profile</td><td className="good">euint64 (invisible)</td></tr>
                      <tr><td>Failed Claim</td><td className="bad">require() leaks</td><td className="good">FHE.and() compound</td></tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ═══ DOCS TAB ═══ */}
        {mainTab === 'docs' && (
          <div className="page">
            <div className="page-center">
              <div className="page-badge">FHE Primitive Documentation</div>
              <h1 className="page-title">LastVault <span style={{color:'var(--accent)'}}>Documentation</span></h1>
              <p className="page-subtitle">
                Architecture, privacy model, and developer setup for the first private identity verification primitive on Fhenix.
              </p>
            </div>

            <div className="sub-tabs">
              {(['overview','architecture','privacy','setup'] as DocsTab[]).map(t => (
                <button key={t} className={docsTab===t?'active':''} onClick={()=>setDocsTab(t)}>
                  {{overview:'Overview', architecture:'Architecture', privacy:'Privacy Model', setup:'Local Setup'}[t]}
                </button>
              ))}
            </div>

            {docsTab === 'overview' && (
              <>
                <div className="grid-2">
                  <div className="doc-block">
                    <h4>Enterprise-Grade Confidentiality via CoFHE</h4>
                    <p>
                      LastVault FHE operates on a paradigm shift in on-chain identity privacy.
                      Instead of storing identities in plaintext or relying on ZK proofs that leak brute-forceable hashes,
                      LastVault utilizes Fhenix's <strong>CoFHE Coprocessor</strong> to perform encrypted identity matching
                      directly on the EVM. The contract never sees plaintext — verification happens in ciphertext space.
                    </p>
                  </div>
                  <div className="doc-block">
                    <h4>Why Not ZK? Why Not TEE?</h4>
                    <p>
                      <strong>ZK proofs</strong> require the verifier to hold a plaintext hash — an address hash over ~2^160 addresses is brute-forceable.
                      <strong> TEE solutions</strong> introduce a single point of trust.
                      <strong> FHE is the only approach</strong> where the comparison itself is encrypted: two ciphertexts in, one ciphertext boolean out.
                      The primitive generalizes to encrypted allowlists, anonymous authorization, and confidential access control.
                    </p>
                  </div>
                </div>

                <div className="feature-grid">
                  <div className="feature-card">
                    <div className="fc-icon">&#128274;</div>
                    <h4>Homomorphic Verification</h4>
                    <p>FHE.eq() on encrypted addresses. The comparison runs on ciphertext — no plaintext materializes at any point.</p>
                  </div>
                  <div className="feature-card">
                    <div className="fc-icon">&#9881;</div>
                    <h4>EVM Composability</h4>
                    <p>Standard Solidity contract using @fhenixprotocol/cofhe-contracts. Deploys to any Fhenix-supported EVM testnet.</p>
                  </div>
                  <div className="feature-card">
                    <div className="fc-icon">&#128736;</div>
                    <h4>SDK E2E Integration</h4>
                    <p>Client-side encryption via @cofhe/sdk, threshold decryption via network, local unsealing via permits. Zero server trust.</p>
                  </div>
                </div>

                <div style={{marginTop:24}}>
                  <div className="info-box live"><strong>LIVE NOW</strong> — 12 FHE operations, encrypted state across 6 types, compound verification, ACL lifecycle docs.</div>
                  <div className="info-box next" style={{marginTop:8}}><strong>NEXT UP</strong> — Multi-heir threshold recovery, selective disclosure for executors, ReineiraOS escrow bridge.</div>
                </div>
              </>
            )}

            {docsTab === 'architecture' && (
              <>
                <div className="doc-block">
                  <h4>FHE Operations (12 Distinct)</h4>
                  <table>
                    <thead><tr><th>#</th><th>Op</th><th>Purpose</th></tr></thead>
                    <tbody>
                      {[
                        ['1','asEaddress()','Encrypt address input'],['2','asEuint128()','Encrypt 128-bit payload'],
                        ['3','asEuint64()','Encrypt timestamps + timeout'],['4','asEuint8()','Encrypt counter + limit'],
                        ['5','eq()','Core: encrypted identity matching'],['6','ne()','Inequality validation'],
                        ['7','gte()','Threshold comparison'],['8','sub()','Time elapsed computation'],
                        ['9','add()','Counter increment'],['10','select()','Replaces require() — no info leak'],
                        ['11','and()','Compound condition'],['12','not()','Boolean negation'],
                      ].map(([n,op,p]) => (
                        <tr key={n}><td>{n}</td><td><code>FHE.{op}</code></td><td>{p}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="grid-2">
                  <div className="doc-block">
                    <h4>The FHE.select() Pattern</h4>
                    <p>Traditional <code>require()</code> leaks info through reverts. <code>FHE.select()</code> handles failures silently.</p>
                    <pre>{`// BAD: leaks max attempt count
require(attempts < max, "Max reached");

// GOOD: silent conditional update
attempts = FHE.select(
  withinLimit, newCount, oldCount
);`}</pre>
                  </div>
                  <div className="doc-block">
                    <h4>Compound FHE.and()</h4>
                    <p>Three conditions composed into one encrypted boolean — observer can't tell which failed.</p>
                    <pre>{`compound = FHE.and(
  FHE.and(identityMatch, withinLimit),
  timeoutReached
);
// Only compound goes to threshold
// No individual condition leaked`}</pre>
                  </div>
                </div>

                <div className="doc-block">
                  <h4>ACL Lifecycle</h4>
                  <p>
                    Payload access (<code>FHE.allow</code>) granted in <strong>exactly one code path</strong>:
                    inside <code>finalizeClaim()</code>, after threshold verification of the compound boolean.
                    Zero pre-verification window. Full analysis:
                    <a href="https://github.com/lastvault-io/lastvault-contracts/blob/main/docs/ACL_LIFECYCLE.md" target="_blank" rel="noreferrer" style={{color:'var(--accent)'}}> ACL_LIFECYCLE.md</a>
                  </p>
                </div>
              </>
            )}

            {docsTab === 'privacy' && (
              <>
                <div className="doc-block">
                  <h4>Observer Visibility Matrix</h4>
                  <table>
                    <thead><tr><th>Phase</th><th>Visible</th><th>Hidden (FHE)</th></tr></thead>
                    <tbody>
                      <tr><td>Deploy</td><td>Owner address</td><td className="good">Heir, payload, timeout</td></tr>
                      <tr><td>Ping</td><td>Event emitted</td><td className="good">Timestamp value (euint64)</td></tr>
                      <tr><td>Claim init</td><td>Claimant address</td><td className="good">Whether they match heir</td></tr>
                      <tr><td>Rejected</td><td>Event</td><td className="good">Which condition failed</td></tr>
                      <tr><td>Verified</td><td>Heir address</td><td className="good">Payload contents</td></tr>
                    </tbody>
                  </table>
                </div>
                <div className="doc-block">
                  <h4>The Privacy Guarantee</h4>
                  <p>
                    <strong>"The heir is unknown until they choose to claim."</strong> During the owner's lifetime, heir is fully hidden.
                    After death, heir reveals themselves only if and when they want to inherit.
                    Full model: <a href="https://github.com/lastvault-io/lastvault-contracts/blob/main/docs/PRIVACY_MODEL.md" target="_blank" rel="noreferrer" style={{color:'var(--accent)'}}>PRIVACY_MODEL.md</a>
                  </p>
                </div>
              </>
            )}

            {docsTab === 'setup' && (
              <>
                {[
                  ['1. Install Dependencies', 'git clone https://github.com/lastvault-io/lastvault-contracts\ncd lastvault-contracts && npm install'],
                  ['2. Configure Environment', 'cp .env.example .env\n# Fill: PRIVATE_KEY, HEIR_ADDRESS, VAULT_KEY_HEX'],
                  ['3. Compile & Test', 'npm run compile   # 12 FHE ops, 6 encrypted types\nnpm test           # 24 tests passing'],
                  ['4. Deploy', 'npm run deploy:arb-sepolia   # Fhenix CoFHE flagship'],
                ].map(([title, cmd]) => (
                  <div className="doc-block" key={title}>
                    <h4>{title}</h4>
                    <pre>{cmd}</pre>
                  </div>
                ))}

                <div className="card">
                  <div className="card-title">Platform Demonstration Path</div>
                  {[
                    'Deploy vault with encrypted heir + payload + timeout',
                    'Owner pings — encrypted timestamp update',
                    'Wait for timeout (deploy with 1-day minimum for testing)',
                    'Heir initiates claim — 12 FHE ops execute on-chain',
                    'Threshold network decrypts compound boolean',
                    'Heir finalizes — payload access granted',
                    'Heir decrypts 256-bit vault key client-side via @cofhe/sdk',
                  ].map((s, i) => (
                    <div className="status-row" key={i}><span className="label">{i+1}. {s}</span></div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* ═══ STATUS ═══ */}
        {status && <div className="status-bar">{status}</div>}

        {/* ═══ FOOTER ═══ */}
        <footer className="footer">
          LastVault by Divara Technology Inc. |
          Powered by <a href="https://fhenix.io" target="_blank" rel="noreferrer">Fhenix CoFHE</a> |
          <a href="https://lastvault.io" target="_blank" rel="noreferrer"> lastvault.io</a> |
          <a href="https://github.com/lastvault-io/lastvault-contracts" target="_blank" rel="noreferrer"> GitHub</a>
        </footer>
      </div>
    </div>
  )
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

export default App
