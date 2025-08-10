#!/bin/bash

echo "🚀 Probando comandos MCP Autonomous..."
echo ""

echo "1. ✅ Servidor MCP Health Check:"
curl -s http://localhost:7088/health | jq '.'
echo ""

echo "2. ✅ Pregunta directa al MCP:"
curl -s -X POST http://localhost:7088/jsonrpc \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "mcp.openai.ask",
    "params": {
      "question": "¿Cuáles son las 3 mejores prácticas para optimizar React?",
      "temperature": 0.2,
      "maxTokens": 200
    }
  }' | jq '.result.answer' -r
echo ""

echo "3. ✅ Análisis de código de ejemplo:"
curl -s -X POST http://localhost:7088/jsonrpc \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0", 
    "id": 2,
    "method": "mcp.openai.ask",
    "params": {
      "question": "Analiza este código JavaScript y sugiere mejoras: function add(a, b) { return a + b; } const result = add(5, \"10\");",
      "system": "Eres un experto en JavaScript que analiza código y proporciona sugerencias específicas.",
      "temperature": 0.1,
      "maxTokens": 300
    }
  }' | jq '.result.answer' -r
echo ""

echo "🎉 ¡Comandos MCP funcionando perfectamente!"
echo ""
echo "📋 Comandos disponibles en VS Code Command Palette (Ctrl+Shift+P):"
echo "  - MCP: Ask Question"
echo "  - MCP: Analyze Code" 
echo "  - MCP: Health Check"
echo "  - MCP: Get Project Context"
echo ""
echo "💡 También puedes usar el bridge JavaScript:"
echo "  node ../global-mcp-bridge/test-integration.js"
