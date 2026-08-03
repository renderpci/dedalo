/**
 * TEMPORAL INSTANCE TRIPWIRE (WC-059) — a temporal instance addresses no record.
 *
 * WHY THIS EXISTS. `source.is_temporal` marks a tool's throwaway editable clone
 * (the propagate tool's value widget, service_tmp_section's staging form, the
 * component_text_area draw/reference pickers). The client stamps a SENTINEL
 * `section_id: 1` on it — not an address. PHP routed the flag to a scratch store
 * (matrix_temp_manager → the unlogged `temp` table); the TS rewrite carried the
 * five client call sites over and did not port the store, `rqoSourceSchema` was
 * `.passthrough()`, and the save door handed `Number(source.section_id)` — the
 * sentinel — straight to `saveComponentData`. Every open of
 * tool_propagate_component_data therefore overwrote the REAL record 1 of the
 * target section, appended a Time Machine row, falsified the modified stamp,
 * and (for relations) created orphan target records. Un-ledgered for a whole
 * engine generation, because nothing greps for a wire field the schema swallows.
 *
 * The assertions below are the door, the flag, the producers and the totality
 * (of dd_core_api's write doors AND of temporal.ts's own reach into the write
 * engines) — behaviour first, because that is the one that would have caught it.
 *
 * Scratch hygiene: the behavioural half asserts against the CANONICAL test3
 * fixture record 1 (which carries a real value — `test52` = 'input text content
 * of one', exactly the shape that was being clobbered) and writes NOTHING to it.
 * The canary's deliberate write goes to a fresh twin, swept in afterAll.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { dispatchRqo } from '../../src/core/api/dispatch.ts';
import type { Rqo } from '../../src/core/concepts/rqo.ts';
import { sql } from '../../src/core/db/postgres.ts';
import { createSectionRecord } from '../../src/core/section/record/create_record.ts';
import { resolvePrincipal } from '../../src/core/security/permissions.ts';
import { createSession, getSession } from '../../src/core/security/session_store.ts';
import { registerSessionCleanup } from '../helpers/session_cleanup.ts';

registerSessionCleanup();

const ROOT = join(import.meta.dir, '../..');
const SECTION = 'test3';
const TABLE = 'matrix_test';
/** The sentinel the client stamps on every temporal instance. */
const SENTINEL_ID = 1;
/** component_input_text, translatable — record 1 holds a real value. */
const LITERAL = 'test52';
/** That value, in the canonical test3 fixture — exactly what was being clobbered. */
const CANONICAL_LITERAL_VALUE = 'input text content of one';
/** component_portal — record 1 holds a real chip. */
const PORTAL = 'test80';

let tsContext: Record<string, unknown>;
let twin = 0;

/** Everything the corruption would have disturbed, in one snapshot. */
async function worldState(sectionId: number): Promise<{
	row: string | null;
	maxTm: number;
	activity: number;
}> {
	const rows = (await sql.unsafe(
		`SELECT to_jsonb(t)::text AS row_text FROM "${TABLE}" t
		 WHERE section_tipo = $1 AND section_id = $2`,
		[SECTION, sectionId],
	)) as { row_text: string | null }[];
	const tm = (await sql.unsafe(
		'SELECT COALESCE(MAX(id), 0)::int AS max_id FROM matrix_time_machine',
		[],
	)) as { max_id: number }[];
	const activity = (await sql.unsafe('SELECT COUNT(*)::int AS n FROM matrix_activity', [])) as {
		n: number;
	}[];
	return {
		row: rows[0]?.row_text ?? null,
		maxTm: tm[0]?.max_id ?? 0,
		activity: activity[0]?.n ?? 0,
	};
}

function saveRqo(options: {
	tipo: string;
	sectionId: number | string;
	temporal: boolean;
	changedData: Record<string, unknown>[];
	entries?: unknown[];
	lang?: string;
}): Record<string, unknown> {
	const source: Record<string, unknown> = {
		typo: 'source',
		type: 'component',
		tipo: options.tipo,
		section_tipo: SECTION,
		section_id: options.sectionId,
		mode: 'edit',
		lang: options.lang ?? 'lg-eng',
		action: null,
	};
	if (options.temporal) source.is_temporal = true;
	return {
		action: 'save',
		dd_api: 'dd_core_api',
		prevent_lock: true,
		source,
		data: {
			section_id: options.sectionId,
			section_tipo: SECTION,
			tipo: options.tipo,
			lang: options.lang ?? 'lg-eng',
			entries: options.entries ?? [],
			changed_data: options.changedData,
		},
	};
}

const dispatch = (rqo: Record<string, unknown>) =>
	dispatchRqo(rqo as unknown as Rqo, tsContext as never);

beforeAll(async () => {
	const token = createSession(-1, 'root', true);
	const session = getSession(token);
	const principal = await resolvePrincipal(-1);
	tsContext = {
		requestId: 'temporal_instance_tripwire',
		clientIp: '127.0.0.1',
		session,
		csrfCandidate: session?.csrfToken ?? null,
		principal,
	};
	twin = await createSectionRecord(SECTION, -1);
});

afterAll(async () => {
	if (twin === 0) return;
	await sql.unsafe(`DELETE FROM "${TABLE}" WHERE section_tipo = $1 AND section_id = $2`, [
		SECTION,
		twin,
	]);
	await sql.unsafe('DELETE FROM matrix_time_machine WHERE section_tipo = $1 AND section_id = $2', [
		SECTION,
		twin,
	]);
	await sql.unsafe(
		`DELETE FROM matrix_activity
		 WHERE section_tipo = 'dd542'
		   AND misc->'dd551'->0->'value'->>'section_id' = $1`,
		[String(twin)],
	);
});

describe('WC-059 — the temporal door never persists', () => {
	test('opening a temporal instance never touches record 1 (matrix row, Time Machine and activity all unchanged)', async () => {
		const before = await worldState(SENTINEL_ID);
		// Presence first: a vacuous pass ("nothing changed" because the record was
		// never there) would prove nothing. Record 1 must be a REAL record.
		expect(before.row).not.toBeNull();
		expect(before.row).toContain(CANONICAL_LITERAL_VALUE);

		const response = await dispatch(
			saveRqo({
				tipo: LITERAL,
				sectionId: SENTINEL_ID,
				temporal: true,
				// The client's real shape: change_value applies the delta to
				// self.data.entries FIRST and then saves clone(self.data), so
				// `entries` is already POST-delta (component_common.js:1272-1278).
				entries: [{ id: 1, lang: 'lg-eng', value: 'TEMPORAL_ONLY' }],
				changedData: [
					{ action: 'set_data', value: [{ id: 1, lang: 'lg-eng', value: 'TEMPORAL_ONLY' }] },
				],
			}),
		);

		// The door answered, and answered with the applied value.
		expect(response.status).toBe(200);
		const body = response.body as { result: { data: Record<string, unknown>[] } };
		const item = body.result.data.find((entry) => entry.tipo === LITERAL);
		expect(item).toBeDefined();
		// The client resolves its item by the stringified record id — the sentinel
		// must come back verbatim or the widget silently keeps its old value.
		expect(String(item?.section_id)).toBe(String(SENTINEL_ID));
		expect(item?.entries).toEqual([{ id: 1, lang: 'lg-eng', value: 'TEMPORAL_ONLY' }]);

		// And NOTHING happened to the world.
		const after = await worldState(SENTINEL_ID);
		expect(after.row).toBe(before.row);
		expect(after.maxTm).toBe(before.maxTm);
		expect(after.activity).toBe(before.activity);
	});

	test('CANARY — the probe can see a real write (otherwise the test above passes vacuously)', async () => {
		const before = await worldState(twin);
		const response = await dispatch(
			saveRqo({
				tipo: LITERAL,
				sectionId: twin,
				temporal: false,
				changedData: [
					{ action: 'set_data', value: [{ id: 1, lang: 'lg-eng', value: 'CANARY_WROTE' }] },
				],
			}),
		);
		expect(response.status).toBe(200);
		const after = await worldState(twin);
		// The SAME three probes that reported "unchanged" above must move here, or
		// they are not measuring anything.
		expect(after.row).not.toBe(before.row);
		expect(after.row).toContain('CANARY_WROTE');
		expect(after.maxTm).toBeGreaterThan(before.maxTm);
	});

	test('a temporal RELATION save echoes resolved chips and leaves the host untouched', async () => {
		const before = await worldState(SENTINEL_ID);
		const response = await dispatch(
			saveRqo({
				tipo: PORTAL,
				sectionId: SENTINEL_ID,
				temporal: true,
				lang: 'lg-nolan',
				entries: [
					{
						id: 1,
						type: 'dd151',
						section_id: '27',
						section_tipo: 'test3',
						from_component_tipo: PORTAL,
					},
				],
				changedData: [
					{
						action: 'insert',
						id: null,
						value: { type: 'dd151', section_id: '40', section_tipo: 'test38' },
					},
				],
			}),
		);
		expect(response.status).toBe(200);
		const body = response.body as {
			result: { context: unknown[]; data: Record<string, unknown>[] };
		};
		const item = body.result.data.find((entry) => entry.tipo === PORTAL);
		expect(item).toBeDefined();
		// The client's link_record reads pagination.total and requires it to have
		// grown; the chip list must carry BOTH the prior chip and the new one.
		expect((item?.pagination as { total?: number } | undefined)?.total).toBe(2);
		expect((item?.entries as unknown[]).length).toBe(2);
		// Relation echoes carry context too (the client reuses the save response as
		// a build response — component_portal.js:632 reads result.context.length).
		expect(body.result.context.length).toBeGreaterThan(0);

		const after = await worldState(SENTINEL_ID);
		expect(after.row).toBe(before.row);
		expect(after.maxTm).toBe(before.maxTm);
		expect(after.activity).toBe(before.activity);
	});

	test('an action outside the temporal allowlist is refused loudly, never silently applied', async () => {
		const before = await worldState(SENTINEL_ID);
		const response = await dispatch(
			saveRqo({
				tipo: LITERAL,
				sectionId: SENTINEL_ID,
				temporal: true,
				changedData: [{ action: 'sort_by_column', value: null }],
			}),
		);
		expect(response.status).toBe(400);
		expect(JSON.stringify(response.body)).toContain('temporal');
		const after = await worldState(SENTINEL_ID);
		expect(after.row).toBe(before.row);
	});

	test('the record-lifecycle doors refuse a temporal instance', async () => {
		const before = await worldState(SENTINEL_ID);
		for (const action of ['create', 'duplicate', 'delete']) {
			const response = await dispatchRqo(
				{
					action,
					dd_api: 'dd_core_api',
					source: {
						tipo: LITERAL,
						section_tipo: SECTION,
						section_id: SENTINEL_ID,
						is_temporal: true,
					},
				} as unknown as Rqo,
				tsContext as never,
			);
			expect(response.status, `${action} must refuse a temporal source`).toBe(400);
			expect(JSON.stringify(response.body)).toContain('temporal');
		}
		const after = await worldState(SENTINEL_ID);
		expect(after.row).toBe(before.row);
	});
});

// ---------------------------------------------------------------------------
// Static halves — the flag, the producers, the totality.
// ---------------------------------------------------------------------------

/** Strip comments so PROSE about the flag never satisfies (or trips) a scan. */
function stripComments(source: string): string {
	return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function walk(dir: string, out: string[] = []): string[] {
	for (const entry of readdirSync(dir)) {
		if (entry === 'node_modules' || entry.startsWith('.')) continue;
		const full = join(dir, entry);
		if (statSync(full).isDirectory()) walk(full, out);
		else out.push(full);
	}
	return out;
}

describe('WC-059 — the flag has one reader and a frozen producer set', () => {
	test('src/ reads source.is_temporal in exactly ONE place (the predicate)', () => {
		const readers = walk(join(ROOT, 'src'))
			.filter((file) => file.endsWith('.ts'))
			.filter((file) => stripComments(readFileSync(file, 'utf8')).includes('is_temporal'))
			.map((file) => file.slice(ROOT.length + 1))
			.sort();
		// The wire field is touched only where it is DECLARED; every door goes
		// through isTemporalSource. A second reader is how a concept acquires a
		// second, subtly different definition — which is the failure mode that
		// produced this bug in the first place (the client's notion of "temporal"
		// and the server's silently diverged).
		expect(readers).toEqual(['src/core/concepts/rqo.ts']);
	});

	test('the CLIENT producers of is_temporal are a frozen, reason-stamped allowlist', () => {
		// An allowlist you may append to is not an allowlist. A sixth temporal
		// producer must fail HERE — in CI — not in a user's data, because a
		// producer the door does not cover is a 400 in the user's face at best
		// and (before this door existed) a silent overwrite at worst.
		const PRODUCERS: Record<string, string> = {
			'tools/tool_propagate_component_data/js/tool_propagate_component_data.js':
				'the propagation value widget — a clone of the clicked component, built on every tool open',
			'client/dedalo/core/services/service_tmp_section/js/service_tmp_section.js':
				'the staging form behind tool_import_marc21 / zotero / files',
			'client/dedalo/core/component_text_area/js/render_draw.js': 'the F2 draw-tag modal',
			'client/dedalo/core/component_text_area/js/render_reference.js':
				'the reference/thesaurus tag picker',
			'client/dedalo/core/section/js/view_graph_solved_section.js':
				'graph-view fallback instance (never built, never saved)',
			'client/dedalo/core/common/js/common.js':
				'create_source — the SENDER: forwards self.is_temporal onto the RQO source',
			'client/dedalo/core/component_common/js/component_common.js':
				'the instance option itself (self.is_temporal = options.is_temporal ?? false)',
		};
		const found = [...walk(join(ROOT, 'client')), ...walk(join(ROOT, 'tools'))]
			.filter((file) => file.endsWith('.js'))
			.filter((file) => stripComments(readFileSync(file, 'utf8')).includes('is_temporal'))
			.map((file) => file.slice(ROOT.length + 1))
			.sort();
		expect(found).toEqual(Object.keys(PRODUCERS).sort());
		for (const [file, reason] of Object.entries(PRODUCERS)) {
			expect(reason.length, `${file} needs a substantive reason`).toBeGreaterThan(20);
		}
	});

	// WC-079 applies the SAME discipline to the persistence opt-in. Without it the
	// safety argument for the store is unenforced prose: the whole reason the other
	// four temporal producers are safe is that they never send a scope, and nothing
	// would have stopped a fifth from starting to.
	test('src/ reads source.temporal_scope in exactly ONE place (the address builder)', () => {
		const readers = walk(join(ROOT, 'src'))
			.filter((file) => file.endsWith('.ts'))
			.filter((file) => stripComments(readFileSync(file, 'utf8')).includes('temporal_scope'))
			.map((file) => file.slice(ROOT.length + 1))
			.sort();
		// Declared in rqo.ts, read only by temporal_store.temporalScratchAddress.
		expect(readers).toEqual([
			'src/core/concepts/rqo.ts',
			'src/core/section/record/temporal_store.ts',
		]);
	});

	test('the CLIENT producers of temporal_scope are a frozen, reason-stamped allowlist', () => {
		// A fifth producer opting itself in is the WC-079 nightmare: the propagate
		// tool would start restoring a stale value into a bulk write across every
		// SQO match. That must fail in CI, not in a user's records.
		const SCOPE_PRODUCERS: Record<string, string> = {
			'client/dedalo/core/services/service_tmp_section/js/service_tmp_section.js':
				'the ONLY producer that opts in — the staging form, whose children autoload and so need the value back',
			'client/dedalo/core/common/js/common.js':
				'create_source — the SENDER: forwards self.temporal_scope onto the RQO source',
			'client/dedalo/core/component_common/js/component_common.js':
				'the instance option itself (self.temporal_scope = options.temporal_scope ?? null)',
		};
		const found = [...walk(join(ROOT, 'client')), ...walk(join(ROOT, 'tools'))]
			.filter((file) => file.endsWith('.js'))
			.filter((file) => stripComments(readFileSync(file, 'utf8')).includes('temporal_scope'))
			.map((file) => file.slice(ROOT.length + 1))
			.sort();
		expect(found).toEqual(Object.keys(SCOPE_PRODUCERS).sort());
		for (const [file, reason] of Object.entries(SCOPE_PRODUCERS)) {
			expect(reason.length, `${file} needs a substantive reason`).toBeGreaterThan(20);
		}
	});

	test('every RECORD-WRITING dd_core_api door consults isTemporalSource', () => {
		const handlerPath = join(ROOT, 'src/core/api/handlers/dd_core_api.ts');
		const source = stripComments(readFileSync(handlerPath, 'utf8'));
		// Split the action map into per-action bodies: `\n\t<name>: async (`.
		const bodies = new Map<string, string>();
		const heads = [...source.matchAll(/\n\t([a-z_]+): async \(/g)];
		for (let index = 0; index < heads.length; index++) {
			const start = heads[index]?.index ?? 0;
			const end =
				index + 1 < heads.length ? (heads[index + 1]?.index ?? source.length) : source.length;
			bodies.set(heads[index]?.[1] as string, source.slice(start, end));
		}
		expect(bodies.size).toBeGreaterThan(0);

		// The write ENGINES a door must funnel through to touch a matrix record.
		// Deriving the door set from these — instead of allowlisting read doors —
		// means a NEW write door is covered the day it is written, and no stale
		// exemption can quietly go wrong.
		const WRITE_ENGINES = [
			'saveComponentData',
			'createSectionRecord',
			'duplicateSectionRecord',
			'deleteSectionRecord',
			'deleteSectionData',
		];
		const writeDoors = [...bodies].filter(
			([, body]) => body.includes('section_id') && WRITE_ENGINES.some((fn) => body.includes(fn)),
		);
		// Self-test: if the engine names are ever renamed, this scan would silently
		// find nothing and pass. The four known write doors must be present.
		expect(writeDoors.map(([action]) => action).sort()).toEqual([
			'create',
			'delete',
			'duplicate',
			'save',
		]);

		const missing = writeDoors
			.filter(([, body]) => !body.includes('isTemporalSource'))
			.map(([action]) => action);
		expect(
			missing,
			`dd_core_api doors that WRITE a record without consulting isTemporalSource: ${missing.join(', ')}`,
		).toEqual([]);
	});

	test('the temporal door itself reaches exactly ONE write engine, and it is add_new_element', () => {
		// The scan above only sees dd_core_api. A write reached THROUGH temporal.ts
		// is invisible to it — and there is exactly one: applyAddNewElement, which
		// creates the TARGET record. Pin that to one call site so a second write
		// cannot be added to this door without deliberately editing this list, and
		// so the "never persists" claim in the module header and in WC-059 stays
		// true-with-a-named-exception rather than quietly false.
		const source = stripComments(
			readFileSync(join(ROOT, 'src/core/section/record/temporal.ts'), 'utf8'),
		);
		const WRITE_ENGINES = [
			'saveComponentData',
			'createSectionRecord',
			'duplicateSectionRecord',
			'deleteSectionRecord',
			'deleteSectionData',
			'persistRecordKeys',
			'updateMatrixRecord',
			'insertMatrixRecordWithCounter',
			'recordTimeMachine',
		];
		const reached = WRITE_ENGINES.filter((engine) => source.includes(engine));
		expect(
			reached,
			`temporal.ts must reach no write engine directly: ${reached.join(', ')}`,
		).toEqual([]);
		// The one indirect write, and its guards, must be present together.
		const addNewCalls = source.match(/applyAddNewElement\(/g) ?? [];
		expect(addNewCalls.length).toBe(1);
		expect(source).toContain('isConsultationOnlySection');
		expect(source).toContain('skipHostFilterRead');
	});
});
