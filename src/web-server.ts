#!/usr/bin/env node

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const app = express();
const port = parseInt(process.env.PORT || '8080', 10);

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    server: 'mcp-autonomous-web-ts',
    version: '2.0.0'
  });
});

// Root endpoint
app.get('/', (_req, res) => {
  res.json({
    message: 'MCP Autonomous Web Server (TypeScript)',
    version: '2.0.0',
    endpoints: {
      health: '/health',
      mcp: 'Use MCP protocol - see README for VS Code integration'
    },
    currentModel: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    description: 'Production-ready MCP server with TypeScript implementation',
    integration: 'This server is designed for MCP protocol integration with VS Code. Use the stdio server for MCP clients.'
  });
});

// Simple test endpoint to verify server is running
app.get('/test', (_req, res) => {
  res.json({
    message: 'Server is running correctly',
    timestamp: new Date().toISOString(),
    environment: {
      nodeVersion: process.version,
      platform: process.platform,
      hasOpenAI: process.env.OPENAI_API_KEY ? 'configured' : 'not configured'
    }
  });
});

// Error handling middleware
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    error: 'Internal server error'
  });
});

// 404 handler
app.use((_req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    message: 'This web server provides basic info. For MCP functionality, use the stdio server with VS Code.',
    availableEndpoints: {
      health: 'GET /health',
      info: 'GET /',
      test: 'GET /test'
    }
  });
});

// Start server
app.listen(port, '0.0.0.0', () => {
  console.log(`🚀 MCP Autonomous Web Server (TypeScript) running on port ${port}`);
  console.log(`📍 Health check: http://localhost:${port}/health`);
  console.log(`🧪 Test endpoint: http://localhost:${port}/test`);
  console.log(`🤖 For MCP integration, use: node dist/mcp/stdio-server.js`);
  console.log(`📖 See README for VS Code setup instructions`);
});

export default app;