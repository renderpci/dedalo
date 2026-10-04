/**
 * Gate: the RDF/XML GRAPH reader (src/core/tools/rdf_graph.ts) tool_import_rdf
 * maps a remote linked-data answer with. Pure — no DB, no network: the OCRE-shaped
 * coin type is the repo-owned fixture test/fixtures/rdf/ocre_type.rdf, the rest
 * are inline documents built for the one rule each test pins.
 */

import { describe, expect, test } from 'bun:test';
import { isDedaloError } from '../../src/core/errors/index.ts';
import { parseRdfGraph, RDF_NS } from '../../src/core/tools/rdf_graph.ts';
import { parseRdfXml, parseXml } from '../../src/core/tools/rdf_xml.ts';

const TYPE_IRI = 'http://numismatics.org/ocre/id/ric.1(2).aug.1A';
const OCRE = await Bun.file(new URL('../fixtures/rdf/ocre_type.rdf', import.meta.url)).text();
const NMO = 'http://nomisma.org/ontology#';
/** The import ontology's prefixes — the SAME namespaces the document binds, under other names. */
const ONTOLOGY_XMLNS = {
	nm: NMO,
	skosc: 'http://www.w3.org/2004/02/skos/core#',
	dct: 'http://purl.org/dc/terms/',
	x: 'http://www.w3.org/2001/XMLSchema#',
};

const RDF_HEAD =
	'<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:ex="http://example.org/ns#">';

function rdf(body: string): string {
	return `<?xml version="1.0"?>${RDF_HEAD}${body}</rdf:RDF>`;
}

function thrownBy(fn: () => unknown): unknown {
	try {
		fn();
	} catch (error) {
		return error;
	}
	return null;
}

describe('rdf_graph — the OCRE coin type', () => {
	const graph = parseRdfGraph(OCRE, { baseIri: TYPE_IRI });

	test('typed node element emits rdf:type; typeOf shortens through the document prefixes', () => {
		expect(graph.typeOf(TYPE_IRI)).toBe('nmo:TypeSeriesItem');
		expect(graph.types(TYPE_IRI)).toEqual(['nmo:TypeSeriesItem']);
		expect(graph.objects(TYPE_IRI, `${RDF_NS}type`)).toEqual([
			{ kind: 'iri', value: `${NMO}TypeSeriesItem` },
		]);
	});

	test('literals per language; literal() picks the asked tag, untagged query finds none', () => {
		expect(graph.literal(TYPE_IRI, 'skos:prefLabel', { lang: 'es' })).toEqual({
			value: 'RIC I (segunda edición) Augusto 1A',
			lang: 'es',
		});
		expect(graph.literals(TYPE_IRI, 'skos:prefLabel').map((l) => l.lang)).toEqual([
			'en',
			'de',
			'es',
		]);
		expect(graph.literal(TYPE_IRI, 'skos:prefLabel', { lang: 'fr' })).toBeNull();
		expect(graph.literal(TYPE_IRI, 'skos:prefLabel', { lang: null })).toBeNull();
		expect(graph.literal(TYPE_IRI, 'skos:definition')?.value).toBe(
			'RIC I (second edition) Augustus 1A',
		);
	});

	test('typed literals carry a shortened datatype and no language', () => {
		expect(graph.literal(TYPE_IRI, 'nmo:hasStartDate')).toEqual({
			value: '-0025',
			datatype: 'xsd:gYear',
		});
		expect(graph.literal(TYPE_IRI, 'nmo:hasEndDate')).toEqual({
			value: '-0023',
			datatype: 'xsd:gYear',
		});
	});

	test('resources: linked terms are full IRIs', () => {
		expect(graph.resource(TYPE_IRI, 'nmo:hasMint')).toBe('http://nomisma.org/id/emerita');
		expect(graph.resource(TYPE_IRI, 'nmo:hasDenomination')).toBe('http://nomisma.org/id/quinarius');
		expect(graph.resource(TYPE_IRI, 'nmo:hasMaterial')).toBe('http://nomisma.org/id/ar');
		expect(graph.resource(TYPE_IRI, 'nmo:hasAuthority')).toBe('http://nomisma.org/id/augustus');
		expect(graph.resource(TYPE_IRI, 'nmo:hasIssuer')).toBe('http://nomisma.org/id/p_carisius');
		expect(graph.resources(TYPE_IRI, 'dcterms:source')).toEqual(['http://nomisma.org/id/ric']);
		// a literal is never a resource, a resource never a literal
		expect(graph.resources(TYPE_IRI, 'skos:prefLabel')).toEqual([]);
		expect(graph.literals(TYPE_IRI, 'nmo:hasMint')).toEqual([]);
		expect(graph.resource(TYPE_IRI, 'nmo:hasNothing')).toBeNull();
	});

	test('nested #obverse resolves against baseIri and becomes the object', () => {
		const obverse = graph.resource(TYPE_IRI, 'nmo:hasObverse');
		expect(obverse).toBe(`${TYPE_IRI}#obverse`);
		expect(graph.typeOf(`${TYPE_IRI}#obverse`)).toBe('nmo:ObverseType');
		expect(graph.literal(`${TYPE_IRI}#obverse`, 'nmo:hasLegend')).toEqual({ value: 'AVGVST' });
		expect(graph.literal(`${TYPE_IRI}#obverse`, 'dcterms:description', { lang: 'es' })?.value).toBe(
			'Cabeza desnuda de Augusto a derecha',
		);
		expect(graph.resource(`${TYPE_IRI}#obverse`, 'nmo:hasPortrait')).toBe(
			'http://nomisma.org/id/augustus',
		);
	});

	test('referenced #reverse (separate node) resolves to the same subject', () => {
		const reverse = graph.resource(TYPE_IRI, 'nmo:hasReverse');
		expect(reverse).toBe(`${TYPE_IRI}#reverse`);
		expect(graph.literal(reverse ?? '', 'nmo:hasLegend')?.value).toBe('P CARISI LEG');
		expect(graph.typeOf(reverse ?? '')).toBe('nmo:ReverseType');
	});

	test('without a baseIri the relative references stay relative', () => {
		const bare = parseRdfGraph(OCRE);
		expect(bare.resource(TYPE_IRI, 'nmo:hasObverse')).toBe('#obverse');
	});

	test('an external xmlns with OTHER prefixes expands and shortens first', () => {
		expect(graph.typeOf(TYPE_IRI, ONTOLOGY_XMLNS)).toBe('nm:TypeSeriesItem');
		expect(graph.resource(TYPE_IRI, 'nm:hasMint', ONTOLOGY_XMLNS)).toBe(
			'http://nomisma.org/id/emerita',
		);
		expect(
			graph.literal(TYPE_IRI, 'skosc:prefLabel', { lang: 'de', xmlns: ONTOLOGY_XMLNS })?.value,
		).toBe('RIC I (zweite Auflage) Augustus 1A');
		expect(graph.literal(TYPE_IRI, 'nm:hasStartDate', { xmlns: ONTOLOGY_XMLNS })?.datatype).toBe(
			'x:gYear',
		);
		// a prefixed SUBJECT expands too
		expect(graph.literal('dct:nothing', 'nm:hasLegend', { xmlns: ONTOLOGY_XMLNS })).toBeNull();
		// the external map wins over the document's binding of the same prefix
		const clash = { nmo: 'http://example.org/other#' };
		expect(graph.resource(TYPE_IRI, 'nmo:hasMint', clash)).toBeNull();
		expect(graph.expand('nmo:hasMint', clash)).toBe('http://example.org/other#hasMint');
		// unknown prefixes and absolute IRIs are left as written
		expect(graph.expand('zz:thing')).toBe('zz:thing');
		expect(graph.expand('http://nomisma.org/id/ar')).toBe('http://nomisma.org/id/ar');
		expect(graph.shorten('http://unbound.example/x')).toBe('http://unbound.example/x');
	});

	test('typeOf among: compared as full IRIs whatever the prefix', () => {
		expect(graph.typeOf(TYPE_IRI, ONTOLOGY_XMLNS, ['nm:Mint', 'nm:TypeSeriesItem'])).toBe(
			'nm:TypeSeriesItem',
		);
		expect(graph.typeOf(TYPE_IRI, ONTOLOGY_XMLNS, ['nm:Mint'])).toBeNull();
	});

	test('document namespaces are reported; subjects are listed', () => {
		expect(graph.namespaces.nmo).toBe(NMO);
		expect(graph.subjects()).toContain(TYPE_IRI);
		expect(graph.subjects()).toContain(`${TYPE_IRI}#obverse`);
		expect(graph.subjects()).toContain(`${TYPE_IRI}#reverse`);
	});
});

describe('rdf_graph — syntax forms', () => {
	test('rdf:type property vs typed node: same triple', () => {
		const typed = parseRdfGraph(rdf('<ex:Mint rdf:about="http://x/m"/>'));
		const described = parseRdfGraph(
			rdf(
				'<rdf:Description rdf:about="http://x/m"><rdf:type rdf:resource="http://example.org/ns#Mint"/></rdf:Description>',
			),
		);
		const attr = parseRdfGraph(
			rdf('<rdf:Description rdf:about="http://x/m" rdf:type="http://example.org/ns#Mint"/>'),
		);
		for (const g of [typed, described, attr]) expect(g.typeOf('http://x/m')).toBe('ex:Mint');
		// rdf:Description itself is not a type
		expect(described.types('http://x/m')).toEqual(['ex:Mint']);
	});

	test('blank nodes: nested anonymous node, rdf:nodeID, parseType Resource', () => {
		const g = parseRdfGraph(
			rdf(`<rdf:Description rdf:about="http://x/s">
				<ex:anon><ex:Thing><ex:name>inner</ex:name></ex:Thing></ex:anon>
				<ex:named rdf:nodeID="n1"/>
				<ex:res rdf:parseType="Resource"><ex:name>res</ex:name></ex:res>
			</rdf:Description>
			<rdf:Description rdf:nodeID="n1"><ex:name>by id</ex:name></rdf:Description>`),
		);
		const anon = g.resource('http://x/s', 'ex:anon') ?? '';
		expect(anon.startsWith('_:')).toBe(true);
		expect(g.typeOf(anon)).toBe('ex:Thing');
		expect(g.literal(anon, 'ex:name')?.value).toBe('inner');
		expect(g.objects('http://x/s', 'ex:named')).toEqual([{ kind: 'bnode', value: '_:n1' }]);
		expect(g.literal('_:n1', 'ex:name')?.value).toBe('by id');
		const res = g.resource('http://x/s', 'ex:res') ?? '';
		expect(res.startsWith('_:')).toBe(true);
		expect(res).not.toBe(anon);
		expect(g.literal(res, 'ex:name')?.value).toBe('res');
	});

	test('property attributes, empty property elements with attributes, rdf:ID, rdf:li', () => {
		const g = parseRdfGraph(
			rdf(`<rdf:Description rdf:ID="local" ex:title="attr title" xml:lang="it">
				<ex:link rdf:resource="http://x/r" ex:label="on r"/>
				<ex:bag><rdf:Bag><rdf:li>a</rdf:li><rdf:li>b</rdf:li></rdf:Bag></ex:bag>
				<ex:empty/>
			</rdf:Description>`),
			{ baseIri: 'http://x/doc#frag' },
		);
		const s = 'http://x/doc#local';
		expect(g.literal(s, 'ex:title')).toEqual({ value: 'attr title', lang: 'it' });
		expect(g.resource(s, 'ex:link')).toBe('http://x/r');
		expect(g.literal('http://x/r', 'ex:label')?.value).toBe('on r');
		const bag = g.resource(s, 'ex:bag') ?? '';
		expect(g.literal(bag, `${RDF_NS}_1`)?.value).toBe('a');
		expect(g.literal(bag, 'rdf:_2')?.value).toBe('b');
		expect(g.literal(s, 'ex:empty')).toEqual({ value: '', lang: 'it' });
	});

	test('parseType Literal keeps the markup as rdf:XMLLiteral; Collection builds a list', () => {
		const g = parseRdfGraph(
			rdf(`<rdf:Description rdf:about="http://x/s">
				<ex:xml rdf:parseType="Literal"><b class="q">bold &amp; co</b></ex:xml>
				<ex:list rdf:parseType="Collection"><rdf:Description rdf:about="http://x/1"/><rdf:Description rdf:about="http://x/2"/></ex:list>
			</rdf:Description>`),
		);
		expect(g.literal('http://x/s', 'ex:xml')).toEqual({
			value: '<b class="q">bold &amp; co</b>',
			datatype: 'rdf:XMLLiteral',
		});
		const head = g.resource('http://x/s', 'ex:list') ?? '';
		expect(g.resource(head, 'rdf:first')).toBe('http://x/1');
		const second = g.resource(head, 'rdf:rest') ?? '';
		expect(g.resource(second, 'rdf:first')).toBe('http://x/2');
		expect(g.resource(second, 'rdf:rest')).toBe(`${RDF_NS}nil`);
	});

	test('scoped xmlns (incl. default namespace), xml:base, inherited and reset xml:lang', () => {
		const g = parseRdfGraph(`<?xml version="1.0"?>
			<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xml:lang="en" xml:base="http://base.example/dir/">
				<Mint xmlns="http://nomisma.org/ontology#" rdf:about="emerita">
					<hasLegend>EMERITA</hasLegend>
					<p:label xmlns:p="http://example.org/p#" xml:lang="">no lang</p:label>
					<p:other xmlns:p="http://example.org/q#" rdf:resource="../up"/>
				</Mint>
				<rdf:Description rdf:about="#frag"><nolabel xmlns="http://example.org/d#">plain</nolabel></rdf:Description>
			</rdf:RDF>`);
		const s = 'http://base.example/dir/emerita';
		expect(g.typeOf(s, { nmo: NMO })).toBe('nmo:Mint');
		expect(g.literal(s, `${NMO}hasLegend`)).toEqual({ value: 'EMERITA', lang: 'en' });
		expect(g.literal(s, 'http://example.org/p#label')).toEqual({ value: 'no lang' });
		// the same prefix bound differently on a sibling: scope, not leakage
		expect(g.resource(s, 'http://example.org/q#other')).toBe('http://base.example/up');
		expect(g.resource(s, 'http://example.org/p#other')).toBeNull();
		expect(g.literal('http://base.example/dir/#frag', 'http://example.org/d#nolabel')?.value).toBe(
			'plain',
		);
		// first declaration of a prefix wins in the document map
		expect(g.namespaces.p).toBe('http://example.org/p#');
	});

	test('a lone node element without rdf:RDF is a graph too; non-RDF input is empty', () => {
		const g = parseRdfGraph(
			'<ex:Mint xmlns:ex="http://example.org/ns#" xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" rdf:about="http://x/m"/>',
		);
		expect(g.typeOf('http://x/m')).toBe('ex:Mint');
		expect(parseRdfGraph('not xml at all').triples).toEqual([]);
		expect(parseRdfGraph('').subjects()).toEqual([]);
	});

	test('language matching: exact first, primary tag reaches regional variants, null = untagged', () => {
		const g = parseRdfGraph(
			rdf(`<rdf:Description rdf:about="http://x/s">
				<ex:l xml:lang="en-GB">colour</ex:l><ex:l xml:lang="EN">color</ex:l><ex:l>bare</ex:l>
			</rdf:Description>`),
		);
		expect(g.literal('http://x/s', 'ex:l', { lang: 'en' })?.value).toBe('color');
		expect(g.literals('http://x/s', 'ex:l', { lang: 'en' }).map((l) => l.value)).toEqual([
			'colour',
			'color',
		]);
		expect(g.literals('http://x/s', 'ex:l', { lang: 'en-gb' }).map((l) => l.value)).toEqual([
			'colour',
		]);
		expect(g.literal('http://x/s', 'ex:l', { lang: null })).toEqual({ value: 'bare' });
		expect(g.literals('http://x/s', 'ex:l')).toHaveLength(3);
	});

	test('object prototype names are not prefixes', () => {
		const g = parseRdfGraph(rdf('<ex:Mint rdf:about="http://x/m"/>'));
		expect(g.expand('constructor:x')).toBe('constructor:x');
		expect(g.typeOf('http://x/m', {})).toBe('ex:Mint');
	});

	test('a typed literal drops the in-scope xml:lang', () => {
		const g = parseRdfGraph(
			rdf(`<rdf:Description rdf:about="http://x/s" xml:lang="en">
				<ex:d rdf:datatype="http://www.w3.org/2001/XMLSchema#date">2020-01-01</ex:d>
			</rdf:Description>`),
		);
		expect(g.literal('http://x/s', 'ex:d')).toEqual({ value: '2020-01-01', datatype: 'xsd:date' });
	});

	test('an absolute IRI is never expanded, even when its scheme is a mapped prefix', () => {
		const g = parseRdfGraph(rdf('<ex:Mint rdf:about="http://x/m"/>'));
		expect(g.expand('http://nomisma.org/id/ar', { http: 'http://example.org/wrong#' })).toBe(
			'http://nomisma.org/id/ar',
		);
	});

	test('shorten picks the LONGEST covering namespace of a map', () => {
		const g = parseRdfGraph(rdf('<ex:Mint rdf:about="http://x/m"/>'));
		const xmlns = { a: 'http://example.org/', b: 'http://example.org/ns#' };
		expect(g.shorten('http://example.org/ns#Mint', xmlns)).toBe('b:Mint');
		expect(g.typeOf('http://x/m', xmlns)).toBe('b:Mint');
	});

	test('rdf:about="" is the base itself, verbatim (fragment dropped, never URL-normalised)', () => {
		// The import matches the document's subject against the IRI the cataloguer
		// gave: a normalised base (host case, escaped space) would miss it.
		const base = 'http://Example.org/a b#frag';
		const g = parseRdfGraph(rdf('<ex:Mint rdf:about=""/>'), { baseIri: base });
		expect(g.subjects()).toEqual(['http://Example.org/a b']);
	});

	test('subjects: a prefixed name expands, a stored subject is matched verbatim first', () => {
		const g = parseRdfGraph(
			rdf(`<rdf:Description rdf:about="http://example.org/ns#thing"><ex:n>full</ex:n></rdf:Description>
			<rdf:Description rdf:about="ex:raw"><ex:n>raw</ex:n></rdf:Description>`),
		);
		expect(g.literal('ex:thing', 'ex:n')?.value).toBe('full');
		expect(g.literal('ex:raw', 'ex:n')?.value).toBe('raw');
	});

	test('a blank-node rdf:type is not a type name', () => {
		const g = parseRdfGraph(
			rdf(`<rdf:Description rdf:about="http://x/s">
				<rdf:type rdf:nodeID="t"/><rdf:type rdf:resource="http://example.org/ns#Mint"/>
			</rdf:Description>`),
		);
		expect(g.types('http://x/s')).toEqual(['ex:Mint']);
		expect(g.typeOf('http://x/s')).toBe('ex:Mint');
	});
});

describe('rdf_graph — bounds and hostile input', () => {
	test('nesting past maxDepth throws tool.rdf_graph_too_large', () => {
		let body = '<ex:leaf>x</ex:leaf>';
		for (let i = 0; i < 20; i += 1) body = `<ex:p><ex:N>${body}</ex:N></ex:p>`;
		const doc = rdf(`<ex:N rdf:about="http://x/root">${body}</ex:N>`);
		expect(parseRdfGraph(doc, { maxDepth: 64 }).triples.length).toBeGreaterThan(20);
		const error = thrownBy(() => parseRdfGraph(doc, { maxDepth: 10 }));
		expect(isDedaloError(error) && error.code).toBe('tool.rdf_graph_too_large');
		expect(isDedaloError(error) && error.details).toEqual({ limit: 10 });
		expect(isDedaloError(error) && error.coordinates).toEqual({ bound: 'depth' });
	});

	test('a deep parseType Literal is bounded too (no stack overflow)', () => {
		const deep = `${'<i>'.repeat(5000)}x${'</i>'.repeat(5000)}`;
		const error = thrownBy(() =>
			parseRdfGraph(
				rdf(
					`<rdf:Description rdf:about="http://x/s"><ex:x rdf:parseType="Literal">${deep}</ex:x></rdf:Description>`,
				),
			),
		);
		expect(isDedaloError(error) && error.code).toBe('tool.rdf_graph_too_large');
	});

	test('more statements than maxTriples throws; exactly maxTriples passes', () => {
		const props = Array.from({ length: 5 }, (_, i) => `<ex:p>${i}</ex:p>`).join('');
		const doc = rdf(`<rdf:Description rdf:about="http://x/s">${props}</rdf:Description>`);
		expect(parseRdfGraph(doc, { maxTriples: 5 }).literals('http://x/s', 'ex:p')).toHaveLength(5);
		const error = thrownBy(() => parseRdfGraph(doc, { maxTriples: 4 }));
		expect(isDedaloError(error) && error.code).toBe('tool.rdf_graph_too_large');
		expect(isDedaloError(error) && error.coordinates).toEqual({ bound: 'triples' });
	});

	test('a numeric reference past U+10FFFF stays verbatim instead of crashing (RangeError)', () => {
		const doc = rdf(
			'<rdf:Description rdf:about="http://x/s"><ex:t>a&#x110000;b&#1114112;c&#x10FFFF;</ex:t></rdf:Description>',
		);
		expect(parseRdfGraph(doc).literal('http://x/s', 'ex:t')?.value).toBe(
			`a&#x110000;b&#1114112;c${String.fromCodePoint(0x10ffff)}`,
		);
		// the shared XML reader and the zotero subject list survive it too
		expect(() => parseXml('<a t="&#x7FFFFFFF;">&#99999999999;</a>')).not.toThrow();
		expect(parseRdfXml(doc).subjects[0]?.properties[0]?.value).toBe(
			`a&#x110000;b&#1114112;c${String.fromCodePoint(0x10ffff)}`,
		);
		// in-range references still decode
		expect(parseXml('<a>&#x41;&#66;&amp;</a>').children[0]).toMatchObject({ children: ['AB&'] });
	});
});
