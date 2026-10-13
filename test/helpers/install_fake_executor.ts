/**
 * A FAKE MACHINE for the terminal installer's executor (src/core/install/executor.ts):
 * a step table whose steps only record what they were asked to do, and a host
 * whose database answers are plain values — so the executor's LOOP (checkpoint,
 * skip, adopt, drift, lock, abort order, redaction) is gated without Postgres.
 *
 * Users: test/unit/install_executor_native.test.ts (the loop's rules),
 * test/unit/install_run_files_secret_tripwire.test.ts (no secret reaches a run
 * file or a printed line). The real table runs in install_resume_drill.
 *
 * The private dir is a temp dir the CALLER makes and removes (`withPrivateDir`
 * only points DEDALO_INSTALL_PRIVATE_DIR at it, with the ONE env writer
 * seedProcessEnv, and puts the previous value back) — never the live ../private.
 * This module writes nothing itself.
 */

import { processEnvValue, seedProcessEnv, unsetProcessEnv } from '../../src/config/env.ts';
import type { InstallLockHandle, TargetDatabaseState } from '../../src/core/install/db_restore.ts';
import type { ExecutorHost, ExecutorIo } from '../../src/core/install/executor.ts';
import {
	buildInstallPlan,
	INSTALL_STEP_IDS,
	type InstallPlan,
	type InstallStepId,
} from '../../src/core/install/install_plan.ts';
import { buildPlanFile, type PlanFile, type Secrets } from '../../src/core/install/run_files.ts';
import type { InstallStepDefinition, StepRawOutcome } from '../../src/core/install/steps.ts';

export type FakeTable = { [K in InstallStepId]: InstallStepDefinition };

/** Clean base answers (the wizard post shape) whose plan runs every action step. */
export const FAKE_BASE_ANSWERS: Readonly<Record<string, unknown>> = Object.freeze({
	db_database: 'dedalo_fake_target',
	db_username: 'fake_user',
	db_hostname: 'localhost',
	db_port: '5432',
	entity: 'fake',
	timezone: 'Europe/Madrid',
	locale: 'es-ES',
	langs: ['lg-spa', 'lg-eng'],
	app_lang_default: 'lg-spa',
	data_lang_default: 'lg-eng',
	hierarchies: [],
});

/** The plan + its plan file for `answers` (secrets are recorded as booleans only). */
export function fakePlan(
	secrets: Secrets = {},
	answers: Readonly<Record<string, unknown>> = FAKE_BASE_ANSWERS,
): { plan: InstallPlan; planFile: PlanFile } {
	const plan = buildInstallPlan({
		...answers,
		...(secrets.db_password === undefined ? {} : { db_password: secrets.db_password }),
		...(secrets.mysql_password === undefined ? {} : { mysql_password: secrets.mysql_password }),
		...(secrets.smtp_pass === undefined ? {} : { smtp_pass: secrets.smtp_pass }),
	});
	if (plan.errors.length > 0) throw new Error(`fake plan invalid: ${plan.errors.join('; ')}`);
	return { plan, planFile: buildPlanFile(plan, secrets) };
}

/**
 * A table whose every step appends `run:<id>` / `undo:<id>` to `calls` and
 * answers ok — override any field per step.
 */
export function fakeTable(
	calls: string[],
	overrides: Partial<Record<InstallStepId, Partial<InstallStepDefinition>>> = {},
): FakeTable {
	const table = {} as FakeTable;
	for (const id of INSTALL_STEP_IDS) {
		const base: InstallStepDefinition = {
			id,
			kind: 'action',
			needs: [],
			label: () => `fake ${id}`,
			run: async (): Promise<StepRawOutcome> => {
				calls.push(`run:${id}`);
				return { ok: true, msg: `${id} ok` };
			},
			undo: async () => {
				calls.push(`undo:${id}`);
				return `${id} undone`;
			},
		};
		table[id] = { ...base, ...(overrides[id] ?? {}) };
	}
	return table;
}

export interface FakeHostState {
	database: TargetDatabaseState;
	installStatus: string | null;
	lockFree: boolean;
	loginOk: boolean;
	locksTaken: number;
	locksReleased: number;
}

/** An empty, reachable target with no installer session on it. */
export function emptyTarget(): TargetDatabaseState {
	return {
		reachable: true,
		exists: true,
		emptyForInstall: true,
		userObjectCount: 0,
		userObjects: [],
		extensions: ['plpgsql'],
		seedRestoreRunning: null,
		installSessions: [],
		installStamp: null,
		canStamp: true,
	};
}

/** A host over plain values (mutate `state` between calls to change the machine). */
export function fakeHost(
	state: FakeHostState = {
		database: emptyTarget(),
		installStatus: null,
		lockFree: true,
		loginOk: true,
		locksTaken: 0,
		locksReleased: 0,
	},
): { host: ExecutorHost; state: FakeHostState } {
	const host: ExecutorHost = {
		initTest: async () => ({ ok: true, errors: [] }),
		inspectDatabase: async () => ({ ...state.database }),
		holdDatabaseLock: async (): Promise<InstallLockHandle | null> => {
			if (!state.lockFree) return null;
			state.locksTaken += 1;
			return {
				release: async () => {
					state.locksReleased += 1;
				},
			};
		},
		directoryPaths: async () => [],
		installStatus: () => state.installStatus,
		verifyRootLogin: async () => state.loginOk,
		statePathProblem: () => null,
	};
	return { host, state };
}

/** An io that keeps every line. */
export function recordingIo(): { io: ExecutorIo; lines: string[] } {
	const lines: string[] = [];
	return {
		io: { log: (line) => lines.push(line), warn: (line) => lines.push(line) },
		lines,
	};
}

/**
 * Run `work` with DEDALO_INSTALL_PRIVATE_DIR pointing at `dir` (a temp dir the
 * caller owns) and no fault seam, then restore the previous values.
 */
export async function withPrivateDir<T>(
	dir: string,
	work: (dir: string) => Promise<T>,
): Promise<T> {
	const previous = processEnvValue('DEDALO_INSTALL_PRIVATE_DIR');
	const previousFault = processEnvValue('DEDALO_INSTALL_FAULT');
	seedProcessEnv({ DEDALO_INSTALL_PRIVATE_DIR: dir });
	unsetProcessEnv(['DEDALO_INSTALL_FAULT']);
	try {
		return await work(dir);
	} finally {
		if (previous === undefined) unsetProcessEnv(['DEDALO_INSTALL_PRIVATE_DIR']);
		else seedProcessEnv({ DEDALO_INSTALL_PRIVATE_DIR: previous });
		if (previousFault !== undefined) seedProcessEnv({ DEDALO_INSTALL_FAULT: previousFault });
	}
}
