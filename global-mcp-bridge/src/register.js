/**
 * Registrador global para herramientas MCP Autonomous
 * Este módulo registra las funciones del servidor MCP como herramientas globales
 */

const path = require('path');

// Importar el módulo de integración
const mcpTools = require('./mcp_tools_integration.js');

// Función para registrar las herramientas MCP en el contexto global
function registerGlobalMCPTools() {
  // Verificar si global existe
  if (typeof global !== 'undefined') {
    // Registrar cada función en el contexto global
    Object.keys(mcpTools).forEach(toolName => {
      if (typeof mcpTools[toolName] === 'function') {
        global[toolName] = mcpTools[toolName];
        console.log(`✅ Registrada herramienta global: ${toolName}`);
      }
    });

    console.log('🎯 Herramientas MCP Autonomous registradas globalmente');
    return true;
  } else {
    console.error('❌ Contexto global no disponible');
    return false;
  }
}

// Función para verificar el registro
async function verifyRegistration() {
  try {
    if (typeof global !== 'undefined' && typeof global.mcp_autonomous_health === 'function') {
      const health = await global.mcp_autonomous_health();
      console.log('🔍 Verificación de salud:', health);
      return health.status === 'ok';
    }
    return false;
  } catch (error) {
    console.error('❌ Error en verificación:', error);
    return false;
  }
}

// Función de inicialización principal
async function initialize() {
  console.log('🚀 Inicializando sistema MCP Autonomous Global...');

  // Registrar herramientas
  const registered = registerGlobalMCPTools();

  if (registered) {
    // Verificar registro
    const verified = await verifyRegistration();

    if (verified) {
      console.log('✅ Sistema MCP Autonomous inicializado correctamente');
      console.log('📋 Herramientas disponibles globalmente:');
      console.log('  - mcp_autonomous_ask()');
      console.log('  - mcp_autonomous_analyze_code()');
      console.log('  - mcp_autonomous_get_project_context()');
      console.log('  - mcp_autonomous_health()');
      console.log('  - mcp_autonomous_describe()');
      return true;
    } else {
      console.log('⚠️ Herramientas registradas pero servidor no disponible');
      return false;
    }
  } else {
    console.log('❌ No se pudieron registrar las herramientas');
    return false;
  }
}

// Exportar funciones
module.exports = {
  registerGlobalMCPTools,
  verifyRegistration,
  initialize,
  tools: mcpTools
};

// Auto-inicializar si se ejecuta directamente
if (require.main === module) {
  initialize().then(success => {
    if (success) {
      console.log('🎉 Sistema listo para usar');
    } else {
      console.log('💥 Error en la inicialización');
      process.exit(1);
    }
  });
}
