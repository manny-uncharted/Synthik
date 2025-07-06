import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  ArrowRight,
  Sparkles,
  CheckCircle,
  Database,
  Settings,
  Eye,
  Globe,
  Wand2,
  Zap,
  FileText,
  Rocket,
} from 'lucide-react';
import {
  DatasetTypeSelector,
  DatasetParameters,
  DatasetPreview,
  DatasetVisibility,
  TransformationBuilder,
  AnonymizationOptions,
} from './index';
import { ModelSelector, getModelById } from '../model';
import {
  datasetGenerationService,
  DATASET_TYPES,
  DataRecord,
  dataAugmentationService,
} from '../../services/dataset-generation';

export interface DatasetConfig {
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

export interface SchemaField {
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

const steps = [
  {
    id: 1,
    title: 'Dataset Type',
    subtitle: 'Choose how to create',
    icon: <FileText className="w-4 h-4" />,
    color: 'from-purple-600 to-indigo-600',
  },
  {
    id: 2,
    title: 'AI Model',
    subtitle: 'Select model',
    icon: <Sparkles className="w-4 h-4" />,
    color: 'from-indigo-600 to-blue-600',
  },
  {
    id: 3,
    title: 'Configure',
    subtitle: 'Set parameters',
    icon: <Database className="w-4 h-4" />,
    color: 'from-blue-600 to-cyan-600',
  },
  {
    id: 4,
    title: 'Visibility',
    subtitle: 'Access control',
    icon: <Globe className="w-4 h-4" />,
    color: 'from-cyan-600 to-teal-600',
  },
  {
    id: 5,
    title: 'Generate',
    subtitle: 'Review & create',
    icon: <Wand2 className="w-4 h-4" />,
    color: 'from-teal-600 to-green-600',
  },
];

interface CreateDatasetFlowProps {
  onSaveDraft?: () => void;
  onCancel?: () => void;
}

export default function CreateDatasetFlow({
  onSaveDraft,
  onCancel,
}: CreateDatasetFlowProps) {
  // These props are passed down from parent but not used directly in this component
  // They're available for future use (e.g., auto-save functionality)
  void onSaveDraft;
  void onCancel;
  const [selectedModel, setSelectedModel] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [config, setConfig] = useState<DatasetConfig>({
    name: '',
    description: '',
    rows: 1000,
    schema: [
      {
        id: '1',
        name: 'id',
        type: 'number',
        description: 'Unique identifier',
        constraints: { required: true, unique: true },
      },
    ],
    format: 'json',
    quality: 'balanced',
    verification: true,
    augmentation: {
      enabled: false,
      variations: 1,
      noise: 20,
    },
    visibility: 'public',
    license: 'mit',
    pricePerRow: 0,
    datasetType: '',
    uploadedFile: null,
    selectedTemplate: '',
  });

  const [previewData, setPreviewData] = useState<{
    rows: Record<string, string | number | boolean | Date | object>[];
    schema: { name: string; type: string }[];
    totalRows: number;
    generationTime: number;
    tokensUsed: number;
    cost: number;
  } | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [transformedData, setTransformedData] = useState<DataRecord[] | null>(
    null
  );
  const [activeTransformTab, setActiveTransformTab] = useState<
    'transform' | 'anonymize'
  >('transform');
  const [fileAnalysis, setFileAnalysis] = useState<{
    data: DataRecord[];
    schema: SchemaField[];
  } | null>(null);

  // Analyze uploaded file for transformation
  useEffect(() => {
    const analyzeFile = async () => {
      if (config.datasetType === 'transformation' && config.uploadedFile) {
        try {
          const analysis = await dataAugmentationService.parseUploadedFile(
            config.uploadedFile
          );
          setFileAnalysis({
            data: analysis.data,
            schema: analysis.schema,
          });
          setConfig({ ...config, schema: analysis.schema });
        } catch (error) {
          console.error('Failed to analyze file:', error);
        }
      }
    };
    analyzeFile();
  }, [config.datasetType, config.uploadedFile]);

  // Component for transformation/anonymization tabs
  const TransformationAnonymizationTabs = ({
    uploadedFile,
    onTransform,
  }: {
    uploadedFile: File | null | undefined;
    onTransform: (data: DataRecord[], schema: SchemaField[]) => void;
  }) => {
    if (!fileAnalysis || !uploadedFile) {
      return (
        <div className="text-center py-8">
          <p className="text-gray-600">
            Please upload a file in step 1 to proceed with transformation.
          </p>
        </div>
      );
    }

    return (
      <div className="space-y-6">
        {/* Tab Navigation */}
        <div className="flex gap-1 p-1 bg-gray-100 rounded-lg">
          <button
            onClick={() => setActiveTransformTab('transform')}
            className={`flex-1 px-4 py-2 rounded-md font-medium text-sm transition-all ${
              activeTransformTab === 'transform'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Transform Data
          </button>
          <button
            onClick={() => setActiveTransformTab('anonymize')}
            className={`flex-1 px-4 py-2 rounded-md font-medium text-sm transition-all ${
              activeTransformTab === 'anonymize'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Anonymize Data
          </button>
        </div>

        {/* Tab Content */}
        {activeTransformTab === 'transform' ? (
          <TransformationBuilder
            data={transformedData || fileAnalysis.data}
            schema={fileAnalysis.schema}
            onTransform={onTransform}
          />
        ) : (
          <AnonymizationOptions
            data={transformedData || fileAnalysis.data}
            schema={fileAnalysis.schema}
            onAnonymize={(anonymizedData) =>
              onTransform(anonymizedData, fileAnalysis.schema)
            }
          />
        )}
      </div>
    );
  };

  const generatePreview = async () => {
    // For transformation type, use the transformed data as preview
    if (config.datasetType === 'transformation') {
      if (transformedData) {
        setPreviewData({
          rows: transformedData.map((row) => {
            const cleanRow: Record<
              string,
              string | number | boolean | Date | object
            > = {};
            Object.entries(row).forEach(([key, value]) => {
              if (value !== null) {
                cleanRow[key] = value;
              } else {
                cleanRow[key] = '';
              }
            });
            return cleanRow;
          }),
          schema: config.schema.map((f) => ({ name: f.name, type: f.type })),
          totalRows: transformedData.length,
          generationTime: 0.1,
          tokensUsed: 0,
          cost: 0,
        });
      } else {
        setGenerationError('Please apply transformations first');
      }
      return;
    }

    setIsGenerating(true);
    setGenerationError(null);

    try {
      const model = getModelById(selectedModel);
      if (!model) {
        throw new Error('Please select a model');
      }

      // Check if API key is configured
      const apiKey = process.env.NEXT_PUBLIC_OPENAI_API_KEY;
      if (model.provider === 'openai' && !apiKey) {
        throw new Error(
          'OpenAI API key not configured. Please add NEXT_PUBLIC_OPENAI_API_KEY to your environment variables.'
        );
      }

      // Generate preview data
      const previewResponse = await datasetGenerationService.generatePreview(
        config,
        model
      );

      // Validate the generated data
      const validation = datasetGenerationService.validateData(
        previewResponse.data,
        config.schema
      );
      if (!validation.valid) {
        console.warn('Validation errors:', validation.errors);
      }

      setPreviewData({
        rows: previewResponse.data.map((row) => {
          const cleanRow: Record<
            string,
            string | number | boolean | Date | object
          > = {};
          Object.entries(row).forEach(([key, value]) => {
            if (value !== null) {
              cleanRow[key] = value;
            } else {
              // Replace null with empty string or default value
              cleanRow[key] = '';
            }
          });
          return cleanRow;
        }),
        schema: config.schema.map((f) => ({ name: f.name, type: f.type })),
        totalRows: config.rows,
        generationTime: previewResponse.metadata.generationTime,
        tokensUsed: previewResponse.metadata.tokensUsed,
        cost: previewResponse.metadata.cost,
      });
    } catch (error) {
      console.error('Generation error:', error);
      setGenerationError(
        error instanceof Error ? error.message : 'Failed to generate preview'
      );
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGenerateFullDataset = async () => {
    if (!previewData) {
      throw new Error('No preview data available');
    }

    // For transformation type, return all transformed data
    if (config.datasetType === 'transformation') {
      if (transformedData) {
        return {
          rows: transformedData.map((row) => {
            const cleanRow: Record<
              string,
              string | number | boolean | Date | object
            > = {};
            Object.entries(row).forEach(([key, value]) => {
              if (value !== null) {
                cleanRow[key] = value;
              } else {
                cleanRow[key] = '';
              }
            });
            return cleanRow;
          }),
          schema: config.schema.map((f) => ({ name: f.name, type: f.type })),
          totalRows: transformedData.length,
          generationTime: 0.1,
          tokensUsed: 0,
          cost: 0,
        };
      } else {
        throw new Error('No transformed data available');
      }
    }

    // For generation types, generate full dataset
    const model = getModelById(selectedModel);
    if (!model) {
      throw new Error('Please select a model');
    }

    console.log('Starting full dataset generation...');

    // Use the dataset generation service directly
    const generator = datasetGenerationService;
    const request = {
      model,
      config,
      streamCallback: (progress: number) => {
        console.log(`Full generation progress: ${progress}%`);
        setGenerationProgress(progress);
      },
    };

    // Generate the full dataset
    const response = await generator.generateDataset(request);
    console.log(`Full dataset generated: ${response.data.length} rows`);

    return {
      rows: response.data.map((row) => {
        const cleanRow: Record<
          string,
          string | number | boolean | Date | object
        > = {};
        Object.entries(row).forEach(([key, value]) => {
          if (value !== null) {
            cleanRow[key] = value;
          } else {
            cleanRow[key] = '';
          }
        });
        return cleanRow;
      }),
      schema: config.schema.map((f) => ({ name: f.name, type: f.type })),
      totalRows: response.metadata.totalRows,
      generationTime: response.metadata.generationTime,
      tokensUsed: response.metadata.tokensUsed,
      cost: response.metadata.cost,
    };
  };

  const handleExport = async (
    format: 'json' | 'csv',
    exportFull: boolean = false
  ) => {
    if (!previewData) return;

    try {
      let dataToExport: DataRecord[] = previewData.rows.map((row) => {
        const dataRecord: DataRecord = {};
        Object.entries(row).forEach(([key, value]) => {
          // Convert object types back to null or appropriate values
          if (typeof value === 'object' && !(value instanceof Date)) {
            dataRecord[key] = JSON.stringify(value);
          } else {
            dataRecord[key] = value as string | number | boolean | Date | null;
          }
        });
        return dataRecord;
      });
      let filename = `${config.name || 'dataset'}_preview.${format}`;

      // If exporting full dataset
      if (exportFull) {
        // For transformation type, export all transformed data
        if (config.datasetType === 'transformation') {
          if (transformedData) {
            dataToExport = transformedData;
            filename = `${config.name || 'dataset'}_transformed.${format}`;
          } else {
            setGenerationError('No transformed data to export');
            return;
          }
        } else {
          // For generation types, generate full dataset
          setIsGenerating(true);
          setGenerationError(null);
          setGenerationProgress(0);

          try {
            const fullDataset = await handleGenerateFullDataset();

            dataToExport = fullDataset.rows.map((row) => {
              const dataRecord: DataRecord = {};
              Object.entries(row).forEach(([key, value]) => {
                // Convert object types back to null or appropriate values
                if (typeof value === 'object' && !(value instanceof Date)) {
                  dataRecord[key] = JSON.stringify(value);
                } else {
                  dataRecord[key] = value as
                    | string
                    | number
                    | boolean
                    | Date
                    | null;
                }
              });
              return dataRecord;
            });
            filename = `${config.name || 'dataset'}_full.${format}`;

            // Update preview data with full dataset info
            setPreviewData({
              ...previewData,
              totalRows: fullDataset.totalRows,
              generationTime: fullDataset.generationTime,
            });
          } catch (error) {
            console.error('Full generation error:', error);
            setGenerationError(
              error instanceof Error
                ? error.message
                : 'Failed to generate full dataset'
            );
            return;
          } finally {
            setIsGenerating(false);
            setGenerationProgress(0);
          }
        }
      }

      console.log(`Exporting ${dataToExport.length} rows as ${format}`);

      // Export the data
      const blob = datasetGenerationService.exportData(dataToExport, format);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      console.log(`Export complete: ${filename}`);
    } catch (error) {
      console.error('Export error:', error);
      setGenerationError(
        error instanceof Error ? error.message : 'Failed to export data'
      );
    }
  };

  const handleSchemaUpdate = (newSchema: SchemaField[]) => {
    setConfig({ ...config, schema: newSchema });
  };

  const handleDatasetTypeSelect = (type: string) => {
    setConfig({ ...config, datasetType: type });

    // If it's generation type, provide a default schema for "from scratch"
    if (type === 'generation') {
      // Set a basic default schema for custom generation
      const defaultCustomSchema: SchemaField[] = [
        {
          id: '1',
          name: 'id',
          type: 'string',
          description: 'Unique identifier',
          constraints: { required: true, unique: true },
        },
        {
          id: '2',
          name: 'name',
          type: 'string',
          description: 'Name field',
          constraints: { required: true },
        },
        {
          id: '3',
          name: 'value',
          type: 'number',
          description: 'Numeric value',
          constraints: { required: false, min: 0 },
        },
        {
          id: '4',
          name: 'created_at',
          type: 'date',
          description: 'Creation timestamp',
          constraints: { required: true },
        },
      ];

      setConfig({
        ...config,
        datasetType: type,
        schema: defaultCustomSchema,
      });
    }

    // If it's a generation type and a category is selected, update the schema
    if (type === 'generation' && selectedCategory) {
      const datasetType = DATASET_TYPES[selectedCategory];
      if (datasetType) {
        setConfig({
          ...config,
          datasetType: type,
          schema: datasetType.defaultSchema,
        });
      }
    }
  };

  const handleCategorySelect = (category: string) => {
    setSelectedCategory(category);
    const datasetType = DATASET_TYPES[category];
    if (datasetType) {
      setConfig({
        ...config,
        schema: datasetType.defaultSchema,
      });
    }
  };

  const isStepComplete = (stepId: number) => {
    switch (stepId) {
      case 1:
        return (
          !!config.datasetType &&
          (config.datasetType !== 'transformation' || !!config.uploadedFile)
        );
      case 2:
        // Skip model selection for transformation type
        return config.datasetType === 'transformation' || !!selectedModel;
      case 3:
        if (config.datasetType === 'transformation') {
          return !!transformedData && config.schema.length > 0;
        }
        return config.name && config.schema.length > 0;
      case 4:
        return true; // Visibility always has a default
      case 5:
        return !!previewData;
      default:
        return false;
    }
  };

  const canProceed = () => {
    return isStepComplete(currentStep);
  };

  const progress = ((currentStep - 1) / (steps.length - 1)) * 100;

  return (
    <div className="space-y-8 pt-8">
      {/* Compact Header */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center"
      >
        <h1 className="text-3xl font-light mb-2">
          Create{' '}
          <span className="font-medium text-indigo-600">Synthetic Dataset</span>
        </h1>
        <p className="text-gray-600">
          Follow our guided process to generate high-quality data
        </p>
      </motion.div>

      {/* Compact Progress Bar */}
      <div className="max-w-3xl mx-auto">
        <div className="relative">
          <div className="absolute top-6 left-0 right-0 h-0.5 bg-gray-200 rounded-full" />
          <div
            className="absolute top-6 left-0 h-0.5 bg-gradient-to-r from-purple-600 to-indigo-600 rounded-full transition-all duration-500"
            style={{ width: `${progress}%` }}
          />

          <div className="relative flex justify-between">
            {steps.map((step) => {
              const isActive = currentStep === step.id;
              const isComplete = currentStep > step.id;

              return (
                <motion.div
                  key={step.id}
                  className="flex flex-col items-center cursor-pointer"
                  onClick={() =>
                    (isComplete || isActive) && setCurrentStep(step.id)
                  }
                >
                  <motion.div
                    className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${
                      isActive
                        ? `bg-gradient-to-br ${step.color} text-white shadow-md`
                        : isComplete
                        ? 'bg-green-500 text-white'
                        : 'bg-gray-200 text-gray-400'
                    }`}
                    animate={isActive ? { scale: [1, 1.1, 1] } : {}}
                    transition={{ duration: 2, repeat: Infinity }}
                  >
                    {isComplete ? (
                      <CheckCircle className="w-5 h-5" />
                    ) : (
                      step.icon
                    )}
                  </motion.div>

                  <div className="mt-2 text-center">
                    <p
                      className={`text-xs font-semibold ${
                        isActive ? 'text-gray-900' : 'text-gray-500'
                      }`}
                    >
                      {step.title}
                    </p>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Step Content */}
      <div className="max-w-4xl mx-auto">
        <AnimatePresence mode="wait">
          {/* Step 1: Dataset Type Selection */}
          {currentStep === 1 && (
            <motion.div
              key="step1"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="bg-white rounded-xl shadow-sm border border-gray-200 p-6"
            >
              <div className="text-center mb-6">
                <div className="w-14 h-14 bg-gradient-to-br from-purple-100 to-indigo-100 rounded-xl flex items-center justify-center mx-auto mb-3">
                  <FileText className="w-7 h-7 text-indigo-600" />
                </div>
                <h2 className="text-xl font-semibold text-gray-900 mb-1">
                  How would you like to create your dataset?
                </h2>
                <p className="text-sm text-gray-600">
                  Choose the best approach for your needs
                </p>
              </div>

              <DatasetTypeSelector
                selectedType={config.datasetType}
                onTypeSelect={handleDatasetTypeSelect}
                uploadedFile={config.uploadedFile}
                onFileUpload={(file) =>
                  setConfig({ ...config, uploadedFile: file })
                }
                selectedTemplate={config.selectedTemplate}
                onTemplateSelect={(template) =>
                  setConfig({ ...config, selectedTemplate: template })
                }
                onSchemaUpdate={handleSchemaUpdate}
                onCategorySelect={handleCategorySelect}
              />
            </motion.div>
          )}

          {/* Step 2: Model Selection */}
          {currentStep === 2 && (
            <motion.div
              key="step2"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="bg-white rounded-xl shadow-sm border border-gray-200 p-6"
            >
              {config.datasetType === 'transformation' ? (
                <div className="text-center py-8">
                  <div className="w-14 h-14 bg-gradient-to-br from-green-100 to-emerald-100 rounded-xl flex items-center justify-center mx-auto mb-3">
                    <CheckCircle className="w-7 h-7 text-green-600" />
                  </div>
                  <h2 className="text-xl font-semibold text-gray-900 mb-1">
                    No Model Required
                  </h2>
                  <p className="text-sm text-gray-600">
                    Transformation and anonymization don&apos;t require an AI
                    model
                  </p>
                  <button
                    onClick={() => setCurrentStep(3)}
                    className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
                  >
                    Continue to Transform
                  </button>
                </div>
              ) : (
                <>
                  <div className="text-center mb-6">
                    <div className="w-14 h-14 bg-gradient-to-br from-indigo-100 to-blue-100 rounded-xl flex items-center justify-center mx-auto mb-3">
                      <Sparkles className="w-7 h-7 text-blue-600" />
                    </div>
                    <h2 className="text-xl font-semibold text-gray-900 mb-1">
                      Select Your AI Model
                    </h2>
                    <p className="text-sm text-gray-600">
                      Choose the model that best fits your data generation needs
                    </p>
                  </div>

                  <ModelSelector
                    selectedModel={selectedModel}
                    onModelSelect={setSelectedModel}
                  />
                </>
              )}
            </motion.div>
          )}

          {/* Step 3: Dataset Configuration */}
          {currentStep === 3 && (
            <motion.div
              key="step3"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="bg-white rounded-xl shadow-sm border border-gray-200 p-6"
            >
              <div className="text-center mb-6">
                <div className="w-14 h-14 bg-gradient-to-br from-blue-100 to-cyan-100 rounded-xl flex items-center justify-center mx-auto mb-3">
                  <Database className="w-7 h-7 text-cyan-600" />
                </div>
                <h2 className="text-xl font-semibold text-gray-900 mb-1">
                  {config.datasetType === 'transformation'
                    ? 'Transform & Anonymize'
                    : 'Configure Your Dataset'}
                </h2>
                <p className="text-sm text-gray-600">
                  {config.datasetType === 'transformation'
                    ? 'Apply transformations and privacy protection'
                    : 'Define the structure and parameters'}
                </p>
              </div>

              {config.datasetType === 'transformation' ? (
                <TransformationAnonymizationTabs
                  uploadedFile={config.uploadedFile}
                  onTransform={(transformedData, newSchema) => {
                    setConfig({ ...config, schema: newSchema });
                    setTransformedData(transformedData);
                  }}
                />
              ) : (
                <DatasetParameters
                  config={config}
                  onConfigChange={(newConfig) => setConfig(newConfig)}
                />
              )}
            </motion.div>
          )}

          {/* Step 4: Visibility Settings */}
          {currentStep === 4 && (
            <motion.div
              key="step4"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="bg-white rounded-xl shadow-sm border border-gray-200 p-6"
            >
              <div className="text-center mb-6">
                <div className="w-14 h-14 bg-gradient-to-br from-cyan-100 to-teal-100 rounded-xl flex items-center justify-center mx-auto mb-3">
                  <Globe className="w-7 h-7 text-teal-600" />
                </div>
                <h2 className="text-xl font-semibold text-gray-900 mb-1">
                  Set Dataset Visibility
                </h2>
                <p className="text-sm text-gray-600">
                  Control who can access your data
                </p>
              </div>

              <DatasetVisibility
                visibility={config.visibility}
                onVisibilityChange={(visibility) =>
                  setConfig({ ...config, visibility })
                }
                licenseType={config.license}
                onLicenseChange={(license) => setConfig({ ...config, license })}
                pricePerRow={config.pricePerRow}
                onPriceChange={(pricePerRow) =>
                  setConfig({ ...config, pricePerRow })
                }
              />
            </motion.div>
          )}

          {/* Step 5: Preview & Generate */}
          {currentStep === 5 && (
            <motion.div
              key="step5"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-4"
            >
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <div className="text-center mb-6">
                  <div className="w-14 h-14 bg-gradient-to-br from-teal-100 to-green-100 rounded-xl flex items-center justify-center mx-auto mb-3">
                    <Eye className="w-7 h-7 text-green-600" />
                  </div>
                  <h2 className="text-xl font-semibold text-gray-900 mb-1">
                    Review & Generate
                  </h2>
                  <p className="text-sm text-gray-600">
                    Preview your configuration
                  </p>
                </div>

                {/* Compact Configuration Summary */}
                <div className="grid md:grid-cols-2 gap-4 mb-6">
                  <div className="bg-gray-50 rounded-lg p-4">
                    <h3 className="font-medium text-gray-900 mb-3 flex items-center gap-1.5 text-sm">
                      <Settings className="w-4 h-4 text-gray-600" />
                      Configuration
                    </h3>
                    <div className="space-y-2 text-xs">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Type</span>
                        <span className="font-medium">
                          {config.datasetType}
                        </span>
                      </div>
                      {config.datasetType !== 'transformation' && (
                        <div className="flex justify-between">
                          <span className="text-gray-600">Model</span>
                          <span className="font-medium">
                            {getModelById(selectedModel)?.name ||
                              'Not selected'}
                          </span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span className="text-gray-600">Name</span>
                        <span className="font-medium">
                          {config.name || 'Not set'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Rows</span>
                        <span className="font-medium">
                          {config.rows.toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-lg p-4">
                    <h3 className="font-medium text-gray-900 mb-3 flex items-center gap-1.5 text-sm">
                      <Zap className="w-4 h-4 text-indigo-600" />
                      Generation Details
                    </h3>
                    <div className="space-y-2 text-xs">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Visibility</span>
                        <span className="font-medium capitalize">
                          {config.visibility}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Quality</span>
                        <span className="font-medium capitalize">
                          {config.quality}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Format</span>
                        <span className="font-medium uppercase">
                          {config.format}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Est. Cost</span>
                        <span className="font-medium text-indigo-600">
                          ${((config.rows / 50) * 0.002).toFixed(2)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Error Display */}
                {generationError && (
                  <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                    <p className="text-sm text-red-800">{generationError}</p>
                  </div>
                )}

                {/* Generate Button */}
                {!previewData && !isGenerating && (
                  <div className="text-center">
                    <button
                      onClick={generatePreview}
                      className="px-6 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-lg font-medium hover:shadow-lg transition-all flex items-center gap-2 mx-auto"
                    >
                      <Rocket className="w-5 h-5" />
                      {config.datasetType === 'transformation'
                        ? 'Preview Transformed Data'
                        : 'Generate Dataset Preview'}
                    </button>
                    <p className="text-xs text-gray-500 mt-2">
                      {config.datasetType === 'transformation'
                        ? 'Review your transformed and anonymized data'
                        : 'This will generate a preview of the first 10 rows'}
                    </p>
                  </div>
                )}
              </div>

              {/* Preview */}
              {(previewData || isGenerating) && (
                <DatasetPreview
                  data={previewData}
                  isGenerating={isGenerating}
                  onRefresh={generatePreview}
                  onExport={handleExport}
                  onGenerateFullDataset={handleGenerateFullDataset}
                  generationProgress={generationProgress}
                  selectedModel={selectedModel}
                  config={{
                    name: config.name,
                    description: config.description,
                    schema: config.schema.map((field) => ({
                      name: field.name,
                      type: field.type,
                      description: field.description,
                    })),
                    format: config.format,
                    license: config.license,
                    visibility: config.visibility,
                    rows: config.rows,
                    quality: config.quality,
                    datasetType: config.datasetType,
                  }}
                />
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Navigation Buttons */}
        <div className="flex items-center justify-between mt-6">
          <button
            onClick={() => setCurrentStep(Math.max(1, currentStep - 1))}
            className={`px-4 py-2 border border-gray-300 rounded-lg font-medium hover:border-gray-400 transition-all flex items-center gap-1.5 text-sm ${
              currentStep === 1 ? 'opacity-50 cursor-not-allowed' : ''
            }`}
            disabled={currentStep === 1}
          >
            <ArrowLeft className="w-4 h-4" />
            Previous
          </button>

          {currentStep < steps.length && (
            <button
              onClick={() => canProceed() && setCurrentStep(currentStep + 1)}
              className={`px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition-all flex items-center gap-1.5 text-sm ${
                !canProceed() ? 'opacity-50 cursor-not-allowed' : ''
              }`}
              disabled={!canProceed()}
            >
              Continue
              <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
