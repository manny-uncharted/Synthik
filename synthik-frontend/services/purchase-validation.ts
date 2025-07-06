import { ethers } from 'ethers';
import DatasetMarketplaceABI from '../abis/DatasetMarketplace.json';
import DatasetRegistryABI from '../abis/DatasetRegistry.json';

export interface PurchaseValidationResult {
  isValid: boolean;
  purchaseDetails?: {
    buyer: string;
    datasetId: string;
    price: string;
    timestamp: number;
    transactionHash: string;
    licenseType: string;
    expiresAt: number;
  };
  error?: string;
}

export interface License {
  datasetId: string;
  licensee: string;
  purchasedAt: number;
  expiresAt: number;
  licenseType: number;
  pricePaid: string;
  usageTerms: string;
}

export class PurchaseValidationService {
  private provider: ethers.Provider;
  private marketplaceContract: ethers.Contract;
  private registryContract?: ethers.Contract;

  constructor(
    provider: ethers.Provider,
    marketplaceAddress: string,
    registryAddress?: string
  ) {
    this.provider = provider;
    this.marketplaceContract = new ethers.Contract(
      marketplaceAddress,
      DatasetMarketplaceABI.abi,
      provider
    );

    if (registryAddress) {
      this.registryContract = new ethers.Contract(
        registryAddress,
        DatasetRegistryABI.abi,
        provider
      );
    }
  }

  /**
   * Method 1: Validate using marketplace hasValidLicense (RECOMMENDED)
   * This is the most direct and gas-efficient method
   */
  async validatePurchaseByLicense(
    userAddress: string,
    datasetId: string
  ): Promise<PurchaseValidationResult> {
    try {
      console.log('🔍 Purchase Validation Debug:');
      console.log('- User address:', userAddress);
      console.log('- Dataset ID:', datasetId);
      console.log('- Marketplace contract:', this.marketplaceContract.target);

      // Use your contract's hasValidLicense method
      const hasLicense = await this.marketplaceContract.hasValidLicense(
        datasetId,
        userAddress
      );

      console.log('- Has valid license:', hasLicense);

      if (!hasLicense) {
        // Let's also check what licenses the user actually has
        try {
          const userLicenses = await this.marketplaceContract.getUserLicenses(
            userAddress
          );
          console.log('- User licenses count:', userLicenses.length);
          console.log(
            '- User licenses:',
            userLicenses.map((l: License) => ({
              datasetId: l.datasetId,
              licensee: l.licensee,
              licenseType: l.licenseType,
            }))
          );
        } catch (licenseError) {
          console.log('- Error getting user licenses:', licenseError);
        }

        return {
          isValid: false,
          error: `User does not have a valid license for dataset: ${datasetId}`,
        };
      }

      // Get detailed license information
      const userLicenses: License[] =
        await this.marketplaceContract.getUserLicenses(userAddress);

      // Find the specific license for this dataset
      const datasetLicense = userLicenses.find(
        (license) => license.datasetId === datasetId
      );

      if (!datasetLicense) {
        return {
          isValid: false,
          error: 'License found but details not available',
        };
      }

      return {
        isValid: true,
        purchaseDetails: {
          buyer: userAddress,
          datasetId: datasetId,
          price: datasetLicense.pricePaid.toString(),
          timestamp: datasetLicense.purchasedAt,
          transactionHash: '', // Not stored in license struct
          licenseType: this.getLicenseTypeName(datasetLicense.licenseType),
          expiresAt: datasetLicense.expiresAt,
        },
      };
    } catch (error) {
      return {
        isValid: false,
        error: `License validation failed: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      };
    }
  }

  /**
   * Method 2: Validate using registry checkAccess
   * This includes marketplace purchases + manual access grants
   */
  async validateAccessByRegistry(
    userAddress: string,
    datasetId: string
  ): Promise<PurchaseValidationResult> {
    if (!this.registryContract) {
      return {
        isValid: false,
        error: 'Registry contract not configured',
      };
    }

    try {
      // Use your registry's checkAccess method
      const hasAccess = await this.registryContract.checkAccess(
        datasetId,
        userAddress
      );

      if (!hasAccess) {
        return {
          isValid: false,
          error: 'User does not have access to this dataset',
        };
      }

      // Get access expiry
      const accessExpiry = await this.registryContract.getAccessExpiry(
        datasetId,
        userAddress
      );

      return {
        isValid: true,
        purchaseDetails: {
          buyer: userAddress,
          datasetId: datasetId,
          price: '0', // Not available in registry
          timestamp: 0, // Not available in registry
          transactionHash: '',
          licenseType: 'Access Grant',
          expiresAt:
            accessExpiry === ethers.MaxUint256 ? 0 : Number(accessExpiry),
        },
      };
    } catch (error) {
      return {
        isValid: false,
        error: `Registry validation failed: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      };
    }
  }

  /**
   * Method 3: Validate by transaction hash (using event logs)
   * Check if a specific transaction actually purchased the dataset
   */
  async validatePurchaseByTransaction(
    transactionHash: string,
    expectedBuyer: string,
    expectedDatasetId: string
  ): Promise<PurchaseValidationResult> {
    try {
      // Get transaction receipt
      const receipt = await this.provider.getTransactionReceipt(
        transactionHash
      );

      if (!receipt) {
        return {
          isValid: false,
          error: 'Transaction not found',
        };
      }

      // Check if transaction was successful
      if (receipt.status !== 1) {
        return {
          isValid: false,
          error: 'Transaction failed',
        };
      }

      // Parse logs to find DatasetPurchased event
      const contractInterface = new ethers.Interface(DatasetMarketplaceABI.abi);
      const purchaseEvents = receipt.logs
        .map((log) => {
          try {
            return contractInterface.parseLog(log);
          } catch {
            return null;
          }
        })
        .filter((event) => event && event.name === 'DatasetPurchased');

      if (purchaseEvents.length === 0) {
        return {
          isValid: false,
          error: 'No purchase event found in transaction',
        };
      }

      const purchaseEvent = purchaseEvents[0];

      if (!purchaseEvent) {
        return {
          isValid: false,
          error: 'Failed to parse purchase event',
        };
      }

      // Validate buyer and dataset from event
      if (
        purchaseEvent.args.buyer.toLowerCase() !== expectedBuyer.toLowerCase()
      ) {
        return {
          isValid: false,
          error: 'Transaction buyer does not match expected buyer',
        };
      }

      if (purchaseEvent.args.datasetId !== expectedDatasetId) {
        return {
          isValid: false,
          error: 'Transaction dataset does not match expected dataset',
        };
      }

      // Get block timestamp
      const block = await this.provider.getBlock(receipt.blockNumber);

      return {
        isValid: true,
        purchaseDetails: {
          buyer: purchaseEvent.args.buyer,
          datasetId: purchaseEvent.args.datasetId,
          price: purchaseEvent.args.amount.toString(),
          timestamp: block ? block.timestamp : 0,
          transactionHash: transactionHash,
          licenseType: this.getLicenseTypeName(purchaseEvent.args.licenseType),
          expiresAt: 0, // Permanent licenses
        },
      };
    } catch (error) {
      return {
        isValid: false,
        error: `Transaction validation failed: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      };
    }
  }

  /**
   * Helper method to validate any type of purchase proof
   * Tries multiple validation methods for robustness
   */
  async validatePurchase(proof: {
    type: 'license' | 'registry' | 'transaction';
    userAddress: string;
    datasetId: string;
    transactionHash?: string;
  }): Promise<PurchaseValidationResult> {
    switch (proof.type) {
      case 'license':
        return this.validatePurchaseByLicense(
          proof.userAddress,
          proof.datasetId
        );

      case 'registry':
        return this.validateAccessByRegistry(
          proof.userAddress,
          proof.datasetId
        );

      case 'transaction':
        if (!proof.transactionHash) {
          return { isValid: false, error: 'Transaction hash required' };
        }
        return this.validatePurchaseByTransaction(
          proof.transactionHash,
          proof.userAddress,
          proof.datasetId
        );

      default:
        return { isValid: false, error: 'Unknown proof type' };
    }
  }

  /**
   * Comprehensive validation - tries multiple methods
   */
  async validatePurchaseComprehensive(
    userAddress: string,
    datasetId: string,
    transactionHash?: string
  ): Promise<PurchaseValidationResult> {
    // Try license validation first (most accurate for purchases)
    let result = await this.validatePurchaseByLicense(userAddress, datasetId);

    if (result.isValid) {
      return result;
    }

    // Try registry validation (includes other access grants)
    if (this.registryContract) {
      result = await this.validateAccessByRegistry(userAddress, datasetId);

      if (result.isValid) {
        return result;
      }
    }

    // Try transaction validation if hash provided
    if (transactionHash) {
      result = await this.validatePurchaseByTransaction(
        transactionHash,
        userAddress,
        datasetId
      );

      if (result.isValid) {
        return result;
      }
    }

    return {
      isValid: false,
      error: 'Purchase validation failed on all methods',
    };
  }

  /**
   * Helper to convert license type enum to string
   */
  private getLicenseTypeName(licenseType: number): string {
    const types = [
      'PERSONAL',
      'COMMERCIAL',
      'ACADEMIC',
      'ENTERPRISE',
      'CUSTOM',
    ];
    return types[licenseType] || 'UNKNOWN';
  }

  /**
   * Get all user licenses for debugging/admin purposes
   */
  async getUserLicenses(userAddress: string): Promise<License[]> {
    try {
      return await this.marketplaceContract.getUserLicenses(userAddress);
    } catch (error) {
      console.error('Failed to get user licenses:', error);
      return [];
    }
  }

  /**
   * Get all licenses for a specific dataset
   */
  async getDatasetLicenses(datasetId: string): Promise<License[]> {
    try {
      return await this.marketplaceContract.getDatasetLicenses(datasetId);
    } catch (error) {
      console.error('Failed to get dataset licenses:', error);
      return [];
    }
  }
}

// Export factory function for easy use
export const createPurchaseValidator = (
  provider: ethers.Provider,
  marketplaceAddress: string,
  registryAddress?: string
) => {
  return new PurchaseValidationService(
    provider,
    marketplaceAddress,
    registryAddress
  );
};
