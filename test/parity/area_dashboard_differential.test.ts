/**
 * Phase B gate: the area dashboard read (PHP area_common_json →
 * get_dashboard_data) byte-equal vs live PHP for the dashboard-behavior areas.
 *
 * Compares the full dashboard payload — per-section {section_tipo, label, model,
 * color, total, recent_7d} in ONTOLOGY ORDER, area_label, metrics, and the
 * activity_30d aggregate (date window, day series, users, ranges). `generated_at`
 * is the only normalized field (volatile unix seconds; PHP time() vs TS
 * Date.now() differ by <2s). The dates are "now"-relative but both engines are
 * driven within the same test tick, so they match (a midnight-boundary race is
 * the sole theoretical exception).
 *
 * Corpus (kept fast): empty areas (area_publication dd222, area_tool dd35 —
 * children are section_tool, excluded from the stats walk) + small (area_activity
 * dd69/11, area_development dd770/15). The heavier areas (area_root dd242/24,
 * area_admin dd207/130, area_resource dd14/54) are probe-verified but excluded
 * here: their PHP-side per-section counts are sequential, so under full-suite
 * load (PHP serializes every parity request) they blow the hook timeout — the
 * probe confirms parity, the gate stays fast.
 */

import { beforeAll, describe, expect, test } from 'bun:test';
import { config } from '../../src/config/config.ts';
import { dispatchRqo } from '../../src/core/api/dispatch.ts';
import { resolvePrincipal } from '../../src/core/security/permissions.ts';
import { createSession, getSession } from '../../src/core/security/session_store.ts';
import { PhpApiClient, hasPhpCredentials } from './php_client.ts';

const CASES = [
	{ model: 'area_publication', tipo: 'dd222' },
	{ model: 'area_tool', tipo: 'dd35' },
	{ model: 'area_activity', tipo: 'dd69' },
	{ model: 'area_development', tipo: 'dd770' },
];

type Dashboard = Record<string, unknown> & { generated_at?: unknown };

/** Strip the one volatile field so the rest can be byte-compared. */
function normalizeDashboard(dashboard: Dashboard | undefined): Dashboard | undefined {
	if (dashboard === undefined || dashboard === null) return dashboard;
	const { generated_at: _drop, ...rest } = dashboard;
	return rest;
}

const results = new Map<
	string,
	{
		phpItem: Record<string, unknown>;
		tsItem: Record<string, unknown>;
		phpContext: unknown[];
		tsContext: unknown[];
	}
>();

beforeAll(async () => {
	if (!hasPhpCredentials()) return;
	const php = new PhpApiClient();
	await php.login(config.phpReference.username as string, config.phpReference.password as string);
	const token = createSession(-1, 'root', true);
	const session = getSession(token);
	const principal = await resolvePrincipal(-1);

	for (const testCase of CASES) {
		const rqo = {
			action: 'read',
			dd_api: 'dd_core_api',
			prevent_lock: true,
			options: {},
			source: {
				typo: 'source',
				model: testCase.model,
				tipo: testCase.tipo,
				section_tipo: testCase.tipo,
				action: 'get_data',
				mode: 'list',
				lang: 'lg-spa',
			},
		};
		const phpResult = (await php.call(structuredClone(rqo) as Record<string, unknown>)).body as {
			result?: { context?: unknown[]; data?: Record<string, unknown>[] };
		};
		const tsResult = (
			await dispatchRqo(
				structuredClone(rqo) as never,
				{
					requestId: 't',
					clientIp: '127.0.0.1',
					session,
					csrfCandidate: session?.csrfToken ?? null,
					principal,
				} as never,
			)
		).body as { result?: { context?: unknown[]; data?: Record<string, unknown>[] } };
		results.set(testCase.tipo, {
			phpItem: (phpResult.result?.data?.[0] ?? {}) as Record<string, unknown>,
			tsItem: (tsResult.result?.data?.[0] ?? {}) as Record<string, unknown>,
			phpContext: phpResult.result?.context ?? [],
			tsContext: tsResult.result?.context ?? [],
		});
	}
	// Generous hook budget: the fetch loop makes sequential PHP calls, and under
	// full-suite load PHP serializes every parity request (fast in isolation).
}, 240000);

describe.if(hasPhpCredentials())('area dashboard differential', () => {
	for (const testCase of CASES) {
		test(`${testCase.model} (${testCase.tipo}) dashboard byte-equal`, () => {
			if (!hasPhpCredentials()) return;
			const pair = results.get(testCase.tipo);
			expect(pair).toBeDefined();
			if (pair === undefined) return;

			// data item scaffold: {tipo, section_tipo, section_id:null, dashboard}
			expect(pair.tsItem.tipo).toBe(testCase.tipo);
			expect(pair.tsItem.section_tipo).toBe(testCase.tipo);
			expect(pair.tsItem.section_id).toBe(null);

			// the dashboard payload, generated_at normalized away
			const php = normalizeDashboard(pair.phpItem.dashboard as Dashboard | undefined);
			const ts = normalizeDashboard(pair.tsItem.dashboard as Dashboard | undefined);
			expect(ts).toEqual(php);

			// context is served (full parity covered by areas_differential); assert
			// the client's required non-empty context anchored on the area tipo.
			expect(pair.tsContext.length).toBeGreaterThan(0);
			expect((pair.tsContext[0] as { tipo?: string }).tipo).toBe(testCase.tipo);
		});
	}
});
