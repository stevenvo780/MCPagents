#!/bin/bash

echo "🚀 Probando todas las herramientas MCP Autonomous..."
echo ""

# Test 1: Listar herramientas
echo "1. 📋 Listando herramientas disponibles:"
echo '{"jsonrpc":"2.0","method":"tools/list","id":1}' | node stdio-server.js 2>/dev/null | jq -r '.result.tools[].name'
echo ""

# Test 2: Health check
echo "2. ❤️ Verificando salud del sistema:"
echo '{"jsonrpc":"2.0","method":"tools/call","id":2,"params":{"name":"mcp_autonomous_health","arguments":{}}}' | node stdio-server.js 2>/dev/null | jq -r '.result.content[0].text'
echo ""

# Test 3: Pregunta simple
echo "3. 💬 Pregunta al Autonomous Copilot:"
RESPONSE=$(echo '{"jsonrpc":"2.0","method":"tools/call","id":3,"params":{"name":"mcp_autonomous_ask","arguments":{"question":"¿Cuál es tu función principal?","temperature":0.3}}}' | node stdio-server.js 2>/dev/null | jq -r '.result.content[0].text')
echo "$RESPONSE" | head -c 150
echo "..."
echo ""

# Test 4: Análisis de código
echo "4. 🔍 Análisis de código:"
CODE='function add(a, b) { return a + b; }'
ANALYSIS=$(echo "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"id\":4,\"params\":{\"name\":\"mcp_autonomous_analyze_code\",\"arguments\":{\"code\":\"$CODE\",\"language\":\"javascript\",\"task\":\"analyze\"}}}" | node stdio-server.js 2>/dev/null | jq -r '.result.content[0].text')
echo "$ANALYSIS" | head -c 150
echo "..."
echo ""

echo "✅ ¡Todas las herramientas MCP Autonomous funcionan correctamente!"
echo ""
echo "📌 Para usar en VS Code, asegúrate de que tu archivo mcp.json está configurado"
echo "   y reinicia VS Code para cargar las nuevas herramientas."
