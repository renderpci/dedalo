/**
 * The ONLY place the engine talks HTTP to the Site Builder daemon.
 *
 * It attaches the shared bearer token (from config), the acting user's identity (so the
 * daemon can record who did what — the engine is the trusted identity injector; the
 * browser never reaches the daemon), and a timeout on the control calls. It maps every
 * transport failure and daemon problem+json onto a registered `site_builder.*` code
 * (wire.ts), and it never lets the token, the daemon URL or the daemon's own prose leak
 * into a message the engine relays to a browser.
 *
 * Two shapes: `daemonJson` for the ordinary control calls (parsed JSON, timeout), and
 * `daemonStream` for the SSE event pass-through (no overall timeout — a turn streams for
 * minutes; cancellation is wired to the caller's AbortSignal).
 */

import { config } from '../../../src/config/config.ts';
import type { DedaloError } from '../../../src/core/errors/index.ts';
import { capDetail, codeForProblem, type DaemonProblem, siteBuilderFailure } from './wire.ts';

export interface Actor {
	user_id: number;
	username: string;
}

export function isConfigured(): boolean {
	return typeof config.siteBuilder.url === 'string' && typeof config.siteBuilder.token === 'string';
}

function requireConfig(): { url: string; token: string; timeoutMs: number } {
	const { url, token, timeoutMs } = config.siteBuilder;
	if (typeof url !== 'string' || typeof token !== 'string') {
		throw siteBuilderFailure(
			'site_builder.unconfigured',
			'The site builder is not configured on this server.',
		);
	}
	return { url: url.replace(/\/$/, ''), token, timeoutMs };
}

function headers(
	token: string,
	actor: Actor,
	extra: Record<string, string> = {},
): Record<string, string> {
	return {
		Authorization: `Bearer ${token}`,
		'X-Dedalo-User-Id': String(actor.user_id),
		'X-Dedalo-Username': actor.username,
		...extra,
	};
}

/**
 * A control call returning parsed JSON. `body` (for POST/DELETE) has the actor merged in,
 * because the daemon requires it on every mutation. Read calls pass no body.
 */
export async function daemonJson(
	method: 'GET' | 'POST' | 'DELETE',
	path: string,
	actor: Actor,
	body?: Record<string, unknown>,
): Promise<unknown> {
	const { url, token, timeoutMs } = requireConfig();
	const hasBody = method !== 'GET';
	const payload = hasBody ? JSON.stringify({ ...(body ?? {}), actor }) : undefined;

	let res: Response;
	try {
		res = await fetch(url + path, {
			method,
			headers: headers(token, actor, hasBody ? { 'Content-Type': 'application/json' } : {}),
			body: payload,
			signal: AbortSignal.timeout(timeoutMs),
		});
	} catch (error) {
		// Network failure or timeout — log the real cause server-side, surface nothing.
		console.error('[tool_sitebuilder] daemon unreachable:', error);
		throw siteBuilderFailure(
			'site_builder.unreachable',
			'The site builder service is not reachable.',
		);
	}

	if (res.ok) {
		return res.status === 204 ? {} : await res.json().catch(() => ({}));
	}
	throw await mapError(res);
}

/** The SSE pass-through leg: returns the raw daemon Response for byte forwarding. */
export async function daemonStream(
	path: string,
	actor: Actor,
	signal: AbortSignal,
): Promise<Response> {
	const { url, token } = requireConfig();
	let res: Response;
	try {
		res = await fetch(url + path, {
			method: 'GET',
			headers: headers(token, actor, { Accept: 'text/event-stream' }),
			signal,
		});
	} catch (error) {
		console.error('[tool_sitebuilder] daemon stream unreachable:', error);
		throw siteBuilderFailure(
			'site_builder.unreachable',
			'The site builder service is not reachable.',
		);
	}
	if (!res.ok) throw await mapError(res);
	return res;
}

/**
 * A non-2xx daemon response → the registered refusal. The daemon's problem `type`/`reason`
 * chooses the code; its `detail` is LOG-ONLY prose (wire.ts), so nothing the daemon writes
 * can become the browser's error text.
 */
async function mapError(res: Response): Promise<DedaloError> {
	// Auth failures are an operator problem (our token is wrong), not the user's — generic
	// message, loud server log.
	if (res.status === 401 || res.status === 403) {
		console.error(`[tool_sitebuilder] daemon rejected our token (${res.status})`);
		return siteBuilderFailure(
			'site_builder.auth',
			'The site builder rejected this server. Check its configuration.',
			{ status: res.status },
		);
	}
	let problem: DaemonProblem = {};
	try {
		problem = (await res.json()) as DaemonProblem;
	} catch {
		// non-JSON error body
	}
	const fallback =
		res.status >= 400 && res.status < 500 ? 'site_builder.rejected' : 'site_builder.failed';
	const code = codeForProblem(problem, fallback);
	const detail = capDetail(problem.detail, 'The site builder reported an error.');
	console.error(`[tool_sitebuilder] daemon error ${res.status} (${code}):`, problem.detail ?? '');
	return siteBuilderFailure(code, detail, { status: res.status });
}
