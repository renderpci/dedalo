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
 * Decide whether a release build may run and where its artifact goes.
 * Pure: no I/O, no mutation of the inputs.
 */
export function planCodeBuild(
	options: { version: string; ref?: string },
	cfg: CodeBuildConfig,
): CodeBuildPlan {
	if (cfg.isCodeServer !== true) {
		return {
			ok: false,
			msg: 'Error. This instance is not a code server',
			error: 'not a code server',
		};
	}
	const gitDir = cfg.codeServerGitDir;
	const filesDir = cfg.codeFilesDir;
	if (gitDir === undefined || filesDir === undefined) {
		return {
			ok: false,
			msg: 'Error. Define DEDALO_CODE_SERVER_GIT_DIR and DEDALO_CODE_FILES_DIR to build releases',
			error: 'code build dirs unconfigured',
		};
	}
	const triple = parseVersionString(options.version);
	if (triple.length !== 3 || triple.some((n) => !Number.isInteger(n) || n < 0)) {
		return {
			ok: false,
			msg: 'Error. Invalid version number',
			error: `invalid version: ${options.version}`,
		};
	}
	const ref = options.ref ?? options.version;
	if (!GIT_REF_RE.test(ref)) {
		return { ok: false, msg: 'Error. Invalid git ref', error: `invalid ref: ${ref}` };
	}

	const versionString = triple.join('.');
	const targetDir = join(filesDir, String(triple[0]), `${triple[0]}.${triple[1]}`);
	const filePath = join(targetDir, releaseFileName(versionString, ref));
	// LEDGERED UNREACHABLE BRANCH — reason: the version guard above proves the
	// triple is three NON-NEGATIVE INTEGERS, so every path segment interpolated
	// here is `[0-9]+`; no traversal or absolute segment can be constructed and
	// `filePath` is always under `filesDir`. Kept as a defence-in-depth backstop
	// in case the version guard is ever loosened; deliberately NOT covered by a
	// test (no input can reach it).
	if (!resolve(filePath).startsWith(`${resolve(filesDir)}${sep}`)) {
		return { ok: false, msg: 'Error. Unconfined release path', error: 'unconfined release path' };
	}
	return { ok: true, gitDir, ref, versionString, targetDir, filePath };
}

/**
 * RELEASE CHANNEL in the filename (computed after every refusal gate — the
 * gate order in planCodeBuild is the wire contract). Only a `master` build
 * claims the published `<v>.zip` name that code_manifest.ts advertises; any
 * other ref gets the sanitized `-dev` suffix, so a "developer branch" build
 * can never OVERWRITE the published master release of the same version. Dev
 * zips are inherently un-advertised (the manifest only looks for `<v>.zip`)
 * while code_serving.ts still serves them for manual testing. The suffix is a
 * fixed sanitized token — no ref bytes reach the path, so confinement still
 * derives solely from the validated triple.
 */
function releaseFileName(versionString: string, ref: string): string {
	const isMasterRef = ref === 'master' || ref === 'refs/heads/master';
	return isMasterRef ? `${versionString}.zip` : `${versionString}-dev.zip`;
}
