/**
 * THE EXTERNAL-SUBSYSTEM FACADE — the only module `src/core/**` may import.
 *
 * `src/external/` is a PEER of src/core, src/diffusion and src/ai, not a part
 * of core. The rule and its enforcement are the diffusion precedent: the seam
 * grows only through this directory (test/unit/boundary_seam_tripwire.test.ts
 * FACADE_PREFIX), so the subsystem stays free to change its internal layout —
 * transport, breaker, cache and the per-service adapters are private.
 *
 * NAMING. Say "external service", never a bare "service": docs/core/system/
 * services.md already defines a "service" as a CLIENT-side UI module, and
 * `src/core/services/` is forbidden for the same reason.
 *
 * The surface is four functions:
 *
 *   getExternalServiceForSection  which service does this section BIND (api_config)?
 *                                 A binding lookup, never an externality test.
 *   isExternalReferenceSection    THE externality predicate: is this section external
 *                                 (binds a service AND owns a component_external), so a
 *                                 NON-ADDRESS id here is a remote record's id? Every
 *                                 "is this section external?" decision asks THIS —
 *                                 api_config alone is residue on rsc205 (21k local rows).
 *   fetchExternalRows             remote records for a set of locators
 *   searchExternalService         ask the service which records MATCH some terms
 *   mapRowToEntries               one row + one fields_map → the values a component emits
 *   publishApiConfig              raw ontology api_config → the form a BROWSER may receive
 *   externalServiceCapabilities   what a service supports, for capability negotiation
 */

export {
	drainInFlightExternalFetches,
	externalRowViewKey,
	type FetchExternalRowsOptions,
	fetchExternalRows,
} from '../cache.ts';
export {
	getExternalServiceForSection,
	parseApiConfig,
	publishApiConfig,
} from '../config.ts';
export type { FieldsMapEntry } from '../descriptor_types.ts';
export {
	type ExternalErrorFields,
	ExternalSearchUnsupportedError,
	ExternalServiceError,
	ExternalServiceNotRegisteredError,
	logExternalError,
} from '../errors.ts';
export {
	mapRowToEntries,
	parseFieldsMap,
	refusedRemoteFields,
	remoteFieldsOf,
} from '../fields_map.ts';
export { isExternalReferenceSection, reportRefusedRemoteFields } from '../record_fields.ts';
export {
	externalServiceCapabilities,
	hasExternalService,
	listExternalServiceNames,
} from '../registry.ts';
export {
	activeExternalSearches,
	DEFAULT_SEARCH_LIMIT,
	drainInFlightExternalSearches,
	MAX_SEARCH_LIMIT,
	type SearchExternalServiceOptions,
	searchExternalService,
} from '../search.ts';
export type {
	ExternalApiConfig,
	ExternalEntriesResult,
	ExternalErrorKind,
	ExternalRowStatus,
	ExternalRowTarget,
	ExternalRowView,
	ExternalSearchHit,
	ExternalSearchResult,
	ExternalServiceCapabilities,
	ExternalServiceModel,
	FormattedValue,
	PublishedApiConfig,
	RemoteRow,
	ResolvedExternalService,
	ResponseMap,
} from './types.ts';
