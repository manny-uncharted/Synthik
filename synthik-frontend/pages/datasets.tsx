import { motion } from 'framer-motion';
import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import {
  Search,
  Filter,
  Sparkles,
  FileCode,
  TrendingUp,
  Clock,
  Download,
  Grid,
  List,
  ChevronDown,
} from 'lucide-react';
import { DatasetCard } from '../components/dataset';
import Layout from '../components/Layout';

interface Dataset {
  id: string;
  creatorId: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  visibility: string;
  license: string;
  price: number;
  format: string;
  metadataCid: string;
  datasetPreviewCid: string;
  datasetCid: string;
  price_per_row: number;
  dataset_type: string;
}

interface DatasetsResponse {
  datasets: Dataset[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

const baseUrl = process.env.NEXT_PUBLIC_BASE_URL;

const fetchDatasets = async (
  page: number = 1,
  limit: number = 6
): Promise<DatasetsResponse> => {
  const response = await fetch(
    `${baseUrl}/datasets?page=${page}&limit=${limit}`
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch datasets: ${response.status}`);
  }

  return response.json();
};

export default function Datasets() {
  // Initialize state with persistence
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [sortBy, setSortBy] = useState('trending');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [currentPage, setCurrentPage] = useState(1);
  const [allDatasets, setAllDatasets] = useState<Dataset[]>([]);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [, setIsRestoringFromSavedState] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedState = sessionStorage.getItem('datasets-page-state');
      if (savedState) {
        try {
          const parsed = JSON.parse(savedState);
          setIsRestoringFromSavedState(true);
          setCurrentPage(parsed.currentPage || 1);
          setAllDatasets(parsed.allDatasets || []);
          setSearchQuery(parsed.searchQuery || '');
          setSelectedCategory(parsed.selectedCategory || 'all');
          setSortBy(parsed.sortBy || 'trending');
          setViewMode(parsed.viewMode || 'grid');
          console.log('Restored state:', parsed);
          // Reset the flag after a short delay to allow all state updates to complete
          setTimeout(() => setIsRestoringFromSavedState(false), 100);
        } catch (error) {
          console.error('Error loading saved state:', error);
        }
      }
      setIsInitialized(true);
    }
  }, []);

  // Save state to sessionStorage whenever it changes
  useEffect(() => {
    if (isInitialized && typeof window !== 'undefined') {
      const stateToSave = {
        currentPage,
        allDatasets,
        searchQuery,
        selectedCategory,
        sortBy,
        viewMode,
        timestamp: Date.now(),
      };
      sessionStorage.setItem(
        'datasets-page-state',
        JSON.stringify(stateToSave)
      );
    }
  }, [
    currentPage,
    allDatasets,
    searchQuery,
    selectedCategory,
    sortBy,
    viewMode,
    isInitialized,
  ]);

  // Log origin for debugging Privy authorization
  useEffect(() => {
    console.log('Origin:', window.location.origin);
  }, []);

  // Use TanStack Query for data fetching
  const {
    data: currentPageData,
    isLoading,
    error,
    refetch,
  } = useQuery<DatasetsResponse, Error>({
    queryKey: ['datasets', currentPage],
    queryFn: () => fetchDatasets(currentPage, 6),
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes (renamed from cacheTime in newer versions)
    enabled: isInitialized, // Only run after initialization
  });

  // Update allDatasets when new data comes in
  useEffect(() => {
    if (!isInitialized) return;

    console.log('Data update effect triggered:', {
      hasData: !!currentPageData?.datasets,
      currentPage,
      datasetCount: currentPageData?.datasets?.length,
    });
    if (currentPageData?.datasets) {
      if (currentPage === 1) {
        // First page - replace all datasets
        console.log(
          'Setting first page datasets:',
          currentPageData.datasets.length
        );
        setAllDatasets(currentPageData.datasets);
      } else {
        // Subsequent pages - append to existing datasets
        console.log(
          'Appending page',
          currentPage,
          'datasets:',
          currentPageData.datasets.length
        );
        setAllDatasets((prev) => {
          // Avoid duplicates by checking if dataset already exists
          const existingIds = new Set(prev.map((d) => d.id));
          const newDatasets = currentPageData.datasets.filter(
            (d) => !existingIds.has(d.id)
          );
          console.log('New datasets to add:', newDatasets.length);
          return [...prev, ...newDatasets];
        });
      }
      setIsLoadingMore(false);
    }
  }, [currentPageData, currentPage, isInitialized]);

  // Reset to page 1 when search or category changes (but not during initial load)
  useEffect(() => {
    if (!isInitialized) return;

    // Don't reset during initial restoration
    const isRestoringState = sessionStorage.getItem('datasets-page-state');
    if (isRestoringState) {
      // Remove flag so subsequent changes will trigger reset
      sessionStorage.removeItem('datasets-fresh-load');
      return;
    }

    console.log('Search or category changed, resetting pagination');
    setCurrentPage(1);
    setAllDatasets([]);
    // Clear persisted state when filters change
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('datasets-page-state');
    }
  }, [searchQuery, selectedCategory, isInitialized]);

  // Clear persisted state when user explicitly refreshes the page
  useEffect(() => {
    // Set a flag to detect if this is a fresh page load vs restored state
    const isPageRefresh = !sessionStorage.getItem('datasets-page-state');
    if (isPageRefresh) {
      sessionStorage.setItem('datasets-fresh-load', 'true');
    }

    const handleBeforeUnload = () => {
      // Only clear state if user is actually refreshing/closing, not navigating
      // We'll let the natural session storage expiration handle cleanup
      const now = Date.now();
      const stateData = sessionStorage.getItem('datasets-page-state');
      if (stateData) {
        try {
          const parsed = JSON.parse(stateData);
          // If state is older than 1 hour, clear it
          if (now - parsed.timestamp > 60 * 60 * 1000) {
            sessionStorage.removeItem('datasets-page-state');
          }
        } catch {
          sessionStorage.removeItem('datasets-page-state');
        }
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);

  const datasets = allDatasets;

  // Generate consistent random values based on dataset ID for persistence
  const generatePersistentRandom = (
    seed: string,
    min: number,
    max: number
  ): number => {
    // Simple hash function to convert string to number
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
      const char = seed.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }

    // Use the hash as a seed for pseudo-random generation
    const random = Math.abs(hash) / 2147483647; // Normalize to 0-1
    return min + random * (max - min);
  };

  // Handle load more
  const handleLoadMore = () => {
    console.log('Load more clicked, current page:', currentPage);
    setIsLoadingMore(true);
    setCurrentPage((prev) => prev + 1);
  };

  // Check if there are more pages to load
  const hasMore = currentPageData
    ? currentPage < currentPageData.totalPages
    : false;

  // Debug logging
  useEffect(() => {
    console.log('Pagination state:', {
      currentPage,
      hasMore,
      isLoadingMore,
      totalPages: currentPageData?.totalPages,
      datasetsLength: allDatasets.length,
    });
  }, [
    currentPage,
    hasMore,
    isLoadingMore,
    currentPageData?.totalPages,
    allDatasets.length,
  ]);

  // Transform dataset for DatasetCard component
  const transformDataset = (dataset: Dataset) => ({
    id: dataset.id,
    title: dataset.name,
    description: dataset.description || 'No description available',
    category: dataset.category,
    tags: dataset.tags || [],
    size: formatStorageSize(dataset.price_per_row), // Use price_per_row as bytes per row
    downloads: Math.round(
      generatePersistentRandom(dataset.id + 'downloads', 20, 50)
    ),
    views: Math.round(generatePersistentRandom(dataset.id + 'views', 200, 400)),
    rating:
      Math.round(
        generatePersistentRandom(dataset.id + 'rating', 3.7, 5.0) * 10
      ) / 10, // Round to 1 decimal
    lastUpdated: 'Recently',
    isVerified: true,
    isLocked: dataset.price > 0, // Show as locked if it has a price, regardless of visibility
    price: dataset.price,
    creator:
      dataset.creatorId.substring(0, 6) +
      '...' +
      dataset.creatorId.substring(dataset.creatorId.length - 4),
  });

  const formatStorageSize = (bytesPerRow: number): string => {
    if (!bytesPerRow || bytesPerRow === 0) return 'Unknown';

    const estimatedRows = generatePersistentRandom('rows', 500, 2000);
    const totalBytes = bytesPerRow * estimatedRows;

    if (totalBytes < 1024) {
      return `${Math.round(totalBytes)} B`;
    } else if (totalBytes < 1024 * 1024) {
      return `${(totalBytes / 1024).toFixed(1)} KB`;
    } else if (totalBytes < 1024 * 1024 * 1024) {
      return `${(totalBytes / (1024 * 1024)).toFixed(1)} MB`;
    } else {
      return `${(totalBytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
    }
  };

  const categories = [
    { value: 'all', label: 'All Categories' },
    { value: 'healthcare', label: 'Healthcare' },
    { value: 'finance', label: 'Finance' },
    { value: 'retail', label: 'Retail' },
    { value: 'automotive', label: 'Automotive' },
    { value: 'nlp', label: 'NLP' },
    { value: 'logistics', label: 'Logistics' },
    { value: 'generation', label: 'Generation' },
  ];

  const sortOptions = [
    {
      value: 'trending',
      label: 'Trending',
      icon: <TrendingUp className="w-4 h-4" />,
    },
    {
      value: 'recent',
      label: 'Most Recent',
      icon: <Clock className="w-4 h-4" />,
    },
    {
      value: 'downloads',
      label: 'Most Downloads',
      icon: <Download className="w-4 h-4" />,
    },
  ];

  const filteredDatasets = datasets.filter((dataset: Dataset) => {
    const matchesSearch =
      dataset.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      dataset.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory =
      selectedCategory === 'all' || dataset.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <Layout>
      <div className="bg-background noise-texture">
        {/* Background gradient */}
        <div className="fixed inset-0 mesh-gradient pointer-events-none opacity-30" />

        {/* Header Section */}
        <section className="pt-32 pb-12 px-8 lg:px-16 relative">
          {/* Background decoration */}
          <div className="absolute top-20 right-0 w-96 h-96 bg-gradient-to-br from-indigo-100/30 to-purple-100/30 rounded-full blur-3xl -z-10" />
          <div className="absolute bottom-0 left-0 w-64 h-64 bg-gradient-to-br from-purple-100/30 to-pink-100/30 rounded-full blur-3xl -z-10" />

          <div className="max-w-7xl mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              <div className="flex items-center gap-3 mb-6">
                <div className="w-2 h-8 bg-gradient-to-b from-indigo-600 to-purple-600 rounded-full" />
                <h1 className="text-4xl lg:text-5xl font-light display-font">
                  Explore{' '}
                  <span className="highlight-text">verified datasets</span>
                </h1>
              </div>
              <p className="text-xl text-gray-600 mb-8 max-w-3xl">
                Browse thousands of blockchain-verified synthetic datasets ready
                for training. Each dataset includes complete lineage tracking on
                Filecoin.
              </p>

              {/* Search and Filters */}
              <div className="flex flex-col lg:flex-row gap-4 mb-8">
                <div className="flex-1 relative">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search datasets..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-12 pr-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:border-indigo-500 transition-colors"
                  />
                </div>

                <div className="flex gap-2">
                  <div className="relative">
                    <select
                      value={selectedCategory}
                      onChange={(e) => setSelectedCategory(e.target.value)}
                      className="appearance-none px-4 py-3 pr-10 border border-gray-200 rounded-xl focus:outline-none focus:border-indigo-500 transition-colors bg-white"
                    >
                      {categories.map((cat) => (
                        <option key={cat.value} value={cat.value}>
                          {cat.label}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                  </div>

                  <div className="relative">
                    <select
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value)}
                      className="appearance-none px-4 py-3 pr-10 border border-gray-200 rounded-xl focus:outline-none focus:border-indigo-500 transition-colors bg-white"
                    >
                      {sortOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                  </div>

                  <div className="flex border border-gray-200 rounded-xl overflow-hidden">
                    <button
                      onClick={() => setViewMode('grid')}
                      className={`p-3 transition-colors ${
                        viewMode === 'grid'
                          ? 'bg-indigo-50 text-indigo-600'
                          : 'text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      <Grid className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setViewMode('list')}
                      className={`p-3 transition-colors ${
                        viewMode === 'list'
                          ? 'bg-indigo-50 text-indigo-600'
                          : 'text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      <List className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </section>

        {/* Create Dataset Section */}
        <section className="px-8 lg:px-16 pb-12">
          <div className="max-w-7xl mx-auto">
            <motion.div
              className="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-2xl p-8 mb-12 relative overflow-hidden"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
            >
              {/* Background pattern */}
              <div className="absolute inset-0 opacity-10">
                <div className="absolute top-0 left-0 w-40 h-40 bg-white rounded-full -translate-x-20 -translate-y-20" />
                <div className="absolute bottom-0 right-0 w-60 h-60 bg-white rounded-full translate-x-20 translate-y-20" />
              </div>

              <div className="relative z-10 flex flex-col lg:flex-row items-center justify-between gap-6">
                <div>
                  <h2 className="text-2xl font-semibold text-white mb-2">
                    Ready to create your first dataset?
                  </h2>
                  <p className="text-white/80">
                    Generate high-quality synthetic data with blockchain
                    verification
                  </p>
                </div>
                <div className="flex gap-4">
                  <Link
                    href="/create-dataset"
                    className="px-6 py-3 bg-white text-indigo-600 rounded-lg font-medium hover:bg-gray-100 transition-colors flex items-center gap-2"
                  >
                    <FileCode className="w-5 h-5" />
                    Use Templates
                  </Link>
                  <Link
                    href="/create-dataset"
                    className="px-6 py-3 bg-white/20 text-white border border-white/30 rounded-lg font-medium hover:bg-white/30 transition-colors flex items-center gap-2"
                  >
                    <Sparkles className="w-5 h-5" />
                    Custom Generation
                  </Link>
                </div>
              </div>
            </motion.div>
          </div>
        </section>

        {/* Datasets Grid */}
        <section className="px-8 lg:px-16 pb-24">
          <div className="max-w-7xl mx-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-light">
                <span className="text-gray-500">{filteredDatasets.length}</span>{' '}
                datasets available
              </h2>
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Filter className="w-4 h-4" />
                <span>Showing verified datasets only</span>
              </div>
            </div>

            {/* Loading State */}
            {(isLoading || !isInitialized) && (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
                <span className="ml-2 text-gray-600">
                  {!isInitialized ? 'Initializing...' : 'Loading datasets...'}
                </span>
              </div>
            )}

            {/* Error State */}
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
                <p className="text-red-600">
                  Error:{' '}
                  {error instanceof Error ? error.message : 'Unknown error'}
                </p>
                <button
                  onClick={() => refetch()}
                  className="mt-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                >
                  Retry
                </button>
              </div>
            )}

            {/* Datasets Grid */}
            {!isLoading && !error && isInitialized && (
              <div
                className={`grid ${
                  viewMode === 'grid'
                    ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'
                    : 'grid-cols-1'
                } gap-6`}
              >
                {filteredDatasets.map((dataset: Dataset, index: number) => (
                  <motion.div
                    key={dataset.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: index * 0.05 }}
                  >
                    <DatasetCard {...transformDataset(dataset)} />
                  </motion.div>
                ))}
              </div>
            )}

            {/* Empty State */}
            {!isLoading &&
              !error &&
              isInitialized &&
              filteredDatasets.length === 0 && (
                <div className="text-center py-12">
                  <p className="text-gray-500 text-lg">
                    No datasets found matching your criteria.
                  </p>
                  <p className="text-gray-400 mt-2">
                    Try adjusting your search or filters.
                  </p>
                </div>
              )}

            {/* Load More */}
            {!isLoading &&
              !error &&
              isInitialized &&
              filteredDatasets.length > 0 &&
              hasMore && (
                <div className="mt-12 text-center">
                  <button
                    className="px-8 py-3 border border-gray-300 rounded-xl font-medium hover:border-gray-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 mx-auto"
                    onClick={handleLoadMore}
                    disabled={!hasMore || isLoadingMore}
                  >
                    {isLoadingMore && (
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-indigo-600"></div>
                    )}
                    {isLoadingMore ? 'Loading More...' : 'Load More Datasets'}
                  </button>
                </div>
              )}

            {/* Show total count and pagination info */}
            {!isLoading &&
              !error &&
              isInitialized &&
              filteredDatasets.length > 0 && (
                <div className="mt-8 text-center text-sm text-gray-500">
                  Showing {filteredDatasets.length} of{' '}
                  {currentPageData?.total || 0} datasets
                  {!hasMore && filteredDatasets.length > 6 && (
                    <span className="block mt-1">All datasets loaded</span>
                  )}
                </div>
              )}
          </div>
        </section>
      </div>
    </Layout>
  );
}
