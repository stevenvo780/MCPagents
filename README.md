# MCP Autonomous Agents

Servidor MCP (Model Context Protocol) con capacidades autónomas integradas con OpenAI.

## 🚀 Características

- **Servidor MCP Stdio**: Para integración con VS Code
- **Servidor Web HTTP**: Para APIs REST y integración web
- **Integración OpenAI**: Soporte completo para GPT-4o-mini
- **Despliegue en GCP**: Configuración lista para Cloud Run
- **Múltiples interfaces**: Stdio, HTTP REST y JSON-RPC

## 📦 Instalación

```bash
npm install
```

## 🔧 Configuración

Crear archivo `.env`:
```bash
OPENAI_API_KEY=tu_clave_de_openai
```

## 🎯 Uso

### Servidor MCP (VS Code)
```bash
npm run start:mcp
```

### Servidor Web HTTP
```bash
npm start
# o para desarrollo:
npm run dev:web
```

### Endpoints Web
- `GET /health` - Health check
- `POST /api/ask` - Hacer preguntas
- `POST /api/analyze` - Analizar código
- `POST /jsonrpc` - Endpoint JSON-RPC

## 🌐 Despliegue en GCP

### Requisitos
- Google Cloud SDK
- Docker
- Proyecto GCP: `emergent-enter-prices`

### Comando de Despliegue
```bash
./deploy-gcp.sh
```

## 📖 Documentación

Ver [API-DOCS.md](./API-DOCS.md) para documentación completa del API.

## 🛠️ Scripts Disponibles

- `npm start` - Iniciar servidor web
- `npm run start:mcp` - Iniciar servidor MCP
- `npm run dev:web` - Desarrollo servidor web (con watch)
- `./deploy-gcp.sh` - Desplegar en Google Cloud Platform

## Herramientas MCP disponibles

- `mcp_autonomous_ask` - Preguntas al asistente IA
- `mcp_autonomous_analyze_code` - Análisis de código
- `mcp_autonomous_health` - Estado del servidor
