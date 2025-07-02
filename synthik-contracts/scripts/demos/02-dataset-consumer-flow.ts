import * as hre from 'hardhat';
import * as fs from 'fs';

/**
 * Demo Script 2: Dataset Consumer Flow
 *
 * This script demonstrates the complete flow for a dataset consumer/researcher:
 * 1. Discover and browse available datasets
 * 2. Request access (automatic or manual)
 * 3. Purchase dataset license
 * 4. Use dataset for model training
 * 5. Track usage and build lineage
 */

async function main() {
  console.log('🎯 Demo 2: Dataset Consumer Flow');
  console.log('=================================');

  const signers = await hre.ethers.getSigners();
  if (signers.length < 1) {
    console.error('❌ Need at least 1 signer for this demo');
    process.exit(1);
  }

  const [consumer] = signers;
  console.log('Dataset Consumer:', consumer.address);

  // Load deployed contract addresses
  let deploymentInfo;
  try {
    deploymentInfo = JSON.parse(fs.readFileSync('deployments.json', 'utf8'));
  } catch (error) {
    console.error('❌ Please run deployment first: npm run deploy:calibration');
    process.exit(1);
  }

  // Connect to deployed contracts
  const provenanceManager = await hre.ethers.getContractAt(
    'ProvenanceManager',
    deploymentInfo.contracts.ProvenanceManager
  );

  const datasetRegistry = await hre.ethers.getContractAt(
    'DatasetRegistry',
    deploymentInfo.contracts.DatasetRegistry
  );

  const datasetMarketplace = await hre.ethers.getContractAt(
    'DatasetMarketplace',
    deploymentInfo.contracts.DatasetMarketplace
  );

  const autoAccessManager = await hre.ethers.getContractAt(
    'AutoAccessManager',
    deploymentInfo.contracts.AutoAccessManager
  );

  try {
    // Step 1: Discover Available Datasets
    console.log('\n🔍 Step 1: Discovering Available Datasets...');

    // Get all dataset events to find available datasets
    const filter = provenanceManager.filters.DatasetCreated();
    const events = await provenanceManager.queryFilter(filter, -1000); // Last 1000 blocks

    console.log(`Found ${events.length} datasets:`);
    for (let i = 0; i < Math.min(events.length, 3); i++) {
      const event = events[i];
      const datasetId = event.args?.datasetId;
      if (datasetId) {
        const dataset = await provenanceManager.getDataset(datasetId);
        console.log(
          `- ${datasetId}: ${dataset.name} (${dataset.totalRows} rows)`
        );
      }
    }

    // Use the test dataset from deployment
    const targetDatasetId =
      deploymentInfo.testDataset || 'test-financial-dataset';
    console.log(`\n🎯 Targeting dataset: ${targetDatasetId}`);

    // Step 2: Check Dataset Details and Access Requirements
    console.log('\n📋 Step 2: Checking Dataset Details...');

    const dataset = await provenanceManager.getDataset(targetDatasetId);
    console.log('Dataset Information:');
    console.log('- Name:', dataset.name);
    console.log('- Description:', dataset.description);
    console.log('- Creator:', dataset.creator);
    console.log('- Rows:', dataset.totalRows.toString());
    console.log('- License:', dataset.license);

    // Check quality metrics
    try {
      const quality = await provenanceManager.qualityMetrics(targetDatasetId);
      console.log('\nQuality Metrics:');
      console.log('- Accuracy:', quality.accuracy.toString(), '%');
      console.log('- Completeness:', quality.completeness.toString(), '%');
      console.log('- Consistency:', quality.consistency.toString(), '%');
    } catch (error) {
      console.log('⚠️ Quality metrics not available');
    }

    // Step 3: Check Access Options
    console.log('\n🔐 Step 3: Checking Access Options...');

    // Check if auto-access is available
    try {
      // Note: Using requestAutoAccess directly since canRequestAccess doesn't exist
      console.log('✅ Attempting automatic access request...');

      // Request automatic access
      console.log('\n🤖 Requesting Automatic Access...');
      const accessTx = await autoAccessManager.requestAutoAccess(
        targetDatasetId,
        'academic-research'
      );
      await accessTx.wait();
      console.log('✅ Automatic access request submitted!');
    } catch (error) {
      console.log('⚠️ Auto-access request failed, proceeding with marketplace');
    }

    // Step 4: Check Marketplace Listing
    console.log('\n💰 Step 4: Checking Marketplace Listing...');

    try {
      // Note: Using datasetPricing mapping directly since getDatasetListing doesn't exist
      const pricing = await datasetMarketplace.datasetPricing(targetDatasetId);
      console.log('Marketplace Listing:');
      console.log('- Price:', hre.ethers.formatEther(pricing.price), 'tokens');
      console.log('- License Type:', pricing.licenseType.toString());
      console.log('- Max Licenses:', pricing.maxLicenses.toString());
      console.log('- Active:', pricing.isActive);

      // For demo purposes, let's simulate having tokens
      console.log('\n💳 Step 5: Purchasing Dataset License...');
      console.log('(Note: In production, you would need payment tokens)');

      // This would require actual payment tokens in production
      // const purchaseTx = await datasetMarketplace.purchaseDataset(
      //   targetDatasetId,
      //   'Commercial usage for model training'
      // );
      // await purchaseTx.wait();

      console.log('✅ Dataset license purchased (simulated)');
    } catch (error) {
      console.log('⚠️ Marketplace listing not available');
    }

    // Step 5: Access Dataset and Build Lineage
    console.log('\n🔗 Step 6: Building Usage Lineage...');

    // Record dataset usage for model training
    const modelId = `consumer-model-${Date.now()}`;
    console.log('Training model with ID:', modelId);

    // In a real scenario, this would be called after model training
    const usageTx = await provenanceManager.recordDatasetUsage(
      targetDatasetId,
      modelId,
      'Training sentiment analysis model for academic research',
      'bafybeiresults123456789abc' // results CID
    );
    await usageTx.wait();
    console.log('✅ Dataset usage recorded in provenance chain');

    // Step 6: Query Lineage
    console.log('\n🔍 Step 7: Querying Dataset Lineage...');

    // Get usage history
    const usageFilter = provenanceManager.filters.DatasetUsed(targetDatasetId);
    const usageEvents = await provenanceManager.queryFilter(usageFilter, -1000);

    console.log(`Dataset has been used ${usageEvents.length} times:`);
    for (const event of usageEvents.slice(0, 3)) {
      console.log(`- User: ${event.args?.user}`);
      console.log(`- Model: ${event.args?.modelId}`);
      console.log(`- Purpose: ${event.args?.purpose}`);
      console.log('---');
    }

    // Step 7: Check Access Status
    console.log('\n📊 Step 8: Access Status Summary...');

    // Use checkAccess instead of hasAccess
    const hasAccess = await datasetRegistry.checkAccess(
      targetDatasetId,
      consumer.address
    );
    console.log(
      'Current Access Status:',
      hasAccess ? '✅ Granted' : '❌ Denied'
    );

    if (hasAccess) {
      const accessExpiry = await datasetRegistry.getAccessExpiry(
        targetDatasetId,
        consumer.address
      );
      console.log('Access Expiry:', accessExpiry.toString());
    }

    console.log('\n🎉 Dataset Consumer Flow Completed Successfully!');
    console.log('================================================');
    console.log('As a dataset consumer, you have:');
    console.log('✅ Discovered available datasets');
    console.log('✅ Reviewed dataset quality and provenance');
    console.log('✅ Obtained access (auto or purchased)');
    console.log('✅ Used dataset for model training');
    console.log('✅ Recorded usage in provenance chain');
    console.log('✅ Built transparent lineage trail');
    console.log('');
    console.log('Benefits achieved:');
    console.log('- Transparent data provenance');
    console.log('- Quality-assured datasets');
    console.log('- Automated access management');
    console.log('- Traceable model lineage');
    console.log('- Fair compensation to creators');
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
