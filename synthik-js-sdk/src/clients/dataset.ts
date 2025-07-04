/**
 * Dataset client for managing datasets, transformations, and anonymization
 */

import { BaseClient } from './base';
import { StorageService } from '../services/storage';
import { DatasetGenerationService } from '../services/generation';
import {
  Dataset,
  DatasetConfig,
  GenerationType,
  DatasetStatus,
  QualityLevel,
  TransformationConfig,
  AnonymizationConfig,
  TransformationRule,
  AnonymizationRule,
  SchemaField,
  QualityMetrics,
  DatasetLineage,
  TransactionResult,
  CID,
  ProgressCallback,
  GenerationModel,
  GenerationRequest,
} from '../types';
import {
  generateDatasetId,
  validateDatasetConfig,
  calculateQualityLevel,
  estimateDatasetSize,
  basisPointsToPercentage,
} from '../utils/helpers';

export class DatasetClient extends BaseClient {
  private storage: StorageService;
  private generationService: DatasetGenerationService;

  constructor(config: any) {
    super(config);

    // Initialize storage service
    this.storage = new StorageService(config.storage?.provider || 'mock', {
      endpoint: config.storage?.endpoint,
      token: config.storage?.token,
    });

    // Initialize generation service with API keys
    this.generationService = new DatasetGenerationService({
      openai: config.apiKeys?.openai,
      google: config.apiKeys?.google,
    });
  }

  /**
   * Get available generation models
   */
  getAvailableModels(): GenerationModel[] {
    return this.generationService.getAvailableModels();
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
    // Validate configuration
    const validation = validateDatasetConfig(config);
    if (!validation.valid) {
      throw new Error(
        `Invalid dataset config: ${validation.errors.join(', ')}`
      );
    }

    // Generate the data using AI
    options?.onProgress?.(5, `Generating data using ${model.name}...`);

    const request: GenerationRequest = {
      model,
      config,
      streamCallback: (progress) => {
        options?.onProgress?.(
          5 + progress * 0.7,
          `Generating data... ${Math.round(progress)}%`
        );
      },
    };

    const response = await this.generationService.generateDataset(request);
    const generatedData = response.data;

    // Create dataset with generated data
    options?.onProgress?.(80, 'Creating dataset on blockchain...');
    const dataset = await this.createDataset(generatedData, config, {
      modelId: model.id,
      modelVersion: model.name,
      onProgress: (progress, message) => {
        options?.onProgress?.(80 + progress * 0.2, message);
      },
    });

    // Emit generation event
    this.emit('datasetGenerated', {
      dataset,
      model,
      generationCost: response.metadata.cost,
      generationTime: response.metadata.generationTime,
    });

    return dataset;
  }

  /**
   * Generate a preview of a dataset
   */
  async generatePreview(
    config: DatasetConfig,
    model: GenerationModel
  ): Promise<any[]> {
    const previewConfig = { ...config, rows: Math.min(10, config.rows) };
    return this.generationService.generatePreview(previewConfig, model);
  }

  /**
   * Export generated data in different formats
   */
  exportData(data: any[], format: 'json' | 'csv'): Blob {
    return this.generationService.exportData(data, format);
  }

  /**
   * Create a new dataset from existing data
   */
  async createDataset(
    data: any[],
    config: DatasetConfig,
    options?: {
      modelId?: string;
      modelVersion?: string;
      onProgress?: ProgressCallback;
    }
  ): Promise<Dataset> {
    // Validate configuration
    const validation = validateDatasetConfig(config);
    if (!validation.valid) {
      throw new Error(
        `Invalid dataset config: ${validation.errors.join(', ')}`
      );
    }

    // Generate dataset ID
    const datasetId = generateDatasetId('ds');

    // Upload data and metadata to storage
    options?.onProgress?.(10, 'Uploading data to storage...');
    const { dataCid, metadataCid } = await this.storage.uploadDataset(
      data,
      config.schema,
      {
        name: config.name,
        description: config.description,
        license: config.license,
        format: config.format || 'json',
        quality: config.quality || 'balanced',
        visibility: config.visibility || 'public',
        tags: config.tags || [],
      }
    );

    // Prepare quality metrics
    const qualityMetrics = this.calculateDatasetQuality(data, config.schema);
    const qualityLevel = calculateQualityLevel(qualityMetrics.average);

    // Register on blockchain
    options?.onProgress?.(50, 'Registering dataset on blockchain...');
    const contract = this.ensureContract('provenanceManager');

    const result = await this.executeTransaction(contract.createDataset, [
      datasetId,
      dataCid,
      metadataCid,
      config.name,
      config.description,
      config.license,
      GenerationType.SCRATCH,
      options?.modelId || '',
      options?.modelVersion || '',
      data.length, // rowCount
      Date.now(), // generationTime (milliseconds)
      estimateDatasetSize(config.schema, data.length), // totalSize
    ]);

    if (!result.success) {
      throw result.error || new Error('Failed to create dataset');
    }

    options?.onProgress?.(100, 'Dataset created successfully!');

    // Return dataset object
    const dataset: Dataset = {
      id: datasetId,
      dataCid,
      metadataCid,
      creator: await this.getAddress(),
      createdAt: new Date(),
      updatedAt: new Date(),
      name: config.name,
      description: config.description,
      license: config.license,
      status: DatasetStatus.READY,
      quality: qualityLevel,
      totalRows: data.length,
      totalSize: estimateDatasetSize(config.schema, data.length),
      isVerified: false,
      generationType: GenerationType.SCRATCH,
      modelId: options?.modelId,
      modelVersion: options?.modelVersion,
    };

    // Emit event
    this.emit('datasetCreated', dataset);

    return dataset;
  }

  /**
   * Transform an existing dataset
   */
  async transformDataset(
    originalDatasetId: string,
    transformationConfig: TransformationConfig,
    options?: {
      onProgress?: ProgressCallback;
    }
  ): Promise<Dataset> {
    // Fetch original dataset
    options?.onProgress?.(5, 'Fetching original dataset...');
    const originalDataset = await this.getDataset(originalDatasetId);
    if (!originalDataset) {
      throw new Error(`Dataset ${originalDatasetId} not found`);
    }

    // Download original data
    options?.onProgress?.(15, 'Downloading original data...');
    const originalData = await this.storage.downloadJSON(
      originalDataset.dataCid
    );

    // Apply transformations
    options?.onProgress?.(30, 'Applying transformations...');
    const { transformedData, newSchema } = await this.applyTransformations(
      originalData,
      transformationConfig
    );

    // Generate new dataset ID
    const newDatasetId = generateDatasetId('transformed');

    // Upload transformed data
    options?.onProgress?.(60, 'Uploading transformed data...');
    const { dataCid, metadataCid } = await this.storage.uploadDataset(
      transformedData,
      newSchema,
      {
        originalDatasetId,
        transformationType: 'custom',
        transformationRules: transformationConfig.rules,
        preserveOriginal: transformationConfig.preserveOriginal,
      }
    );

    // Calculate quality metrics
    const qualityMetrics = this.calculateDatasetQuality(
      transformedData,
      newSchema
    );
    const qualityLevel = calculateQualityLevel(qualityMetrics.average);

    // Create transformation config CID
    const transformConfigCid =
      await this.storage.uploadJSON(transformationConfig);

    // Register transformed dataset
    options?.onProgress?.(80, 'Registering transformed dataset...');
    const contract = this.ensureContract('provenanceManager');

    // Create the dataset
    let result = await this.executeTransaction(contract.createDataset, [
      newDatasetId,
      dataCid,
      metadataCid,
      `${originalDataset.name} (Transformed)`,
      `Transformed version of ${originalDataset.name}`,
      originalDataset.license,
      GenerationType.TRANSFORM,
      '',
      '',
      transformedData.length, // rowCount
      Date.now(), // generationTime
      estimateDatasetSize(newSchema, transformedData.length), // totalSize
    ]);

    if (!result.success) {
      throw result.error || new Error('Failed to create transformed dataset');
    }

    // Link lineage
    options?.onProgress?.(90, 'Linking dataset lineage...');
    result = await this.executeTransaction(contract.linkDatasetLineage, [
      newDatasetId,
      [originalDatasetId],
    ]);

    if (!result.success) {
      console.warn('Failed to link lineage:', result.error);
    }

    options?.onProgress?.(100, 'Transformation complete!');

    // Return new dataset
    const dataset: Dataset = {
      id: newDatasetId,
      dataCid,
      metadataCid,
      creator: await this.getAddress(),
      createdAt: new Date(),
      updatedAt: new Date(),
      name: `${originalDataset.name} (Transformed)`,
      description: `Transformed version of ${originalDataset.name}`,
      license: originalDataset.license,
      status: DatasetStatus.READY,
      quality: qualityLevel,
      totalRows: transformedData.length,
      totalSize: estimateDatasetSize(newSchema, transformedData.length),
      isVerified: false,
      generationType: GenerationType.TRANSFORM,
    };

    // Emit event
    this.emit('datasetTransformed', {
      originalDataset: originalDatasetId,
      newDataset: dataset,
      transformationConfig,
    });

    return dataset;
  }

  /**
   * Anonymize a dataset
   */
  async anonymizeDataset(
    originalDatasetId: string,
    anonymizationConfig: AnonymizationConfig,
    options?: {
      onProgress?: ProgressCallback;
    }
  ): Promise<Dataset> {
    // Fetch original dataset
    options?.onProgress?.(5, 'Fetching original dataset...');
    const originalDataset = await this.getDataset(originalDatasetId);
    if (!originalDataset) {
      throw new Error(`Dataset ${originalDatasetId} not found`);
    }

    // Download original data
    options?.onProgress?.(15, 'Downloading original data...');
    const originalData = await this.storage.downloadJSON(
      originalDataset.dataCid
    );
    const originalMetadata = await this.storage.downloadJSON(
      originalDataset.metadataCid
    );

    // Apply anonymization
    options?.onProgress?.(30, 'Applying anonymization...');
    const anonymizedData = await this.applyAnonymization(
      originalData,
      anonymizationConfig
    );

    // Generate new dataset ID
    const newDatasetId = generateDatasetId('anonymized');

    // Upload anonymized data
    options?.onProgress?.(60, 'Uploading anonymized data...');
    const { dataCid, metadataCid } = await this.storage.uploadDataset(
      anonymizedData,
      originalMetadata.schema,
      {
        originalDatasetId,
        anonymizationType: 'privacy-preserving',
        privacyLevel: anonymizationConfig.privacyLevel,
        compliance: anonymizationConfig.compliance || [],
        anonymizationRules: anonymizationConfig.rules.length,
      }
    );

    // Calculate quality metrics (may be slightly lower after anonymization)
    const qualityMetrics = this.calculateDatasetQuality(
      anonymizedData,
      originalMetadata.schema
    );
    const qualityLevel = calculateQualityLevel(qualityMetrics.average * 0.95); // Slight penalty

    // Create anonymization config CID
    const anonymConfigCid = await this.storage.uploadJSON({
      ...anonymizationConfig,
      // Don't store the actual seed in config for security
      seed: anonymizationConfig.seed ? '[REDACTED]' : undefined,
    });

    // Register anonymized dataset
    options?.onProgress?.(80, 'Registering anonymized dataset...');
    const contract = this.ensureContract('provenanceManager');

    // Create the dataset
    let result = await this.executeTransaction(contract.createDataset, [
      newDatasetId,
      dataCid,
      metadataCid,
      `${originalDataset.name} (Anonymized)`,
      `Privacy-preserving version of ${originalDataset.name}`,
      originalDataset.license,
      GenerationType.TRANSFORM,
      '',
      '',
      anonymizedData.length, // rowCount
      Date.now(), // generationTime
      estimateDatasetSize(originalMetadata.schema, anonymizedData.length), // totalSize
    ]);

    if (!result.success) {
      throw result.error || new Error('Failed to create anonymized dataset');
    }

    // Link lineage
    options?.onProgress?.(90, 'Linking dataset lineage...');
    result = await this.executeTransaction(contract.linkDatasetLineage, [
      newDatasetId,
      [originalDatasetId],
    ]);

    if (!result.success) {
      console.warn('Failed to link lineage:', result.error);
    }

    options?.onProgress?.(100, 'Anonymization complete!');

    // Return new dataset
    const dataset: Dataset = {
      id: newDatasetId,
      dataCid,
      metadataCid,
      creator: await this.getAddress(),
      createdAt: new Date(),
      updatedAt: new Date(),
      name: `${originalDataset.name} (Anonymized)`,
      description: `Privacy-preserving version of ${originalDataset.name}`,
      license: originalDataset.license,
      status: DatasetStatus.READY,
      quality: qualityLevel,
      totalRows: anonymizedData.length,
      totalSize: estimateDatasetSize(
        originalMetadata.schema,
        anonymizedData.length
      ),
      isVerified: false,
      generationType: GenerationType.TRANSFORM,
    };

    // Emit event
    this.emit('datasetAnonymized', {
      originalDataset: originalDatasetId,
      newDataset: dataset,
      privacyLevel: anonymizationConfig.privacyLevel,
    });

    return dataset;
  }

  /**
   * Get dataset by ID
   */
  async getDataset(datasetId: string): Promise<Dataset | null> {
    const contract = this.ensureContract('provenanceManager');

    try {
      const data = await contract.getDataset(datasetId);
      if (
        !data ||
        data.creator === '0x0000000000000000000000000000000000000000'
      ) {
        return null;
      }

      return {
        id: datasetId,
        dataCid: data.dataCid,
        metadataCid: data.metadataCid,
        creator: data.creator,
        createdAt: new Date(Number(data.createdAt) * 1000),
        updatedAt: new Date(Number(data.updatedAt) * 1000),
        name: data.name || 'Unnamed Dataset',
        description: data.description || '',
        license: data.license || 'Unknown',
        status: data.status,
        quality: data.quality,
        totalRows: Number(data.totalRows),
        totalSize: Number(data.totalSize),
        isVerified: data.isVerified,
        generationType: GenerationType.SCRATCH, // Default value
        modelId: undefined,
        modelVersion: undefined,
      };
    } catch (error) {
      console.error('Failed to get dataset:', error);
      return null;
    }
  }

  /**
   * Get dataset lineage
   */
  async getDatasetLineage(datasetId: string): Promise<DatasetLineage> {
    const contract = this.ensureContract('provenanceManager');

    try {
      const lineage = await contract.getDatasetLineage(datasetId);

      // Build transformation history
      const transformations: DatasetLineage['transformations'] = [];

      for (let i = 0; i < lineage.parents.length; i++) {
        const parent = lineage.parents[i];
        const transformCid = lineage.transformationCids?.[i];

        if (transformCid) {
          // Try to download transformation config
          try {
            const config = await this.storage.downloadJSON(transformCid);
            transformations.push({
              fromDataset: parent,
              toDataset: datasetId,
              transformationType: config.type || 'unknown',
              timestamp: new Date(), // Would need to get from blockchain events
            });
          } catch {
            // If download fails, use basic info
            transformations.push({
              fromDataset: parent,
              toDataset: datasetId,
              transformationType: 'unknown',
              timestamp: new Date(),
            });
          }
        }
      }

      return {
        datasetId,
        parents: lineage.parents || [],
        children: lineage.children || [],
        transformations,
      };
    } catch (error) {
      console.error('Failed to get lineage:', error);
      return {
        datasetId,
        parents: [],
        children: [],
        transformations: [],
      };
    }
  }

  /**
   * Update dataset quality metrics
   */
  async updateQualityMetrics(
    datasetId: string,
    metrics: QualityMetrics
  ): Promise<TransactionResult> {
    const contract = this.ensureContract('provenanceManager');

    // Upload validation report if provided
    let validationCid = '';
    if (metrics.validationReportCid) {
      validationCid = metrics.validationReportCid;
    }

    return this.executeTransaction(contract.submitQualityMetrics, [
      datasetId,
      Math.round(metrics.completeness * 10000), // Convert to basis points
      Math.round(metrics.consistency * 10000),
      Math.round(metrics.accuracy * 10000),
      Math.round(metrics.uniqueness * 10000),
      Math.round(metrics.timeliness * 10000),
      validationCid,
    ]);
  }

  /**
   * Apply transformations to data
   */
  private async applyTransformations(
    data: any[],
    config: TransformationConfig
  ): Promise<{ transformedData: any[]; newSchema: SchemaField[] }> {
    // This is a simplified implementation
    // In production, this would use more sophisticated transformation logic

    let transformedData = [...data];
    const schemaChanges: Map<string, SchemaField> = new Map();

    for (const rule of config.rules) {
      switch (rule.type) {
        case 'rename':
          transformedData = transformedData.map((row) => {
            const newRow = { ...row };
            if (
              rule.sourceField &&
              rule.targetField &&
              rule.sourceField in row
            ) {
              newRow[rule.targetField] = row[rule.sourceField];
              if (!config.preserveOriginal) {
                delete newRow[rule.sourceField];
              }
            }
            return newRow;
          });
          break;

        case 'convert':
          // Type conversion logic
          break;

        case 'calculate':
          // Calculation logic
          break;

        case 'filter':
          // Filtering logic
          break;

        case 'aggregate':
          // Aggregation logic
          break;
      }
    }

    // Generate new schema based on transformations
    const newSchema: SchemaField[] = [];
    if (transformedData.length > 0) {
      const sampleRow = transformedData[0];
      for (const [key, value] of Object.entries(sampleRow)) {
        newSchema.push({
          name: key,
          type: typeof value as any,
          description: `Field ${key}`,
        });
      }
    }

    return { transformedData, newSchema };
  }

  /**
   * Apply anonymization to data
   */
  private async applyAnonymization(
    data: any[],
    config: AnonymizationConfig
  ): Promise<any[]> {
    // This is a simplified implementation
    // In production, this would use proper anonymization libraries

    const anonymizedData = data.map((row) => {
      const newRow = { ...row };

      for (const rule of config.rules) {
        if (rule.field in newRow) {
          switch (rule.method) {
            case 'mask':
              // Simple masking
              newRow[rule.field] = '***MASKED***';
              break;

            case 'hash':
              // Would use proper hashing in production
              newRow[rule.field] =
                `hash_${Math.random().toString(36).substring(7)}`;
              break;

            case 'fake':
              // Would use faker library in production
              newRow[rule.field] =
                `fake_${rule.field}_${Math.random().toString(36).substring(7)}`;
              break;

            case 'remove':
              delete newRow[rule.field];
              break;

            case 'generalize':
              // Generalization logic
              break;

            case 'shuffle':
              // Shuffling logic would be applied across all rows
              break;
          }
        }
      }

      return newRow;
    });

    return anonymizedData;
  }

  /**
   * Calculate dataset quality metrics
   */
  private calculateDatasetQuality(
    data: any[],
    schema: SchemaField[]
  ): {
    completeness: number;
    consistency: number;
    accuracy: number;
    uniqueness: number;
    timeliness: number;
    average: number;
  } {
    // Simplified quality calculation
    // In production, this would be much more sophisticated

    let completeness = 10000; // Start at 100%
    let consistency = 10000;
    let accuracy = 10000;
    let uniqueness = 10000;
    const timeliness = 10000; // Always fresh for new data

    // Check completeness
    let missingValues = 0;
    let totalValues = 0;

    for (const row of data) {
      for (const field of schema) {
        totalValues++;
        if (
          !row[field.name] ||
          row[field.name] === null ||
          row[field.name] === ''
        ) {
          missingValues++;
        }
      }
    }

    if (totalValues > 0) {
      completeness = Math.floor((1 - missingValues / totalValues) * 10000);
    }

    // Simple uniqueness check
    const uniqueRows = new Set(data.map((row) => JSON.stringify(row)));
    uniqueness = Math.floor((uniqueRows.size / data.length) * 10000);

    // Calculate average
    const average = Math.floor(
      (completeness + consistency + accuracy + uniqueness + timeliness) / 5
    );

    return {
      completeness,
      consistency,
      accuracy,
      uniqueness,
      timeliness,
      average,
    };
  }
}
