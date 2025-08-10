"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.hashKey = hashKey;
const dotenv_1 = __importDefault(require("dotenv"));
const crypto_1 = __importDefault(require("crypto"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
// Intento primario: .env en cwd (mcp/)
const primary = dotenv_1.default.config();
// Fallback: buscar .env en el directorio padre del monorepo si no se cargó OPENAI_API_KEY
if (!process.env.OPENAI_API_KEY) {
    const candidate = path_1.default.resolve(__dirname, '../../../.env');
    if (fs_1.default.existsSync(candidate)) {
        dotenv_1.default.config({ path: candidate });
    }
}
const config = {
    port: parseInt(process.env.MCP_PORT || '7088', 10),
    host: process.env.MCP_HOST || '0.0.0.0',
    defaultSystem: process.env.MCP_DEFAULT_SYSTEM || null,
    openaiMaxRetries: parseInt(process.env.OPENAI_MAX_RETRIES || '3', 10),
    openaiRetryBaseDelayMs: parseInt(process.env.OPENAI_RETRY_BASE_DELAY_MS || '200', 10),
    openaiRpm: process.env.OPENAI_RPM ? parseInt(process.env.OPENAI_RPM, 10) : null,
    cacheMaxEntries: parseInt(process.env.MCP_CACHE_MAX_ENTRIES || '100', 10),
};
function hashKey(data) { return crypto_1.default.createHash('sha256').update(JSON.stringify(data)).digest('hex'); }
exports.default = config;
