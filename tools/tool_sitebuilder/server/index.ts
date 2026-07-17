/**
 * tool_sitebuilder — the engine-side proxy to the standalone Site Builder daemon.
 *
 * Every action here forwards to the daemon (daemon_client.ts) with the shared bearer
 * token and the acting user's identity. The engine is where authorization happens: the
 * tool grant (dd1324 active + profile-granted, enforced by dispatch before these run) is
 * the gate for building sites; `publish` and `get_audit` additionally require a developer
 * or global admin, checked imperatively here. The daemon trusts these decisions and
 * records the actor.
 *
 * `session_stream` is the one streaming action: it returns a ReadableStream that forwards
 * the daemon's SSE bytes verbatim through the existing tool-dispatch stream seam, with
 * `X-Accel-Buffering: no` so nginx does not buffer the event stream.
 *
 * The tool hides itself when the daemon is not configured (isAvailable → false), and
 * every action fails closed with `site_builder_unconfigured` if somehow reached anyway.
 */

import { config } from '../../../src/config/config.ts';
import type { Principal } from '../../../src/core/security/permissions.ts';
import type {
	ToolActionContext,
	ToolResponse,
	ToolServerModule,
} from '../../../src/core/tools/module.ts';
import { type Actor, daemonJson, daemonStream, isConfigured } from './daemon_client.ts';
import { SiteBuilderError } from './wire.ts';

const SLUG_PATTERN = /^[a-z][a-z0-9-]{1,39}$/;
const MESSAGE_MAX = 32 * 1024;

/**
 * Build the daemon's `actor` from the authenticated principal. The engine is the trusted
 * identity injector: the browser never reaches the daemon, so whatever we stamp here is
 * what the daemon records as "who did this".
 */
function actorFor(context: { principal: Principal }): Actor {
	// The numeric id is the authoritative identity; the username is cosmetic for the audit
	// trail. A real display name is a documented later refinement.
	return { user_id: context.principal.userId, username: `user_${context.principal.userId}` };
}

function ok(result: unknown): ToolResponse {
	return { result, msg: 'OK', errors: [] };
}

function fail(error: SiteBuilderError): ToolResponse {
	return { result: false, msg: error.message, errors: [error.code] };
}

/** Runs a proxy handler, converting a SiteBuilderError into a ToolResponse failure. */
async function proxy(fn: () => Promise<ToolResponse>): Promise<ToolResponse> {
	if (!isConfigured()) {
		return {
			result: false,
			msg: 'The site builder is not configured on this server.',
			errors: ['site_builder_unconfigured'],
		};
	}
	try {
		return await fn();
	} catch (error) {
		if (error instanceof SiteBuilderError) return fail(error);
		throw error;
	}
}

/**
 * Validate the `slug` option against SLUG_PATTERN before it is interpolated into a daemon
 * path. Rejecting here keeps a malformed or hostile slug out of the URL entirely rather
 * than letting the daemon 404/500 on it.
 */
function requireSlug(options: Record<string, unknown>): string {
	const slug = String(options.slug ?? '');
	if (!SLUG_PATTERN.test(slug)) {
		throw new SiteBuilderError('site_builder_rejected', 'Invalid site name.');
	}
	return slug;
}

/**
 * Validate an id-shaped option (session_id, build_id) before it becomes a path segment:
 * bounded length, path-safe characters only. Same purpose as requireSlug — no untrusted
 * value reaches the daemon URL.
 */
function requireId(options: Record<string, unknown>, key: string): string {
	const id = String(options[key] ?? '');
	if (id.length === 0 || id.length > 200 || /[^A-Za-z0-9._-]/.test(id)) {
		throw new SiteBuilderError('site_builder_rejected', `Invalid ${key}.`);
	}
	return id;
}

/**
 * The imperative publish gate. Building a site needs only the tool grant, but pushing it
 * live (publish, and reading the publish audit) additionally requires a developer or
 * global admin — enforced here because dispatch's permission check is `null` for these
 * actions (the finer rule cannot be expressed as a static permission).
 */
function assertPublisher(principal: Principal): void {
	if (!principal.isDeveloper && !principal.isGlobalAdmin) {
		throw new SiteBuilderError(
			'site_builder_rejected',
			'Publishing requires developer or administrator permission.',
		);
	}
}

// --- handlers ---

/**
 * Probe the daemon's /health and report configured/reachable plus whether this user may
 * publish. Unlike the other handlers this one does NOT go through proxy(): it answers even
 * when the daemon is unconfigured or down, because the client uses the answer to decide
 * what to render (workspace vs empty state).
 */
async function getStatus(context: ToolActionContext): Promise<ToolResponse> {
	const canPublish = context.principal.isDeveloper || context.principal.isGlobalAdmin;
	if (!isConfigured()) {
		return ok({ configured: false, reachable: false, can_publish: canPublish });
	}
	try {
		const health = (await daemonJson('GET', '/health', actorFor(context))) as {
			service?: string;
			drivers?: unknown[];
		};
		return ok({ configured: true, reachable: true, health, can_publish: canPublish });
	} catch (error) {
		if (error instanceof SiteBuilderError) {
			// Distinguish "can't reach it" from "it's off": the client shows either honestly.
			return ok({ configured: true, reachable: false, error: error.code, can_publish: canPublish });
		}
		throw error;
	}
}

/** GET /v1/sites — the full (collaborative) site list; no per-site ownership filter. */
async function listSites(context: ToolActionContext): Promise<ToolResponse> {
	return proxy(async () => ok(await daemonJson('GET', '/v1/sites', actorFor(context))));
}

/**
 * POST /v1/sites — create a site. Validates the slug and a bounded name here; template and
 * driver are optional and only forwarded when they are of the expected shape (the driver
 * is allow-listed to the three known agents, so an unknown value is silently dropped
 * rather than passed to the daemon).
 */
async function createSite(context: ToolActionContext): Promise<ToolResponse> {
	return proxy(async () => {
		const o = context.options;
		const slug = requireSlug(o);
		const name = String(o.name ?? '').trim();
		if (name.length === 0 || name.length > 200) {
			throw new SiteBuilderError('site_builder_rejected', 'A site name is required.');
		}
		const body: Record<string, unknown> = { slug, name };
		if (typeof o.template === 'string') body.template = o.template;
		if (o.driver === 'claude_code' || o.driver === 'opencode' || o.driver === 'pi')
			body.driver = o.driver;
		return ok(await daemonJson('POST', '/v1/sites', actorFor(context), body));
	});
}

/**
 * DELETE /v1/sites/:slug — remove a site. `purge_prod` is opt-in and only appended when
 * strictly true, so an absent or falsy value never accidentally tears down the published
 * copy.
 */
async function deleteSite(context: ToolActionContext): Promise<ToolResponse> {
	return proxy(async () => {
		const slug = requireSlug(context.options);
		const purge = context.options.purge_prod === true ? '?purge_prod=true' : '';
		return ok(await daemonJson('DELETE', `/v1/sites/${slug}${purge}`, actorFor(context)));
	});
}

/**
 * POST /v1/sites/:slug/sessions — open a new agent session with the first prompt. The
 * prompt is required and capped at MESSAGE_MAX (32 KiB) before it leaves the engine.
 */
async function sessionStart(context: ToolActionContext): Promise<ToolResponse> {
	return proxy(async () => {
		const slug = requireSlug(context.options);
		const prompt = String(context.options.prompt ?? '');
		if (prompt.trim().length === 0 || prompt.length > MESSAGE_MAX) {
			throw new SiteBuilderError('site_builder_rejected', 'A prompt is required (max 32 KiB).');
		}
		const body: Record<string, unknown> = { prompt };
		if (context.options.driver) body.driver = context.options.driver;
		return ok(await daemonJson('POST', `/v1/sites/${slug}/sessions`, actorFor(context), body));
	});
}

/**
 * POST /v1/sessions/:id/messages — send a follow-up message into an existing session. Same
 * required + 32 KiB-capped rule as sessionStart, keyed by session_id instead of slug.
 */
async function sessionMessage(context: ToolActionContext): Promise<ToolResponse> {
	return proxy(async () => {
		const id = requireId(context.options, 'session_id');
		const message = String(context.options.message ?? '');
		if (message.trim().length === 0 || message.length > MESSAGE_MAX) {
			throw new SiteBuilderError('site_builder_rejected', 'A message is required (max 32 KiB).');
		}
		return ok(
			await daemonJson('POST', `/v1/sessions/${id}/messages`, actorFor(context), { message }),
		);
	});
}

/** POST /v1/sessions/:id/stop — ask the daemon to interrupt the running agent turn. */
async function sessionStop(context: ToolActionContext): Promise<ToolResponse> {
	return proxy(async () => {
		const id = requireId(context.options, 'session_id');
		return ok(await daemonJson('POST', `/v1/sessions/${id}/stop`, actorFor(context)));
	});
}

/** GET /v1/sites/:slug/sessions — the past sessions for a site (history list, not events). */
async function sessionHistory(context: ToolActionContext): Promise<ToolResponse> {
	return proxy(async () => {
		const slug = requireSlug(context.options);
		return ok(await daemonJson('GET', `/v1/sites/${slug}/sessions`, actorFor(context)));
	});
}

/** POST /v1/sites/:slug/build — kick off a build; returns a build_id the client polls. */
async function build(context: ToolActionContext): Promise<ToolResponse> {
	return proxy(async () => {
		const slug = requireSlug(context.options);
		return ok(await daemonJson('POST', `/v1/sites/${slug}/build`, actorFor(context)));
	});
}

/** GET /v1/sites/:slug/builds/:id — the outcome of a single build (running/success/failed). */
async function getBuild(context: ToolActionContext): Promise<ToolResponse> {
	return proxy(async () => {
		const slug = requireSlug(context.options);
		const id = requireId(context.options, 'build_id');
		return ok(await daemonJson('GET', `/v1/sites/${slug}/builds/${id}`, actorFor(context)));
	});
}

/** GET /v1/sites/:slug/preview — the preprod URL the client loads into its preview iframe. */
async function preview(context: ToolActionContext): Promise<ToolResponse> {
	return proxy(async () => {
		const slug = requireSlug(context.options);
		return ok(await daemonJson('GET', `/v1/sites/${slug}/preview`, actorFor(context)));
	});
}

/**
 * POST /v1/sites/:slug/publish — push the built site to production. Double-gated: the
 * publisher check (developer/admin) AND an explicit confirm flag, so neither an
 * under-privileged user nor an accidental unconfirmed call can take a site live.
 */
async function publish(context: ToolActionContext): Promise<ToolResponse> {
	return proxy(async () => {
		assertPublisher(context.principal);
		const slug = requireSlug(context.options);
		// The client's confirm dialog sets this; a call without it must not go live.
		if (context.options.confirm !== true) {
			throw new SiteBuilderError('site_builder_rejected', 'Publishing must be confirmed.');
		}
		const body: Record<string, unknown> = { confirm: true };
		if (typeof context.options.note === 'string') body.note = context.options.note;
		return ok(await daemonJson('POST', `/v1/sites/${slug}/publish`, actorFor(context), body));
	});
}

/**
 * GET /v1/audit — the publish audit trail, optionally filtered to one site. Publisher-gated
 * like publish itself (the trail is who-took-what-live, so it is developer/admin only). An
 * absent slug reads the whole trail; a present one is validated before it becomes a query.
 */
async function getAudit(context: ToolActionContext): Promise<ToolResponse> {
	return proxy(async () => {
		assertPublisher(context.principal);
		const slug = typeof context.options.slug === 'string' ? requireSlug(context.options) : '';
		const query = slug ? `?site=${slug}` : '';
		return ok(await daemonJson('GET', `/v1/audit${query}`, actorFor(context)));
	});
}

/**
 * SSE pass-through: forward the daemon's event stream to the browser byte-for-byte. The
 * returned stream's cancel() aborts the upstream fetch (browser closed → daemon leg torn
 * down). streamHeaders carries X-Accel-Buffering so nginx does not buffer it.
 */
async function sessionStream(context: ToolActionContext): Promise<ToolResponse> {
	if (!isConfigured()) {
		return {
			result: false,
			msg: 'The site builder is not configured on this server.',
			errors: ['site_builder_unconfigured'],
		};
	}
	let id: string;
	let after: number;
	try {
		id = requireId(context.options, 'session_id');
		const rawAfter = context.options.after;
		after = typeof rawAfter === 'number' && Number.isFinite(rawAfter) ? rawAfter : -1;
	} catch (error) {
		if (error instanceof SiteBuilderError) return fail(error);
		throw error;
	}

	const upstreamAbort = new AbortController();
	let upstream: Response;
	try {
		upstream = await daemonStream(
			`/v1/sessions/${id}/events?after=${after}`,
			actorFor(context),
			upstreamAbort.signal,
		);
	} catch (error) {
		if (error instanceof SiteBuilderError) return fail(error);
		throw error;
	}

	const reader = (upstream.body as ReadableStream<Uint8Array>).getReader();
	const passthrough = new ReadableStream<Uint8Array>({
		async pull(controller) {
			try {
				const { done, value } = await reader.read();
				if (done) {
					controller.close();
					return;
				}
				controller.enqueue(value);
			} catch (error) {
				// Upstream died mid-stream: tell the client, then close.
				const encoder = new TextEncoder();
				controller.enqueue(
					encoder.encode(
						`event: error\ndata: ${JSON.stringify({ code: 'site_builder_stream_lost', message: String(error) })}\n\n`,
					),
				);
				controller.close();
			}
		},
		cancel() {
			upstreamAbort.abort();
			reader.cancel().catch(() => {});
		},
	});

	return {
		result: true,
		msg: 'OK',
		stream: passthrough,
		streamContentType: 'text/event-stream; charset=utf-8',
		streamHeaders: { 'X-Accel-Buffering': 'no' },
	};
}

export const tool: ToolServerModule = {
	name: 'tool_sitebuilder',
	apiActions: {
		get_status: { permission: null, handler: getStatus },
		list_sites: { permission: null, handler: listSites },
		create_site: { permission: null, handler: createSite },
		delete_site: { permission: null, handler: deleteSite },
		session_start: { permission: null, handler: sessionStart },
		session_message: { permission: null, handler: sessionMessage },
		session_stop: { permission: null, handler: sessionStop },
		session_history: { permission: null, handler: sessionHistory },
		session_stream: { permission: null, handler: sessionStream },
		build: { permission: null, handler: build },
		get_build: { permission: null, handler: getBuild },
		preview: { permission: null, handler: preview },
		// Gated imperatively (developer OR global admin) inside the handler.
		publish: { permission: null, handler: publish },
		get_audit: { permission: null, handler: getAudit },
	},
	// The tool exists only when the daemon is configured. A fast, pure, cacheable check.
	isAvailable: () =>
		typeof config.siteBuilder.url === 'string' && typeof config.siteBuilder.token === 'string',
};
