/**
 * Phase 6 gate: maintenance-area widget catalog vs live PHP.
 *
 * PHP area_maintenance_json attaches the full get_ar_widgets catalog as the
 * data item's `datalist`. The TS catalog (src/core/area_maintenance/widgets/registry.ts) must
 * match BYTE-FOR-BYTE — every widget's id, category, css class, resolved
 * label (same generated dictionary), background flag, and the item's
 * envelope fields. Also asserts the non-admin denial (PHP maintenance is an
 * admin area).
 */

import { beforeAll, describe, expect, test } from 'bun:test';
import { config } from '../../src/config/config.ts';
import { dispatchRqo } from '../../src/core/api/dispatch.ts';
import { resolvePrincipal } from '../../src/core/security/permissions.ts';
import { createSession, getSession } from '../../src/core/security/session_store.ts';
import { PhpApiClient, hasLivePhpOracle, hasPhpCredentials } from './php_client.ts';

const READ_RQO = {
	action: 'read',
	dd_api: 'dd_core_api',
	prevent_lock: true,
	source: {
		model: 'area_maintenance',
		tipo: 'dd88',
		section_tipo: 'dd88',
		action: 'get_data',
		mode: 'list',
		lang: 'lg-spa',
	},
};

let phpItem: Record<string, unknown> | null = null;
let tsItem: Record<string, unknown> | null = null;
let phpContext: Record<string, unknown>[] = [];
let tsContext: Record<string, unknown>[] = [];

beforeAll(async () => {
	if (!hasPhpCredentials()) return;
	const php = new PhpApiClient();
	await php.login(config.phpReference.username as string, config.phpReference.password as string);
	const phpResult = await php.call(READ_RQO as unknown as Record<string, unknown>);
	const phpBody = (
		phpResult.body as {
			result?: { data?: unknown[]; context?: Record<string, unknown>[] };
		}
	).result;
	phpItem = (phpBody?.data?.[0] ?? null) as Record<string, unknown> | null;
	phpContext = phpBody?.context ?? [];

	const token = createSession(-1, 'root', true);
	const session = getSession(token);
	const principal = await resolvePrincipal(-1);
	const tsResult = await dispatchRqo(
		READ_RQO as never,
		{
			requestId: 't',
			clientIp: '127.0.0.1',
			session,
			csrfCandidate: session?.csrfToken ?? null,
			principal,
		} as never,
	);
	const tsBody = (
		tsResult.body as {
			result?: { data?: unknown[]; context?: Record<string, unknown>[] };
		}
	).result;
	tsItem = (tsBody?.data?.[0] ?? null) as Record<string, unknown> | null;
	tsContext = tsBody?.context ?? [];
});

describe.if(hasPhpCredentials())('maintenance widget catalog differential', () => {
	test('the widget catalog METADATA matches PHP byte-for-byte (all 30, WC-030 merge normalized)', () => {
		if (!hasPhpCredentials()) return;
		expect(phpItem).not.toBeNull();
		expect(tsItem).not.toBeNull();
		// php_runtime (WC-030) is PHP-ONLY now: it was merged into runtime_info
		// (the former php_info slot) rather than kept as a separate TS twin —
		// normalize it out of the PHP side before the byte-compare, the mirror
		// image of the error_reports (WC-018) TS-only normalization below.
		const phpList = ((phpItem as { datalist?: Record<string, unknown>[] }).datalist ?? []).filter(
			(item) => (item as { id?: unknown }).id !== 'php_runtime',
		);
		// error_reports (WC-018) is TS-ONLY: it joins the catalog only where the
		// error-report intake flag is on (master installations) and has no PHP
		// twin — normalize it out before the byte-compare.
		const tsList = ((tsItem as { datalist?: Record<string, unknown>[] }).datalist ?? []).filter(
			(item) => (item as { id?: unknown }).id !== 'error_reports',
		);
		expect(tsList.length).toBe(phpList.length);
		for (let index = 0; index < phpList.length; index++) {
			// `value` is EXCLUDED: 11 widgets embed a per-widget payload computed
			// by their own PHP widget class (migration form catalogs, sequence
			// status, PHP-engine facts) — each is its own execution endpoint,
			// ledgered with widget_request. The TS catalog ships them null.
			// `label` is ALSO excluded for diffusion_server_control: that widget was
			// re-homed onto the native diffusion engine (job queue + scheduler), so
			// its TS label ('Diffusion engine & queue') INTENTIONALLY diverges from
			// the PHP daemon-era term. The id (and every other metadata field) still
			// matches, so the catalog stays aligned everywhere it should.
			const isDiffusionControl =
				(tsList[index] as { id?: unknown }).id === 'diffusion_server_control';
			// `id` and `label` are ALSO excluded at PHP's php_info slot (WC-030): the
			// TS engine merged php_info AND php_runtime into ONE native runtime_info
			// widget at this position — id/label deliberately diverge from the
			// frozen PHP oracle term, and every other metadata field still matches.
			const isRuntimeInfo = (phpList[index] as { id?: unknown }).id === 'php_info';
			const omit = isDiffusionControl
				? ['value', 'label']
				: isRuntimeInfo
					? ['value', 'id', 'label']
					: ['value'];
			const strip = (item: Record<string, unknown>): Record<string, unknown> =>
				Object.fromEntries(Object.entries(item).filter(([key]) => !omit.includes(key)));
			const phpMeta = strip(phpList[index] as Record<string, unknown>);
			const tsMeta = strip(tsList[index] as Record<string, unknown>);
			expect(JSON.stringify(tsMeta)).toBe(JSON.stringify(phpMeta));
		}
	});

	test('the read returns a non-empty context matching PHP (client render contract)', () => {
		if (!hasPhpCredentials()) return;
		// The client (area_maintenance.js) renders the dashboard BLANK when
		// result.context is empty — the TS read used to return []. Pin the
		// non-empty context + its client-load-bearing fields against PHP.
		expect(tsContext.length).toBe(1);
		const php = phpContext[0] ?? {};
		const ts = tsContext[0] ?? {};
		for (const key of ['tipo', 'model', 'type', 'typo', 'section_tipo', 'label', 'permissions']) {
			expect({ key, value: ts[key] }).toEqual({ key, value: php[key] });
		}
		// request_config MUST be a non-empty array: area_maintenance.js calls
		// context.request_config.find(el => el.type==='main') unguarded, so a
		// missing key throws (undefined.find) and the dashboard renders blank.
		// Byte-equal to PHP (the 'main' skeleton with the area's own sqo ddo).
		expect(Array.isArray(ts.request_config)).toBe(true);
		expect(ts.request_config).toEqual(php.request_config);
	});

	// LIVE-ONLY test (DEC-14b): byte-compares live Postgres sequence counters.
	// Under ORACLE_MODE=fixtures the PHP side is frozen while other suite tests
	// keep bumping the live sequences the TS side reads — a guaranteed red that
	// verifies nothing. The rest of this gate replays from fixtures fine.
	test.if(hasLivePhpOracle())('the sequences_status eager value matches PHP byte-for-byte', () => {
		if (!hasLivePhpOracle()) return;
		const phpWidget = ((phpItem as { datalist?: Record<string, unknown>[] }).datalist ?? []).find(
			(widget) => widget.id === 'sequences_status',
		);
		const tsWidget = ((tsItem as { datalist?: Record<string, unknown>[] }).datalist ?? []).find(
			(widget) => widget.id === 'sequences_status',
		);
		expect(phpWidget?.value).toBeDefined();
		// The activity log GROWS between the two engine calls (every API call
		// logs) — normalize its live counters before comparing.
		const normalize = (value: unknown): string =>
			JSON.stringify(value)
				.replace(
					/matrix_activity<\/b> - start_value: 1 - seq last_value: \d+ \[last id: \d+\]/g,
					'matrix_activity</b> NORM',
				)
				.replace(
					/\{"table_name":"matrix_activity","start_value":"1","last_value":"\d+","last_id":"\d+"\}/g,
					'ACT',
				);
		expect(normalize(tsWidget?.value)).toBe(normalize(phpWidget?.value));
	});

	test('the data item envelope matches PHP', () => {
		if (!hasPhpCredentials()) return;
		const strip = (item: Record<string, unknown>): Record<string, unknown> => {
			const { datalist: _datalist, ...rest } = item;
			return rest;
		};
		expect(strip(tsItem as Record<string, unknown>)).toEqual(
			strip(phpItem as Record<string, unknown>),
		);
	});

	test('non-admins are denied (maintenance is an admin area)', async () => {
		const token = createSession(999999, 'nobody', false);
		const session = getSession(token);
		const principal = await resolvePrincipal(999999);
		const result = await dispatchRqo(
			READ_RQO as never,
			{
				requestId: 't',
				clientIp: '127.0.0.1',
				session,
				csrfCandidate: session?.csrfToken ?? null,
				principal,
			} as never,
		);
		expect(result.status).toBe(403);
	});
});
