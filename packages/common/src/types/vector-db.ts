/**
 * Types related to vector database operations
 */

import { CodeChunk, UseCase } from './github';

/**
 * Vector database document structure
 */
export interface VectorDocument {
  /**
   * The document ID (matches the chunk ID)
   */
  id: string;
  
  /**
   * The text content to be embedded
   */
  text: string;
  
  /**
   * The vector embedding of the text
   */
  embedding?: number[];
  
  /**
   * Metadata for filtering and context
   */
  metadata: Record<string, any>;
}

/**
 * Configuration for vector database operations
 */
export interface VectorDBConfig {
  /**
   * OpenSearch connection options
   */
  connection: {
    /**
     * The host of the OpenSearch instance
     */
    host: string;
    
    /**
     * The port of the OpenSearch instance
     */
    port: number;
    
    /**
     * Authentication credentials (if required)
     */
    auth?: {
      username: string;
      password: string;
    };
    
    /**
     * Whether to use SSL for the connection
     */
    ssl?: boolean;
  };
  
  /**
   * Index configuration
   */
  index: {
    /**
     * The name of the index
     */
    name: string;
    
    /**
     * The dimensionality of the vector embeddings
     */
    dimensions: number;
  };
}

/**
 * Search parameters for querying the vector database
 */
export interface VectorSearchParams {
  /**
   * The query text to search for
   */
  query: string;
  
  /**
   * The use case for this search
   */
  useCase: UseCase;
  
  /**
   * Maximum number of results to return
   */
  limit?: number;
  
  /**
   * Minimum similarity score threshold
   */
  minScore?: number;
  
  /**
   * Additional filters to apply
   */
  filters?: Record<string, any>;
}

/**
 * Search result from the vector database
 */
export interface SearchResult {
  /**
   * The matched chunks
   */
  chunks: CodeChunk[];
  
  /**
   * The similarity scores for each chunk
   */
  scores: number[];
}