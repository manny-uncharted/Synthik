import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import {
  ArrowLeft,
  ArrowRight,
  Sparkles,
  Save,
  Rocket,
  CheckCircle,
  Database,
  Settings,
  Eye,
  Globe,
  Wand2,
  Zap,
  FileText,
} from 'lucide-react';
import DatasetTypeSelector from '../components/DatasetTypeSelector';
import ModelSelector from '../components/ModelSelector';
import DatasetParameters from '../components/DatasetParameters';
import DatasetPreview from '../components/DatasetPreview';
import DatasetVisibility from '../components/DatasetVisibility';

// Export these interfaces from components in real implementation
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

export default function CreateDataset() {
  const [selectedModel, setSelectedModel] = useState('');
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
    rows: Record<string, string | number>[];
    schema: { name: string; type: string }[];
    totalRows: number;
    generationTime: number;
  } | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 10);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const generatePreview = async () => {
    setIsGenerating(true);
    setTimeout(() => {
      const mockData = {
        rows: Array.from({ length: 10 }, (_, i) => {
          const row: Record<string, string | number> = {};
          config.schema.forEach((field) => {
            if (field.type === 'number') row[field.name] = i + 1;
            else if (field.type === 'name') row[field.name] = `Person ${i + 1}`;
            else if (field.type === 'email')
              row[field.name] = `person${i + 1}@example.com`;
            else row[field.name] = `Sample ${field.name} ${i + 1}`;
          });
          return row;
        }),
        schema: config.schema.map((f) => ({ name: f.name, type: f.type })),
        totalRows: config.rows,
        generationTime: 2.3,
      };
      setPreviewData(mockData);
      setIsGenerating(false);
    }, 3000);
  };

  const handleExport = (format: 'json' | 'csv') => {
    console.log('Exporting as', format);
  };

  const isStepComplete = (stepId: number) => {
    switch (stepId) {
      case 1:
        return !!config.datasetType;
      case 2:
        return !!selectedModel;
      case 3:
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
    <div className="min-h-screen bg-gray-50">
      {/* Navigation */}
      <nav
        className={`fixed top-0 w-full z-50 px-6 py-4 transition-all duration-300 ${
          scrolled ? 'bg-white/90 backdrop-blur-md shadow-sm' : ''
        }`}
      >
        <div className="flex justify-between items-center max-w-6xl mx-auto">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-7 h-7 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg" />
            <span className="text-lg font-medium">Synthik</span>
          </Link>

          <div className="flex items-center gap-3">
            <Link
              href="/datasets"
              className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 transition-colors"
            >
              Cancel
            </Link>
            <button className="px-4 py-1.5 text-sm font-medium btn-primary rounded-lg flex items-center gap-1.5">
              <Save className="w-3.5 h-3.5" />
              Save Draft
            </button>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <div className="pt-20 pb-12 px-6 max-w-6xl mx-auto">
        {/* Compact Header */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8 text-center"
        >
          <h1 className="text-3xl font-light mb-2">
            Create{' '}
            <span className="font-medium text-indigo-600">
              Synthetic Dataset
            </span>
          </h1>
          <p className="text-gray-600">
            Follow our guided process to generate high-quality data
          </p>
        </motion.div>

        {/* Compact Progress Bar */}
        <div className="max-w-3xl mx-auto mb-8">
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

        {/* Compact Step Content */}
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
                  onTypeSelect={(type) =>
                    setConfig({ ...config, datasetType: type })
                  }
                  uploadedFile={config.uploadedFile}
                  onFileUpload={(file) =>
                    setConfig({ ...config, uploadedFile: file })
                  }
                  selectedTemplate={config.selectedTemplate}
                  onTemplateSelect={(template) =>
                    setConfig({ ...config, selectedTemplate: template })
                  }
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
                    Configure Your Dataset
                  </h2>
                  <p className="text-sm text-gray-600">
                    Define the structure and parameters
                  </p>
                </div>

                <DatasetParameters
                  config={config}
                  onConfigChange={(newConfig) => setConfig(newConfig)}
                />
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
                  onLicenseChange={(license) =>
                    setConfig({ ...config, license })
                  }
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
                        <div className="flex justify-between">
                          <span className="text-gray-600">Model</span>
                          <span className="font-medium">{selectedModel}</span>
                        </div>
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
                            $12.50
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Generate Button */}
                  {!previewData && !isGenerating && (
                    <div className="text-center">
                      <button
                        onClick={generatePreview}
                        className="px-6 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-lg font-medium hover:shadow-lg transition-all flex items-center gap-2 mx-auto"
                      >
                        <Rocket className="w-5 h-5" />
                        Generate Dataset Preview
                      </button>
                      <p className="text-xs text-gray-500 mt-2">
                        This will generate a preview of the first 10 rows
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
    </div>
  );
}
