#!/bin/bash

echo "🔍 Verificando instalación de la extensión..."

# Desinstalar versión anterior si existe
code --uninstall-extension local.autonomous-mcp-helper 2>/dev/null || true

echo "📦 Instalando nueva versión..."
code --install-extension autonomous-mcp-helper-0.0.7.vsix

echo "🎯 Instrucciones para verificar el panel:"
echo ""
echo "1. Abre VS Code"
echo "2. Ve a la barra lateral izquierda"
echo "3. Busca el ícono 'Autonomous Copilot' (debería aparecer con un ícono verde)"
echo "4. Haz clic en él para abrir el panel 'Dashboard'"
echo "5. Si no aparece, ve a Ver > Comando > 'Developer: Reload Window'"
echo "6. Para ver logs: Ver > Output > selecciona 'Log (Extension Host)'"
echo ""
echo "🐛 Para debugear:"
echo "- Abre DevTools: Ayuda > Toggle Developer Tools"
echo "- Ve a Console para ver los logs que agregamos"
echo ""
echo "✅ Instalación completada"
