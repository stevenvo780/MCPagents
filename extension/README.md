# Autonomous MCP Helper

Extensión VS Code que invoca un servidor MCP (JSON-RPC) para generar el siguiente paso de desarrollo de forma autónoma.

## Uso
1. Inicia el servidor MCP (en carpeta `mcp/`):
   ```bash
   cd mcp && npm install && npm start
   ```
2. Compila / instala dependencias de la extensión (ya hecho normalmente):
   ```bash
   cd extension && npm install
   ```
3. Ejecuta la extensión en modo debug (F5) o instala el `.vsix` empaquetado.
4. Comando: `Autonomous MCP: Run Autopilot` (Command Palette) abre un documento con el siguiente paso sugerido.

## Variables de entorno
- `MCP_AUTOPILOT_URL` (opcional) URL del endpoint JSON-RPC (default: `http://localhost:7088/jsonrpc`).

## Notas
- No almacena datos sensibles.
- Requiere que el servidor MCP esté accesible antes de ejecutar el comando.
