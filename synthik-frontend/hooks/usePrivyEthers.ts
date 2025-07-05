/* eslint-disable @typescript-eslint/no-explicit-any */
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { BrowserProvider, JsonRpcSigner } from 'ethers';
import { useEffect, useState, useMemo } from 'react';

export interface PrivyEthers {
  provider: BrowserProvider | undefined;
  signer: JsonRpcSigner | undefined;
  address: string | undefined;
  chainId: number | undefined;
}

/**
 * Hook that converts the Privy embedded wallet into an ethers.js Provider & Signer.
 * Returns undefined values until the wallet is ready.
 */
export const usePrivyEthers = (): PrivyEthers => {
  const { ready, authenticated } = usePrivy();
  const { wallets } = useWallets();
  const [provider, setProvider] = useState<BrowserProvider>();
  const [signer, setSigner] = useState<JsonRpcSigner>();
  const [chainId, setChainId] = useState<number>();

  useEffect(() => {
    const init = async () => {
      if (!ready || !authenticated) return;
      const wallet = wallets.find((w: any) => w.walletClientType === 'privy');
      if (!wallet) return;
      try {
        const ethProvider = await (wallet as any).getEthereumProvider();
        const ethersProvider = new BrowserProvider(ethProvider as any);
        const ethersSigner = await ethersProvider.getSigner();
        const network = await ethersProvider.getNetwork();
        setProvider(ethersProvider);
        setSigner(ethersSigner);
        setChainId(Number(network.chainId));
      } catch (err) {
        console.error(
          'Failed to create ethers provider from Privy wallet:',
          err
        );
      }
    };
    init();
  }, [ready, authenticated, wallets]);

  const address = wallets[0]?.address;

  return useMemo(
    () => ({ provider, signer, address, chainId }),
    [provider, signer, address, chainId]
  );
};
