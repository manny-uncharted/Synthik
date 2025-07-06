import { motion } from 'framer-motion';
import { Info, Plus, Minus, Sparkles } from 'lucide-react';
import { useState } from 'react';

interface DatasetConfig {
  name: string;
  description: string;
  rows: number;
  schema: SchemaField[];
  format: 'json' | 'csv' | 'parquet';
  quality: 'fast' | 'balanced' | 'high';
  verification: boolean;
  augmentation: {
    enabled: boolean;
    variations: number;
    noise: number;
  };
  visibility: 'public' | 'private' | 'restricted';
  license: string;
  pricePerRow: number;
  datasetType: string;
  uploadedFile?: File | null;
  selectedTemplate?: string;
}

interface SchemaField {
  id: string;
  name: string;
  type: string;
  description: string;
  constraints?: {
    required?: boolean;
    unique?: boolean;
    min?: number;
    max?: number;
    pattern?: string;
    enum?: string[];
  };
}

interface DatasetParametersProps {
  config: DatasetConfig;
  onConfigChange: (config: DatasetConfig) => void;
}

const fieldTypes = [
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'date', label: 'Date' },
  { value: 'boolean', label: 'Boolean' },
  { value: 'email', label: 'Email' },
  { value: 'phone', label: 'Phone' },
  { value: 'address', label: 'Address' },
  { value: 'name', label: 'Person Name' },
  { value: 'company', label: 'Company' },
  { value: 'url', label: 'URL' },
  { value: 'json', label: 'JSON Object' },
  { value: 'array', label: 'Array' },
];

export default function DatasetParameters({
  config,
  onConfigChange,
}: DatasetParametersProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);

  const updateConfig = (updates: Partial<DatasetConfig>) => {
    onConfigChange({ ...config, ...updates });
  };

  const addField = () => {
    const newField: SchemaField = {
      id: Date.now().toString(),
      name: `field_${config.schema.length + 1}`,
      type: 'text',
      description: '',
      constraints: { required: false },
    };
    updateConfig({ schema: [...config.schema, newField] });
  };

  const removeField = (id: string) => {
    updateConfig({ schema: config.schema.filter((f) => f.id !== id) });
  };

  const updateField = (id: string, updates: Partial<SchemaField>) => {
    updateConfig({
      schema: config.schema.map((f) =>
        f.id === id ? { ...f, ...updates } : f
      ),
    });
  };

  return (
    <div className="space-y-6">
      {/* Basic Info */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-gray-900">
          Dataset Configuration
        </h3>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Dataset Name
          </label>
          <input
            type="text"
            value={config.name}
            onChange={(e) => updateConfig({ name: e.target.value })}
            className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-500 transition-colors"
            placeholder="e.g., Customer Purchase History"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Description
          </label>
          <textarea
            value={config.description}
            onChange={(e) => updateConfig({ description: e.target.value })}
            className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-500 transition-colors resize-none"
            rows={3}
            placeholder="Describe the dataset purpose and contents..."
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Number of Rows
            </label>
            <div className="flex items-center">
              <button
                onClick={() =>
                  updateConfig({ rows: Math.max(1, config.rows - 100) })
                }
                className="p-2 border border-gray-200 rounded-l-lg hover:bg-gray-50 transition-colors"
              >
                <Minus className="w-4 h-4" />
              </button>
              <input
                type="number"
                value={config.rows}
                onChange={(e) =>
                  updateConfig({ rows: parseInt(e.target.value) || 1 })
                }
                className="flex-1 px-4 py-2 border-t border-b border-gray-200 text-center focus:outline-none focus:border-indigo-500"
                min="1"
                max="1000000"
              />
              <button
                onClick={() =>
                  updateConfig({ rows: Math.min(1000000, config.rows + 100) })
                }
                className="p-2 border border-gray-200 rounded-r-lg hover:bg-gray-50 transition-colors"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Output Format
            </label>
            <select
              value={config.format}
              onChange={(e) =>
                updateConfig({
                  format: e.target.value as 'json' | 'csv' | 'parquet',
                })
              }
              className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-500 transition-colors"
            >
              <option value="json">JSON</option>
              <option value="csv">CSV</option>
              <option value="parquet">Parquet</option>
            </select>
          </div>
        </div>
      </div>

      {/* Schema Builder */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">
            Schema Definition
          </h3>
          <button
            onClick={addField}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors flex items-center gap-2 text-sm"
          >
            <Plus className="w-4 h-4" />
            Add Field
          </button>
        </div>

        <div className="space-y-3">
          {config.schema.map((field) => (
            <motion.div
              key={field.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-gray-50 rounded-lg p-4 space-y-3"
            >
              <div className="flex items-start gap-4">
                <div className="flex-1 grid grid-cols-3 gap-3">
                  <input
                    type="text"
                    value={field.name}
                    onChange={(e) =>
                      updateField(field.id, { name: e.target.value })
                    }
                    className="px-3 py-2 border border-gray-200 rounded-md focus:outline-none focus:border-indigo-500"
                    placeholder="Field name"
                  />
                  <select
                    value={field.type}
                    onChange={(e) =>
                      updateField(field.id, { type: e.target.value })
                    }
                    className="px-3 py-2 border border-gray-200 rounded-md focus:outline-none focus:border-indigo-500"
                  >
                    {fieldTypes.map((type) => (
                      <option key={type.value} value={type.value}>
                        {type.label}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={field.description}
                    onChange={(e) =>
                      updateField(field.id, { description: e.target.value })
                    }
                    className="px-3 py-2 border border-gray-200 rounded-md focus:outline-none focus:border-indigo-500"
                    placeholder="Description"
                  />
                </div>
                <button
                  onClick={() => removeField(field.id)}
                  className="p-2 text-red-600 hover:bg-red-50 rounded-md transition-colors"
                >
                  <Minus className="w-4 h-4" />
                </button>
              </div>

              {/* Field constraints */}
              <div className="flex items-center gap-4 text-sm">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={field.constraints?.required || false}
                    onChange={(e) =>
                      updateField(field.id, {
                        constraints: {
                          ...field.constraints,
                          required: e.target.checked,
                        },
                      })
                    }
                    className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                  />
                  <span className="text-gray-700">Required</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={field.constraints?.unique || false}
                    onChange={(e) =>
                      updateField(field.id, {
                        constraints: {
                          ...field.constraints,
                          unique: e.target.checked,
                        },
                      })
                    }
                    className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                  />
                  <span className="text-gray-700">Unique</span>
                </label>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Quality Settings */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-gray-900">
          Generation Quality
        </h3>
        <div className="grid grid-cols-3 gap-3">
          {['fast', 'balanced', 'high'].map((quality) => (
            <button
              key={quality}
              onClick={() =>
                updateConfig({
                  quality: quality as 'fast' | 'balanced' | 'high',
                })
              }
              className={`px-4 py-3 rounded-lg border-2 transition-all capitalize ${
                config.quality === quality
                  ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              {quality}
            </button>
          ))}
        </div>
      </div>

      {/* Advanced Options */}
      <div className="space-y-4">
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-gray-900"
        >
          <Sparkles className="w-4 h-4" />
          Advanced Options
          <span className="text-gray-400">{showAdvanced ? '−' : '+'}</span>
        </button>

        {showAdvanced && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="space-y-4 pl-6"
          >
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={config.verification}
                onChange={(e) =>
                  updateConfig({ verification: e.target.checked })
                }
                className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
              />
              <span className="text-sm text-gray-700">
                Enable blockchain verification
              </span>
              <Info className="w-4 h-4 text-gray-400" />
            </label>

            <div className="space-y-3">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.augmentation.enabled}
                  onChange={(e) =>
                    updateConfig({
                      augmentation: {
                        ...config.augmentation,
                        enabled: e.target.checked,
                      },
                    })
                  }
                  className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                />
                <span className="text-sm text-gray-700">
                  Enable data augmentation
                </span>
              </label>

              {config.augmentation.enabled && (
                <div className="grid grid-cols-2 gap-3 pl-7">
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">
                      Variations
                    </label>
                    <input
                      type="number"
                      value={config.augmentation.variations}
                      onChange={(e) =>
                        updateConfig({
                          augmentation: {
                            ...config.augmentation,
                            variations: parseInt(e.target.value) || 1,
                          },
                        })
                      }
                      className="w-full px-3 py-1 text-sm border border-gray-200 rounded focus:outline-none focus:border-indigo-500"
                      min="1"
                      max="10"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">
                      Noise Level
                    </label>
                    <input
                      type="range"
                      value={config.augmentation.noise}
                      onChange={(e) =>
                        updateConfig({
                          augmentation: {
                            ...config.augmentation,
                            noise: parseInt(e.target.value),
                          },
                        })
                      }
                      className="w-full"
                      min="0"
                      max="100"
                    />
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
