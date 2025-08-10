#!/bin/bash

echo "🧪 Probando servidor MCP Autonomous antes del reinicio de VS Code..."

# Probar el servidor directamente
echo "1. Probando el servidor stdio-server-fixed.js directamente..."
cd /home/stev/Documentos/repos/Utilidades/MCPagents/mcp

# Crear un test básico del protocolo MCP
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}' | timeout 10 node stdio-server-fixed.js

echo -e "\n2. Verificando que el archivo existe y es ejecutable..."
ls -la stdio-server-fixed.js

echo -e "\n3. Probando sintaxis del archivo..."
node --check stdio-server-fixed.js

echo -e "\n4. Verificando dependencias..."
npm list @modelcontextprotocol/sdk node-fetch 2>/dev/null || echo "Dependencias no instaladas localmente, usando npx"

echo -e "\n✅ Pruebas completadas. Ahora reinicia VS Code para cargar el nuevo servidor."
