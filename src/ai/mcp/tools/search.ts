/**
 * SEARCH tools — the full search surface for agents: a typed recursive
 * AND/OR filter (labels or tipos, optional multi-hop portal paths) and a
 * `raw_sqo` escape hatch for canonical Dédalo SQO fragments.
 *
 * Both roads meet the SAME chokepoints as a human search:
 *   - `sanitizeClientSqo` (server-only key strip, tree bounds, limit clamp) —
 *     the exact §7.5 gate the HTTP dispatch applies to client SQOs;
 *   - a leaf-walk identifier gate over every filter/order path step (the
 *     assertValidTipo* family), so no unvalidated identifier reaches the
 *     assembler;
 *   - `buildSearchSql({...}, {principal})`, which applies the per-record
 *     projects filter (§7.4) exactly as the web search does.
 */

import { z } from 'zod';
import type { Sqo, SqoFilterLeaf, SqoFilterNode } from '../../../core/concepts/sqo.ts';
import { sanitizeClientSqo } from '../../../core/concepts/sqo.ts';
import { sql } from '../../../core/db/postgres.ts';
import { type OntologySubtreeNode, getOrderedSubtree } from '../../../core/ontology/resolver.ts';
import {
	assertValidLang,
	assertValidTipo,
	assertValidTipoOrColumn,
} from '../../../core/search/identifier_gate.ts';
import { buildSearchSql } from '../../../core/search/sql_assembler.ts';
import type { Principal } from '../../../core/security/permissions.ts';
import { Page, ToolError, buildPagination } from '../envelope.ts';
import { pickUnambiguous, resolveFieldCandidates } from '../label_resolution.ts';
import { type ToolSpec, defineTool } from '../tool_spec.ts';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

// ---------------------------------------------------------------------------
// Typed filter — the agent-friendly recursive shape.
// ---------------------------------------------------------------------------

export type McpFilter = { and: McpFilter[] } | { or: McpFilter[] } | McpFilterRule;

export interface McpFilterRule {
	/** Field tipo or human label (resolved within the searched section). */
	field?: string;
	/** Comparison (default 'contains'). */
	op?: 'contains' | 'eq' | 'not_empty' | 'empty';
	value?: string;
	lang?: string;
	/** Multi-hop path from dedalo_resolve_path (overrides `field`). */
	path?: { section_tipo: string; component_tipo: string }[];
}

const pathStepSchema = z.object({
	section_tipo: z.string(),
	component_tipo: z.string(),
});

const filterSchema: z.ZodType<McpFilter> = z.lazy(() =>
	z.union([
		z.object({ and: z.array(filterSchema).min(1) }),
		z.object({ or: z.array(filterSchema).min(1) }),
		z.object({
			field: z.string().optional(),
			op: z.enum(['contains', 'eq', 'not_empty', 'empty']).optional(),
			value: z.string().optional(),
			lang: z.string().optional(),
			path: z.array(pathStepSchema).optional(),
		}),
	]),
);

/** Resolve one rule's field reference to a component tipo within the section. */
function resolveRuleField(
	rule: McpFilterRule,
	sectionTipo: string,
	fieldNodes: OntologySubtreeNode[],
): string {
	if (rule.field === undefined) {
		throw new ToolError('invalid_request', 'A filter rule needs `field` or `path`.');
	}
	const candidates = resolveFieldCandidates(rule.field, fieldNodes);
	const picked = pickUnambiguous(candidates);
	if (picked === null) {
		throw new ToolError(
			candidates.length === 0 ? 'not_found' : 'label_ambiguous',
			`Filter field '${rule.field}' of section '${sectionTipo}' ${candidates.length === 0 ? 'does not exist' : 'is ambiguous'}.`,
			candidates.length === 0 ? undefined : { candidates: candidates.slice(0, 10) },
		);
	}
	return picked.tipo;
}

/** Map one typed rule to an SQO filter leaf (validated identifiers only). */
function ruleToLeaf(
	rule: McpFilterRule,
	sectionTipo: string,
	fieldNodes: OntologySubtreeNode[],
): SqoFilterLeaf {
	const op = rule.op ?? 'contains';
	let q: string;
	switch (op) {
		case 'contains':
			q = rule.value ?? '';
			break;
		case 'eq':
			q = `==${rule.value ?? ''}`;
			break;
		case 'not_empty':
			q = '*';
			break;
		case 'empty':
			q = '!*';
			break;
	}
	if ((op === 'contains' || op === 'eq') && (rule.value === undefined || rule.value === '')) {
		throw new ToolError('invalid_request', `Filter op '${op}' needs a non-empty value.`);
	}
	const path =
		rule.path !== undefined && rule.path.length > 0
			? rule.path.map((step, index) => ({
					section_tipo: assertValidTipo(step.section_tipo, `mcp.search.path[${index}].section`),
					component_tipo: assertValidTipoOrColumn(
						step.component_tipo,
						`mcp.search.path[${index}].component`,
					),
				}))
			: [
					{
						section_tipo: sectionTipo,
						component_tipo: assertValidTipo(
							resolveRuleField(rule, sectionTipo, fieldNodes),
							'mcp.search.field',
						),
					},
				];
	const leaf: SqoFilterLeaf = { q, path };
	if (rule.lang !== undefined) leaf.lang = assertValidLang(rule.lang, 'mcp.search.lang');
	return leaf;
}

/** Conform the typed recursive filter to the engine's SqoFilterNode. */
export function conformTypedFilter(
	filter: McpFilter,
	sectionTipo: string,
	fieldNodes: OntologySubtreeNode[],
): SqoFilterNode {
	if ('and' in filter && Array.isArray(filter.and)) {
		return {
			$and: filter.and.map((child) => conformTypedFilter(child, sectionTipo, fieldNodes)),
		};
	}
	if ('or' in filter && Array.isArray(filter.or)) {
		return {
			$or: filter.or.map((child) => conformTypedFilter(child, sectionTipo, fieldNodes)),
		};
	}
	return { $and: [ruleToLeaf(filter as McpFilterRule, sectionTipo, fieldNodes)] };
}

// ---------------------------------------------------------------------------
// raw_sqo — the canonical-SQO escape hatch, gated like a client SQO.
// ---------------------------------------------------------------------------

/**
 * Walk a sanitized SQO filter tree and assert every path identifier at the
 * chokepoint (the TS twin of PHP sanitize_client_sqo's downstream conform:
 * nothing reaches the assembler with an unvalidated tipo/lang).
 */
function assertFilterIdentifiers(node: unknown, where: string): void {
	if (node === null || node === undefined) return;
	if (Array.isArray(node)) {
		for (const [index, child] of node.entries()) {
			assertFilterIdentifiers(child, `${where}[${index}]`);
		}
		return;
	}
	if (typeof node !== 'object') return;
	const record = node as Record<string, unknown>;
	if (Array.isArray(record.$and)) {
		assertFilterIdentifiers(record.$and, `${where}.$and`);
		return;
	}
	if (Array.isArray(record.$or)) {
		assertFilterIdentifiers(record.$or, `${where}.$or`);
		return;
	}
	// Leaf: validate path steps + lang.
	if (Array.isArray(record.path)) {
		for (const [index, rawStep] of record.path.entries()) {
			const step = (rawStep ?? {}) as Record<string, unknown>;
			if (step.section_tipo !== undefined) {
				assertValidTipo(step.section_tipo, `${where}.path[${index}].section_tipo`);
			}
			if (step.component_tipo !== undefined) {
				assertValidTipoOrColumn(step.component_tipo, `${where}.path[${index}].component_tipo`);
			}
		}
	}
	if (record.lang !== undefined && record.lang !== null) {
		assertValidLang(record.lang, `${where}.lang`);
	}
}

const rawSqoSchema = z.object({
	filter: z.unknown().optional(),
	order: z.unknown().optional(),
	limit: z.number().optional(),
	offset: z.number().optional(),
	full_count: z.boolean().optional(),
});

/**
 * Build the engine SQO from the tool input: typed filter and/or raw_sqo, both
 * gated. `section_tipo` is ALWAYS the validated argument — a raw_sqo can never
 * retarget the search.
 */
async function buildGatedSqo(input: {
	section_tipo: string;
	filter?: McpFilter;
	raw_sqo?: unknown;
	limit?: number;
	offset?: number;
	order?: { field: string; direction?: 'ASC' | 'DESC' }[];
	full_count?: boolean;
}): Promise<{ sqo: Sqo; sectionTipo: string; limit: number; offset: number }> {
	const sectionTipo = assertValidTipo(input.section_tipo, 'mcp.search.section_tipo');
	const fieldNodes = (await getOrderedSubtree(sectionTipo)).filter(
		(node) => typeof node.model === 'string' && node.model.startsWith('component_'),
	);

	// Start from the raw_sqo fragment when given (client-SQO sanitized), else empty.
	let candidate: Record<string, unknown> = {};
	if (input.raw_sqo !== undefined) {
		const parsed = rawSqoSchema.safeParse(input.raw_sqo);
		if (!parsed.success) {
			throw new ToolError(
				'invalid_request',
				`raw_sqo accepts only {filter, order, limit, offset, full_count}: ${parsed.error.message}`,
			);
		}
		candidate = { ...parsed.data };
	}

	// The typed filter wins over a raw filter when both are given.
	if (input.filter !== undefined) {
		candidate.filter = conformTypedFilter(input.filter, sectionTipo, fieldNodes);
	}

	// Typed order: resolve field references within the section (a label picks
	// its tipo; a tipo/data-column passes the identifier gate directly).
	if (input.order !== undefined) {
		candidate.order = input.order.map((clause) => {
			const picked = pickUnambiguous(resolveFieldCandidates(clause.field, fieldNodes));
			const component = assertValidTipoOrColumn(picked?.tipo ?? clause.field, 'mcp.search.order');
			return {
				direction: clause.direction ?? 'ASC',
				path: [{ section_tipo: sectionTipo, component_tipo: component }],
			};
		});
	}

	if (input.limit !== undefined) candidate.limit = input.limit;
	if (input.offset !== undefined) candidate.offset = input.offset;
	// full_count NEVER enters the page SQO (it would turn the locator page into
	// a count query); runGatedCount sets it on its own copy.
	candidate.full_count = undefined;
	// Force the target: never trust a section_tipo smuggled inside raw_sqo.
	candidate.section_tipo = [sectionTipo];

	// The client-SQO gate: strips server-only keys, bounds the tree, clamps limit.
	const sqo = sanitizeClientSqo(candidate);
	// Leaf-walk identifier gate over whatever filter survived the sanitize.
	assertFilterIdentifiers(sqo.filter ?? null, 'mcp.search.raw_sqo.filter');
	if (Array.isArray(sqo.order)) {
		for (const [index, clause] of sqo.order.entries()) {
			for (const [stepIndex, step] of (clause.path ?? []).entries()) {
				if (step.section_tipo !== undefined) {
					assertValidTipo(step.section_tipo, `mcp.search.order[${index}][${stepIndex}].section`);
				}
				if (step.component_tipo !== undefined) {
					assertValidTipoOrColumn(
						step.component_tipo,
						`mcp.search.order[${index}][${stepIndex}].component`,
					);
				}
			}
		}
	}

	// MCP page clamp (tighter than the client ceiling).
	const requestedLimit = typeof sqo.limit === 'number' ? sqo.limit : DEFAULT_LIMIT;
	const limit =
		input.limit === undefined && input.raw_sqo === undefined
			? DEFAULT_LIMIT
			: Math.min(Math.max(1, requestedLimit), MAX_LIMIT);
	sqo.limit = limit;
	const offset = typeof sqo.offset === 'number' ? sqo.offset : 0;

	return { sqo, sectionTipo, limit, offset };
}

async function runLocatorPage(
	principal: Principal,
	sqo: Sqo,
): Promise<{ section_tipo: string; section_id: number }[]> {
	const pageQuery = await buildSearchSql(sqo, { principal });
	const rows = (await sql.unsafe(
		pageQuery.sql,
		pageQuery.params as (string | number | null)[],
	)) as { section_id: number | string; section_tipo: string }[];
	return rows.map((row) => ({
		section_tipo: row.section_tipo,
		section_id: Number(row.section_id),
	}));
}

async function runGatedCount(principal: Principal, sqo: Sqo): Promise<number> {
	const countQuery = await buildSearchSql(
		{ ...sqo, full_count: true, limit: undefined, offset: undefined },
		{ principal },
	);
	const rows = (await sql.unsafe(
		countQuery.sql,
		countQuery.params as (string | number | null)[],
	)) as { full_count: number | string }[];
	return rows.reduce((sum, row) => sum + Number(row.full_count), 0);
}

/**
 * Search a section with the full filter surface. Returns a locator page plus
 * the pagination block (`total` only when `full_count` — the gated count costs
 * a second query).
 */
export async function searchRecords(
	principal: Principal,
	input: {
		section_tipo: string;
		filter?: McpFilter;
		raw_sqo?: unknown;
		limit?: number;
		offset?: number;
		order?: { field: string; direction?: 'ASC' | 'DESC' }[];
		full_count?: boolean;
	},
): Promise<Page<{ section_tipo: string; hits: { section_tipo: string; section_id: number }[] }>> {
	const { sqo, sectionTipo, limit, offset } = await buildGatedSqo(input);
	const hits = await runLocatorPage(principal, sqo);
	const total = input.full_count === true ? await runGatedCount(principal, sqo) : null;
	return new Page(
		{ section_tipo: sectionTipo, hits },
		buildPagination(total, offset, hits.length, limit),
	);
}

/** Count the records matching a filter (gated total only, no page). */
export async function countRecords(
	principal: Principal,
	input: { section_tipo: string; filter?: McpFilter; raw_sqo?: unknown },
): Promise<{ section_tipo: string; total: number }> {
	const { sqo, sectionTipo } = await buildGatedSqo(input);
	return { section_tipo: sectionTipo, total: await runGatedCount(principal, sqo) };
}

// ---------------------------------------------------------------------------
// Specs
// ---------------------------------------------------------------------------

const READ_ANNOTATIONS = {
	readOnlyHint: true,
	destructiveHint: false,
	idempotentHint: true,
	openWorldHint: false,
} as const;

const FILTER_DESCRIPTION =
	'Recursive filter: {and:[...]} / {or:[...]} / rule {field (tipo or label), ' +
	'op: contains|eq|not_empty|empty, value, lang?, path?: [{section_tipo, ' +
	'component_tipo}] from dedalo_resolve_path for cross-section hops}.';

export const SEARCH_SPECS: ToolSpec[] = [
	defineTool({
		name: 'dedalo_search_records',
		title: 'Search records',
		description:
			'Search a section with recursive AND/OR filters over fields (by tipo ' +
			'or human label), multi-hop portal paths, ordering and pagination. ' +
			'Returns locator hits; open one with dedalo_read_record. Set ' +
			'full_count:true to also get the gated total. raw_sqo accepts a ' +
			'canonical Dédalo SQO fragment (power users; same security gates).',
		tier: 'agent',
		write: false,
		annotations: { ...READ_ANNOTATIONS },
		inputShape: {
			section_tipo: z.string().describe('The section tipo to search, e.g. "rsc197".'),
			filter: filterSchema.optional().describe(FILTER_DESCRIPTION),
			raw_sqo: z
				.object({
					filter: z.unknown().optional(),
					order: z.unknown().optional(),
					limit: z.number().optional(),
					offset: z.number().optional(),
					full_count: z.boolean().optional(),
				})
				.optional()
				.describe('Canonical SQO fragment escape hatch ($and/$or/q/path leaves).'),
			limit: z.number().optional().describe('Page size (default 20, max 100).'),
			offset: z.number().optional().describe('Records to skip (default 0).'),
			order: z
				.array(
					z.object({
						field: z.string().describe('Field tipo or label to order by.'),
						direction: z.enum(['ASC', 'DESC']).optional(),
					}),
				)
				.optional(),
			full_count: z
				.boolean()
				.optional()
				.describe('Also compute the gated total (extra query; default false).'),
		},
		handler: searchRecords,
	}),
	defineTool({
		name: 'dedalo_count_records',
		title: 'Count records',
		description:
			'Count the records matching a filter in a section (projects-filtered ' +
			'total the configured user may see). Same filter surface as ' +
			'dedalo_search_records.',
		tier: 'agent',
		write: false,
		annotations: { ...READ_ANNOTATIONS },
		inputShape: {
			section_tipo: z.string().describe('The section tipo to count in.'),
			filter: filterSchema.optional().describe(FILTER_DESCRIPTION),
			raw_sqo: z
				.object({
					filter: z.unknown().optional(),
				})
				.optional()
				.describe('Canonical SQO filter fragment (escape hatch).'),
		},
		handler: countRecords,
	}),
];
