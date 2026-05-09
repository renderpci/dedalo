import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { PublicClient, PublicationOptions } from '@dedalo/mcp-common';
import { TokenBucketRateLimiter } from '@dedalo/mcp-common';
import type { Logger } from 'pino';

export function so(a: unknown, g: string): PublicationOptions {
	return { ...(a as object), dedalo_get: g } as PublicationOptions;
}

export function reg(
	server: McpServer,
	name: string,
	description: string,
	schema: z.ZodTypeAny,
	handler: (args: unknown) => Promise<Record<string, unknown>>,
	limiter: TokenBucketRateLimiter | null,
	logger: Logger
): void {
	server.registerTool(
		name,
		{ description, inputSchema: schema as any },
		async (args: unknown, extra: { sessionId?: string }) => {
			if (limiter) {
				const sessionId = extra.sessionId ?? 'default';
				const result = limiter.consume(sessionId);
				if (!result.allowed) {
					return {
						content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Rate limit exceeded', retryAfterMs: result.retryAfterMs }) }],
						isError: true,
					};
				}
			}

			const startTime = Date.now();
			try {
				const result = await handler(args);
				const latency = Date.now() - startTime;
				logger.info({ tool: name, latency }, 'Tool call succeeded');
				return {
					content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
				};
			} catch (err: unknown) {
				const latency = Date.now() - startTime;
				const message = err instanceof Error ? err.message : String(err);
				logger.error({ err: message, tool: name, latency }, 'Tool call failed');
				return {
					content: [{ type: 'text' as const, text: `Error: ${message}` }],
					isError: true,
				};
			}
		}
	);
}