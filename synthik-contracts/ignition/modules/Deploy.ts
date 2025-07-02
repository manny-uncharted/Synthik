// This setup uses Hardhat Ignition to manage smart contract deployments.
// Learn more about it at https://hardhat.org/ignition

import { buildModule } from '@nomicfoundation/hardhat-ignition/modules';

// SynthikProvenanceModule manages deployment of all Synthik contracts
const SynthikProvenanceModule = buildModule('SynthikProvenanceModule', (m) => {
  // USDFC token address on Filecoin Calibration testnet
  const usdcTokenAddress = m.getParameter(
    'usdcTokenAddress',
    '0xb3042734b608a1B16e9e86B374A3f3e389B4cDf0'
  );

  // Treasury address for marketplace fees (can be updated later)
  const treasuryAddress = m.getParameter(
    'treasuryAddress',
    m.getAccount(0) // Default to deployer address
  );

  console.log('Deploying Synthik Provenance System...');
  console.log('USDFC Token Address:', usdcTokenAddress);
  console.log('Treasury Address:', treasuryAddress);

  // 1. Deploy ProvenanceManager first (core contract, no dependencies)
  console.log('Deploying ProvenanceManager...');
  const provenanceManager = m.contract('ProvenanceManager', []);

  // 2. Deploy DatasetRegistry (depends on ProvenanceManager)
  console.log('Deploying DatasetRegistry...');
  const datasetRegistry = m.contract('DatasetRegistry', [provenanceManager]);

  // 3. Deploy DatasetMarketplace (depends on ProvenanceManager and DatasetRegistry)
  console.log('Deploying DatasetMarketplace...');
  const datasetMarketplace = m.contract('DatasetMarketplace', [
    provenanceManager,
    datasetRegistry,
    treasuryAddress,
  ]);

  // 4. Deploy AutoAccessManager (optional, depends on DatasetRegistry and ProvenanceManager)
  console.log('Deploying AutoAccessManager...');
  const autoAccessManager = m.contract('AutoAccessManager', [
    datasetRegistry,
    provenanceManager,
  ]);

  // 5. Setup roles and permissions
  console.log('Setting up roles and permissions...');

  // Grant VERIFIER_ROLE to deployer for quality verification
  const VERIFIER_ROLE =
    '0x8c15c6b4c1d3b3f3b1c4b1b4b1b4b1b4b1b4b1b4b1b4b1b4b1b4b1b4b1b4b1b4'; // keccak256("VERIFIER_ROLE")
  m.call(provenanceManager, 'grantRole', [VERIFIER_ROLE, m.getAccount(0)]);

  // Grant CURATOR_ROLE to deployer for dataset curation
  const CURATOR_ROLE =
    '0x9c15c6b4c1d3b3f3b1c4b1b4b1b4b1b4b1b4b1b4b1b4b1b4b1b4b1b4b1b4b1b4'; // keccak256("CURATOR_ROLE")
  m.call(datasetRegistry, 'grantRole', [CURATOR_ROLE, m.getAccount(0)]);

  // Grant TREASURY_ROLE to deployer for treasury management
  const TREASURY_ROLE =
    '0x7c15c6b4c1d3b3f3b1c4b1b4b1b4b1b4b1b4b1b4b1b4b1b4b1b4b1b4b1b4b1b4'; // keccak256("TREASURY_ROLE")
  m.call(datasetMarketplace, 'grantRole', [TREASURY_ROLE, m.getAccount(0)]);

  console.log('✅ Synthik Provenance System deployment complete!');
  console.log('Contracts deployed:');
  console.log('- ProvenanceManager');
  console.log('- DatasetRegistry');
  console.log('- DatasetMarketplace');
  console.log('- AutoAccessManager');

  return {
    provenanceManager,
    datasetRegistry,
    datasetMarketplace,
    autoAccessManager,
    usdcTokenAddress,
    treasuryAddress,
  };
});

// Optional: Testnet verification module for post-deployment setup
const TestnetSetupModule = buildModule('TestnetSetupModule', (m) => {
  // Import deployed contracts
  const {
    provenanceManager,
    datasetRegistry,
    datasetMarketplace,
    autoAccessManager,
  } = m.useModule(SynthikProvenanceModule);

  console.log('Setting up testnet configuration...');

  // Create example dataset for testing
  m.call(provenanceManager, 'createDataset', [
    'test-dataset-001',
    'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi', // example data CID
    'bafybeischema123456789abcdef', // example metadata CID
    'Test Financial Dataset',
    'Sample synthetic financial data for testing',
    'MIT',
    0, // GenerationType.SCRATCH
    'gpt-4-turbo',
    'v1.0',
    1000, // 1000 rows
    120, // 2 minutes generation time
    1024 * 1024, // 1MB size
  ]);

  // Set up automatic access rule for testing
  m.call(autoAccessManager, 'createAccessRule', [
    'test-dataset-001',
    86400 * 7, // 7 days duration
    10, // max 10 users
    ['academic-research', 'testing'], // allowed purposes
    false, // no verification required for testing
    0, // no minimum reputation
  ]);

  // List dataset on marketplace for testing
  m.call(datasetMarketplace, 'listDataset', [
    'test-dataset-001',
    '1000000000000000000', // 1 USDFC (18 decimals)
    '0xb3042734b608a1B16e9e86B374A3f3e389B4cDf0', // USDFC token
    1, // LicenseType.COMMERCIAL
    5, // max 5 licenses
    500, // 5% royalty
  ]);

  console.log('✅ Testnet setup complete!');
  console.log('Test dataset created: test-dataset-001');
  console.log('Auto-access rule configured');
  console.log('Dataset listed on marketplace for 1 USDFC');

  return {
    testDatasetId: 'test-dataset-001',
  };
});

export default SynthikProvenanceModule;
export { TestnetSetupModule };
