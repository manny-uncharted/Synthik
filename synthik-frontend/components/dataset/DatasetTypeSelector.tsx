import { motion } from 'framer-motion';
import {
  Sparkles,
  Upload,
  FileText,
  Layers,
  Database,
  ArrowUpRight,
  ShoppingCart,
  Heart,
  DollarSign,
  CheckCircle,
  AlertCircle,
} from 'lucide-react';
import { useState, useEffect } from 'react';
import {
  DATASET_TYPES,
  dataAugmentationService,
} from '../../services/dataset-generation';
import type { SchemaField } from './CreateDatasetFlow';

interface DatasetType {
  id: 'generation' | 'augmentation' | 'template' | 'transformation';
  title: string;
  description: string;
  icon: React.ReactNode;
  features: string[];
}

interface DatasetTypeSelectorProps {
  selectedType: string;
  onTypeSelect: (type: string) => void;
  uploadedFile?: File | null;
  onFileUpload?: (file: File | null) => void;
  selectedTemplate?: string;
  onTemplateSelect?: (template: string) => void;
  onSchemaUpdate?: (schema: SchemaField[]) => void;
  onCategorySelect?: (category: string) => void;
}

const datasetTypes: DatasetType[] = [
  {
    id: 'generation',
    title: 'Generate from Scratch',
    description: 'Create entirely new synthetic data',
    icon: <Sparkles className="w-5 h-5" />,
    features: ['AI-powered generation', 'Custom schemas', 'Unlimited rows'],
  },
  {
    id: 'augmentation',
    title: 'Augment Existing Data',
    description: 'Enhance your real-world dataset',
    icon: <Upload className="w-5 h-5" />,
    features: ['Upload CSV/JSON', 'Add synthetic rows', 'Fill missing values'],
  },
  {
    id: 'template',
    title: 'Use Template',
    description: 'Start with pre-built schemas',
    icon: <FileText className="w-5 h-5" />,
    features: ['Industry templates', 'Best practices', 'Quick start'],
  },
  {
    id: 'transformation',
    title: 'Transform & Anonymize',
    description: 'Modify existing sensitive data',
    icon: <Layers className="w-5 h-5" />,
    features: ['PII removal', 'Data masking', 'Format conversion'],
  },
];

// Get icon for dataset category
const getCategoryIcon = (categoryId: string) => {
  switch (categoryId) {
    case 'ecommerce':
      return <ShoppingCart className="w-4 h-4" />;
    case 'healthcare':
      return <Heart className="w-4 h-4" />;
    case 'financial':
      return <DollarSign className="w-4 h-4" />;
    default:
      return <Database className="w-4 h-4" />;
  }
};

export default function DatasetTypeSelector({
  selectedType,
  onTypeSelect,
  uploadedFile,
  onFileUpload,
  selectedTemplate,
  onTemplateSelect,
  onSchemaUpdate,
  onCategorySelect,
}: DatasetTypeSelectorProps) {
  const [dragActive, setDragActive] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [fileAnalysis, setFileAnalysis] = useState<{
    data: Record<string, unknown>[];
    schema: SchemaField[];
    stats: {
      totalRows: number;
      columns: number;
      fileSize: string;
      detectedTypes: Record<string, string>;
    };
  } | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  // Analyze uploaded file when it changes
  useEffect(() => {
    if (uploadedFile && selectedType === 'augmentation') {
      analyzeUploadedFile(uploadedFile);
    } else {
      setFileAnalysis(null);
      setAnalysisError(null);
    }
  }, [uploadedFile, selectedType]);

  const analyzeUploadedFile = async (file: File) => {
    setIsAnalyzing(true);
    setAnalysisError(null);

    try {
      const analysis = await dataAugmentationService.parseUploadedFile(file);
      setFileAnalysis(analysis);

      // Update the schema in the parent component
      onSchemaUpdate?.(analysis.schema);

      console.log('File analysis complete:', analysis);
    } catch (error) {
      console.error('File analysis error:', error);
      setAnalysisError(
        error instanceof Error ? error.message : 'Failed to analyze file'
      );
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Update schema when template is selected
  useEffect(() => {
    if (selectedType === 'template' && selectedCategory && selectedTemplate) {
      const datasetType = DATASET_TYPES[selectedCategory];
      if (datasetType) {
        const template = datasetType.templates[selectedTemplate];
        const schema =
          template?.schema.length > 0
            ? template.schema
            : datasetType.defaultSchema;
        onSchemaUpdate?.(schema);
      }
    }
  }, [selectedCategory, selectedTemplate, selectedType, onSchemaUpdate]);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      onFileUpload?.(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onFileUpload?.(e.target.files[0]);
    }
  };

  const handleCategorySelect = (categoryId: string) => {
    setSelectedCategory(categoryId);
    // Reset template selection when category changes
    onTemplateSelect?.('');
    // Notify parent component
    onCategorySelect?.(categoryId);
  };

  const handleTemplateSelect = (templateId: string) => {
    onTemplateSelect?.(templateId);
  };

  return (
    <div className="space-y-6">
      {/* Dataset Type Selection */}
      <div className="grid md:grid-cols-2 gap-3">
        {datasetTypes.map((type) => (
          <motion.div
            key={type.id}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => onTypeSelect(type.id)}
            className={`relative cursor-pointer rounded-xl p-4 border-2 transition-all ${
              selectedType === type.id
                ? 'border-indigo-500 bg-indigo-50/50'
                : 'border-gray-200 bg-white hover:border-gray-300'
            }`}
          >
            <div className="flex items-start gap-3">
              <div
                className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                  selectedType === type.id
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-100 text-gray-600'
                }`}
              >
                {type.icon}
              </div>

              <div className="flex-1 min-w-0">
                <h4 className="font-semibold text-gray-900 text-sm">
                  {type.title}
                </h4>
                <p className="text-xs text-gray-600 mt-0.5">
                  {type.description}
                </p>

                <div className="flex flex-wrap gap-1 mt-2">
                  {type.features.map((feature, index) => (
                    <span
                      key={index}
                      className={`inline-flex items-center px-2 py-0.5 rounded text-xs ${
                        selectedType === type.id
                          ? 'bg-indigo-100 text-indigo-700'
                          : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {feature}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Conditional Content Based on Selection */}
      {selectedType === 'generation' && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-4"
        >
          <div className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-lg p-4 border border-indigo-200">
            <h4 className="text-sm font-semibold text-gray-900 mb-2">
              Custom Schema Generation
            </h4>
            <p className="text-xs text-gray-600 mb-3">
              You&apos;ll be able to customize the data schema in the next step.
              We&apos;ll start with a basic template that you can modify.
            </p>

            <div className="flex items-center gap-2 text-xs text-indigo-700">
              <Sparkles className="w-4 h-4" />
              <span>Ready to create your custom dataset structure</span>
            </div>
          </div>

          {/* Optional: Quick category suggestions (not required) */}
          <div className="space-y-2">
            <h5 className="text-xs font-medium text-gray-700">
              Quick Start (Optional)
            </h5>
            <p className="text-xs text-gray-500">
              Or choose a category below to start with a pre-built schema:
            </p>
            <div className="grid md:grid-cols-3 gap-2">
              {Object.entries(DATASET_TYPES).map(([key, datasetType]) => (
                <button
                  key={key}
                  onClick={() => {
                    handleCategorySelect(key);
                    onSchemaUpdate?.(datasetType.defaultSchema);
                  }}
                  className="p-3 rounded-lg border border-gray-200 hover:border-indigo-300 hover:bg-indigo-50 transition-all text-left"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-6 h-6 rounded flex items-center justify-center bg-gray-100 text-gray-600">
                      {getCategoryIcon(key)}
                    </div>
                    <h6 className="font-medium text-xs text-gray-900">
                      {datasetType.name}
                    </h6>
                  </div>
                  <p className="text-xs text-gray-600">
                    {datasetType.defaultSchema.length} fields
                  </p>
                </button>
              ))}
            </div>
          </div>
        </motion.div>
      )}

      {selectedType === 'augmentation' && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-3"
        >
          <h4 className="text-sm font-semibold text-gray-900">
            Upload Your Dataset
          </h4>
          <div
            className={`relative border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
              dragActive
                ? 'border-indigo-500 bg-indigo-50'
                : 'border-gray-300 bg-gray-50 hover:border-gray-400'
            }`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
          >
            <input
              type="file"
              id="file-upload"
              className="sr-only"
              accept=".csv,.json,.xlsx"
              onChange={handleFileChange}
            />

            {uploadedFile ? (
              <div className="space-y-2">
                <Database className="w-8 h-8 text-indigo-600 mx-auto" />
                <p className="text-sm font-medium text-gray-900">
                  {uploadedFile.name}
                </p>
                <p className="text-xs text-gray-600">
                  {(uploadedFile.size / 1024).toFixed(1)} KB
                </p>
                {isAnalyzing && (
                  <div className="flex items-center justify-center gap-2 text-xs text-indigo-600">
                    <div className="animate-spin w-3 h-3 border border-indigo-600 border-t-transparent rounded-full"></div>
                    Analyzing file...
                  </div>
                )}
                {analysisError && (
                  <div className="flex items-center justify-center gap-1 text-xs text-red-600">
                    <AlertCircle className="w-3 h-3" />
                    {analysisError}
                  </div>
                )}
                {fileAnalysis && !isAnalyzing && (
                  <div className="flex items-center justify-center gap-1 text-xs text-green-600">
                    <CheckCircle className="w-3 h-3" />
                    {fileAnalysis.stats.totalRows} rows,{' '}
                    {fileAnalysis.stats.columns} columns detected
                  </div>
                )}
                <button
                  onClick={() => onFileUpload?.(null)}
                  className="text-xs text-red-600 hover:text-red-700"
                >
                  Remove file
                </button>
              </div>
            ) : (
              <>
                <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                <label
                  htmlFor="file-upload"
                  className="text-sm font-medium text-indigo-600 hover:text-indigo-700 cursor-pointer"
                >
                  Click to upload
                </label>
                <p className="text-xs text-gray-600 mt-1">
                  or drag and drop CSV, JSON, or Excel files
                </p>
              </>
            )}
          </div>

          {/* File Analysis Results */}
          {fileAnalysis && !isAnalyzing && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-green-50 border border-green-200 rounded-lg p-4"
            >
              <h5 className="text-sm font-semibold text-green-900 mb-2">
                File Analysis Complete
              </h5>
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div>
                  <span className="text-green-700">Total Rows:</span>
                  <span className="font-medium ml-1">
                    {fileAnalysis.stats.totalRows}
                  </span>
                </div>
                <div>
                  <span className="text-green-700">Columns:</span>
                  <span className="font-medium ml-1">
                    {fileAnalysis.stats.columns}
                  </span>
                </div>
                <div>
                  <span className="text-green-700">File Size:</span>
                  <span className="font-medium ml-1">
                    {fileAnalysis.stats.fileSize}
                  </span>
                </div>
                <div>
                  <span className="text-green-700">Ready for:</span>
                  <span className="font-medium ml-1 text-green-800">
                    Augmentation
                  </span>
                </div>
              </div>

              <div className="mt-3">
                <p className="text-xs text-green-700 mb-1">Detected Fields:</p>
                <div className="flex flex-wrap gap-1">
                  {fileAnalysis.schema.slice(0, 6).map((field, index) => (
                    <span
                      key={index}
                      className="px-2 py-0.5 bg-green-100 text-green-800 text-xs rounded"
                    >
                      {field.name} ({field.type})
                    </span>
                  ))}
                  {fileAnalysis.schema.length > 6 && (
                    <span className="px-2 py-0.5 bg-green-100 text-green-800 text-xs rounded">
                      +{fileAnalysis.schema.length - 6} more
                    </span>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </motion.div>
      )}

      {selectedType === 'template' && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-4"
        >
          {/* Category Selection */}
          <div>
            <h4 className="text-sm font-semibold text-gray-900 mb-3">
              Select Category
            </h4>
            <div className="flex gap-2 flex-wrap">
              {Object.entries(DATASET_TYPES).map(([key, datasetType]) => (
                <button
                  key={key}
                  onClick={() => handleCategorySelect(key)}
                  className={`px-4 py-2 rounded-lg border transition-all flex items-center gap-2 ${
                    selectedCategory === key
                      ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                      : 'border-gray-200 hover:border-gray-300 text-gray-700'
                  }`}
                >
                  {getCategoryIcon(key)}
                  <span className="text-sm font-medium">
                    {datasetType.name}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Template Selection */}
          {selectedCategory && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <h4 className="text-sm font-semibold text-gray-900 mb-3">
                Choose a Template
              </h4>
              <div className="grid md:grid-cols-2 gap-2">
                {Object.entries(DATASET_TYPES[selectedCategory].templates).map(
                  ([templateId, template]) => (
                    <div
                      key={templateId}
                      onClick={() => handleTemplateSelect(templateId)}
                      className={`p-3 rounded-lg border cursor-pointer transition-all ${
                        selectedTemplate === templateId
                          ? 'border-indigo-500 bg-indigo-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <h5 className="text-sm font-medium text-gray-900">
                            {template.name}
                          </h5>
                          <p className="text-xs text-gray-600 mt-0.5">
                            {template.description}
                          </p>
                          <p className="text-xs text-gray-500 mt-1">
                            {template.schema.length ||
                              DATASET_TYPES[selectedCategory].defaultSchema
                                .length}{' '}
                            fields
                          </p>
                        </div>
                        <ArrowUpRight className="w-4 h-4 text-gray-400" />
                      </div>
                    </div>
                  )
                )}
              </div>
            </motion.div>
          )}
        </motion.div>
      )}

      {selectedType === 'transformation' && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-amber-50 border border-amber-200 rounded-lg p-4"
        >
          <p className="text-sm text-amber-800">
            <strong>Note:</strong> Upload your sensitive dataset to apply
            privacy-preserving transformations. All processing happens locally
            before blockchain verification.
          </p>
        </motion.div>
      )}
    </div>
  );
}
