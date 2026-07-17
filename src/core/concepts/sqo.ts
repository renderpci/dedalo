/**
 * SQO — Search Query Object (spec §3.3).
 *
 * The SQO is Dédalo's pure-data query abstraction (Mango/CouchDB-inspired)
 * over the PostgreSQL JSONB matrix tables. Clients and server code build SQOs;
 * the search engine compiles them to SQL in two phases:
 *   1. conform/parse — per-component builders turn each filter leaf into an
 *      SQL fragment + bound params (Phase 3 of the plan; lives in core/search/).
 *   2. SQL build     — FROM → SELECT → ORDER → WHERE → projects-filter, in
 *      that load-bearing order.
 *
 * PHP references: core/common/class.search_query_object.php (shape + sanitize
 * gate at :834), core/search/class.search.php (engine + conform_filter gate).
 *
 * SECURITY (spec §7.5): `sanitizeClientSqo` below is the API-boundary gate for
 * every untrusted SQO. It strips server-only keys recursively, clamps
 * limit/offset/total, and forces `parsed=false` so the component conform
 * pipeline can never be skipped. Identifier validation (tipos/langs/columns,
 * §7.6) happens later, at the single conform chokepoint in the search engine —
 * the two gates are deliberately separate layers.
 */

import { z } from 'zod';
import { config } from '../../config/config.ts';

/** Max rows an untrusted (client) SQO may request. PHP: DEDALO_SEARCH_CLIENT_MAX_LIMIT. */
export const CLIENT_MAX_LIMIT = config.features.searchClientMaxLimit;

/**
 * Keys that only server code may set. Pre-built SQL would bypass the conform
 * pipeline; the ACL flags would bypass the projects filter. Mirrors PHP
 * search_query_object::sanitize_client_sqo $server_only_keys.
 */
export const SERVER_ONLY_SQO_KEYS: readonly string[] = [
	'sentence',
	'params',
	'column_sql',
	'table',
	'table_alias',
	'skip_projects_filter',
	'skip_duplicated',
	'include_negative',
];

/** One step of a filter path: which component of which section to match on. */
export const sqoPathStepSchema = z
	.object({
		section_tipo: z.string().optional(),
		component_tipo: z.string().optional(),
		name: z.string().optional(), // human label, ontology-authored; ignored by SQL build
		// ORDER paths only: name an exact DB column to sort by (id/section_id/…),
		// as an alternative to `component_tipo` (a component value). `component_tipo`
		// wins when both are present. Validated against VALID_DATA_COLUMNS at SQL
		// build (buildOrderClauses); NOT a server-only key, so it survives sanitize.
		column: z.string().optional(),
	})
	.passthrough();
export type SqoPathStep = z.infer<typeof sqoPathStepSchema>;

/**
 * A filter LEAF: one comparison. `q` is the value; `path` locates the
 * component whose data is compared. The remaining fields tune how the
 * per-component builder generates SQL (operator, jsonpath format, language,
 * word-splitting, unaccent…).
 */
export const sqoFilterLeafSchema = z
	.object({
		q: z.unknown().optional(),
		// The REAL client sends explicit null for an unset operator (verified in
		// the browser E2E); accept + treat as absent (see conform.ts `?? null`).
		q_operator: z.string().nullish(),
		path: z.array(sqoPathStepSchema).optional(),
		format: z.string().optional(), // direct | array_elements | typeof | column | in_column | function
		use_function: z.string().optional(), // PostgreSQL fn name, e.g. relations_flat_fct_st_si
		q_split: z.boolean().optional(),
		unaccent: z.boolean().optional(),
		type: z.string().optional(), // jsonb | string
		lang: z.string().optional(),
	})
	.passthrough();
export type SqoFilterLeaf = z.infer<typeof sqoFilterLeafSchema>;

/**
 * A filter NODE: `$and` / `$or` over leaves and nested nodes, to any depth.
 * (Recursive type — zod needs the explicit lazy definition.)
 */
export type SqoFilterNode =
	| { $and: (SqoFilterNode | SqoFilterLeaf)[] }
	| { $or: (SqoFilterNode | SqoFilterLeaf)[] };

export const sqoFilterNodeSchema: z.ZodType<SqoFilterNode> = z.lazy(() =>
	z.union([
		z.object({ $and: z.array(z.union([sqoFilterNodeSchema, sqoFilterLeafSchema])) }),
		z.object({ $or: z.array(z.union([sqoFilterNodeSchema, sqoFilterLeafSchema])) }),
	]),
);

/** An order clause: direction + component path. */
export const sqoOrderSchema = z
	.object({
		direction: z.enum(['ASC', 'DESC']).optional(),
		path: z.array(sqoPathStepSchema).optional(),
	})
	.passthrough();

/** Locator-shaped record pin used by filter_by_locators. */
export const sqoLocatorPinSchema = z
	.object({
		section_tipo: z.string(),
		section_id: z.union([z.number(), z.string()]),
	})
	.passthrough();

/**
 * The SQO itself. `.passthrough()` keeps not-yet-modeled fields visible in
 * fixtures (helps Phase 3), but note sanitizeClientSqo strips the dangerous
 * ones explicitly and recursively.
 */
export const sqoSchema = z
	.object({
		/** Optional identifier, e.g. 'oh1_list'. */
		id: z.string().nullish(),
		/** MANDATORY target section(s). Single string accepted, normalized to array. */
		section_tipo: z.union([z.string(), z.array(z.string())]),
		/** Which matrix table model to target: edit | list | tm | related. */
		mode: z.string().nullish(),
		filter: sqoFilterNodeSchema.optional().nullable(),
		select: z.array(sqoPathStepSchema).nullish(),
		// The REAL client sends explicit nulls for unset limit/offset (verified in
		// the browser E2E); accept + treat as absent ('all' allowed server-side only).
		limit: z.union([z.number(), z.string()]).nullish(),
		offset: z.number().nullish(),
		total: z.number().nullable().optional(),
		full_count: z.boolean().nullish(),
		order: z.union([z.array(sqoOrderSchema), z.literal(false)]).nullish(),
		// The REAL client sends explicit null when no locator pin is set (verified
		// in the browser E2E); accept + treat as absent (sql_assembler guards with
		// Array.isArray before use).
		filter_by_locators: z.array(sqoLocatorPinSchema).nullish(),
		filter_by_locators_op: z.enum(['OR', 'AND']).nullish(),
		allow_sub_select_by_id: z.boolean().nullish(),
		children_recursive: z.boolean().nullish(),
		remove_distinct: z.boolean().nullish(),
		breakdown: z.boolean().nullish(),
		/** Lifecycle flag: whether the conform pipeline has run. Forced false at the gate. */
		parsed: z.boolean().nullish(),
	})
	.passthrough();

export type Sqo = z.infer<typeof sqoSchema>;

/**
 * Bounds on an untrusted client SQO's filter tree (L7): a pathologically nested
 * or huge $and/$or tree would otherwise drive unbudgeted recursion (stack /
 * SQL-assembler blowup) bounded only by the request body size. Generous ceilings
 * — real queries nest a handful of levels and carry far fewer nodes.
 */
const MAX_SQO_DEPTH = 64;
const MAX_SQO_NODES = 10_000;

/**
 * Recursively delete server-only keys from a plain JSON value. Mirrors PHP
 * strip_keys_recursive: nested filter clauses may hide smuggled SQL. Also
 * enforces the depth/node ceilings (L7), throwing on an abusive tree — the
 * dispatch catch turns that into a fail-closed error, not a crash.
 */
function stripServerOnlyKeysRecursive(
	value: unknown,
	depth: number,
	counter: { nodes: number },
): unknown {
	if (depth > MAX_SQO_DEPTH) {
		throw new Error(`sqo: filter nesting exceeds the maximum depth (${MAX_SQO_DEPTH})`);
	}
	counter.nodes += 1;
	if (counter.nodes > MAX_SQO_NODES) {
		throw new Error(`sqo: filter exceeds the maximum node count (${MAX_SQO_NODES})`);
	}
	if (Array.isArray(value)) {
		return value.map((entry) => stripServerOnlyKeysRecursive(entry, depth + 1, counter));
	}
	if (value !== null && typeof value === 'object') {
		const cleaned: Record<string, unknown> = {};
		for (const [key, entry] of Object.entries(value)) {
			// Case-INSENSITIVE strip (INJ-03): the server-only keys are lowercase,
			// but a smuggled `TABLE`/`COLUMN_SQL` must not survive on the off chance
			// a future consumer reads a key case-insensitively. Inert today, cheap
			// defense-in-depth.
			if (SERVER_ONLY_SQO_KEYS.includes(key.toLowerCase())) {
				continue;
			}
			cleaned[key] = stripServerOnlyKeysRecursive(entry, depth + 1, counter);
		}
		return cleaned;
	}
	return value;
}

/**
 * §7.5 SECURITY GATE — scrub an untrusted client SQO before it may enter the
 * search pipeline. PHP: search_query_object::sanitize_client_sqo (:834).
 *
 * - strips SQL fragments and ACL flags, recursively
 * - clamps limit to CLIENT_MAX_LIMIT ('all'/non-positive/out-of-range → ceiling)
 * - coerces offset/total to integers
 * - forces parsed=false so component conform can never be skipped
 *
 * Server-internal code builds SQOs directly and does NOT pass through here
 * (it may legitimately use limit 'all' or skip_projects_filter).
 */
export function sanitizeClientSqo(untrustedSqo: Record<string, unknown>): Sqo {
	const stripped = stripServerOnlyKeysRecursive(untrustedSqo, 0, { nodes: 0 }) as Record<
		string,
		unknown
	>;

	// limit: clamp to the client ceiling
	const rawLimit = stripped.limit;
	let limit =
		typeof rawLimit === 'number'
			? Math.trunc(rawLimit)
			: Number.parseInt(String(rawLimit ?? ''), 10);
	if (!Number.isFinite(limit) || limit <= 0 || limit > CLIENT_MAX_LIMIT) {
		// DEC-07: the ceiling stays; the SILENCE was the defect. An EXPLICIT ask
		// beyond it ("show all" sends 0/'all', exports send big numbers) gets a
		// loud line — the caller's response is truncated at the ceiling and data-
		// completeness consumers (exports, scripts) must be able to see that in
		// the server log. An ABSENT limit is just the shape default: stay quiet.
		if (rawLimit !== undefined && rawLimit !== null) {
			const sectionTipo = typeof stripped.section_tipo === 'string' ? stripped.section_tipo : '?';
			console.warn(
				`[sqo] client limit ${JSON.stringify(rawLimit)} (section_tipo ${sectionTipo}) clamped to CLIENT_MAX_LIMIT=${CLIENT_MAX_LIMIT} — response may be truncated (DEC-07)`,
			);
		}
		limit = CLIENT_MAX_LIMIT;
	}
	stripped.limit = limit;

	// offset / total: integer coercion; clamp offset to >= 0 (INJ-06 — a negative
	// offset is meaningless and must never reach the assembler as a raw value).
	stripped.offset = Number.isFinite(Number(stripped.offset))
		? Math.max(0, Math.trunc(Number(stripped.offset)))
		: 0;
	if (stripped.total !== undefined && stripped.total !== null) {
		stripped.total = Math.trunc(Number(stripped.total)) || 0;
	}

	// lifecycle: force re-parse
	stripped.parsed = false;

	return sqoSchema.parse(stripped);
}

/**
 * Session-SQO navigation merge (PHP dd_core_api :2159-2199, "received case").
 * Fills each navigation property the client did NOT send from the session's
 * stored SQO for the section. This is the read-back half of the session
 * navigation contract (readSectionRows persists, section context echoes as
 * `sqo_session`): it is how a secondary window opened plain (page/?tipo=X)
 * inherits the filter a dummy build stored (client open_records_in_window),
 * and how tools re-enter the user's navigation.
 *
 * PHP semantics mirrored exactly: `!property_exists(client)` — an explicit
 * null FROM THE CLIENT keeps the property and blocks the merge (that is why a
 * first-load `limit: null` still resolves the config default, not the stored
 * one) — and `isset(session)` — a null IN THE SESSION is skipped. Values are
 * deep-cloned so the caller can never mutate the session store through the
 * merged SQO. Mutates and returns `clientSqo`.
 */
const SESSION_SQO_MERGE_KEYS = [
	'filter',
	'order',
	'limit',
	'offset',
	'filter_by_locators',
	'children_recursive',
] as const;

export function mergeSessionSqo(
	clientSqo: Record<string, unknown>,
	storedSqo: unknown,
): Record<string, unknown> {
	if (storedSqo === null || typeof storedSqo !== 'object' || Array.isArray(storedSqo)) {
		return clientSqo;
	}
	const stored = storedSqo as Record<string, unknown>;
	for (const key of SESSION_SQO_MERGE_KEYS) {
		if (!Object.hasOwn(clientSqo, key) && stored[key] !== undefined && stored[key] !== null) {
			clientSqo[key] = structuredClone(stored[key]);
		}
	}
	return clientSqo;
}

/** Normalize section_tipo to the array form the engine works with. */
export function getSectionTipos(sqo: Sqo): string[] {
	return Array.isArray(sqo.section_tipo) ? sqo.section_tipo : [sqo.section_tipo];
}
