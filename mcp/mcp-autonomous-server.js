#!/usr/bin/env node

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Intentar cargar variables de entorno desde el directorio del proyecto
const envPaths = [
  join(__dirname, '.env'),
  join(__dirname, '..', '.env'),
  join(__dirname, '..', '..', '.env'),
];

for (const envPath of envPaths) {
  try {
    const envContent = readFileSync(envPath, 'utf8');
    const envVars = envContent.split('\n').filter(line => line.includes('='));
    envVars.forEach(line => {
      const [key, ...valueParts] = line.split('=');
      if (key && valueParts.length > 0) {
        const value = valueParts.join('=').replace(/^["'](.*)["']$/, '$1');
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
    });
    console.error(`📋 Variables de entorno cargadas desde: ${envPath}`);
    break;
  } catch (error) {
    // Ignorar si no existe el archivo
  }
}

// Re-exportar el servidor con configuración cargada
import('./stdio-server.js');
