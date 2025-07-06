# Synthik Provenance System - Demo Scripts

This directory contains comprehensive demo scripts that showcase the complete functionality of the Synthik provenance system. Each script demonstrates different user flows and use cases.

## Prerequisites

1. **Deploy the contracts first:**

   ```bash
   npm run deploy:calibration
   ```

2. **Ensure you have FIL tokens** on Filecoin Calibration testnet for gas fees

3. **Set up environment variables** in `.env` file (see `.env.example`)

## Demo Scripts Overview

### 1. Dataset Creator Flow (`01-dataset-creator-flow.ts`)

**Purpose:** Demonstrates the complete flow for a dataset creator

**Features:**

- Create a new dataset with full provenance tracking
- Set quality metrics and verification
- Configure access control rules
- Set up automatic access for researchers
- List dataset on marketplace
- Add to curated collections
- Record dataset usage

**Run:**

```bash
npm run demo:creator
```

**What you'll see:**

- Dataset creation with metadata and CIDs
- Quality verification process
- Access control setup
- Marketplace listing
- Usage tracking

### 2. Dataset Consumer Flow (`02-dataset-consumer-flow.ts`)

**Purpose:** Shows how researchers and developers discover and use datasets

**Features:**

- Discover available datasets
- Check dataset details and quality metrics
- Request automatic access
- Browse marketplace listings
- Record dataset usage for model training
- Query lineage and provenance

**Run:**

```bash
npm run demo:consumer
```

**What you'll see:**

- Dataset discovery process
- Access request workflows
- Marketplace browsing
- Usage tracking and lineage building

### 3. Marketplace Flow (`03-marketplace-flow.ts`)

**Purpose:** Demonstrates the economic layer and marketplace functionality

**Features:**

- Create and list datasets for sale
- Browse marketplace listings
- Purchase dataset licenses (simulated)
- Track sales analytics
- Manage licensing and royalties
- Dynamic pricing updates

**Run:**

```bash
npm run demo:marketplace
```

**What you'll see:**

- Dataset listing process
- Marketplace browsing
- Purchase flow (simulated)
- Revenue tracking
- License management

### 4. Lineage Tracking Flow (`04-lineage-tracking-flow.ts`)

**Purpose:** Showcases the advanced provenance and lineage tracking capabilities

**Features:**

- Create parent datasets
- Build derived datasets with lineage links
- Track model training with datasets
- Record dataset usage
- Query complete provenance chains
- Verify data integrity with merkle proofs

**Run:**

```bash
npm run demo:lineage
```

**What you'll see:**

- Parent-child dataset relationships
- Complete lineage tracking
- Model training provenance
- Data integrity verification
- Comprehensive audit trails

### 5. Transformation & Anonymization Flow (`05-transformation-anonymization-flow.ts`)

**Purpose:** Demonstrates data transformation and privacy protection capabilities

**Features:**

- Transform and anonymize sensitive datasets
- Apply privacy-preserving techniques
- Track transformation lineage
- Verify anonymization quality
- Maintain data utility while protecting privacy

**Run:**

```bash
npm run demo:transform
```

**What you'll see:**

- Data transformation processes
- Privacy protection techniques
- Anonymization quality metrics
- Transformation lineage tracking

## Running All Demos

To run all demos in sequence:

```bash
npm run demo:all
```

This will execute all demo scripts one after another, providing a complete tour of the Synthik system.

## Demo Data

Each demo script creates sample datasets with unique IDs based on timestamps. The scripts are designed to be run multiple times without conflicts.

### Sample Dataset Types Created:

1. **E-commerce Customer Behavior** (Creator demo)
2. **Medical Diagnosis Patterns** (Marketplace demo)
3. **Financial News & Market Data** (Lineage demo)
4. **Enhanced Financial Sentiment** (Lineage demo - derived)
5. **Anonymized Healthcare Records** (Transformation demo)

## Understanding the Output

### ✅ Success Messages

Green checkmarks indicate successful operations

### ⚠️ Warning Messages

Yellow warnings indicate expected failures or optional operations

### 📊 Data Displays

Information about created datasets, contracts, and transactions

### 🎉 Completion Summaries

Final status and next steps for each demo

## Key Concepts Demonstrated

### Provenance Tracking

- Complete dataset lineage from creation to usage
- Model training history and accuracy tracking
- Data transformation and augmentation records

### Access Control

- Manual access granting
- Automatic rule-based access
- Role-based permissions (VERIFIER, CURATOR, etc.)

### Economic Layer

- Dataset marketplace with pricing
- Royalty distribution to creators
- License management and tracking

### Data Integrity

- Merkle root verification
- Immutable provenance records
- Cryptographic proof of data authenticity

### Privacy Protection

- Data anonymization and transformation
- Privacy-preserving synthetic data generation
- Compliance with data protection regulations

## Troubleshooting

### Common Issues:

1. **"Please run deployment first"**

   - Run `npm run deploy:calibration` before demos

2. **Gas estimation failed**

   - Ensure you have sufficient FIL tokens
   - Check network connectivity

3. **Access control failures**

   - Some operations require specific roles
   - Warnings are expected for role-restricted operations

4. **Marketplace purchase failures**

   - Expected without actual USDFC tokens
   - Demonstrates the purchase flow structure

5. **No listings found**
   - Run the marketplace demo first to create listings
   - Use `npm run demo:marketplace` before `npm run demo:listings`

## Next Steps

After running the demos:

1. **Explore the contracts** - Check the deployed contract addresses in `deployments.json`

2. **Integrate with frontend** - Use the contract addresses and ABIs in your frontend application

3. **Create real datasets** - Use the patterns shown in demos to create actual datasets

4. **Set up USDFC tokens** - For real marketplace transactions

5. **Configure access rules** - Set up automatic access rules for your use cases

6. **Analyze marketplace data** - Use the listings script to monitor market activity

## Contract Addresses

After deployment, find contract addresses in:

- `deployments.json` - Complete deployment information
- Console output - Displayed during deployment

## Support

For questions or issues:

- Review the contract documentation in `/contracts`
- Check the deployment guide in `DEPLOYMENT_GUIDE.md`
- Examine the contract source code for detailed functionality
