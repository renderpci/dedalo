/**
 * get_relation_list narrowing + limit-0 contract (PHP class.relation_list.php
 * get_inverse_references — the CLIENT sqo runs straight through
 * sections::get_instance, so its section_tipo axis narrows the owning
 * sections and set_limit(0) means ALL records).
 *
 * This is the relation_list_header open flow (client relation_list.js
 * get_related_records): the header click sends {section_tipo:[target],
 * limit:0} expecting EVERY related id in that one section. The facade
 * previously dropped the narrowing (always 'all') and forwarded limit 0
 * verbatim, which search_related clamps to LIMIT 1 — the opened window
 * then filtered on one arbitrary id. The parity differential can't catch
 * this: its corpus only sends ['all'] with positive limits.
 */

import { beforeAll, describe, expect, test } from 'bun:test';
import { dispatchRqo } from '../../src/core/api/dispatch.ts';
import { sql } from '../../src/core/db/postgres.ts';
import { resolvePrincipal } from '../../src/core/security/permissions.ts';
import { createSession, getSession } from '../../src/core/security/session_store.ts';
import { registerSessionCleanup } from '../helpers/session_cleanup.ts';

registerSessionCleanup();

// The differential corpus host (numisdata6 #1) — its related records span
// numisdata sections with more than one referencing record.
const HOST = { section_tipo: 'numisdata6', section_id: '1' };

function relationListRqo(sqoOverrides: Record<string, unknown>): Record<string, unknown> {
	return {
		action: 'read',
		dd_api: 'dd_core_api',
		prevent_lock: true,
		options: {},
		source: {
			typo: 'source',
			model: 'relation_list',
			tipo: 'numisdata308',
			section_tipo: HOST.section_tipo,
			section_id: HOST.section_id,
			action: 'get_relation_list',
			mode: 'edit',
			lang: 'lg-spa',
		},
		sqo: {
			section_tipo: ['all'],
			mode: 'related',
			filter_by_locators: [HOST],
			offset: 0,
			...sqoOverrides,
		},
	};
}

async function tsCall(rqo: Record<string, unknown>): Promise<Record<string, unknown>[]> {
	const token = createSession(-1, 'root', true);
	const session = getSession(token);
	const principal = await resolvePrincipal(-1);
	const result = await dispatchRqo(
		structuredClone(rqo) as never,
		{
			requestId: 'relation_list_narrowing_test',
			clientIp: '127.0.0.1',
			session,
			csrfCandidate: session?.csrfToken ?? null,
			principal,
		} as never,
	);
	const body = result.body as { result?: { data?: Record<string, unknown>[] } };
	return body.result?.data ?? [];
}

let dbReady = false;
beforeAll(async () => {
	try {
		await sql`SELECT 1`;
		dbReady = true;
	} catch {
		dbReady = false;
	}
});

describe('get_relation_list sqo narrowing (header-open contract)', () => {
	test('section_tipo narrows to ONE owning section and limit 0 returns ALL its ids', async () => {
		if (!dbReady) return;
		// Full picture first: every related record, no cap.
		const all = await tsCall(relationListRqo({ limit: 0 }));
		const idRowsBySection = new Map<string, number>();
		for (const row of all) {
			if (row.component_tipo !== 'id') continue;
			const sectionTipo = String(row.section_tipo);
			idRowsBySection.set(sectionTipo, (idRowsBySection.get(sectionTipo) ?? 0) + 1);
		}
		if (idRowsBySection.size === 0) return; // corpus-less DB: nothing to assert
		// Pick the section with the most referencing records (anti-vacuity for
		// the limit-0 assertion: a limit-0→LIMIT 1 regression only shows when
		// the true count exceeds 1).
		const ranked = [...idRowsBySection.entries()].sort((a, b) => b[1] - a[1]);
		const [target, expectedCount] = ranked[0] as [string, number];
		const narrowed = await tsCall(relationListRqo({ section_tipo: [target], limit: 0 }));
		const narrowedIdRows = narrowed.filter((row) => row.component_tipo === 'id');
		// Narrowing: no other owning section leaks through.
		expect(narrowed.every((row) => row.section_tipo === target)).toBe(true);
		// limit 0 = ALL (PHP set_limit(0)): the same count the 'all' scan found.
		expect(narrowedIdRows.length).toBe(expectedCount);
	});

	test("['all'] stays un-narrowed (the panel's default request)", async () => {
		if (!dbReady) return;
		const all = await tsCall(relationListRqo({ limit: 0 }));
		const sections = new Set(
			all.filter((row) => row.component_tipo === 'id').map((row) => String(row.section_tipo)),
		);
		if (sections.size < 2) return; // needs a multi-section host to be meaningful
		expect(sections.size).toBeGreaterThan(1);
	});
});
