/**
 * DDO / DDO_MAP — the declarative resolution graph (spec §3.4).
 *
 * A ddo ("data-description object") describes how ONE component must be
 * resolved inside a response: which component (`tipo`), in which section
 * (`section_tipo`, where the literal string 'self' means "the current
 * section"), in which render `mode`, language, view, etc.
 *
 * A ddo_map is a FLAT ARRAY of ddos that encodes a TREE: each ddo's `parent`
 * holds the `tipo` of the ddo it hangs under, and the sentinel 'self' marks
 * direct children of the calling component/section. This is Dédalo's key
 * mechanism: a relation component carries, declaratively, the sub-components
 * to resolve in the RELATED section — to arbitrary depth — without any
 * per-relation code.
 *
 * PHP references:
 * - allowed client fields: class.request_config_object.php:683 (sanitize_client_ddo_map)
 * - tree walk: class.common.php:2295 (get_children_recursive) and :2454
 *   (`parent === $this->tipo` direct-children filter inside get_subdatum).
 *
 * SECURITY (spec §7.8): the schema below is ALSO the sanitization gate for
 * client-supplied ddo_maps. It is a strict field whitelist — `.strip()` (zod's
 * default for z.object) drops any key not listed, which is exactly the PHP
 * behavior of sanitize_client_ddo_map. Do NOT add server-only fields here.
 */

import { z } from 'zod';

/** Sentinel meaning "the calling section/component" in section_tipo / parent. */
export const SELF_SENTINEL = 'self' as const;

/**
 * Client-allowed ddo fields — the display whitelist. Mirrors PHP
 * request_config_object::sanitize_client_ddo_map $allowed_fields.
 */
export const ddoSchema = z.object({
	/** Ontology typo discriminator, present in some ontology-authored ddos. */
	typo: z.string().optional(),
	/** Component tipo to resolve (MANDATORY). */
	tipo: z.string(),
	/** Target section tipo; 'self' = current section. Multi-target components
	 * (hierarchy_types portals) carry the full ARRAY of target tipos — the
	 * client echoes back the shape our own context responses ship. */
	section_tipo: z.union([z.string(), z.array(z.string())]).optional(),
	/** Explicit record id (rare; usually resolved at runtime). */
	section_id: z.union([z.number(), z.string()]).optional(),
	/** Parent tipo in the ddo_map tree; 'self' = direct child of the caller. */
	parent: z.string().optional(),
	/** Render mode: edit | list | search | ... */
	mode: z.string().optional(),
	/** Language override ('lg-*'). */
	lang: z.string().optional(),
	/** Custom view name. The client sends null for columns with no explicit view
	 * (e.g. tool_time_machine's fixed_mode list columns), so null is accepted. */
	view: z.string().nullable().optional(),
	/** UI label text. */
	label: z.string().optional(),
	/** Glue for multi-value display, e.g. ' | '. */
	fields_separator: z.string().optional(),
	/** Glue for record arrays, e.g. '<br>'. */
	records_separator: z.string().optional(),
	/** Prepend the parent chain to the display value (thesaurus paths). */
	value_with_parents: z.boolean().optional(),
	/** Table column identifier (list mode). */
	column_id: z.string().optional(),
	/** CSS width hint. */
	width: z.string().optional(),
	/** Mosaic layout flag. */
	in_mosaic: z.boolean().optional(),
	/** Tooltip text. */
	hover: z.string().optional(),
	/** Pagination limit (0 = all). */
	limit: z.number().optional(),
	/** Pagination offset. */
	offset: z.number().optional(),
});

export type Ddo = z.infer<typeof ddoSchema>;

/** A ddo_map: flat list, tree via `parent` links. */
export const ddoMapSchema = z.array(ddoSchema);
export type DdoMap = z.infer<typeof ddoMapSchema>;

/**
 * Sanitize a client-supplied ddo_map: whitelist fields (schema strips unknown
 * keys) and drop entries without a `tipo`. This is the §7.8 chokepoint.
 */
export function sanitizeClientDdoMap(untrustedDdoMap: unknown): DdoMap {
	const parsed = ddoMapSchema.safeParse(untrustedDdoMap);
	if (!parsed.success) {
		// Fail closed: a malformed ddo_map resolves nothing rather than something unexpected.
		return [];
	}
	return parsed.data;
}

/**
 * Direct children of `parentTipo` in a ddo_map (the PHP :2454 filter).
 * `parentTipo` may be an actual tipo or the caller's tipo matching 'self'
 * entries already resolved upstream.
 */
export function getDirectChildren(ddoMap: readonly Ddo[], parentTipo: string): Ddo[] {
	return ddoMap.filter((ddo) => ddo.parent === parentTipo);
}

/**
 * All descendants of a ddo (children, grandchildren, …) preserving map order —
 * the PHP get_children_recursive closure (class.common.php:2295). Used when a
 * child component instance receives its NARROWED ddo_map (only its own
 * subtree) during subdatum resolution.
 */
export function getDescendants(ddoMap: readonly Ddo[], ofTipo: string): Ddo[] {
	const descendants: Ddo[] = [];
	for (const ddo of ddoMap) {
		if (ddo.parent === ofTipo) {
			descendants.push(ddo, ...getDescendants(ddoMap, ddo.tipo));
		}
	}
	return descendants;
}
