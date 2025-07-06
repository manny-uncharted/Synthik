/* eslint-disable @typescript-eslint/no-explicit-any */
import { motion } from 'framer-motion';
import Link from 'next/link';
import {
  Check,
  Loader2,
  Sparkles,
  AlertCircle,
  ExternalLink,
  Rocket,
  Database,
  Shield,
  Zap,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { usePrivyEthers } from '../../hooks/usePrivyEthers';
import { toast } from 'react-toastify';

interface TrainingJob {
  id: string;
  job_name: string;
  user_wallet_address: string;
  dataset_url: string;
  file_type: string;
  platform: string;
  user_credential_id: string;
  model_type: string;
  hyperparameters: Record<string, any>;
  training_script_config: Record<string, any>;
  status: 'pending' | 'running' | 'completed' | 'failed';
  external_job_id?: string;
  metrics?: Record<string, any>;
  output_model_storage_type?: string;
  output_model_url?: string;
  huggingface_model_url?: string;
  logs_url?: string;
  error_message?: string;
  created_at: string;
  updated_at: string;
  started_at?: string;
  completed_at?: string;
}

interface TrainingStatusStepProps {
  selectedModel: string;
  selectedTarget: string;
  modelParams: {
    epochs: number;
    batchSize: number;
    learningRate: number;
    maxLength: number;
  };
  dataset: {
    id: string;
    name: string;
    datasetCid: string;
    format: string;
  };
  onJobCreated?: (job: TrainingJob) => void;
  isTestnet?: boolean;
}

const baseUrl = process.env.NEXT_PUBLIC_BASE_URL;

// Generate dynamic job name
const generateJobName = (modelName: string, datasetName: string): string => {
  const timestamp = new Date().toISOString().slice(0, 19).replace(/[-:]/g, '');
  const modelShort = modelName.split('/').pop()?.split('-')[0] || 'Model';
  const datasetShort = (datasetName || 'Dataset')
    .split(' ')
    .slice(0, 2)
    .join('-');
  return `${modelShort}-${datasetShort}-${timestamp}`;
};

// Map model IDs to their actual names and types
const getModelConfig = (modelId: string) => {
  const modelMap: Record<
    string,
    { name: string; type: string; category: string }
  > = {
    'pythia-70m': {
      name: 'EleutherAI/pythia-70m-deduped',
      type: 'CAUSAL_LM',
      category: 'CAUSAL_LM',
    },
    'qwen2.5-1.5b': {
      name: 'chansung/Qwen2.5-1.5B-CCRL-CUR-UNI-1E',
      type: 'CAUSAL_LM',
      category: 'CAUSAL_LM',
    },
    'bert-base': {
      name: 'bert-base-uncased',
      type: 'SEQUENCE_CLASSIFICATION',
      category: 'NLP',
    },
    'xlm-roberta': {
      name: 'xlm-roberta-base',
      type: 'SEQUENCE_CLASSIFICATION',
      category: 'NLP',
    },
  };

  return (
    modelMap[modelId] || {
      name: 'EleutherAI/pythia-70m-deduped',
      type: 'CAUSAL_LM',
      category: 'CAUSAL_LM',
    }
  );
};

export default function TrainingStatusStep({
  selectedModel,
  selectedTarget,
  modelParams,
  dataset,
  onJobCreated,
  isTestnet = true, // Default to testnet mode
}: TrainingStatusStepProps) {
  const { address, signer } = usePrivyEthers();
  const [trainingJob, setTrainingJob] = useState<TrainingJob | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pollingInterval, setPollingInterval] = useState<NodeJS.Timeout | null>(
    null
  );
  const [simulationProgress, setSimulationProgress] = useState(0);
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isFinalized, setIsFinalized] = useState(false);
  const [publishedModelCid, setPublishedModelCid] = useState<string | null>(
    null
  );

  // Simulate training progress
  const simulateTraining = async () => {
    // For simulation mode, we don't strictly need a wallet
    const simulatedAddress =
      address || '0x0000000000000000000000000000000000000000';

    setIsSubmitting(true);
    // Reset progress for new simulation
    setSimulationProgress(0);

    try {
      const modelConfig = getModelConfig(selectedModel);
      const jobName = generateJobName(
        modelConfig.name,
        dataset?.name || 'UnknownDataset'
      );

      // Create a simulated job with safe defaults
      const simulatedJob: TrainingJob = {
        id: `sim-${Date.now()}`,
        job_name: jobName,
        user_wallet_address: simulatedAddress,
        dataset_url: `https://demo.calibration.filcdn.io/${
          dataset?.datasetCid || 'simulation-cid'
        }`,
        file_type: 'csv',
        platform: 'hugging_face',
        user_credential_id: 'simulation-credential',
        model_type: modelConfig.type,
        hyperparameters: {
          base_model_id: modelConfig.name,
          model_task_type: modelConfig.type,
          epochs: modelParams?.epochs || 3,
          learning_rate: modelParams?.learningRate || 0.0002,
          per_device_train_batch_size: modelParams?.batchSize || 4,
          max_seq_length: modelParams?.maxLength || 512,
        },
        training_script_config: {},
        status: 'pending',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      setTrainingJob(simulatedJob);
      onJobCreated?.(simulatedJob);

      toast.success('🚀 Training Job started!');

      // Start simulation progress
      setTimeout(() => {
        setTrainingJob((prev) =>
          prev
            ? {
                ...prev,
                status: 'running',
                started_at: new Date().toISOString(),
              }
            : null
        );

        // Simulate progress updates
        const progressInterval = setInterval(() => {
          setSimulationProgress((prev) => {
            if (prev >= 100) {
              clearInterval(progressInterval);
              setTrainingJob((currentJob) =>
                currentJob
                  ? {
                      ...currentJob,
                      status: 'completed',
                      completed_at: new Date().toISOString(),
                      output_model_url: `https://simulated-model-${Date.now()}.safetensors`,
                      metrics: {
                        loss: Math.random() * 0.5 + 0.1, // Random loss between 0.1-0.6
                        accuracy: Math.random() * 0.2 + 0.8, // Random accuracy between 0.8-1.0
                        eval_loss: Math.random() * 0.3 + 0.2, // Random eval loss between 0.2-0.5
                      },
                    }
                  : null
              );
              toast.success('✨ Training completed!');
              return 100;
            }
            return prev + 1; // Increment by 1% instead of 5%
          });
        }, 3000); // Every 3 seconds instead of 300ms (5 minutes total)
      }, 1500);
    } catch (error) {
      console.error('Failed to start Training Job:', error);
      toast.error(
        `Failed to start Training Job: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  // Publish to Filecoin simulation
  const publishToFilecoin = async () => {
    if (!signer) {
      toast.error('Please connect your wallet first');
      return;
    }

    setIsPublishing(true);

    try {
      // Step 1: Sign message
      const message = `Publish Model Metadata to Filecoin\n\nModel: ${
        trainingJob?.job_name
      }\nTimestamp: ${new Date().toISOString()}\n\nBy signing this message, you authorize the publication of your trained model metadata to the Filecoin network for permanent decentralized storage.`;

      toast.info('Please sign the message to publish your model...');

      const signature = await signer.signMessage(message);

      if (!signature) {
        throw new Error('Message signature required');
      }

      // Step 2: Simulate publishing process
      toast.success('Message signed! Publishing to Filecoin...');
      await new Promise((resolve) => setTimeout(resolve, 3000));

      // Generate a simulated IPFS CID
      const simulatedCid = `bafybeig${Math.random()
        .toString(36)
        .substring(2, 15)}dwhb4wdhbwdhb4wdhbwdhbwdhb4wdhbwdhb`;
      setPublishedModelCid(simulatedCid);

      toast.success('🎉 Model published to Filecoin successfully!');
      setIsFinalized(true);
    } catch (error) {
      console.error('Failed to publish model:', error);
      toast.error('Failed to publish model. Please try again.');
    } finally {
      setIsPublishing(false);
      setShowPublishModal(false);
    }
  };

  // Submit training job
  const submitTrainingJob = async () => {
    if (isTestnet) {
      return simulateTraining();
    }

    if (!address) {
      toast.error('Connect your wallet first');
      return;
    }

    setIsSubmitting(true);

    try {
      const modelConfig = getModelConfig(selectedModel);
      const jobName = generateJobName(
        modelConfig.name,
        dataset?.name || 'UnknownDataset'
      );

      // Build dataset URL from CID
      const datasetUrl = `https://${address}.calibration.filcdn.io/${
        dataset?.datasetCid || 'unknown-cid'
      }`;

      const payload = {
        job_name: jobName,
        user_wallet_address:
          '0x37793860ea65a1e05a9a506ed7b86b084cb9bba5fc9c979da3512464007fa11d',
        dataset_url: datasetUrl,
        file_type: 'csv',
        platform: 'hugging_face',
        user_credential_id: '5b0a3997-d285-45e4-9542-132d92ad6a27',
        model_type: 'CAUSAL_LM',
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
      };

      const response = await fetch(`${baseUrl}/mlops/training-jobs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to submit training job');
      }

      const job = await response.json();
      setTrainingJob(job);
      onJobCreated?.(job);

      toast.success('Training job submitted successfully!');

      // Start polling for status updates
      startPolling(job.id);
    } catch (error) {
      console.error('Failed to submit training job:', error);
      toast.error(`Failed to submit job: ${error}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Poll training job status
  const pollJobStatus = async (jobId: string) => {
    try {
      const response = await fetch(`${baseUrl}/mlops/training-jobs/${jobId}`);
      if (response.ok) {
        const updatedJob = await response.json();
        setTrainingJob(updatedJob);

        // Stop polling if job is completed or failed
        if (
          updatedJob.status === 'completed' ||
          updatedJob.status === 'failed'
        ) {
          stopPolling();

          if (updatedJob.status === 'completed') {
            toast.success('Training completed successfully!');
          } else if (updatedJob.status === 'failed') {
            toast.error(
              `Training failed: ${updatedJob.error_message || 'Unknown error'}`
            );
          }
        }
      }
    } catch (error) {
      console.error('Failed to poll job status:', error);
    }
  };

  const startPolling = (jobId: string) => {
    const interval = setInterval(() => {
      pollJobStatus(jobId);
    }, 5000); // Poll every 5 seconds

    setPollingInterval(interval);
  };

  const stopPolling = () => {
    if (pollingInterval) {
      clearInterval(pollingInterval);
      setPollingInterval(null);
    }
  };

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      stopPolling();
    };
  }, []);

  const isTraining =
    trainingJob?.status === 'pending' || trainingJob?.status === 'running';
  const isCompleted = trainingJob?.status === 'completed';
  const isFailed = trainingJob?.status === 'failed';

  return (
    <div className="text-center py-12">
      {!trainingJob ? (
        // Initial state - ready to submit
        <div>
          <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <Sparkles className="w-8 h-8 text-indigo-600" />
          </div>
          <h2 className="text-2xl font-semibold text-gray-900 mb-2 display-font">
            Ready to Train
          </h2>
          <p className="text-gray-600 mb-8">
            Your model configuration is ready. Click below to start training.
          </p>

          <button
            onClick={submitTrainingJob}
            disabled={isSubmitting}
            className="px-8 py-3 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 mx-auto"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Submitting...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                Start Training
              </>
            )}
          </button>
        </div>
      ) : isFinalized ? (
        // Finalized state - Model published to Filecoin
        <>
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{
              type: 'spring',
              stiffness: 260,
              damping: 20,
            }}
            className="w-24 h-24 bg-gradient-to-br from-purple-500 to-pink-600 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg"
          >
            <Rocket className="w-12 h-12 text-white" />
          </motion.div>
          <h2 className="text-3xl font-semibold text-gray-900 mb-2 display-font">
            Training Finalized! 🚀
          </h2>
          <p className="text-gray-600 mb-2">
            Your model has been successfully published to Filecoin
          </p>
          <p className="text-sm text-gray-500 mb-6">
            Model: {trainingJob?.job_name}
          </p>

          {/* Publication details */}
          <div className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-xl p-6 max-w-md mx-auto mb-8">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full flex items-center justify-center">
                <Database className="w-5 h-5 text-white" />
              </div>
              <div className="text-left">
                <h3 className="font-semibold text-gray-900">
                  Published to Filecoin
                </h3>
                <p className="text-sm text-gray-600">
                  Permanent decentralized storage
                </p>
              </div>
            </div>
            {publishedModelCid && (
              <div className="bg-white rounded-lg p-3 text-left">
                <p className="text-xs text-gray-500 mb-1">IPFS CID</p>
                <p className="text-sm font-mono text-gray-700 break-all">
                  {publishedModelCid}
                </p>
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex flex-col sm:flex-row justify-center gap-4">
            <Link
              href="/models"
              className="px-8 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl font-medium hover:from-indigo-700 hover:to-purple-700 transition-all shadow-lg flex items-center gap-2 justify-center"
            >
              <Database className="w-5 h-5" />
              View All Models
            </Link>
            <button
              onClick={() => {
                setTrainingJob(null);
                setIsFinalized(false);
                setPublishedModelCid(null);
                setSimulationProgress(0);
              }}
              className="px-6 py-3 border border-gray-200 rounded-xl font-medium hover:border-gray-300 transition-colors flex items-center gap-2 justify-center"
            >
              <Sparkles className="w-4 h-4" />
              Train Another Model
            </button>
          </div>
        </>
      ) : isTraining ? (
        // Training in progress
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
          <p className="text-gray-600 mb-4">Job: {trainingJob.job_name}</p>
          <p className="text-sm text-gray-500 mb-8">
            Status: {trainingJob.status} • Started:{' '}
            {trainingJob.started_at
              ? new Date(trainingJob.started_at).toLocaleString()
              : 'Pending'}
          </p>

          {/* Progress indicators */}
          <div className="max-w-md mx-auto space-y-4">
            <div className="bg-gray-50 rounded-lg p-4 text-left">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-700">
                  Job submitted
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
                  animate={{
                    width: isTestnet
                      ? `${simulationProgress}%`
                      : trainingJob.status === 'running'
                      ? '60%'
                      : '20%',
                  }}
                  transition={{ duration: isTestnet ? 0.5 : 2 }}
                  className="bg-indigo-600 h-2 rounded-full"
                />
              </div>
              {isTestnet && simulationProgress > 0 && (
                <p className="text-xs text-gray-500 mt-1">
                  {simulationProgress}%
                </p>
              )}
            </div>
            <div className="bg-gray-50 rounded-lg p-4 text-left">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-700">
                  Deploying model artifacts to {selectedTarget}
                </span>
                <div className="w-4 h-4 rounded-full bg-gray-300" />
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2" />
            </div>
          </div>

          {/* External links */}
          {trainingJob.logs_url && (
            <div className="mt-8">
              <a
                href={trainingJob.logs_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-indigo-600 hover:text-indigo-700 text-sm font-medium"
              >
                <ExternalLink className="w-4 h-4" />
                View Training Logs
              </a>
            </div>
          )}
        </>
      ) : isCompleted ? (
        // Training completed - Enhanced UI for simulation mode
        <>
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{
              type: 'spring',
              stiffness: 260,
              damping: 20,
            }}
            className="w-20 h-20 bg-gradient-to-br from-green-400 to-emerald-600 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg"
          >
            <Check className="w-10 h-10 text-white" />
          </motion.div>
          <h2 className="text-3xl font-semibold text-gray-900 mb-2 display-font">
            Model Successfully Trained! 🎉
          </h2>
          <p className="text-gray-600 mb-2">{trainingJob.job_name}</p>
          <p className="text-sm text-gray-500 mb-6">
            Completed:{' '}
            {trainingJob.completed_at
              ? new Date(trainingJob.completed_at).toLocaleString()
              : 'Recently'}
          </p>

          {/* Action buttons */}
          <div className="flex flex-col sm:flex-row justify-center gap-4">
            {isTestnet ? (
              <>
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setShowPublishModal(true)}
                  className="px-8 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl font-medium hover:from-indigo-700 hover:to-purple-700 transition-all shadow-lg flex items-center gap-2 justify-center"
                >
                  <Rocket className="w-5 h-5" />
                  Publish Model Metadata on Filecoin
                </motion.button>
                <Link
                  href="/train-model"
                  className="px-6 py-3 border border-gray-200 rounded-xl font-medium hover:border-gray-300 transition-colors flex items-center gap-2 justify-center"
                >
                  Train Another Model
                </Link>
              </>
            ) : (
              <>
                {trainingJob.huggingface_model_url && (
                  <a
                    href={trainingJob.huggingface_model_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-6 py-3 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 transition-colors flex items-center gap-2"
                  >
                    <ExternalLink className="w-4 h-4" />
                    View on Hugging Face
                  </a>
                )}
                <Link
                  href="/train-model"
                  className="px-6 py-3 border border-gray-200 rounded-xl font-medium hover:border-gray-300 transition-colors"
                >
                  Train Another
                </Link>
              </>
            )}
          </div>
        </>
      ) : isFailed ? (
        // Training failed
        <>
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <AlertCircle className="w-8 h-8 text-red-600" />
          </div>
          <h2 className="text-2xl font-semibold text-gray-900 mb-2 display-font">
            Training Failed
          </h2>
          <p className="text-gray-600 mb-4">{trainingJob.job_name}</p>
          <p className="text-sm text-red-600 mb-8">
            Error: {trainingJob.error_message || 'Unknown error occurred'}
          </p>
          <div className="flex justify-center gap-4">
            <button
              onClick={() => setTrainingJob(null)}
              className="px-6 py-3 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 transition-colors"
            >
              Try Again
            </button>
            <Link
              href="/train-model"
              className="px-6 py-3 border border-gray-200 rounded-xl font-medium hover:border-gray-300 transition-colors"
            >
              Start Over
            </Link>
          </div>
        </>
      ) : null}

      {/* Publish to Filecoin Modal */}
      {showPublishModal && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
          onClick={() => setShowPublishModal(false)}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-2xl p-8 max-w-md w-full shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-center w-16 h-16 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full mx-auto mb-6">
              <Database className="w-8 h-8 text-white" />
            </div>
            <h3 className="text-2xl font-bold text-gray-900 mb-4 text-center">
              Publish to Filecoin
            </h3>
            <p className="text-gray-600 mb-6 text-center">
              Make your trained model permanently available on the decentralized
              web
            </p>

            <div className="space-y-4 mb-6">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Shield className="w-4 h-4 text-green-600" />
                </div>
                <div>
                  <h4 className="font-medium text-gray-900">
                    Permanent Storage
                  </h4>
                  <p className="text-sm text-gray-600">
                    Your model will be stored permanently via Filecoin
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Zap className="w-4 h-4 text-blue-600" />
                </div>
                <div>
                  <h4 className="font-medium text-gray-900">FilCDN Enabled</h4>
                  <p className="text-sm text-gray-600">
                    Cached for quick retrieval when needed
                  </p>
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowPublishModal(false)}
                className="flex-1 px-6 py-3 border border-gray-200 rounded-xl font-medium hover:border-gray-300 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={publishToFilecoin}
                disabled={isPublishing}
                className="flex-1 px-6 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl font-medium hover:from-indigo-700 hover:to-purple-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isPublishing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Publishing...
                  </>
                ) : (
                  <>
                    <Rocket className="w-4 h-4" />
                    Publish
                  </>
                )}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </div>
  );
}
