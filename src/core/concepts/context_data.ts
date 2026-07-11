/**
 * CONTEXT vs DATA — the two definitions every data element has (spec §3.7).
 *
 * Every component/section/widget that manages data is described twice:
 *
 * CONTEXT — the ontology-derived STRUCTURE needed to instantiate it: label,
 * tipo, model, properties, css, tools, buttons, columns_map, translatability
 * and the resolved request_config. In PHP this is built by
 * common::get_structure_context (class.common.php:1604) on top of a cached
 * core (build_structure_context_core, :1739) and then per-call STAMPED with
 * the variant fields (permissions, parent, lang, request_config, view…).
 *
 * DATA — the instance VALUE(S) for a specific record/lang, lazily loaded from
 * the matrix (component_common::get_data). Context can always be built
 * without paying data I/O.
 *
 * Cache/mutation contract the rewrite MUST keep (and PHP enforces at :1644):
 * the cached core is IMMUTABLE — always deep-clone before stamping; never hand
 * out a cache entry by reference. In a persistent Bun process this is doubly
 * critical (spec §4 persistent-runtime discipline): the core cache is keyed by
 * structural identity only (tipo/section_tipo/mode/…), while everything
 * request-dependent (permissions! lang!) is stamped on the clone.
 *
 * TODO(phase-4): implement the builder + cache; this file only fixes the
 * SHAPES and the contract so fixtures can be schema-checked from day one.
 */

import { z } from 'zod';
import { requestConfigSchema } from './request_config.ts';

/**
 * A context entry as the API returns it (one per component/section resolved).
 * Field set mirrors the PHP dd_object built at class.common.php:1957-1972 plus
 * the per-call stamps (:1657-1708).
 */
export const contextEntrySchema = z
	.object({
		// --- cached core (structural, shared) ---------------------------------
		label: z.string().nullable().optional(),
		tipo: z.string(),
		section_tipo: z.string().optional(),
		model: z.string().optional(),
		legacy_model: z.string().optional(),
		parent_grouper: z.string().nullable().optional(),
		mode: z.string().optional(),
		translatable: z.boolean().optional(),
		properties: z.record(z.unknown()).nullable().optional(),
		css: z.unknown().optional(),
		tools: z.array(z.unknown()).optional(),
		buttons: z.array(z.unknown()).optional(),
		columns_map: z.unknown().optional(),
		sortable: z.boolean().optional(),

		// --- per-call stamps (request-dependent, NEVER cached) -----------------
		/** Server-authoritative permission level 0–3, capped per caller (§7.4). */
		permissions: z.number().optional(),
		/** Parent context reference (resolve_context_parent). */
		parent: z.string().nullable().optional(),
		lang: z.string().optional(),
		request_config: requestConfigSchema.optional(),
		path: z.unknown().optional(),
		view: z.string().nullable().optional(),
		children_view: z.string().nullable().optional(),
	})
	.passthrough();

export type ContextEntry = z.infer<typeof contextEntrySchema>;

/**
 * A data entry as the API returns it: the instance value(s) of one component
 * for one record. `value` shapes are component-model-specific (typed per
 * component in Phase 6); here they stay unknown on purpose.
 */
export const dataEntrySchema = z
	.object({
		tipo: z.string(),
		section_tipo: z.string().optional(),
		section_id: z.union([z.number(), z.string()]).nullable().optional(),
		mode: z.string().optional(),
		lang: z.string().optional(),
		/** Which parent component pulled this data in (subdatum chains). */
		from_component_tipo: z.string().optional(),
		/** The stored value(s). Component-specific shape; often [{id?, value, lang}]. */
		value: z.unknown().optional(),
		/** Value from the fallback language when the requested lang is empty. */
		fallback_value: z.unknown().optional(),
	})
	.passthrough();

export type DataEntry = z.infer<typeof dataEntrySchema>;

/**
 * The canonical API payload of a resolution: parallel context[] and data[]
 * arrays (PHP build_json_rows output shape).
 */
export const contextAndDataSchema = z.object({
	context: z.array(contextEntrySchema),
	data: z.array(dataEntrySchema),
});
export type ContextAndData = z.infer<typeof contextAndDataSchema>;
