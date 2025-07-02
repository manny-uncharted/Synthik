// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import "@openzeppelin/contracts/security/Pausable.sol";

/**
 * @title ProvenanceManager
 * @dev Main contract for managing synthetic data provenance and lineage tracking
 */
contract ProvenanceManager is AccessControl, ReentrancyGuard, Pausable {
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant VERIFIER_ROLE = keccak256("VERIFIER_ROLE");
    bytes32 public constant GENERATOR_ROLE = keccak256("GENERATOR_ROLE");

    // Enums
    enum GenerationType { 
        SCRATCH,           // Generated from scratch
        AUGMENTED,         // Augmented from existing data
        TEMPLATE,          // Generated from template
        TRANSFORM,         // Transformed/Anonymized
        HYBRID             // Combination of methods
    }

    enum DatasetStatus {
        DRAFT,
        GENERATING,
        READY,
        DEPRECATED,
        FAILED
    }

    enum QualityLevel {
        UNVERIFIED,
        BASIC,
        STANDARD,
        HIGH,
        PREMIUM
    }

    // Structs
    struct GenerationConfig {
        string modelId;                 // AI model used for generation
        string modelVersion;            // Model version
        uint256 rowCount;              // Number of rows generated
        GenerationType generationType;
        uint256 generationTime;        // Time taken to generate
        uint256 estimatedCost;         // Cost of generation
    }

    struct Dataset {
        string dataCid;                // IPFS/Filecoin CID of actual data
        string metadataCid;            // IPFS CID containing schema, config, and other metadata
        address creator;               // Dataset creator
        uint256 createdAt;             // Creation timestamp
        uint256 updatedAt;             // Last update timestamp
        string name;                   // Dataset name
        string description;            // Dataset description
        string license;                // License type
        DatasetStatus status;          // Current status
        QualityLevel quality;          // Quality level
        bytes32 merkleRoot;           // Merkle root of dataset rows
        uint256 totalRows;            // Total number of rows
        uint256 totalSize;            // Total size in bytes
        bool isVerified;              // Verification status
        GenerationConfig generationConfig; // Generation configuration
    }

    struct ModelTraining {
        string modelId;                // Trained model ID
        string datasetId;              // Dataset used for training
        address trainer;               // Who trained the model
        uint256 trainedAt;            // Training timestamp
        string trainingConfigCid;      // IPFS CID of training config
        uint256 epochs;               // Number of epochs
        uint256 accuracy;             // Accuracy percentage (basis points)
        string metricsCid;            // IPFS CID of detailed metrics
        string resultCid;             // CID of trained model
    }

    struct DatasetUsage {
        string modelId;               // Model that used the dataset
        address user;                 // User who used the dataset
        uint256 usedAt;              // Usage timestamp
        string purpose;              // Purpose of usage
        string resultsCid;           // CID of results/metrics
    }

    struct QualityMetrics {
        uint256 completeness;        // Data completeness score (0-10000)
        uint256 consistency;         // Data consistency score (0-10000)
        uint256 accuracy;           // Data accuracy score (0-10000)
        uint256 uniqueness;         // Data uniqueness score (0-10000)
        uint256 timeliness;         // Data timeliness score (0-10000)
        string validationReportCid;  // IPFS CID of validation report
        address validator;          // Who validated the metrics
        uint256 validatedAt;       // Validation timestamp
    }

    // State variables - using private mappings with getter functions
    mapping(string => Dataset) private _datasets;
    mapping(string => ModelTraining[]) public modelTrainings;
    mapping(string => DatasetUsage[]) public datasetUsages;
    mapping(string => QualityMetrics) public qualityMetrics;
    mapping(string => string[]) public datasetLineage; // parent datasets
    mapping(address => string[]) public userDatasets;
    mapping(string => mapping(address => bool)) public datasetAccess;
    mapping(string => string[]) public datasetTags;
    mapping(string => mapping(string => string)) public generationParameters; // datasetId => key => value
    
    string[] public allDatasetIds;
    uint256 public datasetCount;
    uint256 public totalDataGenerated; // Total size of all data generated

    // Events
    event DatasetCreated(
        string indexed datasetId,
        address indexed creator,
        GenerationType generationType,
        string dataCid,
        string metadataCid
    );

    event DatasetUpdated(
        string indexed datasetId,
        string newDataCid,
        string newMetadataCid,
        uint256 timestamp
    );

    event ModelTrained(
        string indexed modelId,
        string indexed datasetId,
        address indexed trainer,
        uint256 accuracy
    );

    event DatasetUsed(
        string indexed datasetId,
        string indexed modelId,
        address indexed user,
        string purpose
    );

    event QualityVerified(
        string indexed datasetId,
        address indexed validator,
        QualityLevel quality
    );

    event LineageLinked(
        string indexed childDatasetId,
        string indexed parentDatasetId
    );

    event TagAdded(
        string indexed datasetId,
        string tag
    );

    // Modifiers
    modifier onlyDatasetCreator(string memory datasetId) {
        require(
            _datasets[datasetId].creator == msg.sender || 
            hasRole(ADMIN_ROLE, msg.sender),
            "Not dataset creator"
        );
        _;
    }

    modifier datasetExists(string memory datasetId) {
        require(bytes(_datasets[datasetId].dataCid).length > 0, "Dataset not found");
        _;
    }

    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ADMIN_ROLE, msg.sender);
    }

    /**
     * @dev Create a new dataset with provenance tracking
     * @param datasetId Unique identifier for the dataset
     * @param dataCid IPFS/Filecoin CID of the actual dataset
     * @param metadataCid IPFS CID containing schema, generation config, and other metadata
     */
    function createDataset(
        string memory datasetId,
        string memory dataCid,
        string memory metadataCid,
        string memory name,
        string memory description,
        string memory license,
        GenerationType generationType,
        string memory modelId,
        string memory modelVersion,
        uint256 rowCount,
        uint256 generationTime,
        uint256 totalSize
    ) external whenNotPaused nonReentrant {
        require(bytes(datasetId).length > 0, "Invalid dataset ID");
        require(bytes(_datasets[datasetId].dataCid).length == 0, "Dataset already exists");
        require(bytes(dataCid).length > 0, "Invalid data CID");
        require(bytes(metadataCid).length > 0, "Invalid metadata CID");

        Dataset storage dataset = _datasets[datasetId];
        dataset.dataCid = dataCid;
        dataset.metadataCid = metadataCid;
        dataset.creator = msg.sender;
        dataset.createdAt = block.timestamp;
        dataset.updatedAt = block.timestamp;
        dataset.name = name;
        dataset.description = description;
        dataset.license = license;
        dataset.status = DatasetStatus.READY;
        dataset.quality = QualityLevel.UNVERIFIED;
        dataset.totalRows = rowCount;
        dataset.totalSize = totalSize;
        dataset.isVerified = false;

        // Set generation config
        dataset.generationConfig.modelId = modelId;
        dataset.generationConfig.modelVersion = modelVersion;
        dataset.generationConfig.rowCount = rowCount;
        dataset.generationConfig.generationType = generationType;
        dataset.generationConfig.generationTime = generationTime;

        allDatasetIds.push(datasetId);
        userDatasets[msg.sender].push(datasetId);
        datasetCount++;
        totalDataGenerated += totalSize;

        emit DatasetCreated(datasetId, msg.sender, generationType, dataCid, metadataCid);
    }

    /**
     * @dev Add generation parameters to dataset
     */
    function addGenerationParameter(
        string memory datasetId,
        string memory key,
        string memory value
    ) external onlyDatasetCreator(datasetId) {
        generationParameters[datasetId][key] = value;
    }

    /**
     * @dev Set generation parameters CID (stored on Filecoin/IPFS)
     * This is more efficient than storing individual parameters on-chain
     */
    function setGenerationParametersCID(
        string memory datasetId,
        string memory parametersCID
    ) external onlyDatasetCreator(datasetId) {
        require(bytes(parametersCID).length > 0, "Invalid parameters CID");
        generationParameters[datasetId]["parameters_cid"] = parametersCID;
    }

    /**
     * @dev Get generation parameters CID
     */
    function getGenerationParametersCID(
        string memory datasetId
    ) external view returns (string memory) {
        return generationParameters[datasetId]["parameters_cid"];
    }

    /**
     * @dev Set rich tags metadata CID (for complex tag structures)
     * Use this when you need hierarchical tags, descriptions, categories, etc.
     */
    function setTagsMetadataCID(
        string memory datasetId,
        string memory tagsCID
    ) external onlyDatasetCreator(datasetId) {
        require(bytes(tagsCID).length > 0, "Invalid tags CID");
        generationParameters[datasetId]["tags_metadata_cid"] = tagsCID;
    }

    /**
     * @dev Get tags metadata CID
     */
    function getTagsMetadataCID(
        string memory datasetId
    ) external view returns (string memory) {
        return generationParameters[datasetId]["tags_metadata_cid"];
    }

    /**
     * @dev Link parent datasets for lineage tracking
     */
    function linkDatasetLineage(
        string memory childDatasetId,
        string[] memory parentDatasetIds
    ) external onlyDatasetCreator(childDatasetId) {
        require(parentDatasetIds.length > 0, "No parent datasets");
        
        for (uint i = 0; i < parentDatasetIds.length; i++) {
            require(bytes(_datasets[parentDatasetIds[i]].dataCid).length > 0, "Parent dataset not found");
            datasetLineage[childDatasetId].push(parentDatasetIds[i]);
            emit LineageLinked(childDatasetId, parentDatasetIds[i]);
        }
    }

    /**
     * @dev Record model training with dataset
     */
    function recordModelTraining(
        string memory modelId,
        string memory datasetId,
        string memory trainingConfigCid,
        uint256 epochs,
        uint256 accuracy,
        string memory metricsCid,
        string memory resultCid
    ) external datasetExists(datasetId) whenNotPaused {
        ModelTraining memory training = ModelTraining({
            modelId: modelId,
            datasetId: datasetId,
            trainer: msg.sender,
            trainedAt: block.timestamp,
            trainingConfigCid: trainingConfigCid,
            epochs: epochs,
            accuracy: accuracy,
            metricsCid: metricsCid,
            resultCid: resultCid
        });

        modelTrainings[datasetId].push(training);
        emit ModelTrained(modelId, datasetId, msg.sender, accuracy);
    }

    /**
     * @dev Record dataset usage
     */
    function recordDatasetUsage(
        string memory datasetId,
        string memory modelId,
        string memory purpose,
        string memory resultsCid
    ) external datasetExists(datasetId) whenNotPaused {
        DatasetUsage memory usage = DatasetUsage({
            modelId: modelId,
            user: msg.sender,
            usedAt: block.timestamp,
            purpose: purpose,
            resultsCid: resultsCid
        });

        datasetUsages[datasetId].push(usage);
        emit DatasetUsed(datasetId, modelId, msg.sender, purpose);
    }

    /**
     * @dev Update dataset merkle root for verification
     */
    function updateDatasetMerkleRoot(
        string memory datasetId,
        bytes32 merkleRoot
    ) external onlyDatasetCreator(datasetId) {
        _datasets[datasetId].merkleRoot = merkleRoot;
        _datasets[datasetId].updatedAt = block.timestamp;
    }

    /**
     * @dev Verify data row using merkle proof
     */
    function verifyDataRow(
        string memory datasetId,
        bytes32 leaf,
        bytes32[] calldata proof
    ) external view returns (bool) {
        return MerkleProof.verify(proof, _datasets[datasetId].merkleRoot, leaf);
    }

    /**
     * @dev Submit quality metrics for dataset
     */
    function submitQualityMetrics(
        string memory datasetId,
        uint256 completeness,
        uint256 consistency,
        uint256 accuracy,
        uint256 uniqueness,
        uint256 timeliness,
        string memory validationReportCid
    ) external onlyRole(VERIFIER_ROLE) datasetExists(datasetId) {
        require(completeness <= 10000 && consistency <= 10000 && 
                accuracy <= 10000 && uniqueness <= 10000 && 
                timeliness <= 10000, "Invalid metric values");

        QualityMetrics memory metrics = QualityMetrics({
            completeness: completeness,
            consistency: consistency,
            accuracy: accuracy,
            uniqueness: uniqueness,
            timeliness: timeliness,
            validationReportCid: validationReportCid,
            validator: msg.sender,
            validatedAt: block.timestamp
        });

        qualityMetrics[datasetId] = metrics;
        
        // Calculate overall quality level
        uint256 avgScore = (completeness + consistency + accuracy + uniqueness + timeliness) / 5;
        
        if (avgScore >= 9000) {
            _datasets[datasetId].quality = QualityLevel.PREMIUM;
        } else if (avgScore >= 7500) {
            _datasets[datasetId].quality = QualityLevel.HIGH;
        } else if (avgScore >= 5000) {
            _datasets[datasetId].quality = QualityLevel.STANDARD;
        } else {
            _datasets[datasetId].quality = QualityLevel.BASIC;
        }
        
        _datasets[datasetId].isVerified = true;
        emit QualityVerified(datasetId, msg.sender, _datasets[datasetId].quality);
    }

    /**
     * @dev Get dataset basic info (without nested mappings)
     */
    function getDataset(string memory datasetId) external view returns (
        string memory dataCid,
        string memory metadataCid,
        address creator,
        uint256 createdAt,
        uint256 updatedAt,
        string memory name,
        string memory description,
        string memory license,
        DatasetStatus status,
        QualityLevel quality,
        bytes32 merkleRoot,
        uint256 totalRows,
        uint256 totalSize,
        bool isVerified
    ) {
        Dataset storage dataset = _datasets[datasetId];
        return (
            dataset.dataCid,
            dataset.metadataCid,
            dataset.creator,
            dataset.createdAt,
            dataset.updatedAt,
            dataset.name,
            dataset.description,
            dataset.license,
            dataset.status,
            dataset.quality,
            dataset.merkleRoot,
            dataset.totalRows,
            dataset.totalSize,
            dataset.isVerified
        );
    }

    /**
     * @dev Get dataset generation config
     */
    function getGenerationConfig(string memory datasetId) external view returns (
        string memory modelId,
        string memory modelVersion,
        uint256 rowCount,
        GenerationType generationType,
        uint256 generationTime,
        uint256 estimatedCost
    ) {
        GenerationConfig storage config = _datasets[datasetId].generationConfig;
        return (
            config.modelId,
            config.modelVersion,
            config.rowCount,
            config.generationType,
            config.generationTime,
            config.estimatedCost
        );
    }

    /**
     * @dev Get dataset tags
     */
    function getDatasetTags(string memory datasetId) external view returns (string[] memory) {
        return datasetTags[datasetId];
    }

    /**
     * @dev Get complete lineage tree for a dataset
     */
    function getDatasetLineage(string memory datasetId) 
        external 
        view 
        returns (string[] memory) 
    {
        return datasetLineage[datasetId];
    }

    /**
     * @dev Get all models trained with a dataset
     */
    function getModelTrainings(string memory datasetId) 
        external 
        view 
        returns (ModelTraining[] memory) 
    {
        return modelTrainings[datasetId];
    }

    /**
     * @dev Get all usage records for a dataset
     */
    function getDatasetUsages(string memory datasetId) 
        external 
        view 
        returns (DatasetUsage[] memory) 
    {
        return datasetUsages[datasetId];
    }

    /**
     * @dev Get user's datasets
     */
    function getUserDatasets(address user) 
        external 
        view 
        returns (string[] memory) 
    {
        return userDatasets[user];
    }

    /**
     * @dev Get generation parameter
     */
    function getGenerationParameter(
        string memory datasetId,
        string memory key
    ) external view returns (string memory) {
        return generationParameters[datasetId][key];
    }

    /**
     * @dev Get all dataset IDs
     */
    function getAllDatasetIds() external view returns (string[] memory) {
        return allDatasetIds;
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
}
