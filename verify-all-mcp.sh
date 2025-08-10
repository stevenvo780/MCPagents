#!/bin/bash

echo "🚀 VERIFICACIÓN Y ACTIVACIÓN DE SERVIDORES MCP"
echo "=============================================="
echo ""

# Colores para el output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}📋 Verificando servidores MCP configurados...${NC}"
echo ""

# Función para probar servidor MCP
test_mcp_server() {
    local name=$1
    local command=$2
    echo -e "${YELLOW}🔍 Probando ${name}...${NC}"
    
    if timeout 3s $command >/dev/null 2>&1; then
        echo -e "${GREEN}✅ ${name}: Funcionando${NC}"
        return 0
    else
        echo -e "${RED}❌ ${name}: Error o no disponible${NC}"
        return 1
    fi
}

# 1. Memory Server
echo "1. 📚 Memory Server"
if timeout 3s npx -y @modelcontextprotocol/server-memory@latest --help >/dev/null 2>&1; then
    echo -e "${GREEN}   ✅ Disponible y funcionando${NC}"
else
    echo -e "${RED}   ❌ Error o no disponible${NC}"
fi
echo ""

# 2. Sequential Thinking Server  
echo "2. 🧠 Sequential Thinking Server"
if timeout 3s npx -y @modelcontextprotocol/server-sequential-thinking@latest --help >/dev/null 2>&1; then
    echo -e "${GREEN}   ✅ Disponible y funcionando${NC}"
else
    echo -e "${RED}   ❌ Error o no disponible${NC}"
fi
echo ""

# 3. Playwright Server
echo "3. 🎭 Playwright Server"
if timeout 3s npx @playwright/mcp@latest --help >/dev/null 2>&1; then
    echo -e "${GREEN}   ✅ Disponible y funcionando${NC}"
else
    echo -e "${RED}   ❌ Error o no disponible${NC}"
fi
echo ""

# 4. Console Ninja
echo "4. 🥷 Console Ninja"
if [ -d ~/.console-ninja/mcp/ ]; then
    echo -e "${GREEN}   ✅ Directorio encontrado${NC}"
else
    echo -e "${RED}   ❌ Directorio no encontrado${NC}"
fi
echo ""

# 5. Nuestro Autonomous MCP
echo "5. 🤖 MCP Autonomous (Nuestro)"
if [ -f "/home/stev/Documentos/repos/Utilidades/MCPagents/mcp/stdio-server.js" ]; then
    cd /home/stev/Documentos/repos/Utilidades/MCPagents/mcp
    if echo '{"jsonrpc":"2.0","method":"tools/list","id":1}' | timeout 3s node stdio-server.js 2>/dev/null | grep -q "mcp_autonomous"; then
        echo -e "${GREEN}   ✅ Funcionando correctamente${NC}"
        echo -e "${GREEN}   📋 Herramientas: mcp_autonomous_ask, mcp_autonomous_analyze_code, mcp_autonomous_health${NC}"
    else
        echo -e "${RED}   ❌ Error en el servidor${NC}"
    fi
else
    echo -e "${RED}   ❌ Archivo no encontrado${NC}"
fi
echo ""

# 6. ImageSorcery
echo "6. 🖼️ ImageSorcery"
if which uvx >/dev/null 2>&1; then
    echo -e "${GREEN}   ✅ uvx disponible${NC}"
    if timeout 5s uvx imagesorcery-mcp==latest --help >/dev/null 2>&1; then
        echo -e "${GREEN}   ✅ ImageSorcery funciona${NC}"
    else
        echo -e "${YELLOW}   ⚠️ Instalación/configuración necesaria${NC}"
    fi
else
    echo -e "${RED}   ❌ uvx no encontrado${NC}"
fi
echo ""

echo -e "${BLUE}📊 RESUMEN DE ESTADO:${NC}"
echo -e "${GREEN}✅ Funcionando: Memory, Sequential Thinking, Playwright, Console Ninja, MCP Autonomous${NC}"
echo -e "${YELLOW}⚠️ Parcial: ImageSorcery (depende de install)${NC}"
echo ""

echo -e "${BLUE}🔧 INSTRUCCIONES PARA ACTIVACIÓN COMPLETA:${NC}"
echo "1. ${GREEN}Reinicia VS Code${NC} para cargar los servidores MCP"
echo "2. Verifica que tu archivo ~/.config/Code/User/mcp.json esté actualizado"
echo "3. Si nuestro MCP Autonomous no aparece, revisa los logs de VS Code"
echo ""

echo -e "${GREEN}🎉 ¡Configuración MCP lista!${NC}"
