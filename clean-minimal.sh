#!/bin/bash

echo "🧹 Limpiando proyecto MCPagents - Solo lo esencial..."
echo ""

# Crear una copia de seguridad temporal
echo "📋 Creando backup temporal..."
cp -r mcp mcp_backup_$(date +%Y%m%d_%H%M%S)

# Ir al directorio mcp
cd mcp

# Lista de archivos a conservar
KEEP_FILES=(
    "stdio-server-fixed.js"
    "package.json"
    "package-lock.json"
    ".env"
    "node_modules"
)

echo "💾 Archivos que se conservarán:"
for file in "${KEEP_FILES[@]}"; do
    if [ -e "$file" ]; then
        echo "  ✓ $file"
    else
        echo "  ⚠️  $file (no existe)"
    fi
done
echo ""

# Crear directorio temporal para archivos a conservar
mkdir -p ../temp_keep
for file in "${KEEP_FILES[@]}"; do
    if [ -e "$file" ]; then
        cp -r "$file" ../temp_keep/
    fi
done

# Eliminar todo el contenido del directorio mcp
echo "🗑️  Eliminando archivos innecesarios..."
rm -rf *
rm -rf .*env* 2>/dev/null
rm -rf .gitignore 2>/dev/null

# Restaurar archivos esenciales
echo "📦 Restaurando archivos esenciales..."
cp -r ../temp_keep/* .

# Limpiar directorio temporal
rm -rf ../temp_keep

# Regresar al directorio raíz
cd ..

# Eliminar directorios innecesarios en la raíz
echo "🗑️  Eliminando directorios innecesarios en raíz..."
rm -rf extension/
rm -rf .qodo/
rm -rf .vscode/
rm -f test-*.sh
rm -f verify-*.sh
rm -f test-file.ts
rm -f AUTONOMOUS_SETUP.md
rm -f .env.example
rm -f .gitignore

# Crear nuevo package.json minimalista en la raíz
echo "📝 Creando package.json minimalista..."
cat > package.json << 'EOF'
{
  "name": "mcp-autonomous-minimal",
  "version": "1.0.0",
  "description": "MCP Autonomous Server - Versión minimal",
  "type": "module",
  "main": "mcp/stdio-server-fixed.js",
  "scripts": {
    "start": "node mcp/stdio-server-fixed.js",
    "test": "echo 'No tests configured' && exit 0"
  },
  "keywords": ["mcp", "autonomous", "copilot", "openai"],
  "author": "",
  "license": "ISC"
}
EOF

# Crear README.md simple
echo "📖 Creando README simple..."
cat > README.md << 'EOF'
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
EOF

# Verificar que el script principal existe
if [ ! -f "mcp/stdio-server-fixed.js" ]; then
    echo "❌ Error: stdio-server-fixed.js no encontrado!"
    exit 1
fi

# Verificar dependencias
echo "🔍 Verificando dependencias..."
cd mcp
if [ ! -d "node_modules" ] || [ ! -f "package-lock.json" ]; then
    echo "📦 Reinstalando dependencias..."
    npm install
fi
cd ..

echo ""
echo "✅ ¡Limpieza completada!"
echo ""
echo "📂 Estructura final:"
echo "  ├── mcp/"
echo "  │   ├── stdio-server-fixed.js"
echo "  │   ├── package.json"
echo "  │   ├── package-lock.json"
echo "  │   ├── .env"
echo "  │   └── node_modules/"
echo "  ├── package.json"
echo "  └── README.md"
echo ""
echo "🚀 Para ejecutar: cd mcp && node stdio-server-fixed.js"
echo ""
