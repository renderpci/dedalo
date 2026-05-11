import type { Logger } from 'pino';

/**
 * Runtime configuration for `dedalo-work-mcp`.
 *
 * Authorisation note: this MCP relies entirely on Dédalo's user/profile
 * permission system. There are no MCP-layer capability flags. Configure
 * the MCP with a Dédalo user whose profile matches the agent's role
 * (read-only, ontology editor, admin, ...).
 */
export interface WorkMcpConfig {
	apiUrl: string;
	username: string;
	password: string;
	logLevel: string;
	rateLimit: {
		capacity: number;
		refillRateMs: number;
	} | null;
	http: {
		port: number;
		host: string;
		allowedOrigins: string[];
	};
}

const DEPRECATED_VARS = [
	'DEDALO_MCP_TOKEN',
	'DEDALO_WORK_READ_ONLY',
	'DEDALO_WORK_WRITE',
	'DEDALO_WORK_ADMIN',
] as const;

/**
 * Parse and validate environment variables.
 *
 * Required:
 * - `DEDALO_WORK_API_URL`     base Dédalo URL.
 * - `DEDALO_WORK_USERNAME`    Dédalo user name.
 * - `DEDALO_WORK_PASSWORD`    Dédalo password.
 *
 * Optional:
 * - `LOG_LEVEL`               pino level (default `info`).
 * - `RATE_LIMIT_CAPACITY`     token-bucket size (default `0` = disabled).
 * - `RATE_LIMIT_REFILL_MS`    refill ms (default `60000`).
 * - `DEDALO_MCP_HTTP_PORT`    HTTP transport port (default `3001`).
 * - `DEDALO_MCP_HTTP_HOST`    HTTP transport bind host (default `127.0.0.1`).
 * - `DEDALO_MCP_ALLOWED_ORIGINS` comma-separated CORS allowlist (empty by default).
 */
export function loadConfig(env: NodeJS.ProcessEnv, logger: Logger): WorkMcpConfig {
	for (const v of DEPRECATED_VARS) {
		if (env[v] !== undefined) {
			logger.warn(
				{ var: v },
				'Deprecated env var ignored. Authorisation is now delegated to the Dédalo user profile; configure DEDALO_WORK_USERNAME and DEDALO_WORK_PASSWORD to a user with the appropriate profile.'
			);
		}
	}

	const apiUrl = env.DEDALO_WORK_API_URL ?? '';
	const username = env.DEDALO_WORK_USERNAME ?? '';
	const password = env.DEDALO_WORK_PASSWORD ?? '';

	const missing: string[] = [];
	if (!apiUrl) missing.push('DEDALO_WORK_API_URL');
	if (!username) missing.push('DEDALO_WORK_USERNAME');
	if (!password) missing.push('DEDALO_WORK_PASSWORD');
	if (missing.length > 0) {
		throw new Error(
			`Missing required env vars: ${missing.join(', ')}. The work MCP authenticates as a Dédalo user; set both username and password.`
		);
	}

	const capacity = parseInt(env.RATE_LIMIT_CAPACITY ?? '0', 10);
	const refillRateMs = parseInt(env.RATE_LIMIT_REFILL_MS ?? '60000', 10);

	const port = parseInt(env.DEDALO_MCP_HTTP_PORT ?? '3001', 10);
	const host = env.DEDALO_MCP_HTTP_HOST ?? '127.0.0.1';
	const allowedOrigins = (env.DEDALO_MCP_ALLOWED_ORIGINS ?? '')
		.split(',')
		.map((s) => s.trim())
		.filter(Boolean);

	return {
		apiUrl,
		username,
		password,
		logLevel: env.LOG_LEVEL ?? 'info',
		rateLimit: capacity > 0 ? { capacity, refillRateMs } : null,
		http: { port, host, allowedOrigins },
	};
}
