/**
 * Network configurations and constants
 */

export const NETWORKS = {
  mainnet: {
    chainId: 314,
    rpcUrl: 'https://api.node.glif.io/rpc/v1',
    name: 'Filecoin Mainnet',
    contracts: {
      // To be updated with mainnet addresses
      ProvenanceManager: '',
      DatasetRegistry: '',
      DatasetMarketplace: '',
      AutoAccessManager: '',
    }
  },
  calibration: {
    chainId: 314159,
    rpcUrl: 'https://api.calibration.node.glif.io/rpc/v1',
    name: 'Filecoin Calibration Testnet',
    contracts: {
      ProvenanceManager: '0x29D8445d30d1a3d48dAcAdAf84b4F71FEd7E0930',
      DatasetRegistry: '0x4953A913CA616eFF2c87BE990FbC26F96D46c273',
      DatasetMarketplace: '0xF7F7901B96dCb46C0A5460629E7CA35FB013aC04',
      AutoAccessManager: '0xF599d87f982d965041a20fE8aFA6b60CC5a7a5F6',
    }
  },
  localhost: {
    chainId: 31337,
    rpcUrl: 'http://localhost:8545',
    name: 'Local Hardhat Network',
    contracts: {
      // Will be loaded from deployments
      ProvenanceManager: '',
      DatasetRegistry: '',
      DatasetMarketplace: '',
      AutoAccessManager: '',
    }
  }
} as const;

export const DEFAULT_OPTIONS = {
  confirmations: 1,
  timeout: 60000, // 60 seconds
  maxRetries: 3,
  batchSize: 10,
  gasMultiplier: 1.2, // 20% buffer
} as const;

export const STORAGE_PROVIDERS = {
  ipfs: {
    endpoint: 'https://api.ipfs.io',
    gateway: 'https://ipfs.io/ipfs/',
  },
  filecoin: {
    endpoint: 'https://api.web3.storage',
    gateway: 'https://w3s.link/ipfs/',
  },
  mock: {
    endpoint: 'mock://localhost',
    gateway: 'mock://',
  }
} as const;

export const TRANSACTION_ERRORS = {
  INSUFFICIENT_FUNDS: 'insufficient funds',
  NONCE_TOO_LOW: 'nonce too low',
  GAS_TOO_LOW: 'gas required exceeds allowance',
  NETWORK_ERROR: 'network error',
  TIMEOUT: 'timeout',
  USER_REJECTED: 'user rejected transaction',
} as const;

export const DATASET_LIMITS = {
  MIN_ROWS: 1,
  MAX_ROWS: 10_000_000,
  MAX_NAME_LENGTH: 100,
  MAX_DESCRIPTION_LENGTH: 1000,
  MAX_TAGS: 20,
  MAX_SCHEMA_FIELDS: 100,
} as const;

export const QUALITY_THRESHOLDS = {
  PREMIUM: 9000, // 90%
  HIGH: 7500,    // 75%
  STANDARD: 5000, // 50%
  BASIC: 2500,    // 25%
} as const; 