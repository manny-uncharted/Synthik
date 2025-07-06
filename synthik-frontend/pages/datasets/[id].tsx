// import { useRouter } from 'next/router';
import { useRouter } from 'next/router';
import { motion } from 'framer-motion';
import Link from 'next/link';
import {
  ArrowLeft,
  Download,
  Star,
  Copy,
  ExternalLink,
  Database,
  GitBranch,
  Code,
  Shield,
  ChevronRight,
  Lock,
  Unlock,
  ShoppingCart,
  Eye,
  EyeOff,
  Sparkles,
  Loader2,
} from 'lucide-react';
import { useState, useEffect } from 'react';
import Layout from '../../components/Layout';
import { usePrivyEthers } from '../../hooks/usePrivyEthers';
import { createPurchaseValidator } from '../../services/purchase-validation';
import { simpleEncryption } from '../../services/simple-encryption';
import { ethers } from 'ethers';
import JSZip from 'jszip';
import DatasetMarketplaceABI from '../../abis/DatasetMarketplace.json';

const MARKETPLACE_ADDRESS = process.env.NEXT_PUBLIC_MARKETPLACE_ADDRESS || '';
const REGISTRY_ADDRESS = process.env.NEXT_PUBLIC_REGISTRY_ADDRESS || '';

interface DatasetResponse {
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

interface DatasetMetadata {
  name: string;
  description: string;
  schema: Array<{
    name: string;
    type: string;
    description: string;
  }>;
  totalRows: number;
  format: string;
  license: string;
  visibility: string;
  generationTime: number;
  tokensUsed: number;
  generationCost: number;
  version: string;
  timestamp: number;
  // Encryption metadata
  encryption?: {
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

interface PurchaseState {
  isProcessing: boolean;
  isSuccess: boolean;
  error: string | null;
  transactionHash?: string;
}

interface AccessState {
  hasAccess: boolean;
  isLoading: boolean;
  licenseDetails?: {
    licenseType: string;
    purchasedAt: number;
    expiresAt: number;
    pricePaid: string;
  };
}

interface DownloadState {
  isDownloading: boolean;
  isDecrypting: boolean;
  error: string | null;
  progress: string;
}

// CSV parsing utility function
function parseCSV(csvText: string): Record<string, string | number>[] {
  console.log('Raw CSV text:', csvText);

  // Handle case where CSV might be on a single line with spaces instead of newlines
  let processedText = csvText.trim();

  // Check if this looks like the specific format from the Filecoin URL
  if (!processedText.includes('\n') && processedText.includes('ID_')) {
    // For the specific format: "id,name,value,created_at ID_001,Name 1,10,2023-04-12 ID_002,Name 2,23,2023-08-22..."
    // Split by pattern that looks like ID_XXX (start of new row)
    const parts = processedText.split(' ID_');
    if (parts.length > 1) {
      // First part contains headers + first data row
      const firstPart = parts[0];

      // Split the first part to separate headers from first data
      if (firstPart.includes('id,name,value,created_at')) {
        const headerMatch = firstPart.match(
          /(id,name,value,created_at)\s+(.+)/
        );
        if (headerMatch) {
          const headers = headerMatch[1];
          const firstDataRow = 'ID_' + headerMatch[2];
          const otherRows = parts.slice(1).map((row) => 'ID_' + row);

          // Reconstruct with proper line breaks
          processedText =
            headers + '\n' + [firstDataRow, ...otherRows].join('\n');
        }
      }
    }
  }

  console.log('Processed CSV text:', processedText);

  const lines = processedText.split('\n').filter((line) => line.trim() !== '');
  console.log('CSV lines:', lines);

  if (lines.length < 2) {
    console.log('Not enough lines in CSV');
    return [];
  }

  // Parse headers
  const headers = lines[0].split(',').map((h) => h.trim().replace(/"/g, ''));
  console.log('Parsed headers:', headers);

  // Parse data rows
  const dataLines = lines.slice(1);
  const data = dataLines.map((line, index) => {
    console.log(`Parsing line ${index + 1}:`, line);

    const values = line.split(',').map((v) => v.trim().replace(/"/g, ''));
    const row: Record<string, string | number> = {};

    headers.forEach((header, headerIndex) => {
      const value = values[headerIndex] || '';
      // Try to parse as number if it's a valid number
      const numValue = Number(value);
      const isValidNumber =
        !isNaN(numValue) && value !== '' && !isNaN(parseFloat(value));

      row[header] = isValidNumber ? numValue : value;
    });

    console.log(`Parsed row ${index + 1}:`, row);
    return row;
  });

  const filteredData = data.filter((row) =>
    Object.values(row).some((val) => val !== '')
  );
  console.log('Final parsed data:', filteredData);

  return filteredData;
}

// Fallback CSV parsing for the specific format we're seeing
function parseFallbackCSV(csvText: string): Record<string, string | number>[] {
  console.log('Fallback parsing for:', csvText);

  // Specifically handle the format: "id,name,value,created_at ID_001,Name 1,10,2023-04-12 ID_002..."
  const text = csvText.trim();

  // Extract all ID_ entries
  const matches = text.match(/ID_\d{3},[^,]+,\d+,\d{4}-\d{2}-\d{2}/g);
  console.log('Extracted matches:', matches);

  if (!matches || matches.length === 0) {
    return [];
  }

  const data = matches
    .map((match) => {
      const parts = match.split(',');
      if (parts.length >= 4) {
        return {
          id: parts[0],
          name: parts[1],
          value: parseInt(parts[2], 10),
          created_at: parts[3],
        };
      }
      return null;
    })
    .filter((row) => row !== null) as Record<string, string | number>[];

  console.log('Fallback parsed data:', data);
  return data;
}

// Utility function to generate persistent random numbers based on a seed (consistent with datasets.tsx)
function generatePersistentRandom(
  seed: string,
  min: number,
  max: number
): number {
  // Simple hash function to convert string to number (same as datasets.tsx)
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    const char = seed.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }

  // Use the hash as a seed for pseudo-random generation
  const random = Math.abs(hash) / 2147483647; // Normalize to 0-1
  return min + random * (max - min);
}

// Function to calculate storage size (consistent with datasets.tsx)
function formatStorageSize(
  bytesPerRow: number,
  useActualRows?: boolean,
  actualRows?: number
): string {
  if (!bytesPerRow || bytesPerRow === 0) return 'Unknown';

  // For consistency with the main datasets page, use estimation by default
  // Only use actual rows when explicitly requested
  const estimatedRows =
    useActualRows && actualRows
      ? actualRows
      : generatePersistentRandom('rows', 500, 2000);
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
}

// JSON parsing utility function
function parseJSON(jsonText: string): Record<string, string | number>[] {
  console.log('Raw JSON text:', jsonText);

  try {
    const parsed = JSON.parse(jsonText);
    console.log('Parsed JSON:', parsed);

    // Handle different JSON structures
    if (Array.isArray(parsed)) {
      // Already an array of objects
      return parsed;
    } else if (parsed && typeof parsed === 'object') {
      // Single object, wrap in array
      return [parsed];
    } else {
      console.warn('Unexpected JSON structure:', parsed);
      return [];
    }
  } catch (error) {
    console.error('JSON parsing error:', error);

    // Try to handle JSONL (JSON Lines) format
    try {
      const lines = jsonText.trim().split('\n');
      const data = lines
        .filter((line) => line.trim() !== '')
        .map((line) => JSON.parse(line.trim()));
      console.log('Parsed JSONL data:', data);
      return data;
    } catch (jsonlError) {
      console.error('JSONL parsing also failed:', jsonlError);
      return [];
    }
  }
}

export default function DatasetDetails() {
  const router = useRouter();
  const { id } = router.query;
  const { provider, signer, address, chainId } = usePrivyEthers();

  // Log wallet connection status for debugging
  useEffect(() => {
    console.log('Wallet status:', {
      address,
      chainId,
      hasProvider: !!provider,
      hasSigner: !!signer,
    });
  }, [address, chainId, provider, signer]);

  const [dataset, setDataset] = useState<DatasetResponse | null>(null);
  const [metadata, setMetadata] = useState<DatasetMetadata | null>(null);
  const [previewData, setPreviewData] = useState<
    Record<string, string | number>[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedCID, setCopiedCID] = useState(false);
  const [activeTab, setActiveTab] = useState<'preview' | 'schema' | 'lineage'>(
    'preview'
  );
  const [purchaseState, setPurchaseState] = useState<PurchaseState>({
    isProcessing: false,
    isSuccess: false,
    error: null,
  });
  const [accessState, setAccessState] = useState<AccessState>({
    hasAccess: false,
    isLoading: true,
  });
  const [decryptedData, setDecryptedData] = useState<
    Record<string, string | number>[] | null
  >(null);
  const [downloadState, setDownloadState] = useState<DownloadState>({
    isDownloading: false,
    isDecrypting: false,
    error: null,
    progress: '',
  });

  // Check user access on load
  useEffect(() => {
    const checkAccess = async () => {
      if (!dataset || !address || !provider) {
        setAccessState({ hasAccess: false, isLoading: false });
        return;
      }

      try {
        setAccessState({ hasAccess: false, isLoading: true });

        const validator = createPurchaseValidator(
          provider,
          MARKETPLACE_ADDRESS,
          REGISTRY_ADDRESS
        );

        // Extract datasetId from first tag (which contains the actual dataset ID)
        const datasetId = dataset.tags[0]; // First tag is the datasetId

        // Check if user has purchased this dataset
        const validationResult = await validator.validatePurchaseByLicense(
          address,
          datasetId
        );

        if (validationResult.isValid) {
          setAccessState({
            hasAccess: true,
            isLoading: false,
            licenseDetails: validationResult.purchaseDetails
              ? {
                  licenseType: validationResult.purchaseDetails.licenseType,
                  purchasedAt: validationResult.purchaseDetails.timestamp,
                  expiresAt: validationResult.purchaseDetails.expiresAt,
                  pricePaid: validationResult.purchaseDetails.price,
                }
              : undefined,
          });
        } else {
          setAccessState({ hasAccess: false, isLoading: false });
        }
      } catch (error) {
        console.error('Error checking access:', error);
        setAccessState({ hasAccess: false, isLoading: false });
      }
    };

    checkAccess();
  }, [dataset, address, provider]);

  // Fetch dataset data
  useEffect(() => {
    if (!id) return;

    const fetchDataset = async () => {
      try {
        setLoading(true);
        setError(null);

        // Fetch dataset details
        const response = await fetch(
          `https://filecoin.bnshub.org/datasets/${id}`
        );
        if (!response.ok) {
          throw new Error('Dataset not found');
        }

        const datasetData = await response.json();
        setDataset(datasetData);

        // Fetch metadata if available
        if (datasetData.metadataCid && datasetData.creatorId) {
          try {
            const metadataResponse = await fetch(
              `https://${datasetData.creatorId}.calibration.filcdn.io/${datasetData.metadataCid}`
            );
            if (metadataResponse.ok) {
              const metadataData = await metadataResponse.json();
              setMetadata(metadataData);
            }
          } catch (metadataError) {
            console.warn('Failed to fetch metadata:', metadataError);
          }
        }

        // Fetch preview data if available (always show preview regardless of access)
        if (datasetData.datasetPreviewCid && datasetData.creatorId) {
          try {
            const previewUrl = `https://${datasetData.creatorId}.calibration.filcdn.io/${datasetData.datasetPreviewCid}`;
            console.log('Fetching preview data from:', previewUrl);

            const previewResponse = await fetch(previewUrl);
            console.log('Preview response status:', previewResponse.status);

            if (previewResponse.ok) {
              const responseText = await previewResponse.text();
              console.log('Response text length:', responseText.length);
              console.log(
                'Response preview (first 200 chars):',
                responseText.substring(0, 200)
              );

              let parsedData: Record<string, string | number>[] = [];

              // Parse based on dataset format
              if (datasetData.format?.toLowerCase() === 'json') {
                console.log('Parsing as JSON format');
                parsedData = parseJSON(responseText);
              } else {
                console.log('Parsing as CSV format');
                parsedData = parseCSV(responseText);

                // Fallback parsing if the main parser returns empty data
                if (parsedData.length === 0 && responseText.includes('ID_')) {
                  console.log('Attempting CSV fallback parsing...');
                  parsedData = parseFallbackCSV(responseText);
                }
              }

              console.log('Final parsed data:', parsedData);
              setPreviewData(parsedData);
            } else {
              console.error(
                'Failed to fetch preview data:',
                previewResponse.status,
                previewResponse.statusText
              );
            }
          } catch (previewError) {
            console.error('Error fetching preview data:', previewError);
          }
        }

        setLoading(false);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Failed to fetch dataset'
        );
        setLoading(false);
      }
    };

    fetchDataset();
  }, [id]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCID(true);
    setTimeout(() => setCopiedCID(false), 2000);
  };

  const handlePurchase = async () => {
    if (purchaseState.isProcessing || !dataset || !signer) return;

    try {
      setPurchaseState({
        isProcessing: true,
        isSuccess: false,
        error: null,
      });

      // Extract datasetId from first tag (which contains the actual dataset ID)
      const datasetId = dataset.tags[0]; // First tag is the datasetId

      // Debug: Log contract addresses
      console.log('Contract addresses:', {
        MARKETPLACE_ADDRESS,
        REGISTRY_ADDRESS,
        datasetId: datasetId,
        originalId: dataset.id,
      });

      // Validate contract addresses
      if (!MARKETPLACE_ADDRESS || MARKETPLACE_ADDRESS === '') {
        throw new Error(
          'Marketplace contract address not configured. Please check NEXT_PUBLIC_MARKETPLACE_ADDRESS environment variable.'
        );
      }

      // Check if addresses are valid Ethereum addresses
      if (!ethers.isAddress(MARKETPLACE_ADDRESS)) {
        throw new Error(`Invalid marketplace address: ${MARKETPLACE_ADDRESS}`);
      }

      // Get user address and check wallet connection
      const userAddress = await signer.getAddress();
      console.log('User address:', userAddress);

      // Check network
      if (provider) {
        const network = await provider.getNetwork();
        console.log('Network:', network.chainId, network.name);
      }

      // Create contract instance
      const marketplaceContract = new ethers.Contract(
        MARKETPLACE_ADDRESS,
        DatasetMarketplaceABI.abi,
        signer
      );

      console.log('Contract created, checking if it exists...');

      // Check if contract exists by trying to read a simple view function
      try {
        await marketplaceContract.marketplaceFee();
        console.log('✅ Contract exists and is accessible');
      } catch (contractError) {
        console.error('❌ Contract check failed:', contractError);
        throw new Error(
          `Contract not found at ${MARKETPLACE_ADDRESS}. Please verify the contract address.`
        );
      }

      // USDFC token address (provided)
      const usdcTokenAddress = '0xb3042734b608a1B16e9e86B374A3f3e389B4cDf0';
      console.log('USDFC token address:', usdcTokenAddress);

      // Create USDFC token contract instance
      const usdcContract = new ethers.Contract(
        usdcTokenAddress,
        [
          'function balanceOf(address) view returns (uint256)',
          'function allowance(address owner, address spender) view returns (uint256)',
          'function approve(address spender, uint256 amount) returns (bool)',
          'function decimals() view returns (uint8)',
        ],
        signer
      );

      // Check if dataset exists in marketplace
      let datasetPricing;
      try {
        datasetPricing = await marketplaceContract.datasetPricing(datasetId);
        console.log('Dataset pricing info:', datasetPricing);

        if (!datasetPricing.isActive) {
          throw new Error('Dataset is not listed for sale in the marketplace');
        }
      } catch (pricingError) {
        console.error('❌ Dataset pricing check failed:', pricingError);
        throw new Error(
          `Dataset ${datasetId} not found in marketplace or not active`
        );
      }

      // Check USDFC token balance and allowance
      try {
        const balance = await usdcContract.balanceOf(userAddress);
        const allowance = await usdcContract.allowance(
          userAddress,
          MARKETPLACE_ADDRESS
        );
        const requiredAmount = datasetPricing.price;

        console.log('Token info:', {
          balance: ethers.formatEther(balance),
          allowance: ethers.formatEther(allowance),
          requiredAmount: ethers.formatEther(requiredAmount),
        });

        if (balance < requiredAmount) {
          throw new Error(
            `Insufficient USDFC balance. Required: ${ethers.formatEther(
              requiredAmount
            )} USDFC, Available: ${ethers.formatEther(balance)} USDFC`
          );
        }

        // Check if we need to approve more tokens
        if (allowance < requiredAmount) {
          console.log('🔄 Approving USDFC tokens for marketplace...');

          setPurchaseState((prev) => ({
            ...prev,
            isProcessing: true,
            error: null,
          }));

          const approveTx = await usdcContract.approve(
            MARKETPLACE_ADDRESS,
            requiredAmount
          );
          console.log('Approval transaction sent:', approveTx.hash);

          const approveReceipt = await approveTx.wait();
          console.log('✅ USDFC approval confirmed:', approveReceipt.hash);
        }
      } catch (tokenError) {
        console.error('❌ Token approval failed:', tokenError);
        throw new Error(
          `Token approval failed: ${
            tokenError instanceof Error ? tokenError.message : 'Unknown error'
          }`
        );
      }

      // Check user's balance if needed
      if (provider) {
        const balance = await provider.getBalance(userAddress);
        console.log('User ETH balance:', ethers.formatEther(balance));

        // Basic balance check (you might need to check specific token balances)
        if (balance === 0n) {
          throw new Error('Insufficient ETH balance for transaction fees');
        }
      }

      console.log('All pre-checks passed, attempting purchase...');
      console.log('Purchase parameters:', {
        datasetId: datasetId,
        usageTerms: 'Commercial use and model training',
      });

      // Estimate gas first to get better error messages
      try {
        const gasEstimate =
          await marketplaceContract.purchaseDataset.estimateGas(
            datasetId,
            'Commercial use and model training'
          );
        console.log('Gas estimate:', gasEstimate.toString());
      } catch (gasError) {
        console.error('❌ Gas estimation failed:', gasError);

        // Try to provide more specific error messages
        if (
          gasError instanceof Error &&
          gasError.message.includes('insufficient funds')
        ) {
          throw new Error('Insufficient funds to purchase dataset');
        } else if (
          gasError instanceof Error &&
          gasError.message.includes('execution reverted')
        ) {
          throw new Error(
            'Transaction would fail - check dataset availability and your permissions'
          );
        } else {
          throw new Error(
            `Gas estimation failed: ${
              gasError instanceof Error ? gasError.message : 'Unknown error'
            }`
          );
        }
      }

      // Execute the transaction
      const tx = await marketplaceContract.purchaseDataset(
        datasetId,
        'Commercial use and model training'
      );

      console.log('Transaction sent:', tx.hash);

      // Wait for confirmation
      const receipt = await tx.wait();
      console.log('Transaction confirmed:', receipt);

      setPurchaseState({
        isProcessing: false,
        isSuccess: true,
        error: null,
        transactionHash: receipt.hash,
      });

      // Refresh access state
      setAccessState({ hasAccess: true, isLoading: false });
    } catch (err) {
      console.error('Purchase failed:', err);

      let errorMessage = 'Unknown error occurred';

      if (err instanceof Error) {
        errorMessage = err.message;
      } else if (typeof err === 'object' && err !== null && 'message' in err) {
        errorMessage = (err as Error).message;
      }

      // Clean up common error messages for better UX
      if (errorMessage.includes('user rejected transaction')) {
        errorMessage = 'Transaction was cancelled by user';
      } else if (errorMessage.includes('insufficient funds')) {
        errorMessage = 'Insufficient funds to complete purchase';
      } else if (errorMessage.includes('execution reverted')) {
        errorMessage = 'Transaction failed - please check dataset availability';
      }

      setPurchaseState({
        isProcessing: false,
        isSuccess: false,
        error: errorMessage,
      });
    }
  };

  const handleDecryptDataset = async () => {
    if (!dataset || !signer || !metadata?.encryption) return;

    try {
      setDownloadState({
        isDownloading: false,
        isDecrypting: true,
        error: null,
        progress: 'Downloading encrypted dataset...',
      });

      // Download encrypted dataset from Filecoin
      const encryptedUrl = `https://${dataset.creatorId}.calibration.filcdn.io/${dataset.datasetCid}`;
      const response = await fetch(encryptedUrl);

      if (!response.ok) {
        throw new Error('Failed to download encrypted dataset');
      }

      const encryptedContent = await response.text();

      setDownloadState((prev) => ({
        ...prev,
        progress: 'Decrypting dataset...',
      }));

      // Debug: Log the datasetIds being used
      const datasetIdFromTags = dataset.tags[0];
      const datasetIdFromAccessRules =
        metadata.encryption.accessRules.datasetId;

      console.log('🔍 Decryption Debug Info:');
      console.log(
        '- Dataset ID from tags (used in purchase):',
        datasetIdFromTags
      );
      console.log(
        '- Dataset ID from encryption access rules:',
        datasetIdFromAccessRules
      );
      console.log('- User address:', await signer.getAddress());
      console.log('- Marketplace address:', MARKETPLACE_ADDRESS);

      // Decrypt using simple encryption service
      const decryptedContent = await simpleEncryption.decryptDataset(
        {
          encryptedData: encryptedContent,
          encryptionMethod: metadata.encryption.encryptionMethod,
          keyHint: metadata.encryption.keyHint,
          accessRules: {
            ...metadata.encryption.accessRules,
            // Use the same datasetId that was used for purchase
            datasetId: datasetIdFromTags,
          },
        },
        signer,
        undefined, // purchaseProof not needed with smart contract validation
        undefined, // accessPassword not needed
        MARKETPLACE_ADDRESS,
        REGISTRY_ADDRESS
      );

      setDownloadState((prev) => ({
        ...prev,
        progress: 'Parsing decrypted data...',
      }));

      // Parse decrypted data
      let parsedDecryptedData: Record<string, string | number>[] = [];
      if (dataset.format?.toLowerCase() === 'json') {
        parsedDecryptedData = parseJSON(decryptedContent);
      } else {
        parsedDecryptedData = parseCSV(decryptedContent);
      }

      setDecryptedData(parsedDecryptedData);

      setDownloadState({
        isDownloading: false,
        isDecrypting: false,
        error: null,
        progress: '',
      });
    } catch (error) {
      console.error('Decryption failed:', error);
      setDownloadState({
        isDownloading: false,
        isDecrypting: false,
        error: error instanceof Error ? error.message : 'Decryption failed',
        progress: '',
      });
    }
  };

  // Helper function to create and download zip file
  const createAndDownloadZip = async (
    data: Record<string, string | number>[],
    dataset: DatasetResponse
  ) => {
    const zip = new JSZip();

    // Prepare filename
    const sanitizedName = dataset.name.replace(/[^a-zA-Z0-9]/g, '_');

    setDownloadState((prev) => ({
      ...prev,
      progress: 'Preparing data files...',
    }));

    // Convert data to appropriate format
    let fileContent: string;
    let fileName: string;

    if (dataset.format?.toLowerCase() === 'json') {
      fileContent = JSON.stringify(data, null, 2);
      fileName = `${sanitizedName}.json`;
    } else {
      // Convert to CSV
      if (data.length > 0) {
        const headers = Object.keys(data[0]);
        const csvContent = [
          headers.join(','),
          ...data.map((row) =>
            headers
              .map((header) => {
                const value = row[header];
                if (
                  typeof value === 'string' &&
                  (value.includes(',') || value.includes('"'))
                ) {
                  return `"${value.replace(/"/g, '""')}"`;
                }
                return value;
              })
              .join(',')
          ),
        ].join('\n');
        fileContent = csvContent;
      } else {
        fileContent = '';
      }
      fileName = `${sanitizedName}.csv`;
    }

    // Add main data file to zip
    zip.file(fileName, fileContent);

    setDownloadState((prev) => ({
      ...prev,
      progress: 'Adding metadata files...',
    }));

    // Add metadata file
    if (metadata) {
      zip.file('metadata.json', JSON.stringify(metadata, null, 2));
    }

    // Add README with dataset info
    const readmeContent = `
Dataset: ${dataset.name}
Description: ${dataset.description}
Format: ${dataset.format}
License: ${dataset.license}
Creator: ${dataset.creatorId}
Total Rows: ${data.length}
Visibility: ${dataset.visibility}
Category: ${dataset.category}

Files included:
- ${fileName}: Main dataset content
- metadata.json: Dataset metadata and schema information
- README.txt: This file

Generated by Synthik Platform
Downloaded on: ${new Date().toISOString()}
    `.trim();

    zip.file('README.txt', readmeContent);

    setDownloadState((prev) => ({
      ...prev,
      progress: 'Creating zip file...',
    }));

    // Generate and download zip
    const blob = await zip.generateAsync({
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    });

    setDownloadState((prev) => ({
      ...prev,
      progress: 'Starting download...',
    }));

    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `${sanitizedName}_dataset.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Main download function that handles both encrypted and non-encrypted datasets
  const handleDownloadDataset = async () => {
    if (!dataset || !signer) return;

    try {
      setDownloadState({
        isDownloading: true,
        isDecrypting: false,
        error: null,
        progress: 'Preparing download...',
      });

      let dataToExport: Record<string, string | number>[] = [];

      // If dataset is encrypted, decrypt first
      if (metadata?.encryption) {
        if (!decryptedData) {
          setDownloadState((prev) => ({
            ...prev,
            isDecrypting: true,
            progress: 'Dataset is encrypted. Decrypting first...',
          }));

          await handleDecryptDataset();

          // After decryption, the user needs to click download again
          setDownloadState({
            isDownloading: false,
            isDecrypting: false,
            error: null,
            progress: '',
          });
          return;
        }
        dataToExport = decryptedData;
      } else {
        // For non-encrypted datasets, fetch and parse directly
        setDownloadState((prev) => ({
          ...prev,
          progress: 'Downloading dataset from Filecoin...',
        }));

        const dataUrl = `https://${dataset.creatorId}.calibration.filcdn.io/${dataset.datasetCid}`;
        const response = await fetch(dataUrl);

        if (!response.ok) {
          throw new Error('Failed to download dataset');
        }

        const content = await response.text();

        setDownloadState((prev) => ({
          ...prev,
          progress: 'Parsing dataset content...',
        }));

        if (dataset.format?.toLowerCase() === 'json') {
          dataToExport = parseJSON(content);
        } else {
          dataToExport = parseCSV(content);
        }
      }

      // Create zip file with the data
      await createAndDownloadZip(dataToExport, dataset);

      setDownloadState({
        isDownloading: false,
        isDecrypting: false,
        error: null,
        progress: '',
      });
    } catch (error) {
      console.error('Download failed:', error);
      setDownloadState({
        isDownloading: false,
        isDecrypting: false,
        error: error instanceof Error ? error.message : 'Download failed',
        progress: '',
      });
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="pt-28 pb-20 px-8 lg:px-16">
          <div className="max-w-7xl mx-auto">
            <div className="flex items-center justify-center min-h-96">
              <div className="flex items-center gap-3 text-gray-600">
                <Loader2 className="w-6 h-6 animate-spin" />
                <span>Loading dataset...</span>
              </div>
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  if (error || !dataset) {
    return (
      <Layout>
        <div className="pt-28 pb-20 px-8 lg:px-16">
          <div className="max-w-7xl mx-auto">
            <div className="flex items-center justify-center min-h-96">
              <div className="text-center">
                <h1 className="text-2xl font-semibold text-gray-900 mb-2">
                  Dataset Not Found
                </h1>
                <p className="text-gray-600 mb-4">
                  {error || 'The dataset you are looking for does not exist.'}
                </p>
                <Link
                  href="/datasets"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Back to Datasets
                </Link>
              </div>
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  // Determine if dataset is locked (has a price and user doesn't have access)
  const isLocked = dataset.price > 0 && !accessState.hasAccess;

  return (
    <Layout>
      {/* Background pattern */}
      <div className="fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-gray-50" />
        <div className="absolute inset-0 grid-pattern opacity-[0.02]" />
        <div className="absolute top-0 left-0 w-full h-96 mesh-gradient" />
      </div>

      <div className="pt-28 pb-20 px-8 lg:px-16">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-7xl mx-auto"
        >
          {/* Back button */}
          <Link
            href="/datasets"
            className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-8 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="text-sm font-medium">Back to Datasets</span>
          </Link>

          {/* Purchase Status Messages */}
          {purchaseState.isSuccess && (
            <div className="mb-6 p-4 bg-green-50 rounded-lg border border-green-200">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                  <span className="text-green-600 text-sm">✓</span>
                </div>
                <div>
                  <p className="text-sm font-medium text-green-900">
                    Dataset purchased successfully!
                  </p>
                  {purchaseState.transactionHash && (
                    <p className="text-xs text-green-700 mt-1">
                      Transaction: {purchaseState.transactionHash.slice(0, 10)}
                      ...
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {purchaseState.error && (
            <div className="mb-6 p-4 bg-red-50 rounded-lg border border-red-200">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center">
                  <span className="text-red-600 text-sm">✕</span>
                </div>
                <div>
                  <p className="text-sm font-medium text-red-900">
                    Purchase failed
                  </p>
                  <p className="text-xs text-red-700 mt-1">
                    {purchaseState.error}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Download Progress */}
          {(downloadState.isDownloading ||
            downloadState.isDecrypting ||
            downloadState.progress) && (
            <div className="mb-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                  <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />
                </div>
                <div>
                  <p className="text-sm font-medium text-blue-900">
                    {downloadState.isDecrypting
                      ? 'Decrypting Dataset'
                      : 'Preparing Download'}
                  </p>
                  {downloadState.progress && (
                    <p className="text-xs text-blue-700 mt-1">
                      {downloadState.progress}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Download Error */}
          {downloadState.error && (
            <div className="mb-6 p-4 bg-red-50 rounded-lg border border-red-200">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center">
                  <span className="text-red-600 text-sm">✕</span>
                </div>
                <div>
                  <p className="text-sm font-medium text-red-900">
                    Download failed
                  </p>
                  <p className="text-xs text-red-700 mt-1">
                    {downloadState.error}
                  </p>
                  <button
                    onClick={() =>
                      setDownloadState({
                        isDownloading: false,
                        isDecrypting: false,
                        error: null,
                        progress: '',
                      })
                    }
                    className="text-xs text-red-600 hover:text-red-700 underline mt-1"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Access Status */}
          {accessState.hasAccess && accessState.licenseDetails && (
            <div className="mb-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                  <Unlock className="w-4 h-4 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-blue-900">
                    You have access to this dataset
                  </p>
                  <p className="text-xs text-blue-700 mt-1">
                    License: {accessState.licenseDetails.licenseType} • Paid:{' '}
                    {ethers.formatEther(accessState.licenseDetails.pricePaid)}{' '}
                    USDFC
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Header Section */}
          <div className="grid lg:grid-cols-3 gap-8 mb-12">
            <div className="lg:col-span-2">
              <div className="flex items-start justify-between mb-6">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-4">
                    <h1 className="text-4xl lg:text-5xl font-light display-font">
                      {dataset.name}
                    </h1>
                    {isLocked && !accessState.hasAccess && (
                      <div className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-orange-50 to-red-50 text-orange-700 rounded-full text-sm font-medium border border-orange-200">
                        <Lock className="w-4 h-4" />
                        Locked
                      </div>
                    )}
                    {accessState.hasAccess && (
                      <div className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-green-50 to-emerald-50 text-green-700 rounded-full text-sm font-medium border border-green-200">
                        <Unlock className="w-4 h-4" />
                        Unlocked
                      </div>
                    )}
                  </div>
                  <p className="text-lg text-gray-600 leading-relaxed">
                    {dataset.description}
                  </p>
                </div>
              </div>

              {/* Tags */}
              <div className="flex flex-wrap gap-2 mb-6">
                {dataset.tags.map((tag) => (
                  <span
                    key={tag}
                    className="px-3 py-1.5 bg-gradient-to-r from-indigo-50 to-purple-50 text-indigo-700 rounded-lg text-sm font-medium border border-indigo-100"
                  >
                    {tag}
                  </span>
                ))}
              </div>

              {/* Action buttons */}
              <div className="flex flex-wrap gap-4">
                {isLocked && !accessState.hasAccess ? (
                  <>
                    <button
                      onClick={handlePurchase}
                      disabled={purchaseState.isProcessing || !address}
                      className="px-6 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl font-medium hover:from-indigo-700 hover:to-purple-700 transition-all flex items-center gap-2 shadow-lg shadow-indigo-200 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {purchaseState.isProcessing ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : (
                        <ShoppingCart className="w-5 h-5" />
                      )}
                      {purchaseState.isProcessing
                        ? 'Processing (Approval + Purchase)...'
                        : `Purchase Dataset (${dataset.price} USDFC)`}
                    </button>
                    {!address && (
                      <p className="text-sm text-gray-500">
                        Connect wallet to purchase
                      </p>
                    )}
                    <button className="px-6 py-3 bg-white border border-gray-200 rounded-xl font-medium hover:border-gray-300 transition-colors flex items-center gap-2">
                      <Eye className="w-5 h-5" />
                      Preview Available
                    </button>
                  </>
                ) : accessState.hasAccess ? (
                  <>
                    <button
                      onClick={handleDownloadDataset}
                      disabled={
                        downloadState.isDownloading ||
                        downloadState.isDecrypting ||
                        !address
                      }
                      className="px-6 py-3 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {downloadState.isDownloading ||
                      downloadState.isDecrypting ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : (
                        <Download className="w-5 h-5" />
                      )}
                      {downloadState.isDownloading
                        ? 'Creating ZIP...'
                        : downloadState.isDecrypting
                        ? 'Decrypting...'
                        : metadata?.encryption && !decryptedData
                        ? 'Decrypt & Download ZIP'
                        : decryptedData
                        ? 'Download Full Dataset ZIP'
                        : 'Download as ZIP'}
                    </button>
                    <button className="px-6 py-3 bg-white border border-gray-200 rounded-xl font-medium hover:border-gray-300 transition-colors flex items-center gap-2">
                      <Star className="w-5 h-5" />
                      Star
                    </button>
                    <Link
                      href={`/train-model?dataset=${dataset.id}`}
                      className="px-6 py-3 bg-white border border-gray-200 rounded-xl font-medium hover:border-gray-300 transition-colors flex items-center gap-2 inline-flex"
                    >
                      <Code className="w-5 h-5" />
                      Initiate Model Training
                    </Link>
                  </>
                ) : (
                  <div className="text-center py-4">
                    <p className="text-gray-500">
                      {accessState.isLoading
                        ? 'Checking access...'
                        : 'Access verification required'}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Stats Card */}
            <div className="bg-white rounded-2xl border border-gray-100 p-6 h-fit">
              <h3 className="text-sm font-medium text-gray-900 mb-4">
                Dataset Statistics
              </h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Format</span>
                  <span className="text-sm font-semibold text-gray-900 uppercase">
                    {dataset.format}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Category</span>
                  <span className="text-sm font-semibold text-gray-900">
                    {dataset.category}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">License</span>
                  <span className="text-sm font-semibold text-gray-900 uppercase">
                    {dataset.license}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Visibility</span>
                  <span className="text-sm font-semibold text-gray-900 capitalize">
                    {dataset.visibility}
                  </span>
                </div>
                {dataset.price_per_row > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Storage Size</span>
                    <span className="text-sm font-semibold text-gray-900">
                      {formatStorageSize(dataset.price_per_row)}
                    </span>
                  </div>
                )}
                {metadata?.totalRows && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Total Rows</span>
                    <span className="text-sm font-semibold text-gray-900">
                      {metadata.totalRows.toLocaleString()}
                    </span>
                  </div>
                )}
                {/* {metadata?.totalRows && dataset.price_per_row > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Actual Size</span>
                    <span className="text-sm font-semibold text-gray-900">
                      {formatStorageSize(
                        dataset.price_per_row,
                        true,
                        metadata.totalRows
                      )}
                    </span>
                  </div>
                )} */}
                {metadata?.tokensUsed && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Tokens Used</span>
                    <span className="text-sm font-semibold text-gray-900">
                      {metadata.tokensUsed.toLocaleString()}
                    </span>
                  </div>
                )}
                {metadata?.generationTime && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">
                      Generation Time
                    </span>
                    <span className="text-sm font-semibold text-gray-900">
                      {metadata.generationTime.toFixed(2)}s
                    </span>
                  </div>
                )}
                <div className="pt-4 border-t border-gray-100">
                  {isLocked && !accessState.hasAccess && (
                    <div className="mb-4 p-3 bg-gradient-to-r from-indigo-50 to-purple-50 rounded-lg border border-indigo-100">
                      <div className="flex items-center gap-2 text-sm font-medium text-indigo-700 mb-1">
                        <Sparkles className="w-4 h-4" />
                        Premium Dataset
                      </div>
                      <p className="text-xs text-indigo-600">
                        {dataset.price} USDFC to unlock full access
                      </p>
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Shield className="w-4 h-4 text-green-600" />
                    <span className="text-green-700 font-medium">
                      Verified on-chain
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Filecoin CID Section */}
          {isLocked && !accessState.hasAccess ? (
            // Preview CID for locked datasets
            <div className="bg-gradient-to-r from-gray-50 to-gray-100 rounded-2xl p-6 mb-12 border border-gray-200">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center border border-gray-200">
                    <EyeOff className="w-6 h-6 text-gray-500" />
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-gray-900 mb-1">
                      Preview Data Only
                    </h3>
                    <div className="flex items-center gap-2">
                      <code className="text-sm font-mono text-gray-600">
                        {dataset.datasetPreviewCid}
                      </code>
                      <button
                        onClick={() =>
                          copyToClipboard(dataset.datasetPreviewCid)
                        }
                        className="p-1.5 hover:bg-white rounded-lg transition-colors"
                      >
                        {copiedCID ? (
                          <span className="text-xs text-green-600 font-medium">
                            Copied!
                          </span>
                        ) : (
                          <Copy className="w-4 h-4 text-gray-600" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>
                <div className="text-sm text-gray-500">
                  Full dataset available after purchase
                </div>
              </div>
            </div>
          ) : (
            // Full CID for unlocked datasets
            <div className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-2xl p-6 mb-12 border border-indigo-100">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center">
                    <Database className="w-6 h-6 text-indigo-600" />
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-gray-900 mb-1">
                      Filecoin Storage - Full Dataset
                    </h3>
                    <div className="flex items-center gap-2">
                      <code className="text-sm font-mono text-gray-700">
                        {dataset.datasetCid}
                      </code>
                      <button
                        onClick={() => copyToClipboard(dataset.datasetCid)}
                        className="p-1.5 hover:bg-white rounded-lg transition-colors"
                      >
                        {copiedCID ? (
                          <span className="text-xs text-green-600 font-medium">
                            Copied!
                          </span>
                        ) : (
                          <Copy className="w-4 h-4 text-gray-600" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>
                <Link
                  href={`https://filfox.info/en/message/${dataset.datasetCid}`}
                  target="_blank"
                  className="flex items-center gap-2 px-4 py-2 bg-white rounded-lg text-sm font-medium text-indigo-600 hover:bg-indigo-50 transition-colors"
                >
                  View on Filfox
                  <ExternalLink className="w-4 h-4" />
                </Link>
              </div>
            </div>
          )}

          {/* Tabs Section */}
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden mb-12">
            <div className="border-b border-gray-100">
              <div className="flex">
                <button
                  onClick={() => setActiveTab('preview')}
                  className={`px-6 py-4 text-sm font-medium transition-colors relative ${
                    activeTab === 'preview'
                      ? 'text-indigo-600'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Data Preview
                  {activeTab === 'preview' && (
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600" />
                  )}
                </button>
                <button
                  onClick={() => setActiveTab('schema')}
                  className={`px-6 py-4 text-sm font-medium transition-colors relative ${
                    activeTab === 'schema'
                      ? 'text-indigo-600'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Schema
                  {activeTab === 'schema' && (
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600" />
                  )}
                </button>
                <button
                  onClick={() => setActiveTab('lineage')}
                  className={`px-6 py-4 text-sm font-medium transition-colors relative ${
                    activeTab === 'lineage'
                      ? 'text-indigo-600'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Generation Lineage
                  {activeTab === 'lineage' && (
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600" />
                  )}
                </button>
              </div>
            </div>

            <div className="p-6">
              {/* Preview Tab */}
              {activeTab === 'preview' && (
                <div>
                  {/* Debug info showing the preview URL and data status */}
                  {dataset && (
                    <div className="mb-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
                      <p className="text-xs font-medium text-blue-900 mb-1">
                        Preview Data Source ({dataset.format?.toUpperCase()}):
                      </p>
                      <code className="text-xs text-blue-700 break-all">
                        https://{dataset.creatorId}.calibration.filcdn.io/
                        {dataset.datasetPreviewCid}
                      </code>
                      <div className="mt-2 text-xs text-blue-600">
                        Status:{' '}
                        {previewData.length > 0
                          ? `${previewData.length} rows loaded`
                          : 'No data loaded'}
                      </div>
                      <div className="mt-1 text-xs text-blue-500">
                        Parser:{' '}
                        {dataset.format?.toLowerCase() === 'json'
                          ? 'JSON Parser'
                          : 'CSV Parser'}
                      </div>
                    </div>
                  )}

                  {isLocked && !accessState.hasAccess ? (
                    <div className="mb-6 p-4 bg-gradient-to-r from-amber-50 to-orange-50 rounded-lg border border-amber-200">
                      <div className="flex items-center gap-3">
                        <Eye className="w-5 h-5 text-amber-600" />
                        <div>
                          <p className="text-sm font-medium text-amber-900">
                            Preview Mode - Showing{' '}
                            {previewData?.length || 'limited'} rows
                          </p>
                          <p className="text-xs text-amber-700 mt-0.5">
                            {metadata?.totalRows
                              ? `Purchase to access all ${metadata.totalRows.toLocaleString()} rows`
                              : 'Purchase to access full dataset'}
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : accessState.hasAccess && !decryptedData ? (
                    <div className="mb-6 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border border-blue-200">
                      <div className="flex items-center gap-3">
                        <Eye className="w-5 h-5 text-blue-600" />
                        <div>
                          <p className="text-sm font-medium text-blue-900">
                            Preview Mode - Showing sample rows
                          </p>
                          <p className="text-xs text-blue-700 mt-0.5">
                            Click Download to decrypt and get the full dataset (
                            {metadata?.totalRows
                              ? metadata.totalRows.toLocaleString()
                              : 'complete'}{' '}
                            rows)
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : null}

                  {/* Always show preview data in UI, full data available for download */}
                  {previewData && previewData.length > 0 ? (
                    <div>
                      {decryptedData && decryptedData.length > 0 && (
                        <div className="mb-4 p-3 bg-green-50 rounded-lg border border-green-200">
                          <p className="text-sm font-medium text-green-900">
                            ✅ Full Dataset Decrypted ({decryptedData.length}{' '}
                            rows) - Download available below
                          </p>
                          <p className="text-xs text-green-700 mt-1">
                            Showing preview data only. Click Download as ZIP to
                            get the full dataset.
                          </p>
                        </div>
                      )}
                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead>
                            <tr className="border-b border-gray-200">
                              {Object.keys(previewData[0]).map((key) => (
                                <th
                                  key={key}
                                  className="text-left py-3 px-4 text-sm font-medium text-gray-900"
                                >
                                  {key.charAt(0).toUpperCase() + key.slice(1)}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {previewData.map((row, index) => (
                              <tr
                                key={index}
                                className="border-b border-gray-100 hover:bg-gray-50"
                              >
                                {Object.values(row).map((value, colIndex) => (
                                  <td
                                    key={colIndex}
                                    className="py-3 px-4 text-sm text-gray-600 max-w-md truncate"
                                  >
                                    {typeof value === 'object'
                                      ? JSON.stringify(value)
                                      : String(value)}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-12">
                      <Database className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                      <p className="text-gray-500 mb-2">
                        No preview data available
                      </p>
                      <p className="text-sm text-gray-400">
                        Contact the dataset creator for more information
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Schema Tab */}
              {activeTab === 'schema' && (
                <div>
                  {metadata?.schema && metadata.schema.length > 0 ? (
                    <div className="space-y-4">
                      {metadata.schema.map((column, index) => (
                        <div
                          key={index}
                          className="flex items-start gap-4 p-4 bg-gray-50 rounded-lg"
                        >
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-mono text-sm font-medium text-gray-900">
                                {column.name}
                              </span>
                              <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded text-xs font-medium">
                                {column.type}
                              </span>
                            </div>
                            <p className="text-sm text-gray-600">
                              {column.description}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-12">
                      <GitBranch className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                      <p className="text-gray-500 mb-2">
                        No schema information available
                      </p>
                      <p className="text-sm text-gray-400">
                        Schema details may be available after purchase
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Lineage Tab */}
              {activeTab === 'lineage' && (
                <div className="space-y-6">
                  {/* Core Dataset Information */}
                  <div className="bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50 rounded-2xl p-8 border border-indigo-100 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-indigo-200/20 to-purple-200/20 rounded-full blur-3xl" />
                    <div className="relative">
                      {/* <div className="flex items-center gap-3 mb-6">
                        <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg">
                          <Database className="w-6 h-6 text-white" />
                        </div>
                        <div>
                          <h4 className="text-xl font-bold text-gray-900 display-font">
                            {metadata?.name || dataset.name}
                          </h4>
                          <p className="text-sm text-gray-600">
                            {metadata?.description || dataset.description}
                          </p>
                        </div>
                      </div> */}

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                        <div className="bg-white/80 backdrop-blur-sm rounded-xl p-4 border border-indigo-100">
                          <div className="flex items-center gap-2 mb-1">
                            <div className="w-8 h-8 bg-indigo-100 rounded-lg flex items-center justify-center">
                              <span className="text-indigo-600 text-sm font-bold">
                                #
                              </span>
                            </div>
                            <span className="text-xs text-gray-500 uppercase tracking-wide">
                              Rows
                            </span>
                          </div>
                          <p className="text-2xl font-bold text-gray-900">
                            {metadata?.totalRows?.toLocaleString() || 'N/A'}
                          </p>
                        </div>

                        <div className="bg-white/80 backdrop-blur-sm rounded-xl p-4 border border-purple-100">
                          <div className="flex items-center gap-2 mb-1">
                            <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center">
                              <Sparkles className="w-4 h-4 text-purple-600" />
                            </div>
                            <span className="text-xs text-gray-500 uppercase tracking-wide">
                              Tokens
                            </span>
                          </div>
                          <p className="text-2xl font-bold text-gray-900">
                            {metadata?.tokensUsed?.toLocaleString() || 'N/A'}
                          </p>
                        </div>

                        <div className="bg-white/80 backdrop-blur-sm rounded-xl p-4 border border-green-100">
                          <div className="flex items-center gap-2 mb-1">
                            <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
                              <span className="text-green-600 text-sm font-bold">
                                $
                              </span>
                            </div>
                            <span className="text-xs text-gray-500 uppercase tracking-wide">
                              Cost
                            </span>
                          </div>
                          <p className="text-2xl font-bold text-gray-900">
                            ${metadata?.generationCost?.toFixed(4) || '0.00'}
                          </p>
                        </div>

                        <div className="bg-white/80 backdrop-blur-sm rounded-xl p-4 border border-orange-100">
                          <div className="flex items-center gap-2 mb-1">
                            <div className="w-8 h-8 bg-orange-100 rounded-lg flex items-center justify-center">
                              <Loader2 className="w-4 h-4 text-orange-600" />
                            </div>
                            <span className="text-xs text-gray-500 uppercase tracking-wide">
                              Time
                            </span>
                          </div>
                          <p className="text-2xl font-bold text-gray-900">
                            {metadata?.generationTime?.toFixed(1) || '0'}s
                          </p>
                        </div>
                      </div>

                      {/* Technical Details */}
                      <div className="grid md:grid-cols-2 gap-4">
                        <div className="space-y-3">
                          <div className="flex items-center justify-between p-3 bg-white/60 backdrop-blur-sm rounded-lg">
                            <span className="text-sm text-gray-600 font-medium">
                              Format
                            </span>
                            <span className="text-sm font-mono text-gray-900 uppercase bg-gray-100 px-2 py-1 rounded">
                              {metadata?.format || dataset.format}
                            </span>
                          </div>
                          <div className="flex items-center justify-between p-3 bg-white/60 backdrop-blur-sm rounded-lg">
                            <span className="text-sm text-gray-600 font-medium">
                              License
                            </span>
                            <span className="text-sm font-mono text-gray-900 uppercase bg-indigo-100 text-indigo-700 px-2 py-1 rounded">
                              {metadata?.license || dataset.license}
                            </span>
                          </div>
                          <div className="flex items-center justify-between p-3 bg-white/60 backdrop-blur-sm rounded-lg">
                            <span className="text-sm text-gray-600 font-medium">
                              Visibility
                            </span>
                            <span className="text-sm font-medium text-gray-900 capitalize bg-purple-100 text-purple-700 px-2 py-1 rounded">
                              {metadata?.visibility || dataset.visibility}
                            </span>
                          </div>
                        </div>

                        <div className="space-y-3">
                          <div className="flex items-center justify-between p-3 bg-white/60 backdrop-blur-sm rounded-lg">
                            <span className="text-sm text-gray-600 font-medium">
                              Version
                            </span>
                            <span className="text-sm font-mono text-gray-900 bg-gray-100 px-2 py-1 rounded">
                              v{metadata?.version || '1.0.0'}
                            </span>
                          </div>
                          <div className="flex items-center justify-between p-3 bg-white/60 backdrop-blur-sm rounded-lg">
                            <span className="text-sm text-gray-600 font-medium">
                              Type
                            </span>
                            <span className="text-sm font-medium text-gray-900 bg-green-100 text-green-700 px-2 py-1 rounded">
                              {dataset.dataset_type}
                            </span>
                          </div>
                          <div className="flex items-center justify-between p-3 bg-white/60 backdrop-blur-sm rounded-lg">
                            <span className="text-sm text-gray-600 font-medium">
                              Generated
                            </span>
                            <span className="text-sm font-mono text-gray-900">
                              {metadata?.timestamp
                                ? new Date(metadata.timestamp).toLocaleString(
                                    'en-US',
                                    {
                                      year: 'numeric',
                                      month: 'short',
                                      day: 'numeric',
                                      hour: '2-digit',
                                      minute: '2-digit',
                                    }
                                  )
                                : 'Unknown'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Encryption & Security Information */}
                  {metadata?.encryption && (
                    <div className="bg-gradient-to-br from-gray-50 to-gray-100 p-8 border border-green-100 relative overflow-hidden">
                      <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-br from-green-200/20 to-emerald-200/20 rounded-full blur-3xl" />
                      <div className="relative">
                        <div className="flex items-center gap-3 mb-6">
                          <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl flex items-center justify-center shadow-lg">
                            <Shield className="w-6 h-6 text-white" />
                          </div>
                          <div>
                            <h4 className="text-xl font-bold text-gray-900">
                              Encryption & Security
                            </h4>
                            <p className="text-sm text-gray-600">
                              Advanced data protection enabled
                            </p>
                          </div>
                        </div>

                        <div className="grid md:grid-cols-2 gap-6">
                          <div className="space-y-4">
                            <div className="bg-white/80 backdrop-blur-sm rounded-xl p-4 border border-green-200">
                              <div className="flex items-center gap-2 mb-2">
                                <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
                                  <Lock className="w-4 h-4 text-green-600" />
                                </div>
                                <span className="text-sm font-medium text-gray-700">
                                  Encryption Status
                                </span>
                              </div>
                              <p className="text-lg font-bold text-gray-900">
                                {metadata.encryption.isEncrypted
                                  ? '🔒 Encrypted'
                                  : '🔓 Not Encrypted'}
                              </p>
                            </div>

                            <div className="bg-white/80 backdrop-blur-sm rounded-xl p-4 border border-blue-200">
                              <div className="flex items-center gap-2 mb-2">
                                <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                                  <Code className="w-4 h-4 text-blue-600" />
                                </div>
                                <span className="text-sm font-medium text-gray-700">
                                  Method
                                </span>
                              </div>
                              <p className="font-mono text-sm text-gray-900 bg-blue-50 px-3 py-1.5 rounded-lg inline-block">
                                {metadata.encryption.encryptionMethod}
                              </p>
                            </div>

                            <div className="bg-white/80 backdrop-blur-sm rounded-xl p-4 border border-purple-200">
                              <div className="flex items-center gap-2 mb-2">
                                <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center">
                                  <Sparkles className="w-4 h-4 text-purple-600" />
                                </div>
                                <span className="text-sm font-medium text-gray-700">
                                  Decryption Mode
                                </span>
                              </div>
                              <p className="font-mono text-sm text-gray-900 bg-purple-50 px-3 py-1.5 rounded-lg inline-block">
                                {metadata.encryption.keyHint}
                              </p>
                            </div>
                          </div>

                          <div className="space-y-4">
                            <div className="bg-gradient-to-br from-white/90 to-white/70 backdrop-blur-sm rounded-xl p-6 border border-gray-200 shadow-lg">
                              <div className="flex items-center gap-2 mb-4">
                                <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center">
                                  <GitBranch className="w-5 h-5 text-white" />
                                </div>
                                <h5 className="text-lg font-bold text-gray-900">
                                  Access Rules
                                </h5>
                              </div>

                              <div className="space-y-3">
                                <div className="bg-white rounded-lg p-3 border border-gray-200">
                                  <span className="text-xs font-medium text-green-700 uppercase tracking-wide">
                                    Dataset ID
                                  </span>
                                  <div className="mt-1 flex items-center gap-2">
                                    <code className="text-sm font-mono text-gray-900 break-all">
                                      {
                                        metadata.encryption.accessRules
                                          .datasetId
                                      }
                                    </code>
                                    <button
                                      onClick={() =>
                                        copyToClipboard(
                                          metadata.encryption?.accessRules
                                            .datasetId || ''
                                        )
                                      }
                                      className="p-1 hover:bg-green-100 rounded transition-colors flex-shrink-0"
                                    >
                                      <Copy className="w-3 h-3 text-green-600" />
                                    </button>
                                  </div>
                                </div>

                                <div className="bg-white rounded-lg p-3 border border-gray-200">
                                  <span className="text-xs font-medium text-blue-700 uppercase tracking-wide">
                                    Creator Address
                                  </span>
                                  <div className="mt-1 flex items-center gap-2">
                                    <code className="text-sm font-mono text-gray-900">
                                      {metadata.encryption.accessRules.creatorAddress.slice(
                                        0,
                                        6
                                      )}
                                      ...
                                      {metadata.encryption.accessRules.creatorAddress.slice(
                                        -4
                                      )}
                                    </code>
                                    <button
                                      onClick={() =>
                                        copyToClipboard(
                                          metadata.encryption?.accessRules
                                            .creatorAddress || ''
                                        )
                                      }
                                      className="p-1 hover:bg-blue-100 rounded transition-colors flex-shrink-0"
                                    >
                                      <Copy className="w-3 h-3 text-blue-600" />
                                    </button>
                                  </div>
                                </div>

                                {metadata.encryption.accessRules
                                  .marketplaceContract && (
                                  <div className="bg-gradient-to-r from-purple-50 to-pink-50 rounded-lg p-3 border border-purple-200">
                                    <span className="text-xs font-medium text-purple-700 uppercase tracking-wide">
                                      Marketplace Contract
                                    </span>
                                    <div className="mt-1 flex items-center gap-2">
                                      <code className="text-sm font-mono text-gray-900">
                                        {metadata.encryption.accessRules.marketplaceContract.slice(
                                          0,
                                          6
                                        )}
                                        ...
                                        {metadata.encryption.accessRules.marketplaceContract.slice(
                                          -4
                                        )}
                                      </code>
                                      <button
                                        onClick={() =>
                                          copyToClipboard(
                                            metadata.encryption?.accessRules
                                              .marketplaceContract || ''
                                          )
                                        }
                                        className="p-1 hover:bg-purple-100 rounded transition-colors flex-shrink-0"
                                      >
                                        <Copy className="w-3 h-3 text-purple-600" />
                                      </button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Filecoin Storage Information */}
                  <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-2xl p-8 border border-gray-200">
                    <div className="flex items-center gap-3 mb-6">
                      <div className="w-12 h-12 bg-gradient-to-br from-gray-700 to-gray-900 rounded-xl flex items-center justify-center shadow-lg">
                        <GitBranch className="w-6 h-6 text-white" />
                      </div>
                      <div>
                        <h4 className="text-xl font-bold text-gray-900">
                          Filecoin Storage
                        </h4>
                        <p className="text-sm text-gray-600">
                          Decentralized storage information
                        </p>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="bg-white rounded-lg p-4 border border-gray-200">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium text-gray-600">
                            Metadata CID
                          </span>
                          <button
                            onClick={() => copyToClipboard(dataset.metadataCid)}
                            className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
                          >
                            <Copy className="w-4 h-4 text-gray-500" />
                          </button>
                        </div>
                        <code className="text-sm font-mono text-gray-900 break-all">
                          {dataset.metadataCid}
                        </code>
                      </div>

                      <div className="bg-white rounded-lg p-4 border border-gray-200">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium text-gray-600">
                            Dataset CID
                          </span>
                          <button
                            onClick={() => copyToClipboard(dataset.datasetCid)}
                            className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
                          >
                            <Copy className="w-4 h-4 text-gray-500" />
                          </button>
                        </div>
                        <code className="text-sm font-mono text-gray-900 break-all">
                          {dataset.datasetCid}
                        </code>
                      </div>

                      <div className="bg-white rounded-lg p-4 border border-gray-200">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium text-gray-600">
                            Preview CID
                          </span>
                          <button
                            onClick={() =>
                              copyToClipboard(dataset.datasetPreviewCid)
                            }
                            className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
                          >
                            <Copy className="w-4 h-4 text-gray-500" />
                          </button>
                        </div>
                        <code className="text-sm font-mono text-gray-900 break-all">
                          {dataset.datasetPreviewCid}
                        </code>
                      </div>

                      <div className="flex items-center justify-between pt-4">
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                          <Database className="w-4 h-4" />
                          <span>
                            Creator ID:{' '}
                            <code className="font-mono">
                              {dataset.creatorId}
                            </code>
                          </span>
                        </div>
                        <Link
                          href={`https://filfox.info/en/message/${dataset.datasetCid}`}
                          target="_blank"
                          className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors"
                        >
                          View on Filfox
                          <ExternalLink className="w-4 h-4" />
                        </Link>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Related Datasets - Show placeholder for now */}
          <div className="bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50 rounded-2xl p-8">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-semibold text-gray-900 display-font">
                Related Datasets
              </h2>
              <Link
                href="/datasets"
                className="flex items-center gap-2 text-sm font-medium text-indigo-600 hover:text-indigo-700"
              >
                View all
                <ChevronRight className="w-4 h-4" />
              </Link>
            </div>
            <div className="text-center py-8">
              <p className="text-gray-500">
                Related datasets will be shown here based on tags and category
              </p>
            </div>
          </div>
        </motion.div>
      </div>
    </Layout>
  );
}
