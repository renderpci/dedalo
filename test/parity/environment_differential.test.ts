/**
 * Phase 7 gate: the client environment payload (page_globals + plain_vars +
 * get_label) matches live PHP — this is the exact object the copied client
 * injects via set_environment() at boot, so parity here is what makes the
 * copied client boot against the TS server (rewrite/client_seam.md seam item 1).
 *
 * Compared:
 * - get_label: EXACT equality (all ~505 localized labels, DB-derived);
 * - plain_vars: exact equality (urls/flags/DD_TIPOS mirror the install);
 * - page_globals: exact KEY SET + exact values except the engine-specific
 *   debug facts (pg/php version, memory, root path — PHP engine values by
 *   definition) and dedalo_build/data_version (deploy stamps).
 */

import { beforeAll, describe, expect, test } from 'bun:test';
import { config } from '../../src/config/config.ts';
import { readEnv } from '../../src/config/env.ts';
import { dispatchRqo } from '../../src/core/api/dispatch.ts';
import type { Rqo } from '../../src/core/concepts/rqo.ts';
import { resolvePrincipal } from '../../src/core/security/permissions.ts';
import { createSession, getSession } from '../../src/core/security/session_store.ts';
import { PhpApiClient, hasPhpCredentials } from './php_client.ts';

/** Engine/deploy-specific page_globals keys compared for PRESENCE only. */
const ENGINE_SPECIFIC_KEYS = new Set([
	'pg_version',
	'php_version',
	'php_memory',
	'dedalo_root_path',
	'dedalo_build',
	'data_version',
	'dedalo_last_error',
]);

describe.if(hasPhpCredentials())('environment payload differential (Phase 7 gate)', () => {
	let phpEnv: Record<string, Record<string, unknown>>;
	let tsEnv: Record<string, Record<string, unknown>>;

	beforeAll(async () => {
		if (!hasPhpCredentials()) return;
		const client = new PhpApiClient();
		await client.login(
			config.phpReference.username as string,
			config.phpReference.password as string,
		);
		const { body } = await client.call({
			action: 'start',
			dd_api: 'dd_core_api',
			prevent_lock: true,
			source: {},
		} as unknown as Record<string, unknown>);
		phpEnv = (body as { environment: { result: Record<string, Record<string, unknown>> } })
			.environment.result;

		const token = createSession(-1, 'root', true);
		const session = getSession(token);
		const principal = await resolvePrincipal(-1);
		const tsResult = await dispatchRqo(
			{ action: 'start', dd_api: 'dd_core_api', prevent_lock: true, source: {} } as unknown as Rqo,
			{
				requestId: 't',
				clientIp: '127.0.0.1',
				session,
				csrfCandidate: session?.csrfToken ?? null,
				principal,
			},
		);
		tsEnv = (tsResult.body as { environment: { result: Record<string, Record<string, unknown>> } })
			.environment.result;
	});

	test('get_label: the full localized dictionary is byte-equal', () => {
		if (!hasPhpCredentials()) return;
		const phpLabels = phpEnv.get_label as Record<string, string>;
		const tsLabels = tsEnv.get_label as Record<string, string>;
		expect(Object.keys(tsLabels).length).toBeGreaterThan(400);
		expect(tsLabels).toEqual(phpLabels);
	});

	test('plain_vars: urls, flags and DD_TIPOS match exactly', () => {
		if (!hasPhpCredentials()) return;
		const phpVars = { ...(phpEnv.plain_vars as Record<string, unknown>) };
		const tsVars = { ...(tsEnv.plain_vars as Record<string, unknown>) };
		// WIRE_CONTRACT.md WC-003 (self-contained cutover posture): under
		// DEDALO_DIFFUSION_NATIVE=true the TS engine deliberately OMITS
		// DEDALO_DIFFUSION_API_URL (the client must not call the legacy Bun
		// diffusion route — the TS server does not serve it). The PHP oracle
		// install still publishes it. Assert the divergence explicitly, then
		// compare the rest exactly.
		if (readEnv('DEDALO_DIFFUSION_NATIVE') === 'true') {
			expect('DEDALO_DIFFUSION_API_URL' in tsVars).toBe(false);
			expect('DEDALO_DIFFUSION_API_URL' in phpVars).toBe(true);
			phpVars.DEDALO_DIFFUSION_API_URL = undefined;
		}
		expect(tsVars).toEqual(phpVars);
	});

	test('page_globals: same key set; same values outside engine-specific facts', () => {
		if (!hasPhpCredentials()) return;
		const phpGlobals = phpEnv.page_globals ?? {};
		const tsGlobals = { ...(tsEnv.page_globals ?? {}) };
		// WIRE_CONTRACT.md WC-031: `is_ontology_server` is a TS-ONLY page_globals key
		// (PHP get_page_globals has no twin) driving the ontology-master client skin.
		// Assert the divergence explicitly, then compare the rest of the key set exactly.
		expect('is_ontology_server' in tsGlobals).toBe(true);
		expect('is_ontology_server' in phpGlobals).toBe(false);
		delete tsGlobals.is_ontology_server;
		expect(Object.keys(tsGlobals).sort()).toEqual(Object.keys(phpGlobals).sort());
		for (const key of Object.keys(phpGlobals)) {
			if (ENGINE_SPECIFIC_KEYS.has(key)) continue;
			expect({ [key]: tsGlobals[key] }).toEqual({ [key]: phpGlobals[key] });
		}
	});
});
