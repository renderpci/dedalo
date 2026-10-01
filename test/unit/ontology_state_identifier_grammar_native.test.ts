/**
 * SURF-1 write (G5) — THE PARSER NEVER MINTS A NON-GRAMMAR REFERENCE.
 *
 * WHAT WAS WRONG. `dd_ontology` is a projection of the ontology source records
 * (`matrix_ontology`), derived by `parseSectionRecordToOntologyNode`. A node's
 * `parent` / `model_tipo` come from a LOCATOR: `getTermIdFromLocator` glues
 * `<tld of section_tipo>` + `section_id` and returns the result unchecked, so a
 * parent locator `{section_tipo:'zzgs0', section_id:'1 OR'}` parses into the
 * reference `'zzgs1 OR'` — and `rebuildOntology` writes it into dd_ontology,
 * where every tree walk, relation hop and model lookup reads it back as a tipo.
 * With the SURF-1 CHECK live, the same bad record makes the rebuild's upsert
 * fail and the WHOLE tld roll back: one defective record blocks every
 * ontology update of its tld.
 *
 * THE CONTRACT (CLOSURE_PLAN Step 4, SURF-1 write — W5/W6):
 *  - the parser's existing "unresolvable reference → null" rule covers a
 *    composed reference that fails `isValidTipo`: `parent` becomes null;
 *  - the defect is not dropped in silence: `OntologyState` carries
 *    `invalidReferenceNodes` + `invalidReferenceRecords` ({source, tipo, column,
 *    value}), a WARNING channel modelled on `tldlessRecords`, not a drift kind;
 *  - `rebuildOntology` keeps its meaning (`ok` = converged) and names the
 *    defect in `msg`; a tld is never refused because of one bad source record.
 *
 * THE SITUATION IS BUILT: scratch tld `zzgs`, six source records of section
 * `zzgs0` seeded directly (ontology7 = tld, ontology5 = term, ontology15 =
 * parent, ontology10 = connected-to, ontology6 = model, ontology18 =
 * properties): zzgs1 (valid), zzgs2 (parent zzgs1 — the control), zzgs3
 * (parent locator section_id '1 OR'), zzgs4 (connected to zzgs1 AND to
 * section_id '2 OR'), zzgs5 (properties.alias_of `zzgs1'||x`), zzgs6 (model
 * locator composing `zzgs123456` — tipo grammar, but longer than model_tipo's
 * varchar(8)). Every reference kind the parser projects carries one defect.
 * Everything `zzgs` is swept before and after (the ontology_state_native sweep).
 *
 * MUTATIONS (each must turn this gate red): remove the parser's reference check
 * (`projectReference`) → zzgs3 / zzgs6 carry the bad value (with the CHECK live
 * the rebuild rolls back); remove the relations skip → zzgs4 relations carry
 * `zzgs2 OR`; remove the alias_of drop → the alias_of CHECK rolls the rebuild
 * back; remove the grammar null in the exported `getTermIdFromLocator` (the
 * sync-order path's reader) → its pure leg; stop recording the defects or drop
 * the msg note → the report leg.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { deleteTldNodes } from '../../src/core/db/dd_ontology.ts';
import { sql } from '../../src/core/db/postgres.ts';
import { clearOntologyDerivedCaches } from '../../src/core/ontology/cache_invalidation.ts';
import {
	inspectOntology,
	type OntologyWriteResult,
	rebuildOntology,
} from '../../src/core/ontology/ontology_state.ts';
import { getTermIdFromLocator } from '../../src/core/ontology/parser.ts';
import { assertTestDatabase } from '../../src/core/test_data/test_database_marker.ts';
import { DB_READY } from '../helpers/db_ready.ts';

const TLD = 'zzgs';
const SECTION = `${TLD}0`;
const USER_ID = -1;
/** The locator section_id that composes into a non-grammar tipo. */
const BAD_SECTION_ID = '1 OR';

function locatorsOf(
	componentTipo: string,
	type: string,
	sectionIds: (number | string)[],
): Record<string, unknown> {
	return {
		[componentTipo]: sectionIds.map((sectionId, index) => ({
			id: index + 1,
			type,
			section_id: sectionId,
			section_tipo: SECTION,
			from_component_tipo: componentTipo,
		})),
	};
}

function parentLocator(sectionId: number | string): Record<string, unknown> {
	return locatorsOf('ontology15', 'dd47', [sectionId]);
}

/** The alias_of value planted on zzgs5 (breaks the tipo grammar). */
const BAD_ALIAS_OF = "zzgs1'||x";
/** zzgs6's model locator section_id: `zzgs123456` is a tipo, but longer than varchar(8). */
const LONG_MODEL_ID = 123456;

async function seedRecord(
	sectionId: number,
	term: string,
	relation: Record<string, unknown> | null,
	misc: Record<string, unknown> | null = null,
): Promise<void> {
	await sql.unsafe(
		`INSERT INTO matrix_ontology (section_id, section_tipo, string, relation, misc)
		 VALUES ($1, $2, $3::text::jsonb, $4::text::jsonb, $5::text::jsonb)`,
		[
			sectionId,
			SECTION,
			JSON.stringify({
				ontology7: [{ id: 1, lang: 'lg-spa', value: TLD }],
				ontology5: [{ id: 1, lang: 'lg-eng', value: term }],
			}),
			relation === null ? null : JSON.stringify(relation),
			misc === null ? null : JSON.stringify(misc),
		],
	);
}

async function sweep(): Promise<void> {
	await assertTestDatabase('ontology_state_identifier_grammar_native');
	await deleteTldNodes(TLD);
	await sql.unsafe('DELETE FROM matrix_ontology WHERE section_tipo = $1', [SECTION]);
	await sql.unsafe(
		`DELETE FROM matrix_ontology_main WHERE section_tipo = 'ontology35' AND string @> $1::text::jsonb`,
		[JSON.stringify({ hierarchy6: [{ value: TLD }] })],
	);
	await clearOntologyDerivedCaches();
}

interface StoredReferences {
	relations: unknown;
	properties: unknown;
	model_tipo: string | null;
}

async function storedReferences(): Promise<Record<string, StoredReferences>> {
	const rows = (await sql.unsafe(
		`SELECT tipo, relations, properties, model_tipo FROM dd_ontology
		  WHERE tld = $1 AND tipo IN ('zzgs4', 'zzgs5', 'zzgs6') ORDER BY tipo`,
		[TLD],
	)) as ({ tipo: string } & StoredReferences)[];
	return Object.fromEntries(
		rows.map(({ tipo, relations, properties, model_tipo }) => [
			tipo,
			{ relations, properties, model_tipo },
		]),
	);
}

async function storedParents(): Promise<Record<string, string | null>> {
	const rows = (await sql.unsafe(
		'SELECT tipo, parent FROM dd_ontology WHERE tld = $1 AND tipo <> $2 ORDER BY tipo',
		[TLD, SECTION],
	)) as { tipo: string; parent: string | null }[];
	return Object.fromEntries(rows.map((row) => [row.tipo, row.parent]));
}

describe.if(DB_READY)('SURF-1 write — rebuild never projects a non-grammar reference (G5)', () => {
	let outcome: OntologyWriteResult;

	beforeAll(async () => {
		await sweep();
		await seedRecord(1, 'Valid root', null);
		await seedRecord(2, 'Valid child', parentLocator(1));
		await seedRecord(3, 'Child with a hostile parent locator', parentLocator(BAD_SECTION_ID));
		await seedRecord(
			4,
			'Connected to a good and a hostile node',
			locatorsOf('ontology10', 'dd151', [1, '2 OR']),
		);
		await seedRecord(5, 'Alias with a hostile alias_of', null, {
			ontology18: [{ id: 1, value: { alias_of: BAD_ALIAS_OF, keep: 1 } }],
		});
		await seedRecord(
			6,
			'Model reference longer than model_tipo',
			locatorsOf('ontology6', 'dd151', [LONG_MODEL_ID]),
		);
		await clearOntologyDerivedCaches();
		outcome = await rebuildOntology(TLD, USER_ID);
	});
	afterAll(async () => {
		await sweep();
		const left = (await sql.unsafe(
			'SELECT (SELECT count(*)::int FROM dd_ontology WHERE tld = $1) + (SELECT count(*)::int FROM matrix_ontology WHERE section_tipo = $2) AS n',
			[TLD, SECTION],
		)) as { n: number }[];
		expect(left[0]?.n).toBe(0);
	});

	test('the rebuild converges and writes all three nodes (one bad record never refuses the tld)', () => {
		expect(outcome.errors).toEqual([]);
		expect(outcome.ok).toBe(true);
		expect(outcome.state.matrixNodes).toBe(6);
	});

	test('the valid reference is kept; the non-grammar one is projected as NULL', async () => {
		const parents = await storedParents();
		expect(Object.keys(parents).length).toBe(6);
		expect(parents).toEqual({
			zzgs1: null,
			zzgs2: 'zzgs1',
			zzgs3: null,
			zzgs4: null,
			zzgs5: null,
			zzgs6: null,
		});
	});

	test('every OTHER reference kind: the valid part is kept, the defective part is dropped', async () => {
		expect(await storedReferences()).toEqual({
			zzgs4: { relations: [{ tipo: 'zzgs1' }], properties: null, model_tipo: null },
			zzgs5: { relations: null, properties: { keep: 1 }, model_tipo: null },
			zzgs6: { relations: null, properties: null, model_tipo: null },
		});
	});

	test('the defect is reported by its SOURCE record, on its own channel, and in msg', () => {
		const state = outcome.state as typeof outcome.state & {
			invalidReferenceNodes?: unknown;
			invalidReferenceRecords?: unknown;
		};
		expect(state.invalidReferenceNodes).toBe(4);
		const records = [
			...(state.invalidReferenceRecords as unknown as Record<string, unknown>[]),
		].sort((a, b) => String(a.source).localeCompare(String(b.source)));
		expect(records).toEqual([
			{ source: `${SECTION}/3`, tipo: 'zzgs3', column: 'parent', value: `zzgs${BAD_SECTION_ID}` },
			{ source: `${SECTION}/4`, tipo: 'zzgs4', column: 'relations', value: 'zzgs2 OR' },
			{ source: `${SECTION}/5`, tipo: 'zzgs5', column: 'alias_of', value: BAD_ALIAS_OF },
			{
				source: `${SECTION}/6`,
				tipo: 'zzgs6',
				column: 'model_tipo',
				value: `zzgs${LONG_MODEL_ID}`,
			},
		]);
		expect(outcome.msg).toContain(`${SECTION}/3`);
	});

	test('inspect afterwards is in sync — zzgs3 is not a phantom `missing` node', async () => {
		const state = await inspectOntology(TLD);
		expect(state.drift.filter((item) => /^zzgs[3-6]$/.test(item.tipo))).toEqual([]);
		expect(state.matrixNodes).toBeGreaterThan(2);
		expect(state.inSync).toBe(true);
	});
});

describe('SURF-1 write — getTermIdFromLocator answers only a tipo (G5, pure)', () => {
	// The exported reader (ontology_write.ts syncOrderToDdOntology keys its UPDATE by
	// it): a composed `<tld><section_id>` that is not a tipo is "unresolvable" → null.
	type LocatorArg = Parameters<typeof getTermIdFromLocator>[0];
	const at = (sectionId: unknown) =>
		getTermIdFromLocator({ section_tipo: SECTION, section_id: sectionId } as LocatorArg);

	test('a grammar section_id composes; a non-grammar one is null', async () => {
		expect(await at(1)).toBe('zzgs1');
		expect(await at('42')).toBe('zzgs42');
		expect(await at(BAD_SECTION_ID)).toBeNull();
		expect(await at('5a')).toBeNull();
		expect(await at("1'--")).toBeNull();
		expect(await at('')).toBeNull();
	});
});
