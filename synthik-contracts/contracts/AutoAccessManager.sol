// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "./DatasetRegistry.sol";
import "./ProvenanceManager.sol";

/**
 * @title AutoAccessManager
 * @dev Automated access management with rules-based granting
 */
contract AutoAccessManager is AccessControl {
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant DATASET_OWNER_ROLE = keccak256("DATASET_OWNER_ROLE");

    DatasetRegistry public immutable datasetRegistry;
    ProvenanceManager public immutable provenanceManager;

    struct AccessRule {
        bool isActive;
        uint256 maxDuration;        // Maximum access duration
        uint256 maxUsers;          // Maximum number of users (0 = unlimited)
        uint256 currentUsers;      // Current number of users with access
        string[] allowedPurposes;  // Allowed use cases
        bool requiresVerification; // Requires identity verification
        uint256 minReputation;     // Minimum user reputation score
    }

    struct UserProfile {
        bool isVerified;
        uint256 reputation;
        string institution;
        string[] previousWork;
        mapping(string => bool) allowedPurposes;
    }

    // Dataset ID => Access Rule
    mapping(string => AccessRule) public accessRules;
    
    // User address => Profile
    mapping(address => UserProfile) public userProfiles;
    
    // Dataset ID => Purpose => Allowed
    mapping(string => mapping(string => bool)) public allowedPurposes;

    // Events
    event AccessRuleCreated(
        string indexed datasetId,
        uint256 maxDuration,
        uint256 maxUsers
    );

    event AutoAccessGranted(
        string indexed datasetId,
        address indexed user,
        string purpose,
        uint256 duration
    );

    event AccessDenied(
        string indexed datasetId,
        address indexed user,
        string reason
    );

    event UserVerified(
        address indexed user,
        string institution
    );

    constructor(
        address _datasetRegistry,
        address _provenanceManager
    ) {
        datasetRegistry = DatasetRegistry(_datasetRegistry);
        provenanceManager = ProvenanceManager(_provenanceManager);
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ADMIN_ROLE, msg.sender);
    }

    /**
     * @dev Dataset owner sets up automatic access rules
     */
    function createAccessRule(
        string calldata datasetId,
        uint256 maxDuration,
        uint256 maxUsers,
        string[] calldata allowedPurposesList,
        bool requiresVerification,
        uint256 minReputation
    ) external {
        // Verify ownership through DatasetRegistry
        require(_isDatasetOwner(datasetId, msg.sender), "Not dataset owner");

        AccessRule storage rule = accessRules[datasetId];
        rule.isActive = true;
        rule.maxDuration = maxDuration;
        rule.maxUsers = maxUsers;
        rule.requiresVerification = requiresVerification;
        rule.minReputation = minReputation;
        rule.allowedPurposes = allowedPurposesList;

        // Set allowed purposes mapping for gas-efficient lookup
        for (uint256 i = 0; i < allowedPurposesList.length; i++) {
            allowedPurposes[datasetId][allowedPurposesList[i]] = true;
        }

        emit AccessRuleCreated(datasetId, maxDuration, maxUsers);
    }

    /**
     * @dev Automatically grant access if user meets criteria
     */
    function requestAutoAccess(
        string calldata datasetId,
        string calldata purpose
    ) external {
        AccessRule storage rule = accessRules[datasetId];
        require(rule.isActive, "No auto-access rule");

        // Check if purpose is allowed
        require(allowedPurposes[datasetId][purpose], "Purpose not allowed");

        // Check user limits
        if (rule.maxUsers > 0) {
            require(rule.currentUsers < rule.maxUsers, "User limit reached");
        }

        UserProfile storage profile = userProfiles[msg.sender];

        // Check verification requirement
        if (rule.requiresVerification) {
            require(profile.isVerified, "User not verified");
        }

        // Check reputation requirement
        require(profile.reputation >= rule.minReputation, "Insufficient reputation");

        // Grant access automatically
        uint256 duration = rule.maxDuration;
        datasetRegistry.grantAccess(datasetId, msg.sender, duration);
        
        rule.currentUsers++;

        emit AutoAccessGranted(datasetId, msg.sender, purpose, duration);
    }

    /**
     * @dev Batch auto-access for multiple users (e.g., university students)
     */
    function batchAutoAccess(
        string calldata datasetId,
        address[] calldata users,
        string calldata purpose
    ) external onlyRole(ADMIN_ROLE) {
        AccessRule storage rule = accessRules[datasetId];
        require(rule.isActive, "No auto-access rule");
        require(allowedPurposes[datasetId][purpose], "Purpose not allowed");

        address[] memory eligibleUsers = new address[](users.length);
        uint256 eligibleCount = 0;

        // Filter eligible users
        for (uint256 i = 0; i < users.length; i++) {
            UserProfile storage profile = userProfiles[users[i]];
            
            if ((!rule.requiresVerification || profile.isVerified) &&
                profile.reputation >= rule.minReputation) {
                eligibleUsers[eligibleCount] = users[i];
                eligibleCount++;
            }
        }

        // Resize array
        address[] memory finalUsers = new address[](eligibleCount);
        for (uint256 i = 0; i < eligibleCount; i++) {
            finalUsers[i] = eligibleUsers[i];
        }

        // Batch grant access
        datasetRegistry.batchGrantAccess(datasetId, finalUsers, rule.maxDuration);
        rule.currentUsers += eligibleCount;
    }

    /**
     * @dev Verify user for automatic access
     */
    function verifyUser(
        address user,
        string calldata institution,
        uint256 reputation,
        string[] calldata previousWork
    ) external onlyRole(ADMIN_ROLE) {
        UserProfile storage profile = userProfiles[user];
        profile.isVerified = true;
        profile.reputation = reputation;
        profile.institution = institution;
        profile.previousWork = previousWork;

        emit UserVerified(user, institution);
    }

    /**
     * @dev Set user's allowed purposes
     */
    function setUserPurposes(
        address user,
        string[] calldata purposes
    ) external onlyRole(ADMIN_ROLE) {
        UserProfile storage profile = userProfiles[user];
        
        for (uint256 i = 0; i < purposes.length; i++) {
            profile.allowedPurposes[purposes[i]] = true;
        }
    }

    /**
     * @dev Time-based automatic access (e.g., during conference periods)
     */
    function createTimedAccess(
        string calldata datasetId,
        uint256 startTime,
        uint256 endTime,
        string calldata purpose
    ) external {
        require(_isDatasetOwner(datasetId, msg.sender), "Not dataset owner");
        require(block.timestamp >= startTime && block.timestamp <= endTime, "Not in time window");
        
        // Anyone can access during this time window
        AccessRule storage rule = accessRules[datasetId];
        rule.isActive = true;
        rule.maxDuration = endTime - block.timestamp;
        rule.maxUsers = 0; // Unlimited
        rule.requiresVerification = false;
        rule.minReputation = 0;
        
        allowedPurposes[datasetId][purpose] = true;
    }

    /**
     * @dev Academic institution bulk verification
     */
    function verifyInstitution(
        address[] calldata users,
        string calldata institution,
        uint256 baseReputation
    ) external onlyRole(ADMIN_ROLE) {
        for (uint256 i = 0; i < users.length; i++) {
            UserProfile storage profile = userProfiles[users[i]];
            profile.isVerified = true;
            profile.institution = institution;
            profile.reputation = baseReputation;
            
            // Academic institutions get research purposes by default
            profile.allowedPurposes["academic-research"] = true;
            profile.allowedPurposes["educational-use"] = true;
            
            emit UserVerified(users[i], institution);
        }
    }

    /**
     * @dev Check if user can auto-access dataset
     */
    function canAutoAccess(
        string calldata datasetId,
        address user,
        string calldata purpose
    ) external view returns (bool, string memory reason) {
        AccessRule storage rule = accessRules[datasetId];
        
        if (!rule.isActive) {
            return (false, "No auto-access rule");
        }
        
        if (!allowedPurposes[datasetId][purpose]) {
            return (false, "Purpose not allowed");
        }
        
        if (rule.maxUsers > 0 && rule.currentUsers >= rule.maxUsers) {
            return (false, "User limit reached");
        }
        
        UserProfile storage profile = userProfiles[user];
        
        if (rule.requiresVerification && !profile.isVerified) {
            return (false, "User not verified");
        }
        
        if (profile.reputation < rule.minReputation) {
            return (false, "Insufficient reputation");
        }
        
        return (true, "");
    }

    /**
     * @dev Internal function to check dataset ownership
     */
    function _isDatasetOwner(
        string memory datasetId,
        address user
    ) internal view returns (bool) {
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
        return creator == user;
    }

    /**
     * @dev Disable auto-access rule
     */
    function disableAutoAccess(string calldata datasetId) external {
        require(_isDatasetOwner(datasetId, msg.sender), "Not dataset owner");
        accessRules[datasetId].isActive = false;
    }

    /**
     * @dev Get user profile
     */
    function getUserProfile(address user) external view returns (
        bool isVerified,
        uint256 reputation,
        string memory institution
    ) {
        UserProfile storage profile = userProfiles[user];
        return (profile.isVerified, profile.reputation, profile.institution);
    }
} 