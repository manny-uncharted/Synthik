import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
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
  Sparkles,
} from 'lucide-react';
import {
  DatasetPreviewStep,
  ModelSelectionStep,
  DeploymentTargetStep,
  TrainingStatusStep,
} from '../components/model';

// Dataset and metadata interfaces
interface DatasetResponse {
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

interface DatasetMetadata {
  name: string;
  description: string;
  schema: Array<{
    name: string;
    type: string;
    description: string;
  }>;
  totalRows: number;
  format: string;
  license: string;
  visibility: string;
  generationTime: number;
  tokensUsed: number;
  generationCost: number;
  version: string;
  timestamp: number;
}

interface ModelParams {
  epochs: number;
  batchSize: number;
  learningRate: number;
  maxLength: number;
}

// CSV parsing utility function (same as in dataset details)
function parseCSV(csvText: string): Record<string, string | number>[] {
  let processedText = csvText.trim();

  // Handle case where CSV might be on a single line with spaces instead of newlines
  if (!processedText.includes('\n') && processedText.includes('ID_')) {
    const parts = processedText.split(' ID_');
    if (parts.length > 1) {
      const firstPart = parts[0];
      if (firstPart.includes('id,name,value,created_at')) {
        const headerMatch = firstPart.match(
          /(id,name,value,created_at)\s+(.+)/
        );
        if (headerMatch) {
          const headers = headerMatch[1];
          const firstDataRow = 'ID_' + headerMatch[2];
          const otherRows = parts.slice(1).map((row) => 'ID_' + row);
          processedText =
            headers + '\n' + [firstDataRow, ...otherRows].join('\n');
        }
      }
    }
  }

  const lines = processedText.split('\n').filter((line) => line.trim() !== '');
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map((h) => h.trim().replace(/"/g, ''));
  const dataLines = lines.slice(1);

  const data = dataLines.map((line) => {
    const values = line.split(',').map((v) => v.trim().replace(/"/g, ''));
    const row: Record<string, string | number> = {};

    headers.forEach((header, headerIndex) => {
      const value = values[headerIndex] || '';
      const numValue = Number(value);
      const isValidNumber =
        !isNaN(numValue) && value !== '' && !isNaN(parseFloat(value));
      row[header] = isValidNumber ? numValue : value;
    });

    return row;
  });

  return data.filter((row) => Object.values(row).some((val) => val !== ''));
}

// JSON parsing utility function
function parseJSON(jsonText: string): Record<string, string | number>[] {
  try {
    const parsed = JSON.parse(jsonText);
    if (Array.isArray(parsed)) {
      return parsed;
    } else if (parsed && typeof parsed === 'object') {
      return [parsed];
    } else {
      return [];
    }
  } catch (error) {
    // Try JSONL format
    try {
      const lines = jsonText.trim().split('\n');
      const data = lines
        .filter((line) => line.trim() !== '')
        .map((line) => JSON.parse(line.trim()));
      return data;
    } catch (jsonlError) {
      return [];
    }
  }
}

export default function TrainModel() {
  const router = useRouter();
  const { dataset: datasetId } = router.query;

  const [currentStep, setCurrentStep] = useState(1);
  const [isTraining, setIsTraining] = useState(false);

  // Dataset state
  const [dataset, setDataset] = useState<DatasetResponse | null>(null);
  const [metadata, setMetadata] = useState<DatasetMetadata | null>(null);
  const [previewData, setPreviewData] = useState<
    Record<string, string | number>[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [selectedModel, setSelectedModel] = useState('');
  const [modelParams, setModelParams] = useState<ModelParams>({
    epochs: 1,
    batchSize: 32,
    learningRate: 0.0002,
    maxLength: 512,
  });
  const [selectedTarget, setSelectedTarget] = useState('');
  const [credentials, setCredentials] = useState<Record<string, string>>({});

  // Fetch dataset data
  useEffect(() => {
    if (!datasetId) return;

    const fetchDataset = async () => {
      try {
        setLoading(true);
        setError(null);

        // Fetch dataset details
        const response = await fetch(
          `https://filecoin.bnshub.org/datasets/${datasetId}`
        );
        if (!response.ok) {
          throw new Error('Dataset not found');
        }

        const datasetData = await response.json();
        setDataset(datasetData);

        // Fetch metadata if available
        if (datasetData.metadataCid && datasetData.creatorId) {
          try {
            const metadataResponse = await fetch(
              `https://${datasetData.creatorId}.calibration.filcdn.io/${datasetData.metadataCid}`
            );
            if (metadataResponse.ok) {
              const metadataData = await metadataResponse.json();
              setMetadata(metadataData);
            }
          } catch (metadataError) {
            console.warn('Failed to fetch metadata:', metadataError);
          }
        }

        // Fetch preview data if available
        if (datasetData.datasetPreviewCid && datasetData.creatorId) {
          try {
            const previewUrl = `https://${datasetData.creatorId}.calibration.filcdn.io/${datasetData.datasetPreviewCid}`;
            const previewResponse = await fetch(previewUrl);

            if (previewResponse.ok) {
              const responseText = await previewResponse.text();
              let parsedData: Record<string, string | number>[] = [];

              // Parse based on dataset format
              if (datasetData.format?.toLowerCase() === 'json') {
                parsedData = parseJSON(responseText);
              } else {
                parsedData = parseCSV(responseText);
              }

              setPreviewData(parsedData);
            }
          } catch (previewError) {
            console.error('Error fetching preview data:', previewError);
          }
        }

        setLoading(false);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Failed to fetch dataset'
        );
        setLoading(false);
      }
    };

    fetchDataset();
  }, [datasetId]);

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
                href={`/datasets/${datasetId || '1'}`}
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
            {loading ? (
              <div className="bg-white rounded-2xl border border-gray-100 p-8">
                <div className="flex items-center justify-center py-12">
                  <div className="flex items-center gap-3 text-gray-600">
                    <Loader2 className="w-6 h-6 animate-spin" />
                    <span>Loading dataset...</span>
                  </div>
                </div>
              </div>
            ) : error ? (
              <div className="bg-white rounded-2xl border border-gray-100 p-8">
                <div className="text-center py-12">
                  <h2 className="text-2xl font-semibold text-gray-900 mb-2">
                    Dataset Not Found
                  </h2>
                  <p className="text-gray-600 mb-4">{error}</p>
                  <Link
                    href="/datasets"
                    className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    Back to Datasets
                  </Link>
                </div>
              </div>
            ) : dataset ? (
              <AnimatePresence mode="wait">
                <motion.div
                  key={currentStep}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.3 }}
                  className="bg-white rounded-2xl border border-gray-100 p-8"
                >
                  {currentStep === 1 && (
                    <DatasetPreviewStep
                      dataset={dataset}
                      metadata={metadata}
                      previewData={previewData}
                    />
                  )}

                  {currentStep === 2 && (
                    <ModelSelectionStep
                      selectedModel={selectedModel}
                      setSelectedModel={setSelectedModel}
                      modelParams={modelParams}
                      setModelParams={setModelParams}
                    />
                  )}

                  {currentStep === 3 && (
                    <DeploymentTargetStep
                      selectedTarget={selectedTarget}
                      setSelectedTarget={setSelectedTarget}
                      credentials={credentials}
                      setCredentials={setCredentials}
                    />
                  )}

                  {currentStep === 4 && (
                    <TrainingStatusStep
                      isTraining={isTraining}
                      selectedTarget={selectedTarget}
                    />
                  )}
                </motion.div>
              </AnimatePresence>
            ) : null}

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
