import { motion } from 'framer-motion';
import {
  Sparkles,
  Upload,
  FileText,
  Layers,
  Database,
  ArrowUpRight,
} from 'lucide-react';
import { useState } from 'react';

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

const templates = [
  { id: 'ecommerce', name: 'E-commerce Orders', rows: '10k', fields: 12 },
  { id: 'healthcare', name: 'Patient Records', rows: '5k', fields: 18 },
  { id: 'financial', name: 'Transaction History', rows: '50k', fields: 8 },
  { id: 'marketing', name: 'Customer Profiles', rows: '25k', fields: 15 },
  { id: 'hr', name: 'Employee Database', rows: '1k', fields: 20 },
  { id: 'iot', name: 'Sensor Readings', rows: '100k', fields: 6 },
];

export default function DatasetTypeSelector({
  selectedType,
  onTypeSelect,
  uploadedFile,
  onFileUpload,
  selectedTemplate,
  onTemplateSelect,
}: DatasetTypeSelectorProps) {
  const [dragActive, setDragActive] = useState(false);

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
        </motion.div>
      )}

      {selectedType === 'template' && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-3"
        >
          <h4 className="text-sm font-semibold text-gray-900">
            Choose a Template
          </h4>
          <div className="grid md:grid-cols-2 gap-2">
            {templates.map((template) => (
              <div
                key={template.id}
                onClick={() => onTemplateSelect?.(template.id)}
                className={`p-3 rounded-lg border cursor-pointer transition-all ${
                  selectedTemplate === template.id
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
                      {template.rows} rows • {template.fields} fields
                    </p>
                  </div>
                  <ArrowUpRight className="w-4 h-4 text-gray-400" />
                </div>
              </div>
            ))}
          </div>
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
