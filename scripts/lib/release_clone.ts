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

import { copyFileSync, existsSync, lstatSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
	parseReleaseVersion,
	releaseVersionOfTag,
} from '../../src/core/update/release_identity.ts';

/**
 * Paths a working-tree overlay never carries: the build stamp is the ARCHIVE's
 * to expand (the checkout holds the `$Format:` placeholder, which would make
 * the target call itself `.dev`), and an install stamp is the swap's to write.
 */
const OVERLAY_NEVER = new Set([
	'src/core/update/build_info.txt',
	'src/core/update/install_stamp.json',
]);

/** What {@link overlayWorkingTree} did, for the caller's loud line. */
export interface WorkingTreeOverlay {
	copied: string[];
	removed: string[];
	/** Untracked ROOT files and symlinks: left out (a deployed tree's root is a whitelist). */
	skipped: string[];
}

/**
 * Lay the checkout's UNCOMMITTED state over `target` (a `git clone` of it, or a
 * `git archive HEAD` export): every tracked path that differs from HEAD (copied,
 * or removed when deleted) and every untracked, non-ignored file.
 *
 * WHY: a clone and an archive both see COMMITTED bytes only, so a drill run
 * after editing src/core/update/ — which is exactly when RELEASE.md says to run
 * it — rehearsed HEAD while the master (this checkout, live) ran the edits: the
 * consumer and the release half of the scenario silently tested other code
 * (found 2026-10-18: the prerelease leg's consumer ran HEAD's two-channel
 * parser and stamped a prerelease install `master`). On a clean checkout (CI)
 * this is a no-op. Read-only on the source: plain `git diff`/`ls-files`.
 */
export function overlayWorkingTree(source: string, target: string): WorkingTreeOverlay {
	const listed = (args: string[]): string[] => {
		const probe = Bun.spawnSync(['git', '-C', source, ...args], { stdout: 'pipe', stderr: 'pipe' });
		if (probe.exitCode !== 0) {
			throw new Error(`git ${args.join(' ')} failed: ${probe.stderr.toString().trim()}`);
		}
		return probe.stdout
			.toString()
			.split('\0')
			.filter((path) => path !== '');
	};
	const changed = listed(['diff', '--name-only', '--no-renames', '-z', 'HEAD']);
	const untracked = listed(['ls-files', '--others', '--exclude-standard', '-z']);
	const overlay: WorkingTreeOverlay = { copied: [], removed: [], skipped: [] };
	for (const path of [...changed, ...untracked]) {
		if (OVERLAY_NEVER.has(path)) continue;
		const from = join(source, path);
		const to = join(target, path);
		if (!existsSync(from)) {
			rmSync(to, { force: true });
			overlay.removed.push(path);
			continue;
		}
		const isRootUntracked = !path.includes('/') && untracked.includes(path);
		if (isRootUntracked || lstatSync(from).isSymbolicLink()) {
			overlay.skipped.push(path);
			continue;
		}
		mkdirSync(dirname(to), { recursive: true });
		copyFileSync(from, to);
		overlay.copied.push(path);
	}
	return overlay;
}

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
	/** The branch the release commit is born on (`master` = the developer channel's ref). */
	releaseBranch: string;
	/**
	 * A release TAG to put on the commit (`v7.0.1`) — only a tag build claims the
	 * published `<v>.zip` name (code_build_plan.ts, policy 2026-09-29). Omitted
	 * for a developer-channel rehearsal, which builds the branch tip.
	 */
	tag?: string;
	/** Applies the release edits inside the clone, before `add -A` + commit. */
	edit: (cloneDir: string) => void | Promise<void>;
	/** The release commit's message. */
	message: string;
	/**
	 * Delete every INHERITED release tag whose triple is at or above this one
	 * (`[7, 0, 1]` drops `v7.0.1`, `v7.0.1-rc.1`, `v7.0.2-beta.1`, keeps
	 * `v7.0.0`) before anything is tagged. The prerelease leg needs the clone's
	 * tag set to be ITS sequence for that triple: *Build prerelease* picks the
	 * newest prerelease above the newest stable over ALL tags
	 * (code_build_plan.ts prereleaseTagAbove), so an inherited real `v7.0.1`
	 * refuses the drill's beta.1 as superseded — the drill would red at the
	 * exact moment a release is cut — and an inherited `v7.0.1-rc.1` would be
	 * built instead of it. `tag -f` only rescues tags the drill re-cuts by name.
	 */
	dropReleaseTagsFrom?: readonly number[];
}

/** What {@link cloneForReleaseCommit} did beyond the commit, for the caller's loud line. */
export interface ReleaseCloneResult {
	/** Inherited release tags deleted from the clone ({@link ReleaseCloneOptions.dropReleaseTagsFrom}). */
	droppedTags: string[];
}

/** Is `triple` at or above `floor` (component-wise lexicographic)? */
function tripleAtOrAbove(triple: readonly number[], floor: readonly number[]): boolean {
	for (let i = 0; i < 3; i++) {
		if (triple[i] !== floor[i]) return (triple[i] as number) > (floor[i] as number);
	}
	return true;
}

/**
 * The clone's release tags whose triple is at or above `floor` — deleted from
 * the CLONE only (its refs are its own; the shared object store is untouched,
 * the source never written).
 */
async function dropInheritedReleaseTags(
	cloneDir: string,
	floor: readonly number[],
): Promise<string[]> {
	const listing = Bun.spawnSync(['git', '-C', cloneDir, 'tag', '--list', 'v*'], {
		stdout: 'pipe',
		stderr: 'pipe',
	});
	if (listing.exitCode !== 0) {
		throw new Error(`git tag --list failed in ${cloneDir}: ${listing.stderr.toString().trim()}`);
	}
	const dropped = listing.stdout
		.toString()
		.split('\n')
		.map((line) => line.trim())
		.filter((tag) => {
			const identity = releaseVersionOfTag(tag);
			const parsed = identity === null ? null : parseReleaseVersion(identity);
			return parsed !== null && tripleAtOrAbove(parsed.triple, floor);
		});
	if (dropped.length > 0) await runGit(['-C', cloneDir, 'tag', '-d', ...dropped], 'tag -d');
	return dropped;
}

/**
 * clone (→ drop inherited release tags) → `checkout -B <releaseBranch>` → edit → add -A → commit (→ tag). Order matters: the
 * branch switch happens while the tree is still pristine, so a failure there leaves
 * nothing half-edited, and the commit lands on the branch the build will be asked for.
 */
export async function cloneForReleaseCommit(
	options: ReleaseCloneOptions,
): Promise<ReleaseCloneResult> {
	const { source, cloneDir, releaseBranch, edit, message, tag, dropReleaseTagsFrom } = options;
	await runGit(['clone', '--shared', '--quiet', source, cloneDir], 'clone');
	const droppedTags =
		dropReleaseTagsFrom === undefined
			? []
			: await dropInheritedReleaseTags(cloneDir, dropReleaseTagsFrom);
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
	// `-f`: the shared clone inherits the source's tags, and a rehearsal of an
	// already-tagged version must tag THIS commit, not the historical one.
	// ANNOTATED, as every real release tag is (owner Q7): the archive's
	// build_info.txt %(describe) ignores lightweight tags, so a lightweight one
	// would build a release that calls itself `.dev` (release_identity.ts).
	if (tag !== undefined) {
		await runGit(
			[
				'-C',
				cloneDir,
				'-c',
				'user.name=update drill',
				'-c',
				'user.email=drill@localhost',
				'tag',
				'-f',
				'-a',
				'-m',
				tag,
				tag,
			],
			`tag ${tag}`,
		);
	}
	return { droppedTags };
}

/**
 * The NEXT release of a sequence on the clone's current branch: an empty commit
 * plus an ANNOTATED `tag` on it (the drill's prerelease leg: `-beta.1` →
 * `-beta.2` → the stable). Each tag gets its OWN commit, never a second tag on
 * the same one: the archive's `%(describe)` names ONE tag per commit, and with
 * two annotated tags on a commit git picks by tagger date — a one-second
 * resolution that two quick cuts tie on — so the earlier archive could call
 * itself the later release and the build would rightly refuse it.
 */
export async function tagNextCommit(cloneDir: string, tag: string): Promise<void> {
	const who = ['-c', 'user.name=update drill', '-c', 'user.email=drill@localhost'];
	await runGit(
		[
			'-C',
			cloneDir,
			...who,
			'commit',
			'--quiet',
			'--allow-empty',
			'-m',
			`release ${tag} (update drill)`,
		],
		`commit for ${tag}`,
	);
	await runGit(['-C', cloneDir, ...who, 'tag', '-f', '-a', '-m', tag, tag], `tag ${tag}`);
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
