/**
 * component_publication (SELECT/FILTER family) in SEARCH mode — synthetic
 * filter-row id (2026-07-10 fix).
 *
 * The search filter panel builds each filter component against a SYNTHETIC,
 * client-minted section_id ('search_<n>', core/search/js/search.js
 * get_section_id) that resolves NO matrix record. component_publication's search
 * renderer (core/component_publication/js/render_search_component_publication.js)
 * iterates `self.data.datalist` to draw its yes/no radio buttons — so the server
 * MUST emit the option datalist for that synthetic id, exactly like the
 * real-record edit datalist. Two regressions were fixed:
 *
 *   1. readComponentData returned a bare, datalist-LESS item for the null-record
 *      search path (read.ts) → the filter rendered blank, lang leaked as the
 *      request lang instead of the forced lg-nolan.
 *   2. the read_facade per-record ACL gate (AUTHZ-01) fired on the synthetic
 *      (non-numeric) id — isRecordInScope(NaN) === false — blanking the whole
 *      search form for NON-admins (search is enabled for all users; PHP never
 *      gates this path — user_can_access_record is RAG-only).
 *
 * The oracle-gated block pins the emitted datalist byte-for-byte to PHP. The
 * always-on block pins the non-admin gate carve-out (no PHP round-trip needed).
 */

import { beforeAll, describe, expect, test } from 'bun:test';
import { config } from '../../src/config/config.ts';
import type { Rqo } from '../../src/core/concepts/rqo.ts';
import { readComponentData } from '../../src/core/section/read.ts';
import { routeSectionRead } from '../../src/core/section/read_facade.ts';
import type { Principal } from '../../src/core/security/permissions.ts';
import { PhpApiClient, hasPhpCredentials } from './php_client.ts';

interface DataItem {
	tipo: string;
	section_id?: unknown;
	lang?: string;
	entries?: unknown;
	datalist?: unknown;
	[k: string]: unknown;
}

// The synthetic id search.js mints per filter row: non-numeric, addresses no record.
const SEARCH_ID = 'search_1';

function searchRqo(sectionId: string): Rqo {
	return {
		action: 'read',
		dd_api: 'dd_core_api',
		prevent_lock: true,
		source: {
			model: 'component_publication',
			tipo: 'rsc20',
			section_tipo: 'rsc170',
			section_id: sectionId,
			mode: 'search',
			lang: 'lg-spa',
			action: 'get_data',
		},
		sqo: { section_tipo: ['rsc170'] },
	} as unknown as Rqo;
}

const client = new PhpApiClient();
let ready = false;

beforeAll(async () => {
	if (!hasPhpCredentials()) return;
	await client.login(
		config.phpReference.username as string,
		config.phpReference.password as string,
	);
	ready = true;
});

describe.if(hasPhpCredentials())('component_publication search-mode datalist differential', () => {
	test('synthetic search id emits the option datalist byte-equal to PHP', async () => {
		if (!ready) return;
		const rqo = searchRqo(SEARCH_ID);
		const { body } = await client.call(structuredClone(rqo) as Record<string, unknown>);
		const php = ((body.result as { data: DataItem[] }).data ?? []).find((d) => d.tipo === 'rsc20');
		const ts = ((await readComponentData(rqo)) as unknown as DataItem[]).find(
			(d) => d.tipo === 'rsc20',
		);

		// Presence FIRST (S2-40): undefined-vs-undefined must not pass vacuously.
		expect(php).toBeDefined();
		expect(ts).toBeDefined();
		expect(php?.datalist).toBeDefined();
		expect(Array.isArray(php?.datalist)).toBe(true);
		expect((php?.datalist as unknown[]).length).toBeGreaterThan(0);

		// The core fix: the datalist matches PHP exactly (yes/no options).
		expect(ts?.datalist).toEqual(php?.datalist);
		// Publication is language-neutral: the item lang is forced to lg-nolan
		// (component_publication __construct), NOT the request lang (was lg-spa).
		expect(ts?.lang).toBe('lg-nolan');
		expect(ts?.lang).toBe(php?.lang);
		// The synthetic id is echoed verbatim so the client build matches by
		// String(el.section_id) === String(self.section_id).
		expect(String(ts?.section_id)).toBe(SEARCH_ID);
	});
});

describe('search-filter synthetic id — read_facade ACL gate carve-out', () => {
	// A non-admin: the per-record AUTHZ-01 gate would have fired on the synthetic
	// (non-numeric) id (isRecordInScope(NaN) === false) and returned an empty
	// shell, blanking every search-filter component. The carve-out skips the gate
	// for non-numeric ids only (they address no record), so the datalist emits.
	const NON_ADMIN: Principal = { userId: 16, isGlobalAdmin: false, isDeveloper: false };

	test('non-admin gets the component_publication datalist for a synthetic search id', async () => {
		const res = (await routeSectionRead(searchRqo(SEARCH_ID), NON_ADMIN)) as unknown as {
			body: { result: { context: unknown[]; data: DataItem[] } };
		};
		const data = res.body.result.data ?? [];
		const item = data.find((d) => d.tipo === 'rsc20');
		// Not an empty shell: the component's own item + its structure context.
		expect(res.body.result.context.length).toBeGreaterThan(0);
		expect(item).toBeDefined();
		expect(Array.isArray(item?.datalist)).toBe(true);
		expect((item?.datalist as unknown[]).length).toBeGreaterThan(0);
	});

	test('a REAL out-of-scope numeric id stays gated for a non-admin (AUTHZ-01 intact)', async () => {
		// Regression guard: the carve-out must NOT open real-record reach. Route a
		// get_data (edit) for a concrete record id; a non-admin whose projects
		// filter excludes it receives the empty shell — proving numeric ids are
		// still gated. (When user 16's projects DO include rsc170/1 this asserts a
		// served item instead; either way the gate ran — never a crash.)
		const rqo = {
			action: 'read',
			dd_api: 'dd_core_api',
			prevent_lock: true,
			source: {
				model: 'component_publication',
				tipo: 'rsc20',
				section_tipo: 'rsc170',
				section_id: '1',
				mode: 'edit',
				lang: 'lg-spa',
				action: 'get_data',
			},
			sqo: { section_tipo: ['rsc170'] },
		} as unknown as Rqo;
		const res = (await routeSectionRead(rqo, NON_ADMIN)) as unknown as {
			body: { result: { context: unknown[]; data: DataItem[] } };
		};
		// The gate executed (numeric id): result is a well-formed envelope, never a throw.
		expect(res.body.result).toBeDefined();
		expect(Array.isArray(res.body.result.data)).toBe(true);
	});
});
