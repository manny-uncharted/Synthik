import { useState, useEffect, ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { Plus, Wallet, LogOut, User } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import WalletModal from './WalletModal';
import Image from 'next/image';

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const [scrolled, setScrolled] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showWalletModal, setShowWalletModal] = useState(false);
  const router = useRouter();
  const {
    login,
    logout,
    isLoading,
    isAuthenticated,
    user,
    getUserDisplayName,
    getShortWalletAddress,
  } = useAuth();

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 10);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showUserMenu && !(event.target as Element).closest('.user-menu')) {
        setShowUserMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showUserMenu]);

  const isActive = (path: string) => {
    return router.pathname === path;
  };

  const handleSignIn = () => {
    login();
  };

  const handleSignOut = () => {
    logout();
    setShowUserMenu(false);
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
              <Image
                src="/synthik.png"
                alt="Synthik Logo"
                width={32}
                height={32}
              />
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

            {!isLoading ? (
              isAuthenticated ? (
                <div className="flex items-center gap-4">
                  <div className="relative user-menu">
                    <button
                      onClick={() => setShowUserMenu(!showUserMenu)}
                      className="flex items-center gap-2 px-4 py-2 text-sm font-medium border border-gray-200 rounded-lg hover:border-gray-300 transition-colors"
                    >
                      <User className="w-4 h-4" />
                      {getUserDisplayName()}
                    </button>
                    {showUserMenu && (
                      <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50">
                        <div className="px-4 py-2 text-sm text-gray-700 border-b border-gray-100">
                          <div className="font-medium">
                            {user?.email?.address || user?.phone?.number}
                          </div>
                          {getShortWalletAddress() && (
                            <div className="text-xs text-gray-500 mt-1 font-mono">
                              {getShortWalletAddress()}
                            </div>
                          )}
                        </div>
                        {/* Show 'Wallet' only for embedded wallets (no external injected wallet) */}
                        {/* {!hasWallet() && ( */}
                        <button
                          onClick={() => {
                            setShowWalletModal(true);
                            setShowUserMenu(false);
                          }}
                          className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                        >
                          <Wallet className="w-4 h-4" />
                          Wallet
                        </button>
                        {/* )} */}
                        <button
                          onClick={handleSignOut}
                          className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                        >
                          <LogOut className="w-4 h-4" />
                          Sign out
                        </button>
                      </div>
                    )}
                  </div>
                  <Link
                    href="/create-dataset"
                    className="px-6 py-2.5 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition-colors flex items-center gap-2"
                  >
                    <Plus className="w-4 h-4" />
                    Create Dataset
                  </Link>
                </div>
              ) : (
                <div className="flex items-center gap-4">
                  <button
                    onClick={handleSignIn}
                    className="px-4 py-2 text-sm font-medium border border-gray-200 rounded-lg hover:border-gray-300 transition-colors flex items-center gap-2"
                  >
                    <Wallet className="w-4 h-4" />
                    Sign in
                  </button>
                  <button
                    onClick={handleSignIn}
                    className="px-6 py-2.5 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition-colors flex items-center gap-2"
                  >
                    <Plus className="w-4 h-4" />
                    Create Dataset
                  </button>
                </div>
              )
            ) : (
              <div className="flex items-center gap-4">
                <div className="px-4 py-2 text-sm font-medium border border-gray-200 rounded-lg animate-pulse">
                  Loading...
                </div>
                <button
                  disabled
                  className="px-6 py-2.5 bg-gray-400 text-white rounded-lg font-medium cursor-not-allowed flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Create Dataset
                </button>
              </div>
            )}
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main>{children}</main>

      {/* Wallet Modal */}
      {showWalletModal && (
        <WalletModal onClose={() => setShowWalletModal(false)} />
      )}
    </div>
  );
}
