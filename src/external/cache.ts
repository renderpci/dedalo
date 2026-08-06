/**
 * THE ROW LAYER — soft cache, in-flight coalescing, and the fan-out bound.
 *
 * WHY createOntologyCache IS RIGHT HERE (and wrong for the breaker): a cached
 * row's identity derives from api_config and the requested field set, both
 * ontology-derived, so an ontology write SHOULD drop it. The breaker's state
 * derives from a remote host's liveness, which an ontology write says nothing
 * about — hence its separate, time-only lifecycle (breaker.ts). Dropping the map
 * is not enough on its own: a fetch already in the air settles AFTER the write
 * with a row unwrapped by the pre-edit binding, so `coalesced` re-checks the
 * binding before it stores (see there) — that is what makes "an ontology write
 * drops it" true rather than merely likely.
 *
 * THE CACHE KEY, and why every part of it is there:
 *
 *   service | originAndPath(apiUrl) | sectionTipo | remoteId | dataLang | fieldSignature
 *
 *   - service + originAndPath: the same id means different records at different
 *     endpoints, and re-pointing api_url must not serve the old service's rows.
 *     PATH but never QUERY — the query holds the id and the fields, which are
 *     already keyed, and (for a `query`-scheme credential) the secret.
 *   - sectionTipo: two sections may bind the same service with different maps.
 *   - remoteId: the record.
 *   - dataLang: the request's data lang, read AT CALL TIME through
 *     currentDataLang() — never module-captured (the S2-11 defect class). The
 *     lang is IN the request (`lgn`), so a row fetched for one language is a
 *     different document.
 *   - fieldSignature: the SORTED field set. v6's static cache omitted it, so a
 *     component asking for {id,title} was served a row fetched for {id} and
 *     silently rendered nothing.
 *
 * NO PRINCIPAL is in the key, and that is a claim that must stay true: with
 * `record_identifiers` egress and ONE install-wide credential, the response
 * cannot vary by user, so a shared cache is legal. A per-USER credential would
 * make it illegal — the day an adapter needs one, the principal joins the key
 * (or that service opts out of the shared cache).
 *
 * COALESCING was v6's one good idea, kept: a portal row with four
 * component_external children asking for the same record issues ONE call. The
 * hard fan-out bound lives at the door (transport.ts) so it also holds for
 * callers that never come through here.
 */

import { createOntologyCache } from '../core/ontology/cache_factory.ts';
import { currentDataLang } from '../core/resolve/request_lang.ts';
import type { ExternalRowTarget, ExternalRowView, ResolvedExternalService } from './api/types.ts';
import { getExternalServiceForSection } from './config.ts';
import type { RemoteRow } from './descriptor_types.ts';
import { ExternalServiceError, logExternalError } from './errors.ts';
import { defaultPickRow, defaultUnwrapRows, encodeRemoteIdWith } from './fields_map.ts';
import { externalSettings } from './settings.ts';
import type { TransportDeps } from './transport.ts';
import { fetchExternalJson } from './transport.ts';

interface CachedRow {
	readonly row: RemoteRow | null;
	/** 'ok' or the negative cache entry 'not_found'. */
	readonly status: 'ok' | 'not_found';
	readonly storedAt: number;
}

/** Ontology-derived row cache: an ontology write drops it, by construction. */
const rowCache = createOntologyCache<string, CachedRow>();

/**
 * In-flight fetches by cache key. LIFECYCLE: NOT a content cache — a
 * serialization primitive. Each entry is deleted in the `finally` of the very
 * fetch it coalesces (self-draining, the media_index `keyLocks` precedent);
 * keys are cache keys, never request identity.
 */
const inFlight = new Map<string, Promise<CachedRow>>();

/** Scheme + host + path of an api_url. The QUERY is deliberately excluded. */
function originAndPath(apiUrl: string): string {
	try {
		const url = new URL(apiUrl);
		return `${url.protocol}//${url.host}${url.pathname}`;
	} catch {
		return '<unparseable>';
	}
}

export interface ExternalRowCacheKeyParts {
	readonly service: string;
	readonly apiUrl: string;
	readonly sectionTipo: string;
	readonly remoteId: string;
	readonly dataLang: string;
	readonly remoteFields: readonly string[];
}

/** Build the row cache key. Exported so the gates assert every part is present. */
export function externalRowCacheKey(parts: ExternalRowCacheKeyParts): string {
	const fieldSignature = [...parts.remoteFields].sort().join(',');
	return [
		parts.service,
		originAndPath(parts.apiUrl),
		parts.sectionTipo,
		parts.remoteId,
		parts.dataLang,
		fieldSignature,
	].join('|');
}

function softTtlMs(resolved: ResolvedExternalService): number {
	return resolved.model.softTtlMs ?? externalSettings().softTtlMs;
}

/** One real fetch + decode + row pick, with no cache or coalescing around it. */
async function fetchRow(
	resolved: ResolvedExternalService,
	remoteId: string,
	remoteFields: readonly string[],
	dataLang: string,
	deps: TransportDeps | undefined,
	now: number,
): Promise<CachedRow> {
	const { model, apiConfig, sectionTipo } = resolved;
	const request = model.buildRecordRequest({
		apiUrl: apiConfig.apiUrl,
		remoteId: encodeRemoteIdWith(model, remoteId),
		dataLang,
		remoteFields,
	});
	const payload = await fetchExternalJson({
		model,
		request,
		sectionTipo,
		remoteId,
		...(deps === undefined ? {} : { deps }),
	});
	const unwrap = model.unwrapRows ?? defaultUnwrapRows;
	const rows = unwrap(payload, apiConfig.responseMap);
	const pick = model.pickRow ?? ((r, id) => defaultPickRow(model, r, id));
	const row = pick(rows, encodeRemoteIdWith(model, remoteId));
	// A non-matching answer (including a multi-row one) is not_found — never
	// "whatever came first". Negative-cached so a missing record does not become
	// a request per page view.
	return row === null
		? { row: null, status: 'not_found', storedAt: now }
		: { row, status: 'ok', storedAt: now };
}

/**
 * The binding a stored row was unwrapped WITH. Everything in it can change a
 * row's meaning without changing the cache key: `response_map` decides the
 * unwrap and the row pick, and the api_url QUERY (excluded from the key on
 * purpose — it can carry a secret) can change the document.
 */
function bindingIdentity(resolved: ResolvedExternalService): string {
	return `${resolved.model.service}|${JSON.stringify(resolved.apiConfig)}`;
}

/** The coalescing wrapper: N concurrent callers on one key share ONE fetch. */
function coalesced(
	key: string,
	resolved: ResolvedExternalService,
	work: () => Promise<CachedRow>,
): Promise<CachedRow> {
	const existing = inFlight.get(key);
	if (existing !== undefined) return existing;
	const identityAtStart = bindingIdentity(resolved);
	const promise = work()
		.then(async (entry) => {
			// STORE ONLY WHAT IS STILL TRUE. An api_config edit mid-flight clears the
			// resolver cache (and this cache with it), but this fetch is already in
			// the air and was unwrapped with the PRE-EDIT response_map — writing it
			// would re-populate the cache the write just cleared, under a key that
			// encodes neither the response_map nor a generation, and serve the old
			// shape as fresh for a whole soft TTL. The requesting read still gets
			// this row (it is what it asked for, and refusing it would 500 a page
			// for a concurrent cataloguing save); only the PERSISTENCE is dropped.
			let stillCurrent = false;
			try {
				const current = await getExternalServiceForSection(resolved.sectionTipo);
				stillCurrent = current !== null && bindingIdentity(current) === identityAtStart;
			} catch {
				// The binding no longer parses: never cache a row under a config that
				// an operator has to fix anyway.
				stillCurrent = false;
			}
			if (stillCurrent) rowCache.set(key, entry);
			return entry;
		})
		.finally(() => {
			inFlight.delete(key);
		});
	inFlight.set(key, promise);
	return promise;
}

/**
 * Wait for every coalesced fetch to settle. For the graceful-shutdown drain and
 * for tests that must observe a background soft-TTL refresh deterministically.
 */
export async function drainInFlightExternalFetches(): Promise<void> {
	// A refresh may itself start another (rare, but the loop is cheap and exact).
	while (inFlight.size > 0) {
		await Promise.allSettled([...inFlight.values()]);
	}
}

export interface FetchExternalRowsOptions {
	/** Transport seams. Tests inject a fetch; production injects nothing. */
	readonly deps?: TransportDeps;
	/** Override the request data lang (background jobs with no ALS scope). */
	readonly dataLang?: string;
}

/** `${sectionTipo}|${remoteId}` — the result-map key callers index by. */
export function externalRowViewKey(sectionTipo: string, remoteId: string): string {
	return `${sectionTipo}|${remoteId}`;
}

/**
 * Fetch (or serve) the remote rows behind a set of targets.
 *
 * Targets naming the same record are MERGED and their field sets UNIONED before
 * anything is fetched — which is what makes the result map's
 * `${sectionTipo}|${remoteId}` key well-defined, and what collapses a portal
 * row's four components into one call.
 *
 * Never throws for a per-record failure: an unreachable service yields a
 * `stale` view (last good row) or an `unavailable` one, both carrying the
 * reason, so a record renders with its provenance instead of emptying out. A
 * genuine CONFIGURATION error still throws — that is an operator's problem, not
 * a degraded read.
 */
export async function fetchExternalRows(
	targets: readonly ExternalRowTarget[],
	options: FetchExternalRowsOptions = {},
): Promise<Map<string, ExternalRowView>> {
	const dataLang = options.dataLang ?? currentDataLang();
	const now = Date.now();

	// Merge targets, unioning the field sets per record.
	const merged = new Map<string, { sectionTipo: string; remoteId: string; fields: Set<string> }>();
	for (const target of targets) {
		const key = externalRowViewKey(target.sectionTipo, target.remoteId);
		const entry = merged.get(key) ?? {
			sectionTipo: target.sectionTipo,
			remoteId: target.remoteId,
			fields: new Set<string>(),
		};
		for (const field of target.remoteFields) entry.fields.add(field);
		merged.set(key, entry);
	}

	const views = new Map<string, ExternalRowView>();
	await Promise.all(
		[...merged].map(async ([viewKey, entry]) => {
			const resolved = await getExternalServiceForSection(entry.sectionTipo);
			if (resolved === null) {
				// Not an external section: a caller asking for one is a wiring bug,
				// not a degraded read — say so instead of returning an empty row.
				throw new ExternalServiceError({
					service: 'unknown',
					kind: 'bad_config',
					sectionTipo: entry.sectionTipo,
					detail: 'section has no api_config; it is not an external section',
				});
			}
			const remoteFields = [...entry.fields];
			const cacheKey = externalRowCacheKey({
				service: resolved.model.service,
				apiUrl: resolved.apiConfig.apiUrl,
				sectionTipo: entry.sectionTipo,
				remoteId: entry.remoteId,
				dataLang,
				remoteFields,
			});
			const cached = rowCache.get(cacheKey);
			const fresh = cached !== undefined && now - cached.storedAt < softTtlMs(resolved);
			const refresh = (): Promise<CachedRow> =>
				coalesced(cacheKey, resolved, () =>
					fetchRow(resolved, entry.remoteId, remoteFields, dataLang, options.deps, Date.now()),
				);

			if (cached !== undefined && fresh) {
				views.set(viewKey, toView(resolved, entry, cached, cached.status));
				return;
			}
			if (cached !== undefined) {
				// SOFT staleness: serve the old row NOW and refresh behind the request.
				// A refresh failure must not become an unhandled rejection.
				refresh().catch((error) => reportRowError(error));
				views.set(viewKey, toView(resolved, entry, cached, 'stale'));
				return;
			}
			try {
				const entryRow = await refresh();
				views.set(viewKey, toView(resolved, entry, entryRow, entryRow.status));
			} catch (error) {
				const reported = reportRowError(error);
				views.set(viewKey, {
					sectionTipo: entry.sectionTipo,
					remoteId: entry.remoteId,
					service: resolved.model.service,
					row: null,
					status: 'unavailable',
					...(reported === null ? {} : { reason: reported.kind }),
					fetchedAt: 0,
				});
			}
		}),
	);
	return views;
}

/** Log a per-record failure and return it when it is one of ours. */
function reportRowError(error: unknown): ExternalServiceError | null {
	if (error instanceof ExternalServiceError) {
		logExternalError(error);
		return error;
	}
	// Not a classified failure: loud, per CONVENTIONS §1 — never swallowed.
	console.error('[external:unknown] transport unexpected error', error);
	return null;
}

function toView(
	resolved: ResolvedExternalService,
	entry: { sectionTipo: string; remoteId: string },
	cached: CachedRow,
	status: ExternalRowView['status'],
): ExternalRowView {
	return {
		sectionTipo: entry.sectionTipo,
		remoteId: entry.remoteId,
		service: resolved.model.service,
		row: cached.row,
		status: cached.status === 'not_found' ? 'not_found' : status,
		...(cached.status === 'not_found' ? { reason: 'not_found' as const } : {}),
		fetchedAt: cached.storedAt,
	};
}
