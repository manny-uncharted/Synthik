import { motion } from 'framer-motion';
import { Brain } from 'lucide-react';

// Available models
const baseModels = [
  {
    id: 'bert-base',
    name: 'BERT Base',
    description: 'General-purpose language understanding model',
    params: '110M',
    category: 'NLP',
  },
  {
    id: 'pythia-70m',
    name: 'EleutherAI/pythia-70m-deduped',
    description: 'Lightweight causal language model for text generation',
    params: '70M',
    category: 'CAUSAL_LM',
    recommended: true,
  },
  {
    id: 'qwen2.5-1.5b',
    name: 'chansung/Qwen2.5-1.5B-CCRL-CUR-UNI-1E',
    description: 'Advanced causal language model with curriculum learning',
    params: '1.5B',
    category: 'CAUSAL_LM',
    recommended: true,
  },
  {
    id: 'xlm-roberta',
    name: 'XLM-RoBERTa',
    description: 'Multilingual language understanding',
    params: '550M',
    category: 'NLP',
  },
];

interface ModelParams {
  epochs: number;
  batchSize: number;
  learningRate: number;
  maxLength: number;
}

interface ModelSelectionStepProps {
  selectedModel: string;
  setSelectedModel: (model: string) => void;
  modelParams: ModelParams;
  setModelParams: (params: ModelParams) => void;
}

export default function ModelSelectionStep({
  selectedModel,
  setSelectedModel,
  modelParams,
  setModelParams,
}: ModelSelectionStepProps) {
  return (
    <div>
      <h2 className="text-2xl font-semibold text-gray-900 mb-6 display-font">
        Select Base Model
      </h2>

      {/* Model Grid */}
      <div className="grid md:grid-cols-2 gap-4 mb-8">
        {baseModels.map((model) => (
          <motion.div
            key={model.id}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setSelectedModel(model.id)}
            className={`relative border-2 rounded-xl p-6 cursor-pointer transition-all ${
              selectedModel === model.id
                ? 'border-indigo-600 bg-indigo-50'
                : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            {model.recommended && (
              <span className="absolute top-3 right-3 px-2 py-1 bg-green-100 text-green-700 text-xs font-medium rounded-full">
                Recommended
              </span>
            )}
            <Brain className="w-8 h-8 text-indigo-600 mb-3" />
            <h3 className="text-lg font-semibold text-gray-900 mb-1">
              {model.name}
            </h3>
            <p className="text-sm text-gray-600 mb-2">{model.description}</p>
            <div className="flex items-center gap-3 text-xs text-gray-500">
              <span className="font-medium">{model.params} params</span>
              <span>•</span>
              <span>{model.category}</span>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Training Parameters */}
      <div className="border-t border-gray-200 pt-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Training Parameters
        </h3>
        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Epochs
            </label>
            <input
              type="number"
              value={modelParams.epochs}
              onChange={(e) =>
                setModelParams({
                  ...modelParams,
                  epochs: parseInt(e.target.value),
                })
              }
              className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Batch Size
            </label>
            <input
              type="number"
              value={modelParams.batchSize}
              onChange={(e) =>
                setModelParams({
                  ...modelParams,
                  batchSize: parseInt(e.target.value),
                })
              }
              className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Learning Rate
            </label>
            <input
              type="text"
              value={modelParams.learningRate}
              onChange={(e) =>
                setModelParams({
                  ...modelParams,
                  learningRate: parseFloat(e.target.value),
                })
              }
              className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Max Sequence Length
            </label>
            <input
              type="number"
              value={modelParams.maxLength}
              onChange={(e) =>
                setModelParams({
                  ...modelParams,
                  maxLength: parseInt(e.target.value),
                })
              }
              className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-500"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
