# MCP Autonomous Agents

Servidor MCP (Model Context Protocol) con capacidades autónomas integradas con OpenAI.

## 🚀 Características

- **Servidor MCP Stdio**: Para integración con VS Code y Claude Desktop
- **Servidor Web HTTP**: Para APIs REST y integración web
- **Integración OpenAI**: Soporte completo para todos los modelos de OpenAI (GPT-4o, GPT-5, o1-preview, etc.)
- **Análisis de código**: Herramientas avanzadas para análisis, optimización y corrección de código
- **Contexto automático**: Incluye automáticamente el contexto del proyecto (estructura, git, archivos principales)
- **Manejo robusto de errores**: Validación completa de entrada y manejo de errores

## 📦 Instalación

```bash
npm install
```

## 🔧 Configuración

1. Crear archivo `.env` (usar `.env.example` como plantilla):
```bash
cp .env.example .env
```

2. Editar `.env` y configurar tu clave API de OpenAI:
```bash
OPENAI_API_KEY=tu_clave_de_openai_aquí
OPENAI_MODEL=gpt-4o-mini
```

## 🎯 Uso

### Servidor MCP (Para VS Code/Claude Desktop)

1. Compilar TypeScript:
```bash
npm run build
```

2. Probar servidor MCP:
```bash
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | node dist/mcp/stdio-server.js
```

### Servidor Web HTTP

```bash
npm start
# o para desarrollo con auto-reload:
npm run dev:web
```

### Endpoints Web

- `GET /health` - Health check
- `GET /` - Información del servidor y endpoints disponibles
- `GET /api/models` - Lista de modelos soportados
- `POST /api/ask` - Hacer preguntas al asistente IA
- `POST /api/analyze` - Analizar código
- `POST /jsonrpc` - Endpoint JSON-RPC para compatibilidad MCP

## 🛠️ Herramientas MCP Disponibles

### 1. `autonomous_ask`
Hace preguntas al asistente IA con contexto automático del proyecto.

**Parámetros:**
- `question` (requerido): La pregunta a hacer
- `system` (opcional): Prompt del sistema para guiar la respuesta
- `temperature` (opcional): Temperatura para creatividad (0-2, default: 0.7)
- `maxTokens` (opcional): Máximo tokens en respuesta (default: 2000)
- `context` (opcional): Contexto adicional
- `includeProjectContext` (opcional): Incluir contexto automático del proyecto (default: true)

### 2. `analyze_code`
Analiza código con el asistente IA y contexto automático del proyecto.

**Parámetros:**
- `code` (requerido): El código a analizar
- `language` (opcional): Lenguaje de programación (default: "typescript")
- `task` (opcional): Tipo de análisis ("analyze", "fix", "optimize", "explain", default: "analyze")
- `includeProjectContext` (opcional): Incluir contexto automático del proyecto (default: true)

### 3. `get_project_context`
Obtiene contexto completo del proyecto incluyendo estructura, estado de git y archivos principales.

### 4. `health_check`
Verifica el estado de salud del servidor.

## 💻 Integración con VS Code

1. Instalar la extensión MCP para VS Code
2. Configurar el servidor en la configuración de VS Code:

```json
{
  "mcp.servers": {
    "autonomous-agent": {
      "command": "node",
      "args": ["dist/mcp/stdio-server.js"],
      "cwd": "/ruta/completa/a/MCPagents",
      "env": {
        "OPENAI_API_KEY": "tu-openai-api-key-aquí"
      }
    }
  }
}
```

## 🧪 Pruebas

### Probar el servidor web:
```bash
# Health check
curl http://localhost:8080/health

# Listar modelos
curl http://localhost:8080/api/models

# Hacer pregunta (falla sin API key configurada)
curl -X POST http://localhost:8080/api/ask \\
  -H "Content-Type: application/json" \\
  -d '{"question":"Hello, how are you?"}'
```

### Probar el servidor MCP:
```bash
# Listar herramientas
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | node dist/mcp/stdio-server.js

# Obtener contexto del proyecto
echo '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get_project_context","arguments":{}}}' | node dist/mcp/stdio-server.js

# Verificar salud
echo '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"health_check","arguments":{}}}' | node dist/mcp/stdio-server.js
```

## 🎛️ Modelos Soportados

El servidor detecta automáticamente el modelo configurado y ajusta los parámetros:

- **GPT-5**: Modelo de razonamiento flagship (requiere `max_completion_tokens`, mínimo 2000 tokens)
- **o1-preview**: Razonamiento avanzado máximo (hasta 32,768 tokens)
- **o1-mini**: Razonamiento eficiente (hasta 65,536 tokens)
- **gpt-4o**: Multimodal flagship (hasta 16,384 tokens)
- **gpt-4o-mini**: Económico (hasta 16,384 tokens)
- **gpt-4-turbo**: GPT-4 optimizado (hasta 4,096 tokens)
- **gpt-4**: Modelo clásico potente (hasta 8,192 tokens)
- **gpt-3.5-turbo**: Rápido y económico (hasta 4,096 tokens)

## 📋 Scripts Disponibles

- `npm run build` - Compilar TypeScript
- `npm start` - Iniciar servidor web
- `npm run dev:web` - Desarrollo servidor web (con watch)
- `npm run dev:stdio` - Desarrollo servidor MCP con ts-node
- `npm run start:stdio` - Iniciar servidor MCP compilado

## 🔧 Desarrollo

Para desarrollo, usar:
```bash
# Terminal 1: Compilación automática
npm run build -- --watch

# Terminal 2: Servidor web con auto-reload
npm run dev:web

# Terminal 3: Probar servidor MCP
npm run dev:stdio
```

## 🚨 Solución de Problemas

### Error: "OPENAI_API_KEY no está configurada"
- Verificar que el archivo `.env` existe y contiene `OPENAI_API_KEY=tu_clave_aquí`
- No usar `your-openai-api-key-here` como valor real

### Error: "Unknown file extension .ts"
- Ejecutar `npm run build` primero para compilar TypeScript
- Usar `node dist/mcp/stdio-server.js` en lugar de archivos `.ts`

### Servidor no responde
- Verificar que el puerto 8080 no esté ocupado
- Revisar logs para errores específicos
- Probar health check: `curl http://localhost:8080/health`

## 📝 Logs y Debugging

El servidor incluye logging detallado:
- Información del modelo detectado
- Parámetros de configuración automática
- Errores de API con detalles completos
- Contexto del proyecto en cada solicitud