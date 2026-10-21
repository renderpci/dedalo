/**
 * A TURN WHOSE LOG REFUSES A WRITE ENDS ITS RUN BEFORE IT LETS GO OF THE SITE.
 *
 * `runTurn` opens the agent run first (so `stopSession` can always find it), then persists:
 * the turn's markers and every event the run emits. A persist can throw after the run is open —
 * disk full, or a `.builder` sidecar the run itself replaced with a link (the FD-based store
 * refuses it, `util/shared_tree.ts`). Before this gate that throw reached the outer catch, and
 * the finally dropped the proc, the site's reservation and the global slot — with the run still
 * alive: unstoppable (`stopSession` answered `not_running`), uncounted by
 * MAX_CONCURRENT_SESSIONS, writing a workspace no turn held, its writes neither committed nor
 * flagged owed.
 *
 * Outcomes, on the real manager, store and git: the run is INTERRUPTED; the site is still held
 * when the interrupt settles (the reservation outlives the run, never the reverse); what the run
 * wrote up to its end is RECORDED by the turn's commit, so nothing is owed; the session ends
 * 'error'. Control: a turn whose log accepts every write is never interrupted.
 */

import { afterAll, afterEach, beforeEach, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { __setTestDriver } from '../src/drivers/registry';
import type { AgentDriver, AgentEvent, AgentProcess } from '../src/drivers/types';
import { getSessionState, startSession } from '../src/sessions/manager';
import { readMeta } from '../src/sessions/store';
import { createSite } from '../src/sites/workspace';
import { busyReason } from '../src/workspace_activity';
import { provisionSite, resetInstance, workspacePath } from './fixtures/instance';
import { waitUntil } from './support/lead1b_host';

const ACTOR = { user_id: 7, username: 'turn-persist-fault-gate' };

const releases: Array<() => void> = [];

beforeEach(resetInstance);
afterAll(resetInstance);
afterEach(() => {
	__setTestDriver('claude_code', null);
	for (const release of releases.splice(0)) release();
});

interface RunProbe {
	interrupted: boolean;
	/** What held the site at the instant the run had settled (the interrupt's return). */
	heldWhenSettled: string | null | 'never';
}

/**
 * A run that emits one text event, then lives on (writing the workspace) until it is stopped.
 * With `plant`, it first swaps its session log for a link — the store refuses the append.
 */
function livingDriver(slug: string, plant: boolean, probe: RunProbe): AgentDriver {
	return {
		id: 'claude_code',
		capabilities: { resume: true, mcpHttp: true, reportsFileChanges: true },
		async detect() {
			return { id: 'claude_code', binPath: 'fake', version: '1.0.0' };
		},
		startTurn(): AgentProcess {
			let stop: () => void = () => {};
			const stopped = new Promise<void>((resolve) => {
				stop = resolve;
			});
			releases.push(stop);
			const workspace = workspacePath(slug);
			const events = (async function* (): AsyncIterable<AgentEvent> {
				if (plant) {
					const sessions = join(workspace, '.builder', 'sessions');
					const log = spawnSync('ls', [sessions], { encoding: 'utf8' })
						.stdout.split('\n')
						.find((name) => name.endsWith('.jsonl'));
					if (!log) throw new Error('no session log to plant over');
					rmSync(join(sessions, log));
					symlinkSync('/dev/null', join(sessions, log));
				}
				writeFileSync(join(workspace, 'before.html'), '<p>before</p>\n');
				yield { type: 'text', text: 'working' };
				if (!plant) {
					yield { type: 'result', ok: true, durationMs: 1 };
					return;
				}
				await stopped;
			})();
			return {
				pid: 0,
				events,
				async interrupt() {
					probe.interrupted = true;
					// The run keeps writing until it has actually ended.
					await Bun.sleep(150);
					writeFileSync(join(workspace, 'late.html'), '<p>late</p>\n');
					probe.heldWhenSettled = busyReason(slug);
					stop();
				},
			};
		},
	};
}

async function turnOn(
	slug: string,
	plant: boolean,
): Promise<{ probe: RunProbe; sessionId: string }> {
	const { domain } = await provisionSite(slug);
	await createSite({ slug, name: slug, domain, actor: ACTOR });
	const probe: RunProbe = { interrupted: false, heldWhenSettled: 'never' };
	__setTestDriver('claude_code', livingDriver(slug, plant, probe));
	const { session_id } = await startSession(slug, 'write a page');
	await waitUntil(() => getSessionState(slug).state !== 'running', 8_000, 'the turn to end');
	// The site is released once the turn is over — whichever way it ended.
	await waitUntil(() => busyReason(slug) === null, 8_000, 'the site to be released');
	return { probe, sessionId: session_id };
}

const tracked = (slug: string, file: string) =>
	String(
		spawnSync('git', ['ls-files', file], { cwd: workspacePath(slug), encoding: 'utf8' }).stdout,
	).trim();

test('a log write refused mid-turn interrupts the run, holds the site until it settled, and records its work', async () => {
	const slug = 'persist-fault';
	const { probe, sessionId } = await turnOn(slug, true);
	const meta = await readMeta(slug, sessionId);
	expect({
		interrupted: probe.interrupted,
		heldWhenSettled: probe.heldWhenSettled,
		state: getSessionState(slug).state,
		owed: meta?.recovery_pending ?? false,
		recorded: [tracked(slug, 'before.html'), tracked(slug, 'late.html')],
	}).toEqual({
		interrupted: true,
		heldWhenSettled: 'session_running',
		state: 'error',
		owed: false,
		recorded: ['before.html', 'late.html'],
	});
}, 30_000);

test('CONTROL: a turn whose log accepts every write is never interrupted', async () => {
	const slug = 'persist-ok';
	const { probe } = await turnOn(slug, false);
	expect({
		interrupted: probe.interrupted,
		state: getSessionState(slug).state,
		recorded: tracked(slug, 'before.html'),
	}).toEqual({
		interrupted: false,
		state: 'idle',
		recorded: 'before.html',
	});
}, 30_000);
