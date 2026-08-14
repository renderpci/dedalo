/**
 * TARGET-SOURCE REGISTRY — the id→implementation binding of the descriptor
 * facet `targetSource` (components/types.ts TargetSourceId).
 *
 * WHY IT EXISTS. A few component models point at a section that CANNOT be
 * written into their ontology node, because one node is reused by many caller
 * sections and the answer differs per caller: `hierarchy27` ("Tipología") is
 * the same node in `es1`, `fr1`, `mht72`, … and must target `es2`, `fr2`,
 * `ww2`. PHP solved it with a per-model class override that bypassed the sqo
 * entirely (v6 class.component_relation_model.php:115-177). Here the rule is
 * DECLARATIVE instead: the model names a source ID, this map turns the ID into
 * behavior, and relations/request_config/build.ts applies it at the single seam
 * where every consumer's config is built — so `if (model === '…')` never enters
 * the shared engine and the ontology can override the default by simply
 * declaring its own `sqo.section_tipo`.
 *
 * WHY IT IS NOT IN relations/registry.ts. That is the natural neighbour of
 * RESOLVER_IMPLEMENTATIONS, and it is the ONE forbidden home: the path
 * registry.ts → models/select_family.ts → datalist.ts → request_config/
 * explicit.ts is live, so a forward edge from request_config/ back into
 * registry.ts closes a 4-file SCC and reds import_scc_tripwire. This module
 * imports only components/ (the descriptor lookup) and ontology/ (the
 * resolvers) — neither reaches back into relations/ — which is the same
 * reasoning that makes components/emit_hooks.ts safe.
 *
 * The implementations themselves live in their subsystem home, never here:
 * 'section_model' is ontology/model_section.ts getModelSectionForSection.
 * Adding a source = add the ID in components/types.ts TargetSourceId + its
 * entry below (descriptor_completeness_tripwire pins the pairing), and give it
 * an sqo-source name in request_config/explicit.ts KNOWN_SQO_SOURCES so an
 * ontology node can request it explicitly too.
 */

import { getComponentModel } from '../../components/registry.ts';
import type { TargetSourceId } from '../../components/types.ts';
import { getModelSectionForSection } from '../../ontology/model_section.ts';

/**
 * Target-source ID → implementation: owner section tipo → the section tipos its
 * options come from. An implementation returns `[]` when it cannot resolve —
 * loudly, on its own side (CONVENTIONS §1: degraded, reported, defined) — never
 * a guessed tipo.
 */
export const TARGET_SOURCE_IMPLEMENTATIONS: Readonly<
	Record<TargetSourceId, (ownerSectionTipo: string) => Promise<string[]>>
> = {
	section_model: getModelSectionForSection,
};

/**
 * The target sections a MODEL defaults to for `ownerSectionTipo`, or NULL when
 * the model declares no `targetSource` (the common case — a component with no
 * declared default simply keeps whatever its node's sqo resolved).
 *
 * NULL AND `[]` ARE DIFFERENT ANSWERS, and the callers depend on it:
 * - `null` — "this model has no opinion": every existing target rule stands,
 *   including the implicit relations walk's pick and the caller-section
 *   fallback of an sqo that declares no section_tipo;
 * - `[]` — "this model OWNS the target and could not resolve one here": the
 *   honest answer is NO target. Falling back to another rule would resurrect
 *   exactly the plausible-but-wrong target this facet exists to remove (a
 *   config-less component_relation_model would take the walk's pick —
 *   hierarchy20, the 69,148-row thesaurus template). The implementation has
 *   already reported its own degradation (CONVENTIONS §1), so callers stay
 *   silent and simply carry no target.
 */
export async function resolveTargetSourceFor(
	model: string,
	ownerSectionTipo: string,
): Promise<string[] | null> {
	const sourceId = getComponentModel(model)?.targetSource;
	if (sourceId === undefined) return null;
	return await TARGET_SOURCE_IMPLEMENTATIONS[sourceId](ownerSectionTipo);
}
