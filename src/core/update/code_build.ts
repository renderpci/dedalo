/**
 * Server-side release BUILD (UPDATE_PROCESS Phase 4 — PHP update_code::
 * build_version_from_git_master). Archives a git ref of the code-server's
 * checkout into a `<version>.zip` release with the `dedalo_code/` prefix the
 * installer expects, under DEDALO_CODE_FILES_DIR/<major>/<major.minor>/.
 *
 * SECURITY: only runs when IS_A_CODE_SERVER is set + the ownership gate is
 * open. The one injection surface is the ref/branch name — validated against
 * a strict git-ref allowlist and passed as a Bun.spawn argv element (never a
 * shell). Output paths are confined under the code-files dir. A sha256 of the
 * archive is emitted next to it (`<file>.sha256`) so the download side can
 * verify integrity — the checksum PHP never produced (WC-024).
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { basename } from 'node:path';
import { config } from '../../config/config.ts';
import { envSnapshot } from '../../config/env.ts';
import { DedaloError, ok } from '../errors/index.ts';
import type { ApiEnvelope } from '../errors/schema.ts';
import { currentRequestContext } from '../security/request_context.ts';
import {
	DEV_REF,
	isSafeGitRef,
	parseDeclaredTriple,
	planCodeBuild,
	qualifiedReleaseTag,
	releaseTagsNewestFirst,
	releaseTagVersion,
	VERSION_TS_PATH,
} from './code_build_plan.ts';
import { ensureCodeFilesDir } from './code_files_dir.ts';
import { refuseUpdate } from './refuse.ts';

/**
 * The build's answer IS the wire body (the update_code widget returns it
 * verbatim), so it is ENVELOPE v2: `data` is the built release
 * ({file_path, sha256}) and `msg` rides as an extension key, the way the
 * maintenance client reads it. Every refusal THROWS (./refuse.ts).
 */
export type CodeBuildResponse = ApiEnvelope;

/** The current RQO's id (the widget dispatcher opens the scope), or '' outside a request. */
function currentRequestId(): string {
	return currentRequestContext()?.requestId ?? '';
}

/**
 * The version a git REF declares, read straight out of the object store
 * (`git show <ref>:src/core/update/version.ts`) — never the working tree, and
 * never the running process. Null when the ref or the file cannot be read.
 */
async function declaredVersionOfRef(
	gitDir: string | undefined,
	ref: string,
): Promise<string | null> {
	if (gitDir === undefined || gitDir === '') return null;
	if (!isSafeGitRef(ref)) return null;
	const child = Bun.spawn(['git', '-C', gitDir, 'show', `${ref}:${VERSION_TS_PATH}`], {
		stdout: 'pipe',
		stderr: 'ignore',
		env: envSnapshot() as Record<string, string>,
	});
	const [exitCode, source] = await Promise.all([child.exited, new Response(child.stdout).text()]);
	return exitCode === 0 ? parseDeclaredTriple(source) : null;
}

/** Does `git -C <gitDir> <args>` succeed? (async: this runs on the request path) */
async function gitSucceeds(gitDir: string, args: string[]): Promise<boolean> {
	const child = Bun.spawn(['git', '-C', gitDir, ...args], {
		stdout: 'ignore',
		stderr: 'ignore',
		env: envSnapshot() as Record<string, string>,
	});
	return (await child.exited) === 0;
}

/** The planner's config slice, from the live config. */
function buildConfig() {
	return {
		isCodeServer: config.update.isCodeServer,
		codeServerGitDir: config.update.codeServerGitDir,
		codeFilesDir: config.update.codeFilesDir,
	};
}

/**
 * THE PLANNER'S FIRST GATES, BEFORE ANY REF IS RESOLVED. Resolving a ref asks
 * git about tags, and those refusals ("no release tag") must never pre-empt the
 * wire-contract order (code server → dirs → …): a non-code-server is told it is
 * not one, not that it has no tag. The planner itself answers — with a
 * placeholder version/ref that pass their own gates — so the order has ONE
 * definition.
 */
function refuseUnlessBuildable(): void {
	const plan = planCodeBuild({ version: '0.0.0', ref: DEV_REF }, buildConfig());
	if (plan.ok !== true) {
		throw new DedaloError('update.refused', {
			message: `${plan.msg} (${plan.error})`,
			publicMessage: plan.msg,
		});
	}
}

/** The operator sentence for "there is no release to publish". */
function noReleaseTagSentence(asked: string | null): string {
	return asked === null
		? 'Error. No release tag (vX.Y.Z) of this engine in the build checkout: a release is built from a tag, and pre-release tags (beta) are never published. Until one exists, use a developer build; otherwise tag the release commit (and fetch tags) before publishing.'
		: `Error. No release tag ${asked} in the build checkout. Tag the release commit (and fetch tags) before publishing.`;
}

/** Every tag of the build checkout (short names), or [] when git cannot answer. */
async function listTags(gitDir: string | undefined): Promise<string[]> {
	if (gitDir === undefined || gitDir === '') return [];
	const child = Bun.spawn(['git', '-C', gitDir, 'tag', '--list', 'v*'], {
		stdout: 'pipe',
		stderr: 'ignore',
		env: envSnapshot() as Record<string, string>,
	});
	const [exitCode, listing] = await Promise.all([child.exited, new Response(child.stdout).text()]);
	return exitCode === 0 ? listing.split('\n').filter((line) => line.trim() !== '') : [];
}

/**
 * WHICH REF a build archives — resolved HERE, on the server, never taken as a
 * branch name from the client (the hardcoded 'v7' of the old dev button refused
 * on every server that did not carry that branch).
 *
 * - explicit `ref` (API callers, the drills): used as given, except that a bare
 *   release tag `vX.Y.Z` is qualified to `refs/tags/vX.Y.Z` so a same-named
 *   branch can never be archived in its place;
 * - `channel: 'dev'`: the tip of {@link DEV_REF};
 * - `channel: 'master'` (the release channel, the default): the version's own
 *   tag when a `version` is asked (refused when that tag does not exist),
 *   otherwise the newest PUBLISHABLE release tag (code_build_plan.ts
 *   newestPublishableTag — stable, and a tree of this engine).
 */
async function resolveBuildRefOrRefuse(options: {
	version?: string;
	ref?: string;
	channel?: 'master' | 'dev';
}): Promise<string> {
	if (options.ref !== undefined) return qualifiedIfReleaseTag(options.ref);
	if (options.channel === 'dev') return DEV_REF;
	// refuseUnlessBuildable() ran first: the git dir is configured
	const gitDir = config.update.codeServerGitDir as string;
	const asked = options.version === undefined ? null : releaseTagVersion(`v${options.version}`);
	return asked === null ? newestTagOrRefuse(gitDir) : askedTagOrRefuse(gitDir, asked);
}

/** An explicit ref, a bare release tag qualified so a same-named branch never wins. */
function qualifiedIfReleaseTag(ref: string): string {
	const tagged = releaseTagVersion(ref);
	return tagged === null ? ref : qualifiedReleaseTag(tagged);
}

/**
 * The ASKED version's tag — which must exist: otherwise the build would
 * provision the release dir and die in `git archive` with nothing naming the cause.
 */
async function askedTagOrRefuse(gitDir: string, version: string): Promise<string> {
	const tagRef = qualifiedReleaseTag(version);
	if (await gitSucceeds(gitDir, ['rev-parse', '--verify', '--quiet', `${tagRef}^{commit}`])) {
		return tagRef;
	}
	const sentence = noReleaseTagSentence(`v${version}`);
	throw new DedaloError('update.refused', { message: sentence, publicMessage: sentence });
}

/**
 * The newest PUBLISHABLE tag (the rule of code_build_plan.ts
 * newestPublishableTag: stable, and a tree of this engine — never a PHP-era
 * `v6.x`), or the no-release refusal.
 */
async function newestTagOrRefuse(gitDir: string): Promise<string> {
	for (const tag of releaseTagsNewestFirst(await listTags(gitDir))) {
		if (await gitSucceeds(gitDir, ['cat-file', '-e', `refs/tags/${tag}:${VERSION_TS_PATH}`])) {
			return `refs/tags/${tag}`;
		}
	}
	const sentence = noReleaseTagSentence(null);
	throw new DedaloError('update.refused', { message: sentence, publicMessage: sentence });
}

/**
 * The version THIS release will be named after: the one the ref's own
 * `version.ts` declares. A caller-supplied `version` that disagrees is a
 * refusal, not an override — a release must be named after its own bytes — and
 * a ref whose version cannot be read at all cannot be named either.
 */
async function resolveReleaseVersionOrRefuse(
	ref: string,
	asked: string | undefined,
): Promise<string> {
	const declared = await declaredVersionOfRef(config.update.codeServerGitDir, ref);
	if (declared !== null && asked !== undefined && asked !== declared) {
		const sentence = `Error. The ref '${ref}' declares version ${declared}, but the build asked for ${asked} — a release must be named after its own bytes.`;
		throw new DedaloError('update.refused', { message: sentence, publicMessage: sentence });
	}
	const version = declared ?? asked;
	if (version === undefined) {
		const sentence = `Error. Could not read ${VERSION_TS_PATH} at ref '${ref}', so the release's own version is unknown and it cannot be named.`;
		throw new DedaloError('update.refused', { message: sentence, publicMessage: sentence });
	}
	return version;
}

/** `git archive` into `filePath`, or a refusal. A zero-byte artifact is a failure. */
async function runGitArchiveOrRefuse(gitDir: string, ref: string, filePath: string): Promise<void> {
	// -C <gitDir> selects the repo; argv array, no shell.
	const child = Bun.spawn(
		['git', '-C', gitDir, 'archive', '--format=zip', '--prefix=dedalo_code/', '-o', filePath, ref],
		{
			stdout: 'ignore',
			stderr: 'pipe',
			env: envSnapshot() as Record<string, string>,
		},
	);
	const [exitCode, stderr] = await Promise.all([child.exited, new Response(child.stderr).text()]);
	if (exitCode === 0 && existsSync(filePath) && statSync(filePath).size > 0) return;
	// The git stderr is a LOG-side detail (paths, refs) — it stays out of the
	// wire sentence and travels on the thrown error's `message`.
	throw new DedaloError('update.failed', {
		message: `git archive failed: ${stderr.trim() || 'git archive produced no output'}`,
		publicMessage: 'Error. git archive failed',
	});
}

/**
 * Provision the release directory, or refuse the build.
 *
 * THE SAME provisioner as the boot pass (code_files_dir.ts): the version
 * levels a build mints must not be looser than the root they sit in, and a
 * bare `mkdirSync(mode)` is umask-dependent. It never throws — the refusal
 * here is the build's, so the operator sentence stays the wire's.
 * `error` is a CREATION failure only — a refused chmod (`modeForced:false`)
 * leaves a usable directory and must NOT refuse a build that would
 * otherwise publish (a release dir on a CIFS/exFAT mount answers EPERM to
 * every chmod).
 */
function provisionReleaseDirOrRefuse(targetDir: string): void {
	const dirReport = ensureCodeFilesDir(targetDir);
	if (dirReport.error !== null || !dirReport.isDirectory) {
		refuseUpdate(
			'update.failed',
			'Error. Unable to create the release directory',
			dirReport.error ?? new Error(`${targetDir} exists but is not a directory`),
		);
	}
}

/**
 * `git archive --format=zip --prefix=dedalo_code/ <ref>` of the code-server
 * checkout into the release path. The ref comes from resolveBuildRefOrRefuse
 * (release channel = a `vX.Y.Z` tag, dev channel = `master`); the version from
 * that ref's own version.ts (`version`, when given, is a claim checked against it).
 */
export async function buildVersionFromGit(options: {
	version?: string;
	ref?: string;
	channel?: 'master' | 'dev';
}): Promise<CodeBuildResponse> {
	// THE BYTES NAME THE RELEASE. Resolve the version the REF declares before
	// planning, so the artifact can never be named after the running process
	// (see parseDeclaredTriple). An explicit caller `version` is now a claim to
	// be CHECKED, not the source of the name.
	refuseUnlessBuildable();
	const ref = await resolveBuildRefOrRefuse(options);
	const version = await resolveReleaseVersionOrRefuse(ref, options.version);
	// All refusal gates (code-server flag → dirs → version → ref → confinement)
	// and the release path live in the pure planner. The ref goes in EXPLICITLY:
	// the channel (and so the file name) is read off the ref by releaseFileName,
	// and it must be the very ref `git archive` below packages.
	const plan = planCodeBuild({ version, ref }, buildConfig());
	if (plan.ok !== true) {
		// `plan.msg` is the operator sentence; `plan.error` the machine detail —
		// the latter goes to the LOG side only (`message`), never to the wire.
		throw new DedaloError('update.refused', {
			message: `${plan.msg} (${plan.error})`,
			publicMessage: plan.msg,
		});
	}
	const { gitDir, targetDir, filePath } = plan;
	provisionReleaseDirOrRefuse(targetDir);

	await runGitArchiveOrRefuse(gitDir, ref, filePath);

	// sha256 sidecar (WC-024 — the integrity guarantee PHP never emitted).
	// The sidecar line names the plan's ACTUAL artifact: the planner emits
	// `<v>-dev.zip` for every non-tag ref, so composing the name from
	// `versionString` alone would sign a dev build under the published name.
	const archiveName = basename(filePath);
	const digest = createHash('sha256').update(readFileSync(filePath)).digest('hex');
	await Bun.write(`${filePath}.sha256`, `${digest}  ${archiveName}\n`);

	return ok(
		{ file_path: filePath, sha256: digest },
		{
			requestId: currentRequestId(),
			extend: {
				msg: `OK. Built release ${archiveName} (${statSync(filePath).size} bytes)`,
				// PHP parity: the maintenance client reads both at the top level.
				file_path: filePath,
				sha256: digest,
			},
		},
	);
}
