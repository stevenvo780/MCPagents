#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  CallToolRequest,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import fetch, { Response } from 'node-fetch';
import dotenv from 'dotenv';
import fs from 'fs/promises';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { randomUUID } from 'crypto';

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
  stream?: boolean;
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

export class MCPAutonomousServer {
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

  private getModelTimeout(modelName: string, inputLength: number): number {
    const model = modelName.toLowerCase();
    
    // Base timeout based on model capabilities
    let baseTimeout = 60000; // 1 minute default
    
    if (model.includes('gpt-5') || model.includes('o1-preview') || model.includes('o1-mini')) {
      // Reasoning models need more time
      baseTimeout = 120000; // 2 minutes for reasoning models
    } else if (model.includes('gpt-4o')) {
      baseTimeout = 90000; // 1.5 minutes for GPT-4o
    }
    
    // Adjust timeout based on input length (longer inputs = more processing time)
    if (inputLength > 10000) {
      baseTimeout *= 1.5; // 50% more time for long inputs
    } else if (inputLength > 5000) {
      baseTimeout *= 1.25; // 25% more time for medium inputs
    }
    
    return Math.min(baseTimeout, 300000); // Cap at 5 minutes
  }

  private getModelParams(modelName: string, temperature: number, maxTokens?: number): ModelParams {
    const model = modelName.toLowerCase();
    
    // GPT-5 (Reasoning Model)
    if (model.includes('gpt-5')) {
      const defaultTokens = 4000; // Optimal for reasoning tasks
      return {
        tokenParam: 'max_completion_tokens',
        tokenValue: maxTokens ? Math.max(Math.min(maxTokens, 8000), 2000) : defaultTokens,
        supportsTemperature: false,
        maxLimit: 8000,
        minTokens: 2000,
        family: 'gpt-5',
        description: 'GPT-5 Reasoning Model'
      };
    }

    // O1-Preview
    if (model.includes('o1-preview')) {
      const defaultTokens = 4000; // Good balance for complex reasoning
      return {
        tokenParam: 'max_completion_tokens',
        tokenValue: maxTokens ? Math.max(1000, Math.min(maxTokens, 32768)) : defaultTokens,
        supportsTemperature: false,
        maxLimit: 32768,
        minTokens: 1000,
        family: 'o1-preview',
        description: 'O1-Preview Advanced Reasoning'
      };
    }
    
    // O1-Mini
    if (model.includes('o1-mini')) {
      const defaultTokens = 2000; // Efficient default for mini
      return {
        tokenParam: 'max_completion_tokens',
        tokenValue: maxTokens ? Math.max(1000, Math.min(maxTokens, 65536)) : defaultTokens,
        supportsTemperature: false,
        maxLimit: 65536,
        minTokens: 1000,
        family: 'o1-mini',
        description: 'O1-Mini Efficient Reasoning'
      };
    }
    
    // GPT-4o-Mini
    if (model.includes('gpt-4o-mini')) {
      const defaultTokens = 1500; // Economic default
      return {
        tokenParam: 'max_tokens',
        tokenValue: maxTokens ? Math.min(maxTokens, 16384) : defaultTokens,
        supportsTemperature: true,
        maxLimit: 16384,
        minTokens: 1,
        family: 'gpt-4o-mini',
        description: 'GPT-4o-Mini Economical'
      };
    }
    
    // GPT-4o
    if (model.includes('gpt-4o')) {
      const defaultTokens = 2000; // Good default for flagship
      return {
        tokenParam: 'max_tokens',
        tokenValue: maxTokens ? Math.min(maxTokens, 16384) : defaultTokens,
        supportsTemperature: true,
        maxLimit: 16384,
        minTokens: 1,
        family: 'gpt-4o',
        description: 'GPT-4o Flagship Multimodal'
      };
    }
    
    // Default fallback
    const defaultTokens = 1000; // Conservative default
    return {
      tokenParam: 'max_tokens',
      tokenValue: maxTokens ? Math.min(maxTokens, 4096) : defaultTokens,
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
    onProgress,
  }: {
    prompt: string;
    system?: string;
    temperature?: number;
    maxTokens?: number;
    context?: string;
    onProgress?: (chunk: string) => void;
  }): Promise<{ answer: string; model: string; usage?: any; modelParams: ModelParams }> {
    const apiKey = process.env.OPENAI_API_KEY;
    
    if (!apiKey || apiKey === 'your-openai-api-key-here') {
      throw new Error('OPENAI_API_KEY not configured properly');
    }

    // Validate and clamp parameters
    if (typeof temperature !== 'number' || temperature < 0 || temperature > 2) {
      temperature = Math.max(0, Math.min(2, temperature || 0.7));
    }

    // maxTokens is optional - if not provided, model will choose optimal defaults
    if (maxTokens !== undefined && (typeof maxTokens !== 'number' || maxTokens < 1 || maxTokens > 100000)) {
      maxTokens = Math.max(1, Math.min(100000, maxTokens));
    }

    // Estimate and truncate inputs if too large (rough heuristic: 1 token ≈ 4 chars)
    const estimatedPromptTokens = prompt.length / 4;
    const estimatedContextTokens = context ? context.length / 4 : 0;
    const estimatedSystemTokens = system ? system.length / 4 : 0;
    const totalEstimatedTokens = estimatedPromptTokens + estimatedContextTokens + estimatedSystemTokens;

    // Conservative limit to avoid rate limits (leaving room for output tokens)
    const maxInputTokens = 25000;
    
    if (totalEstimatedTokens > maxInputTokens) {
      const reduction = maxInputTokens / totalEstimatedTokens;
      
      // Truncate longest input first (usually prompt)
      if (estimatedPromptTokens > estimatedContextTokens && estimatedPromptTokens > estimatedSystemTokens) {
        const targetLength = Math.floor(prompt.length * reduction * 0.8);
        prompt = prompt.substring(0, targetLength) + '...[truncated]';
      } else if (estimatedContextTokens > estimatedSystemTokens) {
        const targetLength = Math.floor((context?.length || 0) * reduction * 0.8);
        context = context?.substring(0, targetLength) + '...[truncated]';
      }
      
      // Reduce maxTokens to leave room (if specified)
      if (maxTokens !== undefined) {
        maxTokens = Math.min(maxTokens, 3000);
      }
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
      stream: !!onProgress, // Enable streaming if callback provided
    };
    
    if (modelParams.supportsTemperature) {
      requestBody.temperature = temperature;
    }
    
    const timeoutEnv = process.env.OPENAI_TIMEOUT_MS;
    let timeoutMs = this.getModelTimeout(model, prompt.length + (context?.length || 0));
    if (timeoutEnv) {
      const parsed = parseInt(timeoutEnv, 10);
      if (!Number.isNaN(parsed)) {
        timeoutMs = Math.max(1000, Math.min(parsed, 300000)); // Increased max to 5 minutes
      }
    }

    const requestId = randomUUID();
    const startTime = Date.now();
    const logPrefix = `[openaiAsk:${requestId}]`;
    console.log(`${logPrefix} Dispatching request`, {
      model,
      temperature: modelParams.supportsTemperature ? temperature : undefined,
      tokenParam: modelParams.tokenParam,
      tokenValue: modelParams.tokenValue,
      promptChars: prompt.length,
      contextChars: context?.length || 0,
      timeoutMs,
      baseUrl,
      streaming: !!onProgress,
    });
    
    if (onProgress) {
      console.log(`${logPrefix} 🌊 STREAMING MODE ENABLED - Progressive response will be processed`);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    let response: Response;
    try {
      response = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        console.warn(`${logPrefix} Request aborted due to timeout`, { timeoutMs });
        throw new Error(`OpenAI request timed out after ${timeoutMs}ms`);
      }
      console.error(`${logPrefix} Request failed before receiving response`, { error: error instanceof Error ? error.message : error });
      throw error;
    } finally {
      clearTimeout(timeout);
    }
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`${logPrefix} Received non-OK response`, {
        status: response.status,
        statusText: response.statusText,
        errorPreview: errorText.substring(0, 500),
      });
      
      // Handle rate limits with user-friendly message
      if (response.status === 429) {
        const errorData = JSON.parse(errorText);
        const message = errorData?.error?.message || 'Rate limit exceeded';
        
        if (message.includes('Request too large')) {
          throw new Error('Input too large. Please reduce the size of your prompt or disable project context.');
        } else if (message.includes('rate_limit_exceeded')) {
          throw new Error('Rate limit exceeded. Please try again in a few moments.');
        }
      }
      
      throw new Error(`OpenAI API error: ${response.status} ${response.statusText} - ${errorText}`);
    }
    
    // Handle streaming response
    if (requestBody.stream && onProgress) {
      let fullAnswer = '';
      let model = '';
      let usage: any = undefined;
      
      if (!response.body) {
        throw new Error('No response body available for streaming');
      }
      
      const decoder = new TextDecoder();
      let buffer = '';
      
      // Process streaming data
      for await (const chunk of response.body as any) {
        buffer += decoder.decode(chunk, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer
        
        for (const line of lines) {
          if (line.trim() && line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;
            
            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices?.[0]?.delta?.content;
              if (content) {
                fullAnswer += content;
                onProgress(content);
              }
              
              // Capture model and usage info when available
              if (parsed.model) model = parsed.model;
              if (parsed.usage) usage = parsed.usage;
            } catch (parseError) {
              // Skip invalid JSON lines
              continue;
            }
          }
        }
      }
      
      const durationMs = Date.now() - startTime;
      console.log(`${logPrefix} 🎉 Streaming completed successfully`, {
        durationMs,
        model: model || requestBody.model,
        usage,
        answerLength: fullAnswer.length,
        averageCharsPerSecond: Math.round(fullAnswer.length / (durationMs / 1000)),
      });
      
      return {
        answer: fullAnswer,
        model: model || requestBody.model,
        usage,
        modelParams: modelParams,
      };
    }
    
    // Handle non-streaming response
    const data = await response.json() as OpenAIResponse;
    const durationMs = Date.now() - startTime;
    console.log(`${logPrefix} Completed successfully`, {
      durationMs,
      model: data.model || model,
      usage: data.usage,
    });
    
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
      
      // Limit project context size to avoid token overflow
      const limitedStructure = structure.slice(0, 15);
      const limitedMainFiles: Record<string, string> = {};
      
      // Keep only essential files and truncate them
      const essentialFiles = ['package.json', 'README.md', 'tsconfig.json'];
      for (const [file, content] of Object.entries(mainFiles)) {
        if (essentialFiles.includes(file)) {
          limitedMainFiles[file] = content.length > 1000 ? content.substring(0, 1000) + '...' : content;
        }
      }
      
      return {
        timestamp: new Date().toISOString(),
        projectStructure: limitedStructure,
        git: {
          currentBranch: gitInfo.currentBranch,
          uncommittedChanges: gitInfo.uncommittedChanges.slice(0, 10),
          recentCommits: gitInfo.recentCommits.slice(0, 3),
        },
        mainFiles: limitedMainFiles,
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
            let {
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

            // Sanitize and clamp input sizes
            if (question.length > 200000) {
              question = question.substring(0, 200000) + '...[truncated]';
            }

            // Don't throw on invalid params, normalize them instead
            if (temperature !== undefined && (typeof temperature !== 'number' || temperature < 0 || temperature > 2)) {
              temperature = Math.max(0, Math.min(2, 0.7)); // default to 0.7
            }

            if (maxTokens !== undefined && (typeof maxTokens !== 'number' || maxTokens < 1 || maxTokens > 100000)) {
              maxTokens = Math.max(1, Math.min(100000, 2000)); // default to 2000
            }

            let finalContext = context || '';

            if (includeProjectContext) {
              const projectContext = await this.getProjectContext();
              const contextStr = JSON.stringify(projectContext, null, 2);
              // Limit context size
              const limitedContext = contextStr.length > 10000 ? contextStr.substring(0, 10000) + '...[truncated]' : contextStr;
              finalContext = `PROJECT CONTEXT:\n${limitedContext}\n\nADDITIONAL CONTEXT:\n${context || 'No additional context provided.'}\n\n---`;
            }

            // For complex queries, use progressive response strategy
            const isComplexQuery = question.length > 1000 || (maxTokens && maxTokens > 3000);
            let progressiveResponse = '';
            let chunkCount = 0;
            const startTime = Date.now();
            
            const onProgress = isComplexQuery ? (chunk: string) => {
              progressiveResponse += chunk;
              chunkCount++;
              
              // Enhanced progress indicators
              if (chunkCount % 25 === 0) {
                const elapsed = Date.now() - startTime;
                const wordsEstimate = Math.floor(progressiveResponse.length / 5);
                console.log(`[autonomous_ask:PROGRESS] 📝 Generating response... | Chunks: ${chunkCount} | Words: ~${wordsEstimate} | Elapsed: ${elapsed}ms`);
              }
              
              // Periodic keepalive for very long responses
              if (chunkCount % 100 === 0) {
                console.log(`[autonomous_ask:KEEPALIVE] 🔄 Still processing complex query... Progress: ${Math.floor(progressiveResponse.length / 100)}%`);
              }
            } : undefined;
            
            if (isComplexQuery) {
              console.log(`[autonomous_ask:START] 🚀 Starting complex query processing | Question length: ${question.length} chars | Max tokens: ${maxTokens}`);
            }

            const result = await this.openaiAsk({
              prompt: question,
              system: system || 'You are the Autonomous Copilot, an advanced AI assistant specialized in programming and development. You have access to the complete context of the current project. Respond in a friendly and professional manner.',
              temperature,
              maxTokens,
              context: finalContext,
              onProgress,
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
            let {
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

            // Truncate large code inputs
            if (code.length > 100000) {
              code = code.substring(0, 100000) + '...[truncated]';
            }

            // Validate optional parameters
            const validTasks = ['analyze', 'fix', 'optimize', 'explain'];
            if (task && !validTasks.includes(task)) {
              task = 'analyze'; // default fallback
            }

            let projectContextText = '';
            if (includeProjectContext) {
              const projectContext = await this.getProjectContext();
              const contextStr = JSON.stringify(projectContext, null, 2);
              const limitedContext = contextStr.length > 5000 ? contextStr.substring(0, 5000) + '...[truncated]' : contextStr;
              projectContextText = `\n\nPROJECT CONTEXT:\n${limitedContext}`;
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

  // Public method for web server integration
  async listTools() {
    return {
      tools: [
        {
          name: 'autonomous_ask',
          description: 'Ask a question to the autonomous copilot with OpenAI integration and automatic project context',
          inputSchema: {
            type: 'object',
            properties: {
              question: { type: 'string', description: 'The question to ask' },
              system: { type: 'string', description: 'System prompt to guide the response' },
              temperature: { type: 'number', description: 'Temperature for response creativity (0-2)', minimum: 0, maximum: 2, default: 0.7 },
              maxTokens: { type: 'number', description: 'Maximum tokens in response', default: 2000 },
              context: { type: 'string', description: 'Additional context for the question' },
              includeProjectContext: { type: 'boolean', description: 'Include automatic project context', default: true },
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
              code: { type: 'string', description: 'The code to analyze' },
              language: { type: 'string', description: 'Programming language of the code', default: 'typescript' },
              task: { type: 'string', description: 'Type of analysis to perform', enum: ['analyze', 'fix', 'optimize', 'explain'], default: 'analyze' },
              includeProjectContext: { type: 'boolean', description: 'Include automatic project context', default: true },
            },
            required: ['code'],
          },
        },
        {
          name: 'get_project_context',
          description: 'Get comprehensive project context including structure, git status, and main files',
          inputSchema: { type: 'object', properties: {} },
        },
        {
          name: 'health_check',
          description: 'Check the health status of the autonomous copilot',
          inputSchema: { type: 'object', properties: {} },
        },
      ],
    };
  }

  // Public method for handling tool calls from web server
  async handleToolCall(name: string, args: any) {
    try {
      switch (name) {
        case 'autonomous_ask': {
          let {
            question,
            system,
            temperature = 0.7,
            maxTokens = 2000,
            context,
            includeProjectContext = true,
          } = args;

          // Validate required parameters first
          if (!question || typeof question !== 'string' || question.trim().length === 0) {
            throw new Error('Question is required and must be a non-empty string');
          }

          // Sanitize and clamp input sizes
          if (question.length > 200000) {
            question = question.substring(0, 200000) + '...[truncated]';
          }

          // Don't throw on invalid params, normalize them instead
          if (temperature !== undefined && (typeof temperature !== 'number' || temperature < 0 || temperature > 2)) {
            temperature = Math.max(0, Math.min(2, 0.7)); // default to 0.7
          }

          if (maxTokens !== undefined && (typeof maxTokens !== 'number' || maxTokens < 1 || maxTokens > 100000)) {
            maxTokens = Math.max(1, Math.min(100000, 2000)); // default to 2000
          }

          let finalContext = context || '';

          if (includeProjectContext) {
            const projectContext = await this.getProjectContext();
            const contextStr = JSON.stringify(projectContext, null, 2);
            // Limit context size
            const limitedContext = contextStr.length > 10000 ? contextStr.substring(0, 10000) + '...[truncated]' : contextStr;
            finalContext = `PROJECT CONTEXT:\n${limitedContext}\n\nADDITIONAL CONTEXT:\n${context || 'No additional context provided.'}\n\n---`;
          }

          // For complex queries, use progressive response strategy
          const isComplexQuery = question.length > 1000 || (maxTokens && maxTokens > 3000);
          let progressiveResponse = '';
          let chunkCount = 0;
          const startTime = Date.now();
          
          const onProgress = isComplexQuery ? (chunk: string) => {
            progressiveResponse += chunk;
            chunkCount++;
            
            // Enhanced progress indicators
            if (chunkCount % 25 === 0) {
              const elapsed = Date.now() - startTime;
              const wordsEstimate = Math.floor(progressiveResponse.length / 5);
              console.log(`[handleToolCall:autonomous_ask:PROGRESS] 📝 Generating response... | Chunks: ${chunkCount} | Words: ~${wordsEstimate} | Elapsed: ${elapsed}ms`);
            }
            
            // Periodic keepalive for very long responses
            if (chunkCount % 100 === 0) {
              console.log(`[handleToolCall:autonomous_ask:KEEPALIVE] 🔄 Still processing complex query... Progress: ${Math.floor(progressiveResponse.length / 100)}%`);
            }
          } : undefined;
          
          if (isComplexQuery) {
            console.log(`[handleToolCall:autonomous_ask:START] 🚀 Starting complex query processing | Question length: ${question.length} chars | Max tokens: ${maxTokens}`);
          }

          const result = await this.openaiAsk({
            prompt: question,
            system: system || 'You are the Autonomous Copilot, an advanced AI assistant specialized in programming and development. You have access to the complete context of the current project. Respond in a friendly and professional manner.',
            temperature,
            maxTokens,
            context: finalContext,
            onProgress,
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
          let {
            code,
            language = 'typescript',
            task = 'analyze',
            includeProjectContext = true,
          } = args;

          // Validate required parameters first
          if (!code || typeof code !== 'string' || code.trim().length === 0) {
            throw new Error('Code is required and must be a non-empty string');
          }

          // Truncate large code inputs
          if (code.length > 100000) {
            code = code.substring(0, 100000) + '...[truncated]';
          }

          // Validate optional parameters
          const validTasks = ['analyze', 'fix', 'optimize', 'explain'];
          if (task && !validTasks.includes(task)) {
            task = 'analyze'; // default fallback
          }

          let projectContextText = '';
          if (includeProjectContext) {
            const projectContext = await this.getProjectContext();
            const contextStr = JSON.stringify(projectContext, null, 2);
            const limitedContext = contextStr.length > 5000 ? contextStr.substring(0, 5000) + '...[truncated]' : contextStr;
            projectContextText = `\n\nPROJECT CONTEXT:\n${limitedContext}`;
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
                    version: '2.0.0',
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
  }

  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('MCP Autonomous Server running on stdio');
  }
}

// This class can be imported and used by other modules
// For stdio server functionality, use stdio-server.ts