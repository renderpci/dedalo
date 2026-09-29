/**
 * update_code WIDGET wiring (UPDATE_PROCESS Phase 4) — where the panel meets
 * the engine (silently broken until 2026-08-15). The BUILD action's option-shape
 * gate moved with the action to serve_code_widget_native.test.ts (2026-09-28).
 *
 *  - the reachability PROBE's role. The panel probes each configured code
 *     server with `get_server_ready_status`, and the remote answers only for the
 *     role it holds — asking a code-only master the ONTOLOGY question got a
 *     refusal, so its row rendered UNREACHABLE with the radio disabled.
 *
 * Pure wiring: asserted through the widget's own getValue, with the engine call
 * intercepted, so no network is involved. Also pins the split: the consumer panel
 * no longer registers the build action nor answers `code_server`.
 */

import { afterAll, describe, expect, mock, test } from 'bun:test';
import * as realDataIoModule from '../../src/core/ontology/data_io_import.ts';

const REAL_DATA_IO = { ...realDataIoModule };

afterAll(() => {
	mock.module('../../src/core/ontology/data_io_import.ts', () => REAL_DATA_IO);
	mock.restore();
});

/** The widget module, imported AFTER the mocks so its dynamic imports see them. */
async function widgetModule() {
	return await import('../../src/core/area_maintenance/widgets/update_code.ts');
}

describe('update_code is the CONSUMER panel only (serve_code split)', () => {
	test('no build action, no code_server half', async () => {
		const { widget } = await widgetModule();
		expect(Object.keys(widget.apiActions ?? {}).sort()).toEqual([
			'delete_restore_point',
			'restore_code',
			'update_code',
		]);
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
			const data = value?.data as { servers: { response_code: number }[] };
			expect('code_server' in data).toBe(false);
			const servers = data.servers;
			expect(servers.length).toBe(1);
			expect(servers[0]?.response_code).toBe(200);
		} finally {
			mock.module('../../src/config/config.ts', () => REAL_CONFIG);
		}
	});
});
