import { motion } from 'framer-motion';
import { Cpu, Zap, Crown, CheckCircle } from 'lucide-react';

interface Model {
  id: string;
  name: string;
  provider: string;
  description: string;
  capabilities: string[];
  tier: 'free' | 'pro' | 'enterprise';
  speed: 'fast' | 'balanced' | 'quality';
}

interface ModelSelectorProps {
  selectedModel: string;
  onModelSelect: (modelId: string) => void;
}

const models: Model[] = [
  {
    id: 'gpt-4-turbo',
    name: 'GPT-4 Turbo',
    provider: 'OpenAI',
    description: 'Most capable model for complex datasets',
    capabilities: ['Complex reasoning', 'Multi-language', 'Code generation'],
    tier: 'enterprise',
    speed: 'quality',
  },
  {
    id: 'claude-3-opus',
    name: 'Claude 3 Opus',
    provider: 'Anthropic',
    description: 'Excellent for structured data with high consistency',
    capabilities: ['Long context', 'Structured output', 'High accuracy'],
    tier: 'pro',
    speed: 'balanced',
  },
  {
    id: 'gemini-pro',
    name: 'Gemini Pro',
    provider: 'Google',
    description: 'Fast generation with good quality',
    capabilities: ['Fast inference', 'Multi-modal', 'Cost effective'],
    tier: 'pro',
    speed: 'fast',
  },
  {
    id: 'llama-3-70b',
    name: 'Llama 3 70B',
    provider: 'Meta',
    description: 'Open source model with great performance',
    capabilities: ['Open source', 'Customizable', 'Self-hosted'],
    tier: 'free',
    speed: 'balanced',
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
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => onModelSelect(model.id)}
              className={`relative cursor-pointer rounded-lg p-4 border-2 transition-all ${
                isSelected
                  ? 'border-indigo-500 bg-indigo-50'
                  : 'border-gray-200 bg-white hover:border-gray-300'
              }`}
            >
              {/* Selection indicator */}
              {isSelected && (
                <div className="absolute top-3 right-3">
                  <CheckCircle className="w-4 h-4 text-indigo-600" />
                </div>
              )}

              {/* Model tier badge */}
              <div
                className={`inline-flex items-center gap-1 px-2 py-0.5 bg-gradient-to-r ${getTierColor(
                  model.tier
                )} text-white text-xs font-medium rounded-full mb-2`}
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
                {model.capabilities.map((cap, index) => (
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
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
