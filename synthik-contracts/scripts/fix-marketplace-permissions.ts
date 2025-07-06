import { ethers } from 'hardhat';
import * as fs from 'fs';

/**
 * Fix Marketplace Permissions Script
 *
 * This script grants the necessary ADMIN_ROLE to the DatasetMarketplace contract
 * in the DatasetRegistry so that purchases can automatically grant access to users.
 */

async function main() {
  console.log('🔧 Fixing Marketplace Permissions');
  console.log('=================================');

  const [deployer] = await ethers.getSigners();
  console.log('Executing with account:', deployer.address);
  console.log(
    'Account balance:',
    ethers.formatEther(await ethers.provider.getBalance(deployer.address)),
    'FIL'
  );

  // Load deployed contract addresses
  let deploymentInfo;
  try {
    deploymentInfo = JSON.parse(fs.readFileSync('deployments.json', 'utf8'));
  } catch (error) {
    console.error('❌ Please run deployment first: npm run deploy:calibration');
    process.exit(1);
  }

  console.log('\n📋 Using existing deployment:');
  console.log('- DatasetRegistry:', deploymentInfo.contracts.DatasetRegistry);
  console.log(
    '- DatasetMarketplace:',
    deploymentInfo.contracts.DatasetMarketplace
  );

  try {
    // Connect to DatasetRegistry
    const datasetRegistry = await ethers.getContractAt(
      'DatasetRegistry',
      deploymentInfo.contracts.DatasetRegistry
    );

    // Check if deployer has ADMIN_ROLE in DatasetRegistry
    const ADMIN_ROLE = ethers.keccak256(ethers.toUtf8Bytes('ADMIN_ROLE'));
    const hasAdminRole = await datasetRegistry.hasRole(
      ADMIN_ROLE,
      deployer.address
    );

    if (!hasAdminRole) {
      console.error('❌ Deployer does not have ADMIN_ROLE in DatasetRegistry');
      console.error('Cannot grant role to marketplace contract');
      process.exit(1);
    }

    console.log('✅ Deployer has ADMIN_ROLE in DatasetRegistry');

    // Check if marketplace already has ADMIN_ROLE
    const marketplaceHasRole = await datasetRegistry.hasRole(
      ADMIN_ROLE,
      deploymentInfo.contracts.DatasetMarketplace
    );

    if (marketplaceHasRole) {
      console.log('✅ Marketplace already has ADMIN_ROLE in DatasetRegistry');
      console.log('No action needed - permissions are already correct!');
      return;
    }

    console.log('\n🔧 Granting ADMIN_ROLE to marketplace...');

    // Grant ADMIN_ROLE to marketplace contract
    const tx = await datasetRegistry.grantRole(
      ADMIN_ROLE,
      deploymentInfo.contracts.DatasetMarketplace
    );

    console.log('⏳ Waiting for transaction confirmation...');
    console.log('Transaction hash:', tx.hash);

    const receipt = await tx.wait();

    if (!receipt) {
      throw new Error('Transaction receipt is null');
    }

    console.log('✅ Transaction confirmed!');
    console.log('Gas used:', receipt.gasUsed.toString());

    // Verify the role was granted
    const verified = await datasetRegistry.hasRole(
      ADMIN_ROLE,
      deploymentInfo.contracts.DatasetMarketplace
    );

    if (verified) {
      console.log('✅ ADMIN_ROLE successfully granted to marketplace');
    } else {
      console.error('❌ Role grant verification failed');
      process.exit(1);
    }

    console.log('\n🎉 Marketplace Permissions Fixed!');
    console.log('================================');
    console.log(
      'The DatasetMarketplace contract now has ADMIN_ROLE in DatasetRegistry'
    );
    console.log(
      'Users can now successfully purchase datasets and receive automatic access'
    );
    console.log('');
    console.log('You can now run: npm run demo:marketplace');
  } catch (error: any) {
    console.error('❌ Permission fix failed:', error.message);
    if (error.data) {
      console.error('Error data:', error.data);
    }
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
