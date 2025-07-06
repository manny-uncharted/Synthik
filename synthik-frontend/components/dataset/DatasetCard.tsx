import { motion } from 'framer-motion';
import { Star, Lock, User, Clock, ArrowUpRight } from 'lucide-react';
import Link from 'next/link';

interface DatasetCardProps {
  id?: string;
  title: string;
  description: string;
  category: string;
  tags?: string[];
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
  // category,
  tags = [],
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
        className="group relative h-full bg-white border border-gray-200 rounded-lg overflow-hidden hover:border-gray-300 hover:shadow-lg transition-all duration-200"
        whileHover={{ y: -2 }}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        {/* Header */}
        <div className="p-4">
          <div className="flex items-start justify-between mb-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-lg font-semibold text-gray-900 truncate group-hover:text-gray-700 transition-colors">
                  {title}
                </h3>
                {isVerified && (
                  <div className="flex-shrink-0 w-4 h-4 bg-blue-500 rounded-full flex items-center justify-center">
                    <svg
                      className="w-2.5 h-2.5 text-white"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 text-sm text-gray-600 mb-2">
                <User className="w-4 h-4" />
                <span>{creator}</span>
              </div>

              <p className="text-sm text-gray-600 line-clamp-2 leading-relaxed mb-3">
                {description}
              </p>

              {/* <div className="flex items-center gap-2">
                <Database className="w-4 h-4 text-gray-500" />
                <span className="text-sm font-medium text-gray-700">
                  {category}
                </span>
              </div> */}

              {/* Tags */}
              {tags && tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {tags.slice(0, 3).map((tag, index) => (
                    <span
                      key={index}
                      className="px-2 py-1 bg-indigo-50 text-indigo-600 text-xs rounded-full font-medium"
                    >
                      {tag}
                    </span>
                  ))}
                  {tags.length > 3 && (
                    <span className="px-2 py-1 bg-gray-100 text-gray-500 text-xs rounded-full font-medium">
                      +{tags.length - 3}
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Price */}
            <div className="flex-shrink-0 ml-4">
              {isLocked ? (
                <div className="text-right">
                  <div className="flex items-center gap-1.5 text-gray-900">
                    <Lock className="w-4 h-4 text-gray-500" />
                    <span className="text-xl font-bold">${price}</span>
                  </div>
                  <span className="text-xs text-gray-500 font-medium">
                    USDFC
                  </span>
                </div>
              ) : (
                <div className="px-3 py-1 bg-gray-100 text-gray-700 rounded text-sm font-medium">
                  Free
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="px-4 pb-4">
          <div className="grid grid-cols-4 gap-3 p-3 bg-gray-50 rounded-md">
            <div className="text-center">
              <div className="text-sm font-semibold text-gray-900">
                {downloads >= 1000
                  ? `${(downloads / 1000).toFixed(1)}k`
                  : downloads.toLocaleString()}
              </div>
              <div className="text-xs text-gray-500">Downloads</div>
            </div>

            <div className="text-center">
              <div className="text-sm font-semibold text-gray-900">
                {views >= 1000
                  ? `${(views / 1000).toFixed(1)}k`
                  : views.toLocaleString()}
              </div>
              <div className="text-xs text-gray-500">Views</div>
            </div>

            <div className="text-center">
              <div className="flex items-center justify-center gap-1">
                <Star className="w-3 h-3 text-yellow-500 fill-yellow-500" />
                <span className="text-sm font-semibold text-gray-900">
                  {rating.toFixed(1)}
                </span>
              </div>
              <div className="text-xs text-gray-500">Rating</div>
            </div>

            <div className="text-center">
              <div className="text-sm font-semibold text-gray-900">{size}</div>
              <div className="text-xs text-gray-500">Size</div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-3 bg-gray-50 border-t border-gray-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs text-gray-500">
              <Clock className="w-3 h-3" />
              <span>Updated {lastUpdated}</span>
            </div>
            <div className="flex items-center gap-1 text-sm text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity">
              <span>View details</span>
              <ArrowUpRight className="w-4 h-4" />
            </div>
          </div>
        </div>
      </motion.article>
    </Link>
  );
}
