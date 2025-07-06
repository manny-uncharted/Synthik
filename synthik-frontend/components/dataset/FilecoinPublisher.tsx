import { motion } from 'framer-motion';
import {
  Upload,
  AlertTriangle,
  CheckCircle,
  Globe,
  Settings,
  XCircle,
  RotateCcw,
  Wallet,
  Shield,
  Database,
  Clock,
  DollarSign,
} from 'lucide-react';
import React, { useState, useCallback } from 'react';

import { Synapse } from '@filoz/synapse-sdk';
import { formatUnits } from 'ethers';
import { useProofsets } from '@/hooks/useProofsets';
import { useDownloadRoot } from '@/hooks/useDownloadRoot';
import { useBalances } from '@/hooks/useBalances';
import { usePayment } from '@/hooks/usePayment';
import MarketplaceFinalizer from './MarketplaceFinalizer';
import { useWallets } from '@privy-io/react-auth';
import { ethers as ethers_v5 } from 'ethers';
import { useAccount } from 'wagmi';
import { config } from '@/utils/config';
import { UseBalancesResponse } from '@/utils/types';
import { simpleEncryption } from '@/services/simple-encryption';

const MARKETPLACE_ADDRESS = process.env.NEXT_PUBLIC_MARKETPLACE_ADDRESS;

// Backend API endpoint
// const BACKEND_API_URL = 'https://filecoin.bnshub.org/datasets';

// Type definitions
interface PreviewData {
  rows: Record<string, string | number | boolean | Date | object>[];
  schema: {
    name: string;
    type: string;
  }[];
  totalRows: number;
  generationTime: number;
  tokensUsed?: number;
  cost?: number;
}

interface StorageEstimate {
  proofsetFee: number; //
  storageFee: number; // Based on data size
  bufferAmount: number; //
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
  previewDataCID?: string;
  fullDataCID?: string;
  transactionHash?: string;
  timestamp: number;
  usingCDN?: boolean;
  encryptionInfo?: {
    isEncrypted: boolean;
    encryptionMethod: string;
    keyHint: string;
    accessRules: {
      visibility: string;
      creatorAddress: string;
      datasetId: string;
      marketplaceContract?: string;
    };
  };
}

interface FilecoinPublisherProps {
  data: PreviewData | null;
  fullDataset?: {
    rows: Record<string, string | number | boolean | Date | object>[];
    schema: {
      name: string;
      type: string;
    }[];
    totalRows: number;
    generationTime: number;
    tokensUsed?: number;
    cost?: number;
  } | null;
  config: {
    name: string;
    description: string;
    schema: { name: string; type: string; description: string }[];
    format: string;
    license: string;
    visibility: string;
    rows: number;
    quality: string;
    datasetType: string;
  };
  publishProgress: PublishProgress;
  setPublishProgress: React.Dispatch<React.SetStateAction<PublishProgress>>;
  storageEstimate: StorageEstimate | null;
  setStorageEstimate: (estimate: StorageEstimate | null) => void;
  publishResult: PublishResult | null;
  setPublishResult: (result: PublishResult | null) => void;
  showPublishOptions: boolean;
  setShowPublishOptions: (show: boolean) => void;
  selectedModel?: string;
}

export default function FilecoinPublisher({
  data,
  fullDataset,
  config,
  publishProgress,
  setPublishProgress,
  storageEstimate,
  setStorageEstimate,
  publishResult,
  setPublishResult,
  showPublishOptions,
  setShowPublishOptions,
  selectedModel,
}: FilecoinPublisherProps) {
  // Use Privy for wallet connection
  const { wallets } = useWallets();
  const wallet = wallets.find((w) => w.walletClientType === 'privy');
  const { chainId } = useAccount();

  // Storage management hooks
  const {
    data: balances,
    isLoading: isBalanceLoading,
    refetch: refetchBalances,
    error: balanceError,
  } = useBalances();
  const { mutation: paymentMutation, status: paymentStatus } = usePayment();
  const { mutateAsync: handlePayment, isPending: isProcessingPayment } =
    paymentMutation;
  const { data: proofsetsData } = useProofsets();

  // Get wallet info
  const address = wallet?.address;
  const walletChainId = wallet?.chainId?.split(':')[1]; // Extract chain ID from format like "eip155:314159"
  const network =
    walletChainId === '314159'
      ? 'calibration'
      : walletChainId === '314'
      ? 'mainnet'
      : null;

  // Create provider and signer from Privy wallet
  const [provider, setProvider] = useState<ethers_v5.BrowserProvider | null>(
    null
  );
  const [signer, setSigner] = useState<ethers_v5.JsonRpcSigner | null>(null);
  const [showStorageManager, setShowStorageManager] = useState(false);

  // Calculate file size for the dataset
  const calculateFileSize = useCallback(() => {
    if (!data) return 0;

    const metadataJson = JSON.stringify({
      name: config.name,
      description: config.description,
      schema: config.schema,
      totalRows: data.totalRows,
      format: config.format,
      license: config.license,
      visibility: config.visibility,
      generationTime: data.generationTime,
      ...(data.tokensUsed && { tokensUsed: data.tokensUsed }),
      ...(data.cost && { generationCost: data.cost }),
      version: '1.0.0',
      timestamp: Date.now(),
    });

    const serializedData = serializeDataByFormat(data.rows, config.format);
    return new Blob([metadataJson]).size + new Blob([serializedData]).size;
  }, [data, config]);

  // Function to serialize data based on the selected format
  const serializeDataByFormat = useCallback(
    (
      rows: Record<string, string | number | boolean | Date | object>[],
      format: string
    ): string => {
      switch (format.toLowerCase()) {
        case 'csv':
          return convertToCSV(rows);
        case 'json':
          return JSON.stringify(rows);
        case 'parquet':
          // For now, fallback to JSON since parquet requires binary handling
          return JSON.stringify(rows);
        default:
          return JSON.stringify(rows);
      }
    },
    []
  );

  // Helper function to convert rows to CSV format
  const convertToCSV = useCallback(
    (
      rows: Record<string, string | number | boolean | Date | object>[]
    ): string => {
      if (!rows || rows.length === 0) return '';

      // Get headers from the first row
      const headers = Object.keys(rows[0]);

      // Create CSV header row
      const csvHeaders = headers.join(',');

      // Create CSV data rows
      const csvRows = rows.map((row) => {
        return headers
          .map((header) => {
            const value = row[header];
            // Handle values that might contain commas or quotes
            if (
              typeof value === 'string' &&
              (value.includes(',') ||
                value.includes('"') ||
                value.includes('\n'))
            ) {
              return `"${value.replace(/"/g, '""')}"`;
            }
            return value;
          })
          .join(',');
      });

      return [csvHeaders, ...csvRows].join('\n');
    },
    []
  );

  // Initialize provider and signer when wallet is available
  React.useEffect(() => {
    if (wallet) {
      const initWallet = async () => {
        try {
          const ethereumProvider = await wallet.getEthereumProvider();
          const ethersProvider = new ethers_v5.BrowserProvider(
            ethereumProvider
          );
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

  // Storage configuration handlers
  const handleRefetchBalances = async () => {
    await refetchBalances();
  };

  const isStorageReady = balances?.isSufficient && !isBalanceLoading;
  const hasInsufficientBalance = balances && !balances.isSufficient;

  // Create download hooks for the published results
  const metadataDownload = useDownloadRoot(
    publishResult?.metadataCID || '',
    `${config.name}_metadata.json`
  );
  const previewDataDownload = useDownloadRoot(
    publishResult?.previewDataCID || '',
    `${config.name}_preview_data.json`
  );
  const fullDataDownload = useDownloadRoot(
    publishResult?.fullDataCID || '',
    `${config.name}_full_data.json`
  );

  const showCidInfo = useCallback(
    (cid: string, withCDN: boolean = false) => {
      let message = `
Filecoin CID: ${cid}

This is a Filecoin-specific CID that contains your data. To access it:

1. Use the Download button (recommended)`;

      if (withCDN && address && network === 'calibration') {
        const cdnUrl = `https://${address}.calibration.filcdn.io/${cid}`;
        message += `
2. Direct CDN access (no wallet needed):
   ${cdnUrl}`;
      }

      message += `
${withCDN ? '3' : '2'}. Use Filecoin-compatible tools like:
   - IPFS Desktop with Filecoin support
   - Filecoin Station
   - Other Web3 storage tools

${withCDN ? '4' : '3'}. Copy this CID to use with other applications

${
  withCDN
    ? 'Note: CDN URLs work only on Calibration testnet.'
    : 'Note: Regular IPFS gateways may not work with Filecoin CIDs.'
}
    `;

      alert(message);

      // Copy the CDN URL if available, otherwise copy the CID
      const textToCopy =
        withCDN && address && network === 'calibration'
          ? `https://${address}.calibration.filcdn.io/${cid}`
          : cid;

      if (navigator.clipboard) {
        navigator.clipboard
          .writeText(textToCopy)
          .then(() => {
            console.log(
              withCDN
                ? 'CDN URL copied to clipboard'
                : 'CID copied to clipboard'
            );
          })
          .catch(() => {
            console.log('Failed to copy to clipboard');
          });
      }
    },
    [address, network]
  );

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
      const hasExistingProofsets =
        proofsetsData?.proofsets && proofsetsData.proofsets.length > 0;

      setPublishProgress({
        stage: 'initializing',
        metadataProgress: 0,
        dataProgress: 0,
        message: hasExistingProofsets
          ? 'Using your existing storage configuration...'
          : 'Setting up new storage configuration...',
        retryCount: 0,
      });

      setPublishProgress((prev) => ({
        ...prev,
        message: 'Preparing dataset for upload...',
        metadataProgress: 5,
      }));

      const datasetId = `dataset-${Date.now()}`;

      // Serialize preview data (unencrypted)
      const previewData = serializeDataByFormat(data.rows, config.format);

      // Serialize full dataset and encrypt if needed
      const fullDataSerialized = fullDataset
        ? serializeDataByFormat(fullDataset.rows, config.format)
        : previewData;

      // Always encrypt the full dataset (regardless of visibility)
      // Access is granted after purchase through smart contract validation
      setPublishProgress((prev) => ({
        ...prev,
        message: 'Encrypting full dataset...',
        metadataProgress: 8,
      }));

      const encryptedFullDataset = await simpleEncryption.encryptDataset(
        fullDataSerialized,
        {
          visibility: config.visibility as 'public' | 'private' | 'restricted',
          creatorAddress: address,
          datasetId: datasetId,
          marketplaceContract: MARKETPLACE_ADDRESS,
        },
        signer
      );

      setPublishProgress((prev) => ({
        ...prev,
        message: 'Setting up storage...',
        metadataProgress: 10,
      }));

      // Try CDN first, then fallback to non-CDN
      let synapse;
      let storageService;
      let usingCDN = false;

      try {
        // First attempt: Try with CDN
        setPublishProgress((prev) => ({
          ...prev,
          message: 'Attempting to use CDN-enabled storage...',
          metadataProgress: 20,
        }));

        synapse = await Synapse.create({
          provider: provider,
          disableNonceManager: true,
          withCDN: true,
        });

        if (hasExistingProofsets) {
          const { getProofset } = await import('@/utils/getProofset');
          const { providerId } = await getProofset(signer, network, address);

          if (!providerId) {
            throw new Error('No storage provider found in proofsets');
          }

          storageService = await synapse.createStorage({
            providerId,
            callbacks: {
              onProviderSelected: (provider) => {
                console.log(`✅ Using CDN-enabled provider: ${provider.owner}`);
                setPublishProgress((prev) => ({
                  ...prev,
                  message: 'Using CDN-enabled storage provider...',
                  metadataProgress: 30,
                }));
              },
            },
          });
        } else {
          storageService = await synapse.createStorage({
            callbacks: {
              onProviderSelected: (provider) => {
                console.log(
                  `✅ Selected CDN-enabled provider: ${provider.owner}`
                );
                setPublishProgress((prev) => ({
                  ...prev,
                  message: 'CDN-enabled storage provider selected...',
                  metadataProgress: 25,
                }));
              },
              onProofSetResolved: (info) => {
                console.log(
                  `✅ CDN proof set ready: ${
                    info.isExisting ? 'existing' : 'new'
                  }`
                );
                setPublishProgress((prev) => ({
                  ...prev,
                  message: 'CDN proof set configured...',
                  metadataProgress: 35,
                }));
              },
            },
          });
        }

        usingCDN = true;
        console.log('✅ Successfully configured CDN-enabled storage');
      } catch (cdnError) {
        console.warn(
          '⚠️ CDN storage failed, falling back to non-CDN:',
          cdnError
        );

        // Fallback: Try without CDN
        setPublishProgress((prev) => ({
          ...prev,
          message: 'CDN unavailable, using standard storage...',
          metadataProgress: 10,
        }));

        try {
          synapse = await Synapse.create({
            provider: provider,
            disableNonceManager: true,
            withCDN: false,
          });

          if (hasExistingProofsets) {
            const { getProofset } = await import('@/utils/getProofset');
            const { providerId } = await getProofset(signer, network, address);

            if (!providerId) {
              throw new Error('No storage provider found in proofsets');
            }

            storageService = await synapse.createStorage({
              providerId,
              callbacks: {
                onProviderSelected: (provider) => {
                  console.log(`✅ Using standard provider: ${provider.owner}`);
                  setPublishProgress((prev) => ({
                    ...prev,
                    message: 'Using standard storage provider...',
                    metadataProgress: 20,
                  }));
                },
              },
            });
          } else {
            storageService = await synapse.createStorage({
              callbacks: {
                onProviderSelected: (provider) => {
                  console.log(
                    `✅ Selected standard provider: ${provider.owner}`
                  );
                  setPublishProgress((prev) => ({
                    ...prev,
                    message: 'Standard storage provider selected...',
                    metadataProgress: 15,
                  }));
                },
                onProofSetResolved: (info) => {
                  console.log(
                    `✅ Standard proof set ready: ${
                      info.isExisting ? 'existing' : 'new'
                    }`
                  );
                  setPublishProgress((prev) => ({
                    ...prev,
                    message: 'Standard proof set configured...',
                    metadataProgress: 25,
                  }));
                },
              },
            });
          }

          usingCDN = false;
          console.log('✅ Successfully configured standard storage');
        } catch (fallbackError) {
          console.error(
            '❌ Both CDN and standard storage failed:',
            fallbackError
          );
          throw new Error(
            `Storage configuration failed: ${
              fallbackError instanceof Error
                ? fallbackError.message
                : 'Unknown error'
            }`
          );
        }
      }

      // Step 1: Upload metadata (unencrypted, but include encryption info for full dataset)
      setPublishProgress((prev) => ({
        ...prev,
        stage: 'uploading-metadata',
        message: 'Uploading dataset metadata to Filecoin...',
      }));

      const metadataJson = JSON.stringify({
        name: config.name,
        description: config.description,
        schema: config.schema,
        totalRows: fullDataset?.totalRows || data.totalRows,
        format: config.format,
        license: config.license,
        visibility: config.visibility,
        generationTime: fullDataset?.generationTime || data.generationTime,
        ...(data.tokensUsed && { tokensUsed: data.tokensUsed }),
        ...(data.cost && { generationCost: data.cost }),

        // Always include encryption metadata since full dataset is always encrypted
        encryption: {
          isEncrypted: true,
          encryptionMethod: encryptedFullDataset.encryptionMethod,
          keyHint: encryptedFullDataset.keyHint,
          accessRules: encryptedFullDataset.accessRules,
        },

        version: '1.0.0',
        timestamp: Date.now(),
      });

      const metadataBytes = new TextEncoder().encode(metadataJson);

      // Upload metadata following fs-upload-dapp pattern
      const metadataResult = await storageService.upload(metadataBytes, {
        onUploadComplete: () => {
          setPublishProgress((prev) => ({
            ...prev,
            metadataProgress: 80,
            message: 'Encrypted dataset metadata uploaded successfully!',
          }));
        },
        onRootAdded: async () => {
          setPublishProgress((prev) => ({
            ...prev,
            metadataProgress: 90,
            message: 'Adding encrypted dataset metadata to your proof set...',
          }));
        },
        onRootConfirmed: () => {
          setPublishProgress((prev) => ({
            ...prev,
            metadataProgress: 100,
            message: 'Encrypted dataset metadata confirmed on Filecoin!',
          }));
        },
      });

      const metadataCID = metadataResult.commp.toString();

      // Step 2: Upload preview data (unencrypted)
      setPublishProgress((prev) => ({
        ...prev,
        stage: 'uploading-data',
        message: 'Uploading preview data to Filecoin...',
      }));

      const previewDataBytes = new TextEncoder().encode(previewData);

      const previewResult = await storageService.upload(previewDataBytes, {
        onUploadComplete: () => {
          setPublishProgress((prev) => ({
            ...prev,
            dataProgress: 40,
            message: 'Preview data uploaded successfully!',
          }));
        },
        onRootAdded: async () => {
          setPublishProgress((prev) => ({
            ...prev,
            dataProgress: 50,
            message: 'Adding preview data to your proof set...',
          }));
        },
        onRootConfirmed: () => {
          setPublishProgress((prev) => ({
            ...prev,
            dataProgress: 60,
            message: 'Preview data confirmed on Filecoin!',
          }));
        },
      });

      const previewDataCID = previewResult.commp.toString();

      // Step 3: Upload full dataset (always encrypted)
      let fullDatasetCID: string | undefined;

      if (fullDataset || encryptedFullDataset) {
        setPublishProgress((prev) => ({
          ...prev,
          stage: 'uploading-data',
          message: 'Uploading encrypted full dataset to Filecoin...',
          dataProgress: 60,
        }));

        // Always use encrypted data for full dataset
        const fullDataToUpload = encryptedFullDataset.encryptedData;

        const fullDataBytes = new TextEncoder().encode(fullDataToUpload);

        const fullDataResult = await storageService.upload(fullDataBytes, {
          onUploadComplete: () => {
            setPublishProgress((prev) => ({
              ...prev,
              dataProgress: 80,
              message: 'Encrypted full dataset uploaded successfully!',
            }));
          },
          onRootAdded: async () => {
            setPublishProgress((prev) => ({
              ...prev,
              dataProgress: 90,
              message: 'Adding encrypted full dataset to your proof set...',
            }));
          },
          onRootConfirmed: () => {
            setPublishProgress((prev) => ({
              ...prev,
              dataProgress: 100,
              message: 'Encrypted full dataset confirmed on Filecoin!',
            }));
          },
        });

        fullDatasetCID = fullDataResult.commp.toString();
      }

      // Create result with encryption info (always encrypted)
      const result: PublishResult = {
        metadataCID,
        previewDataCID,
        fullDataCID: fullDatasetCID,
        timestamp: Date.now(),
        usingCDN,
        // Always store encryption info for later decryption
        encryptionInfo: {
          isEncrypted: true,
          encryptionMethod: encryptedFullDataset.encryptionMethod,
          keyHint: encryptedFullDataset.keyHint,
          accessRules: encryptedFullDataset.accessRules,
        },
      };

      setPublishResult(result);

      setPublishProgress((prev) => ({
        ...prev,
        stage: 'completed',
        message: usingCDN
          ? 'Dataset published successfully to Filecoin with CDN support! (Full dataset encrypted - purchase required for access)'
          : 'Dataset published successfully to Filecoin! (Full dataset encrypted - purchase required for access)',
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
    proofsetsData,
    setPublishProgress,
    setPublishResult,
  ]);

  // Track if we've calculated estimate for current data
  const dataRef = React.useRef(data);
  const configRef = React.useRef(config);
  const hasCalculatedRef = React.useRef(false);

  // Auto-calculate estimate when data changes - only once per data change
  React.useEffect(() => {
    if (!data || !config || !provider || !network) return;

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

        // Create Synapse instance to get real cost estimates
        const synapse = await Synapse.create({
          provider: provider,
          disableNonceManager: true,
          withCDN: false,
        });

        // Calculate actual data sizes
        const metadataJson = JSON.stringify({
          name: config.name,
          description: config.description,
          schema: config.schema,
          totalRows: data.totalRows,
          format: config.format,
          license: config.license,
          visibility: config.visibility,
          generationTime: data.generationTime,
          ...(data.tokensUsed && { tokensUsed: data.tokensUsed }),
          ...(data.cost && { generationCost: data.cost }),
          version: '1.0.0',
          timestamp: Date.now(),
        });

        const serializedData = serializeDataByFormat(data.rows, config.format);
        const totalSize =
          new Blob([metadataJson]).size + new Blob([serializedData]).size;

        // Get real storage cost estimate from Synapse
        const pandoraService = new (
          await import('@filoz/synapse-sdk')
        ).PandoraService(
          provider,
          (
            await import('@filoz/synapse-sdk')
          ).CONTRACT_ADDRESSES.PANDORA_SERVICE[network]
        );

        const costEstimate = await pandoraService.checkAllowanceForStorage(
          totalSize,
          false, // withCDN
          synapse.payments
        );

        // Check if user already has a proofset using the hook data
        const hasExistingProofsets =
          proofsetsData?.proofsets && proofsetsData.proofsets.length > 0;
        const isFirstTime = !hasExistingProofsets;

        // Convert to USDFC (18 decimals)
        const usdfcDecimals = synapse.payments.decimals(
          (await import('@filoz/synapse-sdk')).TOKENS.USDFC
        );
        const formatCost = (amount: bigint) =>
          Number(formatUnits(amount, usdfcDecimals));

        const estimate: StorageEstimate = {
          proofsetFee: isFirstTime ? 0.1 : 0, // Actual proofset creation fee
          storageFee: formatCost(costEstimate.costs.perMonth), // Real storage cost per month
          bufferAmount: 0.01, // Small buffer for gas fees
          totalCost:
            (isFirstTime ? 0.1 : 0) +
            formatCost(costEstimate.costs.perMonth) +
            0.01,
          isFirstTime,
        };

        setStorageEstimate(estimate);
        setPublishProgress((prev) => ({ ...prev, stage: 'idle', message: '' }));
      } catch (error) {
        console.error('Failed to calculate storage estimate:', error);

        // Fallback to simple estimate if real calculation fails
        const metadataJson = JSON.stringify({
          name: config.name,
          description: config.description,
          schema: config.schema,
          totalRows: data.totalRows,
          format: config.format,
          license: config.license,
          visibility: config.visibility,
          generationTime: data.generationTime,
          ...(data.tokensUsed && { tokensUsed: data.tokensUsed }),
          ...(data.cost && { generationCost: data.cost }),
          version: '1.0.0',
          timestamp: Date.now(),
        });

        const serializedData = serializeDataByFormat(data.rows, config.format);
        const totalSize =
          new Blob([metadataJson]).size + new Blob([serializedData]).size;

        // Very rough estimate based on size
        const storageFee = Math.max(0.001, (totalSize / 1024 / 1024) * 0.01); // ~0.01 USDFC per MB

        const estimate: StorageEstimate = {
          proofsetFee: 0.1, // Proofset creation fee
          storageFee,
          bufferAmount: 0.01, // Gas buffer
          totalCost: 0.1 + storageFee + 0.01,
          isFirstTime: true,
        };

        setStorageEstimate(estimate);
        setPublishProgress((prev) => ({ ...prev, stage: 'idle', message: '' }));
      }
    };

    calculateEstimate();
  }, [data, config, provider, network, address, signer]); // Added dependencies

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
          disableNonceManager: true, // Let the wallet handle nonce management
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
            <div className="flex items-center gap-1">
              <div
                className={`w-2 h-2 rounded-full ${
                  isStorageReady
                    ? 'bg-green-500'
                    : hasInsufficientBalance
                    ? 'bg-red-500'
                    : 'bg-yellow-500'
                }`}
              />
              <span
                className={
                  isStorageReady
                    ? 'text-green-700'
                    : hasInsufficientBalance
                    ? 'text-red-700'
                    : 'text-yellow-700'
                }
              >
                Storage:{' '}
                {isStorageReady
                  ? 'Ready'
                  : hasInsufficientBalance
                  ? 'Insufficient'
                  : 'Checking...'}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              console.log(
                'Storage Config button clicked, current state:',
                showStorageManager
              );
              console.log('Address:', address);
              console.log('Balances:', balances);
              setShowStorageManager(!showStorageManager);
            }}
            className="text-sm text-purple-600 hover:text-purple-700 font-medium flex items-center gap-1"
          >
            <Settings className="w-4 h-4" />
            Storage Config
          </button>
          <button
            onClick={() => setShowPublishOptions(!showPublishOptions)}
            className="text-sm text-purple-600 hover:text-purple-700 font-medium"
          >
            {showPublishOptions ? 'Hide Details' : 'Show Details'}
          </button>
        </div>
      </div>

      {/* Storage Manager Section */}
      {showStorageManager && address && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="mb-6"
        >
          <StorageManager
            balances={balances}
            isLoading={isBalanceLoading}
            isProcessingPayment={isProcessingPayment}
            onPayment={handlePayment}
            handleRefetchBalances={handleRefetchBalances}
            paymentStatus={paymentStatus}
            chainId={chainId}
            balanceError={balanceError || undefined}
          />
        </motion.div>
      )}

      {/* Storage Status Alert */}
      {hasInsufficientBalance && !showStorageManager && (
        <div className="mb-6">
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-medium text-yellow-900 mb-1">
                  Storage Configuration Required
                </p>
                <p className="text-sm text-yellow-800 mb-3">
                  Your storage allowance is insufficient. Please configure your
                  storage settings before publishing.
                </p>
                <button
                  onClick={() => setShowStorageManager(true)}
                  className="px-3 py-1.5 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-colors flex items-center gap-1.5 text-sm font-medium"
                >
                  <Settings className="w-4 h-4" />
                  Configure Storage
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Cost Estimate */}
      {storageEstimate && (
        <div className="mb-6">
          <div className="bg-white rounded-lg p-4 border border-gray-200">
            <h5 className="font-medium text-gray-900 mb-3 flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-green-600" />
              Storage Cost Estimate
            </h5>
            <p className="text-xs text-gray-500 mb-3">
              *Estimate only - actual costs may be lower and depend on network
              conditions
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <p className="text-gray-600">Proof Set</p>
                <p className="font-semibold text-gray-900">
                  {storageEstimate.proofsetFee.toFixed(3)} USDFC
                </p>
                <p className="text-xs text-gray-500">
                  {storageEstimate.isFirstTime
                    ? 'One-time creation'
                    : 'Already exists'}
                </p>
              </div>
              <div>
                <p className="text-gray-600">Storage Cost</p>
                <p className="font-semibold text-gray-900">
                  {storageEstimate.storageFee.toFixed(6)} USDFC
                </p>
                <p className="text-xs text-gray-500">Per month</p>
              </div>
              <div>
                <p className="text-gray-600">Gas Buffer</p>
                <p className="font-semibold text-gray-900">
                  {storageEstimate.bufferAmount.toFixed(3)} USDFC
                </p>
                <p className="text-xs text-gray-500">Transaction fees</p>
              </div>
              <div>
                <p className="text-gray-600">Estimated Total</p>
                <p className="font-semibold text-purple-600">
                  {storageEstimate.totalCost.toFixed(6)} USDFC
                </p>
                <p className="text-xs text-gray-500">
                  {storageEstimate.isFirstTime
                    ? 'Initial setup + storage'
                    : 'Storage only'}
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
                  {publishResult.usingCDN && network === 'calibration' && (
                    <span className="block mt-1 font-medium">
                      🚀 CDN enabled for fast access without wallet signatures!
                    </span>
                  )}
                </p>
                <div className="space-y-3 text-sm">
                  <div>
                    <span className="font-medium text-gray-900">
                      Metadata CID:
                    </span>
                    <div className="flex items-center gap-2 mt-1">
                      <code className="text-xs bg-gray-100 px-2 py-1 rounded flex-1">
                        {publishResult.metadataCID}
                      </code>
                      <button
                        onClick={() =>
                          metadataDownload.downloadMutation.mutate()
                        }
                        disabled={metadataDownload.downloadMutation.isPending}
                        className="px-2 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {metadataDownload.downloadMutation.isPending
                          ? 'Downloading...'
                          : 'Download'}
                      </button>
                      {metadataDownload.downloadMutation.error && (
                        <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-800">
                          Download failed:{' '}
                          {metadataDownload.downloadMutation.error.message}
                        </div>
                      )}
                      {publishResult.usingCDN && network === 'calibration' && (
                        <button
                          onClick={() => {
                            const cdnUrl = `https://${address}.calibration.filcdn.io/${publishResult.metadataCID}`;
                            window.open(cdnUrl, '_blank');
                          }}
                          className="px-2 py-1 bg-purple-600 text-white rounded text-xs hover:bg-purple-700 transition-colors"
                        >
                          CDN Link
                        </button>
                      )}
                      <button
                        onClick={() =>
                          showCidInfo(
                            publishResult.metadataCID,
                            publishResult.usingCDN
                          )
                        }
                        className="px-2 py-1 bg-green-600 text-white rounded text-xs hover:bg-green-700 transition-colors"
                      >
                        Info
                      </button>
                    </div>
                  </div>

                  {/* Preview Data CID */}
                  {publishResult.previewDataCID && (
                    <div>
                      <span className="font-medium text-gray-900">
                        Preview Data CID:
                      </span>
                      <div className="flex items-center gap-2 mt-1">
                        <code className="text-xs bg-gray-100 px-2 py-1 rounded flex-1">
                          {publishResult.previewDataCID}
                        </code>
                        <button
                          onClick={() =>
                            previewDataDownload.downloadMutation.mutate()
                          }
                          disabled={
                            previewDataDownload.downloadMutation.isPending
                          }
                          className="px-2 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {previewDataDownload.downloadMutation.isPending
                            ? 'Downloading...'
                            : 'Download'}
                        </button>
                        {previewDataDownload.downloadMutation.error && (
                          <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-800">
                            Download failed:{' '}
                            {previewDataDownload.downloadMutation.error.message}
                          </div>
                        )}
                        {publishResult.usingCDN &&
                          network === 'calibration' && (
                            <button
                              onClick={() => {
                                const cdnUrl = `https://${address}.calibration.filcdn.io/${publishResult.previewDataCID}`;
                                window.open(cdnUrl, '_blank');
                              }}
                              className="px-2 py-1 bg-purple-600 text-white rounded text-xs hover:bg-purple-700 transition-colors"
                            >
                              CDN Link
                            </button>
                          )}
                        <button
                          onClick={() =>
                            showCidInfo(
                              publishResult.previewDataCID!,
                              publishResult.usingCDN
                            )
                          }
                          className="px-2 py-1 bg-green-600 text-white rounded text-xs hover:bg-green-700 transition-colors"
                        >
                          Info
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Full Dataset Data CID */}
                  {publishResult.fullDataCID && (
                    <div>
                      <span className="font-medium text-gray-900">
                        Full Dataset Data CID:
                      </span>
                      <div className="flex items-center gap-2 mt-1">
                        <code className="text-xs bg-gray-100 px-2 py-1 rounded flex-1">
                          {publishResult.fullDataCID}
                        </code>
                        <button
                          onClick={() =>
                            fullDataDownload.downloadMutation.mutate()
                          }
                          disabled={fullDataDownload.downloadMutation.isPending}
                          className="px-2 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {fullDataDownload.downloadMutation.isPending
                            ? 'Downloading...'
                            : 'Download'}
                        </button>
                        {fullDataDownload.downloadMutation.error && (
                          <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-800">
                            Download failed:{' '}
                            {fullDataDownload.downloadMutation.error.message}
                          </div>
                        )}
                        {publishResult.usingCDN &&
                          network === 'calibration' && (
                            <button
                              onClick={() => {
                                const cdnUrl = `https://${address}.calibration.filcdn.io/${publishResult.fullDataCID}`;
                                window.open(cdnUrl, '_blank');
                              }}
                              className="px-2 py-1 bg-purple-600 text-white rounded text-xs hover:bg-purple-700 transition-colors"
                            >
                              CDN Link
                            </button>
                          )}
                        <button
                          onClick={() =>
                            showCidInfo(
                              publishResult.fullDataCID!,
                              publishResult.usingCDN
                            )
                          }
                          className="px-2 py-1 bg-green-600 text-white rounded text-xs hover:bg-green-700 transition-colors"
                        >
                          Info
                        </button>
                      </div>
                    </div>
                  )}
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
            disabled={
              !signer ||
              !provider ||
              !address ||
              !storageEstimate ||
              !isStorageReady
            }
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
          {!isStorageReady && hasInsufficientBalance && (
            <p className="text-xs text-red-600 mt-1">
              Configure storage settings before publishing
            </p>
          )}
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

      {/* Marketplace Finalizer */}
      {publishProgress.stage === 'completed' && publishResult && data && (
        <div className="mt-6">
          <MarketplaceFinalizer
            publishResult={publishResult}
            config={config}
            data={{
              totalRows: data.totalRows,
              generationTime: data.generationTime,
              tokensUsed: data.tokensUsed,
              cost: data.cost,
              fileSize: calculateFileSize(),
            }}
            fullDataset={
              fullDataset
                ? {
                    ...fullDataset,
                    fileSize: calculateFileSize(),
                  }
                : null
            }
            selectedModel={selectedModel}
          />
        </div>
      )}
    </div>
  );
}

// Storage Manager Component
interface StorageManagerProps {
  balances?: UseBalancesResponse;
  isLoading?: boolean;
  isProcessingPayment: boolean;
  onPayment: (params: {
    lockupAllowance: bigint;
    epochRateAllowance: bigint;
    depositAmount: bigint;
  }) => Promise<void>;
  handleRefetchBalances: () => Promise<void>;
  paymentStatus: string;
  chainId?: number;
  balanceError?: Error;
}

const StorageManager: React.FC<StorageManagerProps> = ({
  balances,
  isLoading,
  isProcessingPayment,
  onPayment,
  handleRefetchBalances,
  paymentStatus,
  chainId,
  balanceError,
}) => {
  return (
    <div className="p-6 border rounded-lg bg-white shadow-sm">
      <StorageBalanceHeader chainId={chainId} />
      <div className="mt-4 space-y-4">
        <WalletBalancesSection balances={balances} isLoading={isLoading} />
        <StorageStatusSection balances={balances} isLoading={isLoading} />
        <AllowanceStatusSection balances={balances} isLoading={isLoading} />
        <ActionSection
          balances={balances}
          isLoading={isLoading}
          isProcessingPayment={isProcessingPayment}
          onPayment={onPayment}
          handleRefetchBalances={handleRefetchBalances}
        />
        <div
          className={`mt-4 p-3 rounded-lg ${
            paymentStatus ? 'block' : 'hidden'
          } ${
            paymentStatus.includes('❌')
              ? 'bg-red-50 border border-red-200 text-red-800'
              : paymentStatus.includes('✅')
              ? 'bg-green-50 border border-green-200 text-green-800'
              : 'bg-blue-50 border border-blue-200 text-blue-800'
          }`}
        >
          {paymentStatus}
        </div>
        {balanceError && (
          <div className="mt-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-800">
            Error loading balances: {balanceError.message}
          </div>
        )}
      </div>
    </div>
  );
};

// Storage Balance Header Component
const StorageBalanceHeader: React.FC<{ chainId?: number }> = ({ chainId }) => {
  return (
    <div className="flex justify-between items-center pb-4 border-b">
      <div>
        <h3 className="text-xl font-semibold text-gray-900">Storage Balance</h3>
        <p className="text-sm text-gray-500 mt-1">
          Manage your USDFC deposits for Filecoin storage
        </p>
      </div>
      <div
        className={`flex items-center gap-2 ${
          chainId === 314159 ? 'block' : 'hidden'
        }`}
      >
        <button
          className="px-4 py-2 text-sm h-9 flex items-center justify-center rounded-lg border-2 border-black transition-all bg-black text-white hover:bg-white hover:text-black"
          onClick={() => {
            window.open(
              'https://forest-explorer.chainsafe.dev/faucet/calibnet_usdfc',
              '_blank'
            );
          }}
        >
          Get tUSDFC
        </button>
        <button
          className="px-4 py-2 text-sm h-9 flex items-center justify-center rounded-lg border-2 border-black transition-all bg-black text-white hover:bg-white hover:text-black"
          onClick={() => {
            window.open(
              'https://faucet.calibnet.chainsafe-fil.io/funds.html',
              '_blank'
            );
          }}
        >
          Get tFIL
        </button>
      </div>
    </div>
  );
};

// Wallet Balances Section Component
const WalletBalancesSection: React.FC<{
  balances?: UseBalancesResponse;
  isLoading?: boolean;
}> = ({ balances, isLoading }) => (
  <div className="bg-gray-50 p-4 rounded-lg">
    <h4 className="text-sm font-medium text-gray-900 mb-3">Wallet Balances</h4>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div className="flex items-center justify-between p-2 bg-white rounded border border-gray-200">
        <span className="text-sm text-gray-600">FIL Balance</span>
        <span className="font-medium text-gray-600">
          {isLoading
            ? '...'
            : `${balances?.filBalanceFormatted?.toLocaleString()} FIL`}
        </span>
      </div>
      <div className="flex items-center justify-between p-2 bg-white rounded border border-gray-200">
        <span className="text-sm text-gray-600">USDFC Balance</span>
        <span className="font-medium text-gray-600">
          {isLoading
            ? '...'
            : `${balances?.usdfcBalanceFormatted?.toLocaleString()} USDFC`}
        </span>
      </div>
      <div className="flex items-center justify-between p-2 bg-white rounded border border-gray-200">
        <span className="text-sm text-gray-600">Pandora Balance</span>
        <span className="font-medium text-gray-600">
          {isLoading
            ? '...'
            : `${balances?.pandoraBalanceFormatted?.toLocaleString()} USDFC`}
        </span>
      </div>
      <div className="flex items-center justify-between p-2 bg-white rounded border border-gray-200">
        <span className="text-sm text-gray-600">Rate Allowance</span>
        <span className="font-medium text-gray-600">
          {isLoading
            ? '...'
            : `${balances?.currentRateAllowanceGB?.toLocaleString()} GB`}
        </span>
      </div>
    </div>
  </div>
);

// Storage Status Section Component
const StorageStatusSection: React.FC<{
  balances?: UseBalancesResponse;
  isLoading?: boolean;
}> = ({ balances, isLoading }) => (
  <div className="bg-gray-50 p-4 rounded-lg">
    <h4 className="text-sm font-medium text-gray-900 mb-3">Storage Status</h4>
    <div className="space-y-3">
      <div className="flex items-center justify-between p-2 bg-white rounded border border-gray-200">
        <span className="text-sm text-gray-600">Storage Usage</span>
        <span className="font-medium text-gray-600">
          {isLoading
            ? '...'
            : ` ${balances?.currentStorageGB?.toLocaleString()} GB / ${balances?.currentRateAllowanceGB?.toLocaleString()} GB.`}
        </span>
      </div>
      <div className="flex items-center justify-between p-2 bg-white rounded border border-gray-200">
        <span className="text-sm text-gray-600">
          Persistence days left at max usage (max rate:{' '}
          {balances?.currentRateAllowanceGB?.toLocaleString()} GB)
        </span>
        <span className="font-medium text-gray-600">
          {isLoading
            ? '...'
            : `${balances?.persistenceDaysLeft.toFixed(1)} days`}
        </span>
      </div>
      <div className="flex items-center justify-between p-2 bg-white rounded border border-gray-200">
        <span className="text-sm text-gray-600">
          Persistence days left at current usage (current rate:{' '}
          {balances?.currentStorageGB?.toLocaleString()} GB)
        </span>
        <span className="font-medium text-gray-600">
          {isLoading
            ? '...'
            : `${balances?.persistenceDaysLeftAtCurrentRate.toFixed(1)} days`}
        </span>
      </div>
    </div>
  </div>
);

// Allowance Status Section Component
const AllowanceStatusSection: React.FC<{
  balances?: UseBalancesResponse;
  isLoading?: boolean;
}> = ({ balances, isLoading }) => {
  const depositNeededFormatted = Number(
    formatUnits(balances?.depositNeeded ?? 0n, 18)
  ).toFixed(3);

  return (
    <div className="bg-gray-50 p-4 rounded-lg">
      <h4 className="text-sm font-medium text-gray-900 mb-3">
        Allowance Status
      </h4>
      <div className="space-y-3">
        <AllowanceItem
          label="Rate Allowance"
          isSufficient={balances?.isRateSufficient}
          isLoading={isLoading}
        />
        {!isLoading && !balances?.isRateSufficient && (
          <div className="p-4 bg-yellow-50 rounded-lg border border-yellow-200">
            <p className="text-yellow-800">
              ⚠️ Max configured storage is {config.storageCapacity} GB. Your
              current covered storage is{' '}
              {balances?.currentRateAllowanceGB?.toLocaleString()} GB.
            </p>
            <p className="text-sm text-yellow-700 mt-2">
              You are currently using{' '}
              {balances?.currentStorageGB?.toLocaleString()} GB.
            </p>
          </div>
        )}
        <AllowanceItem
          label="Lockup Allowance"
          isSufficient={balances?.isLockupSufficient}
          isLoading={isLoading}
        />
        {!isLoading && !balances?.isLockupSufficient && (
          <div className="p-4 bg-yellow-50 rounded-lg border border-yellow-200">
            <p className="text-yellow-800">
              ⚠️ Max configured lockup is {config.persistencePeriod} days. Your
              current covered lockup is{' '}
              {balances?.persistenceDaysLeft.toFixed(1)} days. Which is less
              than the notice period of {config.minDaysThreshold} days.
            </p>
            <p className="text-sm text-yellow-700 mt-2">
              You are currently using{' '}
              {balances?.currentStorageGB?.toLocaleString()} GB. Please deposit{' '}
              {depositNeededFormatted} USDFC to extend your lockup for{' '}
              {(
                config.persistencePeriod - (balances?.persistenceDaysLeft ?? 0)
              ).toFixed(1)}{' '}
              more days.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

// Action Section Component
const ActionSection: React.FC<{
  balances?: UseBalancesResponse;
  isLoading?: boolean;
  isProcessingPayment: boolean;
  onPayment: (params: {
    lockupAllowance: bigint;
    epochRateAllowance: bigint;
    depositAmount: bigint;
  }) => Promise<void>;
  handleRefetchBalances: () => Promise<void>;
}> = ({
  balances,
  isLoading,
  isProcessingPayment,
  onPayment,
  handleRefetchBalances,
}) => {
  if (isLoading || !balances) return null;

  if (balances.isSufficient) {
    return (
      <div className="p-4 bg-green-50 rounded-lg border border-green-200">
        <p className="text-green-800">
          ✅ Your storage balance is sufficient for {config.storageCapacity}GB
          of storage for {balances.persistenceDaysLeft.toFixed(1)} days.
        </p>
      </div>
    );
  }

  const depositNeededFormatted = Number(
    formatUnits(balances?.depositNeeded ?? 0n, 18)
  ).toFixed(3);

  if (balances.filBalance === 0n || balances.usdfcBalance === 0n) {
    return (
      <div className="space-y-4">
        <div
          className={`p-4 bg-red-50 rounded-lg border border-red-200 ${
            balances.filBalance === 0n ? 'block' : 'hidden'
          }`}
        >
          <p className="text-red-800">
            ⚠️ You need to FIL tokens to pay for transaction fees. Please
            deposit FIL tokens to your wallet.
          </p>
        </div>
        <div
          className={`p-4 bg-red-50 rounded-lg border border-red-200 ${
            balances.usdfcBalance === 0n ? 'block' : 'hidden'
          }`}
        >
          <p className="text-red-800">
            ⚠️ You need to USDFC tokens to pay for storage. Please deposit USDFC
            tokens to your wallet.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {balances.isRateSufficient && !balances.isLockupSufficient && (
        <LockupIncreaseAction
          totalLockupNeeded={balances.totalLockupNeeded}
          depositNeeded={balances.depositNeeded}
          rateNeeded={balances.rateNeeded}
          isProcessingPayment={isProcessingPayment}
          onPayment={onPayment}
          handleRefetchBalances={handleRefetchBalances}
        />
      )}
      {!balances.isRateSufficient && balances.isLockupSufficient && (
        <RateIncreaseAction
          currentLockupAllowance={balances.currentLockupAllowance}
          rateNeeded={balances.rateNeeded}
          isProcessingPayment={isProcessingPayment}
          onPayment={onPayment}
          handleRefetchBalances={handleRefetchBalances}
        />
      )}
      {!balances.isRateSufficient && !balances.isLockupSufficient && (
        <div className="p-4 bg-red-50 rounded-lg border border-red-200 flex flex-col gap-2">
          <p className="text-red-800">
            ⚠️ Your storage balance is insufficient. You need to deposit{' '}
            {depositNeededFormatted} USDFC & Increase your rate allowance to
            meet your storage needs.
          </p>
          <button
            onClick={async () => {
              await onPayment({
                lockupAllowance: balances.totalLockupNeeded,
                epochRateAllowance: balances.rateNeeded,
                depositAmount: balances.depositNeeded,
              });
              await handleRefetchBalances();
            }}
            disabled={isProcessingPayment}
            className={`w-full px-6 py-3 rounded-lg border-2 border-black transition-all ${
              isProcessingPayment
                ? 'bg-gray-200 border-gray-200 text-gray-400 cursor-not-allowed'
                : 'bg-black text-white hover:bg-white hover:text-black'
            }`}
          >
            {isProcessingPayment
              ? 'Processing transactions...'
              : 'Deposit & Increase Allowances'}
          </button>
        </div>
      )}
    </div>
  );
};

// Lockup Increase Action Component
const LockupIncreaseAction: React.FC<{
  totalLockupNeeded?: bigint;
  depositNeeded?: bigint;
  rateNeeded?: bigint;
  isProcessingPayment: boolean;
  onPayment: (params: {
    lockupAllowance: bigint;
    epochRateAllowance: bigint;
    depositAmount: bigint;
  }) => Promise<void>;
  handleRefetchBalances: () => Promise<void>;
}> = ({
  totalLockupNeeded,
  depositNeeded,
  rateNeeded,
  isProcessingPayment,
  onPayment,
  handleRefetchBalances,
}) => {
  if (!totalLockupNeeded || !depositNeeded || !rateNeeded) return null;

  const depositNeededFormatted = Number(
    formatUnits(depositNeeded ?? 0n, 18)
  ).toFixed(3);

  return (
    <>
      <div className="p-4 bg-yellow-50 rounded-lg border border-yellow-200">
        <p className="text-yellow-800">
          ⚠️ Additional USDFC needed to meet your storage needs.
        </p>
        <p className="text-sm text-yellow-700 mt-2">
          Deposit {depositNeededFormatted} USDFC to extend storage.
        </p>
      </div>
      <button
        onClick={async () => {
          await onPayment({
            lockupAllowance: totalLockupNeeded,
            epochRateAllowance: rateNeeded,
            depositAmount: depositNeeded,
          });
          await handleRefetchBalances();
        }}
        disabled={isProcessingPayment}
        className={`w-full px-6 py-3 rounded-lg border-2 border-black transition-all ${
          isProcessingPayment
            ? 'bg-gray-200 border-gray-200 text-gray-400 cursor-not-allowed'
            : 'bg-black text-white hover:bg-white hover:text-black'
        }`}
      >
        {isProcessingPayment
          ? 'Processing transactions...'
          : 'Deposit & Increase Lockup'}
      </button>
    </>
  );
};

// Rate Increase Action Component
const RateIncreaseAction: React.FC<{
  currentLockupAllowance?: bigint;
  rateNeeded?: bigint;
  isProcessingPayment: boolean;
  onPayment: (params: {
    lockupAllowance: bigint;
    epochRateAllowance: bigint;
    depositAmount: bigint;
  }) => Promise<void>;
  handleRefetchBalances: () => Promise<void>;
}> = ({
  currentLockupAllowance,
  rateNeeded,
  isProcessingPayment,
  onPayment,
  handleRefetchBalances,
}) => {
  if (!currentLockupAllowance || !rateNeeded) return null;

  return (
    <>
      <div className="p-4 bg-yellow-50 rounded-lg border border-yellow-200">
        <p className="text-yellow-800">
          ⚠️ Increase your rate allowance to meet your storage needs.
        </p>
      </div>
      <button
        onClick={async () => {
          await onPayment({
            lockupAllowance: currentLockupAllowance,
            epochRateAllowance: rateNeeded,
            depositAmount: 0n,
          });
          await handleRefetchBalances();
        }}
        disabled={isProcessingPayment}
        className={`w-full px-6 py-3 rounded-lg border-2 border-black transition-all ${
          isProcessingPayment
            ? 'bg-gray-200 border-gray-200 text-gray-400 cursor-not-allowed'
            : 'bg-black text-white hover:bg-white hover:text-black'
        }`}
      >
        {isProcessingPayment ? 'Increasing Rate...' : 'Increase Rate'}
      </button>
    </>
  );
};

// Allowance Item Component
const AllowanceItem: React.FC<{
  label: string;
  isSufficient?: boolean;
  isLoading?: boolean;
}> = ({ label, isSufficient, isLoading }) => (
  <div className="flex items-center justify-between p-2 bg-white rounded border border-gray-200">
    <span className="text-sm text-gray-600">{label}</span>
    <span
      className={`font-medium ${
        isSufficient ? 'text-green-600' : 'text-red-600'
      }`}
    >
      {isLoading ? '...' : isSufficient ? 'Sufficient' : 'Insufficient'}
    </span>
  </div>
);
