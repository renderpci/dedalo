/**
 * update_code WIDGET wiring (UPDATE_PROCESS Phase 4) — the two seams where the
 * panel meets the engine, both of which were silently broken until 2026-08-15:
 *
 *  1. the BUILD action's option shape. The panel's two buttons send a BRANCH
 *     and nothing else; the handler used to read only `version`/`ref`, so every
 *     build refused with 'Invalid version number' and a code server could not
 *     publish a single release.
 *  2. the reachability PROBE's role. The panel probes each configured code
 *     server with `get_server_ready_status`, and the remote answers only for the
 *     role it holds — asking a code-only master the ONTOLOGY question got a
 *     refusal, so its row rendered UNREACHABLE with the radio disabled.
 *
 * Both are pure wiring: asserted through the widget's own apiActions, with the
 * engine call intercepted, so no git repo and no network are involved.
 */

import { afterAll, describe, expect, mock, test } from 'bun:test';
import * as realDataIoModule from '../../src/core/ontology/data_io_import.ts';
import * as realBuildModule from '../../src/core/update/code_build.ts';

const REAL_BUILD = { ...realBuildModule };
const REAL_DATA_IO = { ...realDataIoModule };

afterAll(() => {
	mock.module('../../src/core/update/code_build.ts', () => REAL_BUILD);
	mock.module('../../src/core/ontology/data_io_import.ts', () => REAL_DATA_IO);
	mock.restore();
});

/** The widget module, imported AFTER the mocks so its dynamic imports see them. */
async function widgetModule() {
	return await import('../../src/core/area_maintenance/widgets/update_code.ts');
}

describe('build_version_from_git_master option mapping', () => {
	test('a bare branch forwards ONLY the ref — the bytes name the release', async () => {
		const calls: { version?: string; ref?: string }[] = [];
		mock.module('../../src/core/update/code_build.ts', () => ({
			...REAL_BUILD,
			buildVersionFromGit: async (options: { version?: string; ref?: string }) => {
				calls.push(options);
				return { ok: true, request_id: 'test', data: { built: true } };
			},
		}));
		const { widget } = await widgetModule();
		const action = widget.apiActions?.build_version_from_git_master;
		expect(action).toBeDefined();

		for (const branch of ['master', 'developer']) {
			await action?.({ branch }, {} as never);
		}
		// NO `version` key. The widget used to forward DEDALO_VERSION — the
		// RUNNING PROCESS's version — while the bytes came from the ref, so a
		// master left running across a bump published mislabelled archives, and
		// a master whose ref declares its own version published a same-version
		// zip that assertLinearUpgrade refuses (measured 2026-08-24: an
		// uninstallable 7.0.0.zip). The release is now named after the version
		// the REF declares; the widget must not supply one at all.
		expect(calls).toEqual([{ ref: 'master' }, { ref: 'developer' }]);
	});

	test('an explicit version/ref still wins over the branch (API callers)', async () => {
		const calls: { version?: string; ref?: string }[] = [];
		mock.module('../../src/core/update/code_build.ts', () => ({
			...REAL_BUILD,
			buildVersionFromGit: async (options: { version?: string; ref?: string }) => {
				calls.push(options);
				return { ok: true, request_id: 'test', data: { built: true } };
			},
		}));
		const { widget } = await widgetModule();
		await widget.apiActions?.build_version_from_git_master?.(
			{ branch: 'master', version: '7.0.1', ref: 'v7.0.1' },
			{} as never,
		);
		expect(calls).toEqual([{ version: '7.0.1', ref: 'v7.0.1' }]);
	});
});

describe('code-server reachability probe', () => {
	test('the panel probes each configured server for the CODE role', async () => {
		const asked: unknown[] = [];
		mock.module('../../src/core/ontology/data_io_import.ts', () => ({
			...REAL_DATA_IO,
			checkRemoteServer: async (server: { url: string }, check?: string) => {
				asked.push({ url: server.url, check });
				return { result: { result: true }, msg: 'OK', errors: [], code: 200 };
			},
		}));
		const realConfigModule = await import('../../src/config/config.ts');
		const REAL_CONFIG = { ...realConfigModule };
		try {
			mock.module('../../src/config/config.ts', () => ({
				...REAL_CONFIG,
				config: {
					...REAL_CONFIG.config,
					update: {
						...REAL_CONFIG.config.update,
						codeServers: [
							{ name: 'master', url: 'https://m.example/dedalo/core/api/v1/json/', code: 'c' },
						],
					},
				},
			}));
			const { widget } = await widgetModule();
			const value = await widget.getValue?.({}, {} as never);
			// asking 'ontology_server' here is what made a code-only master
			// unreachable forever — the probe must name the role it needs.
			expect(asked).toEqual([
				{ url: 'https://m.example/dedalo/core/api/v1/json/', check: 'code_server' },
			]);
			const servers = (value?.data as { servers: { response_code: number }[] }).servers;
			expect(servers.length).toBe(1);
			expect(servers[0]?.response_code).toBe(200);
		} finally {
			mock.module('../../src/config/config.ts', () => REAL_CONFIG);
		}
	});
});
