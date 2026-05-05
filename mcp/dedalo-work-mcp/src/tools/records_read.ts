import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SqoBuilder, type WorkClient, type Filter as SqoFilter } from '@dedalo/mcp-common';
import { registerTool, type ToolContext } from './_shared/register.js';
import { rqo } from './_shared/rqo.js';
import {
	TipoSchema,
	OptionalLangSchema,
	SectionIdSchema,
	PaginationSchema,
	FilterSchema,
	OrderClauseSchema,
} from './_shared/schemas.js';
import { buildPagination } from './_shared/output.js';

/**
 * Read-only record tools (search, read, count, indexation).
 *
 * Authorisation: Dédalo enforces per-section and per-tipo permissions
 * server-side. Records the logged user cannot see are silently filtered;
 * unauthorised actions return `permissions_denied`.
 */
export function registerRecordsReadTools(server: McpServer, client: WorkClient, ctx: ToolContext): void {
	registerTool(server, {
		name: 'dedalo_read_record',
		description:
			'Read a single record by `section_tipo` + `section_id`. Returns the full record with components rendered for the requested mode.',
		annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true, title: 'Read record' },
		inputSchema: z.object({
			section_tipo: TipoSchema,
			section_id: SectionIdSchema,
			lang: OptionalLangSchema,
			mode: z.enum(['edit', 'list']).default('edit'),
		}),
		handler: async ({ section_tipo, section_id, lang, mode }) => {
			const sqo = new SqoBuilder(section_tipo)
				.limit(1)
				.filterByLocators([{ section_tipo, section_id }])
				.build();
			return client.call(
				rqo('read', 'dd_core_api', { model: 'section', tipo: section_tipo, section_tipo, mode, lang }, sqo)
			);
		},
	}, ctx);

	registerTool(server, {
		name: 'dedalo_search_records',
		description:
			'Search records using the SQO (Search Query Object) DSL. Supports pagination, AND/OR filter trees, ordering, and full-count totals. Provide either `filter` (typed) or `raw_sqo` (escape hatch).\n\nExample filter:\n```json\n{ "operator": "AND", "rules": [ { "path": "oh14", "operator": "contains", "value": "Picasso" } ] }\n```',
		annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true, title: 'Search records' },
		inputSchema: z.object({
			section_tipo: z.union([TipoSchema, z.array(TipoSchema).min(1)]).describe('Single section_tipo or array for cross-section search.'),
			lang: OptionalLangSchema,
			limit: PaginationSchema.shape.limit,
			offset: PaginationSchema.shape.offset,
			full_count: PaginationSchema.shape.full_count,
			filter: FilterSchema.optional().describe('Typed AND/OR filter tree.'),
			order: z.array(OrderClauseSchema).optional().describe('Sort clauses applied in array order.'),
			raw_sqo: z.record(z.unknown()).optional().describe('Escape hatch: raw SQO object that overrides all other fields when present.'),
		}),
		handler: async ({ section_tipo, lang, limit, offset, full_count, filter, order, raw_sqo }) => {
			const built = (() => {
				if (raw_sqo) return raw_sqo as unknown as Parameters<typeof rqo>[3];
				const b = new SqoBuilder(section_tipo);
				b.limit(limit).offset(offset);
				if (filter) {
					// SqoBuilder accepts top-level rules; pass filter through as-is via cast.
					b.filter((filter.operator ?? 'AND') as 'AND' | 'OR', (filter as SqoFilter).rules as never);
				}
				if (order) for (const o of order) b.order(o.path, o.direction);
				if (full_count) b.fullCount(true);
				return b.build();
			})();

			const primarySection = Array.isArray(section_tipo) ? section_tipo[0] : section_tipo;
			const res = await client.call(
				rqo('read', 'dd_core_api', { model: 'section', section_tipo: primarySection, lang }, built)
			);
			return { ok: true as const, data: res, pagination: buildPagination(res, offset, limit) };
		},
	}, ctx);

	registerTool(server, {
		name: 'dedalo_read_raw',
		description:
			'Read raw JSONB data for records without component rendering. Faster than `dedalo_read_record` when only stored values are needed.',
		annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true, title: 'Read raw' },
		inputSchema: z.object({
			section_tipo: TipoSchema,
			lang: OptionalLangSchema,
			limit: PaginationSchema.shape.limit,
			offset: PaginationSchema.shape.offset,
			full_count: PaginationSchema.shape.full_count,
			filter: FilterSchema.optional(),
		}),
		handler: async ({ section_tipo, lang, limit, offset, full_count, filter }) => {
			const b = new SqoBuilder(section_tipo).limit(limit).offset(offset);
			if (filter) b.filter((filter.operator ?? 'AND') as 'AND' | 'OR', (filter as SqoFilter).rules as never);
			if (full_count) b.fullCount(true);
			const res = await client.call(
				rqo('read_raw', 'dd_core_api', { tipo: section_tipo, section_tipo, lang }, b.build())
			);
			return { ok: true as const, data: res, pagination: buildPagination(res, offset, limit) };
		},
	}, ctx);

	registerTool(server, {
		name: 'dedalo_count_records',
		description:
			'Count records matching an SQO filter. Returns the count without fetching record bodies. Use to determine total pages before searching.',
		annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true, title: 'Count records' },
		inputSchema: z.object({
			section_tipo: TipoSchema,
			filter: FilterSchema.optional(),
		}),
		handler: async ({ section_tipo, filter }) => {
			const b = new SqoBuilder(section_tipo);
			if (filter) b.filter((filter.operator ?? 'AND') as 'AND' | 'OR', (filter as SqoFilter).rules as never);
			return client.call(rqo('count', 'dd_core_api', { tipo: section_tipo, section_tipo }, b.build()));
		},
	}, ctx);

	registerTool(server, {
		name: 'dedalo_get_indexation_grid',
		description:
			'Get the indexation grid for a record. Returns thesaurus terms and their hierarchical relationships, useful for inspecting how a record is classified.',
		annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true, title: 'Get indexation grid' },
		inputSchema: z.object({
			section_tipo: TipoSchema,
			section_id: SectionIdSchema,
			lang: OptionalLangSchema,
		}),
		handler: async ({ section_tipo, section_id, lang }) =>
			client.call(rqo('get_indexation_grid', 'dd_core_api', { tipo: section_tipo, section_tipo, section_id, lang })),
	}, ctx);
}
