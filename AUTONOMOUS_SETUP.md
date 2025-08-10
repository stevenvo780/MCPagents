# Configuración del Autonomous MCP Copilot

## Pasos para activar el Autonomous Copilot como herramienta MCP nativa:

### 1. Configurar variables de entorno

```bash
# Copiar el archivo de ejemplo
cp .env.example .env

# Editar el archivo .env y agregar tu API key de OpenAI
# OPENAI_API_KEY=tu_clave_aqui
```

### 2. Instalar dependencias

```bash
cd mcp
npm install
```

### 3. Verificar que tu archivo mcp.json contiene la configuración correcta

Tu archivo `~/.config/Code/User/mcp.json` debe incluir:

```json
{
  "servers": {
    "mcpagents-autonomous": {
      "type": "stdio",
      "command": "/home/stev/Documentos/repos/Utilidades/MCPagents/mcp/mcp-autonomous-server.js",
      "description": "Autonomous MCP Helper - Direct stdio integration"
    }
  }
}
```

### 4. Reiniciar VS Code

Después de configurar todo, reinicia VS Code para que cargue el nuevo servidor MCP.

### 5. Verificar funcionamiento

Una vez reiniciado VS Code, deberías poder usar:

- `mcp_autonomous_ask` - Para hacer preguntas directas
- `mcp_autonomous_analyze_code` - Para analizar código
- `mcp_autonomous_health` - Para verificar el estado

## Uso

### Preguntar al Autonomous Copilot:
```
Usa la herramienta mcp_autonomous_ask para hablar con el autonomous copilot
```

### Analizar código:
```
Usa la herramienta mcp_autonomous_analyze_code para analizar este código: [tu código aquí]
```

### Verificar salud:
```
Usa la herramienta mcp_autonomous_health para verificar el estado
```

## Solución de problemas

### Si no funcionan las herramientas MCP:
1. Verifica que el archivo `.env` existe y tiene tu `OPENAI_API_KEY`
2. Verifica que las dependencias estén instaladas: `cd mcp && npm install`
3. Verifica que el servidor es ejecutable: `chmod +x mcp/mcp-autonomous-server.js`
4. Reinicia VS Code completamente
5. Verifica en la salida de VS Code que no hay errores de MCP

### Ver logs de MCP:
En VS Code, abre la Command Palette (Ctrl+Shift+P) y busca "MCP" para ver herramientas de debugging.
