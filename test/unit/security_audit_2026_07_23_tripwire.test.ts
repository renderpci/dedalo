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
import { Glob } from 'bun';
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

	/**
	 * THE DOOR REGISTRY — and why it is DISCOVERED, not listed.
	 *
	 * The two assertions above name two doors by hand, and a hand-list of security
	 * doors rots silently. It already did, twice: `tool_posterframe` was wired in by
	 * the 2026-07-28 TOOLS-08 pass calling itself "the THIRD door", and the thesaurus
	 * indexation grid was found in the 2026-08 oh1 beta audit (§5.4) re-implementing
	 * the rule privately with the PROJECTS half alone. Neither ever appeared here.
	 * A registry that a new door does not have to join is not a registry.
	 *
	 * So this test ENUMERATES the callers instead: every hand-written module under
	 * src/ and tools/ that reaches for the unscoped inverse scan
	 * (`findInverseReferences` / `findInverseReferenceLocators`) must be classified
	 * below, and a caller that is not classified FAILS — loudly, with the path, so
	 * the author has to answer "is this a user-facing door?" before it lands.
	 *
	 * The three kinds, and what each one CLAIMS:
	 *   'door'   — reached with a REQUEST principal and emits the hits (their
	 *              existence, labels, counts or content) back to that caller.
	 *              ⇒ the source MUST call scopeInverseReferenceHits / scopeRecordHits.
	 *   'system' — no request principal in the path, or the walk must see EVERY
	 *              reference to be correct (integrity rewrites, propagation).
	 *              ⇒ the source MUST NOT scope; the reason is recorded.
	 *   'open'   — an emission path that has NOT been reviewed as a door by the
	 *              AUTHZ-05 passes. This is an honest "unknown", NOT a safety
	 *              claim, and it must name where it is being tracked (`raised`).
	 *              Zero is the target; the gate keeps the count visible instead of
	 *              letting an unreviewed path pass as if it had been cleared.
	 */
	const SCOPE_CALL = /scope(InverseReferenceHits|RecordHits)\s*\(/;

	type DoorKind = 'door' | 'system' | 'open';
	interface DoorEntry {
		kind: DoorKind;
		why: string;
		/** Required for 'open': where the unreviewed path is tracked. */
		raised?: string;
	}

	const INVERSE_SCAN_CALLERS: Record<string, DoorEntry> = {
		// ── the scan itself + the one implementation of the rule ────────────────
		'src/core/search/search_related.ts': {
			kind: 'system',
			why: 'the primitive: unscoped by design, principal-free, shared by every path below',
		},
		'src/core/security/record_scope.ts': {
			kind: 'system',
			why: 'the boundary itself (scopeInverseReferenceHits); names the scan in prose only',
		},

		// ── user-facing doors: must scope ───────────────────────────────────────
		'src/core/resolve/relation_list.ts': {
			kind: 'door',
			why: 'the relation-list panel: emits the owning records of a host record',
		},
		'src/core/resolve/related_sections.ts': {
			kind: 'door',
			why: 'the related-sections tab: emits which sections reference the host record',
		},
		'src/core/api/handlers/dd_core_api.ts': {
			kind: 'door',
			why: "mode='related' paginator: the total is an existence count",
		},
		'src/core/section/indexation_grid.ts': {
			kind: 'door',
			why: 'the thesaurus indexation grid (2026-08 oh1 beta §5.4); the read-grant half of its scoping diverges from PHP — WC-2026-08-09-indexation-grid-read-grant-scope',
		},
		'tools/tool_posterframe/server/index.ts': {
			kind: 'door',
			why: 'get_ar_identifying_image: descriptors of the records referencing the target (TOOLS-08, 2026-07-28 audit)',
		},

		// ── system paths: must NOT scope ────────────────────────────────────────
		'src/core/section/record/delete_record.ts': {
			kind: 'system',
			why: 'integrity rewrite: EVERY referencing record must be cleaned, or the delete leaves dangling locators behind for the references the actor could not see',
		},
		'src/core/section/record/observers.ts': {
			kind: 'system',
			why: 'observer propagation runs under the system identity; a scoped seed would write a mirror truncated to one actor’s grants',
		},
		'src/diffusion/resolve/resolver.ts': {
			kind: 'system',
			why: 'diffusion publishes with no request principal; its own gate is the publication config, not the operator’s grants',
		},
		'src/core/search/builders/builder_relation_index.ts': {
			kind: 'system',
			why: 'builds a section_id IN (…) PREDICATE, not a result set: the fragment is ANDed into the caller’s own already-scoped search (buildSearchSql applies the projects filter around it)',
		},
		'src/core/relations/children.ts': {
			kind: 'system',
			why: 'same-section descendants of an already-resolved host record; also driven by principal-free paths (tree build, diffusion), and dropping an intermediate would orphan its subtree rather than hide it',
		},
		'src/core/relations/related.ts': {
			kind: 'system',
			why: 'component_relation_related’s same-section back-reference graph (PHP get_references): principal-free by signature, and the traversal is a closure whose result changes shape if nodes are removed mid-walk',
		},

		// ── not yet reviewed as a door ──────────────────────────────────────────
		'src/core/relations/models/relation_index.ts': {
			kind: 'open',
			why: 'emits the records POINTING AT the host, across config.targetSections, plus their related_list child components — the same shape as the indexation grid, with no principal anywhere in the path. Whether the upstream component gate (read_facade ddoIsAuthorized) is sufficient here has not been established by either AUTHZ-05 pass.',
			raised: 'WS-G1 handoff, 2026-08-09 remediation wave (audits/2026-08_oh1_beta)',
		},
	};

	test('every caller of the unscoped inverse scan is classified (door registry)', () => {
		const found = new Set<string>();
		for (const dir of ['src', 'tools']) {
			for (const rel of new Glob('**/*.ts').scanSync(join(ROOT, dir))) {
				const path = `${dir}/${rel}`;
				if (read(path).includes('findInverseReference')) found.add(path);
			}
		}

		const unclassified = [...found].filter((p) => INVERSE_SCAN_CALLERS[p] === undefined).sort();
		expect(
			unclassified,
			`NEW caller(s) of the unscoped inverse scan. Classify each in INVERSE_SCAN_CALLERS: 'door' (a request principal reaches it and the hits go back to that caller ⇒ scope through scopeInverseReferenceHits) or 'system' (principal-free / integrity walk ⇒ say why it must see everything).`,
		).toEqual([]);

		const stale = Object.keys(INVERSE_SCAN_CALLERS)
			.filter((p) => !found.has(p))
			.sort();
		expect(stale, 'registry entries for files that no longer use the inverse scan').toEqual([]);
	});

	test('every registered DOOR scopes, and every SYSTEM path is unscoped on purpose', () => {
		for (const [path, entry] of Object.entries(INVERSE_SCAN_CALLERS)) {
			const src = read(path);
			if (entry.kind === 'door') {
				expect(SCOPE_CALL.test(src), `${path} is a registered AUTHZ-05 door and must scope`).toBe(
					true,
				);
			}
			// A reason is mandatory in every direction: the registry is only worth
			// as much as the sentence that says why the row is what it is.
			expect(entry.why.length, `${path} needs a reason`).toBeGreaterThan(30);
			if (entry.kind === 'open') {
				expect(entry.raised ?? '', `${path} is 'open' and must name where it is tracked`).not.toBe(
					'',
				);
			}
		}
		// record_scope.ts is the only 'system' entry allowed to contain the call —
		// it IS the call. A system path that started scoping is a door in disguise.
		for (const [path, entry] of Object.entries(INVERSE_SCAN_CALLERS)) {
			if (entry.kind !== 'system' || path === 'src/core/security/record_scope.ts') continue;
			expect(SCOPE_CALL.test(read(path)), `${path} is registered 'system' but scopes`).toBe(false);
		}
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
