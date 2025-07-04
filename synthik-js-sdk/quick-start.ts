/**
 * Quick Start Example
 *
 * This example shows you how to get started with the Synthik SDK
 * in just a few lines of code.
 */

import { Synthik, DatasetConfig, SchemaField, PrivacyLevel } from './src';

async function quickStart() {
  console.log('🚀 Synthik SDK Quick Start\n');

  // Step 1: Initialize the SDK
  console.log('📋 Step 1: Initialize SDK');

  const privateKey = "***PRIVATE_KEY_REMOVED***";
  if (!privateKey || privateKey.length < 32) {
    console.log('❌ Missing PRIVATE_KEY environment variable');
    console.log('💡 Please set your private key:');
    console.log('   export PRIVATE_KEY=your_private_key_here');
    console.log(
      '   or create a .env file with PRIVATE_KEY=your_private_key_here'
    );
    console.log(
      '📋 Get testnet tokens: https://faucet.calibration.fildev.network/'
    );
    return;
  }

  const synthik = new Synthik({
    privateKey,
    network: 'calibration', // Filecoin testnet

    // Add your AI model API keys (optional - get free keys from providers)
    apiKeys: {
      openai: process.env.OPENAI_API_KEY, // Get from: https://platform.openai.com/api-keys
      google: '***GOOGLE_API_KEY_REMOVED***', // Get from: https://aistudio.google.com/app/apikey
    },

    storage: {
      provider: 'mock', // Use mock storage for testing (no IPFS/Filecoin needed)
    },
  });

  try {
    // Step 2: Check your wallet
    console.log('💰 Step 2: Check wallet status');
    const address = await synthik.getAddress();
    const balance = await synthik.getBalance();
    console.log(`   Address: ${address}`);
    console.log(`   Balance: ${balance.fil} FIL\n`);

    // Step 3: Check available AI models
    console.log('🤖 Step 3: Check available AI models');
    const models = synthik.getAvailableModels();
    if (models.length === 0) {
      console.log('   ⚠️  No AI models available (API keys not provided)');
      console.log('   📝 To use AI generation, add OpenAI or Google API keys');
      console.log('   🎯 Continuing with manual data creation...\n');

      // Create dataset with manual data
      await createDatasetWithManualData(synthik);
    } else {
      console.log(`   ✅ ${models.length} models available:`);
      models.forEach((model, i) => {
        console.log(`   ${i + 1}. ${model.name} (${model.provider})`);
      });
      console.log('');

      // Generate dataset with AI
      await generateDatasetWithAI(synthik, models[0]);
    }
  } catch (error) {
    console.error('❌ Error:', error);
    console.log('\n💡 Tips:');
    console.log('   - Make sure you have testnet FIL tokens');
    console.log(
      '   - Get testnet tokens from: https://faucet.calibration.fildev.network/'
    );
    console.log('   - Check your private key format');
  } finally {
    await synthik.disconnect();
    console.log('👋 Disconnected from Synthik SDK');
  }
}

// Option 1: Create dataset with manual data (no AI required)
async function createDatasetWithManualData(synthik: Synthik) {
  console.log('📊 Creating dataset with manual data...');

  // Simple sample data
  const sampleData = [
    {
      id: 1,
      name: 'Alice Johnson',
      email: 'alice@example.com',
      age: 28,
      city: 'New York',
    },
    {
      id: 2,
      name: 'Bob Smith',
      email: 'bob@example.com',
      age: 34,
      city: 'San Francisco',
    },
    {
      id: 3,
      name: 'Carol Davis',
      email: 'carol@example.com',
      age: 29,
      city: 'Chicago',
    },
    {
      id: 4,
      name: 'David Wilson',
      email: 'david@example.com',
      age: 31,
      city: 'Austin',
    },
    {
      id: 5,
      name: 'Eve Brown',
      email: 'eve@example.com',
      age: 26,
      city: 'Seattle',
    },
  ];

  const dataset = await synthik.createDataset('My First Dataset', sampleData, {
    description: 'A simple customer dataset for testing',
    license: 'MIT',
    onProgress: (progress, message) => {
      console.log(`   ${Math.round(progress)}%: ${message}`);
    },
  });

  console.log(`✅ Dataset created successfully!`);
  console.log(`   Dataset ID: ${dataset.id}`);
  console.log(`   Rows: ${dataset.totalRows}`);
  console.log(`   Size: ${dataset.totalSize} bytes`);
  console.log(`   Quality: ${dataset.quality}/10000\n`);

  // Transform the dataset
  console.log('🔄 Applying transformations...');
  const transformed = await synthik.transformDataset(dataset.id, [
    {
      type: 'rename',
      sourceField: 'name',
      targetField: 'customer_name',
    },
  ]);
  console.log(`✅ Transformed dataset: ${transformed.id}\n`);

  // Anonymize the dataset
  console.log('🔒 Applying anonymization...');
  const anonymized = await synthik.anonymizeDataset(
    dataset.id,
    PrivacyLevel.MEDIUM
  );
  console.log(`✅ Anonymized dataset: ${anonymized.id}\n`);

  return dataset;
}

// Option 2: Generate dataset with AI
async function generateDatasetWithAI(synthik: Synthik, model: any) {
  console.log(`🎯 Generating dataset with ${model.name}...`);

  // Define schema for an e-commerce dataset
  const schema: SchemaField[] = [
    {
      name: 'order_id',
      type: 'string',
      description: 'Unique order identifier',
      constraints: {
        required: true,
        unique: true,
        pattern: '^ORD-[0-9]{6}$',
      },
    },
    {
      name: 'customer_name',
      type: 'string',
      description: 'Customer full name',
      constraints: { required: true },
    },
    {
      name: 'product_name',
      type: 'string',
      description: 'Name of purchased product',
      constraints: { required: true },
    },
    {
      name: 'price',
      type: 'number',
      description: 'Product price in USD',
      constraints: {
        required: true,
        min: 10,
        max: 1000,
      },
    },
    {
      name: 'category',
      type: 'string',
      description: 'Product category',
      constraints: {
        required: true,
        enum: ['Electronics', 'Clothing', 'Books', 'Home'],
      },
    },
  ];

  const config: DatasetConfig = {
    name: 'AI-Generated E-commerce Dataset',
    description: 'Synthetic e-commerce orders generated by AI',
    license: 'MIT',
    rows: 50, // Start small for testing
    schema,
    quality: 'balanced',
    format: 'json',
    visibility: 'public',
  };

  // Generate preview first
  console.log('   🔍 Generating preview...');
  const preview = await synthik.generatePreview(config, model);
  console.log(`   ✅ Preview: ${preview.length} sample rows generated`);

  // Show first preview row
  if (preview.length > 0) {
    console.log(`   📋 Sample row:`, JSON.stringify(preview[0], null, 2));
  }

  // Generate full dataset
  console.log('\n   🚀 Generating full dataset...');
  const dataset = await synthik.generateDataset(config, model, {
    onProgress: (progress, message) => {
      console.log(`   ${Math.round(progress)}%: ${message}`);
    },
  });

  console.log(`\n✅ AI dataset generated successfully!`);
  console.log(`   Dataset ID: ${dataset.id}`);
  console.log(`   Model used: ${model.name}`);
  console.log(`   Rows: ${dataset.totalRows}`);
  console.log(`   Quality: ${dataset.quality}/10000\n`);

  return dataset;
}

// Run the example
if (require.main === module) {
  quickStart().catch(console.error);
}

export { quickStart };
