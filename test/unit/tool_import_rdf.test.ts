/**
 * R2 gate: tool_import_rdf. The RDF/XML parser and the class-map are covered by
 * rdf_xml.test.ts / rdf_map.test.ts; this file gates the TOOL — its action
 * surface, the argument validation, and what it reports when the shared SSRF
 * guard (`fetchGuardedText`) refuses a URI (SEC-072). The guard itself is gated in
 * ssrf_guard.test.ts; the private literal-host blocklist this tool once carried
 * (`isSafeRemoteUrl`, a second parser with no production caller) is deleted.
 *
 * Network-free by construction: a refused URI never reaches fetch(), so every
 * assertion here runs credless and offline.
 */
// Migrated to the generic `test` TLD 2026-08-19: the sectionTipos extractor is pure, so
// its ontology tipo and locator are opaque — they now name generic `test` nodes.

import { describe, expect, test } from 'bun:test';
import { resolvePrincipal } from '../../src/core/security/permissions.ts';
import { getLoadedTool } from '../../src/core/tools/loader.ts';
import { mustGet } from '../helpers/assert.ts';
import { refusalOf } from '../helpers/refusal.ts';

/**
 * A wire body without its `debug` block — what a production install sends. The
 * block is the operator's own disclosure ladder (DEDALO_DEBUG_API_ERRORS / dev
 * mode, ERRORS_SPEC), present when this suite runs in dev mode.
 */
function publicPart(body: object | undefined): object {
	const { debug: _debug, ...rest } = (body ?? {}) as Record<string, unknown>;
	return rest;
}

describe('tool_import_rdf module', () => {
	test('loads with get_rdf_data only, gated at READ level, not backgroundRunnable', async () => {
		const loaded = await getLoadedTool('tool_import_rdf');
		expect(loaded).not.toBeNull();
		const actions = loaded!.module.apiActions;
		expect(Object.keys(actions)).toEqual(['get_rdf_data']);
		const spec = mustGet(actions.get_rdf_data, 'get_rdf_data');
		// PHP gates WRITE (level 2) on the LOCATOR's section, and the client sends
		// the target ONLY inside options.locator — so the gate must read the
		// payload, not options.section_tipo.
		expect(spec.permission).toBe('section_list');
		expect(spec.minLevel).toBe(2);
		// Nothing forks: the fetch answers the request that made it.
		expect(loaded!.module.backgroundRunnable).toBeUndefined();
	});

	test('the gate reads the target out of options.locator (the wire the client posts)', async () => {
		const loaded = await getLoadedTool('tool_import_rdf');
		const spec = mustGet(loaded!.module.apiActions.get_rdf_data, 'get_rdf_data');
		// The EXACT options tool_import_rdf.js get_rdf_data (:218-227) posts — note
		// there is NO top-level section_tipo. Reading one gave an empty target and
		// a fail-closed denial, i.e. the action was unreachable from the UI.
		expect(
			spec.sectionTipos?.({
				// ontology_tipo is opaque to the extractor (only `locator` is read).
				ontology_tipo: 'test6',
				ar_values: ['http://viaf.org/viaf/1'],
				locator: { section_tipo: 'test3', section_id: 1 },
			}),
		).toEqual(['test3']);
		// No locator → no target → the 'section_list' gate denies (fail-closed).
		expect(spec.sectionTipos?.({ ar_values: [] })).toEqual([]);
	});

	test('an empty ar_values is refused before any fetch', async () => {
		const loaded = await getLoadedTool('tool_import_rdf');
		const refusal = await refusalOf(
			mustGet(loaded!.module.apiActions.get_rdf_data, 'get_rdf_data').handler({
				principal: await resolvePrincipal(-1),
				userId: -1,
				background: false,
				options: { ar_values: [] },
			}),
		);
		expect(refusal.code).toBe('request.invalid_options');
		expect(refusal.publicMessage).toContain('Missing ar_values');
	});

	test('an unsafe URI is reported per-value, never dereferenced', async () => {
		const loaded = await getLoadedTool('tool_import_rdf');
		const res = await mustGet(loaded!.module.apiActions.get_rdf_data, 'get_rdf_data').handler({
			principal: await resolvePrincipal(-1),
			userId: -1,
			background: false,
			// No `locator` → no section gate inside the handler; the dispatcher's
			// declarative 'section' gate is what protects the real wire.
			options: { ar_values: ['http://169.254.169.254/latest/meta-data'] },
		});
		const data = res.data as {
			rdf: unknown[];
			errors: { uri: string; error: { code: string; retryable: boolean } }[];
		};
		expect(data.rdf).toEqual([]);
		// The per-URI refusals are PAYLOAD (`data.errors`), never the envelope's
		// failure channel — each one the error system's wire body, never the guard's
		// `Error.message`, which names the address a refused host resolved to.
		expect(data.errors).toHaveLength(1);
		expect(data.errors[0]?.uri).toBe('http://169.254.169.254/latest/meta-data.rdf');
		expect(data.errors[0]?.error.code).toBe('security.ssrf_blocked');
		const wire = JSON.stringify(publicPart(data.errors[0]?.error));
		expect(wire).not.toContain('169.254');
		expect(wire).not.toContain('ssrf:');
	});

	test('a NAME that resolves inward is reported without the address it resolved to', async () => {
		const loaded = await getLoadedTool('tool_import_rdf');
		const res = await mustGet(loaded!.module.apiActions.get_rdf_data, 'get_rdf_data').handler({
			principal: await resolvePrincipal(-1),
			userId: -1,
			background: false,
			options: { ar_values: ['http://localhost/vocab/term'] },
		});
		const data = res.data as { errors: { uri: string; error: { code: string } }[] };
		expect(data.errors[0]?.error.code).toBe('security.ssrf_blocked');
		const wire = JSON.stringify(publicPart(data.errors[0]?.error));
		for (const address of ['127.0.0.1', '::1']) expect(wire).not.toContain(address);
	});
});
