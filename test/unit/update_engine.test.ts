/**
 * Data-migration catalog + engine (UPDATE_PROCESS Phase 3). The engine runs
 * against FIXTURE descriptors through the seams — the REAL matrix_updates
 * writer is NEVER exercised here (a stray version row would lie to every
 * engine sharing the dev DB; the injected writer spy is mandatory). SQL
 * steps use self-contained statements (temp-free SELECTs) on purpose.
 */

import { afterAll, describe, expect, mock, test } from 'bun:test';
import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { readEnv } from '../../src/config/env.ts';
import { dispatchWidgetRequest } from '../../src/core/area_maintenance/widgets/registry.ts';
import { setServerState } from '../../src/core/resolve/server_state.ts';
import type { Principal } from '../../src/core/security/permissions.ts';
import {
	type UpdateDescriptor,
	catalogKeyOf,
	getMatchedDescriptor,
	getUpdateVersion,
	toWireDescriptor,
} from '../../src/core/update/catalog.ts';
import { updateVersion } from '../../src/core/update/engine.ts';
import * as realOwnership from '../../src/core/update/ownership.ts';

const STATE_PATH = readEnv('DEDALO_TS_STATE_PATH');
if (STATE_PATH === undefined) {
	throw new Error(
		'update_engine.test.ts: DEDALO_TS_STATE_PATH is not set — refusing to run against the live server state file (S1-18)',
	);
}

const REAL_OWNERSHIP = { ...realOwnership };
afterAll(() => {
	mock.module('../../src/core/update/ownership.ts', () => REAL_OWNERSHIP);
	mock.restore();
	setServerState({ maintenance_mode: false });
});

const LOG_PATH = join(readEnv('TMPDIR') ?? '/tmp', `dedalo_update_engine_${process.pid}.log`);
afterAll(() => rmSync(LOG_PATH, { force: true }));

const FIXTURE: UpdateDescriptor = {
	versionMajor: 7,
	versionMedium: 0,
	versionMinor: 1,
	updateFromMajor: 7,
	updateFromMedium: 0,
	updateFromMinor: 0,
	sqlUpdate: ['SELECT 1', 'SELECT no_such_column FROM pg_class'],
	runScripts: [
		{ info: 'ok step', scriptId: 'fixture.ok', stopOnError: true },
		{ info: 'soft fail', scriptId: 'fixture.soft_fail', stopOnError: false },
		{ info: 'hard fail', scriptId: 'fixture.hard_fail', stopOnError: true },
	],
};
const CATALOG = { [catalogKeyOf(FIXTURE)]: FIXTURE };

describe('catalog matching (PHP get_update_version semantics)', () => {
	test('linear updateFrom match; code-only releases skipped; empty current = null', () => {
		expect(getUpdateVersion([7, 0, 0], CATALOG)).toEqual([7, 0, 1]);
		expect(getUpdateVersion([6, 8, 10], CATALOG)).toBeNull();
		expect(getUpdateVersion([], CATALOG)).toBeNull();
		const codeOnly = { ...FIXTURE, updateData: false };
		expect(getUpdateVersion([7, 0, 0], { '701': codeOnly })).toBeNull();
		expect(getMatchedDescriptor([7, 0, 0], CATALOG)).toBe(FIXTURE);
	});

	test('the live catalog is EMPTY (7.0.0 is current — nothing to update)', () => {
		expect(getUpdateVersion([7, 0, 0])).toBeNull();
	});

	test('wire descriptor carries the PHP key shape the client checkbox-derives from', () => {
		const wire = toWireDescriptor(FIXTURE);
		expect(Object.keys(wire)).toEqual([
			'version_major',
			'version_medium',
			'version_minor',
			'update_from_major',
			'update_from_medium',
			'update_from_minor',
			'SQL_update',
			'run_scripts',
		]);
		expect((wire.run_scripts as Record<string, unknown>[])[0]).toEqual({
			info: 'ok step',
			script_class: 'ts_script',
			script_method: 'fixture.ok',
			stop_on_error: true,
			script_vars: [],
		});
	});
});

describe('engine step semantics (fixture catalog, injected writer)', () => {
	const scripts = {
		'fixture.ok': async () => ({ result: true, msg: 'ok ran' }),
		'fixture.soft_fail': async () => ({ result: false, msg: 'soft broke', errors: ['soft'] }),
		'fixture.hard_fail': async () => false,
	};

	function run(updatesChecked: Record<string, unknown>) {
		const written: string[] = [];
		const outcome = updateVersion(updatesChecked, {
			catalog: CATALOG,
			scripts,
			currentVersion: [7, 0, 0],
			logPath: LOG_PATH,
			writeVersionRow: async (version) => {
				written.push(version);
			},
		});
		return outcome.then((result) => ({ ...result, written }));
	}

	test('unchecked steps skip silently; success stamps the version row (PHP tail bytes)', async () => {
		const out = await run({ SQL_update_0: true, run_scripts_0: true });
		expect(out.result).toBe(true);
		expect(out.written).toEqual(['7.0.1']);
		expect(out.msg).toEqual([
			'Updated SQL_update 1',
			'Updated script: fixture.ok',
			'Updated Dédalo data version: 7.0.1',
			'Updated version successfully',
		]);
		const log = readFileSync(LOG_PATH, 'utf8');
		expect(log).toContain('Updating [SQL_update] 1 )))');
		expect(log).toContain('query: SELECT 1');
	});

	test('a failing SQL step HARD-ABORTS: no version row, PHP abort log bytes', async () => {
		const out = await run({ SQL_update_0: true, SQL_update_1: true });
		expect(out.result).toBe(false);
		expect(out.written).toEqual([]);
		expect(out.msg[0]).toBe('Updated SQL_update 1');
		expect(out.msg[1]).toStartWith('Error on SQL_update:');
		expect(readFileSync(LOG_PATH, 'utf8')).toContain(
			'ERROR [SQL_update] 2\nThe result is false. Check your query sentence. The update process aborted.',
		);
	});

	test('run_scripts: soft failure continues, stop_on_error aborts without the version row', async () => {
		const soft = await run({ run_scripts_0: true, run_scripts_1: true });
		expect(soft.result).toBe(true); // soft fail did not abort
		expect(soft.msg).toContain('Error updating Dédalo data');
		expect(soft.written).toEqual(['7.0.1']);

		const hard = await run({ run_scripts_2: true });
		expect(hard.result).toBe(false);
		expect(hard.errors).toContain('unable to run update script');
		expect(hard.written).toEqual([]);
	});

	test('checkbox values must be strictly true (PHP !== true skips)', async () => {
		const out = await run({ SQL_update_1: 'true', run_scripts_2: 1 });
		// nothing executed → straight to the success tail
		expect(out.result).toBe(true);
		expect(out.msg[0]).toBe('Updated Dédalo data version: 7.0.1');
	});

	test('components_update steps throw LOUDLY (ledgered unsupported path)', async () => {
		const withComponents = {
			'701': { ...FIXTURE, componentsUpdate: ['component_date'] },
		};
		expect(
			updateVersion(
				{ components_update_0: true },
				{
					catalog: withComponents,
					scripts,
					currentVersion: [7, 0, 0],
					logPath: LOG_PATH,
					writeVersionRow: async () => {},
				},
			),
		).rejects.toThrow('components_update steps are not supported');
	});

	test('no matching descriptor: PHP nothing-to-update bytes', async () => {
		const out = await updateVersion(
			{},
			{
				catalog: CATALOG,
				currentVersion: [6, 8, 10],
				logPath: LOG_PATH,
				writeVersionRow: async () => {},
			},
		);
		expect(out.result).toBe(false);
		expect(out.msg).toEqual(['Unable to get proper update version. Nothing to update']);
	});
});

describe('widget open mode (mocked gate; engine short-circuits on the empty catalog)', () => {
	const SUPERUSER: Principal = { userId: -1, isGlobalAdmin: true, isDeveloper: true } as Principal;

	test('inline run reaches the engine and reports nothing-to-update', async () => {
		mock.module('../../src/core/update/ownership.ts', () => ({
			...REAL_OWNERSHIP,
			engineOwnsInstall: () => true,
		}));
		setServerState({ maintenance_mode: true });
		try {
			const out = (await dispatchWidgetRequest(
				SUPERUSER,
				{ model: 'update_data_version', action: 'update_data_version' },
				{ updates_checked: {} },
			)) as unknown as Record<string, unknown>;
			// live catalog is empty → the engine's no-descriptor refusal, not the
			// coexisting bespoke denial (proves the OPEN branch ran)
			expect(out.result).toBe(false);
			expect(out.msg).toBe('Unable to get proper update version. Nothing to update');
		} finally {
			setServerState({ maintenance_mode: false });
			mock.module('../../src/core/update/ownership.ts', () => REAL_OWNERSHIP);
		}
	});
});
