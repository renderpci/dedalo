/**
 * update_code widget (UPDATE_PROCESS Phase 4) — panel + the code-update
 * EXECUTE + the server-side release BUILD.
 * Panel (PHP update_code::get_value): the configured CODE_SERVERS probed for
 * reachability, the local staging dir, and whether this instance is itself a
 * code server (shows the build panel).
 * update_code EXECUTE: ownership-gated. Closed keeps the frozen engine_denied;
 * open downloads the selected release, verifies + extracts + swaps the TS
 * tree, and restarts (core/update/code_update.ts, WC-024).
 * restore_code EXECUTE: ownership-gated; open puts a RESTORE POINT back on the
 * tree — the same swap, run in reverse (core/update/code_restore.ts).
 * build_version_from_git_master: ownership-gated; open runs the git-archive
 * release build (core/update/code_build.ts).
 */

import { config } from '../../../config/config.ts';
import type { Principal } from '../../security/permissions.ts';
import {
	engineDenied,
	fromEnvelope,
	gated,
	type WidgetModule,
	type WidgetResponse,
} from './support.ts';

/**
 * update_code panel.
 *
 * Answers BOTH ROLES in one payload, because one installation can be either or
 * both and the operator should not have to guess which half applies:
 *  - `consumer` — the readiness readout (core/update/status.ts): every gate the
 *    update pipeline would refuse on, asked through the SAME predicates, plus
 *    the running build's provenance, the last update's sentinel and the
 *    restore points on disk. Before 2026-08-24 every one of those refusals was
 *    discoverable only by pressing the button and reading the failure;
 *  - `code_server` — the publish readiness: role + dirs through `planCodeBuild`
 *    itself, the build source's git state, the archives already on disk, and
 *    the manifest a consumer at this version would actually be offered (an
 *    empty manifest over a published zip is the catalog's doing, and the panel
 *    now shows both rather than leaving the operator to infer it).
 * The code-server half is computed ONLY for a code server: on a plain install
 * it is null, so no git spawn or directory walk happens at all.
 *
 * COVERAGE-EXEMPT (coverage plan §5.1; reason registered in
 * engineering/crap_coverage_exempt.json): a NETWORK probe loop over
 * `config.update.codeServers`, which is EMPTY on every default install (so the
 * loop body is unreachable there), spreading `checkRemoteServer`'s own response
 * fields. A gate would either assert an empty loop or make an outbound request.
 * The status halves it now spreads are gated in update_status_native.test.ts.
 */
async function updateCodeGetValue(
	_options: Record<string, unknown>,
	principal: Principal,
): Promise<WidgetResponse> {
	const { checkRemoteServer } = await import('../../ontology/data_io_import.ts');
	const servers: Record<string, unknown>[] = [];
	for (const server of config.update.codeServers) {
		// Reuse the ontology transport probe (same get_server_ready_status POST),
		// asking for the CODE role: a code-only master refuses the ontology check.
		const probe = await checkRemoteServer({ ...server }, 'code_server');
		servers.push({
			...server,
			msg: probe.msg,
			errors: probe.errors,
			response_code: probe.code,
			// The REMOTE's own decoded body; `result` is the panel key the client
			// reads (the probe's own outcome field is `data` since the P1 sweep).
			result: probe.data,
		});
	}
	const { codeServerStatus, consumerStatus } = await import('../../update/status.ts');
	const { publicOrigin } = await import('../../resolve/public_origin.ts');
	return {
		data: {
			servers,
			// dedalo_source_version_local_dir dropped (2026-08-23): the engine
			// ignores DEDALO_SOURCE_VERSION_LOCAL_DIR entirely — staging is
			// <DEDALO_BACKUP_PATH>/.code_staging — and the client no longer
			// displays it. The config-catalog key is a retirement candidate.
			is_a_code_server: config.update.isCodeServer,
			consumer: consumerStatus(principal),
			// The self-probe is composed HERE, not inside codeServerStatus: that
			// function is synchronous filesystem work and stays that way, while
			// this one check has to go out over the network. It is appended to
			// the same list so the panel renders it like any other, and it can
			// only ever ADD a row — a probe that throws is impossible (the check
			// catches its own failures), and `ready` still follows the same
			// blocked-if-any rule.
			code_server: config.update.isCodeServer
				? await withReachability(codeServerStatus(`${publicOrigin()}/dedalo/install/code`))
				: null,
		},
	};
}

/**
 * Append the advertised-URL self-probe to a code-server readout.
 *
 * Kept out of `codeServerStatus` so that function stays sync and pure — the
 * network is the only asynchronous thing in the whole readout, and folding it
 * in would make every caller await a fetch to read a directory listing.
 */
async function withReachability(
	status: Awaited<ReturnType<typeof import('../../update/status.ts').codeServerStatus>>,
): Promise<typeof status> {
	const { advertisedUrlReachableCheck } = await import('../../update/status.ts');
	const reachable = await advertisedUrlReachableCheck(status.releases);
	const checks = [...status.checks, reachable];
	return { ...status, checks, ready: !checks.some((entry) => entry.state === 'blocked') };
}

/**
 * The OPEN (owned) code-update: a BACKGROUND mediaJobs job running the full
 * pipeline (download + verify + extract + deps + preflight + swap + restart);
 * the immediate answer is the {pid, pfile} poll handle the maintenance client
 * feeds to dd_utils_api:get_process_status, and the pipeline's phase frames
 * (core/update/code_update.ts UpdatePhaseFrame) ride the job's `data`.
 *
 * KNOWN LIMIT, BY DESIGN: the restart phase kills THIS process, which orphans
 * the in-process job — core/api/process_status.ts's dead-owner reconcile then
 * emits a terminal `interrupted` frame. That is the designed HANDOFF: the
 * client saw `phase:'restart'` with `expected_version` first, so it switches
 * to polling GET /health (which now carries `version`) instead of treating the
 * interruption as a failure. Do not "fix" the interruption away.
 *
 * COVERAGE-EXEMPT (coverage plan §5.2; reason registered in
 * engineering/crap_coverage_exempt.json): a thin job-submission wrapper over
 * `core/update/code_update.ts`, gated in its own suite. EXECUTING it replaces
 * the code tree on disk and restarts the process.
 */
async function updateCodeOwned(
	options: Record<string, unknown>,
	principal: Principal,
): Promise<WidgetResponse> {
	const { updateCode } = await import('../../update/code_update.ts');
	const { mediaJobs } = await import('../../media/jobs.ts');
	const record = mediaJobs.submit(
		'update_code',
		async ({ onData }) => {
			// core/update/** REFUSES BY THROWING (update.refused / update.failed);
			// phase frames stream through the job's data channel as it advances.
			return await updateCode(options, principal, { onPhase: (frame) => onData(frame) });
		},
		{ userId: principal.userId },
	);
	return {
		data: true,
		msg: `OK. Running publication ${process.pid}`,
		// In-process job: the server process runs it (same shape as
		// update_data_version's background branch — the client polls
		// dd_utils_api:get_process_status with {pid, pfile}).
		extend: { pid: process.pid, pfile: `${record.id}.json` },
	};
}

/**
 * The OPEN (owned) code RESTORE: a BACKGROUND mediaJobs job putting a restore
 * point back on the tree (pre-flight smoke boot + swap + restart), answering
 * the same {pid, pfile} poll handle and streaming the same
 * `UpdatePhaseFrame`s — `download`/`verify`/`extract`/`deps` arrive `skipped`,
 * so the client's phase reducer needs no restore-specific branch.
 *
 * The SAME known limit as the update, by design: the restart kills this
 * process and orphans the job, and the client switches to /health polling on
 * the `restart` frame's `expected_version`. Do not "fix" the interruption away.
 *
 * COVERAGE-EXEMPT (coverage plan §5.2; reason registered in
 * engineering/crap_coverage_exempt.json): a thin job-submission wrapper over
 * `core/update/code_restore.ts`, gated in its own suite. EXECUTING it replaces
 * the code tree on disk and restarts the process.
 */
/**
 * The OPEN (owned) restore-point DELETE — synchronous, unlike its two
 * neighbours, and deliberately.
 *
 * `update_code` and `restore_code` submit background jobs because they end in a
 * server restart that kills the caller. A delete ends in a directory being gone
 * (or not), and that answer IS the product: `deleteRestorePoint` re-checks the
 * path after removing it and refuses when anything survives, so the operator
 * gets a verdict instead of a submission receipt. Measured 2026-08-28 on a
 * Docker Desktop bind mount: an `rm` that reports success and leaves the
 * directory behind is exactly the case a job handle would have hidden.
 */
async function deleteRestorePointOwned(
	options: Record<string, unknown>,
	principal: Principal,
): Promise<WidgetResponse> {
	const { deleteRestorePoint } = await import('../../update/code_restore.ts');
	return fromEnvelope(await deleteRestorePoint(options, principal));
}

async function restoreCodeOwned(
	options: Record<string, unknown>,
	principal: Principal,
): Promise<WidgetResponse> {
	const { restoreCode } = await import('../../update/code_restore.ts');
	const { mediaJobs } = await import('../../media/jobs.ts');
	const record = mediaJobs.submit(
		'restore_code',
		async ({ onData }) => {
			// core/update/** REFUSES BY THROWING (update.refused / update.failed);
			// phase frames stream through the job's data channel as it advances.
			return await restoreCode(options, principal, { onPhase: (frame) => onData(frame) });
		},
		{ userId: principal.userId },
	);
	return {
		data: true,
		msg: `OK. Running publication ${process.pid}`,
		extend: { pid: process.pid, pfile: `${record.id}.json` },
	};
}

/**
 * The OPEN (owned) release build: git archive of a ref.
 *
 * COVERAGE-EXEMPT (coverage plan §5.2; reason registered in
 * engineering/crap_coverage_exempt.json): a three-field unwrap forwarding to
 * `core/update/code_build.ts`, gated in its own suite; running it shells out to
 * git and writes a release archive.
 */
async function buildVersionOwned(options: Record<string, unknown>): Promise<WidgetResponse> {
	const { buildVersionFromGit } = await import('../../update/code_build.ts');
	// The panel's two buttons send a BRANCH ('master' / 'developer') and nothing
	// else. The release they build is the version THE REF DECLARES — no longer
	// the engine's current version: taking the name from the running process
	// while the bytes came from a ref meant a master left running across a
	// version bump published mislabelled archives, and a master whose ref
	// declares its OWN version published a same-version zip that
	// assertLinearUpgrade refuses as a downgrade (measured 2026-08-24: a 7.0.0
	// master produced an uninstallable 7.0.0.zip). An explicit `version` from an
	// API caller is now a CLAIM, checked against the ref and refused on mismatch.
	const branch = typeof options.branch === 'string' ? options.branch : undefined;
	const ref = typeof options.ref === 'string' ? options.ref : branch;
	return fromEnvelope(
		await buildVersionFromGit({
			...(typeof options.version === 'string' ? { version: options.version } : {}),
			...(ref === undefined ? {} : { ref }),
		}),
	);
}

export const widget: WidgetModule = {
	spec: {
		id: 'update_code',
		category: 'config',
		label: { kind: 'label_concat', keys: ['update', 'code'] },
	},
	apiActions: {
		// Ownership-gated (UPDATE_PROCESS Phase 4): closed = frozen engine_denied.
		update_code: gated(
			'update_code.update_code',
			engineDenied('update_code.update_code', 'it downloads and REPLACES the PHP code tree'),
			updateCodeOwned,
		),
		restore_code: gated(
			'update_code.restore_code',
			engineDenied('update_code.restore_code', 'it REPLACES the live code tree with a backup copy'),
			restoreCodeOwned,
		),
		delete_restore_point: gated(
			'update_code.delete_restore_point',
			engineDenied('update_code.delete_restore_point', 'it DELETES a code backup copy'),
			deleteRestorePointOwned,
		),
		build_version_from_git_master: gated(
			'update_code.build_version_from_git_master',
			engineDenied(
				'update_code.build_version_from_git_master',
				'it packages the PHP code tree from its git checkout',
			),
			buildVersionOwned,
		),
	},
	getValue: updateCodeGetValue,
};
