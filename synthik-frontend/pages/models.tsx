import { useState } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import {
  Search,
  Sparkles,
  LayoutGrid,
  List,
  Filter,
  TrendingUp,
  Clock,
  Award,
} from 'lucide-react';
import ModelCard from '../components/ModelCard';
import Layout from '../components/Layout';

// Mock data for models
const mockModels = [
  {
    id: '1',
    name: 'FinBERT-Synthik',
    description:
      'Fine-tuned BERT model for financial sentiment analysis using synthetic financial news data',
    provider: 'Hugging Face',
    baseModel: 'BERT-base',
    datasetUsed: 'financial-news-10k',
    datasetRows: 10000,
    trainedBy: 'alice.eth',
    trainedDate: '2 days ago',
    accuracy: 94.2,
    downloads: 1250,
    stars: 89,
    tags: ['nlp', 'finance', 'sentiment-analysis', 'bert'],
    filecoinCID: 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi',
    status: 'ready' as const,
    metrics: {
      f1Score: 0.93,
      precision: 0.95,
      recall: 0.91,
    },
  },
  {
    id: '2',
    name: 'MedicalQA-GPT',
    description:
      'Medical question-answering model trained on synthetic patient consultation data',
    provider: 'OpenAI',
    baseModel: 'GPT-3.5',
    datasetUsed: 'medical-qa-50k',
    datasetRows: 50000,
    trainedBy: 'drsmith.eth',
    trainedDate: '1 week ago',
    accuracy: 89.7,
    downloads: 3420,
    stars: 156,
    tags: ['healthcare', 'qa', 'gpt', 'medical'],
    filecoinCID: 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi',
    status: 'ready' as const,
    metrics: {
      f1Score: 0.88,
      precision: 0.9,
      recall: 0.86,
    },
  },
  {
    id: '3',
    name: 'RetailRecommender-v2',
    description:
      'E-commerce recommendation model using synthetic customer behavior data',
    provider: 'Custom',
    baseModel: 'Transformer',
    datasetUsed: 'ecommerce-behavior-100k',
    datasetRows: 100000,
    trainedBy: 'retailai.eth',
    trainedDate: '3 days ago',
    accuracy: 91.3,
    downloads: 892,
    stars: 67,
    tags: ['recommendation', 'retail', 'e-commerce', 'transformer'],
    filecoinCID: 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi',
    status: 'training' as const,
    metrics: {
      f1Score: 0.9,
      precision: 0.92,
      recall: 0.88,
    },
  },
  {
    id: '4',
    name: 'CodeGen-Synthik',
    description:
      'Code generation model trained on synthetic programming exercises',
    provider: 'Anthropic',
    baseModel: 'Claude-2',
    datasetUsed: 'code-exercises-25k',
    datasetRows: 25000,
    trainedBy: 'devteam.eth',
    trainedDate: '2 weeks ago',
    accuracy: 87.5,
    downloads: 5670,
    stars: 234,
    tags: ['code-generation', 'programming', 'claude', 'development'],
    filecoinCID: 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi',
    status: 'ready' as const,
    metrics: {
      f1Score: 0.86,
      precision: 0.88,
      recall: 0.84,
    },
  },
  {
    id: '5',
    name: 'FraudDetector-XGB',
    description:
      'XGBoost model for fraud detection using synthetic transaction data',
    provider: 'Custom',
    baseModel: 'XGBoost',
    datasetUsed: 'fraud-transactions-200k',
    datasetRows: 200000,
    trainedBy: 'security.eth',
    trainedDate: '5 days ago',
    accuracy: 96.8,
    downloads: 2340,
    stars: 189,
    tags: ['fraud-detection', 'xgboost', 'finance', 'security'],
    filecoinCID: 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi',
    status: 'ready' as const,
    metrics: {
      f1Score: 0.96,
      precision: 0.97,
      recall: 0.95,
    },
  },
  {
    id: '6',
    name: 'ImageClassifier-Synthik',
    description:
      'Vision model trained on synthetic product images for quality control',
    provider: 'Google',
    baseModel: 'EfficientNet',
    datasetUsed: 'product-images-50k',
    datasetRows: 50000,
    trainedBy: 'vision.eth',
    trainedDate: '1 month ago',
    accuracy: 93.1,
    downloads: 1560,
    stars: 98,
    tags: [
      'computer-vision',
      'classification',
      'quality-control',
      'efficientnet',
    ],
    filecoinCID: 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi',
    status: 'deprecated' as const,
    metrics: {
      f1Score: 0.92,
      precision: 0.94,
      recall: 0.9,
    },
  },
];

const categories = [
  { id: 'all', label: 'All Models', icon: LayoutGrid },
  { id: 'nlp', label: 'NLP', icon: null },
  { id: 'vision', label: 'Computer Vision', icon: null },
  { id: 'finance', label: 'Finance', icon: null },
  { id: 'healthcare', label: 'Healthcare', icon: null },
];

const sortOptions = [
  { value: 'popular', label: 'Most Popular', icon: TrendingUp },
  { value: 'recent', label: 'Recently Trained', icon: Clock },
  { value: 'accuracy', label: 'Highest Accuracy', icon: Award },
  { value: 'downloads', label: 'Most Downloads', icon: null },
];

export default function Models() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [sortBy, setSortBy] = useState('popular');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [showFilters, setShowFilters] = useState(false);

  return (
    <Layout>
      {/* Background pattern */}
      <div className="fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-gray-50" />
        <div className="absolute inset-0 grid-pattern opacity-[0.02]" />
        <div className="absolute top-0 left-0 w-full h-96 mesh-gradient" />
      </div>

      {/* Hero Section - Simplified and elegant */}
      <div className="pt-32 pb-16 px-8 lg:px-16">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-7xl mx-auto"
        >
          {/* Compact hero */}
          <div className="max-w-3xl mb-12">
            <h1 className="text-5xl lg:text-6xl font-light display-font mb-6">
              <span className="text-gray-900">Explore</span>{' '}
              <span className="relative">
                <span className="relative z-10 font-medium bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
                  AI Models
                </span>
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: '100%' }}
                  transition={{ delay: 0.5, duration: 0.8 }}
                  className="absolute bottom-2 left-0 h-3 bg-indigo-100 -z-10"
                />
              </span>
            </h1>
            <p className="text-xl text-gray-600 leading-relaxed">
              Discover and use models trained on Synthik datasets. Every
              model is verified on-chain with complete training lineage.
            </p>
          </div>

          {/* Search and Filters - Cleaner design */}
          <div className="space-y-4">
            {/* Search Bar */}
            <div className="flex gap-4">
              <div className="flex-1 relative group">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 group-focus-within:text-indigo-600 transition-colors" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search models, tags, or creators..."
                  className="w-full pl-12 pr-4 py-3.5 bg-white border border-gray-200 rounded-xl focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50 transition-all text-gray-900 placeholder-gray-500"
                />
              </div>

              {/* Filter Toggle */}
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={`px-5 py-3.5 bg-white border rounded-xl font-medium transition-all flex items-center gap-2 ${
                  showFilters
                    ? 'border-indigo-500 text-indigo-600 ring-4 ring-indigo-50'
                    : 'border-gray-200 text-gray-700 hover:border-gray-300'
                }`}
              >
                <Filter className="w-4 h-4" />
                Filters
              </button>
            </div>

            {/* Filter Options - Collapsible */}
            <motion.div
              initial={false}
              animate={{ height: showFilters ? 'auto' : 0 }}
              className="overflow-hidden"
            >
              <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-6">
                {/* Categories */}
                <div>
                  <label className="text-sm font-medium text-gray-900 mb-3 block">
                    Category
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {categories.map((category) => (
                      <button
                        key={category.id}
                        onClick={() => setSelectedCategory(category.id)}
                        className={`px-4 py-2 rounded-lg font-medium transition-all ${
                          selectedCategory === category.id
                            ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200'
                            : 'bg-gray-50 text-gray-700 hover:bg-gray-100 border border-gray-200'
                        }`}
                      >
                        {category.icon && (
                          <category.icon className="w-4 h-4 mr-2 inline" />
                        )}
                        {category.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Sort and View */}
                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-sm font-medium text-gray-900 mb-2 block">
                      Sort by
                    </label>
                    <select
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value)}
                      className="px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50 text-gray-700"
                    >
                      {sortOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-sm font-medium text-gray-900 mb-2 block">
                      View
                    </label>
                    <div className="flex items-center bg-gray-100 rounded-lg p-1">
                      <button
                        onClick={() => setViewMode('grid')}
                        className={`p-2 rounded-md transition-all ${
                          viewMode === 'grid'
                            ? 'bg-white shadow-sm text-indigo-600'
                            : 'text-gray-600 hover:text-gray-900'
                        }`}
                      >
                        <LayoutGrid className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setViewMode('list')}
                        className={`p-2 rounded-md transition-all ${
                          viewMode === 'list'
                            ? 'bg-white shadow-sm text-indigo-600'
                            : 'text-gray-600 hover:text-gray-900'
                        }`}
                      >
                        <List className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>

          {/* Results count */}
          <div className="mt-8 mb-6 flex items-center justify-between">
            <p className="text-gray-600">
              Showing{' '}
              <span className="font-medium text-gray-900">
                {mockModels.length}
              </span>{' '}
              models
            </p>
            {selectedCategory !== 'all' && (
              <button
                onClick={() => setSelectedCategory('all')}
                className="text-sm text-indigo-600 hover:text-indigo-700 font-medium"
              >
                Clear filters
              </button>
            )}
          </div>

          {/* Model Grid - Enhanced layout */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className={`grid ${
              viewMode === 'grid'
                ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'
                : 'grid-cols-1'
            } gap-6`}
          >
            {mockModels.map((model, index) => (
              <motion.div
                key={model.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
              >
                <ModelCard model={model} />
              </motion.div>
            ))}
          </motion.div>

          {/* CTA Section - More elegant */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="mt-24 relative overflow-hidden"
          >
            <div className="relative z-10 bg-gradient-to-br from-indigo-600 via-indigo-700 to-purple-700 rounded-3xl p-12 text-white">
              <div className="absolute inset-0 bg-black/10 rounded-3xl" />
              <div className="relative z-20 max-w-3xl mx-auto text-center">
                <Sparkles className="w-12 h-12 mx-auto mb-6 text-indigo-200" />
                <h2 className="text-3xl lg:text-4xl font-light display-font mb-4">
                  Ready to train your own model?
                </h2>
                <p className="text-lg mb-8 text-indigo-100 max-w-2xl mx-auto leading-relaxed">
                  Use any Synthik dataset to train state-of-the-art models with
                  one-click deployment to your favorite ML platforms.
                </p>
                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                  <Link
                    href="/create-dataset"
                    className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-white text-indigo-700 rounded-xl font-medium hover:bg-indigo-50 transition-all shadow-lg shadow-indigo-900/20"
                  >
                    <Sparkles className="w-5 h-5" />
                    Start with a Dataset
                  </Link>
                  <Link
                    href="/docs"
                    className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-white/10 backdrop-blur text-white rounded-xl font-medium hover:bg-white/20 transition-all border border-white/20"
                  >
                    View Documentation
                  </Link>
                </div>
              </div>

              {/* Decorative elements */}
              <div className="absolute -top-24 -right-24 w-96 h-96 bg-purple-500 rounded-full opacity-20 blur-3xl" />
              <div className="absolute -bottom-24 -left-24 w-96 h-96 bg-indigo-500 rounded-full opacity-20 blur-3xl" />
            </div>
          </motion.div>
        </motion.div>
      </div>
    </Layout>
  );
}
