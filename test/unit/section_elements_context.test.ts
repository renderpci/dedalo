/**
 * Appendix gate: dd_core_api.get_section_elements_context — the edit-mode
 * search-filter panel's element list. Driven over the REAL HTTP path (session +
 * CSRF) against a live section, asserting the "simple" structure-context
 * contract: section entry first, per-component entries, and NO tools / buttons /
 * request_config on any entry (PHP context_type:'simple'). The exact
 * per-element deep-diff vs the PHP oracle is a separate differential (needs the
 * PHP server up); this locks the shape + registration + auth.
 */

import { describe, expect, test } from 'bun:test';
import { buildSectionElementsContext } from '../../src/core/resolve/section_elements_context.ts';
import { resolvePrincipal } from '../../src/core/security/permissions.ts';
import { createSession, getSession } from '../../src/core/security/session_store.ts';
import { handleRequest } from '../../src/server.ts';

const context = { requestId: 'sec-elem-ctx', startedAt: 0 };
const SECTION = 'numisdata4';

function apiRequest(body: unknown, cookie?: string, csrf?: string): Request {
	const headers: Record<string, string> = { 'Content-Type': 'application/json' };
	if (cookie) headers.Cookie = cookie;
	if (csrf !== undefined) headers['X-Dedalo-Csrf-Token'] = csrf;
	return new Request('http://localhost/dedalo/core/api/v1/json/', {
		method: 'POST',
		headers,
		body: JSON.stringify(body),
	});
}

const SIMPLE_FORBIDDEN = ['tools', 'buttons', 'request_config'];

describe('get_section_elements_context (appendix)', () => {
	test('builder: section-first, simple contexts, no tools/buttons/request_config', async () => {
		const principal = await resolvePrincipal(-1);
		const out = await buildSectionElementsContext(principal, {
			ar_section_tipo: SECTION,
			context_type: 'simple',
			use_real_sections: true,
		});
		expect(out.length).toBeGreaterThan(1);
		// The section's own context comes first.
		expect(out[0]?.model).toBe('section');
		expect(out[0]?.tipo).toBe(SECTION);
		// Every entry is a simple context (no tools/buttons/request_config) and carries
		// the fields the client filter builder reads.
		for (const entry of out) {
			for (const forbidden of SIMPLE_FORBIDDEN) expect(forbidden in entry).toBe(false);
			expect(typeof entry.tipo).toBe('string');
			expect(entry.section_tipo).toBe(SECTION);
			// Components are built in 'search' mode (they carry the operator tooltip);
			// the section + groupers stay 'list' (PHP class.common.php:3811/3915-22/3928).
			expect(entry.mode).toBe(String(entry.model).startsWith('component_') ? 'search' : 'list');
		}
		// Every component carries the search-operator tooltip fields (PHP stamps them
		// for every search-mode component; empty-operator models emit [] and '').
		for (const entry of out) {
			if (!String(entry.model).startsWith('component_')) continue;
			expect('search_operators_info' in entry).toBe(true);
			expect('search_options_title' in entry).toBe(true);
		}
		// At least one real component surfaced.
		expect(out.some((e) => String(e.model).startsWith('component_'))).toBe(true);
	});

	test('unauthenticated HTTP call is refused (authenticated read)', async () => {
		const res = await handleRequest(
			apiRequest({
				action: 'get_section_elements_context',
				dd_api: 'dd_core_api',
				prevent_lock: true,
				source: {},
				options: { ar_section_tipo: SECTION, context_type: 'simple' },
			}),
			context,
		);
		expect(res.status).not.toBe(200);
	});

	test('authenticated HTTP call returns the simple-context list', async () => {
		const token = createSession(-1, 'root', true);
		const cookie = `dedalo_ts_session=${token}`;
		const csrf = getSession(token)?.csrfToken as string;
		const res = await handleRequest(
			apiRequest(
				{
					action: 'get_section_elements_context',
					dd_api: 'dd_core_api',
					prevent_lock: true,
					source: {},
					options: { ar_section_tipo: SECTION, context_type: 'simple', use_real_sections: true },
				},
				cookie,
				csrf,
			),
			context,
		);
		expect(res.status).toBe(200);
		const body = (await res.json()) as { result: Record<string, unknown>[]; msg: string };
		expect(Array.isArray(body.result)).toBe(true);
		expect(body.result.length).toBeGreaterThan(1);
		expect(body.result[0]?.model).toBe('section');
	});
});
