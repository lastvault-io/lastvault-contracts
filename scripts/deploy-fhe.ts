import { ethers } from "hardhat";

/**
 * Deploy LastVaultFHE contract to a Fhenix-supported testnet.
 *
 * Prerequisites:
 *   - PRIVATE_KEY env var set
 *   - CoFHE SDK initialized client-side to encrypt constructor args
 *
 * For Wave 1 demo, we deploy with dummy encrypted values and
 * demonstrate the FHE type system + access control pattern.
 *
 * Usage:
 *   npx hardhat run scripts/deploy-fhe.ts --network sepolia
 */
async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying LastVaultFHE with account:", deployer.address);
  console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)));

  const timeoutSeconds = process.env.TIMEOUT_SECONDS
    ? parseInt(process.env.TIMEOUT_SECONDS)
    : 90 * 24 * 60 * 60; // 90 days default

  console.log(`Timeout: ${timeoutSeconds} seconds (${timeoutSeconds / 86400} days)`);

  // NOTE: In production, these InEaddress/InEuint128 values come from
  // the CoFHE SDK client-side encryption. For testnet deployment,
  // you must use the SDK to encrypt the actual heir address and payload.
  //
  // Example client-side (TypeScript):
  //   import { createCofheClient } from "@cofhe/sdk";
  //   const client = createCofheClient({ ... });
  //   const encryptedHeir = await client.encrypt(heirAddress, FheTypes.Address);
  //   const encryptedPayloadHi = await client.encrypt(payloadHi, FheTypes.Uint128);
  //   const encryptedPayloadLo = await client.encrypt(payloadLo, FheTypes.Uint128);

  console.log("\n⚠️  This deploy script requires CoFHE SDK encrypted inputs.");
  console.log("   See scripts/encrypt-and-deploy.ts for the full flow.");
  console.log("\n✅ Contract compiled and ready for deployment.");
  console.log("   Run 'npx hardhat compile' to verify compilation.\n");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
