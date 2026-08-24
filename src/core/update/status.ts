/**
 * update_code STATUS — what an operator needs to KNOW before pressing a button
 * that replaces the code tree (and what a code master needs to know before
 * publishing a release others will install).
 *
 * WHY THIS EXISTS. Until 2026-08-24 the panel showed four facts (running
 * version, build stamp, the CODE_SERVERS probe, `is_a_code_server`), while
 * `code_update.ts` could refuse for nine distinct reasons and `code_build_plan.ts`
 * for four more — every one of them discoverable ONLY by pressing the button
 * and reading the failure. A containerized install, for instance, cannot tree-
 * swap at all (channel.ts), and learned so at the very end of a long job.
 *
 * THE LAW OF THIS MODULE: it never re-implements a refusal. Every readiness
 * line asks the SAME function the pipeline refuses on — `isSupervised`,
 * `detectDeploymentChannel`, `runtimePathsInsideTree`, `backupRootIsInsideTree`,
 * `newestBackupMtimeMs`, `planCodeBuild`, `buildCodeUpdateInfo`. A second copy
 * of a rule would drift, and a readiness panel that disagrees with the pipeline
 * is worse than no panel: it would earn trust it cannot keep. Where a check is
 * NOT decidable before the download (the release's own root whitelist and its
 * `.bun-version` pin need the archive's contents), this module says so with
 * `state:'unknown'` and reports the INPUTS instead — never a guessed verdict.
 *
 * IT NEVER THROWS. A panel is a diagnostic surface: every probe is wrapped, and
 * a probe that cannot answer degrades to `unknown` with its reason. A broken
 * git checkout must still render the other twelve lines.
 *
 * WIRE: the server answers machine ids and FACTS (paths, versions, counts,
 * byte sizes) — never operator sentences. The wording is the client's, from the
 * label catalog (WC-033), keyed by check id.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { config } from '../../config/config.ts';
import { projectRoot } from '../../config/env.ts';
import { runtimePathsInsideTree } from '../install/runtime_paths.ts';
import { getServerState } from '../resolve/server_state.ts';
import { type Principal, SUPERUSER_ID } from '../security/permissions.ts';
import { type CodeUpdateSentinel, codeUpdateSentinelPath } from './boot_confirm.ts';
import { DEDALO_BUILD, DEDALO_BUILD_SHA, DEDALO_ENGINE_VERSION } from './build_stamp.ts';
import { UPDATE_CATALOG } from './catalog.ts';
import { detectDeploymentChannel } from './channel.ts';
import { parseDeclaredTriple, planCodeBuild, VERSION_TS_PATH } from './code_build_plan.ts';
import { buildCodeUpdateInfo, type CodeReleaseItem, codeReleaseUrl } from './code_manifest.ts';
import {
	backupRootIsInsideTree,
	codeStagingDir,
	isSupervised,
	PRESERVE_ROOT_ENTRIES,
	resolveCodeBackupRoot,
	STAGING_KEEP_MARKER,
	stagingHoldsParkedTree,
} from './code_update.ts';
import { INSTALLED_CHANNEL, INSTALLED_DIGEST, type InstallChannel } from './install_stamp.ts';
import { backupFreshness } from './preconditions.ts';
import { DEDALO_VERSION, DEDALO_VERSION_TRIPLE } from './version.ts';

// ---------------------------------------------------------------------------
// The check vocabulary
// ---------------------------------------------------------------------------

/**
 * One readiness line.
 *  - `ok`       the pipeline will not refuse on this account;
 *  - `blocked`  this WILL refuse the update as things stand (a hard gate);
 *  - `warn`     allowed, but the operator should know (a waivable condition);
 *  - `unknown`  not decidable here — the reason rides in `detail`.
 * `detail` is a FACT (a path, a version, a count), never a sentence: the panel
 * owns the wording.
 */
export interface StatusCheck {
	id: string;
	state: 'ok' | 'blocked' | 'warn' | 'unknown';
	detail?: string;
	/**
	 * WHAT the check was evaluated against, when that is not obvious — a git
	 * ref, a path. Load-bearing on a code server: the publish checks look at
	 * the RELEASE REF (`master`), not at the branch the operator has checked
	 * out, so a fix committed on a working branch leaves them red and the
	 * readout has to say why (2026-08-24: `archive_installable` blocked on
	 * `.claude, CLAUDE.md` while HEAD had already excluded them — the panel was
	 * right, but only the ref made that legible).
	 */
	scope?: string;
}

function check(
	id: string,
	state: StatusCheck['state'],
	detail?: string,
	scope?: string,
): StatusCheck {
	const entry: StatusCheck = { id, state };
	if (detail !== undefined) entry.detail = detail;
	if (scope !== undefined) entry.scope = scope;
	return entry;
}

/** Run a probe that must never take the panel down; any throw becomes `unknown`. */
function probe(id: string, run: () => StatusCheck): StatusCheck {
	try {
		return run();
	} catch (error) {
		return check(id, 'unknown', error instanceof Error ? error.message : String(error));
	}
}

/** `git` in a directory, trimmed — null when git or the directory refuses. */
function git(dir: string, args: string[]): string | null {
	try {
		return execFileSync('git', ['-C', dir, ...args], {
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'ignore'],
			timeout: 5000,
		}).trim();
	} catch {
		return null;
	}
}

/** Is an executable on PATH? (`unzip`/`zipinfo` — the pipeline shells out.) */
function onPath(binary: string): boolean {
	try {
		execFileSync('command', ['-v', binary], { stdio: 'ignore', shell: true, timeout: 3000 });
		return true;
	} catch {
		return false;
	}
}

// ---------------------------------------------------------------------------
// CONSUMER role — "can this installation take an update?"
// ---------------------------------------------------------------------------

export interface RestorePoint {
	name: string;
	stamp: number;
	/** Carries package.json + node_modules — the rollback-BOOTABILITY contract. */
	bootable: boolean;
}

export interface ConsumerStatus {
	engine: {
		version: string;
		engine_version: string;
		build: string | null;
		sha: string | null;
		posture: 'release' | 'dev';
		/** Which channel this tree was installed from — null on a dev checkout. */
		install_channel: InstallChannel | null;
		/** sha256 of the archive it was installed from — null on a dev checkout. */
		install_digest: string | null;
		bun: string;
		bun_pin: string | null;
	};
	checks: StatusCheck[];
	/** False when ANY check is `blocked` — the panel's headline verdict. */
	ready: boolean;
	last_update: CodeUpdateSentinel | null;
	restore_points: RestorePoint[];
	tree: {
		root: string;
		backup_root: string;
		staging_leftover: boolean;
		/** Root entries the release must ship, or the swap refuses them (the
		 * INPUT to `refuseUnaccountedLiveEntries`, not its verdict). */
		unaccounted_root_entries: string[];
	};
}

/** The supervisor gate (code_update.ts assertSwapPreconditions, first refusal). */
function supervisorCheck(): StatusCheck {
	return probe('supervisor', () =>
		isSupervised()
			? check('supervisor', 'ok')
			: check('supervisor', 'blocked', 'DEDALO_SUPERVISED'),
	);
}

/** The deployment channel (channel.ts): `image` cannot tree-swap at all. */
function channelCheck(): StatusCheck {
	return probe('channel', () => {
		const channel = detectDeploymentChannel(projectRoot);
		return check('channel', channel === 'image' ? 'blocked' : 'ok', channel);
	});
}

/** Maintenance mode + superuser (preconditions.ts, both hard). */
function operatorChecks(principal: Principal): StatusCheck[] {
	return [
		probe('maintenance_mode', () =>
			getServerState().maintenance_mode === true
				? check('maintenance_mode', 'ok')
				: check('maintenance_mode', 'blocked'),
		),
		check('superuser', principal.userId === SUPERUSER_ID ? 'ok' : 'blocked'),
	];
}

/**
 * The recent-backup gate. Since 2026-08-23 this REFUSES a code update
 * (`backupRequire`), so it is `blocked`, not a warning — but it is the one
 * gate the request can waive, which the panel says by keeping the age fact.
 */
function backupFreshnessCheck(): StatusCheck {
	return probe('backup_fresh', () => {
		// The pipeline's OWN predicate, not a second copy of it — the panel
		// rounded and the refusal did not, which made them disagree for the
		// half hour after every freshness deadline (see backupFreshness).
		const { hours, stale } = backupFreshness();
		if (hours === null) return check('backup_fresh', 'blocked', 'none');
		return check('backup_fresh', stale ? 'blocked' : 'ok', String(Math.round(hours)));
	});
}

/** The runtime-path census gate: no runtime data may live inside the tree. */
function runtimeDataCheck(): StatusCheck {
	return probe('runtime_data_outside_tree', () => {
		const inside = runtimePathsInsideTree(projectRoot);
		return inside.length === 0
			? check('runtime_data_outside_tree', 'ok')
			: check(
					'runtime_data_outside_tree',
					'blocked',
					inside.map((entry) => `${entry.id}: ${entry.path}`).join('; '),
				);
	});
}

/** The backup root must resolve OUTSIDE the tree its own swap would rename. */
function backupLocationCheck(backupRoot: string): StatusCheck {
	return probe('backup_root_outside_tree', () =>
		backupRootIsInsideTree(backupRoot, projectRoot)
			? check('backup_root_outside_tree', 'blocked', backupRoot)
			: check('backup_root_outside_tree', 'ok', backupRoot),
	);
}

/** The archive tools the pipeline shells out to (unzip + zipinfo). */
function toolchainCheck(): StatusCheck {
	return probe('archive_toolchain', () => {
		const missing = ['unzip', 'zipinfo'].filter((binary) => !onPath(binary));
		return missing.length === 0
			? check('archive_toolchain', 'ok')
			: check('archive_toolchain', 'blocked', missing.join(', '));
	});
}

/**
 * The release's OWN `.bun-version` pin is a hard gate (prepareQuarantine) but
 * is only readable once the archive is extracted. Honest answer: report the
 * RUNNING bun and this tree's pin, and say the verdict needs the release.
 */
function bunPinCheck(livePin: string | null): StatusCheck {
	if (livePin === null || livePin === '') return check('bun_pin', 'unknown', Bun.version);
	return livePin === Bun.version
		? check('bun_pin', 'ok', Bun.version)
		: check('bun_pin', 'warn', `${Bun.version} != ${livePin}`);
}

/** Leftover `.code_staging` from an interrupted run (the pipeline sweeps it,
 * but its presence tells the operator a previous attempt died mid-flight). */
function stagingCheck(backupRoot: string): StatusCheck {
	return probe('staging_clean', () => {
		// A PARKED LIVE TREE is not a leftover — `prepareStagingDirOrRefuse`
		// hard-refuses on its marker, so the panel must say `blocked`. Reported
		// as a bare `warn`, it left `ready` true and the headline reading
		// "Ready to update" over an install the pipeline refuses immediately.
		if (stagingHoldsParkedTree(backupRoot)) {
			return check('staging_clean', 'blocked', STAGING_KEEP_MARKER);
		}
		return existsSync(codeStagingDir(backupRoot))
			? check('staging_clean', 'warn')
			: check('staging_clean', 'ok');
	});
}

/**
 * The root-whitelist INPUT: live root entries that a release would have to
 * ship, or `refuseUnaccountedLiveEntries` moves them into the backup and
 * refuses. Derived from the pipeline's own PRESERVE_ROOT_ENTRIES + the census,
 * never a second copy of the rule. The VERDICT needs the release's file list,
 * so the check stays `unknown` when there are entries to report.
 */
function rootEntriesCheck(): { entries: string[]; check: StatusCheck } {
	try {
		const censusInside = new Set(
			runtimePathsInsideTree(projectRoot).map((entry) => entry.path.split('/').pop() ?? ''),
		);
		const entries = readdirSync(projectRoot).filter(
			(name) =>
				!PRESERVE_ROOT_ENTRIES.has(name) && name !== 'node_modules' && !censusInside.has(name),
		);
		// A release ships most of these; only the operator knows which are theirs.
		return { entries, check: check('root_entries', 'unknown', String(entries.length)) };
	} catch (error) {
		return {
			entries: [],
			check: check(
				'root_entries',
				'unknown',
				error instanceof Error ? error.message : 'unreadable',
			),
		};
	}
}

/** The sentinel of the LAST code update — from/to, when, and its status. */
function readSentinel(): CodeUpdateSentinel | null {
	try {
		const path = codeUpdateSentinelPath();
		if (path === null || !existsSync(path)) return null;
		return JSON.parse(readFileSync(path, 'utf8')) as CodeUpdateSentinel;
	} catch {
		return null;
	}
}

/** The rollback candidates on disk, newest first, with their bootability. */
function readRestorePoints(backupRoot: string): RestorePoint[] {
	try {
		return readdirSync(backupRoot)
			.filter((name) => name.startsWith('dedalo_'))
			.map((name) => {
				const dir = join(backupRoot, name);
				// NO `bytes`. It used to report `statSync(dir).size` — the
				// DIRECTORY INODE's size (measured 672 B–1.6 KB for multi-GB
				// trees), rendered through format_bytes beside a green
				// "bootable" pill, so every restore point advertised a
				// nonsense KB figure. Walking the tree is not the fix either:
				// node_modules is ~10^5 inodes on a synchronous panel path.
				return {
					name,
					stamp: statSync(dir).mtimeMs,
					bootable: existsSync(join(dir, 'package.json')) && existsSync(join(dir, 'node_modules')),
				};
			})
			.sort((a, b) => b.stamp - a.stamp);
	} catch {
		return [];
	}
}

function readLiveBunPin(): string | null {
	try {
		return readFileSync(join(projectRoot, '.bun-version'), 'utf8').trim();
	} catch {
		return null;
	}
}

/** The consumer half of the panel: readiness + provenance + rollback state. */
export function consumerStatus(principal: Principal): ConsumerStatus {
	const backupRoot = probeBackupRoot();
	const livePin = readLiveBunPin();
	const rootEntries = rootEntriesCheck();
	const checks: StatusCheck[] = [
		supervisorCheck(),
		channelCheck(),
		...operatorChecks(principal),
		backupFreshnessCheck(),
		backupLocationCheck(backupRoot),
		runtimeDataCheck(),
		toolchainCheck(),
		bunPinCheck(livePin),
		stagingCheck(backupRoot),
		rootEntries.check,
	];
	return {
		engine: {
			version: DEDALO_VERSION,
			engine_version: DEDALO_ENGINE_VERSION,
			build: DEDALO_BUILD,
			sha: DEDALO_BUILD_SHA,
			posture: enginePosture(DEDALO_BUILD, INSTALLED_CHANNEL),
			// WHICH ARCHIVE is live, and from which channel (install_stamp.ts).
			// The digest is what an operator compares against the release they
			// meant to install when the version cannot tell them apart.
			install_channel: INSTALLED_CHANNEL,
			install_digest: INSTALLED_DIGEST,
			bun: Bun.version,
			bun_pin: livePin,
		},
		checks,
		ready: !checks.some((entry) => entry.state === 'blocked'),
		last_update: readSentinel(),
		restore_points: readRestorePoints(backupRoot),
		tree: {
			root: projectRoot,
			backup_root: backupRoot,
			staging_leftover: existsSync(join(backupRoot, '.code_staging')),
			unaccounted_root_entries: rootEntries.entries,
		},
	};
}

function probeBackupRoot(): string {
	try {
		return resolveCodeBackupRoot();
	} catch {
		return '';
	}
}

// ---------------------------------------------------------------------------
// CODE-SERVER role — "can this instance publish a release others can install?"
// ---------------------------------------------------------------------------

/**
 * The ref a PUBLISHED release is built from. Not a preference: `releaseFileName`
 * (code_build_plan.ts) gives only a `master` build the advertised `<v>.zip`
 * name — every other ref gets the un-advertised `-dev` suffix. So the publish
 * checks below must ask THIS ref, whatever the operator happens to have checked
 * out, and say which ref they asked.
 */
const RELEASE_REF = 'master';

export interface PublishedRelease {
	version: string;
	/** `master` claims the advertised `<v>.zip`; `dev` is servable but never advertised. */
	channel: 'master' | 'dev';
	file: string;
	bytes: number;
	stamp: number;
	sidecar: boolean;
	url: string;
}

export interface CodeServerStatus {
	is_a_code_server: boolean;
	/**
	 * This master OFFERS developer builds to consumers that ask for them
	 * (DEDALO_CODE_SERVER_DEV_CHANNEL). Without it on the panel, an operator
	 * cannot tell "the consumer never asked" from "I refused to answer".
	 */
	dev_channel: boolean;
	checks: StatusCheck[];
	ready: boolean;
	source: {
		git_dir: string | null;
		head_sha: string | null;
		head_date: string | null;
		branch: string | null;
		dirty: boolean | null;
		has_master_ref: boolean | null;
		bun_pin: string | null;
		/** The ref a published release is built from (never the checked-out one). */
		release_ref: string;
		release_sha: string | null;
		release_date: string | null;
		/**
		 * The version RELEASE_REF's own `version.ts` DECLARES — the name a
		 * publish will actually produce. Not the running engine's version: the
		 * panel's confirm text used to promise "a release of the current
		 * version (X)" from `page_globals.dedalo_version`, which is only true
		 * while the process and the ref happen to agree.
		 */
		release_version: string | null;
		/**
		 * How far the release ref is from the checked-out branch:
		 * `behind` = commits on the branch that the release ref does NOT have
		 * (work that will not ship until merged — the answer to "I fixed it,
		 * why is the panel still red?"), `ahead` = the reverse. Null when the
		 * two cannot be compared (a detached HEAD, a missing ref).
		 */
		divergence: { ahead: number; behind: number } | null;
	};
	files_dir: string | null;
	releases: PublishedRelease[];
	/** Release dirs the walk could not read — never folded into an empty list. */
	releases_unreadable: string[];
	/**
	 * What consumers would actually be offered. `for_version`/`files` keep the
	 * master's-own-version answer (wire-frozen); `rungs` is the useful one — a
	 * row per distinct catalog `updateFrom`, i.e. per real museum position.
	 */
	advertises: {
		for_version: string;
		files: CodeReleaseItem[];
		rungs: { for_version: string; files: CodeReleaseItem[] }[];
	};
}

/**
 * The build gate, asked through `planCodeBuild` itself — the same refusal
 * order the Build button hits (code server → dirs → version → ref → path), so
 * the panel can never promise a build the planner would refuse.
 */
function buildPlanCheck(): StatusCheck {
	return probe('build_plan', () => {
		const plan = planCodeBuild(
			{ version: DEDALO_VERSION, ref: RELEASE_REF },
			{
				isCodeServer: config.update.isCodeServer,
				codeServerGitDir: config.update.codeServerGitDir,
				codeFilesDir: config.update.codeFilesDir,
			},
		);
		return plan.ok
			? check('build_plan', 'ok', plan.filePath, RELEASE_REF)
			: check('build_plan', 'blocked', plan.error, RELEASE_REF);
	});
}

/** A configured directory that must exist and be writable to publish. */
function directoryCheck(id: string, dir: string | null | undefined): StatusCheck {
	return probe(id, () => {
		if (dir === undefined || dir === null || dir === '') return check(id, 'blocked', 'unset');
		if (!existsSync(dir)) return check(id, 'blocked', dir);
		// EXISTS is not ENOUGH. A regular file at the configured path passes
		// existsSync, so the panel used to read `ok` while nothing could be built
		// or served from it (code_manifest's own existsSync guard then returned an
		// empty release list, and the boot provisioner blamed permissions).
		if (!statSync(dir).isDirectory()) return check(id, 'blocked', `${dir} (not a directory)`);
		return check(id, 'ok', dir);
	});
}

/**
 * Does an archive of the build ref carry SYMLINK entries? The consumer's
 * zipinfo pre-validation refuses the WHOLE archive on the first one
 * (code_update.ts), so a checkout in this state publishes releases nobody can
 * install — the 2026-08-23 agent-alias bug, surfaced where it is created
 * instead of where it lands. Gate for this repo: release_archive_tripwire.
 */
function archiveShapeCheck(gitDir: string | null, ref: string): StatusCheck {
	return probe('archive_installable', () => {
		if (gitDir === null) return check('archive_installable', 'unknown', 'no git dir', ref);
		// `set -o pipefail` is LOAD-BEARING: without it a failing `git archive`
		// (missing ref, unreadable dir) still exits 0 because `tar` happily
		// consumes the empty stream — and an empty listing has no symlink lines,
		// so the check would answer a confident, false `ok`. Found 2026-08-24
		// against a code-server dir that did not exist.
		const listing = execFileSync(
			'bash',
			['-c', `set -o pipefail; git -C '${gitDir}' archive --format=tar '${ref}' | tar -tvf -`],
			{ encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 60_000, maxBuffer: 64e6 },
		);
		const symlinks = archiveSymlinkNames(listing);
		return symlinks.length === 0
			? check('archive_installable', 'ok', undefined, ref)
			: check('archive_installable', 'blocked', symlinks.join(', '), ref);
	});
}

/**
 * The LINK NAMES in a `tar -tv` listing — the entries the installer refuses.
 *
 * The naive `line.split(' ').pop()` returns `.agents` for
 * `… .claude -> .agents`: the link's TARGET, not the offending entry. That
 * points the operator at the wrong file, which on a panel whose whole job is
 * naming the blocker is a defect, not a cosmetic slip (found 2026-08-24 by the
 * panel reporting `.agents, AGENTS.md` for symlinks actually named `.claude`
 * and `CLAUDE.md`). So: cut the ` -> target` half off first, then take
 * everything after the timestamp column, which keeps names containing spaces
 * intact.
 */
export function archiveSymlinkNames(listing: string): string[] {
	const names: string[] = [];
	for (const line of listing.split('\n')) {
		if (!/^l[rwxsStT-]{9}\s/.test(line)) continue;
		const name = symlinkNameOf(line);
		if (name !== '') names.push(name);
	}
	return names;
}

/** The NAME column of one `tar -tv` link line ('' when the line yields none). */
function symlinkNameOf(line: string): string {
	const linkHalf = (line.split(' -> ')[0] ?? '').trimEnd();
	// `<mode> <size> <owner> <group> <size> <month> <day> <HH:MM|year> <name>`
	const named = /\s(?:\d{2}:\d{2}|\d{4})\s+(.+)$/.exec(linkHalf);
	return named?.[1] ?? linkHalf.split(/\s+/).pop() ?? '';
}

/** The `.bun-version` pin of a source checkout — absent is an ANSWER, not an error. */
function readBunPin(gitDir: string): string | null {
	try {
		return readFileSync(join(gitDir, '.bun-version'), 'utf8').trim();
	} catch {
		return null;
	}
}

/** The RELEASE_REF half of `source`: present/absent, and what it points at. */
function readReleaseRef(
	gitDir: string,
): Pick<
	CodeServerStatus['source'],
	| 'has_master_ref'
	| 'release_ref'
	| 'release_sha'
	| 'release_date'
	| 'release_version'
	| 'divergence'
> {
	const hasRelease = git(gitDir, ['rev-parse', '--verify', '--quiet', RELEASE_REF]) !== null;
	return {
		has_master_ref: hasRelease,
		release_ref: RELEASE_REF,
		release_sha: hasRelease ? git(gitDir, ['rev-parse', '--short', RELEASE_REF]) : null,
		release_date: hasRelease ? git(gitDir, ['log', '-1', '--format=%cI', RELEASE_REF]) : null,
		release_version: hasRelease ? declaredVersionAtRef(gitDir, RELEASE_REF) : null,
		divergence: hasRelease ? readDivergence(gitDir) : null,
	};
}

/** Everything git knows about the tree the releases are built FROM. */
function readSource(gitDir: string | null): CodeServerStatus['source'] {
	if (gitDir === null || !existsSync(gitDir)) {
		return {
			git_dir: gitDir,
			head_sha: null,
			head_date: null,
			branch: null,
			dirty: null,
			has_master_ref: null,
			bun_pin: null,
			release_ref: RELEASE_REF,
			release_sha: null,
			release_date: null,
			release_version: null,
			divergence: null,
		};
	}
	const dirty = git(gitDir, ['status', '--porcelain']);
	return {
		git_dir: gitDir,
		head_sha: git(gitDir, ['rev-parse', '--short', 'HEAD']),
		head_date: git(gitDir, ['log', '-1', '--format=%cI']),
		branch: git(gitDir, ['rev-parse', '--abbrev-ref', 'HEAD']),
		dirty: dirty === null ? null : dirty !== '',
		bun_pin: readBunPin(gitDir),
		...readReleaseRef(gitDir),
	};
}

/**
 * `<ahead> <behind>` between the release ref and HEAD, via git's own
 * rev-list --count --left-right. `behind` counts commits HEAD has that the
 * release ref does not — the number an operator needs when the publish checks
 * are red on work they have already committed.
 */
function readDivergence(gitDir: string): { ahead: number; behind: number } | null {
	const counted = git(gitDir, ['rev-list', '--left-right', '--count', `${RELEASE_REF}...HEAD`]);
	if (counted === null) return null;
	const [ahead, behind] = counted.split(/\s+/).map(Number);
	if (!Number.isInteger(ahead) || !Number.isInteger(behind)) return null;
	return { ahead: ahead as number, behind: behind as number };
}

/** An UNSET/absent directory is an answer ('nothing published'), never an error. */
function isReadableDir(dir: string | null | undefined): dir is string {
	return dir !== undefined && dir !== null && dir !== '' && existsSync(dir);
}

/**
 * The immediate SUBDIRECTORY names of `dir`, or null when the directory itself
 * could not be read.
 *
 * `withFileTypes` + an `isDirectory()` filter is load-bearing, not tidiness:
 * the release layout is `<filesDir>/<major>/<major.minor>/`, and a single
 * NON-directory entry at either level (a `.DS_Store` — which macOS plants in
 * every browsed dir, a README, a stray sidecar) used to make the next
 * `readdirSync` throw ENOTDIR and abort the WHOLE walk. The panel then reported
 * "Published releases: None" over a dir full of served archives, and the gate
 * that compares `advertises` against `releases` fired its
 * offering-a-release-that-is-not-on-disk alarm for a directory-walk bug
 * (measured 2026-08-24: `code/.DS_Store` AND `code/7/.DS_Store` both present).
 */
function releaseSubdirs(dir: string): string[] | null {
	try {
		return readdirSync(dir, { withFileTypes: true })
			.filter((entry) => entry.isDirectory())
			.map((entry) => entry.name);
	} catch {
		return null;
	}
}

/**
 * Every archive already published under the code-files dir, newest first, and
 * whether the walk was COMPLETE. A level that could not be read is reported
 * (`unreadable`), never silently folded into a short list: "no releases" and
 * "I could not look" are different facts and the panel must not conflate them.
 */
function readReleases(
	filesDir: string | undefined,
	publicBaseUrl: string,
): { releases: PublishedRelease[]; unreadable: string[] } {
	if (!isReadableDir(filesDir)) return { releases: [], unreadable: [] };
	const found: PublishedRelease[] = [];
	const unreadable: string[] = [];
	const majors = releaseSubdirs(filesDir);
	if (majors === null) return { releases: [], unreadable: [filesDir] };
	for (const major of majors) {
		collectMajorDir(join(filesDir, major), publicBaseUrl, found, unreadable);
	}
	return { releases: found.sort((a, b) => b.stamp - a.stamp), unreadable };
}

/** One `<filesDir>/<major>/` level: its `<major.minor>/` dirs and their archives. */
function collectMajorDir(
	majorDir: string,
	publicBaseUrl: string,
	found: PublishedRelease[],
	unreadable: string[],
): void {
	const minors = releaseSubdirs(majorDir);
	if (minors === null) {
		unreadable.push(majorDir);
		return;
	}
	for (const minor of minors) {
		const minorDir = join(majorDir, minor);
		if (!collectReleaseDir(minorDir, publicBaseUrl, found)) unreadable.push(minorDir);
	}
}

/** One release dir's archives; false when the dir itself could not be read. */
function collectReleaseDir(dir: string, publicBaseUrl: string, into: PublishedRelease[]): boolean {
	let entries: string[];
	try {
		entries = readdirSync(dir);
	} catch {
		return false;
	}
	for (const file of entries) {
		const match = /^(\d+\.\d+\.\d+)(-dev)?\.zip$/.exec(file);
		if (match === null) continue;
		const version = match[1] as string;
		let stat: ReturnType<typeof statSync>;
		try {
			stat = statSync(join(dir, file));
		} catch {
			continue; // vanished between readdir and stat (a rotation racing us)
		}
		into.push({
			version,
			channel: match[2] === undefined ? 'master' : 'dev',
			file,
			bytes: stat.size,
			stamp: stat.mtimeMs,
			sidecar: existsSync(join(dir, `${file}.sha256`)),
			// ONE builder for both this and the manifest (code_manifest.ts
			// releaseItemFor): `publicBaseUrl` ALREADY ends in
			// /dedalo/install/code — appending it again here produced
			// `…/dedalo/install/code/dedalo/install/code/<v>/<v>.zip`, a path
			// `resolveCodeReleaseFile` refuses, for an archive that serves fine
			// at the single-prefix URL.
			url: codeReleaseUrl(publicBaseUrl, version, file),
		});
	}
	return true;
}

/** `master_ref`: does the release ref exist at all (unknown when git could not answer). */
function masterRefCheck(source: CodeServerStatus['source']): StatusCheck {
	return probe('master_ref', () =>
		source.has_master_ref === null
			? check('master_ref', 'unknown', undefined, RELEASE_REF)
			: check('master_ref', source.has_master_ref ? 'ok' : 'blocked', undefined, RELEASE_REF),
	);
}

/**
 * `worktree_clean`. A dirty worktree does not refuse the build — `git archive`
 * silently packages HEAD, so the uncommitted work is simply ABSENT from the
 * release. That is a warning the operator must see before publishing.
 */
function worktreeCleanCheck(source: CodeServerStatus['source']): StatusCheck {
	return probe('worktree_clean', () =>
		source.dirty === null
			? check('worktree_clean', 'unknown')
			: check('worktree_clean', source.dirty ? 'warn' : 'ok'),
	);
}

/**
 * `release_ref_current` — the commits-not-in-the-release-ref line. A WARNING,
 * not a blocker: publishing an older `master` is a legitimate act. It exists
 * because without it a publish check red on work the operator has ALREADY
 * committed reads as a false alarm — the fix is on their branch, and the panel
 * was looking at the release ref all along.
 */
function releaseRefCurrentCheck(source: CodeServerStatus['source']): StatusCheck {
	return probe('release_ref_current', () => {
		if (source.divergence === null) {
			return check('release_ref_current', 'unknown', undefined, RELEASE_REF);
		}
		if (source.divergence.behind === 0) {
			return check('release_ref_current', 'ok', undefined, RELEASE_REF);
		}
		return check(
			'release_ref_current',
			'warn',
			`${source.divergence.behind} / ${source.branch ?? 'HEAD'}`,
			RELEASE_REF,
		);
	});
}

/** The code-server half of the panel: role, build source, artifacts, manifest. */
/**
 * 'dev' | 'release' — what this tree IS, not merely how it was produced.
 *
 * Build provenance alone answers the wrong question: `git archive` expands the
 * build stamp for EVERY ref, so a `v7` branch build looks exactly as
 * "released" as a `master` one. A tree installed from the developer channel is
 * therefore 'dev' however well-stamped it is; a tree with no install stamp
 * (any release predating them) is judged on provenance, as before.
 */
export function enginePosture(
	build: string | null,
	installChannel: InstallChannel | null,
): 'dev' | 'release' {
	if (build === null) return 'dev';
	return installChannel === 'dev' ? 'dev' : 'release';
}

/**
 * Every readiness line of the code-server half, in the order an operator reads
 * them. Split out of `codeServerStatus` so the assembly of the payload and the
 * list of things it asks are two separate, separately-readable jobs.
 */
function codeServerChecks(
	gitDir: string | null,
	filesDir: string | null,
	source: CodeServerStatus['source'],
	published: { releases: PublishedRelease[]; unreadable: string[] },
	publicBaseUrl: string,
): StatusCheck[] {
	return [
		check('is_a_code_server', config.update.isCodeServer ? 'ok' : 'blocked'),
		directoryCheck('git_dir', gitDir ?? undefined),
		directoryCheck('files_dir', filesDir ?? undefined),
		buildPlanCheck(),
		masterRefCheck(source),
		worktreeCleanCheck(source),
		archiveShapeCheck(gitDir, RELEASE_REF),
		// WHAT VERSION WOULD A PUBLISH ACTUALLY PRODUCE? The release is named
		// after the version its REF declares, so that question has an answer
		// before the button is pressed — and it has a wrong answer worth
		// blocking on: a ref declaring the version this master ALREADY runs
		// yields an archive assertLinearUpgrade refuses as a same-version
		// install. Measured 2026-08-24: a 7.0.0 master published a 7.0.0.zip
		// nobody could install, and nothing said so until a consumer tried.
		releaseVersionCheck(gitDir, RELEASE_REF),
		releaseRefCurrentCheck(source),
		// "No releases" and "I could not look" are DIFFERENT facts. Folding an
		// unreadable level into an empty list is what let a stray `.DS_Store`
		// present itself as an empty release dir.
		releasesReadableCheck(published.unreadable),
		// The origin this master will BAKE INTO every advertised URL. A
		// localhost origin is not a cosmetic slip: `get_code_update_info` hands
		// every museum a `file.url` nothing outside this machine can fetch, and
		// the consumer only discovers it at download time — after maintenance
		// mode is already on.
		advertisedOriginCheck(publicBaseUrl),
	];
}

/** `releases_readable`: which release dirs, if any, the walk could not read. */
function releasesReadableCheck(unreadable: string[]): StatusCheck {
	return unreadable.length === 0
		? check('releases_readable', 'ok')
		: check('releases_readable', 'warn', unreadable.join(', '));
}

export function codeServerStatus(publicBaseUrl: string): CodeServerStatus {
	const gitDir = config.update.codeServerGitDir ?? null;
	const filesDir = config.update.codeFilesDir ?? undefined;
	const source = readSource(gitDir);
	const published = readReleases(filesDir, publicBaseUrl);
	const checks = codeServerChecks(gitDir, filesDir ?? null, source, published, publicBaseUrl);
	return {
		is_a_code_server: config.update.isCodeServer,
		checks,
		ready: !checks.some((entry) => entry.state === 'blocked'),
		source,
		dev_channel: config.update.devChannelEnabled,
		files_dir: filesDir ?? null,
		releases: published.releases,
		releases_unreadable: published.unreadable,
		advertises: advertisedRungs(filesDir, publicBaseUrl),
	};
}

/**
 * The manifest each REACHABLE consumer version would be offered — one row per
 * distinct `updateFrom` triple in UPDATE_CATALOG.
 *
 * It used to ask exactly ONE question: "what would a consumer at the master's
 * OWN version get?" (`clientVersion: DEDALO_VERSION_TRIPLE`). That is the one
 * version whose answer is least useful: the master publishes releases AT its
 * own version, so a correctly-operating master that had just published
 * `<v>.zip` rendered "No release is offered" — the panel reporting a fault in
 * the exact steady state it was built to confirm. Meanwhile a real museum, one
 * or more rungs behind, got an answer nobody could see.
 */
function advertisedRungs(
	filesDir: string | undefined,
	publicBaseUrl: string,
): CodeServerStatus['advertises'] {
	const seen = new Set<string>();
	const rows: CodeServerStatus['advertises']['rungs'] = [];
	for (const descriptor of Object.values(UPDATE_CATALOG)) {
		const from = [
			descriptor.updateFromMajor,
			descriptor.updateFromMedium,
			descriptor.updateFromMinor,
		];
		const key = from.join('.');
		if (seen.has(key)) continue;
		seen.add(key);
		rows.push({
			for_version: key,
			files: buildCodeUpdateInfo({
				clientVersion: from,
				serverVersion: DEDALO_VERSION_TRIPLE,
				codeFilesDir: filesDir,
				publicBaseUrl,
				info: { date: '', entity_id: null, entity: null, host: null },
			}).files,
		});
	}
	return {
		for_version: DEDALO_VERSION,
		files: rows.find((row) => row.for_version === DEDALO_VERSION)?.files ?? [],
		rungs: rows,
	};
}

/** The version a ref's own version.ts declares, read from the object store. */
function declaredVersionAtRef(gitDir: string, ref: string): string | null {
	const source = git(gitDir, ['show', `${ref}:${VERSION_TS_PATH}`]);
	return source === null ? null : parseDeclaredTriple(source);
}

/** The version RELEASE_REF declares, and whether publishing it is useful. */
function releaseVersionCheck(gitDir: string | null, ref: string): StatusCheck {
	return probe('release_version_matches_ref', () => {
		if (gitDir === null) return check('release_version_matches_ref', 'unknown', undefined, ref);
		const declared = declaredVersionAtRef(gitDir, ref);
		if (declared === null) {
			// Nothing can be named, so nothing can be built.
			return check('release_version_matches_ref', 'blocked', VERSION_TS_PATH, ref);
		}
		if (declared === DEDALO_VERSION) {
			return check(
				'release_version_matches_ref',
				'warn',
				`${declared} = the running engine — a same-version release is not installable`,
				ref,
			);
		}
		return check('release_version_matches_ref', 'ok', declared, ref);
	});
}

/** Localhost/empty origins make every advertised release URL unfetchable. */
function advertisedOriginCheck(publicBaseUrl: string): StatusCheck {
	let host = '';
	try {
		host = new URL(publicBaseUrl).hostname;
	} catch {
		return check('advertised_origin', 'blocked', publicBaseUrl);
	}
	const local = host === '' || host === 'localhost' || host === '127.0.0.1' || host === '::1';
	return local
		? check('advertised_origin', 'blocked', host)
		: check('advertised_origin', 'ok', host);
}
