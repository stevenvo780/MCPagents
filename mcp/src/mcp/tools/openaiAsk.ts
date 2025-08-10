import { z } from 'zod';
import fetch from 'node-fetch';
import config, { hashKey } from '../../../src/config';

// In-memory cache
const cache = new Map<string, { answer: string; ts: number; model: string; usage: any }>();

// Simple token bucket for RPM (requests per minute)
let windowStart = Date.now();
let callsThisWindow = 0;

function rateLimitOk() {
  if (!config.openaiRpm) return true;
  const now = Date.now();
  if (now - windowStart > 60_000) { windowStart = now; callsThisWindow = 0; }
  if (callsThisWindow >= config.openaiRpm) return false;
  callsThisWindow++; return true;
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

export const OpenAIAskParamsSchema = z.object({
  prompt: z.string().optional(),
  question: z.string().optional(),
  context: z.string().optional(),
  system: z.string().optional(),
  model: z.string().optional(),
  temperature: z.number().min(0).max(2).optional().default(0.2),
  maxTokens: z.number().min(16).max(8192).optional(),
  cache: z.boolean().optional().default(true),
  force: z.boolean().optional().default(false),
  top_p: z.number().min(0).max(1).optional(),
  presence_penalty: z.number().min(-2).max(2).optional(),
  frequency_penalty: z.number().min(-2).max(2).optional(),
}).refine(p => p.prompt || p.question, { message: 'Debe proporcionar prompt o question' });

export type OpenAIAskParams = z.infer<typeof OpenAIAskParamsSchema>;

export async function openaiAsk(params: OpenAIAskParams) {
  const { prompt, question, context, system, model, temperature, maxTokens, cache: useCache, force, top_p, presence_penalty, frequency_penalty } = params;
  const content = (prompt || question || '').trim();
  if (!content) throw new Error('E_EMPTY_CONTENT: Prompt vacío');
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('E_OPENAI_API_KEY_MISSING: Falta OPENAI_API_KEY');
  const baseUrl = process.env.OPENAI_BASE_URL || 'https://api.openai.com';
  const finalModel = model || process.env.OPENAI_MODEL || process.env.MCP_MODEL || 'gpt-4o-mini';

  const effectiveSystem = system || config.defaultSystem || 'Eres un agente autónomo que responde con precisión y brevedad.';

  const cacheKey = hashKey({ m: finalModel, sys: effectiveSystem, ctx: context, t: temperature, p: content });
  if (useCache && !force && cache.has(cacheKey)) {
    return { ...cache.get(cacheKey), cached: true };
  }

  let attempt = 0;
  const maxRetries = config.openaiMaxRetries;
  let lastErr: any = null;
  while (attempt <= maxRetries) {
    if (!rateLimitOk()) {
      await sleep(500); // esperar siguiente slot
      continue;
    }
    try {
      const messages: any[] = [];
      if (effectiveSystem) messages.push({ role: 'system', content: effectiveSystem });
      if (context) messages.push({ role: 'system', content: `Contexto:\n${context}` });
      messages.push({ role: 'user', content });

      const body: any = {
        model: finalModel,
        messages,
        temperature: temperature ?? 0.2,
      };
      if (typeof maxTokens === 'number') body.max_tokens = maxTokens;
      if (typeof top_p === 'number') body.top_p = top_p;
      if (typeof presence_penalty === 'number') body.presence_penalty = presence_penalty;
      if (typeof frequency_penalty === 'number') body.frequency_penalty = frequency_penalty;

      const started = Date.now();
      const resp = await fetch(`${baseUrl.replace(/\/$/, '')}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!resp.ok) {
        const text = await resp.text();
        if (resp.status >= 500 || resp.status === 429) throw new Error(`E_RETRY_${resp.status}: ${text}`);
        throw new Error(`E_OPENAI_HTTP_${resp.status}: ${text}`);
      }
      const data = await resp.json();
      const answer = data.choices?.[0]?.message?.content || '';
      const result = { answer, model: finalModel, usage: data.usage || null, latencyMs: Date.now() - started };
      if (useCache) {
        cache.set(cacheKey, { answer, model: finalModel, usage: data.usage || null, ts: Date.now() });
        // Evict if above size
        if (cache.size > config.cacheMaxEntries) {
          const oldest = [...cache.entries()].sort((a,b)=>a[1].ts-b[1].ts).slice(0, cache.size - config.cacheMaxEntries);
            oldest.forEach(([k])=>cache.delete(k));
        }
      }
      return result;
    } catch (e: any) {
      lastErr = e;
      attempt++;
      if (attempt > maxRetries) break;
      const delay = config.openaiRetryBaseDelayMs * Math.pow(2, attempt - 1) + Math.random()*100;
      await sleep(delay);
    }
  }
  throw new Error(`E_OPENAI_FAILED: ${lastErr?.message || 'Error desconocido'} tras ${config.openaiMaxRetries} reintentos`);
}
