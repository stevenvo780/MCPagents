# MCP Autonomous Server

Servidor MCP minimalista con herramientas de IA autónoma.

## Uso

```bash
# Instalar dependencias
cd mcp && npm install

# Configurar OpenAI API Key en mcp/.env
OPENAI_API_KEY=tu_api_key_aqui

# Ejecutar servidor
npm start
```

## Herramientas disponibles

- `mcp_autonomous_ask` - Preguntas al asistente IA
- `mcp_autonomous_analyze_code` - Análisis de código
- `mcp_autonomous_health` - Estado del servidor
