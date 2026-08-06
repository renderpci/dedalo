/**
 * THE ONE OUTBOUND DOOR of the external subsystem.
 *
 * Every byte src/external sends leaves through `fetchExternalJson`, and
 * external_outbound_tripwire fails the build on any other `fetch(` /
 * `new Request(` under src/external/**. One door is what makes the order below
 * an INVARIANT rather than a habit.
 *
 * THE ORDER IS LOAD-BEARING. Each step exists because the step after it would
 * otherwise leak something:
 *
 *   0. the adapter's METHOD is GET or POST → `bad_config`   (NO socket). An
 *      external service is a SOURCE: Dédalo never writes to one
 *      (WC-2026-08-06-external-write-refusal, external_write_refusal_tripwire).
 *   1. enabled + per-service kill switch  → `disabled`      (NO socket)
 *   2. circuit breaker for (service,origin) → `circuit_open` (NO socket)
 *   3. HOST ALLOWLIST, before any DNS lookup → `blocked_host` (NO socket, NO
 *      resolver traffic). The URL is assembled from the ontology, which is
 *      editable data; the operator's allowlist — not the ontology — decides
 *      where this server may go. An EMPTY allowlist refuses everything.
 *      (v6 curled an ontology field with ssl_verifypeer=false and followed
 *      redirects: SSRF plus MITM. The frozen PHP shared/core_functions.php
 *      DID hold an allowlist; assertPublicUrl does not.)
 *   4. assertPublicUrl → resolve + vet every address, then PIN the socket to a
 *      vetted one. This closes the DNS-rebinding residual documented at
 *      core/security/ssrf_guard.ts:16-20 for this subsystem.
 *   5. attach the credential — ONLY NOW. Attaching it before 3/4 would let an
 *      ontology edit point the request at an attacker's host and exfiltrate it.
 *   6. fetch: redirect:'error' (a redirect re-chooses the target), an
 *      AbortSignal at the timeout, Accept: application/json, a STREAMED byte
 *      ceiling, and the ADAPTER'S method (v6 sent a bodyless POST at a
 *      query-string URL and got away with it by accident).
 *   7. retry only on timeout / transport / 429 / 5xx — NEVER on a 4xx, which is
 *      an answer. Full jitter: random(0, base·2^attempt); Retry-After honoured.
 *   8. breaker update: 3 consecutive failed CALLS open it for the cooldown;
 *      half-open admits exactly one probe (which never retries); success closes.
 *   9. a JSON parse failure is `protocol`, not `transport` — the connection
 *      worked, the contract did not.
 *
 * CONCURRENCY lives here rather than beside the row cache: the ceiling has to
 * hold for every caller of the door, including one that bypasses the cache.
 * Retries are inside the slot, so a retrying request cannot multiply the load a
 * struggling service is already failing under.
 *
 * COMPOSITION NOTE. `fetchGuardedText` (ssrf_guard.ts) implements steps 4/6
 * only, and cannot express pinning, the allowlist, the classified error kinds
 * or the retry policy; its byte-cap read loop is reproduced here (not
 * duplicated logic — a streamed cap is four lines) rather than losing the rest.
 */

import { isIP } from 'node:net';
import { catalogEntry } from '../config/catalog/index.ts';
import { readOptionalString } from '../config/readers.ts';
import type { SafeUrlResult } from '../core/security/ssrf_guard.ts';
import { assertPublicUrl } from '../core/security/ssrf_guard.ts';
import { checkBreaker, recordFailure, recordSuccess, releaseProbe } from './breaker.ts';
import type { ExternalRequestSpec, ExternalServiceModel } from './descriptor_types.ts';
import { ExternalServiceError, originOf } from './errors.ts';
import { externalSettings } from './settings.ts';

/** Base of the exponential backoff; the actual wait is uniform in [0, base·2^n). */
const RETRY_BASE_MS = 200;

/**
 * The ONLY verbs that may leave this door (step 0 — WC-2026-08-06-external-write-refusal).
 *
 * Dédalo never writes to an external service: a record service is a SOURCE. POST
 * is in the set because it is a read verb here — several catalogue APIs take a
 * query in a body — not because a body makes a mutation acceptable.
 *
 * The type already says `'GET' | 'POST'`, and this check is still load-bearing:
 * an adapter is DATA (descriptor_types.ts), so a cast, a generated adapter or a
 * value threaded in from config carries whatever it carries, and a `DELETE` that
 * reached the socket would already have destroyed a remote record by the time
 * anyone read the log.
 */
const READ_ONLY_METHODS: ReadonlySet<string> = new Set(['GET', 'POST']);

/** A service's own Retry-After is honoured, but never beyond this. */
const MAX_RETRY_AFTER_MS = 10_000;

/** Fetch init with the Bun-only TLS field the socket pin needs. */
export interface ExternalFetchInit extends RequestInit {
	/** SNI + certificate identity, kept at the REAL host while the URL holds an IP. */
	tls?: { serverName?: string };
}

export type ExternalFetchImpl = (url: string, init: ExternalFetchInit) => Promise<Response>;

/** Injectable seams. Tests supply all of them; production supplies none. */
export interface TransportDeps {
	readonly fetchImpl?: ExternalFetchImpl;
	readonly assertPublicUrlImpl?: (uri: string) => Promise<SafeUrlResult>;
	readonly now?: () => number;
	/** Uniform [0,1) source for the retry jitter. */
	readonly random?: () => number;
	readonly sleep?: (ms: number) => Promise<void>;
}

export interface ExternalFetchOptions {
	readonly model: ExternalServiceModel;
	readonly request: ExternalRequestSpec;
	readonly sectionTipo?: string;
	readonly remoteId?: string;
	readonly deps?: TransportDeps;
}

// ---------------------------------------------------------------------------
// Concurrency ceiling — per (service, origin)
// ---------------------------------------------------------------------------

interface ConcurrencySlot {
	/** Calls currently holding a slot. */
	active: number;
	/** FIFO of callers waiting for one. */
	waiters: (() => void)[];
	/**
	 * Waiters ALREADY WOKEN whose continuation has not run yet. They hold no slot
	 * and sit in no queue, so without this counter they are invisible — and an
	 * entry deleted while one is en route leaves that call's work outside every
	 * ceiling and outside activeConcurrency. Between waking and resuming there is
	 * one microtask, which is exactly long enough for the last holder to release.
	 */
	waking: number;
}

/**
 * Per-(service, origin) slot accounting. LIFECYCLE: not a content cache — it is
 * a bounded-parallelism primitive. Entries are created on first use and DELETED
 * the moment the key goes truly idle — nobody holding, nobody queued, nobody
 * woken-and-still-resuming (self-draining, the media_index `keyLocks`
 * precedent). Keys are a service name and a host, never request identity.
 */
const concurrencySlots = new Map<string, ConcurrencySlot>();

/** Run `work` holding one of the at-most-N slots for this (service, origin). */
async function withConcurrencySlot<T>(key: string, work: () => Promise<T>): Promise<T> {
	const ceiling = externalSettings().maxConcurrency;
	const slot = concurrencySlots.get(key) ?? { active: 0, waiters: [], waking: 0 };
	concurrencySlots.set(key, slot);
	// A LOOP, not an `if`: resolving a waiter only QUEUES its continuation, so its
	// `active++` runs a microtask later. A caller entering in that window would
	// see a slot that is already spoken for, admit itself, and push the ceiling to
	// ceiling+1 when the waiter resumes. Re-testing after every wake is what makes
	// the ceiling a ceiling; a woken waiter that lost the race simply re-queues.
	while (slot.active >= ceiling) {
		await new Promise<void>((resolve) => slot.waiters.push(resolve));
		slot.waking--;
	}
	slot.active++;
	try {
		return await work();
	} finally {
		slot.active--;
		const next = slot.waiters.shift();
		if (next !== undefined) {
			slot.waking++;
			next();
		}
		// DELETE ONLY WHEN THE KEY IS TRULY IDLE — nobody holding, nobody queued,
		// nobody en route. Deleting with a woken waiter outstanding orphans this
		// object: the waiter's work stops counting towards activeConcurrency and
		// towards the ceiling of the fresh slot the next caller creates.
		if (slot.active === 0 && slot.waiters.length === 0 && slot.waking === 0) {
			concurrencySlots.delete(key);
		}
	}
}

/** Slots in flight for one (service, origin) — observability for the gates. */
export function activeConcurrency(service: string, origin: string): number {
	return concurrencySlots.get(`${service}|${origin}`)?.active ?? 0;
}

// ---------------------------------------------------------------------------
// Steps 1 + 3 — the two refusals that happen before anything is resolved
// ---------------------------------------------------------------------------

/** Step 1: master switch, then the per-service kill switch. Throws `disabled`. */
function assertServiceEnabled(model: ExternalServiceModel, sectionTipo?: string): void {
	const external = externalSettings();
	if (!external.enabled) {
		throw new ExternalServiceError({
			service: model.service,
			kind: 'disabled',
			...(sectionTipo === undefined ? {} : { sectionTipo }),
			detail: 'DEDALO_EXTERNAL_ENABLED is off',
		});
	}
	if (external.disabledServices.includes(model.service.toLowerCase())) {
		throw new ExternalServiceError({
			service: model.service,
			kind: 'disabled',
			...(sectionTipo === undefined ? {} : { sectionTipo }),
			detail: 'named in DEDALO_EXTERNAL_DISABLED_SERVICES',
		});
	}
}

/**
 * Step 3: the operator's host allowlist, applied to a PARSED url and BEFORE any
 * resolution. Exported because config.ts applies the same rule to an api_url at
 * parse time — one allowlist, one comparison, checked in both places.
 *
 * Comparison is on the host NAME alone, case-insensitively: no scheme, no port,
 * no path, no wildcards. An empty allowlist refuses everything, by design.
 */
export function isAllowedExternalHost(hostname: string): boolean {
	const host = hostname.replace(/^\[|\]$/g, '').toLowerCase();
	return externalSettings().allowedHosts.includes(host);
}

/** Parse + allowlist a URL, or throw `blocked_host`/`bad_config`. */
function parseAllowedUrl(model: ExternalServiceModel, rawUrl: string, sectionTipo?: string): URL {
	let url: URL;
	try {
		url = new URL(rawUrl);
	} catch {
		throw new ExternalServiceError({
			service: model.service,
			kind: 'bad_config',
			...(sectionTipo === undefined ? {} : { sectionTipo }),
			detail: 'unparseable request URL',
		});
	}
	if (url.protocol !== 'http:' && url.protocol !== 'https:') {
		throw new ExternalServiceError({
			service: model.service,
			kind: 'blocked_host',
			origin: originOf(url),
			...(sectionTipo === undefined ? {} : { sectionTipo }),
			detail: 'non-http(s) scheme',
		});
	}
	if (url.username !== '' || url.password !== '') {
		throw new ExternalServiceError({
			service: model.service,
			kind: 'blocked_host',
			origin: originOf(url),
			...(sectionTipo === undefined ? {} : { sectionTipo }),
			detail: 'URL carries embedded credentials',
		});
	}
	if (!isAllowedExternalHost(url.hostname)) {
		throw new ExternalServiceError({
			service: model.service,
			kind: 'blocked_host',
			origin: originOf(url),
			...(sectionTipo === undefined ? {} : { sectionTipo }),
			detail: 'host is not in DEDALO_EXTERNAL_ALLOWED_HOSTS',
		});
	}
	return url;
}

// ---------------------------------------------------------------------------
// Step 5 — the credential
// ---------------------------------------------------------------------------

/**
 * Attach the service's credential to an already-vetted request. The value comes
 * from the config readers on a `scope:'secret'` catalog entry and NEVER from
 * api_config — the ontology is editable data, so a credential that lived there
 * would be readable and writable by anyone who can catalogue.
 *
 * Called only after steps 3 and 4 have accepted the target.
 */
function attachCredential(model: ExternalServiceModel, url: URL, headers: Headers): void {
	const key = model.credentialCatalogKey;
	if (key === undefined) return;
	// A credential must be declared as a secret. `catalogEntry` throws on an
	// unknown key, so a typo in an adapter cannot silently mean "no credential".
	const entry = catalogEntry(key);
	if (entry.scope !== 'secret') {
		throw new ExternalServiceError({
			service: model.service,
			kind: 'bad_config',
			detail: `credential key ${key} is scope '${entry.scope}', not 'secret'`,
		});
	}
	const value = readOptionalString(key);
	if (value === undefined || value === '') return; // unset ⇒ an unauthenticated request
	const scheme = model.credentialScheme ?? 'bearer';
	if (scheme === 'bearer') {
		headers.set('Authorization', `Bearer ${value}`);
		return;
	}
	if (scheme === 'header') {
		const name = model.credentialParam;
		if (name === undefined) {
			throw new ExternalServiceError({
				service: model.service,
				kind: 'bad_config',
				detail: "credentialScheme 'header' needs credentialParam",
			});
		}
		headers.set(name, value);
		return;
	}
	const param = model.credentialParam;
	if (param === undefined) {
		throw new ExternalServiceError({
			service: model.service,
			kind: 'bad_config',
			detail: "credentialScheme 'query' needs credentialParam",
		});
	}
	url.searchParams.set(param, value);
}

// ---------------------------------------------------------------------------
// Step 6 — the guarded read
// ---------------------------------------------------------------------------

/** Read a response body with a hard, STREAMED ceiling. Never truncates into a value. */
async function readCapped(response: Response, maxBytes: number): Promise<string> {
	const reader = response.body?.getReader();
	if (reader === undefined) return '';
	const chunks: Uint8Array[] = [];
	let total = 0;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		if (value === undefined) continue;
		total += value.byteLength;
		if (total > maxBytes) {
			await reader.cancel();
			throw new RangeError(`response exceeds ${maxBytes} bytes`);
		}
		chunks.push(value);
	}
	const merged = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) {
		merged.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return new TextDecoder().decode(merged);
}

/** `Retry-After` in ms (delta-seconds or HTTP-date), capped; null when absent/bogus. */
function retryAfterMs(response: Response, now: number): number | null {
	const header = response.headers.get('retry-after');
	if (header === null) return null;
	const seconds = Number(header.trim());
	if (Number.isFinite(seconds) && seconds >= 0) {
		return Math.min(seconds * 1000, MAX_RETRY_AFTER_MS);
	}
	const at = Date.parse(header);
	if (Number.isNaN(at)) return null;
	return Math.min(Math.max(0, at - now), MAX_RETRY_AFTER_MS);
}

/** Only these can be fixed by trying again. A 4xx is an ANSWER, never retried. */
function isRetryable(error: ExternalServiceError): boolean {
	if (error.kind === 'timeout' || error.kind === 'transport') return true;
	if (error.kind !== 'http_status') return false;
	const status = error.status ?? 0;
	return status === 429 || status >= 500;
}

/** ONE attempt: pin, credential, fetch, cap. Throws a classified error. */
async function attempt(
	options: ExternalFetchOptions,
	url: URL,
	deps: Required<Pick<TransportDeps, 'now'>> & TransportDeps,
): Promise<string> {
	const { model, request, sectionTipo, remoteId } = options;
	const origin = originOf(url);
	const coordinates = {
		service: model.service,
		origin,
		...(sectionTipo === undefined ? {} : { sectionTipo }),
		...(remoteId === undefined ? {} : { remoteId }),
	};

	// Step 4 — resolve + vet, then pin.
	const assertUrl = deps.assertPublicUrlImpl ?? assertPublicUrl;
	let vetted: SafeUrlResult;
	try {
		vetted = await assertUrl(url.toString());
	} catch (error) {
		throw new ExternalServiceError({
			...coordinates,
			kind: 'blocked_host',
			detail: 'refused by the SSRF guard',
			cause: error,
		});
	}

	// Step 5 — the credential, now that the target is vetted. Mutates a COPY of
	// the URL so a `query`-scheme credential never leaks into a log or a key.
	const requestUrl = new URL(url.toString());
	const headers = new Headers();
	headers.set('Accept', request.accept ?? 'application/json');
	if (request.contentType !== undefined) headers.set('Content-Type', request.contentType);
	attachCredential(model, requestUrl, headers);

	// The socket pin: when the host was a NAME, address the vetted IP directly
	// and keep the real host for SNI, certificate identity and the Host header.
	// An IP-literal host has nothing to rebind, so it is left alone.
	const realHost = requestUrl.hostname;
	const init: ExternalFetchInit = { method: request.method, headers, redirect: 'error' };
	if (isIP(realHost.replace(/^\[|\]$/g, '')) === 0) {
		const pinned = vetted.addresses[0];
		if (pinned === undefined) {
			throw new ExternalServiceError({
				...coordinates,
				kind: 'blocked_host',
				detail: 'no vetted address',
			});
		}
		headers.set('Host', requestUrl.host);
		init.tls = { serverName: realHost };
		requestUrl.hostname = isIP(pinned) === 6 ? `[${pinned}]` : pinned;
	}
	if (request.body !== undefined) init.body = request.body;

	const timeoutMs = model.timeoutMs ?? externalSettings().timeoutMs;
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);
	init.signal = controller.signal;
	const doFetch = deps.fetchImpl ?? ((target: string, i: ExternalFetchInit) => fetch(target, i));
	try {
		let response: Response;
		try {
			response = await doFetch(requestUrl.toString(), init);
		} catch (error) {
			const aborted = controller.signal.aborted;
			throw new ExternalServiceError({
				...coordinates,
				kind: aborted ? 'timeout' : 'transport',
				detail: aborted ? `aborted after ${timeoutMs}ms` : 'connection or redirect failure',
				cause: error,
			});
		}
		if (!response.ok) {
			const asked = retryAfterMs(response, deps.now());
			throw new ExternalServiceError({
				...coordinates,
				kind: 'http_status',
				status: response.status,
				...(asked === null ? {} : { retryAfterMs: asked }),
			});
		}
		let text: string;
		try {
			text = await readCapped(response, externalSettings().maxBytes);
		} catch (error) {
			if (error instanceof RangeError) {
				throw new ExternalServiceError({ ...coordinates, kind: 'too_large', cause: error });
			}
			throw new ExternalServiceError({
				...coordinates,
				kind: 'transport',
				detail: 'response stream failed',
				cause: error,
			});
		}
		return text;
	} finally {
		clearTimeout(timer);
	}
}

/**
 * Fetch and decode ONE external JSON document, through all nine steps. Returns
 * the parsed payload; every failure is a classified `ExternalServiceError`.
 */
export async function fetchExternalJson(options: ExternalFetchOptions): Promise<unknown> {
	const { model, request, sectionTipo, remoteId } = options;
	const deps = { now: () => Date.now(), ...options.deps };

	// Step 0 — the METHOD, ahead of every other check because a mutating verb is
	// not a request this installation may make at all, whatever the switches say.
	// `bad_config`: the adapter is misdeclared, which is an operator's problem.
	if (!READ_ONLY_METHODS.has(request.method)) {
		throw new ExternalServiceError({
			service: model.service,
			kind: 'bad_config',
			origin: originOf(request.url),
			...(sectionTipo === undefined ? {} : { sectionTipo }),
			...(remoteId === undefined ? {} : { remoteId }),
			detail: `adapter asked for method '${request.method}' — external services are read-only sources`,
		});
	}

	// Step 1 — before anything is parsed or resolved.
	assertServiceEnabled(model, sectionTipo);

	// Step 3 — allowlist BEFORE any DNS lookup (step 4 is the first resolver traffic).
	const url = parseAllowedUrl(model, request.url, sectionTipo);
	const origin = originOf(url);

	// Step 2 — the circuit, now that we know which origin it guards.
	const verdict = checkBreaker(model.service, origin, deps.now());
	if (verdict === 'open') {
		throw new ExternalServiceError({
			service: model.service,
			kind: 'circuit_open',
			origin,
			...(sectionTipo === undefined ? {} : { sectionTipo }),
			...(remoteId === undefined ? {} : { remoteId }),
		});
	}

	// Steps 6-8, inside one concurrency slot so retries never widen the fan-out.
	return withConcurrencySlot(`${model.service}|${origin}`, async () => {
		// A half-open probe is ONE attempt: retrying it would defeat the breaker.
		const maxAttempts =
			verdict === 'probe' ? 1 : 1 + (model.retry ?? externalSettings().retryAttempts);
		let lastError: ExternalServiceError | undefined;
		// A probe MUST be settled on every exit path (breaker.ts:checkBreaker). The
		// two verdict-bearing exits set this; the `finally` below covers the rest —
		// an unclassified throw out of `attempt`, and the `protocol` throw that
		// deliberately does not touch the breaker. Without it, one such escape wedges
		// probeInFlight true FOREVER and the origin answers `open` until a restart.
		let probeSettled = verdict !== 'probe';
		try {
			for (let index = 0; index < maxAttempts; index++) {
				try {
					const text = await attempt(options, url, deps);
					recordSuccess(model.service, origin); // step 8: first success closes
					probeSettled = true;
					try {
						return JSON.parse(text) as unknown;
					} catch (error) {
						// Step 9 — the connection worked, the contract did not. NOT a
						// transport failure, so it is never retried and never opens the
						// circuit on the transport's behalf.
						throw new ExternalServiceError({
							service: model.service,
							kind: 'protocol',
							origin,
							...(sectionTipo === undefined ? {} : { sectionTipo }),
							...(remoteId === undefined ? {} : { remoteId }),
							detail: 'response is not JSON',
							cause: error,
						});
					}
				} catch (error) {
					if (!(error instanceof ExternalServiceError)) throw error;
					if (error.kind === 'protocol') throw error;
					lastError = error;
					// Step 7 — a 4xx is an answer; only the retryable kinds go round again.
					if (index + 1 >= maxAttempts || !isRetryable(error)) break;
					// Full jitter: uniform in [0, base·2^attempt). A fixed backoff makes
					// every waiting client retry in the same instant.
					const jitterCeiling = RETRY_BASE_MS * 2 ** index;
					const random = deps.random ?? Math.random;
					const waitMs = error.retryAfterMs ?? Math.floor(random() * jitterCeiling);
					const sleep = deps.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
					await sleep(waitMs);
				}
			}
			recordFailure(model.service, origin, deps.now()); // step 8
			probeSettled = true;
			throw (
				lastError ?? new ExternalServiceError({ service: model.service, kind: 'transport', origin })
			);
		} finally {
			// Release WITHOUT counting a failure: nothing here learned anything about
			// the remote end, and counting a local defect would open the circuit for a
			// healthy origin after three requests (see breaker.ts:releaseProbe).
			if (!probeSettled) releaseProbe(model.service, origin, deps.now());
		}
	});
}
