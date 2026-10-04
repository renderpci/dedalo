/**
 * SURF-1 write (G4) — THE DATABASE ITSELF REFUSES A NON-GRAMMAR IDENTIFIER, AND
 * AN INSTALL THAT ALREADY HOLDS ONE IS REPORTED AND REPAIRED, NEVER BRICKED.
 *
 * WHAT WAS WRONG. dd_ontology had no CHECK on its identifier columns: any
 * writer that reached the table — a raw restore, a hand SQL fix, a door that
 * forgot to validate — could land `tipo = "zz1'"`, and every reader downstream
 * trusted it as an identifier. A DB CHECK is the only guard no future door can
 * forget. But an INSTALLED database may already hold violating rows, and a
 * validating ADD CONSTRAINT would then fail the boot migration and brick the
 * update (owner decision 2026-09-30: NOT VALID + report + repair tool).
 *
 * THE CONTRACT (CLOSURE_PLAN Step 4, SURF-1 write — W8/W9):
 *  - migration `*_dd_ontology_identifier_grammar.sql` adds the six CHECKs
 *    NOT VALID, idempotently: it never fails on violating rows, never touches
 *    them, and binds every write from then on (a NOT VALID CHECK re-checks a
 *    legacy row when it is UPDATEd);
 *  - reconcile `ontology_identifiers` (src/core/ontology/identifier_grammar.ts,
 *    `ONTOLOGY_IDENTIFIERS_RECONCILE`): a DRY run reports `drift` = violating
 *    rows and `detail = {rows:[{id, tipo, violations, action}], constraints:
 *    {<name>: 'absent'|'not_valid'|'valid'}}` and writes nothing; APPLY
 *    re-derives each row whose tipo is valid under a safe tld through
 *    `rebuildOntology(tld, {reclaimIds})`, deletes the unaddressable remainder
 *    (returned whole in `detail.deleted`), then VALIDATEs each constraint whose
 *    column is clean;
 *  - `validateDdOntologyIdentifierConstraints()` (dd_ontology.ts) validates on
 *    clean data.
 *
 * THE SITUATION IS BUILT inside ONE transaction per leg that always ends in a
 * sentinel throw — the CHECKs are dropped there, violating rows planted raw
 * (the shape of a legacy install), source records of scratch tld `zzgmig`
 * seeded directly into matrix_ontology — so nothing survives the leg.
 *   r1 zzgmig1   valid tipo, bad parent; its source zzgmig0/1 is clean  → rebuild
 *   r2 ZZX1      bad tipo, bad tld                                       → delete
 *   r3 zzgmig9x  bad tipo under tld zzgmig                               → gone
 *   r4 zzgmig4   bad alias_of, no source record                          → rebuild (wiped)
 *   r5 zzgmig5   valid; source zzgmig0/5                                 → survives
 *   r6 zzgmig6   valid tipo filed under tld zzgmigq (tipo_in_tld)        → rebuild, id reclaimed
 *   r7 zzgmns1   valid tipo, bad parent, tld zzgmns has NO source record → delete (a rebuild
 *                would re-derive nothing and register a junk tld)
 *
 * MUTATIONS (each must turn this gate red): a VALIDATED constraint (no
 * NOT VALID) in the migration → the migration fails on r1–r6; remove a repair
 * class → violations remain and no VALIDATE runs; remove the report → red;
 * rebuild a tld with no source records (drop the `tldHasSourceRecords` test)
 * → r7 planned `rebuild`; run the deletes AFTER the rebuild → r3 is wiped by
 * the tld rebuild unrecorded, missing from `detail.deleted`; log identifiers
 * only → the whole-row log assertion; let a failing final VALIDATE throw →
 * `run()` throws and `detail.deleted` is lost; VALIDATE a constraint whose rule still has violators
 * → `validateDdOntologyIdentifierConstraints` throws instead of reporting it
 * `blocked`.
 */

import { describe, expect, spyOn, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as ddOntology from '../../src/core/db/dd_ontology.ts';
import { sql, sqlStateOf, withTransaction } from '../../src/core/db/postgres.ts';
import { clearAliasCaches } from '../../src/core/ontology/alias.ts';
import { clearOntologyDerivedCaches } from '../../src/core/ontology/cache_invalidation.ts';
import type { ReconcileDefinition } from '../../src/core/reconcile/registry.ts';
import { assertTestDatabase } from '../../src/core/test_data/test_database_marker.ts';
import { DB_READY } from '../helpers/db_ready.ts';
import { MIGRATIONS_DIR, migrationFileNames } from '../helpers/migrations_corpus.ts';

const TLD = 'zzgmig';
const SOURCE_SECTION = `${TLD}0`;
const MIGRATION_SUFFIX = '_dd_ontology_identifier_grammar.sql';
const GRAMMAR_CONSTRAINTS = [
	'dd_ontology_alias_of_grammar',
	'dd_ontology_model_tipo_grammar',
	'dd_ontology_parent_grammar',
	'dd_ontology_tipo_grammar',
	'dd_ontology_tipo_in_tld',
	'dd_ontology_tld_grammar',
];

/**
 * The grammar, written out ONCE here as SQL so the gate can count violators
 * with no help from the code under test.
 */
const VIOLATING_ROW_SQL = `
	tipo !~ '^[a-z]+[0-9]+$' OR char_length(tipo) > 32
	OR (parent IS NOT NULL AND (parent !~ '^[a-z]+[0-9]+$' OR char_length(parent) > 32))
	OR (model_tipo IS NOT NULL AND (model_tipo !~ '^[a-z]+[0-9]+$' OR char_length(model_tipo) > 8))
	OR (tld IS NOT NULL AND (tld !~ '^[a-z]{2,}$' OR char_length(tld) > 32))
	OR (tld IS NOT NULL AND substring(tipo from '^[a-z]+') IS DISTINCT FROM tld)
	OR (jsonb_typeof(properties) = 'object' AND properties ? 'alias_of'
	    AND (jsonb_typeof(properties->'alias_of') <> 'string' OR properties->>'alias_of' !~ '^[a-z]+[0-9]+$'
	         OR char_length(properties->>'alias_of') > 32))`;

/**
 * The grammar migration(s), located by stable suffix (the integrator assigns the
 * number) in the boot migrations corpus — the one lister that owns the root.
 */
const GRAMMAR_MIGRATIONS = migrationFileNames().filter((name) => name.endsWith(MIGRATION_SUFFIX));

/** The migration text. Exactly one file may carry the suffix (the floor test pins it). */
function grammarMigrationText(): string {
	const [file] = GRAMMAR_MIGRATIONS;
	if (file === undefined) {
		throw new Error(
			`SURF-1 not landed: no install/db/migrations/*${MIGRATION_SUFFIX} — dd_ontology has no identifier CHECK`,
		);
	}
	return readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
}

function surfExport<T>(name: string): T {
	const value = (ddOntology as unknown as Record<string, unknown>)[name];
	if (value === undefined) {
		throw new Error(`SURF-1 not landed: src/core/db/dd_ontology.ts exports no '${name}'`);
	}
	return value as T;
}

async function identifierReconcile(): Promise<ReconcileDefinition> {
	let module: Record<string, unknown>;
	try {
		module = (await import('../../src/core/ontology/identifier_grammar.ts')) as Record<
			string,
			unknown
		>;
	} catch (error) {
		throw new Error(
			`SURF-1 not landed: src/core/ontology/identifier_grammar.ts does not load (${(error as Error).message})`,
		);
	}
	const definition = module.ONTOLOGY_IDENTIFIERS_RECONCILE as ReconcileDefinition | undefined;
	if (definition === undefined) {
		throw new Error(
			'SURF-1 not landed: identifier_grammar.ts exports no ONTOLOGY_IDENTIFIERS_RECONCILE',
		);
	}
	return definition;
}

// ── the rolled-back transaction ────────────────────────────────────────────

const ROLLBACK = new Error('dd_ontology_grammar_migration: sentinel rollback');

async function clearCaches(): Promise<void> {
	clearAliasCaches();
	await clearOntologyDerivedCaches();
}

async function constraintStates(): Promise<Record<string, string>> {
	const rows = (await sql.unsafe(
		`SELECT conname, convalidated FROM pg_constraint
		  WHERE conrelid = 'dd_ontology'::regclass AND contype = 'c' ORDER BY conname`,
	)) as { conname: string; convalidated: boolean }[];
	return Object.fromEntries(
		rows.map((row) => [row.conname, row.convalidated ? 'valid' : 'not_valid']),
	);
}

async function dropChecks(): Promise<void> {
	for (const name of Object.keys(await constraintStates())) {
		if (!/^[a-z0-9_]+$/.test(name)) throw new Error(`unexpected constraint name ${name}`);
		await sql.unsafe(`ALTER TABLE dd_ontology DROP CONSTRAINT "${name}"`);
	}
}

async function rolledBack(
	work: () => Promise<void>,
	options = { dropChecks: true },
): Promise<void> {
	await assertTestDatabase('dd_ontology_grammar_migration_native');
	await clearCaches(); // outside the tx: inside one the hub defers the drop (S1-14)
	try {
		await withTransaction(async () => {
			if (options.dropChecks) await dropChecks();
			await work();
			throw ROLLBACK;
		});
	} catch (error) {
		if (error !== ROLLBACK) throw error;
	} finally {
		await clearCaches();
	}
}

/** One statement under a savepoint, always rolled back to it; its SQLSTATE or 'ok'. */
async function stateOf(statement: string, params: unknown[] = []): Promise<string> {
	await sql.unsafe('SAVEPOINT g4_step');
	try {
		// No params ⇒ the simple protocol, which a multi-statement migration needs.
		if (params.length === 0) await sql.unsafe(statement);
		else await sql.unsafe(statement, params as (string | number | null)[]);
		return 'ok';
	} catch (error) {
		const state = sqlStateOf(error);
		if (state === undefined) throw error;
		return state;
	} finally {
		await sql.unsafe('ROLLBACK TO SAVEPOINT g4_step');
	}
}

// ── the legacy-install situation ───────────────────────────────────────────

interface Planted {
	tipo: string;
	tld: string;
	parent?: string | null;
	properties?: unknown;
}

const R1: Planted = { tipo: 'zzgmig1', tld: TLD, parent: "zzgmig0' OR '1" };
const R2: Planted = { tipo: 'ZZX1', tld: 'ZZX' };
const R3: Planted = { tipo: 'zzgmig9x', tld: TLD };
const R4: Planted = { tipo: 'zzgmig4', tld: TLD, properties: { alias_of: "zzgmig1'" } };
const R5: Planted = { tipo: 'zzgmig5', tld: TLD };
const R6: Planted = { tipo: 'zzgmig6', tld: 'zzgmigq' };
const R7: Planted = { tipo: 'zzgmns1', tld: 'zzgmns', parent: 'zzgmns0 OR 1' };
const PLANTED = [R1, R2, R3, R4, R5, R6, R7];
const VIOLATORS = [R1, R2, R3, R4, R6, R7].map((row) => row.tipo);

async function plant(row: Planted): Promise<void> {
	await sql.unsafe(
		`INSERT INTO dd_ontology (tipo, parent, term, model, order_number, tld, properties, model_tipo,
		   is_model, is_translatable, is_main)
		 VALUES ($1, $2, $3::text::jsonb, 'component_input_text', 1, $4, $5::text::jsonb, 'dd9', false, true, false)`,
		[
			row.tipo,
			row.parent ?? null,
			JSON.stringify({ 'lg-eng': row.tipo }),
			row.tld,
			row.properties === undefined ? null : JSON.stringify(row.properties),
		],
	);
}

/** A CLEAN source record of section zzgmig0 (no parent, no model). */
async function seedSource(sectionId: number): Promise<void> {
	await sql.unsafe(
		`INSERT INTO matrix_ontology (section_id, section_tipo, string) VALUES ($1, $2, $3::text::jsonb)`,
		[
			sectionId,
			SOURCE_SECTION,
			JSON.stringify({
				ontology7: [{ id: 1, lang: 'lg-spa', value: TLD }],
				ontology5: [{ id: 1, lang: 'lg-eng', value: `source ${sectionId}` }],
			}),
		],
	);
}

async function buildLegacyInstall(): Promise<void> {
	await seedSource(1);
	await seedSource(5);
	for (const row of PLANTED) await plant(row);
}

type Snapshot = Record<string, { parent: string | null; tld: string | null; alias_of: unknown }>;

async function plantedRows(): Promise<Snapshot> {
	const tipos = PLANTED.map((row) => row.tipo);
	const rows = (await sql.unsafe(
		`SELECT tipo, parent, tld, properties->'alias_of' AS alias_of FROM dd_ontology
		  WHERE tipo IN (${tipos.map((_, index) => `$${index + 1}`).join(', ')}) ORDER BY tipo`,
		tipos,
	)) as { tipo: string; parent: string | null; tld: string | null; alias_of: unknown }[];
	return Object.fromEntries(
		rows.map((row) => [row.tipo, { parent: row.parent, tld: row.tld, alias_of: row.alias_of }]),
	);
}

async function violatorCount(): Promise<number> {
	const rows = (await sql.unsafe(
		`SELECT count(*)::int AS n FROM dd_ontology WHERE ${VIOLATING_ROW_SQL}`,
	)) as { n: number }[];
	return rows[0]?.n ?? -1;
}

const grammarStates = (states: Record<string, string>) =>
	Object.fromEntries(GRAMMAR_CONSTRAINTS.map((name) => [name, states[name] ?? 'absent']));
const allAre = (state: string) =>
	Object.fromEntries(GRAMMAR_CONSTRAINTS.map((name) => [name, state]));

describe('SURF-1 — the grammar migration is found through the boot migrations corpus', () => {
	test('the corpus names exactly one identifier-grammar migration', () => {
		expect(GRAMMAR_MIGRATIONS.length).toBeGreaterThan(0);
		expect(GRAMMAR_MIGRATIONS).toHaveLength(1);
	});
});

describe.if(DB_READY)('SURF-1 write — the identifier CHECK migration + repair (G4)', () => {
	test('the migrated suite database carries the six CHECKs and refuses a raw violating INSERT', async () => {
		let states: Record<string, string> = {};
		let rawInsert = '';
		await rolledBack(
			async () => {
				states = grammarStates(await constraintStates());
				rawInsert = await stateOf(
					`INSERT INTO dd_ontology (tipo, tld, is_model, is_translatable, is_main)
					 VALUES ($1, $2, false, false, false)`,
					["zzgmig1'", TLD],
				);
			},
			{ dropChecks: false },
		);
		expect(Object.keys(states).length).toBe(6);
		expect(Object.values(states).filter((state) => state === 'absent')).toEqual([]);
		expect(rawInsert).toBe('23514');
	});

	test('on a legacy install the migration applies NOT VALID, leaves the rows alone, binds new writes', async () => {
		const text = grammarMigrationText();
		let before: Snapshot = {};
		let after: Snapshot = {};
		let migrated = '';
		let states: Record<string, string> = {};
		let updateValidRow = '';
		let insertViolator = '';
		await rolledBack(async () => {
			await buildLegacyInstall();
			before = await plantedRows();
			migrated = await stateOf(text);
			await sql.unsafe(text); // the savepoint above rolled the probe back; apply for real
			states = grammarStates(await constraintStates());
			after = await plantedRows();
			updateValidRow = await stateOf('UPDATE dd_ontology SET order_number = 2 WHERE tipo = $1', [
				R5.tipo,
			]);
			insertViolator = await stateOf(
				`INSERT INTO dd_ontology (tipo, tld, is_model, is_translatable, is_main) VALUES ($1, $2, false, false, false)`,
				['zzgmig7 ', TLD],
			);
		});
		expect(Object.keys(before).length).toBe(PLANTED.length);
		expect(migrated).toBe('ok');
		expect(states).toEqual(allAre('not_valid'));
		expect(after).toEqual(before);
		expect(updateValidRow).toBe('ok');
		expect(insertViolator).toBe('23514');
	});

	test('reconcile: the DRY run reports exactly the violators with their planned action, writes nothing', async () => {
		const text = grammarMigrationText();
		const reconcile = await identifierReconcile();
		let report: Awaited<ReturnType<ReconcileDefinition['run']>> | null = null;
		let before: Snapshot = {};
		let after: Snapshot = {};
		await rolledBack(async () => {
			await buildLegacyInstall();
			await sql.unsafe(text);
			before = await plantedRows();
			report = await reconcile.run({ apply: false });
			after = await plantedRows();
		});
		const dry = report as unknown as {
			drift: number;
			applied: number;
			detail: {
				rows: { tipo: string; action: string }[];
				constraints: Record<string, string>;
			};
		};
		expect(reconcile.name).toBe('ontology_identifiers');
		expect(dry.drift).toBe(VIOLATORS.length);
		expect(dry.applied).toBe(0);
		expect(dry.detail.rows.map((row) => row.tipo).sort()).toEqual([...VIOLATORS].sort());
		const actionOf = Object.fromEntries(dry.detail.rows.map((row) => [row.tipo, row.action]));
		expect({
			r1: actionOf[R1.tipo],
			r2: actionOf[R2.tipo],
			r4: actionOf[R4.tipo],
			r6: actionOf[R6.tipo],
			r7: actionOf[R7.tipo],
		}).toEqual({ r1: 'rebuild', r2: 'delete', r4: 'rebuild', r6: 'rebuild', r7: 'delete' });
		expect(grammarStates(dry.detail.constraints)).toEqual(allAre('not_valid'));
		expect(after).toEqual(before);
	});

	test('reconcile: APPLY re-derives, reclaims, deletes the unaddressable, then VALIDATEs', async () => {
		const text = grammarMigrationText();
		const reconcile = await identifierReconcile();
		let report: Awaited<ReturnType<ReconcileDefinition['run']>> | null = null;
		let after: Snapshot = {};
		let remaining = -1;
		let states: Record<string, string> = {};
		const warned: string[] = [];
		await rolledBack(async () => {
			await buildLegacyInstall();
			await sql.unsafe(text);
			const warn = spyOn(console, 'warn').mockImplementation((...args: unknown[]) => {
				warned.push(args.map(String).join(' '));
			});
			try {
				report = await reconcile.run({ apply: true });
			} finally {
				warn.mockRestore();
			}
			await clearCaches();
			after = await plantedRows();
			remaining = await violatorCount();
			states = grammarStates(await constraintStates());
		});
		const applied = report as unknown as {
			applied: number;
			detail: { deleted?: { tipo: string }[] };
		};
		expect(applied.applied).toBeGreaterThanOrEqual(VIOLATORS.length);
		// r1 re-derived from its clean source; r5 (valid, sourced) untouched; the rest gone.
		expect(after).toEqual({
			[R1.tipo]: { parent: null, tld: TLD, alias_of: null },
			[R5.tipo]: { parent: null, tld: TLD, alias_of: null },
		});
		const deletedTipos = (applied.detail.deleted ?? []).map((row) => row.tipo);
		expect(deletedTipos).toContain(R2.tipo);
		// r3 sits under the rebuilt tld zzgmig: the deletes run BEFORE the rebuild,
		// so it is captured whole instead of vanishing in the tld wipe unrecorded.
		expect(deletedTipos).toContain(R3.tipo);
		expect(deletedTipos).toContain(R7.tipo);
		// …and each deleted row reaches the LOG whole (term included), JSON-escaped.
		for (const planted of [R2, R3, R7]) {
			expect(
				warned.some(
					(line) =>
						line.includes('[ontology_identifiers] deleted dd_ontology row') &&
						line.includes(`"tipo":${JSON.stringify(planted.tipo)}`) &&
						line.includes(`"term":{"lg-eng":${JSON.stringify(planted.tipo)}}`),
				),
			).toBe(true);
		}
		expect(remaining).toBe(0);
		expect(states).toEqual(allAre('valid'));
	});

	test('reconcile: a VALIDATE that fails after the deletes still returns the report with every deleted row whole', async () => {
		const text = grammarMigrationText();
		const reconcile = await identifierReconcile();
		let report: Awaited<ReturnType<ReconcileDefinition['run']>> | { threw: string } | null = null;
		await rolledBack(async () => {
			await buildLegacyInstall();
			await sql.unsafe(text);
			// A TS/SQL predicate divergence, planted: the model_tipo CHECK is replaced
			// by a rule that refuses one grammar-CLEAN row (zzgmok1, a tld no rebuild
			// touches, so no write of the repair itself trips it). The TS scan calls
			// the table clean for that rule, so the repair VALIDATEs it — and VALIDATE
			// fails (23514) AFTER the unaddressable rows are already deleted.
			await plant({ tipo: 'zzgmok1', tld: 'zzgmok' });
			await sql.unsafe('ALTER TABLE dd_ontology DROP CONSTRAINT dd_ontology_model_tipo_grammar');
			await sql.unsafe(
				`ALTER TABLE dd_ontology ADD CONSTRAINT dd_ontology_model_tipo_grammar CHECK (tipo <> 'zzgmok1') NOT VALID`,
			);
			const quiet = [
				spyOn(console, 'warn').mockImplementation(() => undefined),
				spyOn(console, 'error').mockImplementation(() => undefined),
			];
			try {
				report = await reconcile.run({ apply: true });
			} catch (error) {
				report = { threw: String((error as Error).message).slice(0, 200) };
			} finally {
				for (const spy of quiet) spy.mockRestore();
			}
			// No query after this point: the failed VALIDATE aborted the leg's transaction.
		});
		expect(report).not.toHaveProperty('threw');
		const failed = report as unknown as {
			detail: {
				validation_error?: unknown;
				deleted?: { tipo: string; term: unknown }[];
			};
		};
		expect(typeof failed.detail.validation_error).toBe('string');
		expect(String(failed.detail.validation_error)).toContain('run reconcile ontology_identifiers');
		const deleted = failed.detail.deleted ?? [];
		expect(deleted.map((row) => row.tipo).sort()).toEqual([R2.tipo, R3.tipo, R7.tipo].sort());
		for (const row of deleted) expect(row.term).toEqual({ 'lg-eng': row.tipo });
	});

	test('violators present: VALIDATE only the clean rules; the broken ones stay NOT VALID, reported blocked', async () => {
		const text = grammarMigrationText();
		type Outcome = { validated: string[]; blocked: { constraint: string; rows: number }[] };
		const validate = surfExport<() => Promise<Outcome>>('validateDdOntologyIdentifierConstraints');
		let outcome: Outcome | { threw: string } | null = null;
		let states: Record<string, string> = {};
		await rolledBack(async () => {
			await buildLegacyInstall();
			await sql.unsafe(text);
			await sql.unsafe('SAVEPOINT g4_validate');
			try {
				outcome = await validate();
			} catch (error) {
				outcome = { threw: String((error as Error).message).slice(0, 200) };
				await sql.unsafe('ROLLBACK TO SAVEPOINT g4_validate');
			}
			states = grammarStates(await constraintStates());
		});
		// r1–r7 break every rule except model_tipo (all planted with model_tipo 'dd9').
		const broken = GRAMMAR_CONSTRAINTS.filter((name) => name !== 'dd_ontology_model_tipo_grammar');
		const result = outcome as unknown as Outcome;
		expect(outcome).not.toHaveProperty('threw');
		expect(result.validated).toEqual(['dd_ontology_model_tipo_grammar']);
		expect(result.blocked.map((item) => item.constraint).sort()).toEqual(broken);
		expect(result.blocked.every((item) => item.rows > 0)).toBe(true);
		expect(states).toEqual({
			...allAre('not_valid'),
			dd_ontology_model_tipo_grammar: 'valid',
		});
	});

	test('clean data: migration then validateDdOntologyIdentifierConstraints → every CHECK valid', async () => {
		const text = grammarMigrationText();
		const validate = surfExport<() => Promise<unknown>>('validateDdOntologyIdentifierConstraints');
		let migrated: Record<string, string> = {};
		let validated: Record<string, string> = {};
		let violators = -1;
		await rolledBack(async () => {
			violators = await violatorCount();
			await sql.unsafe(text);
			migrated = grammarStates(await constraintStates());
			await validate();
			validated = grammarStates(await constraintStates());
		});
		expect(violators).toBe(0);
		expect(migrated).toEqual(allAre('not_valid'));
		expect(validated).toEqual(allAre('valid'));
	});
});
