/**
 * update_ontology panel — the SERVING-side readout.
 *
 * The panel does not only pull: it also tells the administrator whether THIS
 * installation can SERVE its ontology to others, because that answer is spread
 * over three unrelated .env keys (IS_AN_ONTOLOGY_SERVER, ONTOLOGY_SERVER_CODE,
 * DEDALO_CORS_ALLOWED_ORIGINS) and no single screen used to hold it. The client
 * renders one checklist row per key, so the contract gated here is:
 *
 *   1. `serving` exists, with the three booleans + the endpoint clients register;
 *   2. each boolean tracks ITS key (a checklist that lies is worse than none);
 *   3. the access CODE ITSELF never rides the wire — only whether one is set.
 *
 * `config` and CORS_ENABLED are both frozen at import time, so every case boots a
 * REAL subprocess: re-importing in-process would assert nothing about how the
 * server actually reads its configuration.
 */

import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';

const ROOT = join(import.meta.dir, '..', '..');

/** The panel payload as the client receives it, from a child booted with a given env. */
const READ_PANEL_SERVING =
	"const { dispatchGetWidgetValue } = await import('./src/core/area_maintenance/widgets/registry.ts');" +
	'const ADMIN = { userId: -1, isGlobalAdmin: true, isDeveloper: true };' +
	"const body = await dispatchGetWidgetValue(ADMIN, { model: 'update_ontology' });" +
	'console.log(JSON.stringify(body.data.serving));';

function panelServingWith(env: Record<string, string | undefined>): {
	exitCode: number;
	serving: Record<string, unknown>;
	stdout: string;
	stderr: string;
} {
	const child = Bun.spawnSync(['bun', '-e', READ_PANEL_SERVING], {
		cwd: ROOT,
		env: {
			...process.env,
			// No configured masters: the panel probes every one of them over the
			// network, and this gate is about the SERVING half.
			ONTOLOGY_SERVERS: '[]',
			...env,
		} as Record<string, string>,
		stdout: 'pipe',
		stderr: 'pipe',
	});
	// The child may log boot noise; the payload is the LAST line it prints.
	const stdout = (child.stdout.toString().trim().split('\n').pop() ?? '').trim();
	return {
		exitCode: child.exitCode,
		serving: stdout.startsWith('{') ? JSON.parse(stdout) : {},
		stdout,
		stderr: child.stderr.toString().trim(),
	};
}

describe('update_ontology panel — serving readout', () => {
	test('reports every serving key as unset when none is configured', () => {
		// Explicit empty values, never `undefined`: the installation's own
		// ../private/.env is still read by the child, so a key is only OFF for
		// this case if the overlay says so.
		const boot = panelServingWith({
			IS_AN_ONTOLOGY_SERVER: 'false',
			ONTOLOGY_SERVER_CODE: '',
			DEDALO_CORS_ALLOWED_ORIGINS: '[]',
		});
		expect(boot.exitCode).toBe(0);
		expect(boot.serving.enabled).toBe(false);
		expect(boot.serving.has_server_code).toBe(false);
		expect(boot.serving.cors_enabled).toBe(false);
		// The endpoint is reported whatever the state — it is what a client must
		// register, and the admin needs it BEFORE turning serving on.
		expect(String(boot.serving.url)).toContain('/dedalo/core/api/v1/json/');
	});

	test('each flag tracks its own key', () => {
		const boot = panelServingWith({
			IS_AN_ONTOLOGY_SERVER: 'true',
			ONTOLOGY_SERVER_CODE: '',
			DEDALO_CORS_ALLOWED_ORIGINS: '["https://client.example.org"]',
		});
		expect(boot.exitCode).toBe(0);
		expect(boot.serving.enabled).toBe(true);
		expect(boot.serving.has_server_code).toBe(false);
		expect(boot.serving.cors_enabled).toBe(true);
	});

	test('the access code is reported as CONFIGURED, never echoed', () => {
		const secret = 'xx-myspecialcode-xxx';
		const boot = panelServingWith({
			IS_AN_ONTOLOGY_SERVER: 'true',
			ONTOLOGY_SERVER_CODE: secret,
			DEDALO_CORS_ALLOWED_ORIGINS: '["*"]',
		});
		expect(boot.exitCode).toBe(0);
		expect(boot.serving.has_server_code).toBe(true);
		expect(boot.serving.cors_enabled).toBe(true);
		// A shared secret on an admin panel is still a secret: the whole payload
		// must not carry it.
		expect(boot.stdout).not.toContain(secret);
	});
});
