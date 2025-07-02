import { motion } from 'framer-motion';
import { LucideIcon } from 'lucide-react';

interface CreateDatasetCardProps {
  icon: React.ReactElement<LucideIcon>;
  title: string;
  description: string;
  badge?: string;
  onClick?: () => void;
}

export default function CreateDatasetCard({
  icon,
  title,
  description,
  badge,
  onClick,
}: CreateDatasetCardProps) {
  return (
    <motion.div
      className="relative bg-white border border-gray-100 rounded-xl p-6 hover:shadow-xl hover:border-indigo-200 transition-all duration-300 cursor-pointer group overflow-hidden"
      whileHover={{ y: -2, scale: 1.01 }}
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3 }}
      onClick={onClick}
    >
      {/* Background decoration */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-indigo-100 to-purple-100 rounded-full -translate-y-16 translate-x-16 opacity-50" />

      {badge && (
        <div className="absolute top-3 right-3 px-2.5 py-1 bg-gradient-to-r from-indigo-600 to-purple-600 text-white text-xs font-medium rounded-full shadow-sm">
          {badge}
        </div>
      )}

      <div className="relative z-10">
        <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center text-white mb-4 shadow-lg group-hover:shadow-xl transition-all">
          {icon}
        </div>

        <h3 className="text-lg font-semibold mb-2 text-gray-900 group-hover:text-indigo-600 transition-colors">
          {title}
        </h3>
        <p className="text-sm text-gray-600 leading-relaxed mb-4">
          {description}
        </p>

        <div className="flex items-center text-sm text-indigo-600 font-medium group-hover:text-indigo-700">
          <span>Get Started</span>
          <svg
            className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5l7 7-7 7"
            />
          </svg>
        </div>
      </div>
    </motion.div>
  );
}
