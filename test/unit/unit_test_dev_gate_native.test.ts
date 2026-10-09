/**
 * The unit_test maintenance widget's DEV GATE.
 *
 * The panel's dev-only options must follow what the installation can actually do:
 *  - "Truncate test table…" (`create_test_record`, a TRUNCATE of matrix_test that
 *    runs on real databases by design) is a development-server action. Hiding
 *    the button is not the guarantee — an admin can POST the action — so the
 *    SERVER refuses it with `maintenance.dev_mode_required` when DEDALO_DEV_MODE
 *    is off.
 *  - "Open JS unit test" needs dev mode AND the devOnly client libs
 *    (mocha/chai). A production install (`bun install --production`) drops them
 *    even with dev mode on, and the runner page then dies on JSON 404s
 *    (observed on a remote dev-mode install, 2026-10-01).
 * The server computes that posture (`unitTestPosture`, served as the catalog
 * eager value); the client renders from it and fails closed on a null value.
 *
 * The dev-mode refusal is exercised with dev mode OFF: with it on, the action
 * TRUNCATEs the suite's shared test3 table mid-run (see unit_test.ts header —
 * no gate may invoke the real reset). The source-order assertion below makes
 * "guard after the reset" impossible to land without this file going red first.
 *
 * The SECOND refusal (installer unification A2) — the test3 playground is the
 * suite's, an installation's core-only seed has no `test` TLD — is exercised
 * with dev mode ON on a database WITHOUT the test3 node: inside a transaction
 * that deletes the node and ROLLS BACK (the suite database never loses it). The
 * outcome measured: the refusal code, and matrix_test unchanged. Should the
 * refusal ever stop firing, the reset it lets through runs inside the same
 * rolled-back transaction, so even a red run leaves the suite intact.
 */

import { afterEach, describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { unitTestPosture, widget } from '../../src/core/area_maintenance/widgets/unit_test.ts';
import { CLIENT_LIBS } from '../../src/core/client_libs/registry.ts';
import { sql, withTransaction } from '../../src/core/db/postgres.ts';
import { isDedaloError } from '../../src/core/errors/dedalo_error.ts';
import type { Principal } from '../../src/core/security/permissions.ts';
import { CANONICAL_SECTION_TIPO, CANONICAL_TABLE } from '../../src/core/test_data/manifest.ts';
import { assertTestDatabase } from '../../src/core/test_data/test_database_marker.ts';

const ROOT = resolve(import.meta.dir, '../..');
const saved = process.env.DEDALO_DEV_MODE;

function setDevMode(on: boolean): void {
	process.env.DEDALO_DEV_MODE = on ? 'true' : 'false';
}

afterEach(() => {
	if (saved === undefined) delete process.env.DEDALO_DEV_MODE;
	else process.env.DEDALO_DEV_MODE = saved;
});

const DEV_ONLY = Object.entries(CLIENT_LIBS)
	.filter(([, lib]) => lib.devOnly === true)
	.map(([id]) => id);

describe('unitTestPosture', () => {
	test('the devOnly set is non-empty (mocha + chai) — otherwise the harness check is vacuous', () => {
		expect(DEV_ONLY).toContain('mocha');
		expect(DEV_ONLY).toContain('chai');
	});

	test('dev mode OFF: nothing dev-only is offered', () => {
		setDevMode(false);
		expect(unitTestPosture()).toEqual({
			dev_mode: false,
			harness_available: false,
			harness_missing: [],
		});
	});

	test('dev mode ON: harness_missing equals the devOnly libs whose probe is absent on disk', () => {
		setDevMode(true);
		const expectedMissing = DEV_ONLY.filter((id) => {
			const lib = CLIENT_LIBS[id];
			return lib === undefined || !existsSync(resolve(ROOT, lib.base, lib.probe));
		});
		const posture = unitTestPosture();
		expect(posture.dev_mode).toBe(true);
		expect(posture.harness_missing).toEqual(expectedMissing);
		expect(posture.harness_available).toBe(expectedMissing.length === 0);
	});

	test('the catalog eager value IS the posture', async () => {
		setDevMode(false);
		expect(await widget.eagerValue?.()).toEqual(unitTestPosture());
		setDevMode(true);
		expect(await widget.eagerValue?.()).toEqual(unitTestPosture());
	});
});

describe('create_test_record refusal', () => {
	test('dev mode OFF: refused with maintenance.dev_mode_required (409), before any write', async () => {
		setDevMode(false);
		const action = widget.apiActions?.create_test_record;
		expect(action).toBeDefined();
		let caught: unknown = null;
		try {
			// the action reads no principal field; the refusal must fire before anything does
			await action?.({}, {} as Principal);
		} catch (error) {
			caught = error;
		}
		expect(isDedaloError(caught)).toBe(true);
		expect((caught as { code: string }).code).toBe('maintenance.dev_mode_required');
	});

	test('dev mode ON, test3 NOT installed: refused with maintenance.action_refused, matrix_test untouched', async () => {
		await assertTestDatabase('unit_test_dev_gate_native');
		setDevMode(true);
		const action = widget.apiActions?.create_test_record;
		expect(action).toBeDefined();
		const rollback = new Error('unit_test_dev_gate_native: intentional rollback');
		const countRows = async (): Promise<number> =>
			Number(
				(
					(await sql.unsafe(`SELECT count(*)::int AS n FROM "${CANONICAL_TABLE}"`)) as {
						n: number;
					}[]
				)[0]?.n ?? -1,
			);
		const seen: { caught: unknown; before: number; after: number; nodes: number } = {
			caught: null,
			before: -1,
			after: -2,
			nodes: -1,
		};
		try {
			await withTransaction(async () => {
				await sql.unsafe('DELETE FROM dd_ontology WHERE tipo = $1', [CANONICAL_SECTION_TIPO]);
				seen.nodes = Number(
					(
						(await sql.unsafe('SELECT count(*)::int AS n FROM dd_ontology WHERE tipo = $1', [
							CANONICAL_SECTION_TIPO,
						])) as { n: number }[]
					)[0]?.n,
				);
				seen.before = await countRows();
				try {
					await action?.({}, {} as Principal);
				} catch (error) {
					seen.caught = error;
				}
				seen.after = await countRows();
				throw rollback;
			});
		} catch (error) {
			if (error !== rollback) throw error;
		}
		// Anti-vacuity: the situation was real (the node was gone, the table had rows).
		expect(seen.nodes).toBe(0);
		expect(seen.before).toBeGreaterThan(0);
		expect(isDedaloError(seen.caught)).toBe(true);
		expect((seen.caught as { code: string }).code).toBe('maintenance.action_refused');
		expect(String((seen.caught as { publicMessage?: string }).publicMessage)).toContain(
			'test:db:setup',
		);
		expect(seen.after).toBe(seen.before);
	});

	test('the guard precedes the reset in the action body', async () => {
		const source = await Bun.file(
			resolve(ROOT, 'src/core/area_maintenance/widgets/unit_test.ts'),
		).text();
		const body = source.slice(source.indexOf('async function unitTestCreateTestRecord'));
		const guard = body.indexOf("'maintenance.dev_mode_required'");
		const installed = body.indexOf('readDdOntologyRow(CANONICAL_SECTION_TIPO)');
		const reset = body.indexOf('resetTestSection()');
		expect(guard).toBeGreaterThan(-1);
		expect(installed).toBeGreaterThan(guard);
		expect(reset).toBeGreaterThan(installed);
	});
});

describe('client render follows the posture', () => {
	test('render_unit_test gates the runner on harness_available and the reset form on dev_mode', async () => {
		const source = await Bun.file(
			resolve(ROOT, 'client/dedalo/core/area_maintenance/widgets/unit_test/js/render_unit_test.js'),
		).text();
		const gate = source.indexOf('if (harness_available) {');
		expect(gate).toBeGreaterThan(-1);
		expect(source.indexOf('`Open JS unit test`')).toBeGreaterThan(gate);
		expect(source).toContain('if (dev_mode && self.caller?.init_form) {');
		// fail closed: only a literal `true` from the server enables either
		expect(source).toContain('value.dev_mode===true');
		expect(source).toContain('value.harness_available===true');
	});
});
