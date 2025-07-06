import { motion } from 'framer-motion';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import {
  Plus,
  Sparkles,
  Database,
  Brain,
  Activity,
  ArrowUpRight,
  Clock,
  CheckCircle,
  XCircle,
  Loader2,
  ChevronDown,
  User,
  Star,
  Download,
} from 'lucide-react';
import Layout from '../components/Layout';
import { DatasetCard } from '../components/dataset';
import { useAuth } from '../hooks/useAuth';

interface Dataset {
  id: string;
  creatorId: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  visibility: string;
  license: string;
  price: number;
  format: string;
  metadataCid: string;
  datasetPreviewCid: string;
  datasetCid: string;
  price_per_row: number;
  dataset_type: string;
}

interface TrainingJob {
  id: string;
  job_name: string;
  user_wallet_address: string;
  dataset_url: string;
  platform: string;
  model_type: string;
  status: string;
  metrics?: Record<string, number | string>;
  output_model_url?: string;
  huggingface_model_url?: string;
  created_at: string;
  updated_at: string;
  started_at?: string;
  completed_at?: string;
  error_message?: string;
}

interface ProfileStats {
  totalDatasets: number;
  totalTrainingJobs: number;
  completedJobs: number;
  runningJobs: number;
  totalDownloads: number;
  averageRating: number;
}

const baseUrl = process.env.NEXT_PUBLIC_BASE_URL;

const fetchUserDatasets = async (
  walletAddress: string | undefined
): Promise<Dataset[]> => {
  if (!walletAddress) return [];

  const response = await fetch(`${baseUrl}/datasets?creator=${walletAddress}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch user datasets: ${response.status}`);
  }
  const data = await response.json();
  return data.datasets || [];
};

const fetchUserTrainingJobs = async (
  walletAddress: string | undefined
): Promise<TrainingJob[]> => {
  if (!walletAddress) return [];

  const response = await fetch(
    `${baseUrl}/training/jobs?user_wallet_address=${walletAddress}`
  );
  if (!response.ok) {
    throw new Error(`Failed to fetch training jobs: ${response.status}`);
  }
  const data = await response.json();
  return data.jobs || [];
};

export default function Profile() {
  const { isAuthenticated, walletAddress, getUserDisplayName } = useAuth();
  const [selectedTab, setSelectedTab] = useState<'datasets' | 'training'>(
    'datasets'
  );
  const [trainingFilter, setTrainingFilter] = useState<
    'all' | 'running' | 'completed' | 'failed'
  >('all');

  // Fetch user datasets
  const { data: datasets = [], isLoading: datasetsLoading } = useQuery<
    Dataset[]
  >({
    queryKey: ['userDatasets', walletAddress],
    queryFn: () => fetchUserDatasets(walletAddress),
    enabled: !!walletAddress,
  });

  // Fetch user training jobs
  const { data: trainingJobs = [], isLoading: jobsLoading } = useQuery<
    TrainingJob[]
  >({
    queryKey: ['userTrainingJobs', walletAddress],
    queryFn: () => fetchUserTrainingJobs(walletAddress),
    enabled: !!walletAddress,
  });

  // Calculate stats
  const stats: ProfileStats = {
    totalDatasets: datasets.length,
    totalTrainingJobs: trainingJobs.length,
    completedJobs: trainingJobs.filter((job) => job.status === 'completed')
      .length,
    runningJobs: trainingJobs.filter((job) =>
      ['running', 'pending'].includes(job.status)
    ).length,
    totalDownloads: datasets.reduce(
      (acc) => acc + Math.floor(Math.random() * 1000),
      0
    ),
    averageRating: 4.5,
  };

  // Filter training jobs
  const filteredJobs = trainingJobs.filter((job) => {
    if (trainingFilter === 'all') return true;
    if (trainingFilter === 'running')
      return ['running', 'pending'].includes(job.status);
    if (trainingFilter === 'completed') return job.status === 'completed';
    if (trainingFilter === 'failed') return job.status === 'failed';
    return true;
  });

  const getStatusIcon = (status: string) => {
    switch (status.toLowerCase()) {
      case 'completed':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'failed':
        return <XCircle className="w-5 h-5 text-red-500" />;
      case 'running':
      case 'pending':
        return <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />;
      default:
        return <Clock className="w-5 h-5 text-gray-400" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'completed':
        return 'bg-green-50 text-green-700 border-green-200';
      case 'failed':
        return 'bg-red-50 text-red-700 border-red-200';
      case 'running':
      case 'pending':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      default:
        return 'bg-gray-50 text-gray-700 border-gray-200';
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.RelativeTimeFormat('en', { numeric: 'auto' }).format(
      Math.ceil(
        (date.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
      ),
      'day'
    );
  };

  const transformDataset = (dataset: Dataset) => ({
    id: dataset.id,
    title: dataset.name,
    description: dataset.description || 'No description available',
    category: dataset.category,
    tags: dataset.tags || [],
    size: '2.3 MB',
    downloads: Math.floor(Math.random() * 1000),
    views: Math.floor(Math.random() * 2000),
    rating: 4.5,
    lastUpdated: 'Recently',
    isVerified: true,
    isLocked: dataset.price > 0,
    price: dataset.price,
    creator: walletAddress
      ? `${walletAddress.substring(0, 6)}...${walletAddress.substring(
          walletAddress.length - 4
        )}`
      : '',
  });

  if (!isAuthenticated) {
    return (
      <Layout>
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center">
            <h2 className="text-2xl font-semibold mb-4">
              Please sign in to view your profile
            </h2>
            <Link href="/" className="text-indigo-600 hover:text-indigo-700">
              Go to homepage
            </Link>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="bg-background noise-texture min-h-screen">
        {/* Background gradient */}
        <div className="fixed inset-0 mesh-gradient pointer-events-none opacity-30" />

        {/* Header Section */}
        <section className="pt-32 pb-12 px-8 lg:px-16 relative">
          {/* Background decorations */}
          <div className="absolute top-20 right-0 w-96 h-96 bg-gradient-to-br from-indigo-100/30 to-purple-100/30 rounded-full blur-3xl -z-10" />
          <div className="absolute bottom-0 left-0 w-64 h-64 bg-gradient-to-br from-purple-100/30 to-pink-100/30 rounded-full blur-3xl -z-10" />

          <div className="max-w-7xl mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              {/* User Info */}
              <div className="flex items-center gap-6 mb-8">
                <div className="w-24 h-24 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full flex items-center justify-center">
                  <User className="w-12 h-12 text-white" />
                </div>
                <div>
                  <h1 className="text-4xl lg:text-5xl font-light display-font mb-2">
                    My <span className="highlight-text">Synthik Profile</span>
                  </h1>
                  <p className="text-xl text-gray-600">
                    {getUserDisplayName()}
                  </p>
                </div>
              </div>

              {/* Stats Cards */}
              <div className="grid grid-cols-2 lg:grid-cols-6 gap-4 mb-8">
                <motion.div
                  className="glass-card p-6 rounded-xl"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.1 }}
                >
                  <Database className="w-8 h-8 text-indigo-600 mb-2" />
                  <div className="text-2xl font-bold text-gray-900">
                    {stats.totalDatasets}
                  </div>
                  <div className="text-sm text-gray-600">Datasets</div>
                </motion.div>

                <motion.div
                  className="glass-card p-6 rounded-xl"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.2 }}
                >
                  <Brain className="w-8 h-8 text-purple-600 mb-2" />
                  <div className="text-2xl font-bold text-gray-900">
                    {stats.totalTrainingJobs}
                  </div>
                  <div className="text-sm text-gray-600">Training Jobs</div>
                </motion.div>

                <motion.div
                  className="glass-card p-6 rounded-xl"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.3 }}
                >
                  <CheckCircle className="w-8 h-8 text-green-600 mb-2" />
                  <div className="text-2xl font-bold text-gray-900">
                    {stats.completedJobs}
                  </div>
                  <div className="text-sm text-gray-600">Completed</div>
                </motion.div>

                <motion.div
                  className="glass-card p-6 rounded-xl"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.4 }}
                >
                  <Activity className="w-8 h-8 text-blue-600 mb-2" />
                  <div className="text-2xl font-bold text-gray-900">
                    {stats.runningJobs}
                  </div>
                  <div className="text-sm text-gray-600">Running</div>
                </motion.div>

                <motion.div
                  className="glass-card p-6 rounded-xl"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.5 }}
                >
                  <Download className="w-8 h-8 text-indigo-600 mb-2" />
                  <div className="text-2xl font-bold text-gray-900">
                    {stats.totalDownloads}
                  </div>
                  <div className="text-sm text-gray-600">Downloads</div>
                </motion.div>

                <motion.div
                  className="glass-card p-6 rounded-xl"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.6 }}
                >
                  <Star className="w-8 h-8 text-yellow-500 mb-2" />
                  <div className="text-2xl font-bold text-gray-900">
                    {stats.averageRating}
                  </div>
                  <div className="text-sm text-gray-600">Avg Rating</div>
                </motion.div>
              </div>

              {/* Tabs */}
              <div className="flex gap-6 border-b border-gray-200">
                <button
                  onClick={() => setSelectedTab('datasets')}
                  className={`pb-4 px-2 font-medium transition-colors relative ${
                    selectedTab === 'datasets'
                      ? 'text-indigo-600'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  My Datasets
                  {selectedTab === 'datasets' && (
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600" />
                  )}
                </button>
                <button
                  onClick={() => setSelectedTab('training')}
                  className={`pb-4 px-2 font-medium transition-colors relative ${
                    selectedTab === 'training'
                      ? 'text-indigo-600'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Training Jobs
                  {selectedTab === 'training' && (
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600" />
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        </section>

        {/* Content Section */}
        <section className="px-8 lg:px-16 pb-16">
          <div className="max-w-7xl mx-auto">
            {selectedTab === 'datasets' ? (
              <div>
                {/* Create Dataset CTA */}
                <motion.div
                  className="mb-8"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5 }}
                >
                  <Link
                    href="/create-dataset"
                    className="group relative inline-flex items-center gap-3 px-8 py-4 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl font-medium hover:shadow-lg transition-all duration-300"
                  >
                    <Plus className="w-5 h-5" />
                    Create New Dataset
                    <ArrowUpRight className="w-4 h-4 transition-transform group-hover:translate-x-1 group-hover:-translate-y-1" />
                  </Link>
                </motion.div>

                {/* Datasets Grid */}
                {datasetsLoading ? (
                  <div className="flex justify-center items-center h-64">
                    <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
                  </div>
                ) : datasets.length === 0 ? (
                  <motion.div
                    className="text-center py-16"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.5 }}
                  >
                    <Database className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                    <h3 className="text-xl font-semibold text-gray-900 mb-2">
                      No datasets yet
                    </h3>
                    <p className="text-gray-600 mb-6">
                      Create your first synthetic dataset to get started
                    </p>
                    <Link
                      href="/create-dataset"
                      className="inline-flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition-colors"
                    >
                      <Sparkles className="w-5 h-5" />
                      Create Dataset
                    </Link>
                  </motion.div>
                ) : (
                  <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
                    {datasets.map((dataset, index) => (
                      <motion.div
                        key={dataset.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5, delay: index * 0.1 }}
                      >
                        <DatasetCard {...transformDataset(dataset)} />
                      </motion.div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div>
                {/* Training Jobs Filter */}
                <div className="flex items-center justify-between mb-8">
                  <div className="relative">
                    <select
                      value={trainingFilter}
                      onChange={(e) =>
                        setTrainingFilter(
                          e.target.value as
                            | 'all'
                            | 'running'
                            | 'completed'
                            | 'failed'
                        )
                      }
                      className="appearance-none px-4 py-3 pr-10 border border-gray-200 rounded-xl focus:outline-none focus:border-indigo-500 transition-colors bg-white"
                    >
                      <option value="all">All Jobs</option>
                      <option value="running">Running</option>
                      <option value="completed">Completed</option>
                      <option value="failed">Failed</option>
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                  </div>

                  <Link
                    href="/train-model"
                    className="group inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl font-medium hover:shadow-lg transition-all duration-300"
                  >
                    <Brain className="w-5 h-5" />
                    Train New Model
                    <ArrowUpRight className="w-4 h-4 transition-transform group-hover:translate-x-1 group-hover:-translate-y-1" />
                  </Link>
                </div>

                {/* Training Jobs List */}
                {jobsLoading ? (
                  <div className="flex justify-center items-center h-64">
                    <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
                  </div>
                ) : filteredJobs.length === 0 ? (
                  <motion.div
                    className="text-center py-16"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.5 }}
                  >
                    <Brain className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                    <h3 className="text-xl font-semibold text-gray-900 mb-2">
                      {trainingFilter === 'all'
                        ? 'No training jobs yet'
                        : `No ${trainingFilter} jobs`}
                    </h3>
                    <p className="text-gray-600 mb-6">
                      Start training models with your datasets
                    </p>
                    <Link
                      href="/train-model"
                      className="inline-flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition-colors"
                    >
                      <Brain className="w-5 h-5" />
                      Train Model
                    </Link>
                  </motion.div>
                ) : (
                  <div className="space-y-4">
                    {filteredJobs.map((job, index) => (
                      <motion.div
                        key={job.id}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.5, delay: index * 0.1 }}
                        className="bg-white border border-gray-200 rounded-xl p-6 hover:border-gray-300 hover:shadow-lg transition-all duration-200"
                      >
                        <div className="flex items-start justify-between mb-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                              <h3 className="text-lg font-semibold text-gray-900">
                                {job.job_name}
                              </h3>
                              <span
                                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium border ${getStatusColor(
                                  job.status
                                )}`}
                              >
                                {getStatusIcon(job.status)}
                                {job.status.charAt(0).toUpperCase() +
                                  job.status.slice(1)}
                              </span>
                            </div>
                            <div className="flex items-center gap-4 text-sm text-gray-600">
                              <span className="flex items-center gap-1">
                                <Database className="w-4 h-4" />
                                Dataset #{job.dataset_url.split('/').pop()}
                              </span>
                              <span className="flex items-center gap-1">
                                <Clock className="w-4 h-4" />
                                {formatDate(job.created_at)}
                              </span>
                              {job.platform && (
                                <span className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs font-medium">
                                  {job.platform}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="text-right">
                            {job.model_type && (
                              <div className="text-sm text-gray-600 mb-1">
                                {job.model_type}
                              </div>
                            )}
                            {job.huggingface_model_url && (
                              <a
                                href={job.huggingface_model_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-700"
                              >
                                View Model
                                <ArrowUpRight className="w-3 h-3" />
                              </a>
                            )}
                          </div>
                        </div>

                        {/* Metrics */}
                        {job.metrics && Object.keys(job.metrics).length > 0 && (
                          <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                            <h4 className="text-sm font-medium text-gray-700 mb-2">
                              Metrics
                            </h4>
                            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                              {Object.entries(job.metrics)
                                .slice(0, 4)
                                .map(([key, value]) => (
                                  <div key={key}>
                                    <div className="text-xs text-gray-500">
                                      {key}
                                    </div>
                                    <div className="text-sm font-semibold text-gray-900">
                                      {typeof value === 'number'
                                        ? value.toFixed(4)
                                        : String(value)}
                                    </div>
                                  </div>
                                ))}
                            </div>
                          </div>
                        )}

                        {/* Error Message */}
                        {job.error_message && (
                          <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                            <p className="text-sm text-red-700">
                              {job.error_message}
                            </p>
                          </div>
                        )}

                        {/* Progress Bar for Running Jobs */}
                        {['running', 'pending'].includes(job.status) && (
                          <div className="mt-4">
                            <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                              <div
                                className="bg-indigo-600 h-full rounded-full animate-pulse"
                                style={{ width: '60%' }}
                              />
                            </div>
                          </div>
                        )}
                      </motion.div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </section>
      </div>
    </Layout>
  );
}
