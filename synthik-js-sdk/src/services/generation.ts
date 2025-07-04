/**
 * Dataset generation service for the SDK
 */

import {
  GenerationModel,
  GenerationRequest,
  GenerationResponse,
  DataRecord,
  SchemaField,
  DatasetConfig,
  ProgressCallback,
} from '../types';

interface BatchStrategy {
  optimalBatchSize: number;
  maxConcurrent: number;
  estimatedBatches: number;
  estimatedTime: number;
}

/**
 * OpenAI Generator
 */
export class OpenAIGenerator {
  private apiKey: string;
  private defaultModel: string = 'gpt-4o-mini';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async generateDataset(
    schema: SchemaField[],
    totalRows: number,
    config: DatasetConfig,
    onProgress?: ProgressCallback,
    modelOverride?: string
  ): Promise<DataRecord[]> {
    const model = modelOverride || this.defaultModel;
    const strategy = this.calculateBatchStrategy(
      schema,
      totalRows,
      config.quality || 'balanced'
    );

    onProgress?.(
      0,
      `Planning OpenAI generation: ${strategy.estimatedBatches} batches`
    );

    const allResults: DataRecord[] = [];
    let completedBatches = 0;
    let processedRows = 0;

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
            processedRows,
            model
          );
          batchPromises.push(batchPromise);
        }
      }

      try {
        onProgress?.(
          (completedBatches / strategy.estimatedBatches) * 100,
          `Processing batches ${chunkStart + 1}-${chunkEnd}`
        );

        const chunkResults = await Promise.all(batchPromises);
        chunkResults.forEach((batchData) => {
          allResults.push(...batchData);
          processedRows += batchData.length;
        });

        completedBatches += batchPromises.length;
        onProgress?.(
          (completedBatches / strategy.estimatedBatches) * 100,
          `Completed ${processedRows}/${totalRows} rows`
        );

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
    return allResults.slice(0, totalRows);
  }

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
      quality === 'high' ? 2 : quality === 'balanced' ? 1.5 : 1;

    let optimalBatchSize: number;
    if (complexityScore < 10) {
      optimalBatchSize = Math.min(100, totalRows);
    } else if (complexityScore < 20) {
      optimalBatchSize = Math.min(50, totalRows);
    } else {
      optimalBatchSize = Math.min(25, totalRows);
    }

    optimalBatchSize = Math.floor(optimalBatchSize / qualityMultiplier);
    optimalBatchSize = Math.max(10, optimalBatchSize);

    const estimatedBatches = Math.ceil(totalRows / optimalBatchSize);
    const maxConcurrent = totalRows < 100 ? 2 : totalRows < 1000 ? 3 : 5;
    const avgTimePerBatch = 2;
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

  private async generateSingleBatch(
    schema: SchemaField[],
    batchSize: number,
    config: DatasetConfig,
    batchIndex: number,
    rowOffset: number,
    model: string
  ): Promise<DataRecord[]> {
    const prompt = this.buildBatchPrompt(
      schema,
      batchSize,
      config,
      batchIndex,
      rowOffset
    );

    try {
      const result = await this.callOpenAI(prompt, model);
      return this.validateAndCleanBatch(result, schema, batchSize);
    } catch (error) {
      console.error(`Batch ${batchIndex} failed:`, error);
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
    const schemaObj: Record<string, any> = {};
    schema.forEach((field) => {
      const fieldDef: any = {
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

    return `Generate exactly ${batchSize} records for batch ${batchIndex + 1}.

Context: Generate realistic ${config.name} data

Schema: ${JSON.stringify(schemaObj, null, 2)}

CRITICAL REQUIREMENTS:
1. Return EXACTLY ${batchSize} records as a JSON array
2. Each record MUST have ALL fields: ${schema.map((f) => f.name).join(', ')}
3. For unique fields, start numbering from ${rowOffset + 1}
4. Follow ALL constraints exactly
5. Make data realistic and diverse
6. Return ONLY the JSON array, no other text

Example record:
${JSON.stringify(example, null, 2)}

Generate the JSON array now:`;
  }

  private async callOpenAI(
    prompt: string,
    model: string
  ): Promise<DataRecord[]> {
    const batchSizeMatch = prompt.match(/exactly (\d+) records/i);
    const requestedBatchSize = batchSizeMatch
      ? parseInt(batchSizeMatch[1])
      : 10;
    const tokensPerRecord = 150;
    const maxTokens = Math.min(
      Math.max(4000, requestedBatchSize * tokensPerRecord),
      16000
    );

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'system',
            content:
              'You are a data generation expert. Generate synthetic data that is realistic, diverse, and follows the specified schema exactly. Return ONLY a valid JSON array.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.8,
        max_tokens: maxTokens,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        `OpenAI API error: ${response.statusText} - ${JSON.stringify(errorData)}`
      );
    }

    const data = await response.json();
    const content = data.choices[0].message.content.trim();

    let parsedData: unknown;
    try {
      parsedData = JSON.parse(content);
    } catch {
      const arrayMatch = content.match(/\[\s*\{[\s\S]*?\}\s*\]/);
      if (arrayMatch) {
        parsedData = JSON.parse(arrayMatch[0]);
      } else {
        throw new Error('No valid JSON array found');
      }
    }

    if (!Array.isArray(parsedData)) {
      throw new Error('Expected array but got object');
    }

    return parsedData.filter(
      (item) => item && typeof item === 'object'
    ) as DataRecord[];
  }

  private validateAndCleanBatch(
    rawData: DataRecord[],
    schema: SchemaField[],
    expectedSize: number
  ): DataRecord[] {
    if (!Array.isArray(rawData)) {
      return [];
    }

    return rawData
      .filter((record) => record && typeof record === 'object')
      .map((record) => {
        const cleanRecord: DataRecord = {};
        schema.forEach((field) => {
          cleanRecord[field.name] =
            record[field.name] ?? this.generateMissingField(field);
        });
        return cleanRecord;
      })
      .slice(0, expectedSize);
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
            exampleRecord[field.name] =
              `ID-${String(idSuffix).padStart(3, '0')}`;
          } else if (field.name.includes('name')) {
            exampleRecord[field.name] = 'John Doe';
          } else if (field.name.includes('email')) {
            exampleRecord[field.name] = 'john@example.com';
          } else if (field.constraints?.enum) {
            exampleRecord[field.name] = field.constraints.enum[0];
          } else {
            exampleRecord[field.name] = 'Sample text value';
          }
          break;
        case 'number':
          if (field.name.includes('price') || field.name.includes('amount')) {
            exampleRecord[field.name] = field.constraints?.min || 29.99;
          } else if (field.name.includes('age')) {
            exampleRecord[field.name] = 35;
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
        default:
          exampleRecord[field.name] = 'Sample value';
      }
    });
    return exampleRecord;
  }
}

/**
 * Google Gemini Generator
 */
export class GeminiGenerator {
  private apiKey: string;
  private defaultModel: string = 'gemini-1.5-flash';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async generateDataset(
    schema: SchemaField[],
    totalRows: number,
    config: DatasetConfig,
    onProgress?: ProgressCallback,
    modelOverride?: string
  ): Promise<DataRecord[]> {
    const model = modelOverride || this.defaultModel;
    const strategy = this.calculateBatchStrategy(
      schema,
      totalRows,
      config.quality || 'balanced'
    );

    onProgress?.(
      0,
      `Planning Gemini generation: ${strategy.estimatedBatches} batches`
    );

    const allResults: DataRecord[] = [];
    let completedBatches = 0;
    let processedRows = 0;

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
            processedRows,
            model
          );
          batchPromises.push(batchPromise);
        }
      }

      try {
        onProgress?.(
          (completedBatches / strategy.estimatedBatches) * 100,
          `Processing Gemini batches ${chunkStart + 1}-${chunkEnd}`
        );

        const chunkResults = await Promise.allSettled(batchPromises);
        chunkResults.forEach((result) => {
          if (result.status === 'fulfilled') {
            allResults.push(...result.value);
            processedRows += result.value.length;
          }
        });

        completedBatches += batchPromises.length;
        onProgress?.(
          (completedBatches / strategy.estimatedBatches) * 100,
          `Completed ${processedRows}/${totalRows} rows via Gemini`
        );

        if (chunkEnd < strategy.estimatedBatches) {
          await new Promise((resolve) => setTimeout(resolve, 300));
        }
      } catch (error) {
        console.warn(
          `Error in Gemini batch chunk ${chunkStart}-${chunkEnd}:`,
          error
        );
      }
    }

    onProgress?.(
      100,
      `Gemini generation complete: ${allResults.length} rows generated`
    );
    return allResults.slice(0, totalRows);
  }

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

    let optimalBatchSize: number;
    if (complexityScore < 10) {
      optimalBatchSize = Math.min(50, totalRows);
    } else if (complexityScore < 20) {
      optimalBatchSize = Math.min(30, totalRows);
    } else {
      optimalBatchSize = Math.min(20, totalRows);
    }

    optimalBatchSize = Math.floor(optimalBatchSize / qualityMultiplier);
    optimalBatchSize = Math.max(15, optimalBatchSize);

    const estimatedBatches = Math.ceil(totalRows / optimalBatchSize);
    const maxConcurrent = totalRows < 500 ? 4 : totalRows < 2000 ? 6 : 8;
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

  private async generateSingleBatch(
    schema: SchemaField[],
    batchSize: number,
    config: DatasetConfig,
    batchIndex: number,
    rowOffset: number,
    model: string
  ): Promise<DataRecord[]> {
    const prompt = this.buildBatchPrompt(
      schema,
      batchSize,
      config,
      batchIndex,
      rowOffset
    );

    try {
      const result = await this.callGemini(prompt, model);
      return this.validateAndCleanBatch(result, schema, batchSize);
    } catch (error) {
      console.error(`Gemini batch ${batchIndex} failed:`, error);
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
    const schemaObj: Record<string, any> = {};
    schema.forEach((field) => {
      const fieldDef: any = {
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

    return `You are an expert synthetic data generator. Generate exactly ${batchSize} realistic, diverse records for batch ${batchIndex + 1}.

**Context:** Generate realistic ${config.name} data

**Schema Definition:**
${JSON.stringify(schemaObj, null, 2)}

**CRITICAL REQUIREMENTS:**
1. Generate EXACTLY ${batchSize} records as a valid JSON array
2. Each record must contain ALL fields: ${schema.map((f) => f.name).join(', ')}
3. For unique fields, start numbering from ${rowOffset + 1}
4. Follow ALL constraints precisely
5. Create realistic, diverse data with natural variations
6. Return ONLY the JSON array - no explanations, no markdown

**Example Record Structure:**
${JSON.stringify(example, null, 2)}

Generate the ${batchSize} records now:`;
  }

  private async callGemini(
    prompt: string,
    model: string
  ): Promise<DataRecord[]> {
    const batchSizeMatch = prompt.match(/exactly (\d+) realistic/i);
    const requestedBatchSize = batchSizeMatch ? parseInt(batchSizeMatch[1]) : 0;
    const tokensPerRecord = 150;
    const maxOutputTokens = Math.min(
      Math.max(4096, requestedBatchSize * tokensPerRecord * 1.5),
      32768
    );

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${this.apiKey}`,
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
      throw new Error(
        `Gemini API error: ${response.statusText} - ${JSON.stringify(errorData)}`
      );
    }

    const data = await response.json();

    if (!data.candidates || data.candidates.length === 0) {
      throw new Error('Gemini API returned no candidates');
    }

    if (!data.candidates[0] || !data.candidates[0].content) {
      throw new Error('Gemini API response missing content');
    }

    const content = data.candidates[0].content.parts[0].text.trim();

    if (!content) {
      throw new Error('Gemini API returned empty content');
    }

    let parsedData: unknown;
    try {
      parsedData = JSON.parse(content);
    } catch {
      const jsonMatch = content.match(/\[\s*\{[\s\S]*?\}\s*\]/);
      if (jsonMatch) {
        parsedData = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON array pattern found in content');
      }
    }

    if (!Array.isArray(parsedData)) {
      throw new Error('Gemini returned non-array');
    }

    return parsedData.filter(
      (item) => item && typeof item === 'object'
    ) as DataRecord[];
  }

  private validateAndCleanBatch(
    rawData: DataRecord[],
    schema: SchemaField[],
    expectedSize: number
  ): DataRecord[] {
    if (!Array.isArray(rawData)) {
      return [];
    }

    return rawData
      .filter((record) => record && typeof record === 'object')
      .map((record) => {
        const cleanRecord: DataRecord = {};
        schema.forEach((field) => {
          cleanRecord[field.name] =
            record[field.name] ?? this.generateMissingField(field);
        });
        return cleanRecord;
      })
      .slice(0, expectedSize);
  }

  private generateMissingField(
    field: SchemaField
  ): string | number | boolean | Date | null {
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
            exampleRecord[field.name] =
              `${field.name.toUpperCase()}_${String(idSuffix).padStart(3, '0')}`;
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
}

/**
 * Main Dataset Generation Service
 */
export class DatasetGenerationService {
  private generators: Map<string, OpenAIGenerator | GeminiGenerator> =
    new Map();

  constructor(apiKeys: { openai?: string; google?: string }) {
    if (apiKeys.openai) {
      this.generators.set('openai', new OpenAIGenerator(apiKeys.openai));
    }

    if (apiKeys.google) {
      this.generators.set('google', new GeminiGenerator(apiKeys.google));
    }
  }

  /**
   * Get available models based on configured API keys
   */
  getAvailableModels(): GenerationModel[] {
    const models: GenerationModel[] = [];

    if (this.generators.has('openai')) {
      models.push({
        id: 'gpt-4o-mini',
        name: 'GPT-4o Mini',
        provider: 'openai',
        capabilities: {
          maxTokens: 16000,
          supportsStructuredOutput: true,
          supportsStreaming: true,
          costPerToken: 0.00015,
        },
      });

      models.push({
        id: 'gpt-4o',
        name: 'GPT-4o',
        provider: 'openai',
        capabilities: {
          maxTokens: 128000,
          supportsStructuredOutput: true,
          supportsStreaming: true,
          costPerToken: 0.0025,
        },
      });
    }

    if (this.generators.has('google')) {
      models.push({
        id: 'gemini-1.5-flash',
        name: 'Gemini 1.5 Flash',
        provider: 'google',
        capabilities: {
          maxTokens: 32768,
          supportsStructuredOutput: true,
          supportsStreaming: true,
          costPerToken: 0.00007,
        },
      });

      models.push({
        id: 'gemini-1.5-pro',
        name: 'Gemini 1.5 Pro',
        provider: 'google',
        capabilities: {
          maxTokens: 32768,
          supportsStructuredOutput: true,
          supportsStreaming: true,
          costPerToken: 0.00125,
        },
      });
    }

    return models;
  }

  /**
   * Generate a dataset using the specified model
   */
  async generateDataset(
    request: GenerationRequest
  ): Promise<GenerationResponse> {
    const startTime = Date.now();
    const { model, config } = request;

    const generator = this.generators.get(model.provider);
    if (!generator) {
      throw new Error(
        `Generator for ${model.provider} not available. Please provide API key in config.`
      );
    }

    const data = await generator.generateDataset(
      config.schema,
      config.rows,
      config,
      request.streamCallback,
      model.id
    );

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

  /**
   * Generate a preview (small sample) of a dataset
   */
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
    const jsonString = JSON.stringify(data);
    return Math.ceil(jsonString.length / 4);
  }

  /**
   * Export data in different formats
   */
  exportData(data: DataRecord[], format: 'json' | 'csv'): Blob {
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

      default:
        throw new Error(`Unsupported format: ${format}`);
    }
  }
}
