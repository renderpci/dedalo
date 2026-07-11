/**
 * Inspector component_history gate: the per-component TM history read
 * (service_time_machine view 'history') vs live PHP — the surface behind the
 * inspector's "Component history" block.
 *
 * Pins the rsc329 ANNOTATION item contract consumed by view_note_text_area.js:
 * `entries` (lang-filtered note text; EMPTY when no note — a non-empty entries
 * paints the note icon green), `matrix_id` (the TM row id; note creation aborts
 * without it), `parent_section_tipo` (rsc832 — the create/delete RQO target),
 * `parent_section_id` (the existing note record or null) and
 * `created_by_user_id`. Regression gate for the 2026-07-10 inspector bugs:
 * always-green note icons + the note modal failing to open.
 *
 * Scratch hygiene: the with-note case seeds a disposable rsc832 note row by
 * SQL (code rsc835 = the newest TM row id of the corpus component) and deletes
 * it in afterAll — no real record is mutated.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { config } from '../../src/config/config.ts';
import { dispatchRqo } from '../../src/core/api/dispatch.ts';
import { sql } from '../../src/core/db/postgres.ts';
import { resolvePrincipal } from '../../src/core/security/permissions.ts';
import { createSession, getSession } from '../../src/core/security/session_store.ts';
import { PhpApiClient, hasPhpCredentials } from './php_client.ts';

/** A record with real TM history on this install (same corpus as tm_read). */
const CALLER = { section_tipo: 'rsc1242', section_id: '578' };
const COMPONENT = { tipo: 'rsc1246', model: 'component_radio_button', lang: 'lg-nolan' };
/** Scratch rsc832 note row (seeded/deleted here; far above the live counter). */
const SCRATCH_NOTE_SECTION_ID = 999983;
const NOTE_TEXT = '<p>tm history parity scratch note</p>';

/** The inspector's history RQO (load_component_history → build_request_config). */
function historyRqo(): Record<string, unknown> {
	return {
		action: 'read',
		dd_api: 'dd_core_api',
		prevent_lock: true,
		source: {
			typo: 'source',
			type: 'tm',
			model: 'section',
			tipo: 'dd15',
			section_tipo: 'dd15',
			action: 'search',
			mode: 'list',
			lang: 'lg-spa',
		},
		sqo: {
			id: 'time_machine_temporal',
			mode: 'tm',
			section_tipo: [CALLER.section_tipo],
			limit: 10,
			offset: 0,
			order: [{ direction: 'DESC', path: [{ component_tipo: 'id' }] }],
			skip_projects_filter: true,
			filter_by_locators: [
				{
					section_tipo: CALLER.section_tipo,
					section_id: CALLER.section_id,
					tipo: COMPONENT.tipo,
					lang: COMPONENT.lang,
				},
			],
		},
		show: {
			ddo_map: [
				{
					id: 'when',
					tipo: 'dd559',
					type: 'component',
					typo: 'ddo',
					model: 'component_date',
					section_tipo: 'dd15',
					parent: 'dd15',
					mode: 'tm',
					view: 'mini',
					properties: { date_mode: 'date_time' },
				},
				{
					id: 'who',
					tipo: 'dd578',
					type: 'component',
					typo: 'ddo',
					model: 'component_autocomplete',
					section_tipo: 'dd15',
					parent: 'dd15',
					mode: 'tm',
					view: 'mini',
				},
				{
					// the selected component (inspector passes its model/tipo)
					typo: 'ddo',
					type: 'component',
					model: COMPONENT.model,
					tipo: COMPONENT.tipo,
					section_tipo: 'dd15',
					parent: 'dd15',
					mode: 'tm',
					fixed_mode: true,
					view: 'text',
				},
				{
					// the annotation column (view_note_text_area contract)
					typo: 'ddo',
					type: 'component',
					model: 'component_text_area',
					tipo: 'rsc329',
					section_tipo: 'dd15',
					parent: 'dd15',
					mode: 'tm',
					fixed_mode: true,
					view: 'note',
				},
			],
		},
	};
}

/**
 * The full annotation-item projection — every field view_note_text_area.js
 * reads, plus the standard read-differential normalization fields. PHP emits
 * `entries: null` for an empty value; TS emits `[]` (WC-001) — normalize the
 * PHP side before diffing, the ledgered pattern.
 */
function comparableNoteItem(item: Record<string, unknown>): Record<string, unknown> {
	return {
		tipo: item.tipo,
		section_tipo: item.section_tipo,
		section_id: item.section_id,
		mode: item.mode,
		lang: item.lang,
		from_component_tipo: item.from_component_tipo ?? null,
		entries: item.entries ?? [],
		fallback_value: item.fallback_value ?? null,
		row_section_id: item.row_section_id ?? null,
		parent_tipo: item.parent_tipo ?? null,
		parent_section_id: item.parent_section_id ?? null,
		parent_section_tipo: item.parent_section_tipo ?? null,
		created_by_user_id: item.created_by_user_id ?? null,
		matrix_id: item.matrix_id ?? null,
	};
}

let annotatedTmRowId = 0;
let phpData: Record<string, unknown>[] = [];
let tsData: Record<string, unknown>[] = [];
let phpContext: Record<string, unknown>[] = [];
let tsContext: Record<string, unknown>[] = [];

async function deleteScratchNote(): Promise<void> {
	await sql`DELETE FROM matrix_notes
		WHERE section_tipo = 'rsc832' AND section_id = ${SCRATCH_NOTE_SECTION_ID}`;
}

beforeAll(async () => {
	if (!hasPhpCredentials()) return;

	// The newest TM row of the corpus component gets the scratch note; the rest
	// of the page stays note-less (both states asserted below).
	const tmRows = (await sql.unsafe(
		`SELECT id FROM matrix_time_machine
		 WHERE section_tipo = $1 AND section_id = $2 AND tipo = $3 AND lang = $4
		 ORDER BY id DESC LIMIT 2`,
		[CALLER.section_tipo, Number(CALLER.section_id), COMPONENT.tipo, COMPONENT.lang],
	)) as { id: number }[];
	if (tmRows.length < 2) {
		throw new Error(
			`component_history gate corpus gone: ${COMPONENT.tipo}@${CALLER.section_tipo}/${CALLER.section_id} has ${tmRows.length} TM rows (need 2) — pick a new corpus record`,
		);
	}
	annotatedTmRowId = tmRows[0]?.id ?? 0;

	await deleteScratchNote(); // leftovers from a crashed prior run
	await sql.unsafe(
		`INSERT INTO matrix_notes (section_id, section_tipo, data, string, number)
		 VALUES ($1, 'rsc832',
			jsonb_build_object('section_id', $1::int, 'section_tipo', 'rsc832', 'created_by_user_id', -1),
			jsonb_build_object('rsc329', jsonb_build_array(jsonb_build_object('id', 1, 'lang', 'lg-spa', 'value', $2::text))),
			jsonb_build_object('rsc835', jsonb_build_array(jsonb_build_object('id', 1, 'value', $3::int))))`,
		[SCRATCH_NOTE_SECTION_ID, NOTE_TEXT, annotatedTmRowId],
	);

	const php = new PhpApiClient();
	await php.login(config.phpReference.username as string, config.phpReference.password as string);
	const phpResult = await php.call(historyRqo());
	const phpBody = phpResult.body as { result?: { data?: unknown[]; context?: unknown[] } };
	phpData = (phpBody.result?.data ?? []) as Record<string, unknown>[];
	phpContext = (phpBody.result?.context ?? []) as Record<string, unknown>[];

	const token = createSession(-1, 'root', true);
	const session = getSession(token);
	const principal = await resolvePrincipal(-1);
	const tsResult = await dispatchRqo(
		historyRqo() as never,
		{
			requestId: 't',
			clientIp: '127.0.0.1',
			session,
			csrfCandidate: session?.csrfToken ?? null,
			principal,
		} as never,
	);
	const tsBody = tsResult.body as { result?: { data?: unknown[]; context?: unknown[] } };
	tsData = (tsBody.result?.data ?? []) as Record<string, unknown>[];
	tsContext = (tsBody.result?.context ?? []) as Record<string, unknown>[];
});

afterAll(async () => {
	if (!hasPhpCredentials()) return;
	await deleteScratchNote();
});

describe.if(hasPhpCredentials())('inspector component_history differential', () => {
	test('every rsc329 annotation item matches PHP on the full note-view contract', () => {
		if (!hasPhpCredentials()) return;
		const noteItems = (data: Record<string, unknown>[]) =>
			data.slice(1).filter((item) => item.tipo === 'rsc329');
		const phpByRow = new Map(
			noteItems(phpData).map((item) => [item.row_section_id, comparableNoteItem(item)]),
		);
		const tsByRow = new Map(
			noteItems(tsData).map((item) => [item.row_section_id, comparableNoteItem(item)]),
		);
		expect(phpByRow.size).toBeGreaterThan(1);
		expect([...tsByRow.keys()].sort()).toEqual([...phpByRow.keys()].sort());
		for (const [row, phpItem] of phpByRow) {
			expect(tsByRow.get(row)).toEqual(phpItem);
		}
	});

	test('the seeded note row resolves the note (non-vacuous: green-icon + open-note path)', () => {
		if (!hasPhpCredentials()) return;
		for (const [engine, data] of [
			['php', phpData],
			['ts', tsData],
		] as const) {
			const item = data
				.slice(1)
				.find(
					(candidate) =>
						candidate.tipo === 'rsc329' && candidate.row_section_id === annotatedTmRowId,
				) as Record<string, unknown> | undefined;
			expect(item, `${engine}: seeded row annotation item missing`).toBeDefined();
			const entries = (item?.entries ?? []) as Record<string, unknown>[];
			expect(entries.length, `${engine}: seeded note entries`).toBe(1);
			expect(entries[0]?.value, `${engine}: seeded note text`).toBe(NOTE_TEXT);
			// the lifted navigation fields (string section_id — PHP driver shape)
			expect(item?.parent_section_id, `${engine}: parent_section_id`).toBe(
				String(SCRATCH_NOTE_SECTION_ID),
			);
			expect(item?.parent_section_tipo, `${engine}: parent_section_tipo`).toBe('rsc832');
			expect(item?.matrix_id, `${engine}: matrix_id`).toBe(annotatedTmRowId);
		}
	});

	test('per-column context lang matches PHP (translatable rsc329 → data lang, else lg-nolan)', () => {
		if (!hasPhpCredentials()) return;
		// The rsc329 context lang seeds the note modal's EDITOR lang — a mismatch
		// makes saved notes invisible to the lang-filtered TM read (grey icon over
		// existing text). PHP: translatable columns get the data lang, the rest
		// lg-nolan.
		const projection = (context: Record<string, unknown>[]) =>
			context
				.filter((entry) => entry.tipo !== undefined && entry.type !== 'section')
				.map((entry) => ({
					tipo: entry.tipo,
					lang: entry.lang,
					mode: entry.mode,
					view: entry.view ?? null,
					permissions: entry.permissions,
				}))
				.sort((a, b) => String(a.tipo).localeCompare(String(b.tipo)));
		const phpColumns = projection(phpContext);
		expect(phpColumns.length).toBeGreaterThan(0);
		expect(phpColumns.find((entry) => entry.tipo === 'rsc329')).toBeDefined();
		expect(projection(tsContext)).toEqual(phpColumns);
	});

	test('note-less rows emit an EMPTY annotation value (grey icon), matrix_id intact', () => {
		if (!hasPhpCredentials()) return;
		for (const [engine, data] of [
			['php', phpData],
			['ts', tsData],
		] as const) {
			const bare = data
				.slice(1)
				.filter(
					(candidate) =>
						candidate.tipo === 'rsc329' && candidate.row_section_id !== annotatedTmRowId,
				) as Record<string, unknown>[];
			expect(bare.length, `${engine}: note-less rows`).toBeGreaterThan(0);
			for (const item of bare) {
				expect(((item.entries ?? []) as unknown[]).length, `${engine}: empty entries`).toBe(0);
				expect(item.parent_section_id ?? null, `${engine}: no note record`).toBeNull();
				expect(item.matrix_id, `${engine}: matrix_id present`).toBe(item.row_section_id);
			}
		}
	});
});
