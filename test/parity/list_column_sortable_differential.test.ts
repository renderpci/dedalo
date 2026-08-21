/**
 * SECTION list-column SORTABILITY differential (PHP build_structure_context
 * :1683-1688 + get_sortable / get_order_path).
 *
 * THE BUG THIS PINS: the client's list header shows a sort icon for a column
 * only when the server emits, on that column's context ddo, `sortable:true` AND
 * a non-empty order `path` (common.js get_columns_map + ui.js allow_column_order).
 * The TS server used to hardcode `sortable:false` for every element, so ONLY the
 * client-synthetic `section_id` column was sortable. This gate compares, against
 * the LIVE PHP oracle, the `sortable` flag and the order `path` of every
 * TOP-LEVEL list column (the fields the client actually reads).
 *
 * PROJECTION = the functionally load-bearing fields per path step
 * (component_tipo / section_tipo / column); `name`/`model` are cosmetic (the SQL
 * assembler resolves the model from component_tipo). The path drives the
 * client's sqo.order → sql_assembler buildOrderClauses (single-hop component
 * value, multi-hop join chain for relation columns).
 *
 * Coverage: scalars (input_text/date), publication, select, portal (multi-step
 * + subdatum prepend), dataframe, filter, select_lang, and the non-sortable
 * models (image/info). Oracle context lives at result.context.
 */
// GENERIC-TLD MIGRATED 2026-08-19 (WC-2026-08-19-test-tld-replay-search-group).
// Every section is addressed in `test`-TLD terms; the frozen PHP interaction is
// reached through `unmapRqo` and its context is read through `adoptTipoIdMap`.
// `rsc170` is SEED-SHIPPED ontology (every installation has it) and is spelled
// through `seed()` — a pin on the seed, not on an install.
// NO RECORDS: this gate compares the STRUCTURE CONTEXT (a column's `sortable`
// flag and its order `path`), which is a function of the ontology alone, so it
// deliberately does not provision the test corpus.

import { beforeAll, describe, expect, test } from 'bun:test';
import { config } from '../../src/config/config.ts';
import { runWithRequestLangs } from '../../src/core/resolve/request_lang.ts';
import { readSection } from '../../src/core/section/read.ts';
import { adoptTipoIdMap } from './normalize.ts';
import { hasPhpCredentials, PhpApiClient } from './php_client.ts';

/** A SEED-SHIPPED tipo, spelled out of the install-TLD census's token grammar. */
const seed = (tld: string, id: number): string => `${tld}${id}`;

/**
 * dd542 removed 2026-07-21 (WC-044): the whole Activity column set now
 * DELIBERATELY diverges from the frozen oracle — see LEDGERED_DIVERGENT below.
 *
 * `minTipoRewrites` is the ANTI-VACUITY FLOOR on the fixture-side transform:
 * the frozen column set of a CLONED section cannot be read in test terms
 * without rewriting at least this many tokens, so a transform that silently
 * stopped mapping (or a gate accidentally re-bound to install terms) reddens
 * instead of comparing the engine with an unmapped body. `rsc170` is
 * seed-shipped: its columns carry NO clone token, and a floor of 0 is the fact
 * — `matched` still proves the body holds no install token at all.
 */
const SECTIONS: { tipo: string; minTipoRewrites: number }[] = [
	{ tipo: 'test6099', minTipoRewrites: 100 }, // clone of the coin-type section (172 today)
	{ tipo: 'testmint1', minTipoRewrites: 20 }, // clone of the mint thesaurus (24 today)
	{ tipo: seed('rsc', 170), minTipoRewrites: 0 }, // seed-shipped media section (0 by nature)
	{ tipo: 'test6813', minTipoRewrites: 100 }, // clone of the oral-history section (126 today)
];

/**
 * The former oh25|oh1 (+ rsc62/rsc63/rsc35 subdatum) exclusions are CLOSED
 * (2026-07-09): the divergence was PHP get_subdatum's caller-children NARROWING
 * (class.common.php:2598-2681 — a section_list may re-declare a portal's
 * subcolumns: oh1's oh7 narrows oh25 to [rsc62, rsc63, rsc35]), which the
 * order-path build now consumes via the stamped request_config. It was never a
 * process_ddo_map drop — oh25's ontology ddo_map survives that pipeline intact.
 *
 * dd542 Activity (WC-044, 2026-07-21): the ENTIRE column set now DELIBERATELY
 * diverges from the frozen oracle, so dd542 left SECTIONS above — arbitrary
 * component sorts on the append-only log are unusable full-table jsonb sorts
 * at production scale, so the TS engine emits sortable:false for every dd542
 * column except When (dd547), whose order path maps to the indexed section_id
 * column (order_path.ts). The new contract is pinned by
 * test/unit/activity_sort_policy.test.ts; the fixture's dd542 values are history.
 */
const LEDGERED_DIVERGENT: ReadonlySet<string> = new Set([]);

interface Ctx {
	tipo: string;
	section_tipo: string;
	mode: string;
	model?: string;
	parent?: string;
	sortable?: unknown;
	path?: unknown;
}

type Step = { component_tipo?: string; section_tipo?: string; column?: string };
function projPath(path: unknown): unknown {
	if (!Array.isArray(path)) return path ?? null;
	return (path as Step[]).map((s) => ({
		component_tipo: s.component_tipo,
		section_tipo: s.section_tipo,
		...(s.column !== undefined ? { column: s.column } : {}),
	}));
}

/**
 * The frozen PHP list context's TOP-LEVEL COLUMNS, read in `test`-TLD terms.
 *
 * The RQO is written in test terms and `unmapRqo` (in `lookupInteraction`)
 * turns it back into the install terms the interaction was harvested under, so
 * the fixture key is unchanged. The reply is install-term, and
 * `adoptTipoIdMap` rewrites it — but ONLY the slice this gate compares.
 *
 * WHY THE SLICE AND NOT THE WHOLE BODY: the section entry carries
 * `parent_grouper: numisdata1`, the install AREA node ABOVE the clone root, for
 * which the clone has no twin by construction (context_differential owns that
 * seam and asserts both of its values explicitly). This gate compares the
 * section's own component ddos and nothing else, so it adopts exactly those —
 * `matched === true` then means every token in the COMPARED set was mapped, and
 * a column that grew an unmappable install token reddens instead of hiding.
 *
 * The section root is read OUT OF THE BODY (the one `model:'section'` entry)
 * rather than compared against the caller's tipo: the filter is applied while
 * the body is still install-term, and naming that tipo here is the binding
 * this migration removes.
 */
async function phpListColumns(
	php: PhpApiClient,
	tipo: string,
	minTipoRewrites: number,
): Promise<Ctx[]> {
	const { body } = await php.call({
		dd_api: 'dd_core_api',
		action: 'read',
		source: {
			model: 'section',
			tipo,
			section_tipo: tipo,
			mode: 'list',
			lang: 'lg-spa',
			action: 'search',
		},
		sqo: { section_tipo: [tipo], limit: 5, offset: 0 },
	} as unknown as Record<string, unknown>);
	const context = ((body.result as { context?: Ctx[] })?.context ?? []) as Ctx[];
	const roots = context.filter((entry) => entry.model === 'section');
	expect(roots.length, `${tipo}: the frozen context must carry exactly one section entry`).toBe(1);
	const root = (roots[0] as Ctx).tipo;
	// TOP-LEVEL columns = the section's own component ddos (parent === section):
	// exactly what the client's get_columns_map reads for the header row.
	const columns = context.filter(
		(entry) => String(entry.model ?? '').startsWith('component_') && entry.parent === root,
	);
	const adopted = adoptTipoIdMap(columns, 'list_column_sortable_differential');
	expect(adopted.matched, `${tipo}: ${adopted.detail ?? ''}`).toBe(true);
	// Anti-vacuity: a clone's frozen columns cannot be read in test terms
	// without this many token rewrites (see minTipoRewrites).
	expect(
		adopted.rewrites.tipos,
		`${tipo}: fixture-side tipo rewrites below the declared floor`,
	).toBeGreaterThanOrEqual(minTipoRewrites);
	return adopted.body;
}

async function tsListContext(tipo: string): Promise<Ctx[]> {
	const res = await runWithRequestLangs({ applicationLang: 'lg-spa', dataLang: 'lg-spa' }, () =>
		readSection({
			dd_api: 'dd_core_api',
			action: 'read',
			source: {
				model: 'section',
				tipo,
				section_tipo: tipo,
				mode: 'list',
				lang: 'lg-spa',
				action: 'search',
			},
			sqo: { section_tipo: [tipo], limit: 5, offset: 0 },
		} as never),
	);
	return (res.context ?? []) as Ctx[];
}

describe.if(hasPhpCredentials())('list-column sortable + order path differential', () => {
	let php: PhpApiClient;
	beforeAll(async () => {
		if (!hasPhpCredentials()) return;
		php = new PhpApiClient();
		await php.login(config.phpReference.username as string, config.phpReference.password as string);
	});

	for (const { tipo, minTipoRewrites } of SECTIONS) {
		test(`${tipo}: every top-level list column's sortable + path matches PHP`, async () => {
			if (!hasPhpCredentials()) return;
			const columns = await phpListColumns(php, tipo, minTipoRewrites);
			const tsCtx = await tsListContext(tipo);
			const tsBy = new Map(tsCtx.map((e) => [`${e.tipo}|${e.section_tipo}|${e.mode}`, e]));

			expect(columns.length).toBeGreaterThan(0);

			let asserted = 0;
			for (const php of columns) {
				const key = `${php.tipo}|${php.section_tipo}|${php.mode}`;
				if (LEDGERED_DIVERGENT.has(`${php.tipo}|${php.section_tipo}`)) continue;
				const ts = tsBy.get(key);
				expect(ts, `TS missing column ddo ${key}`).toBeDefined();
				// sortable flag: the client's allow_column_order gate.
				expect(ts?.sortable, `${key} sortable`).toBe(php.sortable);
				// order path (functional projection): drives the client sqo.order.
				expect(projPath(ts?.path), `${key} path`).toEqual(projPath(php.path));
				asserted++;
			}
			expect(asserted).toBeGreaterThan(0);
		});
	}

	test('a scalar column is sortable with a single-step path; media/info are not (test6099/test6813)', async () => {
		if (!hasPhpCredentials()) return;
		const coins = await tsListContext('test6099');
		const oral = await tsListContext('test6813');
		const byTipo = (ctx: Ctx[], t: string) => ctx.find((e) => e.tipo === t);

		// scalar → sortable + non-empty path (the reported bug: only section_id worked).
		const scalar = byTipo(coins, 'test6110'); // component_input_text
		expect(scalar?.sortable).toBe(true);
		expect(Array.isArray(scalar?.path) && (scalar?.path as unknown[]).length).toBe(1);

		// media/info → NOT sortable, no path (PHP get_sortable false).
		const info = byTipo(oral, 'test6840'); // component_info
		expect(info?.sortable).toBe(false);
		expect(info?.path).toBeUndefined();
	});
});
