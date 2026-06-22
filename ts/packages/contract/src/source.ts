import { z } from 'zod';
import { IdValueSchema } from './locator.ts';

/**
 * SourceSchema / Source
 * Describes the target of a Dédalo API action (section, component or tool).
 *
 * The PHP side uses `source` to resolve the ontology class, section context,
 * language and UI mode. `tipo` is the ontology term identifier; `section_tipo`
 * + `section_id` narrow it to a concrete record. Mirrors mcp-common's
 * `SourceSchema`; kept `.passthrough()` because action-specific sources carry
 * extra fields (e.g. portal context).
 */
export const SourceSchema = z
	.object({
		model: z.string().optional(),
		tipo: z.string().optional(),
		section_tipo: z.string().optional(),
		section_id: IdValueSchema.optional(),
		mode: z.enum(['edit', 'list', 'search', 'tm', 'portal', 'tool']).optional(),
		lang: z.string().optional(),
		view: z.string().optional(),
		action: z.string().optional(),
		from_user_version: z.boolean().optional(),
		from_section_tipo: z.string().optional(),
		from_section_id: IdValueSchema.optional(),
		row_section_id: IdValueSchema.optional(),
		parent_tipo: z.string().optional(),
		component_tipo: z.string().optional(),
		component_number: z.union([z.string(), z.number()]).optional(),
	})
	.passthrough();

export type Source = z.infer<typeof SourceSchema>;
