/**
 * R2 gate: tool_import_rdf. The RDF/XML parser and the class-map are covered by
 * rdf_xml.test.ts / rdf_map.test.ts; this file gates the TOOL — its action
 * surface, the argument validation, and what it reports when the shared SSRF
 * guard (`fetchGuardedText`) refuses a URI (SEC-072). The guard itself is gated in
 * ssrf_guard.test.ts and ssrf_one_guard_tripwire.test.ts.
 *
 * Network-free by construction: a refused URI never reaches fetch(), so every
 * assertion here runs credless and offline.
 */
// Migrated to the generic `test` TLD 2026-08-19: the sectionTipos extractor is pure, so
// its ontology tipo and locator are opaque — they now name generic `test` nodes.

import { describe, expect, test } from 'bun:test';
import { resolvePrincipal } from '../../src/core/security/permissions.ts';
import type { AddressLookup } from '../../src/core/security/ssrf_guard.ts';
import { getLoadedTool } from '../../src/core/tools/loader.ts';
import { loadRdf, type RdfOutcome } from '../../tools/tool_import_rdf/server/index.ts';
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

/**
 * THE DOOR'S OWN WIRE on a transport failure (WC-2026-09-30-guarded-text-pinned-typed-transport):
 * the per-URI `error` is the registry body of `security.outbound_failed` — category
 * `unavailable`, retryable, the registry's fixed sentence — never `internal.unexpected`
 * and never a host, an address or Bun's own text. Built through the guard's seam (a
 * public answer for the name, a socket that fails), so it runs offline; the primitive's
 * typing is gated in guarded_text_pin_native, this is the door publishing it.
 */
describe('tool_import_rdf: a transport failure is published as the typed registry body', () => {
	const PUBLIC: AddressLookup = async () => [{ address: '93.184.216.34', family: 4 }];

	function failureOf(outcome: RdfOutcome): {
		code: string;
		category: string;
		retryable: boolean;
		message: string;
	} {
		expect(outcome.kind).toBe('failed');
		if (outcome.kind !== 'failed') throw new Error('loaded');
		return outcome.failure.error as unknown as ReturnType<typeof failureOf>;
	}

	test('a refused connection: security.outbound_failed, unavailable, retryable, no host or runtime text', async () => {
		const outcome = await loadRdf('https://vocab.example.test/term/1', [], {
			lookup: PUBLIC,
			fetch: async () => {
				throw Object.assign(
					new TypeError('Unable to connect. Is the computer able to access the url?'),
					{
						code: 'ConnectionRefused',
					},
				);
			},
		});
		const body = failureOf(outcome);
		expect(outcome.kind === 'failed' && outcome.failure.uri).toBe(
			'https://vocab.example.test/term/1.rdf',
		);
		expect(body.code).toBe('security.outbound_failed');
		expect(body.category).toBe('unavailable');
		expect(body.retryable).toBe(true);
		expect(body.message).toBe('The outbound request could not be completed');
		const wire = JSON.stringify(publicPart(body));
		for (const leak of ['vocab.example.test', '93.184.216.34', 'Unable to connect', 'hop connect'])
			expect(wire, leak).not.toContain(leak);
	});

	test('a redirect is the same typed body — refused, never followed', async () => {
		let calls = 0;
		const outcome = await loadRdf('https://vocab.example.test/term/2', [], {
			lookup: PUBLIC,
			fetch: async () => {
				calls += 1;
				return new Response(null, { status: 303, headers: { location: 'http://127.0.0.1/' } });
			},
		});
		expect(failureOf(outcome).code).toBe('security.outbound_failed');
		expect(calls).toBe(1);
	});
});
