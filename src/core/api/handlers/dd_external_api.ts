/**
 * dd_external_api — the ONE client-facing action of the external-record
 * subsystem: search a third-party service THROUGH the engine.
 *
 * WHY THIS EXISTS. `service_autocomplete.js`'s `zenon_engine` used to POST at
 * `https://zenon.dainst.org/api/v1/search` from the curator's browser. That
 * request went round every control the subsystem has (engineering/EXTERNAL_SPEC.md
 * §5) — the kill switches, the host allowlist, the SSRF guard and socket pin,
 * the breaker, the concurrency ceiling, the byte cap, the egress classification
 * — because a request the server never makes cannot be gated by the server. It
 * also stopped working outright when the app's CSP dropped third-party origins
 * from `connect-src` (XSS-02/RC-01), which is the symptom that surfaced it. The
 * fix is not to re-open `connect-src`: that directive would then have to name a
 * host taken from an OPERATOR-EDITABLE ontology field.
 *
 * WHAT THE CLIENT MAY SAY, and what it may not. The request carries the
 * CALLER's component `tipo` + `section_tipo`, the terms, and a page. It carries
 * NO url, NO host, NO field list and NO service name — every one of those is
 * resolved server-side from the ontology: the component's `request_config`
 * names the target section, the TARGET SECTION's `api_config` binds the
 * service, and each `component_external` node's own `properties.fields_map`
 * says which remote fields it needs. A client that could name the URL would be
 * the browser-direct call again, wearing the engine's socket.
 *
 * AUTH. Not in `NO_LOGIN_ACTIONS` and not in `CSRF_EXEMPT_ACTIONS`, so dispatch
 * requires a session and a valid CSRF token before this module runs. That is
 * load-bearing rather than conventional: this action makes the SERVER open an
 * outbound socket on the caller's behalf, and an anonymous visitor must never be
 * able to drive it. The actor is then held to READ permission on the caller
 * component, so the action cannot be used to probe a service bound to a section
 * the actor may not see.
 *
 * RATE LIMITING — deliberately NOT invented here. The codebase's one throttle
 * store (`security/session_store.ts` isThrottled/recordFailedAttempt) is a
 * FAILED-ATTEMPT lockout built for authentication: it counts attempts and then
 * locks the key out for minutes, which applied to a keystroke-driven
 * autocomplete would lock a working cataloguer out of search after a dozen
 * characters. There is no per-user rate limiter for legitimate high-frequency
 * reads in this engine, and adding one on the way past is how a half-designed
 * control ends up load-bearing. What DOES bound this path, install-wide and
 * already: the transport's per-(service, origin) concurrency ceiling
 * (`DEDALO_EXTERNAL_MAX_CONCURRENCY`), the circuit breaker, the request
 * timeout, the byte cap, the retry policy, the in-flight coalescing of
 * identical queries, and the `MAX_SEARCH_LIMIT` page ceiling enforced below.
 * A per-principal limiter is a real gap and belongs in a design of its own.
 *
 * OUTPUT is the shape the client's `format_data` fabricates today
 * (service_autocomplete.js ~:1063-1110), produced server-side so the rendering
 * path downstream is untouched: a `typo:'sections'` entry carrying the
 * locators, then one `record_data` per record × ddo. Ledger:
 * `WC-2026-08-06-external-search-request`.
 */

import type {
	ExternalSearchHit,
	ExternalSearchResult,
	ExternalServiceModel,
	FieldsMapEntry,
} from '../../../external/api/index.ts';
import { getModelByTipo, getNode, getPropertiesByTipo } from '../../ontology/resolver.ts';
import { engineOf } from '../../relations/request_config/engine_select.ts';
import { getPermissions } from '../../security/permissions.ts';
import { type ActionHandler, requirePrincipal } from '../handler_context.ts';
import { type ApiResult, denied } from '../response.ts';

/** The relation type the client stamps on a fabricated external record_data. */
const EXTERNAL_RECORD_DATA_TYPE = 'dd687';

/** The mode the client's fabricated record_data carries (list cells). */
const EXTERNAL_RECORD_DATA_MODE = 'list';

/** One resolved display field of the target section. */
export interface SearchDdo {
	readonly tipo: string;
	/** Read from the NODE, never from the request (see resolveExternalSearchTarget). */
	readonly fieldsMap: readonly FieldsMapEntry[];
}

/** What the request resolved to, once nothing came from the client but ids. */
export interface ResolvedSearchTarget {
	readonly targetSectionTipo: string;
	readonly ddos: readonly SearchDdo[];
	readonly remoteFields: readonly string[];
	readonly context: readonly Record<string, unknown>[];
	/** The CALLER component's tipo — the client stamps it on the sections entry. */
	readonly callerTipo: string;
	/** The bound adapter — needed to EMIT (formats, ceilings), not to fetch. */
	readonly model: ExternalServiceModel;
}

export const externalApiActions: Record<string, ActionHandler> = {
	/**
	 * dd_external_api::search — terms in, the client's own record_data shape out.
	 *
	 * rqo.source  : { tipo, section_tipo }   the CALLER component
	 * rqo.options : { q | terms, limit, offset }
	 */
	search: async (rqo, context): Promise<ApiResult> => {
		const principal = requirePrincipal(context);

		const source = (rqo.source ?? {}) as { tipo?: unknown; section_tipo?: unknown };
		const callerTipo = typeof source.tipo === 'string' ? source.tipo : '';
		const callerSectionTipo = typeof source.section_tipo === 'string' ? source.section_tipo : '';
		if (callerTipo === '' || callerSectionTipo === '') {
			return denied(400, 'Error. source.tipo and source.section_tipo are required');
		}

		// The caller component must EXIST and the actor must be able to read it.
		// Without this, an authenticated actor could name any component in the
		// ontology and drive the engine's outbound socket through a binding they
		// are not authorized to see.
		if ((await getNode(callerTipo)) === null) {
			return denied(400, 'Error. Unknown source tipo');
		}
		if ((await getPermissions(principal, callerSectionTipo, callerTipo)) < 1) {
			return denied(403, 'Error. Not authorized on this component');
		}

		const options = (rqo.options ?? {}) as {
			q?: unknown;
			terms?: unknown;
			limit?: unknown;
			offset?: unknown;
		};
		const terms = readTerms(options);
		// A PRESENT-BUT-UNREADABLE paging value is REFUSED, never quietly replaced
		// by the default: `limit: "twenty"` silently answering 20 rows is the
		// "silently narrow scope" failure with a friendly face.
		const limit = readInteger(options.limit);
		const offset = readInteger(options.offset);
		if (options.limit !== undefined && options.limit !== null && limit === undefined) {
			return denied(400, 'Error. limit must be an integer');
		}
		if (options.offset !== undefined && options.offset !== null && offset === undefined) {
			return denied(400, 'Error. offset must be an integer');
		}
		if (limit !== undefined && limit <= 0) return denied(400, 'Error. limit must be positive');
		if (offset !== undefined && offset < 0)
			return denied(400, 'Error. offset must not be negative');

		let target: ResolvedSearchTarget;
		try {
			target = await resolveExternalSearchTarget(callerTipo, callerSectionTipo);
		} catch (error) {
			// A CONFIGURATION question, answered identically for every request — the
			// loud posture, not the degraded one (EXTERNAL_SPEC §3.5 / §8). The DETAIL
			// stays server-side (dispatch.ts's own posture for a handler exception):
			// it names ontology nodes and bindings, and the actor cannot act on it.
			console.error(
				`[dd_external_api] search target unresolved for ${callerTipo}@${callerSectionTipo} [req ${context.requestId}]`,
				error,
			);
			return denied(400, 'Error. This component is not bound to an external service');
		}

		const { searchExternalService } = await import('../../../external/api/index.ts');
		let result: ExternalSearchResult;
		try {
			result = await searchExternalService({
				sectionTipo: target.targetSectionTipo,
				terms,
				remoteFields: target.remoteFields,
				...(limit === undefined ? {} : { limit }),
				...(offset === undefined ? {} : { offset }),
			});
		} catch (error) {
			// The search THROWS by design (src/external/search.ts): an empty array
			// on a search box reads as "no matches" and a cataloguer acts on it.
			// Named, logged server-side, and reported as a failure envelope — never
			// as an empty result set.
			const { ExternalServiceError, ExternalSearchUnsupportedError } = await import(
				'../../../external/api/index.ts'
			);
			if (error instanceof ExternalSearchUnsupportedError) {
				console.error(error.message, error);
				return denied(400, `Error. External search unsupported (${error.reason})`);
			}
			if (error instanceof ExternalServiceError) {
				console.error(error.message, error);
				return {
					status: 200,
					body: {
						result: false,
						msg: 'Error. The external service did not answer',
						errors: [`external_${error.kind}`],
					},
				};
			}
			throw error;
		}

		return {
			status: 200,
			body: {
				result: {
					context: target.context,
					data: await formatExternalSearchData(result, target),
				},
				msg: 'OK. Request done',
				// Provenance the browser engine could not report at all. The client
				// ignores unknown keys, so this widens the envelope without changing it.
				total: result.total,
				limit: result.limit,
				offset: result.offset,
				...(result.dropped > 0 ? { dropped_unaddressable: result.dropped } : {}),
			},
		};
	},
};

/** `q` (the client's spelling) or an explicit `terms` array. */
function readTerms(options: { q?: unknown; terms?: unknown }): string[] {
	if (Array.isArray(options.terms)) {
		return options.terms.filter((term): term is string => typeof term === 'string');
	}
	return typeof options.q === 'string' ? [options.q] : [];
}

function readInteger(value: unknown): number | undefined {
	if (typeof value === 'number' && Number.isInteger(value)) return value;
	if (typeof value === 'string' && /^-?\d+$/.test(value)) return Number(value);
	return undefined;
}

/**
 * Resolve WHICH external section this component searches and WHICH fields it
 * displays — entirely from the ontology.
 *
 * The component's `request_config` is built by the same builder the read path
 * uses, then the FIRST non-`dedalo` item is taken (a component may declare both
 * engines — `rsc368` declares dedalo + zenon; only the external one has a
 * service behind it). Its `show.ddo_map` names the target section, exactly as
 * `relations/request_config/external.ts` binds `api_config` from the first
 * ddo's `section_tipo`.
 *
 * The fields_map is read from each ddo's OWN ONTOLOGY NODE, never from the ddo
 * echo: the echo exists for the client, and the request that leaves this
 * installation must be built from the source of truth.
 */
export async function resolveExternalSearchTarget(
	callerTipo: string,
	callerSectionTipo: string,
): Promise<ResolvedSearchTarget> {
	const { buildRequestConfigForElement } = await import('../../relations/request_config/build.ts');
	const properties = await getPropertiesByTipo(callerTipo);
	const items = await buildRequestConfigForElement(properties, {
		ownerTipo: callerTipo,
		ownerSectionTipo: callerSectionTipo,
		mode: 'list',
		ownerIsSection: false,
	});
	const external = items.find((item) => engineOf(item) !== 'dedalo');
	if (external === undefined) {
		throw new Error(`component ${callerTipo} declares no external api_engine`);
	}
	const ddoMap = external.show?.ddo_map ?? [];
	const firstSection = ddoMap[0]?.section_tipo;
	const targetSectionTipo = Array.isArray(firstSection) ? firstSection[0] : firstSection;
	if (typeof targetSectionTipo !== 'string' || targetSectionTipo === '') {
		throw new Error(`component ${callerTipo} external config names no target section`);
	}

	const { parseFieldsMap, remoteFieldsOf } = await import('../../../external/api/index.ts');
	const ddos: SearchDdo[] = [];
	const context: Record<string, unknown>[] = [];
	const seen = new Set<string>();
	const remoteFields: string[] = [];
	for (const ddo of ddoMap) {
		const declared = ddo.section_tipo;
		const targets =
			declared === undefined || declared === 'self'
				? true
				: Array.isArray(declared)
					? declared.includes(targetSectionTipo)
					: declared === targetSectionTipo;
		if (!targets) continue;
		if ((await getModelByTipo(ddo.tipo)) !== 'component_external') continue;
		const nodeProperties = (await getPropertiesByTipo(ddo.tipo)) as {
			fields_map?: unknown;
		} | null;
		const fieldsMap = parseFieldsMap(nodeProperties?.fields_map, { tipo: ddo.tipo });
		if (fieldsMap.length === 0) continue;
		ddos.push({ tipo: ddo.tipo, fieldsMap });
		context.push(ddo as unknown as Record<string, unknown>);
		// Declaration order is the `field[]=` order on the wire — the same order
		// the browser engine sent, and part of the byte form gated by the tests.
		for (const field of remoteFieldsOf(fieldsMap)) {
			if (seen.has(field)) continue;
			seen.add(field);
			remoteFields.push(field);
		}
	}
	if (ddos.length === 0) {
		throw new Error(`component ${callerTipo} external config shows no component_external field`);
	}

	const { getExternalServiceForSection } = await import('../../../external/api/index.ts');
	const resolved = await getExternalServiceForSection(targetSectionTipo);
	if (resolved === null) {
		throw new Error(`target section ${targetSectionTipo} carries no api_config`);
	}
	return { targetSectionTipo, ddos, remoteFields, context, callerTipo, model: resolved.model };
}

/**
 * THE CLIENT WIRE SHAPE, produced server-side. Reproduced from
 * service_autocomplete.js `format_data` (~:1063-1110) so the rendering path
 * downstream is untouched:
 *
 *   [ { section_tipo, tipo, entries: [locator…], typo: 'sections' },
 *     { section_tipo, section_id, type: 'dd687', tipo, mode: 'list', entries } … ]
 *
 * `section_id` is the remote id in STORAGE form — the zero-padded string, never
 * a number (`"001338683"` and `1338683` address different records).
 *
 * The VALUES come from `mapRowToEntries`, the subsystem's one emission
 * function, so a search cell obeys the same formats, the same per-entry length
 * and count ceilings and the same refusal-counting as the record path. The
 * browser engine had its own ad-hoc formatter (author roles joined with ' - ',
 * arrays with ', ') which agreed with nothing else in the engine; that
 * divergence is ledgered rather than reproduced.
 */
export async function formatExternalSearchData(
	result: ExternalSearchResult,
	target: ResolvedSearchTarget,
): Promise<Record<string, unknown>[]> {
	const sectionTipo = target.targetSectionTipo;
	const locators = result.hits.map((hit: ExternalSearchHit) => ({
		section_tipo: sectionTipo,
		section_id: hit.remoteId,
	}));
	const section = {
		section_tipo: sectionTipo,
		// The CALLER's tipo — what `self.caller.tipo` resolved to in the browser
		// engine. It is how the client routes the locator set back to the widget
		// that asked, so it is emphatically NOT the service name.
		tipo: target.callerTipo,
		entries: locators,
		typo: 'sections',
	};
	// The facade is reached through the dynamic-import rule the rest of the read
	// path uses (engineering/CONVENTIONS.md) — src/core/api must not join
	// src/external's static graph for a leaf call.
	const { mapRowToEntries } = await import('../../../external/api/index.ts');
	const fetchedAt = Date.now();
	const rows: Record<string, unknown>[] = [];
	for (const hit of result.hits as readonly ExternalSearchHit[]) {
		for (const ddo of target.ddos) {
			rows.push({
				section_tipo: sectionTipo,
				section_id: hit.remoteId,
				type: EXTERNAL_RECORD_DATA_TYPE,
				tipo: ddo.tipo,
				mode: EXTERNAL_RECORD_DATA_MODE,
				// `status: 'ok'` is a FACT here, not an assumption: these rows came
				// back from a live answer in this same request. A degraded search
				// never reaches this function — it threw.
				...(mapRowToEntries(
					target.model,
					{
						sectionTipo,
						remoteId: hit.remoteId,
						service: result.service,
						row: hit.row,
						status: 'ok',
						fetchedAt,
					},
					ddo.fieldsMap,
				) as unknown as Record<string, unknown>),
			});
		}
	}
	return [section, ...rows];
}
