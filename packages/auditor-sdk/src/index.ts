/**
 * @lastvault/auditor-sdk
 *
 * Single-import TypeScript helper for auditors of LastVault SelectiveDisclosure
 * contracts. Wraps the CoFHE SDK so auditors don't need to read 200+ lines of
 * @cofhe/sdk docs to enumerate attestations and decrypt allowed fields.
 *
 *   import { LastVaultAuditor } from '@lastvault/auditor-sdk';
 *
 *   const auditor = new LastVaultAuditor({
 *     rpcUrl: 'https://sepolia-rollup.arbitrum.io/rpc',
 *     disclosureAddress: '0xF23774...',
 *     auditorPrivateKey: process.env.AUDITOR_PK!,
 *   });
 *
 *   const attestations = await auditor.listAttestations();
 *   const verified = await auditor.decryptVerifiedStatus(0);
 *   const totalVerifiedClaims = await auditor.countVerifiedOfKind('ClaimVerified');
 */

export type AttestationKind =
  | "VaultDeployed"
  | "HeirAdded"
  | "HeirRemoved"
  | "Pinged"
  | "ClaimInitiated"
  | "ClaimVerified"
  | "ClaimRejected"
  | "PayloadUpdated"
  | "ThresholdUpdated";

export const ATTESTATION_KIND_INDEX: Record<AttestationKind, number> = {
  VaultDeployed: 0,
  HeirAdded: 1,
  HeirRemoved: 2,
  Pinged: 3,
  ClaimInitiated: 4,
  ClaimVerified: 5,
  ClaimRejected: 6,
  PayloadUpdated: 7,
  ThresholdUpdated: 8,
};

export interface AttestationMeta {
  index: number;
  timestamp: bigint;
  kind: AttestationKind;
  contextHash: `0x${string}`;
}

export interface AttestationFull extends AttestationMeta {
  verifiedHandle: `0x${string}` | bigint;
  involvedPartyHandle: `0x${string}` | bigint;
}

export interface DecryptedAttestation extends AttestationMeta {
  verified: boolean;
  involvedParty?: `0x${string}` | null; // null = no permit, address = disclosed
}

export interface AuditorConfig {
  /** JSON-RPC endpoint for the chain where SelectiveDisclosure is deployed. */
  rpcUrl: string;
  /** Deployed SelectiveDisclosure contract address. */
  disclosureAddress: `0x${string}`;
  /** Auditor's wallet private key (hex). Must have an active CoFHE permit. */
  auditorPrivateKey: `0x${string}`;
  /** Optional explicit CoFHE chain config. Defaults to Arbitrum Sepolia. */
  chainName?: "arbitrumSepolia" | "sepolia";
}

const SELECTIVE_DISCLOSURE_ABI = [
  "function attestationCount() view returns (uint256)",
  "function getAttestationMeta(uint256 _idx) view returns (uint256 timestamp, uint8 kind, bytes32 contextHash)",
  "function getEncryptedFields(uint256 _idx) view returns (bytes32 verified, bytes32 involvedParty)",
  "function countVerifiedOfKind(uint8 _kind) returns (bytes32 count)",
  "function auditors(address) view returns (bool)",
  "function auditorCount() view returns (uint256)",
];

const KIND_REVERSE: Record<number, AttestationKind> = {
  0: "VaultDeployed",
  1: "HeirAdded",
  2: "HeirRemoved",
  3: "Pinged",
  4: "ClaimInitiated",
  5: "ClaimVerified",
  6: "ClaimRejected",
  7: "PayloadUpdated",
  8: "ThresholdUpdated",
};

/**
 * LastVaultAuditor wraps the CoFHE client and the SelectiveDisclosure
 * contract to give auditors a 3-method surface:
 *
 *   await auditor.listAttestations()
 *   await auditor.decryptVerifiedStatus(attestationIndex)
 *   await auditor.countVerifiedOfKind('ClaimVerified')
 *
 * Under the hood it manages permit caching, retries on permit expiry,
 * and surfaces decryption errors as typed exceptions.
 */
export class LastVaultAuditor {
  private cfg: AuditorConfig;
  private permit: unknown = null;
  private client: any = null;
  private contract: any = null;

  constructor(cfg: AuditorConfig) {
    this.cfg = cfg;
  }

  /** Lazy-initialise the CoFHE client + contract handle. */
  private async _init(): Promise<void> {
    if (this.client && this.contract) return;

    // Dynamic imports keep peer deps optional at install time.
    const { createCofheClient, createCofheConfig } = await import("@cofhe/sdk/node" as any);
    const { arbSepolia, sepolia } = await import("@cofhe/sdk/chains" as any);
    const { createPublicClient, createWalletClient, http } = await import("viem");
    const { privateKeyToAccount } = await import("viem/accounts");
    const { arbitrumSepolia, sepolia: viemSepolia } = await import("viem/chains");
    const { Contract, JsonRpcProvider, Wallet } = await import("ethers");

    const chainName = this.cfg.chainName || "arbitrumSepolia";
    const fheChain = chainName === "arbitrumSepolia" ? arbSepolia : sepolia;
    const viemChain = chainName === "arbitrumSepolia" ? arbitrumSepolia : viemSepolia;

    const account = privateKeyToAccount(this.cfg.auditorPrivateKey);
    const publicClient = createPublicClient({ chain: viemChain, transport: http(this.cfg.rpcUrl) });
    const walletClient = createWalletClient({ account, chain: viemChain, transport: http(this.cfg.rpcUrl) });

    const cfheConfig = createCofheConfig({ supportedChains: [fheChain] });
    const client = createCofheClient(cfheConfig);
    await client.connect(publicClient, walletClient);

    const provider = new JsonRpcProvider(this.cfg.rpcUrl);
    const signer = new Wallet(this.cfg.auditorPrivateKey, provider);
    const contract = new Contract(this.cfg.disclosureAddress, SELECTIVE_DISCLOSURE_ABI, signer);

    this.client = client;
    this.contract = contract;
  }

  private async _getPermit(): Promise<unknown> {
    await this._init();
    if (!this.permit) {
      const { privateKeyToAccount } = await import("viem/accounts");
      const auditorAddress = privateKeyToAccount(this.cfg.auditorPrivateKey).address;
      const chainId = await this.contract.runner.provider.getNetwork().then((n: any) => Number(n.chainId));
      this.permit = await this.client.permits.getOrCreateSelfPermit(chainId, auditorAddress);
    }
    return this.permit;
  }

  /** Enumerate all attestations (plaintext metadata only). */
  async listAttestations(): Promise<AttestationMeta[]> {
    await this._init();
    const count = Number(await this.contract.attestationCount());
    const list: AttestationMeta[] = [];
    for (let i = 0; i < count; i++) {
      const [timestamp, kind, contextHash] = await this.contract.getAttestationMeta(i);
      list.push({
        index: i,
        timestamp: BigInt(timestamp),
        kind: KIND_REVERSE[Number(kind)] ?? "VaultDeployed",
        contextHash: contextHash as `0x${string}`,
      });
    }
    return list;
  }

  /**
   * Decrypt the `verified` field of a specific attestation using the
   * auditor's permit. Automatically retries on permit expiry.
   */
  async decryptVerifiedStatus(attestationIdx: number): Promise<boolean> {
    await this._init();
    const [verifiedHandle] = await this.contract.getEncryptedFields(attestationIdx);
    const FheTypes = (await import("@cofhe/sdk" as any)).FheTypes;
    let permit = await this._getPermit();

    const decrypt = async () => {
      return await this.client
        .decryptForView(verifiedHandle, FheTypes.Bool)
        .withPermit(permit)
        .execute();
    };

    try {
      const result = await decrypt();
      return Boolean(result);
    } catch (err: any) {
      const msg = String(err?.message || err).toLowerCase();
      if (msg.includes("expired") || msg.includes("invalid permit")) {
        // Permit expired — recreate and retry once
        const { privateKeyToAccount } = await import("viem/accounts");
        const auditorAddress = privateKeyToAccount(this.cfg.auditorPrivateKey).address;
        const chainId = await this.contract.runner.provider.getNetwork().then((n: any) => Number(n.chainId));
        this.client.permits.removeActivePermit(chainId, auditorAddress);
        this.permit = await this.client.permits.getOrCreateSelfPermit(chainId, auditorAddress);
        permit = this.permit;
        const result = await decrypt();
        return Boolean(result);
      }
      throw err;
    }
  }

  /**
   * Encrypted aggregate query: count of verified attestations of a given kind.
   * The count is computed in ciphertext on-chain and decrypted by the auditor.
   */
  async countVerifiedOfKind(kind: AttestationKind): Promise<number> {
    await this._init();
    const kindIdx = ATTESTATION_KIND_INDEX[kind];
    const tx = await this.contract.countVerifiedOfKind(kindIdx);
    await tx.wait?.();

    // The function returns an encrypted handle as its return value — we
    // need to read the return via callStatic / staticCall semantics:
    const countHandle = await this.contract.countVerifiedOfKind.staticCall(kindIdx);
    const FheTypes = (await import("@cofhe/sdk" as any)).FheTypes;
    const permit = await this._getPermit();

    const result = await this.client
      .decryptForView(countHandle, FheTypes.Uint8)
      .withPermit(permit)
      .execute();
    return Number(result);
  }

  /** Convenience: status check whether this auditor is registered. */
  async isRegisteredAuditor(): Promise<boolean> {
    await this._init();
    const { privateKeyToAccount } = await import("viem/accounts");
    const me = privateKeyToAccount(this.cfg.auditorPrivateKey).address;
    return await this.contract.auditors(me);
  }
}

export default LastVaultAuditor;
