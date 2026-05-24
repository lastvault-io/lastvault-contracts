/**
 * LastVault — Wave 5 Cross-Chain Destination Deploy
 *
 * Deploys CrossChainClaimRelay on the DESTINATION chain (e.g. Base Sepolia).
 * No FHE coprocessor needed here — destination chain only ingests signals
 * from the source-chain event log.
 *
 * Required env:
 *   PRIVATE_KEY     — deployer wallet private key (Base Sepolia funded)
 *   RELAYER_ADDRESS — (optional) initial off-chain relayer to register
 *
 * Usage:
 *   npx hardhat run --network baseSepolia scripts/deploy-cross-chain-dest.ts
 */

import { ethers, network } from "hardhat";
import * as dotenv from "dotenv";

dotenv.config();

function explorerUrl(net: string, address: string): string {
  const explorers: Record<string, string> = {
    arbitrumSepolia: `https://sepolia.arbiscan.io/address/${address}`,
    sepolia: `https://sepolia.etherscan.io/address/${address}`,
    baseSepolia: `https://sepolia.basescan.org/address/${address}`,
  };
  return explorers[net] || address;
}

async function main() {
  console.log("=".repeat(70));
  console.log("CrossChainClaimRelay — DESTINATION DEPLOY");
  console.log("=".repeat(70));
  console.log(`Network: ${network.name} (chainId: ${network.config.chainId})`);

  const [deployer] = await ethers.getSigners();
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Balance:  ${ethers.formatEther(balance)} ETH`);
  if (balance === 0n) {
    throw new Error("Deployer has zero balance — fund from testnet faucet first");
  }

  console.log("\n--- Deploying CrossChainClaimRelay ---");
  const Factory = await ethers.getContractFactory("CrossChainClaimRelay");
  const relay = await Factory.deploy();
  await relay.waitForDeployment();
  const relayAddress = await relay.getAddress();
  console.log(`Deployed to: ${relayAddress}`);
  console.log(`Explorer:    ${explorerUrl(network.name, relayAddress)}`);

  // Optional: register an initial off-chain relayer
  const relayerAddress = process.env.RELAYER_ADDRESS;
  if (relayerAddress && ethers.isAddress(relayerAddress) && relayerAddress !== deployer.address) {
    console.log(`\n--- Registering initial relayer ${relayerAddress} ---`);
    const tx = await relay.addRelayer(relayerAddress);
    await tx.wait();
    console.log(`Relayer registered. tx: ${tx.hash}`);
  } else {
    console.log("\n(Deployer is implicit relayer; no extra relayer registered.)");
  }

  const receipt = {
    network: network.name,
    chainId: network.config.chainId,
    deployer: deployer.address,
    deployedAt: new Date().toISOString(),
    contract: "CrossChainClaimRelay (destination)",
    address: relayAddress,
    explorer: explorerUrl(network.name, relayAddress),
    role: "destination — ingests ClaimVerifiedSignal from source via relayers",
    initialRelayer: relayerAddress || "(none)",
  };

  console.log("\n" + "=".repeat(70));
  console.log("DESTINATION DEPLOY COMPLETE");
  console.log("=".repeat(70));
  console.log(JSON.stringify(receipt, null, 2));
}

main().catch((error) => {
  console.error("\nDeploy failed:", error);
  process.exitCode = 1;
});
