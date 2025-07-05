import { useMutation } from '@tanstack/react-query';
import { Synapse } from '@filoz/synapse-sdk';
import { usePrivyEthers } from '@/hooks/usePrivyEthers';
import { useNetwork } from '@/hooks/useNetwork';
import { getProofset } from '@/utils/getProofset';

/**
 * Hook to download a root from the Filecoin network using Synapse.
 */
export const useDownloadRoot = (commp: string, filename: string) => {
  const { signer, address, chainId } = usePrivyEthers();
  const { data: network } = useNetwork();
  const mutation = useMutation({
    mutationKey: ['download-root', address, commp, filename],
    mutationFn: async () => {
      if (!signer) throw new Error('Signer not found');
      if (!address) throw new Error('Address not found');
      if (!chainId) throw new Error('Chain ID not found');
      if (!network) throw new Error('Network not found');

      console.log('🔄 Starting download process for CID:', commp);

      let lastError: Error | null = null;

      // Try multiple approaches to download the file
      const downloadStrategies = [
        // Strategy 1: Use existing proofset with CDN
        async () => {
          console.log('📋 Strategy 1: Using existing proofset with CDN');
          const synapse = await Synapse.create({
            provider: signer.provider,
            disableNonceManager: true,
            withCDN: true,
          });

          const { providerId } = await getProofset(signer, network, address);
          if (!providerId) {
            throw new Error('No storage provider found in your proofsets');
          }

          const storageService = await synapse.createStorage({
            providerId,
          });

          return await storageService.download(commp);
        },

        // Strategy 2: Use existing proofset without CDN
        async () => {
          console.log('📋 Strategy 2: Using existing proofset without CDN');
          const synapse = await Synapse.create({
            provider: signer.provider,
            disableNonceManager: true,
            withCDN: false,
          });

          const { providerId } = await getProofset(signer, network, address);
          if (!providerId) {
            throw new Error('No storage provider found in your proofsets');
          }

          const storageService = await synapse.createStorage({
            providerId,
          });

          return await storageService.download(commp);
        },

        // Strategy 3: Create new storage service without specific provider
        async () => {
          console.log('📋 Strategy 3: Creating new storage service');
          const synapse = await Synapse.create({
            provider: signer.provider,
            disableNonceManager: true,
            withCDN: false,
          });

          const storageService = await synapse.createStorage({
            callbacks: {
              onProviderSelected: (provider) => {
                console.log(`🔄 Selected provider: ${provider.owner}`);
              },
            },
          });

          return await storageService.download(commp);
        },
      ];

      // Try each strategy
      for (let i = 0; i < downloadStrategies.length; i++) {
        try {
          console.log(`🔄 Attempting download strategy ${i + 1}...`);
          const uint8ArrayBytes = await downloadStrategies[i]();

          console.log('✅ Download successful!');
          const file = new File([uint8ArrayBytes], filename);

          // Download file to browser
          const url = URL.createObjectURL(file);
          const a = document.createElement('a');
          a.href = url;
          a.download = filename;
          a.click();

          return file;
        } catch (error) {
          console.warn(`❌ Strategy ${i + 1} failed:`, error);
          lastError = error as Error;

          // If this is a lockup allowance error, provide specific guidance
          if (
            error instanceof Error &&
            error.message.includes('lockup allowance')
          ) {
            console.log(
              '💡 Lockup allowance error detected, trying next strategy...'
            );
            continue;
          }

          // For other errors, continue to next strategy
          continue;
        }
      }

      // If all strategies failed, throw a comprehensive error
      const errorMessage = lastError?.message || 'Unknown error occurred';

      if (errorMessage.includes('lockup allowance')) {
        throw new Error(
          'Download failed: Storage provider has insufficient lockup allowance. ' +
            'This may be due to network congestion or provider configuration. ' +
            'Please try again later or contact support if the issue persists.'
        );
      } else if (errorMessage.includes('No storage provider found')) {
        throw new Error(
          'Download failed: No storage provider found in your account. ' +
            'Please ensure you have published data to Filecoin before attempting to download.'
        );
      } else {
        throw new Error(
          `Download failed after trying multiple strategies. Last error: ${errorMessage}`
        );
      }
    },
  });

  return {
    downloadMutation: mutation,
  };
};
