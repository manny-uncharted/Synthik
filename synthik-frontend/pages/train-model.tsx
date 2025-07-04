import { useState } from 'react';
// import { useRouter } from 'next/router';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import Layout from '../components/Layout';
import { ProtectedRoute } from '../components/auth';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Database,
  Brain,
  Cloud,
  Loader2,
  Info,
  Eye,
  Sparkles,
  Key,
  ExternalLink,
} from 'lucide-react';

// Mock dataset for preview
const mockDataset = {
  name: 'Financial News Sentiment Dataset',
  rows: 50000,
  size: '2.4 GB',
  preview: [
    {
      article_id: 'fin_001',
      headline: 'Tech Stocks Rally as AI Innovation Drives Market Optimism',
      sentiment: 0.82,
      category: 'Technology',
    },
    {
      article_id: 'fin_002',
      headline:
        'Federal Reserve Signals Potential Rate Cut Amid Economic Slowdown',
      sentiment: -0.45,
      category: 'Monetary Policy',
    },
  ],
};

// Available models
const baseModels = [
  {
    id: 'bert-base',
    name: 'BERT Base',
    description: 'General-purpose language understanding model',
    params: '110M',
    category: 'NLP',
    recommended: true,
  },
  {
    id: 'gpt-3.5',
    name: 'GPT-3.5 Turbo',
    description: 'Advanced text generation and understanding',
    params: '175B',
    category: 'NLP',
  },
  {
    id: 'roberta',
    name: 'RoBERTa',
    description: 'Robustly optimized BERT approach',
    params: '125M',
    category: 'NLP',
  },
  {
    id: 'xlm-roberta',
    name: 'XLM-RoBERTa',
    description: 'Multilingual language understanding',
    params: '550M',
    category: 'NLP',
  },
];

// Deployment targets
const deploymentTargets = [
  {
    id: 'huggingface',
    name: 'Hugging Face',
    description: 'Open model hub with free hosting',
    icon: '🤗',
    fields: ['api_key', 'model_name'],
  },
  {
    id: 'vertex-ai',
    name: 'Vertex AI',
    description: 'Google Cloud ML platform',
    icon: '🔷',
    fields: ['project_id', 'service_account_key', 'region'],
  },
  {
    id: 'lightning-ai',
    name: 'Lightning AI',
    description: 'Fast model training and deployment',
    icon: '⚡',
    fields: ['api_key', 'workspace_id'],
  },
];

export default function TrainModel() {
  //   const router = useRouter();
  const [currentStep, setCurrentStep] = useState(1);
  const [isTraining, setIsTraining] = useState(false);

  // Form state
  const [selectedModel, setSelectedModel] = useState('');
  const [modelParams, setModelParams] = useState({
    epochs: 3,
    batchSize: 32,
    learningRate: 2e-5,
    maxLength: 128,
  });
  const [selectedTarget, setSelectedTarget] = useState('');
  const [credentials, setCredentials] = useState<Record<string, string>>({});

  const steps = [
    { number: 1, title: 'Dataset Preview', icon: Database },
    { number: 2, title: 'Model Selection', icon: Brain },
    { number: 3, title: 'Deployment Target', icon: Cloud },
    { number: 4, title: 'Training Status', icon: Loader2 },
  ];

  const handleNext = () => {
    if (currentStep < 4) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const startTraining = () => {
    setIsTraining(true);
    setCurrentStep(4);
    // Simulate training process
    setTimeout(() => {
      // Training would complete here
    }, 5000);
  };

  return (
    <ProtectedRoute>
      <Layout>
        {/* Background */}
        <div className="fixed inset-0 -z-10">
          <div className="absolute inset-0 bg-gray-50" />
          <div className="absolute inset-0 grid-pattern opacity-[0.02]" />
          <div className="absolute top-0 left-0 w-full h-96 mesh-gradient" />
        </div>

        <div className="pt-28 pb-20 px-8 lg:px-16">
          <div className="max-w-5xl mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-12"
            >
              <Link
                href="/datasets/1"
                className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-8 transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                <span className="text-sm font-medium">Back to Dataset</span>
              </Link>

              <h1 className="text-4xl lg:text-5xl font-light display-font mb-4">
                Train Your Model
              </h1>
              <p className="text-xl text-gray-600">
                Configure and deploy your model in minutes with our guided
                workflow
              </p>
            </motion.div>

            {/* Progress Steps */}
            <div className="mb-12">
              <div className="flex items-center justify-between">
                {steps.map((step, index) => (
                  <div key={step.number} className="flex items-center">
                    <motion.div
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ delay: index * 0.1 }}
                      className={`flex items-center justify-center w-12 h-12 rounded-full transition-all ${
                        currentStep >= step.number
                          ? 'bg-indigo-600 text-white'
                          : 'bg-gray-200 text-gray-500'
                      }`}
                    >
                      {currentStep > step.number ? (
                        <Check className="w-5 h-5" />
                      ) : (
                        <step.icon className="w-5 h-5" />
                      )}
                    </motion.div>
                    <div className="ml-3">
                      <p
                        className={`text-sm font-medium ${
                          currentStep >= step.number
                            ? 'text-gray-900'
                            : 'text-gray-500'
                        }`}
                      >
                        Step {step.number}
                      </p>
                      <p
                        className={`text-xs ${
                          currentStep >= step.number
                            ? 'text-gray-600'
                            : 'text-gray-400'
                        }`}
                      >
                        {step.title}
                      </p>
                    </div>
                    {index < steps.length - 1 && (
                      <div
                        className={`w-24 h-0.5 mx-4 transition-all ${
                          currentStep > step.number
                            ? 'bg-indigo-600'
                            : 'bg-gray-200'
                        }`}
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Step Content */}
            <AnimatePresence mode="wait">
              <motion.div
                key={currentStep}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.3 }}
                className="bg-white rounded-2xl border border-gray-100 p-8"
              >
                {/* Step 1: Dataset Preview */}
                {currentStep === 1 && (
                  <div>
                    <h2 className="text-2xl font-semibold text-gray-900 mb-6 display-font">
                      Dataset Preview
                    </h2>

                    {/* Dataset Info */}
                    <div className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-xl p-6 mb-6 border border-indigo-100">
                      <div className="flex items-center justify-between mb-4">
                        <div>
                          <h3 className="text-lg font-semibold text-gray-900 mb-1">
                            {mockDataset.name}
                          </h3>
                          <div className="flex items-center gap-4 text-sm text-gray-600">
                            <span>
                              {mockDataset.rows.toLocaleString()} rows
                            </span>
                            <span>•</span>
                            <span>{mockDataset.size}</span>
                          </div>
                        </div>
                        <Database className="w-8 h-8 text-indigo-600" />
                      </div>
                    </div>

                    {/* Data Preview */}
                    <div className="mb-6">
                      <h4 className="text-sm font-medium text-gray-900 mb-3 flex items-center gap-2">
                        <Eye className="w-4 h-4" />
                        Sample Data
                      </h4>
                      <div className="border border-gray-200 rounded-lg overflow-hidden">
                        <table className="w-full">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="text-left py-3 px-4 text-sm font-medium text-gray-900">
                                ID
                              </th>
                              <th className="text-left py-3 px-4 text-sm font-medium text-gray-900">
                                Headline
                              </th>
                              <th className="text-left py-3 px-4 text-sm font-medium text-gray-900">
                                Sentiment
                              </th>
                              <th className="text-left py-3 px-4 text-sm font-medium text-gray-900">
                                Category
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {mockDataset.preview.map((row, index) => (
                              <tr
                                key={index}
                                className="border-t border-gray-100"
                              >
                                <td className="py-3 px-4 text-sm text-gray-600 font-mono">
                                  {row.article_id}
                                </td>
                                <td className="py-3 px-4 text-sm text-gray-900 max-w-xs truncate">
                                  {row.headline}
                                </td>
                                <td className="py-3 px-4">
                                  <span
                                    className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${
                                      row.sentiment > 0
                                        ? 'bg-green-100 text-green-700'
                                        : 'bg-red-100 text-red-700'
                                    }`}
                                  >
                                    {row.sentiment > 0 ? '+' : ''}
                                    {row.sentiment.toFixed(2)}
                                  </span>
                                </td>
                                <td className="py-3 px-4 text-sm text-gray-600">
                                  {row.category}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    <div className="bg-blue-50 rounded-lg p-4 flex items-start gap-3">
                      <Info className="w-5 h-5 text-blue-600 mt-0.5" />
                      <div className="text-sm text-blue-800">
                        <p className="font-medium mb-1">Ready for training</p>
                        <p>
                          This dataset has been verified and is ready for model
                          training. The data will be automatically preprocessed
                          based on your selected model.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Step 2: Model Selection */}
                {currentStep === 2 && (
                  <div>
                    <h2 className="text-2xl font-semibold text-gray-900 mb-6 display-font">
                      Select Base Model
                    </h2>

                    {/* Model Grid */}
                    <div className="grid md:grid-cols-2 gap-4 mb-8">
                      {baseModels.map((model) => (
                        <motion.div
                          key={model.id}
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          onClick={() => setSelectedModel(model.id)}
                          className={`relative border-2 rounded-xl p-6 cursor-pointer transition-all ${
                            selectedModel === model.id
                              ? 'border-indigo-600 bg-indigo-50'
                              : 'border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          {model.recommended && (
                            <span className="absolute top-3 right-3 px-2 py-1 bg-green-100 text-green-700 text-xs font-medium rounded-full">
                              Recommended
                            </span>
                          )}
                          <Brain className="w-8 h-8 text-indigo-600 mb-3" />
                          <h3 className="text-lg font-semibold text-gray-900 mb-1">
                            {model.name}
                          </h3>
                          <p className="text-sm text-gray-600 mb-2">
                            {model.description}
                          </p>
                          <div className="flex items-center gap-3 text-xs text-gray-500">
                            <span className="font-medium">
                              {model.params} params
                            </span>
                            <span>•</span>
                            <span>{model.category}</span>
                          </div>
                        </motion.div>
                      ))}
                    </div>

                    {/* Training Parameters */}
                    <div className="border-t border-gray-200 pt-6">
                      <h3 className="text-lg font-semibold text-gray-900 mb-4">
                        Training Parameters
                      </h3>
                      <div className="grid md:grid-cols-2 gap-6">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Epochs
                          </label>
                          <input
                            type="number"
                            value={modelParams.epochs}
                            onChange={(e) =>
                              setModelParams({
                                ...modelParams,
                                epochs: parseInt(e.target.value),
                              })
                            }
                            className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-500"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Batch Size
                          </label>
                          <input
                            type="number"
                            value={modelParams.batchSize}
                            onChange={(e) =>
                              setModelParams({
                                ...modelParams,
                                batchSize: parseInt(e.target.value),
                              })
                            }
                            className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-500"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Learning Rate
                          </label>
                          <input
                            type="text"
                            value={modelParams.learningRate}
                            onChange={(e) =>
                              setModelParams({
                                ...modelParams,
                                learningRate: parseFloat(e.target.value),
                              })
                            }
                            className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-500"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Max Sequence Length
                          </label>
                          <input
                            type="number"
                            value={modelParams.maxLength}
                            onChange={(e) =>
                              setModelParams({
                                ...modelParams,
                                maxLength: parseInt(e.target.value),
                              })
                            }
                            className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-500"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Step 3: Deployment Target */}
                {currentStep === 3 && (
                  <div>
                    <h2 className="text-2xl font-semibold text-gray-900 mb-6 display-font">
                      Choose Deployment Target
                    </h2>

                    {/* Deployment Options */}
                    <div className="space-y-4 mb-8">
                      {deploymentTargets.map((target) => (
                        <motion.div
                          key={target.id}
                          whileHover={{ scale: 1.01 }}
                          onClick={() => setSelectedTarget(target.id)}
                          className={`relative border-2 rounded-xl p-6 cursor-pointer transition-all ${
                            selectedTarget === target.id
                              ? 'border-indigo-600 bg-indigo-50'
                              : 'border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          <div className="flex items-start gap-4">
                            <div className="text-3xl">{target.icon}</div>
                            <div className="flex-1">
                              <h3 className="text-lg font-semibold text-gray-900 mb-1">
                                {target.name}
                              </h3>
                              <p className="text-sm text-gray-600">
                                {target.description}
                              </p>
                            </div>
                            <ExternalLink className="w-4 h-4 text-gray-400" />
                          </div>
                        </motion.div>
                      ))}
                    </div>

                    {/* Credentials Form */}
                    {selectedTarget && (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="border-t border-gray-200 pt-6"
                      >
                        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                          <Key className="w-5 h-5" />
                          Authentication
                        </h3>
                        <div className="space-y-4">
                          {selectedTarget === 'huggingface' && (
                            <>
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                  Hugging Face API Key
                                </label>
                                <input
                                  type="password"
                                  placeholder="hf_xxxxxxxxxxxxx"
                                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-500"
                                  onChange={(e) =>
                                    setCredentials({
                                      ...credentials,
                                      api_key: e.target.value,
                                    })
                                  }
                                />
                              </div>
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                  Model Name
                                </label>
                                <input
                                  type="text"
                                  placeholder="my-awesome-model"
                                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-500"
                                  onChange={(e) =>
                                    setCredentials({
                                      ...credentials,
                                      model_name: e.target.value,
                                    })
                                  }
                                />
                              </div>
                            </>
                          )}
                          {selectedTarget === 'vertex-ai' && (
                            <>
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                  Project ID
                                </label>
                                <input
                                  type="text"
                                  placeholder="my-gcp-project"
                                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-500"
                                />
                              </div>
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                  Service Account Key (JSON)
                                </label>
                                <textarea
                                  placeholder="Paste your service account JSON here"
                                  rows={4}
                                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-500 font-mono text-sm"
                                />
                              </div>
                            </>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </div>
                )}

                {/* Step 4: Training Status */}
                {currentStep === 4 && (
                  <div className="text-center py-12">
                    {isTraining ? (
                      <>
                        <motion.div
                          animate={{ rotate: 360 }}
                          transition={{
                            duration: 2,
                            repeat: Infinity,
                            ease: 'linear',
                          }}
                          className="w-16 h-16 border-4 border-indigo-200 border-t-indigo-600 rounded-full mx-auto mb-6"
                        />
                        <h2 className="text-2xl font-semibold text-gray-900 mb-2 display-font">
                          Training in Progress
                        </h2>
                        <p className="text-gray-600 mb-8">
                          Your model is being trained. This may take several
                          minutes...
                        </p>

                        {/* Progress indicators */}
                        <div className="max-w-md mx-auto space-y-4">
                          <div className="bg-gray-50 rounded-lg p-4 text-left">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-sm font-medium text-gray-700">
                                Preprocessing data
                              </span>
                              <Check className="w-4 h-4 text-green-600" />
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-2">
                              <div className="bg-green-600 h-2 rounded-full w-full" />
                            </div>
                          </div>
                          <div className="bg-gray-50 rounded-lg p-4 text-left">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-sm font-medium text-gray-700">
                                Training model
                              </span>
                              <Loader2 className="w-4 h-4 text-indigo-600 animate-spin" />
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-2">
                              <motion.div
                                initial={{ width: '0%' }}
                                animate={{ width: '60%' }}
                                transition={{ duration: 30 }}
                                className="bg-indigo-600 h-2 rounded-full"
                              />
                            </div>
                          </div>
                          <div className="bg-gray-50 rounded-lg p-4 text-left">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-sm font-medium text-gray-700">
                                Deploying to {selectedTarget}
                              </span>
                              <div className="w-4 h-4 rounded-full bg-gray-300" />
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-2" />
                          </div>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
                          <Check className="w-8 h-8 text-green-600" />
                        </div>
                        <h2 className="text-2xl font-semibold text-gray-900 mb-2 display-font">
                          Training Complete!
                        </h2>
                        <p className="text-gray-600 mb-8">
                          Your model has been successfully trained and deployed.
                        </p>
                        <div className="flex justify-center gap-4">
                          <Link
                            href="/models/new-model"
                            className="px-6 py-3 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 transition-colors"
                          >
                            View Model
                          </Link>
                          <Link
                            href="/datasets"
                            className="px-6 py-3 border border-gray-200 rounded-xl font-medium hover:border-gray-300 transition-colors"
                          >
                            Train Another
                          </Link>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </motion.div>
            </AnimatePresence>

            {/* Navigation Buttons */}
            {currentStep < 4 && (
              <div className="flex justify-between mt-8">
                <button
                  onClick={handleBack}
                  disabled={currentStep === 1}
                  className="px-6 py-3 border border-gray-200 rounded-xl font-medium hover:border-gray-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Back
                </button>

                {currentStep === 3 ? (
                  <button
                    onClick={startTraining}
                    disabled={
                      !selectedTarget || Object.keys(credentials).length === 0
                    }
                    className="px-6 py-3 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    <Sparkles className="w-4 h-4" />
                    Start Training
                  </button>
                ) : (
                  <button
                    onClick={handleNext}
                    disabled={
                      (currentStep === 1 && false) ||
                      (currentStep === 2 && !selectedModel)
                    }
                    className="px-6 py-3 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    Next
                    <ArrowRight className="w-4 h-4" />
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </Layout>
    </ProtectedRoute>
  );
}
