import { Database, Eye, Info } from 'lucide-react';

interface DatasetResponse {
  id: string;
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
  creatorId: string;
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

interface DatasetPreviewStepProps {
  dataset: DatasetResponse;
  metadata: DatasetMetadata | null;
  previewData: Record<string, string | number>[];
}

// Utility function to format storage size
function formatStorageSize(bytesPerRow: number, totalRows?: number): string {
  if (!bytesPerRow || bytesPerRow === 0) return 'Unknown';

  const estimatedRows = totalRows || 1000; // Use actual rows or estimate
  const totalBytes = bytesPerRow * estimatedRows;

  if (totalBytes < 1024) {
    return `${Math.round(totalBytes)} B`;
  } else if (totalBytes < 1024 * 1024) {
    return `${(totalBytes / 1024).toFixed(1)} KB`;
  } else if (totalBytes < 1024 * 1024 * 1024) {
    return `${(totalBytes / (1024 * 1024)).toFixed(1)} MB`;
  } else {
    return `${(totalBytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  }
}

export default function DatasetPreviewStep({
  dataset,
  metadata,
  previewData,
}: DatasetPreviewStepProps) {
  return (
    <div>
      <h2 className="text-2xl font-semibold text-gray-900 mb-6 display-font">
        Dataset Preview
      </h2>

      {/* Dataset Info */}
      <div className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-xl p-6 mb-6 border border-indigo-100">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-1">
              {metadata?.name || dataset.name}
            </h3>
            <p className="text-sm text-gray-600 mb-2">
              {metadata?.description || dataset.description}
            </p>
            <div className="flex items-center gap-4 text-sm text-gray-600">
              <span>
                {metadata?.totalRows?.toLocaleString() || 'Unknown'} rows
              </span>
              <span>•</span>
              <span>
                {formatStorageSize(dataset.price_per_row, metadata?.totalRows)}
              </span>
              <span>•</span>
              <span className="uppercase font-medium">{dataset.format}</span>
            </div>
          </div>
          <Database className="w-8 h-8 text-indigo-600" />
        </div>

        {/* Dataset Tags */}
        <div className="flex flex-wrap gap-2">
          {dataset.tags.slice(1).map(
            (
              tag // Skip first tag as it's the dataset ID
            ) => (
              <span
                key={tag}
                className="px-2 py-1 bg-white/60 text-indigo-700 rounded-md text-xs font-medium"
              >
                {tag}
              </span>
            )
          )}
        </div>
      </div>

      {/* Data Preview */}
      <div className="mb-6">
        <h4 className="text-sm font-medium text-gray-900 mb-3 flex items-center gap-2">
          <Eye className="w-4 h-4" />
          Sample Data ({previewData.length} rows shown)
        </h4>

        {previewData && previewData.length > 0 ? (
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    {Object.keys(previewData[0]).map((key) => (
                      <th
                        key={key}
                        className="text-left py-3 px-4 text-sm font-medium text-gray-900"
                      >
                        {key.charAt(0).toUpperCase() + key.slice(1)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previewData.slice(0, 5).map(
                    (
                      row,
                      index // Show max 5 rows
                    ) => (
                      <tr
                        key={index}
                        className="border-t border-gray-100 hover:bg-gray-50"
                      >
                        {Object.values(row).map((value, colIndex) => (
                          <td
                            key={colIndex}
                            className="py-3 px-4 text-sm text-gray-600 max-w-xs truncate"
                          >
                            {typeof value === 'object'
                              ? JSON.stringify(value)
                              : String(value)}
                          </td>
                        ))}
                      </tr>
                    )
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="border border-gray-200 rounded-lg p-8 text-center">
            <Database className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 mb-2">No preview data available</p>
            <p className="text-sm text-gray-400">
              The dataset will be processed during training
            </p>
          </div>
        )}
      </div>

      {/* Dataset Schema Info */}
      {metadata?.schema && metadata.schema.length > 0 && (
        <div className="mb-6">
          <h4 className="text-sm font-medium text-gray-900 mb-3">
            Dataset Schema
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {metadata.schema.map((column, index) => (
              <div
                key={index}
                className="bg-gray-50 rounded-lg p-3 border border-gray-200"
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-mono text-sm font-medium text-gray-900">
                    {column.name}
                  </span>
                  <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded text-xs font-medium">
                    {column.type}
                  </span>
                </div>
                <p className="text-xs text-gray-600">{column.description}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-blue-50 rounded-lg p-4 flex items-start gap-3">
        <Info className="w-5 h-5 text-blue-600 mt-0.5" />
        <div className="text-sm text-blue-800">
          <p className="font-medium mb-1">Ready for training</p>
          <p>
            This dataset has been verified and is ready for model training. The
            data will be automatically preprocessed based on your selected model
            architecture.
          </p>
        </div>
      </div>
    </div>
  );
}
