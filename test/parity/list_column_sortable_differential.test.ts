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

import { beforeAll, describe, expect, test } from 'bun:test';
import { config } from '../../src/config/config.ts';
import { runWithRequestLangs } from '../../src/core/resolve/request_lang.ts';
import { readSection } from '../../src/core/section/read.ts';
import { PhpApiClient, hasPhpCredentials } from './php_client.ts';

// dd542 removed 2026-07-21 (WC-044): the whole Activity column set now
// DELIBERATELY diverges from the frozen oracle — see LEDGERED_DIVERGENT below.
const SECTIONS = ['numisdata3', 'numisdata6', 'rsc170', 'oh1'];

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

async function phpListContext(php: PhpApiClient, tipo: string): Promise<Ctx[]> {
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
	return ((body.result as { context?: Ctx[] })?.context ?? []) as Ctx[];
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

	for (const tipo of SECTIONS) {
		test(`${tipo}: every top-level list column's sortable + path matches PHP`, async () => {
			if (!hasPhpCredentials()) return;
			const phpCtx = await phpListContext(php, tipo);
			const tsCtx = await tsListContext(tipo);
			const tsBy = new Map(tsCtx.map((e) => [`${e.tipo}|${e.section_tipo}|${e.mode}`, e]));

			// TOP-LEVEL columns = the section's own component ddos (parent === section):
			// exactly what the client's get_columns_map reads for the header row.
			const columns = phpCtx.filter(
				(e) => String(e.model ?? '').startsWith('component_') && e.parent === tipo,
			);
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

	test('a scalar column is sortable with a single-step path; media/info are not (numisdata3/oh1)', async () => {
		if (!hasPhpCredentials()) return;
		const nd3 = await tsListContext('numisdata3');
		const oh1 = await tsListContext('oh1');
		const byTipo = (ctx: Ctx[], t: string) => ctx.find((e) => e.tipo === t);

		// scalar → sortable + non-empty path (the reported bug: only section_id worked).
		const scalar = byTipo(nd3, 'numisdata27'); // component_input_text
		expect(scalar?.sortable).toBe(true);
		expect(Array.isArray(scalar?.path) && (scalar?.path as unknown[]).length).toBe(1);

		// media/info → NOT sortable, no path (PHP get_sortable false).
		const info = byTipo(oh1, 'oh28'); // component_info
		expect(info?.sortable).toBe(false);
		expect(info?.path).toBeUndefined();
	});
});
