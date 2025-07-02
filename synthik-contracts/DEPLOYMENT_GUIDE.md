# Synthik Provenance System - Deployment Guide

## Overview

This guide covers deploying the Synthik provenance system smart contracts to Filecoin Calibration testnet.

## Contracts

The system consists of 4 main contracts:

1. **ProvenanceManager** - Core contract for dataset creation and lineage tracking
2. **DatasetRegistry** - Access control and relationship management
3. **DatasetMarketplace** - Economic layer for buying/selling datasets
4. **AutoAccessManager** - Automated access rule management

## Prerequisites

1. **Environment Setup**

   ```bash
   cp .env.example .env
   # Add your private key to .env file
   PRIVATE_KEY=your_private_key_here
   ```

2. **FIL Balance**

   - Ensure your wallet has sufficient FIL for deployment on Calibration testnet
   - Get testnet FIL from: https://faucet.calibration.fildev.network/

3. **USDFC Token**
   - The system uses USDFC token for payments: `0xb3042734b608a1B16e9e86B374A3f3e389B4cDf0`
   - This is a USDC-like token on Filecoin Calibration

## Deployment Steps

### 1. Compile Contracts

```bash
npx hardhat compile
```

### 2. Deploy to Filecoin Calibration

```bash
npm run deploy:calibration
```

Or manually:

```bash
npx hardhat run scripts/deploy.ts --network filecoin-calibration
```

### 3. Verify Deployment

The deployment script will:

- Deploy all 4 contracts in correct order
- Set up roles and permissions
- Create a test dataset
- Save deployment info to `deployments.json`

## Post-Deployment

### Contract Addresses

After successful deployment, you'll see:

```
📋 Contract Addresses:
ProvenanceManager:     0x...
DatasetRegistry:       0x...
DatasetMarketplace:    0x...
AutoAccessManager:     0x...
```

### Roles Granted

The deployer receives these roles:

- `VERIFIER_ROLE` - Can verify dataset quality
- `CURATOR_ROLE` - Can curate dataset collections
- `TREASURY_ROLE` - Can manage marketplace treasury

### Test Dataset

A test dataset is created with ID: `test-financial-dataset`

- Auto-access enabled for 7 days
- Listed on marketplace for 1 USDFC

## Verification (Optional)

To verify contracts on Filscan:

```bash
# Example for ProvenanceManager
npx hardhat verify --network filecoin-calibration <CONTRACT_ADDRESS>
```

## Usage Examples

### Creating a Dataset

```solidity
provenanceManager.createDataset(
    "my-dataset-id",
    "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi", // data CID
    "bafybeischema123456789abcdef", // metadata CID
    "My Dataset",
    "Description of my dataset",
    "MIT",
    0, // GenerationType.SCRATCH
    "gpt-4-turbo",
    "v1.0",
    10000, // rows
    300,   // generation time (seconds)
    5 * 1024 * 1024 // size (bytes)
);
```

### Setting Up Auto Access

```solidity
autoAccessManager.createAccessRule(
    "my-dataset-id",
    86400 * 30, // 30 days duration
    100,        // max users
    ["research", "commercial"], // purposes
    false,      // no verification required
    0          // no minimum reputation
);
```

### Listing on Marketplace

```solidity
datasetMarketplace.listDataset(
    "my-dataset-id",
    parseEther("10"), // 10 USDFC
    "0xb3042734b608a1B16e9e86B374A3f3e389B4cDf0", // USDFC token
    1, // LicenseType.COMMERCIAL
    50, // max licenses
    1000 // 10% royalty (1000 basis points)
);
```

## Network Configuration

### Filecoin Calibration Testnet

- **Chain ID**: 314159
- **RPC URL**: https://api.calibration.node.glif.io/rpc/v1
- **Explorer**: https://calibration.filscan.io
- **Faucet**: https://faucet.calibration.fildev.network/

### USDFC Token Details

- **Address**: `0xb3042734b608a1B16e9e86B374A3f3e389B4cDf0`
- **Decimals**: 18 (assumed)
- **Name**: USDFC (Filecoin USD Coin)

## Troubleshooting

### Common Issues

1. **Gas Estimation Failed**

   - Increase gas limit in hardhat.config.ts
   - Check account has sufficient FIL balance

2. **Timeout Errors**

   - Filecoin can be slow, increase timeout in config
   - Retry the deployment

3. **Role Assignment Failures**
   - Ensure deployer has admin role
   - Check transaction confirmations

### Support

- Filecoin Documentation: https://docs.filecoin.io
- Hardhat Documentation: https://hardhat.org/docs
- OpenZeppelin Access Control: https://docs.openzeppelin.com/contracts/access-control

## Security Notes

- Keep private keys secure
- Test thoroughly on testnet before mainnet
- Consider multi-sig for production treasury
- Audit contracts before handling real value

## Frontend Integration

After deployment, update your frontend configuration with the deployed contract addresses from `deployments.json`.

Example for React/Next.js:

```javascript
const CONTRACTS = {
  ProvenanceManager: '0x...',
  DatasetRegistry: '0x...',
  DatasetMarketplace: '0x...',
  AutoAccessManager: '0x...',
};
```
