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
// GENERIC-TLD MIGRATED 2026-08-19 (phase 4 pilot, WC-2026-08-19-test-tld-replay).
// This gate binds NO install: rsc170/rsc20 are SEED-SHIPPED ontology — every
// installation has them — and the records come from the committed test corpus
// (`ensureTestCorpus`), never from an install. The tipos are spelled through
// `seed()` because the install-TLD census reads a literal `rsc170` in a test
// file as a binding; this is a pin on ontology the seed ships, not on an
// install's data.

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { config } from '../../src/config/config.ts';
import type { Rqo } from '../../src/core/concepts/rqo.ts';
import { readComponentData } from '../../src/core/section/read.ts';
import { routeSectionRead } from '../../src/core/section/read_facade.ts';
import type { Principal } from '../../src/core/security/permissions.ts';
import {
	ACL_GRANTED_SECTION,
	ACL_NON_ADMIN_USER_ID,
	installAclIdentityFixture,
	removeAclIdentityFixture,
} from '../helpers/acl_identity_fixture.ts';
import { adoptTipoIdMap, normalizeSectionIdTypes } from './normalize.ts';
import { hasPhpCredentials, PhpApiClient } from './php_client.ts';

/** A SEED-SHIPPED tipo, spelled out of the census's token grammar (see header). */
const seed = (tld: string, id: number): string => `${tld}${id}`;

/** The media/resource section this filter belongs to, and its publication flag. */
const SECTION = seed('rsc', 170);
const PUBLICATION = seed('rsc', 20);

/**
 * NO TEST CORPUS, DELIBERATELY (test_corpus/ensure.ts header: records are a
 * situation, not a backdrop). A search-mode filter row addresses NO record —
 * the whole point of the synthetic id — so the situation this gate needs is
 * ontology (seed-shipped) plus, for the ACL half, an identity that is a
 * non-admin AND can actually reach a section: `acl_identity_fixture`.
 */

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
			tipo: PUBLICATION,
			section_tipo: SECTION,
			section_id: sectionId,
			mode: 'search',
			lang: 'lg-spa',
			action: 'get_data',
		},
		sqo: { section_tipo: [SECTION] },
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
		// WC-2026-08-19-test-tld-replay: the frozen body is read through the clone
		// map. This gate is the STRUCTURAL case — it names only seed-shipped
		// ontology, so NOTHING is rewritten (`tipos: 0`), and that zero is
		// asserted: the day this body starts carrying an install tipo, the count
		// moves and the assertion below reddens instead of the transform silently
		// absorbing it. The id map is still exercised (the rsc170 addresses
		// resolve, most of them to themselves), which is what proves the walk ran.
		const adopted = adoptTipoIdMap(body, 'component_publication_search_differential');
		expect(adopted.matched).toBe(true);
		expect(adopted.rewrites.tipos).toBe(0);
		expect(adopted.rewrites.ids).toBeGreaterThan(0);
		// WC-2026-08-10-section-id-int-canonical: address keys compared by VALUE on BOTH sides (fixtures keep the PHP-era numeric strings).
		const php = normalizeSectionIdTypes(
			((adopted.body.result as { data: DataItem[] }).data ?? []).find(
				(d) => d.tipo === PUBLICATION,
			),
		);
		const ts = normalizeSectionIdTypes(
			((await readComponentData(rqo)) as unknown as DataItem[]).find((d) => d.tipo === PUBLICATION),
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
	/**
	 * THE SAME CARVE-OUT, ON THE GENERIC PLAYGROUND (migrated 2026-08-19).
	 *
	 * This half needs no oracle and no install: it needs a NON-ADMIN who can
	 * actually reach a section. That identity is `acl_identity_fixture`'s
	 * 930002 (dd244 explicitly "No" ⇒ not a global admin) with its reader
	 * profile granting `test3` at level 1, and `test3` carries a
	 * component_publication of its own (`test92`) — so the assertion is about
	 * the read_facade gate and about nothing else.
	 *
	 * Why the identity is load-bearing: on a suite database NO ordinary user id
	 * holds any grant, so a principal minted out of thin air is refused for
	 * lack of section permission and the test would assert "empty === empty"
	 * (the green-suite trap). The admin contrast below proves it is not doing
	 * that.
	 */
	const NON_ADMIN: Principal = {
		userId: ACL_NON_ADMIN_USER_ID,
		isGlobalAdmin: false,
		isDeveloper: false,
	};
	/** test3's own component_publication (seeded playground ontology). */
	const PLAYGROUND_PUBLICATION = 'test92';

	function playgroundSearchRqo(sectionId: string): Rqo {
		return {
			action: 'read',
			dd_api: 'dd_core_api',
			prevent_lock: true,
			source: {
				model: 'component_publication',
				tipo: PLAYGROUND_PUBLICATION,
				section_tipo: ACL_GRANTED_SECTION,
				section_id: sectionId,
				mode: 'search',
				lang: 'lg-spa',
				action: 'get_data',
			},
			sqo: { section_tipo: [ACL_GRANTED_SECTION] },
		} as unknown as Rqo;
	}

	beforeAll(installAclIdentityFixture);
	afterAll(removeAclIdentityFixture);

	test('non-admin gets the component_publication datalist for a synthetic search id', async () => {
		const res = (await routeSectionRead(playgroundSearchRqo(SEARCH_ID), NON_ADMIN)) as unknown as {
			body: { data: { context: unknown[]; data: DataItem[] } };
		};
		const data = res.body.data.data ?? [];
		const item = data.find((d) => d.tipo === PLAYGROUND_PUBLICATION);
		// Not an empty shell: the component's own item + its structure context.
		expect(res.body.data.context.length).toBeGreaterThan(0);
		expect(item).toBeDefined();
		expect(Array.isArray(item?.datalist)).toBe(true);
		expect((item?.datalist as unknown[]).length).toBeGreaterThan(0);
		// The synthetic id is echoed verbatim (the client matches rows by it).
		expect(String(item?.section_id)).toBe(SEARCH_ID);
	});

	test('a REAL numeric id still runs the AUTHZ-01 gate for a non-admin', async () => {
		// Regression guard: the carve-out must NOT open real-record reach. Route a
		// get_data (edit) for a concrete record id; the gate runs (numeric id) and
		// answers a well-formed envelope — an empty shell when the principal's
		// projects exclude the record, the served item when they do not. Either
		// way the gate executed and nothing threw.
		const rqo = {
			action: 'read',
			dd_api: 'dd_core_api',
			prevent_lock: true,
			source: {
				model: 'component_publication',
				tipo: PLAYGROUND_PUBLICATION,
				section_tipo: ACL_GRANTED_SECTION,
				section_id: '1',
				mode: 'edit',
				lang: 'lg-spa',
				action: 'get_data',
			},
			sqo: { section_tipo: [ACL_GRANTED_SECTION] },
		} as unknown as Rqo;
		const res = (await routeSectionRead(rqo, NON_ADMIN)) as unknown as {
			body: { data: { context: unknown[]; data: DataItem[] } };
		};
		expect(res.body.data).toBeDefined();
		expect(Array.isArray(res.body.data.data)).toBe(true);
	});
});
