import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "@cofhe/hardhat-plugin";

const PRIVATE_KEY = process.env.PRIVATE_KEY;

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
    ...(PRIVATE_KEY ? {
      sepolia: {
        url: process.env.SEPOLIA_RPC || "https://rpc.sepolia.org",
        accounts: [PRIVATE_KEY],
      },
      arbitrumSepolia: {
        url: process.env.ARB_SEPOLIA_RPC || "https://sepolia-rollup.arbitrum.io/rpc",
        accounts: [PRIVATE_KEY],
      },
      baseSepolia: {
        url: process.env.BASE_SEPOLIA_RPC || "https://sepolia.base.org",
        accounts: [PRIVATE_KEY],
      },
    } : {}),
  },
};

export default config;
