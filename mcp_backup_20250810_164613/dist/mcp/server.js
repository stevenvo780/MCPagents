"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const body_parser_1 = __importDefault(require("body-parser"));
const config_1 = __importDefault(require("../config"));
const zod_1 = require("zod");
const openaiAsk_1 = require("./tools/openaiAsk");
const health_1 = require("./tools/health");
const app = (0, express_1.default)();
app.use(body_parser_1.default.json());
const JSONRPC_VERSION = '2.0';
function makeJsonRpcResult(id, result) { return { jsonrpc: JSONRPC_VERSION, id, result }; }
function makeJsonRpcError(id, code, message, data) { return { jsonrpc: JSONRPC_VERSION, id, error: { code, message, data } }; }
function wrapAutoresponder(params) {
    const { question, prompt, context, system, model, temperature, force, cache } = params || {};
    return (0, openaiAsk_1.openaiAsk)({ prompt: prompt || question, context, system, model, temperature, force: !!force, cache: cache !== false });
}
const mcpMethods = {
    'mcp.openai.ask': { handler: openaiAsk_1.openaiAsk, schema: openaiAsk_1.OpenAIAskParamsSchema, meta: { description: 'Prompt a OpenAI.' } },
    'mcp.autoresponder.reply': { handler: wrapAutoresponder, schema: openaiAsk_1.OpenAIAskParamsSchema, meta: { description: 'Alias openai.ask.' } },
    'prompt.reply': { handler: wrapAutoresponder, schema: openaiAsk_1.OpenAIAskParamsSchema, meta: { description: 'Alias adicional.' } },
    'mcp.health': { handler: health_1.health, schema: health_1.HealthParamsSchema, meta: { description: 'Health basico.' } },
    'mcp.describe': { handler: async () => describeServer(), schema: zod_1.z.object({}).optional(), meta: { description: 'Describe server.' } },
};
app.get('/health', async (_req, res) => {
    try {
        res.json(await (0, health_1.health)({}));
    }
    catch (e) {
        res.status(500).json({ status: 'error', message: e.message });
    }
});
app.get('/', (_req, res) => {
    res.json({
        name: 'mcp-openai-minimal',
        status: 'ok',
        jsonrpc: '2.0',
        endpoint: '/jsonrpc',
        health: '/health',
        tools: Object.keys(mcpMethods),
    });
});
app.post('/jsonrpc', async (req, res) => {
    const body = req.body;
    if (Array.isArray(body)) {
        const responses = await Promise.all(body.map(r => handleSingle(r)));
        return res.json(responses);
    }
    res.json(await handleSingle(body));
});
async function handleSingle(req) {
    const { jsonrpc, method, params, id } = req;
    if (jsonrpc !== JSONRPC_VERSION)
        return makeJsonRpcError(id, -32600, "Invalid Request: jsonrpc must be '2.0'");
    const def = mcpMethods[method];
    if (!def)
        return makeJsonRpcError(id, -32601, `Method not found: ${method}`);
    try {
        const validated = def.schema.parse(params);
        const result = await def.handler(validated);
        return makeJsonRpcResult(id, result);
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError)
            return makeJsonRpcError(id, -32602, 'Invalid params', error.errors);
        return makeJsonRpcError(id, -32000, 'Internal error', { message: error.message });
    }
}
function describeServer() {
    return {
        name: 'mcp-openai-minimal',
        version: '2.0.0',
        tools: Object.entries(mcpMethods).map(([name, def]) => ({ name, description: def.meta?.description || '' })),
    };
}
const PORT = config_1.default.port;
const HOST = config_1.default.host;
app.listen(PORT, HOST, () => {
    console.log(`MCP minimal listening on http://${HOST}:${PORT}`);
});
