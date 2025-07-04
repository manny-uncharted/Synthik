# Getting Started with Synthik SDK

Welcome! This guide will get you up and running with the Synthik SDK in 5 minutes.

## 📋 Prerequisites

1. **Node.js** (v16 or higher)
2. **A Filecoin wallet** with testnet tokens
3. **Optional**: OpenAI or Google API keys for AI generation

## 🚀 Quick Setup

### 1. Get Testnet Tokens

First, you'll need some testnet FIL tokens:

1. Visit the [Filecoin Calibration Faucet](https://faucet.calibration.fildev.network/)
2. Enter your wallet address
3. Get free testnet tokens (takes ~1 minute)

### 2. Get API Keys (Optional but Recommended)

For AI dataset generation, get free API keys:

- **OpenAI**: [Get API key](https://platform.openai.com/api-keys) (free tier available)
- **Google Gemini**: [Get API key](https://aistudio.google.com/app/apikey) (free tier available)

### 3. Set Environment Variables

Create a `.env` file:

```bash
# Required: Your wallet private key
PRIVATE_KEY=your_private_key_here

# Optional: AI model API keys
OPENAI_API_KEY=your_openai_key_here
GOOGLE_API_KEY=your_google_key_here
```

## 🎯 Run Your First Example

### Option 1: Quick Start (Simplest)

```bash
# Clone and build the SDK
cd synthik-js-sdk
npm install
npm run build

# Run the quick start example
npx ts-node quick-start.ts
```

This will:

- ✅ Connect to your wallet
- ✅ Check available AI models
- ✅ Create a dataset (manual or AI-generated)
- ✅ Apply transformations
- ✅ Apply anonymization
- ✅ Show you the results

### Option 2: Comprehensive Example

```bash
# Run the full dataset generation example
npx ts-node examples/dataset-generation.ts
```

This demonstrates:

- Multiple AI models
- Complex schemas with constraints
- Healthcare and financial datasets
- Data export (CSV/JSON)
- Full workflow from generation to marketplace

## 💡 Simple Code Example

Here's the minimal code to get started:

```typescript
import { Synthik } from './src';

const synthik = new Synthik({
  privateKey: process.env.PRIVATE_KEY!,
  network: 'calibration',
  apiKeys: {
    openai: process.env.OPENAI_API_KEY,
  },
  storage: { provider: 'mock' },
});

// Check available models
const models = synthik.getAvailableModels();
console.log(
  'Available models:',
  models.map((m) => m.name)
);

// Generate a simple dataset
const dataset = await synthik.generateDataset(
  {
    name: 'Test Dataset',
    rows: 100,
    schema: [
      { name: 'id', type: 'string', description: 'Unique ID' },
      { name: 'name', type: 'string', description: 'Person name' },
      { name: 'age', type: 'number', description: 'Age in years' },
    ],
  },
  models[0]
);

console.log('Generated dataset:', dataset.id);
```

## 🔧 Troubleshooting

### Common Issues

**"No models available"**

- Add OpenAI or Google API keys to your `.env` file
- The SDK works without AI models, just uses manual data

**"Insufficient funds"**

- Get testnet tokens from the [faucet](https://faucet.calibration.fildev.network/)
- Make sure you're on the `calibration` network

**"Private key error"**

- Ensure your private key is in the correct format (0x...)
- Don't include quotes in the .env file

**"Module not found"**

- Run `npm install` and `npm run build` first
- Make sure you're in the `synthik-js-sdk` directory

### Getting Help

- 📚 Check the [README.md](./README.md) for detailed documentation
- 💬 Join our [Discord](https://discord.gg/synthik) for community support
- 🐛 Report issues on [GitHub](https://github.com/synthik/sdk/issues)

## 🎉 What's Next?

Once you've got the basics working:

1. **Explore Examples**: Check out `examples/` for more advanced use cases
2. **Try Different Models**: Compare OpenAI vs Google Gemini
3. **Complex Schemas**: Add constraints, patterns, and relationships
4. **Marketplace**: List and sell your datasets
5. **Transformations**: Clean and modify your data
6. **Anonymization**: Ensure privacy compliance

## 📊 Sample Outputs

When everything works, you'll see output like:

```
🚀 Synthik SDK Quick Start

📋 Step 1: Initialize SDK
💰 Step 2: Check wallet status
   Address: 0x1234...abcd
   Balance: 100.0000 FIL

🤖 Step 3: Check available AI models
   ✅ 2 models available:
   1. GPT-4o Mini (openai)
   2. Gemini 1.5 Flash (google)

🎯 Generating dataset with GPT-4o Mini...
   🔍 Generating preview...
   ✅ Preview: 10 sample rows generated
   🚀 Generating full dataset...
   50%: Processing batches 1-2
   100%: Generation complete: 50 rows generated

✅ AI dataset generated successfully!
   Dataset ID: ds_1234567890abcdef
   Model used: GPT-4o Mini
   Rows: 50
   Quality: 8500/10000
```

Ready to start building with synthetic data! 🚀
