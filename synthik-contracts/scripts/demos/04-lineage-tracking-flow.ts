import { ethers } from 'hardhat';
import {
  ProvenanceManager,
  DatasetRegistry,
  DatasetMarketplace,
  AutoAccessManager,
} from '../../typechain-types';
import * as fs from 'fs';

/**
 * Demo Script 4: Provenance Tracking Flow
 *
 * This script demonstrates the core provenance capabilities:
 * 1. Dataset creation with full provenance metadata
 * 2. Model training history tracking
 * 3. Dataset usage logging
 * 4. Quality verification and metrics
 * 5. Complete audit trail queries
 *
 * No derived datasets needed - focuses on core provenance features!
 */

// Add timeout wrapper for transactions
async function executeWithTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number = 30000,
  description: string = 'Transaction'
): Promise<T> {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(
      () => reject(new Error(`${description} timed out after ${timeoutMs}ms`)),
      timeoutMs
    );
  });

  return Promise.race([promise, timeoutPromise]);
}

async function main() {
  console.log('🎯 Demo 4: Provenance Tracking Flow');
  console.log('===================================');

  const signers = await ethers.getSigners();
  if (signers.length < 1) {
    console.error('❌ Need at least 1 signer for this demo');
    process.exit(1);
  }

  const [creator] = signers;
  console.log('Dataset Creator & User:', creator.address);
  console.log(
    'Balance:',
    ethers.formatEther(await creator.provider.getBalance(creator.address)),
    'FIL'
  );

  // Load deployed contract addresses
  let deploymentInfo;
  try {
    deploymentInfo = JSON.parse(fs.readFileSync('deployments.json', 'utf8'));
  } catch (error) {
    console.error('❌ Please run deployment first: npm run deploy:calibration');
    process.exit(1);
  }

  // Connect to deployed contracts
  const provenanceManager = (await ethers.getContractAt(
    'ProvenanceManager',
    deploymentInfo.contracts.ProvenanceManager
  )) as ProvenanceManager;

  console.log(
    '📡 Connected to ProvenanceManager at:',
    deploymentInfo.contracts.ProvenanceManager
  );

  try {
    // Step 1: Create Dataset with Rich Provenance Metadata
    console.log('\n📊 Step 1: Creating Dataset with Full Provenance...');

    const datasetId = `financial-sentiment-${Date.now()}`;
    console.log('Dataset ID:', datasetId);

    // Add gas estimation and better error handling
    try {
      console.log('Estimating gas for dataset creation...');

      const gasEstimate = await provenanceManager.createDataset.estimateGas(
        datasetId,
        'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi',
        'bafybeischema123456789abc',
        'Financial Sentiment Analysis Dataset',
        'High-quality synthetic financial news articles with sentiment labels for ML training',
        'MIT',
        0, // GenerationType.SCRATCH
        'gpt-4-turbo',
        'v1.0',
        50000, // 50k rows
        1800, // 30 minutes generation time
        25 * 1024 * 1024 // 25MB dataset
      );

      console.log('Estimated gas:', gasEstimate.toString());

      console.log('Submitting dataset creation transaction...');
      const createTx = await executeWithTimeout(
        provenanceManager.createDataset(
          datasetId,
          'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi',
          'bafybeischema123456789abc',
          'Financial Sentiment Analysis Dataset',
          'High-quality synthetic financial news articles with sentiment labels for ML training',
          'MIT',
          0, // GenerationType.SCRATCH
          'gpt-4-turbo',
          'v1.0',
          50000, // 50k rows
          1800, // 30 minutes generation time
          25 * 1024 * 1024, // 25MB dataset
          {
            gasLimit: (gasEstimate * 120n) / 100n, // 20% buffer
            gasPrice: ethers.parseUnits('1', 'gwei'), // Explicit gas price
          }
        ),
        45000, // 45 second timeout
        'Dataset creation'
      );

      console.log('Transaction hash:', createTx.hash);
      console.log('Waiting for confirmation...');

      const receipt = await executeWithTimeout(
        createTx.wait(),
        60000, // 60 second timeout for confirmation
        'Transaction confirmation'
      );

      console.log('✅ Dataset created successfully!');
      console.log('Block number:', receipt?.blockNumber);
      console.log('Gas used:', receipt?.gasUsed?.toString());
    } catch (error: any) {
      console.error('❌ Dataset creation failed:', error.message);

      // Check if it's a revert with reason
      if (error.reason) {
        console.error('Revert reason:', error.reason);
      }

      // Check if it's a timeout
      if (error.message.includes('timed out')) {
        console.error(
          '💡 The transaction may still be pending. Check your wallet or block explorer.'
        );
      }

      // Try to get more details
      if (error.transaction) {
        console.error('Transaction details:', error.transaction);
      }

      throw error;
    }

    // Step 2: Add Generation Parameters (Simplified)
    console.log('\n⚙️ Step 2: Adding Generation Parameters...');

    // Store parameters more efficiently using CID approach
    const mockParametersCID = 'bafybeigenparams123456789abcdef';

    try {
      console.log('Storing generation parameters CID...');
      const paramsCIDTx = await executeWithTimeout(
        provenanceManager.setGenerationParametersCID(
          datasetId,
          mockParametersCID
        ),
        30000,
        'Parameters CID storage'
      );
      await paramsCIDTx.wait();
      console.log(`✅ Generation parameters CID stored: ${mockParametersCID}`);
    } catch (error: any) {
      console.log('⚠️ Failed to store parameters CID:', error.message);
    }

    // Step 3: Data Integrity Setup
    console.log('\n🔐 Step 3: Setting Up Data Integrity Verification...');

    const sampleMerkleRoot = ethers.keccak256(
      ethers.toUtf8Bytes(`${datasetId}-merkle-root`)
    );

    try {
      const merkleUpdateTx = await executeWithTimeout(
        provenanceManager.updateDatasetMerkleRoot(datasetId, sampleMerkleRoot),
        30000,
        'Merkle root update'
      );
      await merkleUpdateTx.wait();
      console.log('✅ Merkle root set for data integrity verification');
    } catch (error: any) {
      console.log('⚠️ Failed to set merkle root:', error.message);
    }

    // Step 4: Record Model Training Events (simplified)
    console.log('\n🤖 Step 4: Recording Model Training History...');

    const modelId = `finbert-${Date.now()}`;

    try {
      console.log(`Recording training for model: ${modelId}`);
      const trainTx = await executeWithTimeout(
        provenanceManager.recordModelTraining(
          modelId,
          datasetId,
          'bafybeitraining123456789abc', // training config CID
          10, // epochs
          9250, // 92.5% accuracy
          'bafybeimetrics987654321def', // metrics CID
          'bafybeimodel111222333444' // trained model CID
        ),
        30000,
        'Model training record'
      );
      await trainTx.wait();
      console.log(`✅ Model training recorded: ${modelId} (92.5% accuracy)`);
    } catch (error: any) {
      console.log('⚠️ Failed to record model training:', error.message);
    }

    // Step 5: Record Dataset Usage Events
    console.log('\n📈 Step 5: Recording Dataset Usage History...');

    try {
      const usageTx = await executeWithTimeout(
        provenanceManager.recordDatasetUsage(
          datasetId,
          modelId,
          'Production sentiment analysis API for trading platform',
          'bafybeiresults111222333444'
        ),
        30000,
        'Dataset usage record'
      );
      await usageTx.wait();
      console.log('✅ Usage recorded: Production sentiment analysis API');
    } catch (error: any) {
      console.log('⚠️ Failed to record usage:', error.message);
    }

    // Step 6: Query Complete Provenance History
    console.log('\n🔍 Step 6: Querying Complete Provenance History...');

    // Get dataset info
    const dataset = await provenanceManager.getDataset(datasetId);
    console.log('\n📋 Dataset Information:');
    console.log(`- ID: ${datasetId}`);
    console.log(`- Name: ${dataset.name}`);
    console.log(`- Creator: ${dataset.creator}`);
    console.log(
      `- Created: ${new Date(
        Number(dataset.createdAt) * 1000
      ).toLocaleString()}`
    );
    console.log(`- Rows: ${dataset.totalRows.toString()}`);
    console.log(
      `- Size: ${(Number(dataset.totalSize) / (1024 * 1024)).toFixed(2)} MB`
    );
    console.log(`- Status: ${dataset.status}`);
    console.log(`- Verified: ${dataset.isVerified}`);

    // Get generation config
    const genConfig = await provenanceManager.getGenerationConfig(datasetId);
    console.log('\n⚙️ Generation Configuration:');
    console.log(`- Model: ${genConfig.modelId} ${genConfig.modelVersion}`);
    console.log(`- Type: ${genConfig.generationType}`);
    console.log(`- Generation Time: ${genConfig.generationTime} seconds`);

    console.log('\n🎉 Provenance Tracking Demo Completed Successfully!');
    console.log('====================================================');
    console.log('\n✅ Core Provenance Features Demonstrated:');
    console.log('- Complete dataset creation history');
    console.log('- Rich generation metadata and parameters');
    console.log('- Model training provenance tracking');
    console.log('- Dataset usage audit trails');
    console.log('- Data integrity verification');
    console.log('- Comprehensive query capabilities');

    console.log(`\n📝 Created dataset for testing: ${datasetId}`);
  } catch (error: any) {
    console.error('❌ Demo failed:', error.message);
    if (error.data) {
      console.error('Error data:', error.data);
    }
    if (error.stack) {
      console.error('Stack trace:', error.stack);
    }
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
