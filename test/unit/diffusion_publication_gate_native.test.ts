/**
 * A PUBLICATION DECISION IS NEVER SILENT (P2-13 / PUB-07).
 *
 * `resolveGate` ended in a bare `} catch { return 'unpublish'; }` — no log, no
 * counter, no reason. `'unpublish'` flows to `session.removeRecords`: removal of
 * rows from the PUBLIC heritage website. Failing closed is the documented safe
 * direction and it stays. The defect was that a resolution FAILURE was
 * indistinguishable from a curator's decision to unpublish, so an operator saw
 * records disappear from a museum's public site with no reason recorded
 * anywhere.
 *
 * And it was never executed. The audit measured ZERO executions of that catch in
 * a full-suite coverage run: the two tests literally named "publication gate
 * (fail-closed…)" drive the decision paths and never force a throw. This file
 * forces it — hermetically, with no database — so the branch that decides
 * whether heritage rows leave a public website is reachable somewhere other than
 * production.
 */

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { MatrixRecord } from '../../src/core/db/matrix.ts';
import { type RunContext, resolveGate } from '../../src/diffusion/resolve/resolver.ts';

const REPO_ROOT = join(import.meta.dir, '..', '..');

const RECORD = {
	section_tipo: 'test2',
	section_id: 4242,
	relation: {},
} as unknown as MatrixRecord;

/**
 * The minimum ctx `resolveGate` touches. `boom` poisons the FIRST lookup, which
 * is how the throw is forced without a database — the real-world causes (a
 * failed ontology read, a malformed stored locator) all surface at the same
 * place.
 */
function contextWith(boom: boolean, overrides?: Partial<RunContext>): RunContext {
	const sectionPublishableOverride = boom
		? ({
				get() {
					throw new Error('ontology unreachable');
				},
			} as unknown as Map<string, boolean | null>)
		: new Map<string, boolean | null>();
	return {
		options: {},
		sectionPublishableOverride,
		publishableOverrides: new Map(),
		publicationTipoCache: new Map([['test2', null]]),
		...overrides,
	} as unknown as RunContext;
}

describe('a publication decision is never silent', () => {
	test('a gate FAILURE fails closed AND says why', async () => {
		const warnings: string[] = [];
		const realWarn = console.warn;
		console.warn = (...args: unknown[]) => warnings.push(args.join(' '));
		try {
			const result = await resolveGate(contextWith(true), RECORD);
			// Fail-closed: unchanged, and the whole point of the branch.
			expect(result.status).toBe('unpublish');
			// ...but now DISTINGUISHABLE from a decided unpublish.
			expect(result.failure).toBeDefined();
			expect(result.failure).toContain('ontology unreachable');
		} finally {
			console.warn = realWarn;
		}
		// And loudly: the operator's log names the record it could not decide.
		expect(warnings.join('\n')).toContain('publication gate FAILED');
		expect(warnings.join('\n')).toContain('test2/4242');
		expect(warnings.join('\n')).toContain('REMOVED from the public site');
	});

	test('a DECIDED unpublish carries no failure — the two stay distinguishable', async () => {
		const ctx = contextWith(false, {
			sectionPublishableOverride: new Map([['test2', false]]),
		} as Partial<RunContext>);
		const result = await resolveGate(ctx, RECORD);
		expect(result.status).toBe('unpublish');
		expect(result.failure).toBeUndefined();
	});

	test('an ordinary publish is unaffected', async () => {
		const ctx = contextWith(false, {
			sectionPublishableOverride: new Map([['test2', true]]),
		} as Partial<RunContext>);
		expect(await resolveGate(ctx, RECORD)).toEqual({ status: 'publish' });
	});

	test('the skip option still bypasses the gate entirely', async () => {
		const ctx = contextWith(true, {
			options: { skipPublicationStateCheck: true },
		} as unknown as Partial<RunContext>);
		// Even with a poisoned lookup: the bypass returns before the try block.
		expect(await resolveGate(ctx, RECORD)).toEqual({ status: 'publish' });
	});

	test('the failure reaches the operator-facing error list, not just the log', async () => {
		// A console line is not a record: journald rotates. processRecord must put
		// the failure into the batch errors — the job's error list is the
		// operator's ONLY view of a partial publication.
		const source = readFileSync(join(REPO_ROOT, 'src/diffusion/resolve/resolver.ts'), 'utf8');
		expect(source).toContain('PUBLICATION_GATE_ERROR_FIELD');
		expect(source).toMatch(/if \(gate\.failure !== undefined\) \{[\s\S]{0,400}errors\.push\(/);
		expect(source).toContain('REMOVED from the public site');
	});
});

/**
 * THE OTHER HALF OF P2-13 (PUB-08) — a retired directive spelling must not
 * compile to silence.
 *
 * `properties.process.parser` naming an UNREGISTERED function is a hard compile
 * ERROR, under a comment citing "nothing silent". The v6 spelling of the whole
 * directive — `process_dato`, still carried by 18 ontology nodes — misses the
 * `process?.parser` read entirely and yields an EMPTY transform with zero
 * errors, zero warnings and zero degradations. The field publishes untransformed
 * and nothing says the ontology asked for a transform at all.
 *
 * The louder an engine is about a mistyped function name, the more misleading
 * its silence about a directive it no longer reads.
 */
describe('a retired parser spelling is reported, not silently dropped', () => {
	test('the compiler names the retired block and the replacement', () => {
		const source = readFileSync(join(REPO_ROOT, 'src/diffusion/plan/compile.ts'), 'utf8');
		// Follows the established retired-property idiom
		// (relations/request_config/build.ts::reportRetiredTargetMode): name the
		// node, name the replacement, then resolve by the ordinary rule.
		expect(source).toContain('RETIRED_PARSER_SPELLINGS');
		expect(source).toContain('process_dato');
		expect(source).toContain('retired_parser_spelling');
		expect(source).toContain('publishes with NO transform');
		// It must be reached from the EXACT branch that used to return silently.
		expect(source).toMatch(
			/if \(rawParser === undefined \|\| rawParser === null\) \{[\s\S]{0,200}reportRetiredParserSpelling\(/,
		);
	});

	test('the degradation reason is a closed union the run report can switch on', () => {
		// A free-text message alone would be unreportable: the run report groups by
		// reason, so a new degradation kind has to be declared, not improvised.
		const types = readFileSync(join(REPO_ROOT, 'src/diffusion/plan/types.ts'), 'utf8');
		expect(types).toMatch(/reason: 'dangling_ddo_tipo' \| 'retired_parser_spelling';/);
	});
});
