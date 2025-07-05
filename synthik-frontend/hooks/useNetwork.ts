import { useQuery } from '@tanstack/react-query';
import { useAccount } from 'wagmi';
import { usePrivyEthers } from '@/hooks/usePrivyEthers';

const getNetwork = async (chainId: number) => {
  const network =
    chainId === 314159 ? 'calibration' : chainId === 314 ? 'mainnet' : null;
  return network;
};

export const useNetwork = () => {
  const { chainId: wagmiChainId } = useAccount();
  const { chainId: privyChainId } = usePrivyEthers();

  // Prioritize Privy chain ID over wagmi
  const chainId = privyChainId ?? wagmiChainId;

  return useQuery({
    queryKey: ['network', chainId],
    queryFn: () => {
      if (!chainId) throw new Error('Chain ID not found');
      const network = getNetwork(chainId);
      if (!network) throw new Error('Unsupported network');
      return network;
    },
    enabled: !!chainId,
  });
};
