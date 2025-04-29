/**
 * API Controllers for GitHub RAG system
 */

import { Request, Response } from 'express';
import { GitHubETL } from '@github-rag-system/etl';
import { VectorDBConfig, UseCase } from '@github-rag-system/common';

// DB Configuration
const dbConfig: VectorDBConfig = {
  connection: {
    host: process.env.OPENSEARCH_HOST || 'localhost',
    port: parseInt(process.env.OPENSEARCH_PORT || '9200'),
    ssl: process.env.OPENSEARCH_SSL === 'true',
    auth: process.env.OPENSEARCH_USERNAME ? {
      username: process.env.OPENSEARCH_USERNAME,
      password: process.env.OPENSEARCH_PASSWORD || '',
    } : undefined,
  },
  index: {
    name: process.env.OPENSEARCH_INDEX || 'github-rag',
    dimensions: 1536, // Default for many embedding models
  },
};

// Create ETL processor
const etl = new GitHubETL(dbConfig);

/**
 * Process a GitHub repository
 */
export async function processRepository(req: Request, res: Response) {
  try {
    const { repositoryUrl, branch } = req.body;
    
    if (!repositoryUrl) {
      return res.status(400).json({ error: 'Repository URL is required' });
    }
    
    // Initialize the database if needed
    await etl.initializeDatabase();
    
    // Start processing (this could be moved to a background job in production)
    const result = await etl.processRepository(repositoryUrl, branch);
    
    return res.status(200).json({
      success: true,
      message: `Successfully processed repository: ${repositoryUrl}`,
      chunksIndexed: result,
    });
  } catch (error) {
    console.error('Failed to process repository:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to process repository',
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Search for relevant code based on a natural language query
 */
export async function search(req: Request, res: Response) {
  try {
    const { query, useCase, limit } = req.body;
    
    if (!query) {
      return res.status(400).json({ error: 'Search query is required' });
    }
    
    if (!useCase || !Object.values(UseCase).includes(useCase as UseCase)) {
      return res.status(400).json({ 
        error: 'Valid use case is required',
        validUseCases: Object.values(UseCase),
      });
    }
    
    // Perform the search
    const results = await etl.search(
      query, 
      useCase as UseCase, 
      limit ? parseInt(limit.toString()) : undefined
    );
    
    return res.status(200).json({
      success: true,
      results,
    });
  } catch (error) {
    console.error('Search failed:', error);
    return res.status(500).json({
      success: false,
      error: 'Search failed',
      message: error instanceof Error ? error.message : String(error),
    });
  }
}