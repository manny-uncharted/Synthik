import { motion } from 'framer-motion';
import { Globe, Lock, Users, Eye, Shield, Coins } from 'lucide-react';

interface VisibilityOption {
  id: 'public' | 'private' | 'restricted';
  title: string;
  description: string;
  features: string[];
  icon: React.ReactNode;
  recommended?: boolean;
}

interface DatasetVisibilityProps {
  visibility: 'public' | 'private' | 'restricted';
  onVisibilityChange: (visibility: 'public' | 'private' | 'restricted') => void;
  licenseType?: string;
  onLicenseChange?: (license: string) => void;
  pricePerRow?: number;
  onPriceChange?: (price: number) => void;
}

const visibilityOptions: VisibilityOption[] = [
  {
    id: 'public',
    title: 'Public Dataset',
    description: 'Anyone can discover and use your dataset',
    features: [
      'Listed in marketplace',
      'Indexed by search engines',
      'Community contributions',
      'Higher visibility',
    ],
    icon: <Globe className="w-5 h-5" />,
    recommended: true,
  },
  {
    id: 'private',
    title: 'Private Dataset',
    description: 'Only you can access this dataset',
    features: [
      'Complete privacy',
      'No marketplace listing',
      'Personal use only',
      'Full control',
    ],
    icon: <Lock className="w-5 h-5" />,
  },
  {
    id: 'restricted',
    title: 'Restricted Access',
    description: 'Share with specific users or teams',
    features: [
      'Invite-only access',
      'Team collaboration',
      'Access control',
      'Usage analytics',
    ],
    icon: <Users className="w-5 h-5" />,
  },
];

const licenses = [
  {
    value: 'mit',
    label: 'MIT License',
    description: 'Permissive - allows commercial use',
  },
  { value: 'cc-by', label: 'CC BY 4.0', description: 'Attribution required' },
  {
    value: 'cc-by-sa',
    label: 'CC BY-SA 4.0',
    description: 'Attribution + ShareAlike',
  },
  { value: 'proprietary', label: 'Proprietary', description: 'Custom terms' },
];

export default function DatasetVisibility({
  visibility,
  onVisibilityChange,
  licenseType = 'mit',
  onLicenseChange,
  pricePerRow = 0,
  onPriceChange,
}: DatasetVisibilityProps) {
  return (
    <div className="space-y-6">
      {/* Visibility Options */}
      <div>
        <h3 className="text-base font-semibold text-gray-900 mb-4">
          Who can access this dataset?
        </h3>

        <div className="grid md:grid-cols-3 gap-3">
          {visibilityOptions.map((option) => (
            <motion.div
              key={option.id}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => onVisibilityChange(option.id)}
              className={`relative cursor-pointer rounded-lg p-4 border-2 transition-all ${
                visibility === option.id
                  ? 'border-indigo-500 bg-indigo-50/50'
                  : 'border-gray-200 bg-white hover:border-gray-300'
              }`}
            >
              {option.recommended && (
                <div className="absolute -top-2 left-4 px-2 py-0.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white text-xs font-medium rounded-full">
                  Recommended
                </div>
              )}

              <div
                className={`w-10 h-10 rounded-lg flex items-center justify-center mb-3 ${
                  visibility === option.id
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-100 text-gray-600'
                }`}
              >
                {option.icon}
              </div>

              <h4 className="text-sm font-semibold text-gray-900 mb-1">
                {option.title}
              </h4>
              <p className="text-xs text-gray-600 mb-3">{option.description}</p>

              <ul className="space-y-1">
                {option.features.map((feature, index) => (
                  <li
                    key={index}
                    className="flex items-center gap-1.5 text-xs text-gray-700"
                  >
                    <div
                      className={`w-1 h-1 rounded-full ${
                        visibility === option.id
                          ? 'bg-indigo-600'
                          : 'bg-gray-400'
                      }`}
                    />
                    {feature}
                  </li>
                ))}
              </ul>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Additional Settings for Public Datasets */}
      {visibility === 'public' && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="space-y-4"
        >
          {/* License Selection */}
          <div>
            <h4 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-1.5">
              <Shield className="w-4 h-4 text-indigo-600" />
              Dataset License
            </h4>
            <div className="grid md:grid-cols-2 gap-2">
              {licenses.map((license) => (
                <div
                  key={license.value}
                  onClick={() => onLicenseChange?.(license.value)}
                  className={`p-3 rounded-lg border-2 cursor-pointer transition-all ${
                    licenseType === license.value
                      ? 'border-indigo-500 bg-indigo-50/50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h5 className="text-sm font-medium text-gray-900">
                        {license.label}
                      </h5>
                      <p className="text-xs text-gray-600 mt-0.5">
                        {license.description}
                      </p>
                    </div>
                    <div
                      className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                        licenseType === license.value
                          ? 'border-indigo-600 bg-indigo-600'
                          : 'border-gray-300'
                      }`}
                    >
                      {licenseType === license.value && (
                        <div className="w-1.5 h-1.5 bg-white rounded-full" />
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Monetization Options */}
          <div>
            <h4 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-1.5">
              <Coins className="w-4 h-4 text-indigo-600" />
              Monetization (Optional)
            </h4>
            <div className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h5 className="text-sm font-medium text-gray-900">
                    Enable paid access
                  </h5>
                  <p className="text-xs text-gray-600">
                    Charge per row for dataset access
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={pricePerRow > 0}
                    onChange={(e) =>
                      onPriceChange?.(e.target.checked ? 0.001 : 0)
                    }
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
                </label>
              </div>

              {pricePerRow > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-2"
                >
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Price per row (in USD)
                    </label>
                    <div className="relative">
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500 text-sm">
                        $
                      </span>
                      <input
                        type="number"
                        value={pricePerRow}
                        onChange={(e) =>
                          onPriceChange?.(parseFloat(e.target.value) || 0)
                        }
                        className="w-full pl-7 pr-3 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:border-indigo-500"
                        placeholder="0.001"
                        min="0.001"
                        step="0.001"
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-gray-600">
                    <Eye className="w-3.5 h-3.5" />
                    <span>
                      Estimated earnings: ${(pricePerRow * 10000).toFixed(2)}{' '}
                      per 10k rows
                    </span>
                  </div>
                </motion.div>
              )}
            </div>
          </div>
        </motion.div>
      )}

      {/* Visibility Summary */}
      <div className="bg-gray-50 rounded-lg p-4">
        <h4 className="text-sm font-medium text-gray-900 mb-2">
          Visibility Summary
        </h4>
        <div className="space-y-1.5 text-xs">
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 bg-indigo-600 rounded-full" />
            <span className="text-gray-700">
              Dataset will be{' '}
              <span className="font-semibold">{visibility}</span>
            </span>
          </div>
          {visibility === 'public' && (
            <>
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 bg-indigo-600 rounded-full" />
                <span className="text-gray-700">
                  Licensed under{' '}
                  <span className="font-semibold">
                    {licenses.find((l) => l.value === licenseType)?.label}
                  </span>
                </span>
              </div>
              {pricePerRow > 0 && (
                <div className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 bg-indigo-600 rounded-full" />
                  <span className="text-gray-700">
                    Priced at{' '}
                    <span className="font-semibold">${pricePerRow}</span> per
                    row
                  </span>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
