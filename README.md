# Synthik

[![Build Status](https://img.shields.io/badge/build-passing-brightgreen)](https://github.com/your-org/datahive/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Version](https://img.shields.io/badge/version-1.0.0-blue)](https://github.com/your-org/datahive/releases)

## **Verifiable Synthetic Data for Trustworthy AI on Filecon**

Synthik is a decentralized platform that revolutionizes how synthetic datasets are created, shared, and monetized while ensuring complete provenance tracking and verifiability.

Built on Filecoin's infrastructure, Synthik enables AI researchers, data scientists, and enterprises to generate high-quality synthetic data and finetune models with full transparency and trust.

## 🎯 Problem Statement

Today's AI revolution runs on invisible data and opaque models:

### Black-Box AI & Lack of Transparency

- State-of-the-art models are trained behind closed doors; regulators, customers, and even builders have no idea **what data went in or why a prediction was made**.
- Hallucinations, hidden bias, and catastrophic failures are impossible to trace back to their sources.

### Broken Data Lineage

- Once data leaves its source it passes through countless transformations, augmentation scripts, and fine-tuning pipelines—**provenance disappears**.
- Debugging or attributing intellectual property becomes a nightmare for enterprises and researchers alike.

### Compliance & Privacy Minefield

- GDPR, HIPAA, PCI-DSS and the upcoming EU AI Act demand **provable data governance and auditability**.
- Sharing real-world data is legally risky; synthetic data only solves the problem if you can **prove it never exposes PII** and can show how it was generated.

### Trust & Quality Deficit

- Anyone can upload a CSV and call it "synthetic". Without objective metrics, marketplaces are flooded with **low-grade, duplicated, or outright fake datasets**.
- Down-stream models inherit hidden flaws, eroding trust in AI systems and creating expensive recalls.

### Misaligned Economics

- Generating high-fidelity data is costly, yet **creators struggle to monetise** their work, while buyers pay without guarantees of authenticity or freshness.
- Good actors receive the same visibility as bad ones, removing incentives to invest in quality.

## 🚀 Our Solution

**AI-Powered Synthetic Data Generation** – Feed Synthik with a schema and field-level constraints, then choose your flow: generate data from scratch, augment an existing file, start from an industry-specific template, or transform & anonymize a sensitive dataset. Our multi-LLM engine (GPT-4, Gemini, Claude, Lilypad) returns production-ready, statistically diverse rows in minutes.

**Autonomous Quality Gate** – LLM agents validate every submission for accuracy, diversity, and schema fit; only datasets that pass are signed on-chain for tamper-proof authenticity.

**Privacy-First Storage** – Data lives on Filecoin with FilCDN acceleration. Merkle proofs plus time-boxed, key-gated access keep raw content secure and compliant.

**Immutable Lineage** – Every generation, transformation, license, and model run is immutably recorded, delivering audit-ready provenance for regulators and customers alike.

**On-Chain $USDFC Rewards** – Smart contracts escrow payments, distribute royalties, and enforce license terms automatically—creators get paid the moment a dataset is purchased.

**One-Click Training Pipelines 📦** – When model training is initiated, verified datasets are fetched from Filecoin using FilCDN, automatically preprocessed and validated, then fed directly into AWS SageMaker, Google Vertex AI, or Hugging Face for training and deployment—no manual ETL required.

## 🏗️ Technology Stack

### **Blockchain & Storage**

- **Filecoin**: Decentralized storage network for dataset persistence
- **Filecoin Virtual Machine (FVM)**: Smart contract execution environment
- **FilCDN**: Content delivery network for fast data access
- **IPFS**: Distributed file system for metadata and smaller files
- **Synapse SDK**: Filecoin storage and retrieval optimization

### **Smart Contracts**

- **ProvenanceManager**: Core dataset creation and lineage tracking
- **DatasetRegistry**: Access control and relationship management
- **DatasetMarketplace**: Economic layer for buying/selling datasets
- **AutoAccessManager**: Automated access granting based on rules

### **AI & Machine Learning**

- **OpenAI Integration**: GPT-4 Turbo, GPT-4o Mini for high-quality generation
- **Google Gemini**: Gemini 1.5 Flash/Pro for fast, large-context generation
- **Anthropic Claude**: Advanced reasoning and safety-focused generation
- **Atoma Network**: Decentralized inference for cost-effective generation
- **Training Platforms**: AWS SageMaker, Google Vertex AI, Hugging Face

### **Frontend Technology**

- **Next.js 15**: React-based web application framework
- **TypeScript**: Type-safe development environment
- **Tailwind CSS**: Utility-first styling framework
- **Privy**: Web3 authentication and wallet management
- **Wagmi/Viem**: Ethereum interaction libraries
- **Framer Motion**: Advanced animations and interactions

### **Backend Infrastructure**

- **FastAPI**: High-performance Python web framework
- **SQLAlchemy**: Database ORM with PostgreSQL support
- **Redis**: Caching and session management
- **Celery**: Distributed task processing
- **LangChain**: LLM orchestration and tool integration
- **LangGraph**: Multi-agent workflow management

## 🌟 Key Features

### **Dataset Generation**

- **Multi-Modal Support**: Text, tabular, and structured data generation
- **Industry Templates**: Pre-built schemas for e-commerce, healthcare, finance
- **Custom Schemas**: Flexible field definitions with constraints and validation
- **Batch Processing**: Efficient large-scale dataset generation
- **Quality Control**: Automated validation and consistency checking

### **Blockchain Integration**

- **Immutable Records**: All dataset metadata stored on Filecoin blockchain
- **Smart Contracts**: Automated licensing, payments, and access control
- **Cryptographic Proofs**: Merkle tree validation for data integrity
- **Event Tracking**: Complete audit trail of all dataset operations

### **Marketplace Features**

- **Dynamic Pricing**: Flexible pricing models including per-row and fixed pricing
- **License Management**: Support for multiple license types and usage terms
- **Royalty System**: Automatic revenue sharing for dataset creators
- **Search & Discovery**: Advanced filtering and recommendation system

### **Enterprise Tools**

- **Multi-Agent Workflows**: Automated quality assurance and verification
- **Training Integration**: Direct connection to major ML training platforms
- **API Access**: Comprehensive REST APIs and SDKs
- **Analytics Dashboard**: Usage metrics and revenue tracking

### **Privacy & Compliance**

- **Data Anonymization**: Built-in privacy-preserving transformations
- **Compliance Support**: GDPR, HIPAA, and other regulatory frameworks
- **Access Controls**: Role-based permissions and time-limited access
- **Audit Trails**: Complete history of data access and usage

## 🛠️ SDKs & Integration

### **JavaScript/TypeScript SDK**

```typescript
import { Synthik } from '@synthik/sdk';

const synthik = new Synthik({
  privateKey: 'YOUR_PRIVATE_KEY',
  network: 'calibration',
  apiKeys: {
    openai: 'YOUR_OPENAI_KEY',
    google: 'YOUR_GEMINI_KEY',
  },
});

// Generate synthetic dataset
const dataset = await synthik.generateDataset(
  {
    name: 'E-commerce Orders',
    rows: 10000,
    schema: [
      { name: 'order_id', type: 'string', description: 'Unique order ID' },
      { name: 'customer_name', type: 'string', description: 'Customer name' },
      { name: 'amount', type: 'number', description: 'Order amount in USD' },
    ],
  },
  models[0]
);
```

### **Python SDK** (Coming Soon)

```python
from synthik import SynthikClient

client = SynthikClient(
    private_key="YOUR_PRIVATE_KEY",
    network="calibration"
)

# Create and train model
dataset = client.create_dataset(data, config)
model = client.train_model(dataset_id, training_config)
```

## 🏃‍♂️ Getting Started

### **Prerequisites**

- Node.js 18+ and Python 3.10+
- Filecoin wallet with testnet tokens
- API keys for AI models (optional but recommended)

### **Quick Start**

1. **Get Testnet Tokens**: Visit [Filecoin Calibration Faucet](https://faucet.calibration.fildev.network/)
2. **Clone Repository**: `git clone https://github.com/synthik/synthik`
3. **Install Dependencies**: `npm install` (frontend) and `poetry install` (backend)
4. **Configure Environment**: Set up `.env` files with your credentials
5. **Start Development**: `npm run dev` (frontend) and `make run` (backend)

### **Example Usage**

```bash
# Generate a synthetic dataset
curl -X POST "http://localhost:8000/generation/generate" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Customer Data",
    "rows": 1000,
    "schema": [
      {"name": "name", "type": "string"},
      {"name": "email", "type": "string"},
      {"name": "age", "type": "number"}
    ]
  }'
```

## 🌐 Network Information

### **Filecoin Calibration Testnet**

- **RPC URL**: `https://api.calibration.node.glif.io/rpc/v1`
- **Chain ID**: 314159
- **Faucet**: https://faucet.calibration.fildev.network/

### **Deployed Contracts**

- **ProvenanceManager**: `0x29D8445d30d1a3d48dAcAdAf84b4F71FEd7E0930`
- **DatasetRegistry**: `0xCf296AbB8055263E56d9eD507bB221C5F4899646`
- **DatasetMarketplace**: `0xC06182A35AECb648Bc30514905aD8A156Bf7dffc`
- **AutoAccessManager**: `0x1EE7E24CD49E2347f73880a259f28950d0B6fB85`

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details on:

- Code of conduct
- Development setup
- Pull request process
- Issue reporting

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🔗 Links

- **Website**: https://synthik.io
- **Documentation**: https://docs.synthik.ai
- **GitHub**: https://github.com/synthik

---

**Built with ❤️ for the future of trustworthy AI data**
