#!/bin/bash

echo "🔍 Verificando si VS Code cargó correctamente el servidor MCP Autonomous..."

echo "1. Verificando configuración actual de MCP:"
cat ~/.config/Code/User/mcp.json | jq .servers.\"mcpagents-autonomous\" 2>/dev/null || echo "jq no disponible, mostrando raw:"
grep -A 10 "mcpagents-autonomous" ~/.config/Code/User/mcp.json

echo -e "\n2. Verificando si el proceso del servidor está corriendo:"
ps aux | grep "stdio-server-fixed.js" | grep -v grep

echo -e "\n3. Verificando logs de VS Code (si están disponibles):"
# Buscar logs de MCP en VS Code
find ~/.config/Code/logs -name "*.log" -mtime -1 2>/dev/null | head -3 | xargs grep -l "mcp\|MCP" 2>/dev/null || echo "No se encontraron logs recientes de MCP"

echo -e "\n4. Probando acceso directo al servidor:"
cd /home/stev/Documentos/repos/Utilidades/MCPagents/mcp
echo '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' | timeout 5 node stdio-server-fixed.js

echo -e "\n🎯 Para verificar que funciona en VS Code:"
echo "   1. Abre el Command Palette (Ctrl+Shift+P)"
echo "   2. Busca: '@mcp_mcpagents-aut' para ver las funciones disponibles"
echo "   3. O intenta usar directamente: mcp_autonomous_ask, mcp_autonomous_analyze_code, mcp_autonomous_health"
