// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "./ProvenanceManager.sol";

/**
 * @title DatasetRegistry
 * @dev Optimized registry for dataset access control and relationship management
 */
contract DatasetRegistry is AccessControl, ReentrancyGuard {
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant CURATOR_ROLE = keccak256("CURATOR_ROLE");

    ProvenanceManager public immutable provenanceManager;

    // Access control structures
    struct AccessRequest {
        address requester;
        string datasetId;
        string purpose;
        uint256 requestedAt;
        bool approved;
        uint256 approvedAt;
        uint256 expiresAt;
    }

    struct DatasetRelationship {
        string sourceDatasetId;
        string targetDatasetId;
        RelationType relationType;
        string metadata;
        uint256 createdAt;
    }

    enum RelationType {
        DERIVED_FROM,      // Target is derived from source
        AUGMENTS,          // Target augments source
        VALIDATES,         // Target validates source
        REPLACES,          // Target replaces source
        COMPLEMENTS        // Target complements source
    }

    // Optimized state variables using packed structs and mappings
    mapping(string => mapping(address => uint256)) public accessExpiry; // 0 = no access, timestamp = expiry
    mapping(string => AccessRequest[]) public accessRequests;
    mapping(string => DatasetRelationship[]) public datasetRelationships;
    mapping(string => string[]) public datasetCollections;
    mapping(string => mapping(string => bool)) public isInCollection;
    
    // Counters for gas-efficient enumeration
    uint256 public accessRequestCount;
    uint256 public relationshipCount;

    // Events
    event AccessRequested(
        string indexed datasetId,
        address indexed requester,
        string purpose
    );

    event AccessGranted(
        string indexed datasetId,
        address indexed user,
        uint256 expiresAt
    );

    event AccessRevoked(
        string indexed datasetId,
        address indexed user
    );

    event BatchAccessGranted(
        string indexed datasetId,
        address[] users,
        uint256 expiresAt
    );

    event RelationshipCreated(
        string indexed sourceDatasetId,
        string indexed targetDatasetId,
        RelationType relationType
    );

    event CollectionCreated(
        string indexed collectionId,
        string name,
        address creator
    );

    event DatasetAddedToCollection(
        string indexed collectionId,
        string indexed datasetId
    );

    constructor(address _provenanceManager) {
        require(_provenanceManager != address(0), "Invalid provenance manager");
        provenanceManager = ProvenanceManager(_provenanceManager);
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ADMIN_ROLE, msg.sender);
    }

    /**
     * @dev Request access to a dataset
     */
    function requestAccess(
        string calldata datasetId,
        string calldata purpose
    ) external nonReentrant {
        require(accessExpiry[datasetId][msg.sender] == 0, "Already has access");
        
        accessRequests[datasetId].push(AccessRequest({
            requester: msg.sender,
            datasetId: datasetId,
            purpose: purpose,
            requestedAt: block.timestamp,
            approved: false,
            approvedAt: 0,
            expiresAt: 0
        }));
        
        unchecked {
            accessRequestCount++;
        }

        emit AccessRequested(datasetId, msg.sender, purpose);
    }

    /**
     * @dev Grant access to a dataset with optimized storage
     */
    function grantAccess(
        string calldata datasetId,
        address user,
        uint256 duration
    ) external {
        require(
            _isDatasetOwner(datasetId, msg.sender) || 
            hasRole(ADMIN_ROLE, msg.sender),
            "Not authorized"
        );

        uint256 expiresAt = duration == 0 ? type(uint256).max : block.timestamp + duration;
        accessExpiry[datasetId][user] = expiresAt;

        // Update access request if exists
        _updateAccessRequest(datasetId, user, expiresAt);

        emit AccessGranted(datasetId, user, expiresAt);
    }

    /**
     * @dev Batch grant access for gas efficiency
     */
    function batchGrantAccess(
        string calldata datasetId,
        address[] calldata users,
        uint256 duration
    ) external {
        require(
            _isDatasetOwner(datasetId, msg.sender) || 
            hasRole(ADMIN_ROLE, msg.sender),
            "Not authorized"
        );

        uint256 expiresAt = duration == 0 ? type(uint256).max : block.timestamp + duration;
        
        for (uint256 i = 0; i < users.length;) {
            accessExpiry[datasetId][users[i]] = expiresAt;
            unchecked { i++; }
        }

        emit BatchAccessGranted(datasetId, users, expiresAt);
    }

    /**
     * @dev Revoke access to a dataset
     */
    function revokeAccess(
        string calldata datasetId,
        address user
    ) external {
        require(
            _isDatasetOwner(datasetId, msg.sender) || 
            hasRole(ADMIN_ROLE, msg.sender),
            "Not authorized"
        );

        delete accessExpiry[datasetId][user];
        emit AccessRevoked(datasetId, user);
    }

    /**
     * @dev Batch revoke access
     */
    function batchRevokeAccess(
        string calldata datasetId,
        address[] calldata users
    ) external {
        require(
            _isDatasetOwner(datasetId, msg.sender) || 
            hasRole(ADMIN_ROLE, msg.sender),
            "Not authorized"
        );

        for (uint256 i = 0; i < users.length;) {
            delete accessExpiry[datasetId][users[i]];
            emit AccessRevoked(datasetId, users[i]);
            unchecked { i++; }
        }
    }

    /**
     * @dev Create relationship between datasets
     */
    function createRelationship(
        string calldata sourceDatasetId,
        string calldata targetDatasetId,
        RelationType relationType,
        string calldata metadata
    ) external {
        require(
            _isDatasetOwner(sourceDatasetId, msg.sender) ||
            _isDatasetOwner(targetDatasetId, msg.sender) ||
            hasRole(CURATOR_ROLE, msg.sender),
            "Not authorized"
        );

        datasetRelationships[sourceDatasetId].push(DatasetRelationship({
            sourceDatasetId: sourceDatasetId,
            targetDatasetId: targetDatasetId,
            relationType: relationType,
            metadata: metadata,
            createdAt: block.timestamp
        }));
        
        unchecked {
            relationshipCount++;
        }

        emit RelationshipCreated(sourceDatasetId, targetDatasetId, relationType);
    }

    /**
     * @dev Create a collection of datasets
     */
    function createCollection(
        string calldata collectionId,
        string calldata name,
        string[] calldata datasetIds
    ) external {
        require(datasetCollections[collectionId].length == 0, "Collection exists");

        for (uint256 i = 0; i < datasetIds.length;) {
            require(
                _isDatasetOwner(datasetIds[i], msg.sender) ||
                hasRole(CURATOR_ROLE, msg.sender),
                "Not authorized for dataset"
            );
            
            datasetCollections[collectionId].push(datasetIds[i]);
            isInCollection[collectionId][datasetIds[i]] = true;
            
            emit DatasetAddedToCollection(collectionId, datasetIds[i]);
            unchecked { i++; }
        }

        emit CollectionCreated(collectionId, name, msg.sender);
    }

    /**
     * @dev Add dataset to collection
     */
    function addToCollection(
        string calldata collectionId,
        string calldata datasetId
    ) external {
        require(datasetCollections[collectionId].length > 0, "Collection not found");
        require(!isInCollection[collectionId][datasetId], "Already in collection");
        require(
            _isDatasetOwner(datasetId, msg.sender) ||
            hasRole(CURATOR_ROLE, msg.sender),
            "Not authorized"
        );

        datasetCollections[collectionId].push(datasetId);
        isInCollection[collectionId][datasetId] = true;

        emit DatasetAddedToCollection(collectionId, datasetId);
    }

    /**
     * @dev Optimized search datasets by criteria
     */
    function searchDatasets(
        ProvenanceManager.GenerationType generationType,
        ProvenanceManager.QualityLevel minQuality,
        uint256 minRows,
        uint256 maxRows
    ) external view returns (string[] memory) {
        string[] memory allIds = provenanceManager.getAllDatasetIds();
        uint256 resultCount = 0;
        
        // First pass: count matching datasets
        for (uint256 i = 0; i < allIds.length;) {
            if (_matchesCriteria(allIds[i], generationType, minQuality, minRows, maxRows)) {
                resultCount++;
            }
            unchecked { i++; }
        }
        
        // Second pass: populate results
        string[] memory results = new string[](resultCount);
        uint256 resultIndex = 0;
        
        for (uint256 i = 0; i < allIds.length;) {
            if (_matchesCriteria(allIds[i], generationType, minQuality, minRows, maxRows)) {
                results[resultIndex] = allIds[i];
                unchecked { resultIndex++; }
            }
            unchecked { i++; }
        }
        
        return results;
    }

    /**
     * @dev Check if user has valid access (optimized)
     */
    function checkAccess(
        string calldata datasetId,
        address user
    ) external view returns (bool) {
        uint256 expiry = accessExpiry[datasetId][user];
        return expiry > block.timestamp || expiry == type(uint256).max;
    }

    /**
     * @dev Get access expiry timestamp
     */
    function getAccessExpiry(
        string calldata datasetId,
        address user
    ) external view returns (uint256) {
        return accessExpiry[datasetId][user];
    }

    /**
     * @dev Get datasets in collection
     */
    function getCollectionDatasets(
        string calldata collectionId
    ) external view returns (string[] memory) {
        return datasetCollections[collectionId];
    }

    /**
     * @dev Get dataset relationships
     */
    function getDatasetRelationships(
        string calldata datasetId
    ) external view returns (DatasetRelationship[] memory) {
        return datasetRelationships[datasetId];
    }

    /**
     * @dev Get access requests for dataset
     */
    function getAccessRequests(
        string calldata datasetId
    ) external view returns (AccessRequest[] memory) {
        return accessRequests[datasetId];
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
     * @dev Internal function to check if dataset matches search criteria
     */
    function _matchesCriteria(
        string memory datasetId,
        ProvenanceManager.GenerationType generationType,
        ProvenanceManager.QualityLevel minQuality,
        uint256 minRows,
        uint256 maxRows
    ) internal view returns (bool) {
        (,,,,,,,, ProvenanceManager.DatasetStatus status, ProvenanceManager.QualityLevel quality,, uint256 totalRows,,) = provenanceManager.getDataset(datasetId);
        
        if (status != ProvenanceManager.DatasetStatus.READY || quality < minQuality || totalRows < minRows || totalRows > maxRows) {
            return false;
        }

        (,,,ProvenanceManager.GenerationType datasetGenType,,) = provenanceManager.getGenerationConfig(datasetId);
        return datasetGenType == generationType;
    }

    /**
     * @dev Internal function to update access request
     */
    function _updateAccessRequest(
        string memory datasetId,
        address user,
        uint256 expiresAt
    ) internal {
        AccessRequest[] storage requests = accessRequests[datasetId];
        uint256 length = requests.length;
        
        for (uint256 i = 0; i < length;) {
            if (requests[i].requester == user && !requests[i].approved) {
                requests[i].approved = true;
                requests[i].approvedAt = block.timestamp;
                requests[i].expiresAt = expiresAt;
                break;
            }
            unchecked { i++; }
        }
    }
} 