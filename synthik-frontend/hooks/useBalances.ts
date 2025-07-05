import { useQuery } from '@tanstack/react-query';
import { Synapse, TOKENS } from '@filoz/synapse-sdk';
import { useEthersProvider } from '@/hooks/useEthers';
import { useAccount } from 'wagmi';
import { usePrivyEthers } from '@/hooks/usePrivyEthers';
import { calculateStorageMetrics } from '@/utils/calculateStorageMetrics';
import { useNetwork } from '@/hooks/useNetwork';
import { formatUnits } from 'viem';
import { defaultBalances, UseBalancesResponse } from '@/utils/types';

/**
 * Hook to fetch and format wallet balances and storage metrics
 */
export const useBalances = () => {
  const wagmiProvider = useEthersProvider();
  const { address: wagmiAddress } = useAccount();

  const {
    provider: privyProvider,
    address: privyAddress,
    chainId,
  } = usePrivyEthers();

  const provider = wagmiProvider ?? privyProvider;
  const address = wagmiAddress ?? privyAddress;

  const { data: wagmiNetwork } = useNetwork();

  const network =
    wagmiNetwork ??
    (chainId === 314
      ? 'mainnet'
      : chainId === 314159
      ? 'calibration'
      : undefined);

  const query = useQuery({
    enabled: !!address && !!provider && !!network,
    queryKey: ['balances', address, network],
    queryFn: async (): Promise<UseBalancesResponse> => {
      if (!provider) throw new Error('Provider not found');
      if (!network) throw new Error('Network not found');

      const synapse = await Synapse.create({ provider });

      // Fetch raw balances
      const [filRaw, usdfcRaw, paymentsRaw] = await Promise.all([
        synapse.payments.walletBalance(),
        synapse.payments.walletBalance(TOKENS.USDFC),
        synapse.payments.balance(TOKENS.USDFC),
      ]);

      const usdfcDecimals = synapse.payments.decimals(TOKENS.USDFC);

      // Calculate storage metrics
      const storageMetrics = await calculateStorageMetrics(synapse);

      return {
        filBalance: filRaw,
        usdfcBalance: usdfcRaw,
        pandoraBalance: paymentsRaw,
        filBalanceFormatted: formatBalance(filRaw, 18),
        usdfcBalanceFormatted: formatBalance(usdfcRaw, usdfcDecimals),
        pandoraBalanceFormatted: formatBalance(paymentsRaw, usdfcDecimals),
        ...storageMetrics,
      };
    },
  });

  return {
    ...query,
    data: query.data || defaultBalances,
  };
};

/**
 * Formats a balance value with specified decimals
 */
export const formatBalance = (balance: bigint, decimals: number): number => {
  return Number(Number(formatUnits(balance, decimals)).toFixed(5));
};
