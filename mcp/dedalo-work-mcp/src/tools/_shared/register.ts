import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { TokenBucketRateLimiter } from '@dedalo/mcp-common';
import type { Logger } from 'pino';
import { wrapError } from './errors.js';
import type { Structured } from './output.js';

/**
 * Generic output schema declared on every tool so the SDK accepts
 * `structuredContent` in the response. The payload itself is permissive
 * because each tool defines its own `data` shape.
 */
const StructuredOutputSchema = z.object({
	ok: z.boolean(),
	data: z.unknown().optional(),
	pagination: z.unknown().optional(),
	error: z.unknown().optional(),
});

/**
 * Tool semantics hints for MCP clients. These are *hints only* —
 * authorisation is enforced by Dédalo via the logged user's profile.
 */
export interface ToolAnnotations {
	readOnlyHint?: boolean;
	destructiveHint?: boolean;
	idempotentHint?: boolean;
	openWorldHint?: boolean;
	title?: string;
}

/** Shared context threaded into every handler. */
export interface ToolContext {
	logger: Logger;
	limiter: TokenBucketRateLimiter | null;
}

/**
 * Handler signature: receives validated + typed args, returns either a
 * bare payload (will be wrapped in `{ ok: true, data }`) or a pre-built
 * `Structured` envelope for tools that want to attach pagination.
 */
export type ToolHandler<TIn, TOut> = (args: TIn, ctx: ToolContext) => Promise<TOut>;

export interface ToolDefinition<TSchema extends z.ZodType, TOut> {
	name: string;
	description: string;
	annotations: ToolAnnotations;
	inputSchema: TSchema;
	handler: ToolHandler<z.infer<TSchema>, TOut>;
}

/**
 * Register a typed tool on the McpServer.
 *
 * - Inputs are validated via Zod before the handler runs.
 * - Rate-limiter keyed by MCP session id when available; fallback bucket
 *   `'default'` otherwise.
 * - Responses always wrapped as `{ ok: true, data, [pagination] }` on
 *   success or `{ ok: false, error: { code, message, hint? } }` on
 *   failure, emitted both as text content and as `structuredContent`.
 */
export function registerTool<TSchema extends z.ZodType, TOut>(
	server: McpServer,
	def: ToolDefinition<TSchema, TOut>,
	ctx: ToolContext
): void {
	const { name, description, annotations, inputSchema, handler } = def;

	const cb = async (rawArgs: unknown, extra: { sessionId?: string }) => {
		if (ctx.limiter) {
			const key = extra.sessionId ?? 'default';
			const r = ctx.limiter.consume(key);
			if (!r.allowed) {
				const err: Structured = {
					ok: false,
					error: {
						code: 'rate_limited',
						message: `Rate limit exceeded; retry in ${r.retryAfterMs} ms`,
						hint: 'Slow down tool calls or raise RATE_LIMIT_CAPACITY.',
					},
				};
				return {
					isError: true,
					content: [{ type: 'text' as const, text: JSON.stringify(err) }],
					structuredContent: err as unknown as Record<string, unknown>,
				};
			}
		}

		const parsed = inputSchema.safeParse(rawArgs ?? {});
		if (!parsed.success) {
			const err: Structured = {
				ok: false,
				error: {
					code: 'invalid_request',
					message:
						'Input validation failed: ' +
						parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; '),
					hint: 'Review the tool input schema and retry with a corrected argument set.',
				},
			};
			return {
				isError: true,
				content: [{ type: 'text' as const, text: JSON.stringify(err) }],
				structuredContent: err as unknown as Record<string, unknown>,
			};
		}

		const started = Date.now();
		try {
			const data = await handler(parsed.data as z.infer<TSchema>, ctx);
			const latency = Date.now() - started;
			ctx.logger.info({ tool: name, latency }, 'tool_call_ok');
			const structured: Structured =
				typeof data === 'object' && data !== null && 'ok' in (data as Record<string, unknown>)
					? (data as unknown as Structured)
					: { ok: true, data: data as unknown };
			return {
				content: [{ type: 'text' as const, text: JSON.stringify(structured, null, 2) }],
				structuredContent: structured as unknown as Record<string, unknown>,
			};
		} catch (err) {
			const latency = Date.now() - started;
			const wrapped = wrapError(err);
			ctx.logger.error({ tool: name, latency, err: wrapped.error }, 'tool_call_err');
			return {
				isError: true,
				content: [{ type: 'text' as const, text: JSON.stringify(wrapped, null, 2) }],
				structuredContent: wrapped as unknown as Record<string, unknown>,
			};
		}
	};

	// Cast to `any` because the SDK pins its own vendored $ZodType version
	// which may lag behind the workspace zod version; identical at runtime.
	server.registerTool(
		name,
		{
			description,
			inputSchema: inputSchema as any,
			outputSchema: StructuredOutputSchema as any,
			annotations,
		},
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		cb as any
	);
}
