#!/usr/bin/env node

import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import dotenv from 'dotenv';

// Cargar variables de entorno
dotenv.config();

const app = express();
const port = process.env.PORT || 8080;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Función de OpenAI reutilizada desde el servidor MCP original
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
      jsonrpc: '/jsonrpc'
    }
  });
});

// Endpoint para hacer preguntas
app.post('/api/ask', async (req, res) => {
  try {
    const { question, system, temperature = 0.7, maxTokens = 2000, context } = req.body;
    
    if (!question) {
      return res.status(400).json({ error: 'El campo "question" es requerido' });
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
    
    if (!code) {
      return res.status(400).json({ error: 'El campo "code" es requerido' });
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

// Endpoint compatible con JSON-RPC (para compatibilidad con MCP)
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

    let result;
    
    switch (method) {
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
