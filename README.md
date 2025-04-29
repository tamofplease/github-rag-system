# GitHub RAG System

A system for extracting, transforming, and loading GitHub repositories into a vector database for retrieval-augmented generation (RAG) using natural language queries.

## Overview

This project implements a complete pipeline for building a RAG system based on GitHub repositories:

1. **ETL Process**: Clone GitHub repositories, process the code into appropriate chunks based on use cases
2. **Vector Storage**: Store code chunks in OpenSearch vector database with relevant metadata
3. **Search API**: Query the vector database using natural language to find relevant code

The system is designed to support multiple use cases:

- **Bug Fixing**: Find internal implementation details and error handling code
- **Code Generation**: Find relevant code examples and patterns for generating new code
- **Explanation**: Find documentation and public interfaces to explain how code works

## Project Structure

This project is organized as a TypeScript monorepo using Turborepo and pnpm workspaces:

- `packages/common`: Shared types and utilities
- `packages/db`: Vector database integration with OpenSearch
- `packages/etl`: GitHub repository ETL processing
- `packages/api`: REST API for searching and processing repositories
- `packages/docker`: Docker configurations for hosting OpenSearch

## Getting Started

### Prerequisites

- Node.js (v18+)
- pnpm (v8+)
- Docker and Docker Compose (for OpenSearch)

### Installation

1. Clone this repository
2. Install dependencies:

```bash
pnpm install
```

3. Build all packages:

```bash
pnpm build
```

### Starting OpenSearch

Start the OpenSearch database using Docker Compose:

```bash
cd packages/docker
pnpm start
```

OpenSearch will be available at http://localhost:9200 and OpenSearch Dashboards at http://localhost:5601.

### Starting the API Server

Start the API server:

```bash
cd packages/api
pnpm dev
```

The API will be available at http://localhost:3000.

## Usage

### Processing a GitHub Repository

Send a POST request to the API to process a GitHub repository:

```bash
curl -X POST http://localhost:3000/api/repository/process \
  -H "Content-Type: application/json" \
  -d '{
    "repositoryUrl": "https://github.com/username/repo",
    "branch": "main"
  }'
```

This will clone the repository, process it into appropriate chunks, and store it in the vector database.

### Searching for Code

Send a POST request to the API to search for code using natural language:

```bash
curl -X POST http://localhost:3000/api/search \
  -H "Content-Type: application/json" \
  -d '{
    "query": "How does the error handling work?",
    "useCase": "bug_fixing",
    "limit": 5
  }'
```

Available use cases:
- `bug_fixing`: For finding error handling and internal implementations
- `code_generation`: For finding code examples and patterns
- `explanation`: For finding documentation and explanations

## Implementation Details

### Code Chunking Strategy

The system processes code into various chunk types to support different use cases:

1. **File Chunks**: Entire file contents for context
2. **Class Chunks**: Complete class definitions with methods
3. **Function Chunks**: Individual functions and methods
4. **Summary Chunks**: README and documentation summaries

Each chunk is tagged with relevant use cases (bug fixing, code generation, explanation) based on heuristics such as:
- File path and name patterns
- Function and class naming patterns
- Contents and structure

### Vector Database

The system uses OpenSearch's vector search capabilities to find relevant code based on natural language queries. The vector store indexes chunks with the following metadata:
- Repository information
- File path
- Language
- Symbol name (for functions and classes)
- Line range
- Use case tags

## Development

### Adding New Features

To add new features or modify the system:

1. Make changes to the relevant package(s)
2. Build the packages:

```bash
pnpm build
```

3. Run tests:

```bash
pnpm test
```

## License

ISC