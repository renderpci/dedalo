/**
 * release_archive_tripwire — A RELEASE ARCHIVE OF THIS REPO IS INSTALLABLE.
 *
 * `scripts/code_build_plan`/`build_version_from_git_master` publishes a release
 * by running `git archive` over a ref named `master`; the CONSUMER side
 * pre-validates every zip entry with zipinfo and REFUSES the whole archive on
 * the first symlink entry (`src/core/update/code_update.ts` — "archive contains
 * a symlink entry", plus a post-extraction belt saying the same). Nothing in
 * between ever looks.
 *
 * So a committed symlink is not a cosmetic detail: it makes every release built
 * from this checkout uninstallable BY CONSTRUCTION, and it fails at the
 * operator's install, not at ours. That is exactly what happened to the
 * vendor-neutral agent-alias layout (`CLAUDE.md` -> `AGENTS.md`,
 * `.claude/` -> `.agents/`), found 2026-08-23 by `scripts/update_drill.ts`.
 *
 * The fix is `export-ignore` in `.gitattributes`, and THIS is its gate: every
 * symlink tracked in git must be excluded from the archive. The rule is stated
 * as the property (no symlink entry survives export), never as a list of the
 * two paths we happen to have today — a third alias added tomorrow is caught
 * without editing this file.
 *
 * Deliberately NOT delegated to the update drill: the drill would pass anyway
 * (it builds its release from a throwaway clone it can repair). This gate runs
 * in the plain unit suite, needs no database, and reads only git.
 */

import { describe, expect, test } from 'bun:test';
import { projectRoot } from '../../src/config/env.ts';

/** Every path git tracks with mode 120000 (a symlink), relative to the root. */
function trackedSymlinks(): string[] {
	const listed = Bun.spawnSync(['git', '-C', projectRoot, 'ls-files', '-s'], {
		stdout: 'pipe',
		stderr: 'pipe',
	});
	expect(listed.exitCode).toBe(0);
	return listed.stdout
		.toString()
		.split('\n')
		.filter((line) => line.startsWith('120000 '))
		.map((line) => line.split('\t').slice(1).join('\t'))
		.filter((path) => path.length > 0);
}

/** The verbose `tar -t` listing of what `git archive HEAD` actually emits. */
function archiveEntries(): string[] {
	const exported = Bun.spawnSync(
		['bash', '-c', `git -C '${projectRoot}' archive --format=tar HEAD | tar -tvf -`],
		{ stdout: 'pipe', stderr: 'pipe' },
	);
	expect(exported.exitCode).toBe(0);
	return exported.stdout
		.toString()
		.split('\n')
		.filter((line) => line.trim().length > 0);
}

describe('release archive shape', () => {
	test('every tracked symlink is export-ignored', () => {
		const symlinks = trackedSymlinks();
		if (symlinks.length === 0) return; // nothing to exclude — vacuously installable

		const checked = Bun.spawnSync(
			['git', '-C', projectRoot, 'check-attr', 'export-ignore', '--', ...symlinks],
			{ stdout: 'pipe', stderr: 'pipe' },
		);
		expect(checked.exitCode).toBe(0);
		const notIgnored = checked.stdout
			.toString()
			.split('\n')
			.filter((line) => line.trim().length > 0 && !line.endsWith(': set'));

		expect(
			notIgnored,
			`committed symlinks missing an export-ignore rule in .gitattributes; ` +
				`a release built from this checkout would be refused at install ` +
				`("archive contains a symlink entry", src/core/update/code_update.ts)`,
		).toEqual([]);
	});

	test('git archive HEAD emits no symlink entry', () => {
		// The property the installer actually checks — zipinfo/tar both mark a
		// symlink with a leading 'l' in the mode column.
		const symlinkEntries = archiveEntries().filter((line) => /^l[rwxsStT-]{9}\s/.test(line));

		expect(
			symlinkEntries,
			`the release archive carries symlink entries; the installer refuses the ` +
				`ENTIRE archive on the first one (code_update.ts zipinfo pre-validation)`,
		).toEqual([]);
	});
});
