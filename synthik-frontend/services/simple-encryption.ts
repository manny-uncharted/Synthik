import { ethers } from 'ethers';
import { createPurchaseValidator } from './purchase-validation';

export interface SimpleEncryptionConfig {
  visibility: 'public' | 'private' | 'restricted';
  creatorAddress: string;
  datasetId: string;
  marketplaceContract?: string;
  accessPassword?: string; // For restricted datasets
}

export interface SimpleEncryptionResult {
  encryptedData: string;
  encryptionMethod: string;
  keyHint: string; // Hint for how to derive the key
  accessRules: {
    visibility: string;
    creatorAddress: string;
    datasetId: string;
    marketplaceContract?: string;
  };
}

export class SimpleEncryptionService {
  /**
   * Encrypt dataset based on visibility rules
   */
  async encryptDataset(
    data: string,
    config: SimpleEncryptionConfig,
    signer?: ethers.Signer
  ): Promise<SimpleEncryptionResult> {
    let encryptionKey: string;
    let keyHint: string;

    switch (config.visibility) {
      case 'public':
        // For public datasets, use a key that can be derived after purchase
        // The marketplace contract will verify purchase before revealing how to derive key
        encryptionKey = await this.derivePublicKey(config);
        keyHint = 'derive-after-purchase';
        break;

      case 'private':
        // For private datasets, only creator can decrypt using their wallet
        if (!signer) {
          throw new Error('Signer required for private dataset encryption');
        }
        encryptionKey = await this.derivePrivateKey(config, signer);
        keyHint = 'creator-wallet-signature';
        break;

      case 'restricted':
        // For restricted datasets, use creator-defined password
        encryptionKey =
          config.accessPassword ||
          (await this.derivePrivateKey(config, signer!));
        keyHint = config.accessPassword
          ? 'custom-password'
          : 'creator-wallet-signature';
        break;

      default:
        throw new Error(`Unsupported visibility: ${config.visibility}`);
    }

    // Encrypt the data using AES
    const encryptedData = await this.encryptWithAES(data, encryptionKey);

    return {
      encryptedData,
      encryptionMethod: 'AES-256-GCM',
      keyHint,
      accessRules: {
        visibility: config.visibility,
        creatorAddress: config.creatorAddress,
        datasetId: config.datasetId,
        marketplaceContract: config.marketplaceContract,
      },
    };
  }

  /**
   * Decrypt dataset content with proper purchase validation using your smart contracts
   */
  async decryptDataset(
    params: SimpleEncryptionResult,
    signer?: ethers.Signer,
    purchaseProof?: string,
    accessPassword?: string,
    marketplaceAddress?: string,
    registryAddress?: string
  ): Promise<string> {
    let decryptionKey: string;

    switch (params.accessRules.visibility) {
      case 'public':
        // Validate purchase using your smart contract methods
        if (!signer || !marketplaceAddress) {
          throw new Error(
            'Signer and marketplace address required for public dataset'
          );
        }

        const userAddress = await signer.getAddress();
        const validator = createPurchaseValidator(
          signer.provider!,
          marketplaceAddress,
          registryAddress
        );

        // Use your contract's hasValidLicense method (most reliable)
        let validationResult = await validator.validatePurchaseByLicense(
          userAddress,
          params.accessRules.datasetId
        );

        // If license validation fails, try registry access validation
        if (!validationResult.isValid && registryAddress) {
          validationResult = await validator.validateAccessByRegistry(
            userAddress,
            params.accessRules.datasetId
          );
        }

        // If both fail and we have a transaction hash, try transaction validation
        if (!validationResult.isValid && purchaseProof) {
          validationResult = await validator.validatePurchaseByTransaction(
            purchaseProof,
            userAddress,
            params.accessRules.datasetId
          );
        }

        if (!validationResult.isValid) {
          throw new Error(
            `Purchase validation failed: ${validationResult.error}`
          );
        }

        console.log(
          '✅ Purchase validated using smart contract:',
          validationResult.purchaseDetails
        );

        // Use the actual marketplace datasetId for key derivation
        const actualDatasetId = validationResult.purchaseDetails?.datasetId;
        console.log(
          '🔑 Marketplace datasetId for decryption:',
          actualDatasetId
        );

        decryptionKey = await this.derivePublicKeyFromPurchase(
          params.accessRules,
          purchaseProof || 'validated-purchase',
          actualDatasetId
        );
        break;

      case 'private':
        // Only creator can decrypt
        if (!signer) {
          throw new Error('Signer required for private dataset decryption');
        }
        const signerAddress = await signer.getAddress();
        if (
          signerAddress.toLowerCase() !==
          params.accessRules.creatorAddress.toLowerCase()
        ) {
          throw new Error('Only dataset creator can decrypt private dataset');
        }
        decryptionKey = await this.derivePrivateKey(params.accessRules, signer);
        break;

      case 'restricted':
        // Use provided password or creator wallet
        if (params.keyHint === 'custom-password') {
          if (!accessPassword) {
            throw new Error('Access password required for restricted dataset');
          }
          decryptionKey = accessPassword;
        } else {
          // Fallback to creator wallet signature
          if (!signer) {
            throw new Error(
              'Signer required for restricted dataset decryption'
            );
          }
          decryptionKey = await this.derivePrivateKey(
            params.accessRules,
            signer
          );
        }
        break;

      default:
        throw new Error(
          `Unsupported visibility: ${params.accessRules.visibility}`
        );
    }

    return await this.decryptWithAES(params.encryptedData, decryptionKey);
  }

  /**
   * Derive encryption key for public datasets
   */
  private async derivePublicKey(
    config: SimpleEncryptionConfig
  ): Promise<string> {
    // Create a deterministic key that can be derived after purchase
    const keyMaterial = `${config.creatorAddress}-${config.datasetId}-${config.marketplaceContract}`;
    return await this.hashString(keyMaterial);
  }

  /**
   * Derive encryption key from purchase proof
   */
  private async derivePublicKeyFromPurchase(
    accessRules: SimpleEncryptionResult['accessRules'],
    purchaseProof: string,
    actualDatasetId?: string
  ): Promise<string> {
    // Verify purchase proof (transaction hash, receipt, etc.)
    // TODO: Add actual purchase verification logic using purchaseProof
    console.log('Verifying purchase proof:', purchaseProof);

    // Use the actual marketplace datasetId if provided, otherwise use the one from encryption
    const datasetIdForKey = actualDatasetId || accessRules.datasetId;
    console.log('🔑 Using datasetId for key derivation:', datasetIdForKey);

    // Derive the key using the marketplace-registered datasetId
    const keyMaterial = `${accessRules.creatorAddress}-${datasetIdForKey}-${accessRules.marketplaceContract}`;
    return await this.hashString(keyMaterial);
  }

  /**
   * Derive encryption key from wallet signature
   */
  private async derivePrivateKey(
    config: SimpleEncryptionConfig | SimpleEncryptionResult['accessRules'],
    signer: ethers.Signer
  ): Promise<string> {
    const message = `Synthik Dataset Encryption Key: ${config.datasetId}`;
    const signature = await signer.signMessage(message);
    return await this.hashString(signature);
  }

  /**
   * Encrypt string using AES-256-GCM
   */
  private async encryptWithAES(data: string, key: string): Promise<string> {
    // Use Web Crypto API for encryption
    const keyData = new TextEncoder().encode(key.slice(0, 32).padEnd(32, '0'));
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'AES-GCM' },
      false,
      ['encrypt']
    );

    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encodedData = new TextEncoder().encode(data);

    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      cryptoKey,
      encodedData
    );

    // Combine IV and ciphertext
    const combined = new Uint8Array(iv.length + ciphertext.byteLength);
    combined.set(iv);
    combined.set(new Uint8Array(ciphertext), iv.length);

    // Return as base64
    return btoa(String.fromCharCode(...combined));
  }

  /**
   * Decrypt string using AES-256-GCM
   */
  private async decryptWithAES(
    encryptedData: string,
    key: string
  ): Promise<string> {
    try {
      // Decode from base64
      const combined = new Uint8Array(
        atob(encryptedData)
          .split('')
          .map((c) => c.charCodeAt(0))
      );

      // Extract IV and ciphertext
      const iv = combined.slice(0, 12);
      const ciphertext = combined.slice(12);

      // Import key
      const keyData = new TextEncoder().encode(
        key.slice(0, 32).padEnd(32, '0')
      );
      const cryptoKey = await crypto.subtle.importKey(
        'raw',
        keyData,
        { name: 'AES-GCM' },
        false,
        ['decrypt']
      );

      // Decrypt
      const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        cryptoKey,
        ciphertext
      );

      return new TextDecoder().decode(decrypted);
    } catch (error) {
      throw new Error(
        `Decryption failed: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
    }
  }

  /**
   * Hash string using SHA-256
   */
  private async hashString(input: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(input);
    const hash = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hash))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  /**
   * Check if user can decrypt dataset (without actually decrypting)
   */
  async canDecrypt(
    encryptedResult: SimpleEncryptionResult,
    userAddress?: string,
    hasPurchased?: boolean
  ): Promise<boolean> {
    switch (encryptedResult.accessRules.visibility) {
      case 'public':
        return hasPurchased || false;
      case 'private':
        return (
          userAddress?.toLowerCase() ===
          encryptedResult.accessRules.creatorAddress.toLowerCase()
        );
      case 'restricted':
        // For restricted, we can't determine without trying to decrypt
        return true;
      default:
        return false;
    }
  }
}

// Export singleton instance
export const simpleEncryption = new SimpleEncryptionService();
