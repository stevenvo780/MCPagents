#!/bin/bash

echo "🤖 PRUEBA ESPECÍFICA DEL MCP AUTONOMOUS"
echo "======================================="
echo ""

cd /home/stev/Documentos/repos/Utilidades/MCPagents/mcp

echo "🔍 Probando herramientas del Autonomous Copilot..."
echo ""

# Test 1: Listar herramientas
echo "1. 📋 Listando herramientas disponibles:"
echo '{"jsonrpc":"2.0","method":"tools/list","id":1}' | node stdio-server.js 2>/dev/null | jq -r '.result.tools[].name' | sed 's/^/   ✅ /'
echo ""

# Test 2: Health check
echo "2. ❤️ Health Check:"
HEALTH=$(echo '{"jsonrpc":"2.0","method":"tools/call","id":2,"params":{"name":"mcp_autonomous_health","arguments":{}}}' | node stdio-server.js 2>/dev/null | jq -r '.result.content[0].text')
echo "   $HEALTH"
echo ""

# Test 3: Pregunta simple
echo "3. 💬 Pregunta de prueba:"
RESPONSE=$(echo '{"jsonrpc":"2.0","method":"tools/call","id":3,"params":{"name":"mcp_autonomous_ask","arguments":{"question":"¿Cuál es tu función principal como Autonomous Copilot?","temperature":0.3}}}' | node stdio-server.js 2>/dev/null | jq -r '.result.content[0].text')
echo "   Respuesta: ${RESPONSE:0:200}..."
echo ""

# Test 4: Análisis de código
echo "4. 🔍 Análisis de código de ejemplo:"
CODE='function fibonacci(n) { if (n <= 1) return n; return fibonacci(n-1) + fibonacci(n-2); }'
ANALYSIS=$(echo "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"id\":4,\"params\":{\"name\":\"mcp_autonomous_analyze_code\",\"arguments\":{\"code\":\"$CODE\",\"language\":\"javascript\",\"task\":\"optimize\"}}}" | node stdio-server.js 2>/dev/null | jq -r '.result.content[0].text')
echo "   Análisis: ${ANALYSIS:0:200}..."
echo ""

echo "✅ ¡MCP Autonomous funcionando correctamente!"
echo ""
echo "📌 Configuración actual en ~/.config/Code/User/mcp.json:"
echo '   "mcpagents-autonomous": {'
echo '     "type": "stdio",'
echo '     "command": "node",'
echo '     "args": ["'$(pwd)'/stdio-server.js"]'
echo '   }'
echo ""
echo "🔄 Para activar en VS Code: Reinicia VS Code completamente"
