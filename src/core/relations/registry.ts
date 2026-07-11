/**
 * RELATION MODEL REGISTRY — the per-model dispatch of the relation family
 * (RELATIONS_SPEC.md §2: one shared relation core, per-model particularities).
 *
 * Every relation component, whatever its model, does the same thing: declare
 * target section(s) + a request_config in the ontology, resolve data from the
 * target(s), and represent part of it inside the main section. This registry
 * maps each CANONICAL model name (post ontology alias map — see
 * ontology/resolver.ts MODEL_REPLACEMENT_MAP: component_autocomplete(_hi) →
 * component_portal etc.) to the resolver implementing its particularity.
 *
 * Dispatch contract:
 * - the generic emission path (section/read.ts emitDdoData) routes every
 *   ddo whose model stores in the 'relation' matrix column here;
 * - registrations are EXPLICIT (no reflection); an unregistered relation
 *   model throws loudly — ledger discipline, never silently narrowed;
 * - resolvers receive the emit callback (`emitDdo`) instead of importing the
 *   generic path, so relations/ never imports section/read.ts (no cycle).
 *
 * Phase A of the relations rebuild implements `emitDdoItems` (the list/edit/tm
 * row emission). Later phases extend the resolver surface per
 * RELATIONS_SPEC.md: request_config consolidation (B), dataframe saves (C),
 * inverse/indexation semantics (D), per-model search fragments (E).
 */

import { getComponentModel } from '../components/registry.ts';
import type { RelationResolverId } from '../components/types.ts';
import type { Ddo } from '../concepts/ddo.ts';
import type { MatrixRecord } from '../db/matrix.ts';
import type { DataItem, EmissionContext, SectionsEnvelope } from '../resolve/component_data.ts';
import { filterResolver, portalResolver } from './models/portal.ts';
import { relationChildrenResolver } from './models/relation_children.ts';
import { relationIndexResolver } from './models/relation_index.ts';
import { relationRelatedResolver } from './models/relation_related.ts';
import { selectFamilyResolver } from './models/select_family.ts';

/** The response data array emitters append DataItems to (envelope at [0] on section reads). */
export type ResponseData = (SectionsEnvelope | DataItem)[];

/**
 * The generic per-ddo emission path (section/read.ts emitDdoData),
 * passed INTO resolvers so child expansion can recurse through the full
 * model-family logic (relations, media, literals) without an import cycle.
 */
export type EmitDdoFn = (
	ddo: Ddo,
	ddoMap: Ddo[],
	record: MatrixRecord,
	row: { section_tipo: string; section_id: number },
	defaultMode: string,
	defaultLang: string,
	callerTipo: string,
	emission: EmissionContext,
	allowOwnConfigChildren?: boolean,
	depth?: number,
) => Promise<void>;

/** Everything a relation resolver needs to emit one ddo's item(s) for one record. */
export interface RelationEmitContext {
	/** The ddo being resolved. */
	ddo: Ddo;
	/** The full ddo map the ddo came from (descendants resolve by parent chain). */
	ddoMap: Ddo[];
	/** The host record the relation data is stored on. */
	record: MatrixRecord;
	/** The host row identity (outer record). */
	row: { section_tipo: string; section_id: number };
	/** Canonical model of the ddo (post alias map). */
	model: string;
	/**
	 * The tipo whose JSONB column slot holds the ddo's DATA (WC-020): the
	 * component_alias TARGET for aliases, ddo.tipo otherwise. Resolvers that
	 * read `record.columns[...][tipo]` MUST key by this, never by ddo.tipo.
	 */
	dataTipo: string;
	/** Effective mode of THIS ddo (ddo.mode ?? the request default). */
	ddoMode: string;
	/** Instance lang of THIS ddo (nolan-forced for non-translatables). */
	ddoLang: string;
	/** The request-level default mode. */
	defaultMode: string;
	/** The request-level default lang (translatable children resolve in it). */
	defaultLang: string;
	/** The calling element (section or component) — parent_tipo stamp. */
	callerTipo: string;
	/** The per-read emission context: items array + stamp ledger (S2-29). */
	emission: EmissionContext;
	/** May list/tm cells fall back to the component's OWN config children. */
	allowOwnConfigChildren: boolean;
	/** Nesting depth (cycle guard for list-cell recursion). */
	depth: number;
	/** The generic emission path for child recursion. */
	emitDdo: EmitDdoFn;
}

/**
 * One relation model's particularity. Phase A surface: row emission. The
 * resolver decides internally per mode (e.g. the select family only diverges
 * from the portal path in list/edit modes — exactly like the PHP controllers).
 */
export interface RelationModelResolver {
	/** Canonical model name(s) this resolver serves (registration is explicit below). */
	readonly model: string;
	/** Resolve one ddo against one record and push its data item(s). */
	emitDdoItems(context: RelationEmitContext): Promise<void>;
}

/**
 * Resolver-ID → implementation (S2-20). Descriptors name their resolver as
 * DATA (`resolveData: 'portal'` — see components/types.ts RelationResolverId);
 * THIS map is the only place the binding becomes behavior. The static imports
 * are safe here: the relation model modules never import this registry (the
 * emit callback is passed in), so no cycle — whereas the old descriptor→model
 * imports fused the 33-file SCC.
 */
const RESOLVER_IMPLEMENTATIONS: Readonly<Record<RelationResolverId, RelationModelResolver>> = {
	portal: portalResolver,
	filter: filterResolver,
	select_family: selectFamilyResolver,
	relation_children: relationChildrenResolver,
	relation_index: relationIndexResolver,
	relation_related: relationRelatedResolver,
};

/**
 * Resolve the registered resolver for a canonical relation model. The per-model
 * binding lives in the component registry as a resolver ID (each relation
 * descriptor's `resolveData`, e.g. components/component_portal/descriptor.ts);
 * the implementation lives in RESOLVER_IMPLEMENTATIONS above. Throws on a model
 * with no resolver — an unmapped relation model is a coverage gap that must be
 * ledgered, never silently portal-shaped.
 */
export function getRelationResolver(model: string): RelationModelResolver {
	const resolverId = getComponentModel(model)?.resolveData;
	if (resolverId === undefined) {
		throw new Error(
			`getRelationResolver: relation model '${model}' has no registered resolver (uncovered scope)`,
		);
	}
	return RESOLVER_IMPLEMENTATIONS[resolverId];
}

// ---------------------------------------------------------------------------
// SEARCH face of the registry (RELATIONS_SPEC.md Phase E): which SQO fragment
// builder serves each relation model. The default is the shared containment
// builder (search/builders/builder_relation.ts — incl. its matrix_time_machine
// scalar twin); models with a DEDICATED PHP pipeline dispatch to their own
// builder (ported 2026-07-10):
// - component_relation_children → builder_relation_children.ts (the
//   inverse-parent (NOT) EXISTS pipeline over the CHILD rows' relation
//   columns, trait.search_component_relation_children.php);
// - component_relation_index → builder_relation_index.ts (computed-inverse
//   `section_id IN (…)` over the dd96 reference scan);
// - component_external stays `search: { status: 'unported' }` and THROWS —
//   that IS the faithful port: PHP has no trait and fatals on any external
//   search (component_common::get_search_query → undefined
//   resolve_query_object_sql).
// The legacy component_autocomplete_hi ancestor wrap is deliberately NOT
// wired (PHP live defect — see builder_relation.ts module doc).
// ---------------------------------------------------------------------------

/** One relation model's SQO leaf → SQL fragment builder (sync or async). */
export type RelationSearchFragmentBuilder = (
	rawQ: unknown,
	qOperator: string | null,
	context: import('../search/builders/types.ts').BuilderContext,
) =>
	| import('../search/builders/types.ts').BuilderResult
	| Promise<import('../search/builders/types.ts').BuilderResult>;

/**
 * The fragment builder for a relation-column model. Models whose descriptor
 * marks search unported throw with their ledger reason; a model without a
 * registered resolver throws as uncovered scope; children/index dispatch to
 * their dedicated pipelines; everything else uses the shared relation
 * containment builder.
 */
export async function getRelationSearchFragmentBuilder(
	model: string,
): Promise<RelationSearchFragmentBuilder> {
	const descriptor = getComponentModel(model);
	if (descriptor?.search?.status === 'unported') {
		throw new Error(
			`search conform: builder for model '${model}' not implemented yet (${descriptor.search.reason})`,
		);
	}
	if (descriptor?.resolveData === undefined) {
		throw new Error(
			`search conform: relation model '${model}' has no registered resolver (uncovered scope)`,
		);
	}
	if (model === 'component_relation_children') {
		const { buildRelationChildrenFragment } = await import(
			'../search/builders/builder_relation_children.ts'
		);
		return buildRelationChildrenFragment;
	}
	if (model === 'component_relation_index') {
		const { buildRelationIndexFragment } = await import(
			'../search/builders/builder_relation_index.ts'
		);
		return buildRelationIndexFragment;
	}
	const { buildRelationFragment } = await import('../search/builders/builder_relation.ts');
	return buildRelationFragment;
}
