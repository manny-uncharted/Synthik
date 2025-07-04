/**
 * Utility helper functions
 */

import { ethers } from 'ethers';
import { SchemaField, QualityLevel } from '../types';
import { QUALITY_THRESHOLDS, DATASET_LIMITS, TRANSACTION_ERRORS } from './constants';

/**
 * Generate a unique dataset ID
 */
export function generateDatasetId(prefix = 'dataset'): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `${prefix}-${timestamp}-${random}`;
}

/**
 * Validate dataset configuration
 */
export function validateDatasetConfig(config: {
  name: string;
  description: string;
  rows: number;
  schema: SchemaField[];
}): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Name validation
  if (!config.name || config.name.trim().length === 0) {
    errors.push('Dataset name is required');
  } else if (config.name.length > DATASET_LIMITS.MAX_NAME_LENGTH) {
    errors.push(`Dataset name must be less than ${DATASET_LIMITS.MAX_NAME_LENGTH} characters`);
  }

  // Description validation
  if (!config.description || config.description.trim().length === 0) {
    errors.push('Dataset description is required');
  } else if (config.description.length > DATASET_LIMITS.MAX_DESCRIPTION_LENGTH) {
    errors.push(`Description must be less than ${DATASET_LIMITS.MAX_DESCRIPTION_LENGTH} characters`);
  }

  // Rows validation
  if (config.rows < DATASET_LIMITS.MIN_ROWS) {
    errors.push(`Dataset must have at least ${DATASET_LIMITS.MIN_ROWS} row`);
  } else if (config.rows > DATASET_LIMITS.MAX_ROWS) {
    errors.push(`Dataset cannot exceed ${DATASET_LIMITS.MAX_ROWS} rows`);
  }

  // Schema validation
  if (!config.schema || config.schema.length === 0) {
    errors.push('Dataset schema is required');
  } else if (config.schema.length > DATASET_LIMITS.MAX_SCHEMA_FIELDS) {
    errors.push(`Schema cannot have more than ${DATASET_LIMITS.MAX_SCHEMA_FIELDS} fields`);
  } else {
    // Validate individual fields
    const fieldNames = new Set<string>();
    config.schema.forEach((field, index) => {
      if (!field.name || field.name.trim().length === 0) {
        errors.push(`Field ${index + 1}: name is required`);
      } else if (fieldNames.has(field.name)) {
        errors.push(`Duplicate field name: ${field.name}`);
      } else {
        fieldNames.add(field.name);
      }

      if (!['string', 'number', 'boolean', 'date', 'object', 'array'].includes(field.type)) {
        errors.push(`Field ${field.name}: invalid type ${field.type}`);
      }
    });
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Calculate quality level from metrics
 */
export function calculateQualityLevel(avgScore: number): QualityLevel {
  if (avgScore >= QUALITY_THRESHOLDS.PREMIUM) {
    return 4; // PREMIUM
  } else if (avgScore >= QUALITY_THRESHOLDS.HIGH) {
    return 3; // HIGH
  } else if (avgScore >= QUALITY_THRESHOLDS.STANDARD) {
    return 2; // STANDARD
  } else if (avgScore >= QUALITY_THRESHOLDS.BASIC) {
    return 1; // BASIC
  } else {
    return 0; // UNVERIFIED
  }
}

/**
 * Format file size for display
 */
export function formatFileSize(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(2)} ${units[unitIndex]}`;
}

/**
 * Parse transaction error for user-friendly message
 */
export function parseTransactionError(error: any): string {
  const errorString = error.toString().toLowerCase();

  for (const [key, pattern] of Object.entries(TRANSACTION_ERRORS)) {
    if (errorString.includes(pattern)) {
      switch (key) {
        case 'INSUFFICIENT_FUNDS':
          return 'Insufficient funds in wallet. Please add more FIL.';
        case 'NONCE_TOO_LOW':
          return 'Transaction nonce conflict. Please retry.';
        case 'GAS_TOO_LOW':
          return 'Gas limit too low. Transaction requires more gas.';
        case 'NETWORK_ERROR':
          return 'Network connection error. Please check your connection.';
        case 'TIMEOUT':
          return 'Transaction timed out. Please try again.';
        case 'USER_REJECTED':
          return 'Transaction was rejected by user.';
      }
    }
  }

  // Check for revert reasons
  if (error.reason) {
    return `Transaction failed: ${error.reason}`;
  }

  return 'Transaction failed. Please try again.';
}

/**
 * Retry async operation with exponential backoff
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  baseDelay = 1000
): Promise<T> {
  let lastError: Error;

  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      
      if (i < maxRetries - 1) {
        const delay = baseDelay * Math.pow(2, i);
        await sleep(delay);
      }
    }
  }

  throw lastError!;
}

/**
 * Sleep utility
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Batch array into chunks
 */
export function batchArray<T>(array: T[], batchSize: number): T[][] {
  const batches: T[][] = [];
  
  for (let i = 0; i < array.length; i += batchSize) {
    batches.push(array.slice(i, i + batchSize));
  }
  
  return batches;
}

/**
 * Estimate dataset size based on schema and row count
 */
export function estimateDatasetSize(schema: SchemaField[], rowCount: number): number {
  // Rough estimation based on field types
  const avgFieldSizes: Record<string, number> = {
    string: 50,    // 50 bytes average
    number: 8,     // 8 bytes
    boolean: 1,    // 1 byte
    date: 8,       // 8 bytes (timestamp)
    object: 200,   // 200 bytes average
    array: 100,    // 100 bytes average
  };

  const rowSize = schema.reduce((total, field) => {
    return total + (avgFieldSizes[field.type] || 50);
  }, 0);

  // Add overhead for structure (JSON/CSV formatting)
  const overhead = 1.2; // 20% overhead
  return Math.ceil(rowSize * rowCount * overhead);
}

/**
 * Validate Ethereum address
 */
export function isValidAddress(address: string): boolean {
  try {
    ethers.getAddress(address);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validate IPFS CID
 */
export function isValidCID(cid: string): boolean {
  // Basic CID validation (starts with 'bafy' or 'Qm')
  return /^(bafy[a-zA-Z0-9]+|Qm[a-zA-Z0-9]+)$/.test(cid);
}

/**
 * Format transaction hash for display
 */
export function formatTxHash(txHash: string, length = 10): string {
  if (txHash.length <= length * 2) return txHash;
  return `${txHash.slice(0, length)}...${txHash.slice(-length)}`;
}

/**
 * Convert basis points to percentage
 */
export function basisPointsToPercentage(bp: number): number {
  return bp / 100;
}

/**
 * Deep clone object
 */
export function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
} 