#!/usr/bin/env node

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { MCPAutonomousServer } from './mcp/server.js';

// Load environment variables
dotenv.config();

const app = express();
const port = parseInt(process.env.PORT || '8080', 10);

// Initialize MCP server instance for web integration
const mcpServer = new MCPAutonomousServer();

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// MCP JSON-RPC endpoint for remote MCP clients
app.post('/jsonrpc', async (req, res): Promise<void> => {
  try {
    const { method, params, id, jsonrpc } = req.body;
    
    // Validate JSON-RPC format
    if (jsonrpc !== '2.0' || !method) {
      res.status(400).json({
        jsonrpc: '2.0',
        error: { code: -32600, message: 'Invalid Request' },
        id: id || null
      });
      return;
    }

    let result;

    switch (method) {
      case 'initialize':
        result = {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: { name: 'mcp-autonomous-server', version: '2.0.0' }
        };
        break;

      case 'tools/list':
        const tools = await mcpServer.listTools();
        result = tools;
        break;

      case 'tools/call':
        if (!params?.name) {
          res.status(400).json({
            jsonrpc: '2.0',
            error: { code: -32602, message: 'Invalid params' },
            id
          });
          return;
        }
        result = await mcpServer.handleToolCall(params.name, params.arguments || {});
        break;

      default:
        res.status(400).json({
          jsonrpc: '2.0',
          error: { code: -32601, message: 'Method not found' },
          id
        });
        return;
    }

    res.json({
      jsonrpc: '2.0',
      result,
      id
    });

  } catch (error) {
    console.error('MCP JSON-RPC error:', error);
    res.status(500).json({
      jsonrpc: '2.0',
      error: { 
        code: -32603, 
        message: 'Internal error',
        data: error instanceof Error ? error.message : String(error)
      },
      id: req.body?.id || null
    });
  }
});

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
      jsonrpc: '/jsonrpc (POST) - MCP JSON-RPC endpoint',
      mcp: 'Full MCP protocol support via JSON-RPC'
    },
    currentModel: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    description: 'Production-ready MCP server with TypeScript implementation and HTTP JSON-RPC support',
    integration: 'Use /jsonrpc endpoint for remote MCP clients or stdio server for local integration.'
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
    message: 'MCP JSON-RPC endpoint available at POST /jsonrpc',
    availableEndpoints: {
      health: 'GET /health',
      info: 'GET /',
      test: 'GET /test',
      jsonrpc: 'POST /jsonrpc - MCP protocol endpoint'
    }
  });
});

// Start server
app.listen(port, '0.0.0.0', () => {
  console.log(`🚀 MCP Autonomous Web Server (TypeScript) running on port ${port}`);
  console.log(`📍 Health check: http://localhost:${port}/health`);
  console.log(`🧪 Test endpoint: http://localhost:${port}/test`);
  console.log(`🔗 MCP JSON-RPC: POST http://localhost:${port}/jsonrpc`);
  console.log(`🤖 Local MCP stdio: node dist/mcp/stdio-server.js`);
  console.log(`📖 See README for VS Code setup instructions`);
});

export default app;