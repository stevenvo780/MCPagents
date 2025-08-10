import * as vscode from 'vscode';
import fetch from 'node-fetch';

const SERVER_URL = process.env.MCP_AUTOPILOT_URL || 'http://localhost:7088/jsonrpc';
const AUTO_KEY = 'autonomousMcpHelper.autoLoop.enabled';

async function callMcp(method: string, params: any) {
  const body = { jsonrpc: '2.0', id: Date.now(), method, params };
  const resp = await fetch(SERVER_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const data = await resp.json();
  if (data.error) throw new Error(data.error.message || 'Error MCP');
  return data.result;
}

function collectContext(): string {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return '';
  const maxLines = vscode.workspace.getConfiguration('autonomousMcpHelper').get<number>('contextMaxLines', 400);
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

let autoInterval: NodeJS.Timeout | undefined;

function startAutoLoop(context: vscode.ExtensionContext) {
  stopAutoLoop();
  const intervalMs = vscode.workspace.getConfiguration('autonomousMcpHelper').get<number>('autoLoopIntervalMs', 180000);
  autoInterval = setInterval(async () => {
    const enabled = context.globalState.get<boolean>(AUTO_KEY, false);
    if (!enabled) return;
    try { const out = await runAutopilot(false); Panel.update(out); } catch (e: any) { /* ignore */ }
  }, intervalMs);
}

function stopAutoLoop() { if (autoInterval) { clearInterval(autoInterval); autoInterval = undefined; } }

async function toggleAutoLoop(context: vscode.ExtensionContext) {
  const enabled = context.globalState.get<boolean>(AUTO_KEY, false);
  const newVal = !enabled;
  await context.globalState.update(AUTO_KEY, newVal);
  if (newVal) { startAutoLoop(context); vscode.window.showInformationMessage('Auto-loop activado'); } else { stopAutoLoop(); vscode.window.showInformationMessage('Auto-loop desactivado'); }
  Panel.postState(newVal);
}

class Panel {
  static current: Panel | undefined;
  static createOrShow(context: vscode.ExtensionContext) {
    if (Panel.current) { Panel.current.panel.reveal(); return; }
    const panel = vscode.window.createWebviewPanel('autonomousMcpHelper.control', 'Autonomous MCP Control', vscode.ViewColumn.Beside, { enableScripts: true });
    Panel.current = new Panel(panel, context);
  }
  static update(latestAnswer: string) { Panel.current?.postMessage({ type: 'answer', payload: latestAnswer }); }
  static postState(enabled: boolean) { Panel.current?.postMessage({ type: 'state', payload: { enabled } }); }
  constructor(public panel: vscode.WebviewPanel, private context: vscode.ExtensionContext) {
    panel.onDidDispose(() => { if (Panel.current === this) Panel.current = undefined; });
    panel.webview.onDidReceiveMessage(msg => {
      if (msg?.type === 'toggle') toggleAutoLoop(this.context);
      if (msg?.type === 'runOnce') runAutopilot();
    });
    this.render();
    Panel.postState(this.context.globalState.get<boolean>(AUTO_KEY, false));
  }
  render() {
    const enabled = this.context.globalState.get<boolean>(AUTO_KEY, false);
    this.panel.webview.html = `<!DOCTYPE html><html><head><meta charset='utf-8'/><style>
      body{font-family:system-ui,Arial,sans-serif;padding:8px;}
      button{margin:4px;padding:6px 10px;}
      #status{font-weight:bold;color:${enabled?'green':'#b00'};}
      pre{background:#111;color:#eee;padding:8px;max-height:240px;overflow:auto;}
    </style></head><body>
    <h2>Autonomous MCP Control (Extension)</h2>
    <p>Estado: <span id='status'>${enabled?'ACTIVADO':'DESACTIVADO'}</span></p>
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
  postMessage(msg: any) { this.panel.webview.postMessage(msg); }
}

export function activate(context: vscode.ExtensionContext) {
  const runCmd = vscode.commands.registerCommand('autonomousMcpHelper.runAutopilot', () => runAutopilot());
  const toggleCmd = vscode.commands.registerCommand('autonomousMcpHelper.toggleAutoLoop', () => toggleAutoLoop(context));
  const panelCmd = vscode.commands.registerCommand('autonomousMcpHelper.showControl', () => Panel.createOrShow(context));
  context.subscriptions.push(runCmd, toggleCmd, panelCmd);
  if (context.globalState.get<boolean>(AUTO_KEY, false)) startAutoLoop(context);
}

export function deactivate() { stopAutoLoop(); }
