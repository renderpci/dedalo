import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import pino from 'pino';
import { WorkClient, TokenBucketRateLimiter } from '@dedalo/mcp-common';
import { loadConfig } from './config.js';
import { createWorkServer } from './server.js';

const useHttp = process.argv.includes('--http');
const logger = pino({
	level: process.env.LOG_LEVEL ?? 'info',
}, process.stderr);

let config;
try {
	config = loadConfig(process.env, logger);
} catch (err) {
	logger.error({ err: (err as Error).message }, 'Configuration error');
	process.exit(1);
}

const client = new WorkClient({
	baseUrl: config.apiUrl,
	auth: { type: 'session', username: config.username, password: config.password, autoLogin: true },
	autoLogin: true,
});

const limiter = config.rateLimit ? new TokenBucketRateLimiter(config.rateLimit) : null;

const server = createWorkServer({
	client,
	logger,
	limiter,
});

// Periodically evict stale rate-limiter buckets to prevent memory leaks.
if (limiter) {
	const CLEANUP_INTERVAL_MS = 60_000;
	const cleanupTimer = setInterval(() => {
		const removed = limiter.cleanup();
		if (removed > 0) {
			logger.debug({ removed, remaining: limiter.size }, 'Rate limiter cleanup');
		}
	}, CLEANUP_INTERVAL_MS);
	cleanupTimer.unref();
}

/**
 * Validate an incoming HTTP Origin against the allowlist.
 * No allowlist + no Origin header → permit (typical for non-browser clients).
 * No allowlist + Origin present → reject (defence-in-depth against DNS rebinding).
 */
function isOriginAllowed(origin: string | null, allowlist: string[]): boolean {
	if (!origin) return true;
	if (allowlist.length === 0) return false;
	return allowlist.includes(origin);
}

async function isInitializeRequest(req: Request): Promise<boolean> {
	if (req.method !== 'POST') return false;

	try {
		const body = await req.clone().json();
		const messages = Array.isArray(body) ? body : [body];
		return messages.some((message) => message && message.method === 'initialize');
	} catch {
		return false;
	}
}

async function main(): Promise<void> {

	// Prime CSRF before any tool call so the first request succeeds.
	try {
		await client.bootstrapCsrf();
		logger.info('CSRF token bootstrapped');
	} catch (err) {
		logger.warn({ err: (err as Error).message }, 'CSRF bootstrap failed; will retry on first call');
	}

	if (useHttp) {
		const transport = new WebStandardStreamableHTTPServerTransport({
			sessionIdGenerator: () => crypto.randomUUID(),
		});
		await server.connect(transport);

		const { port, host, allowedOrigins } = config!.http;
		Bun.serve({
			port,
			hostname: host,
			fetch: async (req: Request) => {
				const origin = req.headers.get('origin');
				if (!isOriginAllowed(origin, allowedOrigins)) {
					return new Response('Forbidden: origin not allowed', { status: 403 });
				}
				const corsHeaders: Record<string, string> = {
					'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
					'Access-Control-Allow-Headers': 'Content-Type, X-Dedalo-Csrf-Token',
				};
				if (origin) corsHeaders['Access-Control-Allow-Origin'] = origin;

				if (req.method === 'OPTIONS') {
					return new Response(null, { status: 204, headers: corsHeaders });
				}
				return transport.handleRequest(req);
			},
			websocket: { open: () => {}, close: () => {}, message: () => {} },
		});
		logger.info({ port, host, allowedOrigins }, 'dedalo-work-mcp started on HTTP');
	} else {
		const transport = new StdioServerTransport();
		await server.connect(transport);
		logger.info('dedalo-work-mcp started on stdio');
	}
}

function shutdown(): void {
	logger.info('Shutting down dedalo-work-mcp...');
	server.close()
		.then(() => {
			logger.info('Server closed');
			process.exit(0);
		})
		.catch((err: Error) => {
			logger.error(err, 'Error during shutdown');
			process.exit(1);
		});
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

main().catch((err: Error) => {
	logger.error(err, 'Fatal error');
	process.exit(1);
});
