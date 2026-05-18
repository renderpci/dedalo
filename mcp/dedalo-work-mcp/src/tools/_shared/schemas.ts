import { z } from 'zod';
export { FilterSchema, FilterRuleSchema } from '@dedalo/mcp-common';
export type { Filter, FilterRule } from '@dedalo/mcp-common';

/**
 * SCHEMAS
 * Reusable Zod primitives for Dédalo work-API tool input schemas.
 *
 * Why: consistent types across every tool make inputs predictable for
 * the LLM, prevent silent stringification bugs, and give the MCP client
 * a coherent vocabulary to learn.
 */

/** Ontology tipo identifier. Short alphanumeric code like `oh1`, `dd1324`, `rsc167`. */
export const TipoSchema = z
	.string()
	.min(1)
	.regex(/^[a-zA-Z0-9_]+$/, 'tipo must match [a-zA-Z0-9_]+')
	.describe('Ontology tipo identifier (e.g. `oh1`, `dd1324`). Resolve from human names via `dedalo_ontology_glossary` or `dedalo_resolve_ontology`.');

/** Agent section identifier: accepts a human name (e.g. "Cecas") OR a tipo (e.g. "oh1"). */
export const AgentSectionSchema = z
	.string()
	.min(1)
	.describe('Section name (e.g. "Cecas", "Oral History") or tipo (e.g. "oh1"). The server resolves names automatically.');

/** Dédalo language code. `lg-eng`, `lg-spa`, `lg-nolan` (no-language), etc. */
export const LangSchema = z
	.string()
	.regex(/^lg-[a-z]{2,8}$/, 'lang must match `lg-xxx`')
	.describe('Dédalo language code (e.g. `lg-eng`, `lg-spa`, `lg-nolan`).');

/** Optional language, empty defaults to server's DEDALO_DATA_LANG. */
export const OptionalLangSchema = LangSchema.optional();

/** Record identifier. Accepts string or number; always sent as string. */
export const SectionIdSchema = z
	.union([z.string().min(1), z.number().int().positive()])
	.transform((v) => String(v))
	.describe('Record identifier (section_id) within a section_tipo.');

/** Universal record pointer used for portals, indexation, and cross-refs. */
export const LocatorSchema = z.object({
	section_tipo: TipoSchema,
	section_id: SectionIdSchema,
	component_tipo: TipoSchema.optional(),
	tag_id: z.string().optional(),
	type: z.string().optional(),
	from_section_tipo: TipoSchema.optional(),
	from_section_id: SectionIdSchema.optional(),
}).describe('Universal Dédalo locator { section_tipo, section_id, ... }.');

/** Common pagination block for list/search tools. */
export const PaginationSchema = z.object({
	limit: z.number().int().min(1).max(500).default(50).describe('Maximum records to return (1..500).'),
	offset: z.number().int().min(0).default(0).describe('Records to skip before returning results.'),
	full_count: z.boolean().default(false).describe('If true, include the total matching-rows count ignoring limit/offset.'),
});

/** Order clause: `{ path, direction }`. */
export const OrderClauseSchema = z.object({
	path: z.string().describe('Component tipo to sort by.'),
	direction: z.enum(['ASC', 'DESC']).default('ASC'),
});

/** UI mode passed to context-building actions. */
export const ModeSchema = z.enum(['edit', 'list', 'search', 'tm', 'portal', 'tool']);
