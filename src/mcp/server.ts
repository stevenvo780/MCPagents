#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  CallToolRequest,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import fs from 'fs/promises';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Load environment variables
dotenv.config();

interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface OpenAIRequest {
  model: string;
  messages: OpenAIMessage[];
  temperature?: number;
  max_tokens?: number;
  max_completion_tokens?: number;
}

interface OpenAIResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
  model: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

interface ModelParams {
  tokenParam: 'max_tokens' | 'max_completion_tokens';
  tokenValue: number;
  supportsTemperature: boolean;
  maxLimit: number;
  minTokens: number;
  family: string;
  description: string;
}

class MCPAutonomousServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      {
        name: 'mcp-autonomous-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupToolHandlers();
  }

  private getModelParams(modelName: string, temperature: number, maxTokens: number): ModelParams {
    const model = modelName.toLowerCase();
    
    // GPT-5 (Reasoning Model)
    if (model.includes('gpt-5')) {
      return {
        tokenParam: 'max_completion_tokens',
        tokenValue: Math.max(Math.min(maxTokens, 8000), 2000),
        supportsTemperature: false,
        maxLimit: 8000,
        minTokens: 2000,
        family: 'gpt-5',
        description: 'GPT-5 Reasoning Model'
      };
    }

    // O1-Preview
    if (model.includes('o1-preview')) {
      return {
        tokenParam: 'max_completion_tokens',
        tokenValue: Math.max(1000, Math.min(maxTokens, 32768)),
        supportsTemperature: false,
        maxLimit: 32768,
        minTokens: 1000,
        family: 'o1-preview',
        description: 'O1-Preview Advanced Reasoning'
      };
    }
    
    // O1-Mini
    if (model.includes('o1-mini')) {
      return {
        tokenParam: 'max_completion_tokens',
        tokenValue: Math.max(1000, Math.min(maxTokens, 65536)),
        supportsTemperature: false,
        maxLimit: 65536,
        minTokens: 1000,
        family: 'o1-mini',
        description: 'O1-Mini Efficient Reasoning'
      };
    }
    
    // GPT-4o-Mini
    if (model.includes('gpt-4o-mini')) {
      return {
        tokenParam: 'max_tokens',
        tokenValue: Math.min(maxTokens, 16384),
        supportsTemperature: true,
        maxLimit: 16384,
        minTokens: 1,
        family: 'gpt-4o-mini',
        description: 'GPT-4o-Mini Economical'
      };
    }
    
    // GPT-4o
    if (model.includes('gpt-4o')) {
      return {
        tokenParam: 'max_tokens',
        tokenValue: Math.min(maxTokens, 16384),
        supportsTemperature: true,
        maxLimit: 16384,
        minTokens: 1,
        family: 'gpt-4o',
        description: 'GPT-4o Flagship Multimodal'
      };
    }
    
    // Default fallback
    return {
      tokenParam: 'max_tokens',
      tokenValue: Math.min(maxTokens, 4096),
      supportsTemperature: true,
      maxLimit: 4096,
      minTokens: 1,
      family: 'unknown',
      description: 'Unknown Model (safe defaults)'
    };
  }

  private async openaiAsk({
    prompt,
    system,
    temperature = 0.7,
    maxTokens = 2000,
    context,
  }: {
    prompt: string;
    system?: string;
    temperature?: number;
    maxTokens?: number;
    context?: string;
  }): Promise<{ answer: string; model: string; usage?: any; modelParams: ModelParams }> {
    const apiKey = process.env.OPENAI_API_KEY;
    
    if (!apiKey || apiKey === 'your-openai-api-key-here') {
      throw new Error('OPENAI_API_KEY not configured properly');
    }

    // Validate parameters
    if (typeof temperature !== 'number' || temperature < 0 || temperature > 2) {
      throw new Error('Temperature must be a number between 0 and 2');
    }

    const baseUrl = process.env.OPENAI_BASE_URL || 'https://api.openai.com';
    const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
    
    const modelParams = this.getModelParams(model, temperature, maxTokens);
    
    const messages: OpenAIMessage[] = [];
    if (system) messages.push({ role: 'system', content: system });
    if (context) messages.push({ role: 'system', content: `Context:\n${context}` });
    messages.push({ role: 'user', content: prompt });
    
    const requestBody: OpenAIRequest = {
      model,
      messages,
      [modelParams.tokenParam]: modelParams.tokenValue,
    };
    
    if (modelParams.supportsTemperature) {
      requestBody.temperature = temperature;
    }
    
    const response = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error: ${response.status} ${response.statusText} - ${errorText}`);
    }
    
    const data = await response.json() as OpenAIResponse;
    
    return {
      answer: data.choices?.[0]?.message?.content || '',
      model: data.model || model,
      usage: data.usage,
      modelParams: modelParams,
    };
  }

  private async getProjectStructure(rootPath = '.', maxDepth = 2, currentDepth = 0): Promise<any[]> {
    if (currentDepth >= maxDepth) return [];
    
    try {
      const items = await fs.readdir(rootPath);
      const structure = [];
      
      for (const item of items) {
        if (item.startsWith('.') && !['package.json', '.env.example'].includes(item)) continue;
        
        const itemPath = path.join(rootPath, item);
        const stats = await fs.stat(itemPath);
        
        if (stats.isDirectory()) {
          const children = await this.getProjectStructure(itemPath, maxDepth, currentDepth + 1);
          structure.push({
            name: item,
            type: 'directory',
            path: itemPath,
            children: children.slice(0, 10),
          });
        } else if (stats.isFile()) {
          structure.push({
            name: item,
            type: 'file',
            path: itemPath,
            size: stats.size,
          });
        }
      }
      
      return structure.slice(0, 20);
    } catch (error) {
      return [];
    }
  }

  private async getGitContext(): Promise<any> {
    try {
      const { stdout: branch } = await execAsync('git branch --show-current');
      const { stdout: status } = await execAsync('git status --porcelain');
      const { stdout: lastCommits } = await execAsync('git log --oneline -5');
      
      return {
        currentBranch: branch.trim(),
        uncommittedChanges: status.trim().split('\n').filter(line => line.trim()),
        recentCommits: lastCommits.trim().split('\n').filter(line => line.trim()),
      };
    } catch (error) {
      return {
        currentBranch: 'unknown',
        uncommittedChanges: [],
        recentCommits: [],
      };
    }
  }

  private async getMainProjectFiles(): Promise<Record<string, string>> {
    const mainFiles = ['package.json', 'README.md', 'tsconfig.json', 'vite.config.js', 'next.config.js'];
    const files: Record<string, string> = {};
    
    for (const fileName of mainFiles) {
      try {
        await fs.access(fileName);
        const content = await fs.readFile(fileName, 'utf-8');
        files[fileName] = content.length > 2000 ? content.substring(0, 2000) + '...' : content;
      } catch (error) {
        // File doesn't exist or can't be read
      }
    }
    
    return files;
  }

  private async getProjectContext(): Promise<any> {
    try {
      const [structure, gitInfo, mainFiles] = await Promise.all([
        this.getProjectStructure(),
        this.getGitContext(),
        this.getMainProjectFiles(),
      ]);
      
      return {
        timestamp: new Date().toISOString(),
        projectStructure: structure,
        git: gitInfo,
        mainFiles: mainFiles,
        summary: `Project on branch ${gitInfo.currentBranch} with ${gitInfo.uncommittedChanges.length} uncommitted changes`,
      };
    } catch (error) {
      return {
        timestamp: new Date().toISOString(),
        error: 'Could not get project context',
        summary: 'Context not available',
      };
    }
  }

  private setupToolHandlers(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'autonomous_ask',
            description: 'Ask a question to the autonomous copilot with OpenAI integration and automatic project context',
            inputSchema: {
              type: 'object',
              properties: {
                question: {
                  type: 'string',
                  description: 'The question to ask',
                },
                system: {
                  type: 'string',
                  description: 'System prompt to guide the response',
                },
                temperature: {
                  type: 'number',
                  description: 'Temperature for response creativity (0-2)',
                  minimum: 0,
                  maximum: 2,
                  default: 0.7,
                },
                maxTokens: {
                  type: 'number',
                  description: 'Maximum tokens in response',
                  default: 2000,
                },
                context: {
                  type: 'string',
                  description: 'Additional context for the question',
                },
                includeProjectContext: {
                  type: 'boolean',
                  description: 'Include automatic project context',
                  default: true,
                },
              },
              required: ['question'],
            },
          },
          {
            name: 'analyze_code',
            description: 'Analyze code with the autonomous copilot and automatic project context',
            inputSchema: {
              type: 'object',
              properties: {
                code: {
                  type: 'string',
                  description: 'The code to analyze',
                },
                language: {
                  type: 'string',
                  description: 'Programming language of the code',
                  default: 'typescript',
                },
                task: {
                  type: 'string',
                  description: 'Type of analysis to perform',
                  enum: ['analyze', 'fix', 'optimize', 'explain'],
                  default: 'analyze',
                },
                includeProjectContext: {
                  type: 'boolean',
                  description: 'Include automatic project context',
                  default: true,
                },
              },
              required: ['code'],
            },
          },
          {
            name: 'get_project_context',
            description: 'Get comprehensive project context including structure, git status, and main files',
            inputSchema: {
              type: 'object',
              properties: {},
            },
          },
          {
            name: 'health_check',
            description: 'Check the health status of the autonomous copilot',
            inputSchema: {
              type: 'object',
              properties: {},
            },
          },
        ] satisfies Tool[],
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request: CallToolRequest) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'autonomous_ask': {
            const {
              question,
              system,
              temperature = 0.7,
              maxTokens = 2000,
              context,
              includeProjectContext = true,
            } = args as {
              question: string;
              system?: string;
              temperature?: number;
              maxTokens?: number;
              context?: string;
              includeProjectContext?: boolean;
            };

            // Validate required parameters first
            if (!question || typeof question !== 'string' || question.trim().length === 0) {
              throw new Error('Question is required and must be a non-empty string');
            }

            // Validate optional parameters
            if (temperature !== undefined && (typeof temperature !== 'number' || temperature < 0 || temperature > 2)) {
              throw new Error('Temperature must be a number between 0 and 2');
            }

            if (maxTokens !== undefined && (typeof maxTokens !== 'number' || maxTokens < 1 || maxTokens > 100000)) {
              throw new Error('MaxTokens must be a number between 1 and 100000');
            }

            let finalContext = context || '';

            if (includeProjectContext) {
              const projectContext = await this.getProjectContext();
              finalContext = `PROJECT CONTEXT:\n${JSON.stringify(projectContext, null, 2)}\n\nADDITIONAL CONTEXT:\n${context || 'No additional context provided.'}\n\n---`;
            }

            const result = await this.openaiAsk({
              prompt: question,
              system: system || 'You are the Autonomous Copilot, an advanced AI assistant specialized in programming and development. You have access to the complete context of the current project. Respond in a friendly and professional manner.',
              temperature,
              maxTokens,
              context: finalContext,
            });

            return {
              content: [
                {
                  type: 'text',
                  text: result.answer || 'Could not get response',
                },
              ],
            };
          }

          case 'analyze_code': {
            const {
              code,
              language = 'typescript',
              task = 'analyze',
              includeProjectContext = true,
            } = args as {
              code: string;
              language?: string;
              task?: 'analyze' | 'fix' | 'optimize' | 'explain';
              includeProjectContext?: boolean;
            };

            // Validate required parameters first
            if (!code || typeof code !== 'string' || code.trim().length === 0) {
              throw new Error('Code is required and must be a non-empty string');
            }

            // Validate optional parameters
            const validTasks = ['analyze', 'fix', 'optimize', 'explain'];
            if (task && !validTasks.includes(task)) {
              throw new Error(`Task must be one of: ${validTasks.join(', ')}`);
            }

            let projectContextText = '';
            if (includeProjectContext) {
              const projectContext = await this.getProjectContext();
              projectContextText = `\n\nPROJECT CONTEXT:\n${JSON.stringify(projectContext, null, 2)}`;
            }

            const systemPrompt = `You are an expert in ${language} who analyzes code and provides specific and practical suggestions. You have access to the complete context of the current project.\n\nTask: ${task}\n\nINSTRUCTIONS:\n- Provide detailed and specific analysis\n- Suggest concrete improvements with code examples\n- Identify patterns, potential problems and optimizations\n- Consider the project context for your recommendations\n- Be concise but complete\n- Format the response in Markdown${projectContextText}`;

            const prompt = `Analyze this ${language} code and ${
              task === 'fix'
                ? 'find errors and suggest corrections'
                : task === 'optimize'
                ? 'suggest optimizations'
                : task === 'explain'
                ? 'explain how it works'
                : 'provide improvement suggestions'
            }:\n\n\`\`\`${language}\n${code}\n\`\`\``;

            const result = await this.openaiAsk({
              prompt,
              system: systemPrompt,
              temperature: 0.2,
              maxTokens: 3000,
            });

            return {
              content: [
                {
                  type: 'text',
                  text: result.answer || 'Could not analyze the code',
                },
              ],
            };
          }

          case 'get_project_context': {
            const projectContext = await this.getProjectContext();
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(projectContext, null, 2),
                },
              ],
            };
          }

          case 'health_check': {
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(
                    {
                      status: 'ok',
                      timestamp: new Date().toISOString(),
                      server: 'mcp-autonomous-server',
                      version: '1.0.0',
                    },
                    null,
                    2
                  ),
                },
              ],
            };
          }

          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    });
  }

  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('MCP Autonomous Server running on stdio');
  }
}

const server = new MCPAutonomousServer();
server.run().catch(console.error);