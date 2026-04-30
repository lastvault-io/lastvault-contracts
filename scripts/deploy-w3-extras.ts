/**
 * Deploy SelectiveDisclosure + ConfidentialEscrow against an existing
 * LastVaultMultiHeir deployment. Reads MULTI_HEIR_ADDRESS from env.
 *
 * Usage:
 *   MULTI_HEIR_ADDRESS=0x... npx hardhat run --network arbitrumSepolia scripts/deploy-w3-extras.ts
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

function explorerUrl(net: string, address: string): string {
  const explorers: Record<string, string> = {
    arbitrumSepolia: `https://sepolia.arbiscan.io/address/${address}`,
    sepolia: `https://sepolia.etherscan.io/address/${address}`,
  };
  return explorers[net] || address;
}

function getChainsForNetwork(netName: string) {
  if (netName === "arbitrumSepolia") return { fheChain: arbSepolia, viemChain: arbitrumSepolia };
  if (netName === "sepolia") return { fheChain: fhenixSepolia, viemChain: sepolia };
  throw new Error(`Unsupported network: ${netName}`);
}

async function main() {
  console.log("=".repeat(70));
  console.log("Wave 3 Extras — SelectiveDisclosure + ConfidentialEscrow");
  console.log("=".repeat(70));

  const multiHeirAddress = process.env.MULTI_HEIR_ADDRESS;
  const auditorAddress = process.env.AUDITOR_ADDRESS;
  const escrowAmountEth = process.env.ESCROW_AMOUNT_ETH;
  const beneficiaryAddress = (process.env.HEIRS || "").split(",")[0]?.split(":")[0];

  if (!multiHeirAddress || !ethers.isAddress(multiHeirAddress)) {
    throw new Error("MULTI_HEIR_ADDRESS env var required (existing LastVaultMultiHeir address)");
  }
  if (!beneficiaryAddress || !ethers.isAddress(beneficiaryAddress)) {
    throw new Error("First heir address (from HEIRS env) is invalid — needed for escrow beneficiary");
  }

  const [deployer] = await ethers.getSigners();
  console.log(`Deployer: ${deployer.address}`);
  console.log(`MultiHeir verifier: ${multiHeirAddress}`);

  // ─── 1. SelectiveDisclosure ───
  let disclosureAddress: string | null = null;
  if (auditorAddress && ethers.isAddress(auditorAddress)) {
    console.log("\n--- Deploying SelectiveDisclosure ---");
    const Factory = await ethers.getContractFactory("SelectiveDisclosure");
    const disclosure = await Factory.deploy(deployer.address);
    await disclosure.waitForDeployment();
    disclosureAddress = await disclosure.getAddress();
    console.log(`Deployed:    ${disclosureAddress}`);
    console.log(`Explorer:    ${explorerUrl(network.name, disclosureAddress)}`);

    const grantTx = await disclosure.grantAuditorPermit(auditorAddress);
    await grantTx.wait();
    console.log(`Auditor:     ${auditorAddress} (granted)`);
  } else {
    console.log("\n[skip] SelectiveDisclosure — AUDITOR_ADDRESS not set");
  }

  // ─── 2. ConfidentialEscrow ───
  let escrowAddress: string | null = null;
  if (escrowAmountEth && parseFloat(escrowAmountEth) > 0) {
    console.log("\n--- Deploying ConfidentialEscrow ---");

    const pk = process.env.PRIVATE_KEY!;
    const privateKey = (pk.startsWith("0x") ? pk : `0x${pk}`) as `0x${string}`;
    const account = privateKeyToAccount(privateKey);
    const { fheChain, viemChain } = getChainsForNetwork(network.name);

    const publicClient = createPublicClient({ chain: viemChain, transport: http() });
    const walletClient = createWalletClient({ account, chain: viemChain, transport: http() });

    const config = createCofheConfig({ supportedChains: [fheChain] });
    const client = createCofheClient(config);
    await client.connect(publicClient as any, walletClient as any);
    console.log("CoFHE client connected");

    const [encBeneficiary] = await client.encryptInputs([
      Encryptable.address(beneficiaryAddress as `0x${string}`),
    ]).execute();
    console.log("Beneficiary encrypted (heir #0)");

    const Factory = await ethers.getContractFactory("ConfidentialEscrow");
    const escrow = await Factory.deploy(multiHeirAddress, encBeneficiary);
    await escrow.waitForDeployment();
    escrowAddress = await escrow.getAddress();
    console.log(`Deployed:    ${escrowAddress}`);
    console.log(`Explorer:    ${explorerUrl(network.name, escrowAddress)}`);

    const value = ethers.parseEther(escrowAmountEth);
    const fundTx = await escrow.fund({ value });
    await fundTx.wait();
    console.log(`Funded:      ${escrowAmountEth} ETH (tx: ${fundTx.hash})`);
  } else {
    console.log("\n[skip] ConfidentialEscrow — ESCROW_AMOUNT_ETH not set");
  }

  console.log("\n" + "=".repeat(70));
  console.log("EXTRAS DEPLOYMENT COMPLETE");
  console.log("=".repeat(70));
  console.log(JSON.stringify({
    network: network.name,
    multiHeir: multiHeirAddress,
    selectiveDisclosure: disclosureAddress,
    confidentialEscrow: escrowAddress,
    deployedAt: new Date().toISOString(),
  }, null, 2));
}

main().catch((error) => {
  console.error("\nDeploy failed:", error);
  process.exitCode = 1;
});
