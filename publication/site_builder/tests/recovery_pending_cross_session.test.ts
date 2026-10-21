/**
 * A TURN'S COMMIT SETTLES EVERY SESSION'S DEBT ON THE SITE — not only its own session's.
 *
 * `recovery_pending` (sessions/events.ts) marks a session whose turn commit was refused. A later
 * turn's commit is `git add -A` over the whole tree, so it records that work whichever session
 * the turn belongs to. Before this gate only the committing session's own flag was cleared: a
 * NEW session's commit left the earlier session's debt standing, and the next boot asked git
 * again for it — committing, as "recovered after restart (session <earlier>)", whatever had
 * landed in the tree since.
 *
 * Outcomes, on the real manager and the real git: a refused commit owes (session A); a new
 * session B's commit that resolves clears A's flag; the next boot asks git NOTHING. Control: B's
 * commit ALSO refused keeps A's debt, and the boot records it.
 */

import { afterAll, afterEach, beforeEach, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { __setTestDriver } from '../src/drivers/registry';
import type { AgentDriver, AgentEvent, AgentProcess } from '../src/drivers/types';
import { getSessionState, startSession, sweepOnBoot } from '../src/sessions/manager';
import { readMeta } from '../src/sessions/store';
import { createSite } from '../src/sites/workspace';
import { provisionSite, resetInstance, workspacePath } from './fixtures/instance';
import { shortScratch, sweepScratch } from './support/lead1b_contract';
import { waitUntil } from './support/lead1b_host';

const ACTOR = { user_id: 7, username: 'recovery-cross-session-gate' };
const PATH_BEFORE = process.env.PATH;

beforeEach(resetInstance);
afterAll(resetInstance);
afterEach(() => {
	process.env.PATH = PATH_BEFORE;
	__setTestDriver('claude_code', null);
	sweepScratch();
});

/** A driver whose n-th turn writes `files[n]` into the workspace, then ends. */
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

const head = (slug: string) =>
	String(
		spawnSync('git', ['log', '-1', '--format=%s'], { cwd: workspacePath(slug), encoding: 'utf8' })
			.stdout,
	).trim();

async function turnEnded(slug: string): Promise<void> {
	await waitUntil(() => getSessionState(slug).state !== 'running', 8_000, 'the turn to end');
}

/** Session A's turn commit refused (A owes), then a NEW session B runs a turn under `bGit`. */
async function owedThenNewSession(
	slug: string,
	bGit: 'real' | 'refused',
): Promise<{ a: string; b: string }> {
	const { domain } = await provisionSite(slug);
	await createSite({ slug, name: slug, domain, actor: ACTOR });
	__setTestDriver('claude_code', writingDriver(slug, ['owed.html', 'second.html']));
	refusingGit();
	const { session_id: a } = await startSession(slug, 'write a page');
	await turnEnded(slug);
	expect((await readMeta(slug, a))?.recovery_pending).toBe(true);
	process.env.PATH = PATH_BEFORE;
	if (bGit === 'refused') refusingGit();
	const { session_id: b } = await startSession(slug, 'another page');
	await turnEnded(slug);
	process.env.PATH = PATH_BEFORE;
	return { a, b };
}

test("a NEW session's commit that records the tree settles an earlier session's debt; the boot asks git nothing", async () => {
	const slug = 'cross-settled';
	const { a, b } = await owedThenNewSession(slug, 'real');
	const settled = await readMeta(slug, a);
	const calls = loggingGit();
	await sweepOnBoot();
	process.env.PATH = PATH_BEFORE;
	expect({
		pending: settled !== null && 'recovery_pending' in settled,
		bootAskedGit: readFileSync(calls, 'utf8').split('\n').filter(Boolean),
		head: head(slug),
	}).toEqual({ pending: false, bootAskedGit: [], head: `agent: session ${b} turn 1` });
}, 30_000);

test("CONTROL: a new session whose commit is ALSO refused leaves the earlier session's debt, and the boot records it", async () => {
	const slug = 'cross-owed';
	const { a } = await owedThenNewSession(slug, 'refused');
	const still = await readMeta(slug, a);
	await sweepOnBoot();
	// Both sessions owe; the sweep's order over them is the directory's, so either may record.
	expect({
		pending: still?.recovery_pending,
		recovered: head(slug).startsWith('agent: recovered after restart (session '),
	}).toEqual({
		pending: true,
		recovered: true,
	});
}, 30_000);
