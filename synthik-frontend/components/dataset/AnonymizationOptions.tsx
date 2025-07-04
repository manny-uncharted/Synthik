import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Shield,
  Lock,
  Eye,
  EyeOff,
  AlertTriangle,
  CheckCircle,
  User,
  Mail,
  Phone,
  MapPin,
  CreditCard,
  Calendar,
  Hash,
  Shuffle,
  Trash2,
  AlertCircle,
  Info,
} from 'lucide-react';
import {
  dataAnonymizationService,
  AnonymizationRule,
  PrivacyLevel,
  DataRecord,
} from '../../services/dataset-generation';
import type { SchemaField } from './CreateDatasetFlow';

interface AnonymizationOptionsProps {
  data: DataRecord[];
  schema: SchemaField[];
  onAnonymize: (anonymizedData: DataRecord[]) => void;
}

const methodIcons = {
  mask: <EyeOff className="w-4 h-4" />,
  hash: <Hash className="w-4 h-4" />,
  fake: <User className="w-4 h-4" />,
  generalize: <Eye className="w-4 h-4" />,
  remove: <Trash2 className="w-4 h-4" />,
  shuffle: <Shuffle className="w-4 h-4" />,
};

const fieldTypeIcons = {
  name: <User className="w-4 h-4" />,
  email: <Mail className="w-4 h-4" />,
  phone: <Phone className="w-4 h-4" />,
  address: <MapPin className="w-4 h-4" />,
  creditCard: <CreditCard className="w-4 h-4" />,
  dob: <Calendar className="w-4 h-4" />,
  ssn: <Hash className="w-4 h-4" />,
  id: <Lock className="w-4 h-4" />,
};

export default function AnonymizationOptions({
  data,
  schema,
  onAnonymize,
}: AnonymizationOptionsProps) {
  const [detectedPII, setDetectedPII] = useState<{
    detectedFields: Array<{
      field: string;
      type: string;
      confidence: number;
      samples: unknown[];
    }>;
    suggestedRules: AnonymizationRule[];
  } | null>(null);
  const [selectedPrivacyLevel, setSelectedPrivacyLevel] =
    useState<PrivacyLevel | null>(null);
  const [customRules, setCustomRules] = useState<AnonymizationRule[]>([]);
  const [isAnonymizing, setIsAnonymizing] = useState(false);
  const [anonymizeProgress, setAnonymizeProgress] = useState(0);
  const [anonymizeError, setAnonymizeError] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState(false);
  const [seed, setSeed] = useState('default');

  // Detect PII fields on component mount
  useEffect(() => {
    if (data.length > 0 && schema.length > 0) {
      const detection = dataAnonymizationService.detectPII(data, schema);
      setDetectedPII(detection);
      setCustomRules(detection.suggestedRules);
    }
  }, [data, schema]);

  // Get privacy levels
  const privacyLevels = dataAnonymizationService.getPrivacyLevels();

  const selectPrivacyLevel = (level: PrivacyLevel) => {
    setSelectedPrivacyLevel(level);
    // Apply default rules from privacy level
    const existingFields = customRules.map((r) => r.field);
    const newRules = level.defaultRules.filter(
      (rule) => !existingFields.includes(rule.field)
    );
    setCustomRules([...customRules, ...newRules]);
  };

  const updateRule = (field: string, updates: Partial<AnonymizationRule>) => {
    setCustomRules(
      customRules.map((rule) =>
        rule.field === field ? { ...rule, ...updates } : rule
      )
    );
  };

  const removeRule = (field: string) => {
    setCustomRules(customRules.filter((rule) => rule.field !== field));
  };

  const addCustomRule = (field: string) => {
    if (!customRules.find((r) => r.field === field)) {
      setCustomRules([
        ...customRules,
        { field, method: 'mask', parameters: { partial: true } },
      ]);
    }
  };

  const applyAnonymization = async () => {
    setIsAnonymizing(true);
    setAnonymizeError(null);
    setAnonymizeProgress(0);

    try {
      const result = await dataAnonymizationService.anonymizeData(
        data,
        customRules,
        {
          seed,
          preserveFormat: true,
          onProgress: (progress, message) => {
            setAnonymizeProgress(progress);
            console.log(message);
          },
        }
      );

      onAnonymize(result.anonymizedData);
      setAnonymizeProgress(100);

      console.log('Anonymization report:', result.report);
    } catch (error) {
      console.error('Anonymization error:', error);
      setAnonymizeError(
        error instanceof Error ? error.message : 'Anonymization failed'
      );
    } finally {
      setIsAnonymizing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <Shield className="w-5 h-5 text-indigo-600" />
            Data Anonymization
          </h3>
          <p className="text-sm text-gray-600 mt-1">
            Protect sensitive information while preserving data utility
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
                Preview
              </>
            ) : (
              <>
                <EyeOff className="w-4 h-4" />
                Configure
              </>
            )}
          </button>
        </div>
      </div>

      {/* PII Detection Results */}
      {detectedPII && detectedPII.detectedFields.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <h4 className="text-sm font-semibold text-amber-900 mb-3 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            Detected Sensitive Data
          </h4>
          <div className="space-y-2">
            {detectedPII.detectedFields.map((field) => (
              <div
                key={field.field}
                className="flex items-center justify-between bg-white rounded-lg p-3 border border-amber-100"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-amber-100 rounded-lg flex items-center justify-center text-amber-600">
                    {fieldTypeIcons[
                      field.type as keyof typeof fieldTypeIcons
                    ] || <Info className="w-4 h-4" />}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {field.field}
                    </p>
                    <p className="text-xs text-gray-600">
                      {field.type} field • {Math.round(field.confidence * 100)}%
                      confidence
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">
                    Sample: {String(field.samples[0]).substring(0, 20)}...
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Privacy Level Selection */}
      <div className="space-y-3">
        <h4 className="text-sm font-semibold text-gray-900">Privacy Level</h4>
        <div className="grid md:grid-cols-3 gap-3">
          {privacyLevels.map((level) => (
            <motion.div
              key={level.level}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => selectPrivacyLevel(level)}
              className={`cursor-pointer rounded-lg p-4 border-2 transition-all ${
                selectedPrivacyLevel?.level === level.level
                  ? 'border-indigo-500 bg-indigo-50'
                  : 'border-gray-200 bg-white hover:border-gray-300'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <h5 className="font-medium text-gray-900 capitalize">
                  {level.level}
                </h5>
                {selectedPrivacyLevel?.level === level.level && (
                  <CheckCircle className="w-5 h-5 text-indigo-600" />
                )}
              </div>
              <p className="text-xs text-gray-600 mb-3">{level.description}</p>
              <div className="flex items-center gap-4 text-xs text-gray-500">
                <span className="flex items-center gap-1">
                  <Lock className="w-3 h-3" />
                  {level.level === 'low' && 'Basic'}
                  {level.level === 'medium' && 'Standard'}
                  {level.level === 'high' && 'Maximum'}
                </span>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Custom Anonymization Rules */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold text-gray-900">
            Anonymization Rules ({customRules.length})
          </h4>
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-600">Seed:</label>
            <input
              type="text"
              value={seed}
              onChange={(e) => setSeed(e.target.value)}
              className="px-2 py-1 text-xs border border-gray-300 rounded"
              placeholder="Randomization seed"
            />
          </div>
        </div>

        <AnimatePresence>
          {customRules.length === 0 ? (
            <div className="text-center py-8 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
              <Shield className="w-12 h-12 text-gray-400 mx-auto mb-3" />
              <p className="text-sm text-gray-600">
                No anonymization rules configured
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Select a privacy level or add custom rules
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {customRules.map((rule) => (
                <motion.div
                  key={rule.field}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="bg-white rounded-lg border border-gray-200 p-4"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 flex-1">
                      <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center text-gray-600">
                        {methodIcons[rule.method]}
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-900">
                          {rule.field === '*' ? 'All Fields' : rule.field}
                        </p>
                        <div className="flex items-center gap-4 mt-1">
                          <select
                            value={rule.method}
                            onChange={(e) =>
                              updateRule(rule.field, {
                                method: e.target
                                  .value as AnonymizationRule['method'],
                              })
                            }
                            className="text-xs border border-gray-300 rounded px-2 py-1"
                          >
                            <option value="mask">Mask</option>
                            <option value="hash">Hash</option>
                            <option value="fake">Fake Data</option>
                            <option value="generalize">Generalize</option>
                            <option value="remove">Remove</option>
                            <option value="shuffle">Shuffle</option>
                          </select>
                          {rule.method === 'mask' && (
                            <label className="flex items-center gap-1 text-xs">
                              <input
                                type="checkbox"
                                checked={rule.parameters?.partial === true}
                                onChange={(e) =>
                                  updateRule(rule.field, {
                                    parameters: { partial: e.target.checked },
                                  })
                                }
                              />
                              Partial mask
                            </label>
                          )}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => removeRule(rule.field)}
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

        {/* Add field dropdown */}
        {schema.length > 0 && (
          <div className="flex items-center gap-2">
            <select
              onChange={(e) => e.target.value && addCustomRule(e.target.value)}
              className="text-sm border border-gray-300 rounded-lg px-3 py-1.5"
              value=""
            >
              <option value="">Add field to anonymize...</option>
              {schema
                .filter(
                  (field) => !customRules.find((r) => r.field === field.name)
                )
                .map((field) => (
                  <option key={field.id} value={field.name}>
                    {field.name}
                  </option>
                ))}
            </select>
          </div>
        )}
      </div>

      {/* Apply Button */}
      {customRules.length > 0 && (
        <div className="flex items-center justify-between bg-gray-50 rounded-lg p-4">
          <div>
            <p className="text-sm font-medium text-gray-900">
              Ready to anonymize your data?
            </p>
            <p className="text-xs text-gray-600 mt-1">
              {customRules.length} fields will be anonymized
            </p>
          </div>
          <button
            onClick={applyAnonymization}
            disabled={isAnonymizing}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isAnonymizing ? (
              <>
                <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                Anonymizing... {Math.round(anonymizeProgress)}%
              </>
            ) : (
              <>
                <Shield className="w-4 h-4" />
                Apply Anonymization
              </>
            )}
          </button>
        </div>
      )}

      {/* Error Display */}
      {anonymizeError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-red-900">
                Anonymization Error
              </p>
              <p className="text-xs text-red-700 mt-1">{anonymizeError}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
