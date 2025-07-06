import React, { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Rocket,
  CheckCircle,
  AlertTriangle,
  ExternalLink,
  DollarSign,
  Shield,
  Globe,
  Lock,
  Users,
} from 'lucide-react';
import { ethers } from 'ethers';
import { usePrivyEthers } from '../../hooks/usePrivyEthers';
import ProvenanceManagerABI from '../../abis/ProvenanceManager.json';
import DatasetMarketplaceABI from '../../abis/DatasetMarketplace.json';
import deploymentInfo from '../../abis/deployment/deployments.json';

// Backend API endpoint
const BACKEND_API_URL = 'https://filecoin.bnshub.org/datasets';

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

interface MarketplaceFinalizerProps {
  publishResult: PublishResult;
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
  data: {
    totalRows: number;
    generationTime: number;
    tokensUsed?: number;
    cost?: number;
    fileSize?: number; // File size in bytes
  };
  fullDataset?: {
    totalRows: number;
    generationTime: number;
    tokensUsed?: number;
    cost?: number;
    fileSize?: number; // File size in bytes
  } | null;
  selectedModel?: string; // Optional, for transformation types this won't be provided
}

interface FinalizationState {
  stage: 'idle' | 'creating' | 'listing' | 'completed' | 'error';
  message: string;
  error?: string;
  createdDatasetId?: string;
  datasetCreationTx?: string;
  marketplaceListingTx?: string;
  backendError?: string;
}

export default function MarketplaceFinalizer({
  publishResult,
  config,
  data,
  fullDataset,
  selectedModel,
}: MarketplaceFinalizerProps) {
  const { signer, address } = usePrivyEthers();
  const [finalizationState, setFinalizationState] = useState<FinalizationState>(
    {
      stage: 'idle',
      message: '',
      backendError: undefined,
    }
  );
  const [listingConfig, setListingConfig] = useState({
    price: '10', // Default price in USDFC
    maxLicenses: 100,
    royaltyPercentage: 1000, // 10% in basis points
    licenseType: 1, // Commercial
  });

  // Generate unique dataset ID
  const generateDatasetId = useCallback(() => {
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    return `dataset-${timestamp}-${randomSuffix}`;
  }, []);

  // Map visibility to license type
  const getLicenseType = (visibility: string) => {
    switch (visibility) {
      case 'public':
        return 0; // Free/Open
      case 'restricted':
        return 1; // Commercial
      case 'private':
        return 2; // Enterprise
      default:
        return 1; // Commercial
    }
  };

  // Map generation type
  const getGenerationType = () => {
    // Based on dataset type, map to contract enum
    // GenerationType: SCRATCH(0), AUGMENTED(1), TEMPLATE(2), TRANSFORM(3), HYBRID(4)
    switch (config.datasetType) {
      case 'generation':
        return 0; // SCRATCH
      case 'augmentation':
        return 1; // AUGMENTED
      case 'template':
        return 2; // TEMPLATE
      case 'transformation':
        return 3; // TRANSFORM
      default:
        return 0; // Default to SCRATCH
    }
  };

  // Get model ID from the dataset generation context
  const getModelId = () => {
    // Use the actual selected model if available, otherwise fallback to default
    if (selectedModel) {
      return selectedModel;
    }
    // For transformation types or when no model is selected, use a default
    return config.datasetType === 'transformation'
      ? 'no-model-required'
      : 'gpt-4o-mini';
  };

  // Map data format to match backend expectations
  const mapDataFormat = (fmt: string) => {
    const lower = fmt.toLowerCase();
    const allowed = [
      'json',
      'csv',
      'parquet',
      'png',
      'jpg',
      'jpeg',
      'gif',
      'webp',
    ];
    return allowed.includes(lower) ? lower : 'json';
  };

  const sendDatasetToBackend = async (
    datasetId: string,
    metadataCID: string,
    previewDataCID: string,
    fullDataCID?: string
  ) => {
    try {
      console.log('🚀 Sending dataset to backend API...');

      // Prepare tags array according to the new backend spec
      const tags =
        config.datasetType === 'transformation'
          ? [datasetId, 'transformation', 'anonymization']
          : [datasetId, config.datasetType, 'synthetic'];

      // Convert the provided schema into the expected data_schema_fields format
      const dataSchemaFields = (config.schema || []).map((field) => ({
        id:
          typeof crypto.randomUUID === 'function'
            ? crypto.randomUUID()
            : Math.random().toString(36).substring(2, 9),
        name: field.name,
        type: field.type,
        description: field.description ?? null,
        constraints: {
          required: false,
          unique: false,
          min: null,
          max: null,
          pattern: null,
          enum: [],
        },
      }));

      // Calculate price per row based on file size
      const totalRows = fullDataset?.totalRows || data.totalRows;
      const fileSize = fullDataset?.fileSize || data.fileSize || 0;
      const pricePerRow =
        fileSize > 0 && totalRows > 0 ? fileSize / totalRows : 0;

      // Inner payload as required by the backend
      const innerPayload = {
        name: config.name,
        description: config.description,
        category: config.datasetType,
        tags,
        visibility: config.visibility,
        license: config.license,
        price:
          config.visibility === 'public' ? parseFloat(listingConfig.price) : 0,
        pricePerRow: Math.round(pricePerRow * 100) / 100, // Round to 2 decimal places
        format: mapDataFormat(config.format),
        data_schema_fields: dataSchemaFields,
        metadata_cid: metadataCID,
        dataset_preview_cid: previewDataCID,
        dataset_cid: fullDataCID || previewDataCID,
      };

      // Final payload with creator_id wrapper
      const payload = {
        creator_id: address || 'unknown',
        payload: innerPayload,
      };

      console.log('🚀 Backend API payload:', payload);

      const response = await fetch(BACKEND_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Backend API error: ${response.status} - ${errorText}`);
      }

      const result = await response.json();
      console.log('✅ Dataset successfully sent to backend:', result);

      return result;
    } catch (error) {
      console.error('❌ Failed to send dataset to backend:', error);
      throw error;
    }
  };

  const finalizeToMarketplace = useCallback(async () => {
    if (!signer || !address) {
      setFinalizationState({
        stage: 'error',
        message: 'Wallet not connected',
        error: 'Please connect your wallet to continue',
      });
      return;
    }

    // For private/restricted datasets, still create on ProvenanceManager but don't list on marketplace
    if (config.visibility === 'private' || config.visibility === 'restricted') {
      try {
        setFinalizationState({
          stage: 'creating',
          message:
            'Creating private/restricted dataset on ProvenanceManager...',
        });

        const datasetId =
          publishResult.encryptionInfo?.accessRules.datasetId ||
          generateDatasetId();

        console.log(
          '🔑 Using datasetId for private/restricted dataset:',
          datasetId
        );
        if (publishResult.encryptionInfo?.accessRules.datasetId) {
          console.log('✅ Using datasetId from encryption info');
        } else {
          console.log(
            '⚠️ Generated new datasetId (no encryption info available)'
          );
        }

        // Create ProvenanceManager contract instance
        const provenanceManager = new ethers.Contract(
          deploymentInfo.contracts.ProvenanceManager,
          ProvenanceManagerABI.abi,
          signer
        );

        // Use full dataset CID if available, otherwise preview CID
        const dataCID =
          publishResult.fullDataCID || publishResult.previewDataCID!;
        const totalRows = fullDataset?.totalRows || data.totalRows;
        const generationTime =
          fullDataset?.generationTime || data.generationTime;

        // Estimate dataset size (rough calculation)
        const estimatedSize = totalRows * 100; // ~100 bytes per row estimate

        // Create dataset on ProvenanceManager
        const createTx = await provenanceManager.createDataset(
          datasetId,
          dataCID,
          publishResult.metadataCID,
          config.name,
          config.description,
          config.license,
          getGenerationType(),
          getModelId(),
          'v1.0',
          totalRows,
          Math.floor(generationTime),
          estimatedSize
        );

        setFinalizationState({
          stage: 'creating',
          message: 'Waiting for dataset creation confirmation...',
        });

        const createReceipt = await createTx.wait();

        console.log(
          '🎯 Private/restricted dataset creation transaction hash:',
          createReceipt.transactionHash
        );
        console.log('🎯 Private/restricted dataset ID:', datasetId);

        // Send dataset to backend API for private/restricted datasets
        try {
          await sendDatasetToBackend(
            datasetId,
            publishResult.metadataCID,
            publishResult.previewDataCID!,
            publishResult.fullDataCID
          );
          console.log(
            '✅ Private/restricted dataset successfully sent to backend'
          );
        } catch (backendError) {
          console.error(
            '❌ Failed to send private/restricted dataset to backend:',
            backendError
          );
          // Don't fail the entire process if backend call fails
        }

        setFinalizationState({
          stage: 'completed',
          message: 'Private/restricted dataset created successfully',
          createdDatasetId: datasetId,
          datasetCreationTx: createReceipt.transactionHash,
        });
      } catch (error) {
        console.error('Private dataset creation error:', error);
        setFinalizationState({
          stage: 'error',
          message: 'Failed to create private/restricted dataset',
          error:
            error instanceof Error ? error.message : 'Unknown error occurred',
        });
      }
      return;
    }

    try {
      setFinalizationState({
        stage: 'creating',
        message: 'Creating dataset on ProvenanceManager...',
      });

      // Use the same dataset ID that was used for encryption
      const datasetId =
        publishResult.encryptionInfo?.accessRules.datasetId ||
        generateDatasetId();

      console.log(
        '🔑 Using datasetId for marketplace registration:',
        datasetId
      );
      if (publishResult.encryptionInfo?.accessRules.datasetId) {
        console.log('✅ Using datasetId from encryption info');
      } else {
        console.log(
          '⚠️ Generated new datasetId (no encryption info available)'
        );
      }

      // Create ProvenanceManager contract instance
      const provenanceManager = new ethers.Contract(
        deploymentInfo.contracts.ProvenanceManager,
        ProvenanceManagerABI.abi,
        signer
      );

      // Use full dataset CID if available, otherwise preview CID
      const dataCID =
        publishResult.fullDataCID || publishResult.previewDataCID!;
      const totalRows = fullDataset?.totalRows || data.totalRows;
      const generationTime = fullDataset?.generationTime || data.generationTime;

      // Estimate dataset size (rough calculation)
      const estimatedSize = totalRows * 100; // ~100 bytes per row estimate

      // Create dataset on ProvenanceManager
      const createTx = await provenanceManager.createDataset(
        datasetId,
        dataCID,
        publishResult.metadataCID,
        config.name,
        config.description,
        config.license,
        getGenerationType(),
        getModelId(),
        'v1.0',
        totalRows,
        Math.floor(generationTime),
        estimatedSize
      );

      setFinalizationState({
        stage: 'creating',
        message: 'Waiting for dataset creation confirmation...',
      });

      const createReceipt = await createTx.wait();

      console.log('🎯 Full createReceipt object:', createReceipt);
      console.log(
        '🎯 Dataset creation transaction hash:',
        createReceipt.transactionHash
      );
      console.log(
        '🎯 Dataset creation transaction hash (alternative):',
        createReceipt.hash
      );
      console.log('🎯 Dataset ID:', datasetId);

      const creationTxHash =
        createReceipt.transactionHash || createReceipt.hash;
      console.log('🎯 Using transaction hash for state:', creationTxHash);

      setFinalizationState({
        stage: 'listing',
        message: 'Listing dataset on marketplace...',
        createdDatasetId: datasetId,
        datasetCreationTx: creationTxHash,
      });

      // Create DatasetMarketplace contract instance
      const marketplace = new ethers.Contract(
        deploymentInfo.contracts.DatasetMarketplace,
        DatasetMarketplaceABI.abi,
        signer
      );

      // List dataset on marketplace
      const listTx = await marketplace.listDataset(
        datasetId,
        ethers.parseEther(listingConfig.price), // Price in USDFC
        deploymentInfo.usdcToken, // Payment token
        getLicenseType(config.visibility),
        listingConfig.maxLicenses,
        listingConfig.royaltyPercentage
      );

      setFinalizationState((prev) => ({
        ...prev,
        stage: 'listing',
        message: 'Waiting for marketplace listing confirmation...',
        createdDatasetId: datasetId,
      }));

      const receipt = await listTx.wait();

      console.log('🎯 Full marketplace receipt object:', receipt);
      console.log(
        '🎯 Marketplace listing transaction hash:',
        receipt.transactionHash
      );
      console.log(
        '🎯 Marketplace listing transaction hash (alternative):',
        receipt.hash
      );
      console.log('🎯 Final state before completion:', {
        datasetId,
        datasetCreationTx: finalizationState.datasetCreationTx,
        marketplaceListingTx: receipt.transactionHash,
      });

      const marketplaceTxHash = receipt.transactionHash || receipt.hash;
      console.log(
        '🎯 Using marketplace transaction hash for state:',
        marketplaceTxHash
      );

      // Send dataset to backend API after successful marketplace listing
      try {
        await sendDatasetToBackend(
          datasetId,
          publishResult.metadataCID,
          publishResult.previewDataCID!,
          publishResult.fullDataCID
        );
        console.log(
          '✅ Dataset successfully sent to backend after marketplace listing'
        );
      } catch (backendError) {
        console.error('❌ Failed to send dataset to backend:', backendError);
        // Don't fail the entire process if backend call fails
      }

      setFinalizationState((prev) => {
        console.log('🎯 Previous state before final update:', prev);
        const newState: FinalizationState = {
          ...prev,
          stage: 'completed' as const,
          message: 'Dataset successfully created and listed on marketplace!',
          createdDatasetId: datasetId,
          marketplaceListingTx: marketplaceTxHash,
        };
        console.log('🎯 Final state after completion update:', newState);
        return newState;
      });
    } catch (error) {
      console.error('Finalization error:', error);
      setFinalizationState({
        stage: 'error',
        message: 'Failed to finalize dataset',
        error:
          error instanceof Error ? error.message : 'Unknown error occurred',
      });
    }
  }, [
    signer,
    address,
    publishResult,
    config,
    data,
    fullDataset,
    listingConfig,
  ]);

  if (finalizationState.stage === 'idle') {
    return (
      <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl p-6 border border-green-200">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h4 className="font-semibold text-gray-900 mb-1 flex items-center gap-2">
              <Rocket className="w-5 h-5 text-green-600" />
              Finalize Dataset
            </h4>
            <p className="text-sm text-gray-600">
              Create and list your dataset on the Synthik marketplace
            </p>
          </div>
        </div>

        {/* Dataset Summary */}
        <div className="bg-white rounded-lg p-4 mb-6">
          <h5 className="font-medium text-gray-900 mb-3">Dataset Summary</h5>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-600">Name:</span>
              <span className="ml-2 font-medium">{config.name}</span>
            </div>
            <div>
              <span className="text-gray-600">Rows:</span>
              <span className="ml-2 font-medium">
                {(fullDataset?.totalRows || data.totalRows).toLocaleString()}
              </span>
            </div>
            <div>
              <span className="text-gray-600">Visibility:</span>
              <span className="ml-2 font-medium capitalize">
                {config.visibility}
              </span>
            </div>
            <div>
              <span className="text-gray-600">License:</span>
              <span className="ml-2 font-medium uppercase">
                {config.license}
              </span>
            </div>
          </div>
        </div>

        {/* Marketplace Configuration - Only for public datasets */}
        {config.visibility === 'public' && (
          <div className="bg-white rounded-lg p-4 mb-6">
            <h5 className="font-medium text-gray-900 mb-3 flex items-center gap-2">
              <DollarSign className="w-4 h-4" />
              Marketplace Settings
            </h5>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Price (USDFC)
                </label>
                <input
                  type="number"
                  value={listingConfig.price}
                  onChange={(e) =>
                    setListingConfig({
                      ...listingConfig,
                      price: e.target.value,
                    })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                  min="0"
                  step="0.01"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Max Licenses
                </label>
                <input
                  type="number"
                  value={listingConfig.maxLicenses}
                  onChange={(e) =>
                    setListingConfig({
                      ...listingConfig,
                      maxLicenses: parseInt(e.target.value),
                    })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                  min="1"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Royalty %
                </label>
                <input
                  type="number"
                  value={listingConfig.royaltyPercentage / 100}
                  onChange={(e) =>
                    setListingConfig({
                      ...listingConfig,
                      royaltyPercentage: parseFloat(e.target.value) * 100,
                    })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                  min="0"
                  max="100"
                  step="0.1"
                />
              </div>
            </div>
          </div>
        )}

        {/* Privacy Notice for Private/Restricted */}
        {(config.visibility === 'private' ||
          config.visibility === 'restricted') && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
            <div className="flex items-start gap-3">
              {config.visibility === 'private' ? (
                <Lock className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
              ) : (
                <Shield className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
              )}
              <div>
                <p className="font-medium text-blue-900 mb-1">
                  {config.visibility === 'private'
                    ? 'Private Dataset'
                    : 'Restricted Access'}
                </p>
                <p className="text-sm text-blue-800">
                  {config.visibility === 'private'
                    ? 'This dataset will not be listed on the public marketplace. Only you will have access.'
                    : 'This dataset will have restricted access controls. Access will be managed separately.'}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Finalize Button */}
        <button
          onClick={finalizeToMarketplace}
          disabled={!signer || !address}
          className="w-full px-6 py-3 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-lg font-medium hover:from-green-700 hover:to-emerald-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          <Rocket className="w-5 h-5" />
          {config.visibility === 'public'
            ? 'Create & List on Marketplace'
            : 'Create Dataset'}
        </button>

        {(!signer || !address) && (
          <p className="text-sm text-gray-500 text-center mt-2">
            Please connect your wallet to continue
          </p>
        )}
      </div>
    );
  }

  // Processing states
  if (
    finalizationState.stage === 'creating' ||
    finalizationState.stage === 'listing'
  ) {
    return (
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-6 border border-blue-200">
        <div className="flex items-center justify-center space-y-4 flex-col">
          <div className="relative">
            <div className="w-16 h-16 border-4 border-blue-200 rounded-full"></div>
            <motion.div
              className="absolute inset-0 w-16 h-16 border-4 border-blue-600 rounded-full border-t-transparent"
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
            />
          </div>
          <div className="text-center">
            <h4 className="font-semibold text-gray-900 mb-1">
              {finalizationState.stage === 'creating'
                ? 'Creating Dataset...'
                : 'Listing on Marketplace...'}
            </h4>
            <p className="text-sm text-gray-600">{finalizationState.message}</p>
            {finalizationState.createdDatasetId && (
              <p className="text-xs text-blue-600 mt-2">
                Dataset ID: {finalizationState.createdDatasetId}
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Success state
  if (finalizationState.stage === 'completed') {
    return (
      <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl p-6 border border-green-200">
        <div className="text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-8 h-8 text-green-600" />
          </div>
          <h4 className="font-semibold text-gray-900 mb-2">
            {config.visibility === 'public'
              ? 'Dataset Listed Successfully!'
              : 'Dataset Created Successfully!'}
          </h4>
          <p className="text-sm text-gray-600 mb-4">
            {finalizationState.message}
          </p>

          {finalizationState.createdDatasetId && (
            <div className="bg-white rounded-lg p-4 mb-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">
                  Dataset ID:
                </span>
                <code className="text-sm bg-gray-100 px-2 py-1 rounded">
                  {finalizationState.createdDatasetId}
                </code>
              </div>
              {finalizationState.datasetCreationTx && (
                <div className="flex items-center justify-between mt-2">
                  <span className="text-sm font-medium text-gray-700">
                    Dataset Creation:
                  </span>
                  <a
                    href={`https://calibration.filfox.info/en/tx/${finalizationState.datasetCreationTx}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
                  >
                    View on Explorer
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              )}
              {finalizationState.marketplaceListingTx && (
                <div className="flex items-center justify-between mt-2">
                  <span className="text-sm font-medium text-gray-700">
                    Marketplace Listing:
                  </span>
                  <a
                    href={`https://calibration.filfox.info/en/tx/${finalizationState.marketplaceListingTx}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
                  >
                    View on Explorer
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              )}
            </div>
          )}

          {config.visibility === 'public' && (
            <div className="flex gap-3 justify-center">
              <button className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2">
                <Globe className="w-4 h-4" />
                View on Marketplace
              </button>
              <button className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors flex items-center gap-2">
                <Users className="w-4 h-4" />
                Manage Access
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Error state
  if (finalizationState.stage === 'error') {
    return (
      <div className="bg-gradient-to-r from-red-50 to-pink-50 rounded-xl p-6 border border-red-200">
        <div className="text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="w-8 h-8 text-red-600" />
          </div>
          <h4 className="font-semibold text-gray-900 mb-2">
            Finalization Failed
          </h4>
          <p className="text-sm text-gray-600 mb-2">
            {finalizationState.message}
          </p>
          {finalizationState.error && (
            <p className="text-sm text-red-600 bg-red-50 p-2 rounded mb-4">
              {finalizationState.error}
            </p>
          )}
          <button
            onClick={finalizeToMarketplace}
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
          >
            Retry Finalization
          </button>
        </div>
      </div>
    );
  }

  return null;
}
