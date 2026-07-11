/**
 * Data-migration ENGINE (UPDATE_PROCESS Phase 3) — the TS twin of PHP
 * core/base/update/class.update.php::update_version(). Runs the matched
 * catalog descriptor's steps in execution order, honoring the client's
 * checkbox map (`SQL_update_0`, `run_scripts_1`, … — 0-based, strict
 * `=== true`, anything else silently skips: PHP parity), appends the PHP
 * log-line bytes to update.log, and — only when every executed step
 * succeeded — INSERTs the new matrix_updates version row.
 *
 * Step semantics (PHP parity):
 *  - SQL_update: raw statement; a failure HARD-ABORTS the run.
 *  - run_scripts: SCRIPT_REGISTRY lookup; a failure aborts only when the
 *    step's stopOnError is true.
 *  - components_update: NOT SUPPORTED YET — throws loudly (ledgered in
 *    rewrite/LEDGER.md): no 7.x descriptor uses it (PHP's own 700 descriptor
 *    carries none) and the per-record component hook machinery ships with
 *    its first real consumer, never as dead untested code.
 * Divergences: the TS engine runs IN-PROCESS as a mediaJobs background job
 * (PHP spawns a detached CLI that survives a web-server restart — a TS
 * server restart aborts a running migration; superuser + maintenance mode
 * make that an operator-controlled window). PHP's activity-log disable has
 * no TS twin to disable — the engine path writes no activity rows.
 */

import { appendFileSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { privateDir, readEnv } from '../../config/env.ts';
import { encodeForJsonb } from '../db/json_codec.ts';
import { sql } from '../db/postgres.ts';
import {
	UPDATE_CATALOG,
	type UpdateDescriptor,
	getMatchedDescriptor,
	getUpdateVersion,
} from './catalog.ts';

/** A registered TS migration script (the script_class::script_method twin). */
export type UpdateScriptFn = (
	...vars: unknown[]
) => Promise<{ result: boolean; msg?: string; errors?: string[] } | boolean>;

/**
 * TS migration scripts, keyed by scriptId (catalog.ts UpdateScriptStep).
 * EMPTY until the first 7.x migration ships one; an unknown id fails loudly.
 */
export const SCRIPT_REGISTRY: Readonly<Record<string, UpdateScriptFn>> = Object.freeze({});

export interface UpdateRunResponse {
	result: boolean;
	/** PHP: an ARRAY of step messages on success/abort paths. */
	msg: string[];
	errors: string[];
}

export interface UpdateEngineSeams {
	catalog?: Readonly<Record<string, UpdateDescriptor>>;
	scripts?: Readonly<Record<string, UpdateScriptFn>>;
	/** Injected installed version (tests); default reads matrix_updates. */
	currentVersion?: readonly number[];
	/** Injected update.log path (tests); default UPDATE_LOG_FILE | <private>/update.log. */
	logPath?: string;
	/** Injected version-row writer (tests MUST inject — the real one mutates matrix_updates). */
	writeVersionRow?: (version: string) => Promise<void>;
}

/** PHP update_dedalo_data_version: INSERT the new version row. */
async function writeVersionRowReal(version: string): Promise<void> {
	const now = new Date();
	const pad = (value: number) => String(value).padStart(2, '0');
	const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
	await sql.unsafe('INSERT INTO "matrix_updates" ("data") VALUES ($1::text::jsonb)', [
		encodeForJsonb({ dedalo_version: version, update_date: stamp }),
	]);
}

function resolveLogPath(seams: UpdateEngineSeams): string {
	return (
		seams.logPath ??
		(readEnv('UPDATE_LOG_FILE') as string | undefined) ??
		join(privateDir, 'update.log')
	);
}

/** PHP log-line bytes: PHP_EOL + date('c') + ' Updating [<step>] N )))…'. */
function logHeader(logPath: string, step: string, index: number, detail: string): void {
	const stamp = new Date().toISOString();
	appendFileSync(
		logPath,
		`\n${stamp} Updating [${step}] ${index + 1} )))))))))))))))))))))))))))))))))))))))\n${detail}`,
	);
}

function logLine(logPath: string, line: string): void {
	appendFileSync(logPath, `\n${line}`);
}

/**
 * The main driver (PHP update::update_version). `updatesChecked` is the
 * client's checkbox map; `seams` are test injection points — production
 * callers pass none.
 */
export async function updateVersion(
	updatesChecked: Record<string, unknown>,
	seams: UpdateEngineSeams = {},
): Promise<UpdateRunResponse> {
	const catalog = seams.catalog ?? UPDATE_CATALOG;
	const scripts = seams.scripts ?? SCRIPT_REGISTRY;
	const writeVersionRow = seams.writeVersionRow ?? writeVersionRowReal;
	const msg: string[] = [];
	const errors: string[] = [];

	const current =
		seams.currentVersion ??
		(await (async () => {
			const { getCurrentDataVersion } = await import('../area_maintenance/backup.ts');
			return getCurrentDataVersion();
		})());
	const descriptor = getMatchedDescriptor(current, catalog);
	if (descriptor === null) {
		return {
			result: false,
			msg: ['Unable to get proper update version. Nothing to update'],
			errors: [],
		};
	}

	const logPath = resolveLogPath(seams);
	try {
		if (!existsSync(logPath)) writeFileSync(logPath, '');
	} catch {
		return {
			result: false,
			msg: ["Error (1). It's not possible set update_log file"],
			errors: ['update_log file is not available'],
		};
	}

	const executionOrder = descriptor.executionOrder ?? [
		'SQL_update',
		'components_update',
		'run_scripts',
	];
	const isChecked = (key: string): boolean => updatesChecked[key] === true;

	for (const stepName of executionOrder) {
		switch (stepName) {
			case 'SQL_update': {
				const statements = descriptor.sqlUpdate ?? [];
				for (let index = 0; index < statements.length; index++) {
					if (!isChecked(`SQL_update_${index}`)) continue;
					const statement = statements[index] as string;
					logHeader(logPath, 'SQL_update', index, `query: ${statement}`);
					try {
						await sql.unsafe(statement, []);
						logLine(logPath, 'result: true');
						msg.push(`Updated SQL_update ${index + 1}`);
					} catch (error) {
						logLine(
							logPath,
							`ERROR [SQL_update] ${index + 1}\nThe result is false. Check your query sentence. The update process aborted.`,
						);
						msg.push(`Error on SQL_update: ${(error as Error).message}`);
						return { result: false, msg, errors };
					}
				}
				break;
			}
			case 'components_update': {
				const models = descriptor.componentsUpdate ?? [];
				for (let index = 0; index < models.length; index++) {
					if (!isChecked(`components_update_${index}`)) continue;
					// LEDGERED (rewrite/LEDGER.md): the per-record component hook
					// machinery ships with its first real consumer — never silent.
					throw new Error(
						`components_update steps are not supported by the TS engine yet (model '${models[index]}') — implement the component updateDataVersion facet with the first 7.x descriptor that needs it`,
					);
				}
				break;
			}
			case 'run_scripts': {
				const steps = descriptor.runScripts ?? [];
				for (let index = 0; index < steps.length; index++) {
					if (!isChecked(`run_scripts_${index}`)) continue;
					const step = steps[index] as NonNullable<typeof steps>[number];
					logHeader(logPath, 'run_scripts', index, `current_script: ${step.scriptId}`);
					const fn = scripts[step.scriptId];
					let ok = false;
					let stepMsg = '';
					if (fn === undefined) {
						stepMsg = `unknown scriptId '${step.scriptId}'`;
					} else {
						try {
							const outcome = await fn(...(step.scriptVars ?? []));
							if (typeof outcome === 'boolean') ok = outcome;
							else {
								ok = outcome.result === true;
								stepMsg = outcome.msg ?? '';
								errors.push(...(outcome.errors ?? []));
							}
						} catch (error) {
							stepMsg = (error as Error).message;
						}
					}
					logLine(logPath, `result: script executed: ${ok}`);
					if (!ok) {
						msg.push('Error updating Dédalo data', stepMsg);
						errors.push(stepMsg);
						if (step.stopOnError === true) {
							errors.push('unable to run update script');
							return { result: false, msg, errors };
						}
					} else {
						msg.push(`Updated script: ${step.scriptId}`);
					}
				}
				break;
			}
		}
	}

	// success tail (PHP): stamp the new version row.
	const target = getUpdateVersion(current, catalog) as number[];
	const targetString = target.join('.');
	await writeVersionRow(targetString);
	msg.push(`Updated Dédalo data version: ${targetString}`, 'Updated version successfully');
	return { result: true, msg, errors };
}
