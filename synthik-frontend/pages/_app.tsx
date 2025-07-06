import '@/styles/globals.css';
import type { AppProps } from 'next/app';
import { PrivyProvider } from '@privy-io/react-auth';
import { filecoinCalibration } from 'viem/chains';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { WagmiProvider, createConfig, http } from 'wagmi';
import React from 'react';
import 'react-toastify/dist/ReactToastify.css';
import { ToastContainer } from 'react-toastify';

export default function App({ Component, pageProps }: AppProps) {
  // Create a client instance for TanStack Query
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000, // 1 minute
            gcTime: 5 * 60 * 1000, // 5 minutes (formerly cacheTime)
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  // Create wagmi config
  const wagmiConfig = React.useMemo(() => {
    return createConfig({
      chains: [filecoinCalibration],
      transports: {
        [filecoinCalibration.id]: http(),
      },
    });
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <WagmiProvider config={wagmiConfig}>
        <PrivyProvider
          appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID!}
          config={{
            // Customize Privy's appearance in your app
            appearance: {
              theme: 'light',
              accentColor: '#6366f1',
              logo: 'https://i.imghippo.com/files/LO2505Ww.png',
            },
            // Create embedded wallets for users who don't have a wallet
            embeddedWallets: {
              createOnLogin: 'users-without-wallets',
            },
            // Configure supported chains
            supportedChains: [filecoinCalibration],

            loginMethods: ['email', 'google', 'twitter', 'wallet'],
          }}
        >
          <Component {...pageProps} />
          <ToastContainer position="top-right" autoClose={4000} />
        </PrivyProvider>
      </WagmiProvider>
    </QueryClientProvider>
  );
}
