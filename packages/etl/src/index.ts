/**
 * Main entry point for the ETL pipeline
 */

import { VectorDBClient } from '@github-rag-system/db';
import { 
  GitHubRepositoryInfo, 
  VectorDocument,
  UseCase,
  VectorDBConfig,
  CodeChunk
} from '@github-rag-system/common';
import { GitHubRepository } from './github-repo';
import { CodeChunker } from './code-chunker';

/**
 * Main ETL processor for GitHub repositories
 */
export class GitHubETL {
  private dbClient: VectorDBClient;
  private workDir?: string;

  /**
   * Creates a new GitHubETL processor
   * @param dbConfig Configuration for the vector database
   * @param workDir Optional custom working directory for cloned repositories
   */
  constructor(dbConfig: VectorDBConfig, workDir?: string) {
    this.dbClient = new VectorDBClient({
      ...dbConfig,
      openai: {
        apiKey: process.env.OPENAI_API_KEY || '',
        model: process.env.OPENAI_MODEL || 'text-embedding-3-small',
      }
    });
    this.workDir = workDir;
  }

  /**
   * Initialize the vector database
   */
  async initializeDatabase(): Promise<boolean> {
    return this.dbClient.initIndex();
  }

  /**
   * Process a GitHub repository and store it in the vector database
   * @param repositoryUrl URL of the GitHub repository to process
   * @param branch Optional branch name to process (defaults to main)
   * @returns Promise resolving to the number of indexed chunks
   */
  async processRepository(repositoryUrl: string, branch?: string): Promise<number> {
    try {
      console.log(`Processing repository: ${repositoryUrl}`);
      
      // Parse the repository URL
      const repoInfo: GitHubRepositoryInfo = {
        url: repositoryUrl,
        owner: '',
        name: '',
        branch
      };
      
      // Create GitHub repository handler
      const repo = new GitHubRepository(repoInfo, this.workDir);
      
      // Clone the repository
      await repo.cloneOrPull();
      
      // Get all files
      const files = await repo.getFiles();
      console.log(`Got ${files.length} files from repository`);
      
      // Process files into chunks
      const chunker = new CodeChunker(repoInfo);
      const chunks = chunker.processFiles(files);
      console.log(`Created ${chunks.length} chunks from repository files`);
      
      // Clear existing data for this repository
      await this.dbClient.deleteByRepository(repositoryUrl);
      
      // Convert chunks to vector documents
      const documents = this.prepareDocumentsForIndexing(chunks);
      
      // Index documents in batches
      const batchSize = 100;
      let indexedCount = 0;
      
      for (let i = 0; i < documents.length; i += batchSize) {
        const batch = documents.slice(i, i + batchSize);
        const result = await this.dbClient.indexDocuments(batch);
        indexedCount += result;
        console.log(`Indexed batch of ${result} documents (${indexedCount}/${documents.length})`);
      }
      
      console.log(`Completed processing repository ${repositoryUrl}. Indexed ${indexedCount} documents.`);
      
      // Clean up
      repo.cleanup();
      
      return indexedCount;
    } catch (error) {
      console.error('Failed to process repository:', error);
      throw error;
    }
  }
  
  /**
   * Search for relevant code chunks in the vector database
   * @param query The search query
   * @param useCase The use case for this search
   * @param limit Maximum number of results
   * @returns Promise resolving to search results
   */
  async search(query: string, useCase: UseCase, limit = 10) {
    return this.dbClient.search({
      query,
      useCase,
      limit
    });
  }
  
  /**
   * Converts code chunks to vector documents for indexing
   * @param chunks The code chunks to convert
   * @returns Array of vector documents
   */
  private prepareDocumentsForIndexing(chunks: CodeChunk[]): VectorDocument[] {
    return chunks.map(chunk => ({
      id: chunk.id,
      text: chunk.content,
      metadata: {
        ...chunk.metadata,
        type: chunk.type,
        useCases: chunk.useCases
      }
    }));
  }
}

// Export the ETL components
export * from './github-repo';
export * from './code-chunker';