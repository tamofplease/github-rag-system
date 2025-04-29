/**
 * GitHub repository handling for the ETL pipeline
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import simpleGit, { SimpleGit } from 'simple-git';
import { GitHubRepositoryInfo, GitHubFile } from '@github-rag-system/common';

/**
 * Handler for GitHub repository operations
 */
export class GitHubRepository {
  private git: SimpleGit;
  private repoInfo: GitHubRepositoryInfo;
  private localPath: string;

  /**
   * Creates a new GitHubRepository handler
   * @param repoInfo The GitHub repository information
   * @param workDir Optional custom working directory
   */
  constructor(repoInfo: GitHubRepositoryInfo, workDir?: string) {
    this.repoInfo = repoInfo;
    this.git = simpleGit();
    
    // Parse the repository URL to extract owner and name if not provided
    if (!repoInfo.owner || !repoInfo.name) {
      const urlParts = repoInfo.url.split('/');
      if (urlParts.length >= 2) {
        const name = urlParts.pop() || '';
        const owner = urlParts.pop() || '';
        this.repoInfo.owner = this.repoInfo.owner || owner;
        this.repoInfo.name = this.repoInfo.name || name.replace('.git', '');
      }
    }

    // Default to system temp directory if no workDir is provided
    const baseDir = workDir || path.join(os.tmpdir(), 'github-rag-system');
    this.localPath = path.join(baseDir, this.repoInfo.owner, this.repoInfo.name);

    // Ensure the directory exists
    fs.mkdirSync(this.localPath, { recursive: true });
  }

  /**
   * Clones the repository locally, or pulls the latest changes if it already exists
   * @returns Promise resolving to the local repository path
   */
  async cloneOrPull(): Promise<string> {
    try {
      if (fs.existsSync(path.join(this.localPath, '.git'))) {
        // Repository already exists, pull latest changes
        console.log(`Repository already exists at ${this.localPath}, pulling latest changes`);
        await this.git.cwd(this.localPath).pull();
      } else {
        // Clone the repository
        console.log(`Cloning repository ${this.repoInfo.url} to ${this.localPath}`);
        await this.git.clone(this.repoInfo.url, this.localPath);
      }

      // Checkout the specified branch if provided
      if (this.repoInfo.branch) {
        await this.git.cwd(this.localPath).checkout(this.repoInfo.branch);
      }

      return this.localPath;
    } catch (error) {
      console.error('Failed to clone or pull repository:', error);
      throw error;
    }
  }

  /**
   * Gets all files from the repository, optionally filtered by extensions
   * @param extensions Optional array of file extensions to filter by (e.g., ['.ts', '.js'])
   * @returns Promise resolving to an array of GitHubFile objects
   */
  async getFiles(extensions?: string[]): Promise<GitHubFile[]> {
    try {
      const files: GitHubFile[] = [];
      const filePaths = await this.getAllFilePaths(this.localPath);

      // Filter by extensions if provided
      const filteredPaths = extensions 
        ? filePaths.filter(filePath => {
            const ext = path.extname(filePath);
            return extensions.includes(ext);
          }) 
        : filePaths;
      
      // Process each file
      for (const filePath of filteredPaths) {
        try {
          const relativePath = path.relative(this.localPath, filePath);
          const content = fs.readFileSync(filePath, 'utf-8');
          const stats = fs.statSync(filePath);
          
          // Determine language based on file extension
          const ext = path.extname(filePath).toLowerCase();
          let language: string | undefined;
          
          switch (ext) {
            case '.ts':
            case '.tsx':
              language = 'typescript';
              break;
            case '.js':
            case '.jsx':
              language = 'javascript';
              break;
            case '.py':
              language = 'python';
              break;
            case '.java':
              language = 'java';
              break;
            case '.rb':
              language = 'ruby';
              break;
            case '.go':
              language = 'go';
              break;
            case '.rs':
              language = 'rust';
              break;
            case '.c':
            case '.cpp':
            case '.cc':
            case '.h':
            case '.hpp':
              language = 'c_cpp';
              break;
            case '.cs':
              language = 'csharp';
              break;
            case '.php':
              language = 'php';
              break;
            case '.swift':
              language = 'swift';
              break;
            case '.kt':
            case '.kts':
              language = 'kotlin';
              break;
            default:
              // For other file types, let's try to identify by content
              if (content.includes('<?php')) {
                language = 'php';
              } else if (content.includes('<?xml')) {
                language = 'xml';
              } else if (content.includes('<!DOCTYPE html>') || content.includes('<html>')) {
                language = 'html';
              }
          }
          
          files.push({
            path: relativePath,
            content,
            language,
            size: stats.size
          });
        } catch (error) {
          console.warn(`Skipping file ${filePath}: ${error}`);
        }
      }
      
      return files;
    } catch (error) {
      console.error('Failed to get repository files:', error);
      throw error;
    }
  }

  /**
   * Gets all file paths recursively from a directory
   * @param dirPath The directory path to scan
   * @param results Optional array to accumulate results
   * @returns Promise resolving to an array of file paths
   */
  private async getAllFilePaths(dirPath: string, results: string[] = []): Promise<string[]> {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      
      // Skip .git directory and node_modules
      if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === 'dist') {
        continue;
      }
      
      if (entry.isDirectory()) {
        await this.getAllFilePaths(fullPath, results);
      } else {
        results.push(fullPath);
      }
    }
    
    return results;
  }

  /**
   * Cleans up the local repository files
   */
  cleanup(): void {
    try {
      // Not deleting for safety, but could implement deletion here if needed
      console.log(`Repository cleanup for ${this.localPath} - skipping deletion for safety`);
    } catch (error) {
      console.error('Failed to clean up repository:', error);
    }
  }
}