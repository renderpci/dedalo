/**
 * PURE planning half of the server-side release build (see `code_build.ts`).
 * Every gate that can refuse a build BEFORE any filesystem or git side effect
 * lives here, in the order the wire contract fixes: code-server flag → dirs →
 * version → ref → path confinement. Moving a gate changes the error a caller
 * sees, so the order is part of the contract, not an implementation detail.
 *
 * Leaf module: imports only the version parser — no config, no fs, no spawn.
 */

import { join, resolve, sep } from 'node:path';
import { parseVersionString } from './version.ts';

/**
 * The version triple a tree's `src/core/update/version.ts` DECLARES ('7.0.1'),
 * or null when the source does not carry one.
 *
 * THE RELEASE'S NAME MUST COME FROM ITS BYTES. Until 2026-08-24 the build took
 * the artifact's version from the RUNNING MASTER PROCESS (`DEDALO_VERSION`)
 * while the bytes came from an independently chosen git ref, and nothing
 * compared the two — so `<v>.zip` could hold a tree that is not version v. The
 * reachable trigger is not an exotic one: bump the version on `master`, forget
 * to restart the master, and the panel keeps naming artifacts after the OLD
 * version. That is how a 7.0.0 master, asked to publish, produced a `7.0.0.zip`
 * that `assertLinearUpgrade` refuses as a same-version install — a release
 * nobody can install, built by pressing the button that exists to publish.
 *
 * Whitespace- and linebreak-insensitive: the committed source spreads the
 * triple over three lines, a probe's bump writes it on one.
 */
export function parseDeclaredTriple(versionTsSource: string): string | null {
	const matched = /Object\.freeze\(\[\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,?\s*\]\)/.exec(
		versionTsSource,
	);
	return matched === null ? null : `${matched[1]}.${matched[2]}.${matched[3]}`;
}

/** Where the declared triple lives inside any Dédalo tree. */
export const VERSION_TS_PATH = 'src/core/update/version.ts';

/**
 * A safe git ref: refs/heads/… or a plain branch/tag name. No shell metachars,
 * and — CMD-05 (2026-07-28 audit) — NO leading `-`: the ref is the last argv
 * element of `git archive … -o <file> <ref>`, so a `-`-leading value like
 * `--output=/evil` would be parsed by git as an OPTION (output redirect), not a
 * ref. Git itself forbids refs starting with `-`, so this only rejects attacks.
 *
 * NOTE (by design): a traversal-shaped ref such as `refs/heads/../../x` PASSES
 * this allowlist. That is intentional and safe — the ref is only ever handed to
 * `git archive` as a ref to resolve, NEVER joined into a path. The output path
 * is built solely from the validated version triple and confined below. Do not
 * "harden" the regex against `..`: it would reject legitimate refs and buys
 * nothing.
 */
const GIT_REF_RE = /^[A-Za-z0-9._/][A-Za-z0-9._/-]{0,199}$/;

/**
 * The ONE ref allowlist. Exported because `code_build.ts` must validate a ref
 * BEFORE the pre-plan `git show <ref>:…` read that derives the release's
 * version — a second copy of the regex there would be exactly the duplication
 * the "refusal gates are GONE from code_build.ts" gate exists to prevent.
 */
export function isSafeGitRef(ref: string): boolean {
	return GIT_REF_RE.test(ref);
}

/**
 * THE TWO CHANNELS' REFS (policy 2026-09-29).
 *
 * - RELEASE (`master` channel on the wire, `<v>.zip`, advertised): a RELEASE
 *   TAG `vX.Y.Z` — a version that was cut and tagged in git, never a moving
 *   branch tip. Prerelease tags (`v7.0.0-beta.5`) are not releases: while a
 *   major is in beta its code is exposed ONLY through the developer channel.
 *   And only a tag whose tree IS this engine is publishable (see
 *   {@link newestPublishableTag}) — the PHP-era `v6.x` tags live in the same
 *   repository and must never surface as a v7 release.
 * - DEVELOPER (`dev` channel, `<v>-dev.zip`, advertised only on request): the
 *   tip of branch `master` — the latest integrated code, before its release.
 *
 * Until 2026-09-29 the release channel was the tip of `master` and the dev
 * channel whatever other branch the code server had checked out (`v7`), which
 * made "released" mean "whatever master held when someone pressed the button".
 * The wire token `master` for the release channel is kept: installed consumers
 * already send it (`get_code_update_info` `options.channel`).
 */
export const DEV_REF = 'master';

/**
 * `vX.Y.Z` or `refs/tags/vX.Y.Z` — stable only, no prerelease suffix, and
 * CANONICAL (no leading zeros): `v07.0.2` would normalise to `7.0.2` and be
 * re-qualified as a `refs/tags/v7.0.2` that does not exist.
 */
const RELEASE_TAG_RE = /^(?:refs\/tags\/)?v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

/** The version a release-tag ref names ('7.0.1'), or null when the ref is not one. */
export function releaseTagVersion(ref: string): string | null {
	const matched = RELEASE_TAG_RE.exec(ref);
	if (matched === null) return null;
	return `${Number(matched[1])}.${Number(matched[2])}.${Number(matched[3])}`;
}

/** The fully-qualified ref of a release tag — a branch that happens to be named `v7.0.1` never resolves in its place. */
export function qualifiedReleaseTag(version: string): string {
	return `refs/tags/v${version}`;
}

/**
 * The stable release tags among `tags` (short names, as `git tag --list`
 * prints them), NEWEST FIRST by numeric semver — never by lexical order, where
 * `v7.10.0` sorts before `v7.9.0`.
 */
export function releaseTagsNewestFirst(tags: readonly string[]): string[] {
	const found: { tag: string; triple: number[] }[] = [];
	for (const raw of tags) {
		const tag = raw.trim();
		const version = releaseTagVersion(tag);
		if (version !== null) found.push({ tag, triple: version.split('.').map(Number) });
	}
	return found.sort((a, b) => compareTriples(b.triple, a.triple)).map((entry) => entry.tag);
}

/**
 * The newest PUBLISHABLE release tag: the newest stable `vX.Y.Z` whose tree is
 * this engine — it carries {@link VERSION_TS_PATH} (`isEngineTree`, asked of the
 * object store by the caller). Null when there is none.
 *
 * WHY THE TREE AND NOT A VERSION FLOOR: the repository also holds the PHP
 * engine's history, `v6.9.7` included — the newest stable tag of this repo
 * while v7 is still in beta. A hard-coded "major >= 7" would have to move with
 * every major; the tree answers the real question (is this a release of THIS
 * engine?) and a PHP tree has no `version.ts` by construction.
 */
export function newestPublishableTag(
	tags: readonly string[],
	isEngineTree: (tag: string) => boolean,
): string | null {
	for (const tag of releaseTagsNewestFirst(tags)) {
		if (isEngineTree(tag)) return tag;
	}
	return null;
}

function compareTriples(a: readonly number[], b: readonly number[]): number {
	for (let i = 0; i < 3; i++) {
		const diff = (a[i] ?? 0) - (b[i] ?? 0);
		if (diff !== 0) return diff;
	}
	return 0;
}

/** Config slice the planner needs (the `config.update` shape). */
export interface CodeBuildConfig {
	isCodeServer: boolean;
	codeServerGitDir: string | undefined;
	codeFilesDir: string | undefined;
}

/** Either everything the build step needs, or the refusal to report verbatim. */
export type CodeBuildPlan =
	| {
			ok: true;
			gitDir: string;
			ref: string;
			versionString: string;
			targetDir: string;
			filePath: string;
	  }
	| { ok: false; msg: string; error: string };

/**
 * `''` IS UNSET (readEnv returns an empty value verbatim, and config stores it
 * raw). Treating it as configured made `join('', '7', '7.0')` a RELATIVE path,
 * so a build mkdir'd its release tree under the process cwd — inside the very
 * code tree the updater renames away. Same rule as the boot provisioner
 * (code_files_dir.ts).
 */
function resolveCodeBuildDirs(cfg: CodeBuildConfig): { gitDir: string; filesDir: string } | null {
	const gitDir = cfg.codeServerGitDir;
	const filesDir = cfg.codeFilesDir;
	if (gitDir === undefined || gitDir === '' || filesDir === undefined || filesDir === '')
		return null;
	return { gitDir, filesDir };
}

/**
 * A release version is exactly three NON-NEGATIVE INTEGERS. Load-bearing
 * beyond validation: the path confinement below derives its safety from this
 * guard, because it proves every interpolated path segment is `[0-9]+`.
 */
function isReleaseVersionTriple(triple: number[]): boolean {
	return triple.length === 3 && triple.every((n) => Number.isInteger(n) && n >= 0);
}

/** A refusal: `msg` is the operator sentence, `error` the machine detail. */
function refused(msg: string, error: string): CodeBuildPlan {
	return { ok: false, msg, error };
}

/** The first two gates (code server → dirs): the configured dirs, or the refusal. */
function configGateOf(cfg: CodeBuildConfig): { gitDir: string; filesDir: string } | CodeBuildPlan {
	if (cfg.isCodeServer !== true) {
		return refused('Error. This instance is not a code server', 'not a code server');
	}
	return (
		resolveCodeBuildDirs(cfg) ??
		refused(
			'Error. Define DEDALO_CODE_SERVER_GIT_DIR and DEDALO_CODE_FILES_DIR to build releases',
			'code build dirs unconfigured',
		)
	);
}

/**
 * The ref gates (allowlist → tag/version agreement), or null when the ref passes.
 *
 * A RELEASE TAG NAMES ITS VERSION TWICE — in the tag and in its own version.ts
 * — and the two must agree: `v7.0.2` cut on a commit still declaring 7.0.1
 * would publish a `7.0.1.zip` under a tag nobody will look for, or (named after
 * the tag) a `7.0.2.zip` whose tree reports 7.0.1.
 */
function refRefusalOf(ref: string, versionString: string): CodeBuildPlan | null {
	if (!GIT_REF_RE.test(ref)) return refused('Error. Invalid git ref', `invalid ref: ${ref}`);
	const tagged = releaseTagVersion(ref);
	if (tagged === null || tagged === versionString) return null;
	return refused(
		`Error. Tag '${ref}' names version ${tagged}, but its version.ts declares ${versionString}`,
		`tag/version mismatch: ${ref} vs ${versionString}`,
	);
}

/**
 * Decide whether a release build may run and where its artifact goes.
 * Pure: no I/O, no mutation of the inputs. Gate order (the wire contract):
 * code server → dirs → version → ref → tag/version → confinement.
 */
export function planCodeBuild(
	options: { version: string; ref?: string },
	cfg: CodeBuildConfig,
): CodeBuildPlan {
	const dirs = configGateOf(cfg);
	if ('ok' in dirs) return dirs;
	const { gitDir, filesDir } = dirs;
	const triple = parseVersionString(options.version);
	if (!isReleaseVersionTriple(triple)) {
		return refused('Error. Invalid version number', `invalid version: ${options.version}`);
	}
	const versionString = triple.join('.');
	// No ref: the version's own release tag — "build release 7.0.1" means its tag.
	const ref = options.ref ?? qualifiedReleaseTag(versionString);
	const refRefusal = refRefusalOf(ref, versionString);
	if (refRefusal !== null) return refRefusal;
	const targetDir = join(filesDir, String(triple[0]), `${triple[0]}.${triple[1]}`);
	const filePath = join(targetDir, releaseFileName(versionString, ref));
	// LEDGERED UNREACHABLE BRANCH — reason: the version guard above proves the
	// triple is three NON-NEGATIVE INTEGERS, so every path segment interpolated
	// here is `[0-9]+`; no traversal or absolute segment can be constructed and
	// `filePath` is always under `filesDir`. Kept as a defence-in-depth backstop
	// in case the version guard is ever loosened; deliberately NOT covered by a
	// test (no input can reach it).
	if (!resolve(filePath).startsWith(`${resolve(filesDir)}${sep}`)) {
		return refused('Error. Unconfined release path', 'unconfined release path');
	}
	return { ok: true, gitDir, ref, versionString, targetDir, filePath };
}

/**
 * RELEASE CHANNEL in the filename (computed after every refusal gate — the
 * gate order in planCodeBuild is the wire contract). Only a RELEASE TAG build
 * claims the published `<v>.zip` name that code_manifest.ts advertises; any
 * other ref — `master` included, which is the developer channel — gets the
 * sanitized `-dev` suffix, so a branch build can never OVERWRITE the published
 * release of the same version. Dev zips are advertised only to a consumer that
 * asked for them on a master that opted in (code_manifest.ts). The suffix is a
 * fixed sanitized token — no ref bytes reach the path, so confinement still
 * derives solely from the validated triple.
 */
function releaseFileName(versionString: string, ref: string): string {
	return releaseTagVersion(ref) !== null ? `${versionString}.zip` : `${versionString}-dev.zip`;
}
