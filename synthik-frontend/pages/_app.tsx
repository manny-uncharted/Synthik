import '@/styles/globals.css';
import type { AppProps } from 'next/app';
import { PrivyProvider } from '@privy-io/react-auth';
import { filecoin, filecoinCalibration } from 'viem/chains';

export default function App({ Component, pageProps }: AppProps) {
  return (
    <PrivyProvider
      appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID!}
      config={{
        // Customize Privy's appearance in your app
        appearance: {
          theme: 'light',
          accentColor: '#6366f1',
          logo: 'https://your-logo-url.com/logo.png',
        },
        // Create embedded wallets for users who don't have a wallet
        embeddedWallets: {
          createOnLogin: 'users-without-wallets',
        },
        // Configure supported chains
        supportedChains: [filecoin, filecoinCalibration],
        // Configure login methods
        loginMethods: ['email', 'google', 'twitter', 'wallet'],
        // Configure wallet connection options
        walletConnectOptions: {
          projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID,
        },
      }}
    >
      <Component {...pageProps} />
    </PrivyProvider>
  );
}
