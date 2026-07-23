/**
 * Regression gates for the 2026-07-23 security audit
 * (audits/2026-07-23_security/) — the findings whose behavioural proof needs a
 * live profile/relation fixture are pinned HERE as a mix of pure-behaviour
 * assertions and source-invariant scans, so the fix cannot be silently reverted.
 *
 * Behavioural gates that DO have a home in an existing suite live there instead:
 *   - AUTH-05 (per-request maintenance) + API-01 (inherited-key action) →
 *     security_fail_closed.test.ts
 *   - MEDIA-05 (bare/ancestor public quality) → media_protection_tripwire.test.ts
 *   - RAG-01 record-level DoD (denied user gets nothing) → rag_pipeline.test.ts
 *
 * What is scanned here (the per-component / per-record narrowing whose full
 * behavioural proof would need a bespoke partial-grant profile or a cross-project
 * relation fixture): the invariant must be PRESENT in the source. A source scan
 * is a weaker gate than a live exploit, but it is deterministic and credless, and
 * it catches the one regression that matters — the security line being deleted.
 */

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { contributorComponentTipos } from '../../src/ai/rag/retrieval.ts';
import type { Principal } from '../../src/core/security/permissions.ts';
import { scopeInverseReferenceHits } from '../../src/core/security/record_scope.ts';

const ROOT = join(import.meta.dir, '..', '..');
const read = (rel: string): string => readFileSync(join(ROOT, rel), 'utf8');

describe('RAG-01: rag:<group> chunks gate at COMPONENT level', () => {
	test('contributorComponentTipos extracts the host-section component tipos from chunk_meta', () => {
		const meta = {
			contributors: [
				{ componentTipo: 'test52', sectionTipos: ['test3'] },
				{ componentTipo: 'test17', sectionTipos: ['test3'] },
			],
		};
		expect(contributorComponentTipos(meta)).toEqual(['test52', 'test17']);
		// Robust to the pre-group / malformed shapes.
		expect(contributorComponentTipos(null)).toEqual([]);
		expect(contributorComponentTipos({})).toEqual([]);
		expect(contributorComponentTipos({ contributors: 'nope' })).toEqual([]);
		expect(contributorComponentTipos({ contributors: [{ sectionTipos: ['x1'] }] })).toEqual([]);
	});

	test('aclGate requires EVERY contributing component and fails closed on empty (source invariant)', () => {
		const src = read('src/ai/rag/retrieval.ts');
		// A group chunk gates via the contributor components, not the bare section.
		expect(src).toContain('contributorComponentTipos(candidate.chunkMeta)');
		// Empty contributor set on a group chunk is anomalous → dropped.
		expect(src).toMatch(/isGroupChunk && gateTipos\.length === 0[\s\S]{0,40}continue/);
		// Section read grant is still required beside the components.
		expect(src).toContain('[candidate.sectionTipo, ...gateTipos]');
	});
});

describe('AUTHZ-05: inverse-reference scan is principal-scoped at the user-facing doors', () => {
	test('scopeInverseReferenceHits leaves a global admin unscoped (no accidental over-filter)', async () => {
		const admin: Principal = { userId: -1, isGlobalAdmin: true, isDeveloper: true };
		const hits = [
			{ section_tipo: 'oh1', section_id: 5 },
			{ section_tipo: 'rsc170', section_id: 9 },
		];
		expect(await scopeInverseReferenceHits(hits, admin)).toEqual(hits);
	});

	test('the relation-list panel + its paginator count thread the caller principal (source invariant)', () => {
		// The scan primitive stays principal-free (shared by system paths); the
		// USER-FACING doors scope its output.
		const recordScope = read('src/core/security/record_scope.ts');
		expect(recordScope).toContain('export async function scopeInverseReferenceHits');
		// The non-admin branch checks BOTH the section read grant and the projects filter.
		expect(recordScope).toContain('getPermissions(principal, hit.section_tipo, hit.section_tipo)');
		expect(recordScope).toContain('isRecordInScope(hit.section_tipo, hit.section_id, principal)');

		// The panel data path passes the principal into buildRelationList.
		const readFacade = read('src/core/section/read_facade.ts');
		expect(readFacade).toMatch(/buildRelationList\([\s\S]*?principal,[\s\S]*?\)/);

		// The mode='related' count scopes the total for non-admins.
		const coreApi = read('src/core/api/handlers/dd_core_api.ts');
		expect(coreApi).toContain('scopeInverseReferenceHits(hits, principal)');
		expect(coreApi).toMatch(/if \(principal\.isGlobalAdmin\)[\s\S]{0,120}countInverseReferences/);
	});
});

describe('AUTHZ-04: single-session policy is wired into login (opt-in)', () => {
	test('login evicts other sessions when DEDALO_SINGLE_SESSION is on (source invariant)', () => {
		const auth = read('src/core/security/auth.ts');
		// The flag gates the eviction, and it keeps the token just minted.
		expect(auth).toMatch(/config\.features\.singleSession[\s\S]{0,120}destroyUserSessions/);
		expect(auth).toContain('destroyUserSessions(user.section_id, sessionToken)');
		// The config key is read into config.features.
		const cfg = read('src/config/config.ts');
		expect(cfg).toContain("singleSession: readString('DEDALO_SINGLE_SESSION') === 'true'");
	});
});

describe('AUTHZ-06: component_filter project datalist is narrowed per user', () => {
	test('getUserAuthorizedProjects narrows by principal and fails closed unanchored (source invariant)', () => {
		const src = read('src/core/relations/filter_projects.ts');
		// Value-level deny for an unanchored call (no principal → no projects).
		expect(src).toMatch(/if \(principal === undefined\) return \[\]/);
		// Non-admins are intersected with their own dd170 projects; admins keep all.
		expect(src).toContain('getUserProjects(principal.userId)');
		expect(src).toMatch(/principal\.isGlobalAdmin\s*\?\s*null/);
		// The full-catalog SELECT is filtered by the authorized set.
		expect(src).toMatch(/allowedIds === null \|\| allowedIds\.has\(id\)/);
	});

	test('the component get_data facade self-gates at the component level (defense-in-depth)', () => {
		// Belt-and-braces with the handler's Gate A: the get_data facade must not
		// emit a component's data/datalist for a caller who holds level 0 on it,
		// independent of any upstream gate (esp. the synthetic search_<n> path).
		const readFacade = read('src/core/section/read_facade.ts');
		expect(readFacade).toMatch(/ddoIsAuthorized\(principal, source\.section_tipo, source\.tipo\)/);
	});
});
