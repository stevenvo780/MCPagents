#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  InitializeRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import fetch from 'node-fetch';

// --- MCP Autonomous Core ---
async function openaiAsk({ prompt, system, temperature = 0.7, maxTokens = 2000, context }) {
  const apiKey = process.env.OPENAI_API_KEY;

  // Validación de parámetros
  if (typeof temperature !== 'number' || temperature < 0 || temperature > 2) {
    throw new Error('Temperature debe ser un número entre 0 y 2');
  }

  if (apiKey) {
    try {
      const baseUrl = process.env.OPENAI_BASE_URL || 'https://api.openai.com';
      const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
      const messages = [];
      if (system) messages.push({ role: 'system', content: system });
      if (context) messages.push({ role: 'system', content: `Contexto:\n${context}` });
      messages.push({ role: 'user', content: prompt });
      const response = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages,
          temperature,
          max_tokens: maxTokens,
        }),
      });
      if (!response.ok) throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
      const data = await response.json();
      return {
        answer: data.choices?.[0]?.message?.content || '',
        model,
        usage: data.usage,
      };
    } catch (error) {
      console.error('Error con OpenAI directo, intentando servidor HTTP:', error.message);
      // Continúa al fallback HTTP
    }
  }
  // Fallback HTTP local
  try {
    const response = await fetch('http://localhost:7088/jsonrpc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        method: 'mcp.openai.ask',
        params: { prompt, system, temperature, maxTokens, context }
      })
    });
    if (!response.ok) throw new Error(`Servidor HTTP error: ${response.status} ${response.statusText}`);
    const data = await response.json();
    if (data.error) throw new Error(`Error del servidor: ${data.error.message}`);
    return data.result;
  } catch (error) {
    throw new Error(`Error conectando con OpenAI/Servidor: ${error.message}`);
  }
}

const server = new Server(
  { name: 'mcpagents-autonomous', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(
  InitializeRequestSchema,
  async () => ({
    protocolVersion: '2024-11-05',
    capabilities: { tools: {} },
    serverInfo: { name: 'mcpagents-autonomous', version: '1.0.0' },
  })
);

const tools = [
  {
    name: 'mcp_autonomous_ask',
    description: 'Ask a question to the autonomous copilot with OpenAI integration',
    inputSchema: {
      type: 'object',
      properties: {
        question: { type: 'string', description: 'The question to ask' },
        system: { type: 'string', description: 'System prompt to guide the response' },
        temperature: { type: 'number', description: 'Temperature for response creativity (0-2)', minimum: 0, maximum: 2, default: 0.7 },
        maxTokens: { type: 'number', description: 'Maximum tokens in response', default: 2000 },
        context: { type: 'string', description: 'Additional context for the question' },
      },
      required: ['question'],
    },
  },
  {
    name: 'mcp_autonomous_analyze_code',
    description: 'Analyze code with the autonomous copilot',
    inputSchema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'The code to analyze' },
        language: { type: 'string', description: 'Programming language of the code', default: 'typescript' },
        task: { type: 'string', description: 'Type of analysis to perform', enum: ['analyze', 'fix', 'optimize', 'explain'], default: 'analyze' },
      },
      required: ['code'],
    },
  },
  {
    name: 'mcp_autonomous_health',
    description: 'Check the health status of the autonomous copilot',
    inputSchema: { type: 'object', properties: {} },
  },
];

server.setRequestHandler(
  ListToolsRequestSchema,
  async () => ({ tools })
);

server.setRequestHandler(
  CallToolRequestSchema,
  async (request) => {
    const { name, arguments: args } = request.params;
    try {
      switch (name) {
        case 'mcp_autonomous_ask': {
          const { question, system, temperature = 0.7, maxTokens = 2000, context } = args;
          const result = await openaiAsk({
            prompt: question,
            system: system || 'Eres el Autonomous Copilot, un asistente de IA avanzado especializado en programación y desarrollo. Responde en español de manera amigable y profesional.',
            temperature,
            maxTokens,
            context,
          });
          return { content: [{ type: 'text', text: result.answer || 'No se pudo obtener respuesta' }] };
        }
        case 'mcp_autonomous_analyze_code': {
          const { code, language = 'typescript', task = 'analyze' } = args;
          if (!code) throw new Error('Código es requerido para el análisis');
          const systemPrompt = `Eres un experto en ${language} que analiza código y proporciona sugerencias específicas y prácticas.\n\nTarea: ${task}\n\nINSTRUCCIONES:\n- Proporciona análisis detallado y específico\n- Sugiere mejoras concretas con ejemplos de código\n- Identifica patrones, problemas potenciales y optimizaciones\n- Sé conciso pero completo\n- Formatea la respuesta en Markdown`;
          const prompt = `Analiza este código ${language} y ${task === 'fix' ? 'encuentra errores y sugiere correcciones' : task === 'optimize' ? 'sugiere optimizaciones' : task === 'explain' ? 'explica cómo funciona' : 'proporciona sugerencias de mejora'}:\n\n\`\`\`${language}\n${code}\n\`\`\``;
          const result = await openaiAsk({ prompt, system: systemPrompt, temperature: 0.2, maxTokens: 3000 });
          return { content: [{ type: 'text', text: result.answer || 'No se pudo analizar el código' }] };
        }
        case 'mcp_autonomous_health': {
          return { content: [{ type: 'text', text: JSON.stringify({ status: 'ok', timestamp: new Date().toISOString(), server: 'mcpagents-autonomous', version: '1.0.0' }, null, 2) }] };
        }
        default:
          throw new Error(`Herramienta desconocida: ${name}`);
      }
    } catch (error) {
      throw new Error(`Error ejecutando ${name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('✅ Servidor MCP Autonomous iniciado correctamente');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('❌ Error iniciando servidor MCP:', error);
    process.exit(1);
  });
}

export { server };
