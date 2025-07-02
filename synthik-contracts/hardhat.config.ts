import { HardhatUserConfig } from 'hardhat/config';
import '@nomicfoundation/hardhat-toolbox';
import * as dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

// Get private key from environment variable
const PRIVATE_KEY = process.env.PRIVATE_KEY;

if (!PRIVATE_KEY) {
  console.warn(
    'WARNING: PRIVATE_KEY not set in .env file. Using default accounts for local development only.'
  );
}

// Base configuration
const config: HardhatUserConfig = {
  solidity: {
    version: '0.8.28',
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      viaIR: true,
    },
  },
  paths: {
    sources: './contracts',
    tests: './test',
    cache: './cache',
    artifacts: './artifacts',
  },
  networks: {
    // Hardhat local network
    hardhat: {
      // Optional settings:
      // accounts: { count: 10 },
      // mining: { auto: true, interval: 5000 },
      // gasPrice: 8000000000,
    },
  },
  etherscan: {
    apiKey: {
      filecoinCalibration: process.env.FILSCAN_API_KEY || '',
      filecoinMainnet: process.env.FILSCAN_API_KEY || '',
    },
    customChains: [
      {
        network: 'filecoinCalibration',
        chainId: 314159,
        urls: {
          apiURL: 'https://calibration.filscan.io:8700/api',
          browserURL: 'https://calibration.filscan.io',
        },
      },
      {
        network: 'filecoinMainnet',
        chainId: 314,
        urls: {
          apiURL: 'https://api.filscan.io:8700/api',
          browserURL: 'https://filscan.io',
        },
      },
    ],
  },
};

// Add network configurations only if private key is available
if (PRIVATE_KEY) {
  config.networks = {
    ...config.networks,
    baseSepolia: {
      url: 'https://sepolia.base.org',
      accounts: [PRIVATE_KEY],
      gasPrice: 1000000000, // 1 gwei
      chainId: 84532,
    },
    'filecoin-hyperspace': {
      url: 'https://api.hyperspace.node.glif.io/rpc/v1',
      accounts: [PRIVATE_KEY],
      chainId: 3141,
    },
    'filecoin-calibration': {
      url: 'https://api.calibration.node.glif.io/rpc/v1',
      accounts: [PRIVATE_KEY],
      chainId: 314159,
      gas: 8000000,
      gasPrice: 2000000000, // 2 Gwei - higher for reliability
      timeout: 120000, // 2 minutes timeout
    },
    'filecoin-mainnet': {
      url: 'https://api.node.glif.io/rpc/v1',
      accounts: [PRIVATE_KEY],
      chainId: 314,
    },
    sepolia: {
      url: 'https://rpc.sepolia.org',
      accounts: [PRIVATE_KEY],
      chainId: 11155111,
    },
  };
}

export default config;
