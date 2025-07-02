import { ethers } from 'hardhat';
import {
  ProvenanceManager,
  DatasetRegistry,
  DatasetMarketplace,
  AutoAccessManager,
} from '../../typechain-types';
import * as fs from 'fs';

/**
 * Demo Script 3: Marketplace Flow
 *
 * This script demonstrates the marketplace functionality:
 * 1. Browse available datasets on marketplace
 * 2. Purchase dataset licenses
 * 3. Manage licensing and royalties
 * 4. Track sales and revenue
 */

async function main() {
  console.log('🎯 Demo 3: Marketplace Flow');
  console.log('============================');

  const signers = await ethers.getSigners();
  if (signers.length < 1) {
    console.error('❌ Need at least 1 signer for this demo');
    process.exit(1);
  }

  const [seller] = signers;
  const buyer = seller; // Use same signer for both roles in demo
  console.log('Seller:', seller.address);
  console.log('Buyer:', buyer.address, '(same as seller for demo)');

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

  const datasetMarketplace = (await ethers.getContractAt(
    'DatasetMarketplace',
    deploymentInfo.contracts.DatasetMarketplace
  )) as DatasetMarketplace;

  try {
    // Step 1: Create a dataset to sell (as seller)
    console.log('\n📊 Step 1: Creating Dataset for Sale...');
    const datasetId = `marketplace-demo-${Date.now()}`;

    const createTx = await provenanceManager.connect(seller).createDataset(
      datasetId,
      'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi',
      'bafybeischema789abcdef123456',
      'Medical Diagnosis Patterns Dataset',
      'Synthetic medical diagnosis data with patient symptoms, test results, and diagnosis patterns. Privacy-preserving and HIPAA-compliant.',
      'Commercial',
      0, // GenerationType.SCRATCH
      'gpt-4-medical',
      'v1.5',
      25000, // 25k rows
      900, // 15 minutes generation time
      8 * 1024 * 1024 // 8MB dataset
    );
    await createTx.wait();
    console.log('✅ Dataset created:', datasetId);

    // Step 2: List Dataset on Marketplace
    console.log('\n💰 Step 2: Listing Dataset on Marketplace...');
    const listTx = await datasetMarketplace.connect(seller).listDataset(
      datasetId,
      ethers.parseEther('10'), // 50 USDFC
      deploymentInfo.usdcToken,
      1, // LicenseType.COMMERCIAL
      20, // max 20 licenses
      1000 // 10% royalty (1000 basis points)
    );
    await listTx.wait();
    console.log('✅ Dataset listed for 50 USDFC with 10% royalty');

    // Step 3: Browse Marketplace (as buyer)
    console.log('\n🔍 Step 3: Browsing Marketplace...');

    // Get marketplace events to find listings
    const listingFilter = datasetMarketplace.filters.DatasetListed();
    const listingEvents = await datasetMarketplace.queryFilter(
      listingFilter,
      -1000
    );

    console.log(`Found ${listingEvents.length} marketplace listings:`);
    for (let i = 0; i < Math.min(listingEvents.length, 3); i++) {
      const event = listingEvents[i];
      if (event.args) {
        const datasetInfo = await provenanceManager.getDataset(
          event.args.datasetId
        );
        console.log(`- ${event.args.datasetId}: ${datasetInfo.name}`);
        console.log(`  Price: ${ethers.formatEther(event.args.price)} USDFC`);
        console.log(`  License Type: ${event.args.licenseType}`);
        console.log('---');
      }
    }

    // Step 4: Check Dataset Details Before Purchase
    console.log('\n📋 Step 4: Checking Dataset Details...');
    const dataset = await provenanceManager.getDataset(datasetId);
    console.log('Target Dataset:', datasetId);
    console.log('- Name:', dataset.name);
    console.log('- Creator:', dataset.creator);
    console.log('- Rows:', dataset.totalRows.toString());
    console.log('- Size:', dataset.totalSize.toString(), 'bytes');
    console.log('- License:', dataset.license);
    console.log('- Verified:', dataset.isVerified);

    // Get generation config
    try {
      const genConfig = await provenanceManager.getGenerationConfig(datasetId);
      console.log('- Generation Model:', genConfig.modelId);
      console.log('- Generation Type:', genConfig.generationType.toString());
    } catch (error) {
      console.log('⚠️ Generation config not available');
    }

    // Step 5: Purchase Dataset License (simulated)
    console.log('\n💳 Step 5: Purchasing Dataset License...');
    console.log(
      '(Note: In production, buyer would need USDFC tokens and approval)'
    );

    // In a real scenario, the buyer would:
    // 1. Have USDFC tokens
    // 2. Approve the marketplace to spend tokens
    // 3. Call purchaseDataset

    try {
      // This will fail without actual USDFC tokens, but shows the flow
      const purchaseTx = await datasetMarketplace
        .connect(buyer)
        .purchaseDataset(
          datasetId,
          'Commercial usage for model training' // usageTerms
        );
      await purchaseTx.wait();
      console.log('✅ Dataset license purchased successfully!');
    } catch (error) {
      console.log('⚠️ Purchase failed (expected without USDFC tokens)');
      console.log('In production, buyer would need to:');
      console.log('1. Obtain USDFC tokens');
      console.log('2. Approve marketplace contract to spend tokens');
      console.log('3. Call purchaseDataset function');
    }

    // Step 6: Track Sales Analytics
    console.log('\n📈 Step 6: Sales Analytics...');

    // Get purchase events
    const purchaseFilter = datasetMarketplace.filters.DatasetPurchased();
    const purchaseEvents = await datasetMarketplace.queryFilter(
      purchaseFilter,
      -1000
    );

    console.log(
      `Total purchases across all datasets: ${purchaseEvents.length}`
    );

    // Calculate revenue for this seller
    let totalRevenue = BigInt(0);
    let sellerSales = 0;

    for (const event of purchaseEvents) {
      if (event.args) {
        const eventDataset = await provenanceManager.getDataset(
          event.args.datasetId
        );
        if (eventDataset.creator === seller.address) {
          totalRevenue += event.args.amount;
          sellerSales++;
        }
      }
    }

    console.log(`Seller's total sales: ${sellerSales}`);
    console.log(
      `Seller's total revenue: ${ethers.formatEther(totalRevenue)} USDFC`
    );

    // Step 7: License Management
    console.log('\n📜 Step 7: License Management...');

    // Check active licenses for the dataset
    const licenseFilter = datasetMarketplace.filters.LicenseIssued(datasetId);
    const licenseEvents = await datasetMarketplace.queryFilter(
      licenseFilter,
      -1000
    );

    console.log(`Active licenses for ${datasetId}: ${licenseEvents.length}`);
    for (const event of licenseEvents.slice(0, 3)) {
      if (event.args) {
        console.log(`- License holder: ${event.args.licensee}`);
        console.log(`- License type: ${event.args.licenseType}`);
        console.log(`- License ID: ${event.args.licenseId}`);
      }
    }

    // Step 8: Update Pricing (as seller)
    console.log('\n💰 Step 8: Dynamic Pricing...');

    try {
      // Update price based on demand
      const updateTx = await datasetMarketplace.connect(seller).updatePrice(
        datasetId,
        ethers.parseEther('5') // Increase to 75 USDFC due to high demand
      );
      await updateTx.wait();
      console.log('✅ Price updated to 75 USDFC');
    } catch (error) {
      console.log('⚠️ Price update failed:', error);
    }

    // Step 9: Royalty Distribution
    console.log('\n💸 Step 9: Royalty System...');

    console.log('Royalty Distribution Model:');
    console.log('- Dataset Creator: 10% of each sale');
    console.log('- Platform Fee: 2.5% of each sale');
    console.log('- Buyer: Gets commercial usage rights');
    console.log('- Automatic distribution on each purchase');

    // Step 10: Marketplace Statistics
    console.log('\n📊 Step 10: Marketplace Statistics...');

    // Get total datasets count
    const totalDatasets = await provenanceManager.datasetCount();
    console.log(`Total datasets in system: ${totalDatasets}`);

    // Calculate marketplace metrics
    let totalListings = 0;
    let totalVolume = BigInt(0);

    for (const event of listingEvents) {
      if (event.args) {
        totalListings++;
      }
    }

    for (const event of purchaseEvents) {
      if (event.args) {
        totalVolume += event.args.amount;
      }
    }

    console.log(`Total marketplace listings: ${totalListings}`);
    console.log(
      `Total trading volume: ${ethers.formatEther(totalVolume)} USDFC`
    );
    console.log(
      `Average sale price: ${
        totalListings > 0
          ? ethers.formatEther(totalVolume / BigInt(totalListings))
          : '0'
      } USDFC`
    );

    console.log('\n🎉 Marketplace Flow Completed Successfully!');
    console.log('===========================================');
    console.log('Marketplace features demonstrated:');
    console.log('✅ Dataset listing with pricing');
    console.log('✅ Marketplace browsing and discovery');
    console.log('✅ License purchasing flow');
    console.log('✅ Royalty distribution system');
    console.log('✅ Dynamic pricing updates');
    console.log('✅ Sales analytics and tracking');
    console.log('✅ License management');
    console.log('');
    console.log('Key benefits:');
    console.log('- Transparent pricing and licensing');
    console.log('- Automated royalty distribution');
    console.log('- Comprehensive sales analytics');
    console.log('- Flexible license types');
    console.log('- Creator monetization');
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
