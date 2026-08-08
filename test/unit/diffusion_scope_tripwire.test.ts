/**
 * TRIPWIRE: diffusion publish/delete identifier LOCKSTEP + server-authoritative
 * publication scope (DIFF-A / DIFF-B, 2026-07-28 audit).
 *
 * DIFF-A — publish sanitized ontology labels into SQL identifiers while delete
 * used the RAW labels, so `Web`→published `web` but deleted `` `Web` ``; the
 * errno-1146 miss was counted as a successful unpublish and the record stayed
 * live in the public tier. Fix: ONE sanitizer (src/core/db/sql_identifier.ts)
 * used by BOTH sides — the publish plan (src/diffusion/plan/identifier re-exports
 * it) and the delete map (src/core/diffusion_bridge/diffusion_map, which cannot
 * import src/diffusion/**). Source invariant: the delete map routes db/table
 * names through requireSqlIdentifier, and the shared sanitizer lives in core.
 *
 * DIFF-B — `diffuse` trusted client options: skip_publication_state_check turned
 * the fail-closed per-record publication gate OFF, and `levels` was unclamped.
 * Fix: the enqueue path gates the bypass on isGlobalAdmin and clamps levels.
 */

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dir, '..', '..');
const read = (rel: string): string => readFileSync(join(ROOT, rel), 'utf8');

describe('DIFF-A — publish/delete identifier lockstep', () => {
	test('the shared sanitizer lives in core (importable by both sides)', () => {
		const core = read('src/core/db/sql_identifier.ts');
		expect(core.includes('export function requireSqlIdentifier')).toBe(true);
		expect(core.includes('export function sanitizeSqlName')).toBe(true);
	});

	test('the delete map sanitizes db/table names through requireSqlIdentifier', () => {
		// The walk moved to the pure graph module (Tier-3 3.9 extraction); the
		// sanitizer chokepoint moved WITH it — assert it there, and assert the
		// map still drives that walk (no second, unsanitized materializer).
		const graph = read('src/core/diffusion_bridge/diffusion_graph.ts');
		expect(graph.includes("from '../db/sql_identifier.ts'")).toBe(true);
		expect(graph.includes("requireSqlIdentifier(hit.element.database, 'database')")).toBe(true);
		expect(graph.includes("requireSqlIdentifier(hit.table, 'table')")).toBe(true);
		const map = read('src/core/diffusion_bridge/diffusion_map.ts');
		expect(map.includes('walkDiffusionTargets')).toBe(true);
	});

	test('the publish plan uses the SAME sanitizer (re-exported from core)', () => {
		const id = read('src/diffusion/plan/identifier.ts');
		expect(id.includes("from '../../core/db/sql_identifier.ts'")).toBe(true);
		expect(id.includes('requireSqlIdentifier')).toBe(true);
	});
});

describe('DIFF-B — publication scope is server-authoritative', () => {
	const actions = read('src/diffusion/api/actions.ts');

	test('skip_publication_state_check is stripped for non-admins', () => {
		expect(actions.includes('principal.isGlobalAdmin')).toBe(true);
		expect(actions.includes('delete runnerOptions.skip_publication_state_check')).toBe(true);
	});

	test('the recursion budget is clamped to the server ceiling', () => {
		expect(actions.includes('diffusionResolveLevels()')).toBe(true);
		expect(actions.includes('Math.min(requestedLevels, diffusionResolveLevels())')).toBe(true);
	});
});
