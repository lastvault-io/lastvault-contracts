import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "@cofhe/hardhat-plugin";
import * as dotenv from "dotenv";

dotenv.config();

const PRIVATE_KEY = process.env.PRIVATE_KEY;
// Etherscan V2 API uses a single unified API key across all supported chains
// Fallback to ARBISCAN_API_KEY for backward compatibility
const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY || process.env.ARBISCAN_API_KEY || "";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.26",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      evmVersion: "cancun",
    },
  },
  paths: {
    sources: "./src",
    tests: "./test-hardhat",
    cache: "./cache-hardhat",
    artifacts: "./artifacts",
  },
  networks: {
    // Local CoFHE mock environment (default — no PRIVATE_KEY required)
    hardhat: {
      chainId: 31337,
    },
    ...(PRIVATE_KEY ? {
      // Fhenix CoFHE — PRIMARY testnet (per Fhenix docs, Apr 2026)
      // CoFHE is live on Arbitrum Sepolia — lower gas, current flagship
      arbitrumSepolia: {
        url: process.env.ARB_SEPOLIA_RPC || "https://sepolia-rollup.arbitrum.io/rpc",
        chainId: 421614,
        accounts: [PRIVATE_KEY],
      },
      // Fhenix CoFHE — SECONDARY testnet (Ethereum Sepolia)
      sepolia: {
        url: process.env.SEPOLIA_RPC || "https://rpc.sepolia.org",
        chainId: 11155111,
        accounts: [PRIVATE_KEY],
      },
      // Base Sepolia — listed in some Fhenix docs, verify CoFHE availability before use
      baseSepolia: {
        url: process.env.BASE_SEPOLIA_RPC || "https://sepolia.base.org",
        chainId: 84532,
        accounts: [PRIVATE_KEY],
      },
    } : {}),
  },
  // Etherscan V2 API — single unified key for all supported chains
  etherscan: {
    apiKey: ETHERSCAN_API_KEY,
  },
  sourcify: {
    enabled: true,
  },
};

export default config;
