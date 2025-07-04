import { usePrivy } from '@privy-io/react-auth';
import { useRouter } from 'next/router';
import { useEffect } from 'react';

export function useAuth() {
  const {
    ready,
    authenticated,
    user,
    login,
    logout,
    linkEmail,
    linkWallet,
    unlinkEmail,
    unlinkWallet,
    exportWallet,
    signMessage,
    sendTransaction,
  } = usePrivy();

  const router = useRouter();

  useEffect(() => {
    if (ready && authenticated) {
      const redirectPath = sessionStorage.getItem('redirectAfterLogin');
      if (redirectPath && redirectPath !== router.asPath) {
        sessionStorage.removeItem('redirectAfterLogin');
        router.push(redirectPath);
      }
    }
  }, [ready, authenticated, router]);

  const isLoading = !ready;
  const isAuthenticated = ready && authenticated;
  const userEmail = user?.email?.address;
  const userPhone = user?.phone?.number;
  const walletAddress = user?.wallet?.address;

  const getUserDisplayName = () => {
    if (userEmail) return userEmail;
    if (userPhone) return userPhone;
    if (walletAddress)
      return `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`;
    return 'User';
  };

  const hasWallet = () => {
    return !!user?.wallet?.address;
  };

  const getShortWalletAddress = () => {
    if (!walletAddress) return null;
    return `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`;
  };

  return {
    isLoading,
    isAuthenticated,
    user,
    userEmail,
    userPhone,
    walletAddress,

    login,
    logout,
    linkEmail,
    linkWallet,
    unlinkEmail,
    unlinkWallet,
    exportWallet,
    signMessage,
    sendTransaction,

    // Helpers
    getUserDisplayName,
    hasWallet,
    getShortWalletAddress,
  };
}
