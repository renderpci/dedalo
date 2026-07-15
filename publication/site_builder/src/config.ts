/**
 * The whole of the daemon's configuration: parse the environment once, at import, and
 * hand out a frozen, typed, already-validated object.
 *
 * Same discipline as publication/server_api/v2/src/config.ts, for the same two reasons:
 *
 *   - **Invalid config kills the process** (process.exit(1) below) rather than degrading
 *     into a running daemon with a surprising default. A site builder that came up with
 *     an empty SERVICE_TOKEN, or pointing its workspaces at the wrong root, would be
 *     worse than one that never came up.
 *   - **Nothing downstream touches process.env.** Every consumer imports `config`, so the
 *     schema below is the single, complete census of what this service can be tuned
 *     with. This matters doubly here because agent/build children get a CONSTRUCTED
 *     environment (drivers allowlist what they forward) — a stray process.env read
 *     elsewhere would blur that boundary.
 *
 * LLM provider credentials live ONLY in this file's schema and this service's .env:
 * they are handed to the agent drivers (src/drivers/) and never to the engine, never
 * into a site workspace, never into a response body.
 */

import { resolve } from 'node:path';
import { z } from 'zod';

// The three filesystem roots must be absolute — every path helper confines against them.
// A relative value (a deploy typo, or a test fixture) is resolved against cwd here, once,
// so nothing downstream ever sees a relative root.
const absolutePath = z.string().transform(value => resolve(value));

const envSchema = z.object({
  DEPLOYMENT_MODE: z.enum(['apache', 'nginx', 'standalone']).default('nginx'),
  PORT: z.coerce.number().default(3200),
  // Loopback by default: the expected deployment is behind Apache or nginx, so binding
  // 0.0.0.0 would publish the daemon alongside the proxy rather than behind it.
  HOST: z.string().default('127.0.0.1'),
  // The subpath the proxy mounts us under; router.ts strips it before matching.
  BASE_PATH: z.string().default('/publication/site_builder'),
  // Defaults to production: the unsafe direction (leaking internal error messages) must
  // be the one you have to ask for.
  NODE_ENV: z.enum(['development', 'production', 'test']).default('production'),

  // The one credential the engine holds. Every request except /health must carry it as
  // `Authorization: Bearer <token>`; the engine is the SOLE client and the sole
  // authorizer — this daemon trusts the engine's authz decisions and records the actor
  // the engine reports. Minimum length enforced here so a truncated paste fails the
  // boot, not the audit trail.
  SERVICE_TOKEN: z.string().min(32, 'SERVICE_TOKEN must be at least 32 characters'),

  // The three filesystem roots. Workspaces hold the git repos the agents work in;
  // preprod and prod hold immutable release copies plus one symlink per site that the
  // web server serves. They must be distinct trees: prod is a COPY, so deleting a
  // workspace can never break a published site.
  SITES_ROOT: absolutePath.default('/var/lib/dedalo_sites/workspaces'),
  PREPROD_ROOT: absolutePath.default('/var/lib/dedalo_sites/preprod'),
  PROD_ROOT: absolutePath.default('/var/www/dedalo_sites'),

  // Returned to the UI so it can point the preview iframe / "open site" links somewhere
  // resolvable. The daemon never serves site bytes itself — the web server does.
  PREPROD_BASE_URL: z.string().min(1, 'PREPROD_BASE_URL is required (e.g. https://preprod.example.org)'),
  PROD_BASE_URL: z.string().min(1, 'PROD_BASE_URL is required (e.g. https://www.example.org)'),

  // Where the generated sites read their data from: the read-only Publication API v2.
  // Also handed to the agent as its MCP endpoint (<PUBLICATION_API_URL>/mcp) and quoted
  // in the generated AGENTS.md. This is the ONLY data source a site is built against.
  PUBLICATION_API_URL: z.string().min(1, 'PUBLICATION_API_URL is required'),
  // Only needed when the v2 instance has API_KEYS configured (default open).
  PUBLICATION_API_KEY: z.string().default(''),

  // Default agent driver for new sites; site.json may pin a different one per site.
  AGENT_DRIVER: z.enum(['claude_code', 'opencode', 'pi']).default('claude_code'),
  CLAUDE_CODE_BIN: z.string().default('claude'),
  OPENCODE_BIN: z.string().default(''),
  PI_BIN: z.string().default(''),
  // Anthropic credential for the claude_code driver.
  ANTHROPIC_API_KEY: z.string().default(''),
  // Extra per-driver provider credentials, forwarded ONLY to that driver's child
  // process: comma-separated KEY=VALUE pairs (e.g. "OPENAI_API_KEY=sk-...").
  OPENCODE_ENV: z.string().default(''),
  PI_ENV: z.string().default(''),

  // Limits. MAX_CONCURRENT_SESSIONS is a global semaphore across sites; per site it is
  // always exactly one active turn (sessions/manager.ts).
  MAX_SITES: z.coerce.number().int().min(1).default(20),
  MAX_CONCURRENT_SESSIONS: z.coerce.number().int().min(1).default(2),
  // Wall clock for one agent turn (one CLI invocation). Generous: real build-a-page
  // turns run minutes, but nothing should run forever on an unattended server.
  SESSION_TURN_TIMEOUT_MS: z.coerce.number().int().min(1000).default(20 * 60 * 1000),
  INSTALL_TIMEOUT_MS: z.coerce.number().int().min(1000).default(5 * 60 * 1000),
  BUILD_TIMEOUT_MS: z.coerce.number().int().min(1000).default(5 * 60 * 1000),
  // Checked before starting a session or build; a workspace over quota refuses new work
  // until someone cleans it up (agents can pull surprisingly heavy node_modules trees).
  SITE_DISK_QUOTA_MB: z.coerce.number().int().min(1).default(1024),
  // Release directories kept per site per surface for rollback.
  RELEASES_RETAINED: z.coerce.number().int().min(1).default(5),

  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

// Fail the process, not the request. All field errors are reported at once so a
// misconfigured deploy is fixed in one pass, not one restart per typo.
const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = parsed.data;

export const isProduction = config.NODE_ENV === 'production';
export const isDevelopment = config.NODE_ENV === 'development';

/** Splits a comma-separated KEY=VALUE env value into a record (driver cred allowlists). */
export function parseEnvPairs(value: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const pair of value.split(',')) {
    const trimmed = pair.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    out[trimmed.slice(0, eq)] = trimmed.slice(eq + 1);
  }
  return out;
}
