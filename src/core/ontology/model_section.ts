/**
 * MODEL-SECTION resolver — the terms→model hop of the hierarchy registry.
 *
 * Every thesaurus hierarchy pairs TWO sections: the terms section (`es1`,
 * `fr1`, …) holding the vocabulary, and its MODEL section (`es2`, `fr2`, …)
 * holding the typologies those terms are classified by. The pairing is DATA,
 * not a string rule: a registry record declares both faces — `hierarchy53`
 * (target section, HIERARCHY_TARGET_SECTION) and `hierarchy58` (target model
 * section, HIERARCHY_TARGET_SECTION_MODEL). Live counter-example that kills
 * any prefix heuristic: registry row 250 pairs `mht72 → ww2` (tld+'2' would
 * say `mht2`, a diffusion_element).
 *
 * PHP oracle: v6 class.component_relation_model.php:115-177 (registry
 * `hierarchy53 == ownerSectionTipo → hierarchy58`, falling back to
 * `tld(owner)+'2'`) + hierarchy::get_hierarchy_section v6:679-713 (no
 * active-flag filter, first row wins). The FROZEN v7 PHP is broken here — its
 * registry branch calls the deleted `get_valor()` and silently degrades to the
 * fallback — so v6 is the oracle of record for this rule (plan
 * `the-component-relation-model-hierarchy27`; wire-contract entries cover the
 * three deliberate divergences).
 *
 * The VALIDATE step is the correction PHP lacks: every candidate — registry
 * answer AND fallback — must resolve to ontology model 'section', or it is
 * refused instead of forwarded to a search over a nonexistent table. Live
 * refusals: `mht160 → mht2` (diffusion_element), `hierarchy20 → hierarchy2`
 * (component_number), `ich145 → ich2` (section_group).
 *
 * TWO registries, derived — never hard-coded: the family is every section
 * whose real tipo (getSectionRealTipo) is `hierarchy1` — `hierarchy1` itself
 * plus its virtual sections (`ontology35` today), each queried on its OWN
 * matrix table (getMatrixTableFromTipo: matrix_hierarchy_main /
 * matrix_ontology_main). A third registry section added later is picked up
 * with no code edit. The two hard-coded halves the engine already reads
 * (request_config/explicit.ts resolveHierarchySectionsFromTypes /
 * resolveOntologySections) are WHERE-clause variants of the same registry
 * read; this module is the one home for the terms→model column of it.
 *
 * Consumer: the `section_model` sqo source
 * (relations/request_config/target_sources.ts), which is the declared default
 * of component_relation_model — the "Tipología" select on every hierarchy
 * terms section (hierarchy27 in es1 → options from es2).
 */

import { sql } from '../db/postgres.ts';
import { getSectionRealTipo } from '../resolve/security_access_datalist.ts';
// Event channel, not a relations/ module — the sanctioned pattern for a cache
// that is BOTH ontology- and data-derived (cache_factory.ts header; same wiring
// as relations/datalist.ts and request_config/explicit.ts).
import { registerSectionDataListener } from '../section_record/save_event.ts';
import { createOntologyCache } from './cache_factory.ts';
import { registerOntologyCacheClearer } from './cache_invalidation.ts';
import {
	HIERARCHY_MAIN_SECTION,
	HIERARCHY_TARGET_SECTION,
	HIERARCHY_TARGET_SECTION_MODEL,
} from './ontology_tipos.ts';
import { getMatrixTableFromTipo, getModelByTipo } from './resolver.ts';
import { getTldFromTipo } from './tld.ts';

/** One registry-family section and the matrix table its records live in. */
export interface ModelSectionRegistryEntry {
	/** The registry section tipo: HIERARCHY_MAIN_SECTION or a virtual section of it. */
	sectionTipo: string;
	/** Its resolved matrix table (INJ-02 identifier-guarded by getMatrixTableFromTipo). */
	table: string;
}

/** The winning registry row for one terms tipo (hierarchy53 → hierarchy58). */
interface RegistryPairing {
	/** The row's hierarchy58 value — the declared model section; null when the
	 * row carries none (live: mht134, mht140 → fall through to the fallback). */
	modelSectionTipo: string | null;
	/** Which registry section the winning row lives in (refusal diagnostics). */
	registrySectionTipo: string;
}

/** Cache: the derived registry family (single key; ontology-derived). */
const registryFamilyCache = createOntologyCache<'family', ModelSectionRegistryEntry[]>();

/** Cache: the whole hierarchy53 → hierarchy58 pairing map (single key). Shape
 * from the ontology (which sections form the family, which tables), values
 * from registry RECORD data — so it is cleared on BOTH axes: the hub below,
 * and the save-event listener for registry-record writes. ONE whole-map load
 * (~470 rows on this install) instead of a per-lookup query. */
const registryPairingCache = createOntologyCache<'pairings', Map<string, RegistryPairing>>();

/**
 * Bumped by EVERY pairing-cache invalidation. A build that started before the
 * bump refuses to install its now-stale snapshot — see the race note in
 * getRegistryPairings. A plain counter is enough: this is single-threaded
 * per process and only ever compared for equality.
 */
let pairingEpoch = 0;

/**
 * Callbacks to run whenever the registry pairing map changes — the inversion
 * that lets HIGHER layers drop what they derived from a pairing without this
 * module importing them (same shape as ontology/cache_invalidation.ts).
 *
 * The live subscriber is relations/datalist.ts: an option list built from a
 * pairing is indexed by its TARGET section, so a write to the REGISTRY section
 * that produced it matches no index key and would otherwise never be evicted.
 */
type PairingChangeListener = () => void;
const pairingChangeListeners = new Set<PairingChangeListener>();

/** Subscribe to pairing-map invalidation. Registration only — never unregistered. */
export function registerPairingChangeListener(listener: PairingChangeListener): void {
	pairingChangeListeners.add(listener);
}

/** Drop both model-section caches (hub/event invalidation + the gates). */
export function clearModelSectionCaches(): void {
	registryFamilyCache.clear();
	registryPairingCache.clear();
	pairingEpoch++;
	for (const listener of pairingChangeListeners) {
		try {
			listener();
		} catch (error) {
			// A subscriber's own cache failing to clear must never break the
			// write that triggered it — reported, never swallowed silently
			// (CONVENTIONS §1). Degraded: that subscriber keeps a stale entry
			// until its next own invalidation.
			console.error('[ontology/model_section] pairing-change listener failed:', error);
		}
	}
}
// Named-clearer redundancy is deliberate (cache_factory.ts header): the
// factory registration underneath is the structural guarantee, this is the
// module's public invalidation API and the hub-completion gate's anchor.
registerOntologyCacheClearer(clearModelSectionCaches);

// Data-derived half: a write/delete of a record in ANY registry-family
// section (hierarchy1 AND ontology35 — new hierarchy, retargeted pairing)
// rebuilds the pairing map. ONE listener consulting the derived family
// instead of one registration per section: the family itself is dynamic
// (an ontology write may add a registry section) and the listener channel
// has no unregister. Family not cached ⇒ the pairing map was never built
// this epoch (its build derives the family first) ⇒ clearing is a free
// no-op that keeps correctness independent of that reasoning.
registerSectionDataListener((sectionTipo) => {
	const family = registryFamilyCache.get('family');
	if (family === undefined || family.some((entry) => entry.sectionTipo === sectionTipo)) {
		clearModelSectionCaches();
	}
});

/**
 * The REGISTRY FAMILY, derived from dd_ontology: every section whose real
 * tipo is HIERARCHY_MAIN_SECTION — `hierarchy1` itself plus its virtual
 * sections (a virtual section's `relations` name a node whose model is
 * 'section'; see getSectionRealTipo). Candidates come from a relations
 * containment probe, then each is confirmed the strict way: its OWN runtime
 * model must be 'section' (the probe also matches non-section relatives —
 * live: `hierarchy79`, a 'table' node; `dd1194`, a table_alias) and its real
 * tipo must be `hierarchy1` (not merely "relates to it somewhere").
 * Exported for the model_section_native gate, which asserts the family is
 * derived — adding a third registry section must not need a code edit.
 */
/**
 * One family member, or NULL when the tipo is not a usable registry section.
 * `hierarchy1` itself is taken on trust (it IS the family root); every other
 * candidate must really be a section whose real tipo is `hierarchy1` — the
 * `relations` probe alone would also match a `table`/`table_alias` node
 * (live: `hierarchy79`, `dd1194`).
 */
async function registryEntryFor(tipo: string): Promise<ModelSectionRegistryEntry | null> {
	if (tipo !== HIERARCHY_MAIN_SECTION) {
		if ((await getModelByTipo(tipo)) !== 'section') return null;
		if ((await getSectionRealTipo(tipo)) !== HIERARCHY_MAIN_SECTION) return null;
	}
	const table = await getMatrixTableFromTipo(tipo);
	if (table !== null) return { sectionTipo: tipo, table };
	// Impossible for a confirmed section (they default to 'matrix'), but a null
	// table cannot be queried — degraded: this registry half is skipped, the tld
	// fallback still runs for every caller.
	console.warn(
		`[ontology/model_section] registry section '${tipo}' resolves no matrix table — skipped`,
	);
	return null;
}

export async function getModelSectionRegistryFamily(): Promise<ModelSectionRegistryEntry[]> {
	const cached = registryFamilyCache.get('family');
	if (cached !== undefined) return cached;
	const rows = (await sql.unsafe(
		`SELECT tipo FROM dd_ontology
		 WHERE jsonb_typeof(relations) = 'array'
		   AND relations @> $1::text::jsonb
		 ORDER BY tipo`,
		[JSON.stringify([{ tipo: HIERARCHY_MAIN_SECTION }])],
	)) as { tipo: string }[];
	const candidates = rows.map((row) => row.tipo).filter((tipo) => tipo !== HIERARCHY_MAIN_SECTION);
	const family: ModelSectionRegistryEntry[] = [];
	// hierarchy1 first, virtual sections in tipo order — the precedence order
	// for duplicate hierarchy53 keys across registries (none exist today).
	for (const tipo of [HIERARCHY_MAIN_SECTION, ...candidates]) {
		const entry = await registryEntryFor(tipo);
		if (entry !== null) family.push(entry);
	}
	registryFamilyCache.set('family', family);
	return family;
}

/**
 * The whole registry pairing map: hierarchy53 value → its row's hierarchy58
 * value, loaded from every registry-family table. EXACT key equality only —
 * never LIKE/substring: live tipo collisions make substring semantics wrong
 * (verified live: `ich1` ⊂ `ich145`, `hierarchy1` ⊂ `hierarchy13`, `rsc2` ⊂
 * `rsc202`). Duplicate hierarchy53 → ORDER BY section_id within a registry,
 * family order across them, first wins (PHP reset(); hierarchy53 is unique
 * across all rows on this install — hierarchy_state's `targets` check is what
 * would surface a duplicate). Rows without a hierarchy53 are unaddressable
 * and skipped.
 */
async function getRegistryPairings(): Promise<Map<string, RegistryPairing>> {
	const cached = registryPairingCache.get('pairings');
	if (cached !== undefined) return cached;

	// POPULATE/INVALIDATE RACE. The map is built across several awaits (one
	// SELECT per registry table). A registry write committing mid-build fires
	// the eviction listener against a cache that is still EMPTY, and a naive
	// `set()` afterwards would install the pre-write snapshot with no remaining
	// trigger to correct it — stale until an unrelated invalidation. The epoch
	// counter closes it: the listener bumps it, and a build whose epoch moved
	// returns its (now known-stale) result to THIS caller without caching it.
	const epochAtStart = pairingEpoch;
	const pairings = new Map<string, RegistryPairing>();
	for (const registry of await getModelSectionRegistryFamily()) {
		for (const row of await readRegistryRows(registry)) {
			addPairing(pairings, row, registry.sectionTipo);
		}
	}
	if (pairingEpoch === epochAtStart) registryPairingCache.set('pairings', pairings);
	return pairings;
}

/** One registry table's raw (hierarchy53, hierarchy58) rows, section_id-ordered. */
async function readRegistryRows(
	registry: ModelSectionRegistryEntry,
): Promise<{ terms_tipo: string | null; model_tipo: string | null }[]> {
	// Stored shape: [{id:1, lang:'lg-nolan', value:'es2'}], living in either the
	// `data` or the `string` column depending on the writing engine's era — same
	// COALESCE idiom as request_config/explicit.ts:295. The table identifier is
	// interpolated (INJ-02-guarded upstream); the section tipo binds.
	return (await sql.unsafe(
		`SELECT COALESCE(data->'${HIERARCHY_TARGET_SECTION}', string->'${HIERARCHY_TARGET_SECTION}')->0->>'value' AS terms_tipo,
		        COALESCE(data->'${HIERARCHY_TARGET_SECTION_MODEL}', string->'${HIERARCHY_TARGET_SECTION_MODEL}')->0->>'value' AS model_tipo
		 FROM "${registry.table}"
		 WHERE section_tipo = $1
		 ORDER BY section_id`,
		[registry.sectionTipo],
	)) as { terms_tipo: string | null; model_tipo: string | null }[];
}

/** Index one registry row by its hierarchy53. Rows without one are unaddressable. */
function addPairing(
	pairings: Map<string, RegistryPairing>,
	row: { terms_tipo: string | null; model_tipo: string | null },
	registrySectionTipo: string,
): void {
	const termsTipo = row.terms_tipo;
	if (typeof termsTipo !== 'string' || termsTipo === '') return;
	if (pairings.has(termsTipo)) return; // first wins (PHP reset())
	const modelTipo = row.model_tipo;
	pairings.set(termsTipo, {
		modelSectionTipo: typeof modelTipo === 'string' && modelTipo !== '' ? modelTipo : null,
		registrySectionTipo,
	});
}

/**
 * The MODEL section a component_relation_model on `sectionTipo` targets —
 * `[]` (degraded, reported) or exactly one tipo. Candidates in order, first
 * one that VALIDATES wins; a failing candidate does not stop the walk:
 *
 *   a. registry: the row whose hierarchy53 EXACTLY equals sectionTipo → its
 *      hierarchy58 (v6 class.component_relation_model.php:115-177);
 *   b. tld(sectionTipo) + '2' (the PHP fallback — load-bearing: 30 of the 57
 *      hosting sections on the reference install have no registry answer).
 *
 * VALIDATE = getModelByTipo(candidate) === 'section'. Additionally a
 * hierarchy58 equal to its own row's hierarchy53 is refused (the
 * terms-section guard): correct code cannot produce it — the registry yields
 * hierarchy58, the fallback yields `<tld>2` — but corrupt data can, and
 * landing on a terms section would enumerate its records (es1 = 69,148) into
 * a datalist. A model section targeting ITSELF via the fallback (`es2 → es2`)
 * is fine and PHP-identical — model typologies are typed by their own
 * section's 10-record list.
 *
 * Worked examples (reference install): `es1 → (a) es2` · `actv1 → (a) miss,
 * (b) actv2` · `mht160 → (a) mht2 ✗ diffusion_element, (b) mht2 ✗ → []` ·
 * `hierarchy20 → (b) hierarchy2 ✗ component_number → []`.
 *
 * Refusal here, not in a consumer: structure_context emits `target_sections`
 * unfiltered to the client, and on the write path import_conform's SAFE_TIPO
 * regex is the only later guard — the resolver is the one correct choke.
 */
/** One candidate model section + where it came from (for the refusal line). */
interface ModelSectionCandidate {
	tipo: string;
	/** Human origin: the registry section that paired it, or the tld rule. */
	origin: string;
}

/**
 * The ordered candidates for a caller section: the registry pairing first
 * (authoritative), then the `<tld>2` naming rule (load-bearing — 30 of the 57
 * hosting sections on the reference install have no registry answer).
 */
async function modelSectionCandidates(sectionTipo: string): Promise<ModelSectionCandidate[]> {
	const candidates: ModelSectionCandidate[] = [];
	const pairing = (await getRegistryPairings()).get(sectionTipo);
	if (pairing?.modelSectionTipo != null) {
		candidates.push({
			tipo: pairing.modelSectionTipo,
			origin: `registry ${pairing.registrySectionTipo}`,
		});
	}
	const tld = getTldFromTipo(sectionTipo);
	if (tld !== null) candidates.push({ tipo: `${tld}2`, origin: 'tld fallback' });
	return candidates;
}

/**
 * NULL when the candidate is a usable model section, else the reason it is
 * refused — phrased for the single warn line the caller emits.
 *
 * Two ways to fail: it does not name a SECTION (live: `hierarchy2` is a
 * component_number, `ich2` a section_group, `mht2` a diffusion_element — PHP
 * forwarded all three to a search over a table that does not exist), or it is
 * the caller's own terms section (a hierarchy58 equal to its row's hierarchy53).
 * Correct code cannot produce the second — the registry yields hierarchy58, the
 * fallback yields `<tld>2` — but corrupt data can, and landing on a terms
 * section would enumerate its records (es1 = 69,148) into a datalist. A MODEL
 * section resolving to itself via the fallback (`es2 → es2`) is a different
 * thing and stays allowed: PHP-identical, and its own 10-record list.
 */
async function refusalReason(
	candidate: ModelSectionCandidate,
	sectionTipo: string,
): Promise<string | null> {
	if (candidate.tipo === sectionTipo && candidate.origin.startsWith('registry')) {
		return `'${candidate.tipo}' (${candidate.origin}: hierarchy58 equals its own hierarchy53 — terms section refused)`;
	}
	const model = await getModelByTipo(candidate.tipo);
	if (model === 'section') return null;
	return `'${candidate.tipo}' (${candidate.origin}: model '${model}')`;
}

export async function getModelSectionForSection(sectionTipo: string): Promise<string[]> {
	if (typeof sectionTipo !== 'string' || sectionTipo === '') {
		// PHP v7 class.component_relation_model.php:132-141 guard: no caller
		// section, nothing resolvable.
		console.error(
			'[ontology/model_section] empty section tipo — no model section resolvable (PHP v7 :132-141 guard)',
		);
		return [];
	}
	/** Every rejected candidate with the model it resolved to — the ONE warn
	 * below names them all (CONVENTIONS §1: degraded, reported, defined). */
	const rejected: string[] = [];

	// Candidates in order, each VALIDATED before it is accepted; a rejected one
	// does not stop the walk. An absent hierarchy58 (live: mht134, mht140) is
	// not a candidate at all — it is registry data the hierarchy_state `targets`
	// check surfaces, so the registry step simply yields nothing.
	for (const candidate of await modelSectionCandidates(sectionTipo)) {
		const refusal = await refusalReason(candidate, sectionTipo);
		if (refusal === null) return [candidate.tipo];
		rejected.push(refusal);
	}

	console.warn(
		`[ontology/model_section] no model section for '${sectionTipo}' — rejected: ${
			rejected.length > 0 ? rejected.join(', ') : 'no candidates'
		} (degraded: empty target list)`,
	);
	return [];
}
