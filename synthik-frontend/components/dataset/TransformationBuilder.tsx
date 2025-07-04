import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowRight,
  Plus,
  Trash2,
  Settings,
  Eye,
  EyeOff,
  AlertCircle,
  CheckCircle,
  RefreshCw,
  FileType,
  Hash,
  Calculator,
  Filter,
  Layers,
  Sparkles,
} from 'lucide-react';
import {
  dataTransformationService,
  TransformRule,
  TransformationPipeline,
  DataRecord,
} from '../../services/dataset-generation';
import type { SchemaField } from './CreateDatasetFlow';

interface TransformationBuilderProps {
  data: DataRecord[];
  schema: SchemaField[];
  onTransform: (
    transformedData: DataRecord[],
    newSchema: SchemaField[]
  ) => void;
}

const transformTypeIcons = {
  rename: <FileType className="w-4 h-4" />,
  convert: <RefreshCw className="w-4 h-4" />,
  calculate: <Calculator className="w-4 h-4" />,
  format: <Hash className="w-4 h-4" />,
  filter: <Filter className="w-4 h-4" />,
  aggregate: <Layers className="w-4 h-4" />,
};

export default function TransformationBuilder({
  data,
  schema,
  onTransform,
}: TransformationBuilderProps) {
  const [pipeline, setPipeline] = useState<TransformationPipeline>({
    rules: [],
    preserveOriginal: false,
  });
  const [suggestions, setSuggestions] = useState<TransformRule[]>([]);
  const [isTransforming, setIsTransforming] = useState(false);
  const [transformProgress, setTransformProgress] = useState(0);
  const [transformError, setTransformError] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState(true);
  const [editingRule, setEditingRule] = useState<string | null>(null);

  // Analyze data and get transformation suggestions
  useEffect(() => {
    if (data.length > 0 && schema.length > 0) {
      const analysis = dataTransformationService.analyzeForTransformations(
        data.slice(0, 100), // Analyze first 100 rows
        schema
      );
      setSuggestions(analysis.suggestions);
    }
  }, [data, schema]);

  const addRule = (rule: TransformRule) => {
    setPipeline({
      ...pipeline,
      rules: [...pipeline.rules, { ...rule, enabled: true }],
    });
  };

  const removeRule = (ruleId: string) => {
    setPipeline({
      ...pipeline,
      rules: pipeline.rules.filter((r) => r.id !== ruleId),
    });
  };

  const toggleRule = (ruleId: string) => {
    setPipeline({
      ...pipeline,
      rules: pipeline.rules.map((r) =>
        r.id === ruleId ? { ...r, enabled: !r.enabled } : r
      ),
    });
  };

  const updateRule = (ruleId: string, updates: Partial<TransformRule>) => {
    setPipeline({
      ...pipeline,
      rules: pipeline.rules.map((r) =>
        r.id === ruleId ? { ...r, ...updates } : r
      ),
    });
  };

  const applyTransformations = async () => {
    setIsTransforming(true);
    setTransformError(null);
    setTransformProgress(0);

    try {
      const result = await dataTransformationService.applyTransformations(
        data,
        pipeline,
        (progress, message) => {
          setTransformProgress(progress);
          console.log(message);
        }
      );

      if (result.report.errors.length > 0) {
        console.warn('Transformation warnings:', result.report.errors);
      }

      onTransform(result.transformedData, result.schema);

      setTransformProgress(100);
    } catch (error) {
      console.error('Transformation error:', error);
      setTransformError(
        error instanceof Error ? error.message : 'Transformation failed'
      );
    } finally {
      setIsTransforming(false);
    }
  };

  const createCustomRule = () => {
    const newRule: TransformRule = {
      id: `custom-${Date.now()}`,
      type: 'rename',
      sourceField: schema[0]?.name || '',
      targetField: '',
      enabled: true,
    };
    addRule(newRule);
    setEditingRule(newRule.id);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">
            Data Transformation Pipeline
          </h3>
          <p className="text-sm text-gray-600 mt-1">
            Build your transformation rules to modify and enhance your data
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPreviewMode(!previewMode)}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-1.5"
          >
            {previewMode ? (
              <>
                <Eye className="w-4 h-4" />
                Preview On
              </>
            ) : (
              <>
                <EyeOff className="w-4 h-4" />
                Preview Off
              </>
            )}
          </button>
        </div>
      </div>

      {/* Suggestions */}
      {suggestions.length > 0 && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4">
          <h4 className="text-sm font-semibold text-indigo-900 mb-3 flex items-center gap-2">
            <Sparkles className="w-4 h-4" />
            Suggested Transformations
          </h4>
          <div className="space-y-2">
            {suggestions.slice(0, 5).map((suggestion) => (
              <motion.div
                key={suggestion.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex items-center justify-between bg-white rounded-lg p-3 border border-indigo-100"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-indigo-100 rounded-lg flex items-center justify-center text-indigo-600">
                    {transformTypeIcons[suggestion.type]}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {suggestion.type === 'convert' &&
                        `Convert ${suggestion.sourceField} to ${suggestion.parameters?.toType}`}
                      {suggestion.type === 'format' &&
                        `Format ${suggestion.sourceField}`}
                      {suggestion.type === 'calculate' &&
                        `Calculate ${suggestion.targetField}`}
                      {suggestion.type === 'aggregate' &&
                        'Aggregate by category'}
                    </p>
                    <p className="text-xs text-gray-600">
                      {suggestion.type === 'convert' &&
                        `Detected as ${suggestion.parameters?.toType} type`}
                      {suggestion.type === 'calculate' &&
                        `${suggestion.parameters?.operation} operation`}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => addRule(suggestion)}
                  className="px-3 py-1 text-xs bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" />
                  Add
                </button>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {/* Pipeline Rules */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold text-gray-900">
            Transformation Rules ({pipeline.rules.length})
          </h4>
          <button
            onClick={createCustomRule}
            className="px-3 py-1.5 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-800 flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            Custom Rule
          </button>
        </div>

        <AnimatePresence>
          {pipeline.rules.length === 0 ? (
            <div className="text-center py-8 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
              <Layers className="w-12 h-12 text-gray-400 mx-auto mb-3" />
              <p className="text-sm text-gray-600">
                No transformation rules added yet
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Add suggested rules or create custom ones
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {pipeline.rules.map((rule, index) => (
                <motion.div
                  key={rule.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className={`bg-white rounded-lg border ${
                    rule.enabled ? 'border-gray-200' : 'border-gray-100'
                  } p-4`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3 flex-1">
                      <div className="flex items-center gap-2 mt-0.5">
                        <button
                          onClick={() => toggleRule(rule.id)}
                          className={`w-5 h-5 rounded flex items-center justify-center ${
                            rule.enabled
                              ? 'bg-indigo-600 text-white'
                              : 'bg-gray-200 text-gray-400'
                          }`}
                        >
                          {rule.enabled && <CheckCircle className="w-3 h-3" />}
                        </button>
                        <div
                          className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                            rule.enabled
                              ? 'bg-indigo-100 text-indigo-600'
                              : 'bg-gray-100 text-gray-400'
                          }`}
                        >
                          {transformTypeIcons[rule.type]}
                        </div>
                      </div>

                      <div className="flex-1">
                        {editingRule === rule.id ? (
                          <RuleEditor
                            rule={rule}
                            schema={schema}
                            onUpdate={(updates) => updateRule(rule.id, updates)}
                            onClose={() => setEditingRule(null)}
                          />
                        ) : (
                          <div
                            className="cursor-pointer"
                            onClick={() => setEditingRule(rule.id)}
                          >
                            <p
                              className={`text-sm font-medium ${
                                rule.enabled ? 'text-gray-900' : 'text-gray-500'
                              }`}
                            >
                              {getRuleDescription(rule)}
                            </p>
                            <p className="text-xs text-gray-600 mt-1">
                              Step {index + 1} in pipeline
                            </p>
                          </div>
                        )}
                      </div>
                    </div>

                    <button
                      onClick={() => removeRule(rule.id)}
                      className="ml-2 p-1 text-red-600 hover:bg-red-50 rounded"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </AnimatePresence>
      </div>

      {/* Apply Button */}
      {pipeline.rules.length > 0 && (
        <div className="flex items-center justify-between bg-gray-50 rounded-lg p-4">
          <div>
            <p className="text-sm font-medium text-gray-900">
              Ready to transform your data?
            </p>
            <p className="text-xs text-gray-600 mt-1">
              {pipeline.rules.filter((r) => r.enabled).length} active rules will
              be applied
            </p>
          </div>
          <button
            onClick={applyTransformations}
            disabled={
              isTransforming ||
              pipeline.rules.filter((r) => r.enabled).length === 0
            }
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isTransforming ? (
              <>
                <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                Transforming... {Math.round(transformProgress)}%
              </>
            ) : (
              <>
                <ArrowRight className="w-4 h-4" />
                Apply Transformations
              </>
            )}
          </button>
        </div>
      )}

      {/* Error Display */}
      {transformError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-red-900">
                Transformation Error
              </p>
              <p className="text-xs text-red-700 mt-1">{transformError}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Helper component for editing rules
function RuleEditor({
  rule,
  schema,
  onUpdate,
  onClose,
}: {
  rule: TransformRule;
  schema: SchemaField[];
  onUpdate: (updates: Partial<TransformRule>) => void;
  onClose: () => void;
}) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-gray-700">Type</label>
          <select
            value={rule.type}
            onChange={(e) =>
              onUpdate({ type: e.target.value as TransformRule['type'] })
            }
            className="mt-1 w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          >
            <option value="rename">Rename</option>
            <option value="convert">Convert Type</option>
            <option value="calculate">Calculate</option>
            <option value="format">Format</option>
            <option value="filter">Filter</option>
            <option value="aggregate">Aggregate</option>
          </select>
        </div>

        {rule.type !== 'aggregate' && (
          <div>
            <label className="text-xs font-medium text-gray-700">
              Source Field
            </label>
            <select
              value={rule.sourceField || ''}
              onChange={(e) => onUpdate({ sourceField: e.target.value })}
              className="mt-1 w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            >
              <option value="">Select field</option>
              {schema.map((field) => (
                <option key={field.id} value={field.name}>
                  {field.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {(rule.type === 'rename' || rule.type === 'calculate') && (
        <div>
          <label className="text-xs font-medium text-gray-700">
            Target Field
          </label>
          <input
            type="text"
            value={rule.targetField || ''}
            onChange={(e) => onUpdate({ targetField: e.target.value })}
            placeholder="Enter new field name"
            className="mt-1 w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>
      )}

      <div className="flex items-center gap-2">
        <button
          onClick={onClose}
          className="px-3 py-1 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
        >
          Done
        </button>
        <button
          onClick={onClose}
          className="px-3 py-1 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// Helper function to get human-readable rule description
function getRuleDescription(rule: TransformRule): string {
  switch (rule.type) {
    case 'rename':
      return `Rename ${rule.sourceField} to ${rule.targetField || '[not set]'}`;
    case 'convert':
      return `Convert ${rule.sourceField} to ${
        rule.parameters?.toType || 'type'
      }`;
    case 'calculate':
      return `Calculate ${rule.targetField} from ${rule.sourceField}`;
    case 'format':
      return `Format ${rule.sourceField}`;
    case 'filter':
      return `Filter by ${rule.parameters?.field || 'condition'}`;
    case 'aggregate':
      return `Aggregate by ${rule.parameters?.groupBy || 'category'}`;
    default:
      return 'Unknown transformation';
  }
}
