/**
 * core/update/preconditions.ts + the update_data_version EXECUTE refactored
 * onto it (UPDATE_PROCESS Phase 0).
 *
 * P1 error sweep: a REQUIRED precondition now REFUSES BY THROWING a registered
 * code (`perm.superuser_required` / `maintenance.mode_required`), so the
 * assertions are on the CODE (the machine channel), not on the PHP sentence —
 * the sentence itself moved into the registry and is asserted there.
 */

import { afterAll, describe, expect, test } from 'bun:test';
import { mkdirSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readEnv } from '../../src/config/env.ts';
import { dispatchWidgetRequest } from '../../src/core/area_maintenance/widgets/registry.ts';
import { isDedaloError } from '../../src/core/errors/index.ts';
import { setServerState } from '../../src/core/resolve/server_state.ts';
import type { Principal } from '../../src/core/security/permissions.ts';
import { checkUpdatePreconditions } from '../../src/core/update/preconditions.ts';

/** The DedaloError a call threw, or null when it returned. */
function thrownBy(run: () => unknown): { code: string; message: string } | null {
	try {
		run();
		return null;
	} catch (error) {
		return isDedaloError(error) ? { code: error.code, message: error.message } : null;
	}
}

const STATE_PATH = readEnv('DEDALO_TS_STATE_PATH');
if (STATE_PATH === undefined) {
	// Scratch state file required (S1-18): these tests flip maintenance_mode.
	throw new Error(
		'update_preconditions.test.ts: DEDALO_TS_STATE_PATH is not set — refusing to run against the live server state file (S1-18)',
	);
}

const SUPERUSER: Principal = { userId: -1, isGlobalAdmin: true, isDeveloper: true } as Principal;
// Global-admin but NOT superuser: passes the dispatch admin gate, must fail
// the superuser precondition.
const PLAIN_ADMIN: Principal = { userId: 5, isGlobalAdmin: true, isDeveloper: false } as Principal;

afterAll(() => {
	setServerState({ maintenance_mode: false });
});

describe('checkUpdatePreconditions — required checks (PHP refusal bytes)', () => {
	test('non-superuser refused first, PHP order', () => {
		setServerState({ maintenance_mode: false }); // must not matter: superuser first
		const refusal = thrownBy(() => checkUpdatePreconditions(PLAIN_ADMIN));
		expect(refusal?.code).toBe('perm.superuser_required');
	});

	test('superuser without maintenance mode refused', () => {
		setServerState({ maintenance_mode: false });
		const refusal = thrownBy(() => checkUpdatePreconditions(SUPERUSER));
		expect(refusal?.code).toBe('maintenance.mode_required');
	});

	test('superuser + maintenance mode passes (backupWarn off → no warnings)', () => {
		setServerState({ maintenance_mode: true });
		try {
			const out = checkUpdatePreconditions(SUPERUSER, { backupWarn: false });
			expect(out).toEqual({ warnings: [] });
		} finally {
			setServerState({ maintenance_mode: false });
		}
	});
});

describe('checkUpdatePreconditions — recent-backup warning (never refuses)', () => {
	const scratch = join(
		readEnv('TMPDIR') ?? '/tmp',
		`dedalo_precond_backup_${process.pid}_${Math.random().toString(36).slice(2)}`,
	);

	function passWithDir(dir: string) {
		setServerState({ maintenance_mode: true });
		try {
			return checkUpdatePreconditions(SUPERUSER, { backupDir: dir });
		} finally {
			setServerState({ maintenance_mode: false });
		}
	}

	test('no backup dir / no *.backup files → warns, still ok', () => {
		const out = passWithDir(join(scratch, 'absent'));
		expect(out.warnings).toEqual([
			'Warning. No database backup found — make a backup before updating',
		]);
	});

	test('fresh *.backup → no warning; non-backup files ignored', () => {
		const dir = join(scratch, 'fresh');
		mkdirSync(dir, { recursive: true });
		writeFileSync(join(dir, 'note.txt'), 'not a backup');
		writeFileSync(join(dir, 'db.custom.backup'), 'x');
		const out = passWithDir(dir);
		expect(out.warnings).toEqual([]);
	});

	test('stale *.backup (older than the throttle window) → hours-old warning', () => {
		const dir = join(scratch, 'stale');
		mkdirSync(dir, { recursive: true });
		const file = join(dir, 'db.custom.backup');
		writeFileSync(file, 'x');
		const tenHoursAgo = (Date.now() - 10 * 3600000) / 1000;
		utimesSync(file, tenHoursAgo, tenHoursAgo);
		const out = passWithDir(dir);
		expect(out.warnings).toEqual([
			'Warning. Newest database backup is about 10 hours old — make a fresh backup before updating',
		]);
	});
});

describe('update_data_version EXECUTE through the widget dispatch (bytes frozen)', () => {
	function run(principal: Principal) {
		return dispatchWidgetRequest(
			principal,
			{ model: 'update_data_version', action: 'update_data_version' },
			{},
		) as unknown as Promise<Record<string, unknown>>;
	}

	/** The DedaloError an async call threw (the widget dispatcher does not catch). */
	async function thrownByAsync(run: () => Promise<unknown>): Promise<{ code: string } | null> {
		try {
			await run();
			return null;
		} catch (error) {
			return isDedaloError(error) ? { code: error.code } : null;
		}
	}

	test('non-superuser admin → the superuser refusal code', async () => {
		const refusal = await thrownByAsync(() => run(PLAIN_ADMIN));
		expect(refusal?.code).toBe('perm.superuser_required');
	});

	test('superuser, maintenance off → the maintenance refusal code', async () => {
		setServerState({ maintenance_mode: false });
		const refusal = await thrownByAsync(() => run(SUPERUSER));
		expect(refusal?.code).toBe('maintenance.mode_required');
	});

	test('the frozen whenClosed branch keeps the bespoke engine_denied bytes', async () => {
		// 2026-07-11 cutover: the LIVE gate is collapsed to true, so dispatch
		// runs the OPEN branch (the TS migration engine — update_engine.test.ts).
		// The closed branch survives byte-frozen on the gated mark; pin it there.
		const { widget } = await import(
			'../../src/core/area_maintenance/widgets/update_data_version.ts'
		);
		const { ownershipMark } = await import('../../src/core/area_maintenance/widgets/support.ts');
		const handler = widget.apiActions?.update_data_version;
		expect(handler).toBeDefined();
		const whenClosed = ownershipMark(handler as NonNullable<typeof handler>)?.whenClosed;
		expect(whenClosed).toBeDefined();
		setServerState({ maintenance_mode: true });
		try {
			const out = await (whenClosed as NonNullable<typeof whenClosed>)({}, SUPERUSER);
			expect(out).toEqual({
				result: false,
				msg: 'Error. Data migrations are not runnable on this engine: the migration catalog (updates.php) belongs to the PHP install. Run the update from the PHP maintenance dashboard.',
				errors: ['engine_denied: update_data_version'],
			});
		} finally {
			setServerState({ maintenance_mode: false });
		}
	});
});
