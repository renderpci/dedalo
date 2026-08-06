/**
 * SERVER-SIDE EXTERNAL SEARCH — the browser asks the engine, the engine asks
 * the service.
 *
 * Until 2026-08-06 there was no such path: `service_autocomplete.js`'s
 * `zenon_engine` issued a cross-origin XHR straight at
 * `https://zenon.dainst.org/api/v1/search` from the CURATOR'S BROWSER. That
 * bypassed, by construction, every control engineering/EXTERNAL_SPEC.md §5
 * describes — the master and per-service kill switches, the operator's host
 * allowlist, `assertPublicUrl` + the socket pin, the circuit breaker, the
 * concurrency ceiling, the streamed byte cap, the retry policy and the egress
 * classification — because none of them can see a request the server never
 * makes. It also could not ever work for an AUTHENTICATED service: a credential
 * that reached a browser is a published credential.
 *
 * (The symptom that surfaced it was narrower: the app's own CSP names no
 * third-party origin in `connect-src` (XSS-02/RC-01), so the browser refused
 * the call and the XHR reported a bare "network error". Adding the origin to
 * `connect-src` was the wrong fix twice over — it reverses a deliberate
 * hardening, and the origin would come from an OPERATOR-EDITABLE ontology
 * field, so a cataloguer could aim the directive at any host.)
 *
 * WHY SEARCH RESULTS ARE NOT CACHED, while records are (cache.ts).
 *
 *   1. The key would be the query. A record id is drawn from a bounded set the
 *      installation holds; a query is free text, one per KEYSTROKE in an
 *      autocomplete. The row cache is an unbounded-growth surface under
 *      `createOntologyCache`, and its hit rate against typed prefixes is
 *      approximately zero — it would cost memory to serve nothing.
 *   2. A stale ROW is a stale field with a `stale` marker next to it; a stale
 *      RESULT SET is a wrong answer to "what is in the catalogue?", with the
 *      newly-catalogued record simply absent and nothing to mark. The row
 *      cache's whole degradation story (§8.2) is about ONE record's provenance
 *      and does not transfer to a set.
 *   3. The row cache key grammar has no place for terms, limit or offset;
 *      bolting them on would make one key mean two different things.
 *
 * COALESCING IS STILL WORTH IT, and is kept: an autocomplete fires overlapping
 * requests for the SAME query string (a repeated keystroke, two widgets on one
 * form, a re-render), and identical in-flight queries must cost one call. That
 * is a serialization primitive, not a cache — the entry is deleted in the
 * `finally` of the very fetch it coalesces, so a SECOND search after the first
 * settles is a second real request.
 *
 * The one outbound door still owns the socket: this module builds a request
 * through the adapter and hands it to `fetchExternalJson`, exactly as
 * `cache.ts::fetchRow` does. It opens no socket of its own
 * (`external_outbound_tripwire`).
 */

import { currentDataLang } from '../core/resolve/request_lang.ts';
import type {
	ExternalSearchHit,
	ExternalSearchResult,
	ResolvedExternalService,
} from './api/types.ts';
import { getExternalServiceForSection } from './config.ts';
import type { ExternalServiceModel } from './descriptor_types.ts';
import { ExternalSearchUnsupportedError, ExternalServiceError } from './errors.ts';
import { decodeRemoteIdWith, encodeRemoteIdWith, resolveRemotePath } from './fields_map.ts';
import type { TransportDeps } from './transport.ts';
import { fetchExternalJson } from './transport.ts';

/** Default rows per page — the literal the browser engine froze at 20. */
export const DEFAULT_SEARCH_LIMIT = 20;

/**
 * The largest page this engine will ask a third party for. NOT a silent clamp:
 * a caller asking for more is REFUSED and told, because a clamped answer is
 * indistinguishable from "the service has no more" and a paginator built on
 * that lies about the end of the result set.
 */
export const MAX_SEARCH_LIMIT = 100;

/**
 * Identical in-flight queries by request key. LIFECYCLE: NOT a content cache —
 * a serialization primitive, self-draining in the `finally` of the fetch it
 * coalesces (the `cache.ts:inFlight` / media_index `keyLocks` precedent). Keys
 * are a service, an endpoint, a query and a page — never request identity.
 */
const inFlightSearches = new Map<string, Promise<ExternalSearchResult>>();

/** Wait for every coalesced search to settle (shutdown drain + deterministic tests). */
export async function drainInFlightExternalSearches(): Promise<void> {
	while (inFlightSearches.size > 0) {
		await Promise.allSettled([...inFlightSearches.values()]);
	}
}

/** In-flight coalescing keys, for the gates. */
export function activeExternalSearches(): number {
	return inFlightSearches.size;
}

export interface SearchExternalServiceOptions {
	/** The EXTERNAL section whose api_config binds the service. Never a client URL. */
	readonly sectionTipo: string;
	/** The terms a cataloguer typed. Empty (or blank) ⇒ an empty result, no socket. */
	readonly terms: readonly string[];
	/** Remote field NAMES to ask for, in declaration order (the ddo map's union). */
	readonly remoteFields: readonly string[];
	readonly limit?: number;
	readonly offset?: number;
	/** Transport seams. Tests inject a fetch; production injects nothing. */
	readonly deps?: TransportDeps;
	/** Override the request data lang (background jobs with no ALS scope). */
	readonly dataLang?: string;
}

/**
 * Search an external service and return its hits.
 *
 * THROWS — deliberately, and unlike `fetchExternalRows`. A record read degrades
 * because one field of a rendered record is missing and the page must still
 * render; a search has no other content to protect, and an empty array is a
 * lie a user acts on ("this catalogue has nothing about Ripollès"). The caller
 * (the API handler) turns the classified error into a named failure envelope.
 */
export async function searchExternalService(
	options: SearchExternalServiceOptions,
): Promise<ExternalSearchResult> {
	const { sectionTipo, remoteFields } = options;
	const limit = options.limit ?? DEFAULT_SEARCH_LIMIT;
	const offset = options.offset ?? 0;
	const dataLang = options.dataLang ?? currentDataLang();

	// THE EMPTY QUERY, refused BEFORE anything is resolved and long before any
	// socket. The browser engine substituted a seven-enye nonsense sentinel
	// because Zenon answers an empty lookfor with its first ten records; a magic
	// string whose correctness depends on a remote tokeniser continuing to fail
	// to match it is not a contract, and the literal is gone from this engine
	// (external_search_native asserts its absence). "No query" has an exact
	// answer: no hits.
	const terms = options.terms.map((term) => term.trim()).filter((term) => term.length > 0);
	if (terms.length === 0) {
		return { service: 'unknown', sectionTipo, hits: [], total: null, limit, offset, dropped: 0 };
	}

	const resolved = await getExternalServiceForSection(sectionTipo);
	if (resolved === null) {
		throw new ExternalServiceError({
			service: 'unknown',
			kind: 'bad_config',
			sectionTipo,
			detail: 'section has no api_config; it is not an external section',
		});
	}
	const { model, apiConfig } = resolved;

	assertExternalSearchable(model, resolved);
	// Narrowed by assertSearchable; re-read as locals so TS keeps the narrowing.
	const buildSearchRequest = model.buildSearchRequest;
	const unwrapSearch = model.unwrapSearch;
	const apiUrlSearch = apiConfig.apiUrlSearch;
	if (buildSearchRequest === undefined || unwrapSearch === undefined || apiUrlSearch === null) {
		throw new ExternalSearchUnsupportedError({
			service: model.service,
			sectionTipo,
			reason: 'engine',
			detail: 'search support vanished between the check and the call',
		});
	}

	if (!Number.isInteger(limit) || limit <= 0 || limit > MAX_SEARCH_LIMIT) {
		throw new ExternalServiceError({
			service: model.service,
			kind: 'bad_config',
			sectionTipo,
			detail: `search limit must be an integer in 1..${MAX_SEARCH_LIMIT}`,
		});
	}
	if (!Number.isInteger(offset) || offset < 0) {
		throw new ExternalServiceError({
			service: model.service,
			kind: 'bad_config',
			sectionTipo,
			detail: 'search offset must be a non-negative integer',
		});
	}

	const request = buildSearchRequest({
		apiUrlSearch,
		terms,
		dataLang,
		remoteFields,
		limit,
		offset,
	});

	// Coalescing key: everything that can change the ANSWER. The URL already
	// carries the terms, the fields, the page and the lang, so it is the whole
	// key — plus the section, because two sections may bind the same endpoint
	// with different response_maps and therefore unwrap the same bytes
	// differently.
	const key = `${model.service}|${sectionTipo}|${request.method}|${request.url}`;
	const existing = inFlightSearches.get(key);
	if (existing !== undefined) return existing;

	const promise = (async (): Promise<ExternalSearchResult> => {
		const payload = await fetchExternalJson({
			model,
			request,
			sectionTipo,
			...(options.deps === undefined ? {} : { deps: options.deps }),
		});
		const { rows, total } = unwrapSearch(payload, apiConfig.responseMap);
		const hits: ExternalSearchHit[] = [];
		let dropped = 0;
		for (const row of rows) {
			const remoteId = remoteIdOf(model, row);
			// A row whose id this service's own shape refuses cannot be addressed by
			// a locator, so it cannot be selected, saved or re-read. Dropping it is
			// the only option; COUNTING it is what keeps that from being silent.
			if (remoteId === null) {
				dropped++;
				continue;
			}
			hits.push({ sectionTipo, remoteId, row });
		}
		return { service: model.service, sectionTipo, hits, total, limit, offset, dropped };
	})().finally(() => {
		inFlightSearches.delete(key);
	});
	inFlightSearches.set(key, promise);
	return promise;
}

/**
 * The three ways a service cannot be searched, each named. Order matters only
 * for the message: `service` is the operator-visible fact, `engine` is ours,
 * `config` is the cataloguer's.
 *
 * EXPORTED because it is the refusal itself, not a helper: the gate that proves
 * "capabilities.search === false is refused BY NAME" must be able to state a
 * forged adapter, and an adapter is DATA — there is no registry seam to inject
 * one through, by design (registry.ts is a frozen dispatch table).
 */
export function assertExternalSearchable(
	model: ExternalServiceModel,
	resolved: ResolvedExternalService,
): void {
	const sectionTipo = resolved.sectionTipo;
	if (!model.capabilities.search) {
		throw new ExternalSearchUnsupportedError({
			service: model.service,
			sectionTipo,
			reason: 'service',
			detail: `adapter declares capabilities.search = false — the service exposes no search endpoint`,
		});
	}
	if (model.buildSearchRequest === undefined || model.unwrapSearch === undefined) {
		throw new ExternalSearchUnsupportedError({
			service: model.service,
			sectionTipo,
			reason: 'engine',
			detail:
				'adapter declares capabilities.search but implements no buildSearchRequest/unwrapSearch pair',
		});
	}
	if (resolved.apiConfig.apiUrlSearch === null) {
		throw new ExternalSearchUnsupportedError({
			service: model.service,
			sectionTipo,
			reason: 'config',
			detail: 'the section api_config declares no api_url_search',
		});
	}
}

/** A hit's id in STORAGE form, or null when the row carries none this service accepts. */
function remoteIdOf(model: ExternalServiceModel, row: Record<string, unknown>): string | null {
	const extract = model.extract ?? resolveRemotePath;
	const raw = extract(row, model.remoteIdPath ?? 'id');
	if (raw === null || raw === undefined) return null;
	try {
		// Wire form → storage form, then back, so the id a hit carries is one that
		// survives a locator round trip byte-for-byte (a zero-padded Zenon id must
		// come back as the same string it went out as).
		const storage = decodeRemoteIdWith(model, String(raw));
		encodeRemoteIdWith(model, storage);
		return storage;
	} catch {
		return null;
	}
}
