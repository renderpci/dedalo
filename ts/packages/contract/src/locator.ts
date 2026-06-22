import { z } from 'zod';

/**
 * IdValue
 * Dédalo serializes record ids as either strings or numbers depending on
 * source. Locators store `section_id` as a string PHP-side, but the JSON
 * wire (and client builders) accept both, so we normalise to a union.
 */
export const IdValueSchema = z.union([z.string(), z.number()]);
export type IdValue = z.infer<typeof IdValueSchema>;

/**
 * LocatorSchema / Locator
 * Universal record pointer used across Dédalo for cross-references,
 * indexation tags, portal values and dataframe pairing.
 *
 * Ground truth: core/common/class.locator.php. `section_tipo` +
 * `section_id` are the mandatory pair; everything else is sparse and only
 * present when meaningful. The PHP `locator` extends `stdClass`, so unknown
 * ad-hoc fields (e.g. `id`, `paginated_key`) survive the round-trip — we
 * keep the schema `.passthrough()` to mirror that openness while still
 * documenting the known fields.
 */
export const LocatorSchema = z
	.object({
		// mandatory pair
		section_tipo: z.string(),
		section_id: IdValueSchema,
		// destination / source component within the section
		component_tipo: z.string().optional(),
		component_number: z.union([z.string(), z.number()]).optional(),
		from_component_tipo: z.string().optional(),
		// inline tag (component_text_area)
		tag_id: z.union([z.string(), z.number()]).optional(),
		tag_component_tipo: z.string().optional(),
		tag_type: z.string().optional(),
		// relation typing
		type: z.string().optional(),
		type_rel: z.string().optional(),
		// dataframe pairing keys
		id_key: z.union([z.string(), z.number()]).optional(),
		section_id_key: z.union([z.string(), z.number()]).optional(),
		section_tipo_key: z.string().optional(),
		// hierarchical parent (v6, being retired)
		section_top_tipo: z.string().optional(),
		section_top_id: z.union([z.string(), z.number()]).optional(),
		// UI / language context occasionally carried on pseudo-locators
		mode: z.string().optional(),
		view: z.string().optional(),
		lang: z.string().optional(),
		from_section_tipo: z.string().optional(),
		from_section_id: IdValueSchema.optional(),
	})
	.passthrough();

export type Locator = z.infer<typeof LocatorSchema>;
