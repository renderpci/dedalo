/**
 * TRIPWIRE — RAG index-time resolution runs under the SYSTEM scope, explicitly.
 *
 * The invariant (2026-07-22 embed-groups redesign): a vector is a property of
 * the RECORD FACET, never of whoever saved. The embed-source resolver reuses
 * the read path's request_config machinery, which consumes the request ALS
 * stores (currentPrincipal / currentDataLang) — and the drain/save-hook run in
 * whatever ambient scope the trigger had. If resolution ever ran in that
 * ambient scope, the vector would encode the SAVER's privileges and language:
 * two identical records would embed differently depending on who last touched
 * them, project-narrowing would silently drop relation legs from the document,
 * and the semantic space would stop being coherent (the exact failure the
 * design forbids).
 *
 * So embed_source.ts MUST:
 *  1. define the frozen RAG_SYSTEM_PRINCIPAL (an explicit isGlobalAdmin
 *     superuser — `undefined` is inconsistent across the two project-filter
 *     paths: skip-filter in sql_assembler vs fail-closed in filter_projects);
 *  2. open runWithRequestContext with that principal, and
 *  3. open runWithRequestLangs with an EXPLICIT per-doc dataLang
 *  — before any emitDdo/read-path call. And the indexer must drive the lang
 * loop from injected deps (config data langs), never from currentDataLang().
 *
 * Comment-stripped source scan: prose mentions don't count; the CALLS must exist.
 */

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const REPO_ROOT = join(import.meta.dir, '../..');
const EMBED_SOURCE = 'src/ai/rag/embed_source.ts';
const INDEXER = 'src/ai/rag/indexer.ts';

/** Strip comments — a mention in prose is documentation, not an established scope. */
function code(text: string): string {
	return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

function read(rel: string): string {
	return code(readFileSync(join(REPO_ROOT, rel), 'utf8'));
}

describe('RAG index-time system scope (embed_source)', () => {
	const source = read(EMBED_SOURCE);

	test('defines the frozen explicit-superuser RAG_SYSTEM_PRINCIPAL', () => {
		expect(source).toMatch(/RAG_SYSTEM_PRINCIPAL[^=]*=\s*Object\.freeze\(/);
		expect(source).toMatch(/isGlobalAdmin:\s*true/);
	});

	test('establishes BOTH ALS scopes around resolution (principal + explicit dataLang)', () => {
		// The context scope carries the system principal…
		expect(source).toMatch(/runWithRequestContext\(\s*\{[^}]*principal:\s*RAG_SYSTEM_PRINCIPAL/);
		// …and the lang scope pins dataLang to the loop's explicit value, never
		// an ambient currentDataLang().
		expect(source).toMatch(/runWithRequestLangs\(\s*\{[^}]*dataLang:\s*lang/);
	});

	test('never READS the ambient scope it is supposed to establish', () => {
		// Consuming currentPrincipal()/currentDataLang() here would re-open the
		// saver-shapes-the-vector hole the wrappers exist to close.
		expect(source).not.toMatch(/\bcurrentPrincipal\s*\(/);
		expect(source).not.toMatch(/\bcurrentDataLang\s*\(/);
		expect(source).not.toMatch(/\bcurrentApplicationLang\s*\(/);
	});

	test('indexer drives langs from injected deps, never the ambient lang', () => {
		const indexer = read(INDEXER);
		expect(indexer).toMatch(/langs:\s*this\.deps\.langs/);
		expect(indexer).not.toMatch(/\bcurrentDataLang\s*\(/);
		expect(indexer).not.toMatch(/\bcurrentPrincipal\s*\(/);
	});

	test('the resolver seam is the one wired into the production indexer', () => {
		const indexer = read(INDEXER);
		expect(indexer).toMatch(/resolveDocs:\s*resolveEmbedDocs/);
	});
});
