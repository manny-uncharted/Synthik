/**
 * Synthik SDK - Main Entry Point
 *
 * A powerful SDK for interacting with the Synthik synthetic data platform
 * on Filecoin blockchain.
 */

import { EventEmitter } from 'events';
import {
  SynthikConfig,
  Dataset,
  DatasetConfig,
  TransformationConfig,
  AnonymizationConfig,
  MarketplaceListing,
  PurchaseRequest,
  AccessRequest,
  DatasetLineage,
  QualityMetrics,
  ProgressCallback,
  GenerationType,
  DatasetStatus,
  QualityLevel,
  PrivacyLevel,
  TransformationRule,
  AnonymizationRule,
  SchemaField,
  GenerationModel,
  GenerationRequest,
} from './types';
import { DatasetClient } from './clients/dataset';
import { MarketplaceClient } from './clients/marketplace';
import { StorageService } from './services/storage';
import { NETWORKS } from './utils/constants';
import {
  formatFileSize,
  formatTxHash,
  basisPointsToPercentage,
} from './utils/helpers';

/**
 * Main Synthik SDK Client
 *
 * @example
 * ```typescript
 * import { Synthik } from '@synthik/sdk';
 *
 * const synthik = new Synthik({
 *   privateKey: 'YOUR_PRIVATE_KEY',
 *   network: 'calibration'
 * });
 *
 * // Create a dataset
 * const dataset = await synthik.datasets.create({
 *   name: 'My Dataset',
 *   description: 'Sample dataset',
 *   license: 'MIT',
 *   rows: 1000,
 *   schema: [...]
 * }, data);
 * ```
 */
export class Synthik extends EventEmitter {
  public readonly datasets: DatasetClient;
  public readonly marketplace: MarketplaceClient;
  public readonly storage: StorageService;

  private config: SynthikConfig;

  constructor(config: SynthikConfig) {
    super();

    // Validate config
    if (!config.privateKey) {
      throw new Error('Private key is required');
    }

    this.config = config;

    // Initialize clients
    this.datasets = new DatasetClient(config);
    this.marketplace = new MarketplaceClient(config);
    this.storage = new StorageService(config.storage?.provider || 'mock', {
      endpoint: config.storage?.endpoint,
      token: config.storage?.token,
    });

    // Forward events from clients
    this.forwardEvents();
  }

  /**
   * Get current wallet address
   */
  async getAddress(): Promise<string> {
    return this.datasets.getAddress();
  }

  /**
   * Get wallet balance in FIL
   */
  async getBalance(): Promise<{
    wei: bigint;
    fil: string;
  }> {
    const balanceWei = await this.datasets.getBalance();
    const balanceFil = (Number(balanceWei) / 1e18).toFixed(4);

    return {
      wei: balanceWei,
      fil: balanceFil,
    };
  }

  /**
   * Get available AI models for dataset generation
   */
  getAvailableModels(): GenerationModel[] {
    return this.datasets.getAvailableModels();
  }

  /**
   * Generate a new dataset using AI
   */
  async generateDataset(
    config: DatasetConfig,
    model: GenerationModel,
    options?: {
      onProgress?: ProgressCallback;
    }
  ): Promise<Dataset> {
    return this.datasets.generateDataset(config, model, options);
  }

  /**
   * Generate a preview of a dataset (10 rows)
   */
  async generatePreview(
    config: DatasetConfig,
    model: GenerationModel
  ): Promise<any[]> {
    return this.datasets.generatePreview(config, model);
  }

  /**
   * Quick dataset creation with minimal config
   */
  async createDataset(
    name: string,
    data: any[],
    options?: {
      description?: string;
      license?: string;
      onProgress?: ProgressCallback;
    }
  ): Promise<Dataset> {
    // Auto-generate schema from data
    const schema = this.generateSchemaFromData(data);

    const config: DatasetConfig = {
      name,
      description: options?.description || `Dataset ${name}`,
      license: options?.license || 'MIT',
      rows: data.length,
      schema,
    };

    return this.datasets.createDataset(data, config, {
      onProgress: options?.onProgress,
    });
  }

  /**
   * Transform a dataset with simple API
   */
  async transformDataset(
    datasetId: string,
    rules: TransformationRule[],
    options?: {
      preserveOriginal?: boolean;
      onProgress?: ProgressCallback;
    }
  ): Promise<Dataset> {
    const config: TransformationConfig = {
      rules,
      preserveOriginal: options?.preserveOriginal || false,
    };

    return this.datasets.transformDataset(datasetId, config, {
      onProgress: options?.onProgress,
    });
  }

  /**
   * Anonymize a dataset with privacy presets
   */
  async anonymizeDataset(
    datasetId: string,
    privacyLevel: PrivacyLevel = PrivacyLevel.MEDIUM,
    options?: {
      customRules?: AnonymizationRule[];
      compliance?: string[];
      onProgress?: ProgressCallback;
    }
  ): Promise<Dataset> {
    // Auto-detect PII fields and create rules based on privacy level
    const dataset = await this.datasets.getDataset(datasetId);
    if (!dataset) {
      throw new Error('Dataset not found');
    }

    // Download metadata to analyze fields
    const metadata = await this.storage.downloadJSON(dataset.metadataCid);
    const rules =
      options?.customRules ||
      this.generateAnonymizationRules(metadata.schema, privacyLevel);

    const config: AnonymizationConfig = {
      rules,
      privacyLevel,
      compliance: options?.compliance || ['GDPR'],
      preserveFormat: true,
    };

    return this.datasets.anonymizeDataset(datasetId, config, {
      onProgress: options?.onProgress,
    });
  }

  /**
   * List dataset for sale with simple API
   */
  async sellDataset(
    datasetId: string,
    pricePerRowInFil: number,
    options?: {
      minimumRows?: number;
      maximumRows?: number;
      sampleRows?: number;
    }
  ): Promise<void> {
    // Convert FIL to wei
    const pricePerRowWei = BigInt(Math.floor(pricePerRowInFil * 1e18));

    // Generate sample if requested
    let sampleData;
    if (options?.sampleRows) {
      const dataset = await this.datasets.getDataset(datasetId);
      if (dataset) {
        const allData = await this.storage.downloadJSON(dataset.dataCid);
        sampleData = allData.slice(0, options.sampleRows);
      }
    }

    const result = await this.marketplace.listDataset(
      datasetId,
      pricePerRowWei,
      {
        minimumRows: options?.minimumRows,
        maximumRows: options?.maximumRows,
        sampleData,
      }
    );

    if (!result.success) {
      throw result.error || new Error('Failed to list dataset');
    }
  }

  /**
   * Buy dataset rows with simple API
   */
  async buyDataset(
    datasetId: string,
    rowCount: number
  ): Promise<{
    purchaseId: string;
    totalCostFil: string;
    txHash: string;
  }> {
    const result = await this.marketplace.purchaseDataset({
      datasetId,
      rowCount,
      payment: 0n, // Will be calculated by the client
    });

    if (!result.success) {
      throw result.error || new Error('Failed to purchase dataset');
    }

    // Get the listing to calculate cost
    const listing = await this.marketplace.getListing(datasetId);
    const totalCostWei = listing!.pricePerRow * BigInt(rowCount);
    const totalCostFil = (Number(totalCostWei) / 1e18).toFixed(4);

    return {
      purchaseId: result.purchaseId!,
      totalCostFil,
      txHash: result.txHash!,
    };
  }

  /**
   * Get dataset with full details
   */
  async getDataset(datasetId: string): Promise<{
    dataset: Dataset;
    lineage: DatasetLineage;
    listing?: MarketplaceListing;
  }> {
    const [dataset, lineage, listing] = await Promise.all([
      this.datasets.getDataset(datasetId),
      this.datasets.getDatasetLineage(datasetId),
      this.marketplace.getListing(datasetId),
    ]);

    if (!dataset) {
      throw new Error('Dataset not found');
    }

    return {
      dataset,
      lineage,
      listing: listing || undefined,
    };
  }

  /**
   * Generate schema from data automatically
   */
  private generateSchemaFromData(data: any[]): SchemaField[] {
    if (data.length === 0) {
      throw new Error('Cannot generate schema from empty data');
    }

    const schema: SchemaField[] = [];
    const sample = data[0];

    for (const [key, value] of Object.entries(sample)) {
      let type: SchemaField['type'] = 'string';

      if (typeof value === 'number') {
        type = 'number';
      } else if (typeof value === 'boolean') {
        type = 'boolean';
      } else if (value instanceof Date) {
        type = 'date';
      } else if (Array.isArray(value)) {
        type = 'array';
      } else if (typeof value === 'object' && value !== null) {
        type = 'object';
      }

      schema.push({
        name: key,
        type,
        description: `Auto-generated field for ${key}`,
      });
    }

    return schema;
  }

  /**
   * Generate anonymization rules based on privacy level
   */
  private generateAnonymizationRules(
    schema: SchemaField[],
    privacyLevel: PrivacyLevel
  ): AnonymizationRule[] {
    const rules: AnonymizationRule[] = [];

    // Common PII patterns
    const piiPatterns = {
      email: /email|mail/i,
      phone: /phone|mobile|cell/i,
      name: /name|firstname|lastname|surname/i,
      address: /address|street|city|zip|postal/i,
      ssn: /ssn|social/i,
      credit: /credit|card/i,
      id: /\bid\b|identifier|passport|license/i,
    };

    for (const field of schema) {
      let method: AnonymizationRule['method'] | null = null;

      // Check if field name matches PII patterns
      for (const [type, pattern] of Object.entries(piiPatterns)) {
        if (pattern.test(field.name)) {
          switch (privacyLevel) {
            case PrivacyLevel.LOW:
              method = 'mask';
              break;
            case PrivacyLevel.MEDIUM:
              method = type === 'email' || type === 'phone' ? 'hash' : 'fake';
              break;
            case PrivacyLevel.HIGH:
              method = type === 'id' ? 'hash' : 'remove';
              break;
          }
          break;
        }
      }

      if (method) {
        rules.push({
          field: field.name,
          method,
        });
      }
    }

    return rules;
  }

  /**
   * Forward events from child clients
   */
  private forwardEvents(): void {
    const clients = [this.datasets, this.marketplace];
    const events = [
      'datasetCreated',
      'datasetTransformed',
      'datasetAnonymized',
      'datasetPurchased',
      'revenueWithdrawn',
      'transaction',
      'error',
    ];

    for (const client of clients) {
      for (const event of events) {
        client.on(event, (data) => {
          this.emit(event, data);
        });
      }
    }
  }

  /**
   * Disconnect and cleanup
   */
  async disconnect(): Promise<void> {
    await Promise.all([
      this.datasets.disconnect(),
      this.marketplace.disconnect(),
    ]);
    this.removeAllListeners();
  }
}

// Export everything from types
export * from './types';

// Export utilities
export {
  formatFileSize,
  formatTxHash,
  basisPointsToPercentage,
} from './utils/helpers';

export { NETWORKS } from './utils/constants';

// Export individual clients for advanced usage
export { DatasetClient } from './clients/dataset';
export { MarketplaceClient } from './clients/marketplace';
export { StorageService } from './services/storage';

// Default export
export default Synthik;
