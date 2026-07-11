/**
 * tool_error_report server half (WC-019) — the send_report handler through its
 * injectable seams (fetchImpl / storeLocally / settings; no real network, no
 * real table):
 *  - non-admin refused (defense in depth over the registry non-grant);
 *  - invalid submission refused (shared strict schema);
 *  - SERVER-STAMPED identity (user_id/entity/version/report_version) — the
 *    browser cannot spoof it, and page_globals secrets can never ride along
 *    (unknown fields are schema-rejected);
 *  - relay routing: master URL → fetch (token header, https-only with the
 *    loopback dev exception, !ok/network failure → honest failure envelope);
 *  - local shortcut when THIS server is the master;
 *  - unconfigured → honest failure;
 *  - size fitting drops the OLDEST captured errors, never the description.
 */

import { describe, expect, test } from 'bun:test';
import type { ReportWire } from '../../src/core/error_report/schema.ts';
import type { ToolActionContext } from '../../src/core/tools/module.ts';
import {
	type RelaySettings,
	buildSendReportHandler,
	masterUrlAllowed,
	tool,
} from '../../tools/tool_error_report/server/index.ts';

function adminContext(options: Record<string, unknown>): ToolActionContext {
	return {
		principal: { userId: 7, isGlobalAdmin: true, isDeveloper: false },
		userId: 7,
		options,
		background: false,
	};
}

function submission(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		description: 'Saving a record wipes the toolbar.',
		page_url: '/dedalo/core/page/?tipo=oh1',
		section_tipo: 'oh1',
		section_id: '42',
		user_agent: 'test-agent',
		js_errors: [],
		client_globals: null,
		...overrides,
	};
}

function settings(overrides: Partial<RelaySettings> = {}): RelaySettings {
	return {
		masterApiUrl: undefined,
		receiverEnabled: false,
		token: undefined,
		relayTimeoutMs: 1000,
		...overrides,
	};
}

/** A fetch mock capturing the outbound request; responds 200 {result:true}. */
function captureFetch(capture: { url?: string; init?: RequestInit }): typeof fetch {
	return (async (url: string | URL | Request, init?: RequestInit) => {
		capture.url = String(url);
		capture.init = init;
		return new Response(JSON.stringify({ result: true, report_id: 9 }), { status: 200 });
	}) as typeof fetch;
}

const storeNever = async (): Promise<number> => {
	throw new Error('storeLocally must not be called on this path');
};

describe('tool_error_report send_report (WC-019)', () => {
	test('the registered action surface is exactly send_report (permission: null + in-handler gate)', () => {
		expect(Object.keys(tool.apiActions)).toEqual(['send_report']);
		expect(tool.apiActions.send_report?.permission).toBeNull();
	});

	test('non-admin principal is refused before anything runs', async () => {
		const handler = buildSendReportHandler({
			fetchImpl: (() => {
				throw new Error('must not fetch');
			}) as unknown as typeof fetch,
			storeLocally: storeNever,
			settings: settings(),
		});
		const context = adminContext(submission());
		context.principal = { userId: 7, isGlobalAdmin: false, isDeveloper: true };
		const response = await handler(context);
		expect(response.result).toBe(false);
		expect(response.errors).toEqual(['unauthorized']);
	});

	test('invalid submission (unknown field) is refused by the shared strict schema', async () => {
		const handler = buildSendReportHandler({
			fetchImpl: (() => {
				throw new Error('must not fetch');
			}) as unknown as typeof fetch,
			storeLocally: storeNever,
			settings: settings({ masterApiUrl: 'https://master.example/api' }),
		});
		const response = await handler(adminContext(submission({ csrf_token: 'leak-me' })));
		expect(response.result).toBe(false);
		expect(response.errors).toEqual(['invalid_submission']);
	});

	test('relay: server-stamps identity, sends the WC-017 RQO with the token header', async () => {
		const capture: { url?: string; init?: RequestInit } = {};
		const handler = buildSendReportHandler({
			fetchImpl: captureFetch(capture),
			storeLocally: storeNever,
			settings: settings({ masterApiUrl: 'https://master.example/api', token: 'fleet-secret' }),
		});
		const response = await handler(adminContext(submission()));
		expect(response.result).toEqual({ delivered: true, via: 'master' });

		expect(capture.url).toBe('https://master.example/api');
		const headers = capture.init?.headers as Record<string, string>;
		expect(headers['X-Dedalo-Report-Token']).toBe('fleet-secret');

		const body = JSON.parse(String(capture.init?.body)) as {
			dd_api: string;
			action: string;
			options: ReportWire;
		};
		expect(body.dd_api).toBe('dd_error_report_api');
		expect(body.action).toBe('receive_report');
		// Server-stamped, never browser-supplied:
		expect(body.options.user_id).toBe(7);
		expect(typeof body.options.entity).toBe('string');
		expect(body.options.dedalo_version).toBe('7.0.0.dev');
		expect(body.options.report_version).toBe(1);
		expect(typeof body.options.sent_at).toBe('string');
		// The browser-supplied part survives verbatim:
		expect(body.options.description).toBe('Saving a record wipes the toolbar.');
		expect(body.options.section_tipo).toBe('oh1');
	});

	test('relay failure (!ok) → honest failure envelope, never a fake success', async () => {
		const handler = buildSendReportHandler({
			fetchImpl: (async () => new Response('nope', { status: 503 })) as unknown as typeof fetch,
			storeLocally: storeNever,
			settings: settings({ masterApiUrl: 'https://master.example/api' }),
		});
		const response = await handler(adminContext(submission()));
		expect(response.result).toBe(false);
		expect(response.errors).toEqual(['relay_failed']);
	});

	test('relay network error → honest failure envelope', async () => {
		const handler = buildSendReportHandler({
			fetchImpl: (async () => {
				throw new Error('connect ECONNREFUSED');
			}) as unknown as typeof fetch,
			storeLocally: storeNever,
			settings: settings({ masterApiUrl: 'https://master.example/api' }),
		});
		const response = await handler(adminContext(submission()));
		expect(response.result).toBe(false);
		expect(response.errors).toEqual(['relay_failed']);
	});

	test('master URL scheme: https required; plain http only for loopback (dev)', async () => {
		expect(masterUrlAllowed('https://master.example/dedalo/core/api/v1/json/')).toBe(true);
		expect(masterUrlAllowed('http://localhost:3501/dedalo/core/api/v1/json/')).toBe(true);
		expect(masterUrlAllowed('http://127.0.0.1:3501/x')).toBe(true);
		expect(masterUrlAllowed('http://master.example/x')).toBe(false);
		expect(masterUrlAllowed('ftp://master.example/x')).toBe(false);
		expect(masterUrlAllowed('not a url')).toBe(false);

		const handler = buildSendReportHandler({
			fetchImpl: (() => {
				throw new Error('must not fetch');
			}) as unknown as typeof fetch,
			storeLocally: storeNever,
			settings: settings({ masterApiUrl: 'http://master.example/x' }),
		});
		const response = await handler(adminContext(submission()));
		expect(response.result).toBe(false);
		expect(response.errors).toEqual(['relay_misconfigured']);
	});

	test('local shortcut: no master URL + receiver on THIS server → direct store', async () => {
		const stored: ReportWire[] = [];
		const handler = buildSendReportHandler({
			fetchImpl: (() => {
				throw new Error('must not fetch');
			}) as unknown as typeof fetch,
			storeLocally: async (report) => {
				stored.push(report);
				return 31;
			},
			settings: settings({ receiverEnabled: true }),
		});
		const response = await handler(adminContext(submission()));
		expect(response.result).toEqual({ delivered: true, via: 'local', report_id: 31 });
		expect(stored[0]?.user_id).toBe(7);
		expect(stored[0]?.report_version).toBe(1);
	});

	test('unconfigured (no master URL, not the master) → honest not-configured failure', async () => {
		const handler = buildSendReportHandler({
			fetchImpl: (() => {
				throw new Error('must not fetch');
			}) as unknown as typeof fetch,
			storeLocally: storeNever,
			settings: settings(),
		});
		const response = await handler(adminContext(submission()));
		expect(response.result).toBe(false);
		expect(response.errors).toEqual(['relay_not_configured']);
	});

	test('size fitting drops the OLDEST errors first; the description always survives', async () => {
		const bigError = (index: number) => ({
			type: 'error',
			msg: `err_${index}_${'m'.repeat(1990)}`,
			source: 's'.repeat(1024),
			line: 1,
			col: 1,
			stack: 'x'.repeat(6000),
			time: '2026-07-10T10:00:00.000Z',
			count: 1,
		});
		const capture: { url?: string; init?: RequestInit } = {};
		const handler = buildSendReportHandler({
			fetchImpl: captureFetch(capture),
			storeLocally: storeNever,
			settings: settings({ masterApiUrl: 'https://master.example/api' }),
		});
		const fifty = Array.from({ length: 50 }, (_, index) => bigError(index));
		const response = await handler(adminContext(submission({ js_errors: fifty })));
		expect(response.result).toEqual({ delivered: true, via: 'master' });

		const body = JSON.parse(String(capture.init?.body)) as { options: ReportWire };
		const sent = body.options.js_errors;
		expect(sent.length).toBeLessThan(50);
		expect(sent.length).toBeGreaterThan(0);
		// Oldest dropped: the FIRST surviving entry is not err_0.
		expect((sent[0] as { msg: string }).msg.startsWith('err_0_')).toBe(false);
		// The newest entry survives, and so does the description.
		expect((sent[sent.length - 1] as { msg: string }).msg.startsWith('err_49_')).toBe(true);
		expect(body.options.description).toBe('Saving a record wipes the toolbar.');
	});
});
