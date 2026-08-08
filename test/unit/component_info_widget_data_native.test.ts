/**
 * CRAP item 2.23a — `get_widget_data` (api/handlers/dd_component_info.ts:32),
 * the single-widget ASYNC compute channel of component_info.
 *
 * DEC-14b ORPHAN: the only gate this action had was
 * test/parity/info_widget_differential.test.ts's `describe.if(hasLivePhpOracle())`,
 * permanently FALSE post-cutover (the frozen fixture store never satisfies it),
 * and no `*_native` twin was ever written — so the action shipped with ZERO
 * executed coverage. It is also absent from engineering/ORACLE_HARVEST.md's
 * retired-differential twin map (reported, NOT edited here).
 *
 * Branch inventory of the handler, in execution order — one case each:
 *  1. requirePrincipal   — throws without a seeded principal;
 *  2. AUTHZ-01 record gate (principalCanAccessRecord, TS-STRONGER than PHP):
 *     non-admin + an EXISTING out-of-scope record ⇒ the forbidden envelope;
 *     the same record + admin proceeds (that pairing is what makes the gate
 *     case non-vacuous), and a non-positive section_id is refused for admins
 *     too (record_scope's `sectionId < 1` rule reached through this door);
 *  3. no `properties.widgets` (or no ontology node at all) ⇒ the PHP
 *     ' Empty defined widgets …' message — byte-exact, LEADING and TRAILING
 *     space included;
 *  4. widget_name not among the declared widgets (and the empty-string default
 *     when `options` is absent) ⇒ ' Empty widget_obj for widget <name>';
 *  5. thread-through: the ontology `ipo` block and the WidgetContext handed to
 *     the descriptor's computeData, proven by a SCRATCH descriptor whose
 *     compute ECHOES `(ipo, context)` (registry mock.module'd, real exports
 *     restored in afterEach per the mock-leak law). Asserting against
 *     `widgetComputeData(getInfoWidget(...))` instead would be a self-oracle:
 *     the function checked against its own dependency.
 *  6. success envelope — `{result:<items>, msg:'OK. Request done successfully',
 *     errors:[]}` with the REAL test_info widget, whose placeholder value
 *     re-proves sectionTipo/sectionId threading without any mock.
 *
 * Scratch surface (namespace: test3 ids 934000-934099): matrix_test test3/934000,
 * a component-less record, direct INSERT (no counter bump). Swept in afterAll
 * together with its matrix_time_machine tail, fail-loud on residue. No
 * dd_ontology write anywhere in this file.
 */

import { afterAll, afterEach, beforeAll, describe, expect, mock, test } from 'bun:test';
import type { ApiRequestContext } from '../../src/core/api/handler_context.ts';
import { componentInfoApiActions } from '../../src/core/api/handlers/dd_component_info.ts';
import * as widget_registry from '../../src/core/components/component_info/widgets/registry.ts';
import type { Rqo } from '../../src/core/concepts/rqo.ts';
import { sql } from '../../src/core/db/postgres.ts';
import type { Principal } from '../../src/core/security/permissions.ts';
import type { Session } from '../../src/core/security/session_store.ts';
import { mustGet } from '../helpers/assert.ts';

/** Snapshot of the REAL registry exports, taken BEFORE any mock.module —
 * mock.module is process-global and mock.restore() does not revert it. */
const REAL_REGISTRY = { ...widget_registry };
const REGISTRY_PATH = '../../src/core/components/component_info/widgets/registry.ts';

const SECTION = 'test3'; // matrix_test
const SECTION_ID = 934000; // scratch band 934000-934099
const INFO_WITH_WIDGETS = 'test212'; // component_info, properties.widgets = [test_info]
const WIDGET_NAME = 'test_info';
const NO_WIDGETS_TIPO = 'test52'; // component_input_text — no properties.widgets
const UNKNOWN_TIPO = 'zzt_no_such_tipo_934000'; // getNode() → null

const ADMIN: Principal = { userId: 1, isGlobalAdmin: true, isDeveloper: true };
/** No user record, hence no projects: every non-admin record scope check fails. */
const NO_ACCESS: Principal = { userId: 999999, isGlobalAdmin: false, isDeveloper: false };

const contextFor = (principal: Principal): ApiRequestContext => ({
	requestId: 'crap-2-23a',
	clientIp: '127.0.0.1',
	session: {
		userId: principal.userId,
		username: `scratch_${principal.userId}`,
		isGlobalAdmin: principal.isGlobalAdmin,
		csrfToken: 'x',
		applicationLang: null,
		dataLang: null,
	} as Session,
	csrfCandidate: null,
	principal,
});

const contextWithoutPrincipal = (): ApiRequestContext => ({
	requestId: 'crap-2-23a',
	clientIp: '127.0.0.1',
	session: null,
	csrfCandidate: null,
});

const rqoOf = (source: unknown, options?: unknown): Rqo =>
	({ action: 'get_widget_data', dd_api: 'dd_component_info', source, options }) as unknown as Rqo;

const getWidgetData = mustGet(componentInfoApiActions.get_widget_data, 'get_widget_data handler');

async function purgeScratch(): Promise<number> {
	const deleted = (await sql.unsafe(
		'DELETE FROM matrix_test WHERE section_tipo = $1 AND section_id = $2 RETURNING id',
		[SECTION, SECTION_ID],
	)) as unknown[];
	await sql.unsafe('DELETE FROM matrix_time_machine WHERE section_tipo = $1 AND section_id = $2', [
		SECTION,
		SECTION_ID,
	]);
	return deleted.length;
}

beforeAll(async () => {
	await purgeScratch(); // belt and braces: a crashed earlier run
	await sql.unsafe('INSERT INTO matrix_test (section_id, section_tipo) VALUES ($1, $2)', [
		SECTION_ID,
		SECTION,
	]);
});

afterAll(async () => {
	await purgeScratch();
	const residue = (await sql.unsafe(
		'SELECT id FROM matrix_test WHERE section_tipo = $1 AND section_id = $2',
		[SECTION, SECTION_ID],
	)) as unknown[];
	const tmResidue = (await sql.unsafe(
		'SELECT id FROM matrix_time_machine WHERE section_tipo = $1 AND section_id = $2',
		[SECTION, SECTION_ID],
	)) as unknown[];
	if (residue.length > 0 || tmResidue.length > 0) {
		throw new Error(
			`scratch residue: ${residue.length} matrix_test row(s) + ${tmResidue.length} TM row(s) for ${SECTION}/${SECTION_ID}`,
		);
	}
});

// Re-install the real registry after EVERY case (a leaked module mock reddens
// unrelated files later in the run — the documented bun gotcha).
afterEach(() => {
	mock.module(REGISTRY_PATH, () => REAL_REGISTRY);
});

describe('get_widget_data — identity and record gate', () => {
	test('no seeded principal ⇒ requirePrincipal throws (never an anonymous compute)', async () => {
		await expect(
			getWidgetData(
				rqoOf({ tipo: INFO_WITH_WIDGETS, section_tipo: SECTION, section_id: SECTION_ID }),
				contextWithoutPrincipal(),
			),
		).rejects.toThrow(/no authenticated principal/);
	});

	test('AUTHZ-01: an EXISTING record outside the caller scope ⇒ forbidden envelope', async () => {
		const result = await getWidgetData(
			rqoOf(
				{ tipo: INFO_WITH_WIDGETS, section_tipo: SECTION, section_id: SECTION_ID, mode: 'edit' },
				{ widget_name: WIDGET_NAME },
			),
			contextFor(NO_ACCESS),
		);
		expect(result).toEqual({
			status: 200,
			body: { result: false, msg: [' Forbidden record'], errors: ['forbidden'] },
		});
	});

	test('the SAME record + an admin principal passes the gate (the refusal is scope, not fixture)', async () => {
		const result = await getWidgetData(
			rqoOf(
				{ tipo: INFO_WITH_WIDGETS, section_tipo: SECTION, section_id: SECTION_ID },
				{ widget_name: WIDGET_NAME },
			),
			contextFor(ADMIN),
		);
		const body = result.body as { result: unknown; errors: unknown };
		expect(body.errors).toEqual([]);
		expect(Array.isArray(body.result)).toBe(true);
	});

	test('non-positive section_id is refused for ADMINS too (record_scope sectionId < 1)', async () => {
		for (const sectionId of [0, -1, '0']) {
			const result = await getWidgetData(
				rqoOf(
					{ tipo: INFO_WITH_WIDGETS, section_tipo: SECTION, section_id: sectionId },
					{ widget_name: WIDGET_NAME },
				),
				contextFor(ADMIN),
			);
			expect(result).toEqual({
				status: 200,
				body: { result: false, msg: [' Forbidden record'], errors: ['forbidden'] },
			});
		}
	});
});

describe('get_widget_data — widget resolution refusals (byte-exact PHP messages)', () => {
	test('a tipo with no properties.widgets ⇒ the empty-widgets message, leading AND trailing space', async () => {
		const result = await getWidgetData(
			rqoOf(
				{ tipo: NO_WIDGETS_TIPO, section_tipo: SECTION, section_id: SECTION_ID },
				{ widget_name: WIDGET_NAME },
			),
			contextFor(ADMIN),
		);
		expect(result.status).toBe(200);
		const body = result.body as { result: unknown; msg: string[]; errors: unknown };
		expect(body.result).toBe(false);
		expect(body.errors).toEqual([]);
		// The label is the app-lang term of the tipo (lg-spa: 'input_text').
		expect(body.msg).toEqual([
			' Empty defined widgets for dd_component_info : input_text [test52] ',
		]);
		expect(body.msg[0]?.startsWith(' ')).toBe(true);
		expect(body.msg[0]?.endsWith('] ')).toBe(true);
	});

	test('an unknown tipo (no ontology node) takes the same branch, label = the tipo itself', async () => {
		const result = await getWidgetData(
			rqoOf(
				{ tipo: UNKNOWN_TIPO, section_tipo: SECTION, section_id: SECTION_ID },
				{ widget_name: WIDGET_NAME },
			),
			contextFor(ADMIN),
		);
		expect(result.body).toEqual({
			result: false,
			msg: [` Empty defined widgets for dd_component_info : ${UNKNOWN_TIPO} [${UNKNOWN_TIPO}] `],
			errors: [],
		});
	});

	test('a widget_name none of the declared widgets carries ⇒ empty widget_obj', async () => {
		const result = await getWidgetData(
			rqoOf(
				{ tipo: INFO_WITH_WIDGETS, section_tipo: SECTION, section_id: SECTION_ID },
				{ widget_name: 'not_declared' },
			),
			contextFor(ADMIN),
		);
		expect(result.body).toEqual({
			result: false,
			msg: [' Empty widget_obj for widget not_declared'],
			errors: [],
		});
	});

	test('absent options ⇒ widget_name defaults to the empty string and names itself in the message', async () => {
		const result = await getWidgetData(
			rqoOf({ tipo: INFO_WITH_WIDGETS, section_tipo: SECTION, section_id: SECTION_ID }),
			contextFor(ADMIN),
		);
		expect(result.body).toEqual({
			result: false,
			msg: [' Empty widget_obj for widget '],
			errors: [],
		});
	});
});

describe('get_widget_data — thread-through into the widget compute', () => {
	/** Install a scratch descriptor whose compute ECHOES its arguments. */
	function installEcho(): { names: string[]; calls: { ipo: unknown[]; context: unknown }[] } {
		const names: string[] = [];
		const calls: { ipo: unknown[]; context: unknown }[] = [];
		mock.module(REGISTRY_PATH, () => ({
			...REAL_REGISTRY,
			getInfoWidget: (name: string) => {
				names.push(name);
				return {
					name,
					path: '/scratch/echo',
					computeData: async (ipo: unknown[], context: unknown) => {
						calls.push({ ipo, context });
						return [{ echo: { ipo, context } }];
					},
				};
			},
			widgetComputeData: (descriptor: {
				computeData: (ipo: unknown[], context: unknown) => Promise<unknown>;
			}) => descriptor.computeData,
		}));
		return { names, calls };
	}

	test('the ontology ipo block and the full WidgetContext reach computeData', async () => {
		const echo = installEcho();
		const result = await getWidgetData(
			rqoOf(
				{ tipo: INFO_WITH_WIDGETS, section_tipo: SECTION, section_id: SECTION_ID, mode: 'edit' },
				{ widget_name: WIDGET_NAME },
			),
			contextFor(ADMIN),
		);

		// The registry was asked for the REQUESTED widget name.
		expect(echo.names).toEqual([WIDGET_NAME]);
		expect(echo.calls).toHaveLength(1);

		// ipo === the declared widget's own ipo array (test212's single block).
		const ipo = mustGet(echo.calls[0], 'echo call 0').ipo;
		expect(ipo).toHaveLength(1);
		const block = mustGet(ipo[0], 'ipo block 0') as {
			input: { source: Record<string, unknown>[] };
		};
		expect(mustGet(block.input.source[0], 'ipo input source 0')).toEqual({
			section_id: 'current',
			section_tipo: 'current',
			component_tipo: 'test52',
		});

		// The context is the record coordinates + request identity, verbatim:
		// section_id is passed THROUGH (no Number() coercion on this path).
		expect(mustGet(echo.calls[0], 'echo call 0').context).toEqual({
			sectionTipo: SECTION,
			sectionId: SECTION_ID,
			mode: 'edit',
			lang: 'lg-spa', // currentDataLang() — the suite default data lang
			userId: ADMIN.userId,
			isAdmin: true,
		});

		// …and the compute's return value IS the envelope's result.
		expect(result.body).toEqual({
			result: [{ echo: { ipo, context: mustGet(echo.calls[0], 'echo call 0').context } }],
			msg: 'OK. Request done successfully',
			errors: [],
		});
	});

	test('an absent source.mode defaults to list, and a non-admin identity rides through', async () => {
		const echo = installEcho();
		await getWidgetData(
			rqoOf(
				{ tipo: INFO_WITH_WIDGETS, section_tipo: SECTION, section_id: String(SECTION_ID) },
				{ widget_name: WIDGET_NAME },
			),
			contextFor({ ...ADMIN, isDeveloper: false }),
		);
		expect(mustGet(echo.calls[0], 'echo call 0').context).toEqual({
			sectionTipo: SECTION,
			sectionId: String(SECTION_ID), // the raw client value, uncoerced
			mode: 'list',
			lang: 'lg-spa',
			userId: ADMIN.userId,
			isAdmin: true,
		});
	});
});

describe('get_widget_data — success envelope (real registry)', () => {
	test('the real test_info widget computes over the scratch record', async () => {
		const result = await getWidgetData(
			rqoOf(
				{ tipo: INFO_WITH_WIDGETS, section_tipo: SECTION, section_id: SECTION_ID, mode: 'list' },
				{ widget_name: WIDGET_NAME },
			),
			contextFor(ADMIN),
		);
		expect(result.status).toBe(200);
		// test212 declares two outputs; the scratch record holds no test52 data,
		// so every item carries test_info's placeholder — which encodes the
		// threaded section coordinates.
		expect(result.body).toEqual({
			result: [
				{
					widget: 'test_info',
					key: 0,
					widget_id: 'test_value',
					id: 'test_value',
					value: `test_info widget value for section ${SECTION} - ${SECTION_ID}`,
				},
				{
					widget: 'test_info',
					key: 0,
					widget_id: 'test_label',
					id: 'test_label',
					value: `test_info widget value for section ${SECTION} - ${SECTION_ID}`,
				},
			],
			msg: 'OK. Request done successfully',
			errors: [],
		});
	});
});
