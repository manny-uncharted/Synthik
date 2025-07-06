import { motion } from 'framer-motion';
import Link from 'next/link';
import { Check, Loader2, Sparkles } from 'lucide-react';

interface TrainingStatusStepProps {
  isTraining: boolean;
  selectedTarget: string;
}

export default function TrainingStatusStep({
  isTraining,
  selectedTarget,
}: TrainingStatusStepProps) {
  return (
    <div className="text-center py-12">
      {isTraining ? (
        <>
          <motion.div
            animate={{ rotate: 360 }}
            transition={{
              duration: 2,
              repeat: Infinity,
              ease: 'linear',
            }}
            className="w-16 h-16 border-4 border-indigo-200 border-t-indigo-600 rounded-full mx-auto mb-6"
          />
          <h2 className="text-2xl font-semibold text-gray-900 mb-2 display-font">
            Training in Progress
          </h2>
          <p className="text-gray-600 mb-8">
            Your model is being trained. This may take several minutes...
          </p>

          {/* Progress indicators */}
          <div className="max-w-md mx-auto space-y-4">
            <div className="bg-gray-50 rounded-lg p-4 text-left">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-700">
                  Preprocessing data
                </span>
                <Check className="w-4 h-4 text-green-600" />
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div className="bg-green-600 h-2 rounded-full w-full" />
              </div>
            </div>
            <div className="bg-gray-50 rounded-lg p-4 text-left">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-700">
                  Training model
                </span>
                <Loader2 className="w-4 h-4 text-indigo-600 animate-spin" />
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <motion.div
                  initial={{ width: '0%' }}
                  animate={{ width: '60%' }}
                  transition={{ duration: 30 }}
                  className="bg-indigo-600 h-2 rounded-full"
                />
              </div>
            </div>
            <div className="bg-gray-50 rounded-lg p-4 text-left">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-700">
                  Deploying to {selectedTarget}
                </span>
                <div className="w-4 h-4 rounded-full bg-gray-300" />
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2" />
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <Check className="w-8 h-8 text-green-600" />
          </div>
          <h2 className="text-2xl font-semibold text-gray-900 mb-2 display-font">
            Training Complete!
          </h2>
          <p className="text-gray-600 mb-8">
            Your model has been successfully trained and deployed.
          </p>
          <div className="flex justify-center gap-4">
            <Link
              href="/models/new-model"
              className="px-6 py-3 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 transition-colors flex items-center gap-2"
            >
              <Sparkles className="w-4 h-4" />
              View Model
            </Link>
            <Link
              href="/datasets"
              className="px-6 py-3 border border-gray-200 rounded-xl font-medium hover:border-gray-300 transition-colors"
            >
              Train Another
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
