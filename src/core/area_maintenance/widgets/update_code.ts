/**
 * update_code widget (UPDATE_PROCESS Phase 4) — panel + the code-update
 * EXECUTE + the server-side release BUILD.
 * Panel (PHP update_code::get_value): the configured CODE_SERVERS probed for
 * reachability, the local staging dir, and whether this instance is itself a
 * code server (shows the build panel).
 * update_code EXECUTE: ownership-gated. Closed keeps the frozen engine_denied;
 * open downloads the selected release, verifies + extracts + swaps the TS
 * tree, and restarts (core/update/code_update.ts, WC-024).
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
 * update_code panel (PHP get_value bytes).
 *
 * COVERAGE-EXEMPT (coverage plan §5.1; reason registered in
 * engineering/crap_coverage_exempt.json): a NETWORK probe loop over
 * `config.update.codeServers`, which is EMPTY on every default install (so the
 * loop body is unreachable there), spreading `checkRemoteServer`'s own response
 * fields. A gate would either assert an empty loop or make an outbound request.
 */
async function updateCodeGetValue(): Promise<WidgetResponse> {
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
	return {
		data: {
			servers,
			// dedalo_source_version_local_dir dropped (2026-08-23): the engine
			// ignores DEDALO_SOURCE_VERSION_LOCAL_DIR entirely — staging is
			// <DEDALO_BACKUP_PATH>/.code_staging — and the client no longer
			// displays it. The config-catalog key is a retirement candidate.
			is_a_code_server: config.update.isCodeServer,
		},
	};
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
 * The OPEN (owned) release build: git archive of a ref.
 *
 * COVERAGE-EXEMPT (coverage plan §5.2; reason registered in
 * engineering/crap_coverage_exempt.json): a three-field unwrap forwarding to
 * `core/update/code_build.ts`, gated in its own suite; running it shells out to
 * git and writes a release archive.
 */
async function buildVersionOwned(options: Record<string, unknown>): Promise<WidgetResponse> {
	const { buildVersionFromGit } = await import('../../update/code_build.ts');
	const { DEDALO_VERSION } = await import('../../update/version.ts');
	// The panel's two buttons send a BRANCH ('master' / 'developer') and nothing
	// else — the release they build is the engine's CURRENT version, exactly as
	// their confirm text promises. Until 2026-08-15 only `version`/`ref` were read,
	// so both buttons refused with 'Invalid version number' and a code master
	// could not build a single release. Explicit version/ref still win (API callers).
	const branch = typeof options.branch === 'string' ? options.branch : undefined;
	const version = typeof options.version === 'string' ? options.version : DEDALO_VERSION;
	const ref = typeof options.ref === 'string' ? options.ref : branch;
	return fromEnvelope(await buildVersionFromGit({ version, ref }));
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
