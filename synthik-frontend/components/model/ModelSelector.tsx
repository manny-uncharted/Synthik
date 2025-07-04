import { motion } from 'framer-motion';
import { Cpu, Zap, Crown, CheckCircle, AlertCircle } from 'lucide-react';
import { GenerationModel } from '../../services/dataset-generation';

interface Model extends GenerationModel {
  description: string;
  features: string[];
  tier: 'free' | 'pro' | 'enterprise';
  speed: 'fast' | 'balanced' | 'quality';
  available: boolean;
}

interface ModelSelectorProps {
  selectedModel: string;
  onModelSelect: (modelId: string) => void;
}

const models: Model[] = [
  {
    id: 'gpt-4o-mini',
    name: 'GPT-4o Mini',
    provider: 'openai',
    description: 'Fast and cost-effective model with good quality',
    features: ['Fast generation', 'Cost effective', 'Good quality'],
    tier: 'pro',
    speed: 'fast',
    available: true,
    capabilities: {
      maxTokens: 128000,
      supportsStructuredOutput: true,
      supportsStreaming: true,
      costPerToken: 0.00015,
    },
  },
  {
    id: 'gpt-4-turbo',
    name: 'GPT-4 Turbo',
    provider: 'openai',
    description: 'Most capable model for complex datasets',
    features: ['Complex reasoning', 'Structured output', 'High accuracy'],
    tier: 'enterprise',
    speed: 'quality',
    available: true,
    capabilities: {
      maxTokens: 128000,
      supportsStructuredOutput: true,
      supportsStreaming: true,
      costPerToken: 0.00003,
    },
  },
  {
    id: 'gpt-3.5-turbo',
    name: 'GPT-3.5 Turbo',
    provider: 'openai',
    description: 'Fast and cost-effective for most use cases',
    features: ['Fast generation', 'Good quality', 'Cost effective'],
    tier: 'pro',
    speed: 'fast',
    available: true,
    capabilities: {
      maxTokens: 16385,
      supportsStructuredOutput: true,
      supportsStreaming: true,
      costPerToken: 0.000002,
    },
  },
  {
    id: 'claude-3-opus',
    name: 'Claude 3 Opus',
    provider: 'anthropic',
    description: 'Excellent for structured data with high consistency',
    features: ['Long context', 'Structured output', 'High accuracy'],
    tier: 'enterprise',
    speed: 'quality',
    available: false, // Placeholder for future integration
    capabilities: {
      maxTokens: 200000,
      supportsStructuredOutput: true,
      supportsStreaming: true,
      costPerToken: 0.00003,
    },
  },
  {
    id: 'claude-3-sonnet',
    name: 'Claude 3 Sonnet',
    provider: 'anthropic',
    description: 'Balanced performance and cost',
    features: ['Good reasoning', 'Fast responses', 'Reliable'],
    tier: 'pro',
    speed: 'balanced',
    available: false, // Placeholder for future integration
    capabilities: {
      maxTokens: 200000,
      supportsStructuredOutput: true,
      supportsStreaming: true,
      costPerToken: 0.000015,
    },
  },
  {
    id: 'gemini-1.5-flash',
    name: 'Gemini 1.5 Flash',
    provider: 'google',
    description: 'Ultra-fast generation with 2M token context window',
    features: [
      '2M token context',
      'Ultra fast',
      'Large batches',
      'Cost effective',
    ],
    tier: 'pro',
    speed: 'fast',
    available: true,
    capabilities: {
      maxTokens: 2097152, // 2M tokens
      supportsStructuredOutput: true,
      supportsStreaming: true,
      costPerToken: 0.000001, // Very cost effective
    },
  },
  {
    id: 'gemini-1.5-pro',
    name: 'Gemini 1.5 Pro',
    provider: 'google',
    description: 'Advanced reasoning with massive context window',
    features: [
      '2M token context',
      'Advanced reasoning',
      'High quality',
      'Complex schemas',
    ],
    tier: 'enterprise',
    speed: 'quality',
    available: true,
    capabilities: {
      maxTokens: 2097152, // 2M tokens
      supportsStructuredOutput: true,
      supportsStreaming: true,
      costPerToken: 0.000007,
    },
  },
  {
    id: 'gemini-pro',
    name: 'Gemini Pro',
    provider: 'google',
    description: 'Balanced performance with good context',
    features: ['32K context', 'Good reasoning', 'Reliable', 'Multi-modal'],
    tier: 'pro',
    speed: 'balanced',
    available: true,
    capabilities: {
      maxTokens: 32768,
      supportsStructuredOutput: true,
      supportsStreaming: true,
      costPerToken: 0.000005,
    },
  },
  {
    id: 'llama-3-70b',
    name: 'Llama 3 70B',
    provider: 'meta',
    description: 'Open source model with great performance',
    features: ['Open source', 'Customizable', 'Self-hosted'],
    tier: 'free',
    speed: 'balanced',
    available: false, // Placeholder for future integration
    capabilities: {
      maxTokens: 8192,
      supportsStructuredOutput: false,
      supportsStreaming: true,
      costPerToken: 0,
    },
  },
];

export default function ModelSelector({
  selectedModel,
  onModelSelect,
}: ModelSelectorProps) {
  const getTierColor = (tier: string) => {
    switch (tier) {
      case 'enterprise':
        return 'from-purple-600 to-indigo-600';
      case 'pro':
        return 'from-indigo-600 to-blue-600';
      default:
        return 'from-green-600 to-teal-600';
    }
  };

  const getTierIcon = (tier: string) => {
    switch (tier) {
      case 'enterprise':
        return <Crown className="w-3 h-3" />;
      case 'pro':
        return <Zap className="w-3 h-3" />;
      default:
        return <Cpu className="w-3 h-3" />;
    }
  };

  const getSpeedIndicator = (speed: string) => {
    switch (speed) {
      case 'fast':
        return { label: 'Fast', dots: 1 };
      case 'balanced':
        return { label: 'Balanced', dots: 2 };
      case 'quality':
        return { label: 'Quality', dots: 3 };
      default:
        return { label: 'Balanced', dots: 2 };
    }
  };

  return (
    <div className="space-y-3">
      <div className="grid md:grid-cols-2 gap-3">
        {models.map((model) => {
          const isSelected = selectedModel === model.id;
          const speedInfo = getSpeedIndicator(model.speed);

          return (
            <motion.div
              key={model.id}
              whileHover={{ scale: model.available ? 1.02 : 1 }}
              whileTap={{ scale: model.available ? 0.98 : 1 }}
              onClick={() => model.available && onModelSelect(model.id)}
              className={`relative cursor-pointer rounded-lg p-4 border-2 transition-all ${
                !model.available ? 'opacity-60 cursor-not-allowed' : ''
              } ${
                isSelected
                  ? 'border-indigo-500 bg-indigo-50'
                  : 'border-gray-200 bg-white hover:border-gray-300'
              }`}
            >
              {/* Selection indicator */}
              {isSelected && model.available && (
                <div className="absolute top-3 right-3">
                  <CheckCircle className="w-4 h-4 text-indigo-600" />
                </div>
              )}

              {/* Coming soon badge */}
              {!model.available && (
                <div className="absolute top-3 right-3">
                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full">
                    Coming Soon
                  </span>
                </div>
              )}

              {/* Model tier badge */}
              <div
                className={`inline-flex items-center gap-1 px-2 py-0.5 bg-gradient-to-r ${getTierColor(
                  model.tier
                )} text-white text-xs font-medium rounded-full mb-2 ${
                  !model.available ? 'opacity-60' : ''
                }`}
              >
                {getTierIcon(model.tier)}
                <span className="capitalize">{model.tier}</span>
              </div>

              <h4 className="text-base font-semibold text-gray-900 mb-0.5">
                {model.name}
              </h4>
              <p className="text-xs text-gray-500 mb-2">{model.provider}</p>
              <p className="text-xs text-gray-600 mb-3">{model.description}</p>

              {/* Capabilities */}
              <div className="flex flex-wrap gap-1.5 mb-3">
                {model.features.map((cap, index) => (
                  <span
                    key={index}
                    className="px-1.5 py-0.5 bg-gray-100 text-gray-700 text-xs rounded"
                  >
                    {cap}
                  </span>
                ))}
              </div>

              {/* Speed indicator */}
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-500">{speedInfo.label}</span>
                <div className="flex gap-0.5">
                  {[1, 2, 3].map((dot) => (
                    <div
                      key={dot}
                      className={`w-1.5 h-1.5 rounded-full ${
                        dot <= speedInfo.dots ? 'bg-indigo-500' : 'bg-gray-300'
                      }`}
                    />
                  ))}
                </div>
              </div>

              {/* Cost indicator */}
              <div className="mt-2 text-xs text-gray-500">
                {model.capabilities.costPerToken > 0 ? (
                  <span>
                    ~${(model.capabilities.costPerToken * 1000).toFixed(3)} per
                    1K tokens
                  </span>
                ) : (
                  <span>Free to use</span>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* API Key Notice */}
      {selectedModel &&
        models.find((m) => m.id === selectedModel)?.available && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="text-xs text-blue-800">
              <p className="font-medium mb-1">API Key Required</p>
              <p>
                You&apos;ll need to provide your{' '}
                {models.find((m) => m.id === selectedModel)?.provider} API key
                in the environment variables to use this model.
              </p>
            </div>
          </div>
        )}
    </div>
  );

  // Export this for parent components to access
  // Parent components can call this through a ref or callback
}

// Export helper to get model data
export function getModelById(modelId: string): GenerationModel | undefined {
  const model = models.find((m) => m.id === modelId);
  if (!model) return undefined;

  return {
    id: model.id,
    name: model.name,
    provider: model.provider,
    capabilities: model.capabilities,
  };
}
