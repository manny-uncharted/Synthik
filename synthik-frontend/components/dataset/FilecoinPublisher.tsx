import React, { useState, useCallback } from 'react';
import {
  Globe,
  Upload,
  CheckCircle,
  XCircle,
  RotateCcw,
  Wallet,
  Shield,
  Database,
  Clock,
  DollarSign,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { Synapse } from '@filoz/synapse-sdk';
import { useWallets } from '@privy-io/react-auth';
import { ethers } from 'ethers';

// Type definitions
interface PreviewData {
  rows: Record<string, string | number | boolean | Date | object>[];
  schema: {
    name: string;
    type: string;
  }[];
  totalRows: number;
  generationTime: number;
}

interface StorageEstimate {
  proofsetFee: number; // 5 USDFC
  storageFee: number; // Based on data size
  bufferAmount: number; // 5 USDFC
  totalCost: number;
  isFirstTime: boolean; // Whether user needs to create proofset
}

interface PublishProgress {
  stage:
    | 'idle'
    | 'estimating'
    | 'initializing'
    | 'uploading-metadata'
    | 'uploading-data'
    | 'registering'
    | 'completed'
    | 'error';
  metadataProgress: number;
  dataProgress: number;
  message: string;
  error?: string;
  retryCount: number;
}

interface PublishResult {
  metadataCID: string;
  dataCID: string;
  transactionHash?: string;
  timestamp: number;
}

interface FilecoinPublisherProps {
  data: PreviewData | null;
  config: {
    name: string;
    description: string;
    schema: { name: string; type: string; description: string }[];
    format: string;
    license: string;
    visibility: string;
    rows: number;
    quality: string;
  };
  publishProgress: PublishProgress;
  setPublishProgress: React.Dispatch<React.SetStateAction<PublishProgress>>;
  storageEstimate: StorageEstimate | null;
  setStorageEstimate: (estimate: StorageEstimate | null) => void;
  publishResult: PublishResult | null;
  setPublishResult: (result: PublishResult | null) => void;
  showPublishOptions: boolean;
  setShowPublishOptions: (show: boolean) => void;
}

export default function FilecoinPublisher({
  data,
  config,
  publishProgress,
  setPublishProgress,
  storageEstimate,
  setStorageEstimate,
  publishResult,
  setPublishResult,
  showPublishOptions,
  setShowPublishOptions,
}: FilecoinPublisherProps) {
  // Use Privy for wallet connection
  const { wallets } = useWallets();
  const wallet = wallets.find((w) => w.walletClientType === 'privy');

  // Get wallet info
  const address = wallet?.address;
  const chainId = wallet?.chainId?.split(':')[1]; // Extract chain ID from format like "eip155:314159"
  const network =
    chainId === '314159' ? 'calibration' : chainId === '314' ? 'mainnet' : null;

  // Create provider and signer from Privy wallet
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [signer, setSigner] = useState<ethers.JsonRpcSigner | null>(null);

  // Initialize provider and signer when wallet is available
  React.useEffect(() => {
    if (wallet) {
      const initWallet = async () => {
        try {
          const ethereumProvider = await wallet.getEthereumProvider();
          const ethersProvider = new ethers.BrowserProvider(ethereumProvider);
          const ethersSigner = await ethersProvider.getSigner();

          setProvider(ethersProvider);
          setSigner(ethersSigner);
        } catch (error) {
          console.error('Failed to initialize wallet:', error);
        }
      };
      initWallet();
    }
  }, [wallet]);

  // Debug logging - only log when values actually change
  React.useEffect(() => {
    console.log('FilecoinPublisher Debug:', {
      address,
      chainId,
      network,
      hasWallet: !!wallet,
      hasSigner: !!signer,
      hasProvider: !!provider,
      walletType: wallet?.walletClientType,
    });
  }, [address, chainId, network, wallet, signer, provider]);

  // Publish to Filecoin using Synapse SDK
  const publishToFilecoin = useCallback(async () => {
    if (!data || !config || !signer || !provider || !address || !network) {
      setPublishProgress((prev) => ({
        ...prev,
        stage: 'error',
        error: 'Missing required data or wallet connection',
        message: 'Please ensure you have data and wallet connected',
      }));
      return;
    }

    try {
      setPublishProgress({
        stage: 'initializing',
        metadataProgress: 0,
        dataProgress: 0,
        message: storageEstimate?.isFirstTime
          ? 'Setting up your storage account (5 USDFC one-time fee)...'
          : 'Using your existing storage account...',
        retryCount: 0,
      });

      // Create Synapse instance using the ethers provider from wagmi
      const synapse = await Synapse.create({
        provider: provider,
        disableNonceManager: false,
        withCDN: false,
      });

      // Create storage service (following fs-upload-dapp pattern)
      const storageService = await synapse.createStorage({
        callbacks: {
          onProviderSelected: (provider) => {
            console.log(`Selected storage provider: ${provider.owner}`);
            setPublishProgress((prev) => ({
              ...prev,
              message: 'Storage provider selected...',
            }));
          },
          onProofSetResolved: (info) => {
            if (info.isExisting) {
              console.log(`Using existing proof set: ${info.proofSetId}`);
            } else {
              console.log(`Created new proof set: ${info.proofSetId}`);
            }
            setPublishProgress((prev) => ({
              ...prev,
              metadataProgress: 30,
            }));
          },
          onProofSetCreationStarted: (transaction, _statusUrl) => {
            console.log(`Creating proof set, tx: ${transaction.hash}`);
            setPublishProgress((prev) => ({
              ...prev,
              message: 'Creating proof set on blockchain...',
            }));
          },
        },
      });

      // Step 1: Upload metadata
      setPublishProgress((prev) => ({
        ...prev,
        stage: 'uploading-metadata',
        message: 'Uploading dataset metadata to Filecoin...',
      }));

      const metadataJson = JSON.stringify({
        name: config.name,
        description: config.description,
        schema: config.schema,
        totalRows: data.totalRows,
        format: config.format,
        license: config.license,
        visibility: config.visibility,
        generationTime: data.generationTime,
        version: '1.0.0',
        timestamp: Date.now(),
      });

      const metadataBytes = new TextEncoder().encode(metadataJson);

      // Upload metadata following fs-upload-dapp pattern
      const metadataResult = await storageService.upload(metadataBytes, {
        onUploadComplete: (_commp) => {
          setPublishProgress((prev) => ({
            ...prev,
            metadataProgress: 80,
            message: 'Metadata uploaded successfully!',
          }));
        },
        onRootAdded: async (_transactionResponse) => {
          setPublishProgress((prev) => ({
            ...prev,
            metadataProgress: 90,
            message: 'Adding metadata to proof set...',
          }));
        },
        onRootConfirmed: (_rootIds) => {
          setPublishProgress((prev) => ({
            ...prev,
            metadataProgress: 100,
            message: 'Metadata confirmed on Filecoin!',
          }));
        },
      });

      const metadataCID = metadataResult.commp.toString();

      // Step 2: Upload data
      setPublishProgress((prev) => ({
        ...prev,
        stage: 'uploading-data',
        message: 'Uploading dataset content to Filecoin...',
      }));

      const dataJson = JSON.stringify(data.rows);
      const dataBytes = new TextEncoder().encode(dataJson);

      const dataResult = await storageService.upload(dataBytes, {
        onUploadComplete: (commp) => {
          setPublishProgress((prev) => ({
            ...prev,
            dataProgress: 80,
            message: 'Dataset uploaded successfully!',
          }));
        },
        onRootAdded: async (transactionResponse) => {
          setPublishProgress((prev) => ({
            ...prev,
            dataProgress: 90,
            message: 'Adding dataset to proof set...',
          }));
        },
        onRootConfirmed: (rootIds) => {
          setPublishProgress((prev) => ({
            ...prev,
            dataProgress: 100,
            message: 'Dataset confirmed on Filecoin!',
          }));
        },
      });

      const dataCID = dataResult.commp.toString();

      // Complete
      const result: PublishResult = {
        metadataCID,
        dataCID,
        timestamp: Date.now(),
      };

      setPublishResult(result);
      setPublishProgress((prev) => ({
        ...prev,
        stage: 'completed',
        message: 'Dataset published successfully to Filecoin!',
      }));
    } catch (error) {
      console.error('Publishing failed:', error);
      setPublishProgress((prev) => ({
        ...prev,
        stage: 'error',
        error:
          error instanceof Error ? error.message : 'Unknown error occurred',
        message: 'Publishing failed. You can retry the operation.',
      }));
    }
  }, [
    data,
    config,
    signer,
    provider,
    address,
    network,
    storageEstimate,
    setPublishProgress,
    setPublishResult,
  ]);

  // Track if we've calculated estimate for current data
  const dataRef = React.useRef(data);
  const configRef = React.useRef(config);
  const hasCalculatedRef = React.useRef(false);

  // Auto-calculate estimate when data changes - only once per data change
  React.useEffect(() => {
    if (!data || !config) return;

    // Check if data actually changed
    if (
      dataRef.current === data &&
      configRef.current === config &&
      hasCalculatedRef.current
    ) {
      return; // Already calculated for this data
    }

    dataRef.current = data;
    configRef.current = config;
    hasCalculatedRef.current = true;

    const calculateEstimate = async () => {
      try {
        setPublishProgress((prev) => ({
          ...prev,
          stage: 'estimating',
          message: 'Calculating storage costs...',
        }));

        // Estimate data sizes
        const metadataJson = JSON.stringify({
          name: config.name,
          description: config.description,
          schema: config.schema,
          totalRows: data.totalRows,
          format: config.format,
          license: config.license,
          visibility: config.visibility,
          generationTime: data.generationTime,
          version: '1.0.0',
          timestamp: Date.now(),
        });

        const dataJson = JSON.stringify(data.rows);
        const totalSize =
          new Blob([metadataJson]).size + new Blob([dataJson]).size;

        // Storage pricing calculation
        const storageFeePerKB = 0.001;
        const storageFee = Math.ceil(totalSize / 1024) * storageFeePerKB;
        const isFirstTime = true;

        const estimate: StorageEstimate = {
          proofsetFee: isFirstTime ? 5 : 0,
          storageFee,
          bufferAmount: 5,
          totalCost: (isFirstTime ? 5 : 0) + storageFee + 5,
          isFirstTime,
        };

        setStorageEstimate(estimate);
        setPublishProgress((prev) => ({ ...prev, stage: 'idle', message: '' }));
      } catch (error) {
        console.error('Failed to calculate storage estimate:', error);
        setPublishProgress((prev) => ({
          ...prev,
          stage: 'error',
          error: 'Failed to calculate storage costs',
          message: 'Unable to estimate costs. Please try again.',
        }));
      }
    };

    calculateEstimate();
  }); // No dependency array - we handle the check manually

  // Track if we've tested Synapse for current provider/signer
  const providerRef = React.useRef(provider);
  const signerRef = React.useRef(signer);
  const hasTestedSynapseRef = React.useRef(false);

  // Test Synapse when provider/signer are ready - only once per wallet change
  React.useEffect(() => {
    if (!provider || !signer) return;

    // Check if provider/signer actually changed
    if (
      providerRef.current === provider &&
      signerRef.current === signer &&
      hasTestedSynapseRef.current
    ) {
      return; // Already tested for this provider/signer
    }

    providerRef.current = provider;
    signerRef.current = signer;
    hasTestedSynapseRef.current = true;

    const testSynapse = async () => {
      try {
        console.log('🔄 Testing Synapse SDK initialization...');
        const synapse = await Synapse.create({
          provider: provider,
          disableNonceManager: false,
          withCDN: false,
        });
        console.log('✅ Synapse SDK initialized successfully:', synapse);

        // Test basic functionality
        console.log('🔄 Testing Synapse payments...');
        const balance = await synapse.payments.walletBalance();
        console.log('💰 Wallet balance:', balance.toString());
      } catch (error) {
        console.error('❌ Synapse SDK initialization failed:', error);
      }
    };

    testSynapse();
  }); // No dependency array - we handle the check manually

  const retryPublish = useCallback(async () => {
    if (publishProgress.retryCount >= 3) {
      setPublishProgress((prev) => ({
        ...prev,
        error: 'Maximum retry attempts reached. Please try again later.',
        message: 'Too many failed attempts.',
      }));
      return;
    }

    setPublishProgress((prev) => ({
      ...prev,
      retryCount: prev.retryCount + 1,
      stage: 'idle',
      error: undefined,
    }));

    await publishToFilecoin();
  }, [publishProgress.retryCount, setPublishProgress, publishToFilecoin]);

  return (
    <div className="bg-gradient-to-r from-purple-50 to-indigo-50 rounded-xl p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h4 className="font-semibold text-gray-900 mb-1 flex items-center gap-2">
            <Globe className="w-5 h-5 text-purple-600" />
            Publish to Filecoin Network
          </h4>
          <p className="text-sm text-gray-600">
            Store your dataset permanently on Filecoin with cryptographic proofs
          </p>
          {/* Connection Status Indicator */}
          <div className="mt-2 flex items-center gap-4 text-xs">
            <div className="flex items-center gap-1">
              <div
                className={`w-2 h-2 rounded-full ${
                  address ? 'bg-green-500' : 'bg-red-500'
                }`}
              />
              <span className={address ? 'text-green-700' : 'text-red-700'}>
                Wallet: {address ? 'Connected' : 'Not Connected'}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <div
                className={`w-2 h-2 rounded-full ${
                  signer ? 'bg-green-500' : 'bg-yellow-500'
                }`}
              />
              <span className={signer ? 'text-green-700' : 'text-yellow-700'}>
                Signer: {signer ? 'Ready' : 'Loading...'}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <div
                className={`w-2 h-2 rounded-full ${
                  network ? 'bg-green-500' : 'bg-red-500'
                }`}
              />
              <span className={network ? 'text-green-700' : 'text-red-700'}>
                Network: {network || 'Unsupported'}
              </span>
            </div>
          </div>
        </div>
        <button
          onClick={() => setShowPublishOptions(!showPublishOptions)}
          className="text-sm text-purple-600 hover:text-purple-700 font-medium"
        >
          {showPublishOptions ? 'Hide Details' : 'Show Details'}
        </button>
      </div>

      {/* Cost Estimate */}
      {storageEstimate && (
        <div className="mb-6">
          <div className="bg-white rounded-lg p-4 border border-gray-200">
            <h5 className="font-medium text-gray-900 mb-3 flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-green-600" />
              Storage Cost Estimate
            </h5>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <p className="text-gray-600">Storage Account</p>
                <p className="font-semibold text-gray-900">
                  {storageEstimate.proofsetFee} USDFC
                </p>
                <p className="text-xs text-gray-500">
                  {storageEstimate.isFirstTime
                    ? 'One-time setup'
                    : 'Already setup'}
                </p>
              </div>
              <div>
                <p className="text-gray-600">Storage Fee</p>
                <p className="font-semibold text-gray-900">
                  {storageEstimate.storageFee.toFixed(3)} USDFC
                </p>
                <p className="text-xs text-gray-500">Data + metadata</p>
              </div>
              <div>
                <p className="text-gray-600">Buffer</p>
                <p className="font-semibold text-gray-900">
                  {storageEstimate.bufferAmount} USDFC
                </p>
                <p className="text-xs text-gray-500">Gas fees</p>
              </div>
              <div>
                <p className="text-gray-600">Total</p>
                <p className="font-semibold text-purple-600">
                  {storageEstimate.totalCost.toFixed(3)} USDFC
                </p>
                <p className="text-xs text-gray-500">
                  {storageEstimate.isFirstTime
                    ? 'First upload'
                    : 'Subsequent upload'}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Publishing Progress */}
      {publishProgress.stage !== 'idle' &&
        publishProgress.stage !== 'completed' && (
          <div className="mb-6">
            <div className="bg-white rounded-lg p-4 border border-gray-200">
              <div className="flex items-center justify-between mb-4">
                <h5 className="font-medium text-gray-900">
                  Publishing Progress
                </h5>
                <span className="text-sm text-gray-600 capitalize">
                  {publishProgress.stage.replace('-', ' ')}
                </span>
              </div>

              <div className="space-y-4">
                {/* Metadata Upload Progress */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-gray-700 flex items-center gap-2">
                      <Database className="w-4 h-4" />
                      Metadata Upload
                    </span>
                    <span className="text-sm text-gray-500">
                      {publishProgress.metadataProgress}%
                    </span>
                  </div>
                  <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                    <motion.div
                      className="h-full bg-purple-600"
                      initial={{ width: 0 }}
                      animate={{
                        width: `${publishProgress.metadataProgress}%`,
                      }}
                      transition={{ duration: 0.3 }}
                    />
                  </div>
                </div>

                {/* Data Upload Progress */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-gray-700 flex items-center gap-2">
                      <Upload className="w-4 h-4" />
                      Dataset Upload
                    </span>
                    <span className="text-sm text-gray-500">
                      {publishProgress.dataProgress}%
                    </span>
                  </div>
                  <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                    <motion.div
                      className="h-full bg-indigo-600"
                      initial={{ width: 0 }}
                      animate={{ width: `${publishProgress.dataProgress}%` }}
                      transition={{ duration: 0.3 }}
                    />
                  </div>
                </div>

                {/* Status message */}
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Clock className="w-4 h-4" />
                  {publishProgress.message}
                </div>
              </div>
            </div>
          </div>
        )}

      {/* Error Display */}
      {publishProgress.stage === 'error' && (
        <div className="mb-6">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <XCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-medium text-red-900 mb-1">
                  Publishing Failed
                </p>
                <p className="text-sm text-red-800 mb-3">
                  {publishProgress.error}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={retryPublish}
                    disabled={publishProgress.retryCount >= 3}
                    className="px-3 py-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors flex items-center gap-1.5 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <RotateCcw className="w-4 h-4" />
                    Retry ({publishProgress.retryCount}/3)
                  </button>
                  <button
                    onClick={() =>
                      setPublishProgress((prev) => ({
                        ...prev,
                        stage: 'idle',
                        error: undefined,
                      }))
                    }
                    className="px-3 py-1.5 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors text-sm font-medium"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Success Display */}
      {publishProgress.stage === 'completed' && publishResult && (
        <div className="mb-6">
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-medium text-green-900 mb-1">
                  Dataset Published Successfully!
                </p>
                <p className="text-sm text-green-800 mb-3">
                  Your dataset is now permanently stored on Filecoin
                </p>
                <div className="space-y-2 text-sm">
                  <div>
                    <span className="font-medium text-gray-900">
                      Metadata CID:
                    </span>
                    <code className="ml-2 text-xs bg-gray-100 px-2 py-1 rounded">
                      {publishResult.metadataCID}
                    </code>
                  </div>
                  <div>
                    <span className="font-medium text-gray-900">Data CID:</span>
                    <code className="ml-2 text-xs bg-gray-100 px-2 py-1 rounded">
                      {publishResult.dataCID}
                    </code>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Publish Button */}
      {publishProgress.stage === 'idle' && (
        <div className="text-center">
          <button
            onClick={publishToFilecoin}
            disabled={!signer || !provider || !address || !storageEstimate}
            className="px-6 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-lg font-medium hover:shadow-lg transition-all flex items-center justify-center gap-2 mx-auto disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Globe className="w-5 h-5" />
            Publish to Filecoin
            {storageEstimate && (
              <span className="ml-2 text-sm opacity-90">
                ({storageEstimate.totalCost.toFixed(3)} USDFC)
              </span>
            )}
          </button>
          <p className="text-xs text-gray-500 mt-2">
            {storageEstimate?.isFirstTime
              ? 'First-time setup: Setting up your storage account'
              : 'Using your existing storage account'}
          </p>
        </div>
      )}

      {/* Detailed Info */}
      {showPublishOptions && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="mt-6 space-y-4"
        >
          <div className="bg-white rounded-lg p-4 border border-gray-200">
            <h5 className="font-medium text-gray-900 mb-3 flex items-center gap-2">
              <Shield className="w-4 h-4 text-blue-600" />
              What You Own
            </h5>
            <div className="space-y-2 text-sm text-gray-600">
              <p>
                • Your dataset is stored on Filecoin under your own storage
                account
              </p>
              <p>• You control access and can update or remove the data</p>
              <p>• Storage costs are paid directly from your wallet</p>
              <p>• Data remains accessible even if our platform goes offline</p>
            </div>
          </div>

          <div className="bg-white rounded-lg p-4 border border-gray-200">
            <h5 className="font-medium text-gray-900 mb-3 flex items-center gap-2">
              <Wallet className="w-4 h-4 text-green-600" />
              Storage Account Details
            </h5>
            <div className="space-y-2 text-sm text-gray-600">
              <p>• First upload creates a reusable storage account (5 USDFC)</p>
              <p>• Subsequent uploads only pay for storage space</p>
              <p>• Buffer amount covers blockchain transaction fees</p>
              <p>• All payments are transparent and on-chain</p>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}
