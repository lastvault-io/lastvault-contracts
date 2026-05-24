/**
 * LastVault — Wave 5 Unified Deploy Script
 *
 * Deploys the Wave 5 final stack:
 *   1. LastVaultFHEMultiSig (encrypted institutional multi-sig)
 *   2. CrossChainClaimRelay on Arbitrum Sepolia (source side)
 *
 * The destination-side CrossChainClaimRelay deployment + relayer wiring
 * is done in a separate run on Base Sepolia. See deploy-cross-chain-dest.ts.
 *
 * Required env (see .env.example):
 *   PRIVATE_KEY         — deployer wallet private key
 *   MULTISIG_THRESHOLD  — encrypted threshold (1-255). Default: 2.
 *   MULTISIG_SIGNERS    — comma-separated "addr:weight" entries. Default: deployer only with weight 100.
 *
 * Usage:
 *   npx hardhat run --network arbitrumSepolia scripts/deploy-wave5-full.ts
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

interface SignerConfig {
  address: string;
  weight: number;
}

function loadConfig(deployerAddress: string) {
  const threshold = parseInt(process.env.MULTISIG_THRESHOLD || "2");
  const signersRaw = process.env.MULTISIG_SIGNERS || `${deployerAddress}:100`;

  if (threshold < 1 || threshold > 255) {
    throw new Error("MULTISIG_THRESHOLD must be 1-255");
  }

  const signers: SignerConfig[] = signersRaw.split(",").map((entry) => {
    const [addr, weightStr] = entry.split(":");
    const weight = parseInt(weightStr || "0");
    if (!ethers.isAddress(addr)) {
      throw new Error(`Invalid signer address: ${addr}`);
    }
    if (weight < 1 || weight > 255) {
      throw new Error(`Invalid weight for ${addr}: ${weightStr} (must be 1-255)`);
    }
    return { address: addr, weight };
  });

  const totalWeight = signers.reduce((s, x) => s + x.weight, 0);
  if (totalWeight < threshold) {
    throw new Error(
      `Sum of signer weights (${totalWeight}) is less than threshold (${threshold}). ` +
      `Approval would be impossible.`
    );
  }

  return { threshold, signers };
}

function explorerUrl(net: string, address: string): string {
  const explorers: Record<string, string> = {
    arbitrumSepolia: `https://sepolia.arbiscan.io/address/${address}`,
    sepolia: `https://sepolia.etherscan.io/address/${address}`,
    baseSepolia: `https://sepolia.basescan.org/address/${address}`,
  };
  return explorers[net] || address;
}

function getChainsForNetwork(netName: string) {
  if (netName === "arbitrumSepolia") return { fheChain: arbSepolia, viemChain: arbitrumSepolia };
  if (netName === "sepolia") return { fheChain: fhenixSepolia, viemChain: sepolia };
  throw new Error(`Unsupported network: ${netName}. Use arbitrumSepolia or sepolia for FHE deployments.`);
}

async function main() {
  console.log("=".repeat(70));
  console.log("LastVault — Wave 5 Unified Deploy");
  console.log("FHE Multi-Sig + Cross-Chain Claim Relay");
  console.log("=".repeat(70));
  console.log(`Network: ${network.name} (chainId: ${network.config.chainId})`);

  const [deployer] = await ethers.getSigners();
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Balance:  ${ethers.formatEther(balance)} ETH`);
  if (balance === 0n) {
    throw new Error("Deployer has zero balance — fund from testnet faucet first");
  }

  const cfg = loadConfig(deployer.address);

  console.log("\n--- Multi-Sig Config ---");
  console.log(`Threshold: ${cfg.threshold} (encrypted on-chain)`);
  console.log(`Signers (${cfg.signers.length}):`);
  for (const s of cfg.signers) {
    console.log(`  ${s.address}  weight=${s.weight}`);
  }

  // ─── Set up CoFHE client (only needed for FHE multi-sig) ───
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
  // 1. DEPLOY LastVaultFHEMultiSig
  // ═══════════════════════════════════════════════════════════════════
  console.log("\n--- Encrypting MultiSig threshold ---");
  const [encThreshold] = await client.encryptInputs([
    Encryptable.uint8(BigInt(cfg.threshold)),
  ]).execute();
  console.log("  Threshold encrypted");

  console.log("\n--- Deploying LastVaultFHEMultiSig ---");
  const MultiSigFactory = await ethers.getContractFactory("LastVaultFHEMultiSig");
  const multiSig = await MultiSigFactory.deploy(encThreshold);
  await multiSig.waitForDeployment();
  const multiSigAddress = await multiSig.getAddress();
  console.log(`Deployed to: ${multiSigAddress}`);
  console.log(`Explorer:    ${explorerUrl(network.name, multiSigAddress)}`);

  // ═══════════════════════════════════════════════════════════════════
  // 2. ADD SIGNERS
  // ═══════════════════════════════════════════════════════════════════
  console.log("\n--- Adding signers with encrypted weights ---");
  for (let i = 0; i < cfg.signers.length; i++) {
    const s = cfg.signers[i];
    const [encAddr, encWeight] = await client.encryptInputs([
      Encryptable.address(s.address as `0x${string}`),
      Encryptable.uint8(BigInt(s.weight)),
    ]).execute();

    const tx = await multiSig.addSigner(encAddr, encWeight);
    await tx.wait();
    console.log(`  Signer ${i}: ${s.address} (weight=${s.weight}) — tx: ${tx.hash}`);
  }

  // ═══════════════════════════════════════════════════════════════════
  // 3. DEPLOY CrossChainClaimRelay (source side)
  // ═══════════════════════════════════════════════════════════════════
  console.log("\n--- Deploying CrossChainClaimRelay (source side) ---");
  const RelayFactory = await ethers.getContractFactory("CrossChainClaimRelay");
  const relay = await RelayFactory.deploy();
  await relay.waitForDeployment();
  const relayAddress = await relay.getAddress();
  console.log(`Deployed to: ${relayAddress}`);
  console.log(`Explorer:    ${explorerUrl(network.name, relayAddress)}`);

  // ═══════════════════════════════════════════════════════════════════
  // RECEIPT
  // ═══════════════════════════════════════════════════════════════════
  const receipt = {
    network: network.name,
    chainId: network.config.chainId,
    deployer: deployer.address,
    deployedAt: new Date().toISOString(),
    contracts: {
      LastVaultFHEMultiSig: {
        address: multiSigAddress,
        explorer: explorerUrl(network.name, multiSigAddress),
        signers: cfg.signers,
        thresholdPlaintext: cfg.threshold,
      },
      CrossChainClaimRelay_Source: {
        address: relayAddress,
        explorer: explorerUrl(network.name, relayAddress),
        role: "source — emits ClaimVerifiedSignal events",
        nextStep: "Deploy companion relay on Base Sepolia via deploy-cross-chain-dest.ts",
      },
    },
  };

  console.log("\n" + "=".repeat(70));
  console.log("WAVE 5 SOURCE DEPLOYMENT COMPLETE");
  console.log("=".repeat(70));
  console.log(JSON.stringify(receipt, null, 2));
  console.log("\nNext: deploy destination-side relay on Base Sepolia.");
}

main().catch((error) => {
  console.error("\nDeploy failed:");
  console.error(error);
  process.exitCode = 1;
});
