import { motion } from 'framer-motion';
import {
  Brain,
  Clock,
  Cpu,
  Download,
  Star,
  ArrowUpRight,
  CheckCircle,
  Zap,
} from 'lucide-react';
import Link from 'next/link';

interface ModelCardProps {
  id: string;
  name: string;
  description: string;
  baseModel: string;
  modelType: string;
  platform: string;
  status: string;
  metrics?: {
    loss: number;
    accuracy?: number;
  };
  downloads: number;
  stars: number;
  lastUpdated: string;
  creator: string;
  huggingfaceUrl?: string;
}

export default function ModelCard({
  id,
  name,
  description,
  baseModel,
  modelType,
  platform,
  status,
  metrics,
  downloads,
  stars,
  lastUpdated,
  creator,
  huggingfaceUrl,
}: ModelCardProps) {
  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'completed':
        return 'bg-green-50 text-green-700 border-green-200';
      case 'training':
      case 'running':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'failed':
        return 'bg-red-50 text-red-700 border-red-200';
      default:
        return 'bg-gray-50 text-gray-700 border-gray-200';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status.toLowerCase()) {
      case 'completed':
        return <CheckCircle className="w-3.5 h-3.5" />;
      case 'training':
      case 'running':
        return <Zap className="w-3.5 h-3.5 animate-pulse" />;
      default:
        return null;
    }
  };

  return (
    <Link href={`/models/${id}`}>
      <motion.article
        className="group relative h-full bg-white border border-gray-200 rounded-lg overflow-hidden hover:border-gray-300 hover:shadow-lg transition-all duration-200"
        whileHover={{ y: -2 }}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        {/* Gradient Header */}
        <div className="h-2 bg-gradient-to-r from-indigo-500 to-purple-600" />

        {/* Content */}
        <div className="p-4">
          {/* Header */}
          <div className="flex items-start justify-between mb-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-lg font-semibold text-gray-900 truncate group-hover:text-gray-700 transition-colors">
                  {name}
                </h3>
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${getStatusColor(
                    status
                  )}`}
                >
                  {getStatusIcon(status)}
                  {status}
                </span>
              </div>

              <div className="flex items-center gap-2 text-sm text-gray-600 mb-2">
                <Brain className="w-4 h-4" />
                <span className="truncate">{baseModel}</span>
              </div>

              <p className="text-sm text-gray-600 line-clamp-2 leading-relaxed">
                {description}
              </p>
            </div>
          </div>

          {/* Model Type & Platform */}
          <div className="flex items-center gap-3 mb-3">
            <span className="px-2 py-1 bg-indigo-50 text-indigo-600 text-xs rounded-lg font-medium">
              {modelType}
            </span>
            <span className="px-2 py-1 bg-purple-50 text-purple-600 text-xs rounded-lg font-medium capitalize">
              {platform.replace('_', ' ')}
            </span>
          </div>

          {/* Metrics Preview (if available) */}
          {metrics && status === 'completed' && (
            <div className="flex items-center gap-4 p-3 bg-gradient-to-r from-gray-50 to-gray-100 rounded-lg mb-3">
              <div className="text-center">
                <div className="text-sm font-semibold text-gray-900">
                  {metrics.loss.toFixed(4)}
                </div>
                <div className="text-xs text-gray-500">Loss</div>
              </div>
              {metrics.accuracy && (
                <div className="text-center">
                  <div className="text-sm font-semibold text-gray-900">
                    {(metrics.accuracy * 100).toFixed(1)}%
                  </div>
                  <div className="text-xs text-gray-500">Accuracy</div>
                </div>
              )}
            </div>
          )}

          {/* Stats */}
          <div className="grid grid-cols-3 gap-3 p-3 bg-gray-50 rounded-md">
            <div className="text-center">
              <div className="text-sm font-semibold text-gray-900">
                {downloads >= 1000
                  ? `${(downloads / 1000).toFixed(1)}k`
                  : downloads.toLocaleString()}
              </div>
              <div className="text-xs text-gray-500">Downloads</div>
            </div>

            <div className="text-center">
              <div className="flex items-center justify-center gap-1">
                <Star className="w-3 h-3 text-yellow-500 fill-yellow-500" />
                <span className="text-sm font-semibold text-gray-900">
                  {stars}
                </span>
              </div>
              <div className="text-xs text-gray-500">Stars</div>
            </div>

            <div className="text-center">
              <div className="text-sm font-semibold text-gray-900 capitalize">
                {platform === 'hugging_face' ? 'HF' : 'Local'}
              </div>
              <div className="text-xs text-gray-500">Platform</div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-3 bg-gradient-to-r from-indigo-50 to-purple-50 border-t border-gray-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 text-xs text-gray-600">
              <div className="flex items-center gap-1">
                <Cpu className="w-3 h-3" />
                <span>{creator}</span>
              </div>
              <div className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                <span>{lastUpdated}</span>
              </div>
            </div>
            <div className="flex items-center gap-1 text-sm text-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity">
              <span>View</span>
              <ArrowUpRight className="w-4 h-4" />
            </div>
          </div>
        </div>
      </motion.article>
    </Link>
  );
}
