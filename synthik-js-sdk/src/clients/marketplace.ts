/**
 * Marketplace client for dataset trading
 */

import { BaseClient } from './base';
import { StorageService } from '../services/storage';
import {
  MarketplaceListing,
  PurchaseRequest,
  TransactionResult,
  Dataset,
  CID,
} from '../types';
import { parseTransactionError } from '../utils/helpers';

export class MarketplaceClient extends BaseClient {
  private storage: StorageService;

  constructor(config: any) {
    super(config);
    
    // Initialize storage service
    this.storage = new StorageService(
      config.storage?.provider || 'mock',
      {
        endpoint: config.storage?.endpoint,
        token: config.storage?.token,
      }
    );
  }

  /**
   * List a dataset for sale
   */
  async listDataset(
    datasetId: string,
    pricePerRow: bigint,
    options?: {
      minimumRows?: number;
      maximumRows?: number;
      sampleData?: any[];
    }
  ): Promise<TransactionResult> {
    const contract = this.ensureContract('datasetMarketplace');

    // Upload sample data if provided
    let sampleCid = '';
    if (options?.sampleData) {
      sampleCid = await this.storage.uploadJSON(options.sampleData, {
        type: 'dataset-sample',
        datasetId,
        rows: options.sampleData.length,
      });
    }

    return this.executeTransaction(
      contract.listDataset,
      [
        datasetId,
        pricePerRow,
        options?.minimumRows || 1,
        options?.maximumRows || 1000000,
        sampleCid
      ]
    );
  }

  /**
   * Update listing price
   */
  async updateListingPrice(
    datasetId: string,
    newPricePerRow: bigint
  ): Promise<TransactionResult> {
    const contract = this.ensureContract('datasetMarketplace');
    
    return this.executeTransaction(
      contract.updatePrice,
      [datasetId, newPricePerRow]
    );
  }

  /**
   * Delist a dataset
   */
  async delistDataset(datasetId: string): Promise<TransactionResult> {
    const contract = this.ensureContract('datasetMarketplace');
    
    return this.executeTransaction(
      contract.delistDataset,
      [datasetId]
    );
  }

  /**
   * Get marketplace listing
   */
  async getListing(datasetId: string): Promise<MarketplaceListing | null> {
    const contract = this.ensureContract('datasetMarketplace');
    
    try {
      const listing = await contract.getListing(datasetId);
      
      if (!listing || !listing.isActive) {
        return null;
      }

      return {
        datasetId,
        seller: listing.seller,
        pricePerRow: listing.pricePerRow,
        minimumRows: Number(listing.minimumRows),
        maximumRows: Number(listing.maximumRows),
        isActive: listing.isActive,
        totalSales: Number(listing.totalSales),
        totalRevenue: listing.totalRevenue,
        sampleCid: listing.sampleCid || undefined,
      };
    } catch (error) {
      console.error('Failed to get listing:', error);
      return null;
    }
  }

  /**
   * Get all active listings
   */
  async getActiveListings(options?: {
    offset?: number;
    limit?: number;
  }): Promise<MarketplaceListing[]> {
    const contract = this.ensureContract('datasetMarketplace');
    
    try {
      // This would need pagination support in the contract
      // For now, return empty array as placeholder
      console.log('Getting active listings with options:', options);
      return [];
    } catch (error) {
      console.error('Failed to get active listings:', error);
      return [];
    }
  }

  /**
   * Purchase dataset rows
   */
  async purchaseDataset(
    request: PurchaseRequest,
    options?: {
      maxGasPrice?: bigint;
    }
  ): Promise<{
    success: boolean;
    purchaseId?: string;
    txHash?: string;
    error?: Error;
  }> {
    const contract = this.ensureContract('datasetMarketplace');
    
    // Get listing to calculate payment
    const listing = await this.getListing(request.datasetId);
    if (!listing) {
      return {
        success: false,
        error: new Error('Dataset not listed for sale'),
      };
    }

    // Validate row count
    if (request.rowCount < listing.minimumRows) {
      return {
        success: false,
        error: new Error(`Minimum purchase is ${listing.minimumRows} rows`),
      };
    }

    if (request.rowCount > listing.maximumRows) {
      return {
        success: false,
        error: new Error(`Maximum purchase is ${listing.maximumRows} rows`),
      };
    }

    // Calculate payment
    const totalPayment = listing.pricePerRow * BigInt(request.rowCount);

    // Check balance
    const balance = await this.getBalance();
    if (balance < totalPayment) {
      return {
        success: false,
        error: new Error(`Insufficient balance. Need ${totalPayment} wei, have ${balance} wei`),
      };
    }

    // Execute purchase
    const result = await this.executeTransaction(
      contract.purchaseDataset,
      [request.datasetId, request.rowCount],
      { value: totalPayment }
    );

    if (result.success) {
      // Generate purchase ID from transaction
      const purchaseId = `purchase-${result.txHash?.substring(2, 10)}`;
      
      // Emit purchase event
      this.emit('datasetPurchased', {
        purchaseId,
        datasetId: request.datasetId,
        buyer: await this.getAddress(),
        seller: listing.seller,
        rowCount: request.rowCount,
        totalPayment: totalPayment.toString(),
        txHash: result.txHash,
      });

      return {
        success: true,
        purchaseId,
        txHash: result.txHash,
      };
    }

    return {
      success: false,
      error: result.error,
    };
  }

  /**
   * Get purchase history for current user
   */
  async getPurchaseHistory(): Promise<Array<{
    purchaseId: string;
    datasetId: string;
    seller: string;
    rowCount: number;
    totalPayment: string;
    purchaseDate: Date;
    txHash: string;
  }>> {
    // This would need event filtering from the blockchain
    // For now, return empty array as placeholder
    return [];
  }

  /**
   * Get sales history for current user
   */
  async getSalesHistory(): Promise<Array<{
    saleId: string;
    datasetId: string;
    buyer: string;
    rowCount: number;
    totalRevenue: string;
    saleDate: Date;
    txHash: string;
  }>> {
    // This would need event filtering from the blockchain
    // For now, return empty array as placeholder
    return [];
  }

  /**
   * Withdraw accumulated sales revenue
   */
  async withdrawRevenue(): Promise<TransactionResult> {
    const contract = this.ensureContract('datasetMarketplace');
    
    // Check pending revenue
    const revenue = await contract.pendingWithdrawals(await this.getAddress());
    
    if (revenue === 0n) {
      return {
        success: false,
        error: new Error('No revenue to withdraw'),
      };
    }

    const result = await this.executeTransaction(
      contract.withdraw,
      []
    );

    if (result.success) {
      this.emit('revenueWithdrawn', {
        amount: revenue.toString(),
        recipient: await this.getAddress(),
        txHash: result.txHash,
      });
    }

    return result;
  }

  /**
   * Get pending revenue
   */
  async getPendingRevenue(): Promise<bigint> {
    const contract = this.ensureContract('datasetMarketplace');
    const address = await this.getAddress();
    
    try {
      return await contract.pendingWithdrawals(address);
    } catch (error) {
      console.error('Failed to get pending revenue:', error);
      return 0n;
    }
  }

  /**
   * Calculate price for bulk purchase
   */
  calculateTotalPrice(pricePerRow: bigint, rowCount: number): bigint {
    return pricePerRow * BigInt(rowCount);
  }

  /**
   * Get marketplace statistics
   */
  async getMarketplaceStats(): Promise<{
    totalListings: number;
    totalSales: number;
    totalVolume: bigint;
    averagePrice: bigint;
  }> {
    const contract = this.ensureContract('datasetMarketplace');
    
    try {
      // This would need aggregation support in the contract
      // For now, return placeholder stats
      return {
        totalListings: 0,
        totalSales: 0,
        totalVolume: 0n,
        averagePrice: 0n,
      };
    } catch (error) {
      console.error('Failed to get marketplace stats:', error);
      return {
        totalListings: 0,
        totalSales: 0,
        totalVolume: 0n,
        averagePrice: 0n,
      };
    }
  }
} 