import fetch from 'node-fetch';

const SERVER_URL = 'http://localhost:7088/jsonrpc';

interface MCPAutonomousParams {
  question?: string;
  prompt?: string;
  system?: string;
  temperature?: number;
  maxTokens?: number;
  context?: string;
  code?: string;
  language?: string;
  task?: string;
  includeErrors?: boolean;
  includeFiles?: boolean;
}

interface MCPResponse {
  answer?: string;
  model?: string;
  usage?: any;
  latencyMs?: number;
  status?: string;
  message?: string;
  tools?: any[];
}

// Verificar salud del servidor
async function checkServerHealth(): Promise<boolean> {
  try {
    const response = await fetch('http://localhost:7088/health');
    if (response.ok) {
      const data = await response.json();
      return data.status === 'ok';
    }
    return false;
  } catch (error) {
    console.error('❌ Servidor MCP Autonomous no disponible:', error);
    return false;
  }
}

// Llamada base al servidor MCP
async function callMCPServer(method: string, params: any = {}): Promise<MCPResponse> {
  try {
    const response = await fetch(SERVER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now(),
        method,
        params
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();

    if (data.error) {
      throw new Error(data.error.message);
    }

    return data.result;
  } catch (error) {
    console.error(`❌ Error en MCP call ${method}:`, error);
    throw error;
  }
}

// === FUNCIONES MCP GLOBALES ===

export async function mcp_autonomous_ask(params: MCPAutonomousParams): Promise<MCPResponse> {
  const isHealthy = await checkServerHealth();
  if (!isHealthy) {
    throw new Error('Servidor MCP Autonomous no está disponible en localhost:7088');
  }

  return await callMCPServer('mcp.openai.ask', {
    question: params.question || params.prompt,
    system: params.system,
    temperature: params.temperature || 0.3,
    maxTokens: params.maxTokens || 2000,
    context: params.context,
    ...params
  });
}

export async function mcp_autonomous_health(): Promise<MCPResponse> {
  const isHealthy = await checkServerHealth();
  if (!isHealthy) {
    return { status: 'error', message: 'Servidor no disponible' };
  }

  return await callMCPServer('mcp.health', {});
}

export async function mcp_autonomous_describe(): Promise<MCPResponse> {
  const isHealthy = await checkServerHealth();
  if (!isHealthy) {
    return { tools: [], status: 'offline' };
  }

  return await callMCPServer('mcp.describe', {});
}

export async function mcp_autonomous_analyze_code(params: MCPAutonomousParams): Promise<MCPResponse> {
  const { code, language = 'typescript', task = 'analyze' } = params;

  if (!code) {
    throw new Error('Parámetro "code" es requerido');
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
      task === 'explain' ? 'explica cómo funciona' : 'proporciona sugerencias de mejora'}:

\`\`\`${language}
${code}
\`\`\``;

  return await mcp_autonomous_ask({
    question: prompt,
    system: systemPrompt,
    temperature: 0.2,
    maxTokens: 3000
  });
}

export async function mcp_autonomous_get_project_context(params: MCPAutonomousParams = {}): Promise<MCPResponse> {
  const { includeErrors = true, includeFiles = false } = params;

  const systemPrompt = `Eres un asistente que ayuda a obtener contexto del proyecto actual.
Proporciona un resumen útil del estado del proyecto basado en la información proporcionada.`;

  const prompt = `Necesito contexto del proyecto actual:
- Incluir errores: ${includeErrors}
- Incluir archivos: ${includeFiles}

Por favor proporciona un resumen del contexto del proyecto.`;

  return await mcp_autonomous_ask({
    question: prompt,
    system: systemPrompt,
    temperature: 0.1,
    maxTokens: 1500
  });
}

// Funciones alias para compatibilidad
export const mcp_autonomous_openai_ask = mcp_autonomous_ask;
export const mcp_autonomous_code_analysis = mcp_autonomous_analyze_code;

// Auto-registro y verificación
export async function initializeMCPAutonomous(): Promise<boolean> {
  console.log('🔧 Inicializando integración MCP Autonomous...');

  const isHealthy = await checkServerHealth();
  if (isHealthy) {
    console.log('✅ Servidor MCP Autonomous conectado exitosamente');
    console.log('📋 Funciones disponibles:');
    console.log('  - mcp_autonomous_ask(params)');
    console.log('  - mcp_autonomous_analyze_code(params)');
    console.log('  - mcp_autonomous_get_project_context(params)');
    console.log('  - mcp_autonomous_health()');
    console.log('  - mcp_autonomous_describe()');
    return true;
  } else {
    console.log('❌ No se pudo conectar al servidor MCP Autonomous');
    console.log('💡 Asegúrate de que el servidor esté ejecutándose en localhost:7088');
    return false;
  }
}

// Exportar todo
export default {
  mcp_autonomous_ask,
  mcp_autonomous_health,
  mcp_autonomous_describe,
  mcp_autonomous_analyze_code,
  mcp_autonomous_get_project_context,
  mcp_autonomous_openai_ask,
  mcp_autonomous_code_analysis,
  initializeMCPAutonomous
};
