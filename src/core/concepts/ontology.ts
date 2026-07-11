/**
 * ONTOLOGY — the core of everything (spec §3.1).
 *
 * Every menu, area, section, component, tool, button and widget in Dédalo is
 * DEFINED BY an ontology node: a record with a `tipo` (e.g. 'dd207',
 * 'numisdata3'), a `model` (the behavior/class that resolves it), a `parent`
 * (structural position), and a `properties` JSON blob (per-node configuration,
 * including request_config for relation components). There are no bespoke
 * feature tables — capability = ontology definition + a model that knows how
 * to resolve it.
 *
 * In this rewrite the ontology is modeled as a READ-ONLY resolver/registry
 * over the same PostgreSQL database the PHP server maintains (plan risk A5.3:
 * ontology import/update stays PHP-owned for now — explicitly uncovered scope).
 *
 * PHP reference: matrix_ontology / matrix_ontology_main tables; v7 uses
 * `properties` (NEVER the legacy `propiedades`) and flat virtual-tree
 * resolution — no v6 nested maps.
 *
 * TODO(phase-1): flesh out the node accessor API against real ontology rows
 * (resolve model by tipo, children-of, tipo→matrix-table mapping) and add the
 * in-process cache with correct invalidation (spec §4).
 */

import { z } from 'zod';

/** Tipo strings are strictly `letters+digits` — this regex IS the §7.6 gate shape. */
export const TIPO_PATTERN = /^[a-z]+[0-9]+$/;

/** Language codes: 'lg-*' or the 'all' sentinel — §7.6 gate shape. */
export const LANG_PATTERN = /^(lg-[a-z0-9_]+|all)$/;

export const tipoSchema = z.string().regex(TIPO_PATTERN, 'invalid ontology tipo');
export type Tipo = z.infer<typeof tipoSchema>;

/**
 * Max tipo length (INJ-06): a well-shaped but absurdly long tipo ('oh'+100k
 * digits) passes the pattern and no real ontology tipo approaches this — bound it
 * to the SQL identifier ceiling so it can never be interpolated into a key/jsonpath.
 */
const MAX_TIPO_LENGTH = 64;

/** Validate an ontology tipo (used by the search identifier chokepoint, §7.6). */
export function isValidTipo(candidate: string): boolean {
	return (
		candidate.length >= 2 && candidate.length <= MAX_TIPO_LENGTH && TIPO_PATTERN.test(candidate)
	);
}

/** Validate a language code (used by the search identifier chokepoint, §7.6). */
export function isValidLang(candidate: string): boolean {
	return LANG_PATTERN.test(candidate);
}

/**
 * An ontology node as this server consumes it. Deliberately minimal for the
 * first milestone; grows with the resolver in Phase 1/2.
 */
export const ontologyNodeSchema = z
	.object({
		tipo: z.string(),
		/** Behavior/class name, e.g. 'component_input_text', 'section', 'area_thesaurus'. */
		model: z.string(),
		/** Parent tipo in the ontology tree. */
		parent: z.string().nullable().optional(),
		/** Per-node configuration JSON (request_config lives under properties.source). */
		properties: z.record(z.unknown()).nullable().optional(),
		/** Human labels by language. */
		label: z.union([z.string(), z.record(z.string())]).optional(),
		/** Whether component data is language-translatable. */
		translatable: z.boolean().optional(),
	})
	.passthrough();

export type OntologyNode = z.infer<typeof ontologyNodeSchema>;
