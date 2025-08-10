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
const SERVER_URL = process.env.MCP_AUTOPILOT_URL || 'http://localhost:7088/jsonrpc';
const AUTO_KEY = 'autonomousMcpHelper.autoLoop.enabled';
async function callMcp(method, params) {
    const body = { jsonrpc: '2.0', id: Date.now(), method, params };
    const resp = await (0, node_fetch_1.default)(SERVER_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!resp.ok)
        throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    if (data.error)
        throw new Error(data.error.message || 'Error MCP');
    return data.result;
}
function collectContext() {
    const editor = vscode.window.activeTextEditor;
    if (!editor)
        return '';
    const maxLines = vscode.workspace.getConfiguration('autonomousMcpHelper').get('contextMaxLines', 400);
    const lines = Math.min(maxLines, editor.document.lineCount);
    return editor.document.getText(new vscode.Range(0, 0, lines, 0)).slice(0, 8000);
}
async function runAutopilot(showDoc = true) {
    const contextSnippet = collectContext();
    const question = 'Genera el siguiente paso de desarrollo y acciones concretas basadas en el código abierto.';
    const result = await callMcp('mcp.autoresponder.reply', { question, context: contextSnippet, temperature: 0.2 });
    const answer = result.answer || JSON.stringify(result);
    if (showDoc) {
        const doc = await vscode.workspace.openTextDocument({ content: answer, language: 'markdown' });
        await vscode.window.showTextDocument(doc, { preview: false });
    }
    return answer;
}
let autoInterval;
function startAutoLoop(context) {
    stopAutoLoop();
    const intervalMs = vscode.workspace.getConfiguration('autonomousMcpHelper').get('autoLoopIntervalMs', 180000);
    autoInterval = setInterval(async () => {
        const enabled = context.globalState.get(AUTO_KEY, false);
        if (!enabled)
            return;
        try {
            const out = await runAutopilot(false);
            Panel.update(out);
        }
        catch (e) { /* ignore */ }
    }, intervalMs);
}
function stopAutoLoop() { if (autoInterval) {
    clearInterval(autoInterval);
    autoInterval = undefined;
} }
async function toggleAutoLoop(context) {
    const enabled = context.globalState.get(AUTO_KEY, false);
    const newVal = !enabled;
    await context.globalState.update(AUTO_KEY, newVal);
    if (newVal) {
        startAutoLoop(context);
        vscode.window.showInformationMessage('Auto-loop activado');
    }
    else {
        stopAutoLoop();
        vscode.window.showInformationMessage('Auto-loop desactivado');
    }
    Panel.postState(newVal);
}
class Panel {
    static createOrShow(context) {
        if (Panel.current) {
            Panel.current.panel.reveal();
            return;
        }
        const panel = vscode.window.createWebviewPanel('autonomousMcpHelper.control', 'Autonomous MCP Control', vscode.ViewColumn.Beside, { enableScripts: true });
        Panel.current = new Panel(panel, context);
    }
    static update(latestAnswer) { Panel.current?.postMessage({ type: 'answer', payload: latestAnswer }); }
    static postState(enabled) { Panel.current?.postMessage({ type: 'state', payload: { enabled } }); }
    constructor(panel, context) {
        this.panel = panel;
        this.context = context;
        panel.onDidDispose(() => { if (Panel.current === this)
            Panel.current = undefined; });
        panel.webview.onDidReceiveMessage(msg => {
            if (msg?.type === 'toggle')
                toggleAutoLoop(this.context);
            if (msg?.type === 'runOnce')
                runAutopilot();
        });
        this.render();
        Panel.postState(this.context.globalState.get(AUTO_KEY, false));
    }
    render() {
        const enabled = this.context.globalState.get(AUTO_KEY, false);
        this.panel.webview.html = `<!DOCTYPE html><html><head><meta charset='utf-8'/><style>
      body{font-family:system-ui,Arial,sans-serif;padding:8px;}
      button{margin:4px;padding:6px 10px;}
      #status{font-weight:bold;color:${enabled ? 'green' : '#b00'};}
      pre{background:#111;color:#eee;padding:8px;max-height:240px;overflow:auto;}
    </style></head><body>
    <h2>Autonomous MCP Control (Extension)</h2>
    <p>Estado: <span id='status'>${enabled ? 'ACTIVADO' : 'DESACTIVADO'}</span></p>
    <button onclick="vscode.postMessage({type:'toggle'})">Toggle Auto</button>
    <button onclick="vscode.postMessage({type:'runOnce'})">Ejecutar una vez</button>
    <pre id='out'>(sin resultados aún)</pre>
    <script>
      const vscode = acquireVsCodeApi();
      window.addEventListener('message', ev => {
        const {type,payload} = ev.data||{};
        if(type==='answer'){ document.getElementById('out').textContent = payload; }
        if(type==='state'){ document.getElementById('status').textContent = payload.enabled?'ACTIVADO':'DESACTIVADO'; }
      });
    </script>
    </body></html>`;
    }
    postMessage(msg) { this.panel.webview.postMessage(msg); }
}
function activate(context) {
    const runCmd = vscode.commands.registerCommand('autonomousMcpHelper.runAutopilot', () => runAutopilot());
    const toggleCmd = vscode.commands.registerCommand('autonomousMcpHelper.toggleAutoLoop', () => toggleAutoLoop(context));
    const panelCmd = vscode.commands.registerCommand('autonomousMcpHelper.showControl', () => Panel.createOrShow(context));
    context.subscriptions.push(runCmd, toggleCmd, panelCmd);
    if (context.globalState.get(AUTO_KEY, false))
        startAutoLoop(context);
}
function deactivate() { stopAutoLoop(); }
