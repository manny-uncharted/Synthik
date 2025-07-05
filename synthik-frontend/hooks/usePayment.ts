import { useMutation } from '@tanstack/react-query';
import { usePrivyEthers } from '@/hooks/usePrivyEthers';
import { useState } from 'react';
// import { useConfetti } from "@/hooks/useConfetti";
import { useNetwork } from '@/hooks/useNetwork';
import { Synapse, TOKENS, CONTRACT_ADDRESSES } from '@filoz/synapse-sdk';
import {
  getPandoraAddress,
  PROOF_SET_CREATION_FEE,
  MAX_UINT256,
  getProofset,
} from '@/utils';

/**
 * Hook to handle payment for storage
 * @param lockup - The lockup amount to be used for the storage
 * @param epochRate - The epoch rate to be used for the storage
 * @param depositAmount - The deposit amount to be used for the storage
 * @notice LockUp is the accoumulated amount of USDFC that the user has locked up for Storing data over time.
 * It is different from the depositAmount. Which is the amount needed to pay for more storage if required.
 * @returns Mutation and status
 */
export const usePayment = () => {
  const { signer, address } = usePrivyEthers();
  const [status, setStatus] = useState<string>('');
  // const { triggerConfetti } = useConfetti();
  const { data: network } = useNetwork();
  const mutation = useMutation({
    mutationFn: async ({
      lockupAllowance,
      epochRateAllowance,
      depositAmount,
    }: {
      lockupAllowance: bigint;
      epochRateAllowance: bigint;
      depositAmount: bigint;
    }) => {
      if (!signer) throw new Error('Signer not found');
      if (!network) throw new Error('Network not found');
      if (!address) throw new Error('Address not found');
      const paymentsAddress = CONTRACT_ADDRESSES.PAYMENTS[network];

      setStatus('🔄 Preparing transaction...');
      const synapse = await Synapse.create({
        signer,
        disableNonceManager: true, // Let the wallet handle nonce management
      });

      const { proofset } = await getProofset(signer, network, address);

      const hasProofSet = !!proofset;

      const fee = hasProofSet ? 0n : PROOF_SET_CREATION_FEE;

      const amount = depositAmount + fee;

      const allowance = await synapse.payments.allowance(
        TOKENS.USDFC,
        paymentsAddress
      );

      const balance = await synapse.payments.walletBalance(TOKENS.USDFC);

      if (balance < amount) {
        throw new Error('Insufficient USDFC balance');
      }

      if (allowance < MAX_UINT256) {
        setStatus('💰 Approving USDFC to cover storage costs...');
        const transaction = await synapse.payments.approve(
          TOKENS.USDFC,
          paymentsAddress,
          MAX_UINT256
        );
        await transaction.wait();
        setStatus('💰 Successfully approved USDFC to cover storage costs');
      }
      if (amount > 0n) {
        setStatus('💰 Depositing USDFC to cover storage costs...');
        const transaction = await synapse.payments.deposit(amount);
        await transaction.wait();
        setStatus('💰 Successfully deposited USDFC to cover storage costs');
      }

      setStatus('💰 Approving Pandora service USDFC spending rates...');
      const transaction = await synapse.payments.approveService(
        getPandoraAddress(network),
        epochRateAllowance,
        lockupAllowance + fee
      );
      await transaction.wait();
      setStatus('💰 Successfully approved Pandora spending rates');
    },
    onSuccess: () => {
      setStatus('✅ Payment was successful!');
      // triggerConfetti();
    },
    onError: (error) => {
      console.error('Payment failed:', error);

      // Check for specific nonce errors
      if (error.message?.includes('nonce')) {
        setStatus(
          `❌ Nonce error: ${error.message}. Try disconnecting and reconnecting your wallet.`
        );
      } else if (error.message?.includes('insufficient funds')) {
        setStatus(
          `❌ Insufficient funds: ${error.message}. Please add more tokens to your wallet.`
        );
      } else {
        setStatus(
          `❌ ${error.message || 'Transaction failed. Please try again.'}`
        );
      }
    },
  });
  return { mutation, status };
};
