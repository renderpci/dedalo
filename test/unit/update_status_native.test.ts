/**
 * update_status_native — the update_code STATUS payload (core/update/status.ts).
 *
 * WHAT THIS GATE IS FOR. The panel's whole value is that it tells the operator
 * what the PIPELINE would do. A readiness line that disagrees with the refusal
 * it claims to predict is worse than no line at all — it earns trust it cannot
 * keep. So the assertions here are about AGREEMENT and HONESTY, not cosmetics:
 *
 *   1. every check the panel can emit is in the closed vocabulary, and every
 *      one of them carries a label (an unlabelled check would render as a bare
 *      id to an operator);
 *   2. `ready` is exactly "no check is blocked" — the headline cannot drift
 *      from the lines beneath it;
 *   3. the checks that mirror a refusal agree with that refusal's own
 *      predicate, asked directly (supervisor / channel / backup-root-inside-tree);
 *   4. NOTHING throws: a panel is a diagnostic surface, so an unreadable git
 *      dir, a missing backup root and a broken sentinel each degrade to a
 *      reported state rather than taking the panel down;
 *   5. the code-server half answers only for a code server, and its build gate
 *      is `planCodeBuild`'s own verdict rather than a second opinion.
 */

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { projectRoot } from '../../src/config/env.ts';
import { SUPERUSER_ID } from '../../src/core/security/permissions.ts';
import { detectDeploymentChannel } from '../../src/core/update/channel.ts';
import { planCodeBuild } from '../../src/core/update/code_build_plan.ts';
import { backupRootIsInsideTree, isSupervised } from '../../src/core/update/code_update.ts';
import { backupFreshness } from '../../src/core/update/preconditions.ts';
import {
	archiveSymlinkNames,
	codeServerStatus,
	consumerStatus,
	enginePosture,
	type StatusCheck,
} from '../../src/core/update/status.ts';

const STATES = new Set(['ok', 'warn', 'blocked', 'unknown']);

/** The superuser principal the panel is opened by. */
const superuser = { userId: SUPERUSER_ID } as never;
/** Anyone else — the update refuses for them (preconditions.ts). */
const mortal = { userId: 42 } as never;

const labels = JSON.parse(
	readFileSync(join(projectRoot, 'src/core/labels/master.json'), 'utf8'),
) as Record<string, string>;

function byId(checks: StatusCheck[], id: string): StatusCheck {
	const found = checks.find((entry) => entry.id === id);
	if (found === undefined)
		throw new Error(`no check '${id}' in: ${checks.map((c) => c.id).join(', ')}`);
	return found;
}

describe('consumer status', () => {
	test('answers without throwing and states a verdict', () => {
		const status = consumerStatus(superuser);
		expect(typeof status.ready).toBe('boolean');
		expect(status.checks.length).toBeGreaterThan(0);
		expect(status.engine.version).toMatch(/^\d+\.\d+\.\d+$/);
		// POSTURE is not "was this git-archived" — every `git archive` expands the
		// build stamp, branch builds included. A tree installed from the developer
		// channel is 'dev' however well-stamped it is (2026-08-24).
		expect(status.engine.posture).toBe(enginePosture(status.engine.build as string | null, null));
		expect(enginePosture('2026-08-24T10:00:00Z', 'dev')).toBe('dev');
		expect(enginePosture('2026-08-24T10:00:00Z', 'master')).toBe('release');
		expect(enginePosture(null, null)).toBe('dev');
		// the tree also SAYS which channel it came from, so the panel can name it
		expect(status.engine).toHaveProperty('install_channel');
		expect(status.engine).toHaveProperty('install_digest');
	});

	test('every check uses the closed state vocabulary', () => {
		for (const check of consumerStatus(superuser).checks) {
			expect(STATES.has(check.state)).toBe(true);
			// A fact, never a sentence — the panel owns the wording.
			if (check.detail !== undefined) expect(typeof check.detail).toBe('string');
		}
	});

	test('every check id carries a label (never renders as a bare id)', () => {
		const missing = consumerStatus(superuser)
			.checks.map((check) => `update_code_check_${check.id}`)
			.filter((key) => labels[key] === undefined);
		expect(missing, 'add these to src/core/labels/master.json').toEqual([]);
	});

	test('`ready` is exactly "no check is blocked"', () => {
		const status = consumerStatus(superuser);
		expect(status.ready).toBe(!status.checks.some((check) => check.state === 'blocked'));
	});

	test('the supervisor line agrees with the refusal it predicts', () => {
		const check = byId(consumerStatus(superuser).checks, 'supervisor');
		expect(check.state).toBe(isSupervised() ? 'ok' : 'blocked');
	});

	test('the channel line agrees with detectDeploymentChannel', () => {
		const check = byId(consumerStatus(superuser).checks, 'channel');
		const channel = detectDeploymentChannel(projectRoot);
		expect(check.detail).toBe(channel);
		expect(check.state).toBe(channel === 'image' ? 'blocked' : 'ok');
	});

	test('the backup-freshness line is WAIVABLE, never a hard block', () => {
		// A code update refuses without a recent DATABASE backup — but that is the
		// ONE gate the request can waive, and since 2026-08-25 the update_code
		// modal offers the waiver. `blocked` here would headline "Update blocked"
		// over a run the pipeline accepts: the panel/pipeline disagreement
		// status.ts forbids. So it is `warn`, and it never forces `ready:false`.
		const status = consumerStatus(superuser);
		const check = byId(status.checks, 'backup_fresh');
		expect(check.state).not.toBe('blocked');
		const { hours, stale } = backupFreshness();
		expect(check.state).toBe(hours !== null && !stale ? 'ok' : 'warn');
		// the age FACT survives — the panel words it, the server measures it
		expect(check.detail).toBe(hours === null ? 'none' : String(Math.round(hours)));
	});

	test('the backup-root line agrees with backupRootIsInsideTree', () => {
		const status = consumerStatus(superuser);
		const check = byId(status.checks, 'backup_root_outside_tree');
		const inside = backupRootIsInsideTree(status.tree.backup_root, projectRoot);
		expect(check.state).toBe(inside ? 'blocked' : 'ok');
	});

	test('a non-superuser is blocked on identity, exactly as preconditions refuses', () => {
		expect(byId(consumerStatus(mortal).checks, 'superuser').state).toBe('blocked');
		expect(consumerStatus(mortal).ready).toBe(false);
		// …and the superuser is not blocked for that reason.
		expect(byId(consumerStatus(superuser).checks, 'superuser').state).toBe('ok');
	});

	test('the root-entries line reports INPUTS, never a guessed verdict', () => {
		const status = consumerStatus(superuser);
		// The verdict needs the release's own file list (refuseUnaccountedLiveEntries
		// runs against the extracted archive), so this check must never claim one.
		expect(byId(status.checks, 'root_entries').state).toBe('unknown');
		expect(Array.isArray(status.tree.unaccounted_root_entries)).toBe(true);
	});

	test('restore points report the rollback-bootability contract', () => {
		for (const point of consumerStatus(superuser).restore_points) {
			expect(typeof point.bootable).toBe('boolean');
			// NO `bytes`: it used to be statSync(dir).size — the directory
			// INODE's size (measured 672 B–1.6 KB for multi-GB trees) — rendered
			// through format_bytes beside a green "bootable" pill.
			expect('bytes' in point).toBe(false);
			expect(point.name.startsWith('dedalo_')).toBe(true);
		}
	});
});

describe('code server status', () => {
	const status = codeServerStatus('https://example.test/dedalo/install/code');

	test('answers without throwing and states a verdict', () => {
		expect(typeof status.ready).toBe('boolean');
		expect(status.ready).toBe(!status.checks.some((check) => check.state === 'blocked'));
	});

	test('states whether this master PUBLISHES developer builds', () => {
		// The only way an operator can tell "the consumer asked and I said no"
		// from "the consumer never asked" (DEDALO_CODE_SERVER_DEV_CHANNEL).
		const { config } =
			require('../../src/config/config.ts') as typeof import('../../src/config/config.ts');
		expect(status.dev_channel).toBe(config.update.devChannelEnabled);
	});

	test('every check id carries a label', () => {
		const missing = status.checks
			.map((check) => `update_code_check_${check.id}`)
			.filter((key) => labels[key] === undefined);
		expect(missing, 'add these to src/core/labels/master.json').toEqual([]);
	});

	test('the build gate is planCodeBuild’s own verdict, not a second opinion', () => {
		const { config } =
			require('../../src/config/config.ts') as typeof import('../../src/config/config.ts');
		const plan = planCodeBuild(
			{ version: status.advertises.for_version, ref: 'master' },
			{
				isCodeServer: config.update.isCodeServer,
				codeServerGitDir: config.update.codeServerGitDir,
				codeFilesDir: config.update.codeFilesDir,
			},
		);
		expect(byId(status.checks, 'build_plan').state).toBe(plan.ok ? 'ok' : 'blocked');
	});

	test('a published release is distinguished from a developer one', () => {
		for (const release of status.releases) {
			// Only `<v>.zip` is ever advertised; `-dev` is servable, never offered.
			expect(release.channel).toBe(release.file.includes('-dev') ? 'dev' : 'master');
			// EXACT, not endsWith: the panel used to append the
			// /dedalo/install/code prefix to a base that already carried it,
			// emitting a doubled path that resolveCodeReleaseFile refuses —
			// and `endsWith(file)` was true of that broken URL too.
			expect(release.url).toBe(
				`https://example.test/dedalo/install/code/${release.version}/${release.file}`,
			);
		}
	});

	test('the advertised manifest is the real one — a zip on disk is not a promise', () => {
		// The gap this panel exists to show: UPDATE_CATALOG decides what is
		// OFFERED, so `advertises` may legitimately be empty while `releases`
		// is not. What must never happen is the reverse — offering a release
		// that is not on disk.
		for (const rung of status.advertises.rungs) {
			for (const offered of rung.files) {
				expect(status.releases.some((release) => release.version === offered.version)).toBe(true);
			}
		}
		// …and the listing must not be silently empty because the WALK died.
		// A single stray non-directory entry (a `.DS_Store`, which macOS plants
		// in every browsed dir) used to abort the whole two-level walk, so the
		// panel reported "Published releases: None" over a dir full of served
		// archives — and fired THIS security-shaped alarm for a directory bug.
		expect(status.releases_unreadable).toEqual([]);
	});

	test('every publish check names the ref it was evaluated against', () => {
		// The 2026-08-24 confusion: `archive_installable` was blocked on paths
		// HEAD had already excluded, because it reads the RELEASE ref. A check
		// whose scope is invisible reads as a false alarm.
		const scoped = ['build_plan', 'master_ref', 'archive_installable', 'release_ref_current'];
		for (const id of scoped) {
			expect(byId(status.checks, id).scope, `${id} must name its ref`).toBe(
				status.source.release_ref,
			);
		}
	});

	test('the release ref is reported separately from the checked-out branch', () => {
		// They are routinely different, and every publish check reads the
		// former — so the panel must never conflate them.
		expect(status.source.release_ref).toBe('master');
		if (status.source.divergence !== null) {
			expect(Number.isInteger(status.source.divergence.behind)).toBe(true);
			expect(Number.isInteger(status.source.divergence.ahead)).toBe(true);
			// `behind` is what explains a red check on already-committed work.
			expect(byId(status.checks, 'release_ref_current').state).toBe(
				status.source.divergence.behind === 0 ? 'ok' : 'warn',
			);
		}
	});

	test('a release ref behind the branch WARNS, never blocks', () => {
		// Publishing an older release ref is a legitimate act; the line exists
		// to explain a red neighbour, not to add a gate of its own.
		expect(byId(status.checks, 'release_ref_current').state).not.toBe('blocked');
	});

	test('a broken archive probe degrades to unknown, never a false ok', () => {
		// The `set -o pipefail` contract: a failing `git archive` must not read
		// as "no symlink entries found" (found 2026-08-24 against a code-server
		// dir that did not exist).
		const check = byId(status.checks, 'archive_installable');
		expect(STATES.has(check.state)).toBe(true);
		if (check.state === 'unknown') expect(typeof check.detail).toBe('string');
	});
});

describe('archive symlink names', () => {
	test('names the LINK, never its target', () => {
		// Real `tar -tv` bytes. The naive last-token parse answered `.agents` /
		// `AGENTS.md` here — the targets — so the panel pointed the operator at
		// files that were not the problem (found 2026-08-24 against this repo's
		// own master ref).
		const listing = [
			'lrwxrwxrwx  0 root   root        0 Jul 30 12:04 .claude -> .agents',
			'lrwxrwxrwx  0 root   root        0 Jul 30 12:04 CLAUDE.md -> AGENTS.md',
			'-rw-r--r--  0 root   root     1234 Jul 30 12:04 package.json',
			'drwxr-xr-x  0 root   root        0 Jul 30 12:04 src/',
		].join('\n');
		expect(archiveSymlinkNames(listing)).toEqual(['.claude', 'CLAUDE.md']);
	});

	test('keeps a name containing spaces intact, and reads a year-column listing', () => {
		// tar prints a YEAR instead of HH:MM once an entry is over six months old.
		const listing = [
			'lrwxrwxrwx  0 root   root        0 Jul 30  2024 docs/my notes.md -> ../notes.md',
		].join('\n');
		expect(archiveSymlinkNames(listing)).toEqual(['docs/my notes.md']);
	});

	test('an empty or symlink-free listing yields nothing', () => {
		expect(archiveSymlinkNames('')).toEqual([]);
		expect(archiveSymlinkNames('-rw-r--r--  0 root root 1 Jul 30 12:04 a.txt')).toEqual([]);
	});

	test('agrees with git on this repo (the check is not parsing fiction)', () => {
		const listing = Bun.spawnSync(
			[
				'bash',
				'-c',
				`set -o pipefail; git -C '${projectRoot}' archive --format=tar HEAD | tar -tvf -`,
			],
			{ stdout: 'pipe', stderr: 'ignore' },
		);
		expect(listing.exitCode).toBe(0);
		const names = archiveSymlinkNames(listing.stdout.toString());
		// HONEST LIMIT: on a branch whose .gitattributes already excludes every
		// symlink (release_archive_tripwire keeps HEAD in that state) this loop
		// is empty and asserts nothing — the fixture tests above carry the
		// parsing proof. It bites on any branch that still ships one.
		// Whatever git reports, every name must be a real tracked path — never a
		// link target, which is what the old parser produced.
		for (const name of names) {
			const tracked = Bun.spawnSync(
				['git', '-C', projectRoot, 'ls-files', '--error-unmatch', name],
				{
					stdout: 'ignore',
					stderr: 'ignore',
				},
			);
			expect(tracked.exitCode, `${name} is not a tracked path`).toBe(0);
		}
	});
});
