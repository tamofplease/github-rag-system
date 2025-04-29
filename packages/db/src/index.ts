/**
 * OpenSearch vector database integration for GitHub RAG system
 */

import { Client } from '@opensearch-project/opensearch';
import OpenAI from 'openai';
import {
  VectorDBConfig,
  VectorDocument,
  VectorSearchParams,
  SearchResult,
  CodeChunk
} from '@github-rag-system/common';

/**
 * Extended configuration to include OpenAI API settings
 */
export interface ExtendedVectorDBConfig extends VectorDBConfig {
  openai?: {
    apiKey: string;
    model?: string;
  };
}

/**
 * Client for interacting with OpenSearch as a vector database
 */
export class VectorDBClient {
  private client: Client;
  private config: ExtendedVectorDBConfig;
  private openai: OpenAI | null = null;
  private embeddingModel: string;

  /**
   * Creates a new VectorDBClient
   * @param config The configuration for the vector database
   */
  constructor(config: ExtendedVectorDBConfig) {
    this.config = config;
    this.client = new Client({
      node: `http${config.connection.ssl ? 's' : ''}://${config.connection.host}:${config.connection.port}`,
      auth: config.connection.auth ? {
        username: config.connection.auth.username,
        password: config.connection.auth.password,
      } : undefined,
    });

    // Initialize OpenAI client if API key is provided
    if (config.openai?.apiKey) {
      this.openai = new OpenAI({
        apiKey: config.openai.apiKey,
      });
      this.embeddingModel = config.openai.model || 'text-embedding-3-small';
    } else {
      console.warn('OpenAI API key not provided. Embedding functionality will be limited.');
      this.embeddingModel = '';
    }
  }

  /**
   * Creates an embedding using OpenAI's API
   * @param text The text to create an embedding for
   * @returns Promise resolving to the embedding vector
   */
  private async createEmbedding(text: string): Promise<number[]> {
    if (!this.openai) {
      throw new Error('OpenAI client not initialized. Please provide an API key.');
    }

    try {
      const response = await this.openai.embeddings.create({
        model: this.embeddingModel,
        input: text,
      });

      return response.data[0].embedding;
    } catch (error) {
      console.error('Failed to create embedding:', error);
      throw error;
    }
  }

  /**
   * Initializes the vector index in OpenSearch
   * @returns Promise resolving to true if successful
   */
  async initIndex(): Promise<boolean> {
    try {
      const indexExists = await this.client.indices.exists({
        index: this.config.index.name,
      });

      if (indexExists.body) {
        console.log(`Index ${this.config.index.name} already exists`);
        return true;
      }

      // Create index with vector search capabilities
      await this.client.indices.create({
        index: this.config.index.name,
        body: {
          mappings: {
            properties: {
              text: { type: 'text' },
              embedding: {
                type: 'knn_vector',
                dimension: this.config.index.dimensions,
                method: {
                  name: 'hnsw',
                  space_type: 'cosinesimil',
                  engine: 'nmslib',
                },
              },
              metadata: {
                type: 'object',
                properties: {
                  repositoryInfo: {
                    type: 'object',
                    properties: {
                      url: { type: 'keyword' },
                      owner: { type: 'keyword' },
                      name: { type: 'keyword' },
                      branch: { type: 'keyword' }
                    }
                  },
                  filePath: { type: 'keyword' },
                  language: { type: 'keyword' },
                  startLine: { type: 'integer' },
                  endLine: { type: 'integer' },
                  symbolName: { type: 'keyword' },
                  type: { type: 'keyword' },
                  useCases: { type: 'keyword' }
                }
              }
            }
          }
        }
      });

      console.log(`Index ${this.config.index.name} created successfully`);
      return true;
    } catch (error) {
      console.error('Failed to initialize index:', error);
      throw error;
    }
  }

  /**
   * Indexes a batch of documents in the vector database
   * @param documents Array of documents to index
   * @returns Promise resolving to the number of successfully indexed documents
   */
  async indexDocuments(documents: VectorDocument[]): Promise<number> {
    try {
      if (documents.length === 0) {
        return 0;
      }

      // Generate embeddings for documents that don't have them
      const docsToProcess = [...documents];
      for (let i = 0; i < docsToProcess.length; i++) {
        if (!docsToProcess[i].embedding && this.openai) {
          try {
            docsToProcess[i].embedding = await this.createEmbedding(docsToProcess[i].text);
          } catch (error) {
            console.error(`Failed to create embedding for document ${docsToProcess[i].id}:`, error);
            // Continue processing other documents
          }
        }
      }

      // Prepare bulk indexing operations
      const operations = docsToProcess.flatMap(doc => [
        { index: { _index: this.config.index.name, _id: doc.id } },
        {
          text: doc.text,
          embedding: doc.embedding,
          metadata: doc.metadata
        }
      ]);

      const response = await this.client.bulk({ body: operations });
      
      if (response.body.errors) {
        const errors = response.body.items.filter((item: any) => item.index?.error);
        console.error(`Errors during indexing: ${errors.length} failures`);
        errors.forEach((error: any) => console.error(error.index?.error));
        
        // Return count of successful operations
        return documents.length - errors.length;
      }

      return documents.length;
    } catch (error) {
      console.error('Failed to index documents:', error);
      throw error;
    }
  }

  /**
   * Performs a vector search in OpenSearch
   * @param params Search parameters
   * @returns Promise resolving to search results
   */
  async search(params: VectorSearchParams): Promise<SearchResult> {
    try {
      // Build filters based on use case
      const useCaseFilter = {
        term: {
          "metadata.useCases": params.useCase
        }
      };

      // Additional filters can be added based on params.filters
      const additionalFilters: any[] = [];
      if (params.filters) {
        Object.entries(params.filters).forEach(([key, value]) => {
          additionalFilters.push({
            term: {
              [`metadata.${key}`]: value
            }
          });
        });
      }

      // Generate embedding for the query using OpenAI
      let queryEmbedding: number[] | null = null;
      if (this.openai) {
        try {
          queryEmbedding = await this.createEmbedding(params.query);
        } catch (error) {
          console.error('Failed to create query embedding:', error);
          // Will fall back to text search
        }
      }

      let response;
      if (queryEmbedding) {
        // Build the vector search query
        const vectorSearchBody = {
          size: params.limit || 10,
          query: {
            bool: {
              must: [
                {
                  knn: {
                    embedding: {
                      vector: queryEmbedding,
                      k: params.limit || 10
                    }
                  }
                }
              ],
              filter: [
                useCaseFilter,
                ...additionalFilters
              ]
            }
          }
        };

        response = await this.client.search({
          index: this.config.index.name,
          body: vectorSearchBody
        });
      } else {
        // Fallback to text search if embedding generation fails
        const fallbackSearchBody = {
          size: params.limit || 10,
          query: {
            bool: {
              must: [
                {
                  match: {
                    text: params.query
                  }
                }
              ],
              filter: [
                useCaseFilter,
                ...additionalFilters
              ]
            }
          }
        };

        response = await this.client.search({
          index: this.config.index.name,
          body: fallbackSearchBody
        });
      }

      // Process and return results
      const hits = response.body.hits.hits;
      const chunks: CodeChunk[] = hits.map((hit: any) => {
        const source = hit._source;
        return {
          id: hit._id,
          content: source.text,
          type: source.metadata.type,
          useCases: source.metadata.useCases,
          metadata: source.metadata
        };
      });

      const scores = hits.map((hit: any) => hit._score);

      return {
        chunks,
        scores
      };
    } catch (error) {
      console.error('Search failed:', error);
      throw error;
    }
  }

  /**
   * Deletes documents from the index by repository URL
   * @param repositoryUrl The repository URL to filter documents by
   * @returns Promise resolving to the number of deleted documents
   */
  async deleteByRepository(repositoryUrl: string): Promise<number> {
    try {
      const response = await this.client.deleteByQuery({
        index: this.config.index.name,
        body: {
          query: {
            term: {
              "metadata.repositoryInfo.url": repositoryUrl
            }
          }
        }
      });

      return response.body.deleted;
    } catch (error) {
      console.error('Failed to delete documents:', error);
      throw error;
    }
  }
}