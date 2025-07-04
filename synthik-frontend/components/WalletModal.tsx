import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Wallet,
  TrendingUp,
  Database,
  AlertCircle,
  CheckCircle,
  Copy,
  ExternalLink,
  Coins,
  Zap,
  HardDrive,
} from 'lucide-react';
import { useBalances } from '@/hooks/useBalances';
import { useNetwork } from '@/hooks/useNetwork';
import { useAuth } from '@/hooks/useAuth';

interface WalletModalProps {
  onClose: () => void;
}

export default function WalletModal({ onClose }: WalletModalProps) {
  const { data, isLoading, error } = useBalances();
  const { data: network } = useNetwork();
  const { user, getShortWalletAddress } = useAuth();

  useEffect(() => {
    console.log('Active network:', network);
  }, [network]);

  const copyAddress = () => {
    if (user?.wallet?.address) {
      navigator.clipboard.writeText(user.wallet.address);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 5,
    }).format(amount);
  };

  const getNetworkColor = (networkName: string) => {
    switch (networkName) {
      case 'mainnet':
        return 'from-green-500 to-emerald-600';
      case 'calibration':
        return 'from-orange-500 to-red-600';
      default:
        return 'from-gray-500 to-gray-600';
    }
  };

  const getStatusColor = (isSufficient: boolean) => {
    return isSufficient ? 'text-green-600' : 'text-orange-600';
  };

  const getStatusIcon = (isSufficient: boolean) => {
    return isSufficient ? (
      <CheckCircle className="w-4 h-4 text-green-500" />
    ) : (
      <AlertCircle className="w-4 h-4 text-orange-500" />
    );
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          transition={{ type: 'spring', duration: 0.5 }}
          className="glass-card-dark w-full max-w-lg rounded-2xl shadow-2xl mx-4 overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="relative bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 p-6 text-white">
            <div className="absolute inset-0 bg-black/10"></div>
            <div className="relative z-10">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-sm">
                    <Wallet className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold">Wallet Overview</h3>
                    <p className="text-white/80 text-sm">
                      {user?.wallet?.address
                        ? getShortWalletAddress()
                        : 'Not connected'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center hover:bg-white/30 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Network Status */}
              {network && (
                <div className="flex items-center gap-2 bg-white/10 rounded-lg px-3 py-2">
                  <div
                    className={`w-2 h-2 rounded-full bg-gradient-to-r ${getNetworkColor(
                      network
                    )}`}
                  ></div>
                  <span className="text-sm font-medium capitalize">
                    {network}
                  </span>
                  <button
                    onClick={copyAddress}
                    className="ml-auto p-1 hover:bg-white/20 rounded transition-colors"
                  >
                    <Copy className="w-3 h-3" />
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Content */}
          <div className="p-6 space-y-6">
            {isLoading && (
              <div className="flex items-center justify-center py-8">
                <div className="flex items-center gap-3 text-gray-600">
                  <div className="animate-spin w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full"></div>
                  <span className="text-sm font-medium">
                    Loading wallet data...
                  </span>
                </div>
              </div>
            )}

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-sm font-semibold text-red-900">
                      Connection Error
                    </h4>
                    <p className="text-xs text-red-700 mt-1">
                      Unable to load wallet balances. Please check your
                      connection.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {!isLoading && !error && (
              <>
                {/* Balance Cards */}
                <div className="grid grid-cols-1 gap-4">
                  {/* FIL Balance */}
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-4 border border-blue-100"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                          <Coins className="w-5 h-5 text-blue-600" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-700">
                            FIL Balance
                          </p>
                          <p className="text-xs text-gray-500">
                            Filecoin Native
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold text-gray-900">
                          {formatCurrency(data.filBalanceFormatted)}
                        </p>
                        <p className="text-xs text-gray-500">FIL</p>
                      </div>
                    </div>
                  </motion.div>

                  {/* USDFC Balance */}
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl p-4 border border-green-100"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                          <Zap className="w-5 h-5 text-green-600" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-700">
                            USDFC Balance
                          </p>
                          <p className="text-xs text-gray-500">
                            Wallet Balance
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold text-gray-900">
                          {formatCurrency(data.usdfcBalanceFormatted)}
                        </p>
                        <p className="text-xs text-gray-500">USDFC</p>
                      </div>
                    </div>
                  </motion.div>

                  {/* Pandora Credits */}
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                    className="bg-gradient-to-r from-purple-50 to-pink-50 rounded-xl p-4 border border-purple-100"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                          <Database className="w-5 h-5 text-purple-600" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-700">
                            Pandora Credits
                          </p>
                          <p className="text-xs text-gray-500">
                            Storage Allowance
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold text-gray-900">
                          {formatCurrency(data.pandoraBalanceFormatted)}
                        </p>
                        <p className="text-xs text-gray-500">USDFC</p>
                      </div>
                    </div>
                  </motion.div>
                </div>

                {/* Storage Metrics */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4 }}
                  className="bg-gradient-to-r from-gray-50 to-slate-50 rounded-xl p-4 border border-gray-200"
                >
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center">
                      <HardDrive className="w-4 h-4 text-gray-600" />
                    </div>
                    <h4 className="text-sm font-semibold text-gray-900">
                      Storage Status
                    </h4>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-600">
                          Current Usage
                        </span>
                        <span className="text-xs font-medium text-gray-900">
                          {data.currentStorageGB.toFixed(2)} GB
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-600">
                          Rate Allowance
                        </span>
                        <span className="text-xs font-medium text-gray-900">
                          {data.currentRateAllowanceGB.toFixed(2)} GB
                        </span>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-600">
                          Persistence
                        </span>
                        <div className="flex items-center gap-1">
                          {getStatusIcon(data.isLockupSufficient)}
                          <span
                            className={`text-xs font-medium ${getStatusColor(
                              data.isLockupSufficient
                            )}`}
                          >
                            {data.persistenceDaysLeft}d
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-600">Status</span>
                        <div className="flex items-center gap-1">
                          {getStatusIcon(data.isSufficient)}
                          <span
                            className={`text-xs font-medium ${getStatusColor(
                              data.isSufficient
                            )}`}
                          >
                            {data.isSufficient ? 'Sufficient' : 'Insufficient'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>

                {/* Action Buttons */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5 }}
                  className="flex gap-3"
                >
                  <button className="flex-1 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl py-3 px-4 font-medium hover:from-indigo-700 hover:to-purple-700 transition-all flex items-center justify-center gap-2">
                    <TrendingUp className="w-4 h-4" />
                    Top Up
                  </button>
                  <button className="flex-1 bg-white border border-gray-200 text-gray-700 rounded-xl py-3 px-4 font-medium hover:bg-gray-50 transition-all flex items-center justify-center gap-2">
                    <ExternalLink className="w-4 h-4" />
                    View Details
                  </button>
                </motion.div>
              </>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
