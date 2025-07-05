import { motion } from 'framer-motion';
import {
  Download,
  Copy,
  RefreshCw,
  Eye,
  Code,
  AlertCircle,
  ArrowRight,
  CheckCircle,
  Zap,
  Database,
} from 'lucide-react';
import { useState } from 'react';
import FilecoinPublisher from './FilecoinPublisher';
import React from 'react';

interface PreviewData {
  rows: Record<string, string | number | boolean | Date | object>[];
  schema: {
    name: string;
    type: string;
  }[];
  totalRows: number;
  generationTime: number;
  tokensUsed?: number;
  cost?: number;
}

interface FullDatasetData {
  rows: Record<string, string | number | boolean | Date | object>[];
  schema: {
    name: string;
    type: string;
  }[];
  totalRows: number;
  generationTime: number;
  tokensUsed?: number;
  cost?: number;
}

// Storage interfaces for Filecoin publishing
interface StorageEstimate {
  proofsetFee: number;
  storageFee: number;
  bufferAmount: number;
  totalCost: number;
  isFirstTime: boolean;
}

interface PublishProgress {
  stage:
    | 'idle'
    | 'estimating'
    | 'initializing'
    | 'uploading-metadata'
    | 'uploading-data'
    | 'registering'
    | 'completed'
    | 'error';
  metadataProgress: number;
  dataProgress: number;
  message: string;
  error?: string;
  retryCount: number;
}

interface PublishResult {
  metadataCID: string;
  previewDataCID?: string;
  fullDataCID?: string;
  transactionHash?: string;
  timestamp: number;
  usingCDN?: boolean;
}

interface DatasetPreviewProps {
  data: PreviewData | null;
  isGenerating: boolean;
  onRefresh: () => void;
  onExport: (format: 'json' | 'csv', exportFull?: boolean) => void;
  onGenerateFullDataset: () => Promise<FullDatasetData>;
  generationProgress?: number;
  // Dataset configuration for publishing
  config?: {
    name: string;
    description: string;
    schema: { name: string; type: string; description: string }[];
    format: string;
    license: string;
    visibility: string;
    rows: number;
    quality: string;
  };
}

export default function DatasetPreview({
  data,
  isGenerating,
  onRefresh,
  onExport,
  onGenerateFullDataset,
  generationProgress = 0,
  config,
}: DatasetPreviewProps) {
  const [viewMode, setViewMode] = useState<'table' | 'json'>('table');
  const [copiedRow, setCopiedRow] = useState<number | null>(null);
  const [currentStep, setCurrentStep] = useState<
    'preview' | 'generate' | 'publish'
  >('preview');

  // Full dataset state
  const [fullDataset, setFullDataset] = useState<FullDatasetData | null>(null);
  const [isGeneratingFull, setIsGeneratingFull] = useState(false);
  const [fullGenerationProgress, setFullGenerationProgress] = useState(0);

  // Publishing state
  const [publishProgress, setPublishProgress] = useState<PublishProgress>({
    stage: 'idle',
    metadataProgress: 0,
    dataProgress: 0,
    message: '',
    retryCount: 0,
  });
  const [storageEstimate, setStorageEstimate] =
    useState<StorageEstimate | null>(null);
  const [publishResult, setPublishResult] = useState<PublishResult | null>(
    null
  );
  const [showPublishOptions, setShowPublishOptions] = useState(false);

  // Memoize config before any conditional returns to keep Hook order consistent
  const memoConfig = React.useMemo(() => {
    if (config) return config;
    return {
      name: 'Generated Dataset',
      description: 'Synthetically generated dataset',
      schema:
        data?.schema.map((field) => ({
          name: field.name,
          type: field.type,
          description: `${field.type} field`,
        })) || [],
      format: 'JSON',
      license: 'MIT',
      visibility: 'public',
      rows: data?.totalRows || 0,
      quality: 'high',
    };
  }, [config, data]);

  const copyToClipboard = (
    row: Record<string, string | number | boolean | Date | object>,
    index: number
  ) => {
    navigator.clipboard.writeText(JSON.stringify(row, null, 2));
    setCopiedRow(index);
    setTimeout(() => setCopiedRow(null), 2000);
  };

  const formatValue = (
    value: string | number | boolean | Date | object | null | undefined,
    type: string
  ) => {
    if (value === null || value === undefined) return '-';

    switch (type) {
      case 'date':
        return new Date(String(value)).toLocaleDateString();
      case 'boolean':
        return value ? '✓' : '✗';
      case 'json':
        return (
          <code className="text-xs bg-gray-100 px-1 rounded">
            {JSON.stringify(value)}
          </code>
        );
      default:
        return String(value);
    }
  };

  const handleGenerateFullDataset = async () => {
    setIsGeneratingFull(true);
    setFullGenerationProgress(0);
    setCurrentStep('generate');

    try {
      const result = await onGenerateFullDataset();
      setFullDataset(result);
      setCurrentStep('publish');
    } catch (error) {
      console.error('Failed to generate full dataset:', error);
      setCurrentStep('preview');
    } finally {
      setIsGeneratingFull(false);
      setFullGenerationProgress(0);
    }
  };

  if (isGenerating) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 p-12">
        <div className="flex flex-col items-center justify-center space-y-6">
          {/* Animated generation indicator */}
          <div className="relative">
            <div className="w-24 h-24 border-4 border-gray-200 rounded-full"></div>
            <motion.div
              className="absolute inset-0 w-24 h-24 border-4 border-indigo-600 rounded-full border-t-transparent"
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
            />
          </div>

          <div className="text-center">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Generating Dataset...
            </h3>
            <p className="text-sm text-gray-600">
              This may take a few moments depending on your configuration
            </p>
            {generationProgress > 0 && (
              <div className="mt-4">
                <div className="w-64 h-2 bg-gray-200 rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-indigo-600"
                    initial={{ width: 0 }}
                    animate={{ width: `${generationProgress}%` }}
                    transition={{ duration: 0.3 }}
                  />
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  {generationProgress}% complete
                </p>
              </div>
            )}
          </div>

          {/* Progress steps */}
          <div className="flex items-center gap-2 text-sm">
            {['Analyzing schema', 'Generating data', 'Verifying quality'].map(
              (step, index) => (
                <div key={index} className="flex items-center gap-2">
                  <motion.div
                    className={`w-2 h-2 rounded-full ${
                      index === 0 ? 'bg-indigo-600' : 'bg-gray-300'
                    }`}
                    animate={index === 0 ? { scale: [1, 1.5, 1] } : {}}
                    transition={{ duration: 1, repeat: Infinity }}
                  />
                  <span
                    className={index === 0 ? 'text-gray-900' : 'text-gray-400'}
                  >
                    {step}
                  </span>
                </div>
              )
            )}
          </div>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="bg-gray-50 rounded-2xl border-2 border-dashed border-gray-300 p-12">
        <div className="text-center">
          <div className="w-16 h-16 bg-gray-200 rounded-full flex items-center justify-center mx-auto mb-4">
            <Eye className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            No Preview Available
          </h3>
          <p className="text-sm text-gray-600">
            Configure your dataset and click &quot;Generate Preview&quot; to see
            sample data
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Progress Steps */}
      <div className="flex items-center justify-center">
        <div className="flex items-center space-x-8">
          {/* Preview Step */}
          <div className="flex items-center">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center ${
                currentStep === 'preview'
                  ? 'bg-indigo-600 text-white'
                  : ['generate', 'publish'].includes(currentStep)
                  ? 'bg-green-600 text-white'
                  : 'bg-gray-300 text-gray-600'
              }`}
            >
              {['generate', 'publish'].includes(currentStep) ? (
                <CheckCircle className="w-5 h-5" />
              ) : (
                <Eye className="w-5 h-5" />
              )}
            </div>
            <span
              className={`ml-2 text-sm font-medium ${
                currentStep === 'preview'
                  ? 'text-indigo-600'
                  : ['generate', 'publish'].includes(currentStep)
                  ? 'text-green-600'
                  : 'text-gray-500'
              }`}
            >
              Preview
            </span>
          </div>

          <ArrowRight className="w-5 h-5 text-gray-400" />

          {/* Generate Step */}
          <div className="flex items-center">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center ${
                currentStep === 'generate'
                  ? 'bg-indigo-600 text-white'
                  : currentStep === 'publish'
                  ? 'bg-green-600 text-white'
                  : 'bg-gray-300 text-gray-600'
              }`}
            >
              {currentStep === 'publish' ? (
                <CheckCircle className="w-5 h-5" />
              ) : (
                <Database className="w-5 h-5" />
              )}
            </div>
            <span
              className={`ml-2 text-sm font-medium ${
                currentStep === 'generate'
                  ? 'text-indigo-600'
                  : currentStep === 'publish'
                  ? 'text-green-600'
                  : 'text-gray-500'
              }`}
            >
              Full Dataset
            </span>
          </div>

          <ArrowRight className="w-5 h-5 text-gray-400" />

          {/* Publish Step */}
          <div className="flex items-center">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center ${
                currentStep === 'publish'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-300 text-gray-600'
              }`}
            >
              <Zap className="w-5 h-5" />
            </div>
            <span
              className={`ml-2 text-sm font-medium ${
                currentStep === 'publish' ? 'text-indigo-600' : 'text-gray-500'
              }`}
            >
              Publish
            </span>
          </div>
        </div>
      </div>

      {/* Step Content */}
      {currentStep === 'preview' && (
        <div className="space-y-4">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">
                Dataset Preview
              </h3>
              <p className="text-sm text-gray-600">
                Showing {data.rows.length} of {data.totalRows} rows • Generated
                in {data.generationTime}s
                {data.tokensUsed && (
                  <>
                    {' '}
                    • {data.tokensUsed.toLocaleString()} tokens used
                    {data.cost && data.cost > 0 && (
                      <> • ${data.cost.toFixed(4)} cost</>
                    )}
                  </>
                )}
              </p>
            </div>

            <div className="flex items-center gap-2">
              {/* View mode toggle */}
              <div className="flex items-center bg-gray-100 rounded-lg p-1">
                <button
                  onClick={() => setViewMode('table')}
                  className={`px-3 py-1.5 text-sm font-medium rounded transition-colors ${
                    viewMode === 'table'
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <Eye className="w-4 h-4 inline mr-1" />
                  Table
                </button>
                <button
                  onClick={() => setViewMode('json')}
                  className={`px-3 py-1.5 text-sm font-medium rounded transition-colors ${
                    viewMode === 'json'
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <Code className="w-4 h-4 inline mr-1" />
                  JSON
                </button>
              </div>

              <button
                onClick={onRefresh}
                className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Preview Content */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            {viewMode === 'table' ? (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        #
                      </th>
                      {data.schema.map((field, index) => (
                        <th
                          key={index}
                          className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                        >
                          {field.name}
                          <span className="ml-1 text-gray-400 lowercase">
                            ({field.type})
                          </span>
                        </th>
                      ))}
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {data.rows.map((row, rowIndex) => (
                      <motion.tr
                        key={rowIndex}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: rowIndex * 0.05 }}
                        className="hover:bg-gray-50 transition-colors"
                      >
                        <td className="px-4 py-3 text-sm text-gray-500">
                          {rowIndex + 1}
                        </td>
                        {data.schema.map((field, fieldIndex) => (
                          <td
                            key={fieldIndex}
                            className="px-4 py-3 text-sm text-gray-900"
                          >
                            {formatValue(row[field.name], field.type)}
                          </td>
                        ))}
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => copyToClipboard(row, rowIndex)}
                            className="text-gray-400 hover:text-gray-600 transition-colors"
                          >
                            {copiedRow === rowIndex ? (
                              <span className="text-green-600 text-xs">
                                Copied!
                              </span>
                            ) : (
                              <Copy className="w-4 h-4" />
                            )}
                          </button>
                        </td>
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-6">
                <pre className="text-sm text-gray-800 overflow-x-auto">
                  <code>{JSON.stringify(data.rows, null, 2)}</code>
                </pre>
              </div>
            )}
          </div>

          {/* Notice about preview */}
          {data.rows.length < data.totalRows && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-amber-900 mb-1">
                  This is a preview of your dataset
                </p>
                <p className="text-amber-800">
                  You&apos;re viewing {data.rows.length} sample rows. The full
                  dataset contains {data.totalRows.toLocaleString()} rows.
                </p>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-xl p-6">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-semibold text-gray-900 mb-1">Next Steps</h4>
                <p className="text-sm text-gray-600">
                  Export preview, generate full dataset, or publish to Filecoin
                </p>
              </div>
            </div>

            <div className="mt-4 flex items-center gap-4">
              {/* Quick Export Preview */}
              <button
                onClick={() => onExport('csv', false)}
                className="px-4 py-2 bg-white border border-gray-200 rounded-lg hover:border-gray-300 transition-colors flex items-center gap-2 text-sm font-medium"
              >
                <Download className="w-4 h-4" />
                Export Preview
              </button>

              {/* Generate Full Dataset */}
              <button
                onClick={handleGenerateFullDataset}
                disabled={isGeneratingFull}
                className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors flex items-center gap-2 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Database className="w-4 h-4" />
                {isGeneratingFull ? 'Generating...' : 'Generate Full Dataset'}
                <span className="text-xs opacity-75">
                  ({data.totalRows.toLocaleString()} rows)
                </span>
              </button>

              {/* Skip to Publish Preview */}
              <button
                onClick={() => setCurrentStep('publish')}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors flex items-center gap-2 text-sm font-medium"
              >
                <Zap className="w-4 h-4" />
                Publish Preview
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Full Dataset Generation Step */}
      {currentStep === 'generate' && (
        <div className="space-y-4">
          {isGeneratingFull ? (
            <div className="bg-white rounded-2xl border border-gray-200 p-12">
              <div className="flex flex-col items-center justify-center space-y-6">
                <div className="relative">
                  <div className="w-24 h-24 border-4 border-gray-200 rounded-full"></div>
                  <motion.div
                    className="absolute inset-0 w-24 h-24 border-4 border-indigo-600 rounded-full border-t-transparent"
                    animate={{ rotate: 360 }}
                    transition={{
                      duration: 1,
                      repeat: Infinity,
                      ease: 'linear',
                    }}
                  />
                </div>

                <div className="text-center">
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">
                    Generating Full Dataset...
                  </h3>
                  <p className="text-sm text-gray-600">
                    Creating {data.totalRows.toLocaleString()} rows of synthetic
                    data
                  </p>
                  {fullGenerationProgress > 0 && (
                    <div className="mt-4">
                      <div className="w-64 h-2 bg-gray-200 rounded-full overflow-hidden">
                        <motion.div
                          className="h-full bg-indigo-600"
                          initial={{ width: 0 }}
                          animate={{ width: `${fullGenerationProgress}%` }}
                          transition={{ duration: 0.3 }}
                        />
                      </div>
                      <p className="text-xs text-gray-500 mt-2">
                        {fullGenerationProgress}% complete
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : fullDataset ? (
            <div className="space-y-4">
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <div className="flex items-center gap-3">
                  <CheckCircle className="w-5 h-5 text-green-600" />
                  <div>
                    <p className="font-medium text-green-900">
                      Full Dataset Generated Successfully!
                    </p>
                    <p className="text-sm text-green-800">
                      {fullDataset.totalRows.toLocaleString()} rows generated in{' '}
                      {fullDataset.generationTime}s
                      {fullDataset.tokensUsed && (
                        <>
                          {' '}
                          • {fullDataset.tokensUsed.toLocaleString()} tokens
                          used
                          {fullDataset.cost && fullDataset.cost > 0 && (
                            <> • ${fullDataset.cost.toFixed(4)} cost</>
                          )}
                        </>
                      )}
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <button
                  onClick={() => onExport('csv', true)}
                  className="px-4 py-2 bg-white border border-gray-200 rounded-lg hover:border-gray-300 transition-colors flex items-center gap-2 text-sm font-medium"
                >
                  <Download className="w-4 h-4" />
                  Export Full Dataset
                </button>

                <button
                  onClick={() => setCurrentStep('publish')}
                  className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors flex items-center gap-2 text-sm font-medium"
                >
                  <Zap className="w-4 h-4" />
                  Publish to Filecoin
                </button>

                <button
                  onClick={() => setCurrentStep('preview')}
                  className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors text-sm font-medium"
                >
                  Back to Preview
                </button>
              </div>
            </div>
          ) : null}
        </div>
      )}

      {/* Publish Step */}
      {currentStep === 'publish' && (
        <div className="space-y-4">
          <div className="bg-gradient-to-r from-purple-50 to-indigo-50 rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                  Publish to Filecoin
                </h3>
                <p className="text-sm text-gray-600">
                  {fullDataset
                    ? `Publishing both preview (${
                        data.rows.length
                      } rows) and full dataset (${fullDataset.totalRows.toLocaleString()} rows)`
                    : `Publishing preview dataset (${data.rows.length} rows)`}
                </p>
              </div>
              <button
                onClick={() =>
                  setCurrentStep(fullDataset ? 'generate' : 'preview')
                }
                className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors text-sm font-medium"
              >
                Back
              </button>
            </div>
          </div>

          <FilecoinPublisher
            data={data}
            fullDataset={fullDataset}
            config={memoConfig}
            publishProgress={publishProgress}
            setPublishProgress={setPublishProgress}
            storageEstimate={storageEstimate}
            setStorageEstimate={setStorageEstimate}
            publishResult={publishResult}
            setPublishResult={setPublishResult}
            showPublishOptions={showPublishOptions}
            setShowPublishOptions={setShowPublishOptions}
          />
        </div>
      )}
    </div>
  );
}

// Filecoin Publisher Component
