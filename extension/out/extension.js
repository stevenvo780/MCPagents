"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const node_fetch_1 = __importDefault(require("node-fetch"));
const SERVER_URL = 'http://localhost:7088/jsonrpc';
const STATE_KEY = 'autonomousCopilot.state';
class AutonomousEngine {
    constructor(context) {
        this.context = context;
        this.isEnabled = false;
        console.log('🤖 AutonomousEngine constructor called');
        this.state = this.loadState();
        AutonomousEngine.instance = this;
        console.log('📊 AutonomousEngine state loaded:', this.state);
    }
    static getInstance() { return AutonomousEngine.instance; }
    async start() {
        if (this.isEnabled)
            return;
        this.isEnabled = true;
        this.state.isAnalyzing = true;
        this.saveState();
        // Análisis periódico
        const interval = vscode.workspace.getConfiguration('autonomousMcpHelper').get('analysisIntervalMs', 30000);
        this.analysisTimer = setInterval(() => this.analyzeProject(), interval);
        // Watchers de cambios
        this.fileWatcher = vscode.workspace.onDidSaveTextDocument(() => this.onFileChange());
        this.diagnosticWatcher = vscode.languages.onDidChangeDiagnostics(() => this.onDiagnosticsChange());
        // Análisis inicial
        setTimeout(() => this.analyzeProject(), 2000);
        DashboardProvider.instance?.updateState(this.state);
        vscode.window.showInformationMessage('🤖 Motor Autónomo activado');
    }
    stop() {
        if (!this.isEnabled)
            return;
        this.isEnabled = false;
        this.state.isAnalyzing = false;
        this.saveState();
        clearInterval(this.analysisTimer);
        this.fileWatcher?.dispose();
        this.diagnosticWatcher?.dispose();
        DashboardProvider.instance?.updateState(this.state);
        vscode.window.showInformationMessage('⏸️ Motor Autónomo pausado');
    }
    toggle() { this.isEnabled ? this.stop() : this.start(); }
    async onFileChange() {
        if (!this.isEnabled)
            return;
        // Debounce - analizar 3s después del último cambio
        clearTimeout(this.analysisTimer);
        this.analysisTimer = setTimeout(() => this.analyzeProject(), 3000);
    }
    async onDiagnosticsChange() {
        if (!this.isEnabled)
            return;
        // Analizar errores en tiempo real
        setTimeout(() => this.analyzeErrors(), 1000);
    }
    async analyzeProject() {
        if (!this.isEnabled)
            return;
        this.state.lastAnalysis = Date.now();
        this.state.sessionsCount++;
        try {
            const context = await ContextCollector.collect();
            const suggestions = await this.generateSuggestions(context);
            this.state.currentSuggestions = suggestions;
            this.saveState();
            DashboardProvider.instance?.updateSuggestions(suggestions);
            // Auto-aplicar fixes simples si está habilitado
            const autoApply = vscode.workspace.getConfiguration('autonomousMcpHelper').get('autoApplySimpleFixes', false);
            if (autoApply) {
                await this.autoApplySimpleFixes(suggestions);
            }
            // Notificaciones de sugerencias importantes
            const showNotifications = vscode.workspace.getConfiguration('autonomousMcpHelper').get('showNotifications', true);
            if (showNotifications) {
                this.showSuggestionNotifications(suggestions);
            }
        }
        catch (error) {
            console.error('Error en análisis:', error);
            DashboardProvider.instance?.pushLog('error', `Error en análisis: ${error.message}`);
        }
    }
    async analyzeErrors() {
        const diagnostics = vscode.languages.getDiagnostics();
        const errors = [];
        for (const [uri, diags] of diagnostics) {
            for (const diag of diags) {
                if (diag.severity === vscode.DiagnosticSeverity.Error) {
                    errors.push(`${uri.fsPath}:${diag.range.start.line}: ${diag.message}`);
                }
            }
        }
        if (errors.length > 0) {
            DashboardProvider.instance?.updateErrors(errors);
        }
    }
    async generateSuggestions(context) {
        const temperature = vscode.workspace.getConfiguration('autonomousMcpHelper').get('temperature', 0.3);
        const prompt = `
Analiza este proyecto y genera sugerencias específicas para mejorar el código.
Contexto del proyecto:
${JSON.stringify(context, null, 2)}

Genera sugerencias en este formato JSON:
{
  "suggestions": [
    {
      "type": "fix|improvement|feature|test",
      "title": "Título conciso",
      "description": "Descripción detallada",
      "code": "código específico si aplica",
      "filePath": "ruta del archivo si aplica",
      "priority": 1-10
    }
  ]
}

Prioriza correcciones de errores, mejoras de rendimiento, y tests faltantes.
`;
        try {
            const result = await this.callMcp('mcp.openai.ask', { prompt, temperature, context: JSON.stringify(context).slice(0, 8000) });
            const parsed = JSON.parse(result.answer);
            return parsed.suggestions.map((s, i) => ({
                id: `${Date.now()}-${i}`,
                type: s.type || 'improvement',
                title: s.title || 'Sugerencia',
                description: s.description || '',
                code: s.code,
                filePath: s.filePath,
                priority: s.priority || 5,
                timestamp: Date.now(),
                applied: false
            }));
        }
        catch (error) {
            console.error('Error generando sugerencias:', error);
            return [];
        }
    }
    async autoApplySimpleFixes(suggestions) {
        const simpleFixes = suggestions.filter(s => s.type === 'fix' &&
            s.priority >= 8 &&
            s.code &&
            s.filePath &&
            (s.title.includes('import') || s.title.includes('format') || s.title.includes('typo')));
        for (const fix of simpleFixes) {
            try {
                await ActionEngine.applySuggestion(fix);
                fix.applied = true;
                this.state.suggestionsApplied++;
                DashboardProvider.instance?.pushLog('info', `Auto-aplicado: ${fix.title}`);
            }
            catch (error) {
                console.error('Error auto-aplicando fix:', error);
            }
        }
    }
    showSuggestionNotifications(suggestions) {
        const highPriority = suggestions.filter(s => s.priority >= 8);
        for (const suggestion of highPriority.slice(0, 2)) { // Max 2 notificaciones
            vscode.window.showInformationMessage(`💡 ${suggestion.title}`, 'Ver Dashboard', 'Aplicar').then(action => {
                if (action === 'Ver Dashboard') {
                    vscode.commands.executeCommand('autonomousMcpDashboard.focus');
                }
                else if (action === 'Aplicar') {
                    ActionEngine.applySuggestion(suggestion);
                }
            });
        }
    }
    async callMcp(method, params) {
        const body = { jsonrpc: '2.0', id: Date.now(), method, params };
        const resp = await (0, node_fetch_1.default)(SERVER_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        if (!resp.ok)
            throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json();
        if (data.error)
            throw new Error(data.error.message || 'Error MCP');
        return data.result;
    }
    loadState() {
        return this.context.globalState.get(STATE_KEY, {
            isAnalyzing: false,
            lastAnalysis: 0,
            sessionsCount: 0,
            suggestionsApplied: 0,
            errorsFixed: 0,
            currentSuggestions: []
        });
    }
    saveState() {
        this.context.globalState.update(STATE_KEY, this.state);
    }
    getState() { return this.state; }
}
class ContextCollector {
    static async collect() {
        const editor = vscode.window.activeTextEditor;
        const workspace = vscode.workspace.workspaceFolders?.[0];
        const context = {
            activeFile: editor ? {
                path: editor.document.fileName,
                content: editor.document.getText().slice(0, 10000),
                language: editor.document.languageId,
                hasErrors: vscode.languages.getDiagnostics(editor.document.uri).some(d => d.severity === vscode.DiagnosticSeverity.Error)
            } : null,
            workspace: workspace ? {
                name: workspace.name,
                path: workspace.uri.fsPath
            } : null,
            errors: this.collectErrors(),
            recentFiles: await this.getRecentFiles(),
            gitStatus: await this.getGitStatus(),
            projectStructure: await this.getProjectStructure()
        };
        return context;
    }
    static collectErrors() {
        const diagnostics = vscode.languages.getDiagnostics();
        const errors = [];
        for (const [uri, diags] of diagnostics) {
            for (const diag of diags) {
                if (diag.severity <= vscode.DiagnosticSeverity.Warning) {
                    errors.push({
                        file: uri.fsPath,
                        line: diag.range.start.line,
                        message: diag.message,
                        severity: diag.severity
                    });
                }
            }
        }
        return errors.slice(0, 20); // Limitar a 20 errores
    }
    static async getRecentFiles() {
        // Simplificado - podrías usar extensiones como git history
        return [];
    }
    static async getGitStatus() {
        try {
            const gitExtension = vscode.extensions.getExtension('vscode.git')?.exports;
            if (gitExtension) {
                const repo = gitExtension.getRepository(vscode.workspace.workspaceFolders?.[0]?.uri);
                if (repo) {
                    return {
                        branch: repo.state.HEAD?.name || 'unknown',
                        changes: repo.state.workingTreeChanges.length,
                        staged: repo.state.indexChanges.length
                    };
                }
            }
        }
        catch (error) {
            console.error('Error getting git status:', error);
        }
        return null;
    }
    static async getProjectStructure() {
        const workspace = vscode.workspace.workspaceFolders?.[0];
        if (!workspace)
            return null;
        try {
            const files = await vscode.workspace.findFiles('**/*.{js,ts,py,json,md}', '**/node_modules/**', 20);
            return {
                totalFiles: files.length,
                types: this.categorizeFiles(files)
            };
        }
        catch (error) {
            return null;
        }
    }
    static categorizeFiles(files) {
        const types = {};
        files.forEach(file => {
            const ext = file.fsPath.split('.').pop() || 'unknown';
            types[ext] = (types[ext] || 0) + 1;
        });
        return types;
    }
}
class ActionEngine {
    static async applySuggestion(suggestion) {
        if (!suggestion.code || !suggestion.filePath) {
            throw new Error('Sugerencia sin código o archivo especificado');
        }
        try {
            const uri = vscode.Uri.file(suggestion.filePath);
            const document = await vscode.workspace.openTextDocument(uri);
            const edit = new vscode.WorkspaceEdit();
            // Aplicar al final del archivo por simplicidad
            // En una implementación real, sería más inteligente
            const lastLine = document.lineCount - 1;
            const lastCharacter = document.lineAt(lastLine).text.length;
            edit.insert(uri, new vscode.Position(lastLine, lastCharacter), `\n\n// Auto-sugerido: ${suggestion.title}\n${suggestion.code}\n`);
            await vscode.workspace.applyEdit(edit);
            vscode.window.showInformationMessage(`✅ Aplicado: ${suggestion.title}`);
            const engine = AutonomousEngine.getInstance();
            const state = engine.getState();
            state.suggestionsApplied++;
        }
        catch (error) {
            vscode.window.showErrorMessage(`Error aplicando sugerencia: ${error.message}`);
            throw error;
        }
    }
}
class DashboardProvider {
    constructor(context) {
        this.context = context;
        this.logs = [];
        console.log('🏗️ DashboardProvider constructor called');
        DashboardProvider.instance = this;
    }
    resolveWebviewView(webviewView) {
        console.log('🎨 DashboardProvider resolveWebviewView called');
        this._view = webviewView;
        webviewView.webview.options = { enableScripts: true };
        webviewView.webview.onDidReceiveMessage(msg => this.handleMessage(msg));
        this.render();
        console.log('✅ DashboardProvider webview resolved');
    }
    handleMessage(msg) {
        const engine = AutonomousEngine.getInstance();
        switch (msg?.type) {
            case 'toggle':
                engine.toggle();
                break;
            case 'manualRun':
                engine.analyzeProject();
                break;
            case 'applySuggestion':
                const suggestion = engine.getState().currentSuggestions.find(s => s.id === msg.id);
                if (suggestion)
                    ActionEngine.applySuggestion(suggestion);
                break;
            case 'updateConfig':
                this.updateConfiguration(msg.config);
                break;
        }
    }
    async updateConfiguration(config) {
        const vscodeConfig = vscode.workspace.getConfiguration('autonomousMcpHelper');
        for (const [key, value] of Object.entries(config)) {
            try {
                await vscodeConfig.update(key, value, vscode.ConfigurationTarget.Global);
            }
            catch (error) {
                console.error(`Error updating config ${key}:`, error);
            }
        }
        this.pushLog('info', 'Configuración actualizada');
        this.render();
    }
    updateState(state) {
        this.postMessage({ type: 'stateUpdate', state });
    }
    updateSuggestions(suggestions) {
        this.postMessage({ type: 'suggestionsUpdate', suggestions });
    }
    updateErrors(errors) {
        this.postMessage({ type: 'errorsUpdate', errors });
    }
    pushLog(level, message) {
        this.logs.unshift({ level, message, timestamp: Date.now() });
        if (this.logs.length > 50)
            this.logs = this.logs.slice(0, 50);
        this.postMessage({ type: 'logUpdate', logs: this.logs.slice(0, 10) });
    }
    postMessage(msg) {
        this._view?.webview.postMessage(msg);
    }
    render() {
        if (!this._view)
            return;
        const config = vscode.workspace.getConfiguration('autonomousMcpHelper');
        const state = AutonomousEngine.getInstance()?.getState() || {};
        this._view.webview.html = `<!DOCTYPE html>
<html><head><meta charset='utf-8'>
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; margin: 0; padding: 12px; font-size: 13px; }
  .header { display: flex; align-items: center; gap: 8px; margin-bottom: 16px; }
  .status { padding: 4px 8px; border-radius: 12px; font-size: 11px; font-weight: 600; }
  .status.active { background: #10b981; color: white; }
  .status.inactive { background: #6b7280; color: white; }
  .metrics { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; margin-bottom: 16px; }
  .metric { background: var(--vscode-editor-background); border: 1px solid var(--vscode-editorWidget-border); border-radius: 6px; padding: 8px; text-align: center; }
  .metric-value { font-size: 18px; font-weight: bold; color: var(--vscode-charts-blue); }
  .metric-label { font-size: 10px; opacity: 0.7; margin-top: 2px; }
  .section { margin-bottom: 16px; }
  .section-title { font-weight: 600; margin-bottom: 8px; font-size: 12px; }
  .suggestion { background: var(--vscode-editor-background); border: 1px solid var(--vscode-editorWidget-border); border-radius: 4px; padding: 8px; margin-bottom: 6px; }
  .suggestion-title { font-weight: 600; font-size: 12px; }
  .suggestion-desc { font-size: 11px; opacity: 0.8; margin: 4px 0; }
  .suggestion-actions { display: flex; gap: 4px; margin-top: 6px; }
  .btn { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; border-radius: 3px; padding: 4px 8px; font-size: 10px; cursor: pointer; }
  .btn:hover { background: var(--vscode-button-hoverBackground); }
  .btn-secondary { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
  .config-grid { display: grid; gap: 8px; }
  .config-item { display: flex; align-items: center; gap: 8px; }
  .config-item label { flex: 1; font-size: 11px; }
  .config-item input { width: 80px; }
  .logs { max-height: 120px; overflow-y: auto; }
  .log { font-size: 10px; padding: 2px 0; border-bottom: 1px solid var(--vscode-editorWidget-border); }
  .log.error { color: var(--vscode-errorForeground); }
  .log.info { color: var(--vscode-charts-green); }
  .priority { padding: 2px 4px; border-radius: 2px; font-size: 9px; font-weight: bold; }
  .priority-high { background: #ef4444; color: white; }
  .priority-medium { background: #f59e0b; color: white; }
  .priority-low { background: #6b7280; color: white; }
</style>
</head><body>
  <div class="header">
    <h3 style="margin:0; flex:1;">🤖 Autonomous Copilot</h3>
    <div class="status ${state.isAnalyzing ? 'active' : 'inactive'}" id="status">
      ${state.isAnalyzing ? 'ACTIVO' : 'PAUSADO'}
    </div>
  </div>

  <div class="metrics">
    <div class="metric">
      <div class="metric-value" id="sessionsCount">${state.sessionsCount || 0}</div>
      <div class="metric-label">Sesiones</div>
    </div>
    <div class="metric">
      <div class="metric-value" id="suggestionsApplied">${state.suggestionsApplied || 0}</div>
      <div class="metric-label">Aplicadas</div>
    </div>
    <div class="metric">
      <div class="metric-value" id="errorsFixed">${state.errorsFixed || 0}</div>
      <div class="metric-label">Errores</div>
    </div>
    <div class="metric">
      <div class="metric-value" id="lastAnalysis">${state.lastAnalysis ? new Date(state.lastAnalysis).toLocaleTimeString() : 'N/A'}</div>
      <div class="metric-label">Último</div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Controles</div>
    <div style="display: flex; gap: 6px;">
      <button class="btn" onclick="send('toggle')">${state.isAnalyzing ? 'Pausar' : 'Iniciar'}</button>
      <button class="btn btn-secondary" onclick="send('manualRun')">Analizar Ahora</button>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Configuración</div>
    <div class="config-grid">
      <div class="config-item">
        <label>Intervalo (min)</label>
        <input type="number" id="interval" value="${(config.get('analysisIntervalMs') || 30000) / 60000}" min="0.5" step="0.5">
      </div>
      <div class="config-item">
        <label>Contexto</label>
        <input type="number" id="contextLines" value="${config.get('contextLines') || 500}" min="100" step="50">
      </div>
      <div class="config-item">
        <label>Temperatura</label>
        <input type="range" id="temperature" value="${config.get('temperature') || 0.3}" min="0" max="1" step="0.1">
        <span id="tempValue">${config.get('temperature') || 0.3}</span>
      </div>
      <div class="config-item">
        <label>Auto-aplicar</label>
        <input type="checkbox" id="autoApply" ${config.get('autoApplySimpleFixes') ? 'checked' : ''}>
      </div>
    </div>
    <button class="btn" onclick="saveConfig()" style="margin-top: 8px;">Guardar</button>
  </div>

  <div class="section">
    <div class="section-title">Sugerencias Activas (<span id="suggestionsCount">0</span>)</div>
    <div id="suggestions"></div>
  </div>

  <div class="section">
    <div class="section-title">Logs</div>
    <div class="logs" id="logs"></div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    function send(type, data) { vscode.postMessage({ type, ...data }); }
    
    function saveConfig() {
      const config = {
        analysisIntervalMs: parseFloat(document.getElementById('interval').value) * 60000,
        contextLines: parseInt(document.getElementById('contextLines').value),
        temperature: parseFloat(document.getElementById('temperature').value),
        autoApplySimpleFixes: document.getElementById('autoApply').checked
      };
      send('updateConfig', { config });
    }

    function applySuggestion(id) { send('applySuggestion', { id }); }

    document.getElementById('temperature').oninput = function() {
      document.getElementById('tempValue').textContent = this.value;
    };

    window.addEventListener('message', event => {
      const { type, state, suggestions, errors, logs } = event.data;
      
      if (type === 'stateUpdate') {
        document.getElementById('status').textContent = state.isAnalyzing ? 'ACTIVO' : 'PAUSADO';
        document.getElementById('status').className = 'status ' + (state.isAnalyzing ? 'active' : 'inactive');
        document.getElementById('sessionsCount').textContent = state.sessionsCount || 0;
        document.getElementById('suggestionsApplied').textContent = state.suggestionsApplied || 0;
        document.getElementById('errorsFixed').textContent = state.errorsFixed || 0;
        document.getElementById('lastAnalysis').textContent = state.lastAnalysis ? new Date(state.lastAnalysis).toLocaleTimeString() : 'N/A';
      }
      
      if (type === 'suggestionsUpdate') {
        document.getElementById('suggestionsCount').textContent = suggestions.length;
        const container = document.getElementById('suggestions');
        container.innerHTML = suggestions.map(s => \`
          <div class="suggestion">
            <div class="suggestion-title">
              \${s.title}
              <span class="priority priority-\${s.priority >= 8 ? 'high' : s.priority >= 5 ? 'medium' : 'low'}">\${s.priority}</span>
            </div>
            <div class="suggestion-desc">\${s.description}</div>
            <div class="suggestion-actions">
              <button class="btn" onclick="applySuggestion('\${s.id}')">Aplicar</button>
              <button class="btn btn-secondary">Ver Código</button>
            </div>
          </div>
        \`).join('');
      }
      
      if (type === 'logUpdate') {
        const container = document.getElementById('logs');
        container.innerHTML = logs.map(l => \`
          <div class="log \${l.level}">[\${new Date(l.timestamp).toLocaleTimeString()}] \${l.message}</div>
        \`).join('');
      }
    });
  </script>
</body></html>`;
    }
}
DashboardProvider.viewId = 'autonomousMcpDashboard';
function activate(context) {
    console.log('🚀 Autonomous MCP Helper activating...');
    const engine = new AutonomousEngine(context);
    const dashboardProvider = new DashboardProvider(context);
    // Comandos
    const manualRunCmd = vscode.commands.registerCommand('autonomousMcpHelper.manualRun', () => {
        console.log('📋 Manual run command executed');
        engine.analyzeProject();
    });
    const toggleCmd = vscode.commands.registerCommand('autonomousMcpHelper.toggleEngine', () => {
        console.log('🔄 Toggle engine command executed');
        engine.toggle();
    });
    // Vista
    const viewProvider = vscode.window.registerWebviewViewProvider(DashboardProvider.viewId, dashboardProvider);
    console.log('📊 Dashboard provider registered with ID:', DashboardProvider.viewId);
    context.subscriptions.push(manualRunCmd, toggleCmd, viewProvider);
    // Auto-start si está habilitado
    const enabled = vscode.workspace.getConfiguration('autonomousMcpHelper').get('enabled', true);
    console.log('⚙️ Auto-start enabled:', enabled);
    if (enabled) {
        setTimeout(() => {
            console.log('🎯 Starting autonomous engine...');
            engine.start();
        }, 1000);
    }
    console.log('✅ Autonomous MCP Helper activated successfully');
}
function deactivate() {
    AutonomousEngine.getInstance()?.stop();
}
