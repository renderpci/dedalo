/**
 * dd_tools_api handlers (WS-C S2-25 extraction — bodies moved VERBATIM from
 * api/dispatch.ts; dispatch keeps registry assembly + gates + envelope).
 */

import type { Session } from '../../security/session_store.ts';
import { type ActionHandler, requirePrincipal } from '../handler_context.ts';

/** True for a plain object whose every value is a string (a header map). */
function isStringRecord(value: unknown): value is Record<string, string> {
	return (
		typeof value === 'object' &&
		value !== null &&
		!Array.isArray(value) &&
		Object.values(value).every((entry) => typeof entry === 'string')
	);
}

/** dd_tools_api action handlers, keyed by action (registered in dispatch.ts). */
export const toolsApiActions: Record<string, ActionHandler> = {
	user_tools: async (rqo, context) => {
		// The toolbar's authorized-tools list (PHP dd_tools_api::user_tools):
		// admins receive every active tool; non-admins the profile-granted
		// set (dd1067) plus always_active tools.
		const principal = requirePrincipal(context);
		const options = (rqo.options ?? {}) as { ar_requested_tools?: string[] | null };

		const { getUserTools } = await import('../../tools/registry.ts');
		let tools = await getUserTools((context.session as Session).userId, principal.isGlobalAdmin);
		if (Array.isArray(options.ar_requested_tools) && options.ar_requested_tools.length > 0) {
			const requested = new Set(options.ar_requested_tools);
			tools = tools.filter((tool) => requested.has(tool.name));
		}
		return { status: 200, body: { result: tools, msg: 'OK' } };
	},
	tool_request: async (rqo, context) => {
		// Per-tool action dispatch (PHP dd_tools_api::tool_request) — all
		// gates + the explicit TS action registry live in tool_request.ts.
		const principal = requirePrincipal(context);
		const { dispatchToolRequest } = await import('../../tools/dispatch.ts');
		const body = await dispatchToolRequest(
			principal,
			(context.session as Session).userId,
			(rqo.source ?? {}) as { model?: unknown; action?: unknown },
			rqo.options,
			context.clientIp,
		);
		// Streaming tool responses (tool_export ndjson_stream, S2-34): the tool
		// returns a ReadableStream through the existing outcome.stream seam so
		// bytes reach the proxy AS PRODUCED instead of one buffered string.
		if (body.stream instanceof ReadableStream) {
			const { stream, ...rest } = body;
			// A tool may supply extra response headers alongside its stream — e.g.
			// `X-Accel-Buffering: no` for an SSE pass-through, which nginx needs to
			// stop buffering the event stream (PRODUCTION.md §3.1, matching the
			// dd_mcp_api agent_chat_stream contract). Content-Type stays the tool's
			// declared streamContentType (or the ndjson default), and the tool's own
			// streamHeaders are merged over it.
			const extraHeaders = isStringRecord(body.streamHeaders) ? body.streamHeaders : {};
			return {
				status: 200,
				body: rest,
				stream: stream as ReadableStream<Uint8Array>,
				streamHeaders: {
					'Content-Type':
						typeof body.streamContentType === 'string'
							? body.streamContentType
							: 'application/x-ndjson; charset=utf-8',
					...extraHeaders,
				},
			};
		}
		return { status: 200, body };
	},
};
