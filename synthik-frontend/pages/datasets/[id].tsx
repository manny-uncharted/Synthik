// // import { useRouter } from 'next/router';
import { motion } from 'framer-motion';
import Link from 'next/link';
import {
  ArrowLeft,
  Download,
  Star,
  Copy,
  ExternalLink,
  Database,
  GitBranch,
  Code,
  Shield,
  Clock,
  ChevronRight,
  Lock,
  Unlock,
  ShoppingCart,
  Eye,
  EyeOff,
  Sparkles,
} from 'lucide-react';
import { useState } from 'react';
import Layout from '../../components/Layout';

// Mock dataset details
const mockDataset = {
  id: '1',
  name: 'Financial News Sentiment Dataset',
  description:
    'A comprehensive dataset of financial news articles labeled with sentiment scores, generated using advanced LLMs to create realistic financial reporting scenarios. Perfect for training sentiment analysis models in the finance domain.',
  category: 'Finance / NLP',
  creator: 'alice.eth',
  createdDate: '2024-01-15',
  lastUpdated: '2 days ago',
  size: '2.4 GB',
  rows: 50000,
  tokens: 12500000,
  downloads: 3420,
  views: 8956,
  stars: 156,
  rating: 4.8,
  license: 'MIT',
  // Marketplace fields
  isLocked: true,
  price: 0.5, // ETH
  previewRows: 10,
  purchases: 234,
  // Different CIDs for preview and full dataset
  previewFilecoinCID:
    'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi',
  fullFilecoinCID:
    'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi',
  transactionHash:
    '0x742d35cc6634c0532925a3b844bc9e7595f8e2b1a9e1b3f8a6c5d4e3f2a1b0c9',
  blockNumber: 18976543,
  generationLineage: {
    model: 'GPT-4 Turbo',
    technique: 'Few-shot prompting with domain expertise',
    seedData: 'Reuters Financial News Archive (2020-2023)',
    augmentationSteps: [
      'Initial generation with financial terminology',
      'Sentiment labeling with expert validation',
      'Data augmentation for edge cases',
      'Quality filtering and deduplication',
    ],
  },
  schema: {
    columns: [
      { name: 'article_id', type: 'string', description: 'Unique identifier' },
      { name: 'headline', type: 'string', description: 'Article headline' },
      { name: 'content', type: 'text', description: 'Full article text' },
      {
        name: 'sentiment',
        type: 'float',
        description: 'Sentiment score (-1 to 1)',
      },
      { name: 'category', type: 'string', description: 'Financial category' },
      { name: 'timestamp', type: 'datetime', description: 'Publication date' },
    ],
  },
  preview: [
    {
      article_id: 'fin_001',
      headline: 'Tech Stocks Rally as AI Innovation Drives Market Optimism',
      content:
        'Major technology companies saw significant gains today as investors...',
      sentiment: 0.82,
      category: 'Technology',
      timestamp: '2024-01-14T09:30:00Z',
    },
    {
      article_id: 'fin_002',
      headline:
        'Federal Reserve Signals Potential Rate Cut Amid Economic Slowdown',
      content:
        'The Federal Reserve hinted at a possible interest rate reduction...',
      sentiment: -0.45,
      category: 'Monetary Policy',
      timestamp: '2024-01-14T14:15:00Z',
    },
    {
      article_id: 'fin_003',
      headline: 'Renewable Energy Sector Posts Record Quarterly Growth',
      content:
        'Clean energy companies reported exceptional performance this quarter...',
      sentiment: 0.91,
      category: 'Energy',
      timestamp: '2024-01-14T16:45:00Z',
    },
  ],
  useCases: [
    {
      title: 'Financial Sentiment Analysis',
      description:
        'Train models to analyze market sentiment from news articles and predict stock movements.',
      icon: '📈',
    },
    {
      title: 'Risk Assessment Tools',
      description:
        'Build systems that evaluate market risk based on news sentiment and content analysis.',
      icon: '⚡',
    },
    {
      title: 'Automated Trading Signals',
      description:
        'Create algorithms that generate trading signals based on real-time news sentiment.',
      icon: '🤖',
    },
    {
      title: 'Market Research Analytics',
      description:
        'Develop tools for comprehensive market analysis and trend identification.',
      icon: '🔍',
    },
  ],
  tags: ['finance', 'nlp', 'sentiment-analysis', 'news', 'synthetic-data'],
};

export default function DatasetDetails() {
  //   const router = useRouter();
  // const { id } = router.query; // Will be used when fetching real data
  const [copiedCID, setCopiedCID] = useState(false);
  const [activeTab, setActiveTab] = useState<'preview' | 'schema' | 'lineage'>(
    'preview'
  );
  // For demo purposes, toggle this to see unlocked state
  const [isUnlocked, setIsUnlocked] = useState(false);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCID(true);
    setTimeout(() => setCopiedCID(false), 2000);
  };

  const handlePurchase = () => {
    // Mock purchase flow
    setIsUnlocked(true);
  };

  return (
    <Layout>
      {/* Background pattern */}
      <div className="fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-gray-50" />
        <div className="absolute inset-0 grid-pattern opacity-[0.02]" />
        <div className="absolute top-0 left-0 w-full h-96 mesh-gradient" />
      </div>

      <div className="pt-28 pb-20 px-8 lg:px-16">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-7xl mx-auto"
        >
          {/* Back button */}
          <Link
            href="/datasets"
            className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-8 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="text-sm font-medium">Back to Datasets</span>
          </Link>

          {/* Header Section */}
          <div className="grid lg:grid-cols-3 gap-8 mb-12">
            <div className="lg:col-span-2">
              <div className="flex items-start justify-between mb-6">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-4">
                    <h1 className="text-4xl lg:text-5xl font-light display-font">
                      {mockDataset.name}
                    </h1>
                    {mockDataset.isLocked && !isUnlocked && (
                      <div className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-orange-50 to-red-50 text-orange-700 rounded-full text-sm font-medium border border-orange-200">
                        <Lock className="w-4 h-4" />
                        Locked
                      </div>
                    )}
                    {isUnlocked && (
                      <div className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-green-50 to-emerald-50 text-green-700 rounded-full text-sm font-medium border border-green-200">
                        <Unlock className="w-4 h-4" />
                        Unlocked
                      </div>
                    )}
                  </div>
                  <p className="text-lg text-gray-600 leading-relaxed">
                    {mockDataset.description}
                  </p>
                </div>
              </div>

              {/* Tags */}
              <div className="flex flex-wrap gap-2 mb-6">
                {mockDataset.tags.map((tag) => (
                  <span
                    key={tag}
                    className="px-3 py-1.5 bg-gradient-to-r from-indigo-50 to-purple-50 text-indigo-700 rounded-lg text-sm font-medium border border-indigo-100"
                  >
                    {tag}
                  </span>
                ))}
              </div>

              {/* Action buttons */}
              <div className="flex flex-wrap gap-4">
                {mockDataset.isLocked && !isUnlocked ? (
                  <>
                    <button
                      onClick={handlePurchase}
                      className="px-6 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl font-medium hover:from-indigo-700 hover:to-purple-700 transition-all flex items-center gap-2 shadow-lg shadow-indigo-200"
                    >
                      <ShoppingCart className="w-5 h-5" />
                      Purchase Dataset ({mockDataset.price} ETH)
                    </button>
                    <button className="px-6 py-3 bg-white border border-gray-200 rounded-xl font-medium hover:border-gray-300 transition-colors flex items-center gap-2">
                      <Eye className="w-5 h-5" />
                      Preview Available
                    </button>
                  </>
                ) : (
                  <>
                    <button className="px-6 py-3 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 transition-colors flex items-center gap-2">
                      <Download className="w-5 h-5" />
                      Download Dataset
                    </button>
                    <button className="px-6 py-3 bg-white border border-gray-200 rounded-xl font-medium hover:border-gray-300 transition-colors flex items-center gap-2">
                      <Star className="w-5 h-5" />
                      Star
                    </button>
                    <Link
                      href={`/train-model?dataset=1`}
                      className="px-6 py-3 bg-white border border-gray-200 rounded-xl font-medium hover:border-gray-300 transition-colors flex items-center gap-2 inline-flex"
                    >
                      <Code className="w-5 h-5" />
                      Initiate Model Training
                    </Link>
                  </>
                )}
              </div>
            </div>

            {/* Stats Card */}
            <div className="bg-white rounded-2xl border border-gray-100 p-6 h-fit">
              <h3 className="text-sm font-medium text-gray-900 mb-4">
                Dataset Statistics
              </h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Size</span>
                  <span className="text-sm font-semibold text-gray-900">
                    {mockDataset.size}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Rows</span>
                  <span className="text-sm font-semibold text-gray-900">
                    {mockDataset.rows.toLocaleString()}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Tokens</span>
                  <span className="text-sm font-semibold text-gray-900">
                    {(mockDataset.tokens / 1000000).toFixed(1)}M
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Downloads</span>
                  <span className="text-sm font-semibold text-gray-900">
                    {mockDataset.downloads.toLocaleString()}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Purchases</span>
                  <span className="text-sm font-semibold text-gray-900">
                    {mockDataset.purchases}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Rating</span>
                  <div className="flex items-center gap-1">
                    <Star className="w-4 h-4 text-yellow-500 fill-current" />
                    <span className="text-sm font-semibold text-gray-900">
                      {mockDataset.rating}
                    </span>
                  </div>
                </div>
                <div className="pt-4 border-t border-gray-100">
                  {mockDataset.isLocked && !isUnlocked && (
                    <div className="mb-4 p-3 bg-gradient-to-r from-indigo-50 to-purple-50 rounded-lg border border-indigo-100">
                      <div className="flex items-center gap-2 text-sm font-medium text-indigo-700 mb-1">
                        <Sparkles className="w-4 h-4" />
                        Premium Dataset
                      </div>
                      <p className="text-xs text-indigo-600">
                        {mockDataset.price} ETH to unlock full access
                      </p>
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-sm text-gray-600 mb-2">
                    <Clock className="w-4 h-4" />
                    Updated {mockDataset.lastUpdated}
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Shield className="w-4 h-4 text-green-600" />
                    <span className="text-green-700 font-medium">
                      Verified on-chain
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Filecoin CID Section */}
          {mockDataset.isLocked && !isUnlocked ? (
            // Preview CID for locked datasets
            <div className="bg-gradient-to-r from-gray-50 to-gray-100 rounded-2xl p-6 mb-12 border border-gray-200">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center border border-gray-200">
                    <EyeOff className="w-6 h-6 text-gray-500" />
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-gray-900 mb-1">
                      Preview Data Only
                    </h3>
                    <div className="flex items-center gap-2">
                      <code className="text-sm font-mono text-gray-600">
                        {mockDataset.previewFilecoinCID.slice(0, 20)}...
                      </code>
                      <span className="text-xs text-gray-500">
                        (First {mockDataset.previewRows} rows)
                      </span>
                    </div>
                  </div>
                </div>
                <div className="text-sm text-gray-500">
                  Full dataset available after purchase
                </div>
              </div>
            </div>
          ) : (
            // Full CID for unlocked datasets
            <div className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-2xl p-6 mb-12 border border-indigo-100">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center">
                    <Database className="w-6 h-6 text-indigo-600" />
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-gray-900 mb-1">
                      Filecoin Storage - Full Dataset
                    </h3>
                    <div className="flex items-center gap-2">
                      <code className="text-sm font-mono text-gray-700">
                        {mockDataset.fullFilecoinCID}
                      </code>
                      <button
                        onClick={() =>
                          copyToClipboard(mockDataset.fullFilecoinCID)
                        }
                        className="p-1.5 hover:bg-white rounded-lg transition-colors"
                      >
                        {copiedCID ? (
                          <span className="text-xs text-green-600 font-medium">
                            Copied!
                          </span>
                        ) : (
                          <Copy className="w-4 h-4 text-gray-600" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>
                <Link
                  href={`https://filfox.info/en/message/${mockDataset.fullFilecoinCID}`}
                  target="_blank"
                  className="flex items-center gap-2 px-4 py-2 bg-white rounded-lg text-sm font-medium text-indigo-600 hover:bg-indigo-50 transition-colors"
                >
                  View on Filfox
                  <ExternalLink className="w-4 h-4" />
                </Link>
              </div>
            </div>
          )}

          {/* Tabs Section */}
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden mb-12">
            <div className="border-b border-gray-100">
              <div className="flex">
                <button
                  onClick={() => setActiveTab('preview')}
                  className={`px-6 py-4 text-sm font-medium transition-colors relative ${
                    activeTab === 'preview'
                      ? 'text-indigo-600'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  {mockDataset.isLocked && !isUnlocked
                    ? 'Data Preview'
                    : 'Data View'}
                  {activeTab === 'preview' && (
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600" />
                  )}
                </button>
                <button
                  onClick={() => setActiveTab('schema')}
                  className={`px-6 py-4 text-sm font-medium transition-colors relative ${
                    activeTab === 'schema'
                      ? 'text-indigo-600'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Schema
                  {activeTab === 'schema' && (
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600" />
                  )}
                </button>
                <button
                  onClick={() => setActiveTab('lineage')}
                  className={`px-6 py-4 text-sm font-medium transition-colors relative ${
                    activeTab === 'lineage'
                      ? 'text-indigo-600'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Generation Lineage
                  {activeTab === 'lineage' && (
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600" />
                  )}
                </button>
              </div>
            </div>

            <div className="p-6">
              {/* Preview Tab */}
              {activeTab === 'preview' && (
                <div>
                  {mockDataset.isLocked && !isUnlocked && (
                    <div className="mb-6 p-4 bg-gradient-to-r from-amber-50 to-orange-50 rounded-lg border border-amber-200">
                      <div className="flex items-center gap-3">
                        <Eye className="w-5 h-5 text-amber-600" />
                        <div>
                          <p className="text-sm font-medium text-amber-900">
                            Preview Mode - Showing first{' '}
                            {mockDataset.previewRows} rows
                          </p>
                          <p className="text-xs text-amber-700 mt-0.5">
                            Purchase to access all{' '}
                            {mockDataset.rows.toLocaleString()} rows
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-gray-200">
                          <th className="text-left py-3 px-4 text-sm font-medium text-gray-900">
                            Article ID
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
                            className="border-b border-gray-100 hover:bg-gray-50"
                          >
                            <td className="py-3 px-4 text-sm text-gray-600 font-mono">
                              {row.article_id}
                            </td>
                            <td className="py-3 px-4 text-sm text-gray-900 max-w-md truncate">
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

                    {mockDataset.isLocked && !isUnlocked && (
                      <div className="mt-6 text-center py-8 border-t border-gray-100">
                        <Lock className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                        <p className="text-gray-500 mb-4">
                          {(
                            mockDataset.rows - mockDataset.previewRows
                          ).toLocaleString()}{' '}
                          more rows available
                        </p>
                        <button
                          onClick={handlePurchase}
                          className="px-6 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-lg font-medium hover:from-indigo-700 hover:to-purple-700 transition-all"
                        >
                          Unlock Full Dataset
                        </button>
                      </div>
                    )}

                    {(!mockDataset.isLocked || isUnlocked) && (
                      <div className="mt-4 text-center">
                        <p className="text-sm text-gray-500">
                          Showing sample of {mockDataset.rows.toLocaleString()}{' '}
                          total rows
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Schema Tab */}
              {activeTab === 'schema' && (
                <div className="space-y-4">
                  {mockDataset.schema.columns.map((column, index) => (
                    <div
                      key={index}
                      className="flex items-start gap-4 p-4 bg-gray-50 rounded-lg"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-mono text-sm font-medium text-gray-900">
                            {column.name}
                          </span>
                          <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded text-xs font-medium">
                            {column.type}
                          </span>
                        </div>
                        <p className="text-sm text-gray-600">
                          {column.description}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Lineage Tab */}
              {activeTab === 'lineage' && (
                <div className="space-y-6">
                  <div className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-xl p-6 border border-indigo-100">
                    <div className="flex items-center gap-3 mb-4">
                      <GitBranch className="w-5 h-5 text-indigo-600" />
                      <h4 className="text-lg font-semibold text-gray-900">
                        Generation Details
                      </h4>
                    </div>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-600">
                          Model Used
                        </span>
                        <span className="text-sm font-medium text-gray-900">
                          {mockDataset.generationLineage.model}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-600">Technique</span>
                        <span className="text-sm font-medium text-gray-900">
                          {mockDataset.generationLineage.technique}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-600">Seed Data</span>
                        <span className="text-sm font-medium text-gray-900">
                          {mockDataset.generationLineage.seedData}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h4 className="text-sm font-medium text-gray-900 mb-3">
                      Augmentation Pipeline
                    </h4>
                    <div className="space-y-2">
                      {mockDataset.generationLineage.augmentationSteps.map(
                        (step, index) => (
                          <div key={index} className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center text-sm font-medium text-indigo-700">
                              {index + 1}
                            </div>
                            <span className="text-sm text-gray-700">
                              {step}
                            </span>
                          </div>
                        )
                      )}
                    </div>
                  </div>

                  <div className="border-t border-gray-200 pt-6">
                    <h4 className="text-sm font-medium text-gray-900 mb-3">
                      Blockchain Verification
                    </h4>
                    <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-600">
                          Transaction Hash
                        </span>
                        <Link
                          href={`https://etherscan.io/tx/${mockDataset.transactionHash}`}
                          target="_blank"
                          className="flex items-center gap-1 text-sm font-mono text-indigo-600 hover:text-indigo-700"
                        >
                          {mockDataset.transactionHash.slice(0, 10)}...
                          {mockDataset.transactionHash.slice(-8)}
                          <ExternalLink className="w-3 h-3" />
                        </Link>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-600">
                          Block Number
                        </span>
                        <span className="text-sm font-mono text-gray-900">
                          {mockDataset.blockNumber.toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Use Cases Section */}
          <div className="mb-12">
            <h2 className="text-2xl font-semibold text-gray-900 mb-6 display-font">
              Example Use Cases
            </h2>
            <div className="grid md:grid-cols-2 gap-6">
              {mockDataset.useCases.map((useCase, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1 }}
                  className="bg-white rounded-xl border border-gray-100 p-6 hover:shadow-lg hover:border-indigo-200 transition-all group"
                >
                  <div className="flex items-start gap-4">
                    <div className="text-3xl">{useCase.icon}</div>
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-gray-900 mb-2 group-hover:text-indigo-600 transition-colors">
                        {useCase.title}
                      </h3>
                      <p className="text-sm text-gray-600 leading-relaxed">
                        {useCase.description}
                      </p>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>

          {/* Related Datasets */}
          <div className="bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50 rounded-2xl p-8">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-semibold text-gray-900 display-font">
                Related Datasets
              </h2>
              <Link
                href="/datasets"
                className="flex items-center gap-2 text-sm font-medium text-indigo-600 hover:text-indigo-700"
              >
                View all
                <ChevronRight className="w-4 h-4" />
              </Link>
            </div>
            <div className="grid md:grid-cols-3 gap-4">
              {/* Placeholder for related datasets */}
              <div className="bg-white rounded-lg p-4 border border-gray-100">
                <h4 className="font-medium text-gray-900 mb-1">
                  Stock Market Predictions
                </h4>
                <p className="text-sm text-gray-600 mb-2">
                  Historical stock data with predictions
                </p>
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <Database className="w-3 h-3" />
                  <span>100K rows</span>
                  <span>•</span>
                  <Star className="w-3 h-3" />
                  <span>4.7</span>
                </div>
              </div>
              <div className="bg-white rounded-lg p-4 border border-gray-100">
                <h4 className="font-medium text-gray-900 mb-1">
                  Crypto Market Sentiment
                </h4>
                <p className="text-sm text-gray-600 mb-2">
                  Social media sentiment for crypto
                </p>
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <Database className="w-3 h-3" />
                  <span>250K rows</span>
                  <span>•</span>
                  <Star className="w-3 h-3" />
                  <span>4.9</span>
                </div>
              </div>
              <div className="bg-white rounded-lg p-4 border border-gray-100">
                <h4 className="font-medium text-gray-900 mb-1">
                  Economic Indicators
                </h4>
                <p className="text-sm text-gray-600 mb-2">
                  Global economic indicators dataset
                </p>
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <Database className="w-3 h-3" />
                  <span>50K rows</span>
                  <span>•</span>
                  <Star className="w-3 h-3" />
                  <span>4.6</span>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </Layout>
  );
}
