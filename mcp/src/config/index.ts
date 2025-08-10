import dotenv from 'dotenv';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

// Intento primario: .env en cwd (mcp/)
const primary = dotenv.config();
// Fallback: buscar .env en el directorio padre del monorepo si no se cargó OPENAI_API_KEY
if (!process.env.OPENAI_API_KEY) {
  const candidate = path.resolve(__dirname, '../../../.env');
  if (fs.existsSync(candidate)) {
    dotenv.config({ path: candidate });
  }
}

interface AppConfig {
  port: number;
  host: string;
  defaultSystem: string | null;
  openaiMaxRetries: number;
  openaiRetryBaseDelayMs: number;
  openaiRpm: number | null;
  cacheMaxEntries: number;
}

const config: AppConfig = {
  port: parseInt(process.env.MCP_PORT || '7088', 10),
  host: process.env.MCP_HOST || '0.0.0.0',
  defaultSystem: process.env.MCP_DEFAULT_SYSTEM || null,
  openaiMaxRetries: parseInt(process.env.OPENAI_MAX_RETRIES || '3', 10),
  openaiRetryBaseDelayMs: parseInt(process.env.OPENAI_RETRY_BASE_DELAY_MS || '200', 10),
  openaiRpm: process.env.OPENAI_RPM ? parseInt(process.env.OPENAI_RPM, 10) : null,
  cacheMaxEntries: parseInt(process.env.MCP_CACHE_MAX_ENTRIES || '100', 10),
};

export function hashKey(data: any): string { return crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex'); }

export default config;
