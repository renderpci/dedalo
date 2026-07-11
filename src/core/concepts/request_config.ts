/**
 * REQUEST_CONFIG — how relation components resolve their targets (spec §3.6).
 *
 * PHP oracle nomenclature: explicit ≡ v6, implicit ≡ v5
 * (trait.request_config_v6.php / trait.request_config_v5.php).
 *
 * Every relation component (portal, relation_*, autocomplete…) declares how to
 * reach and render its target section(s):
 *
 * - EXPLICIT (modern — the default builder): the ontology node carries
 *   `properties.source.request_config`, an ARRAY of items each holding:
 *     • sqo   — target section(s) + fixed data filters
 *     • show / search / choose / hide — ddo_maps for each UI context
 *     • api_engine / api_config — optional external resolution engine
 *   PHP: trait.request_config_v6.php, class.request_config_object.php:41.
 *
 * - IMPLICIT (legacy): no explicit config; child component tipos are
 *   derived by walking the ontology relation graph. Still supported as a
 *   fallback, EXCEPT for component_relation_parent/children which REQUIRE
 *   explicit config. PHP: trait.request_config_v5.php.
 *
 * The resolved request_config is stamped onto a component's CONTEXT
 * (context_data.ts) and consumed by subdatum resolution (subdatum.ts).
 *
 * WHERE THE ENGINE LIVES: this module is the PURE contract home — schemas and
 * the explicit/implicit selection rule. The I/O-bearing builders live in
 * src/core/relations/request_config/ (build.ts entry, explicit.ts parser,
 * implicit.ts graph walk).
 */

import { z } from 'zod';
import { ddoMapSchema } from './ddo.ts';
import { sqoSchema } from './sqo.ts';

/** One UI-context block inside a request_config item. */
export const requestConfigBlockSchema = z
	.object({
		ddo_map: ddoMapSchema.optional(),
		/** Per-block SQO adjustments (operator, etc.). */
		sqo_config: z.record(z.unknown()).optional(),
		/** Presentation hints (interface, separators…). Kept open for now. */
	})
	.passthrough();

/**
 * One request_config item (a component may declare several, e.g. a main one
 * plus an auxiliary engine).
 */
export const requestConfigItemSchema = z
	.object({
		/** Resolution engine: 'dedalo' (default) or an external engine name. */
		api_engine: z.string().optional(),
		/** 'main' (default) or an auxiliary discriminator. */
		type: z.string().optional(),
		/** Target section(s) + fixed filters for the relation. */
		sqo: sqoSchema.optional(),
		show: requestConfigBlockSchema.optional(),
		search: requestConfigBlockSchema.optional(),
		choose: requestConfigBlockSchema.optional(),
		/** Server-resolved, never rendered. */
		hide: requestConfigBlockSchema.optional(),
		/** Engine-specific options for external engines. */
		api_config: z.unknown().optional(),
	})
	.passthrough();

export type RequestConfigItem = z.infer<typeof requestConfigItemSchema>;

/** The resolved request_config attached to a component context: always an array. */
export const requestConfigSchema = z.array(requestConfigItemSchema);
export type RequestConfig = z.infer<typeof requestConfigSchema>;

/** Models that MUST have explicit config (PHP trait.request_config_v5.php:87). */
export const EXPLICIT_CONFIG_REQUIRED_MODELS: readonly string[] = [
	'component_relation_parent',
	'component_relation_children',
];

/**
 * The explicit/implicit builder selection rule (PHP common::get_ar_request_config,
 * class.common.php:3502): explicit iff the ontology node's properties carry
 * `source.request_config` (any non-null value); everything else falls back to
 * the implicit ontology-graph walk. Data-driven — there is NO per-model
 * requirement.
 */
export function selectRequestConfigStrategy(properties: unknown): 'explicit' | 'implicit' {
	const requestConfig = (properties as { source?: { request_config?: unknown } } | null)?.source
		?.request_config;
	return requestConfig !== undefined && requestConfig !== null ? 'explicit' : 'implicit';
}
