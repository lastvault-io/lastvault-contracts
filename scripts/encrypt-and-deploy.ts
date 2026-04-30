/**
 * LastVaultFHE — Encrypt & Deploy (Wave 2)
 *
 * Real testnet deployment with @cofhe/sdk client-side encryption.
 * Uses viem for the CoFHE client, ethers (via Hardhat) for contract deployment.
 *
 * Required env (see .env.example):
 *   PRIVATE_KEY      — deployer wallet private key
 *   HEIR_ADDRESS     — heir's plaintext Ethereum address
 *   VAULT_KEY_HEX    — 64 hex chars (256 bits), no 0x prefix
 *   TIMEOUT_SECONDS  — DMS timeout (default: 7776000 = 90 days, min: 86400)
 *   MAX_ATTEMPTS     — max claim attempts (default: 3)
 *
 * Usage:
 *   npm run deploy:arb-sepolia
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

interface DeployConfig {
  heirAddress: string;
  vaultKeyHex: string;
  timeoutSeconds: number;
  maxAttempts: number;
}

function loadConfig(): DeployConfig {
  const heirAddress = process.env.HEIR_ADDRESS;
  const vaultKeyHex = process.env.VAULT_KEY_HEX;
  const timeoutSeconds = parseInt(process.env.TIMEOUT_SECONDS || "7776000");
  const maxAttempts = parseInt(process.env.MAX_ATTEMPTS || "3");

  if (!heirAddress || !ethers.isAddress(heirAddress)) {
    throw new Error("HEIR_ADDRESS is missing or not a valid Ethereum address");
  }
  if (!vaultKeyHex || vaultKeyHex.length !== 64 || !/^[0-9a-fA-F]+$/.test(vaultKeyHex)) {
    throw new Error("VAULT_KEY_HEX must be exactly 64 hex chars (256 bits), no 0x prefix");
  }
  if (timeoutSeconds < 86400) {
    throw new Error("TIMEOUT_SECONDS must be >= 86400 (1 day)");
  }
  if (maxAttempts < 1 || maxAttempts > 255) {
    throw new Error("MAX_ATTEMPTS must be 1-255");
  }

  return { heirAddress, vaultKeyHex, timeoutSeconds, maxAttempts };
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
  console.log("=".repeat(60));
  console.log("LastVaultFHE — Encrypt & Deploy (Wave 2)");
  console.log("Private Identity Verification Primitive on Fhenix CoFHE");
  console.log("=".repeat(60));
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
  console.log(`Heir (plaintext, will be FHE-encrypted): ${cfg.heirAddress}`);
  console.log(`Timeout: ${cfg.timeoutSeconds}s (${cfg.timeoutSeconds / 86400} days)`);
  console.log(`Max attempts: ${cfg.maxAttempts}`);

  // ─── Set up viem clients for CoFHE ───
  const pk = process.env.PRIVATE_KEY!;
  const privateKey = (pk.startsWith("0x") ? pk : `0x${pk}`) as `0x${string}`;
  const account = privateKeyToAccount(privateKey);
  const { fheChain, viemChain } = getChainsForNetwork(network.name);

  const publicClient = createPublicClient({
    chain: viemChain,
    transport: http(),
  });

  const walletClient = createWalletClient({
    account,
    chain: viemChain,
    transport: http(),
  });

  // ─── Initialize CoFHE client ───
  console.log("\n--- Initializing @cofhe/sdk client ---");
  const config = createCofheConfig({
    supportedChains: [fheChain],
  });
  const client = createCofheClient(config);
  await client.connect(publicClient as any, walletClient as any);
  console.log("  Connected to CoFHE coprocessor");

  // ─── Encrypt all constructor inputs ───
  console.log("\n--- Encrypting inputs client-side ---");
  const [encHeir, encPayloadHi, encPayloadLo, encTimeout, encMaxAttempts] =
    await client.encryptInputs([
      Encryptable.address(cfg.heirAddress as `0x${string}`),
      Encryptable.uint128(keyHi),
      Encryptable.uint128(keyLo),
      Encryptable.uint64(BigInt(cfg.timeoutSeconds)),
      Encryptable.uint8(BigInt(cfg.maxAttempts)),
    ]).execute();

  console.log("  Heir encrypted (InEaddress)");
  console.log("  Payload Hi encrypted (InEuint128)");
  console.log("  Payload Lo encrypted (InEuint128)");
  console.log("  Timeout encrypted (InEuint64)");
  console.log("  Max attempts encrypted (InEuint8)");

  // ─── Deploy ───
  console.log("\n--- Deploying LastVaultFHE ---");

  const Factory = await ethers.getContractFactory("LastVaultFHE");
  const vault = await Factory.deploy(
    cfg.timeoutSeconds,
    encHeir,
    encPayloadHi,
    encPayloadLo,
    encTimeout,
    encMaxAttempts
  );

  const deployTxHash = vault.deploymentTransaction()?.hash;
  console.log(`Deploy tx: ${deployTxHash}`);
  console.log("Waiting for confirmation...");
  await vault.waitForDeployment();

  const address = await vault.getAddress();

  console.log("\n" + "=".repeat(60));
  console.log("DEPLOYED SUCCESSFULLY");
  console.log("=".repeat(60));
  console.log(`Contract:  ${address}`);
  console.log(`Explorer:  ${explorerUrl(network.name, address)}`);
  console.log(`Owner:     ${deployer.address}`);
  console.log(`Heir:      [FHE-ENCRYPTED — invisible on-chain]`);
  console.log(`Payload:   [FHE-ENCRYPTED — 256-bit vault key, opaque]`);
  console.log(`Timeout:   [FHE-ENCRYPTED — ${cfg.timeoutSeconds}s plaintext helper]`);
  console.log(`Attempts:  [FHE-ENCRYPTED — max ${cfg.maxAttempts}]`);

  const receipt = {
    network: network.name,
    chainId: network.config.chainId,
    contract: "LastVaultFHE",
    version: "Wave 2",
    address,
    deployer: deployer.address,
    timeoutSeconds: cfg.timeoutSeconds,
    maxAttempts: cfg.maxAttempts,
    txHash: deployTxHash,
    explorer: explorerUrl(network.name, address),
    deployedAt: new Date().toISOString(),
    fheOps: [
      "asEaddress", "asEuint128", "asEuint64", "asEuint8",
      "eq", "ne", "gte", "sub", "add", "select", "and", "not",
      "allowThis", "allow", "allowPublic", "publishDecryptResult",
    ],
  };

  console.log("\n--- Deployment Receipt (save for W2 submission) ---");
  console.log(JSON.stringify(receipt, null, 2));
}

main().catch((error) => {
  console.error("\nDeploy failed:");
  console.error(error);
  process.exitCode = 1;
});
