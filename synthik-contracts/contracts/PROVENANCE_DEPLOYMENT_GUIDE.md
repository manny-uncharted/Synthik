# Synthik Provenance System Deployment Guide

## Overview

The Synthik Provenance System consists of three main contracts that work together to provide comprehensive lineage tracking, access control, and marketplace functionality for synthetic datasets.

## Contract Architecture

```
ProvenanceManager (Core)
    ├── Tracks dataset creation and lineage
    ├── Records model training history
    ├── Manages quality metrics
    └── Handles Merkle proofs for data verification

DatasetRegistry (Access & Relations)
    ├── Controls dataset access permissions
    ├── Manages dataset relationships
    ├── Handles collections and curation
    └── Provides advanced search capabilities

DatasetMarketplace (Economics)
    ├── Manages dataset pricing and licensing
    ├── Handles purchases and royalties
    ├── Tracks revenue and transactions
    └── Integrates with payment tokens
```

## Deployment Steps

### 1. Deploy ProvenanceManager

```javascript
// Deploy ProvenanceManager first as it's the core contract
const ProvenanceManager = await ethers.getContractFactory('ProvenanceManager');
const provenanceManager = await ProvenanceManager.deploy();
await provenanceManager.deployed();
console.log('ProvenanceManager deployed to:', provenanceManager.address);
```

### 2. Deploy DatasetRegistry

```javascript
// Deploy DatasetRegistry with ProvenanceManager address
const DatasetRegistry = await ethers.getContractFactory('DatasetRegistry');
const datasetRegistry = await DatasetRegistry.deploy(provenanceManager.address);
await datasetRegistry.deployed();
console.log('DatasetRegistry deployed to:', datasetRegistry.address);
```

### 3. Deploy DatasetMarketplace

```javascript
// Deploy DatasetMarketplace with both contract addresses
const DatasetMarketplace = await ethers.getContractFactory(
  'DatasetMarketplace'
);
const datasetMarketplace = await DatasetMarketplace.deploy(
  provenanceManager.address,
  datasetRegistry.address,
  treasuryAddress // Your treasury wallet
);
await datasetMarketplace.deployed();
console.log('DatasetMarketplace deployed to:', datasetMarketplace.address);
```

### 4. Setup Roles

```javascript
// Grant necessary roles
const VERIFIER_ROLE = ethers.utils.keccak256(
  ethers.utils.toUtf8Bytes('VERIFIER_ROLE')
);
const CURATOR_ROLE = ethers.utils.keccak256(
  ethers.utils.toUtf8Bytes('CURATOR_ROLE')
);

// Grant verifier role to quality validators
await provenanceManager.grantRole(VERIFIER_ROLE, verifierAddress);

// Grant curator role for dataset collections
await datasetRegistry.grantRole(CURATOR_ROLE, curatorAddress);
```

## Usage Examples

### Creating a Dataset with Full Provenance

```javascript
// 1. Create dataset in ProvenanceManager
const datasetId = 'dataset_001';
const cid = 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi';

await provenanceManager.createDataset(
  datasetId,
  cid,
  'Financial Sentiment Dataset',
  'Synthetic financial news with sentiment labels',
  'MIT',
  0, // GenerationType.SCRATCH
  'gpt-4-turbo',
  'v1.0',
  50000, // rows
  'bafybeischema...', // schema IPFS hash
  'bafybeiconfig...', // config IPFS hash
  180, // generation time in seconds
  ethers.utils.parseEther('2.4') // size in bytes
);

// 2. Add generation parameters
await provenanceManager.addGenerationParameter(datasetId, 'temperature', '0.7');
await provenanceManager.addGenerationParameter(datasetId, 'max_tokens', '500');

// 3. If dataset is derived from others, link lineage
const parentDatasets = ['parent_dataset_001', 'parent_dataset_002'];
await provenanceManager.linkDatasetLineage(datasetId, parentDatasets);

// 4. Submit Merkle root for data verification
const merkleRoot = '0x...'; // Calculate from dataset rows
await provenanceManager.updateDatasetMerkleRoot(datasetId, merkleRoot);
```

### Setting Up Dataset for Sale

```javascript
// List dataset on marketplace
await datasetMarketplace.listDataset(
  datasetId,
  ethers.utils.parseEther('0.5'), // base price
  ethers.utils.parseEther('0.00001'), // price per row
  ethers.constants.AddressZero, // ETH payment
  1, // LicenseType.COMMERCIAL
  100, // max 100 licenses
  500 // 5% royalty
);
```

### Purchasing a Dataset

```javascript
// Purchase dataset license
const rowsToPurchase = 10000; // Purchase subset of rows
const totalPrice = await calculatePrice(datasetId, rowsToPurchase);

await datasetMarketplace.purchaseDataset(
  datasetId,
  rowsToPurchase,
  'For training fraud detection model',
  { value: totalPrice }
);
```

### Recording Model Training

```javascript
// After training a model with the dataset
await provenanceManager.recordModelTraining(
  'model_001',
  datasetId,
  'bafybeitrainingconfig...', // training config IPFS hash
  100, // epochs
  9420, // accuracy in basis points (94.20%)
  'bafybeimetrics...', // detailed metrics IPFS hash
  'bafybeimodel...' // trained model CID
);
```

### Verifying Data Quality

```javascript
// Quality verifier submits metrics
await provenanceManager.submitQualityMetrics(
  datasetId,
  9500, // completeness score (95%)
  9200, // consistency score (92%)
  9800, // accuracy score (98%)
  8900, // uniqueness score (89%)
  9600, // timeliness score (96%)
  'bafybeivalidation...' // validation report IPFS hash
);
```

### Creating Dataset Relationships

```javascript
// Create relationships between datasets
await datasetRegistry.createRelationship(
  'dataset_001', // source
  'dataset_002', // target
  1, // RelationType.AUGMENTS
  'Added 20% more examples with edge cases'
);
```

### Managing Access Control

```javascript
// Request access to a dataset
await datasetRegistry.requestAccess(
  datasetId,
  'Academic research on sentiment analysis'
);

// Dataset owner grants access
await datasetRegistry.grantAccess(
  datasetId,
  researcherAddress,
  86400 * 365 // 1 year access
);
```

### Creating Dataset Collections

```javascript
// Create a curated collection
const collectionDatasets = ['dataset_001', 'dataset_002', 'dataset_003'];
await datasetRegistry.createCollection(
  'financial_ml_collection',
  'Curated Financial ML Datasets',
  collectionDatasets
);
```

### Querying Dataset Information

```javascript
// Get complete dataset info
const dataset = await provenanceManager.datasets(datasetId);
const lineage = await provenanceManager.getDatasetLineage(datasetId);
const modelTrainings = await provenanceManager.getModelTrainings(datasetId);
const qualityMetrics = await provenanceManager.qualityMetrics(datasetId);

// Get marketplace info
const pricing = await datasetMarketplace.datasetPricing(datasetId);
const licenses = await datasetMarketplace.getDatasetLicenses(datasetId);
const transactions = await datasetMarketplace.getDatasetTransactions(datasetId);

// Get relationships
const relationships = await datasetRegistry.getDatasetRelationships(datasetId);
```

### Verifying Data Rows

```javascript
// Verify a specific data row using Merkle proof
const rowData = "..."; // Actual row data
const leaf = ethers.utils.keccak256(ethers.utils.toUtf8Bytes(rowData));
const proof = [...]; // Merkle proof path

const isValid = await provenanceManager.verifyDataRow(datasetId, leaf, proof);
```

## Best Practices

1. **Dataset IDs**: Use a consistent naming convention (e.g., `category_name_version`)
2. **IPFS Storage**: Store large data on Filecoin, only store CIDs on-chain
3. **Merkle Trees**: Generate Merkle trees client-side for efficient row verification
4. **Access Control**: Use time-limited access grants for better security
5. **Quality Metrics**: Establish clear criteria for each quality dimension
6. **Royalties**: Set reasonable royalty percentages to incentivize usage

## Gas Optimization Tips

1. Batch operations when possible
2. Store minimal data on-chain, use IPFS for large content
3. Use events for data that doesn't need on-chain querying
4. Consider implementing a factory pattern for dataset creation
5. Use proxy patterns for upgradability

## Security Considerations

1. Always validate IPFS CIDs format
2. Implement rate limiting for dataset creation
3. Use reentrancy guards on all payment functions
4. Validate all user inputs
5. Consider implementing a time lock for critical operations
6. Regular security audits recommended

## Integration with Frontend

The contracts emit events that can be indexed for efficient querying:

```javascript
// Listen for dataset creation
provenanceManager.on(
  'DatasetCreated',
  (datasetId, creator, generationType, cid) => {
    console.log(`New dataset created: ${datasetId}`);
  }
);

// Listen for purchases
datasetMarketplace.on(
  'DatasetPurchased',
  (datasetId, buyer, amount, licenseType) => {
    console.log(`Dataset ${datasetId} purchased by ${buyer}`);
  }
);
```

## Upgradability

For production deployment, consider using upgradeable proxy patterns:

```javascript
const { deployProxy } = require('@openzeppelin/hardhat-upgrades');

const ProvenanceManager = await ethers.getContractFactory(
  'ProvenanceManagerV1'
);
const proxy = await deployProxy(ProvenanceManager, [], {
  initializer: 'initialize',
});
```

This system provides a robust foundation for tracking synthetic data provenance while enabling a decentralized marketplace with strong access controls and quality assurance mechanisms.
