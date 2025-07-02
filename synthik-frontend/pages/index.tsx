import { motion } from 'framer-motion';
import { useRef } from 'react';
import {
  ArrowUpRight,
  Sparkles,
  Database,
  Network,
  GitBranch,
  Shield,
  Zap,
  BarChart,
  Lock,
  Globe,
  Terminal,
  CheckCircle,
  Play,
} from 'lucide-react';

export default function Home() {
  const containerRef = useRef<HTMLDivElement>(null);

  // Data nodes for visualization
  const dataNodes = Array.from({ length: 12 }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    y: Math.random() * 100,
  }));

  const codeExample = `from synthik import SynthikClient
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
)`;

  const features = [
    {
      icon: <GitBranch className="w-6 h-6" />,
      title: 'On-Chain Model Lineage',
      description:
        'Every fine-tuned model includes immutable provenance records on Filecoin, tracking data sources and training parameters',
    },
    {
      icon: <Shield className="w-6 h-6" />,
      title: 'Verifiable Data History',
      description:
        'Complete audit trail of dataset transformations, generations, and usage stored permanently on blockchain',
    },
    {
      icon: <Zap className="w-6 h-6" />,
      title: 'One-Click Fine-Tuning',
      description:
        'Deploy to Hugging Face, Vertex AI, or SageMaker with automatic provenance tracking and verification',
    },
    {
      icon: <Lock className="w-6 h-6" />,
      title: 'Privacy-Preserving',
      description:
        'Generate synthetic data that maintains statistical properties without exposing sensitive information',
    },
    {
      icon: <Globe className="w-6 h-6" />,
      title: 'Decentralized Marketplace',
      description:
        'Trade datasets with smart contract automation, ensuring fair compensation and usage rights',
    },
    {
      icon: <BarChart className="w-6 h-6" />,
      title: 'Quality Metrics',
      description:
        'Automated quality scoring and validation against real-world data distributions',
    },
  ];

  const useCases = [
    {
      title: 'Healthcare AI',
      description:
        'Generate HIPAA-compliant synthetic patient records for model training',
      icon: '🏥',
    },
    {
      title: 'Financial Services',
      description: 'Create realistic transaction data without privacy concerns',
      icon: '🏦',
    },
    {
      title: 'Autonomous Vehicles',
      description: 'Synthetic sensor data for edge case scenario testing',
      icon: '🚗',
    },
    {
      title: 'Natural Language',
      description: 'Domain-specific text generation for specialized NLP models',
      icon: '💬',
    },
  ];

  return (
    <div className="min-h-screen bg-background noise-texture overflow-hidden">
      {/* Mesh gradient background */}
      <div className="fixed inset-0 mesh-gradient pointer-events-none" />

      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 px-8 lg:px-16 py-6 ">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg" />
            <span className="text-xl font-medium">Synthik</span>
          </div>

          <div className="flex items-center gap-8">
            <a
              href="/datasets"
              className="px-5 py-2.5 text-sm font-medium btn-primary rounded-lg flex items-center gap-2"
            >
              Launch App <ArrowUpRight className="w-3 h-3" />
            </a>
          </div>
        </div>
      </nav>

      {/* Hero Section - Asymmetric Layout */}
      <section className="relative min-h-screen flex items-center px-8 lg:px-16 pt-24">
        <div className="max-w-7xl mx-auto w-full grid lg:grid-cols-12 gap-12 items-center">
          {/* Left Content */}
          <motion.div
            className="lg:col-span-7"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
          >
            <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-indigo-50 rounded-full text-sm text-indigo-700 mb-8">
              <Sparkles className="w-4 h-4" />
              <span>Built on Filecoin</span>
            </div>

            <h1 className="text-5xl lg:text-7xl font-light display-font leading-tight mb-6">
              Synthetic data with
              <br />
              <span className="relative">
                <span className="highlight-text">blockchain provenance</span>
              </span>
            </h1>

            <p className="text-xl text-gray-600 leading-relaxed mb-8 max-w-2xl">
              Generate verifiable datasets, track complete lineage on Filecoin,
              and fine-tune models with cryptographic proof of data origin.
            </p>

            <div className="flex flex-wrap gap-4 mb-12">
              <button className="px-8 py-4 btn-primary rounded-lg font-medium flex items-center gap-2">
                Start Building <ArrowUpRight className="w-4 h-4" />
              </button>
              <button className="px-8 py-4 glass-card rounded-lg font-medium hover:bg-gray-50 transition-colors">
                View Documentation
              </button>
            </div>

            <div className="flex items-center gap-8">
              <div>
                <div className="text-3xl font-light mb-1">10M+</div>
                <div className="text-sm text-gray-500">Datasets Created</div>
              </div>
              <div className="w-px h-12 bg-gray-200" />
              <div>
                <div className="text-3xl font-light mb-1">500K+</div>
                <div className="text-sm text-gray-500">Models Trained</div>
              </div>
              <div className="w-px h-12 bg-gray-200" />
              <div>
                <div className="text-3xl font-light mb-1">100%</div>
                <div className="text-sm text-gray-500">On-Chain Verified</div>
              </div>
            </div>
          </motion.div>

          {/* Right Visual - Data Network Visualization */}
          <motion.div
            className="lg:col-span-5 relative h-[500px] hidden lg:block"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, delay: 0.2 }}
          >
            <div className="absolute inset-0" ref={containerRef}>
              {/* Animated data nodes */}
              {dataNodes.map((node, i) => (
                <motion.div
                  key={node.id}
                  className="data-node"
                  style={{
                    left: `${node.x}%`,
                    top: `${node.y}%`,
                  }}
                  animate={{
                    x: Math.sin(Date.now() / 1000 + i) * 20,
                    y: Math.cos(Date.now() / 1000 + i) * 20,
                  }}
                  transition={{
                    duration: 4,
                    repeat: Infinity,
                    ease: 'linear',
                  }}
                />
              ))}

              {/* Central element */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
                <div className="w-32 h-32 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl opacity-10 animate-pulse" />
                <div className="absolute inset-4 bg-white rounded-xl shadow-2xl flex items-center justify-center">
                  <Database className="w-8 h-8 text-indigo-600" />
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Code Example Section */}
      <section className="px-8 lg:px-16 py-24 bg-gray-50">
        <div className="max-w-7xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="grid lg:grid-cols-2 gap-12 items-center"
          >
            <div>
              <h2 className="text-4xl lg:text-5xl font-light display-font mb-6">
                Integrate in minutes
              </h2>
              <p className="text-xl text-gray-600 mb-6">
                Native SDKs for Python, JavaScript, and Go. Direct integration
                with Hugging Face, automatic provenance tracking, and seamless
                deployment to any ML platform.
              </p>
              <div className="flex flex-col gap-4">
                <div className="flex items-center gap-3">
                  <CheckCircle className="w-5 h-5 text-green-600" />
                  <span className="text-gray-700">
                    Automatic on-chain verification
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <CheckCircle className="w-5 h-5 text-green-600" />
                  <span className="text-gray-700">
                    Complete lineage tracking on Filecoin
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <CheckCircle className="w-5 h-5 text-green-600" />
                  <span className="text-gray-700">
                    One-line Hugging Face integration
                  </span>
                </div>
              </div>
              <div className="mt-8 flex gap-4">
                <button className="px-6 py-3 btn-primary rounded-lg font-medium flex items-center gap-2">
                  <Play className="w-4 h-4" /> Try in Playground
                </button>
                <button className="px-6 py-3 border border-gray-300 rounded-lg font-medium hover:bg-gray-50 transition-colors flex items-center gap-2">
                  <Terminal className="w-4 h-4" /> View Docs
                </button>
              </div>
            </div>

            <div className="relative">
              <div className="absolute -inset-4 bg-gradient-to-r from-indigo-500/20 to-purple-600/20 rounded-2xl blur-2xl" />
              <div className="relative bg-gray-900 rounded-xl p-6 overflow-hidden">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-3 h-3 bg-red-500 rounded-full" />
                  <div className="w-3 h-3 bg-yellow-500 rounded-full" />
                  <div className="w-3 h-3 bg-green-500 rounded-full" />
                  <span className="ml-4 text-gray-400 text-sm">
                    Python Example
                  </span>
                </div>
                <pre className="text-sm text-gray-300 overflow-x-auto">
                  <code>{codeExample}</code>
                </pre>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Comprehensive Features Grid */}
      <section className="px-8 lg:px-16 py-24">
        <div className="max-w-7xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-4xl lg:text-5xl font-light display-font mb-4">
              Everything you need for{' '}
              <span className="highlight-text">trusted AI</span>
            </h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              From generation to deployment, every step is verified on-chain
              with complete transparency
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature, index) => (
              <motion.div
                key={index}
                className="glass-card-dark rounded-2xl p-8 hover:shadow-xl transition-all group"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                whileHover={{ y: -4 }}
              >
                <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center text-white mb-6 group-hover:scale-110 transition-transform">
                  {feature.icon}
                </div>
                <h3 className="text-xl font-semibold mb-3">{feature.title}</h3>
                <p className="text-gray-600">{feature.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Use Cases Section */}
      <section className="px-8 lg:px-16 py-24 bg-gray-50">
        <div className="max-w-7xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-4xl lg:text-5xl font-light display-font mb-4">
              Trusted by innovators across industries
            </h2>
            <p className="text-xl text-gray-600">
              See how teams are building the future with synthetic data
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {useCases.map((useCase, index) => (
              <motion.div
                key={index}
                className="bg-white rounded-2xl p-8 shadow-sm hover:shadow-lg transition-all text-center group"
                initial={{ opacity: 0, scale: 0.9 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                whileHover={{ y: -4 }}
              >
                <div className="text-5xl mb-4">{useCase.icon}</div>
                <h3 className="text-lg font-semibold mb-2">{useCase.title}</h3>
                <p className="text-gray-600 text-sm">{useCase.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Lineage Tracking Feature */}
      <section className="px-8 lg:px-16 py-24">
        <div className="max-w-7xl mx-auto">
          <motion.div
            className="grid lg:grid-cols-2 gap-12 items-center"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <div className="order-2 lg:order-1">
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/10 to-purple-600/10 rounded-3xl blur-3xl" />
                <div className="relative glass-card-dark rounded-2xl p-8">
                  <div className="space-y-4">
                    {[
                      {
                        label: 'Dataset ID',
                        value: '0x7f3d...8a2b',
                        icon: <Database className="w-4 h-4" />,
                      },
                      {
                        label: 'Generation Time',
                        value: '2024-01-15 14:32 UTC',
                        icon: <Sparkles className="w-4 h-4" />,
                      },
                      {
                        label: 'Filecoin CID',
                        value: 'bafy2bzace...xqc',
                        icon: <Network className="w-4 h-4" />,
                      },
                      {
                        label: 'Model Lineage',
                        value: '3 fine-tunes tracked',
                        icon: <GitBranch className="w-4 h-4" />,
                      },
                      {
                        label: 'Verification',
                        value: 'On-chain verified ✓',
                        icon: <Shield className="w-4 h-4" />,
                      },
                    ].map((item, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between p-4 bg-gray-50 rounded-lg"
                      >
                        <div className="flex items-center gap-3">
                          <div className="text-indigo-600">{item.icon}</div>
                          <span className="text-sm font-medium text-gray-700">
                            {item.label}
                          </span>
                        </div>
                        <span className="text-sm font-mono text-gray-900">
                          {item.value}
                        </span>
                      </div>
                    ))}
                  </div>
                  <button className="mt-6 w-full px-4 py-3 bg-indigo-50 text-indigo-700 rounded-lg font-medium hover:bg-indigo-100 transition-colors">
                    View Complete History on Filecoin →
                  </button>
                </div>
              </div>
            </div>

            <div className="order-1 lg:order-2">
              <h2 className="text-4xl lg:text-5xl font-light display-font mb-6">
                Complete transparency,
                <br />
                <span className="highlight-text">immutable history</span>
              </h2>
              <p className="text-xl text-gray-600 mb-8">
                Every dataset and model fine-tune is permanently recorded on
                Filecoin. Track the complete lineage from synthetic generation
                to deployed model.
              </p>
              <ul className="space-y-4">
                <li className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-green-600 mt-1 flex-shrink-0" />
                  <span className="text-gray-700">
                    View generation parameters and prompts
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-green-600 mt-1 flex-shrink-0" />
                  <span className="text-gray-700">
                    Track all transformations and usage
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-green-600 mt-1 flex-shrink-0" />
                  <span className="text-gray-700">
                    Verify model training data sources
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-green-600 mt-1 flex-shrink-0" />
                  <span className="text-gray-700">
                    Ensure compliance and audit readiness
                  </span>
                </li>
              </ul>
            </div>
          </motion.div>
        </div>
      </section>

      {/* How it works - Timeline */}
      <section className="px-8 lg:px-16 py-24 relative bg-gray-50">
        <div className="absolute inset-0 grid-pattern opacity-50" />
        <div className="max-w-7xl mx-auto relative">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-4xl lg:text-5xl font-light display-font mb-4">
              Simple, yet powerful
            </h2>
            <p className="text-xl text-gray-600">
              From dataset to deployment in four steps.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-4 gap-8 relative">
            {/* Connection line */}
            <div className="absolute top-12 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-gray-200 to-transparent hidden md:block" />

            {[
              {
                title: 'Define',
                desc: 'Specify your dataset requirements and constraints',
                icon: '01',
              },
              {
                title: 'Generate',
                desc: 'AI creates synthetic data with blockchain verification',
                icon: '02',
              },
              {
                title: 'Fine-tune',
                desc: 'Train models with automatic lineage tracking',
                icon: '03',
              },
              {
                title: 'Deploy',
                desc: 'Ship to production with full provenance',
                icon: '04',
              },
            ].map((step, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="relative"
              >
                <div className="flex flex-col items-center text-center">
                  <div className="w-24 h-24 bg-white rounded-2xl shadow-lg flex items-center justify-center mb-6 relative z-10">
                    <span className="text-2xl font-light text-indigo-600">
                      {step.icon}
                    </span>
                  </div>
                  <h3 className="text-xl font-medium mb-2">{step.title}</h3>
                  <p className="text-gray-600 text-sm">{step.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="px-8 lg:px-16 py-24">
        <div className="max-w-7xl mx-auto">
          <div className="bg-gradient-to-br from-indigo-600 to-purple-700 rounded-3xl p-12 lg:p-16 text-white relative overflow-hidden">
            <div className="absolute top-0 right-0 w-96 h-96 bg-white/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
            <div className="relative z-10">
              <h2 className="text-3xl lg:text-4xl font-light text-center mb-12">
                Trusted by the world&apos;s most innovative teams
              </h2>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-8">
                <div className="text-center">
                  <div className="text-4xl lg:text-5xl font-light mb-2">
                    10M+
                  </div>
                  <div className="text-white/80">Datasets Generated</div>
                </div>
                <div className="text-center">
                  <div className="text-4xl lg:text-5xl font-light mb-2">
                    500K+
                  </div>
                  <div className="text-white/80">Models Trained</div>
                </div>
                <div className="text-center">
                  <div className="text-4xl lg:text-5xl font-light mb-2">
                    50TB+
                  </div>
                  <div className="text-white/80">Data on Filecoin</div>
                </div>
                <div className="text-center">
                  <div className="text-4xl lg:text-5xl font-light mb-2">
                    99.99%
                  </div>
                  <div className="text-white/80">Uptime SLA</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="px-8 lg:px-16 py-24">
        <motion.div
          className="max-w-4xl mx-auto text-center glass-card rounded-3xl p-12 lg:p-16 relative overflow-hidden"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <div className="absolute -top-32 -right-32 w-64 h-64 bg-gradient-to-br from-indigo-500/20 to-purple-600/20 rounded-full blur-3xl" />
          <div className="absolute -bottom-32 -left-32 w-64 h-64 bg-gradient-to-br from-purple-600/20 to-pink-500/20 rounded-full blur-3xl" />

          <div className="relative z-10">
            <h2 className="text-4xl lg:text-5xl font-light display-font mb-6">
              Ready to build with verified data?
            </h2>
            <p className="text-xl text-gray-600 mb-8">
              Join thousands of developers building trustworthy AI with
              blockchain-verified synthetic data.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <button className="px-8 py-4 btn-primary rounded-lg font-medium flex items-center justify-center gap-2">
                Get Started Free <ArrowUpRight className="w-4 h-4" />
              </button>
              <button className="px-8 py-4 border border-gray-200 rounded-lg font-medium hover:bg-gray-50 transition-colors">
                Schedule Demo
              </button>
            </div>
            <p className="text-sm text-gray-500 mt-6">
              No credit card required • 10,000 free API calls • Full lineage
              tracking included
            </p>
          </div>
        </motion.div>
      </section>

      {/* Footer */}
      <footer className="px-8 lg:px-16 py-12 border-t border-gray-100">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-4 gap-8 mb-8">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-6 h-6 bg-gradient-to-br from-indigo-500 to-purple-600 rounded" />
                <span className="font-medium">Synthik</span>
              </div>
              <p className="text-sm text-gray-600">
                The blockchain-verified synthetic data platform for trustworthy
                AI
              </p>
            </div>

            <div>
              <h4 className="font-medium mb-4">Product</h4>
              <ul className="space-y-2 text-sm text-gray-600">
                <li>
                  <a
                    href="#"
                    className="hover:text-foreground transition-colors"
                  >
                    Features
                  </a>
                </li>
                <li>
                  <a
                    href="#"
                    className="hover:text-foreground transition-colors"
                  >
                    Integrations
                  </a>
                </li>
                <li>
                  <a
                    href="#"
                    className="hover:text-foreground transition-colors"
                  >
                    Pricing
                  </a>
                </li>
                <li>
                  <a
                    href="#"
                    className="hover:text-foreground transition-colors"
                  >
                    Changelog
                  </a>
                </li>
              </ul>
            </div>

            <div>
              <h4 className="font-medium mb-4">Resources</h4>
              <ul className="space-y-2 text-sm text-gray-600">
                <li>
                  <a
                    href="#"
                    className="hover:text-foreground transition-colors"
                  >
                    Documentation
                  </a>
                </li>
                <li>
                  <a
                    href="#"
                    className="hover:text-foreground transition-colors"
                  >
                    API Reference
                  </a>
                </li>
                <li>
                  <a
                    href="#"
                    className="hover:text-foreground transition-colors"
                  >
                    Blog
                  </a>
                </li>
                <li>
                  <a
                    href="#"
                    className="hover:text-foreground transition-colors"
                  >
                    Community
                  </a>
                </li>
              </ul>
            </div>

            <div>
              <h4 className="font-medium mb-4">Company</h4>
              <ul className="space-y-2 text-sm text-gray-600">
                <li>
                  <a
                    href="#"
                    className="hover:text-foreground transition-colors"
                  >
                    About
                  </a>
                </li>
                <li>
                  <a
                    href="#"
                    className="hover:text-foreground transition-colors"
                  >
                    Careers
                  </a>
                </li>
                <li>
                  <a
                    href="#"
                    className="hover:text-foreground transition-colors"
                  >
                    Contact
                  </a>
                </li>
                <li>
                  <a
                    href="#"
                    className="hover:text-foreground transition-colors"
                  >
                    Partners
                  </a>
                </li>
              </ul>
            </div>
          </div>

          <div className="pt-8 border-t border-gray-100 flex flex-col md:flex-row justify-between items-center gap-4">
            <div className="text-sm text-gray-500">
              © 2024 Synthik. All rights reserved.
            </div>
            <div className="flex gap-6 text-sm text-gray-600">
              <a href="#" className="hover:text-foreground transition-colors">
                Privacy
              </a>
              <a href="#" className="hover:text-foreground transition-colors">
                Terms
              </a>
              <a href="#" className="hover:text-foreground transition-colors">
                Security
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
