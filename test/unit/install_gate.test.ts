/**
 * P1 gate — install window dispatch gate + synthetic installer context (DEC-19).
 *
 * The install surface (dd_utils_api:get_install_context + dd_utils_api:install)
 * is pre-auth WHILE UNSEALED and IP-gated, and GONE (404) once sealed. These
 * tests flip the scratch state file's install_status (bun test isolates
 * DEDALO_TS_STATE_PATH) and drive dispatchRqo directly.
 *
 * Note: the `start` install-MOUNT branch keys on config.installMode, which is
 * false in the test process (a real .env is present); it is exercised end-to-end
 * against a fresh temp DB in the e2e phase.
 */

import { afterEach, describe, expect, test } from 'bun:test';
import { type ApiRequestContext, dispatchRqo } from '../../src/core/api/dispatch.ts';
import type { Rqo } from '../../src/core/concepts/rqo.ts';
import { setServerState } from '../../src/core/resolve/server_state.ts';

function anon(clientIp = 'local'): ApiRequestContext {
	return { requestId: 't', clientIp, session: null, csrfCandidate: null };
}

afterEach(() => {
	setServerState({ install_status: undefined });
	process.env.DEDALO_INSTALL_ALLOWED_IPS = undefined;
});

describe('install window gate (P1)', () => {
	test('get_install_context: pre-auth while unsealed → synthetic installer context', async () => {
		setServerState({ install_status: 'unconfigured' });
		const res = await dispatchRqo(
			{ action: 'get_install_context', dd_api: 'dd_utils_api' } as Rqo,
			anon(),
		);
		expect(res.status).toBe(200);
		const result = res.body.result as { model: string; properties: Record<string, unknown> }[];
		expect(Array.isArray(result)).toBe(true);
		expect(result[0]?.model).toBe('installer');
		const props = result[0]?.properties as Record<string, unknown>;
		expect(props.needs_config).toBe(true);
		expect((props.init_test as { result: boolean }).result).toBe(true);
		expect(props.target_file_path_exists).toBe(true);
		// Pre-checked defaults are restricted to installable tlds (fr/utoponymy
		// ship no data file even upstream, so they are filtered out).
		expect(props.install_checked_default).toEqual(['es', 'lg', 'ts']);
		// Every offered hierarchy is one we can actually install.
		expect((props.hierarchies as unknown[]).length).toBeGreaterThan(0);
	});

	test('get_install_context: SEALED → 404 (surface gone)', async () => {
		setServerState({ install_status: 'sealed' });
		const res = await dispatchRqo(
			{ action: 'get_install_context', dd_api: 'dd_utils_api' } as Rqo,
			anon(),
		);
		expect(res.status).toBe(404);
	});

	test('install step router: pre-auth to_update routes (not 401) while unsealed', async () => {
		setServerState({ install_status: 'unconfigured' });
		const res = await dispatchRqo(
			{ action: 'install', dd_api: 'dd_utils_api', options: { action: 'to_update' } } as Rqo,
			anon(),
		);
		expect(res.status).toBe(200);
		expect(res.body.result).toBe(false); // to_update is unsupported by design
		expect(res.body.msg).toContain('Update path not supported');
	});

	test('install: SEALED → 404 for every step', async () => {
		setServerState({ install_status: 'sealed' });
		const res = await dispatchRqo(
			{
				action: 'install',
				dd_api: 'dd_utils_api',
				options: { action: 'check_directories' },
			} as Rqo,
			anon(),
		);
		expect(res.status).toBe(404);
	});

	test('IP allowlist: a disallowed address is refused (403) while unsealed', async () => {
		setServerState({ install_status: 'unconfigured' });
		process.env.DEDALO_INSTALL_ALLOWED_IPS = '10.0.0.5';
		const res = await dispatchRqo(
			{ action: 'get_install_context', dd_api: 'dd_utils_api' } as Rqo,
			anon('192.168.1.9'),
		);
		expect(res.status).toBe(403);
	});

	test('IP allowlist: loopback token admits the local address', async () => {
		setServerState({ install_status: 'unconfigured' });
		process.env.DEDALO_INSTALL_ALLOWED_IPS = 'loopback';
		const res = await dispatchRqo(
			{ action: 'get_install_context', dd_api: 'dd_utils_api' } as Rqo,
			anon('local'),
		);
		expect(res.status).toBe(200);
	});

	test('record-writing steps require a session even while unsealed', async () => {
		setServerState({ install_status: 'unconfigured' });
		const res = await dispatchRqo(
			{
				action: 'install',
				dd_api: 'dd_utils_api',
				options: { action: 'register_tools' },
			} as Rqo,
			anon(),
		);
		expect(res.status).toBe(401);
	});

	// Regression (found driving the real browser wizard): the router spread the
	// ASYNC verifyActiveConfig without awaiting, so the body was `{}` and the
	// wizard stuck at Verify. A mismatched entity keeps this DB-free.
	test('verify_active_config is AWAITED — body carries result/active, not {}', async () => {
		setServerState({ install_status: 'configured' });
		const res = await dispatchRqo(
			{
				action: 'install',
				dd_api: 'dd_utils_api',
				options: {
					action: 'verify_active_config',
					entity: 'definitely-not-the-active-entity',
					db_database: 'x',
				},
			} as Rqo,
			anon(),
		);
		expect(res.status).toBe(200);
		expect(typeof res.body.active).toBe('boolean'); // NOT absent (the {} bug)
		expect(res.body.result).toBe(false);
		expect(typeof res.body.msg).toBe('string');
	});

	// Regression (found driving the real browser wizard): after persist_config
	// the server restarts OUT of install mode (config.installMode=false) but the
	// install is not sealed — `start` must still resume the wizard, or a reload
	// strands on the login form with no schema/root yet.
	test('start resumes the wizard while an install is in progress (configured, not sealed)', async () => {
		setServerState({ install_status: 'configured' });
		const res = await dispatchRqo({ action: 'start', dd_api: 'dd_core_api' } as Rqo, anon());
		const ctx = (res.body.result as { context?: { model?: string }[] })?.context ?? [];
		expect(ctx[0]?.model).toBe('installer');
	});

	test('start serves LOGIN once sealed (and for an existing unconfigured deployment)', async () => {
		const { installInProgress, isSealed } = await import('../../src/core/install/gate.ts');
		setServerState({ install_status: 'sealed' });
		expect(isSealed()).toBe(true);
		expect(installInProgress()).toBe(false);
		const sealed = await dispatchRqo({ action: 'start', dd_api: 'dd_core_api' } as Rqo, anon());
		expect((sealed.body.result as { context?: { model?: string }[] })?.context?.[0]?.model).toBe(
			'login',
		);
		// An existing (PHP-provisioned) deployment never ran the TS installer →
		// status undefined → NOT in progress → login, never the wizard.
		setServerState({ install_status: undefined });
		expect(installInProgress()).toBe(false);
	});
});
