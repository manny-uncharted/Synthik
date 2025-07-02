import { useState, useEffect, ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { Plus } from 'lucide-react';

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const [scrolled, setScrolled] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 10);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const isActive = (path: string) => {
    return router.pathname === path;
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navigation */}
      <nav
        className={`fixed top-0 w-full z-50 px-8 lg:px-16 py-6 transition-all duration-300 ${
          scrolled ? 'bg-white/90 backdrop-blur-md shadow-sm' : ''
        }`}
      >
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-8">
            <Link href="/" className="flex items-center gap-2">
              <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg" />
              <span className="text-xl font-medium">Synthik</span>
            </Link>
          </div>

          <div className="flex items-center gap-4">
            <nav className="hidden md:flex items-center gap-6">
              <Link
                href="/datasets"
                className={`text-sm transition-colors ${
                  isActive('/datasets')
                    ? 'font-medium text-indigo-600'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Datasets
              </Link>
              <Link
                href="/models"
                className={`text-sm transition-colors ${
                  isActive('/models')
                    ? 'font-medium text-indigo-600'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Models
              </Link>
            </nav>

            <button className="px-4 py-2 text-sm font-medium border border-gray-200 rounded-lg hover:border-gray-300 transition-colors">
              Connect Wallet
            </button>
            <Link
              href="/create-dataset"
              className="px-6 py-2.5 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition-colors flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Create Dataset
            </Link>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main>{children}</main>
    </div>
  );
}
