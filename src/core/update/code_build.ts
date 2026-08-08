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
import { config } from '../../config/config.ts';
import { envSnapshot } from '../../config/env.ts';
import { planCodeBuild } from './code_build_plan.ts';

export interface CodeBuildResponse {
	result: boolean;
	msg: string;
	errors: string[];
	file_path?: string;
	sha256?: string;
}

/**
 * `git archive --format=zip --prefix=dedalo_code/ <ref>` of the code-server
 * checkout into the release path for `version`. `version` names the release
 * (e.g. '7.0.1'); `ref` is the git ref to archive (default the same tag).
 */
export async function buildVersionFromGit(options: {
	version: string;
	ref?: string;
}): Promise<CodeBuildResponse> {
	const response: CodeBuildResponse = { result: false, msg: '', errors: [] };
	// All refusal gates (code-server flag → dirs → version → ref → confinement)
	// and the release path live in the pure planner.
	const plan = planCodeBuild(options, {
		isCodeServer: config.update.isCodeServer,
		codeServerGitDir: config.update.codeServerGitDir,
		codeFilesDir: config.update.codeFilesDir,
	});
	if (plan.ok !== true) {
		response.msg = plan.msg;
		response.errors.push(plan.error);
		return response;
	}
	const { gitDir, ref, versionString, targetDir, filePath } = plan;
	try {
		mkdirSync(targetDir, { recursive: true });
	} catch (error) {
		response.msg = 'Error. Unable to create the release directory';
		response.errors.push((error as Error).message);
		return response;
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
		response.msg = 'Error. git archive failed';
		response.errors.push(stderr.trim() || 'git archive produced no output');
		return response;
	}

	// sha256 sidecar (WC-024 — the integrity guarantee PHP never emitted).
	const digest = createHash('sha256').update(readFileSync(filePath)).digest('hex');
	await Bun.write(`${filePath}.sha256`, `${digest}  ${versionString}.zip\n`);

	response.result = true;
	response.msg = `OK. Built release ${versionString}.zip (${statSync(filePath).size} bytes)`;
	response.file_path = filePath;
	response.sha256 = digest;
	return response;
}
