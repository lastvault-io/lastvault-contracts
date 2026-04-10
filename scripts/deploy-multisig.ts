import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying LastVaultMultiSig with account:", deployer.address);

  // ── Configuration ────────────────────────────────────────────────────
  // Replace these with actual values before deployment

  const signers = [
    deployer.address,                              // Signer 1 (deployer)
    "0x0000000000000000000000000000000000000001",   // Signer 2 (replace)
    "0x0000000000000000000000000000000000000002",   // Signer 3 (replace)
  ];
  const requiredApprovals = 2;                      // 2-of-3
  const heirAddress = "0x0000000000000000000000000000000000000003"; // Replace
  const timeoutPeriod = 90 * 24 * 60 * 60;         // 90 days
  const encryptedPayload = ethers.toUtf8Bytes("replace-with-ecies-encrypted-payload");

  // ── Deploy ───────────────────────────────────────────────────────────

  const factory = await ethers.getContractFactory("LastVaultMultiSig");
  const contract = await factory.deploy(
    signers,
    requiredApprovals,
    heirAddress,
    timeoutPeriod,
    encryptedPayload
  );

  await contract.waitForDeployment();
  const address = await contract.getAddress();

  console.log("LastVaultMultiSig deployed to:", address);
  console.log("  Signers:", signers.length);
  console.log("  Threshold:", requiredApprovals, "of", signers.length);
  console.log("  Timeout:", timeoutPeriod / 86400, "days");
  console.log("  Heir:", heirAddress);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
