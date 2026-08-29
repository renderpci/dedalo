/**
 * tool_sitebuilder — the engine-side proxy to the standalone Site Builder daemon.
 *
 * Every action here forwards to the daemon (daemon_client.ts) with the shared bearer
 * token and the acting user's identity. The engine is where authorization happens: the
 * daemon trusts these decisions completely and records the actor.
 *
 * AUTHORIZATION (P2-8(b), 2026-08-24 — the fix for the hole P2-8(a)'s census exposed).
 * Until this pass the tool grant alone (dd1324 active + profile-granted) stood between an
 * ordinary authenticated editor and: creating sites, driving an autonomous coding agent
 * over a site workspace (spending LLM tokens on the installation's key), deleting the
 * workspace and preprod copy of anybody's site, and reading every session transcript and
 * build log on the server. Only three doors — publish, get_audit, and the `purge_prod`
 * half of delete_site — checked anything at all. TWO RULES NOW HOLD, both imperative
 * (there is no declarative kind that fits: see the apiActions comment at the foot):
 *
 *  1. EVERY action requires the PUBLISHER GRANT (`assertPublisher` — developer OR global
 *     admin). Not only the spending/mutating ones: the reads disclose the site inventory,
 *     unpublished content URLs, build logs and agent transcripts, and the engine has no
 *     per-site ACL to express a narrower read tier against. So the honest tier is the one
 *     the engine can actually express, applied uniformly and fail-closed.
 *  2. Every action that ADDRESSES AN EXISTING SESSION additionally requires OWNERSHIP
 *     (`assertSessionOwner`, session_owner.ts): a session id must not be a capability that
 *     lets one publisher type into, stop or read another publisher's running agent.
 *
 * The durable answer to "who may use the site builder" is a per-site grant in the
 * ontology, which the engine cannot express today; the publisher grant is the correct
 * gate until it can, not a placeholder for none.
 *
 * `session_stream` is the one streaming action: it returns a ReadableStream that forwards
 * the daemon's SSE bytes verbatim through the existing tool-dispatch stream seam, with
 * `X-Accel-Buffering: no` so nginx does not buffer the event stream.
 *
 * The tool hides itself when the daemon is not configured (isAvailable → false), and
 * every action fails closed with `site_builder.unconfigured` if somehow reached anyway.
 */

import { config } from '../../../src/config/config.ts';
import { isErrorInDomain, ok as okEnvelope } from '../../../src/core/errors/index.ts';
import type { Principal } from '../../../src/core/security/permissions.ts';
import {
	type ToolActionContext,
	type ToolResponse,
	type ToolServerModule,
	toolRequestId,
} from '../../../src/core/tools/module.ts';
import {
	type Actor,
	daemonJson,
	daemonStream,
	isConfigured,
	PAIRING_FIELD,
} from './daemon_client.ts';
import {
	assertSessionOwner,
	forgetSiteSessions,
	ownedSessionIds,
	recordSessionOwner,
} from './session_owner.ts';
import { siteBuilderFailure, siteBuilderRejected } from './wire.ts';

const SLUG_PATTERN = /^[a-z][a-z0-9-]{1,39}$/;

/**
 * THE DOMAIN A SITE ANSWERS ON — required by the daemon, and therefore required here.
 *
 * A site's domain is what pairs it with the webspace the provisioner created for it: the
 * daemon looks the site up in the provisioner's site table by slug and refuses a create
 * whose domain disagrees. This tool sent `{slug, name}` and no domain at all, so after the
 * daemon made the field required EVERY create through the engine failed — the tool was the
 * only door a museum has, and it could no longer create a site.
 *
 * The pattern is a LOCAL PRE-CHECK, like SLUG_PATTERN above and for the same reason: it
 * keeps an obviously malformed value out of a request rather than spending a round trip on
 * it. The daemon holds the authoritative grammar (its site.json schema and its layout
 * both), and this is deliberately not stricter than that.
 */
const DOMAIN_PATTERN = /^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

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

/** The daemon's answer as the success envelope (its JSON IS the payload). */
function ok(context: ToolActionContext, data: unknown): ToolResponse {
	return okEnvelope(data, { requestId: toolRequestId(context) });
}

/**
 * Runs a proxy handler. A site_builder refusal is already a registered throw (wire.ts) and
 * travels to the dispatch chokepoint untouched; only the unconfigured pre-check is added
 * here, so an action reached despite isAvailable still fails closed.
 */
async function proxy(fn: () => Promise<ToolResponse>): Promise<ToolResponse> {
	if (!isConfigured()) {
		throw siteBuilderFailure(
			'site_builder.unconfigured',
			'The site builder is not configured on this server.',
		);
	}
	return fn();
}

/**
 * Validate the `slug` option against SLUG_PATTERN before it is interpolated into a daemon
 * path. Rejecting here keeps a malformed or hostile slug out of the URL entirely rather
 * than letting the daemon 404/500 on it.
 */
function requireSlug(options: Record<string, unknown>): string {
	const slug = String(options.slug ?? '');
	if (!SLUG_PATTERN.test(slug)) {
		throw siteBuilderRejected('Invalid site name.');
	}
	return slug;
}

/**
 * Validate an id-shaped option (session_id, build_id) before it becomes a path segment:
 * bounded length, path-safe characters only. Same purpose as requireSlug — no untrusted
 * value reaches the daemon URL.
 *
 * `.` is allowed inside an id, so the dot-segment `..` must be refused EXPLICITLY: the
 * WHATWG URL parser resolves it away, so `session_id: '..'` would turn
 * `/v1/sessions/../stop` into `/v1/stop` and let a caller aim at a daemon route the tool
 * never meant to expose. Fail closed on any id carrying a dot-segment.
 */
function requireId(options: Record<string, unknown>, key: string): string {
	const id = String(options[key] ?? '');
	if (id.length === 0 || id.length > 200 || /[^A-Za-z0-9._-]/.test(id) || id.includes('..')) {
		throw siteBuilderRejected(`Invalid ${key}.`);
	}
	return id;
}

/**
 * THE TOOL'S AUTHORIZATION GATE — developer OR global admin, and since P2-8(b) it runs on
 * EVERY action, not only the three that reach production.
 *
 * Why imperative rather than declarative: dispatch's declarative kinds
 * (src/core/tools/security.ts) all read an ontology target out of the payload — a
 * section_tipo, a component tipo, a section_id — and a site slug is none of those. The one
 * target-free kind, `'developer'`, asserts `principal.isDeveloper` ALONE: adopting it
 * would silently strip every global admin (a distinct flag — dd244 vs dd515, neither
 * implies the other) of publishing rights they have today. Narrowing the grant is not a
 * side effect a gate change may have, so the OR stays here, where it can be written
 * truthfully. Nothing is lost to the background fork either: this tool declares no
 * `backgroundRunnable` actions, so every handler runs in the request and every refusal is
 * observable to the caller.
 *
 * Gated by `test/unit/tool_sitebuilder_authz_native.test.ts` (every action, both
 * directions) and `test/unit/tool_sitebuilder.test.ts` (the production doors' own rules).
 */
function assertPublisher(
	principal: Principal,
	message = 'The site builder requires developer or administrator permission.',
): void {
	if (!principal.isDeveloper && !principal.isGlobalAdmin) {
		throw siteBuilderRejected(message);
	}
}

// --- handlers ---

/**
 * Probe the daemon's /health and report configured/reachable plus whether this user may
 * publish. Unlike the other handlers this one does NOT go through proxy(): it answers even
 * when the daemon is unconfigured or down, because the client uses the answer to decide
 * what to render (workspace vs empty state).
 *
 * GATED (P2-8(b)) — this is a READ, and it discloses: whether the installation runs a site
 * builder at all, whether that service is up, and its /health body (service identity and
 * the list of agent drivers installed on the box). That is infrastructure reconnaissance
 * for a caller who, after this pass, cannot use a single other action of the tool; the
 * honest read tier here is the same publisher grant. `can_publish` stays in the payload
 * for the client's rendering, and is now always true by construction — the client reads it,
 * and a flag that quietly changed meaning would be worse than a redundant one.
 */
async function getStatus(context: ToolActionContext): Promise<ToolResponse> {
	assertPublisher(context.principal);
	const canPublish = context.principal.isDeveloper || context.principal.isGlobalAdmin;
	if (!isConfigured()) {
		return ok(context, { configured: false, reachable: false, can_publish: canPublish });
	}
	try {
		const health = (await daemonJson('GET', '/health', actorFor(context))) as Record<
			string,
			unknown
		>;
		// THE PAIRING FINGERPRINT NEVER REACHES A BROWSER. It is a sha256 over the shared
		// bearer, published on the daemon's unauthenticated /health so that THIS PROCESS can
		// prove the pairing before it sends anything (daemon_client.ts). Relaying it onward
		// would hand every user of this tool an offline brute-force target against the
		// installation's site-builder token, in exchange for nothing the panel renders.
		const { [PAIRING_FIELD]: _pairing, ...disclosableHealth } = health;
		return ok(context, {
			configured: true,
			reachable: true,
			health: disclosableHealth,
			can_publish: canPublish,
		});
	} catch (error) {
		if (isErrorInDomain(error, 'site_builder')) {
			// Distinguish "can't reach it" from "it's off": the client shows either
			// honestly. This action ANSWERS a down daemon (it is what the client
			// renders its empty state from), so the code travels inside `data`.
			return ok(context, {
				configured: true,
				reachable: false,
				error: error.code,
				can_publish: canPublish,
			});
		}
		throw error;
	}
}

/**
 * GET /v1/sites — the full (collaborative) site list; no per-site ownership filter.
 *
 * GATED (P2-8(b)) — a read that discloses the whole inventory of sites on the daemon:
 * their slugs, names and publication state, including sites that were never published and
 * exist only as work in progress. Publisher grant.
 */
async function listSites(context: ToolActionContext): Promise<ToolResponse> {
	assertPublisher(context.principal);
	return proxy(async () => ok(context, await daemonJson('GET', '/v1/sites', actorFor(context))));
}

/**
 * POST /v1/sites — create a site. Validates the slug, a bounded name and the DOMAIN here;
 * template and driver are optional and only forwarded when they are of the expected shape
 * (the driver is allow-listed to the three known agents, so an unknown value is silently
 * dropped rather than passed to the daemon).
 *
 * The daemon's own refusal is surfaced by REASON, not by relaying its prose — see
 * `wire.ts`: a daemon-supplied `detail` is another service's text and stays log-only, so
 * the sentence a museum reads is written here, keyed on the machine code the daemon sends.
 */
async function createSite(context: ToolActionContext): Promise<ToolResponse> {
	// GATED (P2-8(b)): creating a site provisions a workspace on the daemon host from a
	// template and puts a new slug into the shared namespace. Publisher grant.
	assertPublisher(context.principal);
	return proxy(async () => {
		const o = context.options;
		const slug = requireSlug(o);
		const name = String(o.name ?? '').trim();
		if (name.length === 0 || name.length > 200) {
			throw siteBuilderRejected('A site name is required.');
		}
		// THE DOMAIN, WHICH IS NOT OPTIONAL. Supplied by the operator, never invented here: a
		// domain needs DNS, a vhost and a certificate, and the provisioner has already made a
		// webspace for exactly this one. An engine-authored sentence, so it is safe to show.
		const domain = String(o.domain ?? '')
			.trim()
			.toLowerCase();
		if (!DOMAIN_PATTERN.test(domain)) {
			throw siteBuilderRejected(
				'A site needs the domain it will answer on (for example www.museum.org), and it must ' +
					'be one the site builder has already been provisioned for.',
			);
		}
		const body: Record<string, unknown> = { slug, name, domain };
		if (typeof o.template === 'string') body.template = o.template;
		if (o.driver === 'claude_code' || o.driver === 'opencode' || o.driver === 'pi')
			body.driver = o.driver;
		return ok(context, await daemonJson('POST', '/v1/sites', actorFor(context), body));
	});
}

/**
 * DELETE /v1/sites/:slug — remove a site. `purge_prod` is opt-in and only appended when
 * strictly true, so an absent or falsy value never accidentally tears down the published
 * copy.
 *
 * Split gate, drawn where the daemon draws it (`deleteSite(slug, purgeProd)` in the
 * daemon's sites/workspace.ts):
 *  - the plain delete removes the WORKSPACE and the preprod copy — builder-owned state
 *    that create_site/build (ungated beyond the tool grant) produced. Production bytes are
 *    untouched, and the prod `.releases` history survives, so re-creating the slug restores
 *    releases/rollback. Ordinary tool work: tool grant only.
 *  - `purge_prod` is the ONLY path here that touches the daemon's PROD_ROOT: it deletes the
 *    live copy AND its release history — irreversible, and the destructive half of publish.
 *    It therefore takes publish's exact double gate (publisher + explicit confirm): a user
 *    who cannot take a site live must not be able to take it down, and an unconfirmed call
 *    must not either. Both checks run BEFORE the proxy call, because the daemon executes
 *    whatever the engine sends.
 */
async function deleteSite(context: ToolActionContext): Promise<ToolResponse> {
	// GATED (P2-8(b)) UNCONDITIONALLY — the split gate below was the whole check, so the
	// plain half destroyed the workspace and preprod copy of ANY site for ANY grantee,
	// including work in progress that has never been published and therefore has no prod
	// release history to restore it from. Deleting somebody's work is not a lesser act than
	// publishing it. The purge_prod half keeps its OWN, stricter pair of checks below.
	assertPublisher(
		context.principal,
		'Deleting a site requires developer or administrator permission.',
	);
	return proxy(async () => {
		const purgeProd = context.options.purge_prod === true;
		if (purgeProd) {
			assertPublisher(
				context.principal,
				'Removing the published site requires developer or administrator permission.',
			);
			if (context.options.confirm !== true) {
				throw siteBuilderRejected('Removing the published site must be confirmed.');
			}
		}
		const slug = requireSlug(context.options);
		const purge = purgeProd ? '?purge_prod=true' : '';
		const answer = ok(
			context,
			await daemonJson('DELETE', `/v1/sites/${slug}${purge}`, actorFor(context)),
		);
		// The site is gone, so its ownership rows now address nothing. Best-effort sweep —
		// AFTER the delete succeeded, and never able to fail the delete (session_owner.ts).
		await forgetSiteSessions(slug);
		return answer;
	});
}

/**
 * POST /v1/sites/:slug/sessions — open a new agent session with the first prompt. The
 * prompt is required and capped at MESSAGE_MAX (32 KiB) before it leaves the engine.
 */
async function sessionStart(context: ToolActionContext): Promise<ToolResponse> {
	// GATED (P2-8(b)): this is the token-spending door. It starts an autonomous coding agent
	// with write access to the site workspace, on the installation's model credentials.
	assertPublisher(context.principal);
	return proxy(async () => {
		const slug = requireSlug(context.options);
		const prompt = String(context.options.prompt ?? '');
		if (prompt.trim().length === 0 || prompt.length > MESSAGE_MAX) {
			throw siteBuilderRejected('A prompt is required (max 32 KiB).');
		}
		const body: Record<string, unknown> = { prompt };
		if (context.options.driver) body.driver = context.options.driver;
		const started = await daemonJson('POST', `/v1/sites/${slug}/sessions`, actorFor(context), body);
		// RECORD THE OWNER. The daemon's SessionMeta has no owner field and its audit tail
		// cannot answer "who owns this id", so the engine keeps the fact it alone knows
		// (session_owner.ts). It is written immediately after the id exists and before the
		// caller can send a second request naming it.
		const sessionId = (started as { session_id?: unknown }).session_id;
		if (typeof sessionId === 'string' && sessionId.length > 0) {
			try {
				await recordSessionOwner(sessionId, slug, context.principal.userId);
			} catch (error) {
				// The agent is ALREADY RUNNING — reporting a failure to start would be a lie,
				// and rolling it back is not ours to do. So: loud line, and the session stays
				// reachable only to a global admin (assertSessionOwner fails closed on an
				// unknown owner), which is the safe end of the trade.
				console.error('[tool_sitebuilder] could not record session ownership:', error);
			}
		} else {
			// A daemon answer with no session_id means we cannot own what it started.
			console.error('[tool_sitebuilder] daemon session_start returned no session_id');
		}
		return ok(context, started);
	});
}

/**
 * POST /v1/sessions/:id/messages — send a follow-up message into an existing session. Same
 * required + 32 KiB-capped rule as sessionStart, keyed by session_id instead of slug.
 */
async function sessionMessage(context: ToolActionContext): Promise<ToolResponse> {
	// GATED (P2-8(b)): publisher grant AND ownership. The id is the only thing addressing
	// the session, so without the ownership check any publisher could type into another
	// user's running agent — the session's whole boundary is this line.
	assertPublisher(context.principal);
	return proxy(async () => {
		const id = requireId(context.options, 'session_id');
		await assertSessionOwner(id, context.principal);
		const message = String(context.options.message ?? '');
		if (message.trim().length === 0 || message.length > MESSAGE_MAX) {
			throw siteBuilderRejected('A message is required (max 32 KiB).');
		}
		return ok(
			context,
			await daemonJson('POST', `/v1/sessions/${id}/messages`, actorFor(context), { message }),
		);
	});
}

/** POST /v1/sessions/:id/stop — ask the daemon to interrupt the running agent turn. */
async function sessionStop(context: ToolActionContext): Promise<ToolResponse> {
	// GATED (P2-8(b)): publisher grant AND ownership — killing somebody else's turn
	// mid-write is a destructive act on their work, not a harmless one.
	assertPublisher(context.principal);
	return proxy(async () => {
		const id = requireId(context.options, 'session_id');
		await assertSessionOwner(id, context.principal);
		return ok(context, await daemonJson('POST', `/v1/sessions/${id}/stop`, actorFor(context)));
	});
}

/**
 * GET /v1/sites/:slug/sessions — the past sessions for a site (history list, not events).
 *
 * GATED (P2-8(b)): publisher grant, and the daemon's site-wide list is FILTERED to the
 * caller's own sessions. The daemon has no notion of ownership, so it answers with every
 * session on the site; handing that through would list other users' sessions (and their
 * ids, which are what session_stream and session_stop address) to anyone who can name the
 * slug. A GLOBAL ADMIN sees the unfiltered list — the same named operator bypass as
 * assertSessionOwner, for the same reason.
 *
 * Consequence stated plainly: sessions started BEFORE this ledger existed have no owner
 * row, so they no longer appear for an ordinary publisher. They are unreachable to them
 * anyway (assertSessionOwner fails closed), so showing them would be listing doors that
 * cannot open.
 */
async function sessionHistory(context: ToolActionContext): Promise<ToolResponse> {
	assertPublisher(context.principal);
	return proxy(async () => {
		const slug = requireSlug(context.options);
		const answer = await daemonJson('GET', `/v1/sites/${slug}/sessions`, actorFor(context));
		if (context.principal.isGlobalAdmin) return ok(context, answer);
		const entries = (answer as { data?: unknown }).data;
		if (!Array.isArray(entries)) {
			// An unrecognized shape cannot be filtered, and passing it through unfiltered is
			// exactly the disclosure this gate exists to stop. Refuse, loudly.
			console.error('[tool_sitebuilder] session history: unexpected daemon payload shape');
			throw siteBuilderFailure(
				'site_builder.failed',
				'The site builder returned an unrecognized session list.',
			);
		}
		const mine = await ownedSessionIds(slug, context.principal.userId);
		return ok(context, {
			...(answer as Record<string, unknown>),
			data: entries.filter((entry) =>
				mine.has(String((entry as { session_id?: unknown }).session_id ?? '')),
			),
		});
	});
}

/** POST /v1/sites/:slug/build — kick off a build; returns a build_id the client polls. */
async function build(context: ToolActionContext): Promise<ToolResponse> {
	// GATED (P2-8(b)): a build runs the site's own toolchain on the daemon host and
	// overwrites the preprod bytes that publish later promotes. Publisher grant.
	assertPublisher(context.principal);
	return proxy(async () => {
		const slug = requireSlug(context.options);
		return ok(context, await daemonJson('POST', `/v1/sites/${slug}/build`, actorFor(context)));
	});
}

/** GET /v1/sites/:slug/builds/:id — the outcome of a single build (running/success/failed). */
async function getBuild(context: ToolActionContext): Promise<ToolResponse> {
	// GATED (P2-8(b)) — a read, and a disclosing one: a build outcome carries the build LOG,
	// i.e. toolchain error text with host paths and whatever the site's source spilled into
	// stderr. Publisher grant.
	assertPublisher(context.principal);
	return proxy(async () => {
		const slug = requireSlug(context.options);
		const id = requireId(context.options, 'build_id');
		return ok(
			context,
			await daemonJson('GET', `/v1/sites/${slug}/builds/${id}`, actorFor(context)),
		);
	});
}

/** GET /v1/sites/:slug/preview — the preprod URL the client loads into its preview iframe. */
async function preview(context: ToolActionContext): Promise<ToolResponse> {
	// GATED (P2-8(b)) — a read that hands out the preprod URL, which is UNPUBLISHED content:
	// the whole point of preprod is that it is not public yet. Publisher grant.
	assertPublisher(context.principal);
	return proxy(async () => {
		const slug = requireSlug(context.options);
		return ok(context, await daemonJson('GET', `/v1/sites/${slug}/preview`, actorFor(context)));
	});
}

/**
 * POST /v1/sites/:slug/publish — push the built site to production. Double-gated: the
 * publisher check (developer/admin) AND an explicit confirm flag, so neither an
 * under-privileged user nor an accidental unconfirmed call can take a site live.
 */
async function publish(context: ToolActionContext): Promise<ToolResponse> {
	return proxy(async () => {
		assertPublisher(
			context.principal,
			'Publishing requires developer or administrator permission.',
		);
		const slug = requireSlug(context.options);
		// The client's confirm dialog sets this; a call without it must not go live.
		if (context.options.confirm !== true) {
			throw siteBuilderRejected('Publishing must be confirmed.');
		}
		const body: Record<string, unknown> = { confirm: true };
		if (typeof context.options.note === 'string') body.note = context.options.note;
		return ok(
			context,
			await daemonJson('POST', `/v1/sites/${slug}/publish`, actorFor(context), body),
		);
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
		return ok(context, await daemonJson('GET', `/v1/audit${query}`, actorFor(context)));
	});
}

/**
 * SSE pass-through: forward the daemon's event stream to the browser byte-for-byte. The
 * returned stream's cancel() aborts the upstream fetch (browser closed → daemon leg torn
 * down). streamHeaders carries X-Accel-Buffering so nginx does not buffer it.
 */
async function sessionStream(context: ToolActionContext): Promise<ToolResponse> {
	// GATED (P2-8(b)): publisher grant AND ownership, both BEFORE the upstream leg opens.
	// This is the transcript — every prompt, every tool call and every file excerpt the
	// agent echoed back — so reading someone else's is the most disclosing act in the tool.
	assertPublisher(context.principal);
	if (!isConfigured()) {
		throw siteBuilderFailure(
			'site_builder.unconfigured',
			'The site builder is not configured on this server.',
		);
	}
	// Both of these REFUSE BY THROWING a registered code; the dispatch chokepoint
	// converts (the stream never opens, so there is no frame to fail into).
	const id = requireId(context.options, 'session_id');
	await assertSessionOwner(id, context.principal);
	const rawAfter = context.options.after;
	const after = typeof rawAfter === 'number' && Number.isFinite(rawAfter) ? rawAfter : -1;

	const upstreamAbort = new AbortController();
	const upstream = await daemonStream(
		`/v1/sessions/${id}/events?after=${after}`,
		actorFor(context),
		upstreamAbort.signal,
	);

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
				// A STREAM FRAME, not an envelope: the registered code identifies the
				// fault; the raw cause stays in the server log.
				console.error('[tool_sitebuilder] session stream lost:', error);
				const encoder = new TextEncoder();
				controller.enqueue(
					encoder.encode(
						`event: error\ndata: ${JSON.stringify({ code: 'site_builder.stream_lost' })}\n\n`,
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

	// stream/streamContentType/streamHeaders are EXTENSION KEYS the dd_tools_api
	// handler reads off the top level to hand the bytes to the stream seam.
	return okEnvelope(null, {
		requestId: toolRequestId(context),
		extend: {
			stream: passthrough,
			streamContentType: 'text/event-stream; charset=utf-8',
			streamHeaders: { 'X-Accel-Buffering': 'no' },
		},
	});
}

export const tool: ToolServerModule = {
	name: 'tool_sitebuilder',
	// EVERY action here is `permission: null` because there is no section, tipo or
	// record in the payload for a declarative gate to read — a site slug is not an
	// ontology target, and the one target-free declarative kind ('developer') would
	// STRIP global admins (see assertPublisher's header), which a gate change must not
	// do as a side effect. So the census entries below stay; what changed with P2-8(b)
	// is that they are no longer a list of holes: every one of the fourteen now names a
	// gate the handler really runs, and the four session doors name the ownership check
	// as well. Census: test/unit/tool_permission_census_tripwire.test.ts; behaviour:
	// test/unit/tool_sitebuilder_authz_native.test.ts.
	apiActions: {
		get_status: {
			permission: null,
			gatedInHandler:
				'assertPublisher() — developer OR global admin, refusing with site_builder.rejected before the daemon call (the daemon executes whatever the engine sends). A read that discloses whether a site builder runs here, whether it is up, and its /health body (service identity, installed agent drivers).',
			handler: getStatus,
		},
		list_sites: {
			permission: null,
			gatedInHandler:
				'assertPublisher() — developer OR global admin, refusing with site_builder.rejected before the daemon call (the daemon executes whatever the engine sends). A read that discloses the whole site inventory, unpublished work included.',
			handler: listSites,
		},
		create_site: {
			permission: null,
			gatedInHandler:
				'assertPublisher() — developer OR global admin, refusing with site_builder.rejected before the daemon call (the daemon executes whatever the engine sends). Provisions a workspace on the daemon host and claims a slug; requireSlug() and the name bounds are INPUT VALIDATION, not authorization.',
			handler: createSite,
		},
		delete_site: {
			permission: null,
			gatedInHandler:
				'assertPublisher() — developer OR global admin, refusing with site_builder.rejected before the daemon call (the daemon executes whatever the engine sends). Now UNCONDITIONAL (P2-8(b)) — the plain workspace+preprod delete used to be ungated; the purge_prod half additionally keeps its own publisher check and an explicit confirm flag.',
			handler: deleteSite,
		},
		session_start: {
			permission: null,
			gatedInHandler:
				'assertPublisher() — developer OR global admin, refusing with site_builder.rejected before the daemon call (the daemon executes whatever the engine sends). Starts an autonomous coding agent on the installation credentials, and records the caller as its owner via recordSessionOwner() (session_owner.ts).',
			handler: sessionStart,
		},
		session_message: {
			permission: null,
			gatedInHandler:
				'assertPublisher() (developer OR global admin) AND assertSessionOwner() (session_owner.ts) — the recorded owner of the session id, or a global admin; an unknown owner is a refusal. Without ownership any publisher could type into an agent session belonging to somebody else.',
			handler: sessionMessage,
		},
		session_stop: {
			permission: null,
			gatedInHandler:
				'assertPublisher() (developer OR global admin) AND assertSessionOwner() (session_owner.ts) — the recorded owner of the session id, or a global admin; an unknown owner is a refusal. Without ownership any publisher could kill, mid-write, a turn belonging to somebody else.',
			handler: sessionStop,
		},
		session_history: {
			permission: null,
			gatedInHandler:
				'assertPublisher() — developer OR global admin, refusing with site_builder.rejected before the daemon call (the daemon executes whatever the engine sends). The site-wide daemon list is additionally FILTERED to the sessions the caller owns through ownedSessionIds() (session_owner.ts); a global admin sees it unfiltered.',
			handler: sessionHistory,
		},
		session_stream: {
			permission: null,
			gatedInHandler:
				'assertPublisher() (developer OR global admin) AND assertSessionOwner() (session_owner.ts) — the recorded owner of the session id, or a global admin; an unknown owner is a refusal. The SSE pass-through IS the session transcript, so an unowned id must never open the upstream leg.',
			handler: sessionStream,
		},
		build: {
			permission: null,
			gatedInHandler:
				'assertPublisher() — developer OR global admin, refusing with site_builder.rejected before the daemon call (the daemon executes whatever the engine sends). Runs the site toolchain on the daemon host and overwrites the preprod bytes that publish promotes.',
			handler: build,
		},
		get_build: {
			permission: null,
			gatedInHandler:
				'assertPublisher() — developer OR global admin, refusing with site_builder.rejected before the daemon call (the daemon executes whatever the engine sends). A read that discloses the build LOG — toolchain error text with host paths.',
			handler: getBuild,
		},
		preview: {
			permission: null,
			gatedInHandler:
				'assertPublisher() — developer OR global admin, refusing with site_builder.rejected before the daemon call (the daemon executes whatever the engine sends). A read that hands out the preprod URL, i.e. unpublished content.',
			handler: preview,
		},
		publish: {
			permission: null,
			gatedInHandler:
				'assertPublisher() — developer OR global admin, refusing with site_builder.rejected — plus an explicit confirm flag, both BEFORE the daemon call (the daemon executes whatever the engine sends).',
			handler: publish,
		},
		get_audit: {
			permission: null,
			gatedInHandler:
				'assertPublisher() — the publish trail is who-took-what-live, so it is developer/global-admin only, checked before the daemon call.',
			handler: getAudit,
		},
	},
	// The tool exists only when the daemon is configured. A fast, pure, cacheable check.
	isAvailable: () =>
		typeof config.siteBuilder.url === 'string' && typeof config.siteBuilder.token === 'string',
};
