/**
 * calculation widget (component_calculation → component_info) — TS-NATIVE
 * half, the DEC-14b survival twin of
 * test/parity/calculation_widget_differential.test.ts (its PHP legs die with
 * the oracle; the contracts it pinned survive HERE against the TS engine
 * alone).
 *
 * Re-expressed contracts (scratch numisdata179 twins — metal analyses):
 *  - SAVE: saving a metal number (numisdata182 = 40.5) through dispatchRqo
 *    persists to the `number` column while the numisdata1125 calculation
 *    output stays NULL in every candidate column — TS computes nothing at
 *    save time (DEC-06). This is the differential's byte-pinned end-state
 *    {input:[{id:1,value:40.5}], output:null} (equal on both engines: PHP's
 *    save-time compute is a pinned live defect — array_sum crashes AFTER the
 *    value persists, so the effective PHP outcome is the same);
 *  - READ, empty inputs: reading numisdata1125 on a fresh twin (no metals)
 *    emits the golden [{widget:'calculation', key:0, id:'total',
 *    widget_id:'total', value:0}] — oracle-pinned by
 *    test/parity/info_widget_differential.test.ts ('summarize survives with
 *    EMPTY inputs', WC-026 dual id/widget_id keys);
 *  - READ, non-empty inputs: the summarize formula emits NO output (the
 *    PHP-crash defect pin's effective outcome — entries []), also
 *    oracle-pinned by info_widget_differential's calc twin.
 *
 * NOT re-expressed: the differential's stored-output READ pin
 * (numisdata179/17 → total 100.18) asserts a MUTABLE production record's
 * stored widget value — forbidden natively; the empty-input golden above is
 * its survival shape.
 *
 * SOFTENED / TS-side note: the SAVE response envelope is not asserted (never
 * oracle-pinned — the PHP save died in the widget); the DB end-state is the
 * contract.
 *
 * Scratch hygiene: two fresh numisdata179 records (matrix), rows + TM swept
 * fail-loud in afterAll.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { dispatchRqo } from '../../src/core/api/dispatch.ts';
import { sql } from '../../src/core/db/postgres.ts';
import { createSectionRecord } from '../../src/core/section/record/create_record.ts';
import { resolvePrincipal } from '../../src/core/security/permissions.ts';
import { createSession, getSession } from '../../src/core/security/session_store.ts';
import { registerSessionCleanup } from '../helpers/session_cleanup.ts';

registerSessionCleanup();

const SECTION = 'numisdata179'; // metal analyses (matrix)
const INPUT = 'numisdata182'; // 'au' number
const OUTPUT = 'numisdata1125'; // 'total' calculation

let savedId = 0;
let emptyId = 0;
let savedState: Record<string, unknown> = {};
let savedEntries: unknown;
let emptyEntries: unknown;

async function rootContext(): Promise<Record<string, unknown>> {
	const token = createSession(-1, 'root', true);
	const session = getSession(token);
	const principal = await resolvePrincipal(-1);
	return {
		requestId: 'calculation_native_test',
		clientIp: '127.0.0.1',
		session,
		csrfCandidate: session?.csrfToken ?? null,
		principal,
	};
}

/** The differential's exact SAVE RQO (PHP-verified wire shape). */
function saveRqo(id: number): Record<string, unknown> {
	const item = { id: 1, value: 40.5 };
	return {
		action: 'save',
		dd_api: 'dd_core_api',
		prevent_lock: true,
		source: {
			typo: 'source',
			type: 'component',
			model: 'component_number',
			tipo: INPUT,
			section_tipo: SECTION,
			section_id: String(id),
			mode: 'edit',
			lang: 'lg-nolan',
			action: null,
		},
		data: {
			section_id: String(id),
			section_tipo: SECTION,
			tipo: INPUT,
			lang: 'lg-nolan',
			from_component_tipo: INPUT,
			value: [item],
			changed_data: [{ action: 'set_data', key: null, value: [item] }],
		},
	};
}

/** The differential's READ RQO (ddo_map over the calculation output). */
function readRqo(id: number): Record<string, unknown> {
	return {
		action: 'read',
		dd_api: 'dd_core_api',
		prevent_lock: true,
		options: {},
		source: {
			typo: 'source',
			model: 'section',
			tipo: SECTION,
			section_tipo: SECTION,
			action: 'search',
			mode: 'list',
			lang: 'lg-spa',
		},
		sqo: {
			section_tipo: [SECTION],
			limit: 1,
			offset: 0,
			filter_by_locators: [{ section_tipo: SECTION, section_id: String(id) }],
		},
		show: { ddo_map: [{ tipo: OUTPUT, section_tipo: SECTION, parent: SECTION, mode: 'list' }] },
	};
}

/** The differential's stateOf: input column + every candidate output column. */
async function stateOf(id: number): Promise<Record<string, unknown>> {
	const rows = (await sql.unsafe(
		`SELECT number->$2 AS input,
		        COALESCE(data->$3, number->$3, misc->$3) AS output
		 FROM matrix WHERE section_tipo = $1 AND section_id = $4`,
		[SECTION, INPUT, OUTPUT, id],
	)) as { input: unknown; output: unknown }[];
	return { input: rows[0]?.input ?? null, output: rows[0]?.output ?? null };
}

async function readEntries(id: number): Promise<unknown> {
	const context = await rootContext();
	const response = (await dispatchRqo(structuredClone(readRqo(id)) as never, context as never))
		.body as { result?: { data?: { entries?: unknown }[] } };
	return (response.result?.data ?? []).slice(1).map((item) => item.entries);
}

beforeAll(async () => {
	savedId = await createSectionRecord(SECTION, -1);
	emptyId = await createSectionRecord(SECTION, -1);

	const context = await rootContext();
	await dispatchRqo(structuredClone(saveRqo(savedId)) as never, context as never);
	savedState = await stateOf(savedId);
	savedEntries = await readEntries(savedId);
	emptyEntries = await readEntries(emptyId);
}, 60000);

afterAll(async () => {
	const leaked: string[] = [];
	for (const id of [savedId, emptyId]) {
		if (id === 0) continue;
		const deleted = (await sql.unsafe(
			'DELETE FROM matrix WHERE section_tipo = $1 AND section_id = $2 RETURNING id',
			[SECTION, id],
		)) as unknown[];
		if (deleted.length === 0) leaked.push(`${SECTION}/${id}`);
		await sql.unsafe(
			'DELETE FROM matrix_time_machine WHERE section_tipo = $1 AND section_id = $2',
			[SECTION, id],
		);
	}
	if (leaked.length > 0) {
		throw new Error(`cleanup leaked scratch rows: ${leaked.join(', ')}`);
	}
});

describe('calculation widget, TS-native (DEC-06 no-compute + read goldens)', () => {
	test('SAVE persists the number; the calculation output stays null', () => {
		// the differential's byte-pinned end-state (equal on both engines)
		expect(savedState).toEqual({ input: [{ id: 1, value: 40.5 }], output: null });
	});

	test('READ with EMPTY inputs emits the total:0 golden (WC-026 keys)', () => {
		expect(emptyEntries).toEqual([
			[{ widget: 'calculation', key: 0, id: 'total', widget_id: 'total', value: 0 }],
		]);
	});

	test('READ with a non-empty input emits NO output (the PHP-crash pin outcome)', () => {
		expect(savedEntries).toEqual([[]]);
	});
});
