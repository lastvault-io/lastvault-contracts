/**
 * LastVault — Wave 3 Unified Deploy Script
 *
 * Deploys all four Wave 3 contracts to Arbitrum Sepolia (or other supported testnet)
 * with full client-side encryption via @cofhe/sdk.
 *
 *   1. LastVaultMultiHeir   — N-of-M threshold inheritance with encrypted weights
 *   2. SelectiveDisclosure  — auditor permits attached to the vault
 *   3. ConfidentialEscrow   — payment escrow released by FHE claim verification
 *
 * The EncryptedAllowlist library is automatically linked at compile time via Hardhat.
 *
 * Required env (see .env.example):
 *   PRIVATE_KEY        — deployer wallet private key
 *   VAULT_KEY_HEX      — 64 hex chars (256 bits), no 0x prefix
 *   TIMEOUT_SECONDS    — DMS timeout (default: 7776000 = 90 days, min: 86400)
 *   THRESHOLD          — recovery threshold (sum of weights required, default 60)
 *   HEIRS              — comma-separated heir addresses + weights, e.g.
 *                        "0xAA...:40,0xBB...:30,0xCC...:30"
 *   AUDITOR_ADDRESS    — (optional) address authorized to verify claims
 *   ESCROW_AMOUNT_ETH  — (optional) ETH amount to fund the escrow with (default 0)
 *
 * Usage:
 *   npx hardhat run --network arbitrumSepolia scripts/deploy-wave3.ts
 */

import { ethers, network } from "hardhat";
import * as dotenv from "dotenv";
import { createCofheClient, createCofheConfig } from "@cofhe/sdk/node";
import { Encryptable } from "@cofhe/sdk";
import { arbSepolia, sepolia as fhenixSepolia } from "@cofhe/sdk/chains";
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arbitrumSepolia, sepolia } from "viem/chains";

dotenv.config();

interface HeirConfig {
  address: string;
  weight: number;
}

interface DeployConfig {
  vaultKeyHex: string;
  timeoutSeconds: number;
  threshold: number;
  heirs: HeirConfig[];
  auditorAddress?: string;
  escrowAmountEth?: string;
}

function loadConfig(): DeployConfig {
  const vaultKeyHex = process.env.VAULT_KEY_HEX;
  const timeoutSeconds = parseInt(process.env.TIMEOUT_SECONDS || "7776000");
  const threshold = parseInt(process.env.THRESHOLD || "60");
  const heirsRaw = process.env.HEIRS || "";
  const auditorAddress = process.env.AUDITOR_ADDRESS;
  const escrowAmountEth = process.env.ESCROW_AMOUNT_ETH;

  if (!vaultKeyHex || vaultKeyHex.length !== 64 || !/^[0-9a-fA-F]+$/.test(vaultKeyHex)) {
    throw new Error("VAULT_KEY_HEX must be exactly 64 hex chars (256 bits), no 0x prefix");
  }
  if (timeoutSeconds < 86400) {
    throw new Error("TIMEOUT_SECONDS must be >= 86400 (1 day)");
  }
  if (threshold < 1 || threshold > 255) {
    throw new Error("THRESHOLD must be 1-255");
  }
  if (!heirsRaw.trim()) {
    throw new Error("HEIRS env var is required (e.g., \"0xAA...:40,0xBB...:30\")");
  }

  const heirs: HeirConfig[] = heirsRaw.split(",").map((entry) => {
    const [addr, weightStr] = entry.split(":");
    const weight = parseInt(weightStr || "0");
    if (!ethers.isAddress(addr)) {
      throw new Error(`Invalid heir address: ${addr}`);
    }
    if (weight < 1 || weight > 255) {
      throw new Error(`Invalid weight for ${addr}: ${weightStr} (must be 1-255)`);
    }
    return { address: addr, weight };
  });

  if (heirs.length === 0) {
    throw new Error("At least one heir required");
  }

  const totalWeight = heirs.reduce((sum, h) => sum + h.weight, 0);
  if (totalWeight < threshold) {
    throw new Error(
      `Sum of heir weights (${totalWeight}) is less than threshold (${threshold}). ` +
      `Recovery would be impossible.`
    );
  }

  if (auditorAddress && !ethers.isAddress(auditorAddress)) {
    throw new Error(`Invalid AUDITOR_ADDRESS: ${auditorAddress}`);
  }

  return { vaultKeyHex, timeoutSeconds, threshold, heirs, auditorAddress, escrowAmountEth };
}

function explorerUrl(net: string, address: string): string {
  const explorers: Record<string, string> = {
    arbitrumSepolia: `https://sepolia.arbiscan.io/address/${address}`,
    sepolia: `https://sepolia.etherscan.io/address/${address}`,
  };
  return explorers[net] || address;
}

function getChainsForNetwork(netName: string) {
  if (netName === "arbitrumSepolia") {
    return { fheChain: arbSepolia, viemChain: arbitrumSepolia };
  }
  if (netName === "sepolia") {
    return { fheChain: fhenixSepolia, viemChain: sepolia };
  }
  throw new Error(`Unsupported network: ${netName}. Use arbitrumSepolia or sepolia.`);
}

async function main() {
  console.log("=".repeat(70));
  console.log("LastVault — Wave 3 Unified Deploy");
  console.log("Multi-Heir Threshold + Selective Disclosure + Confidential Escrow");
  console.log("=".repeat(70));
  console.log(`Network: ${network.name} (chainId: ${network.config.chainId})`);

  const cfg = loadConfig();

  const [deployer] = await ethers.getSigners();
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Balance:  ${ethers.formatEther(balance)} ETH`);

  if (balance === 0n) {
    throw new Error("Deployer has zero balance — fund from testnet faucet first");
  }

  // Split 256-bit vault key into two 128-bit halves
  const keyHi = BigInt("0x" + cfg.vaultKeyHex.slice(0, 32));
  const keyLo = BigInt("0x" + cfg.vaultKeyHex.slice(32, 64));

  console.log("\n--- Inputs ---");
  console.log(`Heirs (${cfg.heirs.length}):`);
  for (const h of cfg.heirs) {
    console.log(`  ${h.address}  weight=${h.weight}`);
  }
  console.log(`Threshold: ${cfg.threshold} (encrypted)`);
  console.log(`Timeout:   ${cfg.timeoutSeconds}s (${cfg.timeoutSeconds / 86400} days)`);
  if (cfg.auditorAddress) console.log(`Auditor:   ${cfg.auditorAddress}`);
  if (cfg.escrowAmountEth) console.log(`Escrow:    ${cfg.escrowAmountEth} ETH`);

  // ─── Set up viem clients for CoFHE ───
  const pk = process.env.PRIVATE_KEY!;
  const privateKey = (pk.startsWith("0x") ? pk : `0x${pk}`) as `0x${string}`;
  const account = privateKeyToAccount(privateKey);
  const { fheChain, viemChain } = getChainsForNetwork(network.name);

  const publicClient = createPublicClient({ chain: viemChain, transport: http() });
  const walletClient = createWalletClient({ account, chain: viemChain, transport: http() });

  console.log("\n--- Initializing @cofhe/sdk client ---");
  const config = createCofheConfig({ supportedChains: [fheChain] });
  const client = createCofheClient(config);
  await client.connect(publicClient as any, walletClient as any);
  console.log("  Connected to CoFHE coprocessor");

  // ═══════════════════════════════════════════════════════════════════
  // 1. DEPLOY LastVaultMultiHeir
  // ═══════════════════════════════════════════════════════════════════
  console.log("\n--- Encrypting MultiHeir constructor inputs ---");
  const [encPayloadHi, encPayloadLo, encTimeout, encThreshold] =
    await client.encryptInputs([
      Encryptable.uint128(keyHi),
      Encryptable.uint128(keyLo),
      Encryptable.uint64(BigInt(cfg.timeoutSeconds)),
      Encryptable.uint8(BigInt(cfg.threshold)),
    ]).execute();

  console.log("  PayloadHi, PayloadLo, Timeout, Threshold encrypted");

  console.log("\n--- Deploying LastVaultMultiHeir ---");
  const MultiHeirFactory = await ethers.getContractFactory("LastVaultMultiHeir");
  const multiHeir = await MultiHeirFactory.deploy(
    cfg.timeoutSeconds,
    encPayloadHi,
    encPayloadLo,
    encTimeout,
    encThreshold
  );
  await multiHeir.waitForDeployment();
  const multiHeirAddress = await multiHeir.getAddress();
  console.log(`Deployed to: ${multiHeirAddress}`);
  console.log(`Explorer:    ${explorerUrl(network.name, multiHeirAddress)}`);

  // ═══════════════════════════════════════════════════════════════════
  // 2. ADD HEIRS WITH ENCRYPTED WEIGHTS
  // ═══════════════════════════════════════════════════════════════════
  console.log("\n--- Adding heirs with encrypted weights ---");
  for (let i = 0; i < cfg.heirs.length; i++) {
    const h = cfg.heirs[i];
    const [encAddr, encWeight] = await client.encryptInputs([
      Encryptable.address(h.address as `0x${string}`),
      Encryptable.uint8(BigInt(h.weight)),
    ]).execute();

    const tx = await multiHeir.addHeir(encAddr, encWeight);
    await tx.wait();
    console.log(`  Heir ${i}: ${h.address} (weight=${h.weight}) — tx: ${tx.hash}`);
  }

  // ═══════════════════════════════════════════════════════════════════
  // 3. DEPLOY SelectiveDisclosure (optional)
  // ═══════════════════════════════════════════════════════════════════
  let disclosureAddress: string | null = null;
  if (cfg.auditorAddress) {
    console.log("\n--- Deploying SelectiveDisclosure ---");
    const DisclosureFactory = await ethers.getContractFactory("SelectiveDisclosure");
    const disclosure = await DisclosureFactory.deploy(deployer.address);
    await disclosure.waitForDeployment();
    disclosureAddress = await disclosure.getAddress();
    console.log(`Deployed to: ${disclosureAddress}`);

    const grantTx = await disclosure.grantAuditorPermit(cfg.auditorAddress);
    await grantTx.wait();
    console.log(`Auditor granted: ${cfg.auditorAddress}`);
  }

  // ═══════════════════════════════════════════════════════════════════
  // 4. DEPLOY ConfidentialEscrow (optional)
  // ═══════════════════════════════════════════════════════════════════
  let escrowAddress: string | null = null;
  if (cfg.escrowAmountEth && cfg.heirs.length > 0) {
    console.log("\n--- Deploying ConfidentialEscrow ---");

    // Beneficiary is heir #0 in this deployment example
    const beneficiary = cfg.heirs[0].address;
    const [encBeneficiary] = await client.encryptInputs([
      Encryptable.address(beneficiary as `0x${string}`),
    ]).execute();

    const EscrowFactory = await ethers.getContractFactory("ConfidentialEscrow");
    const escrow = await EscrowFactory.deploy(multiHeirAddress, encBeneficiary);
    await escrow.waitForDeployment();
    escrowAddress = await escrow.getAddress();
    console.log(`Deployed to: ${escrowAddress}`);
    console.log(`Verifier:    ${multiHeirAddress}`);
    console.log(`Beneficiary: [FHE-ENCRYPTED — heir #0]`);

    if (parseFloat(cfg.escrowAmountEth) > 0) {
      const value = ethers.parseEther(cfg.escrowAmountEth);
      const fundTx = await escrow.fund({ value });
      await fundTx.wait();
      console.log(`Funded with: ${cfg.escrowAmountEth} ETH (tx: ${fundTx.hash})`);
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // RECEIPT
  // ═══════════════════════════════════════════════════════════════════
  const receipt = {
    network: network.name,
    chainId: network.config.chainId,
    deployer: deployer.address,
    deployedAt: new Date().toISOString(),
    contracts: {
      LastVaultMultiHeir: {
        address: multiHeirAddress,
        explorer: explorerUrl(network.name, multiHeirAddress),
        heirs: cfg.heirs.map((h) => ({ address: h.address, weight: h.weight })),
        timeoutSeconds: cfg.timeoutSeconds,
        thresholdPlaintext: cfg.threshold,
      },
      SelectiveDisclosure: disclosureAddress
        ? {
            address: disclosureAddress,
            explorer: explorerUrl(network.name, disclosureAddress),
            auditor: cfg.auditorAddress,
          }
        : null,
      ConfidentialEscrow: escrowAddress
        ? {
            address: escrowAddress,
            explorer: explorerUrl(network.name, escrowAddress),
            verifier: multiHeirAddress,
            fundedEth: cfg.escrowAmountEth,
          }
        : null,
    },
  };

  console.log("\n" + "=".repeat(70));
  console.log("WAVE 3 DEPLOYMENT COMPLETE");
  console.log("=".repeat(70));
  console.log(JSON.stringify(receipt, null, 2));
}

main().catch((error) => {
  console.error("\nDeploy failed:");
  console.error(error);
  process.exitCode = 1;
});
