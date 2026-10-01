/**
 * tool_import_rdf server module (PHP tool_import_rdf::get_rdf_data). Fetches each
 * RDF URI through `fetchGuardedText` (the guard resolves and vets every address,
 * connects PINNED to the vetted one, refuses redirects, bounds the wait and the
 * read) and parses it with the
 * from-scratch RDF/XML parser (rdf_xml.ts, no 3rd-party lib), returning the
 * extracted subjects/properties.
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
	ok,
	toDedaloError,
	toErrorBody,
} from '../../../src/core/errors/index.ts';
import { getPermissions } from '../../../src/core/security/permissions.ts';
import { fetchGuardedText, type PinnedHopDeps } from '../../../src/core/security/ssrf_guard.ts';
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

/** The IRIs to dereference; none is a caller error. */
function rdfValues(options: Record<string, unknown>): string[] {
	const values = options.ar_values ?? [];
	if (Array.isArray(values) && values.length > 0) return values as string[];
	throw new DedaloError('request.invalid_options', {
		publicMessage: 'Missing ar_values (RDF URIs)',
	});
}

/** The class-map the caller supplied (`tool_config.config.main`), or none. */
function rdfMap(options: Record<string, unknown>): RdfMapEntry[] {
	const map = (options.tool_config as { config?: { main?: unknown } } | undefined)?.config?.main;
	return Array.isArray(map) ? (map as RdfMapEntry[]) : [];
}

/**
 * Fetch, parse and map ONE IRI. SSRF-01 + DOS-05: `fetchGuardedText` resolves and
 * vets the URL against private/reserved ranges (not a string blocklist), connects
 * PINNED to the vetted address (no second lookup for a rebinding resolver to
 * answer, SURF-2), refuses redirects, and bounds the wait and the body; a network
 * failure is a typed `security.outbound_failed`. A failure is reported as the error
 * system's wire body, never `error.message`: the guard's message names the address
 * a refused host resolved to (an internal-network oracle).
 *
 * EXPORTED with the guard's `deps` seam (resolver + socket) for the door-level gate
 * (tool_import_rdf.test.ts): the per-URI body a transport failure publishes is this
 * function's decision, not the guard's. The action handler never passes `deps` —
 * production resolves and connects for real.
 */
export async function loadRdf(
	raw: string,
	map: RdfMapEntry[],
	deps: PinnedHopDeps = {},
): Promise<RdfOutcome> {
	const uri = raw.endsWith('.rdf') ? raw : `${raw}.rdf`;
	try {
		const xml = await fetchGuardedText(uri, { maxBytes: 20 * 1024 * 1024 }, deps);
		const { subjects } = parseRdfXml(xml);
		// A class-map yields the mapped fields (the dd_object the client form
		// consumes); without one, the raw subjects.
		const mapped = map.length > 0 ? applyRdfMap(subjects, map) : subjects;
		return { kind: 'loaded', entry: { uri, subjects: mapped } };
	} catch (error) {
		return { kind: 'failed', failure: { uri, error: toErrorBody(toDedaloError(error)) } };
	}
}

async function getRdfData(ctx: ToolActionContext): Promise<ToolResponse> {
	const locator = (ctx.options.locator ?? {}) as { section_tipo?: string };
	await assertLocatorWrite(ctx, locator.section_tipo);
	const values = rdfValues(ctx.options);
	const map = rdfMap(ctx.options);
	const rdf: { uri: string; subjects: unknown[] }[] = [];
	const errors: { uri: string; error: ApiErrorBody }[] = [];
	for (const raw of values) {
		const outcome = await loadRdf(raw, map);
		if (outcome.kind === 'loaded') rdf.push(outcome.entry);
		else errors.push(outcome.failure);
	}
	// The subject→dd_object class-map is config-driven (ledgered); the fetch +
	// parse are done and returned for the client/mapper to consume.
	// `errors` is the PER-URI refusal list (one bad URI never fails the batch):
	// payload, not a wire failure — so it rides inside `data`, one `{uri, error}` per
	// URI, `error` the same body a failed call would carry.
	return ok({ rdf, errors }, { requestId: toolRequestId(ctx) });
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
