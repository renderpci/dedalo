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
 *   getExternalServiceForSection  is this section external, and where does it point?
 *   isExternalSectionTipo         the boolean form, for callers that only branch
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
	isExternalSectionTipo,
	parseApiConfig,
	publishApiConfig,
} from '../config.ts';
export type { FieldsMapEntry } from '../descriptor_types.ts';
export {
	type ExternalErrorFields,
	ExternalSearchUnsupportedError,
	ExternalServiceError,
	ExternalServiceNotRegisteredError,
} from '../errors.ts';
export { mapRowToEntries, parseFieldsMap, remoteFieldsOf } from '../fields_map.ts';
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
