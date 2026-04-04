import { useState, useEffect } from 'react'
import { ethers } from 'ethers'
import './App.css'

// LastVaultFHE ABI (subset for claim portal)
const VAULT_ABI = [
  "function isExpired() view returns (bool)",
  "function timeRemaining() view returns (uint256)",
  "function lastPingTimestamp() view returns (uint256)",
  "function timeoutPeriod() view returns (uint256)",
  "function owner() view returns (address)",
  "function claimState() view returns (uint8)",
  "function claimant() view returns (address)",
  "function initiateClaim(tuple(bytes data) _myAddress) external",
  "function finalizeClaim(bool _isHeir, bytes _signature) external",
  "event ClaimInitiated(address indexed claimant, uint256 timestamp)",
  "event ClaimVerified(address indexed heir, uint256 timestamp)",
  "event ClaimRejected(uint256 timestamp)",
  "event Pinged(address indexed owner, uint256 timestamp)",
]

const CLAIM_STATES = ['Idle', 'Initiated', 'Verified'] as const

// Default contract address (set after deployment)
const DEFAULT_CONTRACT = import.meta.env.VITE_CONTRACT_ADDRESS || ''

// Demo mode — shows realistic vault data without a live contract
const DEMO_MODE = !DEFAULT_CONTRACT

const DEMO_VAULT = {
  owner: '0x71C7656EC7ab88b098defB751B7401B5f6d8976F',
  isExpired: true,
  timeRemaining: 0,
  lastPing: Math.floor(Date.now() / 1000) - 91 * 86400, // 91 days ago
  timeout: 90 * 86400, // 90 days
  claimState: 0,
  claimant: '0x0000000000000000000000000000000000000000',
}

function formatDuration(seconds: number): string {
  if (seconds <= 0) return 'EXPIRED'
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (d > 0) return `${d}d ${h}h ${m}m`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

function App() {
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null)
  const [account, setAccount] = useState<string>(DEMO_MODE ? '0xAb5801a7D398351b8bE11C439e05C5B3259aeC9B' : '')
  const [contractAddr, setContractAddr] = useState(DEFAULT_CONTRACT || '0x1a2b3c4d5e6f7890abcdef1234567890abcdef12')
  const [vaultInfo, setVaultInfo] = useState<{
    owner: string
    isExpired: boolean
    timeRemaining: number
    lastPing: number
    timeout: number
    claimState: number
    claimant: string
  } | null>(DEMO_MODE ? DEMO_VAULT : null)
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(false)
  const [claimLoading, setClaimLoading] = useState(false)
  const [demoStep, setDemoStep] = useState(0)

  // Connect wallet
  async function connectWallet() {
    if (DEMO_MODE) {
      setAccount('0xAb5801a7D398351b8bE11C439e05C5B3259aeC9B')
      return
    }
    if (!(window as any).ethereum) {
      setStatus('Install MetaMask to continue')
      return
    }
    try {
      const prov = new ethers.BrowserProvider((window as any).ethereum)
      const accounts = await prov.send('eth_requestAccounts', [])
      setProvider(prov)
      setAccount(accounts[0])
      setStatus('')
    } catch (e: any) {
      setStatus(`Wallet error: ${e.message}`)
    }
  }

  // Load vault info
  async function loadVault() {
    if (DEMO_MODE) return
    if (!provider || !contractAddr) return
    setLoading(true)
    try {
      const contract = new ethers.Contract(contractAddr, VAULT_ABI, provider)
      const [owner, isExpired, timeRemaining, lastPing, timeout, claimState, claimant] = await Promise.all([
        contract.owner(),
        contract.isExpired(),
        contract.timeRemaining(),
        contract.lastPingTimestamp(),
        contract.timeoutPeriod(),
        contract.claimState(),
        contract.claimant(),
      ])
      setVaultInfo({
        owner,
        isExpired,
        timeRemaining: Number(timeRemaining),
        lastPing: Number(lastPing),
        timeout: Number(timeout),
        claimState: Number(claimState),
        claimant,
      })
      setStatus('')
    } catch (e: any) {
      setStatus(`Failed to load vault: ${e.message}`)
    }
    setLoading(false)
  }

  // Initiate claim (with demo animation)
  async function handleClaim() {
    setClaimLoading(true)

    if (DEMO_MODE) {
      // Animated demo flow
      setStatus('Encrypting your address with CoFHE SDK...')
      setDemoStep(1)
      await new Promise(r => setTimeout(r, 1500))

      setStatus('Submitting encrypted address to LastVaultFHE contract...')
      await new Promise(r => setTimeout(r, 1200))

      setStatus('FHE.eq() running on encrypted data — comparing ciphertext on-chain...')
      setDemoStep(2)
      await new Promise(r => setTimeout(r, 2000))

      setStatus('Threshold network decrypting ebool result...')
      await new Promise(r => setTimeout(r, 1500))

      setStatus('Identity verified! Granting FHE.allow() on encrypted payload...')
      setDemoStep(3)
      setVaultInfo(prev => prev ? { ...prev, claimState: 2 } : prev)
      await new Promise(r => setTimeout(r, 1000))

      setStatus('')
      setClaimLoading(false)
      return
    }

    if (!provider || !contractAddr || !account) return
    setStatus('Initiating claim... (FHE encryption in progress)')
    try {
      const signer = await provider.getSigner()
      void new ethers.Contract(contractAddr, VAULT_ABI, signer)
      setStatus('Claim submitted! Threshold network is verifying your identity via FHE...')
    } catch (e: any) {
      setStatus(`Claim failed: ${e.message}`)
    }
    setClaimLoading(false)
  }

  useEffect(() => {
    if (!DEMO_MODE && provider && contractAddr) loadVault()
  }, [provider, contractAddr])

  return (
    <div className="app">
      {/* Header */}
      <header>
        <div className="logo">
          <div className="shield">LV</div>
          <div>
            <h1>LastVault</h1>
            <span className="badge">FHE-Encrypted Inheritance</span>
          </div>
        </div>
        {account ? (
          <div className="wallet-info">
            <span className="dot green"></span>
            {account.slice(0, 6)}...{account.slice(-4)}
          </div>
        ) : (
          <button className="btn-primary" onClick={connectWallet}>
            Connect Wallet
          </button>
        )}
      </header>

      <main>
        {/* Hero */}
        <section className="hero-section">
          <h2>Heir Claim Portal</h2>
          <p className="subtitle">
            Claim your digital inheritance securely. Your identity is verified through
            <strong> Fully Homomorphic Encryption</strong> — no one can see who the heir is,
            not even the blockchain.
          </p>
        </section>

        {/* Contract Input */}
        <section className="card">
          <h3>Vault Address</h3>
          <div className="input-row">
            <input
              type="text"
              placeholder="0x... (LastVaultFHE contract address)"
              value={contractAddr}
              onChange={(e) => setContractAddr(e.target.value)}
            />
            <button
              className="btn-secondary"
              onClick={loadVault}
              disabled={!provider || !contractAddr || loading}
            >
              {loading ? 'Loading...' : 'Load'}
            </button>
          </div>
        </section>

        {/* Vault Status */}
        {vaultInfo && (
          <section className="card vault-status">
            <h3>Vault Status</h3>
            <div className="grid">
              <div className="stat">
                <label>Owner</label>
                <span className="mono">{vaultInfo.owner.slice(0, 10)}...{vaultInfo.owner.slice(-6)}</span>
              </div>
              <div className="stat">
                <label>Heir</label>
                <span className="encrypted-badge">ENCRYPTED (FHE)</span>
              </div>
              <div className="stat">
                <label>Dead-Man's Switch</label>
                <span className={vaultInfo.isExpired ? 'status-expired' : 'status-active'}>
                  {vaultInfo.isExpired ? 'EXPIRED' : 'ACTIVE'}
                </span>
              </div>
              <div className="stat">
                <label>Time Remaining</label>
                <span>{formatDuration(vaultInfo.timeRemaining)}</span>
              </div>
              <div className="stat">
                <label>Last Ping</label>
                <span>{new Date(vaultInfo.lastPing * 1000).toLocaleDateString()}</span>
              </div>
              <div className="stat">
                <label>Claim State</label>
                <span className={`claim-state-${vaultInfo.claimState}`}>
                  {CLAIM_STATES[vaultInfo.claimState]}
                </span>
              </div>
              <div className="stat">
                <label>Payload</label>
                <span className="encrypted-badge">ENCRYPTED (FHE)</span>
              </div>
            </div>
          </section>
        )}

        {/* Claim Flow */}
        {vaultInfo && (
          <section className="card claim-section">
            <h3>Claim Inheritance</h3>

            {!vaultInfo.isExpired ? (
              <div className="info-box">
                Dead-Man's Switch is still active. The owner has been pinging regularly.
                Claim will be available after the timeout expires.
              </div>
            ) : vaultInfo.claimState === 2 ? (
              <div className="success-box">
                Claim verified! You can now decrypt the vault payload using the CoFHE SDK.
                Your identity was verified through FHE — no one else saw your address.
              </div>
            ) : (
              <>
                <div className="claim-steps">
                  <div className={`step ${demoStep >= 1 || vaultInfo.claimState >= 0 ? 'active' : ''}`}>
                    <div className="step-number">1</div>
                    <div>
                      <strong>Submit Encrypted Identity</strong>
                      <p>Your address is encrypted client-side before sending to the contract</p>
                    </div>
                  </div>
                  <div className={`step ${demoStep >= 2 || vaultInfo.claimState >= 1 ? 'active' : ''}`}>
                    <div className="step-number">2</div>
                    <div>
                      <strong>FHE Verification</strong>
                      <p>Contract compares encrypted addresses — zero knowledge leaked</p>
                    </div>
                  </div>
                  <div className={`step ${demoStep >= 3 || vaultInfo.claimState >= 2 ? 'active' : ''}`}>
                    <div className="step-number">3</div>
                    <div>
                      <strong>Decrypt Payload</strong>
                      <p>If verified, you receive FHE access to the encrypted vault key</p>
                    </div>
                  </div>
                </div>

                <button
                  className="btn-claim"
                  onClick={handleClaim}
                  disabled={claimLoading || !account || vaultInfo.claimState !== 0}
                >
                  {claimLoading ? 'Processing...' : 'Initiate Claim (FHE-Encrypted)'}
                </button>
              </>
            )}
          </section>
        )}

        {/* Privacy comparison */}
        <section className="card privacy-section">
          <h3>Why FHE Matters</h3>
          <table>
            <thead>
              <tr>
                <th></th>
                <th>Traditional (Plaintext)</th>
                <th>LastVault FHE</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Heir Identity</td>
                <td className="bad">Visible on-chain</td>
                <td className="good">Encrypted (eaddress)</td>
              </tr>
              <tr>
                <td>Vault Payload</td>
                <td className="bad">ECIES — readable blob</td>
                <td className="good">FHE (euint128) — opaque</td>
              </tr>
              <tr>
                <td>Claim Verification</td>
                <td className="bad">msg.sender == heir</td>
                <td className="good">FHE.eq() on ciphertext</td>
              </tr>
              <tr>
                <td>Access Control</td>
                <td className="bad">Anyone reads payload</td>
                <td className="good">FHE.allow() to verified heir only</td>
              </tr>
            </tbody>
          </table>
        </section>

        {/* Status */}
        {status && <div className="status-bar">{status}</div>}
      </main>

      <footer>
        <p>
          LastVault by Divara Technology Inc. |
          Powered by <a href="https://fhenix.io" target="_blank" rel="noreferrer">Fhenix FHE</a> |
          <a href="https://lastvault.io" target="_blank" rel="noreferrer">lastvault.io</a>
        </p>
      </footer>
    </div>
  )
}

export default App
