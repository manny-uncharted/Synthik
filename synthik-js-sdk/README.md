# Synthik SDK

🚀 A powerful JavaScript/TypeScript SDK for interacting with the Synthik synthetic data platform on Filecoin blockchain.

## Features

- 🔐 **Simple Authentication** - Just provide your private key with testnet tokens
- 📊 **Dataset Management** - Create, transform, and anonymize datasets
- 🛒 **Marketplace Integration** - Buy and sell datasets with ease
- ⛓️ **Blockchain Provenance** - Full lineage tracking on Filecoin
- 🔒 **Privacy-First** - Built-in anonymization with compliance support
- 📦 **Storage Abstraction** - Seamless Filecoin/IPFS integration
- 🎯 **Type-Safe** - Full TypeScript support with comprehensive types
- ⚡ **Event-Driven** - Real-time updates with EventEmitter

## Installation

```bash
npm install @synthik/sdk
```

## Quick Start

```typescript
import { Synthik } from '@synthik/sdk';

const synthik = new Synthik({
  privateKey: 'YOUR_PRIVATE_KEY',
  network: 'calibration', // or 'mainnet'

  // Add AI model API keys for dataset generation
  apiKeys: {
    openai: 'YOUR_OPENAI_API_KEY', // For GPT models
    google: 'YOUR_GOOGLE_API_KEY', // For Gemini models
  },

  storage: {
    provider: 'mock', // Use 'ipfs' or 'filecoin' for production
  },
});

// Generate a dataset using AI
const models = synthik.getAvailableModels();
const dataset = await synthik.generateDataset(
  {
    name: 'My E-commerce Dataset',
    description: 'Synthetic e-commerce data',
    rows: 1000,
    schema: [
      { name: 'order_id', type: 'string', description: 'Order ID' },
      { name: 'customer_name', type: 'string', description: 'Customer name' },
      { name: 'price', type: 'number', description: 'Price in USD' },
      // ... more fields
    ],
  },
  models[0]
);

console.log(`Generated dataset: ${dataset.id}`);
```

## AI Dataset Generation

The SDK supports generating synthetic datasets using OpenAI GPT and Google Gemini models. Simply provide your API keys and define your schema.

### Getting Started with AI Generation

```typescript
// 1. Check available models
const models = synthik.getAvailableModels();
console.log(
  'Available models:',
  models.map((m) => m.name)
);

// 2. Generate a preview first (10 rows)
const preview = await synthik.generatePreview(config, models[0]);
console.log('Preview data:', preview);

// 3. Generate the full dataset
const dataset = await synthik.generateDataset(config, models[0], {
  onProgress: (progress, message) => {
    console.log(`${Math.round(progress)}%: ${message}`);
  },
});
```

### Supported AI Models

| Provider | Model            | Cost/Token | Max Tokens | Best For                        |
| -------- | ---------------- | ---------- | ---------- | ------------------------------- |
| OpenAI   | GPT-4o Mini      | $0.00015   | 16,000     | Fast, cost-effective generation |
| OpenAI   | GPT-4o           | $0.0025    | 128,000    | High-quality, complex datasets  |
| Google   | Gemini 1.5 Flash | $0.00007   | 32,768     | Ultra-fast generation           |
| Google   | Gemini 1.5 Pro   | $0.00125   | 32,768     | Best quality, complex schemas   |

### Schema Definition

Define rich schemas with constraints and relationships:

```typescript
const ecommerceSchema: SchemaField[] = [
  {
    name: 'order_id',
    type: 'string',
    description: 'Unique order identifier',
    constraints: {
      required: true,
      unique: true,
      pattern: '^ORD-[0-9]{8}$', // Regex pattern
    },
  },
  {
    name: 'customer_email',
    type: 'string',
    description: 'Customer email address',
    constraints: {
      required: true,
      pattern: '^[\\w\\._%+-]+@[\\w\\.-]+\\.[A-Za-z]{2,}$',
    },
  },
  {
    name: 'price',
    type: 'number',
    description: 'Product price in USD',
    constraints: {
      required: true,
      min: 1.0,
      max: 10000.0,
    },
  },
  {
    name: 'category',
    type: 'string',
    description: 'Product category',
    constraints: {
      required: true,
      enum: ['Electronics', 'Clothing', 'Books', 'Home', 'Sports'],
    },
  },
  {
    name: 'order_date',
    type: 'date',
    description: 'When the order was placed',
    constraints: { required: true },
  },
];
```

### Industry-Specific Examples

#### Healthcare Dataset

```typescript
const healthcareConfig: DatasetConfig = {
  name: 'Synthetic Patient Records',
  description: 'HIPAA-compliant synthetic patient data',
  rows: 1000,
  schema: [
    {
      name: 'patient_id',
      type: 'string',
      description: 'Unique patient identifier',
      constraints: { required: true, unique: true, pattern: '^PAT-[0-9]{8}$' },
    },
    {
      name: 'age',
      type: 'number',
      description: 'Patient age in years',
      constraints: { required: true, min: 0, max: 120 },
    },
    {
      name: 'diagnosis_code',
      type: 'string',
      description: 'ICD-10 diagnosis code',
      constraints: {
        required: true,
        pattern: '^[A-Z][0-9]{2}(\\.[0-9X]{1,4})?$',
      },
    },
    {
      name: 'treatment_cost',
      type: 'number',
      description: 'Total treatment cost in USD',
      constraints: { required: true, min: 50, max: 100000 },
    },
  ],
  quality: 'high',
  visibility: 'private',
};
```

#### Financial Dataset

```typescript
const financialConfig: DatasetConfig = {
  name: 'Banking Transactions',
  description: 'Synthetic banking transaction data',
  rows: 5000,
  schema: [
    {
      name: 'transaction_id',
      type: 'string',
      description: 'Unique transaction identifier',
      constraints: { required: true, unique: true },
    },
    {
      name: 'account_number',
      type: 'string',
      description: 'Bank account number (masked)',
      constraints: { required: true, pattern: '^****[0-9]{4}$' },
    },
    {
      name: 'transaction_type',
      type: 'string',
      description: 'Type of transaction',
      constraints: {
        required: true,
        enum: ['deposit', 'withdrawal', 'transfer', 'payment', 'fee'],
      },
    },
    {
      name: 'amount',
      type: 'number',
      description: 'Transaction amount in USD',
      constraints: { required: true, min: 0.01, max: 1000000 },
    },
  ],
  quality: 'balanced',
};
```

### Generation Quality Levels

- **`fast`**: Optimized for speed, simpler patterns
- **`balanced`**: Good balance of quality and speed (recommended)
- **`high`**: Maximum quality, more complex relationships

### Export and Use Generated Data

```typescript
// Generate the dataset
const dataset = await synthik.generateDataset(config, model);

// Download the raw data
const data = await synthik.storage.downloadJSON(dataset.dataCid);

// Export in different formats
const csvBlob = synthik.datasets.exportData(data, 'csv');
const jsonBlob = synthik.datasets.exportData(data, 'json');

// Create download links (browser)
const csvUrl = URL.createObjectURL(csvBlob);
const downloadLink = document.createElement('a');
downloadLink.href = csvUrl;
downloadLink.download = 'synthetic-data.csv';
downloadLink.click();
```

### Cost Estimation

```typescript
// Estimate generation cost before running
const estimatedTokens = config.rows * config.schema.length * 50; // Rough estimate
const estimatedCost = estimatedTokens * model.capabilities.costPerToken;

console.log(`Estimated cost: $${estimatedCost.toFixed(4)}`);
console.log(`Estimated tokens: ${estimatedTokens.toLocaleString()}`);
```

### Best Practices for AI Generation

1. **Start Small**: Always generate a preview first
2. **Schema Design**: Be specific in field descriptions
3. **Use Constraints**: Leverage min/max, patterns, and enums
4. **Quality vs Speed**: Choose appropriate quality level
5. **Cost Management**: Monitor token usage for large datasets
6. **Privacy First**: Use anonymization for sensitive data types

or

```bash
yarn add @synthik/sdk
```

## Quick Start

```typescript
import { Synthik } from '@synthik/sdk';

// Initialize the SDK
const synthik = new Synthik({
  privateKey: 'YOUR_PRIVATE_KEY',
  network: 'calibration', // or 'mainnet', 'localhost'
});

// Check your balance
const balance = await synthik.getBalance();
console.log(`Balance: ${balance.fil} FIL`);
```

## Usage Examples

### Creating a Dataset

```typescript
// Simple dataset creation
const dataset = await synthik.createDataset(
  'Customer Analytics',
  [
    { id: 1, name: 'John Doe', email: 'john@example.com', age: 30 },
    { id: 2, name: 'Jane Smith', email: 'jane@example.com', age: 25 },
    // ... more data
  ],
  {
    description: 'Sample customer data for analytics',
    license: 'MIT',
    onProgress: (progress, message) => {
      console.log(`${progress}%: ${message}`);
    },
  }
);

console.log(`Dataset created: ${dataset.id}`);
console.log(`Data CID: ${dataset.dataCid}`);
```

### Advanced Dataset Creation

```typescript
import { DatasetConfig, SchemaField } from '@synthik/sdk';

// Define schema manually for more control
const schema: SchemaField[] = [
  {
    name: 'customer_id',
    type: 'string',
    description: 'Unique customer identifier',
    constraints: { required: true, unique: true },
  },
  {
    name: 'purchase_amount',
    type: 'number',
    description: 'Total purchase amount in USD',
    constraints: { min: 0, max: 10000 },
  },
  {
    name: 'purchase_date',
    type: 'date',
    description: 'Date of purchase',
  },
];

const config: DatasetConfig = {
  name: 'E-commerce Transactions',
  description: 'Synthetic e-commerce transaction data',
  license: 'CC-BY-4.0',
  rows: 10000,
  schema,
  format: 'json',
  quality: 'high',
  visibility: 'public',
  tags: ['e-commerce', 'transactions', 'synthetic'],
};

const dataset = await synthik.datasets.createDataset(config, data);
```

### Transforming Datasets

```typescript
// Apply transformations to an existing dataset
const transformedDataset = await synthik.transformDataset(
  'dataset-123',
  [
    {
      type: 'rename',
      sourceField: 'customer_name',
      targetField: 'name',
    },
    {
      type: 'convert',
      sourceField: 'age',
      targetField: 'age_group',
      parameters: {
        mapping: {
          '0-17': 'minor',
          '18-65': 'adult',
          '65+': 'senior',
        },
      },
    },
    {
      type: 'calculate',
      targetField: 'total_spent',
      parameters: {
        formula: 'purchase_amount * quantity',
      },
    },
  ],
  {
    preserveOriginal: true,
    onProgress: (progress, message) => console.log(`${progress}%: ${message}`),
  }
);
```

### Anonymizing Datasets

```typescript
// Quick anonymization with privacy presets
const anonymizedDataset = await synthik.anonymizeDataset(
  'dataset-123',
  'high', // Privacy level: 'low', 'medium', or 'high'
  {
    compliance: ['GDPR', 'CCPA'],
    onProgress: (progress, message) => console.log(`${progress}%: ${message}`),
  }
);

// Custom anonymization rules
const customAnonymized = await synthik.datasets.anonymizeDataset(
  'dataset-123',
  {
    rules: [
      { field: 'email', method: 'hash' },
      { field: 'name', method: 'fake' },
      { field: 'ssn', method: 'remove' },
      {
        field: 'phone',
        method: 'mask',
        parameters: { pattern: 'XXX-XXX-####' },
      },
    ],
    privacyLevel: 'medium',
    seed: 'consistent-seed-for-reproducibility',
    preserveFormat: true,
    compliance: ['HIPAA'],
  }
);
```

### Marketplace Operations

```typescript
// List a dataset for sale
await synthik.sellDataset(
  'dataset-123',
  0.001, // Price per row in FIL
  {
    minimumRows: 100,
    maximumRows: 10000,
    sampleRows: 10, // Provide 10 sample rows
  }
);

// Buy dataset rows
const purchase = await synthik.buyDataset(
  'dataset-456',
  1000 // Number of rows to purchase
);

console.log(`Purchase ID: ${purchase.purchaseId}`);
console.log(`Total cost: ${purchase.totalCostFil} FIL`);
console.log(`Transaction: ${purchase.txHash}`);

// Check pending revenue from sales
const revenue = await synthik.marketplace.getPendingRevenue();
console.log(`Pending revenue: ${revenue} wei`);

// Withdraw revenue
await synthik.marketplace.withdrawRevenue();
```

### Querying Datasets

```typescript
// Get comprehensive dataset information
const info = await synthik.getDataset('dataset-123');

console.log('Dataset:', info.dataset);
console.log('Parents:', info.lineage.parents);
console.log('Children:', info.lineage.children);
console.log('Marketplace listing:', info.listing);

// Get dataset lineage
const lineage = await synthik.datasets.getDatasetLineage('dataset-123');
console.log('Transformation chain:', lineage.transformations);
```

### Event Handling

```typescript
// Listen for events
synthik.on('datasetCreated', (dataset) => {
  console.log('New dataset created:', dataset.id);
});

synthik.on('datasetTransformed', ({ originalDataset, newDataset }) => {
  console.log(`Dataset ${originalDataset} transformed to ${newDataset.id}`);
});

synthik.on('datasetPurchased', (purchase) => {
  console.log(`Dataset ${purchase.datasetId} purchased by ${purchase.buyer}`);
});

synthik.on('error', (error) => {
  console.error('SDK Error:', error);
});

// Transaction monitoring
synthik.on('transaction', (tx) => {
  console.log(`Transaction ${tx.txHash} - Gas used: ${tx.gasUsed}`);
});
```

### Storage Operations

```typescript
// Direct storage access for advanced use cases
const storage = synthik.storage;

// Upload custom data
const cid = await storage.uploadJSON({
  type: 'custom-metadata',
  timestamp: new Date().toISOString(),
  data: {
    /* your data */
  },
});

// Download data
const data = await storage.downloadJSON(cid);
```

## Configuration Options

```typescript
const synthik = new Synthik({
  // Required
  privateKey: 'YOUR_PRIVATE_KEY',

  // Network selection
  network: 'calibration', // 'mainnet', 'calibration', 'localhost'

  // Custom contract addresses (optional)
  contracts: {
    ProvenanceManager: '0x...',
    DatasetRegistry: '0x...',
    DatasetMarketplace: '0x...',
    AutoAccessManager: '0x...',
  },

  // Storage configuration (optional)
  storage: {
    provider: 'filecoin', // 'ipfs', 'filecoin', 'mock'
    endpoint: 'https://api.web3.storage',
    token: 'YOUR_WEB3_STORAGE_TOKEN',
  },

  // Transaction options (optional)
  options: {
    confirmations: 2, // Block confirmations to wait
    timeout: 60000, // Transaction timeout in ms
    maxRetries: 3, // Max retry attempts
    batchSize: 10, // Batch size for bulk operations
    gasMultiplier: 1.2, // Gas estimate multiplier
  },
});
```

## Type Definitions

The SDK provides comprehensive TypeScript definitions:

```typescript
import {
  Dataset,
  DatasetConfig,
  TransformationRule,
  AnonymizationRule,
  MarketplaceListing,
  DatasetLineage,
  QualityMetrics,
  GenerationType,
  DatasetStatus,
  PrivacyLevel,
  // ... and many more
} from '@synthik/sdk';
```

## Error Handling

```typescript
try {
  const dataset = await synthik.createDataset('My Dataset', data);
} catch (error) {
  if (error.message.includes('Insufficient funds')) {
    console.error('Please add more FIL to your wallet');
  } else if (error.message.includes('Invalid schema')) {
    console.error('Dataset schema validation failed');
  } else {
    console.error('Unexpected error:', error);
  }
}
```

## Testing

The SDK includes a mock storage provider for testing:

```typescript
const synthik = new Synthik({
  privateKey: 'TEST_PRIVATE_KEY',
  network: 'localhost',
  storage: { provider: 'mock' },
});

// All operations will work with in-memory storage
// Perfect for unit tests and development
```

## Network Information

### Calibration Testnet (Default)

- RPC URL: `https://api.calibration.node.glif.io/rpc/v1`
- Chain ID: 314159
- Faucet: https://faucet.calibration.fildev.network/

### Contract Addresses (Calibration)

- ProvenanceManager: `0x29D8445d30d1a3d48dAcAdAf84b4F71FEd7E0930`
- DatasetRegistry: `0x4953A913CA616eFF2c87BE990FbC26F96D46c273`
- DatasetMarketplace: `0xF7F7901B96dCb46C0A5460629E7CA35FB013aC04`
- AutoAccessManager: `0xF599d87f982d965041a20fE8aFA6b60CC5a7a5F6`

## Advanced Usage

### Batch Operations

```typescript
// Create multiple datasets in parallel
const datasets = await Promise.all([
  synthik.createDataset('Dataset 1', data1),
  synthik.createDataset('Dataset 2', data2),
  synthik.createDataset('Dataset 3', data3),
]);

// Transform multiple datasets
const transformations = datasets.map((dataset) =>
  synthik.transformDataset(dataset.id, transformRules)
);
const transformed = await Promise.all(transformations);
```

### Custom Quality Metrics

```typescript
const metrics: QualityMetrics = {
  completeness: 9500, // 95% in basis points
  consistency: 9000, // 90%
  accuracy: 9800, // 98%
  uniqueness: 10000, // 100%
  timeliness: 8500, // 85%
};

await synthik.datasets.updateQualityMetrics('dataset-123', metrics);
```

### Access Control (Coming Soon)

```typescript
// Grant access to specific addresses
await synthik.access.grantAccess('dataset-123', '0xRecipientAddress', {
  duration: 30 * 24 * 60 * 60, // 30 days in seconds
  reason: 'Research collaboration',
});

// Request access to a dataset
await synthik.access.requestAccess('dataset-456', {
  reason: 'Academic research on synthetic data quality',
  duration: 90 * 24 * 60 * 60, // 90 days
});
```

## Support

- 📚 [Documentation](https://docs.synthik.xyz)
- 💬 [Discord Community](https://discord.gg/synthik)
- 🐛 [Issue Tracker](https://github.com/synthik/sdk/issues)
- 📧 [Email Support](mailto:support@synthik.xyz)

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

## Security

For security issues, please email security@synthik.xyz instead of using the issue tracker.
