import * as hre from 'hardhat';

async function main() {
  const [deployer] = await hre.ethers.getSigners();

  console.log('🚀 Deploying Synthik Provenance System to Filecoin Calibration');
  console.log('===========================================================');
  console.log('Deploying with account:', deployer.address);
  console.log(
    'Account balance:',
    hre.ethers.formatEther(
      await hre.ethers.provider.getBalance(deployer.address)
    ),
    'FIL'
  );

  // USDFC token address on Filecoin Calibration testnet
  const usdcTokenAddress = '0xb3042734b608a1B16e9e86B374A3f3e389B4cDf0';
  const treasuryAddress = deployer.address; // Use deployer as initial treasury

  console.log('USDFC Token Address:', usdcTokenAddress);
  console.log('Treasury Address:', treasuryAddress);

  try {
    // 1. Deploy ProvenanceManager (core contract, no dependencies)
    console.log('\n1. Deploying ProvenanceManager...');
    const ProvenanceManager = await hre.ethers.getContractFactory(
      'ProvenanceManager'
    );
    const provenanceManager = await ProvenanceManager.deploy();
    await provenanceManager.waitForDeployment();
    const provenanceManagerAddress = await provenanceManager.getAddress();
    console.log('✅ ProvenanceManager deployed to:', provenanceManagerAddress);

    // Wait between deployments for network stability
    await new Promise((resolve) => setTimeout(resolve, 10000));

    // 2. Deploy DatasetRegistry (depends on ProvenanceManager)
    console.log('\n2. Deploying DatasetRegistry...');
    const DatasetRegistry = await hre.ethers.getContractFactory(
      'DatasetRegistry'
    );
    const datasetRegistry = await DatasetRegistry.deploy(
      provenanceManagerAddress
    );
    await datasetRegistry.waitForDeployment();
    const datasetRegistryAddress = await datasetRegistry.getAddress();
    console.log('✅ DatasetRegistry deployed to:', datasetRegistryAddress);

    await new Promise((resolve) => setTimeout(resolve, 10000));

    // 3. Deploy DatasetMarketplace (depends on ProvenanceManager and DatasetRegistry)
    console.log('\n3. Deploying DatasetMarketplace...');
    const DatasetMarketplace = await hre.ethers.getContractFactory(
      'DatasetMarketplace'
    );
    const datasetMarketplace = await DatasetMarketplace.deploy(
      provenanceManagerAddress,
      datasetRegistryAddress,
      treasuryAddress
    );
    await datasetMarketplace.waitForDeployment();
    const datasetMarketplaceAddress = await datasetMarketplace.getAddress();
    console.log(
      '✅ DatasetMarketplace deployed to:',
      datasetMarketplaceAddress
    );

    await new Promise((resolve) => setTimeout(resolve, 10000));

    // 4. Deploy AutoAccessManager (optional, depends on DatasetRegistry and ProvenanceManager)
    console.log('\n4. Deploying AutoAccessManager...');
    const AutoAccessManager = await hre.ethers.getContractFactory(
      'AutoAccessManager'
    );
    const autoAccessManager = await AutoAccessManager.deploy(
      datasetRegistryAddress,
      provenanceManagerAddress
    );
    await autoAccessManager.waitForDeployment();
    const autoAccessManagerAddress = await autoAccessManager.getAddress();
    console.log('✅ AutoAccessManager deployed to:', autoAccessManagerAddress);

    // 5. Setup roles and permissions
    console.log('\n5. Setting up roles and permissions...');

    // Grant VERIFIER_ROLE to deployer for quality verification
    console.log('Granting VERIFIER_ROLE to deployer...');
    const VERIFIER_ROLE = hre.ethers.keccak256(
      hre.ethers.toUtf8Bytes('VERIFIER_ROLE')
    );
    const tx1 = await provenanceManager.grantRole(
      VERIFIER_ROLE,
      deployer.address
    );
    await tx1.wait();
    console.log('✅ VERIFIER_ROLE granted');

    await new Promise((resolve) => setTimeout(resolve, 5000));

    // Grant CURATOR_ROLE to deployer for dataset curation
    console.log('Granting CURATOR_ROLE to deployer...');
    const CURATOR_ROLE = hre.ethers.keccak256(
      hre.ethers.toUtf8Bytes('CURATOR_ROLE')
    );
    const tx2 = await datasetRegistry.grantRole(CURATOR_ROLE, deployer.address);
    await tx2.wait();
    console.log('✅ CURATOR_ROLE granted');

    await new Promise((resolve) => setTimeout(resolve, 5000));

    // Grant TREASURY_ROLE to deployer for treasury management
    console.log('Granting TREASURY_ROLE to deployer...');
    const TREASURY_ROLE = hre.ethers.keccak256(
      hre.ethers.toUtf8Bytes('TREASURY_ROLE')
    );
    const tx3 = await datasetMarketplace.grantRole(
      TREASURY_ROLE,
      deployer.address
    );
    await tx3.wait();
    console.log('✅ TREASURY_ROLE granted');

    // 6. Create test dataset for demonstration
    console.log('\n6. Creating test dataset...');
    try {
      const createTx = await provenanceManager.createDataset(
        'test-financial-dataset',
        'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi', // example data CID
        'bafybeischema123456789abcdef', // example metadata CID
        'Test Financial Dataset',
        'Sample synthetic financial data for testing on Filecoin Calibration',
        'MIT',
        0, // GenerationType.SCRATCH
        'gpt-4-turbo',
        'v1.0',
        1000, // 1000 rows
        120, // 2 minutes generation time
        1024 * 1024 // 1MB size
      );
      await createTx.wait();
      console.log('✅ Test dataset created: test-financial-dataset');

      await new Promise((resolve) => setTimeout(resolve, 5000));

      // Set up automatic access rule for testing
      console.log('Creating auto-access rule...');
      const accessTx = await autoAccessManager.createAccessRule(
        'test-financial-dataset',
        86400 * 7, // 7 days duration
        10, // max 10 users
        ['academic-research', 'testing'], // allowed purposes
        false, // no verification required for testing
        0 // no minimum reputation
      );
      await accessTx.wait();
      console.log('✅ Auto-access rule created');

      await new Promise((resolve) => setTimeout(resolve, 5000));

      // List dataset on marketplace for testing
      console.log('Listing dataset on marketplace...');
      const listTx = await datasetMarketplace.listDataset(
        'test-financial-dataset',
        hre.ethers.parseEther('1'), // 1 USDFC (assuming 18 decimals)
        usdcTokenAddress,
        1, // LicenseType.COMMERCIAL
        5, // max 5 licenses
        500 // 5% royalty (500 basis points)
      );
      await listTx.wait();
      console.log('✅ Dataset listed on marketplace for 1 USDFC');
    } catch (error) {
      console.log(
        '⚠️  Test dataset creation failed (this is optional):',
        error
      );
    }

    console.log('\n🎉 SYNTHIK PROVENANCE SYSTEM DEPLOYED SUCCESSFULLY!');
    console.log('=====================================================');
    console.log('Network: Filecoin Calibration Testnet');
    console.log('USDFC Token:', usdcTokenAddress);
    console.log('Treasury:', treasuryAddress);
    console.log('');
    console.log('📋 Contract Addresses:');
    console.log('ProvenanceManager:    ', provenanceManagerAddress);
    console.log('DatasetRegistry:      ', datasetRegistryAddress);
    console.log('DatasetMarketplace:   ', datasetMarketplaceAddress);
    console.log('AutoAccessManager:    ', autoAccessManagerAddress);
    console.log('');
    console.log('🔑 Roles Granted to Deployer:');
    console.log('- VERIFIER_ROLE (ProvenanceManager)');
    console.log('- CURATOR_ROLE (DatasetRegistry)');
    console.log('- TREASURY_ROLE (DatasetMarketplace)');
    console.log('');
    console.log('📊 Test Dataset Created:');
    console.log('- Dataset ID: test-financial-dataset');
    console.log('- Auto-access enabled for 7 days');
    console.log('- Listed on marketplace for 1 USDFC');
    console.log('=====================================================');

    // Save deployment info to file
    const deploymentInfo = {
      network: 'filecoin-calibration',
      timestamp: new Date().toISOString(),
      deployer: deployer.address,
      usdcToken: usdcTokenAddress,
      treasury: treasuryAddress,
      contracts: {
        ProvenanceManager: provenanceManagerAddress,
        DatasetRegistry: datasetRegistryAddress,
        DatasetMarketplace: datasetMarketplaceAddress,
        AutoAccessManager: autoAccessManagerAddress,
      },
      testDataset: 'test-financial-dataset',
    };

    const fs = require('fs');
    fs.writeFileSync(
      'deployments.json',
      JSON.stringify(deploymentInfo, null, 2)
    );
    console.log('💾 Deployment info saved to deployments.json');
  } catch (error: any) {
    console.error('❌ Deployment failed:', error.message);
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
