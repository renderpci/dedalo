/**
 * Environmental seed for observer-family gates: the on1/58 anchor term, its
 * 8 → 2 → 1 ancestor chain, and — because hierarchy SECTION nodes are only
 * provisioned at hierarchy-activation — the minimal live-shape `on1` section
 * node in dd_ontology (relations → hierarchy20, the matrix_hierarchy table
 * node; without it the on1 table resolution returns null and every observer
 * recompute silently no-ops).
 *
 * The SUITE database carries none of this; a restored live snapshot carries
 * all of it and is left untouched (both seeds are presence-guarded). Callers
 * hold the returned handle and pass it to sweepTermChain in afterAll.
 */

import { sql } from '../../src/core/db/postgres.ts';

export const SEED_TERM = { section_tipo: 'on1', section_id: 58 };

/** 58 → 8 → 2 → 1 (closest-first — the relation_search golden derives from it). */
export const SEED_TERM_CHAIN: [number, number | null][] = [
	[58, 8],
	[8, 2],
	[2, 1],
	[1, null],
];

export interface TermSeedHandle {
	seededChain: boolean;
	seededSectionNode: boolean;
}

export async function seedTermChainIfAbsent(): Promise<TermSeedHandle> {
	const handle: TermSeedHandle = { seededChain: false, seededSectionNode: false };
	const present = (await sql.unsafe(
		'SELECT 1 FROM matrix_hierarchy WHERE section_tipo = $1 AND section_id = $2',
		[SEED_TERM.section_tipo, SEED_TERM.section_id],
	)) as unknown[];
	if (present.length > 0) return handle;
	handle.seededChain = true;

	const nodePresent = (await sql.unsafe('SELECT 1 FROM dd_ontology WHERE tipo = $1', [
		SEED_TERM.section_tipo,
	])) as unknown[];
	if (nodePresent.length === 0) {
		handle.seededSectionNode = true;
		await sql.unsafe(
			`INSERT INTO dd_ontology (id, tipo, parent, model, tld, relations)
			 VALUES ((SELECT COALESCE(MAX(id), 0) + 1100 FROM dd_ontology), $1, 'hierarchy56', 'section', 'on', '[{"tipo": "hierarchy20"}]'::jsonb)`,
			[SEED_TERM.section_tipo],
		);
		// Drop derived caches in case an earlier test file already resolved
		// 'on1' to null (table/node caches are per-process).
		const { clearOntologyDerivedCaches } = await import(
			'../../src/core/ontology/cache_invalidation.ts'
		);
		await clearOntologyDerivedCaches();
	}

	// Parent locators live under the section's thesaurus parent component
	// (section_map scope; hierarchy36 is the family default — dd_info.ts).
	const { getSectionMap } = await import('../../src/core/ontology/section_map.ts');
	const sectionMap = (await getSectionMap(SEED_TERM.section_tipo)) as {
		thesaurus?: { parent?: string };
	} | null;
	const parentTipo = sectionMap?.thesaurus?.parent ?? 'hierarchy36';
	for (const [id, parentId] of SEED_TERM_CHAIN) {
		const relation =
			parentId === null
				? {}
				: {
						[parentTipo]: [
							{
								type: 'dd47',
								section_id: String(parentId),
								section_tipo: SEED_TERM.section_tipo,
								from_component_tipo: parentTipo,
							},
						],
					};
		await sql.unsafe(
			'INSERT INTO matrix_hierarchy (section_id, section_tipo, relation) VALUES ($1, $2, $3::text::jsonb)',
			[id, SEED_TERM.section_tipo, JSON.stringify(relation)],
		);
	}
	return handle;
}

/**
 * Residue sweep (review 2026-08-02): a crashed observer-gate run can leave
 * scratch rsc205 referencers of the seed term behind (matrix rows whose
 * rsc387 slot targets on1/58); on the next run they inflate every recompute
 * of the term's mirror — the observed first-run flake signature. Callers may
 * ONLY invoke this after seedTermChainIfAbsent returned seededChain=true:
 * planted ⇒ suite DB ⇒ any rsc205 row referencing on1/58 is scratch by
 * construction (on a live snapshot such rows are REAL records).
 */
export async function sweepSeedTermReferencerResidue(): Promise<void> {
	const residue = (await sql.unsafe(
		`SELECT section_id FROM matrix WHERE section_tipo = 'rsc205' AND relation @> $1::text::jsonb`,
		[
			JSON.stringify({
				rsc387: [
					{ section_tipo: SEED_TERM.section_tipo, section_id: String(SEED_TERM.section_id) },
				],
			}),
		],
	)) as { section_id: number }[];
	for (const row of residue) {
		await sql.unsafe(`DELETE FROM matrix WHERE section_tipo = 'rsc205' AND section_id = $1`, [
			row.section_id,
		]);
		await sql.unsafe(
			`DELETE FROM matrix_time_machine WHERE section_tipo = 'rsc205' AND section_id = $1`,
			[row.section_id],
		);
	}
}

export async function sweepTermChain(handle: TermSeedHandle): Promise<void> {
	if (handle.seededChain) {
		// int[] binds go through a text CSV (a raw JS array mis-encodes at the
		// Bun.sql wire layer — the sweep then throws and the seed LEAKS, turning
		// both observer gates permanently red; found by review 2026-07-24).
		const ids = SEED_TERM_CHAIN.map(([id]) => id).join(',');
		await sql.unsafe(
			`DELETE FROM matrix_hierarchy WHERE section_tipo = $1 AND section_id = ANY(string_to_array($2, ',')::int[])`,
			[SEED_TERM.section_tipo, ids],
		);
		await sql.unsafe(
			`DELETE FROM matrix_time_machine WHERE section_tipo = $1 AND section_id = ANY(string_to_array($2, ',')::int[])`,
			[SEED_TERM.section_tipo, ids],
		);
	}
	if (handle.seededSectionNode) {
		await sql.unsafe(`DELETE FROM dd_ontology WHERE tipo = $1 AND model = 'section'`, [
			SEED_TERM.section_tipo,
		]);
		const { clearOntologyDerivedCaches } = await import(
			'../../src/core/ontology/cache_invalidation.ts'
		);
		await clearOntologyDerivedCaches();
	}
}
