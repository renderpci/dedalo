/**
 * THE HARVESTING DOOR — how a tool fetches pages from another institution's site.
 *
 * Acquisition tools read auction catalogues, journal OAI endpoints, publisher
 * pages: HTML, XML, JSON and the images and PDFs they link to. They need what an
 * API call must refuse (following redirects) and owe what an API call does not
 * (asking robots.txt, keeping a polite pace). Before this door each tool built
 * its own fetch layer, and each copy missed something different — unchecked
 * redirects, a dead IPv6 check, an unguarded robots.txt fetch, an unbounded
 * Crawl-delay, module state racing across jobs (PR #114 review, 2026-09-29).
 *
 * `harvestFetch` gives every tool the whole contract, in this order, for EVERY
 * hop of a redirect chain (`follow.ts`):
 *
 *   1. URL shape — http(s), no embedded credentials, never https → http (https
 *      only with `requireHttps`) — refused with `harvest.refused`;
 *   2. the caller's HOST policy — `'public'`, or an allowlist of sites;
 *   3. robots.txt for the hop's origin (`robots.ts`, RFC 9309) — refused with
 *      `harvest.robots_disallowed` / `harvest.robots_unavailable`;
 *   4. the per-origin pace (`pacing.ts`), the site's Crawl-delay clamped; the turn
 *      is held for the whole hop, and a 429/503 `Retry-After` lengthens the next
 *      caller's wait;
 *   5. `fetchPinnedHop` (core/security/ssrf_guard.ts): every address public, the
 *      socket PINNED to the vetted one, a TOTAL deadline and an idle deadline,
 *      the job's abort signal, a streamed byte ceiling (`harvest.too_large`), and
 *      — with `expectContentType` — a 2xx of another media type refused before
 *      its body is read (`harvest.unexpected_type`).
 *
 * A non-2xx answer is RETURNED (`ok:false`, with its status) — a 404 lot or a 403
 * from a bot wall is information the tool reports, not a transport failure.
 *
 * What the door does NOT do: parse, decide what a page means, or detect a bot
 * challenge page served with 200. Those are the tool's.
 */

import { isIP } from 'node:net';
import { DedaloError, isDedaloError } from '../errors/index.ts';
import { type PinnedHopResponse, parseRetryAfterMs } from '../security/ssrf_guard.ts';
import {
	type FollowDeps,
	type FollowOptions,
	followVetted,
	type HarvestHosts,
	type HopDone,
	type HopPlan,
	siteKey,
} from './follow.ts';
import { HARVEST_USER_AGENT } from './identity.ts';
import {
	acquireTurn,
	MAX_INTERVAL_MS,
	type PacingDeps,
	paceInterval,
	type WaitObserver,
} from './pacing.ts';
import { harvestRefused, harvestTooLarge, siteOf, unexpectedType } from './refusals.ts';
import { assertRobotsAllow, type RobotsPolicy } from './robots.ts';

export type { HarvestHosts } from './follow.ts';
export { HARVEST_USER_AGENT } from './identity.ts';

/** Default body ceiling: a large catalogue page or a typical PDF. */
export const HARVEST_DEFAULT_MAX_BYTES = 20 * 1024 * 1024;
/** No caller may raise the ceiling past this (a book-length PDF). */
export const HARVEST_MAX_BYTES = 100 * 1024 * 1024;
/** Default TOTAL time for one hop, its body included. */
export const HARVEST_DEFAULT_TIMEOUT_MS = 120_000;
/** The longest total a caller may ask for: 100 MiB on a slow (≈ 200 KiB/s) link. */
export const HARVEST_MAX_TIMEOUT_MS = 10 * 60_000;
/** Default time the body may stall without a single byte before the peer is dropped. */
export const HARVEST_DEFAULT_IDLE_TIMEOUT_MS = 30_000;

/**
 * The request headers a caller may set. Everything else is the door's: `Host`
 * and TLS identity belong to the socket pin, `User-Agent` to the identity robots
 * rules are written against, and a cookie or credential has no business on a
 * request whose target a redirect may still change.
 */
const CALLER_HEADERS: ReadonlySet<string> = new Set([
	'accept',
	'accept-language',
	'content-type',
	'referer',
	'x-requested-with',
]);

/**
 * The response headers a caller may read. A tool needs these to name a file,
 * notice a bot wall (`cf-mitigated`), back off, or skip an unchanged resource;
 * the rest (cookies above all) is the door's business, not the tool's.
 */
const EXPOSED_RESPONSE_HEADERS: readonly string[] = [
	'cf-mitigated',
	'content-disposition',
	'content-length',
	'content-type',
	'etag',
	'last-modified',
	'retry-after',
];

export interface HarvestRequest {
	readonly url: string;
	readonly hosts: HarvestHosts;
	readonly method?: 'GET' | 'POST';
	/**
	 * A POST body. A `URLSearchParams` is sent as a form
	 * (`application/x-www-form-urlencoded`, unless you set a Content-Type).
	 */
	readonly body?: string | URLSearchParams;
	readonly headers?: Readonly<Record<string, string>>;
	/** Body ceiling; clamped to `HARVEST_MAX_BYTES`. */
	readonly maxBytes?: number;
	/** TOTAL time per hop, body included; clamped to `HARVEST_MAX_TIMEOUT_MS`. */
	readonly timeoutMs?: number;
	/** How long the body may stall without a byte; never longer than `timeoutMs`. */
	readonly idleTimeoutMs?: number;
	/**
	 * Media-type prefixes a 2xx answer must match (`['image/']`,
	 * `['application/pdf']`); another type is refused before its body is read.
	 */
	readonly expectContentType?: readonly string[];
	/** Refuse any hop that is not https, the first one included. */
	readonly requireHttps?: boolean;
	/** Told how long a hop will wait for its turn at the site, before it waits. */
	readonly onWait?: WaitObserver;
}

export interface HarvestResponse {
	/** The URL that finally answered, after redirects. */
	readonly url: string;
	readonly status: number;
	/** 200–299. */
	readonly ok: boolean;
	/** The `Content-Type` header, lowercased; '' when absent. */
	readonly contentType: string;
	/** The exposed response headers that were present, keyed in lower case. Frozen. */
	readonly headers: Readonly<Record<string, string>>;
	readonly bytes: Uint8Array;
	/** The body as text, in the charset the response declares (UTF-8 otherwise). */
	text(): string;
}

/** Injectable seams. Tests supply them; production supplies none. */
export interface HarvestDeps extends FollowDeps, PacingDeps {}

/** A caller-supplied header name is refused unless it is one of `CALLER_HEADERS`. */
function assertCallerHeader(name: string): void {
	if (CALLER_HEADERS.has(name.toLowerCase())) return;
	throw new DedaloError('internal.invariant', {
		message: `harvestFetch: header '${name}' is the door's, not the caller's`,
		coordinates: { header: name },
	});
}

/** The request headers, with ours set and the caller's checked. */
function buildHeaders(request: HarvestRequest): Headers {
	const headers = new Headers();
	for (const [name, value] of Object.entries(request.headers ?? {})) {
		assertCallerHeader(name);
		headers.set(name, value);
	}
	if (request.body instanceof URLSearchParams && !headers.has('content-type')) {
		headers.set('Content-Type', 'application/x-www-form-urlencoded;charset=UTF-8');
	}
	headers.set('User-Agent', HARVEST_USER_AGENT);
	return headers;
}

/**
 * A caller's limit, as a positive whole number no larger than `ceiling`. Absent
 * means the default; anything else that is not a positive finite number (NaN
 * would make `total > NaN` false forever, i.e. no ceiling at all) is a defect. A
 * fraction rounds down, but never to 0.
 */
function bounded(value: number | undefined, fallback: number, ceiling: number): number {
	if (value === undefined) return fallback;
	if (!Number.isFinite(value) || value <= 0) {
		throw new DedaloError('internal.invariant', {
			message: `harvestFetch: a limit must be a positive finite number, got ${value}`,
			coordinates: { value: String(value) },
		});
	}
	return Math.min(Math.max(1, Math.floor(value)), ceiling);
}

/**
 * An allowlist in the form hostnames arrive in: each entry parsed as a URL host
 * (lower-cased, IDN in punycode, no trailing dot; an IPv6 literal bracketed or
 * bare). An entry that is not a host is a defect, never a silent no-match — nor,
 * if empty, a match for `a..`.
 */
function normalizeHosts(hosts: HarvestHosts): HarvestHosts {
	if (hosts === 'public') return hosts;
	return hosts.map(normalizeHost);
}

function normalizeHost(entry: string): string {
	const trimmed = entry.trim();
	const literal = isIP(trimmed) === 6 ? `[${trimmed}]` : trimmed;
	const parsed = URL.parse(`http://${literal}`);
	const host = parsed?.hostname.replace(/\.$/, '') ?? '';
	if (host === '' || parsed?.pathname !== '/' || parsed.port !== '') {
		throw new DedaloError('internal.invariant', {
			message: `harvestFetch: '${entry}' is not a host name`,
			coordinates: { entry },
		});
	}
	return host;
}

/** `expectContentType` as lower-case prefixes; an empty list or prefix is a defect. */
function expectedTypes(request: HarvestRequest): readonly string[] | undefined {
	const expected = request.expectContentType;
	if (expected === undefined) return undefined;
	const prefixes = expected.map((prefix) => prefix.trim().toLowerCase());
	if (prefixes.length === 0 || prefixes.includes('')) {
		throw new DedaloError('internal.invariant', {
			message: 'harvestFetch: expectContentType needs at least one non-empty media-type prefix',
		});
	}
	return prefixes;
}

/** Read a body only when it is not a 2xx, or its media type is one the caller expects. */
function bodyFilter(prefixes: readonly string[]): (status: number, headers: Headers) => boolean {
	return (status, headers) => {
		if (status < 200 || status >= 300) return true;
		const type = (headers.get('content-type') ?? '').toLowerCase().trim();
		return prefixes.some((prefix) => type.startsWith(prefix));
	};
}

/** The first hop's plan: the caller's URL, method and body — or a refusal. */
function startPlan(request: HarvestRequest): HopPlan {
	const url = URL.parse(request.url);
	if (url === null) throw harvestRefused('unparseable', siteOf(request.url));
	const plan: HopPlan = { url, method: request.method ?? 'GET' };
	if (request.body === undefined) return plan;
	if (plan.method !== 'POST') {
		throw new DedaloError('internal.invariant', {
			message: 'harvestFetch: a body needs method POST',
		});
	}
	plan.body = request.body.toString();
	return plan;
}

/**
 * How long a 429/503 asked us to stay away — the guard's one `Retry-After` reader,
 * clamped to the pace's ceiling; 0 when it asked nothing we can read.
 */
export function retryAfterMs(value: string | null, now: number): number {
	return Math.min(parseRetryAfterMs(value, now) ?? 0, MAX_INTERVAL_MS);
}

/** The wait a finished hop asks of the next request to its origin. */
function backoffOf(response: PinnedHopResponse | null, now: number): number {
	if (response === null || (response.status !== 429 && response.status !== 503)) return 0;
	return retryAfterMs(response.headers.get('retry-after'), now);
}

function crawlDelayOf(policy: RobotsPolicy): number | null {
	return policy.kind === 'rules' ? policy.crawlDelayMs : null;
}

/** The per-hop gate: robots.txt, then this origin's turn — released with the hop's back-off. */
function hopGate(request: HarvestRequest, deps: HarvestDeps): (url: URL) => Promise<HopDone> {
	const now = deps.now ?? Date.now;
	return async (url) => {
		const policy = await assertRobotsAllow(url, now(), deps);
		const interval = paceInterval(crawlDelayOf(policy));
		const done = await acquireTurn(siteKey(url), interval, deps, request.onWait);
		return (response) => done(backoffOf(response, now()));
	};
}

/** Everything `followVetted` needs for this request, limits validated and clamped. */
function followOptions(request: HarvestRequest, deps: HarvestDeps): FollowOptions {
	const timeoutMs = bounded(request.timeoutMs, HARVEST_DEFAULT_TIMEOUT_MS, HARVEST_MAX_TIMEOUT_MS);
	const idle = bounded(request.idleTimeoutMs, HARVEST_DEFAULT_IDLE_TIMEOUT_MS, timeoutMs);
	const expected = expectedTypes(request);
	return {
		hosts: normalizeHosts(request.hosts),
		...(request.requireHttps === true ? { requireHttps: true } : {}),
		headers: buildHeaders(request),
		maxBytes: bounded(request.maxBytes, HARVEST_DEFAULT_MAX_BYTES, HARVEST_MAX_BYTES),
		timeoutMs,
		idleTimeoutMs: Math.min(idle, timeoutMs),
		...(expected === undefined ? {} : { acceptBody: bodyFilter(expected) }),
		beforeHop: hopGate(request, deps),
		deps,
	};
}

/**
 * The primitive's body-cap failure, as the door's own code. Every other failure
 * (a refusal, a timeout, a stopped job) passes through as it is.
 */
function doorFailure(error: unknown, site: string, maxBytes: number): unknown {
	const bodyCap = isDedaloError(error) && error.coordinates?.reason === 'body_cap';
	return bodyCap ? harvestTooLarge(site, maxBytes, error) : error;
}

/** Fetch one resource from another site, through the whole harvesting contract. */
export async function harvestFetch(
	request: HarvestRequest,
	deps: HarvestDeps = {},
): Promise<HarvestResponse> {
	const plan = startPlan(request);
	const options = followOptions(request, deps);
	const site = siteOf(plan.url);
	const result = await followVetted(plan, options).catch((error: unknown) => {
		throw doorFailure(error, site, options.maxBytes);
	});
	const { response } = result;
	if (response.bodySkipped) {
		throw unexpectedType(site, response.headers.get('content-type') ?? '');
	}
	return toHarvestResponse(result.url, response);
}

/** The exposed subset of the response headers (`EXPOSED_RESPONSE_HEADERS`), frozen. */
function exposedHeaders(headers: Headers): Readonly<Record<string, string>> {
	const exposed: Record<string, string> = {};
	for (const name of EXPOSED_RESPONSE_HEADERS) {
		const value = headers.get(name);
		if (value !== null) exposed[name] = value;
	}
	return Object.freeze(exposed);
}

function toHarvestResponse(url: URL, response: PinnedHopResponse): HarvestResponse {
	const contentType = (response.headers.get('content-type') ?? '').toLowerCase();
	const { status, bytes } = response;
	return {
		url: url.toString(),
		status,
		ok: status >= 200 && status < 300,
		contentType,
		headers: exposedHeaders(response.headers),
		bytes,
		text: () => decodeBody(bytes, contentType),
	};
}

/** A charset label as the three declaration forms spell it. */
const CHARSET_LABEL = '([\\w.:-]+)';
const HEADER_CHARSET = new RegExp(`charset=["']?${CHARSET_LABEL}`, 'i');
const META_CHARSET = new RegExp(`<meta[^>]+charset=["']?${CHARSET_LABEL}`, 'i');
const XML_ENCODING = new RegExp(`^\\s*<\\?xml[^>]+encoding=["']${CHARSET_LABEL}`, 'i');

/**
 * Decode in the declared charset: the `Content-Type` parameter first; then, in
 * the first KiB, an XML declaration's `encoding=` or an HTML `<meta charset>`
 * (many catalogue sites and OAI endpoints declare Latin-1 only there); else
 * UTF-8. An unknown label falls back to UTF-8, never throws.
 */
export function decodeBody(bytes: Uint8Array, contentType: string): string {
	const declared = HEADER_CHARSET.exec(contentType)?.[1] ?? sniffCharset(bytes);
	try {
		return new TextDecoder(declared ?? 'utf-8').decode(bytes);
	} catch {
		return new TextDecoder('utf-8').decode(bytes);
	}
}

function sniffCharset(bytes: Uint8Array): string | undefined {
	const head = new TextDecoder('latin1').decode(bytes.subarray(0, 1024));
	return XML_ENCODING.exec(head)?.[1] ?? META_CHARSET.exec(head)?.[1];
}
