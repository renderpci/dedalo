/**
 * RELEASE CLONE — cut a release commit on a named branch in a throwaway clone of a
 * checkout, whatever state that checkout's HEAD is in.
 *
 * WHY THIS EXISTS. scripts/update_drill.ts (STEP 1) clones the checkout and commits
 * the release bump there. Until 2026-09-02 it then RENAMED the clone's branch with
 * `git branch -m <release>` — which git refuses when the clone is not on a branch:
 * "cannot rename the current branch while not on any branch". A `git clone` of a
 * checkout whose HEAD is DETACHED lands on no branch, and that is exactly what
 * actions/checkout produces on every `pull_request` event (`refs/remotes/pull/N/merge`,
 * a merge commit no branch points to). The drills passed on a developer's attached
 * branch — the push-event shape — and died at STEP 1 on every PR run of the instance
 * tier (P0-1 residual of the 2026-08-26 deep audit, the GATE-02 failure shape moved
 * to the new tier).
 *
 * THE FIX IS THE VERB: `git checkout -B <release>` creates (or resets) the branch AT
 * HEAD and switches to it, attached or detached alike. It runs BEFORE the release
 * commit, so the commit is born on the branch. test/unit/update_drill_config_tripwire
 * .test.ts runs this sequence against a scratch source whose HEAD is detached at a
 * commit no branch names — the PR shape — and against an attached one.
 */

export async function runGit(args: string[], label: string): Promise<void> {
	const child = Bun.spawn(['git', ...args], { stdout: 'ignore', stderr: 'pipe' });
	const stderr = await new Response(child.stderr).text();
	if ((await child.exited) !== 0) {
		throw new Error(`git ${args.join(' ')} failed (${label}): ${stderr.trim()}`);
	}
}

export interface ReleaseCloneOptions {
	/** The checkout to clone (shared object store — a throwaway, never pushed). */
	source: string;
	/** Where the clone lands; must not exist. */
	cloneDir: string;
	/** The branch the release commit is born on (`master` claims the release name). */
	releaseBranch: string;
	/** Applies the release edits inside the clone, before `add -A` + commit. */
	edit: (cloneDir: string) => void | Promise<void>;
	/** The release commit's message. */
	message: string;
}

/**
 * clone → `checkout -B <releaseBranch>` → edit → add -A → commit. Order matters: the
 * branch switch happens while the tree is still pristine, so a failure there leaves
 * nothing half-edited, and the commit lands on the branch the build will be asked for.
 */
export async function cloneForReleaseCommit(options: ReleaseCloneOptions): Promise<void> {
	const { source, cloneDir, releaseBranch, edit, message } = options;
	await runGit(['clone', '--shared', '--quiet', source, cloneDir], 'clone');
	// NOT `branch -m`: that verb refuses a detached HEAD (a PR checkout).
	await runGit(
		['-C', cloneDir, 'checkout', '--quiet', '-B', releaseBranch],
		`checkout -B ${releaseBranch}`,
	);
	await edit(cloneDir);
	await runGit(['-C', cloneDir, 'add', '-A'], 'add');
	await runGit(
		[
			'-C',
			cloneDir,
			'-c',
			'user.name=update drill',
			'-c',
			'user.email=drill@localhost',
			'commit',
			'--quiet',
			'-m',
			message,
		],
		'commit',
	);
}

/** The branch a clone is on, or null when its HEAD is detached. */
export function currentBranch(repoDir: string): string | null {
	const probe = Bun.spawnSync(
		['git', '-C', repoDir, 'symbolic-ref', '--quiet', '--short', 'HEAD'],
		{
			stdout: 'pipe',
			stderr: 'pipe',
		},
	);
	return probe.exitCode === 0 ? probe.stdout.toString().trim() : null;
}
