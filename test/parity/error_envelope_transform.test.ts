/**
 * Error-envelope v2 gate-side transform — TOTALITY + ANTI-VACUITY gate for
 * `adoptErrorEnvelopeV2` (test/parity/normalize.ts; plan §4 parity
 * reconciliation, WC-001 transform pattern).
 *
 * Credless, fixtures-only: walks EVERY harvest file, finds every interaction
 * whose ROOT body is `result:false`, and asserts each is classified with the
 * kind the table declares. The root-false COUNT is PINNED — the store is
 * frozen (a re-harvest is impossible), so any change is a deliberate contract
 * edit and must move this number AND the table together.
 */
import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { adoptErrorEnvelopeV2, FROZEN_ERROR_BODIES } from './normalize.ts';
import { oracleHarvestDir } from './oracle_fixtures.ts';

/** Pinned 2026-08-15: 8 root `result:false` bodies across 7 harvest files. */
const PINNED_ROOT_FALSE_BODIES = 8;
const PINNED_ROOT_FALSE_FILES = 7;

interface RootFalseBody {
	gate: string;
	body: { result: unknown; msg?: unknown; errors?: unknown };
}

function collectRootFalseBodies(): RootFalseBody[] {
	const found: RootFalseBody[] = [];
	for (const name of readdirSync(oracleHarvestDir)
		.filter((n) => n.endsWith('.json'))
		.sort()) {
		const parsed = JSON.parse(readFileSync(join(oracleHarvestDir, name), 'utf8')) as {
			interactions: Record<string, { kind: string; body?: unknown; text?: string }>;
		};
		for (const interaction of Object.values(parsed.interactions)) {
			let body: unknown = interaction.body;
			if (interaction.kind === 'raw' && typeof interaction.text === 'string') {
				try {
					body = JSON.parse(interaction.text);
				} catch {
					continue;
				}
			}
			if (
				body !== null &&
				typeof body === 'object' &&
				(body as { result?: unknown }).result === false
			) {
				found.push({ gate: name.replace(/\.json$/, ''), body: body as RootFalseBody['body'] });
			}
		}
	}
	return found;
}

const rootFalse = collectRootFalseBodies();

describe('error envelope v2 transform — totality over the frozen store', () => {
	test('root result:false count is pinned (frozen store)', () => {
		expect(rootFalse.length).toBe(PINNED_ROOT_FALSE_BODIES);
		expect(new Set(rootFalse.map((r) => r.gate)).size).toBe(PINNED_ROOT_FALSE_FILES);
		expect(FROZEN_ERROR_BODIES.length).toBe(PINNED_ROOT_FALSE_BODIES);
	});

	test('every frozen root-false body is classified with the table kind', () => {
		for (const { gate, body } of rootFalse) {
			const adopted = adoptErrorEnvelopeV2(body);
			const row = FROZEN_ERROR_BODIES.find(
				(entry) =>
					JSON.stringify([entry.msg, entry.errors]) === JSON.stringify([body.msg, body.errors]),
			);
			expect(row, `${gate}: no table row`).toBeDefined();
			expect(row?.gate).toBe(gate);
			expect(adopted.matched).toBe(true);
			expect(adopted.kind).toBe(row?.kind as never);
			if (row?.kind === 'error') {
				expect(adopted.projection).toEqual({
					ok: false,
					error: row.details ? { code: row.code, details: row.details } : { code: row.code },
				});
			} else {
				expect(adopted.projection).toBeNull();
			}
		}
	});

	test('every table row is backed by a frozen body (no orphan rows)', () => {
		const frozenKeys = new Set(rootFalse.map((r) => JSON.stringify([r.body.msg, r.body.errors])));
		for (const entry of FROZEN_ERROR_BODIES) {
			expect(frozenKeys.has(JSON.stringify([entry.msg, entry.errors])), entry.gate).toBe(true);
		}
	});

	test('plan §4 code map', () => {
		const byGate = (gate: string) => FROZEN_ERROR_BODIES.filter((e) => e.gate === gate);
		expect(byGate('section_terms_differential')[0]?.code).toBe('section.bad_locators');
		expect(byGate('indexation_grid_differential')[0]?.code).toBe('request.invalid_source');
		expect(
			byGate('get_widget_data_differential')
				.map((e) => e.code)
				.sort(),
		).toEqual(['widget.empty', 'widget.not_defined']);
		const guard = byGate('delete_children_guard_differential')[0];
		expect(guard?.code).toBe('record.delete_children_refused');
		// the refused id survives as a typed scalar
		expect(guard?.details).toEqual({ not_deleted: [1363] });
		for (const gate of [
			'relation_corpus_config',
			'section_list_css_differential',
			'section_tool_start_differential',
		]) {
			expect(byGate(gate)[0]?.kind).toBe('php_fault_not_reproduced');
		}
	});
});

describe('error envelope v2 transform — anti-vacuity', () => {
	test('an unclassified result:false envelope THROWS', () => {
		expect(() =>
			adoptErrorEnvelopeV2({ result: false, msg: 'synthetic', errors: ['synthetic_token'] }),
		).toThrow(/unclassified frozen error body/);
	});

	test('a success body projects to ok:true with the frozen result as data', () => {
		const data = [{ tipo: 'rsc2', value: 1 }];
		expect(adoptErrorEnvelopeV2({ result: data, msg: 'ok', errors: [] })).toEqual({
			matched: true,
			kind: 'ok',
			projection: { ok: true, data },
		});
	});

	test('TOP-LEVEL ONLY: nested connection_status result:false is data, not an envelope', () => {
		const widgetsFile = JSON.parse(
			readFileSync(join(oracleHarvestDir, 'widgets_differential.json'), 'utf8'),
		) as Record<string, unknown>;
		const text = JSON.stringify(widgetsFile);
		expect(text).toContain('"connection_status":{"result":false');
		// the nested shape itself (no `errors` key) is not an envelope
		expect(
			adoptErrorEnvelopeV2({
				result: false,
				msg: 'Database is NOT ready (missing or engine unreachable).',
			}),
		).toEqual({ matched: false, kind: 'not_an_envelope', projection: null });
		// and non-objects / result-less objects are not envelopes
		expect(adoptErrorEnvelopeV2(null).kind).toBe('not_an_envelope');
		expect(adoptErrorEnvelopeV2([]).kind).toBe('not_an_envelope');
		expect(adoptErrorEnvelopeV2({ msg: 'x' }).kind).toBe('not_an_envelope');
	});

	test('FIXTURE-SIDE ONLY: a TS-shaped body (`ok` present) is REFUSED, never projected', () => {
		// a v2 success body from the TS engine
		expect(adoptErrorEnvelopeV2({ ok: true, request_id: 'r', data: [1] })).toEqual({
			matched: false,
			kind: 'ts_body_refused',
			projection: null,
		});
		// a v2 failure body from the TS engine
		expect(
			adoptErrorEnvelopeV2({
				ok: false,
				request_id: 'r',
				error: {
					code: 'perm.denied',
					category: 'permission',
					message: 'x',
					label_key: 'k',
					retryable: false,
				},
			}).kind,
		).toBe('ts_body_refused');
		// a server REGRESSION: the compat mirror back on a TS body (`ok` + `result:false` +
		// prose) must NOT become adoptable — the gate that fed it reddens on `matched`
		expect(
			adoptErrorEnvelopeV2({
				ok: false,
				result: false,
				msg: 'Insufficient permissions',
				errors: ['perm.denied'],
			}),
		).toEqual({ matched: false, kind: 'ts_body_refused', projection: null });
		expect(adoptErrorEnvelopeV2({ ok: true, result: [1], data: [1] }).matched).toBe(false);
	});

	test('the projection is a fresh copy (callers may mutate)', () => {
		const first = adoptErrorEnvelopeV2({
			result: false,
			msg: FROZEN_ERROR_BODIES.find((e) => e.gate === 'delete_children_guard_differential')?.msg,
			errors: FROZEN_ERROR_BODIES.find((e) => e.gate === 'delete_children_guard_differential')
				?.errors,
		}).projection as { error: { details: { not_deleted: number[] } } };
		first.error.details.not_deleted.push(-1);
		expect(
			FROZEN_ERROR_BODIES.find((e) => e.gate === 'delete_children_guard_differential')?.details,
		).toEqual({ not_deleted: [1363] });
	});
});
