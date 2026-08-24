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
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { basename } from 'node:path';
import { config } from '../../config/config.ts';
import { envSnapshot } from '../../config/env.ts';
import { DedaloError, ok } from '../errors/index.ts';
import type { ApiEnvelope } from '../errors/schema.ts';
import { currentRequestContext } from '../security/request_context.ts';
import {
	isSafeGitRef,
	parseDeclaredTriple,
	planCodeBuild,
	VERSION_TS_PATH,
} from './code_build_plan.ts';
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

/**
 * `git archive --format=zip --prefix=dedalo_code/ <ref>` of the code-server
 * checkout into the release path for `version`. `version` names the release
 * (e.g. '7.0.1'); `ref` is the git ref to archive (default the same tag).
 */
export async function buildVersionFromGit(options: {
	version?: string;
	ref?: string;
}): Promise<CodeBuildResponse> {
	// THE BYTES NAME THE RELEASE. Resolve the version the REF declares before
	// planning, so the artifact can never be named after the running process
	// (see parseDeclaredTriple). An explicit caller `version` is now a claim to
	// be CHECKED, not the source of the name.
	const ref = options.ref ?? options.version ?? 'master';
	const declared = await declaredVersionOfRef(config.update.codeServerGitDir, ref);
	if (declared !== null && options.version !== undefined && options.version !== declared) {
		const sentence = `Error. The ref '${ref}' declares version ${declared}, but the build asked for ${options.version} — a release must be named after its own bytes.`;
		throw new DedaloError('update.refused', { message: sentence, publicMessage: sentence });
	}
	const version = declared ?? options.version;
	if (version === undefined) {
		const sentence = `Error. Could not read ${VERSION_TS_PATH} at ref '${ref}', so the release's own version is unknown and it cannot be named.`;
		throw new DedaloError('update.refused', { message: sentence, publicMessage: sentence });
	}
	// All refusal gates (code-server flag → dirs → version → ref → confinement)
	// and the release path live in the pure planner. The ref goes in EXPLICITLY:
	// the planner's own fallback is the version string, which would have named a
	// plain `master` build `<v>-dev.zip` (releaseFileName reads the ref) while
	// `git archive` below packaged `master`.
	const plan = planCodeBuild(
		{ version, ref },
		{
			isCodeServer: config.update.isCodeServer,
			codeServerGitDir: config.update.codeServerGitDir,
			codeFilesDir: config.update.codeFilesDir,
		},
	);
	if (plan.ok !== true) {
		// `plan.msg` is the operator sentence; `plan.error` the machine detail —
		// the latter goes to the LOG side only (`message`), never to the wire.
		throw new DedaloError('update.refused', {
			message: `${plan.msg} (${plan.error})`,
			publicMessage: plan.msg,
		});
	}
	const { gitDir, targetDir, filePath } = plan;
	try {
		mkdirSync(targetDir, { recursive: true });
	} catch (error) {
		refuseUpdate('update.failed', 'Error. Unable to create the release directory', error);
	}

	// git archive → the zip file. -C <gitDir> selects the repo; argv array, no shell.
	const child = Bun.spawn(
		['git', '-C', gitDir, 'archive', '--format=zip', '--prefix=dedalo_code/', '-o', filePath, ref],
		{
			stdout: 'ignore',
			stderr: 'pipe',
			env: envSnapshot() as Record<string, string>,
		},
	);
	const [exitCode, stderr] = await Promise.all([child.exited, new Response(child.stderr).text()]);
	if (exitCode !== 0 || !existsSync(filePath) || statSync(filePath).size === 0) {
		// The git stderr is a LOG-side detail (paths, refs) — it stays out of the
		// wire sentence and travels on the thrown error's `message`.
		throw new DedaloError('update.failed', {
			message: `git archive failed: ${stderr.trim() || 'git archive produced no output'}`,
			publicMessage: 'Error. git archive failed',
		});
	}

	// sha256 sidecar (WC-024 — the integrity guarantee PHP never emitted).
	// The sidecar line names the plan's ACTUAL artifact: the planner emits
	// `<v>-dev.zip` for non-master refs, so composing the name from
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
