#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { openaiAsk } from './tools/openaiAsk.js';
import { health } from './tools/health.js';
import config from '../config/index.js';

// Crear el servidor MCP
const server = new Server(
  {
    name: 'mcpagents-autonomous',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Definir las herramientas disponibles
const tools: Tool[] = [
  {
    name: 'mcp_autonomous_ask',
    description: 'Ask a question to the autonomous copilot with OpenAI integration',
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
      },
      required: ['code'],
    },
  },
  {
    name: 'mcp_autonomous_health',
    description: 'Check the health status of the autonomous copilot',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
];

// Handler para listar herramientas
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools,
  };
});

// Handler para ejecutar herramientas
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'mcp_autonomous_ask': {
        const { question, system, temperature = 0.7, maxTokens = 2000, context } = args as any;

        const result = await openaiAsk({
          prompt: question,
          system: system || 'Eres el Autonomous Copilot, un asistente de IA avanzado especializado en programación y desarrollo. Responde en español de manera amigable y profesional.',
          temperature,
          maxTokens,
          context,
        });

        return {
          content: [
            {
              type: 'text',
              text: result.answer || 'No se pudo obtener respuesta',
            },
          ],
        };
      }

      case 'mcp_autonomous_analyze_code': {
        const { code, language = 'typescript', task = 'analyze' } = args as any;

        if (!code) {
          throw new Error('Código es requerido para el análisis');
        }

        const systemPrompt = `Eres un experto en ${language} que analiza código y proporciona sugerencias específicas y prácticas.

Tarea: ${task}

INSTRUCCIONES:
- Proporciona análisis detallado y específico
- Sugiere mejoras concretas con ejemplos de código
- Identifica patrones, problemas potenciales y optimizaciones
- Sé conciso pero completo
- Formatea la respuesta en Markdown`;

        const prompt = `Analiza este código ${language} y ${task === 'fix' ? 'encuentra errores y sugiere correcciones' :
            task === 'optimize' ? 'sugiere optimizaciones' :
              task === 'explain' ? 'explica cómo funciona' :
                'proporciona sugerencias de mejora'
          }:

\`\`\`${language}
${code}
\`\`\``;

        const result = await openaiAsk({
          prompt,
          system: systemPrompt,
          temperature: 0.2,
          maxTokens: 3000,
        });

        return {
          content: [
            {
              type: 'text',
              text: result.answer || 'No se pudo analizar el código',
            },
          ],
        };
      }

      case 'mcp_autonomous_health': {
        const result = await health({});

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      default:
        throw new Error(`Herramienta desconocida: ${name}`);
    }
  } catch (error) {
    throw new Error(`Error ejecutando ${name}: ${error instanceof Error ? error.message : String(error)}`);
  }
});

// Función principal
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Servidor MCP Autonomous iniciado en modo stdio');
}

// Ejecutar si es el archivo principal
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('Error iniciando servidor MCP:', error);
    process.exit(1);
  });
}

export { server };
