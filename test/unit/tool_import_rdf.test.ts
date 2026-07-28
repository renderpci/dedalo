/**
 * R2 gate: tool_import_rdf. The RDF/XML parser and the class-map are covered by
 * rdf_xml.test.ts / rdf_map.test.ts; this file gates the TOOL — its action
 * surface, the argument validation, and the SSRF guard that decides which URIs
 * the server will dereference on the caller's behalf (SEC-072).
 *
 * The guard tests are network-free by construction: a refused URI never reaches
 * fetch(), so every assertion here runs credless and offline.
 */

import { describe, expect, test } from 'bun:test';
import { resolvePrincipal } from '../../src/core/security/permissions.ts';
import { getLoadedTool } from '../../src/core/tools/loader.ts';
import { isSafeRemoteUrl } from '../../tools/tool_import_rdf/server/index.ts';
import { mustGet } from '../helpers/assert.ts';

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
				ontology_tipo: 'numisdata1129',
				ar_values: ['http://viaf.org/viaf/1'],
				locator: { section_tipo: 'rsc205', section_id: 1 },
			}),
		).toEqual(['rsc205']);
		// No locator → no target → the 'section_list' gate denies (fail-closed).
		expect(spec.sectionTipos?.({ ar_values: [] })).toEqual([]);
	});

	test('an empty ar_values is refused before any fetch', async () => {
		const loaded = await getLoadedTool('tool_import_rdf');
		const res = await mustGet(loaded!.module.apiActions.get_rdf_data, 'get_rdf_data').handler({
			principal: await resolvePrincipal(-1),
			userId: -1,
			background: false,
			options: { ar_values: [] },
		});
		expect(res.result).toBe(false);
		expect(res.msg).toContain('Missing ar_values');
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
		expect(res.result).toEqual([]);
		expect(res.errors).toEqual([
			'SEC-072: refused unsafe RDF URI: http://169.254.169.254/latest/meta-data.rdf',
		]);
	});
});

describe('isSafeRemoteUrl (SEC-072 literal-host guard)', () => {
	test('accepts ordinary public http(s) RDF URIs', () => {
		expect(isSafeRemoteUrl('http://viaf.org/viaf/12345.rdf')).toBe(true);
		expect(isSafeRemoteUrl('https://d-nb.info/gnd/118540238/about/lds.rdf')).toBe(true);
		expect(isSafeRemoteUrl('https://8.8.8.8/x.rdf')).toBe(true);
	});

	test('refuses non-http schemes (file/gopher/ftp are the classic SSRF pivots)', () => {
		expect(isSafeRemoteUrl('file:///etc/passwd')).toBe(false);
		expect(isSafeRemoteUrl('gopher://127.0.0.1:11211/_stats')).toBe(false);
		expect(isSafeRemoteUrl('not a url')).toBe(false);
	});

	test('refuses the WHOLE loopback range, not just 127.0.0.1', () => {
		// The pre-audit guard listed four literals; every address below reached a
		// local service through it.
		expect(isSafeRemoteUrl('http://127.0.0.1/x')).toBe(false);
		expect(isSafeRemoteUrl('http://127.0.0.2/x')).toBe(false);
		expect(isSafeRemoteUrl('http://127.1.2.3:8080/x')).toBe(false);
		expect(isSafeRemoteUrl('http://0.0.0.0/x')).toBe(false);
		expect(isSafeRemoteUrl('http://[::1]/x')).toBe(false);
		expect(isSafeRemoteUrl('http://[::]/x')).toBe(false);
		expect(isSafeRemoteUrl('http://[::ffff:127.0.0.1]/x')).toBe(false);
	});

	test('refuses every private / link-local / CGNAT / multicast literal', () => {
		expect(isSafeRemoteUrl('http://10.0.0.5/x')).toBe(false);
		expect(isSafeRemoteUrl('http://172.16.0.1/x')).toBe(false);
		expect(isSafeRemoteUrl('http://172.31.255.254/x')).toBe(false);
		expect(isSafeRemoteUrl('http://192.168.1.1/x')).toBe(false);
		expect(isSafeRemoteUrl('http://169.254.169.254/latest/meta-data')).toBe(false);
		expect(isSafeRemoteUrl('http://100.64.0.1/x')).toBe(false);
		expect(isSafeRemoteUrl('http://239.255.255.250/x')).toBe(false);
		expect(isSafeRemoteUrl('http://[fd00::1]/x')).toBe(false);
		expect(isSafeRemoteUrl('http://[fe80::1]/x')).toBe(false);
		// 172.15 / 172.32 are PUBLIC — the range must not be over-refused.
		expect(isSafeRemoteUrl('http://172.15.0.1/x')).toBe(true);
		expect(isSafeRemoteUrl('http://172.32.0.1/x')).toBe(true);
	});

	test('refuses alternate spellings of a local address', () => {
		// 2130706433 === 127.0.0.1; 0x7f000001 the same in hex.
		expect(isSafeRemoteUrl('http://2130706433/x')).toBe(false);
		expect(isSafeRemoteUrl('http://0x7f000001/x')).toBe(false);
		expect(isSafeRemoteUrl('http://anything.localhost/x')).toBe(false);
		expect(isSafeRemoteUrl('http://LOCALHOST/x')).toBe(false);
	});
});
