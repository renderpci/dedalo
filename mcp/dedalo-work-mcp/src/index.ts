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

let stdioServer: ReturnType<typeof createWorkServer> | null = null;
const httpServers = new Map<string, ReturnType<typeof createWorkServer>>();
const httpTransports = new Map<string, WebStandardStreamableHTTPServerTransport>();

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
		const { port, host, allowedOrigins } = config!.http;
		// DIFFTS-12: warn loudly when exposed beyond loopback without a client token.
		const isLoopback = host === '127.0.0.1' || host === 'localhost' || host === '::1';
		if (!isLoopback && !process.env.DEDALO_MCP_HTTP_TOKEN) {
			logger.warn(`MCP HTTP transport bound to non-loopback host '${host}' without DEDALO_MCP_HTTP_TOKEN — set a token to authenticate clients.`);
		}
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

				// DIFFTS-12: the Origin check is not authentication (it permits clients
				// that send no Origin, e.g. curl). When DEDALO_MCP_HTTP_TOKEN is set,
				// require it as a bearer token on every non-preflight request, independent
				// of host/Origin. Opt-in so local stdio/dev usage is unaffected.
				const requiredToken = process.env.DEDALO_MCP_HTTP_TOKEN;
				if (requiredToken) {
					const provided = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
					if (provided !== requiredToken) {
						return new Response('Unauthorized', { status: 401, headers: corsHeaders });
					}
				}

				const sessionId = req.headers.get('mcp-session-id');
				let transport = sessionId ? httpTransports.get(sessionId) : undefined;

				if (!transport && await isInitializeRequest(req)) {
					let newTransport: WebStandardStreamableHTTPServerTransport;
					let sessionServer: ReturnType<typeof createWorkServer> | null = null;
					newTransport = new WebStandardStreamableHTTPServerTransport({
						sessionIdGenerator: () => crypto.randomUUID(),
						onsessioninitialized: (newSessionId) => {
							httpTransports.set(newSessionId, newTransport);
							if (sessionServer) {
								httpServers.set(newSessionId, sessionServer);
							}
						},
					});
					newTransport.onclose = () => {
						const closedSessionId = newTransport.sessionId;
						if (closedSessionId) {
							httpTransports.delete(closedSessionId);
							httpServers.delete(closedSessionId);
						}
					};

					sessionServer = createWorkServer({
						client,
						logger,
						limiter,
					});
					await sessionServer.connect(newTransport);
					transport = newTransport;
				}

				if (!transport) {
					return new Response(
						JSON.stringify({
							jsonrpc: '2.0',
							error: {
								code: -32000,
								message: 'Bad Request: No valid MCP session ID provided',
							},
							id: null,
						}),
						{ status: 400, headers: { 'Content-Type': 'application/json' } }
					);
				}

				const response = await transport.handleRequest(req);
				return response;
			},
			websocket: { open: () => {}, close: () => {}, message: () => {} },
		});
		logger.info({ port, host, allowedOrigins }, 'dedalo-work-mcp started on HTTP');
	} else {
		const transport = new StdioServerTransport();
		stdioServer = createWorkServer({
			client,
			logger,
			limiter,
		});
		await stdioServer.connect(transport);
		logger.info('dedalo-work-mcp started on stdio');
	}
}

function shutdown(): void {
	logger.info('Shutting down dedalo-work-mcp...');
	const closeTasks = [
		...Array.from(httpServers.values()).map((server) => server.close()),
		...(stdioServer ? [stdioServer.close()] : []),
	];
	Promise.all(closeTasks)
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
