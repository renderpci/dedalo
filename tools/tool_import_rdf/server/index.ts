/**
 * tool_import_rdf server module (PHP tool_import_rdf::get_rdf_data). Dereferences
 * each IRI the cataloguer selected through the HARVESTING DOOR (`harvestFetch`,
 * src/core/harvest/harvest.ts) — every redirect hop re-vetted and pinned, the
 * site's robots.txt obeyed, the per-site pace kept — and parses the answer with the
 * from-scratch RDF/XML parser (rdf_xml.ts, no 3rd-party lib), returning the
 * extracted subjects/properties.
 *
 * Linked-data servers answer an IRI with a 303 See Other (content negotiation) or a
 * 301 to https; the door follows both. An IRI is asked for RDF/XML first; a server
 * that only answers the `<iri>.rdf` form gets one retry there (see `fetchRdfXml`).
 *
 * The subject→Dédalo ontology CLASS-MAP (properties.xmlns / class_map_to_dd) is
 * config-driven and ledgered; the fetch + graph parse are real.
 *
 * GATE: WRITE (level 2) on the LOCATOR's section — the target the resolved
 * values are destined for — matching PHP's assert_section_permission(…, 2).
 * The target rides inside `options.locator`, so the gate is declared as
 * 'section_list' (see rdfSectionTipos): a plain 'section' spec reads
 * `options.section_tipo`, which this tool's client never sends.
 */

import {
	type ApiErrorBody,
	DedaloError,
	isDedaloError,
	ok,
	toDedaloError,
	toErrorBody,
} from '../../../src/core/errors/index.ts';
import {
	type HarvestDeps,
	type HarvestRequest,
	harvestFetch,
} from '../../../src/core/harvest/harvest.ts';
import { getPermissions } from '../../../src/core/security/permissions.ts';
import {
	type ToolActionContext,
	type ToolResponse,
	type ToolServerModule,
	toolRequestId,
} from '../../../src/core/tools/module.ts';
import { applyRdfMap, parseRdfXml, type RdfMapEntry } from '../../../src/core/tools/rdf_xml.ts';

/**
 * The action's permission target (the 'section_list' gate reads this).
 *
 * The client posts the target section INSIDE `options.locator` and sends NO
 * top-level `section_tipo` (tool_import_rdf.js get_rdf_data :218-227). The
 * declarative 'section' gate reads `options.section_tipo`, so it saw nothing,
 * failed closed, and EVERY real request — even a global admin's — was denied
 * with "invalid section target": the action was unreachable from the UI.
 * 'section_list' exists precisely for a target that rides inside the payload,
 * and it still runs BEFORE the handler.
 */
function rdfSectionTipos(options: Record<string, unknown>): unknown[] {
	const locator = (options.locator ?? {}) as { section_tipo?: unknown };
	return locator.section_tipo === undefined ? [] : [locator.section_tipo];
}

/** One IRI's outcome: its (mapped) subjects, or the wire body of why it failed. */
export type RdfOutcome =
	| { kind: 'loaded'; entry: { uri: string; subjects: unknown[] } }
	| { kind: 'failed'; failure: { uri: string; error: ApiErrorBody } };

/**
 * Defense in depth behind the declarative gate — same level, so a direct call can
 * never reach the fetch loop on a weaker check than the wire.
 */
async function assertLocatorWrite(
	ctx: ToolActionContext,
	sectionTipo: string | undefined,
): Promise<void> {
	if (!sectionTipo) return;
	if ((await getPermissions(ctx.principal, sectionTipo, sectionTipo)) >= 2) return;
	throw new DedaloError('perm.denied', {
		coordinates: { tool: 'tool_import_rdf', section_tipo: sectionTipo },
	});
}

/**
 * The most IRIs one call may dereference. The call is interactive (the cataloguer
 * waits; the client gives up after 60 s) and the door paces each site — at least
 * 3 s between two requests, longer when its robots.txt asks (Crawl-delay, clamped
 * to 60 s) or when other callers are queued on the same site. A 301, a 303 and a
 * `.rdf` retry are several paced hops for ONE IRI, so even one IRI can outlast the
 * client on a slow or Crawl-delayed site: the cap bounds the work a call may
 * queue, it does not guarantee the answer arrives in time. The client sends one
 * (its picker is a radio group).
 */
export const RDF_MAX_URIS = 3;

/** `ar_values` as a non-empty list of strings, or a caller error. */
function rdfValueList(options: Record<string, unknown>): string[] {
	const values = options.ar_values ?? [];
	if (!Array.isArray(values) || values.length === 0) {
		throw new DedaloError('request.invalid_options', {
			publicMessage: 'Missing ar_values (RDF URIs)',
		});
	}
	if (!values.every((value) => typeof value === 'string')) {
		throw new DedaloError('request.invalid_options', {
			publicMessage: 'ar_values must be a list of RDF URIs (strings)',
		});
	}
	return values;
}

/** The IRIs to dereference; none, a non-string, or more than `RDF_MAX_URIS` is a caller error. */
function rdfValues(options: Record<string, unknown>): string[] {
	const values = rdfValueList(options);
	if (values.length > RDF_MAX_URIS) {
		throw new DedaloError('tool.too_many_items', {
			details: { count: values.length, limit: RDF_MAX_URIS },
			coordinates: { tool: 'tool_import_rdf' },
		});
	}
	return values;
}

/** The class-map the caller supplied (`tool_config.config.main`), or none. */
function rdfMap(options: Record<string, unknown>): RdfMapEntry[] {
	const map = (options.tool_config as { config?: { main?: unknown } } | undefined)?.config?.main;
	return Array.isArray(map) ? (map as RdfMapEntry[]) : [];
}

/** The media types an RDF/XML document is served as. */
const RDF_XML_TYPES = ['application/rdf+xml', 'application/xml', 'text/xml'];
/** Content negotiation: RDF/XML first, generic XML after. */
const RDF_XML_ACCEPT = 'application/rdf+xml, application/xml;q=0.9, text/xml;q=0.8';
/**
 * The `.rdf` form names the file itself, and static file servers often label it
 * as bytes or text; an HTML page is still refused.
 */
const RDF_FILE_TYPES = [...RDF_XML_TYPES, 'application/octet-stream', 'text/plain'];
/** The body ceiling (a large authority graph). */
const RDF_MAX_BYTES = 20 * 1024 * 1024;
/**
 * Total time per hop, body included. Bounds one hop, not the call: a hung hop
 * fails inside the client's 60 s wait; the pace between hops is not counted.
 */
const RDF_HOP_TIMEOUT_MS = 15_000;

/** The door request for one RDF document. */
function rdfRequest(url: string, accepted: readonly string[]): HarvestRequest {
	return {
		url,
		hosts: 'public',
		headers: { Accept: RDF_XML_ACCEPT },
		expectContentType: accepted,
		maxBytes: RDF_MAX_BYTES,
		timeoutMs: RDF_HOP_TIMEOUT_MS,
	};
}

/** What one request gave: the document's text, or why it was not RDF/XML. */
type RdfAttempt = { kind: 'document'; text: string } | { kind: 'not_rdf'; error: DedaloError };

/**
 * Ask for one document. A 4xx answer (the document is not at this address) or a
 * 2xx of another media type means "not RDF/XML here" (`not_rdf`). Every other
 * failure is thrown, because asking the same site again would only meet it again:
 * a refused address, a robots.txt that says no, a timeout — and a 5xx, a 408 or a
 * 429, which say the SITE is unwell or busy (asking again would also wait out its
 * `Retry-After`).
 */
async function attemptRdf(
	url: string,
	accepted: readonly string[],
	deps: HarvestDeps,
): Promise<RdfAttempt> {
	try {
		const response = await harvestFetch(rdfRequest(url, accepted), deps);
		if (response.ok) return { kind: 'document', text: response.text() };
		if (meansNotHere(response.status)) {
			return { kind: 'not_rdf', error: statusFailure(response.status) };
		}
		throw statusFailure(response.status);
	} catch (error) {
		if (isDedaloError(error) && error.code === 'harvest.unexpected_type') {
			return { kind: 'not_rdf', error };
		}
		throw error;
	}
}

/** A 4xx that says "not at this address" — not a timeout (408) nor a rate limit (429). */
function meansNotHere(status: number): boolean {
	return status >= 400 && status < 500 && status !== 408 && status !== 429;
}

/** A non-2xx final answer, typed as the single-call door types it (status log-only). */
function statusFailure(status: number): DedaloError {
	return new DedaloError('security.outbound_failed', {
		message: `HTTP ${status}`,
		coordinates: { tool: 'tool_import_rdf', status },
	});
}

/**
 * The `<iri>.rdf` file form of an IRI, or null when there is none to try: the
 * IRI is not an http(s) URL, has no path, or already names a `.rdf` file (any
 * case). The fragment is dropped (a `vocab#Term` IRI's document is `vocab`, never
 * `vocab#Term.rdf`), and so are trailing slashes (`id/` → `id.rdf`).
 */
export function rdfFileUrl(iri: string): string | null {
	const url = URL.parse(iri);
	if (url === null || !WEB_PROTOCOLS.has(url.protocol)) return null;
	const path = url.pathname.replace(/\/+$/, '');
	if (path === '' || path.toLowerCase().endsWith('.rdf')) return null;
	url.hash = '';
	url.pathname = `${path}.rdf`;
	return url.toString();
}

/** The schemes an `.rdf` file form exists for. */
const WEB_PROTOCOLS: ReadonlySet<string> = new Set(['http:', 'https:']);

/**
 * The RDF/XML document for `iri`: content negotiation on the IRI itself, then —
 * only when that answer was not RDF/XML — one retry at its `.rdf` file form, the
 * convention of servers that do not negotiate (the tool's behaviour before the
 * door followed redirects).
 */
async function fetchRdfXml(iri: string, deps: HarvestDeps): Promise<string> {
	const negotiated = await attemptRdf(iri, RDF_XML_TYPES, deps);
	if (negotiated.kind === 'document') return negotiated.text;
	const file = rdfFileUrl(iri);
	if (file === null) throw negotiated.error;
	const retried = await attemptRdf(file, RDF_FILE_TYPES, deps).catch(
		(error: unknown): RdfAttempt => ({ kind: 'not_rdf', error: toDedaloError(error) }),
	);
	if (retried.kind === 'document') return retried.text;
	throw tellingFailure(negotiated.error, retried.error);
}

/**
 * Which failure the cataloguer is told when both forms failed. The IRI is what
 * they picked; the `.rdf` form was our guess. So the IRI's own answer wins —
 * also over any refusal of the guessed address (its own robots.txt rule, say) —
 * with ONE exception: when the IRI only answered an error status and the guess
 * answered a file of the wrong type, that type says more about the site.
 */
function tellingFailure(negotiated: DedaloError, retried: DedaloError): DedaloError {
	const statusOnly = negotiated.code === 'security.outbound_failed';
	return statusOnly && retried.code === 'harvest.unexpected_type' ? retried : negotiated;
}

/**
 * Fetch, parse and map ONE IRI. A failure is reported as the error system's wire
 * body, never `error.message`: the guard's message names the address a refused
 * host resolved to (an internal-network oracle). `uri` is the IRI as the
 * cataloguer selected it, whichever URL finally answered.
 *
 * EXPORTED with the door's `deps` seam (`hop` fakes a site; `pinned` a resolver +
 * socket) for tool_import_rdf.test.ts: the per-URI outcome is this function's
 * decision, not the door's. The action handler never passes `deps` — production
 * resolves and connects for real.
 */
export async function loadRdf(
	uri: string,
	map: RdfMapEntry[],
	deps: HarvestDeps = {},
): Promise<RdfOutcome> {
	try {
		const { subjects } = parseRdfXml(await fetchRdfXml(uri, deps));
		// A class-map yields the mapped fields (the dd_object the client form
		// consumes); without one, the raw subjects.
		const mapped = map.length > 0 ? applyRdfMap(subjects, map) : subjects;
		return { kind: 'loaded', entry: { uri, subjects: mapped } };
	} catch (error) {
		return { kind: 'failed', failure: { uri, error: toErrorBody(toDedaloError(error)) } };
	}
}

/** What one call reports: each loaded IRI's subjects, each failed IRI's wire body. */
export interface RdfBatch {
	rdf: { uri: string; subjects: unknown[] }[];
	errors: { uri: string; error: ApiErrorBody }[];
}

/**
 * Load every IRI in turn. One bad IRI never fails the batch: its outcome is a
 * per-URI entry in `errors`. Exported with the same `deps` seam as `loadRdf`.
 */
export async function loadRdfBatch(
	values: readonly string[],
	map: RdfMapEntry[],
	deps: HarvestDeps = {},
): Promise<RdfBatch> {
	const batch: RdfBatch = { rdf: [], errors: [] };
	for (const raw of values) {
		const outcome = await loadRdf(raw, map, deps);
		if (outcome.kind === 'loaded') batch.rdf.push(outcome.entry);
		else batch.errors.push(outcome.failure);
	}
	return batch;
}

async function getRdfData(ctx: ToolActionContext): Promise<ToolResponse> {
	const locator = (ctx.options.locator ?? {}) as { section_tipo?: string };
	await assertLocatorWrite(ctx, locator.section_tipo);
	const values = rdfValues(ctx.options);
	// The subject→dd_object class-map is config-driven (ledgered); the fetch +
	// parse are done and returned for the client/mapper to consume.
	// `errors` is the PER-URI refusal list: payload, not a wire failure — so it
	// rides inside `data`, one `{uri, error}` per URI, `error` the same body a
	// failed call would carry.
	const batch = await loadRdfBatch(values, rdfMap(ctx.options));
	return ok(batch, { requestId: toolRequestId(ctx) });
}

export const tool: ToolServerModule = {
	name: 'tool_import_rdf',
	apiActions: {
		// PHP asserts WRITE (level 2) on the LOCATOR's section (SEC-024 §9.2): the
		// action dereferences external URIs so the resolved values can be written
		// into that record. minLevel 1 let a read-only user drive the server's
		// outbound fetcher.
		get_rdf_data: {
			permission: 'section_list',
			minLevel: 2,
			sectionTipos: rdfSectionTipos,
			handler: getRdfData,
		},
	},
};
