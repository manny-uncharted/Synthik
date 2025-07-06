import { motion } from 'framer-motion';
import { Download, Star, Shield, TrendingUp, ArrowUpRight } from 'lucide-react';
import Link from 'next/link';

interface ModelCardProps {
  model: {
    id: string;
    name: string;
    description: string;
    provider: string;
    baseModel: string;
    datasetUsed: string;
    datasetRows: number;
    trainedBy: string;
    trainedDate: string;
    accuracy: number;
    downloads: number;
    stars: number;
    tags: string[];
    filecoinCID: string;
    status: 'training' | 'ready' | 'deprecated';
    metrics: {
      f1Score: number;
      precision: number;
      recall: number;
    };
  };
}

export default function ModelCard({ model }: ModelCardProps) {
  return (
    <motion.div
      whileHover={{ y: -4 }}
      className="group relative bg-white rounded-2xl overflow-hidden transition-all duration-300 hover:shadow-lg hover:shadow-gray-200/50"
    >
      {/* Status indicator - subtle */}
      <div className="absolute top-4 right-4 z-10">
        {model.status === 'ready' && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-white/90 backdrop-blur-sm rounded-full text-xs font-medium border border-emerald-200 text-emerald-700">
            <Shield className="w-3.5 h-3.5" />
            <span>Verified</span>
          </div>
        )}
        {model.status === 'training' && (
          <div className="px-3 py-1.5 bg-amber-50 rounded-full text-xs font-medium text-amber-700 border border-amber-200">
            Training
          </div>
        )}
      </div>

      {/* Main content */}
      <div className="p-6">
        {/* Header - simplified */}
        <div className="mb-4">
          <h3 className="text-xl font-semibold text-gray-900 mb-2 group-hover:text-indigo-600 transition-colors">
            {model.name}
          </h3>
          <p className="text-gray-600 text-sm leading-relaxed line-clamp-2">
            {model.description}
          </p>
        </div>

        {/* Key metric - prominent */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <div className="text-center">
              <div className="text-3xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
                {model.accuracy}%
              </div>
              <div className="text-xs text-gray-500 font-medium mt-1">
                accuracy
              </div>
            </div>

            {/* Secondary metrics - simplified */}
            <div className="flex gap-3 text-sm text-gray-600">
              <button className="flex items-center gap-1.5 hover:text-indigo-600 transition-colors">
                <Star className="w-4 h-4" />
                <span className="font-medium">{model.stars}</span>
              </button>
              <span className="text-gray-300">•</span>
              <span className="flex items-center gap-1.5">
                <Download className="w-4 h-4" />
                <span className="font-medium">
                  {(model.downloads / 1000).toFixed(1)}k
                </span>
              </span>
            </div>
          </div>

          {/* Trending badge */}
          {model.downloads > 2000 && (
            <TrendingUp className="w-5 h-5 text-orange-500" />
          )}
        </div>

        {/* Model details - minimal */}
        <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
          <span className="font-medium text-gray-700">{model.baseModel}</span>
          <span>•</span>
          <span>{model.trainedDate}</span>
        </div>

        {/* Tags - limited */}
        <div className="flex flex-wrap gap-2 mb-5">
          {model.tags.slice(0, 2).map((tag, index) => (
            <span
              key={index}
              className="px-3 py-1 bg-gray-50 text-gray-600 text-xs rounded-lg font-medium"
            >
              {tag}
            </span>
          ))}
          {model.tags.length > 2 && (
            <span className="px-3 py-1 text-gray-400 text-xs font-medium">
              +{model.tags.length - 2} more
            </span>
          )}
        </div>

        {/* Actions - simplified */}
        <Link
          href={`/models/${model.id}`}
          className="group/link flex items-center justify-between w-full px-4 py-3 bg-gray-50 hover:bg-indigo-50 rounded-xl transition-all"
        >
          <span className="text-sm font-medium text-gray-700 group-hover/link:text-indigo-600 transition-colors">
            View Model Details
          </span>
          <ArrowUpRight className="w-4 h-4 text-gray-400 group-hover/link:text-indigo-600 transition-all group-hover/link:translate-x-0.5 group-hover/link:-translate-y-0.5" />
        </Link>
      </div>
    </motion.div>
  );
}
