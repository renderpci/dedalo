/**
 * THE EXECUTOR'S STEP EVENTS (src/core/install/executor.ts `emit`, terminal
 * installer phase 3, 2026-10-12) — what the full-screen Install screen is
 * drawn from, driven over the fake machine (test/helpers/install_fake_executor.ts):
 *
 *  - a fresh run emits `start` then `done` for every plan step, in plan order;
 *  - a resume announces every step (`start`) and emits `skipped` for one done
 *    in the earlier run (never run again), then `start` + `done` for the rest;
 *  - a failing step emits `failed` with the REDACTED message (a planted secret
 *    never reaches the screen);
 *  - `elapsedMs` of a done step is ≥ 0 and IS the state record's
 *    finished_at − started_at;
 *  - the headless transcript is unchanged by a listener: with and without
 *    `io.step` the log/warn lines are identical;
 *  - `io.signals` is told armed (true) on entry and disarmed (false) on return
 *    — the front end delegates SIGINT/SIGTERM only between the two.
 *
 * DB-free: a temp private dir, removed in afterAll.
 */

import { afterAll, describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type ExecutorIo, executeInstall } from '../../src/core/install/executor.ts';
import type { InstallStepId } from '../../src/core/install/install_plan.ts';
import type { StepEvent } from '../../src/core/install/run_events.ts';
import { type InstallState, STATE_FILE } from '../../src/core/install/run_files.ts';
import { fakeHost, fakePlan, fakeTable, withPrivateDir } from '../helpers/install_fake_executor.ts';

const privateRoot = mkdtempSync(join(tmpdir(), 'dedalo_executor_events_'));
afterAll(() => rmSync(privateRoot, { recursive: true, force: true }));
const scratch = (): string => mkdtempSync(join(privateRoot, 'private_'));

const ROOT_PW = 'Mosaic-Kestrel-Harbor-47';
const DB_SECRET = 'Db-SentinelWombat-93';

const readState = (dir: string): InstallState =>
	JSON.parse(readFileSync(join(dir, 'install', STATE_FILE), 'utf8')) as InstallState;

/** An io that records the transcript, the events and the arming. */
function eventIo(listen = true): {
	io: ExecutorIo;
	lines: string[];
	events: StepEvent[];
	armed: boolean[];
} {
	const lines: string[] = [];
	const events: StepEvent[] = [];
	const armed: boolean[] = [];
	const io: ExecutorIo = {
		log: (line) => lines.push(`log:${line}`),
		warn: (line) => lines.push(`warn:${line}`),
		...(listen
			? {
					step: (event: StepEvent) => events.push(event),
					signals: (value: boolean) => armed.push(value),
				}
			: {}),
	};
	return { io, lines, events, armed };
}

const phasesOf = (events: readonly StepEvent[]): string[] =>
	events.map((event) => `${event.phase}:${event.step}`);

describe('executor step events', () => {
	test('a fresh run: start + done per step in plan order; elapsed = the record; armed then disarmed', async () => {
		await withPrivateDir(scratch(), async (dir) => {
			const { plan, planFile } = fakePlan();
			const { io, events, armed } = eventIo();
			const outcome = await executeInstall(
				{ mode: 'fresh', planFile, plan, secrets: { root_password: ROOT_PW } },
				io,
				{ table: fakeTable([]), host: fakeHost().host },
			);
			expect(outcome.result).toBe('complete');
			expect(plan.steps.length).toBeGreaterThan(5);
			expect(phasesOf(events)).toEqual(
				plan.steps.flatMap((step) => [`start:${step}`, `done:${step}`]),
			);
			const state = readState(dir);
			for (const event of events.filter((item) => item.phase === 'done')) {
				const record = state.steps[event.step];
				const expected =
					Date.parse(record?.finished_at ?? '') - Date.parse(record?.started_at ?? '');
				expect(event.elapsedMs, event.step).toBe(expected);
				expect(event.elapsedMs ?? -1).toBeGreaterThanOrEqual(0);
				expect(event.label).toBe(`fake ${event.step}`);
			}
			expect(armed).toEqual([true, false]);
		});
	});

	test('a failing step emits failed with the REDACTED message', async () => {
		await withPrivateDir(scratch(), async () => {
			const secrets = { root_password: ROOT_PW, db_password: DB_SECRET };
			const { plan, planFile } = fakePlan({ db_password: DB_SECRET });
			const { io, events, lines } = eventIo();
			const outcome = await executeInstall({ mode: 'fresh', planFile, plan, secrets }, io, {
				table: fakeTable([], {
					install_ontologies: {
						run: async () => {
							throw new Error(`connect failed for password ${DB_SECRET}`);
						},
					},
				}),
				host: fakeHost().host,
			});
			expect(outcome.result).toBe('failed');
			const failed = events.find((event) => event.phase === 'failed');
			expect(failed?.step).toBe('install_ontologies');
			expect(failed?.message).toContain('connect failed for password');
			expect(JSON.stringify(events)).not.toContain(DB_SECRET);
			expect(lines.join('\n')).not.toContain(DB_SECRET);
			// Anti-vacuity: the secret WAS in what the step threw.
			expect(failed?.message).toContain('***');
		});
	});

	test('a resume: the done steps are announced then skipped (never run), the rest start + done', async () => {
		await withPrivateDir(scratch(), async () => {
			const { plan, planFile } = fakePlan();
			const failAt: InstallStepId = 'install_hierarchies';
			await executeInstall(
				{ mode: 'fresh', planFile, plan, secrets: { root_password: ROOT_PW } },
				eventIo(false).io,
				{
					table: fakeTable([], {
						[failAt]: {
							run: async () => {
								throw new Error('stopped here');
							},
						},
					}),
					host: fakeHost().host,
				},
			);
			const { io, events } = eventIo();
			const outcome = await executeInstall({ mode: 'resume', secrets: {} }, io, {
				table: fakeTable([]),
				host: fakeHost().host,
			});
			expect(outcome.result).toBe('complete');
			const at = plan.steps.indexOf(failAt);
			const before = plan.steps.slice(0, at);
			const after = plan.steps.slice(at);
			// Done in the failed run, no verify in the fake table: announced, then SKIPPED — never run again.
			for (const step of before) {
				expect(
					events.filter((event) => event.step === step).map((event) => event.phase),
					step,
				).toEqual(['start', 'skipped']);
			}
			for (const step of after) {
				expect(
					events.filter((event) => event.step === step).map((event) => event.phase),
					step,
				).toEqual(['start', 'done']);
			}
			expect(events.some((event) => event.phase === 'skipped')).toBe(true);
		});
	});

	test('the headless transcript is the same with and without a step listener', async () => {
		const transcript = async (listen: boolean): Promise<string[]> =>
			withPrivateDir(scratch(), async () => {
				const { plan, planFile } = fakePlan();
				const { io, lines, events } = eventIo(listen);
				await executeInstall(
					{ mode: 'fresh', planFile, plan, secrets: { root_password: ROOT_PW } },
					io,
					{
						table: fakeTable([], {
							install_hierarchies: {
								run: async () => ({ ok: true, msg: 'hierarchies ok', warnings: ['one warning'] }),
							},
						}),
						host: fakeHost().host,
					},
				);
				expect(events.length > 0).toBe(listen);
				// Timestamps and durations differ between runs; the lines' words do not.
				return lines.map((line) => line.replace(/\d+(\.\d+)?\s?m?s\b/g, '<t>'));
			});
		const without = await transcript(false);
		const withListener = await transcript(true);
		expect(without.length).toBeGreaterThan(5);
		expect(withListener).toEqual(without);
	});
});
