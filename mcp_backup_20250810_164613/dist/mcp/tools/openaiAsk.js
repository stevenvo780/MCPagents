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
exports.OpenAIAskParamsSchema = void 0;
exports.openaiAsk = openaiAsk;
const zod_1 = require("zod");
const node_fetch_1 = __importDefault(require("node-fetch"));
const config_1 = __importStar(require("../../../src/config"));
// In-memory cache
const cache = new Map();
// Simple token bucket for RPM (requests per minute)
let windowStart = Date.now();
let callsThisWindow = 0;
function rateLimitOk() {
    if (!config_1.default.openaiRpm)
        return true;
    const now = Date.now();
    if (now - windowStart > 60_000) {
        windowStart = now;
        callsThisWindow = 0;
    }
    if (callsThisWindow >= config_1.default.openaiRpm)
        return false;
    callsThisWindow++;
    return true;
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
exports.OpenAIAskParamsSchema = zod_1.z.object({
    prompt: zod_1.z.string().optional(),
    question: zod_1.z.string().optional(),
    context: zod_1.z.string().optional(),
    system: zod_1.z.string().optional(),
    model: zod_1.z.string().optional(),
    temperature: zod_1.z.number().min(0).max(2).optional().default(0.2),
    maxTokens: zod_1.z.number().min(16).max(8192).optional(),
    cache: zod_1.z.boolean().optional().default(true),
    force: zod_1.z.boolean().optional().default(false),
    top_p: zod_1.z.number().min(0).max(1).optional(),
    presence_penalty: zod_1.z.number().min(-2).max(2).optional(),
    frequency_penalty: zod_1.z.number().min(-2).max(2).optional(),
}).refine(p => p.prompt || p.question, { message: 'Debe proporcionar prompt o question' });
async function openaiAsk(params) {
    const { prompt, question, context, system, model, temperature, maxTokens, cache: useCache, force, top_p, presence_penalty, frequency_penalty } = params;
    const content = (prompt || question || '').trim();
    if (!content)
        throw new Error('E_EMPTY_CONTENT: Prompt vacío');
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey)
        throw new Error('E_OPENAI_API_KEY_MISSING: Falta OPENAI_API_KEY');
    const baseUrl = process.env.OPENAI_BASE_URL || 'https://api.openai.com';
    const finalModel = model || process.env.OPENAI_MODEL || process.env.MCP_MODEL || 'gpt-4o-mini';
    const effectiveSystem = system || config_1.default.defaultSystem || 'Eres un agente autónomo que responde con precisión y brevedad.';
    const cacheKey = (0, config_1.hashKey)({ m: finalModel, sys: effectiveSystem, ctx: context, t: temperature, p: content });
    if (useCache && !force && cache.has(cacheKey)) {
        return { ...cache.get(cacheKey), cached: true };
    }
    let attempt = 0;
    const maxRetries = config_1.default.openaiMaxRetries;
    let lastErr = null;
    while (attempt <= maxRetries) {
        if (!rateLimitOk()) {
            await sleep(500); // esperar siguiente slot
            continue;
        }
        try {
            const messages = [];
            if (effectiveSystem)
                messages.push({ role: 'system', content: effectiveSystem });
            if (context)
                messages.push({ role: 'system', content: `Contexto:\n${context}` });
            messages.push({ role: 'user', content });
            const body = {
                model: finalModel,
                messages,
                temperature: temperature ?? 0.2,
            };
            if (typeof maxTokens === 'number')
                body.max_tokens = maxTokens;
            if (typeof top_p === 'number')
                body.top_p = top_p;
            if (typeof presence_penalty === 'number')
                body.presence_penalty = presence_penalty;
            if (typeof frequency_penalty === 'number')
                body.frequency_penalty = frequency_penalty;
            const started = Date.now();
            const resp = await (0, node_fetch_1.default)(`${baseUrl.replace(/\/$/, '')}/v1/chat/completions`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            if (!resp.ok) {
                const text = await resp.text();
                if (resp.status >= 500 || resp.status === 429)
                    throw new Error(`E_RETRY_${resp.status}: ${text}`);
                throw new Error(`E_OPENAI_HTTP_${resp.status}: ${text}`);
            }
            const data = await resp.json();
            const answer = data.choices?.[0]?.message?.content || '';
            const result = { answer, model: finalModel, usage: data.usage || null, latencyMs: Date.now() - started };
            if (useCache) {
                cache.set(cacheKey, { answer, model: finalModel, usage: data.usage || null, ts: Date.now() });
                // Evict if above size
                if (cache.size > config_1.default.cacheMaxEntries) {
                    const oldest = [...cache.entries()].sort((a, b) => a[1].ts - b[1].ts).slice(0, cache.size - config_1.default.cacheMaxEntries);
                    oldest.forEach(([k]) => cache.delete(k));
                }
            }
            return result;
        }
        catch (e) {
            lastErr = e;
            attempt++;
            if (attempt > maxRetries)
                break;
            const delay = config_1.default.openaiRetryBaseDelayMs * Math.pow(2, attempt - 1) + Math.random() * 100;
            await sleep(delay);
        }
    }
    throw new Error(`E_OPENAI_FAILED: ${lastErr?.message || 'Error desconocido'} tras ${config_1.default.openaiMaxRetries} reintentos`);
}
