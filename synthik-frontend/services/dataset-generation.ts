import {
  DatasetConfig,
  SchemaField,
} from '../components/dataset/CreateDatasetFlow';

export type DataRecord = Record<
  string,
  string | number | boolean | Date | null
>;

export interface GenerationModel {
  id: string;
  name: string;
  provider: 'openai' | 'anthropic' | 'google' | 'meta';
  apiKey?: string;
  endpoint?: string;
  capabilities: {
    maxTokens: number;
    supportsStructuredOutput: boolean;
    supportsStreaming: boolean;
    costPerToken: number;
  };
}

export interface GenerationRequest {
  model: GenerationModel;
  config: DatasetConfig;
  batchSize?: number;
  streamCallback?: (progress: number) => void;
}

export interface GenerationResponse {
  data: DataRecord[];
  metadata: {
    totalRows: number;
    generationTime: number;
    tokensUsed: number;
    cost: number;
  };
}

// Complex dataset type definitions
export interface DatasetTypeDefinition {
  id: string;
  name: string;
  description: string;
  defaultSchema: SchemaField[];
  templates: {
    [key: string]: {
      name: string;
      description: string;
      schema: SchemaField[];
      samplePrompt: string;
    };
  };
  validators?: {
    [fieldName: string]: (
      value: string | number | boolean | Date | null
    ) => boolean;
  };
}

// Dataset type registry
export const DATASET_TYPES: Record<string, DatasetTypeDefinition> = {
  ecommerce: {
    id: 'ecommerce',
    name: 'E-commerce',
    description: 'Online shopping and retail data',
    defaultSchema: [
      {
        id: '1',
        name: 'order_id',
        type: 'string',
        description: 'Unique order identifier',
        constraints: {
          required: true,
          unique: true,
          pattern: '^ORD-[0-9]{8}$',
        },
      },
      {
        id: '2',
        name: 'customer_id',
        type: 'string',
        description: 'Customer identifier',
        constraints: { required: true, pattern: '^CUST-[0-9]{6}$' },
      },
      {
        id: '3',
        name: 'product_name',
        type: 'string',
        description: 'Name of the product',
        constraints: { required: true },
      },
      {
        id: '4',
        name: 'price',
        type: 'number',
        description: 'Product price in USD',
        constraints: { required: true, min: 0.01, max: 10000 },
      },
      {
        id: '5',
        name: 'quantity',
        type: 'number',
        description: 'Number of items ordered',
        constraints: { required: true, min: 1, max: 100 },
      },
      {
        id: '6',
        name: 'order_date',
        type: 'date',
        description: 'Date when order was placed',
        constraints: { required: true },
      },
    ],
    templates: {
      orders: {
        name: 'Order History',
        description: 'Customer order transactions',
        schema: [], // Uses default schema
        samplePrompt:
          'Generate realistic e-commerce order data with diverse products and customer behaviors',
      },
      products: {
        name: 'Product Catalog',
        description: 'Product inventory data',
        schema: [
          {
            id: '1',
            name: 'sku',
            type: 'string',
            description: 'Stock keeping unit',
            constraints: { required: true, unique: true },
          },
          {
            id: '2',
            name: 'product_name',
            type: 'string',
            description: 'Product name',
            constraints: { required: true },
          },
          {
            id: '3',
            name: 'category',
            type: 'string',
            description: 'Product category',
            constraints: {
              required: true,
              enum: ['Electronics', 'Clothing', 'Home', 'Books', 'Sports'],
            },
          },
          {
            id: '4',
            name: 'price',
            type: 'number',
            description: 'Product price',
            constraints: { required: true, min: 0.01 },
          },
          {
            id: '5',
            name: 'stock_quantity',
            type: 'number',
            description: 'Available stock',
            constraints: { required: true, min: 0 },
          },
        ],
        samplePrompt:
          'Generate a diverse product catalog with realistic pricing and inventory levels',
      },
    },
  },
  healthcare: {
    id: 'healthcare',
    name: 'Healthcare',
    description: 'Medical and patient data (synthetic only)',
    defaultSchema: [
      {
        id: '1',
        name: 'patient_id',
        type: 'string',
        description: 'Unique patient identifier',
        constraints: {
          required: true,
          unique: true,
          pattern: '^PAT-[0-9]{8}$',
        },
      },
      {
        id: '2',
        name: 'age',
        type: 'number',
        description: 'Patient age',
        constraints: { required: true, min: 0, max: 120 },
      },
      {
        id: '3',
        name: 'gender',
        type: 'string',
        description: 'Patient gender',
        constraints: { required: true, enum: ['Male', 'Female', 'Other'] },
      },
      {
        id: '4',
        name: 'diagnosis',
        type: 'string',
        description: 'Medical diagnosis',
        constraints: { required: true },
      },
      {
        id: '5',
        name: 'treatment',
        type: 'string',
        description: 'Treatment plan',
        constraints: { required: false },
      },
      {
        id: '6',
        name: 'admission_date',
        type: 'date',
        description: 'Hospital admission date',
        constraints: { required: true },
      },
    ],
    templates: {
      patients: {
        name: 'Patient Records',
        description: 'Basic patient information',
        schema: [], // Uses default schema
        samplePrompt:
          'Generate diverse patient records with realistic medical conditions and demographics',
      },
      appointments: {
        name: 'Appointment Schedule',
        description: 'Medical appointment data',
        schema: [
          {
            id: '1',
            name: 'appointment_id',
            type: 'string',
            description: 'Unique appointment ID',
            constraints: { required: true, unique: true },
          },
          {
            id: '2',
            name: 'patient_id',
            type: 'string',
            description: 'Patient identifier',
            constraints: { required: true },
          },
          {
            id: '3',
            name: 'doctor_name',
            type: 'string',
            description: 'Attending physician',
            constraints: { required: true },
          },
          {
            id: '4',
            name: 'appointment_date',
            type: 'date',
            description: 'Scheduled date',
            constraints: { required: true },
          },
          {
            id: '5',
            name: 'appointment_type',
            type: 'string',
            description: 'Type of appointment',
            constraints: {
              required: true,
              enum: ['Checkup', 'Consultation', 'Follow-up', 'Emergency'],
            },
          },
        ],
        samplePrompt:
          'Generate medical appointment schedules with realistic patterns and doctor-patient relationships',
      },
    },
  },
  financial: {
    id: 'financial',
    name: 'Financial',
    description: 'Banking and transaction data',
    defaultSchema: [
      {
        id: '1',
        name: 'transaction_id',
        type: 'string',
        description: 'Unique transaction ID',
        constraints: { required: true, unique: true },
      },
      {
        id: '2',
        name: 'account_number',
        type: 'string',
        description: 'Account number',
        constraints: { required: true, pattern: '^[0-9]{10}$' },
      },
      {
        id: '3',
        name: 'transaction_type',
        type: 'string',
        description: 'Type of transaction',
        constraints: {
          required: true,
          enum: ['Deposit', 'Withdrawal', 'Transfer', 'Payment'],
        },
      },
      {
        id: '4',
        name: 'amount',
        type: 'number',
        description: 'Transaction amount',
        constraints: { required: true, min: 0.01 },
      },
      {
        id: '5',
        name: 'timestamp',
        type: 'date',
        description: 'Transaction timestamp',
        constraints: { required: true },
      },
    ],
    templates: {
      transactions: {
        name: 'Transaction History',
        description: 'Banking transactions',
        schema: [], // Uses default schema
        samplePrompt:
          'Generate realistic banking transactions with varied patterns and amounts',
      },
      loans: {
        name: 'Loan Portfolio',
        description: 'Loan application and status data',
        schema: [
          {
            id: '1',
            name: 'loan_id',
            type: 'string',
            description: 'Unique loan identifier',
            constraints: { required: true, unique: true },
          },
          {
            id: '2',
            name: 'borrower_id',
            type: 'string',
            description: 'Borrower identifier',
            constraints: { required: true },
          },
          {
            id: '3',
            name: 'loan_amount',
            type: 'number',
            description: 'Principal amount',
            constraints: { required: true, min: 1000, max: 1000000 },
          },
          {
            id: '4',
            name: 'interest_rate',
            type: 'number',
            description: 'Annual interest rate (%)',
            constraints: { required: true, min: 0.1, max: 30 },
          },
          {
            id: '5',
            name: 'loan_status',
            type: 'string',
            description: 'Current loan status',
            constraints: {
              required: true,
              enum: ['Active', 'Paid', 'Default', 'Processing'],
            },
          },
        ],
        samplePrompt:
          'Generate loan portfolio data with realistic interest rates and risk profiles',
      },
    },
  },
};

// Batch generation strategy
interface BatchStrategy {
  optimalBatchSize: number;
  maxConcurrent: number;
  estimatedBatches: number;
  estimatedTime: number;
}

// OpenAI-specific generation logic
class OpenAIGenerator {
  private apiKey: string;
  private defaultModel: string = 'gpt-4o-mini';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  // Calculate optimal batch strategy based on requirements
  private calculateBatchStrategy(
    schema: SchemaField[],
    totalRows: number,
    quality: string
  ): BatchStrategy {
    // Base calculations
    const fieldsComplexity = schema.length;
    const constraintsComplexity = schema.reduce((acc, field) => {
      return (
        acc + (field.constraints ? Object.keys(field.constraints).length : 0)
      );
    }, 0);

    const complexityScore = fieldsComplexity + constraintsComplexity * 0.5;
    const qualityMultiplier =
      quality === 'high' ? 2 : quality === 'balanced' ? 1.5 : 1;

    // Calculate optimal batch size (balance between efficiency and token limits)
    // Reduced batch sizes to avoid token limits
    let optimalBatchSize: number;
    if (complexityScore < 10) {
      optimalBatchSize = Math.min(100, totalRows); // Reduced from 200
    } else if (complexityScore < 20) {
      optimalBatchSize = Math.min(50, totalRows); // Reduced from 100
    } else {
      optimalBatchSize = Math.min(25, totalRows); // Reduced from 50
    }

    // Apply quality adjustment
    optimalBatchSize = Math.floor(optimalBatchSize / qualityMultiplier);
    optimalBatchSize = Math.max(10, optimalBatchSize); // Minimum batch size

    const estimatedBatches = Math.ceil(totalRows / optimalBatchSize);

    // Concurrent requests based on total size
    let maxConcurrent: number;
    if (totalRows < 100) {
      maxConcurrent = 2;
    } else if (totalRows < 1000) {
      maxConcurrent = 3;
    } else {
      maxConcurrent = 5; // More aggressive for large datasets
    }

    // Estimate time (rough calculation)
    const avgTimePerBatch = 2; // Reduced from 3 seconds
    const estimatedTime = Math.ceil(
      (estimatedBatches / maxConcurrent) * avgTimePerBatch
    );

    return {
      optimalBatchSize,
      maxConcurrent,
      estimatedBatches,
      estimatedTime,
    };
  }

  async generateLargeDataset(
    schema: SchemaField[],
    totalRows: number,
    config: DatasetConfig,
    onProgress?: (progress: number, status: string) => void,
    modelOverride?: string
  ): Promise<DataRecord[]> {
    this.model = modelOverride || this.defaultModel;

    // Calculate optimal strategy
    const strategy = this.calculateBatchStrategy(
      schema,
      totalRows,
      config.quality
    );

    onProgress?.(
      0,
      `Planning generation: ${strategy.estimatedBatches} batches of ~${strategy.optimalBatchSize} rows each`
    );

    console.log('Generation strategy:', {
      totalRows,
      optimalBatchSize: strategy.optimalBatchSize,
      estimatedBatches: strategy.estimatedBatches,
      maxConcurrent: strategy.maxConcurrent,
      estimatedTime: `${strategy.estimatedTime}s`,
    });

    const allResults: DataRecord[] = [];
    let completedBatches = 0;
    let processedRows = 0;

    // Process in chunks to manage concurrency
    for (
      let chunkStart = 0;
      chunkStart < strategy.estimatedBatches;
      chunkStart += strategy.maxConcurrent
    ) {
      const chunkEnd = Math.min(
        chunkStart + strategy.maxConcurrent,
        strategy.estimatedBatches
      );
      const batchPromises: Promise<DataRecord[]>[] = [];

      // Create batch promises for this chunk
      for (let batchIndex = chunkStart; batchIndex < chunkEnd; batchIndex++) {
        const startRow = batchIndex * strategy.optimalBatchSize;
        const endRow = Math.min(
          startRow + strategy.optimalBatchSize,
          totalRows
        );
        const batchSize = endRow - startRow;

        if (batchSize > 0) {
          const batchPromise = this.generateSingleBatch(
            schema,
            batchSize,
            config,
            batchIndex,
            processedRows // Pass current offset for unique ID generation
          );
          batchPromises.push(batchPromise);
        }
      }

      try {
        onProgress?.(
          (completedBatches / strategy.estimatedBatches) * 100,
          `Processing batches ${chunkStart + 1}-${chunkEnd} of ${
            strategy.estimatedBatches
          }`
        );

        // Wait for all batches in this chunk
        const chunkResults = await Promise.all(batchPromises);

        // Combine results
        chunkResults.forEach((batchData) => {
          allResults.push(...batchData);
          processedRows += batchData.length;
        });

        completedBatches += batchPromises.length;

        onProgress?.(
          (completedBatches / strategy.estimatedBatches) * 100,
          `Completed ${processedRows}/${totalRows} rows`
        );

        // Small delay between chunks to avoid rate limiting
        if (chunkEnd < strategy.estimatedBatches) {
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      } catch (error) {
        console.error(`Error in batch chunk ${chunkStart}-${chunkEnd}:`, error);
        throw new Error(`Generation failed at batch ${chunkStart}: ${error}`);
      }
    }

    onProgress?.(
      100,
      `Generation complete: ${allResults.length} rows generated`
    );
    return allResults.slice(0, totalRows); // Ensure exact count
  }

  private async generateSingleBatch(
    schema: SchemaField[],
    batchSize: number,
    config: DatasetConfig,
    batchIndex: number,
    rowOffset: number = 0
  ): Promise<DataRecord[]> {
    const prompt = this.buildBatchPrompt(
      schema,
      batchSize,
      config,
      batchIndex,
      rowOffset
    );

    try {
      const result = await this.callOpenAI(prompt);

      // Validate and clean the result
      const validatedResult = this.validateAndCleanBatch(
        result,
        schema,
        batchSize
      );

      return validatedResult;
    } catch (error) {
      console.error(`Batch ${batchIndex} failed:`, error);
      // Return empty array instead of failing the entire generation
      console.warn(`Batch ${batchIndex} returned empty due to error`);
      return [];
    }
  }

  private buildBatchPrompt(
    schema: SchemaField[],
    batchSize: number,
    config: DatasetConfig,
    batchIndex: number,
    rowOffset: number
  ): string {
    // Build schema object
    interface FieldDefinition {
      type: string;
      description: string;
      required?: boolean;
      unique?: boolean;
      min?: number;
      max?: number;
      pattern?: string;
      enum?: string[];
    }

    const schemaObj: Record<string, FieldDefinition> = {};
    schema.forEach((field) => {
      const fieldDef: FieldDefinition = {
        type: field.type,
        description: field.description,
      };

      if (field.constraints) {
        if (field.constraints.required) fieldDef.required = true;
        if (field.constraints.unique) fieldDef.unique = true;
        if (field.constraints.min !== undefined)
          fieldDef.min = field.constraints.min;
        if (field.constraints.max !== undefined)
          fieldDef.max = field.constraints.max;
        if (field.constraints.pattern)
          fieldDef.pattern = field.constraints.pattern;
        if (field.constraints.enum) fieldDef.enum = field.constraints.enum;
      }

      schemaObj[field.name] = fieldDef;
    });

    // Generate example with batch-specific IDs
    const example = this.generateExampleRecord(schema, rowOffset + 1);

    const datasetType = DATASET_TYPES[config.datasetType];
    const template = datasetType?.templates[config.selectedTemplate || ''];
    const contextPrompt =
      template?.samplePrompt || `Generate ${config.datasetType} data`;

    return `Generate exactly ${batchSize} records for batch ${batchIndex + 1}.

Context: ${contextPrompt}

Schema: ${JSON.stringify(schemaObj, null, 2)}

CRITICAL REQUIREMENTS:
1. Return EXACTLY ${batchSize} records as a JSON array
2. Each record MUST have ALL fields: ${schema.map((f) => f.name).join(', ')}
3. For unique fields, start numbering from ${rowOffset + 1}
4. Follow ALL constraints exactly
5. Make data realistic and diverse
6. Return ONLY the JSON array, no other text
7. Start with [ and end with ]
8. Each record should be a complete JSON object

Example of the EXACT format required:
[
  ${JSON.stringify(example, null, 2)},
  ... (${batchSize - 1} more records)
]

Generate the JSON array now:`;
  }

  private validateAndCleanBatch(
    rawData: DataRecord[],
    schema: SchemaField[],
    expectedSize: number
  ): DataRecord[] {
    if (!Array.isArray(rawData)) {
      console.warn('Batch result is not an array:', rawData);
      return [];
    }

    // Clean and validate each record
    const cleanedData = rawData
      .filter((record) => record && typeof record === 'object')
      .map((record) => {
        const cleanRecord: DataRecord = {};

        // Ensure all schema fields are present
        schema.forEach((field) => {
          if (field.name in record) {
            cleanRecord[field.name] = record[field.name];
          } else {
            // Generate missing field
            cleanRecord[field.name] = this.generateMissingField(field);
          }
        });

        return cleanRecord;
      })
      .slice(0, expectedSize); // Ensure we don't exceed expected size

    return cleanedData;
  }

  private generateMissingField(
    field: SchemaField
  ): string | number | boolean | Date | null {
    switch (field.type) {
      case 'string':
        return field.constraints?.enum
          ? field.constraints.enum[0]
          : `Generated_${field.name}`;
      case 'number':
        return field.constraints?.min || 1;
      case 'date':
        return '2024-01-01';
      case 'boolean':
        return true;
      default:
        return `Default_${field.name}`;
    }
  }

  private generateExampleRecord(
    schema: SchemaField[],
    idSuffix: number = 1
  ): DataRecord {
    const exampleRecord: DataRecord = {};
    schema.forEach((field) => {
      switch (field.type) {
        case 'string':
          if (field.name.includes('id')) {
            if (field.constraints?.pattern) {
              const pattern = field.constraints.pattern;
              if (pattern.includes('ORD-')) {
                exampleRecord[field.name] = `ORD-${String(idSuffix).padStart(
                  8,
                  '0'
                )}`;
              } else if (pattern.includes('CUST-')) {
                exampleRecord[field.name] = `CUST-${String(idSuffix).padStart(
                  6,
                  '0'
                )}`;
              } else if (pattern.includes('PAT-')) {
                exampleRecord[field.name] = `PAT-${String(idSuffix).padStart(
                  8,
                  '0'
                )}`;
              } else {
                exampleRecord[field.name] = `ID-${String(idSuffix).padStart(
                  3,
                  '0'
                )}`;
              }
            } else {
              exampleRecord[field.name] = `UNIQUE_ID_${String(
                idSuffix
              ).padStart(3, '0')}`;
            }
          } else if (
            field.name.includes('product') &&
            field.name.includes('name')
          ) {
            exampleRecord[field.name] = 'Wireless Bluetooth Headphones';
          } else if (
            field.name.includes('customer') &&
            field.name.includes('name')
          ) {
            exampleRecord[field.name] = 'Sarah Johnson';
          } else if (field.name.includes('name')) {
            exampleRecord[field.name] = 'John Smith';
          } else if (field.name.includes('email')) {
            exampleRecord[field.name] = 'john.smith@example.com';
          } else if (field.name.includes('description')) {
            exampleRecord[field.name] =
              'High-quality product with excellent features';
          } else if (field.name.includes('category')) {
            exampleRecord[field.name] = field.constraints?.enum
              ? field.constraints.enum[0]
              : 'Electronics';
          } else if (field.name.includes('status')) {
            exampleRecord[field.name] = field.constraints?.enum
              ? field.constraints.enum[0]
              : 'Active';
          } else if (field.name.includes('type')) {
            exampleRecord[field.name] = field.constraints?.enum
              ? field.constraints.enum[0]
              : 'Standard';
          } else {
            exampleRecord[field.name] = 'Sample text value';
          }
          break;
        case 'number':
          if (field.name.includes('price') || field.name.includes('amount')) {
            exampleRecord[field.name] = field.constraints?.min || 29.99;
          } else if (
            field.name.includes('quantity') ||
            field.name.includes('stock')
          ) {
            exampleRecord[field.name] = field.constraints?.min || 10;
          } else if (field.name.includes('age')) {
            exampleRecord[field.name] = 35;
          } else if (
            field.name.includes('rate') ||
            field.name.includes('percentage')
          ) {
            exampleRecord[field.name] = 5.5;
          } else {
            exampleRecord[field.name] = field.constraints?.min || 100;
          }
          break;
        case 'date':
          exampleRecord[field.name] = '2024-01-15';
          break;
        case 'boolean':
          exampleRecord[field.name] = true;
          break;
        case 'email':
          exampleRecord[field.name] = 'user@example.com';
          break;
        case 'phone':
          exampleRecord[field.name] = '+1-555-123-4567';
          break;
        case 'address':
          exampleRecord[field.name] = '123 Main St, City, State 12345';
          break;
        case 'name':
          exampleRecord[field.name] = 'Jane Doe';
          break;
        case 'company':
          exampleRecord[field.name] = 'Acme Corporation';
          break;
        case 'url':
          exampleRecord[field.name] = 'https://example.com';
          break;
        default:
          exampleRecord[field.name] = 'Sample value';
      }
    });
    return exampleRecord;
  }

  // Legacy method for small datasets and previews
  async generateBatch(
    schema: SchemaField[],
    count: number,
    config: DatasetConfig,
    onProgress?: (progress: number) => void,
    modelOverride?: string
  ): Promise<DataRecord[]> {
    // For small datasets, use the optimized large dataset method
    if (count > 20) {
      return this.generateLargeDataset(
        schema,
        count,
        config,
        onProgress ? (progress) => onProgress(progress) : undefined,
        modelOverride
      );
    }

    // For very small datasets (previews), use simple generation
    this.model = modelOverride || this.defaultModel;
    const prompt = this.buildBatchPrompt(schema, count, config, 0, 0);
    const result = await this.callOpenAI(prompt);
    if (onProgress) onProgress(100);
    return result.slice(0, count);
  }

  private async callOpenAI(prompt: string): Promise<DataRecord[]> {
    try {
      // Extract batch size from prompt to calculate appropriate max_tokens
      const batchSizeMatch = prompt.match(/exactly (\d+) records/i);
      const requestedBatchSize = batchSizeMatch
        ? parseInt(batchSizeMatch[1])
        : 10;

      // Calculate max_tokens based on batch size
      // Estimate ~100-200 tokens per record depending on complexity
      const tokensPerRecord = 150;
      const maxTokens = Math.min(
        Math.max(4000, requestedBatchSize * tokensPerRecord),
        16000 // Model's max limit
      );

      const response = await fetch(
        'https://api.openai.com/v1/chat/completions',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify({
            model: this.model,
            messages: [
              {
                role: 'system',
                content:
                  'You are a data generation expert. Generate synthetic data that is realistic, diverse, and follows the specified schema exactly. CRITICAL: Always return a valid JSON array of objects, never a single object. Return ONLY the JSON array with no additional text, markdown, or explanation.',
              },
              {
                role: 'user',
                content: prompt,
              },
            ],
            temperature: 0.8,
            max_tokens: maxTokens,
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          `OpenAI API error: ${response.statusText} - ${JSON.stringify(
            errorData
          )}`
        );
      }

      const data = await response.json();

      // Check if we hit the token limit
      if (data.choices[0].finish_reason === 'length') {
        console.warn(
          `Hit token limit for batch of ${requestedBatchSize} records. Response may be truncated.`
        );
      }

      const content = data.choices[0].message.content.trim();

      // Improved JSON parsing with multiple fallback strategies
      let parsedData: unknown;

      try {
        // Strategy 1: Try parsing the entire content as JSON
        parsedData = JSON.parse(content);
      } catch {
        try {
          // Strategy 2: Extract JSON array from the response
          // Look specifically for array patterns
          const arrayMatch = content.match(/\[\s*\{[\s\S]*?\}\s*\]/);
          if (arrayMatch) {
            parsedData = JSON.parse(arrayMatch[0]);
          } else {
            throw new Error('No valid JSON array found');
          }
        } catch {
          try {
            // Strategy 3: Look for ```json code blocks
            const codeBlockMatch = content.match(
              /```(?:json)?\s*([\s\S]*?)\s*```/
            );
            if (codeBlockMatch) {
              parsedData = JSON.parse(codeBlockMatch[1]);
            } else {
              throw new Error('No JSON code block found');
            }
          } catch {
            // Strategy 4: Try to clean up common formatting issues
            const cleanedContent = content
              .replace(/^[^[\{]*/, '') // Remove text before JSON
              .replace(/[^\}\]]*$/, '') // Remove text after JSON
              .replace(/,(\s*[}\]])/g, '$1') // Remove trailing commas
              .replace(/([{,]\s*)(\w+):/g, '$1"$2":'); // Quote unquoted keys

            try {
              parsedData = JSON.parse(cleanedContent);
            } catch {
              console.error('All JSON parsing strategies failed');
              console.error(
                'Original content (first 500 chars):',
                content.substring(0, 500)
              );
              console.error(
                'Cleaned content (first 500 chars):',
                cleanedContent.substring(0, 500)
              );

              // Return empty array as last resort
              console.warn('Returning empty array as fallback');
              return [];
            }
          }
        }
      }

      // CRITICAL: Ensure we always return an array
      let resultArray: DataRecord[];

      if (Array.isArray(parsedData)) {
        // It's already an array, perfect!
        resultArray = parsedData;
      } else if (parsedData && typeof parsedData === 'object') {
        // It's an object - DO NOT wrap single objects in arrays
        // This is likely an error from the model
        console.error(
          'OpenAI returned an object instead of array. This is an error. Object:',
          parsedData
        );

        // Check if it has a data property
        if ('data' in parsedData && Array.isArray(parsedData.data)) {
          resultArray = parsedData.data;
        } else if (
          'records' in parsedData &&
          Array.isArray(parsedData.records)
        ) {
          resultArray = parsedData.records;
        } else {
          // Don't wrap - return empty array and let retry logic handle it
          console.error(
            'Expected array but got object. Returning empty array.'
          );
          return [];
        }
      } else {
        console.error('Unexpected data type:', typeof parsedData, parsedData);
        return [];
      }

      // Validate that we have actual data
      if (!Array.isArray(resultArray)) {
        console.error('Result is not an array after processing:', resultArray);
        return [];
      }

      // Clean and validate each record
      const cleanedResults = resultArray
        .filter((item) => item && typeof item === 'object')
        .map((item) => item as DataRecord);

      console.log(
        `OpenAI returned ${cleanedResults.length} records (requested ${requestedBatchSize})`
      );

      // Warn if we got significantly fewer records than requested
      if (cleanedResults.length < requestedBatchSize * 0.8) {
        console.warn(
          `Only received ${cleanedResults.length} records out of ${requestedBatchSize} requested`
        );
      }

      return cleanedResults;
    } catch (error) {
      console.error('OpenAI API call error:', error);
      throw error;
    }
  }

  // Add getter/setter for model
  private _model: string = this.defaultModel;

  get model(): string {
    return this._model;
  }

  set model(value: string) {
    this._model = value;
  }
}

// Gemini-specific generation logic
class GeminiGenerator {
  private apiKey: string;
  private defaultModel: string = 'gemini-1.5-flash';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  // Calculate optimal batch strategy for Gemini (much larger context window)
  private calculateBatchStrategy(
    schema: SchemaField[],
    totalRows: number,
    quality: string
  ): BatchStrategy {
    const fieldsComplexity = schema.length;
    const constraintsComplexity = schema.reduce((acc, field) => {
      return (
        acc + (field.constraints ? Object.keys(field.constraints).length : 0)
      );
    }, 0);

    const complexityScore = fieldsComplexity + constraintsComplexity * 0.5;
    const qualityMultiplier =
      quality === 'high' ? 1.5 : quality === 'balanced' ? 1.2 : 1;

    // Conservative batch sizes to avoid token limits and ensure complete responses
    let optimalBatchSize: number;
    if (complexityScore < 10) {
      optimalBatchSize = Math.min(50, totalRows); // Reduced from 200 to avoid token limits
    } else if (complexityScore < 20) {
      optimalBatchSize = Math.min(30, totalRows); // Reduced from 100
    } else {
      optimalBatchSize = Math.min(20, totalRows); // Reduced from 50
    }

    // Apply quality adjustment
    optimalBatchSize = Math.floor(optimalBatchSize / qualityMultiplier);
    optimalBatchSize = Math.max(15, optimalBatchSize); // Reasonable minimum

    const estimatedBatches = Math.ceil(totalRows / optimalBatchSize);

    // More concurrent requests since batches are smaller
    let maxConcurrent: number;
    if (totalRows < 500) {
      maxConcurrent = 4;
    } else if (totalRows < 2000) {
      maxConcurrent = 6; // Increased since batches are smaller
    } else {
      maxConcurrent = 8; // Can handle more smaller batches
    }

    // Faster with smaller batches
    const avgTimePerBatch = 1.5;
    const estimatedTime = Math.ceil(
      (estimatedBatches / maxConcurrent) * avgTimePerBatch
    );

    return {
      optimalBatchSize,
      maxConcurrent,
      estimatedBatches,
      estimatedTime,
    };
  }

  async generateLargeDataset(
    schema: SchemaField[],
    totalRows: number,
    config: DatasetConfig,
    onProgress?: (progress: number, status: string) => void,
    modelOverride?: string
  ): Promise<DataRecord[]> {
    this.model = modelOverride || this.defaultModel;

    const strategy = this.calculateBatchStrategy(
      schema,
      totalRows,
      config.quality
    );

    onProgress?.(
      0,
      `Planning Gemini generation: ${strategy.estimatedBatches} batches of ~${strategy.optimalBatchSize} rows each`
    );

    console.log('Gemini generation strategy:', {
      totalRows,
      optimalBatchSize: strategy.optimalBatchSize,
      estimatedBatches: strategy.estimatedBatches,
      maxConcurrent: strategy.maxConcurrent,
      estimatedTime: `${strategy.estimatedTime}s`,
    });

    const allResults: DataRecord[] = [];
    let completedBatches = 0;
    let processedRows = 0;
    let failedBatches = 0;

    // Process in chunks to manage concurrency
    for (
      let chunkStart = 0;
      chunkStart < strategy.estimatedBatches;
      chunkStart += strategy.maxConcurrent
    ) {
      const chunkEnd = Math.min(
        chunkStart + strategy.maxConcurrent,
        strategy.estimatedBatches
      );
      const batchPromises: Promise<DataRecord[]>[] = [];

      for (let batchIndex = chunkStart; batchIndex < chunkEnd; batchIndex++) {
        const startRow = batchIndex * strategy.optimalBatchSize;
        const endRow = Math.min(
          startRow + strategy.optimalBatchSize,
          totalRows
        );
        const batchSize = endRow - startRow;

        if (batchSize > 0) {
          const batchPromise = this.generateSingleBatch(
            schema,
            batchSize,
            config,
            batchIndex,
            processedRows
          );
          batchPromises.push(batchPromise);
        }
      }

      try {
        onProgress?.(
          (completedBatches / strategy.estimatedBatches) * 100,
          `Processing Gemini batches ${chunkStart + 1}-${chunkEnd} of ${
            strategy.estimatedBatches
          }`
        );

        const chunkResults = await Promise.allSettled(batchPromises);

        // Process results and track failures
        chunkResults.forEach((result, index) => {
          const batchIndex = chunkStart + index;
          if (result.status === 'fulfilled') {
            const batchData = result.value;
            allResults.push(...batchData);
            processedRows += batchData.length;
            console.log(
              `Gemini batch ${batchIndex + 1} completed: ${
                batchData.length
              } records`
            );
          } else {
            failedBatches++;
            console.error(
              `Gemini batch ${batchIndex + 1} failed:`,
              result.reason
            );

            // Continue without this batch - don't throw error
            console.warn(
              `Continuing without batch ${
                batchIndex + 1
              }. ${failedBatches} batches have failed so far.`
            );
          }
        });

        completedBatches += batchPromises.length;

        onProgress?.(
          (completedBatches / strategy.estimatedBatches) * 100,
          `Completed ${processedRows}/${totalRows} rows via Gemini (${failedBatches} batches failed)`
        );

        // Shorter delay for Gemini (faster API)
        if (chunkEnd < strategy.estimatedBatches) {
          await new Promise((resolve) => setTimeout(resolve, 300));
        }
      } catch (error) {
        console.error(
          `Error in Gemini batch chunk ${chunkStart}-${chunkEnd}:`,
          error
        );
        // Don't throw - continue with remaining batches
        console.warn(
          `Continuing despite error in chunk ${chunkStart}-${chunkEnd}`
        );
      }
    }

    console.log(`Gemini generation summary:`, {
      requested: totalRows,
      generated: allResults.length,
      completedBatches: completedBatches,
      failedBatches: failedBatches,
      successRate: `${Math.round((allResults.length / totalRows) * 100)}%`,
    });

    onProgress?.(
      100,
      `Gemini generation complete: ${allResults.length} rows generated (${failedBatches} batches failed)`
    );

    return allResults.slice(0, totalRows);
  }

  private async generateSingleBatch(
    schema: SchemaField[],
    batchSize: number,
    config: DatasetConfig,
    batchIndex: number,
    rowOffset: number = 0
  ): Promise<DataRecord[]> {
    const prompt = this.buildBatchPrompt(
      schema,
      batchSize,
      config,
      batchIndex,
      rowOffset
    );

    try {
      const result = await this.callGemini(prompt);
      const validatedResult = this.validateAndCleanBatch(
        result,
        schema,
        batchSize
      );
      return validatedResult;
    } catch (error) {
      console.error(`Gemini batch ${batchIndex} failed:`, error);
      console.warn(`Gemini batch ${batchIndex} returned empty due to error`);
      return [];
    }
  }

  private buildBatchPrompt(
    schema: SchemaField[],
    batchSize: number,
    config: DatasetConfig,
    batchIndex: number,
    rowOffset: number
  ): string {
    // Build schema object
    interface FieldDefinition {
      type: string;
      description: string;
      required?: boolean;
      unique?: boolean;
      min?: number;
      max?: number;
      pattern?: string;
      enum?: string[];
    }

    const schemaObj: Record<string, FieldDefinition> = {};
    schema.forEach((field) => {
      const fieldDef: FieldDefinition = {
        type: field.type,
        description: field.description,
      };

      if (field.constraints) {
        if (field.constraints.required) fieldDef.required = true;
        if (field.constraints.unique) fieldDef.unique = true;
        if (field.constraints.min !== undefined)
          fieldDef.min = field.constraints.min;
        if (field.constraints.max !== undefined)
          fieldDef.max = field.constraints.max;
        if (field.constraints.pattern)
          fieldDef.pattern = field.constraints.pattern;
        if (field.constraints.enum) fieldDef.enum = field.constraints.enum;
      }

      schemaObj[field.name] = fieldDef;
    });

    const example = this.generateExampleRecord(schema, rowOffset + 1);
    const datasetType = DATASET_TYPES[config.datasetType];
    const template = datasetType?.templates[config.selectedTemplate || ''];
    const contextPrompt =
      template?.samplePrompt || `Generate ${config.datasetType} data`;

    // Gemini-optimized prompt
    return `You are an expert synthetic data generator. Generate exactly ${batchSize} realistic, diverse records for batch ${
      batchIndex + 1
    }.

**Context:** ${contextPrompt}

**Schema Definition:**
${JSON.stringify(schemaObj, null, 2)}

**CRITICAL REQUIREMENTS:**
1. Generate EXACTLY ${batchSize} records as a valid JSON array
2. Each record must contain ALL fields: ${schema.map((f) => f.name).join(', ')}
3. For unique fields, start numbering from ${rowOffset + 1}
4. Follow ALL constraints precisely
5. Create realistic, diverse data with natural variations
6. Return ONLY the JSON array - no explanations, no markdown, no additional text
7. Ensure proper JSON formatting with correct brackets and commas

**Example Record Structure:**
${JSON.stringify(example, null, 2)}

**Output Format:**
[
  {record1},
  {record2},
  ...
  {record${batchSize}}
]

Generate the ${batchSize} records now:`;
  }

  private async callGemini(prompt: string): Promise<DataRecord[]> {
    try {
      // Extract batch size for logging
      const batchSizeMatch = prompt.match(/exactly (\d+) realistic/i);
      const requestedBatchSize = batchSizeMatch
        ? parseInt(batchSizeMatch[1])
        : 0;

      console.log(`Calling Gemini API for ${requestedBatchSize} records...`);

      // Calculate appropriate maxOutputTokens based on batch size
      // Estimate ~100-150 tokens per record, with safety margin
      const tokensPerRecord = 150;
      const maxOutputTokens = Math.min(
        Math.max(4096, requestedBatchSize * tokensPerRecord * 1.5), // 1.5x safety margin
        32768 // Gemini's actual limit is much higher
      );

      console.log(
        `Using maxOutputTokens: ${maxOutputTokens} for ${requestedBatchSize} records`
      );

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    text: prompt,
                  },
                ],
              },
            ],
            generationConfig: {
              temperature: 0.8,
              topP: 0.9,
              topK: 40,
              maxOutputTokens: maxOutputTokens,
              responseMimeType: 'application/json',
            },
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('Gemini API error details:', {
          status: response.status,
          statusText: response.statusText,
          errorData,
          requestedBatchSize,
        });
        throw new Error(
          `Gemini API error: ${response.statusText} - ${JSON.stringify(
            errorData
          )}`
        );
      }

      const data = await response.json();

      // Check for API response issues
      if (!data.candidates || data.candidates.length === 0) {
        console.error('Gemini response has no candidates:', data);
        throw new Error('Gemini API returned no candidates');
      }

      if (!data.candidates[0] || !data.candidates[0].content) {
        console.error('Gemini response missing content:', data.candidates[0]);
        throw new Error('Gemini API response missing content');
      }

      // Check for content filtering or other issues
      if (
        data.candidates[0].finishReason &&
        data.candidates[0].finishReason !== 'STOP'
      ) {
        console.warn(
          'Gemini response finished with reason:',
          data.candidates[0].finishReason
        );
        if (data.candidates[0].finishReason === 'MAX_TOKENS') {
          console.error('Gemini hit max tokens limit - response truncated!');
          console.error(
            `Requested ${requestedBatchSize} records but hit token limit`
          );
        }
      }

      const content = data.candidates[0].content.parts[0].text.trim();

      if (!content) {
        console.error('Gemini returned empty content');
        throw new Error('Gemini API returned empty content');
      }

      console.log(`Gemini returned ${content.length} characters of content`);

      // Parse JSON response
      let parsedData: unknown;
      try {
        parsedData = JSON.parse(content);
      } catch (parseError) {
        console.error('Initial JSON parse failed:', parseError);
        console.log('Content preview:', content.substring(0, 200));

        // Try to extract JSON from the response
        const jsonMatch = content.match(/\[\s*\{[\s\S]*?\}\s*\]/);
        if (jsonMatch) {
          try {
            parsedData = JSON.parse(jsonMatch[0]);
            console.log('Successfully parsed JSON from extracted match');
          } catch (extractError) {
            console.error('Failed to parse extracted JSON:', extractError);
            console.error('Extracted content:', jsonMatch[0].substring(0, 200));

            // Try to fix truncated JSON by adding closing brackets
            const truncatedContent = jsonMatch[0];
            if (!truncatedContent.endsWith(']')) {
              console.log('Attempting to fix truncated JSON...');
              const fixedContent = truncatedContent.replace(/,?\s*$/, '') + ']';
              try {
                parsedData = JSON.parse(fixedContent);
                console.log('Successfully fixed truncated JSON');
              } catch (fixError) {
                console.error('Failed to fix truncated JSON:', fixError);
                return [];
              }
            } else {
              return [];
            }
          }
        } else {
          console.error('No JSON array pattern found in content');
          console.error('Full content:', content);
          return [];
        }
      }

      // Ensure we have an array
      if (!Array.isArray(parsedData)) {
        console.error(
          'Gemini returned non-array:',
          typeof parsedData,
          parsedData
        );
        return [];
      }

      const cleanedResults = parsedData
        .filter((item) => item && typeof item === 'object')
        .map((item) => item as DataRecord);

      console.log(
        `Gemini successfully returned ${cleanedResults.length} records (requested ${requestedBatchSize})`
      );

      // Warn if significantly fewer records than requested
      if (cleanedResults.length < requestedBatchSize * 0.9) {
        console.warn(
          `Gemini returned fewer records than expected: ${cleanedResults.length}/${requestedBatchSize}`
        );
        console.warn('This may indicate token limit truncation');
      }

      return cleanedResults;
    } catch (error) {
      console.error('Gemini API call error:', error);
      throw error;
    }
  }

  private validateAndCleanBatch(
    rawData: DataRecord[],
    schema: SchemaField[],
    expectedSize: number
  ): DataRecord[] {
    if (!Array.isArray(rawData)) {
      console.warn('Gemini batch result is not an array:', rawData);
      return [];
    }

    const cleanedData = rawData
      .filter((record) => record && typeof record === 'object')
      .map((record) => {
        const cleanRecord: DataRecord = {};
        schema.forEach((field) => {
          if (field.name in record) {
            cleanRecord[field.name] = record[field.name];
          } else {
            cleanRecord[field.name] = this.generateMissingField(field);
          }
        });
        return cleanRecord;
      })
      .slice(0, expectedSize);

    return cleanedData;
  }

  private generateMissingField(
    field: SchemaField
  ): string | number | boolean | Date | null {
    // Same logic as OpenAI generator
    switch (field.type) {
      case 'string':
        if (field.constraints?.enum) {
          return field.constraints.enum[0];
        }
        return field.name.includes('id')
          ? `${field.name.toUpperCase()}_001`
          : 'Generated value';
      case 'number':
        return field.constraints?.min || 0;
      case 'boolean':
        return true;
      case 'date':
        return new Date().toISOString();
      default:
        return null;
    }
  }

  private generateExampleRecord(
    schema: SchemaField[],
    idSuffix: number = 1
  ): DataRecord {
    const exampleRecord: DataRecord = {};
    schema.forEach((field) => {
      switch (field.type) {
        case 'string':
          if (field.name.includes('id')) {
            exampleRecord[field.name] = `${field.name.toUpperCase()}_${String(
              idSuffix
            ).padStart(3, '0')}`;
          } else if (field.constraints?.enum) {
            exampleRecord[field.name] = field.constraints.enum[0];
          } else {
            exampleRecord[field.name] = 'Sample value';
          }
          break;
        case 'number':
          exampleRecord[field.name] = field.constraints?.min || 100;
          break;
        case 'date':
          exampleRecord[field.name] = '2024-01-15';
          break;
        case 'boolean':
          exampleRecord[field.name] = true;
          break;
        default:
          exampleRecord[field.name] = 'Sample value';
      }
    });
    return exampleRecord;
  }

  async generateBatch(
    schema: SchemaField[],
    count: number,
    config: DatasetConfig,
    onProgress?: (progress: number) => void,
    modelOverride?: string
  ): Promise<DataRecord[]> {
    return this.generateLargeDataset(
      schema,
      count,
      config,
      onProgress ? (progress) => onProgress(progress) : undefined,
      modelOverride
    );
  }

  private _model: string = this.defaultModel;

  get model(): string {
    return this._model;
  }

  set model(value: string) {
    this._model = value;
  }
}

// Main dataset generation service
export class DatasetGenerationService {
  private generators: Map<string, OpenAIGenerator | GeminiGenerator> =
    new Map();

  constructor() {
    // Initialize with OpenAI generator if API key is available
    const openAIKey = process.env.NEXT_PUBLIC_OPENAI_API_KEY;
    if (openAIKey) {
      this.generators.set('openai', new OpenAIGenerator(openAIKey));
    }

    // Initialize with Gemini generator if API key is available
    const geminiKey = process.env.NEXT_PUBLIC_GEMINI_API;
    if (geminiKey) {
      this.generators.set('google', new GeminiGenerator(geminiKey));
    }
  }

  async generateDataset(
    request: GenerationRequest
  ): Promise<GenerationResponse> {
    const startTime = Date.now();
    const { model, config } = request;

    // Get the appropriate generator
    const generator = this.generators.get(model.provider);
    if (!generator) {
      throw new Error(`Generator for ${model.provider} not available`);
    }

    // Generate the data with the specific model
    const data = await generator.generateBatch(
      config.schema,
      config.rows,
      config,
      request.streamCallback,
      model.id // Pass the model ID to use
    );

    // Calculate metadata
    const generationTime = (Date.now() - startTime) / 1000;
    const tokensUsed = this.estimateTokens(data);
    const cost = tokensUsed * (model.capabilities?.costPerToken || 0.00002);

    return {
      data,
      metadata: {
        totalRows: data.length,
        generationTime,
        tokensUsed,
        cost,
      },
    };
  }

  async generatePreview(
    config: DatasetConfig,
    model: GenerationModel
  ): Promise<DataRecord[]> {
    const previewRequest: GenerationRequest = {
      model,
      config: { ...config, rows: Math.min(10, config.rows) },
    };
    const response = await this.generateDataset(previewRequest);
    return response.data;
  }

  private estimateTokens(data: DataRecord[]): number {
    // Rough estimation: 1 token per 4 characters
    const jsonString = JSON.stringify(data);
    return Math.ceil(jsonString.length / 4);
  }

  // Validate generated data against schema
  validateData(
    data: DataRecord[],
    schema: SchemaField[]
  ): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    const uniqueValues: Map<
      string,
      Set<string | number | boolean | Date | null>
    > = new Map();

    // Initialize unique value tracking
    schema.forEach((field) => {
      if (field.constraints?.unique) {
        uniqueValues.set(field.name, new Set());
      }
    });

    data.forEach((record, index) => {
      schema.forEach((field) => {
        const value = record[field.name];

        // Check required fields
        if (
          field.constraints?.required &&
          (value === undefined || value === null)
        ) {
          errors.push(
            `Row ${index + 1}: Missing required field "${field.name}"`
          );
        }

        // Check unique constraints
        if (field.constraints?.unique && value !== undefined) {
          const uniqueSet = uniqueValues.get(field.name)!;
          if (uniqueSet.has(value)) {
            errors.push(
              `Row ${index + 1}: Duplicate value "${value}" for unique field "${
                field.name
              }"`
            );
          } else {
            uniqueSet.add(value);
          }
        }

        // Check min/max constraints
        if (field.type === 'number' && value !== undefined && value !== null) {
          const numValue = Number(value);
          if (!isNaN(numValue)) {
            if (
              field.constraints?.min !== undefined &&
              numValue < field.constraints.min
            ) {
              errors.push(
                `Row ${index + 1}: Value ${numValue} is below minimum ${
                  field.constraints.min
                } for field "${field.name}"`
              );
            }
            if (
              field.constraints?.max !== undefined &&
              numValue > field.constraints.max
            ) {
              errors.push(
                `Row ${index + 1}: Value ${numValue} exceeds maximum ${
                  field.constraints.max
                } for field "${field.name}"`
              );
            }
          }
        }

        // Check pattern constraints
        if (
          field.constraints?.pattern &&
          value !== undefined &&
          value !== null
        ) {
          const regex = new RegExp(field.constraints.pattern);
          const stringValue = String(value);
          if (!regex.test(stringValue)) {
            errors.push(
              `Row ${index + 1}: Value "${stringValue}" doesn't match pattern ${
                field.constraints.pattern
              } for field "${field.name}"`
            );
          }
        }

        // Check enum constraints
        if (field.constraints?.enum && value !== undefined && value !== null) {
          const stringValue = String(value);
          const enumValues = field.constraints.enum.map((v) => String(v));
          if (!enumValues.includes(stringValue)) {
            errors.push(
              `Row ${
                index + 1
              }: Value "${stringValue}" not in allowed values for field "${
                field.name
              }"`
            );
          }
        }
      });
    });

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  // Export data in different formats
  exportData(data: DataRecord[], format: 'json' | 'csv' | 'parquet'): Blob {
    switch (format) {
      case 'json':
        return new Blob([JSON.stringify(data, null, 2)], {
          type: 'application/json',
        });

      case 'csv':
        if (data.length === 0) return new Blob([''], { type: 'text/csv' });

        const headers = Object.keys(data[0]);
        const csvContent = [
          headers.join(','),
          ...data.map((row) =>
            headers
              .map((header) => {
                const value = row[header];
                // Escape values containing commas or quotes
                if (
                  typeof value === 'string' &&
                  (value.includes(',') || value.includes('"'))
                ) {
                  return `"${value.replace(/"/g, '""')}"`;
                }
                return value;
              })
              .join(',')
          ),
        ].join('\n');

        return new Blob([csvContent], { type: 'text/csv' });

      case 'parquet':
        // For parquet, we'd need a library like parquetjs
        // For now, return JSON with a note
        const parquetNote = {
          note: 'Parquet export requires additional setup',
          data,
        };
        return new Blob([JSON.stringify(parquetNote)], {
          type: 'application/json',
        });

      default:
        throw new Error(`Unsupported format: ${format}`);
    }
  }
}

// Export singleton instance
export const datasetGenerationService = new DatasetGenerationService();

// Data augmentation functionality
export class DataAugmentationService {
  // Parse uploaded file and extract schema
  async parseUploadedFile(file: File): Promise<{
    data: DataRecord[];
    schema: SchemaField[];
    stats: {
      totalRows: number;
      columns: number;
      fileSize: string;
      detectedTypes: Record<string, string>;
    };
  }> {
    const fileContent = await this.readFileContent(file);
    const data = this.parseFileData(fileContent, file.type);
    const schema = this.inferSchemaFromData(data);

    const stats = {
      totalRows: data.length,
      columns: schema.length,
      fileSize: this.formatFileSize(file.size),
      detectedTypes: schema.reduce((acc, field) => {
        acc[field.name] = field.type;
        return acc;
      }, {} as Record<string, string>),
    };

    return { data, schema, stats };
  }

  // Read file content based on type
  private async readFileContent(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target?.result as string);
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsText(file);
    });
  }

  // Parse different file formats
  private parseFileData(content: string, fileType: string): DataRecord[] {
    try {
      if (
        fileType.includes('json') ||
        content.trim().startsWith('[') ||
        content.trim().startsWith('{')
      ) {
        // Handle JSON
        const jsonData = JSON.parse(content);
        return Array.isArray(jsonData) ? jsonData : [jsonData];
      } else {
        // Handle CSV
        return this.parseCSV(content);
      }
    } catch (error) {
      throw new Error(
        `Failed to parse file: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
    }
  }

  // Parse CSV content
  private parseCSV(content: string): DataRecord[] {
    const lines = content.trim().split('\n');
    if (lines.length < 2)
      throw new Error('CSV must have at least a header and one data row');

    const headers = lines[0]
      .split(',')
      .map((h) => h.trim().replace(/['"]/g, ''));
    const data: DataRecord[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = this.parseCSVLine(lines[i]);
      if (values.length !== headers.length) continue; // Skip malformed rows

      const record: DataRecord = {};
      headers.forEach((header, index) => {
        const value = values[index]?.trim().replace(/['"]/g, '');
        record[header] = this.inferValueType(value);
      });
      data.push(record);
    }

    return data;
  }

  // Parse a single CSV line (handles quotes and commas)
  private parseCSVLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }

    result.push(current);
    return result;
  }

  // Infer data type from string value
  private inferValueType(
    value: string
  ): string | number | boolean | Date | null {
    if (!value || value === 'null' || value === '') return null;

    // Boolean
    if (value.toLowerCase() === 'true') return true;
    if (value.toLowerCase() === 'false') return false;

    // Number
    const numValue = Number(value);
    if (!isNaN(numValue) && isFinite(numValue)) return numValue;

    // Date
    const dateValue = new Date(value);
    if (
      !isNaN(dateValue.getTime()) &&
      value.match(/\d{4}-\d{2}-\d{2}|\d{2}\/\d{2}\/\d{4}/)
    ) {
      return dateValue.toISOString();
    }

    // String (default)
    return value;
  }

  // Infer schema from parsed data
  private inferSchemaFromData(data: DataRecord[]): SchemaField[] {
    if (data.length === 0) return [];

    const schema: SchemaField[] = [];
    const fieldStats: Record<
      string,
      {
        types: Set<string>;
        nullCount: number;
        uniqueValues: Set<any>;
        samples: any[];
      }
    > = {};

    // Analyze all records to understand field characteristics
    data.forEach((record) => {
      Object.entries(record).forEach(([fieldName, value]) => {
        if (!fieldStats[fieldName]) {
          fieldStats[fieldName] = {
            types: new Set(),
            nullCount: 0,
            uniqueValues: new Set(),
            samples: [],
          };
        }

        const stats = fieldStats[fieldName];

        if (value === null || value === undefined) {
          stats.nullCount++;
        } else {
          stats.types.add(typeof value);
          stats.uniqueValues.add(value);
          if (stats.samples.length < 10) {
            stats.samples.push(value);
          }
        }
      });
    });

    // Generate schema fields
    Object.entries(fieldStats).forEach(([fieldName, stats], index) => {
      const totalRecords = data.length;
      const isRequired = stats.nullCount < totalRecords * 0.1; // Less than 10% null
      const isUnique =
        stats.uniqueValues.size === totalRecords - stats.nullCount;

      // Determine primary type
      let primaryType = 'string';
      if (stats.types.has('number')) primaryType = 'number';
      else if (stats.types.has('boolean')) primaryType = 'boolean';
      else if (
        stats.samples.some(
          (s) =>
            typeof s === 'string' &&
            s.match(/\d{4}-\d{2}-\d{2}|\d{2}\/\d{2}\/\d{4}/)
        )
      ) {
        primaryType = 'date';
      }

      // Generate constraints
      const constraints: {
        required?: boolean;
        unique?: boolean;
        min?: number;
        max?: number;
        enum?: string[];
      } = { required: isRequired };
      if (isUnique) constraints.unique = true;

      if (primaryType === 'number') {
        const numericValues = stats.samples.filter(
          (s) => typeof s === 'number'
        ) as number[];
        if (numericValues.length > 0) {
          constraints.min = Math.min(...numericValues);
          constraints.max = Math.max(...numericValues);
        }
      }

      // Detect enums (if limited unique values)
      if (stats.uniqueValues.size <= 10 && stats.uniqueValues.size > 1) {
        constraints.enum = Array.from(stats.uniqueValues).map((v) => String(v));
      }

      schema.push({
        id: String(index + 1),
        name: fieldName,
        type: primaryType,
        description: `${fieldName} field (auto-detected)`,
        constraints,
      });
    });

    return schema;
  }

  // Generate augmented data that matches existing patterns
  async generateAugmentedData(
    originalData: DataRecord[],
    schema: SchemaField[],
    additionalRows: number,
    model: GenerationModel,
    config: DatasetConfig,
    onProgress?: (progress: number) => void
  ): Promise<DataRecord[]> {
    // Analyze patterns in original data
    const patterns = this.analyzeDataPatterns(originalData, schema);

    // Generate synthetic data using the same service but with augmentation context
    const generator = datasetGenerationService;
    const request = {
      model,
      config: {
        ...config,
        rows: additionalRows,
        schema,
      },
      streamCallback: onProgress,
    };

    const response = await generator.generateDataset(request);
    return response.data;
  }

  // Analyze patterns in existing data
  private analyzeDataPatterns(
    data: DataRecord[],
    schema: SchemaField[]
  ): Record<
    string,
    {
      type: string;
      sampleValues: unknown[];
      uniqueCount: number;
      commonValues: Array<{ value: unknown; count: number }>;
      range?: { min: number; max: number; avg: number };
      lengthRange?: { min: number; max: number };
    }
  > {
    const patterns: Record<
      string,
      {
        type: string;
        sampleValues: unknown[];
        uniqueCount: number;
        commonValues: Array<{ value: unknown; count: number }>;
        range?: { min: number; max: number; avg: number };
        lengthRange?: { min: number; max: number };
      }
    > = {};

    schema.forEach((field) => {
      const values = data
        .map((record) => record[field.name])
        .filter((v) => v !== null);

      patterns[field.name] = {
        type: field.type,
        sampleValues: values.slice(0, 10),
        uniqueCount: new Set(values).size,
        commonValues: this.getCommonValues(values),
      };

      if (field.type === 'number') {
        const numValues = values.filter(
          (v) => typeof v === 'number'
        ) as number[];
        if (numValues.length > 0) {
          patterns[field.name].range = {
            min: Math.min(...numValues),
            max: Math.max(...numValues),
            avg: numValues.reduce((a, b) => a + b, 0) / numValues.length,
          };
        }
      }

      if (field.type === 'string') {
        patterns[field.name].lengthRange = {
          min: Math.min(...values.map((v) => String(v).length)),
          max: Math.max(...values.map((v) => String(v).length)),
        };
      }
    });

    return patterns;
  }

  // Get most common values
  private getCommonValues(
    values: unknown[]
  ): Array<{ value: unknown; count: number }> {
    const counts: Record<string, number> = {};
    values.forEach((value) => {
      const key = String(value);
      counts[key] = (counts[key] || 0) + 1;
    });

    return Object.entries(counts)
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }

  // Build prompt for data augmentation
  private buildAugmentationPrompt(
    sampleData: DataRecord[],
    schema: SchemaField[],
    patterns: Record<string, unknown>,
    additionalRows: number
  ): string {
    return `You are augmenting an existing dataset. Generate ${additionalRows} new synthetic records that follow the same patterns as the existing data.

EXISTING DATA SAMPLE:
${JSON.stringify(sampleData, null, 2)}

SCHEMA:
${JSON.stringify(schema, null, 2)}

DATA PATTERNS ANALYSIS:
${JSON.stringify(patterns, null, 2)}

CRITICAL REQUIREMENTS:
1. Generate data that follows the same patterns as the existing dataset
2. Maintain similar value distributions and ranges
3. Use similar naming conventions and formats
4. Ensure uniqueness for fields marked as unique
5. Follow all schema constraints
6. Make the data realistic and consistent with the sample

Generate exactly ${additionalRows} records that seamlessly blend with the existing data:`;
  }

  // Merge original and synthetic data
  mergeDatasets(
    originalData: DataRecord[],
    syntheticData: DataRecord[]
  ): DataRecord[] {
    return [...originalData, ...syntheticData];
  }

  // Format file size
  private formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}

// Export singleton instance
export const dataAugmentationService = new DataAugmentationService();
