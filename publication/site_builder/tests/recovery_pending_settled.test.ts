/**
 * AN OWED COMMIT IS SETTLED BY THE NEXT COMMIT THAT RECORDS THE TREE — not only by a boot.
 *
 * `recovery_pending` (sessions/events.ts) marks a session whose turn commit was refused: the
 * work is in the tree, unrecorded, and every boot's sweep makes a recovery commit for it. But a
 * LATER turn's commit is `git add -A` over the whole tree — it records the owed work under its
 * own name. Before this gate the flag survived that commit, so the next boot made a recovery
 * commit for work already recorded (an empty ask at best, and a "recovered after restart"
 * claim about a session that needed no recovery).
 *
 * Outcomes, on the real manager and the real git: a refused commit owes; the next turn's commit
 * (made — or a clean tree, nothing to make: either way nothing is owed after it) settles it; the
 * next boot asks git NOTHING for that session (measured: before the fix it ran a recovery
 * `add -A` + `diff --cached` over a tree the turn had already recorded — and would commit,
 * as "recovered after restart", whatever else had landed in the tree since). Control: a second turn whose commit is ALSO refused keeps
 * the debt.
 */

import { afterAll, afterEach, beforeEach, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { __setTestDriver } from '../src/drivers/registry';
import type { AgentDriver, AgentEvent, AgentProcess } from '../src/drivers/types';
import { getSessionState, sendMessage, startSession, sweepOnBoot } from '../src/sessions/manager';
import { readMeta } from '../src/sessions/store';
import { createSite } from '../src/sites/workspace';
import { provisionSite, resetInstance, workspacePath } from './fixtures/instance';
import { shortScratch, sweepScratch } from './support/lead1b_contract';
import { waitUntil } from './support/lead1b_host';

const ACTOR = { user_id: 7, username: 'recovery-settled-gate' };
const PATH_BEFORE = process.env.PATH;

beforeEach(resetInstance);
afterAll(resetInstance);
afterEach(() => {
	process.env.PATH = PATH_BEFORE;
	__setTestDriver('claude_code', null);
	sweepScratch();
});

/** A driver whose every turn writes `file` into the workspace, then ends with a resume token. */
function writingDriver(slug: string, files: string[]): AgentDriver {
	let n = 0;
	return {
		id: 'claude_code',
		capabilities: { resume: true, mcpHttp: true, reportsFileChanges: true },
		async detect() {
			return { id: 'claude_code', binPath: 'fake', version: '1.0.0' };
		},
		startTurn(): AgentProcess {
			const file = files[n++];
			const events = (async function* (): AsyncIterable<AgentEvent> {
				if (file) writeFileSync(join(workspacePath(slug), file), `<p>${file}</p>\n`);
				yield { type: 'result', ok: true, resumeToken: `resume-${n}`, durationMs: 1 };
			})();
			return { pid: 0, events, async interrupt() {} };
		},
	};
}

/** A `git` on PATH that refuses every command (a unit PID 1 dropped, a quarantined identity). */
function refusingGit(): void {
	const dir = shortScratch('nogit');
	writeFileSync(join(dir, 'git'), '#!/bin/sh\necho "refused by the gate" >&2\nexit 1\n');
	chmodSync(join(dir, 'git'), 0o755);
	process.env.PATH = `${dir}:${PATH_BEFORE ?? '/usr/bin:/bin'}`;
}

/** A `git` on PATH that is the real one and LOGS each call — what a boot's sweep asked git for. */
function loggingGit(): string {
	const dir = shortScratch('loggit');
	const log = join(dir, 'calls.log');
	const real =
		['/usr/bin/git', '/usr/local/bin/git', '/opt/homebrew/bin/git'].find((candidate) =>
			existsSync(candidate),
		) ?? 'git';
	writeFileSync(join(dir, 'git'), `#!/bin/sh\necho "$*" >> '${log}'\nexec '${real}' "$@"\n`);
	chmodSync(join(dir, 'git'), 0o755);
	writeFileSync(log, '');
	process.env.PATH = `${dir}:${PATH_BEFORE ?? '/usr/bin:/bin'}`;
	return log;
}

const subjects = (slug: string) =>
	String(
		spawnSync('git', ['log', '--format=%s'], { cwd: workspacePath(slug), encoding: 'utf8' }).stdout,
	)
		.trim()
		.split('\n');

async function turnEnded(slug: string): Promise<void> {
	await waitUntil(() => getSessionState(slug).state !== 'running', 8_000, 'the turn to end');
}

async function owedSession(slug: string, files: string[]): Promise<string> {
	const { domain } = await provisionSite(slug);
	await createSite({ slug, name: slug, domain, actor: ACTOR });
	__setTestDriver('claude_code', writingDriver(slug, files));
	refusingGit();
	const { session_id } = await startSession(slug, 'write a page');
	await turnEnded(slug);
	const owed = await readMeta(slug, session_id);
	expect(owed?.recovery_pending).toBe(true);
	process.env.PATH = PATH_BEFORE;
	return session_id;
}

test('a later turn whose commit records the tree settles the debt; the next boot makes no recovery commit', async () => {
	const slug = 'settled';
	const sessionId = await owedSession(slug, ['owed.html', 'second.html']);
	await sendMessage(sessionId, 'another page');
	await turnEnded(slug);
	const settled = await readMeta(slug, sessionId);
	const calls = loggingGit();
	await sweepOnBoot();
	process.env.PATH = PATH_BEFORE;
	const log = subjects(slug);
	expect({
		pending: settled !== null && 'recovery_pending' in settled,
		bootAskedGit: readFileSync(calls, 'utf8').split('\n').filter(Boolean),
		head: log[0],
		recoveries: log.filter((subject) => subject.startsWith('agent: recovered')).length,
		recorded: String(
			spawnSync('git', ['ls-files', 'owed.html', 'second.html'], {
				cwd: workspacePath(slug),
				encoding: 'utf8',
			}).stdout,
		)
			.trim()
			.split('\n'),
	}).toEqual({
		pending: false,
		bootAskedGit: [],
		head: `agent: session ${sessionId} turn 2`,
		recoveries: 0,
		recorded: ['owed.html', 'second.html'],
	});
}, 30_000);

test('CONTROL: a later turn whose commit is ALSO refused keeps the debt, and the next boot records it', async () => {
	const slug = 'still-owed';
	const sessionId = await owedSession(slug, ['owed.html', 'second.html']);
	refusingGit();
	await sendMessage(sessionId, 'another page');
	await turnEnded(slug);
	const still = await readMeta(slug, sessionId);
	process.env.PATH = PATH_BEFORE;
	await sweepOnBoot();
	expect({ pending: still?.recovery_pending, head: subjects(slug)[0] }).toEqual({
		pending: true,
		head: `agent: recovered after restart (session ${sessionId})`,
	});
}, 30_000);
