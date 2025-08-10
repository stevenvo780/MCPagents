import dotenv from 'dotenv';

dotenv.config(); // Load environment variables from .env file

interface AppConfig {
  port: number;
  host: string;
}

const config: AppConfig = {
  port: parseInt(process.env.MCP_PORT || '7088', 10),
  host: process.env.MCP_HOST || '0.0.0.0',
};

export default config;
