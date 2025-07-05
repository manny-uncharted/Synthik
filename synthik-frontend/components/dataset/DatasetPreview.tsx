import { motion } from 'framer-motion';
import {
  Download,
  Copy,
  RefreshCw,
  Eye,
  Code,
  AlertCircle,
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
}

// Storage interfaces for Filecoin publishing
interface StorageEstimate {
  proofsetFee: number; // 5 USDFC
  storageFee: number; // Based on data size
  bufferAmount: number; // 5 USDFC
  totalCost: number;
  isFirstTime: boolean; // Whether user needs to create proofset
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
  dataCID: string;
  transactionHash?: string;
  timestamp: number;
}

interface DatasetPreviewProps {
  data: PreviewData | null;
  isGenerating: boolean;
  onRefresh: () => void;
  onExport: (format: 'json' | 'csv', exportFull?: boolean) => void;
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
  generationProgress = 0,
  config,
}: DatasetPreviewProps) {
  const [viewMode, setViewMode] = useState<'table' | 'json'>('table');
  const [copiedRow, setCopiedRow] = useState<number | null>(null);
  const [showExportOptions, setShowExportOptions] = useState(false);

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
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">
            Dataset Preview
          </h3>
          <p className="text-sm text-gray-600">
            Showing {data.rows.length} of {data.totalRows} rows • Generated in{' '}
            {data.generationTime}s
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
              dataset contains {data.totalRows.toLocaleString()} rows. Use the
              export options below to download either the preview or the
              complete dataset.
            </p>
          </div>
        </div>
      )}

      {/* Publish to Filecoin Network Section */}
      <FilecoinPublisher
        data={data}
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

      {/* Export Options */}
      <div className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h4 className="font-semibold text-gray-900 mb-1">Export Options</h4>
            <p className="text-sm text-gray-600">
              Choose to export the preview or generate the full dataset
            </p>
          </div>
          <button
            onClick={() => setShowExportOptions(!showExportOptions)}
            className="text-sm text-indigo-600 hover:text-indigo-700 font-medium"
          >
            {showExportOptions ? 'Hide Options' : 'Show Options'}
          </button>
        </div>

        {showExportOptions && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="space-y-4"
          >
            {/* Preview Export */}
            <div className="bg-white rounded-lg p-4 border border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <h5 className="font-medium text-gray-900 mb-1">
                    Export Preview
                  </h5>
                  <p className="text-sm text-gray-600">
                    Download only the {data.rows.length} preview rows (instant)
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => onExport('json', false)}
                    className="px-3 py-1.5 bg-white border border-gray-200 rounded hover:border-gray-300 transition-colors flex items-center gap-1.5 text-sm font-medium"
                  >
                    <Download className="w-3.5 h-3.5" />
                    JSON
                  </button>
                  <button
                    onClick={() => onExport('csv', false)}
                    className="px-3 py-1.5 bg-white border border-gray-200 rounded hover:border-gray-300 transition-colors flex items-center gap-1.5 text-sm font-medium"
                  >
                    <Download className="w-3.5 h-3.5" />
                    CSV
                  </button>
                </div>
              </div>
            </div>

            {/* Full Dataset Export */}
            <div className="bg-white rounded-lg p-4 border border-indigo-200">
              <div className="flex items-center justify-between">
                <div>
                  <h5 className="font-medium text-gray-900 mb-1">
                    Export Full Dataset
                  </h5>
                  <p className="text-sm text-gray-600">
                    Generate and download all {data.totalRows.toLocaleString()}{' '}
                    rows
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    This will use API credits and may take a few minutes
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => onExport('json', true)}
                    className="px-3 py-1.5 bg-indigo-600 text-white rounded hover:bg-indigo-700 transition-colors flex items-center gap-1.5 text-sm font-medium"
                  >
                    <Download className="w-3.5 h-3.5" />
                    JSON
                  </button>
                  <button
                    onClick={() => onExport('csv', true)}
                    className="px-3 py-1.5 bg-indigo-600 text-white rounded hover:bg-indigo-700 transition-colors flex items-center gap-1.5 text-sm font-medium"
                  >
                    <Download className="w-3.5 h-3.5" />
                    CSV
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {!showExportOptions && (
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={() => onExport('json', false)}
              className="px-4 py-2 bg-white border border-gray-200 rounded-lg hover:border-gray-300 transition-colors flex items-center gap-2 text-sm font-medium"
            >
              <Download className="w-4 h-4" />
              Export Preview as JSON
            </button>
            <button
              onClick={() => onExport('csv', false)}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors flex items-center gap-2 text-sm font-medium"
            >
              <Download className="w-4 h-4" />
              Export Preview as CSV
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// Filecoin Publisher Component
