import { motion } from 'framer-motion';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Search,
  Filter,
  Sparkles,
  FileCode,
  TrendingUp,
  Clock,
  Download,
  Grid,
  List,
  ChevronDown,
} from 'lucide-react';
import { DatasetCard } from '../components/dataset';
import Layout from '../components/Layout';

export default function Datasets() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [sortBy, setSortBy] = useState('trending');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  // Log origin for debugging Privy authorization
  useEffect(() => {
    console.log('Origin:', window.location.origin);
  }, []);

  // Mock data - replace with real data from API
  const datasets = [
    {
      id: 1,
      title: 'Medical Diagnosis Records',
      description:
        'Synthetic patient records with symptoms, diagnoses, and treatment plans. HIPAA-compliant and ready for ML training.',
      category: 'Healthcare',
      size: '2.3 GB',
      downloads: 15234,
      views: 45678,
      rating: 4.8,
      lastUpdated: '2 days ago',
      isVerified: true,
      isLocked: true,
      price: 150,
      creator: 'drsmith.eth',
    },
    {
      id: 2,
      title: 'Financial Transaction Data',
      description:
        'Realistic banking transactions with fraud patterns for anomaly detection models. Includes edge cases.',
      category: 'Finance',
      size: '850 MB',
      downloads: 8921,
      views: 23456,
      rating: 4.6,
      lastUpdated: '1 week ago',
      isVerified: true,
      isLocked: true,
      price: 75,
      creator: 'alice.eth',
    },
    {
      id: 3,
      title: 'E-commerce Customer Behavior',
      description:
        'User interaction data including browsing patterns, purchases, and cart abandonment scenarios.',
      category: 'Retail',
      size: '1.2 GB',
      downloads: 12456,
      views: 34567,
      rating: 4.9,
      lastUpdated: '3 days ago',
      isVerified: true,
      isLocked: false,
      price: 0,
      creator: 'retailai.eth',
    },
    {
      id: 4,
      title: 'Autonomous Vehicle Sensors',
      description:
        'Multi-modal sensor data for self-driving car scenarios including edge cases and weather conditions.',
      category: 'Automotive',
      size: '5.7 GB',
      downloads: 6789,
      views: 19234,
      rating: 4.7,
      lastUpdated: '5 days ago',
      isVerified: true,
      isLocked: true,
      price: 300,
      creator: 'automl.eth',
    },
    {
      id: 5,
      title: 'Natural Language Conversations',
      description:
        'Multi-turn dialogue datasets in 15 languages for chatbot and virtual assistant training.',
      category: 'NLP',
      size: '980 MB',
      downloads: 23456,
      views: 56789,
      rating: 4.9,
      lastUpdated: '1 day ago',
      isVerified: true,
      isLocked: true,
      price: 50,
      creator: 'nlpmaster.eth',
    },
    {
      id: 6,
      title: 'Supply Chain Logistics',
      description:
        'End-to-end supply chain data including inventory, shipping routes, and demand forecasting.',
      category: 'Logistics',
      size: '3.2 GB',
      downloads: 4567,
      views: 12345,
      rating: 4.5,
      lastUpdated: '1 week ago',
      isVerified: true,
      isLocked: true,
      price: 125,
      creator: 'logistics.eth',
    },
  ];

  const categories = [
    { value: 'all', label: 'All Categories' },
    { value: 'healthcare', label: 'Healthcare' },
    { value: 'finance', label: 'Finance' },
    { value: 'retail', label: 'Retail' },
    { value: 'automotive', label: 'Automotive' },
    { value: 'nlp', label: 'NLP' },
    { value: 'logistics', label: 'Logistics' },
  ];

  const sortOptions = [
    {
      value: 'trending',
      label: 'Trending',
      icon: <TrendingUp className="w-4 h-4" />,
    },
    {
      value: 'recent',
      label: 'Most Recent',
      icon: <Clock className="w-4 h-4" />,
    },
    {
      value: 'downloads',
      label: 'Most Downloads',
      icon: <Download className="w-4 h-4" />,
    },
  ];

  return (
    <Layout>
      <div className="bg-background noise-texture">
        {/* Background gradient */}
        <div className="fixed inset-0 mesh-gradient pointer-events-none opacity-30" />

        {/* Header Section */}
        <section className="pt-32 pb-12 px-8 lg:px-16 relative">
          {/* Background decoration */}
          <div className="absolute top-20 right-0 w-96 h-96 bg-gradient-to-br from-indigo-100/30 to-purple-100/30 rounded-full blur-3xl -z-10" />
          <div className="absolute bottom-0 left-0 w-64 h-64 bg-gradient-to-br from-purple-100/30 to-pink-100/30 rounded-full blur-3xl -z-10" />

          <div className="max-w-7xl mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              <div className="flex items-center gap-3 mb-6">
                <div className="w-2 h-8 bg-gradient-to-b from-indigo-600 to-purple-600 rounded-full" />
                <h1 className="text-4xl lg:text-5xl font-light display-font">
                  Explore{' '}
                  <span className="highlight-text">verified datasets</span>
                </h1>
              </div>
              <p className="text-xl text-gray-600 mb-8 max-w-3xl">
                Browse thousands of blockchain-verified synthetic datasets ready
                for training. Each dataset includes complete lineage tracking on
                Filecoin.
              </p>

              {/* Search and Filters */}
              <div className="flex flex-col lg:flex-row gap-4 mb-8">
                <div className="flex-1 relative">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search datasets..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-12 pr-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:border-indigo-500 transition-colors"
                  />
                </div>

                <div className="flex gap-2">
                  <div className="relative">
                    <select
                      value={selectedCategory}
                      onChange={(e) => setSelectedCategory(e.target.value)}
                      className="appearance-none px-4 py-3 pr-10 border border-gray-200 rounded-xl focus:outline-none focus:border-indigo-500 transition-colors bg-white"
                    >
                      {categories.map((cat) => (
                        <option key={cat.value} value={cat.value}>
                          {cat.label}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                  </div>

                  <div className="relative">
                    <select
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value)}
                      className="appearance-none px-4 py-3 pr-10 border border-gray-200 rounded-xl focus:outline-none focus:border-indigo-500 transition-colors bg-white"
                    >
                      {sortOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                  </div>

                  <div className="flex border border-gray-200 rounded-xl overflow-hidden">
                    <button
                      onClick={() => setViewMode('grid')}
                      className={`p-3 transition-colors ${
                        viewMode === 'grid'
                          ? 'bg-indigo-50 text-indigo-600'
                          : 'text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      <Grid className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setViewMode('list')}
                      className={`p-3 transition-colors ${
                        viewMode === 'list'
                          ? 'bg-indigo-50 text-indigo-600'
                          : 'text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      <List className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </section>

        {/* Create Dataset Section */}
        <section className="px-8 lg:px-16 pb-12">
          <div className="max-w-7xl mx-auto">
            <motion.div
              className="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-2xl p-8 mb-12 relative overflow-hidden"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
            >
              {/* Background pattern */}
              <div className="absolute inset-0 opacity-10">
                <div className="absolute top-0 left-0 w-40 h-40 bg-white rounded-full -translate-x-20 -translate-y-20" />
                <div className="absolute bottom-0 right-0 w-60 h-60 bg-white rounded-full translate-x-20 translate-y-20" />
              </div>

              <div className="relative z-10 flex flex-col lg:flex-row items-center justify-between gap-6">
                <div>
                  <h2 className="text-2xl font-semibold text-white mb-2">
                    Ready to create your first dataset?
                  </h2>
                  <p className="text-white/80">
                    Generate high-quality synthetic data with blockchain
                    verification
                  </p>
                </div>
                <div className="flex gap-4">
                  <Link
                    href="/create-dataset"
                    className="px-6 py-3 bg-white text-indigo-600 rounded-lg font-medium hover:bg-gray-100 transition-colors flex items-center gap-2"
                  >
                    <FileCode className="w-5 h-5" />
                    Use Templates
                  </Link>
                  <Link
                    href="/create-dataset"
                    className="px-6 py-3 bg-white/20 text-white border border-white/30 rounded-lg font-medium hover:bg-white/30 transition-colors flex items-center gap-2"
                  >
                    <Sparkles className="w-5 h-5" />
                    Custom Generation
                  </Link>
                </div>
              </div>
            </motion.div>
          </div>
        </section>

        {/* Datasets Grid */}
        <section className="px-8 lg:px-16 pb-24">
          <div className="max-w-7xl mx-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-light">
                <span className="text-gray-500">{datasets.length}</span>{' '}
                datasets available
              </h2>
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Filter className="w-4 h-4" />
                <span>Showing verified datasets only</span>
              </div>
            </div>

            <div
              className={`grid ${
                viewMode === 'grid'
                  ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'
                  : 'grid-cols-1'
              } gap-6`}
            >
              {datasets.map((dataset, index) => (
                <motion.div
                  key={dataset.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: index * 0.05 }}
                >
                  <DatasetCard {...dataset} id={String(dataset.id)} />
                </motion.div>
              ))}
            </div>

            {/* Load More */}
            <div className="mt-12 text-center">
              <button className="px-8 py-3 border border-gray-300 rounded-xl font-medium hover:border-gray-400 transition-colors">
                Load More Datasets
              </button>
            </div>
          </div>
        </section>
      </div>
    </Layout>
  );
}
