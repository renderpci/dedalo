import { z } from 'zod';

const envSchema = z.object({
  DEPLOYMENT_MODE: z.enum(['apache', 'nginx', 'standalone']).default('apache'),
  PORT: z.coerce.number().default(3100),
  HOST: z.string().default('127.0.0.1'),
  BASE_PATH: z.string().default('/publication/server_api/v2'),
  TRUST_PROXY: z.coerce.boolean().default(true),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('production'),

  DB_HOST: z.string().default('localhost'),
  DB_PORT: z.coerce.number().default(3306),
  DB_USER: z.string().default('readonly_user'),
  DB_PASSWORD: z.string().default(''),
  DB_NAME: z.string().default('dedalo_web'),
  DB_POOL_MIN: z.coerce.number().default(2),
  DB_POOL_MAX: z.coerce.number().default(10),
  DB_QUERY_TIMEOUT: z.coerce.number().default(5000),

  API_KEYS: z.string().default(''),
  RATE_LIMIT_RPM: z.coerce.number().default(100),
  CORS_ORIGIN: z.string().default('*'),
  MAX_BODY_SIZE: z.coerce.number().default(65536),

  MEDIA_BASE_URL: z.string().default('/dedalo/media'),

  MCP_ENABLED: z.coerce.boolean().default(true),
  MCP_PATH: z.string().default('/mcp'),

  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = parsed.data;

export const isProduction = config.NODE_ENV === 'production';
export const isDevelopment = config.NODE_ENV === 'development';

export const apiKeys = config.API_KEYS
  ? config.API_KEYS.split(',').map(k => k.trim()).filter(Boolean)
  : [];

export const isAuthRequired = apiKeys.length > 0;
