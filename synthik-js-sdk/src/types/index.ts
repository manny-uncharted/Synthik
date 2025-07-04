/**
 * @synthik/sdk Type Definitions
 * Core types for interacting with Synthik contracts and services
 */

// Core blockchain types
export type Address = string;
export type TransactionHash = string;
export type CID = string; // IPFS/Filecoin Content Identifier

// Dataset types
export enum GenerationType {
  SCRATCH = 0,
  AUGMENTED = 1,
  TEMPLATE = 2,
  TRANSFORM = 3,
  HYBRID = 4,
}

export enum DatasetStatus {
  DRAFT = 0,
  GENERATING = 1,
  READY = 2,
  DEPRECATED = 3,
  FAILED = 4,
}

export enum QualityLevel {
  UNVERIFIED = 0,
  BASIC = 1,
  STANDARD = 2,
  HIGH = 3,
  PREMIUM = 4,
}

export enum PrivacyLevel {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
}

// Core dataset interfaces
export interface DatasetConfig {
  name: string;
  description: string;
  license: string;
  rows: number;
  schema: SchemaField[];
  format?: 'json' | 'csv' | 'parquet';
  quality?: 'fast' | 'balanced' | 'high';
  visibility?: 'public' | 'private' | 'restricted';
  tags?: string[];
}

export interface SchemaField {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'date' | 'object' | 'array';
  description?: string;
  constraints?: {
    required?: boolean;
    unique?: boolean;
    min?: number;
    max?: number;
    pattern?: string;
    enum?: string[];
  };
}

export interface Dataset {
  id: string;
  dataCid: CID;
  metadataCid: CID;
  creator: Address;
  createdAt: Date;
  updatedAt: Date;
  name: string;
  description: string;
  license: string;
  status: DatasetStatus;
  quality: QualityLevel;
  totalRows: number;
  totalSize: number;
  isVerified: boolean;
  generationType: GenerationType;
  modelId?: string;
  modelVersion?: string;
}

// Transformation types
export interface TransformationRule {
  type: 'rename' | 'convert' | 'calculate' | 'format' | 'filter' | 'aggregate';
  sourceField?: string;
  targetField?: string;
  parameters?: Record<string, unknown>;
}

export interface TransformationConfig {
  rules: TransformationRule[];
  preserveOriginal?: boolean;
}

// Anonymization types
export interface AnonymizationRule {
  field: string;
  method: 'mask' | 'hash' | 'fake' | 'generalize' | 'remove' | 'shuffle';
  parameters?: Record<string, unknown>;
}

export interface AnonymizationConfig {
  rules: AnonymizationRule[];
  privacyLevel: PrivacyLevel;
  seed?: string;
  preserveFormat?: boolean;
  compliance?: string[]; // ['GDPR', 'CCPA', 'HIPAA']
}

// Marketplace types
export interface MarketplaceListing {
  datasetId: string;
  seller: Address;
  pricePerRow: bigint;
  minimumRows: number;
  maximumRows: number;
  isActive: boolean;
  totalSales: number;
  totalRevenue: bigint;
  sampleCid?: CID;
}

export interface PurchaseRequest {
  datasetId: string;
  rowCount: number;
  payment: bigint;
}

// Access control types
export interface AccessRequest {
  id: string;
  datasetId: string;
  requester: Address;
  reason: string;
  duration: number;
  status: 'pending' | 'approved' | 'rejected' | 'expired';
  grantedAt?: Date;
  expiresAt?: Date;
}

// Provenance types
export interface ProvenanceEntry {
  action: 'created' | 'transformed' | 'anonymized' | 'verified' | 'used';
  actor: Address;
  timestamp: Date;
  details: Record<string, unknown>;
  txHash: TransactionHash;
}

export interface DatasetLineage {
  datasetId: string;
  parents: string[];
  children: string[];
  transformations: Array<{
    fromDataset: string;
    toDataset: string;
    transformationType: string;
    timestamp: Date;
  }>;
}

// Quality metrics
export interface QualityMetrics {
  completeness: number; // 0-10000 (basis points)
  consistency: number;
  accuracy: number;
  uniqueness: number;
  timeliness: number;
  validationReportCid?: CID;
  validator?: Address;
  validatedAt?: Date;
}

// Storage types
export interface StorageProvider {
  upload(
    data: Uint8Array | string,
    metadata?: Record<string, unknown>
  ): Promise<CID>;
  download(cid: CID): Promise<Uint8Array>;
  pin(cid: CID): Promise<void>;
  unpin(cid: CID): Promise<void>;
}

// Event types
export interface SynthikEvent {
  type: string;
  data: unknown;
  timestamp: Date;
  txHash?: TransactionHash;
}

export interface DatasetCreatedEvent extends SynthikEvent {
  type: 'DatasetCreated';
  data: {
    datasetId: string;
    creator: Address;
    generationType: GenerationType;
    dataCid: CID;
    metadataCid: CID;
  };
}

export interface DatasetTransformedEvent extends SynthikEvent {
  type: 'DatasetTransformed';
  data: {
    originalDatasetId: string;
    newDatasetId: string;
    transformationType: string;
    transformationConfig?: CID;
  };
}

// Generation types
export interface GenerationModel {
  id: string;
  name: string;
  provider: 'openai' | 'google' | 'anthropic' | 'meta';
  capabilities: {
    maxTokens: number;
    supportsStructuredOutput: boolean;
    supportsStreaming: boolean;
    costPerToken: number;
  };
}

export interface GenerationRequest {
  model: GenerationModel;
  config: DatasetConfig;
  batchSize?: number;
  streamCallback?: (progress: number) => void;
}

export interface GenerationResponse {
  data: DataRecord[];
  metadata: {
    totalRows: number;
    generationTime: number;
    tokensUsed: number;
    cost: number;
  };
}

export type DataRecord = Record<
  string,
  string | number | boolean | Date | null
>;

// SDK Configuration
export interface SynthikConfig {
  privateKey: string;
  network?: 'mainnet' | 'calibration' | 'localhost';

  // Model API Keys
  apiKeys?: {
    openai?: string;
    google?: string; // Gemini
    anthropic?: string; // Claude
    meta?: string; // Llama
  };

  contracts?: {
    ProvenanceManager?: Address;
    DatasetRegistry?: Address;
    DatasetMarketplace?: Address;
    AutoAccessManager?: Address;
  };
  storage?: {
    provider?: 'ipfs' | 'filecoin' | 'mock';
    endpoint?: string;
    token?: string;
  };
  options?: {
    confirmations?: number;
    timeout?: number;
    maxRetries?: number;
    batchSize?: number;
    gasMultiplier?: number;
  };
}

// Operation results
export interface TransactionResult {
  success: boolean;
  txHash?: TransactionHash;
  error?: Error;
  data?: unknown;
}

export interface BatchResult<T> {
  successful: T[];
  failed: Array<{ item: T; error: Error }>;
  totalProcessed: number;
}

// Utility types
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export type Callback<T> = (error: Error | null, result?: T) => void;

export type ProgressCallback = (progress: number, message?: string) => void;
