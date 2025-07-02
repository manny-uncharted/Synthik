import { motion } from 'framer-motion';
import { Eye, Star, Lock, Download, Database, User } from 'lucide-react';
import Link from 'next/link';

interface DatasetCardProps {
  id?: string;
  title: string;
  description: string;
  category: string;
  size: string;
  downloads: number;
  views: number;
  rating: number;
  lastUpdated: string;
  isVerified?: boolean;
  isLocked?: boolean;
  price?: number; // in USDFC
  creator?: string;
}

export default function DatasetCard({
  id = '1',
  title,
  description,
  category,
  size,
  downloads,
  views,
  rating,
  lastUpdated,
  isVerified = true,
  isLocked = true,
  price = 25,
  creator = 'alice.eth',
}: DatasetCardProps) {
  return (
    <Link href={`/datasets/${id}`}>
      <motion.article
        className="group h-full bg-white rounded-xl border-2 border-gray-100 overflow-hidden hover:border-indigo-400 hover:shadow-2xl hover:shadow-indigo-200/20 transition-all duration-200"
        whileHover={{ y: -4 }}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        {/* Header with price */}
        <div className="p-6 pb-4">
          <div className="flex items-start justify-between mb-4">
            <div className="flex-1 pr-4">
              <h3 className="text-lg font-bold text-gray-900 mb-1 group-hover:text-indigo-600 transition-colors">
                {title}
              </h3>
              <div className="flex items-center gap-2 text-sm text-gray-700">
                <User className="w-3.5 h-3.5 text-indigo-500" />
                <span className="font-medium">{creator}</span>
                {isVerified && (
                  <svg
                    className="w-4 h-4 text-blue-500"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                      clipRule="evenodd"
                    />
                  </svg>
                )}
              </div>
            </div>

            {/* Price display - distinctive */}
            {isLocked ? (
              <div className="text-right">
                <div className="flex items-center gap-1">
                  <Lock className="w-4 h-4 text-orange-500" />
                  <span className="text-2xl font-extrabold text-gray-900">
                    ${price}
                  </span>
                </div>
                <span className="text-xs text-gray-600 uppercase tracking-wide font-semibold">
                  USDFC
                </span>
              </div>
            ) : (
              <div className="px-3 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg text-sm font-semibold">
                Free
              </div>
            )}
          </div>

          {/* Description */}
          <p className="text-sm text-gray-700 line-clamp-2 mb-4 leading-relaxed font-medium">
            {description}
          </p>

          {/* Category */}
          <div className="flex items-center gap-2 mb-4">
            <Database className="w-4 h-4 text-indigo-500" />
            <span className="text-sm font-semibold text-gray-800">
              {category}
            </span>
          </div>
        </div>

        {/* Stats section */}
        <div className="px-6 pb-6">
          <div className="flex items-center justify-between text-sm bg-gradient-to-r from-indigo-50 via-purple-50 to-pink-50 rounded-lg p-3 border border-indigo-100">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1 text-gray-700">
                <Download className="w-4 h-4 text-indigo-500" />
                <span className="font-bold">
                  {(downloads / 1000).toFixed(1)}k
                </span>
              </div>
              <div className="flex items-center gap-1 text-gray-700">
                <Eye className="w-4 h-4 text-purple-500" />
                <span className="font-bold">{(views / 1000).toFixed(1)}k</span>
              </div>
              <div className="flex items-center gap-1 text-gray-700">
                <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />
                <span className="font-bold">{rating.toFixed(1)}</span>
              </div>
            </div>
            <span className="text-gray-700 font-bold">{size}</span>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-gradient-to-r from-gray-50 to-indigo-50 border-t border-indigo-100">
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-600 font-medium">
              Updated {lastUpdated}
            </span>
            <span className="text-indigo-600 font-bold opacity-0 group-hover:opacity-100 transition-opacity">
              View details →
            </span>
          </div>
        </div>
      </motion.article>
    </Link>
  );
}
