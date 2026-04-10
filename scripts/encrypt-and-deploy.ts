/**
 * LastVaultFHE — Encrypt & Deploy (Wave 2)
 *
 * Full deployment flow with @cofhe/sdk client-side encryption.
 * Updated for the new builder-pattern API (migrated from cofhejs).
 *
 * Required env (see .env.example):
 *   PRIVATE_KEY      — deployer wallet private key
 *   HEIR_ADDRESS     — heir's plaintext Ethereum address
 *   VAULT_KEY_HEX    — 64 hex chars (256 bits), no 0x prefix
 *   TIMEOUT_SECONDS  — DMS timeout (default: 7776000 = 90 days, min: 86400)
 *   MAX_ATTEMPTS     — max claim attempts (default: 3)
 *
 * Usage:
 *   npm run deploy:arb-sepolia       # PRIMARY — Fhenix CoFHE flagship testnet
 *   npm run deploy:sepolia           # Fallback — Ethereum Sepolia
 *
 * ─────────────────────────────────────────────────────────────────────
 * SDK API verified against @cofhe/sdk migration guide (Apr 2026):
 *   https://cofhe-docs.fhenix.zone/client-sdk/introduction/migrating-from-cofhejs.md
 *   https://cofhe-docs.fhenix.zone/client-sdk/reference/sdk-reference.md
 * ─────────────────────────────────────────────────────────────────────
 */

import { ethers, network } from "hardhat";
import * as dotenv from "dotenv";

dotenv.config();

// @cofhe/sdk — new builder-pattern API
// NOTE: If running via Hardhat with @cofhe/hardhat-plugin, use hre.cofhe instead
// import { createCofheConfig, createCofheClient, Encryptable } from "@cofhe/sdk/node";

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
    baseSepolia: `https://sepolia.basescan.org/address/${address}`,
  };
  return explorers[net] || address;
}

async function main() {
  const hre = await import("hardhat");

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
  console.log(`Payload Hi: 0x${keyHi.toString(16).padStart(32, "0")}`);
  console.log(`Payload Lo: 0x${keyLo.toString(16).padStart(32, "0")}`);

  // ─────────────────────────────────────────────────────────────────
  // Client-side encryption via @cofhe/sdk (or Hardhat plugin)
  // ─────────────────────────────────────────────────────────────────
  console.log("\n--- Encrypting via @cofhe/sdk ---");

  // When running through Hardhat with @cofhe/hardhat-plugin:
  const client = await hre.cofhe.createClientWithBatteries(deployer);

  // Encrypt all constructor inputs
  const [encHeir] = await client
    .encryptInputs([{ type: "address", value: cfg.heirAddress }])
    .execute();
  console.log("  Heir address encrypted (InEaddress)");

  const [encPayloadHi] = await client
    .encryptInputs([{ type: "uint128", value: keyHi }])
    .execute();
  console.log("  Payload Hi encrypted (InEuint128)");

  const [encPayloadLo] = await client
    .encryptInputs([{ type: "uint128", value: keyLo }])
    .execute();
  console.log("  Payload Lo encrypted (InEuint128)");

  const [encTimeout] = await client
    .encryptInputs([{ type: "uint64", value: BigInt(cfg.timeoutSeconds) }])
    .execute();
  console.log("  Timeout encrypted (InEuint64)");

  const [encMaxAttempts] = await client
    .encryptInputs([{ type: "uint8", value: BigInt(cfg.maxAttempts) }])
    .execute();
  console.log("  Max attempts encrypted (InEuint8)");

  // ─────────────────────────────────────────────────────────────────
  // Deploy
  // ─────────────────────────────────────────────────────────────────
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

  console.log(`Deploy tx: ${vault.deploymentTransaction()?.hash}`);
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

  // Deployment receipt
  const receipt = {
    network: network.name,
    chainId: network.config.chainId,
    contract: "LastVaultFHE",
    version: "Wave 2",
    address,
    deployer: deployer.address,
    timeoutSeconds: cfg.timeoutSeconds,
    maxAttempts: cfg.maxAttempts,
    txHash: vault.deploymentTransaction()?.hash,
    explorer: explorerUrl(network.name, address),
    deployedAt: new Date().toISOString(),
    fheOps: [
      "asEaddress", "asEuint128", "asEuint64", "asEuint8",
      "eq", "ne", "gte", "sub", "add", "select", "and", "not",
      "allowThis", "allow", "allowPublic", "publishDecryptResult",
    ],
  };

  console.log("\n--- Deployment Receipt (save this for W2 submission) ---");
  console.log(JSON.stringify(receipt, null, 2));
}

main().catch((error) => {
  console.error("\nDeploy failed:");
  console.error(error);
  process.exitCode = 1;
});
