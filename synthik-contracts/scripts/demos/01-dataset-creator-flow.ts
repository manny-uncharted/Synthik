import { ethers } from 'hardhat';
import {
  ProvenanceManager,
  DatasetRegistry,
  DatasetMarketplace,
  AutoAccessManager,
} from '../../typechain-types';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Demo Script 1: Dataset Creator Flow
 *
 * This script demonstrates the complete flow for a dataset creator:
 * 1. Create a new dataset with provenance tracking
 * 2. Set up access control rules
 * 3. List the dataset on the marketplace
 * 4. Monitor dataset usage and earnings
 */

async function main() {
  console.log('🎯 Demo 1: Dataset Creator Flow');
  console.log('================================');

  const [creator] = await ethers.getSigners();
  console.log('Dataset Creator:', creator.address);

  // Load deployed contract addresses
  let deploymentInfo;
  try {
    deploymentInfo = JSON.parse(fs.readFileSync('deployments.json', 'utf8'));
  } catch (error) {
    console.error('❌ Please run deployment first: npm run deploy:calibration');
    process.exit(1);
  }

  // Connect to deployed contracts with proper typing
  const provenanceManager = (await ethers.getContractAt(
    'ProvenanceManager',
    deploymentInfo.contracts.ProvenanceManager
  )) as ProvenanceManager;

  const datasetRegistry = (await ethers.getContractAt(
    'DatasetRegistry',
    deploymentInfo.contracts.DatasetRegistry
  )) as DatasetRegistry;

  const datasetMarketplace = (await ethers.getContractAt(
    'DatasetMarketplace',
    deploymentInfo.contracts.DatasetMarketplace
  )) as DatasetMarketplace;

  const autoAccessManager = (await ethers.getContractAt(
    'AutoAccessManager',
    deploymentInfo.contracts.AutoAccessManager
  )) as AutoAccessManager;

  const datasetId = `creator-demo-${Date.now()}`;
  console.log('Creating dataset with ID:', datasetId);

  try {
    // Step 1: Create Dataset with Full Provenance
    console.log('\n📊 Step 1: Creating Dataset with Provenance...');
    const createTx = await provenanceManager.createDataset(
      datasetId,
      'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi', // Data CID on Filecoin
      'bafybeischema456789abcdef012345', // Metadata CID on Filecoin
      'Premium E-commerce Customer Behavior Dataset',
      'High-quality synthetic e-commerce data with customer journeys, purchase patterns, and behavioral analytics. Generated using advanced ML models with privacy-preserving techniques.',
      'CC-BY-4.0', // Creative Commons license
      1, // GenerationType.AUGMENTED (enhanced from real patterns)
      'claude-3-opus',
      'v2.1',
      50000, // 50k rows
      1800, // 30 minutes generation time
      15 * 1024 * 1024 // 15MB dataset
    );
    await createTx.wait();
    console.log('✅ Dataset created with full provenance tracking');

    // Step 2: Set Quality Metrics (using the correct method name)
    console.log('\n🔍 Step 2: Adding Quality Verification...');
    try {
      // Submit quality metrics (requires VERIFIER_ROLE)
      const qualityTx = await provenanceManager.submitQualityMetrics(
        datasetId,
        9500, // 95% completeness
        8800, // 88% consistency
        9200, // 92% accuracy
        8500, // 85% uniqueness
        9000, // 90% timeliness
        'bafybeiquality123456789abcdef' // validation report CID
      );
      await qualityTx.wait();
      console.log('✅ Quality metrics verified and recorded');
    } catch (error) {
      console.log(
        '⚠️ Quality metrics submission failed (may need VERIFIER_ROLE)'
      );
    }

    // Step 3: Set Access Control - Grant access to specific users
    console.log('\n🔐 Step 3: Setting Up Access Control...');

    try {
      // Grant read access to the creator themselves
      const accessTx = await datasetRegistry.grantAccess(
        datasetId,
        creator.address,
        1 // READ access level
      );
      await accessTx.wait();
      console.log('✅ Access granted to creator');
    } catch (error) {
      console.log('⚠️ Access control setup failed:', error);
    }

    // Step 4: Create Automatic Access Rule for Researchers
    console.log('\n🤖 Step 4: Setting Up Auto-Access for Researchers...');
    try {
      const autoAccessTx = await autoAccessManager.createAccessRule(
        datasetId,
        86400 * 30, // 30 days access duration
        25, // max 25 researchers
        ['academic-research', 'non-commercial-research'], // allowed purposes
        true, // require verification
        50 // minimum reputation score of 50
      );
      await autoAccessTx.wait();
      console.log('✅ Auto-access rule created for verified researchers');
    } catch (error) {
      console.log('⚠️ Auto-access rule creation failed:', error);
    }

    // Step 5: List on Marketplace with Tiered Pricing
    console.log('\n💰 Step 5: Listing on Marketplace...');
    try {
      const listTx = await datasetMarketplace.listDataset(
        datasetId,
        ethers.parseEther('25'), // 25 USDFC for commercial license
        deploymentInfo.usdcToken,
        1, // LicenseType.COMMERCIAL
        100, // max 100 commercial licenses
        750 // 7.5% royalty to creator
      );
      await listTx.wait();
      console.log('✅ Dataset listed on marketplace');
    } catch (error) {
      console.log('⚠️ Marketplace listing failed:', error);
    }

    // Step 6: Add Dataset to Collections
    console.log('\n📚 Step 6: Adding to Collections...');
    try {
      const collectionTx = await datasetRegistry.addToCollection(
        'premium-ecommerce',
        datasetId
      );
      await collectionTx.wait();
      console.log('✅ Added to "premium-ecommerce" collection');
    } catch (error) {
      console.log('⚠️ Collection addition failed:', error);
    }

    // Step 7: Monitor Dataset Status
    console.log('\n📈 Step 7: Dataset Status Summary...');
    const dataset = await provenanceManager.getDataset(datasetId);

    console.log('Dataset Information:');
    console.log('- Name:', dataset.name);
    console.log('- Creator:', dataset.creator);
    console.log('- Rows:', dataset.totalRows.toString());
    console.log('- Data CID:', dataset.dataCid);
    console.log('- Metadata CID:', dataset.metadataCid);
    console.log('- License:', dataset.license);
    console.log('- Size:', dataset.totalSize.toString(), 'bytes');
    console.log('- Verified:', dataset.isVerified);
    console.log('- Status:', dataset.status.toString());
    console.log('- Quality Level:', dataset.quality.toString());

    // Get generation config separately
    try {
      const genConfig = await provenanceManager.getGenerationConfig(datasetId);
      console.log('\nGeneration Configuration:');
      console.log('- Model ID:', genConfig.modelId);
      console.log('- Model Version:', genConfig.modelVersion);
      console.log('- Generation Type:', genConfig.generationType.toString());
      console.log(
        '- Generation Time:',
        genConfig.generationTime.toString(),
        'seconds'
      );
      console.log('- Row Count:', genConfig.rowCount.toString());
    } catch (error) {
      console.log('⚠️ Could not fetch generation config');
    }

    // Try to get quality metrics
    try {
      const quality = await provenanceManager.qualityMetrics(datasetId);
      console.log('\nQuality Metrics:');
      console.log('- Accuracy:', quality.accuracy.toString());
      console.log('- Completeness:', quality.completeness.toString());
      console.log('- Consistency:', quality.consistency.toString());
      console.log('- Uniqueness:', quality.uniqueness.toString());
      console.log('- Timeliness:', quality.timeliness.toString());
      console.log('- Validator:', quality.validator);
      console.log('- Validation Report CID:', quality.validationReportCid);
    } catch (error) {
      console.log('⚠️ Quality metrics not available');
    }

    // Record a usage example
    console.log('\n📝 Step 8: Recording Dataset Usage...');
    try {
      const usageTx = await provenanceManager.recordDatasetUsage(
        datasetId,
        'demo-model-001',
        'Demonstration of dataset usage tracking',
        'bafybeusage123456789abcdef'
      );
      await usageTx.wait();
      console.log('✅ Dataset usage recorded');
    } catch (error) {
      console.log('⚠️ Usage recording failed:', error);
    }

    console.log('\n🎉 Dataset Creator Flow Completed Successfully!');
    console.log('===============================================');
    console.log('Your dataset is now:');
    console.log('✅ Registered with full provenance');
    console.log('✅ Available with access controls');
    console.log('✅ Listed on marketplace (if successful)');
    console.log('✅ Added to curated collection (if successful)');
    console.log('✅ Ready for auto-access rules (if successful)');
    console.log('✅ Usage tracking enabled');
    console.log('');
    console.log('Next steps:');
    console.log('- Monitor usage analytics');
    console.log('- Respond to access requests');
    console.log('- Update pricing based on demand');
    console.log('- Create related datasets');
    console.log('');
    console.log('Dataset ID for testing:', datasetId);
  } catch (error: any) {
    console.error('❌ Demo failed:', error.message);
    if (error.data) {
      console.error('Error data:', error.data);
    }
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
