import { motion } from 'framer-motion';
import { Download, Copy, RefreshCw, Eye, Code } from 'lucide-react';
import { useState } from 'react';

interface PreviewData {
  rows: any[];
  schema: {
    name: string;
    type: string;
  }[];
  totalRows: number;
  generationTime: number;
}

interface DatasetPreviewProps {
  data: PreviewData | null;
  isGenerating: boolean;
  onRefresh: () => void;
  onExport: (format: 'json' | 'csv') => void;
}

export default function DatasetPreview({
  data,
  isGenerating,
  onRefresh,
  onExport,
}: DatasetPreviewProps) {
  const [viewMode, setViewMode] = useState<'table' | 'json'>('table');
  const [copiedRow, setCopiedRow] = useState<number | null>(null);

  const copyToClipboard = (row: any, index: number) => {
    navigator.clipboard.writeText(JSON.stringify(row, null, 2));
    setCopiedRow(index);
    setTimeout(() => setCopiedRow(null), 2000);
  };

  const formatValue = (value: any, type: string) => {
    if (value === null || value === undefined) return '-';

    switch (type) {
      case 'date':
        return new Date(value).toLocaleDateString();
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
            Configure your dataset and click &quot;Generate Preview&quot; to see sample
            data
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

      {/* Export Options */}
      <div className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-xl p-6">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="font-semibold text-gray-900 mb-1">
              Ready to export?
            </h4>
            <p className="text-sm text-gray-600">
              Download the full dataset in your preferred format
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => onExport('json')}
              className="px-4 py-2 bg-white border border-gray-200 rounded-lg hover:border-gray-300 transition-colors flex items-center gap-2 text-sm font-medium"
            >
              <Download className="w-4 h-4" />
              Export as JSON
            </button>
            <button
              onClick={() => onExport('csv')}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors flex items-center gap-2 text-sm font-medium"
            >
              <Download className="w-4 h-4" />
              Export as CSV
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
