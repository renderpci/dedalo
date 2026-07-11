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
import { readEnv } from '../../../config/env.ts';
import { type WidgetModule, type WidgetResponse, engineDenied, gated } from './support.ts';

/** update_code panel (PHP get_value bytes). */
async function updateCodeGetValue(): Promise<WidgetResponse> {
	const { checkRemoteServer } = await import('../../ontology/data_io_import.ts');
	const servers: Record<string, unknown>[] = [];
	for (const server of config.update.codeServers) {
		// Reuse the ontology transport probe (same get_server_ready_status POST);
		// the code branch answers when the remote IS_A_CODE_SERVER.
		const probe = await checkRemoteServer({ ...server });
		servers.push({
			...server,
			msg: probe.msg,
			errors: probe.errors,
			response_code: probe.code,
			result: probe.result,
		});
	}
	return {
		result: {
			servers,
			dedalo_source_version_local_dir:
				(readEnv('DEDALO_SOURCE_VERSION_LOCAL_DIR') as string | undefined) ?? null,
			is_a_code_server: config.update.isCodeServer,
		},
		msg: 'OK. Request done successfully',
		errors: [],
	};
}

/** The OPEN (owned) code-update: download + verify + extract + swap + restart. */
async function updateCodeOwned(options: Record<string, unknown>): Promise<WidgetResponse> {
	const { updateCode } = await import('../../update/code_update.ts');
	return (await updateCode(options)) as unknown as WidgetResponse;
}

/** The OPEN (owned) release build: git archive of a ref. */
async function buildVersionOwned(options: Record<string, unknown>): Promise<WidgetResponse> {
	const { buildVersionFromGit } = await import('../../update/code_build.ts');
	const version = typeof options.version === 'string' ? options.version : '';
	const ref = typeof options.ref === 'string' ? options.ref : undefined;
	return (await buildVersionFromGit({ version, ref })) as unknown as WidgetResponse;
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
