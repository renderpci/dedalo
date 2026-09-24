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
 *     silently rendered nothing. Since 2026-09-24 the set is the SECTION's
 *     record field set (record_fields.ts: the id field + every field any of the
 *     section's component_external nodes maps), not the requesting component's
 *     — so the signature does not fragment by caller: one entry per record, one
 *     request per record, whichever component, prepass or export asked first.
 *     It stays in the key because the set is ontology-derived: a fields_map edit
 *     must never be served a row fetched for the old set (the ontology write
 *     also drops this cache — the key makes it true even for a row in flight).
 *
 * NO PRINCIPAL is in the key, and that is a claim that must stay true: with
 * `record_identifiers` egress and ONE install-wide credential, the response
 * cannot vary by user, so a shared cache is legal. A per-USER credential would
 * make it illegal — the day an adapter needs one, the principal joins the key
 * (or that service opts out of the shared cache).
 *
 * COALESCING was v6's one good idea, kept: a portal row with four
 * component_external children asking for the same record issues ONE call (and,
 * with the section-wide field set, so do four SEQUENTIAL cells: the second one
 * is a cache hit on the first one's entry). The
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
import { noteRecordAnswer, noteRecordDelivered } from './record_answers.ts';
import { recordRequestFields } from './record_fields.ts';
import { externalSettings } from './settings.ts';
import type { TransportDeps } from './transport.ts';
import { fetchExternalJson } from './transport.ts';

interface CachedRow {
	readonly row: RemoteRow | null;
	/** 'ok' or the negative cache entry 'not_found'. */
	readonly status: 'ok' | 'not_found';
	readonly storedAt: number;
	/**
	 * When the LAST background refresh of this row failed, in ms.
	 *
	 * This — not cache age — is what makes a served row 'stale'. Passing the
	 * soft TTL is a routine refresh trigger, NOT a degradation: the service is
	 * healthy, the row is almost certainly still correct, and telling the
	 * curator "showing the last known data" every 5 minutes is both false and
	 * noise. The marker means what its label says only when a refresh has
	 * actually FAILED and this row is the fallback.
	 */
	readonly refreshFailedAt?: number;
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
export function originAndPath(apiUrl: string): string {
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
	let payload: unknown;
	try {
		payload = await fetchExternalJson({
			model,
			request,
			sectionTipo,
			remoteId,
			...(deps === undefined ? {} : { deps }),
		});
	} catch (error) {
		const answered = recordAnswerStatus(error);
		if (answered === null) throw error;
		// …unless the ENDPOINT is failing, not the record: a streak of 4xx with
		// nothing delivered (a wrong api_url path, a moved route, a changed id
		// format) is read as the SOURCE failing — thrown, so the view is a
		// retryable `unavailable` that is logged, never negative-cached, and
		// counted by an export as incomplete (record_answers.ts).
		const endpoint = originAndPath(apiConfig.apiUrl);
		if (noteRecordAnswer(model.service, endpoint, answered, now) === 'endpoint') throw error;
		// THE SERVICE ANSWERED ABOUT THIS ONE RECORD: it degrades this record only
		// (the breaker ignored it — breaker.ts evidence law). A 400/422 is logged
		// (once per failure class per window — errors.ts logDedupKey): it can mean
		// OUR request is wrong — an unpadded or local id sent to the service,
		// 2026-09-24 — and the operator must be able to see that. A 404/410 is the
		// same clean "not there" as a non-matching 200, which is not logged either.
		if (answered === 400 || answered === 422) logExternalError(error as ExternalServiceError);
		return { row: null, status: 'not_found', storedAt: now };
	}
	// The endpoint DELIVERED a record answer: whatever it holds, a 4xx from it is
	// again about its record.
	noteRecordDelivered(model.service, originAndPath(apiConfig.apiUrl));
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
 * RECORD-PATH 4xx that mean "the service cannot give a record for this id":
 *   404 / 410 — the record is not (or no longer) there;
 *   400 / 422 — the service REJECTED the id (Zenon answers `400 Error loading
 *               record` for an id it cannot parse, e.g. `65686` where it holds
 *               `000065686`). NOT `unavailable`: that state is retryable and
 *               says "the source could not answer", and both are false — the
 *               source answered definitively, and the same request answers the
 *               same way. `not_found` (retryable false, negative-cached for a
 *               soft TTL) is the honest reading of the answer; the logged
 *               `http_status status=400 … id=…` line keeps the cause visible.
 * Anything else — 401/403 (our credential), 405/409/… — stays a thrown
 * `http_status`, i.e. an `unavailable` view with its reason. Record path ONLY:
 * on a search endpoint a 404 does not mean "no such record" (search.ts never
 * comes through here).
 */
const RECORD_ANSWER_STATUSES: ReadonlySet<number> = new Set([400, 404, 410, 422]);

/** The status when `error` is a record-path answer (RECORD_ANSWER_STATUSES), else null. */
function recordAnswerStatus(error: unknown): number | null {
	if (!(error instanceof ExternalServiceError) || error.kind !== 'http_status') return null;
	const status = error.status;
	return status !== undefined && RECORD_ANSWER_STATUSES.has(status) ? status : null;
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
	/**
	 * The caller's stop (an export's Stop). Once aborted, no FURTHER target is
	 * started; the ones in the air finish (a coalesced fetch may be shared with
	 * another reader, so it is never cut). Targets never started are simply
	 * absent from the result — the caller is stopping.
	 */
	readonly signal?: AbortSignal;
}

/** `${sectionTipo}|${remoteId}` — the result-map key callers index by. */
export function externalRowViewKey(sectionTipo: string, remoteId: string): string {
	return `${sectionTipo}|${remoteId}`;
}

/**
 * Fetch (or serve) the remote rows behind a set of targets.
 *
 * Targets naming the same record are MERGED before anything is fetched — which
 * is what makes the result map's `${sectionTipo}|${remoteId}` key well-defined —
 * and each record is requested with its SECTION's record field set
 * (record_fields.ts), a superset of every target's `remoteFields`: one call per
 * record, the row carries its own id (so the identity check can accept it), and
 * every component of the section projects its fields from the same row.
 *
 * Never throws for a per-record failure: an unreachable service yields a
 * `stale` view (last good row) or an `unavailable` one, both carrying the
 * reason, so a record renders with its provenance instead of emptying out. A
 * genuine CONFIGURATION error still throws — that is an operator's problem, not
 * a degraded read.
 *
 * BOUNDED WORK, NOT BOUNDED SOCKETS ONLY (2026-09-24). The records are walked
 * by at most DEDALO_EXTERNAL_MAX_CONCURRENCY workers, each starting its next
 * record only when the previous one settled. Handing every target to the door at
 * once (a Promise.all over 5 000 export targets) admitted them all through the
 * breaker while it was still closed and parked them in the door's queue: a slow
 * or hanging service then cost every one of them its full timeout × retries.
 * Started one by one, each record meets the breaker's CURRENT verdict, so once
 * the circuit opens the rest are refused without a socket — and a Stop
 * (`signal`) takes effect at the next record.
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
	const resolveOne = async (
		viewKey: string,
		entry: { sectionTipo: string; remoteId: string; fields: Set<string> },
	): Promise<void> => {
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
		// THE RECORD FIELD SET (record_fields.ts): the id field + every field the
		// section's component_external nodes map, whatever THIS caller asked for —
		// one request and one cache entry per record, shared by every caller.
		const remoteFields = await recordRequestFields(resolved.model, entry.sectionTipo, entry.fields);
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

		const at = { sectionTipo: entry.sectionTipo, remoteId: entry.remoteId, remoteFields };
		if (cached !== undefined && fresh) {
			views.set(viewKey, toView(resolved, at, cached, cached.status));
			return;
		}
		if (cached !== undefined) {
			// SOFT-TTL REFRESH: serve the row NOW and refresh behind the
			// request. The served row is reported with its OWN status — a
			// routine refresh is not a degradation, so a healthy service
			// never shows a marker. Only a FAILED refresh downgrades the row
			// to 'stale', on this and every later serve, until one succeeds.
			refresh().catch((error) => {
				reportRowError(error);
				const current = rowCache.get(cacheKey);
				// Re-read: the entry may have been dropped by an ontology
				// write, or already replaced by a later successful refresh.
				if (current !== undefined && current.storedAt === cached.storedAt) {
					rowCache.set(cacheKey, { ...current, refreshFailedAt: Date.now() });
				}
			});
			views.set(
				viewKey,
				toView(
					resolved,
					at,
					cached,
					cached.refreshFailedAt === undefined ? cached.status : 'stale',
				),
			);
			return;
		}
		try {
			const entryRow = await refresh();
			views.set(viewKey, toView(resolved, at, entryRow, entryRow.status));
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
				remoteFields,
			});
		}
	};
	const queue = [...merged];
	let next = 0;
	const worker = async (): Promise<void> => {
		while (next < queue.length && options.signal?.aborted !== true) {
			const [viewKey, entry] = queue[next++] as (typeof queue)[number];
			await resolveOne(viewKey, entry);
		}
	};
	const width = Math.max(1, Math.min(externalSettings().maxConcurrency, queue.length));
	await Promise.all(Array.from({ length: width }, worker));
	return views;
}

/**
 * Log a per-record failure and return it when it is one of ours. The door
 * (logExternalError) keeps this bounded: a `circuit_open` refusal is counted by
 * the breaker and never logged, and a repeated line is counted, not re-logged.
 */
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
	entry: { sectionTipo: string; remoteId: string; remoteFields: readonly string[] },
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
		remoteFields: entry.remoteFields,
	};
}
