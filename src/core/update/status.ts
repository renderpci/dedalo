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
import { newestBackupMtimeMs } from '../area_maintenance/backup.ts';
import { runtimePathsInsideTree } from '../install/runtime_paths.ts';
import { getServerState } from '../resolve/server_state.ts';
import { type Principal, SUPERUSER_ID } from '../security/permissions.ts';
import { type CodeUpdateSentinel, codeUpdateSentinelPath } from './boot_confirm.ts';
import { DEDALO_BUILD, DEDALO_BUILD_SHA, DEDALO_ENGINE_VERSION } from './build_stamp.ts';
import { detectDeploymentChannel } from './channel.ts';
import { planCodeBuild } from './code_build_plan.ts';
import { buildCodeUpdateInfo, type CodeReleaseItem } from './code_manifest.ts';
import {
	backupRootIsInsideTree,
	isSupervised,
	PRESERVE_ROOT_ENTRIES,
	resolveCodeBackupRoot,
} from './code_update.ts';
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
	bytes: number;
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
		const newest = newestBackupMtimeMs();
		if (newest === 0) return check('backup_fresh', 'blocked', 'none');
		const hours = Math.round((Date.now() - newest) / 3600000);
		const stale = hours > config.ops.backupTimeRangeHours;
		return check('backup_fresh', stale ? 'blocked' : 'ok', String(hours));
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
	return probe('staging_clean', () =>
		existsSync(join(backupRoot, '.code_staging'))
			? check('staging_clean', 'warn')
			: check('staging_clean', 'ok'),
	);
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
				return {
					name,
					stamp: statSync(dir).mtimeMs,
					bytes: statSync(dir).size,
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
			posture: DEDALO_BUILD === null ? 'dev' : 'release',
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
	/** What a consumer AT THIS VERSION would actually be offered. */
	advertises: { for_version: string; files: CodeReleaseItem[] };
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
	'has_master_ref' | 'release_ref' | 'release_sha' | 'release_date' | 'divergence'
> {
	const hasRelease = git(gitDir, ['rev-parse', '--verify', '--quiet', RELEASE_REF]) !== null;
	return {
		has_master_ref: hasRelease,
		release_ref: RELEASE_REF,
		release_sha: hasRelease ? git(gitDir, ['rev-parse', '--short', RELEASE_REF]) : null,
		release_date: hasRelease ? git(gitDir, ['log', '-1', '--format=%cI', RELEASE_REF]) : null,
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

/** Every archive already published under the code-files dir, newest first. */
/** An UNSET/absent directory is an answer ('nothing published'), never an error. */
function isReadableDir(dir: string | null | undefined): dir is string {
	return dir !== undefined && dir !== null && dir !== '' && existsSync(dir);
}

function readReleases(
	filesDir: string | null | undefined,
	publicBaseUrl: string,
): PublishedRelease[] {
	if (!isReadableDir(filesDir)) return [];
	const found: PublishedRelease[] = [];
	try {
		for (const major of readdirSync(filesDir)) {
			for (const minor of readdirSync(join(filesDir, major))) {
				collectReleaseDir(join(filesDir, major, minor), publicBaseUrl, found);
			}
		}
	} catch {
		/* a half-built tree reports what it managed to read */
	}
	return found.sort((a, b) => b.stamp - a.stamp);
}

function collectReleaseDir(dir: string, publicBaseUrl: string, into: PublishedRelease[]): void {
	for (const file of readdirSync(dir)) {
		const match = /^(\d+\.\d+\.\d+)(-dev)?\.zip$/.exec(file);
		if (match === null) continue;
		const version = match[1] as string;
		const stat = statSync(join(dir, file));
		into.push({
			version,
			channel: match[2] === undefined ? 'master' : 'dev',
			file,
			bytes: stat.size,
			stamp: stat.mtimeMs,
			sidecar: existsSync(join(dir, `${file}.sha256`)),
			url: `${publicBaseUrl}/dedalo/install/code/${version}/${file}`,
		});
	}
}

/**
 * The manifest a consumer at THIS version would receive. An empty list with a
 * published zip on disk is the catalog's doing (UPDATE_CATALOG is empty for
 * 7.x) — the panel shows both, so the operator can see the difference instead
 * of inferring it.
 */
function advertisedFiles(filesDir: string | null, publicBaseUrl: string): CodeReleaseItem[] {
	return buildCodeUpdateInfo({
		clientVersion: DEDALO_VERSION_TRIPLE,
		serverVersion: DEDALO_VERSION_TRIPLE,
		codeFilesDir: filesDir ?? undefined,
		publicBaseUrl,
		info: { date: '', entity_id: null, entity: null, host: null },
	}).files;
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
export function codeServerStatus(publicBaseUrl: string): CodeServerStatus {
	const gitDir = config.update.codeServerGitDir ?? null;
	const filesDir = config.update.codeFilesDir ?? null;
	const source = readSource(gitDir);
	const checks: StatusCheck[] = [
		check('is_a_code_server', config.update.isCodeServer ? 'ok' : 'blocked'),
		directoryCheck('git_dir', gitDir ?? undefined),
		directoryCheck('files_dir', filesDir ?? undefined),
		buildPlanCheck(),
		masterRefCheck(source),
		worktreeCleanCheck(source),
		archiveShapeCheck(gitDir, RELEASE_REF),
		releaseRefCurrentCheck(source),
	];
	return {
		is_a_code_server: config.update.isCodeServer,
		checks,
		ready: !checks.some((entry) => entry.state === 'blocked'),
		source,
		files_dir: filesDir,
		releases: readReleases(filesDir, publicBaseUrl),
		advertises: {
			for_version: DEDALO_VERSION,
			files: advertisedFiles(filesDir, publicBaseUrl),
		},
	};
}
