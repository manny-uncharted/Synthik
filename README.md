# Synthik

[![Build Status](https://img.shields.io/badge/build-passing-brightgreen)](https://github.com/your-org/datahive/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Version](https://img.shields.io/badge/version-1.0.0-blue)](https://github.com/your-org/datahive/releases)

## **Verifiable Synthetic Data for Trustworthy AI on Filecon**

Synthik is a decentralized platform that revolutionizes how synthetic datasets are created, shared, and monetized while ensuring complete provenance tracking and verifiability.

Built on Filecoin's infrastructure, Synthik enables AI researchers, data scientists, and enterprises to generate high-quality synthetic data and finetune models with full transparency and trust.

## 📋 Table of Contents

- [🎯 Problem Statement](#-problem-statement)
- [🚀 Our Solution](#-our-solution)
- [🔗 Filecoin Integration](#-filecoin-integration)
- [🛠️ SDKs & Integration](#️-sdks--integration)
  - [JavaScript/TypeScript SDK](#javascripttypescript-sdk)
  - [Python SDK (Coming Soon)](#python-sdk-coming-soon)
- [🏃‍♂️ Getting Started](#️-getting-started)
- [🤝 Contributing](#-contributing)
- [📄 License](#-license)
- [🔗 Links](#-links)

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

**LLM-Powered Synthetic Data Generation** – Feed Synthik a schema and field-level constraints to generate, augment or anonymize datasets. Our multi-LLM engine (GPT-4, Gemini, Claude, Lilypad) returns production-ready, statistically diverse rows in minutes—then uploads the encrypted payload and metadata to Filecoin via the Synapse SDK with built-in Proof-of-Data-Possession.

**Autonomous Quality Gate** – LLM agents validate every submission for accuracy, diversity, and schema fit; only datasets that pass are signed on-chain for tamper-proof authenticity.

**Privacy-First Storage & Instant Delivery** –

- Encrypted Uploads & Provenance: **Synapse SDK** + **FilCDN** uploads full datasets, previews and metadata to Filecoin with verifiable Proof of Data Possession.
- Lineage & Preview Fetch: **FilCDN** delivers schema, lineage and preview data to UIs and validation agents before any download.
- Merkle proofs plus time-boxed, key-gated access keep raw content secure and compliant.

**Immutable Lineage** – Every generation, transformation, license, and model run is immutably recorded, delivering audit-ready provenance for regulators and customers alike.

**On-Chain $USDFC Rewards** – Smart contracts escrow payments, distribute royalties, and enforce license terms automatically—creators get paid the moment a dataset is purchased.

**One-Click Training Pipelines** - When you initiate model training, FilCDN streams the encrypted dataset (with validated on-chain licenses), decrypts at the edge, and pipes it directly into Hugging Face, Google Vertex AI or AWS SageMaker for fine-tuning—no manual ETL required.

All accompanying training scripts, configuration files and runtime metadata are likewise logged and stored on Filecoin via the Synapse SDK for full reproducibility and auditability.

## 🔗 Filecoin Integration

| Component                 | Description                                                                        | Key Features                                                                                                                                                                                                                                                                                    |
| ------------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Synapse SDK**           | Uploads encrypted datasets & training metadata to Filecoin with proof verification | • Automated proof set management<br>• Smart provider selection<br>• USDFC payment abstraction<br>• CDN integration support                                                                                                                                                                      |
| **FilCDN**                | Streams datasets for model training & instant preview delivery                     | • Direct HTTPS access (no wallet needed)<br>• Global edge caching<br>• URL pattern: `https://{address}.calibration.filcdn.io/{cid}`                                                                                                                                                             |
| **Smart Contracts (FVM)** | Records immutable dataset lineage & handles marketplace transactions               | • **ProvenanceManager**: `0x29D8445d30d1a3d48dAcAdAf84b4F71FEd7E0930`<br>• **DatasetRegistry**: `0xCf296AbB8055263E56d9eD507bB221C5F4899646`<br>• **DatasetMarketplace**: `0xC06182A35AECb648Bc30514905aD8A156Bf7dffc`<br>• **AutoAccessManager**: `0x1EE7E24CD49E2347f73880a259f28950d0B6fB85` |
| **USDFC Token**           | Powers all dataset purchases & storage payments on Synthik                         | • Address: `0xb3042734b608a1B16e9e86B374A3f3e389B4cDf0`<br>• Decimals: 18<br>• Used for: Dataset purchases, storage fees, royalties                                                                                                                                                             |

### Testnet Resources

| Resource     | Link                                                                                                               |
| ------------ | ------------------------------------------------------------------------------------------------------------------ |
| FIL Faucet   | [faucet.calibration.fildev.network](https://faucet.calibration.fildev.network/)                                    |
| USDFC Faucet | [forest-explorer.chainsafe.dev/faucet/calibnet_usdfc](https://forest-explorer.chainsafe.dev/faucet/calibnet_usdfc) |

## 🛠️ SDKs & Integration

### **JavaScript/TypeScript SDK**

[![npm version](https://img.shields.io/npm/v/@ghostxd/synthik-sdk.svg)](https://www.npmjs.com/package/@ghostxd/synthik-sdk)

We also built an SDK to help integrate Synthik's synthetic data and provenance into your existing workflows:

[Npm Package](https://www.npmjs.com/package/@ghostxd/synthik-sdk)

```bash
npm install @ghostxd/synthik-sdk
# or
yarn add @ghostxd/synthik-sdk
```

```typescript
import { Synthik } from '@ghostxd/synthik-sdk';

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

// Dataset is automatically uploaded to Filecoin and our FVM contracts for provenance
console.log('Dataset CID:', dataset.cid);
console.log('Access via FilCDN:', dataset.cdnUrl);
```

### **Python SDK** (Coming Soon)

We're actively developing a Python SDK to bring the same seamless integration to Python workflows:

```python
from synthik import SynthikClient
import datasets

# Initialize Synthik client
client = SynthikClient(api_key="your_api_key")

# Generate synthetic dataset with on-chain provenance
dataset = client.generate(
    prompt="Medical diagnosis records with patient symptoms",
    size=10000,
    schema={"symptoms": "text", "diagnosis": "label"},
    verify_on_chain=True
)

# Direct integration with Hugging Face
dataset.push_to_hub("your-org/medical-synthetic-data")

# Load and fine-tune with blockchain verification
from transformers import AutoModelForSequenceClassification
model = AutoModelForSequenceClassification.from_pretrained("bert-base")

# Training includes on-chain provenance tracking
trainer = dataset.get_trainer(
    model=model,
    track_lineage=True,  # Automatic Filecoin storage
    compute_target="vertex-ai"  # Or "sagemaker", "lightning"
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
- **GitHub**: [https://github.com/synthik](https://github.com/Ghost-xDD/Synthik)

---

**Built with ❤️ for the future of trustworthy AI data**
