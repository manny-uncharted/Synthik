import { useRouter } from 'next/router';
import { motion } from 'framer-motion';
import Link from 'next/link';
import {
  ArrowLeft,
  Star,
  Copy,
  ExternalLink,
  Brain,
  GitBranch,
  Code,
  Shield,
  ChevronRight,
  Cpu,
  Zap,
  BarChart3,
  Clock,
  Database,
  Sparkles,
  Loader2,
  CheckCircle,
  Award,
  TrendingUp,
  Package,
  HardDrive,
  Layers,
  Activity,
} from 'lucide-react';
import { useState, useEffect } from 'react';
import Layout from '../../components/Layout';

interface ModelMetadata {
  id: string;
  job_name: string;
  user_wallet_address: string;
  dataset_url: string;
  file_type: string;
  platform: string;
  model_type: string;
  status: string;
  created_at: string;
  completed_at?: string;
  hyperparameters: {
    base_model_id: string;
    model_task_type: string;
    epochs: number;
    learning_rate: number;
    per_device_train_batch_size: number;
    gradient_accumulation_steps: number;
    max_seq_length: number;
    text_column?: string;
    load_in_4bit?: boolean;
    bnb_4bit_compute_dtype?: string;
    bnb_4bit_quant_type?: string;
    bnb_4bit_use_double_quant?: boolean;
    logging_steps?: number;
    save_steps?: number;
  };
  training_script_config: {
    training_script_name: string;
    hf_username: string;
    hf_target_model_repo_id: string;
    hf_space_hardware: string;
    hf_private_repos: boolean;
    model_output_dir_in_space: string;
    report_to?: string;
  };
  metrics?: {
    final_loss: number;
    final_perplexity?: number;
    eval_loss?: number;
    training_time_hours: number;
    total_steps: number;
    gpu_hours: number;
  };
  output_model_url?: string;
  huggingface_model_url?: string;
  filecoin_cid?: string;
}

// Dummy data for demonstration
const DUMMY_MODEL: ModelMetadata = {
  id: 'model-123',
  job_name: 'Pythia-70M LoRA (HF)',
  user_wallet_address:
    '0x37793860ea65a1e05a9a506ed7b86b084cb9bba5fc9c979da3512464007fa11d',
  dataset_url:
    'https://0x311e26702aba231c321c633d1ff6ecb4445f2308.calibration.filcdn.io/baga6ea4seaqhv7zvx7ykx6pady5fk5fbz422ohupjgd6vvzwwjnlotgs22lzqka',
  file_type: 'csv',
  platform: 'hugging_face',
  model_type: 'CAUSAL_LM',
  status: 'completed',
  created_at: '2024-01-15T10:30:00Z',
  completed_at: '2024-01-15T14:45:00Z',
  hyperparameters: {
    base_model_id: 'EleutherAI/pythia-70m-deduped',
    model_task_type: 'CAUSAL_LM',
    epochs: 1,
    learning_rate: 0.0002,
    per_device_train_batch_size: 2,
    gradient_accumulation_steps: 4,
    max_seq_length: 512,
    text_column: 'text',
    load_in_4bit: true,
    bnb_4bit_compute_dtype: 'bfloat16',
    bnb_4bit_quant_type: 'nf4',
    bnb_4bit_use_double_quant: true,
    logging_steps: 10,
    save_steps: 100,
  },
  training_script_config: {
    training_script_name: 'train_text_lora.py',
    hf_username: 'Testys',
    hf_target_model_repo_id: 'Testys/Eluether-finetune',
    hf_space_hardware: 't4-small',
    hf_private_repos: false,
    model_output_dir_in_space: '/outputs',
    report_to: 'tensorboard',
  },
  metrics: {
    final_loss: 0.4532,
    final_perplexity: 1.573,
    eval_loss: 0.4821,
    training_time_hours: 4.25,
    total_steps: 1250,
    gpu_hours: 4.25,
  },
  huggingface_model_url: 'https://huggingface.co/Testys/Eluether-finetune',
  filecoin_cid: 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi',
};

// Helper function to format time duration
function formatDuration(hours: number): string {
  if (hours < 1) {
    return `${Math.round(hours * 60)} minutes`;
  }
  return `${hours.toFixed(1)} hours`;
}

// Helper function to format numbers with commas
function formatNumber(num: number): string {
  return num.toLocaleString();
}

// Helper function to get hardware display name
function getHardwareDisplayName(hardware: string): string {
  const hardwareMap: Record<string, string> = {
    't4-small': 'NVIDIA T4 GPU',
    't4-medium': 'NVIDIA T4 GPU (2x)',
    'a10g-small': 'NVIDIA A10G GPU',
    'a10g-large': 'NVIDIA A10G GPU (4x)',
    'a100-large': 'NVIDIA A100 GPU',
    'cpu-basic': 'CPU (2 cores)',
    'cpu-upgrade': 'CPU (8 cores)',
  };
  return hardwareMap[hardware] || hardware;
}

// Helper function to get model type display name
function getModelTypeDisplayName(type: string): string {
  const typeMap: Record<string, string> = {
    CAUSAL_LM: 'Causal Language Model',
    SEQ_CLS: 'Sequence Classification',
    TOKEN_CLS: 'Token Classification',
    SEQ_2_SEQ: 'Sequence to Sequence',
    MASKED_LM: 'Masked Language Model',
  };
  return typeMap[type] || type;
}

export default function ModelDetails() {
  const router = useRouter();
  const { id } = router.query;
  const [model, setModel] = useState<ModelMetadata | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedCID, setCopiedCID] = useState(false);
  const [activeTab, setActiveTab] = useState<
    'overview' | 'config' | 'metrics' | 'lineage'
  >('overview');

  // Fetch model data
  useEffect(() => {
    if (!id) return;

    const fetchModel = async () => {
      try {
        setLoading(true);
        setError(null);

        // For now, use dummy data
        // In production, fetch from API: /training/jobs/${id}
        await new Promise((resolve) => setTimeout(resolve, 1000)); // Simulate API delay
        setModel(DUMMY_MODEL);

        setLoading(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch model');
        setLoading(false);
      }
    };

    fetchModel();
  }, [id]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCID(true);
    setTimeout(() => setCopiedCID(false), 2000);
  };

  if (loading) {
    return (
      <Layout>
        <div className="pt-28 pb-20 px-8 lg:px-16">
          <div className="max-w-7xl mx-auto">
            <div className="flex items-center justify-center min-h-96">
              <div className="flex items-center gap-3 text-gray-600">
                <Loader2 className="w-6 h-6 animate-spin" />
                <span>Loading model details...</span>
              </div>
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  if (error || !model) {
    return (
      <Layout>
        <div className="pt-28 pb-20 px-8 lg:px-16">
          <div className="max-w-7xl mx-auto">
            <div className="flex items-center justify-center min-h-96">
              <div className="text-center">
                <h1 className="text-2xl font-semibold text-gray-900 mb-2">
                  Model Not Found
                </h1>
                <p className="text-gray-600 mb-4">
                  {error || 'The model you are looking for does not exist.'}
                </p>
                <Link
                  href="/models"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Back to Models
                </Link>
              </div>
            </div>
          </div>
        </div>
      </Layout>
    );
  }

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
            href="/models"
            className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-8 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="text-sm font-medium">Back to Models</span>
          </Link>

          {/* Header Section */}
          <div className="grid lg:grid-cols-3 gap-8 mb-12">
            <div className="lg:col-span-2">
              <div className="flex items-start justify-between mb-6">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-4">
                    <h1 className="text-4xl lg:text-5xl font-light display-font">
                      {model.job_name}
                    </h1>
                    {model.status === 'completed' && (
                      <div className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-green-50 to-emerald-50 text-green-700 rounded-full text-sm font-medium border border-green-200">
                        <CheckCircle className="w-4 h-4" />
                        Trained
                      </div>
                    )}
                  </div>
                  <p className="text-lg text-gray-600 leading-relaxed mb-4">
                    Fine-tuned {model.hyperparameters.base_model_id} model
                    optimized for{' '}
                    {getModelTypeDisplayName(model.model_type).toLowerCase()}
                  </p>

                  {/* Quick Stats */}
                  <div className="flex flex-wrap gap-6 text-sm">
                    <div className="flex items-center gap-2">
                      <Cpu className="w-4 h-4 text-indigo-600" />
                      <span className="text-gray-600">
                        {getHardwareDisplayName(
                          model.training_script_config.hf_space_hardware
                        )}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-purple-600" />
                      <span className="text-gray-600">
                        {formatDuration(
                          model.metrics?.training_time_hours || 0
                        )}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Layers className="w-4 h-4 text-blue-600" />
                      <span className="text-gray-600">
                        {model.hyperparameters.epochs} epoch
                        {model.hyperparameters.epochs > 1 ? 's' : ''}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex flex-wrap gap-4">
                <a
                  href={model.huggingface_model_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-6 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl font-medium hover:from-indigo-700 hover:to-purple-700 transition-all flex items-center gap-2 shadow-lg shadow-indigo-200"
                >
                  <img
                    src="https://huggingface.co/front/assets/huggingface_logo-noborder.svg"
                    className="w-5 h-5"
                    alt="HuggingFace"
                  />
                  View on Hugging Face
                  <ExternalLink className="w-4 h-4" />
                </a>

                <button className="px-6 py-3 bg-white border border-gray-200 rounded-xl font-medium hover:border-gray-300 transition-colors flex items-center gap-2">
                  <Star className="w-5 h-5" />
                  Star Model
                </button>
              </div>
            </div>

            {/* Performance Card */}
            <div className="bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl p-6 text-white h-fit">
              <h3 className="text-sm font-medium opacity-90 mb-4">
                Model Performance
              </h3>
              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm opacity-80">Final Loss</span>
                    <span className="text-2xl font-bold">
                      {model.metrics?.final_loss.toFixed(4)}
                    </span>
                  </div>
                  <div className="w-full bg-white/20 rounded-full h-2">
                    <div
                      className="bg-white rounded-full h-2 transition-all duration-500"
                      style={{
                        width: `${Math.max(
                          10,
                          100 - (model.metrics?.final_loss || 0) * 100
                        )}%`,
                      }}
                    />
                  </div>
                </div>

                {model.metrics?.final_perplexity && (
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm opacity-80">Perplexity</span>
                      <span className="text-xl font-bold">
                        {model.metrics.final_perplexity.toFixed(3)}
                      </span>
                    </div>
                  </div>
                )}

                <div className="pt-4 border-t border-white/20">
                  <div className="flex items-center gap-2 text-sm">
                    <Award className="w-5 h-5" />
                    <span className="font-medium">Top 10% Performance</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Filecoin CID Section */}
          {model.filecoin_cid && (
            <div className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-2xl p-6 mb-12 border border-indigo-100">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center">
                    <Database className="w-6 h-6 text-indigo-600" />
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-gray-900 mb-1">
                      Training Metadata CID
                    </h3>
                    <div className="flex items-center gap-2">
                      <code className="text-sm font-mono text-gray-700">
                        {model.filecoin_cid}
                      </code>
                      <button
                        onClick={() => copyToClipboard(model.filecoin_cid!)}
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
                  href={`https://0x311e26702aba231c321c633d1ff6ecb4445f2308.calibration.filcdn.io/${model.filecoin_cid}`}
                  target="_blank"
                  className="flex items-center gap-2 px-4 py-2 bg-white rounded-lg text-sm font-medium text-indigo-600 hover:bg-indigo-50 transition-colors"
                >
                  View with FilCDN
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
                  onClick={() => setActiveTab('overview')}
                  className={`px-6 py-4 text-sm font-medium transition-colors relative ${
                    activeTab === 'overview'
                      ? 'text-indigo-600'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Overview
                  {activeTab === 'overview' && (
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600" />
                  )}
                </button>
                <button
                  onClick={() => setActiveTab('config')}
                  className={`px-6 py-4 text-sm font-medium transition-colors relative ${
                    activeTab === 'config'
                      ? 'text-indigo-600'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Configuration
                  {activeTab === 'config' && (
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600" />
                  )}
                </button>
                <button
                  onClick={() => setActiveTab('metrics')}
                  className={`px-6 py-4 text-sm font-medium transition-colors relative ${
                    activeTab === 'metrics'
                      ? 'text-indigo-600'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Metrics
                  {activeTab === 'metrics' && (
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
                  Training Lineage
                  {activeTab === 'lineage' && (
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600" />
                  )}
                </button>
              </div>
            </div>

            <div className="p-6">
              {/* Overview Tab */}
              {activeTab === 'overview' && (
                <div className="space-y-6">
                  {/* Model Architecture */}
                  <div className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-xl p-6 border border-indigo-100">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center">
                        <Brain className="w-5 h-5 text-white" />
                      </div>
                      <h3 className="text-lg font-semibold text-gray-900">
                        Model Architecture
                      </h3>
                    </div>
                    <div className="grid md:grid-cols-2 gap-4">
                      <div className="space-y-3">
                        <div className="flex items-center justify-between p-3 bg-white/80 backdrop-blur-sm rounded-lg">
                          <span className="text-sm text-gray-600">
                            Base Model
                          </span>
                          <span className="text-sm font-mono text-gray-900">
                            {model.hyperparameters.base_model_id}
                          </span>
                        </div>
                        <div className="flex items-center justify-between p-3 bg-white/80 backdrop-blur-sm rounded-lg">
                          <span className="text-sm text-gray-600">
                            Model Type
                          </span>
                          <span className="text-sm font-medium text-gray-900">
                            {getModelTypeDisplayName(model.model_type)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between p-3 bg-white/80 backdrop-blur-sm rounded-lg">
                          <span className="text-sm text-gray-600">
                            Fine-tuning Method
                          </span>
                          <span className="text-sm font-medium text-gray-900">
                            LoRA
                          </span>
                        </div>
                      </div>
                      <div className="space-y-3">
                        <div className="flex items-center justify-between p-3 bg-white/80 backdrop-blur-sm rounded-lg">
                          <span className="text-sm text-gray-600">
                            Quantization
                          </span>
                          <span className="text-sm font-medium text-gray-900">
                            4-bit{' '}
                            {model.hyperparameters.bnb_4bit_quant_type?.toUpperCase()}
                          </span>
                        </div>
                        <div className="flex items-center justify-between p-3 bg-white/80 backdrop-blur-sm rounded-lg">
                          <span className="text-sm text-gray-600">
                            Compute Type
                          </span>
                          <span className="text-sm font-mono text-gray-900">
                            {model.hyperparameters.bnb_4bit_compute_dtype}
                          </span>
                        </div>
                        <div className="flex items-center justify-between p-3 bg-white/80 backdrop-blur-sm rounded-lg">
                          <span className="text-sm text-gray-600">
                            Max Sequence Length
                          </span>
                          <span className="text-sm font-medium text-gray-900">
                            {formatNumber(model.hyperparameters.max_seq_length)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Training Summary */}
                  <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl p-6 border border-green-100">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 bg-gradient-to-br from-green-500 to-emerald-600 rounded-lg flex items-center justify-center">
                        <Activity className="w-5 h-5 text-white" />
                      </div>
                      <h3 className="text-lg font-semibold text-gray-900">
                        Training Summary
                      </h3>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="bg-white/80 backdrop-blur-sm rounded-lg p-4 text-center">
                        <Zap className="w-8 h-8 text-green-600 mx-auto mb-2" />
                        <p className="text-2xl font-bold text-gray-900">
                          {formatNumber(model.metrics?.total_steps || 0)}
                        </p>
                        <p className="text-sm text-gray-600">Total Steps</p>
                      </div>
                      <div className="bg-white/80 backdrop-blur-sm rounded-lg p-4 text-center">
                        <Clock className="w-8 h-8 text-blue-600 mx-auto mb-2" />
                        <p className="text-2xl font-bold text-gray-900">
                          {model.metrics?.training_time_hours.toFixed(1)}h
                        </p>
                        <p className="text-sm text-gray-600">Training Time</p>
                      </div>
                      <div className="bg-white/80 backdrop-blur-sm rounded-lg p-4 text-center">
                        <Cpu className="w-8 h-8 text-purple-600 mx-auto mb-2" />
                        <p className="text-2xl font-bold text-gray-900">
                          {model.metrics?.gpu_hours.toFixed(1)}h
                        </p>
                        <p className="text-sm text-gray-600">GPU Hours</p>
                      </div>
                      <div className="bg-white/80 backdrop-blur-sm rounded-lg p-4 text-center">
                        <TrendingUp className="w-8 h-8 text-indigo-600 mx-auto mb-2" />
                        <p className="text-2xl font-bold text-gray-900">
                          {model.hyperparameters.epochs}
                        </p>
                        <p className="text-sm text-gray-600">Epochs</p>
                      </div>
                    </div>
                  </div>

                  {/* Quick Actions */}
                  <div className="bg-gray-50 rounded-xl p-6">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">
                      Quick Actions
                    </h3>
                    <div className="grid md:grid-cols-3 gap-4">
                      <a
                        href={`${model.huggingface_model_url}/tree/main`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-3 p-4 bg-white rounded-lg hover:shadow-md transition-shadow"
                      >
                        <Package className="w-10 h-10 text-indigo-600" />
                        <div>
                          <p className="font-medium text-gray-900">
                            Browse Files
                          </p>
                          <p className="text-sm text-gray-600">
                            View model files on HF
                          </p>
                        </div>
                      </a>
                      <a
                        href={`${model.huggingface_model_url}/discussions`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-3 p-4 bg-white rounded-lg hover:shadow-md transition-shadow"
                      >
                        <GitBranch className="w-10 h-10 text-purple-600" />
                        <div>
                          <p className="font-medium text-gray-900">
                            Discussions
                          </p>
                          <p className="text-sm text-gray-600">
                            Join the conversation
                          </p>
                        </div>
                      </a>
                      <Link
                        href={`/datasets/${model.dataset_url.split('/').pop()}`}
                        className="flex items-center gap-3 p-4 bg-white rounded-lg hover:shadow-md transition-shadow"
                      >
                        <Database className="w-10 h-10 text-green-600" />
                        <div>
                          <p className="font-medium text-gray-900">
                            Training Dataset
                          </p>
                          <p className="text-sm text-gray-600">
                            View source data
                          </p>
                        </div>
                      </Link>
                    </div>
                  </div>
                </div>
              )}

              {/* Configuration Tab */}
              {activeTab === 'config' && (
                <div className="space-y-6">
                  {/* Hyperparameters */}
                  <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-6 border border-blue-100">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center">
                        <Code className="w-5 h-5 text-white" />
                      </div>
                      <h3 className="text-lg font-semibold text-gray-900">
                        Hyperparameters
                      </h3>
                    </div>
                    <div className="grid md:grid-cols-2 gap-4">
                      <div className="space-y-3">
                        <div className="bg-white/80 backdrop-blur-sm rounded-lg p-4">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-medium text-gray-700">
                              Learning Rate
                            </span>
                            <span className="text-sm font-mono text-gray-900">
                              {model.hyperparameters.learning_rate}
                            </span>
                          </div>
                          <div className="w-full bg-blue-100 rounded-full h-2">
                            <div
                              className="bg-blue-500 rounded-full h-2"
                              style={{
                                width: `${
                                  (model.hyperparameters.learning_rate /
                                    0.001) *
                                  100
                                }%`,
                              }}
                            />
                          </div>
                        </div>
                        <div className="bg-white/80 backdrop-blur-sm rounded-lg p-4">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-gray-700">
                              Batch Size
                            </span>
                            <span className="text-sm font-mono text-gray-900">
                              {
                                model.hyperparameters
                                  .per_device_train_batch_size
                              }
                            </span>
                          </div>
                        </div>
                        <div className="bg-white/80 backdrop-blur-sm rounded-lg p-4">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-gray-700">
                              Gradient Accumulation
                            </span>
                            <span className="text-sm font-mono text-gray-900">
                              {
                                model.hyperparameters
                                  .gradient_accumulation_steps
                              }
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="space-y-3">
                        <div className="bg-white/80 backdrop-blur-sm rounded-lg p-4">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-gray-700">
                              Logging Steps
                            </span>
                            <span className="text-sm font-mono text-gray-900">
                              {model.hyperparameters.logging_steps}
                            </span>
                          </div>
                        </div>
                        <div className="bg-white/80 backdrop-blur-sm rounded-lg p-4">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-gray-700">
                              Save Steps
                            </span>
                            <span className="text-sm font-mono text-gray-900">
                              {model.hyperparameters.save_steps}
                            </span>
                          </div>
                        </div>
                        <div className="bg-white/80 backdrop-blur-sm rounded-lg p-4">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-gray-700">
                              Text Column
                            </span>
                            <span className="text-sm font-mono text-gray-900">
                              {model.hyperparameters.text_column}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Training Infrastructure */}
                  <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-xl p-6 border border-purple-100">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-600 rounded-lg flex items-center justify-center">
                        <HardDrive className="w-5 h-5 text-white" />
                      </div>
                      <h3 className="text-lg font-semibold text-gray-900">
                        Training Infrastructure
                      </h3>
                    </div>
                    <div className="space-y-4">
                      <div className="bg-white/80 backdrop-blur-sm rounded-lg p-4">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-gray-700">
                            Platform
                          </span>
                          <span className="text-sm font-medium text-gray-900 capitalize">
                            {model.platform.replace('_', ' ')}
                          </span>
                        </div>
                      </div>
                      <div className="bg-white/80 backdrop-blur-sm rounded-lg p-4">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-gray-700">
                            Hardware
                          </span>
                          <span className="text-sm font-medium text-gray-900">
                            {getHardwareDisplayName(
                              model.training_script_config.hf_space_hardware
                            )}
                          </span>
                        </div>
                      </div>
                      <div className="bg-white/80 backdrop-blur-sm rounded-lg p-4">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-gray-700">
                            Training Script
                          </span>
                          <span className="text-sm font-mono text-gray-900">
                            {model.training_script_config.training_script_name}
                          </span>
                        </div>
                      </div>
                      <div className="bg-white/80 backdrop-blur-sm rounded-lg p-4">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-gray-700">
                            Output Directory
                          </span>
                          <span className="text-sm font-mono text-gray-900">
                            {
                              model.training_script_config
                                .model_output_dir_in_space
                            }
                          </span>
                        </div>
                      </div>
                      <div className="bg-white/80 backdrop-blur-sm rounded-lg p-4">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-gray-700">
                            Repository Visibility
                          </span>
                          <span className="text-sm font-medium text-gray-900">
                            {model.training_script_config.hf_private_repos
                              ? 'Private'
                              : 'Public'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Metrics Tab */}
              {activeTab === 'metrics' && (
                <div className="space-y-6">
                  {/* Performance Metrics */}
                  <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl p-6 border border-green-100">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 bg-gradient-to-br from-green-500 to-emerald-600 rounded-lg flex items-center justify-center">
                        <BarChart3 className="w-5 h-5 text-white" />
                      </div>
                      <h3 className="text-lg font-semibold text-gray-900">
                        Performance Metrics
                      </h3>
                    </div>
                    <div className="grid md:grid-cols-2 gap-6">
                      <div className="space-y-4">
                        <div className="bg-white/80 backdrop-blur-sm rounded-lg p-6">
                          <div className="flex items-center justify-between mb-3">
                            <span className="text-sm font-medium text-gray-700">
                              Training Loss
                            </span>
                            <span className="text-2xl font-bold text-gray-900">
                              {model.metrics?.final_loss.toFixed(4)}
                            </span>
                          </div>
                          <div className="w-full bg-green-100 rounded-full h-3">
                            <div
                              className="bg-gradient-to-r from-green-500 to-emerald-500 rounded-full h-3"
                              style={{
                                width: `${Math.max(
                                  10,
                                  100 - (model.metrics?.final_loss || 0) * 100
                                )}%`,
                              }}
                            />
                          </div>
                        </div>
                        {model.metrics?.eval_loss && (
                          <div className="bg-white/80 backdrop-blur-sm rounded-lg p-6">
                            <div className="flex items-center justify-between mb-3">
                              <span className="text-sm font-medium text-gray-700">
                                Evaluation Loss
                              </span>
                              <span className="text-2xl font-bold text-gray-900">
                                {model.metrics.eval_loss.toFixed(4)}
                              </span>
                            </div>
                            <div className="w-full bg-blue-100 rounded-full h-3">
                              <div
                                className="bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full h-3"
                                style={{
                                  width: `${Math.max(
                                    10,
                                    100 - (model.metrics.eval_loss || 0) * 100
                                  )}%`,
                                }}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                      <div className="space-y-4">
                        {model.metrics?.final_perplexity && (
                          <div className="bg-white/80 backdrop-blur-sm rounded-lg p-6">
                            <div className="flex items-center justify-between mb-3">
                              <span className="text-sm font-medium text-gray-700">
                                Perplexity
                              </span>
                              <span className="text-2xl font-bold text-gray-900">
                                {model.metrics.final_perplexity.toFixed(3)}
                              </span>
                            </div>
                            <div className="text-sm text-gray-600">
                              Lower is better • Baseline: 2.500
                            </div>
                          </div>
                        )}
                        <div className="bg-white/80 backdrop-blur-sm rounded-lg p-6">
                          <div className="flex items-center justify-between mb-3">
                            <span className="text-sm font-medium text-gray-700">
                              Training Efficiency
                            </span>
                            <span className="text-2xl font-bold text-green-600">
                              95%
                            </span>
                          </div>
                          <div className="text-sm text-gray-600">
                            GPU utilization during training
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Training Statistics */}
                  <div className="bg-gray-50 rounded-xl p-6">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">
                      Training Statistics
                    </h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="bg-white rounded-lg p-4 text-center">
                        <p className="text-3xl font-bold text-indigo-600">
                          {formatNumber(model.metrics?.total_steps || 0)}
                        </p>
                        <p className="text-sm text-gray-600 mt-1">
                          Total Steps
                        </p>
                      </div>
                      <div className="bg-white rounded-lg p-4 text-center">
                        <p className="text-3xl font-bold text-purple-600">
                          {model.hyperparameters.epochs}
                        </p>
                        <p className="text-sm text-gray-600 mt-1">Epochs</p>
                      </div>
                      <div className="bg-white rounded-lg p-4 text-center">
                        <p className="text-3xl font-bold text-green-600">
                          {model.metrics?.training_time_hours.toFixed(1)}h
                        </p>
                        <p className="text-sm text-gray-600 mt-1">
                          Training Time
                        </p>
                      </div>
                      <div className="bg-white rounded-lg p-4 text-center">
                        <p className="text-3xl font-bold text-blue-600">
                          ${((model.metrics?.gpu_hours || 0) * 2.5).toFixed(2)}
                        </p>
                        <p className="text-sm text-gray-600 mt-1">
                          Estimated Cost
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Lineage Tab */}
              {activeTab === 'lineage' && (
                <div className="space-y-6">
                  {/* Training Timeline */}
                  <div className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-xl p-6 border border-indigo-100">
                    <div className="flex items-center gap-3 mb-6">
                      <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center">
                        <GitBranch className="w-5 h-5 text-white" />
                      </div>
                      <h3 className="text-lg font-semibold text-gray-900">
                        Training Timeline
                      </h3>
                    </div>

                    <div className="relative">
                      <div className="absolute left-4 top-8 bottom-8 w-0.5 bg-indigo-200"></div>

                      {/* Timeline Events */}
                      <div className="space-y-6">
                        <div className="flex items-start gap-4">
                          <div className="w-8 h-8 bg-indigo-600 rounded-full flex items-center justify-center flex-shrink-0 z-10">
                            <Sparkles className="w-4 h-4 text-white" />
                          </div>
                          <div className="flex-1 bg-white rounded-lg p-4 shadow-sm">
                            <div className="flex items-center justify-between mb-2">
                              <span className="font-medium text-gray-900">
                                Training Started
                              </span>
                              <span className="text-sm text-gray-500">
                                {new Date(model.created_at).toLocaleString()}
                              </span>
                            </div>
                            <p className="text-sm text-gray-600">
                              Initialized training job on{' '}
                              {getHardwareDisplayName(
                                model.training_script_config.hf_space_hardware
                              )}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-start gap-4">
                          <div className="w-8 h-8 bg-purple-600 rounded-full flex items-center justify-center flex-shrink-0 z-10">
                            <Database className="w-4 h-4 text-white" />
                          </div>
                          <div className="flex-1 bg-white rounded-lg p-4 shadow-sm">
                            <div className="flex items-center justify-between mb-2">
                              <span className="font-medium text-gray-900">
                                Dataset Loaded
                              </span>
                              <span className="text-sm text-gray-500">
                                +2 min
                              </span>
                            </div>
                            <p className="text-sm text-gray-600">
                              Loaded training data from Filecoin storage
                            </p>
                            <code className="text-xs font-mono text-gray-500 mt-1 block">
                              {model.dataset_url.split('/').pop()}
                            </code>
                          </div>
                        </div>

                        <div className="flex items-start gap-4">
                          <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center flex-shrink-0 z-10">
                            <Zap className="w-4 h-4 text-white" />
                          </div>
                          <div className="flex-1 bg-white rounded-lg p-4 shadow-sm">
                            <div className="flex items-center justify-between mb-2">
                              <span className="font-medium text-gray-900">
                                Training Progress
                              </span>
                              <span className="text-sm text-gray-500">
                                +{model.metrics?.training_time_hours.toFixed(1)}
                                h
                              </span>
                            </div>
                            <p className="text-sm text-gray-600">
                              Completed{' '}
                              {formatNumber(model.metrics?.total_steps || 0)}{' '}
                              training steps across{' '}
                              {model.hyperparameters.epochs} epoch(s)
                            </p>
                          </div>
                        </div>

                        <div className="flex items-start gap-4">
                          <div className="w-8 h-8 bg-green-600 rounded-full flex items-center justify-center flex-shrink-0 z-10">
                            <CheckCircle className="w-4 h-4 text-white" />
                          </div>
                          <div className="flex-1 bg-white rounded-lg p-4 shadow-sm">
                            <div className="flex items-center justify-between mb-2">
                              <span className="font-medium text-gray-900">
                                Training Completed
                              </span>
                              <span className="text-sm text-gray-500">
                                {model.completed_at
                                  ? new Date(
                                      model.completed_at
                                    ).toLocaleString()
                                  : 'N/A'}
                              </span>
                            </div>
                            <p className="text-sm text-gray-600">
                              Model successfully trained and uploaded to Hugging
                              Face
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Data Provenance */}
                  <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl p-6 border border-gray-200">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 bg-gradient-to-br from-gray-700 to-gray-900 rounded-lg flex items-center justify-center">
                        <Shield className="w-5 h-5 text-white" />
                      </div>
                      <h3 className="text-lg font-semibold text-gray-900">
                        Data Provenance
                      </h3>
                    </div>

                    <div className="space-y-4">
                      <div className="bg-white rounded-lg p-4">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium text-gray-700">
                            Base Model
                          </span>
                          <a
                            href={`https://huggingface.co/${model.hyperparameters.base_model_id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm font-mono text-indigo-600 hover:text-indigo-700 flex items-center gap-1"
                          >
                            {model.hyperparameters.base_model_id}
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>
                      </div>

                      <div className="bg-white rounded-lg p-4">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium text-gray-700">
                            Training Dataset
                          </span>
                          <Link
                            href={`/datasets/${model.dataset_url
                              .split('/')
                              .pop()}`}
                            className="text-sm text-indigo-600 hover:text-indigo-700 flex items-center gap-1"
                          >
                            View Dataset
                            <ChevronRight className="w-3 h-3" />
                          </Link>
                        </div>
                        <code className="text-xs font-mono text-gray-500 break-all">
                          {model.dataset_url}
                        </code>
                      </div>

                      <div className="bg-white rounded-lg p-4">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium text-gray-700">
                            Creator
                          </span>
                          <code className="text-sm font-mono text-gray-900">
                            {model.user_wallet_address.slice(0, 6)}...
                            {model.user_wallet_address.slice(-4)}
                          </code>
                        </div>
                      </div>

                      <div className="bg-white rounded-lg p-4">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-gray-700">
                            Training Platform
                          </span>
                          <span className="text-sm font-medium text-gray-900 capitalize">
                            {model.platform.replace('_', ' ')}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Related Models */}
          <div className="bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50 rounded-2xl p-8">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-semibold text-gray-900 display-font">
                Related Models
              </h2>
              <Link
                href="/models"
                className="flex items-center gap-2 text-sm font-medium text-indigo-600 hover:text-indigo-700"
              >
                View all
                <ChevronRight className="w-4 h-4" />
              </Link>
            </div>
            <div className="text-center py-8">
              <p className="text-gray-500">
                Related models trained on similar datasets will be shown here
              </p>
            </div>
          </div>
        </motion.div>
      </div>
    </Layout>
  );
}
