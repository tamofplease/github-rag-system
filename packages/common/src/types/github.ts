/**
 * Types related to GitHub repositories and ETL processing
 */

export interface GitHubRepositoryInfo {
  /**
   * The full URL of the GitHub repository
   * @example https://github.com/username/repo
   */
  url: string;
  
  /**
   * The owner or organization name
   */
  owner: string;
  
  /**
   * The name of the repository
   */
  name: string;
  
  /**
   * The branch to process (defaults to main)
   */
  branch?: string;
}

/**
 * Represents a file in a GitHub repository
 */
export interface GitHubFile {
  /**
   * The path of the file within the repository
   */
  path: string;
  
  /**
   * The content of the file
   */
  content: string;
  
  /**
   * The programming language of the file (if applicable)
   */
  language?: string;
  
  /**
   * The size of the file in bytes
   */
  size: number;
}

/**
 * Types of chunks for different use cases
 */
export enum ChunkType {
  FILE = 'file',
  CLASS = 'class',
  FUNCTION = 'function',
  SUMMARY = 'summary'
}

/**
 * Use cases for RAG system
 */
export enum UseCase {
  BUG_FIXING = 'bug_fixing',
  CODE_GENERATION = 'code_generation',
  EXPLANATION = 'explanation'
}

/**
 * Represents a code chunk from a GitHub repository
 */
export interface CodeChunk {
  /**
   * Unique identifier for the chunk
   */
  id: string;
  
  /**
   * The content of the chunk
   */
  content: string;
  
  /**
   * The type of the chunk (file, class, function, etc.)
   */
  type: ChunkType;
  
  /**
   * The use cases this chunk is relevant for
   */
  useCases: UseCase[];
  
  /**
   * Metadata for the chunk
   */
  metadata: {
    /**
     * The repository this chunk is from
     */
    repositoryInfo: GitHubRepositoryInfo;
    
    /**
     * The path of the file this chunk is from
     */
    filePath: string;
    
    /**
     * The programming language of the chunk
     */
    language?: string;
    
    /**
     * Starting line number in the original file
     */
    startLine?: number;
    
    /**
     * Ending line number in the original file
     */
    endLine?: number;
    
    /**
     * Name of the function or class (if applicable)
     */
    symbolName?: string;
  };
}