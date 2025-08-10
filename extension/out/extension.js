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
        const startTime = Date.now();
        this.addHistoryEntry({
            timestamp: startTime,
            type: 'analysis',
            description: 'Iniciando análisis automático del proyecto'
        });
        try {
            const context = await ContextCollector.collect();
            const suggestions = await this.generateSuggestions(context);
            this.state.currentSuggestions = suggestions;
            this.saveState();
            DashboardProvider.instance?.updateSuggestions(suggestions);
            this.addHistoryEntry({
                timestamp: Date.now(),
                type: 'analysis',
                description: `Análisis completado: ${suggestions.length} sugerencias generadas`,
                success: true,
                details: { suggestionsCount: suggestions.length, duration: Date.now() - startTime }
            });
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
            this.addHistoryEntry({
                timestamp: Date.now(),
                type: 'error',
                description: `Error en análisis: ${error.message}`,
                success: false,
                details: error
            });
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
            currentSuggestions: [],
            history: []
        });
    }
    saveState() {
        this.context.globalState.update(STATE_KEY, this.state);
    }
    addHistoryEntry(entry) {
        this.state.history.push(entry);
        // Keep only last 100 entries
        if (this.state.history.length > 100) {
            this.state.history = this.state.history.slice(-100);
        }
        this.saveState();
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
// History Provider para la vista de historial
class HistoryProvider {
    constructor(context) {
        this.context = context;
    }
    resolveWebviewView(webviewView, context, _token) {
        this._view = webviewView;
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this.context.extensionUri]
        };
        this.updateContent();
        webviewView.webview.onDidReceiveMessage(data => {
            switch (data.type) {
                case 'exportHistory':
                    this.exportHistory();
                    break;
                case 'clearHistory':
                    this.clearHistory();
                    break;
            }
        });
    }
    updateContent() {
        if (!this._view)
            return;
        const engine = AutonomousEngine.getInstance();
        const state = engine?.getState();
        const history = state?.history || [];
        this._view.webview.html = this.getHistoryHtml(history);
    }
    async exportHistory() {
        const engine = AutonomousEngine.getInstance();
        const state = engine?.getState();
        const history = state?.history || [];
        const jsonData = JSON.stringify(history, null, 2);
        const document = await vscode.workspace.openTextDocument({
            content: jsonData,
            language: 'json'
        });
        vscode.window.showTextDocument(document);
    }
    clearHistory() {
        const engine = AutonomousEngine.getInstance();
        if (engine) {
            const state = engine.getState();
            state.history = [];
            engine.addHistoryEntry({
                timestamp: Date.now(),
                type: 'application',
                description: 'Historial limpiado',
                success: true
            });
            this.updateContent();
        }
    }
    getHistoryHtml(history) {
        return `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Historial</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            line-height: var(--vscode-font-weight);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            margin: 0;
            padding: 10px;
        }
        .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 15px;
            border-bottom: 1px solid var(--vscode-widget-border);
            padding-bottom: 10px;
        }
        .controls {
            display: flex;
            gap: 5px;
        }
        button {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 5px 10px;
            border-radius: 3px;
            cursor: pointer;
            font-size: 11px;
        }
        button:hover {
            background: var(--vscode-button-hoverBackground);
        }
        .history-item {
            margin-bottom: 10px;
            padding: 8px;
            border-radius: 3px;
            border-left: 3px solid var(--vscode-textLink-foreground);
        }
        .history-item.analysis { border-left-color: #4CAF50; }
        .history-item.suggestion { border-left-color: #2196F3; }
        .history-item.application { border-left-color: #FF9800; }
        .history-item.error { border-left-color: #F44336; }
        .timestamp {
            font-size: 10px;
            color: var(--vscode-descriptionForeground);
            margin-bottom: 2px;
        }
        .description {
            font-weight: 500;
            margin-bottom: 3px;
        }
        .details {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
        }
        .success { color: #4CAF50; }
        .failed { color: #F44336; }
        .empty {
            text-align: center;
            color: var(--vscode-descriptionForeground);
            font-style: italic;
            margin-top: 50px;
        }
    </style>
</head>
<body>
    <div class="header">
        <h3>Historial de Actividades</h3>
        <div class="controls">
            <button onclick="exportHistory()">Exportar</button>
            <button onclick="clearHistory()">Limpiar</button>
        </div>
    </div>
    
    <div class="history-list">
        ${history.length === 0 ?
            '<div class="empty">No hay actividades registradas</div>' :
            history.slice().reverse().map(entry => `
            <div class="history-item ${entry.type}">
                <div class="timestamp">${new Date(entry.timestamp).toLocaleString()}</div>
                <div class="description">${entry.description}</div>
                ${entry.file ? `<div class="details">Archivo: ${entry.file}</div>` : ''}
                ${entry.success !== undefined ?
                `<div class="details ${entry.success ? 'success' : 'failed'}">
                    ${entry.success ? '✅ Éxito' : '❌ Error'}
                  </div>` : ''}
                ${entry.details ?
                `<div class="details">Detalles: ${JSON.stringify(entry.details)}</div>` : ''}
            </div>
          `).join('')}
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        
        function exportHistory() {
            vscode.postMessage({ type: 'exportHistory' });
        }
        
        function clearHistory() {
            if (confirm('¿Estás seguro de que quieres limpiar todo el historial?')) {
                vscode.postMessage({ type: 'clearHistory' });
            }
        }
    </script>
</body>
</html>`;
    }
}
HistoryProvider.viewId = 'autonomousMcpHistory';
// Settings Provider para la vista de configuración
class SettingsProvider {
    constructor(context) {
        this.context = context;
    }
    resolveWebviewView(webviewView, context, _token) {
        this._view = webviewView;
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this.context.extensionUri]
        };
        this.updateContent();
        webviewView.webview.onDidReceiveMessage(data => {
            switch (data.type) {
                case 'updateSettings':
                    this.updateSettings(data.settings);
                    break;
                case 'resetSettings':
                    this.resetSettings();
                    break;
                case 'testConnection':
                    this.testOpenAIConnection();
                    break;
            }
        });
    }
    updateContent() {
        if (!this._view)
            return;
        this._view.webview.html = this.getSettingsHtml();
    }
    async updateSettings(settings) {
        const config = vscode.workspace.getConfiguration('autonomousMcpHelper');
        for (const [key, value] of Object.entries(settings)) {
            await config.update(key, value, vscode.ConfigurationTarget.Global);
        }
        vscode.window.showInformationMessage('⚙️ Configuración actualizada');
        this.updateContent();
    }
    async resetSettings() {
        const config = vscode.workspace.getConfiguration('autonomousMcpHelper');
        const keys = [
            'enabled', 'openaiApiKey', 'openaiModel', 'maxTokens',
            'analysisIntervalMs', 'contextLines', 'autoApplySimpleFixes',
            'showNotifications', 'temperature'
        ];
        for (const key of keys) {
            await config.update(key, undefined, vscode.ConfigurationTarget.Global);
        }
        vscode.window.showInformationMessage('🔄 Configuración restablecida a valores por defecto');
        this.updateContent();
    }
    async testOpenAIConnection() {
        try {
            const config = vscode.workspace.getConfiguration('autonomousMcpHelper');
            const apiKey = config.get('openaiApiKey');
            if (!apiKey) {
                vscode.window.showWarningMessage('⚠️ API Key de OpenAI no configurada');
                return;
            }
            const response = await (0, node_fetch_1.default)(SERVER_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    id: 1,
                    method: 'openaiAsk',
                    params: { question: 'test connection' }
                })
            });
            if (response.ok) {
                vscode.window.showInformationMessage('✅ Conexión con OpenAI exitosa');
            }
            else {
                vscode.window.showErrorMessage('❌ Error al conectar con OpenAI');
            }
        }
        catch (error) {
            vscode.window.showErrorMessage(`❌ Error: ${error}`);
        }
    }
    getSettingsHtml() {
        const config = vscode.workspace.getConfiguration('autonomousMcpHelper');
        return `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Configuración</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            margin: 0;
            padding: 10px;
        }
        .header {
            margin-bottom: 20px;
            border-bottom: 1px solid var(--vscode-widget-border);
            padding-bottom: 10px;
        }
        .section {
            margin-bottom: 20px;
            padding: 10px;
            border: 1px solid var(--vscode-widget-border);
            border-radius: 3px;
        }
        .section-title {
            font-weight: bold;
            margin-bottom: 10px;
            color: var(--vscode-textLink-foreground);
        }
        .field {
            margin-bottom: 10px;
        }
        label {
            display: block;
            margin-bottom: 3px;
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
        }
        input, select {
            width: 100%;
            padding: 4px 6px;
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 2px;
            font-size: 11px;
        }
        input[type="checkbox"] {
            width: auto;
            margin-right: 5px;
        }
        button {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 6px 12px;
            border-radius: 3px;
            cursor: pointer;
            font-size: 11px;
            margin-right: 5px;
        }
        button:hover {
            background: var(--vscode-button-hoverBackground);
        }
        button.secondary {
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }
        .controls {
            margin-top: 20px;
            padding-top: 10px;
            border-top: 1px solid var(--vscode-widget-border);
        }
    </style>
</head>
<body>
    <div class="header">
        <h3>Configuración Avanzada</h3>
    </div>
    
    <div class="section">
        <div class="section-title">🤖 OpenAI</div>
        <div class="field">
            <label>API Key</label>
            <input type="password" id="openaiApiKey" value="${config.get('openaiApiKey') || ''}" placeholder="sk-...">
        </div>
        <div class="field">
            <label>Modelo</label>
            <select id="openaiModel">
                <option value="gpt-4" ${config.get('openaiModel') === 'gpt-4' ? 'selected' : ''}>GPT-4</option>
                <option value="gpt-4-turbo" ${config.get('openaiModel') === 'gpt-4-turbo' ? 'selected' : ''}>GPT-4 Turbo</option>
                <option value="gpt-3.5-turbo" ${config.get('openaiModel') === 'gpt-3.5-turbo' ? 'selected' : ''}>GPT-3.5 Turbo</option>
            </select>
        </div>
        <div class="field">
            <label>Temperatura (0.0 = Preciso, 1.0 = Creativo)</label>
            <input type="range" id="temperature" min="0" max="1" step="0.1" value="${config.get('temperature') || 0.3}">
            <span id="tempValue">${config.get('temperature') || 0.3}</span>
        </div>
        <div class="field">
            <label>Máximo de Tokens</label>
            <input type="number" id="maxTokens" value="${config.get('maxTokens') || 4000}" min="100" max="8000">
        </div>
        <button onclick="testConnection()">Probar Conexión</button>
    </div>
    
    <div class="section">
        <div class="section-title">⚙️ Motor Autónomo</div>
        <div class="field">
            <label>
                <input type="checkbox" id="enabled" ${config.get('enabled') ? 'checked' : ''}>
                Habilitar motor autónomo
            </label>
        </div>
        <div class="field">
            <label>Intervalo de análisis (minutos)</label>
            <input type="number" id="analysisIntervalMs" value="${(config.get('analysisIntervalMs') || 30000) / 60000}" min="0.5" step="0.5">
        </div>
        <div class="field">
            <label>Líneas de contexto máximo</label>
            <input type="number" id="contextLines" value="${config.get('contextLines') || 500}" min="100" max="2000">
        </div>
        <div class="field">
            <label>
                <input type="checkbox" id="autoApplySimpleFixes" ${config.get('autoApplySimpleFixes') ? 'checked' : ''}>
                Auto-aplicar correcciones simples
            </label>
        </div>
        <div class="field">
            <label>
                <input type="checkbox" id="showNotifications" ${config.get('showNotifications') ? 'checked' : ''}>
                Mostrar notificaciones
            </label>
        </div>
    </div>
    
    <div class="controls">
        <button onclick="saveSettings()">💾 Guardar</button>
        <button class="secondary" onclick="resetSettings()">🔄 Restaurar</button>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        
        // Actualizar valor de temperatura en tiempo real
        document.getElementById('temperature').addEventListener('input', function() {
            document.getElementById('tempValue').textContent = this.value;
        });
        
        function saveSettings() {
            const settings = {
                enabled: document.getElementById('enabled').checked,
                openaiApiKey: document.getElementById('openaiApiKey').value,
                openaiModel: document.getElementById('openaiModel').value,
                temperature: parseFloat(document.getElementById('temperature').value),
                maxTokens: parseInt(document.getElementById('maxTokens').value),
                analysisIntervalMs: parseFloat(document.getElementById('analysisIntervalMs').value) * 60000,
                contextLines: parseInt(document.getElementById('contextLines').value),
                autoApplySimpleFixes: document.getElementById('autoApplySimpleFixes').checked,
                showNotifications: document.getElementById('showNotifications').checked
            };
            
            vscode.postMessage({ type: 'updateSettings', settings });
        }
        
        function resetSettings() {
            if (confirm('¿Estás seguro de que quieres restaurar toda la configuración?')) {
                vscode.postMessage({ type: 'resetSettings' });
            }
        }
        
        function testConnection() {
            vscode.postMessage({ type: 'testConnection' });
        }
    </script>
</body>
</html>`;
    }
}
SettingsProvider.viewId = 'autonomousMcpSettings';
// Language Model Tools para Agent Mode - Se usan automáticamente por Copilot
class AutonomousLanguageModelTools {
    constructor(context) {
        this.context = context;
    }
    // Tool 1: Analizar código automáticamente
    async handleAnalyzeCode(options, token) {
        try {
            const { code, language, task } = options.input;
            console.log('🔧 [Tool] analyzeCode llamado:', { task, language, codeLength: code?.length });
            const systemPrompt = `Eres un experto en ${language || 'programación'} que analiza código y proporciona sugerencias específicas y prácticas.

Tarea: ${task || 'analyze'}

INSTRUCCIONES:
- Proporciona análisis detallado y específico
- Sugiere mejoras concretas con ejemplos de código
- Identifica patrones, problemas potenciales y optimizaciones
- Sé conciso pero completo
- Formatea la respuesta en Markdown`;
            const prompt = `Analiza este código ${language || ''} y ${task === 'fix' ? 'encuentra errores y sugiere correcciones' :
                task === 'optimize' ? 'sugiere optimizaciones' :
                    task === 'explain' ? 'explica cómo funciona' : 'proporciona sugerencias de mejora'}:

\`\`\`${language || ''}
${code}
\`\`\``;
            const response = await this.callMCPServer(systemPrompt, prompt);
            // Log en historial
            const engine = AutonomousEngine.getInstance();
            if (engine) {
                engine.addHistoryEntry({
                    timestamp: Date.now(),
                    type: 'application',
                    description: `Tool analyzeCode ejecutado: ${task || 'analyze'}`,
                    success: true,
                    details: { language, codeLength: code?.length }
                });
            }
            return new vscode.LanguageModelToolResult([
                new vscode.LanguageModelTextPart(response.answer || 'No se pudo analizar el código')
            ]);
        }
        catch (error) {
            console.error('❌ Error en analyzeCode tool:', error);
            return new vscode.LanguageModelToolResult([
                new vscode.LanguageModelTextPart(`Error: ${error}`)
            ]);
        }
    }
    // Tool 2: Obtener contexto del proyecto automáticamente
    async handleGetProjectContext(options, token) {
        try {
            const { includeErrors, includeFiles } = options.input;
            console.log('🔧 [Tool] getProjectContext llamado:', { includeErrors, includeFiles });
            let context = '## Contexto del Proyecto\n\n';
            // Archivo activo
            const activeEditor = vscode.window.activeTextEditor;
            if (activeEditor) {
                const document = activeEditor.document;
                context += `**Archivo activo:** ${document.fileName}\n`;
                context += `**Lenguaje:** ${document.languageId}\n\n`;
                // Código seleccionado o completo
                const selection = activeEditor.selection;
                if (!selection.isEmpty) {
                    const selectedText = document.getText(selection);
                    context += `**Código seleccionado:**\n\`\`\`${document.languageId}\n${selectedText}\n\`\`\`\n\n`;
                }
            }
            // Errores y warnings
            if (includeErrors && activeEditor) {
                const diagnostics = vscode.languages.getDiagnostics(activeEditor.document.uri);
                if (diagnostics.length > 0) {
                    context += `**Errores/Warnings detectados:**\n`;
                    diagnostics.slice(0, 10).forEach((diagnostic, index) => {
                        context += `${index + 1}. Línea ${diagnostic.range.start.line + 1}: ${diagnostic.message}\n`;
                    });
                    context += '\n';
                }
            }
            // Archivos del workspace
            if (includeFiles) {
                const workspaceFolders = vscode.workspace.workspaceFolders;
                if (workspaceFolders) {
                    context += `**Workspace:** ${workspaceFolders[0].name}\n`;
                    // Lista archivos principales (simplificado)
                    const files = await vscode.workspace.findFiles('**/*.{js,ts,py,java,cpp,c,cs}', '**/node_modules/**', 20);
                    context += `**Archivos principales encontrados:** ${files.length}\n`;
                    files.slice(0, 10).forEach(file => {
                        context += `- ${vscode.workspace.asRelativePath(file)}\n`;
                    });
                }
            }
            return new vscode.LanguageModelToolResult([
                new vscode.LanguageModelTextPart(context)
            ]);
        }
        catch (error) {
            console.error('❌ Error en getProjectContext tool:', error);
            return new vscode.LanguageModelToolResult([
                new vscode.LanguageModelTextPart(`Error obteniendo contexto: ${error}`)
            ]);
        }
    }
    // Tool 3: Consulta directa a OpenAI con contexto automático
    async handleAskOpenAI(options, token) {
        try {
            const { question, includeContext, temperature } = options.input;
            console.log('🔧 [Tool] askOpenAI llamado:', { question: question?.substring(0, 100), includeContext, temperature });
            let systemPrompt = `Eres Autonomous AI, un asistente experto en desarrollo de software integrado en VS Code.

CONTEXTO: Estás ayudando a un desarrollador en tiempo real a través del Agent Mode de GitHub Copilot.

INSTRUCCIONES:
- Responde de manera práctica y directa
- Proporciona ejemplos de código cuando sea relevante
- Mantén el contexto del proyecto actual
- Sé específico y accionable en tus sugerencias
- Formatea la respuesta en Markdown`;
            let finalPrompt = question;
            // Incluir contexto automático si se solicita
            if (includeContext) {
                const contextResult = await this.handleGetProjectContext({ input: { includeErrors: true, includeFiles: false } }, token);
                const contextText = contextResult.content[0];
                if (contextText instanceof vscode.LanguageModelTextPart) {
                    finalPrompt = `${contextText.value}\n\n**Pregunta del usuario:** ${question}`;
                }
            }
            const response = await this.callMCPServer(systemPrompt, finalPrompt, temperature);
            // Log en historial
            const engine = AutonomousEngine.getInstance();
            if (engine) {
                engine.addHistoryEntry({
                    timestamp: Date.now(),
                    type: 'suggestion',
                    description: `Tool askOpenAI ejecutado: ${question.substring(0, 50)}...`,
                    success: true,
                    details: { includeContext, temperature, responseLength: response.answer?.length }
                });
            }
            return new vscode.LanguageModelToolResult([
                new vscode.LanguageModelTextPart(response.answer || 'No se pudo obtener respuesta de OpenAI')
            ]);
        }
        catch (error) {
            console.error('❌ Error en askOpenAI tool:', error);
            return new vscode.LanguageModelToolResult([
                new vscode.LanguageModelTextPart(`Error: ${error}`)
            ]);
        }
    }
    async callMCPServer(systemPrompt, prompt, temperature = 0.7) {
        try {
            const response = await (0, node_fetch_1.default)(SERVER_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    id: Date.now(),
                    method: 'mcp.openai.ask',
                    params: {
                        question: prompt,
                        system: systemPrompt,
                        temperature,
                        maxTokens: 3000
                    }
                })
            });
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            const data = await response.json();
            if (data.error) {
                throw new Error(data.error.message);
            }
            return data.result;
        }
        catch (error) {
            console.error('Error llamando al servidor MCP:', error);
            throw error;
        }
    }
}
// Chat Participant para responder automáticamente en el chat de Copilot
class AutonomousAIChatParticipant {
    constructor(context) {
        this.context = context;
    }
    async handleChatRequest(request, context, stream, token) {
        // Determinar el intent del usuario
        const command = request.command || 'general';
        const prompt = request.prompt;
        try {
            stream.progress('🤖 Autonomous AI está procesando tu solicitud...');
            // Recopilar contexto del workspace actual
            const workspaceContext = await this.collectWorkspaceContext(command);
            // Preparar el prompt para OpenAI
            let systemPrompt = this.getSystemPrompt(command);
            let finalPrompt = this.buildPrompt(command, prompt, workspaceContext);
            stream.progress('🧠 Consultando con OpenAI...');
            // Llamar a nuestro servidor MCP
            const response = await this.callMCPServer(systemPrompt, finalPrompt);
            if (response && response.answer) {
                // Procesar y mostrar la respuesta
                stream.markdown(`## 🤖 Autonomous AI Response\n\n`);
                stream.markdown(response.answer);
                // Agregar botones de acción si es relevante
                if (command === 'fix' || command === 'optimize') {
                    stream.button({
                        command: 'autonomousMcpHelper.manualRun',
                        title: 'Ejecutar Análisis Completo',
                        arguments: []
                    });
                }
                // Agregar entry al historial
                const engine = AutonomousEngine.getInstance();
                if (engine) {
                    engine.addHistoryEntry({
                        timestamp: Date.now(),
                        type: 'suggestion',
                        description: `Chat participant respondió: ${command}`,
                        success: true,
                        details: { prompt, responseLength: response.answer.length }
                    });
                }
            }
            else {
                stream.markdown('❌ No se pudo obtener respuesta del servidor MCP.');
            }
        }
        catch (error) {
            console.error('Error en chat participant:', error);
            stream.markdown(`❌ Error: ${error}`);
            // Log del error
            const engine = AutonomousEngine.getInstance();
            if (engine) {
                engine.addHistoryEntry({
                    timestamp: Date.now(),
                    type: 'error',
                    description: `Error en chat participant: ${error}`,
                    success: false,
                    details: error
                });
            }
        }
        return { metadata: { command } };
    }
    getSystemPrompt(command) {
        const basePrompt = `Eres Autonomous AI, un asistente inteligente especializado en desarrollo de software. 
Respondes de manera clara, práctica y útil. Siempre proporcionas ejemplos de código cuando es relevante.`;
        switch (command) {
            case 'analyze':
                return `${basePrompt} Tu tarea es analizar código y proporcionar sugerencias detalladas de mejora, 
incluyendo mejores prácticas, potenciales problemas y optimizaciones.`;
            case 'fix':
                return `${basePrompt} Tu tarea es identificar errores en el código y proporcionar soluciones 
específicas con código corregido.`;
            case 'optimize':
                return `${basePrompt} Tu tarea es optimizar código para mejor rendimiento, legibilidad y 
mantenibilidad. Proporciona versiones mejoradas del código.`;
            case 'explain':
                return `${basePrompt} Tu tarea es explicar cómo funciona el código de manera clara y educativa, 
incluyendo conceptos y patrones utilizados.`;
            default:
                return `${basePrompt} Responde de manera útil y práctica a la consulta del desarrollador.`;
        }
    }
    buildPrompt(command, userPrompt, context) {
        let prompt = '';
        if (context) {
            prompt += `Contexto del workspace:\n${context}\n\n`;
        }
        prompt += `Solicitud del usuario: ${userPrompt}`;
        if (command !== 'general') {
            prompt += `\n\nComando específico: /${command}`;
        }
        return prompt;
    }
    async collectWorkspaceContext(command) {
        let context = '';
        try {
            // Obtener archivo activo
            const activeEditor = vscode.window.activeTextEditor;
            if (activeEditor) {
                const document = activeEditor.document;
                const selection = activeEditor.selection;
                context += `Archivo activo: ${document.fileName}\n`;
                context += `Lenguaje: ${document.languageId}\n`;
                if (!selection.isEmpty) {
                    const selectedText = document.getText(selection);
                    context += `Código seleccionado:\n\`\`\`${document.languageId}\n${selectedText}\n\`\`\`\n`;
                }
                else if (command === 'analyze' || command === 'fix') {
                    // Para análisis o fixes, incluir el archivo completo si no hay selección
                    const fullText = document.getText();
                    if (fullText.length < 2000) { // Solo archivos pequeños
                        context += `Contenido completo del archivo:\n\`\`\`${document.languageId}\n${fullText}\n\`\`\`\n`;
                    }
                }
            }
            // Obtener errores/warnings del archivo actual
            if (activeEditor) {
                const diagnostics = vscode.languages.getDiagnostics(activeEditor.document.uri);
                if (diagnostics.length > 0) {
                    context += `\nErrores/Warnings detectados:\n`;
                    diagnostics.slice(0, 5).forEach(diagnostic => {
                        context += `- Línea ${diagnostic.range.start.line + 1}: ${diagnostic.message}\n`;
                    });
                }
            }
        }
        catch (error) {
            console.log('Error recopilando contexto:', error);
        }
        return context;
    }
    async callMCPServer(systemPrompt, prompt) {
        try {
            const response = await (0, node_fetch_1.default)(SERVER_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    id: Date.now(),
                    method: 'mcp.openai.ask',
                    params: {
                        question: prompt,
                        system: systemPrompt,
                        temperature: 0.7,
                        maxTokens: 2000
                    }
                })
            });
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            const data = await response.json();
            if (data.error) {
                throw new Error(data.error.message);
            }
            return data.result;
        }
        catch (error) {
            console.error('Error llamando al servidor MCP:', error);
            throw error;
        }
    }
}
// ⭐ NUEVO: Auto-interceptor para Copilot
function setupCopilotAutoInterceptor(context) {
    const config = vscode.workspace.getConfiguration('autonomousMcpHelper');
    const autoIntercept = config.get('autoInterceptCopilot', true);
    if (!autoIntercept) {
        console.log('🔧 Auto-interceptor deshabilitado por configuración');
        return;
    }
    // Interceptar cuando Copilot esté activo
    const onDidChangeActiveTextEditor = vscode.window.onDidChangeActiveTextEditor(async (editor) => {
        if (editor) {
            // Cuando se abra un archivo, preparar contexto para Copilot
            await prepareContextForCopilot(editor);
        }
    });
    // Interceptar cuando haya cambios en el documento
    const onDidChangeTextDocument = vscode.workspace.onDidChangeTextDocument(async (event) => {
        // Solo si es el archivo activo y han pasado más de 2 segundos desde el último cambio
        const activeEditor = vscode.window.activeTextEditor;
        if (activeEditor && event.document === activeEditor.document) {
            clearTimeout(global.copilotContextTimer);
            global.copilotContextTimer = setTimeout(async () => {
                await prepareContextForCopilot(activeEditor);
            }, 2000);
        }
    });
    context.subscriptions.push(onDidChangeActiveTextEditor, onDidChangeTextDocument);
    console.log('🤖 Auto-interceptor de Copilot configurado correctamente');
}
// Preparar contexto automaticamente para Copilot
async function prepareContextForCopilot(editor) {
    try {
        const document = editor.document;
        const config = vscode.workspace.getConfiguration('autonomousMcpHelper');
        // Solo procesar archivos de código
        if (!['typescript', 'javascript', 'python', 'java', 'go', 'rust', 'cpp', 'c'].includes(document.languageId)) {
            return;
        }
        // Enviar contexto al MCP server de forma silenciosa para que esté listo
        const code = document.getText();
        const prompt = `Analiza este código ${document.languageId} y prepara un contexto útil para responder preguntas del usuario:\n\n${code}`;
        // Llamada silenciosa al MCP server
        await callMCPServerSilent(prompt, config.get('temperature', 0.3));
        console.log(`🧠 Contexto preparado para ${document.fileName}`);
    }
    catch (error) {
        console.error('❌ Error preparando contexto:', error);
    }
}
// Llamada silenciosa al MCP server (sin mostrar resultados)
async function callMCPServerSilent(prompt, temperature = 0.3) {
    try {
        const response = await (0, node_fetch_1.default)(SERVER_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: Date.now(),
                method: 'mcp.openai.ask',
                params: {
                    prompt,
                    temperature,
                    cache: true // Usar cache para respuestas rápidas
                }
            })
        });
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        const data = await response.json();
        return data.result || data;
    }
    catch (error) {
        console.error('❌ Error en llamada silenciosa:', error);
        return null;
    }
}
function activate(context) {
    console.log('🚀 Autonomous MCP Helper activating...');
    const engine = new AutonomousEngine(context);
    const dashboardProvider = new DashboardProvider(context);
    const historyProvider = new HistoryProvider(context);
    const settingsProvider = new SettingsProvider(context);
    // ⭐ NUEVO: Crear y registrar Chat Participant
    const chatParticipant = new AutonomousAIChatParticipant(context);
    const participant = vscode.chat.createChatParticipant('autonomousMcpHelper.autonomousai', chatParticipant.handleChatRequest.bind(chatParticipant));
    // Configurar el icono del chat participant (opcional)
    participant.iconPath = new vscode.ThemeIcon('robot');
    console.log('🤖 Chat Participant @autonomousai registrado exitosamente');
    // ⭐ NUEVO: Registrar Language Model Tools para Agent Mode
    const languageModelTools = new AutonomousLanguageModelTools(context);
    // Crear wrappers con la firma correcta para vscode.lm.registerTool
    const analyzeCodeTool = {
        invoke: languageModelTools.handleAnalyzeCode.bind(languageModelTools)
    };
    const getProjectContextTool = {
        invoke: languageModelTools.handleGetProjectContext.bind(languageModelTools)
    };
    const askOpenAITool = {
        invoke: languageModelTools.handleAskOpenAI.bind(languageModelTools)
    };
    context.subscriptions.push(vscode.lm.registerTool('analyzeCode', analyzeCodeTool), vscode.lm.registerTool('getProjectContext', getProjectContextTool), vscode.lm.registerTool('askOpenAI', askOpenAITool));
    console.log('🔧 Language Model Tools registradas para Agent Mode');
    // ⭐ NUEVO: Registrar herramientas MCP nativas para acceso como mcp_autonomous_*
    const mcpAutonomousAsk = {
        invoke: async (options, token) => {
            try {
                const { question, prompt, system, temperature, maxTokens, context: userContext } = options.input;
                const response = await languageModelTools.callMCPServer(system || 'Eres un asistente experto en programación.', question || prompt, temperature || 0.3);
                return new vscode.LanguageModelToolResult([
                    new vscode.LanguageModelTextPart(response.answer || 'Sin respuesta')
                ]);
            }
            catch (error) {
                return new vscode.LanguageModelToolResult([
                    new vscode.LanguageModelTextPart(`Error: ${error}`)
                ]);
            }
        }
    };
    const mcpAutonomousHealth = {
        invoke: async (options, token) => {
            try {
                const response = await languageModelTools.callMCPServer('Eres un monitor de sistema.', 'health check', 0.1);
                return new vscode.LanguageModelToolResult([
                    new vscode.LanguageModelTextPart(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }))
                ]);
            }
            catch (error) {
                return new vscode.LanguageModelToolResult([
                    new vscode.LanguageModelTextPart(JSON.stringify({ status: 'error', message: error.message }))
                ]);
            }
        }
    };
    const mcpAutonomousAnalyzeCode = {
        invoke: async (options, token) => {
            try {
                const { code, language = 'typescript', task = 'analyze' } = options.input;
                if (!code) {
                    throw new Error('Parámetro "code" es requerido');
                }
                const systemPrompt = `Eres un experto en ${language} que analiza código y proporciona sugerencias específicas y prácticas.

Tarea: ${task}

INSTRUCCIONES:
- Proporciona análisis detallado y específico
- Sugiere mejoras concretas con ejemplos de código
- Identifica patrones, problemas potenciales y optimizaciones
- Sé conciso pero completo
- Formatea la respuesta en Markdown`;
                const prompt = `Analiza este código ${language} y ${task === 'fix' ? 'encuentra errores y sugiere correcciones' :
                    task === 'optimize' ? 'sugiere optimizaciones' :
                        task === 'explain' ? 'explica cómo funciona' : 'proporciona sugerencias de mejora'}:

\`\`\`${language}
${code}
\`\`\``;
                const response = await languageModelTools.callMCPServer(systemPrompt, prompt, 0.2);
                return new vscode.LanguageModelToolResult([
                    new vscode.LanguageModelTextPart(response.answer || 'No se pudo analizar el código')
                ]);
            }
            catch (error) {
                return new vscode.LanguageModelToolResult([
                    new vscode.LanguageModelTextPart(`Error: ${error}`)
                ]);
            }
        }
    };
    // Registrar herramientas MCP como herramientas nativas
    context.subscriptions.push(vscode.lm.registerTool('mcp_autonomous_ask', mcpAutonomousAsk), vscode.lm.registerTool('mcp_autonomous_health', mcpAutonomousHealth), vscode.lm.registerTool('mcp_autonomous_analyze_code', mcpAutonomousAnalyzeCode));
    console.log('🚀 Herramientas MCP Autonomous registradas como nativas:');
    console.log('  - mcp_autonomous_ask');
    console.log('  - mcp_autonomous_health');
    console.log('  - mcp_autonomous_analyze_code');
    // ⭐ NUEVO: Auto-interceptor de Copilot
    setupCopilotAutoInterceptor(context);
    console.log('🚀 Auto-interceptor de Copilot configurado');
    // Comandos principales
    const manualRunCmd = vscode.commands.registerCommand('autonomousMcpHelper.manualRun', () => {
        console.log('📋 Manual run command executed');
        engine.analyzeProject();
    });
    const toggleCmd = vscode.commands.registerCommand('autonomousMcpHelper.toggleEngine', () => {
        console.log('🔄 Toggle engine command executed');
        engine.toggle();
    });
    // Comandos para historial
    const clearHistoryCmd = vscode.commands.registerCommand('autonomousMcpHelper.clearHistory', () => {
        console.log('🗑️ Clear history command executed');
        const state = engine.getState();
        state.history = [];
        engine.addHistoryEntry({
            timestamp: Date.now(),
            type: 'application',
            description: 'Historial limpiado manualmente',
            success: true
        });
    });
    const exportHistoryCmd = vscode.commands.registerCommand('autonomousMcpHelper.exportHistory', async () => {
        console.log('📤 Export history command executed');
        const state = engine.getState();
        const jsonData = JSON.stringify(state.history, null, 2);
        const document = await vscode.workspace.openTextDocument({
            content: jsonData,
            language: 'json'
        });
        vscode.window.showTextDocument(document);
    });
    // Comando para resetear configuración
    const resetSettingsCmd = vscode.commands.registerCommand('autonomousMcpHelper.resetSettings', async () => {
        console.log('🔄 Reset settings command executed');
        const config = vscode.workspace.getConfiguration('autonomousMcpHelper');
        const keys = [
            'enabled', 'openaiApiKey', 'openaiModel', 'maxTokens',
            'analysisIntervalMs', 'contextLines', 'autoApplySimpleFixes',
            'showNotifications', 'temperature'
        ];
        for (const key of keys) {
            await config.update(key, undefined, vscode.ConfigurationTarget.Global);
        }
        vscode.window.showInformationMessage('🔄 Configuración restablecida a valores por defecto');
    });
    // ⭐ NUEVO: Comandos MCP directos para acceso inmediato
    const mcpAskCmd = vscode.commands.registerCommand('autonomousMcpHelper.mcpAsk', async () => {
        const question = await vscode.window.showInputBox({
            prompt: '¿Qué quieres preguntarle al MCP Autonomous?',
            placeHolder: 'Ejemplo: ¿Cómo optimizar este código React?'
        });
        if (question) {
            try {
                const response = await languageModelTools.callMCPServer('Eres un experto en desarrollo de software. Responde de manera práctica y con ejemplos.', question, 0.3);
                // Mostrar respuesta en un nuevo documento
                const doc = await vscode.workspace.openTextDocument({
                    content: `# MCP Autonomous Response\n\n**Pregunta:** ${question}\n\n**Respuesta:**\n\n${response.answer}`,
                    language: 'markdown'
                });
                vscode.window.showTextDocument(doc);
                vscode.window.showInformationMessage('✅ Respuesta generada exitosamente');
            }
            catch (error) {
                vscode.window.showErrorMessage(`❌ Error: ${error}`);
            }
        }
    });
    const mcpAnalyzeCodeCmd = vscode.commands.registerCommand('autonomousMcpHelper.mcpAnalyzeCode', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage('⚠️ Abre un archivo para analizar');
            return;
        }
        const document = editor.document;
        const selection = editor.selection;
        const code = selection.isEmpty ? document.getText() : document.getText(selection);
        if (!code.trim()) {
            vscode.window.showWarningMessage('⚠️ No hay código para analizar');
            return;
        }
        try {
            vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: '🔍 Analizando código...',
                cancellable: false
            }, async (progress) => {
                const systemPrompt = `Eres un experto en ${document.languageId} que analiza código y proporciona sugerencias específicas.

INSTRUCCIONES:
- Analiza el código en detalle
- Identifica problemas, optimizaciones y mejores prácticas
- Proporciona ejemplos de código mejorado
- Formatea la respuesta en Markdown`;
                const prompt = `Analiza este código ${document.languageId} y proporciona sugerencias detalladas:

\`\`\`${document.languageId}
${code}
\`\`\``;
                const response = await languageModelTools.callMCPServer(systemPrompt, prompt, 0.2);
                // Mostrar análisis en un nuevo documento
                const doc = await vscode.workspace.openTextDocument({
                    content: `# Análisis de Código - ${document.fileName}\n\n**Archivo:** ${document.fileName}\n**Lenguaje:** ${document.languageId}\n\n## Código Analizado\n\n\`\`\`${document.languageId}\n${code}\n\`\`\`\n\n## Análisis\n\n${response.answer}`,
                    language: 'markdown'
                });
                vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
                vscode.window.showInformationMessage('✅ Análisis completado');
            });
        }
        catch (error) {
            vscode.window.showErrorMessage(`❌ Error analizando código: ${error}`);
        }
    });
    const mcpHealthCmd = vscode.commands.registerCommand('autonomousMcpHelper.mcpHealth', async () => {
        try {
            const response = await (0, node_fetch_1.default)('http://localhost:7088/health');
            const data = await response.json();
            if (data.status === 'ok') {
                vscode.window.showInformationMessage(`✅ MCP Server funcionando correctamente - ${data.timestamp}`);
            }
            else {
                vscode.window.showWarningMessage('⚠️ MCP Server responde pero hay problemas');
            }
        }
        catch (error) {
            vscode.window.showErrorMessage(`❌ MCP Server no disponible: ${error}`);
        }
    });
    const mcpContextCmd = vscode.commands.registerCommand('autonomousMcpHelper.mcpContext', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage('⚠️ Abre un archivo para obtener contexto');
            return;
        }
        try {
            vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: '📋 Generando contexto del proyecto...',
                cancellable: false
            }, async (progress) => {
                const document = editor.document;
                const workspaceFolders = vscode.workspace.workspaceFolders;
                const diagnostics = vscode.languages.getDiagnostics(document.uri);
                let context = `# Contexto del Proyecto\n\n`;
                context += `**Archivo activo:** ${document.fileName}\n`;
                context += `**Lenguaje:** ${document.languageId}\n`;
                context += `**Workspace:** ${workspaceFolders?.[0]?.name || 'N/A'}\n\n`;
                if (diagnostics.length > 0) {
                    context += `## Errores/Warnings (${diagnostics.length})\n\n`;
                    diagnostics.slice(0, 10).forEach((diagnostic, index) => {
                        context += `${index + 1}. **Línea ${diagnostic.range.start.line + 1}:** ${diagnostic.message}\n`;
                    });
                    context += '\n';
                }
                // Obtener archivos del proyecto
                const files = await vscode.workspace.findFiles('**/*.{js,ts,py,java,cpp,c,cs,json}', '**/node_modules/**', 20);
                context += `## Archivos del proyecto (${files.length})\n\n`;
                files.slice(0, 15).forEach(file => {
                    context += `- ${vscode.workspace.asRelativePath(file)}\n`;
                });
                const doc = await vscode.workspace.openTextDocument({
                    content: context,
                    language: 'markdown'
                });
                vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
                vscode.window.showInformationMessage('✅ Contexto generado exitosamente');
            });
        }
        catch (error) {
            vscode.window.showErrorMessage(`❌ Error generando contexto: ${error}`);
        }
    });
    // Registrar vistas
    const dashboardViewProvider = vscode.window.registerWebviewViewProvider(DashboardProvider.viewId, dashboardProvider);
    const historyViewProvider = vscode.window.registerWebviewViewProvider(HistoryProvider.viewId, historyProvider);
    const settingsViewProvider = vscode.window.registerWebviewViewProvider(SettingsProvider.viewId, settingsProvider);
    console.log('📊 View providers registered:');
    console.log('  - Dashboard:', DashboardProvider.viewId);
    console.log('  - History:', HistoryProvider.viewId);
    console.log('  - Settings:', SettingsProvider.viewId);
    context.subscriptions.push(manualRunCmd, toggleCmd, clearHistoryCmd, exportHistoryCmd, resetSettingsCmd, mcpAskCmd, mcpAnalyzeCodeCmd, mcpHealthCmd, mcpContextCmd, participant, // ⭐ NUEVO: Chat Participant
    dashboardViewProvider, historyViewProvider, settingsViewProvider);
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
