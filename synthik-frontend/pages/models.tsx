import { useState, useEffect } from 'react';
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
  Brain,
  Download,
  ChevronDown,
  Code,
  Loader2,
} from 'lucide-react';
import { ModelCard } from '../components/model';
import Layout from '../components/Layout';
import { useQuery } from '@tanstack/react-query';

interface Model {
  id: string;
  job_name: string;
  user_wallet_address: string;
  dataset_url: string;
  platform: string;
  model_type: string;
  status: string;
  created_at: string;
  completed_at?: string;
  hyperparameters: {
    base_model_id: string;
    epochs: number;
    learning_rate: number;
  };
  metrics?: {
    final_loss: number;
    final_accuracy?: number;
  };
  huggingface_model_url?: string;
}

interface ModelsResponse {
  models: Model[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

const baseUrl = process.env.NEXT_PUBLIC_BASE_URL;

// Dummy data for demonstration
const DUMMY_MODELS: Model[] = [
  {
    id: 'model-1',
    job_name: 'Pythia-70M Sarcasm LoRA',
    user_wallet_address:
      '0x37793860ea65a1e05a9a506ed7b86b084cb9bba5fc9c979da3512464007fa11d',
    dataset_url: 'dataset-1',
    platform: 'hugging_face',
    model_type: 'CAUSAL_LM',
    status: 'completed',
    created_at: '2024-01-15T10:30:00Z',
    completed_at: '2024-01-15T14:45:00Z',
    hyperparameters: {
      base_model_id: 'EleutherAI/pythia-70m-deduped',
      epochs: 1,
      learning_rate: 0.0002,
    },
    metrics: {
      final_loss: 0.4532,
      final_accuracy: 0.923,
    },
    huggingface_model_url: 'https://huggingface.co/Testys/Eluether-finetune',
  },
  {
    id: 'model-2',
    job_name: 'BERT Sentiment Classifier',
    user_wallet_address:
      '0x12345678901234567890123456789012345678901234567890123456789012',
    dataset_url: 'dataset-2',
    platform: 'sagemaker',
    model_type: 'SEQ_CLS',
    status: 'running',
    created_at: '2024-01-16T08:00:00Z',
    hyperparameters: {
      base_model_id: 'bert-base-uncased',
      epochs: 3,
      learning_rate: 0.00005,
    },
  },
  {
    id: 'model-3',
    job_name: 'GPT-2 Story Generator',
    user_wallet_address:
      '0x98765432109876543210987654321098765432109876543210987654321098',
    dataset_url: 'dataset-3',
    platform: 'vertex_ai',
    model_type: 'CAUSAL_LM',
    status: 'completed',
    created_at: '2024-01-14T12:00:00Z',
    completed_at: '2024-01-14T18:30:00Z',
    hyperparameters: {
      base_model_id: 'gpt2-medium',
      epochs: 2,
      learning_rate: 0.0001,
    },
    metrics: {
      final_loss: 0.3821,
      final_accuracy: 0.945,
    },
    huggingface_model_url: 'https://huggingface.co/user/gpt2-story',
  },
  {
    id: 'model-4',
    job_name: 'T5 Translation Model',
    user_wallet_address:
      '0xabcdef123456789abcdef123456789abcdef123456789abcdef123456789abc',
    dataset_url: 'dataset-4',
    platform: 'hugging_face',
    model_type: 'SEQ_2_SEQ',
    status: 'completed',
    created_at: '2024-01-13T09:15:00Z',
    completed_at: '2024-01-13T16:45:00Z',
    hyperparameters: {
      base_model_id: 't5-small',
      epochs: 5,
      learning_rate: 0.0003,
    },
    metrics: {
      final_loss: 0.2156,
    },
  },
  {
    id: 'model-5',
    job_name: 'RoBERTa NER Tagger',
    user_wallet_address:
      '0xfedcba987654321fedcba987654321fedcba987654321fedcba987654321fed',
    dataset_url: 'dataset-5',
    platform: 'local_server',
    model_type: 'TOKEN_CLS',
    status: 'failed',
    created_at: '2024-01-16T14:20:00Z',
    hyperparameters: {
      base_model_id: 'roberta-base',
      epochs: 3,
      learning_rate: 0.00003,
    },
  },
  {
    id: 'model-6',
    job_name: 'DistilBERT QA Model',
    user_wallet_address:
      '0x11122233344455566677788899aabbccddeeff11122233344455566677788899',
    dataset_url: 'dataset-6',
    platform: 'hugging_face',
    model_type: 'SEQ_CLS',
    status: 'completed',
    created_at: '2024-01-12T11:00:00Z',
    completed_at: '2024-01-12T14:30:00Z',
    hyperparameters: {
      base_model_id: 'distilbert-base-uncased',
      epochs: 4,
      learning_rate: 0.00002,
    },
    metrics: {
      final_loss: 0.1789,
      final_accuracy: 0.967,
    },
    huggingface_model_url: 'https://huggingface.co/user/distilbert-qa',
  },
];

const fetchModels = async (
  page: number = 1,
  limit: number = 6
): Promise<ModelsResponse> => {
  // For now, return dummy data
  // In production, fetch from API: ${baseUrl}/training/jobs
  await new Promise((resolve) => setTimeout(resolve, 1000)); // Simulate API delay

  const startIndex = (page - 1) * limit;
  const endIndex = startIndex + limit;
  const paginatedModels = DUMMY_MODELS.slice(startIndex, endIndex);

  return {
    models: paginatedModels,
    page,
    limit,
    total: DUMMY_MODELS.length,
    totalPages: Math.ceil(DUMMY_MODELS.length / limit),
  };
};

// Helper function to get model type display name
function getModelTypeDisplayName(type: string): string {
  const typeMap: Record<string, string> = {
    CAUSAL_LM: 'Language Model',
    SEQ_CLS: 'Classification',
    TOKEN_CLS: 'Token Classification',
    SEQ_2_SEQ: 'Seq2Seq',
    MASKED_LM: 'Masked LM',
  };
  return typeMap[type] || type;
}

// Helper function to format relative time
function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffInDays = Math.floor(
    (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (diffInDays === 0) return 'Today';
  if (diffInDays === 1) return 'Yesterday';
  if (diffInDays < 7) return `${diffInDays} days ago`;
  if (diffInDays < 30) return `${Math.floor(diffInDays / 7)} weeks ago`;
  return `${Math.floor(diffInDays / 30)} months ago`;
}

export default function Models() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedModelType, setSelectedModelType] = useState('all');
  const [selectedPlatform, setSelectedPlatform] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [sortBy, setSortBy] = useState('recent');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [currentPage, setCurrentPage] = useState(1);
  const [allModels, setAllModels] = useState<Model[]>([]);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // Use TanStack Query for data fetching
  const {
    data: currentPageData,
    isLoading,
    error,
  } = useQuery<ModelsResponse, Error>({
    queryKey: ['models', currentPage],
    queryFn: () => fetchModels(currentPage, 6),
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  // Update allModels when new data comes in
  useEffect(() => {
    if (currentPageData?.models) {
      if (currentPage === 1) {
        setAllModels(currentPageData.models);
      } else {
        setAllModels((prev) => {
          const existingIds = new Set(prev.map((m) => m.id));
          const newModels = currentPageData.models.filter(
            (m) => !existingIds.has(m.id)
          );
          return [...prev, ...newModels];
        });
      }
      setIsLoadingMore(false);
    }
  }, [currentPageData, currentPage]);

  const modelTypes = [
    { value: 'all', label: 'All Types' },
    { value: 'CAUSAL_LM', label: 'Language Model' },
    { value: 'SEQ_CLS', label: 'Classification' },
    { value: 'TOKEN_CLS', label: 'Token Classification' },
    { value: 'SEQ_2_SEQ', label: 'Seq2Seq' },
  ];

  const platforms = [
    { value: 'all', label: 'All Platforms' },
    { value: 'hugging_face', label: 'Hugging Face' },
    { value: 'sagemaker', label: 'SageMaker' },
    { value: 'vertex_ai', label: 'Vertex AI' },
    { value: 'local_server', label: 'Local Server' },
  ];

  const statuses = [
    { value: 'all', label: 'All Status' },
    { value: 'completed', label: 'Completed' },
    { value: 'running', label: 'Running' },
    { value: 'failed', label: 'Failed' },
  ];

  const sortOptions = [
    {
      value: 'recent',
      label: 'Most Recent',
      icon: <Clock className="w-4 h-4" />,
    },
    {
      value: 'popular',
      label: 'Most Popular',
      icon: <TrendingUp className="w-4 h-4" />,
    },
    {
      value: 'performance',
      label: 'Best Performance',
      icon: <Sparkles className="w-4 h-4" />,
    },
  ];

  const filteredModels = allModels.filter((model) => {
    const matchesSearch = model.job_name
      .toLowerCase()
      .includes(searchQuery.toLowerCase());
    const matchesType =
      selectedModelType === 'all' || model.model_type === selectedModelType;
    const matchesPlatform =
      selectedPlatform === 'all' || model.platform === selectedPlatform;
    const matchesStatus =
      selectedStatus === 'all' || model.status === selectedStatus;
    return matchesSearch && matchesType && matchesPlatform && matchesStatus;
  });

  // Handle load more
  const handleLoadMore = () => {
    setIsLoadingMore(true);
    setCurrentPage((prev) => prev + 1);
  };

  const hasMore = currentPageData
    ? currentPage < currentPageData.totalPages
    : false;

  return (
    <Layout>
      <div className="bg-background noise-texture">
        {/* Background gradient */}
        <div className="fixed inset-0 mesh-gradient pointer-events-none opacity-30" />

        {/* Header Section */}
        <section className="pt-32 pb-12 px-8 lg:px-16 relative">
          {/* Background decoration */}
          <div className="absolute top-20 right-0 w-96 h-96 bg-gradient-to-br from-purple-100/30 to-pink-100/30 rounded-full blur-3xl -z-10" />
          <div className="absolute bottom-0 left-0 w-64 h-64 bg-gradient-to-br from-indigo-100/30 to-blue-100/30 rounded-full blur-3xl -z-10" />

          <div className="max-w-7xl mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              <div className="flex items-center gap-3 mb-6">
                <div className="w-2 h-8 bg-gradient-to-b from-purple-600 to-indigo-600 rounded-full" />
                <h1 className="text-4xl lg:text-5xl font-light display-font">
                  Explore <span className="highlight-text">trained models</span>
                </h1>
              </div>
              <p className="text-xl text-gray-600 mb-8 max-w-3xl">
                Discover AI models trained on Synthik datasets. Each model
                includes complete training lineage and performance metrics
                stored on the blockchain.
              </p>

              {/* Search and Filters */}
              <div className="flex flex-col lg:flex-row gap-4 mb-8">
                <div className="flex-1 relative">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search models..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-12 pr-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:border-indigo-500 transition-colors"
                  />
                </div>

                <div className="flex gap-2">
                  <div className="relative">
                    <select
                      value={selectedModelType}
                      onChange={(e) => setSelectedModelType(e.target.value)}
                      className="appearance-none px-4 py-3 pr-10 border border-gray-200 rounded-xl focus:outline-none focus:border-indigo-500 transition-colors bg-white"
                    >
                      {modelTypes.map((type) => (
                        <option key={type.value} value={type.value}>
                          {type.label}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                  </div>

                  <div className="relative">
                    <select
                      value={selectedPlatform}
                      onChange={(e) => setSelectedPlatform(e.target.value)}
                      className="appearance-none px-4 py-3 pr-10 border border-gray-200 rounded-xl focus:outline-none focus:border-indigo-500 transition-colors bg-white"
                    >
                      {platforms.map((platform) => (
                        <option key={platform.value} value={platform.value}>
                          {platform.label}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                  </div>

                  <div className="relative">
                    <select
                      value={selectedStatus}
                      onChange={(e) => setSelectedStatus(e.target.value)}
                      className="appearance-none px-4 py-3 pr-10 border border-gray-200 rounded-xl focus:outline-none focus:border-indigo-500 transition-colors bg-white"
                    >
                      {statuses.map((status) => (
                        <option key={status.value} value={status.value}>
                          {status.label}
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
                      <LayoutGrid className="w-4 h-4" />
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

        {/* Train Model Section */}
        <section className="px-8 lg:px-16 pb-12">
          <div className="max-w-7xl mx-auto">
            <motion.div
              className="bg-gradient-to-r from-purple-600 to-indigo-600 rounded-2xl p-8 mb-12 relative overflow-hidden"
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
                    Ready to train your own model?
                  </h2>
                  <p className="text-white/80">
                    Fine-tune state-of-the-art models on your synthetic datasets
                  </p>
                </div>
                <div className="flex gap-4">
                  <Link
                    href="/train-model"
                    className="px-6 py-3 bg-white text-purple-600 rounded-lg font-medium hover:bg-gray-100 transition-colors flex items-center gap-2"
                  >
                    <Brain className="w-5 h-5" />
                    Train Model
                  </Link>
                  <Link
                    href="/datasets"
                    className="px-6 py-3 bg-white/20 text-white border border-white/30 rounded-lg font-medium hover:bg-white/30 transition-colors flex items-center gap-2"
                  >
                    <Code className="w-5 h-5" />
                    Browse Datasets
                  </Link>
                </div>
              </div>
            </motion.div>
          </div>
        </section>

        {/* Models Grid */}
        <section className="px-8 lg:px-16 pb-16">
          <div className="max-w-7xl mx-auto">
            {isLoading && currentPage === 1 ? (
              <div className="flex justify-center items-center min-h-96">
                <div className="flex items-center gap-3 text-gray-600">
                  <Loader2 className="w-6 h-6 animate-spin" />
                  <span>Loading models...</span>
                </div>
              </div>
            ) : error ? (
              <div className="text-center py-12">
                <p className="text-gray-500">
                  Failed to load models. Please try again.
                </p>
              </div>
            ) : filteredModels.length === 0 ? (
              <motion.div
                className="text-center py-16"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.5 }}
              >
                <Brain className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-gray-900 mb-2">
                  No models found
                </h3>
                <p className="text-gray-600 mb-6">
                  Try adjusting your filters or search query
                </p>
                <Link
                  href="/train-model"
                  className="inline-flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition-colors"
                >
                  <Sparkles className="w-5 h-5" />
                  Train Your First Model
                </Link>
              </motion.div>
            ) : (
              <>
                <div
                  className={`grid ${
                    viewMode === 'grid'
                      ? 'grid-cols-1 lg:grid-cols-2 xl:grid-cols-3'
                      : 'grid-cols-1'
                  } gap-6`}
                >
                  {filteredModels.map((model, index) => (
                    <motion.div
                      key={model.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.5, delay: index * 0.1 }}
                    >
                      <ModelCard
                        id={model.id}
                        name={model.job_name}
                        description={`Fine-tuned ${
                          model.hyperparameters.base_model_id
                        } model for ${getModelTypeDisplayName(
                          model.model_type
                        ).toLowerCase()}`}
                        baseModel={model.hyperparameters.base_model_id}
                        modelType={getModelTypeDisplayName(model.model_type)}
                        platform={model.platform}
                        status={model.status}
                        metrics={
                          model.metrics
                            ? {
                                loss: model.metrics.final_loss,
                                accuracy: model.metrics.final_accuracy,
                              }
                            : undefined
                        }
                        downloads={Math.floor(Math.random() * 5000)}
                        stars={Math.floor(Math.random() * 100)}
                        lastUpdated={formatRelativeTime(model.created_at)}
                        creator={`${model.user_wallet_address.slice(
                          0,
                          6
                        )}...${model.user_wallet_address.slice(-4)}`}
                        huggingfaceUrl={model.huggingface_model_url}
                      />
                    </motion.div>
                  ))}
                </div>

                {/* Load More Button */}
                {hasMore && (
                  <div className="mt-12 text-center">
                    <button
                      onClick={handleLoadMore}
                      disabled={isLoadingMore}
                      className="px-8 py-3 bg-white border border-gray-300 rounded-xl font-medium hover:border-gray-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 mx-auto"
                    >
                      {isLoadingMore ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin" />
                          Loading...
                        </>
                      ) : (
                        <>
                          <Download className="w-5 h-5" />
                          Load More Models
                        </>
                      )}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </section>

        {/* Stats Section */}
        <section className="px-8 lg:px-16 pb-20">
          <div className="max-w-7xl mx-auto">
            <div className="bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50 rounded-2xl p-12 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-br from-purple-200/20 to-pink-200/20 rounded-full blur-3xl" />

              <div className="relative z-10">
                <h2 className="text-3xl font-semibold text-gray-900 mb-8 text-center">
                  Platform Statistics
                </h2>

                <div className="grid grid-cols-2 lg:grid-cols-4 gap-8">
                  <div className="text-center">
                    <div className="text-4xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent mb-2">
                      {DUMMY_MODELS.length}+
                    </div>
                    <p className="text-gray-600">Models Trained</p>
                  </div>
                  <div className="text-center">
                    <div className="text-4xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent mb-2">
                      95%
                    </div>
                    <p className="text-gray-600">Success Rate</p>
                  </div>
                  <div className="text-center">
                    <div className="text-4xl font-bold bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent mb-2">
                      2.5h
                    </div>
                    <p className="text-gray-600">Avg Training Time</p>
                  </div>
                  <div className="text-center">
                    <div className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent mb-2">
                      100+
                    </div>
                    <p className="text-gray-600">Active Developers</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </Layout>
  );
}
