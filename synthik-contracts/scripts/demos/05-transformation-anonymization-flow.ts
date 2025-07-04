import { ethers } from 'hardhat';
import {
  ProvenanceManager,
  DatasetRegistry,
  DatasetMarketplace,
  AutoAccessManager,
} from '../../typechain-types';
import * as fs from 'fs';

/**
 * Demo Script 5: Transformation & Anonymization Provenance Flow
 *
 * This script demonstrates the complete transformation and anonymization provenance:
 * 1. Original dataset creation with sensitive data
 * 2. Data transformation pipeline with quality tracking
 * 3. Privacy-preserving anonymization with compliance metadata
 * 4. Complete lineage tracking through transformation chain
 * 5. Quality metrics comparison across transformation stages
 * 6. Compliance and audit trail queries
 *
 * Demonstrates: Original → Transformed → Anonymized dataset chain
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
  console.log('🔄 Demo 5: Transformation & Anonymization Provenance Flow');
  console.log('=========================================================');

  const signers = await ethers.getSigners();
  if (signers.length < 1) {
    console.error('❌ Need at least 1 signer for this demo');
    process.exit(1);
  }

  const [signer] = signers;
  // Use same signer for both roles in this demo
  const dataOwner = signer;
  const dataEngineer = signer;

  console.log('Demo User (Data Owner & Engineer):', signer.address);
  console.log(
    'Balance:',
    ethers.formatEther(await signer.provider.getBalance(signer.address)),
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
    // Step 1: Create Original Dataset (contains sensitive data)
    console.log(
      '\n📊 Step 1: Creating Original Dataset with Sensitive Data...'
    );

    const originalDatasetId = `customer-data-original-${Date.now()}`;
    console.log('Original Dataset ID:', originalDatasetId);

    try {
      console.log('Creating original customer dataset...');

      const createOriginalTx = await executeWithTimeout(
        provenanceManager.createDataset(
          originalDatasetId,
          'bafybeicustomer123456789abc', // Customer data CID
          'bafybeischemaoriginal123456', // Original schema CID
          'Customer Database - Original',
          'Raw customer data containing PII, transaction history, and behavioral analytics',
          'PROPRIETARY',
          0, // GenerationType.SCRATCH
          'data-import-v1.0',
          'v1.0',
          100000, // 100k customer records
          0, // No generation time (imported data)
          150 * 1024 * 1024 // 150MB dataset
        ),
        45000,
        'Original dataset creation'
      );

      await createOriginalTx.wait();
      console.log('✅ Original dataset created successfully!');

      // Store original data quality metrics
      console.log('Recording original data quality baseline...');

      // Set quality parameters for original data
      await executeWithTimeout(
        provenanceManager
          .connect(dataOwner)
          .addGenerationParameter(originalDatasetId, 'pii_fields_count', '12'),
        30000,
        'PII fields parameter'
      );

      await executeWithTimeout(
        provenanceManager
          .connect(dataOwner)
          .addGenerationParameter(
            originalDatasetId,
            'sensitive_data_types',
            'ssn,email,phone,address,credit_card,date_of_birth'
          ),
        30000,
        'Sensitive data types parameter'
      );

      await executeWithTimeout(
        provenanceManager
          .connect(dataOwner)
          .addGenerationParameter(
            originalDatasetId,
            'data_source',
            'production_database_export'
          ),
        30000,
        'Data source parameter'
      );
    } catch (error: any) {
      console.error('❌ Original dataset creation failed:', error.message);
      throw error;
    }

    // Step 2: Create Transformed Dataset (data cleaning and feature engineering)
    console.log('\n🔧 Step 2: Creating Transformed Dataset...');

    const transformedDatasetId = `customer-data-transformed-${Date.now()}`;
    console.log('Transformed Dataset ID:', transformedDatasetId);

    try {
      // Create transformed dataset
      const createTransformedTx = await executeWithTimeout(
        provenanceManager.connect(dataEngineer).createDataset(
          transformedDatasetId,
          'bafybeicustomertransformed123', // Transformed data CID
          'bafybeischematransformed456', // Transformed schema CID
          'Customer Database - Transformed',
          'Cleaned and feature-engineered customer data with derived analytics fields',
          'PROPRIETARY',
          3, // GenerationType.TRANSFORM
          'synthik-transform-v2.1',
          'v2.1',
          100000, // Same row count
          3600, // 1 hour transformation time
          180 * 1024 * 1024 // 180MB (larger due to feature engineering)
        ),
        45000,
        'Transformed dataset creation'
      );

      await createTransformedTx.wait();
      console.log('✅ Transformed dataset created successfully!');

      // Link lineage: transformed dataset derives from original
      console.log('Linking transformation lineage...');
      await executeWithTimeout(
        provenanceManager
          .connect(dataEngineer)
          .linkDatasetLineage(transformedDatasetId, [originalDatasetId]),
        30000,
        'Transformation lineage linking'
      );

      // Store transformation pipeline configuration on Filecoin/IPFS
      const transformationConfigCID = 'bafybeitransformconfig123456789';
      await executeWithTimeout(
        provenanceManager
          .connect(dataEngineer)
          .setGenerationParametersCID(
            transformedDatasetId,
            transformationConfigCID
          ),
        30000,
        'Transformation config CID storage'
      );

      // Store transformation metadata
      await executeWithTimeout(
        provenanceManager
          .connect(dataEngineer)
          .addGenerationParameter(
            transformedDatasetId,
            'transformation_type',
            'feature_engineering'
          ),
        30000,
        'Transformation type parameter'
      );

      await executeWithTimeout(
        provenanceManager
          .connect(dataEngineer)
          .addGenerationParameter(
            transformedDatasetId,
            'transformations_applied',
            'data_cleaning,feature_derivation,normalization,outlier_removal'
          ),
        30000,
        'Transformations applied parameter'
      );

      await executeWithTimeout(
        provenanceManager
          .connect(dataEngineer)
          .addGenerationParameter(
            transformedDatasetId,
            'new_features_count',
            '8'
          ),
        30000,
        'New features count parameter'
      );

      await executeWithTimeout(
        provenanceManager
          .connect(dataEngineer)
          .addGenerationParameter(
            transformedDatasetId,
            'data_quality_improvement',
            '15%'
          ),
        30000,
        'Quality improvement parameter'
      );

      console.log('✅ Transformation metadata stored successfully!');
    } catch (error: any) {
      console.error('❌ Transformed dataset creation failed:', error.message);
      throw error;
    }

    // Step 3: Create Anonymized Dataset (privacy-preserving)
    console.log('\n🔒 Step 3: Creating Anonymized Dataset...');

    const anonymizedDatasetId = `customer-data-anonymized-${Date.now()}`;
    console.log('Anonymized Dataset ID:', anonymizedDatasetId);

    try {
      // Create anonymized dataset
      const createAnonymizedTx = await executeWithTimeout(
        provenanceManager.connect(dataEngineer).createDataset(
          anonymizedDatasetId,
          'bafybeicustomeranonymized456', // Anonymized data CID
          'bafybeischemaanonymized789', // Anonymized schema CID
          'Customer Database - Anonymized',
          'Privacy-preserving anonymized customer data suitable for external sharing and ML training',
          'CC-BY-4.0', // Now shareable license
          3, // GenerationType.TRANSFORM (anonymization is a transformation)
          'synthik-anonymize-v1.5',
          'v1.5',
          100000, // Same row count
          2400, // 40 minutes anonymization time
          120 * 1024 * 1024 // 120MB (smaller due to removed/generalized fields)
        ),
        45000,
        'Anonymized dataset creation'
      );

      await createAnonymizedTx.wait();
      console.log('✅ Anonymized dataset created successfully!');

      // Link lineage: anonymized dataset derives from transformed dataset
      console.log('Linking anonymization lineage...');
      await executeWithTimeout(
        provenanceManager
          .connect(dataEngineer)
          .linkDatasetLineage(anonymizedDatasetId, [transformedDatasetId]),
        30000,
        'Anonymization lineage linking'
      );

      // Store anonymization configuration on Filecoin/IPFS
      const anonymizationConfigCID = 'bafybeianonymizeconfig123456789';
      await executeWithTimeout(
        provenanceManager
          .connect(dataEngineer)
          .setGenerationParametersCID(
            anonymizedDatasetId,
            anonymizationConfigCID
          ),
        30000,
        'Anonymization config CID storage'
      );

      // Store comprehensive anonymization metadata
      const anonymizationParams = [
        ['transformation_type', 'anonymization'],
        ['privacy_level', 'high'],
        ['anonymization_methods', 'hash,mask,generalize,remove,shuffle'],
        ['pii_fields_anonymized', '12'],
        ['reversible', 'false'],
        ['k_anonymity_level', '5'],
        ['differential_privacy', 'true'],
        ['epsilon_value', '0.1'],
        ['compliance_standards', 'GDPR,CCPA,HIPAA'],
        ['anonymization_seed', 'synthik-2024-secure'],
        ['data_utility_retention', '85%'],
        ['privacy_risk_assessment', 'low'],
      ];

      for (const [key, value] of anonymizationParams) {
        await executeWithTimeout(
          provenanceManager
            .connect(dataEngineer)
            .addGenerationParameter(anonymizedDatasetId, key, value),
          30000,
          `Anonymization parameter: ${key}`
        );
      }

      console.log('✅ Anonymization metadata stored successfully!');
    } catch (error: any) {
      console.error('❌ Anonymized dataset creation failed:', error.message);
      throw error;
    }

    // Step 4: Record Quality Metrics Across Transformation Chain
    console.log('\n📊 Step 4: Recording Quality Metrics for All Datasets...');

    // Note: In a real scenario, you would need VERIFIER_ROLE
    // For demo purposes, we'll show the function calls that would be made

    console.log('Quality metrics recording (would require VERIFIER_ROLE):');

    console.log(
      '- Original Dataset Quality: High completeness, unverified consistency'
    );
    console.log(
      '- Transformed Dataset Quality: Improved consistency, added features'
    );
    console.log(
      '- Anonymized Dataset Quality: Reduced completeness, maintained utility'
    );

    // Step 5: Data Integrity Verification
    console.log('\n🔐 Step 5: Setting Up Data Integrity Verification...');

    try {
      // Set merkle roots for all datasets
      const originalMerkleRoot = ethers.keccak256(
        ethers.toUtf8Bytes(`${originalDatasetId}-merkle-root`)
      );
      const transformedMerkleRoot = ethers.keccak256(
        ethers.toUtf8Bytes(`${transformedDatasetId}-merkle-root`)
      );
      const anonymizedMerkleRoot = ethers.keccak256(
        ethers.toUtf8Bytes(`${anonymizedDatasetId}-merkle-root`)
      );

      await executeWithTimeout(
        provenanceManager
          .connect(dataOwner)
          .updateDatasetMerkleRoot(originalDatasetId, originalMerkleRoot),
        30000,
        'Original merkle root update'
      );

      await executeWithTimeout(
        provenanceManager
          .connect(dataEngineer)
          .updateDatasetMerkleRoot(transformedDatasetId, transformedMerkleRoot),
        30000,
        'Transformed merkle root update'
      );

      await executeWithTimeout(
        provenanceManager
          .connect(dataEngineer)
          .updateDatasetMerkleRoot(anonymizedDatasetId, anonymizedMerkleRoot),
        30000,
        'Anonymized merkle root update'
      );

      console.log('✅ Data integrity verification set up for all datasets');
    } catch (error: any) {
      console.log('⚠️ Failed to set up data integrity:', error.message);
    }

    // Step 6: Record Dataset Usage for ML Training
    console.log('\n🤖 Step 6: Recording ML Training with Anonymized Data...');

    try {
      const mlModelId = `customer-churn-model-${Date.now()}`;

      // Record model training using anonymized dataset
      await executeWithTimeout(
        provenanceManager.connect(dataEngineer).recordModelTraining(
          mlModelId,
          anonymizedDatasetId,
          'bafybeimltraining123456789', // ML training config CID
          50, // epochs
          8750, // 87.5% accuracy
          'bafybeimlmetrics987654321', // ML metrics CID
          'bafybeimlmodel111222333' // Trained model CID
        ),
        30000,
        'ML model training record'
      );

      // Record usage of anonymized data for external sharing
      await executeWithTimeout(
        provenanceManager
          .connect(dataEngineer)
          .recordDatasetUsage(
            anonymizedDatasetId,
            'data-sharing-partner-1',
            'Third-party analytics partnership for customer behavior research',
            'bafybeiusageresults123456'
          ),
        30000,
        'External usage record'
      );

      console.log('✅ ML training and usage recorded successfully!');
    } catch (error: any) {
      console.log('⚠️ Failed to record ML training:', error.message);
    }

    // Step 7: Query Complete Transformation Provenance
    console.log('\n🔍 Step 7: Querying Complete Transformation Provenance...');

    // Query original dataset
    const originalDataset = await provenanceManager.getDataset(
      originalDatasetId
    );
    console.log('\n📋 Original Dataset Information:');
    console.log(`- ID: ${originalDatasetId}`);
    console.log(`- Name: ${originalDataset.name}`);
    console.log(`- Creator: ${originalDataset.creator}`);
    console.log(`- License: ${originalDataset.license}`);
    console.log(`- Rows: ${originalDataset.totalRows.toString()}`);
    console.log(
      `- Size: ${(Number(originalDataset.totalSize) / (1024 * 1024)).toFixed(
        2
      )} MB`
    );

    // Query transformed dataset and its lineage
    const transformedDataset = await provenanceManager.getDataset(
      transformedDatasetId
    );
    const transformedLineage = await provenanceManager.getDatasetLineage(
      transformedDatasetId
    );
    console.log('\n🔧 Transformed Dataset Information:');
    console.log(`- ID: ${transformedDatasetId}`);
    console.log(`- Name: ${transformedDataset.name}`);
    console.log(`- Creator: ${transformedDataset.creator}`);
    console.log(`- Parent Datasets: ${transformedLineage.join(', ')}`);
    console.log(
      `- Size: ${(Number(transformedDataset.totalSize) / (1024 * 1024)).toFixed(
        2
      )} MB`
    );

    // Query anonymized dataset and its complete lineage
    const anonymizedDataset = await provenanceManager.getDataset(
      anonymizedDatasetId
    );
    const anonymizedLineage = await provenanceManager.getDatasetLineage(
      anonymizedDatasetId
    );
    console.log('\n🔒 Anonymized Dataset Information:');
    console.log(`- ID: ${anonymizedDatasetId}`);
    console.log(`- Name: ${anonymizedDataset.name}`);
    console.log(`- Creator: ${anonymizedDataset.creator}`);
    console.log(`- License: ${anonymizedDataset.license} (now shareable!)`);
    console.log(`- Parent Datasets: ${anonymizedLineage.join(', ')}`);
    console.log(
      `- Size: ${(Number(anonymizedDataset.totalSize) / (1024 * 1024)).toFixed(
        2
      )} MB`
    );

    // Query transformation parameters
    const privacyLevel = await provenanceManager.getGenerationParameter(
      anonymizedDatasetId,
      'privacy_level'
    );
    const anonymizationMethods = await provenanceManager.getGenerationParameter(
      anonymizedDatasetId,
      'anonymization_methods'
    );
    const complianceStandards = await provenanceManager.getGenerationParameter(
      anonymizedDatasetId,
      'compliance_standards'
    );
    const dataUtilityRetention = await provenanceManager.getGenerationParameter(
      anonymizedDatasetId,
      'data_utility_retention'
    );

    console.log('\n🔒 Anonymization Details:');
    console.log(`- Privacy Level: ${privacyLevel}`);
    console.log(`- Methods Applied: ${anonymizationMethods}`);
    console.log(`- Compliance Standards: ${complianceStandards}`);
    console.log(`- Data Utility Retained: ${dataUtilityRetention}`);

    // Query ML training records
    const mlTrainings = await provenanceManager.getModelTrainings(
      anonymizedDatasetId
    );
    console.log('\n🤖 ML Training Records:');
    if (mlTrainings.length > 0) {
      mlTrainings.forEach((training, index) => {
        console.log(`- Model ${index + 1}: ${training.modelId}`);
        console.log(`  Accuracy: ${Number(training.accuracy) / 100}%`);
        console.log(`  Epochs: ${training.epochs}`);
        console.log(`  Trainer: ${training.trainer}`);
      });
    }

    // Query usage records
    const usageRecords = await provenanceManager.getDatasetUsages(
      anonymizedDatasetId
    );
    console.log('\n📈 Dataset Usage Records:');
    if (usageRecords.length > 0) {
      usageRecords.forEach((usage, index) => {
        console.log(`- Usage ${index + 1}: ${usage.purpose}`);
        console.log(`  User: ${usage.user}`);
        console.log(
          `  Date: ${new Date(Number(usage.usedAt) * 1000).toLocaleString()}`
        );
      });
    }

    console.log(
      '\n🎉 Transformation & Anonymization Provenance Demo Completed!'
    );
    console.log(
      '================================================================'
    );
    console.log('\n✅ Complete Transformation Chain Demonstrated:');
    console.log(`📊 Original Dataset: ${originalDatasetId}`);
    console.log(`    ↓ [data cleaning, feature engineering]`);
    console.log(`🔧 Transformed Dataset: ${transformedDatasetId}`);
    console.log(`    ↓ [anonymization, privacy preservation]`);
    console.log(`🔒 Anonymized Dataset: ${anonymizedDatasetId}`);
    console.log('\n✅ Provenance Features Demonstrated:');
    console.log('- Complete dataset lineage tracking');
    console.log('- Transformation pipeline metadata');
    console.log('- Privacy-preserving anonymization tracking');
    console.log('- Compliance and audit trail logging');
    console.log('- Data quality metrics across transformations');
    console.log('- ML training provenance with privacy-safe data');
    console.log('- External data sharing audit trails');
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
