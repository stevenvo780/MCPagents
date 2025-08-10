import { z } from 'zod';
import fetch from 'node-fetch';

export const OpenAIAskParamsSchema = z.object({
  prompt: z.string().optional(),
  question: z.string().optional(),
  context: z.string().optional(),
  system: z.string().optional(),
  model: z.string().optional(),
  temperature: z.number().min(0).max(2).optional().default(0.2),
}).refine(p => p.prompt || p.question, { message: 'Debe proporcionar prompt o question' });

export type OpenAIAskParams = z.infer<typeof OpenAIAskParamsSchema>;

export async function openaiAsk(params: OpenAIAskParams) {
  const { prompt, question, context, system, model, temperature } = params;
  const content = prompt || question || '';
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('E_OPENAI_API_KEY_MISSING: Falta OPENAI_API_KEY en el entorno');
  }
  const baseUrl = process.env.OPENAI_BASE_URL || 'https://api.openai.com';
  const finalModel = model || process.env.OPENAI_MODEL || process.env.MCP_MODEL || 'gpt-4o-mini';

  const messages: any[] = [];
  if (system) messages.push({ role: 'system', content: system });
  if (context) messages.push({ role: 'system', content: `Contexto:\n${context}` });
  messages.push({ role: 'user', content });

  const body = {
    model: finalModel,
    messages,
    temperature: temperature ?? 0.2,
  };

  const started = Date.now();
  const resp = await fetch(`${baseUrl.replace(/\/$/, '')}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`E_OPENAI_HTTP_${resp.status}: ${text}`);
  }
  const data = await resp.json();
  const answer = data.choices?.[0]?.message?.content || '';
  return {
    answer,
    model: finalModel,
    usage: data.usage || null,
    latencyMs: Date.now() - started,
  };
}
