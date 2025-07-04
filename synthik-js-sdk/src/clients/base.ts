/**
 * Base client for interacting with Synthik contracts
 */

import { ethers } from 'ethers';
import { EventEmitter } from 'events';
import {
  SynthikConfig,
  Address,
  TransactionResult,
  SynthikEvent,
} from '../types';
import { NETWORKS, DEFAULT_OPTIONS } from '../utils/constants';
import { parseTransactionError, retryWithBackoff } from '../utils/helpers';

// Import ABIs
import ProvenanceManagerABI from '../../abis/ProvenanceManager.json';
import DatasetRegistryABI from '../../abis/DatasetRegistry.json';
import DatasetMarketplaceABI from '../../abis/DatasetMarketplace.json';
import AutoAccessManagerABI from '../../abis/AutoAccessManager.json';

export abstract class BaseClient extends EventEmitter {
  protected provider: ethers.Provider;
  protected signer: ethers.Signer;
  protected config: SynthikConfig;

  // Contract instances
  protected provenanceManager?: ethers.Contract;
  protected datasetRegistry?: ethers.Contract;
  protected datasetMarketplace?: ethers.Contract;
  protected autoAccessManager?: ethers.Contract;

  constructor(config: SynthikConfig) {
    super();
    this.config = {
      ...config,
      network: config.network || 'calibration',
      options: {
        ...DEFAULT_OPTIONS,
        ...config.options,
      },
    };

    // Initialize provider and signer
    const network = NETWORKS[this.config.network!];
    if (!network) {
      throw new Error(`Unknown network: ${this.config.network}`);
    }

    this.provider = new ethers.JsonRpcProvider(network.rpcUrl);
    this.signer = new ethers.Wallet(config.privateKey, this.provider);

    // Initialize contracts
    this.initializeContracts();
  }

  /**
   * Initialize contract instances
   */
  private initializeContracts(): void {
    const network = NETWORKS[this.config.network!];
    const contractAddresses = {
      ...network.contracts,
      ...this.config.contracts,
    };

    if (contractAddresses.ProvenanceManager) {
      this.provenanceManager = new ethers.Contract(
        contractAddresses.ProvenanceManager,
        (ProvenanceManagerABI as any).abi,
        this.signer
      );
    }

    if (contractAddresses.DatasetRegistry) {
      this.datasetRegistry = new ethers.Contract(
        contractAddresses.DatasetRegistry,
        (DatasetRegistryABI as any).abi,
        this.signer
      );
    }

    if (contractAddresses.DatasetMarketplace) {
      this.datasetMarketplace = new ethers.Contract(
        contractAddresses.DatasetMarketplace,
        (DatasetMarketplaceABI as any).abi,
        this.signer
      );
    }

    if (contractAddresses.AutoAccessManager) {
      this.autoAccessManager = new ethers.Contract(
        contractAddresses.AutoAccessManager,
        (AutoAccessManagerABI as any).abi,
        this.signer
      );
    }
  }

  /**
   * Get wallet address
   */
  async getAddress(): Promise<Address> {
    return this.signer.getAddress();
  }

  /**
   * Get wallet balance
   */
  async getBalance(): Promise<bigint> {
    const address = await this.getAddress();
    return this.provider.getBalance(address);
  }

  /**
   * Execute transaction with retry and error handling
   */
  protected async executeTransaction(
    contractMethod: (
      ...args: any[]
    ) => Promise<ethers.ContractTransactionResponse>,
    args: any[],
    options?: {
      value?: bigint;
      gasLimit?: bigint;
    }
  ): Promise<TransactionResult> {
    try {
      const tx = await retryWithBackoff(
        () => contractMethod(...args, options || {}),
        this.config.options?.maxRetries
      );

      // Wait for confirmation
      const receipt = await tx.wait(this.config.options?.confirmations);

      if (!receipt) {
        throw new Error('Transaction receipt is null');
      }

      // Emit success event
      this.emit('transaction', {
        type: 'success',
        txHash: receipt.hash,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed.toString(),
      });

      return {
        success: true,
        txHash: receipt.hash,
        data: receipt,
      };
    } catch (error) {
      const errorMessage = parseTransactionError(error);

      // Emit error event
      this.emit('error', {
        type: 'transaction',
        error: errorMessage,
        details: error,
      });

      return {
        success: false,
        error: new Error(errorMessage),
      };
    }
  }

  /**
   * Watch for contract events
   */
  protected async watchEvents(
    contract: ethers.Contract,
    eventName: string,
    callback: (event: SynthikEvent) => void
  ): Promise<() => void> {
    const filter = contract.filters[eventName]();

    const listener = (...args: any[]) => {
      const event = args[args.length - 1]; // Last argument is the event
      callback({
        type: eventName,
        data: event.args,
        timestamp: new Date(),
        txHash: event.transactionHash,
      });
    };

    contract.on(filter, listener);

    // Return cleanup function
    return () => {
      contract.off(filter, listener);
    };
  }

  /**
   * Estimate gas for a transaction
   */
  protected async estimateGas(
    contractMethod: (...args: any[]) => Promise<bigint>,
    args: any[]
  ): Promise<bigint> {
    const estimated = await contractMethod(...args);
    // Add buffer
    return (
      (estimated *
        BigInt(Math.floor(this.config.options!.gasMultiplier! * 100))) /
      100n
    );
  }

  /**
   * Check if contracts are initialized
   */
  protected ensureContract(name: string): ethers.Contract {
    const contract = (this as any)[name];
    if (!contract) {
      throw new Error(
        `${name} contract not initialized. Check network configuration.`
      );
    }
    return contract;
  }

  /**
   * Disconnect and cleanup
   */
  async disconnect(): Promise<void> {
    this.removeAllListeners();
    // Additional cleanup if needed
  }
}
