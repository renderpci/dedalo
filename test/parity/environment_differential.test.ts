/**
 * Phase 7 gate: the client environment payload (page_globals + plain_vars +
 * get_label) matches live PHP — this is the exact object the copied client
 * injects via set_environment() at boot, so parity here is what makes the
 * copied client boot against the TS server (rewrite/client_seam.md seam item 1).
 *
 * Compared:
 * - get_label: CONTAINMENT since WC-033 (labels are repo catalogs — the served
 *   dictionary is a SUPERSET of the frozen oracle one: every oracle key must
 *   be present with the oracle's value, except the two ledgered dup-name
 *   collision fixes; TS-only keys are the catalog additions);
 * - plain_vars: exact equality (urls/flags/DD_TIPOS mirror the install);
 * - page_globals: exact KEY SET + exact values except the engine-specific
 *   debug facts (pg/php version, memory, root path — PHP engine values by
 *   definition) and dedalo_build/data_version (deploy stamps).
 */

import { beforeAll, describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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
		// get_label and dedalo_application_lang are LANGUAGE-SCOPED: compare the
		// TS payload under the SAME application lang the frozen oracle session was
		// captured with — this install's DEDALO_APPLICATION_LANGS_DEFAULT may
		// differ, and since WC-033 the served dictionary honors the request lang
		// (no unconditional structure-lang overlay to mask a lang mismatch here).
		const oracleAppLang = (phpEnv.page_globals as Record<string, unknown>)
			.dedalo_application_lang as string;
		if (session !== null && typeof oracleAppLang === 'string') {
			session.applicationLang = oracleAppLang;
		}
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

	test('get_label: every oracle key is served, renamed, or ledger-removed (WC-033/WC-034)', () => {
		if (!hasPhpCredentials()) return;
		const phpLabels = phpEnv.get_label as Record<string, string>;
		const tsLabels = tsEnv.get_label as Record<string, string>;
		expect(Object.keys(tsLabels).length).toBeGreaterThan(400);
		// WC-034 label cleanup: the repo catalogs renamed non-conforming keys,
		// migrated tool-specific keys into their tools' register.json labels,
		// and removed unused keys — all ledgered in the machine-readable map.
		// The two WC-033 dup-name value fixes ride the same map:
		// no_hay_etiqueta_seleccionada → no_tag_selected (value deliberately
		// differs) and tool_watermark (removed — unreferenced).
		const wc034 = JSON.parse(
			readFileSync(resolve(import.meta.dir, 'wc034_label_cleanup.json'), 'utf8'),
		) as {
			renames: Record<string, string>;
			tool_migrations: Record<string, unknown>;
			removals: string[];
		};
		const removed = new Set([...wc034.removals, ...Object.keys(wc034.tool_migrations)]);
		const unaccounted: string[] = [];
		for (const [key, value] of Object.entries(phpLabels)) {
			const renamed = wc034.renames[key];
			if (renamed !== undefined) {
				// Renamed: the new key must serve (value may legitimately differ —
				// e.g. the WC-033 dup-name fix, or a merge into an existing key).
				if (tsLabels[renamed] === undefined) unaccounted.push(`${key} → ${renamed} (missing)`);
			} else if (removed.has(key)) {
				if (tsLabels[key] !== undefined) unaccounted.push(`${key} (ledger-removed but served)`);
			} else if (tsLabels[key] !== value) {
				unaccounted.push(`${key} (value mismatch or missing)`);
			}
		}
		expect(unaccounted).toEqual([]);
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
		const phpGlobals = { ...(phpEnv.page_globals ?? {}) };
		const tsGlobals = { ...(tsEnv.page_globals ?? {}) };
		// WIRE_CONTRACT.md WC-031: `is_ontology_server` is a TS-ONLY page_globals key
		// (PHP get_page_globals has no twin) driving the ontology-master client skin.
		// Assert the divergence explicitly, then compare the rest of the key set exactly.
		expect('is_ontology_server' in tsGlobals).toBe(true);
		expect('is_ontology_server' in phpGlobals).toBe(false);
		// The key must LEAVE the object: the exact key-set compare below reads Object.keys(),
		// which still lists a key assigned undefined. Local literal, so perf is moot.
		// biome-ignore lint/performance/noDelete: an undefined assignment would fail the key-set compare
		delete tsGlobals.is_ontology_server;
		// WIRE_CONTRACT.md WC-038: `ip_api` REMOVED from page_globals — IP→country
		// resolution moved server-side/offline (src/core/geoip). The frozen PHP
		// oracle still carries it; strip it PHP-side (the mirror of the WC-031
		// TS-only handling above) before the exact key-set compare.
		expect('ip_api' in phpGlobals).toBe(true);
		expect('ip_api' in tsGlobals).toBe(false);
		// biome-ignore lint/performance/noDelete: same as the WC-031 strip above — undefined would keep 'ip_api' in Object.keys()
		delete phpGlobals.ip_api;
		expect(Object.keys(tsGlobals).sort()).toEqual(Object.keys(phpGlobals).sort());
		for (const key of Object.keys(phpGlobals)) {
			if (ENGINE_SPECIFIC_KEYS.has(key)) continue;
			expect({ [key]: tsGlobals[key] }).toEqual({ [key]: phpGlobals[key] });
		}
	});
});
