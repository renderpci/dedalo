/**
 * model_section — the terms→model hop of the hierarchy registry. TS-NATIVE
 * contract gate (plan `the-component-relation-model-hierarchy27`, gate #2).
 *
 * getModelSectionForSection is the ONE resolver behind the `section_model`
 * sqo source (component_relation_model's declared default — the "Tipología"
 * select). PHP oracle: v6 class.component_relation_model.php:115-177 —
 * registry `hierarchy53 == ownerSectionTipo → hierarchy58`, falling back to
 * `tld(owner)+'2'`. What this gate pins, each as its own case:
 *
 *  1. REGISTRY BEATS THE STRING RULE. The pairing is DATA: a hierarchy1
 *     registry row may declare a hierarchy58 the tld fallback would never
 *     produce (live counter-example: row 250 pairs mht72 → ww2, not mht2).
 *     Every scratch pairing here targets a section OUTSIDE the caller's tld
 *     so a fallback answer cannot masquerade as a registry hit.
 *
 *  2. THE ONTOLOGY35 HALF EXISTS. ontology35 (a virtual section of
 *     hierarchy1 on its own table, matrix_ontology_main) carries the same
 *     registry components — and has ZERO live rows with hierarchy58 on the
 *     reference install, so this branch is exercised NOWHERE but here. A
 *     regression that dropped the second registry would stay green against
 *     live data forever; this scratch row is its only tripwire.
 *
 *  3. VALIDATE IS THE CORRECTION PHP LACKS. A candidate whose runtime model
 *     is not 'section' is refused (live: mht160 → mht2, a diffusion_element)
 *     — and refusal does NOT stop the walk: the tld fallback still runs.
 *     A hierarchy58 equal to its own row's hierarchy53 is refused even when
 *     it IS a valid section (the terms-section guard — landing on a terms
 *     section would enumerate es1's 69,148 records into a datalist).
 *
 *  4. THE FAMILY IS DERIVED, NOT A HARD-CODED PAIR. Every section whose
 *     getSectionRealTipo is hierarchy1 is a registry; a scratch THIRD
 *     registry section (dd_ontology only — no engine edit) must be consulted.
 *
 *  5. NOTHING VALID → [] (degraded, reported — CONVENTIONS §1), never a throw.
 *
 *  6. EVICTION. The pairing map is record-data; a write event on a registry
 *     section (fireSaveEvent → registerSectionDataListener fan-out, the
 *     S1-11 channel — hierarchy1 has NO case in the fireSaveEvent switch, so
 *     only the listener path can evict) must drop the cached answer.
 *
 * Scratch: the 'zzms*' tld family (no real Dédalo tld) + registry rows at
 * reserved-high section_ids, swept both ends (hierarchy_state_native
 * precedent). The refusal cases warn on purpose (degraded, reported) — those
 * console lines are the contract, not noise.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { sql } from '../../src/core/db/postgres.ts';
import { clearOntologyDerivedCaches } from '../../src/core/ontology/cache_invalidation.ts';
import {
	getModelSectionForSection,
	getModelSectionRegistryFamily,
} from '../../src/core/ontology/model_section.ts';
import { fireSaveEvent } from '../../src/core/section_record/save_event.ts';

const HIERARCHY_TABLE = 'matrix_hierarchy_main';
const ONTOLOGY_TABLE = 'matrix_ontology_main';
/** The scratch THIRD registry — a virtual section of hierarchy1 that exists
 * only in dd_ontology; its records land on hierarchy1's own table (the
 * virtual-section table fallback), exactly like ontology35 lands on its own. */
const THIRD_REGISTRY = 'zzreg9';
/** Reserved-high scratch ids (live max ~299/163; hierarchy_state uses 900010,
 * cache_lifecycle 900431 — this file owns 900861-900869). */
const IDS = {
	hit: 900861,
	nonSection: 900862,
	termsGuard: 900863,
	eviction: 900864,
	ontologyHit: 900865,
	thirdRegistry: 900866,
} as const;

/** One registry row: hierarchy53 (terms) → hierarchy58 (model), stored in the
 * `string` column exactly as the live rows are (the resolver COALESCEs
 * data→string; live registry data is string-era). */
async function seedRegistryRow(
	table: string,
	registrySectionTipo: string,
	sectionId: number,
	hierarchy53: string,
	hierarchy58: string,
): Promise<void> {
	await sql.unsafe(
		`INSERT INTO "${table}" (section_id, section_tipo, string)
		 VALUES ($1, $2, $3::text::jsonb)`,
		[
			sectionId,
			registrySectionTipo,
			JSON.stringify({
				hierarchy53: [{ id: 1, lang: 'lg-nolan', value: hierarchy53 }],
				hierarchy58: [{ id: 1, lang: 'lg-nolan', value: hierarchy58 }],
			}),
		],
	);
}

async function sweep(): Promise<void> {
	await sql.unsafe(`DELETE FROM dd_ontology WHERE tipo LIKE 'zzms%' OR tipo = $1`, [
		THIRD_REGISTRY,
	]);
	await sql.unsafe(
		`DELETE FROM "${HIERARCHY_TABLE}"
		 WHERE section_id BETWEEN 900861 AND 900869 AND section_tipo IN ('hierarchy1', $1)`,
		[THIRD_REGISTRY],
	);
	await sql.unsafe(
		`DELETE FROM "${ONTOLOGY_TABLE}"
		 WHERE section_id BETWEEN 900861 AND 900869 AND section_tipo = 'ontology35'`,
	);
	// Raw DML fires no save event — drop the ontology-derived caches (the hub
	// reaches clearModelSectionCaches via its registered clearer) so no other
	// file's warm family/pairing map leaks in, and ours does not leak out.
	await clearOntologyDerivedCaches();
}

beforeAll(async () => {
	await sweep();
	// The scratch ontology: model sections the candidates must VALIDATE
	// against, one non-section candidate, and the third registry section.
	// Every target lives OUTSIDE its caller's tld (zzmsa1 → zzmsb2, …) so a
	// registry answer is never reproducible by the tld fallback.
	await sql.unsafe(
		`INSERT INTO dd_ontology (tipo, model, tld, relations) VALUES
		 ('zzmsb2', 'section', 'zzmsb', NULL),
		 ('zzmsd2', 'section', 'zzmsd', NULL),
		 ('zzmse2', 'section', 'zzmse', NULL),
		 ('zzmsf2', 'section', 'zzmsf', NULL),
		 ('zzmsf9', 'component_number', 'zzmsf', NULL),
		 ('zzmsg1', 'section', 'zzmsg', NULL),
		 ('zzmsk2', 'section', 'zzmsk', NULL),
		 ('zzmsl2', 'section', 'zzmsl', NULL),
		 ($1, 'section', 'zzreg', '[{"tipo": "hierarchy1"}]'::jsonb)`,
		[THIRD_REGISTRY],
	);
	// hierarchy1 half.
	await seedRegistryRow(HIERARCHY_TABLE, 'hierarchy1', IDS.hit, 'zzmsa1', 'zzmsb2');
	await seedRegistryRow(HIERARCHY_TABLE, 'hierarchy1', IDS.nonSection, 'zzmsf1', 'zzmsf9');
	await seedRegistryRow(HIERARCHY_TABLE, 'hierarchy1', IDS.termsGuard, 'zzmsg1', 'zzmsg1');
	await seedRegistryRow(HIERARCHY_TABLE, 'hierarchy1', IDS.eviction, 'zzmsj1', 'zzmsk2');
	// ontology35 half — hierarchy53 is a `<tld>0` main ontology section, the
	// live convention on all 204 reference rows (none of which carry a
	// hierarchy58: this scratch row is the branch's ONLY exercise).
	await seedRegistryRow(ONTOLOGY_TABLE, 'ontology35', IDS.ontologyHit, 'zzmsc0', 'zzmsd2');
	// third-registry half — same table as hierarchy1 (virtual), own section_tipo.
	await seedRegistryRow(HIERARCHY_TABLE, THIRD_REGISTRY, IDS.thirdRegistry, 'zzmsi1', 'zzmsb2');
	await clearOntologyDerivedCaches();
});

afterAll(sweep);

describe('getModelSectionForSection — registry hits', () => {
	test('hierarchy1 registry row: hierarchy53 → hierarchy58 wins over the tld rule', async () => {
		// zzmsb2 is outside zzmsa's tld and zzmsa2 does not exist — only the
		// registry can produce this answer (the mht72 → ww2 shape).
		expect(await getModelSectionForSection('zzmsa1')).toEqual(['zzmsb2']);
	});

	test('ontology35 registry row: the passive-ontology half is READ, not assumed', async () => {
		// Zero live ontology35 rows carry a hierarchy58 — delete the second
		// registry from the resolver and ONLY this case reddens.
		expect(await getModelSectionForSection('zzmsc0')).toEqual(['zzmsd2']);
	});
});

describe('getModelSectionForSection — the tld fallback', () => {
	test('no registry row anywhere → tld(caller)+2, validated', async () => {
		// PHP's load-bearing fallback: 30 of the 57 hosting sections on the
		// reference install have no registry answer (actv1 → actv2).
		expect(await getModelSectionForSection('zzmse1')).toEqual(['zzmse2']);
	});
});

describe('getModelSectionForSection — VALIDATE refusals', () => {
	test('a registry candidate whose model is not section is refused — and the walk continues', async () => {
		// zzmsf9 is a component_number (the mht160 → mht2 diffusion_element
		// shape). PHP forwarded it to a search over a nonexistent table; TS
		// refuses it and still reaches the valid fallback — resolution
		// succeeds, so no warn here (the warn is the nothing-valid contract).
		const resolved = await getModelSectionForSection('zzmsf1');
		expect(resolved).toEqual(['zzmsf2']);
		expect(resolved).not.toContain('zzmsf9');
	});

	test('a hierarchy58 equal to its own hierarchy53 is refused even though it IS a section', async () => {
		// The terms-section guard: zzmsg1 passes getModelByTipo === 'section',
		// so only the guard stands between this row and a datalist that would
		// enumerate a whole terms section (es1 = 69,148 records). No zzmsg2
		// exists → nothing valid at all.
		expect(await getModelSectionForSection('zzmsg1')).toEqual([]);
	});

	test('nothing valid at all → [] and no throw (degraded, reported)', async () => {
		// No registry row, no zzmsh2 in the ontology (the hierarchy20 →
		// hierarchy2 shape) — one warn line, an empty list, no exception.
		expect(await getModelSectionForSection('zzmsh1')).toEqual([]);
	});

	test('empty section tipo → [] (the PHP v7 :132-141 guard)', async () => {
		expect(await getModelSectionForSection('')).toEqual([]);
	});
});

describe('getModelSectionRegistryFamily — the family is DERIVED', () => {
	test('hierarchy1 leads, ontology35 rides its own table, a scratch third registry joins with NO code edit', async () => {
		const family = await getModelSectionRegistryFamily();
		// hierarchy1 first — the documented precedence order for duplicate
		// hierarchy53 keys across registries.
		expect(family[0]).toEqual({ sectionTipo: 'hierarchy1', table: HIERARCHY_TABLE });
		expect(family).toContainEqual({ sectionTipo: 'ontology35', table: ONTOLOGY_TABLE });
		// The scratch registry exists ONLY in dd_ontology (model 'section',
		// relations → hierarchy1). A hard-coded {hierarchy1, ontology35} pair
		// reddens here; so would a family that skipped the virtual-section
		// table fallback (zzreg9's records live on hierarchy1's own table).
		expect(family).toContainEqual({ sectionTipo: THIRD_REGISTRY, table: HIERARCHY_TABLE });
	});

	test('a pairing row in the third registry resolves — the family is consulted, not just listed', async () => {
		// zzmsb2 is outside zzmsi's tld and no zzmsi2 exists: only the zzreg9
		// row can produce this answer.
		expect(await getModelSectionForSection('zzmsi1')).toEqual(['zzmsb2']);
	});
});

describe('cache invalidation — registry writes evict the pairing map', () => {
	test('a save event on a registry section drops the cached answer', async () => {
		// Warm the cache.
		expect(await getModelSectionForSection('zzmsj1')).toEqual(['zzmsk2']);
		// Retarget the registry row with raw DML — NO event yet: the stale
		// answer must still be served, proving the map is actually cached
		// (otherwise the eviction assertion below could never bite).
		await sql.unsafe(
			`UPDATE "${HIERARCHY_TABLE}"
			 SET string = jsonb_set(string, '{hierarchy58,0,value}', '"zzmsl2"')
			 WHERE section_tipo = 'hierarchy1' AND section_id = $1`,
			[IDS.eviction],
		);
		expect(await getModelSectionForSection('zzmsj1')).toEqual(['zzmsk2']);
		// The write chokepoint's event. hierarchy1 has no case in the
		// fireSaveEvent switch — only the registerSectionDataListener fan-out
		// (S1-11) can carry this eviction, which is exactly the seam under gate.
		await fireSaveEvent('hierarchy1');
		expect(await getModelSectionForSection('zzmsj1')).toEqual(['zzmsl2']);
	});
});
