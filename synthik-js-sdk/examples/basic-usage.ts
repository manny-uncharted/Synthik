/**
 * Basic Usage Example
 * Demonstrates core Synthik SDK functionality
 */

import { Synthik, PrivacyLevel } from '@synthik/sdk';

async function main() {
  // Initialize SDK with your private key
  const synthik = new Synthik({
    privateKey: process.env.PRIVATE_KEY || 'YOUR_PRIVATE_KEY',
    network: 'calibration', // Using testnet
  });

  try {
    // 1. Check wallet balance
    console.log('📊 Checking wallet balance...');
    const address = await synthik.getAddress();
    const balance = await synthik.getBalance();
    console.log(`Wallet: ${address}`);
    console.log(`Balance: ${balance.fil} FIL\n`);

    // 2. Create a simple dataset
    console.log('🚀 Creating dataset...');
    const sampleData = [
      { id: 1, name: 'Alice Johnson', email: 'alice@example.com', city: 'New York', purchases: 5 },
      { id: 2, name: 'Bob Smith', email: 'bob@example.com', city: 'Los Angeles', purchases: 3 },
      { id: 3, name: 'Carol White', email: 'carol@example.com', city: 'Chicago', purchases: 7 },
      { id: 4, name: 'David Brown', email: 'david@example.com', city: 'Houston', purchases: 2 },
      { id: 5, name: 'Eve Davis', email: 'eve@example.com', city: 'Phoenix', purchases: 4 },
    ];

    const dataset = await synthik.createDataset(
      'Customer Data Sample',
      sampleData,
      {
        description: 'Sample customer data for demonstration',
        license: 'MIT',
        onProgress: (progress, message) => {
          console.log(`  ${progress}%: ${message}`);
        }
      }
    );

    console.log(`\n✅ Dataset created!`);
    console.log(`  ID: ${dataset.id}`);
    console.log(`  Data CID: ${dataset.dataCid}`);
    console.log(`  Rows: ${dataset.totalRows}`);
    console.log(`  Quality: ${dataset.quality}/4\n`);

    // 3. Transform the dataset
    console.log('🔄 Transforming dataset...');
    const transformedDataset = await synthik.transformDataset(
      dataset.id,
      [
        {
          type: 'rename',
          sourceField: 'purchases',
          targetField: 'total_purchases'
        },
        {
          type: 'calculate',
          targetField: 'customer_value',
          parameters: {
            formula: 'total_purchases * 50' // $50 per purchase
          }
        }
      ],
      {
        preserveOriginal: true,
        onProgress: (progress, message) => {
          console.log(`  ${progress}%: ${message}`);
        }
      }
    );

    console.log(`\n✅ Dataset transformed!`);
    console.log(`  New ID: ${transformedDataset.id}`);
    console.log(`  Parent: ${dataset.id}\n`);

    // 4. Anonymize the dataset
    console.log('🔒 Anonymizing dataset...');
    const anonymizedDataset = await synthik.anonymizeDataset(
      transformedDataset.id,
      PrivacyLevel.MEDIUM,
      {
        compliance: ['GDPR'],
        onProgress: (progress, message) => {
          console.log(`  ${progress}%: ${message}`);
        }
      }
    );

    console.log(`\n✅ Dataset anonymized!`);
    console.log(`  New ID: ${anonymizedDataset.id}`);
    console.log(`  Privacy Level: Medium`);
    console.log(`  Compliance: GDPR\n`);

    // 5. List the dataset for sale
    console.log('💰 Listing dataset on marketplace...');
    await synthik.sellDataset(
      anonymizedDataset.id,
      0.00001, // 0.00001 FIL per row
      {
        minimumRows: 1,
        maximumRows: 1000,
        sampleRows: 2
      }
    );

    console.log(`✅ Dataset listed for sale!`);
    console.log(`  Price: 0.00001 FIL per row`);
    console.log(`  Min purchase: 1 row`);
    console.log(`  Max purchase: 1000 rows\n`);

    // 6. Query dataset information
    console.log('🔍 Querying dataset information...');
    const info = await synthik.getDataset(anonymizedDataset.id);
    
    console.log('Dataset Details:');
    console.log(`  Name: ${info.dataset.name}`);
    console.log(`  Status: ${info.dataset.status}`);
    console.log(`  Created: ${info.dataset.createdAt.toISOString()}`);
    
    console.log('\nLineage:');
    console.log(`  Parents: ${info.lineage.parents.join(', ')}`);
    console.log(`  Children: ${info.lineage.children.join(', ')}`);
    
    if (info.listing) {
      console.log('\nMarketplace Listing:');
      console.log(`  Active: ${info.listing.isActive}`);
      console.log(`  Total Sales: ${info.listing.totalSales}`);
    }

    // 7. Event handling example
    console.log('\n📡 Setting up event listeners...');
    
    synthik.on('datasetCreated', (dataset) => {
      console.log(`[Event] New dataset created: ${dataset.id}`);
    });

    synthik.on('transaction', (tx) => {
      console.log(`[Event] Transaction confirmed: ${tx.txHash}`);
    });

    synthik.on('error', (error) => {
      console.error(`[Event] Error occurred:`, error);
    });

    console.log('\n🎉 Basic usage example completed successfully!');

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    // Cleanup
    await synthik.disconnect();
    console.log('\n👋 Disconnected from Synthik');
  }
}

// Run the example
main().catch(console.error); 