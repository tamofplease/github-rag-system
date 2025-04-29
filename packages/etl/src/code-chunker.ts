/**
 * Code chunking logic for the ETL pipeline
 */

import { v4 as uuidv4 } from 'uuid';
import * as path from 'path';
import {
  GitHubFile,
  GitHubRepositoryInfo,
  CodeChunk,
  ChunkType,
  UseCase
} from '@github-rag-system/common';

/**
 * Handles code chunking for different use cases
 */
export class CodeChunker {
  private repoInfo: GitHubRepositoryInfo;

  /**
   * Creates a new CodeChunker
   * @param repoInfo The GitHub repository information
   */
  constructor(repoInfo: GitHubRepositoryInfo) {
    this.repoInfo = repoInfo;
  }

  /**
   * Processes files into appropriate chunks for different use cases
   * @param files The files to process
   * @returns Array of code chunks
   */
  processFiles(files: GitHubFile[]): CodeChunk[] {
    const chunks: CodeChunk[] = [];

    for (const file of files) {
      // Skip binary files or very large files
      if (this.shouldSkipFile(file)) {
        continue;
      }

      // Create file-level chunks
      chunks.push(...this.createFileChunks(file));

      // Only parse programming language files for more granular chunks
      if (this.isProgrammingFile(file)) {
        // Create class and function level chunks
        chunks.push(...this.createCodeChunks(file));
      }
    }

    return chunks;
  }

  /**
   * Determines if a file should be skipped
   * @param file The file to check
   * @returns True if the file should be skipped
   */
  private shouldSkipFile(file: GitHubFile): boolean {
    // Skip empty files
    if (!file.content.trim()) {
      return true;
    }

    // Skip very large files (>2MB)
    if (file.size > 2 * 1024 * 1024) {
      return true;
    }

    // Skip binary files (approximation)
    if (this.isLikelyBinary(file.content)) {
      return true;
    }

    // Skip common non-content files
    const skipPatterns = [
      /\.git\//,
      /node_modules\//,
      /\.DS_Store$/,
      /\.env$/,
      /\.log$/,
      /\.lock$/,
      /package-lock\.json$/,
      /yarn\.lock$/,
      /pnpm-lock\.yaml$/
    ];

    if (skipPatterns.some(pattern => pattern.test(file.path))) {
      return true;
    }

    return false;
  }

  /**
   * Checks if a file is likely a binary file
   * @param content The file content
   * @returns True if the file is likely binary
   */
  private isLikelyBinary(content: string): boolean {
    // Simple heuristic: check for null bytes or high proportion of non-printable characters
    if (content.includes('\0')) {
      return true;
    }

    // Count non-printable characters
    const nonPrintable = content.match(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g);
    if (nonPrintable && nonPrintable.length > content.length * 0.1) {
      return true;
    }

    return false;
  }

  /**
   * Checks if a file is a programming language file
   * @param file The file to check
   * @returns True if the file is a programming language file
   */
  private isProgrammingFile(file: GitHubFile): boolean {
    if (!file.language) {
      return false;
    }

    const programmingLanguages = [
      'typescript', 'javascript', 'python', 'java', 'c_cpp', 
      'csharp', 'go', 'ruby', 'php', 'swift', 'rust', 'kotlin'
    ];

    return programmingLanguages.includes(file.language);
  }

  /**
   * Creates file-level chunks
   * @param file The file to process
   * @returns Array of file-level chunks
   */
  private createFileChunks(file: GitHubFile): CodeChunk[] {
    const chunks: CodeChunk[] = [];
    const fileId = `file-${uuidv4()}`;
    const fileName = path.basename(file.path);
    const fileExt = path.extname(file.path);

    // Determine which use cases this file is relevant for
    const useCases: UseCase[] = this.determineUseCases(file);

    // Add the entire file as a chunk
    chunks.push({
      id: fileId,
      content: file.content,
      type: ChunkType.FILE,
      useCases,
      metadata: {
        repositoryInfo: this.repoInfo,
        filePath: file.path,
        language: file.language,
        // File-level chunks don't have line numbers
      }
    });

    // For README files, create a summary chunk that's useful for explanations
    if (
      fileName.toLowerCase() === 'readme.md' || 
      fileName.toLowerCase() === 'readme' || 
      (fileName.toLowerCase().includes('readme') && fileExt === '.md')
    ) {
      chunks.push({
        id: `summary-${uuidv4()}`,
        content: file.content,
        type: ChunkType.SUMMARY,
        useCases: [UseCase.EXPLANATION],
        metadata: {
          repositoryInfo: this.repoInfo,
          filePath: file.path,
          language: file.language,
        }
      });
    }

    return chunks;
  }

  /**
   * Creates code-level chunks (classes, functions, etc.)
   * @param file The file to process
   * @returns Array of code-level chunks
   */
  private createCodeChunks(file: GitHubFile): CodeChunk[] {
    const chunks: CodeChunk[] = [];

    try {
      // Simple line-based chunking as a fallback until tree-sitter is integrated
      const lines = file.content.split('\n');
      let currentFunction: {
        name: string;
        content: string[];
        startLine: number;
        endLine: number;
        isClass: boolean;
      } | null = null;

      // Extremely simple pattern matching for function/method/class detection
      // In a real implementation, we would use tree-sitter or a proper parser for each language
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        
        // Very basic function detection (this is an oversimplification)
        const functionMatch = line.match(/(?:function|def|public|private|protected)?\s*(\w+)\s*\([^)]*\)\s*(?::\s*\w+)?\s*{?/);
        const classMatch = line.match(/(?:class|interface)\s+(\w+)(?:\s+extends|\s+implements|\s*{)?/);
        
        if (currentFunction) {
          // Check for end of function/class
          if ((currentFunction.isClass && line.trim() === '}') || 
              (!currentFunction.isClass && line.match(/^\s*}\s*$/))) {
            currentFunction.content.push(line);
            currentFunction.endLine = i;
            
            // Add the function/class chunk
            const chunkType = currentFunction.isClass ? ChunkType.CLASS : ChunkType.FUNCTION;
            const useCases = this.determineUseCasesForSymbol(currentFunction.name, chunkType, file);
            
            chunks.push({
              id: `${chunkType.toLowerCase()}-${uuidv4()}`,
              content: currentFunction.content.join('\n'),
              type: chunkType,
              useCases,
              metadata: {
                repositoryInfo: this.repoInfo,
                filePath: file.path,
                language: file.language,
                startLine: currentFunction.startLine,
                endLine: currentFunction.endLine,
                symbolName: currentFunction.name
              }
            });
            
            currentFunction = null;
          } else {
            // Continue collecting lines for the current function/class
            currentFunction.content.push(line);
          }
        } else if (classMatch) {
          // Start of a new class
          currentFunction = {
            name: classMatch[1],
            content: [line],
            startLine: i,
            endLine: -1,
            isClass: true
          };
        } else if (functionMatch) {
          // Start of a new function
          currentFunction = {
            name: functionMatch[1],
            content: [line],
            startLine: i,
            endLine: -1,
            isClass: false
          };
        }
      }
      
      // Handle case where the function/class extends to the end of file
      if (currentFunction) {
        currentFunction.endLine = lines.length - 1;
        
        const chunkType = currentFunction.isClass ? ChunkType.CLASS : ChunkType.FUNCTION;
        const useCases = this.determineUseCasesForSymbol(currentFunction.name, chunkType, file);
        
        chunks.push({
          id: `${chunkType.toLowerCase()}-${uuidv4()}`,
          content: currentFunction.content.join('\n'),
          type: chunkType,
          useCases,
          metadata: {
            repositoryInfo: this.repoInfo,
            filePath: file.path,
            language: file.language,
            startLine: currentFunction.startLine,
            endLine: currentFunction.endLine,
            symbolName: currentFunction.name
          }
        });
      }
    } catch (error) {
      console.error(`Error creating code chunks for ${file.path}:`, error);
    }

    return chunks;
  }

  /**
   * Determines which use cases a file is relevant for
   * @param file The file to check
   * @returns Array of relevant use cases
   */
  private determineUseCases(file: GitHubFile): UseCase[] {
    const useCases: UseCase[] = [];
    const fileName = path.basename(file.path).toLowerCase();
    
    // Check if it's a test file
    const isTestFile = 
      fileName.includes('test') || 
      fileName.includes('spec') || 
      file.path.includes('test/') || 
      file.path.includes('tests/') || 
      file.path.includes('__tests__/');
    
    // Check if it's a README or documentation file
    const isDocFile = 
      fileName.includes('readme') || 
      fileName.includes('documentation') || 
      fileName.includes('docs') || 
      path.extname(file.path) === '.md';
    
    // Check if it's an interface/API definition file
    const isApiFile = 
      fileName.includes('api') || 
      fileName.includes('interface') || 
      fileName.includes('contract') || 
      fileName.endsWith('.d.ts');

    // Bug fixing: Include all implementation files, especially error handling 
    // and internal implementation details
    if (!isTestFile && !isDocFile) {
      useCases.push(UseCase.BUG_FIXING);
    }
    
    // Code generation: Include API, interface definitions, and examples
    if (isApiFile || fileName.includes('example') || isTestFile) {
      useCases.push(UseCase.CODE_GENERATION);
    }
    
    // Explanation: Include documentation, READMEs, and public interfaces
    if (isDocFile || isApiFile || file.path.includes('public/')) {
      useCases.push(UseCase.EXPLANATION);
    }
    
    // If no specific use cases were identified, include it for all use cases
    if (useCases.length === 0) {
      useCases.push(UseCase.BUG_FIXING, UseCase.CODE_GENERATION, UseCase.EXPLANATION);
    }
    
    return useCases;
  }

  /**
   * Determines which use cases a symbol (function/class) is relevant for
   * @param symbolName The name of the function or class
   * @param chunkType The type of chunk (class or function)
   * @param file The file containing the symbol
   * @returns Array of relevant use cases
   */
  private determineUseCasesForSymbol(symbolName: string, chunkType: ChunkType, file: GitHubFile): UseCase[] {
    const useCases: UseCase[] = [];
    const lowerSymbolName = symbolName.toLowerCase();
    
    // Bug fixing: Include error handling, internal implementations
    if (
      lowerSymbolName.includes('error') || 
      lowerSymbolName.includes('exception') || 
      lowerSymbolName.includes('handle') || 
      lowerSymbolName.includes('process') || 
      lowerSymbolName.includes('validate')
    ) {
      useCases.push(UseCase.BUG_FIXING);
    }
    
    // Code generation: Include public methods, constructors, factory methods
    if (
      lowerSymbolName.includes('create') || 
      lowerSymbolName.includes('build') || 
      lowerSymbolName.includes('new') || 
      lowerSymbolName.includes('get') || 
      lowerSymbolName.includes('generate') || 
      lowerSymbolName.startsWith('to') || 
      lowerSymbolName.startsWith('from') || 
      chunkType === ChunkType.CLASS
    ) {
      useCases.push(UseCase.CODE_GENERATION);
    }
    
    // Explanation: Include public interfaces and utilities
    if (
      !lowerSymbolName.startsWith('_') && 
      !lowerSymbolName.includes('internal') && 
      !lowerSymbolName.includes('private') && 
      (
        lowerSymbolName.includes('public') || 
        file.path.includes('public') || 
        chunkType === ChunkType.CLASS
      )
    ) {
      useCases.push(UseCase.EXPLANATION);
    }
    
    // If no specific use cases were identified, include it for all use cases
    if (useCases.length === 0) {
      useCases.push(UseCase.BUG_FIXING, UseCase.CODE_GENERATION, UseCase.EXPLANATION);
    }
    
    return useCases;
  }
}