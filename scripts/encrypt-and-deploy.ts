/**
 * Full deployment flow with CoFHE SDK encryption.
 *
 * This script:
 *   1. Encrypts heir address using CoFHE SDK → InEaddress
 *   2. Splits 256-bit vault key into two 128-bit halves
 *   3. Encrypts both halves → InEuint128
 *   4. Deploys LastVaultFHE with encrypted constructor args
 *
 * Environment variables:
 *   PRIVATE_KEY        — deployer wallet private key
 *   HEIR_ADDRESS       — heir's Ethereum address (plaintext, encrypted client-side)
 *   VAULT_KEY_HEX      — 256-bit vault master key in hex (64 chars, no 0x prefix)
 *   TIMEOUT_SECONDS    — DMS timeout (default: 7776000 = 90 days)
 *
 * Usage:
 *   PRIVATE_KEY=0x... HEIR_ADDRESS=0x... VAULT_KEY_HEX=abcd... \
 *     npx hardhat run scripts/encrypt-and-deploy.ts --network sepolia
 */

// import { ethers } from "hardhat";
// import { createCofheClient, FheTypes } from "@cofhe/sdk";

async function main() {
  console.log("=== LastVaultFHE — Encrypt & Deploy ===\n");

  // Validate env
  const heirAddress = process.env.HEIR_ADDRESS;
  const vaultKeyHex = process.env.VAULT_KEY_HEX;
  const timeoutSeconds = parseInt(process.env.TIMEOUT_SECONDS || "7776000");

  if (!heirAddress || !vaultKeyHex) {
    console.error("Missing required env vars: HEIR_ADDRESS, VAULT_KEY_HEX");
    process.exit(1);
  }

  if (vaultKeyHex.length !== 64) {
    console.error("VAULT_KEY_HEX must be exactly 64 hex chars (256 bits)");
    process.exit(1);
  }

  // Split 256-bit key into two 128-bit halves
  const keyHi = BigInt("0x" + vaultKeyHex.slice(0, 32));
  const keyLo = BigInt("0x" + vaultKeyHex.slice(32, 64));

  console.log(`Heir address:  ${heirAddress}`);
  console.log(`Timeout:       ${timeoutSeconds}s (${timeoutSeconds / 86400} days)`);
  console.log(`Payload Hi:    0x${keyHi.toString(16).padStart(32, "0")}`);
  console.log(`Payload Lo:    0x${keyLo.toString(16).padStart(32, "0")}`);

  // TODO: Uncomment when @cofhe/sdk is installed and Fhenix testnet is live
  //
  // const [deployer] = await ethers.getSigners();
  // const client = createCofheClient({
  //   provider: deployer.provider,
  //   signer: deployer,
  // });
  //
  // // Encrypt inputs client-side
  // const encHeir = await client.encrypt(heirAddress, FheTypes.Address);
  // const encPayloadHi = await client.encrypt(keyHi, FheTypes.Uint128);
  // const encPayloadLo = await client.encrypt(keyLo, FheTypes.Uint128);
  //
  // // Deploy
  // const Factory = await ethers.getContractFactory("LastVaultFHE");
  // const vault = await Factory.deploy(
  //   timeoutSeconds,
  //   encHeir,
  //   encPayloadHi,
  //   encPayloadLo
  // );
  // await vault.waitForDeployment();
  //
  // console.log(`\n✅ LastVaultFHE deployed at: ${await vault.getAddress()}`);
  // console.log(`   Owner: ${deployer.address}`);
  // console.log(`   Heir: [ENCRYPTED — hidden on-chain]`);
  // console.log(`   Timeout: ${timeoutSeconds}s`);

  console.log("\n📋 Deploy script ready. Uncomment SDK calls when @cofhe/sdk is available.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
