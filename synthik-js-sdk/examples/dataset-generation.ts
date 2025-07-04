/**
 * Dataset Generation Example
 *
 * This example demonstrates how to use the Synthik SDK to generate
 * synthetic datasets using AI models.
 */

import { Synthik, DatasetConfig, SchemaField } from '../src';

async function main() {
  // Initialize SDK with API keys
  const synthik = new Synthik({
    privateKey: process.env.PRIVATE_KEY!,
    network: 'calibration',

    // Add your AI model API keys
    apiKeys: {
      openai: process.env.OPENAI_API_KEY,
      google: process.env.GOOGLE_API_KEY, // For Gemini
    },

    storage: {
      provider: 'mock', // Use 'ipfs' or 'filecoin' for production
    },
  });

  try {
    console.log('🚀 Starting dataset generation example...');

    // Get wallet info
    const address = await synthik.getAddress();
    const balance = await synthik.getBalance();
    console.log(`📍 Wallet: ${address}`);
    console.log(`💰 Balance: ${balance.fil} FIL`);

    // 1. Check available models
    console.log('\n📋 Available AI models:');
    const models = synthik.getAvailableModels();
    models.forEach((model, index) => {
      console.log(`  ${index + 1}. ${model.name} (${model.provider})`);
      console.log(`     Cost: $${model.capabilities.costPerToken}/token`);
      console.log(
        `     Max tokens: ${model.capabilities.maxTokens.toLocaleString()}`
      );
    });

    if (models.length === 0) {
      console.log('❌ No models available. Please provide API keys in config.');
      return;
    }

    // 2. Define schema for e-commerce dataset
    const schema: SchemaField[] = [
      {
        name: 'order_id',
        type: 'string',
        description: 'Unique order identifier',
        constraints: {
          required: true,
          unique: true,
          pattern: '^ORD-[0-9]{8}$',
        },
      },
      {
        name: 'customer_name',
        type: 'string',
        description: 'Customer full name',
        constraints: { required: true },
      },
      {
        name: 'customer_email',
        type: 'string',
        description: 'Customer email address',
        constraints: { required: true },
      },
      {
        name: 'product_name',
        type: 'string',
        description: 'Name of the purchased product',
        constraints: { required: true },
      },
      {
        name: 'price',
        type: 'number',
        description: 'Product price in USD',
        constraints: {
          required: true,
          min: 1,
          max: 10000,
        },
      },
      {
        name: 'quantity',
        type: 'number',
        description: 'Number of items ordered',
        constraints: {
          required: true,
          min: 1,
          max: 50,
        },
      },
      {
        name: 'order_date',
        type: 'date',
        description: 'Date when order was placed',
        constraints: { required: true },
      },
      {
        name: 'status',
        type: 'string',
        description: 'Order status',
        constraints: {
          required: true,
          enum: ['pending', 'shipped', 'delivered', 'cancelled'],
        },
      },
    ];

    // 3. Configure dataset
    const config: DatasetConfig = {
      name: 'E-commerce Orders Dataset',
      description:
        'Synthetic e-commerce order data for testing and development',
      license: 'MIT',
      rows: 500, // Start with a smaller dataset
      schema,
      quality: 'balanced',
      format: 'json',
      visibility: 'public',
    };

    // 4. Generate preview first
    console.log('\n🔍 Generating preview...');
    const selectedModel = models[0]; // Use first available model

    const previewData = await synthik.generatePreview(config, selectedModel);
    console.log(`✅ Preview generated with ${previewData.length} sample rows:`);
    console.log(JSON.stringify(previewData.slice(0, 2), null, 2));

    // 5. Generate full dataset
    console.log('\n🎯 Generating full dataset...');
    const dataset = await synthik.generateDataset(config, selectedModel, {
      onProgress: (progress, message) => {
        console.log(`  Progress: ${Math.round(progress)}% - ${message}`);
      },
    });

    console.log('\n✅ Dataset generated successfully!');
    console.log(`📊 Dataset ID: ${dataset.id}`);
    console.log(`📁 Data CID: ${dataset.dataCid}`);
    console.log(`📋 Metadata CID: ${dataset.metadataCid}`);
    console.log(`🔢 Total rows: ${dataset.totalRows}`);
    console.log(`📏 Size: ${dataset.totalSize} bytes`);
    console.log(`⭐ Quality: ${dataset.quality}/10000`);

    // 6. Download and export data
    console.log('\n📥 Downloading generated data...');
    const data = await synthik.storage.downloadJSON(dataset.dataCid);

    // Export as CSV
    const csvBlob = synthik.datasets.exportData(data, 'csv');
    console.log(`📄 CSV export size: ${csvBlob.size} bytes`);

    // Export as JSON
    const jsonBlob = synthik.datasets.exportData(data, 'json');
    console.log(`📄 JSON export size: ${jsonBlob.size} bytes`);

    // 7. Demonstrate transformations
    console.log('\n🔄 Applying transformations...');
    const transformedDataset = await synthik.transformDataset(
      dataset.id,
      [
        {
          type: 'rename',
          sourceField: 'customer_name',
          targetField: 'client_name',
          enabled: true,
        },
        {
          type: 'calculate',
          sourceField: 'price',
          targetField: 'total_amount',
          parameters: {
            operation: 'multiply',
            factor: 'quantity',
          },
          enabled: true,
        },
      ],
      {
        preserveOriginal: false,
        onProgress: (progress, message) => {
          console.log(
            `  Transform progress: ${Math.round(progress)}% - ${message}`
          );
        },
      }
    );

    console.log(`✅ Transformed dataset created: ${transformedDataset.id}`);

    // 8. Demonstrate anonymization
    console.log('\n🔒 Applying anonymization...');
    const anonymizedDataset = await synthik.anonymizeDataset(
      dataset.id,
      'medium', // privacy level
      {
        compliance: ['GDPR', 'CCPA'],
        onProgress: (progress, message) => {
          console.log(
            `  Anonymization progress: ${Math.round(progress)}% - ${message}`
          );
        },
      }
    );

    console.log(`✅ Anonymized dataset created: ${anonymizedDataset.id}`);

    // 9. Check dataset lineage
    console.log('\n🌳 Dataset lineage:');
    const lineage = await synthik.datasets.getDatasetLineage(
      anonymizedDataset.id
    );
    console.log(`  Original: ${dataset.id}`);
    console.log(`  Anonymized: ${anonymizedDataset.id}`);
    console.log(`  Parents: ${lineage.parents.join(', ')}`);
    console.log(`  Transformations: ${lineage.transformations.length}`);

    // 10. Get full dataset details
    console.log('\n📋 Full dataset details:');
    const details = await synthik.getDataset(dataset.id);
    console.log(`  Dataset: ${details.dataset.name}`);
    console.log(`  Creator: ${details.dataset.creator}`);
    console.log(`  Created: ${details.dataset.createdAt.toISOString()}`);
    console.log(`  Lineage children: ${details.lineage.children.length}`);

    console.log('\n🎉 Example completed successfully!');
  } catch (error) {
    console.error('❌ Error in example:', error);
    if (error instanceof Error) {
      console.error('Stack trace:', error.stack);
    }
  } finally {
    await synthik.disconnect();
  }
}

// Helper function to create different dataset types
async function createSpecificDatasets(synthik: Synthik) {
  const models = synthik.getAvailableModels();
  if (models.length === 0) return;

  const model = models[0];

  // Healthcare dataset
  const healthcareConfig: DatasetConfig = {
    name: 'Healthcare Patient Records',
    description: 'Synthetic patient data for healthcare analytics',
    license: 'MIT',
    rows: 200,
    schema: [
      {
        name: 'patient_id',
        type: 'string',
        description: 'Unique patient identifier',
        constraints: {
          required: true,
          unique: true,
          pattern: '^PAT-[0-9]{8}$',
        },
      },
      {
        name: 'age',
        type: 'number',
        description: 'Patient age',
        constraints: { required: true, min: 1, max: 100 },
      },
      {
        name: 'gender',
        type: 'string',
        description: 'Patient gender',
        constraints: { required: true, enum: ['male', 'female', 'other'] },
      },
      {
        name: 'diagnosis',
        type: 'string',
        description: 'Primary diagnosis',
        constraints: { required: true },
      },
      {
        name: 'treatment_cost',
        type: 'number',
        description: 'Cost of treatment in USD',
        constraints: { required: true, min: 100, max: 50000 },
      },
    ],
    quality: 'high',
    format: 'json',
    visibility: 'private',
  };

  // Financial dataset
  const financialConfig: DatasetConfig = {
    name: 'Financial Transactions',
    description: 'Synthetic financial transaction data',
    license: 'Commercial',
    rows: 1000,
    schema: [
      {
        name: 'transaction_id',
        type: 'string',
        description: 'Unique transaction ID',
        constraints: { required: true, unique: true },
      },
      {
        name: 'account_number',
        type: 'string',
        description: 'Account number',
        constraints: { required: true, pattern: '^[0-9]{10}$' },
      },
      {
        name: 'transaction_type',
        type: 'string',
        description: 'Type of transaction',
        constraints: {
          required: true,
          enum: ['deposit', 'withdrawal', 'transfer', 'payment'],
        },
      },
      {
        name: 'amount',
        type: 'number',
        description: 'Transaction amount',
        constraints: { required: true, min: 0.01, max: 1000000 },
      },
      {
        name: 'timestamp',
        type: 'date',
        description: 'Transaction timestamp',
        constraints: { required: true },
      },
      {
        name: 'merchant',
        type: 'string',
        description: 'Merchant or recipient',
        constraints: { required: false },
      },
    ],
    quality: 'balanced',
    format: 'csv',
  };

  console.log('\n🏥 Generating healthcare dataset...');
  const healthcareDataset = await synthik.generateDataset(
    healthcareConfig,
    model
  );
  console.log(`✅ Healthcare dataset: ${healthcareDataset.id}`);

  console.log('\n💰 Generating financial dataset...');
  const financialDataset = await synthik.generateDataset(
    financialConfig,
    model
  );
  console.log(`✅ Financial dataset: ${financialDataset.id}`);

  return { healthcareDataset, financialDataset };
}

// Run the example
if (require.main === module) {
  main().catch(console.error);
}

export { main, createSpecificDatasets };
