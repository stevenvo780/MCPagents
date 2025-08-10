const fetch = require('node-fetch');

const SERVER_URL = 'http://localhost:7088/jsonrpc';

// Verificar salud del servidor
async function checkServerHealth() {
  try {
    const response = await fetch('http://localhost:7088/health');
    if (response.ok) {
      const data = await response.json();
      return data.status === 'ok';
    }
    return false;
  } catch (error) {
    console.error('❌ Servidor MCP Autonomous no disponible:', error.message);
    return false;
  }
}

// Llamada base al servidor MCP
async function callMCPServer(method, params = {}) {
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
    console.error(`❌ Error en MCP call ${method}:`, error.message);
    throw error;
  }
}

// === FUNCIONES MCP GLOBALES ===

async function mcp_autonomous_ask(params) {
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

async function mcp_autonomous_health() {
  const isHealthy = await checkServerHealth();
  if (!isHealthy) {
    return { status: 'error', message: 'Servidor no disponible' };
  }

  return await callMCPServer('mcp.health', {});
}

async function mcp_autonomous_analyze_code(params) {
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

// Prueba del sistema
async function testMCPIntegration() {
  console.log('🔧 Probando integración MCP Autonomous...\n');

  try {
    // Test 1: Health check
    console.log('1. Verificando salud del servidor...');
    const health = await mcp_autonomous_health();
    console.log('✅ Health:', health);

    // Test 2: Pregunta simple
    console.log('\n2. Haciendo pregunta de prueba...');
    const response = await mcp_autonomous_ask({
      question: '¿Cuál es la diferencia entre let y const en JavaScript?',
      temperature: 0.2,
      maxTokens: 500
    });
    console.log('✅ Respuesta:', response.answer?.substring(0, 150) + '...');

    // Test 3: Análisis de código
    console.log('\n3. Analizando código de ejemplo...');
    const codeAnalysis = await mcp_autonomous_analyze_code({
      code: `function sum(a, b) {
  return a + b;
}
const result = sum(5, "10");`,
      language: 'javascript',
      task: 'analyze'
    });
    console.log('✅ Análisis:', codeAnalysis.answer?.substring(0, 150) + '...');

    console.log('\n🎉 ¡Integración MCP funcionando correctamente!');
    return true;

  } catch (error) {
    console.error('❌ Error en la integración:', error.message);
    return false;
  }
}

module.exports = {
  mcp_autonomous_ask,
  mcp_autonomous_health,
  mcp_autonomous_analyze_code,
  testMCPIntegration
};

// Auto-ejecutar test si se llama directamente
if (require.main === module) {
  testMCPIntegration();
}
