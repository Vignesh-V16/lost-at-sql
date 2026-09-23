import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

/**
 * Minimal .env loader (no dependency). Values already present in the
 * process environment always win, so deployment platforms can override.
 */
function loadDotEnv() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [path.resolve(here, '../../.env'), path.resolve(process.cwd(), '.env')];
  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    const text = fs.readFileSync(file, 'utf8');
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim();
      let value = line.slice(eq + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = value;
    }
    break;
  }
}

loadDotEnv();

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(5000),
  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().default('1h'),
  REFRESH_TTL_HOURS: z.coerce.number().positive().default(12),
  COOKIE_SECURE: z.enum(['0', '1', 'true', 'false']).default('0').transform((v) => v === '1' || v === 'true'),
  CLIENT_ORIGIN: z.string().default('http://localhost:5173'),
  /**
   * Accept any browser on the local network, whatever address DHCP gave it.
   * On by default so a room of machines works over Ethernet or Wi-Fi with no
   * edits; set to 0 for a public deployment, where CLIENT_ORIGIN rules alone.
   */
  ALLOW_LAN_ORIGINS: z.enum(['0', '1', 'true', 'false']).default('1').transform((v) => v === '1' || v === 'true'),
  SEED_COORDINATOR_ID: z.string().default('coordinator'),
  SEED_COORDINATOR_CODE: z.string().default('BLACK-CIPHER-2045'),
  QUERY_TIMEOUT_MS: z.coerce.number().int().positive().default(4000),
  QUERY_MAX_ROWS: z.coerce.number().int().positive().default(500),
  EVIDENCE_MAX_ROWS: z.coerce.number().int().positive().default(20),
  SQL_POOL_SIZE: z.coerce.number().int().min(1).max(16).optional(),
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
  /** Serve the built client (client/dist) from this process — single-process production deployments. */
  SERVE_CLIENT: z.enum(['0', '1', 'true', 'false']).default('0').transform((v) => v === '1' || v === 'true'),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
  // eslint-disable-next-line no-console
  console.error(`\n[LOST AT SQL] Invalid environment configuration:\n${issues}\n\nCopy server/.env.example to server/.env and fill in the values.\n`);
  process.exit(1);
}

export const env = Object.freeze({
  ...parsed.data,
  isProduction: parsed.data.NODE_ENV === 'production',
  clientOrigins: parsed.data.CLIENT_ORIGIN.split(',').map((s) => s.trim()).filter(Boolean),
});
