import express from 'express';
import { Request, Response } from 'express';
import bodyParser from 'body-parser';
import config from '../config';
import { z } from 'zod';
import { openaiAsk, OpenAIAskParamsSchema } from './tools/openaiAsk';
import { health, HealthParamsSchema } from './tools/health';

const app = express();
app.use(bodyParser.json());

const JSONRPC_VERSION = '2.0';

interface JsonRpcRequest { jsonrpc: string; method: string; params?: any; id: string | number | null; }
interface JsonRpcResponse { jsonrpc: string; result?: any; error?: { code: number; message: string; data?: any }; id: string | number | null; }

function makeJsonRpcResult(id: string | number | null, result: any): JsonRpcResponse { return { jsonrpc: JSONRPC_VERSION, id, result }; }
function makeJsonRpcError(id: string | number | null, code: number, message: string, data?: any): JsonRpcResponse { return { jsonrpc: JSONRPC_VERSION, id, error: { code, message, data } }; }

function wrapAutoresponder(params: any) {
  const { question, prompt, context, system, model, temperature } = params || {};
  return openaiAsk({ prompt: prompt || question, context, system, model, temperature });
}

const mcpMethods: { [key: string]: { handler: Function; schema: z.ZodSchema<any>; meta?: any } } = {
  'mcp.openai.ask': { handler: openaiAsk, schema: OpenAIAskParamsSchema, meta: { description: 'Prompt a OpenAI.' } },
  'mcp.autoresponder.reply': { handler: wrapAutoresponder, schema: OpenAIAskParamsSchema, meta: { description: 'Alias openai.ask.' } },
  'prompt.reply': { handler: wrapAutoresponder, schema: OpenAIAskParamsSchema, meta: { description: 'Alias adicional.' } },
  'mcp.health': { handler: health, schema: HealthParamsSchema, meta: { description: 'Health basico.' } },
  'mcp.describe': { handler: async () => describeServer(), schema: z.object({}).optional(), meta: { description: 'Describe server.' } },
};

app.get('/health', async (_req: Request, res: Response) => {
  try { res.json(await health({})); } catch (e: any) { res.status(500).json({ status: 'error', message: e.message }); }
});

app.post('/jsonrpc', async (req: Request, res: Response) => {
  const body = req.body;
  if (Array.isArray(body)) {
    const responses = await Promise.all(body.map(r => handleSingle(r)));
    return res.json(responses);
  }
  res.json(await handleSingle(body));
});

async function handleSingle(req: JsonRpcRequest): Promise<JsonRpcResponse> {
  const { jsonrpc, method, params, id } = req;
  if (jsonrpc !== JSONRPC_VERSION) return makeJsonRpcError(id, -32600, "Invalid Request: jsonrpc must be '2.0'");
  const def = mcpMethods[method];
  if (!def) return makeJsonRpcError(id, -32601, `Method not found: ${method}`);
  try {
    const validated = def.schema.parse(params);
    const result = await def.handler(validated);
    return makeJsonRpcResult(id, result);
  } catch (error: any) {
    if (error instanceof z.ZodError) return makeJsonRpcError(id, -32602, 'Invalid params', error.errors);
    return makeJsonRpcError(id, -32000, 'Internal error', { message: error.message });
  }
}

function describeServer() {
  return {
    name: 'mcp-openai-minimal',
    version: '2.0.0',
    tools: Object.entries(mcpMethods).map(([name, def]) => ({
      name,
      description: def.meta?.description || '',
    })),
  };
}

const PORT = config.port; const HOST = config.host;
app.listen(PORT, HOST, () => {
  console.log(`MCP minimal listening on http://${HOST}:${PORT}`);
});
