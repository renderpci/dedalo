/**
 * SURF-1 read (G1) — AN ALIAS TARGET IS AN IDENTIFIER, SO IT OBEYS THE TIPO GRAMMAR.
 *
 * WHAT WAS WRONG. `component_alias` (WC-020) re-keys every read, write and
 * search of the alias onto its TARGET: `resolveDataTipo(alias)` returns
 * `properties.alias_of`, and the search engine interpolates that value VERBATIM
 * into JSONB paths and SQL (`<alias>.string->'<target>'`, `'$.<target>[*]'`,
 * `<target>_order`). The §7.6 identifier gate validates the tipo the CALLER
 * names — the alias — never the value the ontology swaps in behind it. Two
 * readers (resolver.ts `aliasTargetTipoOf`, alias.ts `resolveAliasTargetTipo`)
 * checked only "non-empty string, target row exists, target not an alias":
 * a row planted under the tipo `zzsurf'||pg_sleep(0)||'1` exists, so the hostile
 * string came back as the alias's data tipo.
 *
 * THE CONTRACT THIS GATE PINS (CLOSURE_PLAN Step 4, SURF-1 read — R2/R3):
 * ONE reader, `aliasTargetTipoOf`, checks in order missing → grammar → absent
 * → chained, and every refusal is `ontology.invalid_node` with coordinates
 * `{tipo, alias_of: JSON.stringify(v).slice(0, 64), reason}`. The grammar
 * check runs BEFORE the row lookup, so a hostile value is refused whether or
 * not a row exists under it. alias.ts delegates to the same reader, so every
 * consumer — the data-tipo re-key, the model hop, the translatable hop and the
 * save-lang rule — refuses with `reason: 'grammar'`.
 *
 * THE SITUATION IS BUILT: scratch TLD `zzsurf`, a section, a real
 * input_text and a VALID alias of it, written through the engine's door
 * (`ensureSituation` → `upsertDdOntologyNode`). The hostile legs run INSIDE
 * one transaction that always ends in a sentinel throw: the dd_ontology CHECK
 * constraints (SURF-1 write) are dropped there first — a gate of the READ law
 * must not depend on the write law holding — the hostile rows are planted raw,
 * and everything rolls back.
 *
 * ANTI-VACUITY: the committed valid alias resolves to its target before the
 * legs run, and INSIDE the transaction a freshly planted valid alias to a
 * freshly planted target resolves too — so a refusal below is the grammar
 * check, not a reader that refuses everything.
 *
 * MUTATIONS (each must turn this gate red):
 *   M1 remove the `isValidTipo` line from `aliasTargetTipoOf` → the hostile
 *      legs return the planted value / refuse without `reason: 'grammar'`;
 *   M2 give alias.ts its own reader back (instead of delegating) → the
 *      `resolveDataTipo` / `resolveAliasTargetTipo` legs go red;
 *   M3 give the save-lang rule (resolver.ts `savesInRequestLang`, which reads
 *      the translatable AND the lang-versions flag through ONE alias hop,
 *      `dataNodeOf`) a raw `alias_of` read → the `effectiveSaveLang` legs go
 *      red. There is no separate lang-versions hop left to go unmeasured.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { sql, withTransaction } from '../../src/core/db/postgres.ts';
import { isDedaloError } from '../../src/core/errors/index.ts';
import {
	clearAliasCaches,
	resolveAliasTargetTipo,
	resolveDataTipo,
} from '../../src/core/ontology/alias.ts';
import { clearOntologyDerivedCaches } from '../../src/core/ontology/cache_invalidation.ts';
import {
	effectiveSaveLang,
	getModelByTipo,
	getTranslatableByTipo,
} from '../../src/core/ontology/resolver.ts';
import {
	dropSituation,
	ensureSituation,
	situation,
} from '../../src/core/test_data/situations/situation.ts';
import { assertTestDatabase } from '../../src/core/test_data/test_database_marker.ts';
import { DB_READY } from '../helpers/db_ready.ts';

const TLD = 'zzsurf';
const SECTION = 'zzsurf1';
const TARGET = 'zzsurf2';
const ALIAS = 'zzsurf3';
/** Planted INSIDE the transaction only: a second valid pair (anti-vacuity control). */
const PLANTED_TARGET = 'zzsurf8';
const PLANTED_ALIAS = 'zzsurf9';

/** A row that EXISTS under a tipo carrying SQL — the leg the old readers passed. */
const HOSTILE_PLANTED = "zzsurf'||pg_sleep(0)||'1";
/** Values with no row behind them: each is refused for GRAMMAR, before any lookup. */
const HOSTILE_UNPLANTED = ['ZZSURF2', 'zzsurf2 ', 'section_id', `${'x'.repeat(70)}1`];

const S = situation({
	name: 'SURF-1 alias target grammar',
	tld: TLD,
	nodes: [
		{ tipo: SECTION, model: 'section', term: { 'lg-eng': 'SURF-1 alias section' } },
		{ tipo: TARGET, parent: SECTION, model: 'component_input_text', is_translatable: true },
		{
			tipo: ALIAS,
			parent: SECTION,
			model: 'component_alias',
			properties: { alias_of: TARGET },
		},
	],
});

/** The five consumers of the alias reader — every one must refuse a bad target. */
const CONSUMERS: Record<string, (tipo: string) => Promise<unknown>> = {
	resolveDataTipo: (tipo) => resolveDataTipo(tipo),
	resolveAliasTargetTipo: (tipo) => resolveAliasTargetTipo(tipo),
	getModelByTipo: (tipo) => getModelByTipo(tipo),
	getTranslatableByTipo: (tipo) => getTranslatableByTipo(tipo),
	effectiveSaveLang: (tipo) => effectiveSaveLang(tipo, 'component_input_text', 'lg-eng'),
};

type Outcome =
	| { returned: unknown }
	| { code: string; reason: unknown; alias_of: unknown; tipo: unknown };

async function outcomeOf(run: Promise<unknown>): Promise<Outcome> {
	try {
		return { returned: await run };
	} catch (error) {
		if (!isDedaloError(error)) throw error;
		const coordinates = (error.coordinates ?? {}) as Record<string, unknown>;
		return {
			code: error.code,
			reason: coordinates.reason,
			alias_of: coordinates.alias_of,
			tipo: coordinates.tipo,
		};
	}
}

/** What every consumer must answer for an alias whose alias_of is `value`. */
function grammarRefusal(value: unknown): Outcome {
	return {
		code: 'ontology.invalid_node',
		reason: 'grammar',
		alias_of: JSON.stringify(value).slice(0, 64),
		tipo: ALIAS,
	};
}

async function clearCaches(): Promise<void> {
	clearAliasCaches();
	await clearOntologyDerivedCaches();
}

/** Drop every CHECK on dd_ontology — inside the caller's rolled-back transaction only. */
async function dropIdentifierChecks(): Promise<void> {
	const rows = (await sql.unsafe(
		`SELECT conname FROM pg_constraint WHERE conrelid = 'dd_ontology'::regclass AND contype = 'c'`,
	)) as { conname: string }[];
	for (const { conname } of rows) {
		if (!/^[a-z0-9_]+$/.test(conname)) throw new Error(`unexpected constraint name ${conname}`);
		await sql.unsafe(`ALTER TABLE dd_ontology DROP CONSTRAINT "${conname}"`);
	}
}

const ROLLBACK = new Error('alias_target_grammar: sentinel rollback');

/** Run `work` in ONE transaction that never commits (DDL + plants roll back). */
async function rolledBack(work: () => Promise<void>): Promise<void> {
	await assertTestDatabase('alias_target_grammar_native');
	// Cleared BEFORE the transaction opens: inside one the hub defers the drop to
	// the commit (S1-14), so a node cached by an earlier committed read would
	// shadow the rows planted below. In-transaction reads never seed the caches.
	await clearCaches();
	try {
		await withTransaction(async () => {
			await dropIdentifierChecks();
			await work();
			throw ROLLBACK;
		});
	} catch (error) {
		if (error !== ROLLBACK) throw error;
	} finally {
		await clearCaches();
	}
}

async function plantRow(tipo: string, model: string, properties: unknown = null): Promise<void> {
	await sql.unsafe(
		`INSERT INTO dd_ontology (tipo, parent, model, tld, term, properties, is_model, is_translatable, is_main)
		 VALUES ($1, $2, $3, $4, $5::text::jsonb, $6::text::jsonb, false, true, false)`,
		[
			tipo,
			SECTION,
			model,
			TLD,
			JSON.stringify({ 'lg-eng': 'planted' }),
			properties === null ? null : JSON.stringify(properties),
		],
	);
}

async function pointAliasAt(value: unknown): Promise<void> {
	await sql.unsafe(
		`UPDATE dd_ontology SET properties = jsonb_set(COALESCE(properties, '{}'::jsonb), '{alias_of}', $1::text::jsonb)
		 WHERE tipo = $2`,
		[JSON.stringify(value), ALIAS],
	);
	await clearCaches();
}

/** Every consumer's outcome for ALIAS, keyed by consumer name. */
async function consumerOutcomes(): Promise<Record<string, Outcome>> {
	const out: Record<string, Outcome> = {};
	for (const [name, consume] of Object.entries(CONSUMERS)) {
		await clearCaches();
		out[name] = await outcomeOf(consume(ALIAS));
	}
	return out;
}

function everyConsumer(outcome: Outcome): Record<string, Outcome> {
	return Object.fromEntries(Object.keys(CONSUMERS).map((name) => [name, outcome]));
}

describe.if(DB_READY)('SURF-1 read — an alias target obeys the tipo grammar (G1)', () => {
	beforeAll(async () => {
		await assertTestDatabase('alias_target_grammar_native');
		await dropSituation(S);
		await ensureSituation(S);
		await clearCaches();
	});
	afterAll(async () => {
		expect(await dropSituation(S)).toBe(0);
		await clearCaches();
	});

	test('control: the committed valid alias re-keys onto its target', async () => {
		expect(Object.keys(CONSUMERS).length).toBeGreaterThan(4);
		expect(await resolveDataTipo(ALIAS)).toBe(TARGET);
		expect(await resolveAliasTargetTipo(ALIAS)).toBe(TARGET);
		expect(await getModelByTipo(ALIAS)).toBe('component_input_text');
		expect(await getTranslatableByTipo(ALIAS)).toBe(true);
		expect(await effectiveSaveLang(ALIAS, 'component_input_text', 'lg-eng')).toBe('lg-eng');
	});

	test('a PLANTED row under a hostile tipo is refused for grammar — every consumer', async () => {
		let observed: Record<string, Outcome> = {};
		let control: unknown = null;
		await rolledBack(async () => {
			// Anti-vacuity, inside the same transaction: a valid planted pair resolves.
			await plantRow(PLANTED_TARGET, 'component_input_text');
			await plantRow(PLANTED_ALIAS, 'component_alias', { alias_of: PLANTED_TARGET });
			await clearCaches();
			control = await resolveDataTipo(PLANTED_ALIAS);

			await plantRow(HOSTILE_PLANTED, 'component_input_text');
			await pointAliasAt(HOSTILE_PLANTED);
			observed = await consumerOutcomes();
		});
		expect(control).toBe(PLANTED_TARGET);
		expect(observed).toEqual(everyConsumer(grammarRefusal(HOSTILE_PLANTED)));
	});

	test('an UNPLANTED non-grammar value is refused for GRAMMAR, not as "absent"', async () => {
		const observed: Record<string, Record<string, Outcome>> = {};
		const expected: Record<string, Record<string, Outcome>> = {};
		await rolledBack(async () => {
			for (const value of HOSTILE_UNPLANTED) {
				await pointAliasAt(value);
				observed[value] = await consumerOutcomes();
				expected[value] = everyConsumer(grammarRefusal(value));
			}
		});
		expect(Object.keys(observed).length).toBe(HOSTILE_UNPLANTED.length);
		expect(observed).toEqual(expected);
	});
});
