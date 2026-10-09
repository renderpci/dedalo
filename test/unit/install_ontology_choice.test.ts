/**
 * INSTALL ONTOLOGY CHOICE — the pure half of the installer's domain-ontology
 * door (src/core/install/ontology_choice.ts; installer unification A4/A5/A6).
 *
 * WHAT IS MEASURED (outcomes over built catalogs — zzoc scratch TLDs, never a
 * real domain ontology's structure):
 *  - the answer: default / explicit / core dropped with a note / none and
 *    non-TLD refused;
 *  - the closure over DECLARED dependencies: deps-first post-order,
 *    transitivity, cycles tolerated, core and the engine-owned TLD never
 *    followed, an undeclared entry warned (installed alone), a missing
 *    dependency and an unknown TLD refused with their exact texts;
 *  - precedence local > vendored > server (and the merge is idempotent);
 *  - the ONE view (describeOntologyCatalog): fixed TLDs excluded, default
 *    first, note keys, also_installs;
 *  - ACTIVE_ONTOLOGY_TLDS ↔ request round trip (the wizard path);
 *  - the vendored catalog is exactly `oh`, its declared dependencies are core,
 *    and the offline default request installs it alone.
 * Hermetic: no database, no network.
 */

import { describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import {
	activeOntologyTldsOf,
	closeOntologyChoice,
	DEFAULT_DOMAIN_ONTOLOGIES,
	defaultOfflineOntologyRequest,
	describeOntologyCatalog,
	mergeOntologyCatalogs,
	normalizeOntologyChoice,
	type OntologyCatalog,
	type OntologyCatalogEntry,
	type OntologyOrigin,
	ontologyCatalogNeeded,
	ontologyInstallRequest,
	ontologyRequestFromActive,
	VENDORED_DOMAIN_ONTOLOGIES,
	vendoredOntologyCatalog,
} from '../../src/core/install/ontology_choice.ts';
import { CORE_ONTOLOGY_TLDS } from '../../src/core/ontology/core_tlds.ts';
import { ENGINE_TLD } from '../../src/core/ontology/engine_ontology.ts';

const SERVER = {
	kind: 'server' as const,
	server: { name: 'zzoc stand-in', url: 'http://127.0.0.1:1/api', code: 'c' },
};
const LABEL = "the ontology server 'zzoc stand-in'";

function entry(
	tld: string,
	dependencies: string[] | null,
	origin: OntologyOrigin = 'server',
	typologyName: string | null = 'Catalog',
): OntologyCatalogEntry {
	return {
		tld,
		name: `${tld} name`,
		name_data: null,
		typology_id: 8,
		typology_name: typologyName,
		dependencies,
		origin,
		file: `http://127.0.0.1:1/files/${tld}.copy.gz`,
	};
}

function catalog(
	entries: OntologyCatalogEntry[],
	extra: Partial<OntologyCatalog> = {},
): OntologyCatalog {
	return { source: SERVER, entries, matrixDd: null, warnings: [], ...extra };
}

const CHAIN = catalog([
	entry('zzoca', ['dd', 'zzocb', 'zzoca']),
	entry('zzocb', ['zzocc', 'rsc']),
	entry('zzocc', []),
	entry('zzocx', ['zzocy']),
	entry('zzocy', ['zzocx', ENGINE_TLD]),
	entry('zzocu', null),
	entry('zzocm', ['zzocmissing']),
]);

describe('the answer (normalizeOntologyChoice)', () => {
	test('absent / default → the default set; explicit lists normalized', () => {
		expect(DEFAULT_DOMAIN_ONTOLOGIES).toEqual(['oh']);
		expect(normalizeOntologyChoice(undefined).ontologies).toEqual(['oh']);
		expect(normalizeOntologyChoice('default').ontologies).toEqual(['oh']);
		expect(normalizeOntologyChoice(' oh, TCH ,oh').ontologies).toEqual(['oh', 'tch']);
		expect(normalizeOntologyChoice(['zzocb', 'zzoca']).ontologies).toEqual(['zzocb', 'zzoca']);
	});

	test('a core TLD is dropped with a note; none / empty / only-core refused', () => {
		const withCore = normalizeOntologyChoice('dd,oh');
		expect(withCore.ontologies).toEqual(['oh']);
		expect(withCore.notes).toEqual([
			'dd is a core ontology (always installed) — dropped from the list',
		]);
		const none = 'at least one domain ontology is required (the default is oh)';
		for (const value of ['none', '', [], 'dd']) {
			expect(normalizeOntologyChoice(value).errors, JSON.stringify(value)).toEqual([none]);
		}
		expect(normalizeOntologyChoice('o-h').errors).toEqual(["ontologies: 'o-h' is not a TLD"]);
	});
});

describe('the closure (closeOntologyChoice)', () => {
	test('deps first, transitive, core + self + engine-owned never followed', () => {
		const closure = closeOntologyChoice(['zzoca'], CHAIN);
		// floor: the walk really visited the chain (the empty-list verdicts below are not vacuous)
		expect(closure.order.length).toBeGreaterThan(2);
		expect(closure.order).toEqual(['zzocc', 'zzocb', 'zzoca']);
		expect(closure.notes).toEqual(['zzoca also installs: zzocc, zzocb']);
		expect(closure.errors).toEqual([]);
		expect(closure.warnings).toEqual([]);
	});

	test('a cycle is tolerated (first finish wins), the engine-owned TLD skipped', () => {
		const closure = closeOntologyChoice(['zzocx'], CHAIN);
		expect(closure.order).toEqual(['zzocy', 'zzocx']);
		expect(closure.errors).toEqual([]);
	});

	test('undeclared → installed alone with the loud warning', () => {
		const closure = closeOntologyChoice(['zzocu'], CHAIN);
		expect(closure.order).toEqual(['zzocu']);
		expect(closure.warnings).toEqual([
			"the ontology source declares no dependencies for 'zzocu' (an older ontology server) — 'zzocu' is installed alone; anything it references in other ontologies stays unresolved",
		]);
	});

	test('a missing dependency and an unknown TLD are errors, named with the source', () => {
		expect(closeOntologyChoice(['zzocm'], CHAIN).errors).toEqual([
			`'zzocmissing', declared as a dependency of 'zzocm', is not offered by ${LABEL}`,
		]);
		expect(closeOntologyChoice(['zzocq'], CHAIN).errors).toEqual([
			`unknown ontology 'zzocq' — not offered by ${LABEL}`,
		]);
		const offline = closeOntologyChoice(['tch'], vendoredOntologyCatalog());
		expect(offline.errors).toEqual([
			"unknown ontology 'tch' — not offered by the built-in set (air-gapped: only oh is available offline)",
		]);
	});

	test('a shared dependency is installed once, before both', () => {
		const shared = catalog([
			entry('zzocp', ['zzocs']),
			entry('zzocr', ['zzocs']),
			entry('zzocs', []),
		]);
		expect(closeOntologyChoice(['zzocp', 'zzocr'], shared).order).toEqual([
			'zzocs',
			'zzocp',
			'zzocr',
		]);
	});
});

describe('precedence and the merge', () => {
	test('local > vendored > server, per TLD; idempotent', () => {
		const vendored = catalog([entry('oh', ['dd'], 'vendored')], { source: { kind: 'none' } });
		const server = catalog([entry('oh', ['dd', 'zzocb'], 'server'), entry('zzocb', [], 'server')]);
		const merged = mergeOntologyCatalogs(server, vendored);
		expect(merged.entries.find((item) => item.tld === 'oh')?.origin).toBe('vendored');
		expect(merged.entries.find((item) => item.tld === 'zzocb')?.origin).toBe('server');
		expect(merged.source).toEqual(SERVER);
		expect(mergeOntologyCatalogs(merged, vendored)).toEqual(merged);
		const local = catalog([entry('oh', [], 'local')], { source: { kind: 'local', path: '/x' } });
		expect(mergeOntologyCatalogs(local, vendored).entries[0]?.origin).toBe('local');
		expect(mergeOntologyCatalogs(undefined, vendored)).toBe(vendored);
	});

	test('the catalog is needed for a local source or a non-vendored TLD — never offline', () => {
		expect(ontologyCatalogNeeded(['oh'], SERVER)).toBe(false);
		expect(ontologyCatalogNeeded(['oh', 'tch'], SERVER)).toBe(true);
		expect(ontologyCatalogNeeded(['oh'], { kind: 'local', path: '/x' })).toBe(true);
		expect(ontologyCatalogNeeded(['tch'], { kind: 'none' })).toBe(false);
	});
});

describe('the one view (describeOntologyCatalog)', () => {
	test('fixed TLDs excluded, default first, then typology, then tld; notes and also_installs', () => {
		const view = describeOntologyCatalog(
			catalog([
				entry('dd', null),
				entry(ENGINE_TLD, null),
				entry('zzocz', [], 'server', 'Alpha'),
				entry('tch', ['zzocz'], 'server', 'Catalog'),
				entry('oh', CORE_ONTOLOGY_TLDS.slice(), 'vendored', 'Catalog'),
				entry('zzock', null, 'server', null),
			]),
		);
		expect(view.entries.map((item) => item.tld)).toEqual(['oh', 'zzocz', 'tch', 'zzock']);
		expect(view.default).toEqual(['oh']);
		expect(view.core).toEqual([...CORE_ONTOLOGY_TLDS]);
		const byTld = new Map(view.entries.map((item) => [item.tld, item]));
		expect(byTld.get('oh')?.is_default).toBe(true);
		expect(byTld.get('oh')?.note_key).toBe('installation_ontology_note_oh');
		expect(byTld.get('tch')?.note_key).toBe('installation_ontology_note_tch');
		expect(byTld.get('tch')?.is_default).toBe(false);
		expect(byTld.get('tch')?.also_installs).toEqual(['zzocz']);
		expect(byTld.get('zzock')?.dependencies).toBeNull();
		expect(view.source).toEqual({
			kind: 'server',
			server: { name: 'zzoc stand-in', url: SERVER.server.url },
		});
	});
});

describe('the request and ACTIVE_ONTOLOGY_TLDS', () => {
	test('ACTIVE = core + install order, and it round-trips to the same request', () => {
		const order = closeOntologyChoice(['zzoca'], CHAIN).order;
		const active = activeOntologyTldsOf(order);
		expect(active).toEqual([...CORE_ONTOLOGY_TLDS, 'zzocc', 'zzocb', 'zzoca']);
		const back = ontologyRequestFromActive(active, CHAIN);
		expect(back.errors).toEqual([]);
		expect(back.request).toEqual(ontologyInstallRequest(order, CHAIN));
	});

	test('an ACTIVE list missing a declared dependency is refused, never extended', () => {
		const back = ontologyRequestFromActive([...CORE_ONTOLOGY_TLDS, 'zzoca'], CHAIN);
		expect(back.request).toBeNull();
		expect(back.errors[0]).toContain('ACTIVE_ONTOLOGY_TLDS lacks zzocc, zzocb');
		expect(ontologyRequestFromActive([...CORE_ONTOLOGY_TLDS], CHAIN).errors).toEqual([
			'at least one domain ontology is required (the default is oh)',
		]);
	});

	test('matrix_dd travels only with an item of its own origin', () => {
		const withLists = catalog([entry('zzocc', []), entry('oh', [], 'vendored')], {
			matrixDd: { origin: 'server', file: 'http://127.0.0.1:1/files/matrix_dd.copy.gz' },
		});
		expect(ontologyInstallRequest(['zzocc'], withLists).matrixDd?.origin).toBe('server');
		expect(ontologyInstallRequest(['oh'], withLists).matrixDd).toBeNull();
	});
});

describe('the vendored catalog', () => {
	test('exactly oh, from its one file, its declared dependencies the core', () => {
		expect(VENDORED_DOMAIN_ONTOLOGIES.map((item) => item.tld)).toEqual(['oh']);
		const vendored = vendoredOntologyCatalog();
		expect(vendored.entries.length).toBeGreaterThan(0);
		expect(vendored.warnings).toEqual([]);
		expect(vendored.entries.map((item) => item.tld)).toEqual(['oh']);
		const oh = vendored.entries[0] as OntologyCatalogEntry;
		expect(oh.origin).toBe('vendored');
		expect(existsSync(oh.file)).toBe(true);
		expect(oh.file.endsWith('/oh.copy.gz')).toBe(true);
		expect(oh.dependencies).toEqual([...CORE_ONTOLOGY_TLDS]);
		expect(oh.name).not.toBe('oh'); // the metadata really came from the vendored ontology.json
	});

	test('the offline default request installs the vendored oh alone', () => {
		const request = defaultOfflineOntologyRequest();
		expect(request.items.map((item) => [item.tld, item.origin])).toEqual([['oh', 'vendored']]);
		expect(request.matrixDd).toBeNull();
		expect(request.source).toEqual({ kind: 'none' });
	});
});
