import * as hre from 'hardhat';

async function main() {
  const [signer] = await hre.ethers.getSigners();

  console.log('Account:', signer.address);
  console.log('Nonce:', await signer.getNonce());
  console.log(
    'Balance:',
    hre.ethers.formatEther(
      await hre.ethers.provider.getBalance(signer.address)
    ),
    'FIL'
  );

  // Check latest block
  const block = await hre.ethers.provider.getBlock('latest');
  console.log('Latest block:', block?.number);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
