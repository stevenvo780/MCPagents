#!/usr/bin/env node

import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Cargar variables de entorno
dotenv.config();

const app = express();
const port = process.env.PORT || 8080;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Función para obtener estructura del proyecto
async function getProjectStructure(rootPath = '.', maxDepth = 2, currentDepth = 0) {
  if (currentDepth >= maxDepth) return [];
  
  try {
    const items = await fs.promises.readdir(rootPath);
    const structure = [];
    
    for (const item of items) {
      if (item.startsWith('.') && !['package.json', '.env.example'].includes(item)) continue;
      
      const itemPath = path.join(rootPath, item);
      const stats = await fs.promises.stat(itemPath);
      
      if (stats.isDirectory()) {
        const children = await getProjectStructure(itemPath, maxDepth, currentDepth + 1);
        structure.push({
          name: item,
          type: 'directory',
          path: itemPath,
          children: children.slice(0, 10) // Limitar a 10 elementos por directorio
        });
      } else if (stats.isFile()) {
        structure.push({
          name: item,
          type: 'file',
          path: itemPath,
          size: stats.size
        });
      }
    }
    
    return structure.slice(0, 20); // Limitar a 20 elementos por nivel
  } catch (error) {
    return [];
  }
}

// Función para obtener contexto de Git
async function getGitContext() {
  try {
    const { stdout: branch } = await execAsync('git branch --show-current');
    const { stdout: status } = await execAsync('git status --porcelain');
    const { stdout: lastCommits } = await execAsync('git log --oneline -5');
    
    return {
      currentBranch: branch.trim(),
      uncommittedChanges: status.trim().split('\n').filter(line => line.trim()),
      recentCommits: lastCommits.trim().split('\n').filter(line => line.trim())
    };
  } catch (error) {
    return {
      currentBranch: 'unknown',
      uncommittedChanges: [],
      recentCommits: []
    };
  }
}

// Función para leer archivos principales del proyecto
async function getMainProjectFiles() {
  const mainFiles = ['package.json', 'README.md', 'tsconfig.json', 'vite.config.js', 'next.config.js'];
  const files = {};
  
  for (const fileName of mainFiles) {
    try {
      if (await fs.promises.access(fileName).then(() => true).catch(() => false)) {
        const content = await fs.promises.readFile(fileName, 'utf-8');
        files[fileName] = content.length > 2000 ? content.substring(0, 2000) + '...' : content;
      }
    } catch (error) {
      // File doesn't exist or can't be read
    }
  }
  
  return files;
}

// Función para obtener contexto completo del proyecto
async function getProjectContext() {
  try {
    const [structure, gitInfo, mainFiles] = await Promise.all([
      getProjectStructure(),
      getGitContext(),
      getMainProjectFiles()
    ]);
    
    return {
      timestamp: new Date().toISOString(),
      projectStructure: structure,
      git: gitInfo,
      mainFiles: mainFiles,
      summary: `Proyecto en rama ${gitInfo.currentBranch} con ${gitInfo.uncommittedChanges.length} cambios sin confirmar`
    };
  } catch (error) {
    return {
      timestamp: new Date().toISOString(),
      error: 'No se pudo obtener contexto del proyecto',
      summary: 'Contexto no disponible'
    };
  }
}

// Función inteligente que detecta el tipo de modelo y ajusta parámetros automáticamente
// Soporte completo para TODOS los modelos importantes de OpenAI
function getModelParams(modelName, temperature, maxTokens) {
  const model = modelName.toLowerCase();
  
  // GPT-5 (Reasoning Model) - Requiere tokens mínimos altos para respuestas visibles
  if (model.includes('gpt-5')) {
    return {
      tokenParam: 'max_completion_tokens',
      tokenValue: Math.max(Math.min(maxTokens, 8000), 2000), // Mínimo 2000 para GPT-5
      supportsTemperature: false, // GPT-5 no soporta temperature
      maxLimit: 8000,
      minTokens: 2000, // GPT-5 necesita mínimo 2000 tokens para respuestas consistentes
      family: 'gpt-5',
      description: 'GPT-5 Reasoning Model'
    };
  }  // O1-Preview (Advanced Reasoning)
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
  
  // O1-Mini (Efficient Reasoning)
  if (model.includes('o1-mini') || (model.includes('o1') && !model.includes('preview'))) {
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
  
  // GPT-4o-Mini (Most Economical)
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
  
  // GPT-4o (Flagship Multimodal)
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
  
  // GPT-4-Turbo (Fast GPT-4)
  if (model.includes('gpt-4-turbo')) {
    return {
      tokenParam: 'max_tokens',
      tokenValue: Math.min(maxTokens, 4096),
      supportsTemperature: true,
      maxLimit: 4096,
      minTokens: 1,
      family: 'gpt-4-turbo',
      description: 'GPT-4-Turbo Fast'
    };
  }
  
  // GPT-4 (Standard)
  if (model.includes('gpt-4')) {
    return {
      tokenParam: 'max_tokens',
      tokenValue: Math.min(maxTokens, 8192),
      supportsTemperature: true,
      maxLimit: 8192,
      minTokens: 1,
      family: 'gpt-4',
      description: 'GPT-4 Standard'
    };
  }
  
  // GPT-3.5-Turbo-Instruct (Legacy Completion)
  if (model.includes('gpt-3.5-turbo-instruct')) {
    return {
      tokenParam: 'max_tokens',
      tokenValue: Math.min(maxTokens, 4096),
      supportsTemperature: true,
      maxLimit: 4096,
      minTokens: 1,
      family: 'gpt-3.5-instruct',
      description: 'GPT-3.5-Turbo-Instruct Legacy'
    };
  }
  
  // GPT-3.5-Turbo (Legacy Chat)
  if (model.includes('gpt-3.5')) {
    return {
      tokenParam: 'max_tokens',
      tokenValue: Math.min(maxTokens, 4096),
      supportsTemperature: true,
      maxLimit: 4096,
      minTokens: 1,
      family: 'gpt-3.5',
      description: 'GPT-3.5-Turbo Legacy'
    };
  }
  
  // Fallback para modelos desconocidos o futuros
  return {
    tokenParam: 'max_tokens',
    tokenValue: Math.min(maxTokens, 4096),
    supportsTemperature: true,
    maxLimit: 4096,
    minTokens: 1,
    family: 'unknown',
    description: 'Unknown Model (using safe defaults)'
  };
}

// Función de OpenAI mejorada que funciona con TODOS los modelos
async function openaiAsk({ prompt, system, temperature = 0.7, maxTokens = 2000, context }) {
  const apiKey = process.env.OPENAI_API_KEY;

  // Validación de parámetros
  if (typeof temperature !== 'number' || temperature < 0 || temperature > 2) {
    throw new Error('Temperature debe ser un número entre 0 y 2');
  }

  if (!apiKey || apiKey === 'your-openai-api-key-here') {
    throw new Error('OPENAI_API_KEY no está configurada correctamente. Por favor, configura tu clave API de OpenAI en el archivo .env');
  }

  if (apiKey) {
    try {
      const baseUrl = process.env.OPENAI_BASE_URL || 'https://api.openai.com';
      const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
      
      // Detectar automáticamente los parámetros del modelo
      const modelParams = getModelParams(model, temperature, maxTokens);
      
      const messages = [];
      if (system) messages.push({ role: 'system', content: system });
      if (context) messages.push({ role: 'system', content: `Contexto:\n${context}` });
      messages.push({ role: 'user', content: prompt });
      
      // Construir el body dinámicamente según el modelo
      const requestBody = {
        model,
        messages,
        [modelParams.tokenParam]: modelParams.tokenValue
      };
      
      // Solo añadir temperature si el modelo la soporta
      if (modelParams.supportsTemperature) {
        requestBody.temperature = temperature;
      }
      
      console.log(`🤖 Modelo: ${model} (${modelParams.description})`);
      console.log(`📊 Parámetros:`, {
        tokenParam: `${modelParams.tokenParam}: ${modelParams.tokenValue}`,
        maxLimit: modelParams.maxLimit,
        temperature: modelParams.supportsTemperature ? temperature : 'no soportado',
        family: modelParams.family
      });
      
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
        console.error(`❌ Error API ${response.status}:`, errorText);
        throw new Error(`OpenAI API error: ${response.status} ${response.statusText} - ${errorText}`);
      }
      
      const data = await response.json();
      return {
        answer: data.choices?.[0]?.message?.content || '',
        model: data.model || model,
        usage: data.usage,
        modelParams: modelParams
      };
    } catch (error) {
      console.error('Error con OpenAI:', error.message);
      throw error;
    }
  } else {
    throw new Error('OPENAI_API_KEY no está configurada');
  }
}

// Rutas del API

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    server: 'mcpagents-autonomous-web',
    version: '1.0.0'
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'MCP Autonomous Web Server',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      ask: '/api/ask',
      analyze: '/api/analyze',
      models: '/api/models',
      jsonrpc: '/jsonrpc'
    },
    currentModel: process.env.OPENAI_MODEL || 'gpt-4o-mini'
  });
});

// Endpoint para hacer preguntas
app.post('/api/ask', async (req, res) => {
  try {
    const { question, system, temperature = 0.7, maxTokens = 2000, context } = req.body;
    
    // Validación mejorada
    if (!question || typeof question !== 'string' || question.trim().length === 0) {
      return res.status(400).json({ error: 'El campo "question" es requerido y debe ser una cadena no vacía' });
    }

    if (temperature !== undefined && (typeof temperature !== 'number' || temperature < 0 || temperature > 2)) {
      return res.status(400).json({ error: 'Temperature debe ser un número entre 0 y 2' });
    }

    if (maxTokens !== undefined && (typeof maxTokens !== 'number' || maxTokens < 1 || maxTokens > 100000)) {
      return res.status(400).json({ error: 'MaxTokens debe ser un número entre 1 y 100000' });
    }

    const result = await openaiAsk({
      prompt: question,
      system: system || 'Eres el Autonomous Copilot, un asistente de IA avanzado especializado en programación y desarrollo. Responde en español de manera amigable y profesional.',
      temperature,
      maxTokens,
      context,
    });

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error en /api/ask:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Endpoint para análisis de código
app.post('/api/analyze', async (req, res) => {
  try {
    const { code, language = 'typescript', task = 'analyze' } = req.body;
    
    // Validación mejorada
    if (!code || typeof code !== 'string' || code.trim().length === 0) {
      return res.status(400).json({ error: 'El campo "code" es requerido y debe ser una cadena no vacía' });
    }

    const validTasks = ['analyze', 'fix', 'optimize', 'explain'];
    if (task && !validTasks.includes(task)) {
      return res.status(400).json({ error: `Task debe ser uno de: ${validTasks.join(', ')}` });
    }

    const systemPrompt = `Eres un experto en ${language} que analiza código y proporciona sugerencias específicas y prácticas.\n\nTarea: ${task}\n\nINSTRUCCIONES:\n- Proporciona análisis detallado y específico\n- Sugiere mejoras concretas con ejemplos de código\n- Identifica patrones, problemas potenciales y optimizaciones\n- Sé conciso pero completo\n- Formatea la respuesta en Markdown`;
    
    const prompt = `Analiza este código ${language} y ${task === 'fix' ? 'encuentra errores y sugiere correcciones' : task === 'optimize' ? 'sugiere optimizaciones' : task === 'explain' ? 'explica cómo funciona' : 'proporciona sugerencias de mejora'}:\n\n\`\`\`${language}\n${code}\n\`\`\``;
    
    const result = await openaiAsk({ 
      prompt, 
      system: systemPrompt, 
      temperature: 0.2, 
      maxTokens: 3000 
    });

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error en /api/analyze:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Endpoint para listar todos los modelos soportados
app.get('/api/models', (req, res) => {
  const supportedModels = [
    {
      name: 'gpt-5',
      family: 'gpt-5',
      description: 'GPT-5 Reasoning Model - Flagship reasoning capabilities',
      tokenParam: 'max_completion_tokens',
      maxTokens: 8000,
      minTokens: 1000,
      supportsTemperature: false,
      recommended: 'Para tareas que requieren razonamiento complejo'
    },
    {
      name: 'o1-preview',
      family: 'o1-preview', 
      description: 'O1-Preview Advanced Reasoning - Máximo razonamiento',
      tokenParam: 'max_completion_tokens',
      maxTokens: 32768,
      minTokens: 1000,
      supportsTemperature: false,
      recommended: 'Para problemas extremadamente complejos'
    },
    {
      name: 'o1-mini',
      family: 'o1-mini',
      description: 'O1-Mini Efficient Reasoning - Razonamiento eficiente',
      tokenParam: 'max_completion_tokens', 
      maxTokens: 65536,
      minTokens: 1000,
      supportsTemperature: false,
      recommended: 'Para razonamiento rápido y económico'
    },
    {
      name: 'gpt-4o',
      family: 'gpt-4o',
      description: 'GPT-4o Flagship Multimodal - Más rápido y potente',
      tokenParam: 'max_tokens',
      maxTokens: 16384,
      minTokens: 1,
      supportsTemperature: true,
      recommended: 'Para uso general de alta calidad'
    },
    {
      name: 'gpt-4o-mini',
      family: 'gpt-4o-mini', 
      description: 'GPT-4o-Mini Economical - Más económico',
      tokenParam: 'max_tokens',
      maxTokens: 16384,
      minTokens: 1,
      supportsTemperature: true,
      recommended: 'Para uso general económico'
    },
    {
      name: 'gpt-4-turbo',
      family: 'gpt-4-turbo',
      description: 'GPT-4-Turbo Fast - GPT-4 optimizado',
      tokenParam: 'max_tokens',
      maxTokens: 4096,
      minTokens: 1,
      supportsTemperature: true,
      recommended: 'Para GPT-4 más rápido'
    },
    {
      name: 'gpt-4',
      family: 'gpt-4',
      description: 'GPT-4 Standard - Modelo clásico potente',
      tokenParam: 'max_tokens',
      maxTokens: 8192,
      minTokens: 1,
      supportsTemperature: true,
      recommended: 'Para tareas que requieren máxima calidad'
    },
    {
      name: 'gpt-3.5-turbo',
      family: 'gpt-3.5',
      description: 'GPT-3.5-Turbo Legacy - Rápido y económico',
      tokenParam: 'max_tokens',
      maxTokens: 4096,
      minTokens: 1,
      supportsTemperature: true,
      recommended: 'Para tareas simples y rápidas'
    }
  ];

  const currentModel = process.env.OPENAI_MODEL || 'gpt-4o-mini';
  const currentModelParams = getModelParams(currentModel, 0.7, 2000);

  res.json({
    success: true,
    data: {
      currentModel: {
        name: currentModel,
        params: currentModelParams
      },
      supportedModels: supportedModels,
      howToChange: {
        step1: 'Editar .env: OPENAI_MODEL=nombre_del_modelo',
        step2: 'Reiniciar servidor: npm start',
        step3: 'Probar: curl -X POST http://localhost:8080/api/ask -H "Content-Type: application/json" -d \'{"question":"test"}\''
      }
    }
  });
});

// Definición de herramientas MCP disponibles
const mcpTools = [
  {
    name: 'mcp_autonomous_ask',
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
    name: 'mcp_autonomous_analyze_code',
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
    name: 'mcp_autonomous_health',
    description: 'Check the health status of the autonomous copilot',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'mcp_autonomous_get_context',
    description: 'Get comprehensive project context including structure, git status, and main files',
    inputSchema: { type: 'object', properties: {} },
  },
];

// Endpoint compatible con JSON-RPC (para compatibilidad con MCP)
// Manejar tanto GET como POST para compatibilidad con MCP clients
app.get('/jsonrpc', (req, res) => {
  res.json({
    jsonrpc: '2.0',
    result: {
      protocolVersion: '2024-11-05',
      capabilities: { 
        tools: {},
        experimental: {}
      },
      serverInfo: {
        name: 'mcpagents-autonomous-web',
        version: '1.0.0'
      }
    }
  });
});

app.post('/jsonrpc', async (req, res) => {
  try {
    const { jsonrpc, id, method, params } = req.body;
    
    if (jsonrpc !== '2.0') {
      return res.status(400).json({
        jsonrpc: '2.0',
        id,
        error: { code: -32600, message: 'Invalid Request' }
      });
    }

    // Handle notifications (no response expected)
    if (method && method.startsWith('notifications/')) {
      console.log(`Received notification: ${method}`);
      return res.status(200).end();
    }

    let result;
    
    switch (method) {
      case 'initialize': {
        result = {
          protocolVersion: '2024-11-05',
          capabilities: { 
            tools: {},
            experimental: {}
          },
          serverInfo: {
            name: 'mcpagents-autonomous-web',
            version: '1.0.0'
          }
        };
        break;
      }
      case 'tools/list': {
        result = {
          tools: mcpTools
        };
        break;
      }
      case 'ping': {
        result = {};
        break;
      }
      case 'tools/call': {
        const { name, arguments: args } = params;
        
        switch (name) {
          case 'mcp_autonomous_ask': {
            const { question, system, temperature = 0.7, maxTokens = 2000, context, includeProjectContext = true } = args;
            
            let finalContext = context || '';
            
            if (includeProjectContext) {
              const projectContext = await getProjectContext();
              finalContext = `CONTEXTO DEL PROYECTO:
${JSON.stringify(projectContext, null, 2)}

CONTEXTO ADICIONAL:
${context || 'No hay contexto adicional proporcionado.'}

---`;
            }
            
            console.log(`🔍 DEBUG: Llamando OpenAI con pregunta: "${question}"`);
            console.log(`📊 DEBUG: maxTokens=${maxTokens}, temperature=${temperature}`);
            
            const openaiResult = await openaiAsk({
              prompt: question,
              system: system || 'Eres el Autonomous Copilot, un asistente de IA avanzado especializado en programación y desarrollo. Tienes acceso al contexto completo del proyecto actual. Responde en español de manera amigable y profesional.',
              temperature,
              maxTokens,
              context: finalContext,
            });
            
            console.log(`✅ DEBUG: Respuesta de OpenAI:`, {
              answer: openaiResult.answer?.substring(0, 100) + '...',
              model: openaiResult.model,
              usage: openaiResult.usage
            });
            
            result = {
              content: [{ 
                type: 'text', 
                text: openaiResult.answer || 'No se pudo obtener respuesta' 
              }]
            };
            break;
          }
          case 'mcp_autonomous_analyze_code': {
            const { code, language = 'typescript', task = 'analyze', includeProjectContext = true } = args;
            if (!code) throw new Error('Código es requerido para el análisis');
            
            let projectContextText = '';
            if (includeProjectContext) {
              const projectContext = await getProjectContext();
              projectContextText = `\n\nCONTEXTO DEL PROYECTO:\n${JSON.stringify(projectContext, null, 2)}`;
            }
            
            const systemPrompt = `Eres un experto en ${language} que analiza código y proporciona sugerencias específicas y prácticas. Tienes acceso al contexto completo del proyecto actual.\n\nTarea: ${task}\n\nINSTRUCCIONES:\n- Proporciona análisis detallado y específico\n- Sugiere mejoras concretas con ejemplos de código\n- Identifica patrones, problemas potenciales y optimizaciones\n- Considera el contexto del proyecto para tus recomendaciones\n- Sé conciso pero completo\n- Formatea la respuesta en Markdown${projectContextText}`;
            
            const prompt = `Analiza este código ${language} y ${task === 'fix' ? 'encuentra errores y sugiere correcciones' : task === 'optimize' ? 'sugiere optimizaciones' : task === 'explain' ? 'explica cómo funciona' : 'proporciona sugerencias de mejora'}:\n\n\`\`\`${language}\n${code}\n\`\`\``;
            
            const openaiResult = await openaiAsk({ 
              prompt, 
              system: systemPrompt, 
              temperature: 0.2, 
              maxTokens: 3000 
            });
            
            result = {
              content: [{ 
                type: 'text', 
                text: openaiResult.answer || 'No se pudo analizar el código' 
              }]
            };
            break;
          }
          case 'mcp_autonomous_health': {
            result = {
              content: [{ 
                type: 'text', 
                text: JSON.stringify({
                  status: 'ok',
                  timestamp: new Date().toISOString(),
                  server: 'mcpagents-autonomous-web',
                  version: '1.0.0'
                }, null, 2)
              }]
            };
            break;
          }
          case 'mcp_autonomous_get_context': {
            const projectContext = await getProjectContext();
            result = {
              content: [{ 
                type: 'text', 
                text: JSON.stringify(projectContext, null, 2)
              }]
            };
            break;
          }
          default:
            return res.status(404).json({
              jsonrpc: '2.0',
              id,
              error: { code: -32601, message: `Unknown tool: ${name}` }
            });
        }
        break;
      }
      case 'mcp.openai.ask': {
        const { prompt, system, temperature, maxTokens, context } = params;
        result = await openaiAsk({ prompt, system, temperature, maxTokens, context });
        break;
      }
      case 'mcp.health': {
        result = {
          status: 'ok',
          timestamp: new Date().toISOString(),
          server: 'mcpagents-autonomous-web',
          version: '1.0.0'
        };
        break;
      }
      default:
        return res.status(404).json({
          jsonrpc: '2.0',
          id,
          error: { code: -32601, message: 'Method not found' }
        });
    }

    res.json({
      jsonrpc: '2.0',
      id,
      result
    });
  } catch (error) {
    console.error('Error en JSON-RPC:', error);
    res.json({
      jsonrpc: '2.0',
      id: req.body.id,
      error: { code: -32603, message: error.message }
    });
  }
});

// Middleware de manejo de errores
app.use((err, req, res, next) => {
  console.error('Error no manejado:', err);
  res.status(500).json({
    success: false,
    error: 'Error interno del servidor'
  });
});

// Iniciar servidor
app.listen(port, '0.0.0.0', () => {
  console.log(`🚀 Servidor MCP Autonomous Web ejecutándose en puerto ${port}`);
  console.log(`📍 Health check: http://localhost:${port}/health`);
  console.log(`🔗 API Base: http://localhost:${port}/api`);
});

export default app;
