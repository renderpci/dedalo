/**
 * WS-A WRITE-PATH TRIPWIRES — mechanical enforcement of two invariants whose
 * violations produced the audit's realized corruption incidents:
 *
 *  1. JSONB BINDING DISCIPLINE (S2-07; incidents S1-07, S1-08): on Bun 1.3.9
 *     a parameter whose inferred type is jsonb gets JSON-encoded by BUN — a
 *     pre-encoded JSON string arrives DOUBLE-encoded (a jsonb string scalar,
 *     silently corrupting the SHARED database). The rule: every `$n::jsonb`
 *     bind in src/ and tools/ must be `$n::text::jsonb` (app-owned encoding
 *     via json_codec) unless the FILE is on the object-binding allowlist
 *     (TS-owned jobs tables that bind raw JS objects, documented convention).
 *
 *  2. LOCATOR LAW (S2-03/S2-04 per DEC-21): locator equality lives in
 *     concepts/locator.ts (compareLocators — PHP-exact semantics: section_id
 *     loose-numeric, other properties strict + present-on-both). New inline
 *     `.section_id ===`-style matchers drift from the law over a DB where
 *     string and numeric section_id forms coexist IN THE SAME record. The
 *     allowlist below is the migration RATCHET: it may only SHRINK. When you
 *     migrate a listed file onto compareLocators/isLocatorInArray, delete its
 *     entry in the same change. Already migrated: relations/save.ts
 *     (sort_data + delete_locator), section/record/delete_record.ts
 *     (inverse-reference cleanup). Deliberately NOT locator comparisons (kept
 *     with a note, not migrated): section/locks.ts (lock-triple key equality
 *     over ITS OWN table's text-normalized section_id — consistent String()
 *     normalization on both sides at creation time, not stored-locator
 *     matching).
 */

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { Glob } from 'bun';

const REPO_ROOT = join(import.meta.dir, '..', '..');

/** All non-test TS source files under src/ and tools/, repo-relative paths. */
function sourceFiles(): string[] {
	const files: string[] = [];
	for (const dir of ['src', 'tools']) {
		const glob = new Glob('**/*.ts');
		for (const match of glob.scanSync({ cwd: join(REPO_ROOT, dir) })) {
			if (match.endsWith('.test.ts')) continue;
			files.push(relative(REPO_ROOT, join(REPO_ROOT, dir, match)));
		}
	}
	return files.sort();
}

function read(file: string): string {
	return readFileSync(join(REPO_ROOT, file), 'utf-8');
}

// ---------------------------------------------------------------------------
// 1. jsonb binding discipline.
// ---------------------------------------------------------------------------

/**
 * Files allowed to bind parameters as bare `$n::jsonb`: they bind raw JS
 * OBJECTS (not pre-encoded JSON text) into TS-OWNED tables, the documented
 * convention B — Bun's own encoding is correct for objects. Everything
 * touching the SHARED matrix/RAG tables binds encodeForJsonb text as
 * `$n::text::jsonb`.
 */
const BARE_JSONB_BIND_ALLOWLIST: readonly string[] = [
	'src/diffusion/jobs/', // dedalo_ts_diffusion_job* (TS-owned, raw-object binds)
];

describe('S2-07 — jsonb parameter binds are ::text::jsonb (json_codec owns encoding)', () => {
	test('no bare $n::jsonb bind outside the object-binding allowlist', () => {
		// $n::jsonb NOT preceded by ::text (negative lookbehind emulated by
		// matching the full cast chain). Case-insensitive and whitespace-tolerant
		// around `::` — Postgres accepts `$1::JSONB` and `$1 ::jsonb` alike, so
		// the scan must too (evasion-hole hardening, 2026-07-07). The sanctioned
		// `$n::text::jsonb` chain still never matches: the pattern requires
		// jsonb as the FIRST cast after the parameter.
		const barePattern = /\$\d+\s*::\s*jsonb/gi;
		const violations: string[] = [];
		for (const file of sourceFiles()) {
			if (BARE_JSONB_BIND_ALLOWLIST.some((prefix) => file.startsWith(prefix))) continue;
			const content = read(file);
			for (const match of content.matchAll(barePattern)) {
				const start = match.index ?? 0;
				// Allow the sanctioned chain: `$n::text::jsonb` — the matched
				// `$n::jsonb` can only be bare (the chain contains `::text::`
				// between the param and ::jsonb, so it never matches this regex).
				const line = content.slice(0, start).split('\n').length;
				violations.push(`${file}:${line} ${match[0]}`);
			}
		}
		expect(
			violations,
			`Bare $n::jsonb bind: on Bun 1.3.9 this DOUBLE-encodes pre-encoded JSON into a jsonb string scalar (the S1-07/S1-08 corruption). Bind encodeForJsonb(...) as $n::text::jsonb, or — for raw-object binds into a TS-owned table — add the file to the allowlist WITH justification: ${violations.join(', ')}`,
		).toEqual([]);
	});
});

// ---------------------------------------------------------------------------
// 2. Locator-law ratchet (inline section_id comparisons).
// ---------------------------------------------------------------------------

/**
 * Files still running hand-rolled section_id equality (census 2026-07-07,
 * audit S2-04's ≥6-matcher inventory plus the comment-level echoes the
 * patterns also catch). RATCHET: only shrink. Migrate each site onto
 * concepts/locator.ts (compareLocators / isLocatorInArray) behind its parity
 * gate, then delete the entry.
 */
const INLINE_SECTION_ID_MATCH_RATCHET = new Set<string>([
	// WS-C S2-25: dispatch.ts's comment-level echoes of the client matcher moved
	// with the extracted handler bodies (comments only — no inline matcher code).
	'src/core/api/handlers/dd_core_api.ts',
	'src/core/section/read_facade.ts',
	'src/core/area/tree.ts',
	'src/core/ontology/parser.ts',
	'src/core/relations/children.ts',
	// datalist.ts, filter_projects.ts, tool_import_files/server/index.ts:
	// migrated onto compareLocators — entries retired 2026-07-07 (the staleness
	// self-test below now enforces this pruning mechanically).
	'src/core/relations/parent.ts',
	'src/core/relations/select_lang.ts',
	'src/core/ontology/hierarchy_provision.ts',
	// info_widgets.ts split into widgets/<tld>/ modules (Phase 1, 2026-07-10):
	// the PHP-verbatim '2' sentinel + strict thesaurus matchers and the
	// 'current'/'self' IPO sentinel checks moved with their widgets (net zero
	// — same code, new homes; the one info_widgets.ts entry became these five).
	'src/core/components/component_info/widgets/calculation/calculation.ts',
	'src/core/components/component_info/widgets/numisdata/get_archive_weights.ts',
	'src/core/components/component_info/widgets/numisdata/get_coins_by_period.ts',
	'src/core/components/component_info/widgets/oh/media_icons.ts',
	'src/core/components/component_info/widgets/state/state.ts',
	'src/core/search/builders/builder_string.ts',
	'src/core/section/locks.ts', // lock-triple key equality (documented non-locator use)
	'src/core/section/read.ts',
	'src/core/security/auth.ts',
	'src/core/tools/register.ts', // radio-button truthy check (dd64/1), not locator matching
	'src/core/tools/registry.ts', // radio-button truthy check (dd64/1), not locator matching
	'src/core/ts_object/node_repository.ts',
	'src/diffusion/resolve/resolver.ts',
	'tools/tool_propagate_component_data/server/propagate.ts',
	'tools/tool_time_machine/server/tool_time_machine.ts',
]);

/**
 * Inline matcher shapes: (a) `.section_id` compared with an equality operator
 * against anything but a null/undefined presence check; (b) String()/Number()
 * coercions of a section_id compared strictly.
 */
const INLINE_PATTERNS: readonly RegExp[] = [
	// Presence/emptiness checks (null / undefined / '') are NOT matchers.
	/\.section_id\s*(?:===|!==|==|!=)(?!=)\s*(?=\S)(?!null\b|undefined\b|''|"")/,
	/(?:String|Number)\([^)\n]*section_id[^)\n]*\)\s*(?:===|!==)/,
];

describe('S2-04/DEC-21 — locator-law ratchet: no NEW inline section_id matcher', () => {
	test('files with inline section_id equality only shrink', () => {
		const violations: string[] = [];
		for (const file of sourceFiles()) {
			if (file === 'src/core/concepts/locator.ts') continue; // the law itself
			const content = read(file);
			if (!content.includes('section_id')) continue;
			if (!INLINE_PATTERNS.some((pattern) => pattern.test(content))) continue;
			if (INLINE_SECTION_ID_MATCH_RATCHET.has(file)) continue;
			violations.push(file);
		}
		expect(
			violations,
			`New inline section_id comparison. Use compareLocators/isLocatorInArray from src/core/concepts/locator.ts (PHP-exact 4-property law; loose-numeric section_id — stored '05' matches 5, inline === does not). Do NOT extend the ratchet upward: ${violations.join(', ')}`,
		).toEqual([]);
	});

	test('ratchet stays honest — no stale entries for files that no longer match (staleness self-test)', () => {
		// Same posture as module_state_tripwire's allowlist self-tests: a stale
		// entry makes the ratchet look stricter than it is (a migrated file could
		// regress back to inline matchers without any diff review noticing). A
		// deleted/moved file is stale too.
		const stale = [...INLINE_SECTION_ID_MATCH_RATCHET].filter((file) => {
			try {
				const content = read(file);
				return (
					!content.includes('section_id') ||
					!INLINE_PATTERNS.some((pattern) => pattern.test(content))
				);
			} catch {
				return true; // file deleted or moved
			}
		});
		expect(
			stale,
			`Stale INLINE_SECTION_ID_MATCH_RATCHET entries — these files no longer contain an inline section_id matcher; delete their entries (the ratchet must match reality): ${stale.join(', ')}`,
		).toEqual([]);
	});
});
