// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "./ProvenanceManager.sol";
import "./DatasetRegistry.sol";

/**
 * @title DatasetMarketplace
 * @dev Marketplace for trading and licensing synthetic datasets
 */
contract DatasetMarketplace is AccessControl, ReentrancyGuard, Pausable {
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant TREASURY_ROLE = keccak256("TREASURY_ROLE");

    ProvenanceManager public provenanceManager;
    DatasetRegistry public datasetRegistry;

    // Marketplace fee (basis points, e.g., 250 = 2.5%)
    uint256 public marketplaceFee = 250;
    address public treasury;

    // Pricing structures
    struct DatasetPricing {
        uint256 price;               // Fixed price in wei
        address paymentToken;        // ERC20 token address (0x0 for ETH)
        bool isActive;              // Is listing active
        uint256 maxLicenses;        // Max number of licenses (0 = unlimited)
        uint256 licensesIssued;     // Number of licenses issued
        LicenseType licenseType;    // Type of license
        uint256 royaltyPercentage;  // Royalty percentage (basis points)
    }

    struct License {
        string datasetId;
        address licensee;
        uint256 purchasedAt;
        uint256 expiresAt;
        LicenseType licenseType;
        uint256 pricePaid;
        string usageTerms;
    }

    struct Transaction {
        string datasetId;
        address buyer;
        address seller;
        uint256 amount;
        uint256 marketplaceFeeAmount;
        uint256 timestamp;
        address paymentToken;
        TransactionType transactionType;
    }

    enum LicenseType {
        PERSONAL,              // Personal use only
        COMMERCIAL,            // Commercial use allowed
        ACADEMIC,              // Academic/research use
        ENTERPRISE,            // Enterprise license
        CUSTOM                 // Custom terms
    }

    enum TransactionType {
        PURCHASE,              // One-time purchase
        SUBSCRIPTION,          // Subscription payment
        ROYALTY               // Royalty payment
    }

    // State variables
    mapping(string => DatasetPricing) public datasetPricing;
    mapping(string => License[]) public datasetLicenses;
    mapping(address => License[]) public userLicenses;
    mapping(string => Transaction[]) public datasetTransactions;
    mapping(string => uint256) public datasetRevenue;
    mapping(address => uint256) public userRevenue;
    
    uint256 public totalTransactions;
    uint256 public totalRevenue;

    // Events
    event DatasetListed(
        string indexed datasetId,
        uint256 price,
        LicenseType licenseType
    );

    event DatasetPurchased(
        string indexed datasetId,
        address indexed buyer,
        uint256 amount,
        LicenseType licenseType
    );

    event LicenseIssued(
        string indexed datasetId,
        address indexed licensee,
        uint256 licenseId,
        LicenseType licenseType
    );

    event RoyaltyPaid(
        string indexed datasetId,
        address indexed payer,
        uint256 amount
    );

    event MarketplaceFeeUpdated(
        uint256 oldFee,
        uint256 newFee
    );

    modifier onlyDatasetOwner(string memory datasetId) {
        (
            ,  // dataCid
            ,  // metadataCid
            address creator,
            ,  // createdAt
            ,  // updatedAt
            ,  // name
            ,  // description
            ,  // license
            ,  // status
            ,  // quality
            ,  // merkleRoot
            ,  // totalRows
            ,  // totalSize
               // isVerified
        ) = provenanceManager.getDataset(datasetId);
        require(creator == msg.sender || hasRole(ADMIN_ROLE, msg.sender), "Not authorized");
        _;
    }

    constructor(
        address _provenanceManager,
        address _datasetRegistry,
        address _treasury
    ) {
        require(_provenanceManager != address(0), "Invalid provenance manager");
        require(_datasetRegistry != address(0), "Invalid dataset registry");
        require(_treasury != address(0), "Invalid treasury");
        
        provenanceManager = ProvenanceManager(_provenanceManager);
        datasetRegistry = DatasetRegistry(_datasetRegistry);
        treasury = _treasury;
        
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ADMIN_ROLE, msg.sender);
    }

    /**
     * @dev List dataset for sale with fixed price
     */
    function listDataset(
        string memory datasetId,
        uint256 price,
        address paymentToken,
        LicenseType licenseType,
        uint256 maxLicenses,
        uint256 royaltyPercentage
    ) external onlyDatasetOwner(datasetId) whenNotPaused {
        require(price > 0, "Price must be greater than 0");
        require(royaltyPercentage <= 5000, "Royalty too high"); // Max 50%
        
        DatasetPricing storage pricing = datasetPricing[datasetId];
        pricing.price = price;
        pricing.paymentToken = paymentToken;
        pricing.isActive = true;
        pricing.maxLicenses = maxLicenses;
        pricing.licenseType = licenseType;
        pricing.royaltyPercentage = royaltyPercentage;

        emit DatasetListed(datasetId, price, licenseType);
    }

    /**
     * @dev Purchase dataset license
     */
    function purchaseDataset(
        string memory datasetId,
        string memory usageTerms
    ) external payable nonReentrant whenNotPaused {
        DatasetPricing storage pricing = datasetPricing[datasetId];
        require(pricing.isActive, "Dataset not for sale");
        require(
            pricing.maxLicenses == 0 || 
            pricing.licensesIssued < pricing.maxLicenses,
            "No licenses available"
        );

        // Get dataset creator
        (
            ,  // dataCid
            ,  // metadataCid
            address creator,
            ,  // createdAt
            ,  // updatedAt
            ,  // name
            ,  // description
            ,  // license
            ,  // status
            ,  // quality
            ,  // merkleRoot
            ,  // totalRows
            ,  // totalSize
               // isVerified
        ) = provenanceManager.getDataset(datasetId);
        
        uint256 totalPrice = pricing.price;

        // Handle payment
        if (pricing.paymentToken == address(0)) {
            require(msg.value >= totalPrice, "Insufficient payment");
            if (msg.value > totalPrice) {
                payable(msg.sender).transfer(msg.value - totalPrice);
            }
        } else {
            IERC20(pricing.paymentToken).transferFrom(
                msg.sender,
                address(this),
                totalPrice
            );
        }

        // Calculate fees and distribute payment
        uint256 feeAmount = (totalPrice * marketplaceFee) / 10000;
        uint256 sellerAmount = totalPrice - feeAmount;

        if (pricing.paymentToken == address(0)) {
            payable(treasury).transfer(feeAmount);
            payable(creator).transfer(sellerAmount);
        } else {
            IERC20(pricing.paymentToken).transfer(treasury, feeAmount);
            IERC20(pricing.paymentToken).transfer(creator, sellerAmount);
        }

        // Issue license
        License memory license = License({
            datasetId: datasetId,
            licensee: msg.sender,
            purchasedAt: block.timestamp,
            expiresAt: 0, // Permanent license
            licenseType: pricing.licenseType,
            pricePaid: totalPrice,
            usageTerms: usageTerms
        });

        datasetLicenses[datasetId].push(license);
        userLicenses[msg.sender].push(license);
        pricing.licensesIssued++;

        // Record transaction
        Transaction memory transaction = Transaction({
            datasetId: datasetId,
            buyer: msg.sender,
            seller: creator,
            amount: totalPrice,
            marketplaceFeeAmount: feeAmount,
            timestamp: block.timestamp,
            paymentToken: pricing.paymentToken,
            transactionType: TransactionType.PURCHASE
        });

        datasetTransactions[datasetId].push(transaction);
        datasetRevenue[datasetId] += sellerAmount;
        userRevenue[creator] += sellerAmount;
        totalTransactions++;
        totalRevenue += totalPrice;

        // Grant access in registry
        datasetRegistry.grantAccess(datasetId, msg.sender, 0); // Permanent access

        emit DatasetPurchased(datasetId, msg.sender, totalPrice, pricing.licenseType);
        emit LicenseIssued(
            datasetId, 
            msg.sender, 
            datasetLicenses[datasetId].length - 1,
            pricing.licenseType
        );
    }

    /**
     * @dev Update dataset price
     */
    function updatePrice(
        string memory datasetId,
        uint256 newPrice
    ) external onlyDatasetOwner(datasetId) whenNotPaused {
        require(newPrice > 0, "Price must be greater than 0");
        require(datasetPricing[datasetId].isActive, "Dataset not listed");
        
        datasetPricing[datasetId].price = newPrice;
        emit DatasetListed(datasetId, newPrice, datasetPricing[datasetId].licenseType);
    }

    /**
     * @dev Delist dataset from marketplace
     */
    function delistDataset(
        string memory datasetId
    ) external onlyDatasetOwner(datasetId) {
        datasetPricing[datasetId].isActive = false;
    }

    /**
     * @dev Pay royalties for dataset usage
     */
    function payRoyalty(
        string memory datasetId,
        uint256 amount
    ) external payable nonReentrant whenNotPaused {
        DatasetPricing storage pricing = datasetPricing[datasetId];
        require(pricing.royaltyPercentage > 0, "No royalty required");

        (
            ,  // dataCid
            ,  // metadataCid
            address creator,
            ,  // createdAt
            ,  // updatedAt
            ,  // name
            ,  // description
            ,  // license
            ,  // status
            ,  // quality
            ,  // merkleRoot
            ,  // totalRows
            ,  // totalSize
               // isVerified
        ) = provenanceManager.getDataset(datasetId);

        // Transfer royalty payment
        if (pricing.paymentToken == address(0)) {
            require(msg.value >= amount, "Insufficient payment");
            payable(creator).transfer(amount);
        } else {
            IERC20(pricing.paymentToken).transferFrom(
                msg.sender,
                creator,
                amount
            );
        }

        // Record transaction
        Transaction memory transaction = Transaction({
            datasetId: datasetId,
            buyer: msg.sender,
            seller: creator,
            amount: amount,
            marketplaceFeeAmount: 0,
            timestamp: block.timestamp,
            paymentToken: pricing.paymentToken,
            transactionType: TransactionType.ROYALTY
        });

        datasetTransactions[datasetId].push(transaction);
        datasetRevenue[datasetId] += amount;
        userRevenue[creator] += amount;

        emit RoyaltyPaid(datasetId, msg.sender, amount);
    }

    /**
     * @dev Update marketplace fee
     */
    function updateMarketplaceFee(uint256 newFee) external onlyRole(ADMIN_ROLE) {
        require(newFee <= 1000, "Fee too high"); // Max 10%
        uint256 oldFee = marketplaceFee;
        marketplaceFee = newFee;
        emit MarketplaceFeeUpdated(oldFee, newFee);
    }

    /**
     * @dev Check if user has valid license
     */
    function hasValidLicense(
        string memory datasetId,
        address user
    ) external view returns (bool) {
        License[] memory licenses = userLicenses[user];
        
        for (uint i = 0; i < licenses.length; i++) {
            if (keccak256(bytes(licenses[i].datasetId)) == keccak256(bytes(datasetId))) {
                if (licenses[i].expiresAt == 0 || licenses[i].expiresAt > block.timestamp) {
                    return true;
                }
            }
        }
        
        return false;
    }

    /**
     * @dev Get dataset licenses
     */
    function getDatasetLicenses(
        string memory datasetId
    ) external view returns (License[] memory) {
        return datasetLicenses[datasetId];
    }

    /**
     * @dev Get user licenses
     */
    function getUserLicenses(
        address user
    ) external view returns (License[] memory) {
        return userLicenses[user];
    }

    /**
     * @dev Get dataset transactions
     */
    function getDatasetTransactions(
        string memory datasetId
    ) external view returns (Transaction[] memory) {
        return datasetTransactions[datasetId];
    }

    /**
     * @dev Get marketplace statistics
     */
    function getMarketplaceStats() external view returns (
        uint256 _totalTransactions,
        uint256 _totalRevenue,
        uint256 _marketplaceFee
    ) {
        return (totalTransactions, totalRevenue, marketplaceFee);
    }

    /**
     * @dev Emergency pause
     */
    function pause() external onlyRole(ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(ADMIN_ROLE) {
        _unpause();
    }

    /**
     * @dev Update treasury address
     */
    function updateTreasury(address newTreasury) external onlyRole(TREASURY_ROLE) {
        require(newTreasury != address(0), "Invalid treasury");
        treasury = newTreasury;
    }
} 