/**
 * RDF + XML file writers — P3 final slice gates (DIFFUSION_PLAN D3-P3;
 * DIFFUSION_SPEC §4.3 "rdf / xml: one deterministic file per record;
 * close() does type-aware merge + ZIP"):
 *
 * - rdf: per-record file name pinned BYTE-EQUAL to the delete-side grammar
 *   (sanitizeRdfFileName vs the imported diffusion_delete.ts
 *   sanitizePublishedFileName — the two verbatim ports must never drift),
 *   EasyRdf envelope/namespace/indent fragments pinned against a REAL
 *   PHP-published file (media_monedaiberica/rdf/nomisma/
 *   nmonumismaticobject-numisdata4-1-*.rdf), xml:lang alpha2 literals, null
 *   column omission, rdf:about override, unknown-prefix loudness, legacy
 *   '{base}_*.rdf' removal, merge+zip products, abort cleanup;
 * - xml: {section_tipo}_{section_id}.xml delete-side grammar, PHP
 *   sanitize_xml_node_name port, per-lang children vs nolan inline, merged
 *   document under the first root, zip;
 * - both: well-formed XML (hand tokenizer — no DOM in bun:test), open()
 *   rejects non-files targets loudly, registry lookups, determinism
 *   (re-render byte-identical, no wall-clock).
 *
 * ALL paths live under a per-process temp root injected via the documented
 * DEDALO_DIFFUSION_FILES_ROOT override (files.ts) — the real media tree is
 * NEVER touched (the real published fixtures above are READ as pinned
 * string fragments only, copied here verbatim).
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { sanitizePublishedFileName } from '../../src/core/diffusion_bridge/diffusion_delete.ts';
import type { FieldPlan, PublicationPlan, SectionPlan } from '../../src/diffusion/plan/types.ts';
import type { ProjectedRow } from '../../src/diffusion/project/lang_ladder.ts';
import {
	CONSOLIDATED_MERGED_PREFIX,
	CONSOLIDATED_ZIP_PREFIX,
	InvalidFileTargetError,
	collectRdfNamespaces,
	langToAlpha2,
	mergeRdfParts,
	rdfRecordFileName,
	rdfWriter,
	renderRdfRecord,
	sanitizeRdfFileName,
} from '../../src/diffusion/writers/rdf.ts';
import { getDiffusionWriter } from '../../src/diffusion/writers/registry.ts';
import {
	mergeXmlParts,
	renderXmlRecord,
	sanitizeXmlNodeName,
	xmlWriter,
} from '../../src/diffusion/writers/xml.ts';

const ROOT = `${tmpdir()}/dedalo_ts_diffusion_rdfxml_writers_${process.pid}`;
let savedRoot: string | undefined;

beforeAll(() => {
	savedRoot = process.env.DEDALO_DIFFUSION_FILES_ROOT;
	process.env.DEDALO_DIFFUSION_FILES_ROOT = ROOT;
});

afterAll(() => {
	if (savedRoot !== undefined) process.env.DEDALO_DIFFUSION_FILES_ROOT = savedRoot;
	// biome-ignore lint/performance/noDelete: assigning undefined would leave the string 'undefined' in process.env
	else delete process.env.DEDALO_DIFFUSION_FILES_ROOT;
	rmSync(ROOT, { recursive: true, force: true });
});

// ---------------------------------------------------------------- fixtures

function field(columnName: string, excludeColumn = false): FieldPlan {
	return {
		id: `rxt_${columnName}`,
		columnName,
		sourceChain: [],
		transform: [],
		column: { fieldModel: 'field_text' },
		policy: {},
		excludeColumn,
	};
}

function section(tableName: string, sectionTipo: string, fields: FieldPlan[]): SectionPlan {
	return { sectionTipo, tableName, tableTipo: `${sectionTipo}_table`, fields };
}

function plan(
	format: string,
	sections: SectionPlan[],
	serviceName = 'nomisma',
	langs: string[] = ['lg-eng', 'lg-spa'],
): PublicationPlan {
	return {
		planId: `rdfxml_test_${format}`,
		elementTipo: 'numisdata1024',
		format,
		serviceName,
		target: { kind: 'files', serviceName },
		sections,
		recursion: { maxLevels: 2 },
		langPolicy: { langs, mainLang: langs[0] ?? null },
		warnings: [],
	};
}

function row(
	sectionId: number | string,
	lang: string | null,
	columns: Record<string, string | null>,
): ProjectedRow {
	return { sectionId, lang, columns };
}

/**
 * The rdf-shaped fixture: predicate columnNames + owl:Class tableName, kept
 * VERBATIM by the plan compiler for file formats (compile.ts: "names like
 * 'nmo:TypeSeriesItem' or 'skos:prefLabel' are XML/RDF identities").
 * numisdata_mib really carries these models (owl:Class 'nmo:NumismaticObject',
 * rdf predicates, skos labels).
 */
function rdfSection(): SectionPlan {
	return section('nmo:NumismaticObject', 'numisdata4', [
		field('dc:title'),
		field('dc:identifier'),
		field('nmo:hasMaterial'),
		field('skos:prefLabel'),
		field('internal_notes', true), // resolution-only: never reaches a file
	]);
}

/** No stray temp artifacts under a directory (atomic-rename proof). */
function tempFilesIn(dir: string): string[] {
	if (!existsSync(dir)) return [];
	return readdirSync(dir).filter((name) => name.includes('.tmp-'));
}

/**
 * Hand-rolled well-formedness check (bun:test has no DOMParser): tokenizes
 * tags and verifies balanced nesting. Throws with context on any mismatch.
 */
function assertWellFormedXml(document: string): void {
	const body = document.replace(/<\?xml[^>]*\?>/, '');
	const tagPattern = /<(\/?)([A-Za-z_][\w:.-]*)((?:\s+[\w:.-]+="[^"]*")*)\s*(\/?)>/g;
	const stack: string[] = [];
	let cursor = 0;
	let match = tagPattern.exec(body);
	while (match !== null) {
		// no bare '<' or '&' between tags
		const between = body.slice(cursor, match.index);
		expect(between.includes('<')).toBe(false);
		expect(/&(?!amp;|lt;|gt;|quot;|apos;|#)/.test(between)).toBe(false);
		const [, closing, name, , selfClosing] = match;
		if (closing === '/') {
			expect(stack.pop()).toBe(name as string);
		} else if (selfClosing !== '/') {
			stack.push(name as string);
		}
		cursor = match.index + match[0].length;
		match = tagPattern.exec(body);
	}
	expect(stack).toEqual([]);
}

/** Minimal PKZIP structural read (shared-suite convention). */
function readZipStructure(zipPath: string): { names: string[]; count: number } {
	const bytes = readFileSync(zipPath);
	expect(bytes.readUInt32LE(0)).toBe(0x04034b50);
	let eocd = -1;
	for (let index = bytes.length - 22; index >= 0; index--) {
		if (bytes.readUInt32LE(index) === 0x06054b50) {
			eocd = index;
			break;
		}
	}
	expect(eocd).toBeGreaterThanOrEqual(0);
	const count = bytes.readUInt16LE(eocd + 10);
	const cdSize = bytes.readUInt32LE(eocd + 12);
	const cdOffset = bytes.readUInt32LE(eocd + 16);
	const names: string[] = [];
	let cursor = cdOffset;
	while (cursor < cdOffset + cdSize) {
		expect(bytes.readUInt32LE(cursor)).toBe(0x02014b50);
		const nameLength = bytes.readUInt16LE(cursor + 28);
		const extraLength = bytes.readUInt16LE(cursor + 30);
		const commentLength = bytes.readUInt16LE(cursor + 32);
		names.push(bytes.subarray(cursor + 46, cursor + 46 + nameLength).toString('utf-8'));
		cursor += 46 + nameLength + extraLength + commentLength;
	}
	expect(names.length).toBe(count);
	return { names, count };
}

// ---------------------------------------------------------------- registry

describe('writer registry (spec §4.3: rdf/xml registered, unknown stays LOUD)', () => {
	test('rdf and xml resolve to their writers', () => {
		expect(getDiffusionWriter('rdf').format).toBe('rdf');
		expect(getDiffusionWriter('xml').format).toBe('xml');
	});

	test('open() rejects a non-files target loudly (both writers)', async () => {
		const tablePlan: PublicationPlan = {
			...plan('rdf', [rdfSection()]),
			target: { kind: 'table', database: 'somedb' },
		};
		await expect(rdfWriter.open(tablePlan)).rejects.toThrow(InvalidFileTargetError);
		await expect(xmlWriter.open({ ...tablePlan, format: 'xml' })).rejects.toThrow(
			InvalidFileTargetError,
		);
	});
});

// ------------------------------------------------------- rdf name grammar

describe('rdf file name grammar (delete-side lockstep)', () => {
	test('sanitizeRdfFileName is byte-equal to diffusion_delete.ts sanitizePublishedFileName', () => {
		const samples = [
			'nmo:NumismaticObject_numisdata4_1',
			'nmo:TypeSeriesItem_numisdata5_42',
			'Ítem raro (2ª parte)… ¡ya!_sec1_7',
			'skos:prefLabel__double__underscores_x_9',
			'..dots..and--dashes.._t_3',
		];
		for (const sample of samples) {
			expect(sanitizeRdfFileName(sample)).toBe(sanitizePublishedFileName(sample));
		}
	});

	test('rdfRecordFileName matches the REAL published canonical base name', () => {
		// Real PHP-published files: nmonumismaticobject-numisdata4-1-*.rdf
		// (media_monedaiberica/rdf/nomisma) — canonical deterministic name is
		// sanitize('nmo:NumismaticObject_numisdata4_1') + '.rdf'.
		expect(rdfRecordFileName(rdfSection(), 1)).toBe('nmonumismaticobject-numisdata4-1.rdf');
		expect(rdfRecordFileName(rdfSection(), 56)).toBe('nmonumismaticobject-numisdata4-56.rdf');
	});
});

// ------------------------------------------------------------ rdf writer

describe('rdf writer', () => {
	const rows2records2langs = [
		row(1, 'lg-eng', {
			'dc:title': 'Iberian coin',
			'dc:identifier': '1',
			'nmo:hasMaterial': 'silver & <bronze>',
			'skos:prefLabel': null, // null column: omitted for this lang
			internal_notes: 'NEVER',
		}),
		row(1, 'lg-spa', {
			'dc:title': 'Moneda ibérica',
			'dc:identifier': '1',
			'nmo:hasMaterial': 'plata',
			'skos:prefLabel': null,
			internal_notes: 'NEVER',
		}),
		row(2, 'lg-eng', {
			'dc:title': 'Second coin',
			'dc:identifier': '2',
			'nmo:hasMaterial': null,
			'skos:prefLabel': 'coin',
			internal_notes: 'NEVER',
		}),
		row(2, 'lg-spa', {
			'dc:title': 'Segunda moneda',
			'dc:identifier': '2',
			'nmo:hasMaterial': null,
			'skos:prefLabel': 'moneda',
			internal_notes: 'NEVER',
		}),
	];

	test('2 records x 2 langs: envelope, namespaces, xml:lang literals, omissions', async () => {
		const sectionPlan = rdfSection();
		const session = await rdfWriter.open(plan('rdf', [sectionPlan], 'svc_rdf'));
		await session.ensureSchema();
		await session.writeRows(sectionPlan, rows2records2langs);
		const summary = await session.close();

		const dir = `${ROOT}/rdf/svc_rdf`;
		const doc = readFileSync(`${dir}/nmonumismaticobject-numisdata4-1.rdf`, 'utf-8');
		expect(existsSync(`${dir}/nmonumismaticobject-numisdata4-2.rdf`)).toBe(true);

		// ---- REAL-FILE PINS (byte fragments from the PHP-published fixture
		// media_monedaiberica/rdf/nomisma/nmonumismaticobject-numisdata4-1-*.rdf):
		// EasyRdf declaration (space before '?>')
		expect(doc.startsWith('<?xml version="1.0" encoding="utf-8" ?>\n')).toBe(true);
		// envelope opening + 9-space xmlns continuation indent
		expect(doc).toContain('<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"');
		expect(doc).toContain('\n         xmlns:nmo="http://nomisma.org/ontology#"');
		// dc resolves to the purl dcterms URI the real file declares
		expect(doc).toContain('xmlns:dc="http://purl.org/dc/terms/"');
		// 2-space entity indent + 4-space predicate indent, xml:lang alpha2
		expect(doc).toContain('\n  <nmo:NumismaticObject rdf:about="');
		expect(doc).toContain('\n    <dc:title xml:lang="es">Moneda ibérica</dc:title>');
		expect(doc).toContain('\n    <dc:title xml:lang="en">Iberian coin</dc:title>');
		expect(doc.trimEnd().endsWith('</rdf:RDF>')).toBe(true);

		// deterministic urn subject (no dd1010 I/O in writers — ledgered)
		expect(doc).toContain('rdf:about="urn:dedalo:record:numisdata4:1"');
		// escaping
		expect(doc).toContain('silver &amp; &lt;bronze&gt;');
		// null column omitted; excludeColumn never emitted
		expect(doc).not.toContain('skos:prefLabel');
		expect(doc).not.toContain('NEVER');
		// determinism: no wall-clock anywhere
		expect(doc).not.toMatch(/20\d\d-/);
		assertWellFormedXml(doc);

		// record 2: skos emitted, nmo:hasMaterial omitted
		const doc2 = readFileSync(`${dir}/nmonumismaticobject-numisdata4-2.rdf`, 'utf-8');
		expect(doc2).toContain('<skos:prefLabel xml:lang="es">moneda</skos:prefLabel>');
		expect(doc2).not.toContain('nmo:hasMaterial>');
		assertWellFormedXml(doc2);

		// summary: per-table counters first, consolidated entries appended
		expect(summary.tables[0]).toEqual({
			table_name: 'nmo:NumismaticObject',
			records_affected: 2,
			records_count: 4,
		});
		expect(summary.errors).toEqual([]);
		expect(tempFilesIn(dir)).toEqual([]);
	});

	test('re-render is byte-identical (determinism gate)', () => {
		const sectionPlan = rdfSection();
		const namespaces = collectRdfNamespaces(sectionPlan);
		const first = renderRdfRecord(sectionPlan, 1, rows2records2langs.slice(0, 2), namespaces);
		const second = renderRdfRecord(sectionPlan, 1, rows2records2langs.slice(0, 2), namespaces);
		expect(first).toBe(second);
	});

	test('rdf:about column overrides the urn subject and is not emitted as predicate', () => {
		const sectionPlan = section('nmo:NumismaticObject', 'numisdata4', [
			field('rdf:about'),
			field('dc:title'),
		]);
		const doc = renderRdfRecord(
			sectionPlan,
			7,
			[row(7, 'lg-eng', { 'rdf:about': 'https://monedaiberica.org/coin/7', 'dc:title': 'x' })],
			collectRdfNamespaces(sectionPlan),
		);
		expect(doc).toContain('rdf:about="https://monedaiberica.org/coin/7"');
		expect(doc).not.toContain('urn:dedalo:record');
		expect(doc).not.toContain('<rdf:about>');
		assertWellFormedXml(doc);
	});

	test('unknown namespace prefix: urn fallback in the doc + LOUD summary error', async () => {
		const sectionPlan = section('mystery:Thing', 'rxt1', [field('mystery:label')]);
		const session = await rdfWriter.open(plan('rdf', [sectionPlan], 'svc_rdf_unknown'));
		await session.ensureSchema();
		await session.writeRows(sectionPlan, [row(1, 'lg-eng', { 'mystery:label': 'v' })]);
		const summary = await session.close();
		const doc = readFileSync(
			`${ROOT}/rdf/svc_rdf_unknown/${rdfRecordFileName(sectionPlan, 1)}`,
			'utf-8',
		);
		expect(doc).toContain('xmlns:mystery="urn:dedalo:xmlns:mystery#"');
		expect(summary.errors.length).toBe(1);
		expect(summary.errors[0]).toContain("prefix 'mystery'");
	});

	test('invalid QName label throws loudly (labels reach the document verbatim)', async () => {
		const sectionPlan = section('bad label with spaces', 'rxt2', [field('dc:title')]);
		const session = await rdfWriter.open(plan('rdf', [sectionPlan], 'svc_rdf_badname'));
		await session.ensureSchema();
		await expect(
			session.writeRows(sectionPlan, [row(1, 'lg-eng', { 'dc:title': 'v' })]),
		).rejects.toThrow('not a valid XML QName');
	});

	test('removeRecords: canonical + legacy {base}_*.rdf variants, idempotent', async () => {
		const sectionPlan = rdfSection();
		const session = await rdfWriter.open(plan('rdf', [sectionPlan], 'svc_rdf_rm'));
		await session.ensureSchema();
		await session.writeRows(sectionPlan, rows2records2langs.slice(0, 2));
		const dir = `${ROOT}/rdf/svc_rdf_rm`;
		// plant a legacy timestamped variant (pre-deterministic naming era)
		const legacy = `${dir}/nmonumismaticobject-numisdata4-1_2019-01-01.rdf`;
		writeFileSync(legacy, 'legacy');

		const first = await session.removeRecords(sectionPlan, [1]);
		expect(first).toEqual({ written: 0, deleted: 2 }); // canonical + legacy
		expect(existsSync(`${dir}/nmonumismaticobject-numisdata4-1.rdf`)).toBe(false);
		expect(existsSync(legacy)).toBe(false);

		// second removal: nothing left — idempotent success, zero deletions
		const second = await session.removeRecords(sectionPlan, [1, 999]);
		expect(second).toEqual({ written: 0, deleted: 0 });

		// removed record never reaches merge/zip; run has no surviving files
		const summary = await session.close();
		expect(existsSync(`${dir}/diffusion_rdf_merged.rdf`)).toBe(false);
		expect(existsSync(`${dir}/diffusion_rdf.zip`)).toBe(false);
		expect(summary.tables.some((t) => t.table_name.startsWith('consolidated'))).toBe(false);
	});

	test('close(): type-aware merge (single envelope) + zip + summary mapping', async () => {
		const sectionPlan = rdfSection();
		const session = await rdfWriter.open(plan('rdf', [sectionPlan], 'svc_rdf_merge'));
		await session.ensureSchema();
		await session.writeRows(sectionPlan, rows2records2langs);
		const summary = await session.close();

		const dir = `${ROOT}/rdf/svc_rdf_merge`;
		const merged = readFileSync(`${dir}/diffusion_rdf_merged.rdf`, 'utf-8');
		// merged declaration has NO space before '?>' (old engine :84 pin)
		expect(merged.startsWith('<?xml version="1.0" encoding="utf-8"?>\n')).toBe(true);
		// ONE envelope, both entities
		expect(merged.match(/<rdf:RDF/g)?.length).toBe(1);
		expect(merged.match(/<\/rdf:RDF>/g)?.length).toBe(1);
		expect(merged.match(/<nmo:NumismaticObject /g)?.length).toBe(2);
		assertWellFormedXml(merged);

		const zip = readZipStructure(`${dir}/diffusion_rdf.zip`);
		expect(zip.names.sort()).toEqual([
			'diffusion_rdf_merged.rdf',
			'nmonumismaticobject-numisdata4-1.rdf',
			'nmonumismaticobject-numisdata4-2.rdf',
		]);

		// consolidated paths ride the summary as prefixed zero-count entries
		// (runner lifts them into result.consolidated_files {merged_url,zip_url})
		const consolidatedNames = summary.tables.slice(1).map((t) => t.table_name);
		expect(consolidatedNames).toEqual([
			`${CONSOLIDATED_MERGED_PREFIX}/rdf/svc_rdf_merge/diffusion_rdf_merged.rdf`,
			`${CONSOLIDATED_ZIP_PREFIX}/rdf/svc_rdf_merge/diffusion_rdf.zip`,
		]);
		expect(tempFilesIn(dir)).toEqual([]);
	});

	test('abort sweeps stray temps and leaves finalized records (PHP posture)', async () => {
		const sectionPlan = rdfSection();
		const session = await rdfWriter.open(plan('rdf', [sectionPlan], 'svc_rdf_abort'));
		await session.ensureSchema();
		await session.writeRows(sectionPlan, rows2records2langs.slice(0, 2));
		const dir = `${ROOT}/rdf/svc_rdf_abort`;
		writeFileSync(`${dir}/diffusion_rdf_merged.rdf.tmp-crashed`, 'partial');
		await session.abort();
		expect(tempFilesIn(dir)).toEqual([]);
		// finalized per-record file stays (idempotent re-publish overwrites it)
		expect(existsSync(`${dir}/nmonumismaticobject-numisdata4-1.rdf`)).toBe(true);
		expect(existsSync(`${dir}/diffusion_rdf_merged.rdf`)).toBe(false);
	});

	test('mergeRdfParts: empty → "", single part untouched (old-engine pins)', () => {
		expect(mergeRdfParts([])).toBe('');
		expect(mergeRdfParts(['', '  '])).toBe('');
		const single = '<?xml version="1.0" encoding="utf-8" ?>\n<rdf:RDF>\n<a>1</a>\n</rdf:RDF>\n';
		expect(mergeRdfParts([single])).toBe(single);
	});
});

// ------------------------------------------------------------ xml writer

describe('xml writer', () => {
	function xmlSection(): SectionPlan {
		return section('Coins_DES', 'numisdata5', [
			field('title'),
			field('inventory'),
			field('secret', true),
		]);
	}

	test('sanitizeXmlNodeName: PHP sanitize_xml_node_name port', () => {
		expect(sanitizeXmlNodeName('Coins_DES')).toBe('Coins_DES');
		expect(sanitizeXmlNodeName('nmo:hasMaterial')).toBe('nmo_hasMaterial');
		expect(sanitizeXmlNodeName('1abc')).toBe('_1abc');
		expect(sanitizeXmlNodeName('.start')).toBe('_.start');
		expect(sanitizeXmlNodeName('xmlData')).toBe('xxmlData');
		expect(sanitizeXmlNodeName('XMLthing')).toBe('xXMLthing');
		expect(sanitizeXmlNodeName('tí tulo')).toBe('t__tulo');
	});

	test('2 records x 2 langs: declaration, root, per-lang alpha2 children, omissions', async () => {
		const sectionPlan = xmlSection();
		const session = await xmlWriter.open(plan('xml', [sectionPlan], 'svc_xml'));
		await session.ensureSchema();
		await session.writeRows(sectionPlan, [
			row(5777, 'lg-eng', { title: 'My title', inventory: 'inv & <tag>', secret: 'NEVER' }),
			row(5777, 'lg-spa', { title: 'Mi título', inventory: null, secret: 'NEVER' }),
			row(5778, 'lg-eng', { title: null, inventory: null }),
			row(5778, 'lg-spa', { title: 'Solo español', inventory: null }),
		]);
		const summary = await session.close();

		const dir = `${ROOT}/xml/svc_xml`;
		// EXACT delete-side grammar: {section_tipo}_{section_id}.xml
		// (diffusion_delete.ts:367-369 / PHP class.diffusion_xml.php:565)
		const doc = readFileSync(`${dir}/numisdata5_5777.xml`, 'utf-8');
		expect(existsSync(`${dir}/numisdata5_5778.xml`)).toBe(true);

		// PHP DOMDocument declaration (real v6-published fixture pin:
		// media_mib/xml/numisdata5_5777_*.xml)
		expect(doc.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n')).toBe(true);
		expect(doc).toContain('<Coins_DES>');
		expect(doc.trimEnd().endsWith('</Coins_DES>')).toBe(true);
		// per-lang alpha2 children, 2-space nesting (PHP formatOutput)
		expect(doc).toContain('\n  <title>\n    <en>My title</en>\n    <es>Mi título</es>\n  </title>');
		// null lang value omitted; escaping applied
		expect(doc).toContain('<inventory>\n    <en>inv &amp; &lt;tag&gt;</en>\n  </inventory>');
		expect(doc).not.toContain('NEVER');
		expect(doc).not.toMatch(/20\d\d-/); // determinism: no wall-clock
		assertWellFormedXml(doc);

		// record with all-null title lang still renders the valued lang only
		const doc2 = readFileSync(`${dir}/numisdata5_5778.xml`, 'utf-8');
		expect(doc2).toContain('<es>Solo español</es>');
		expect(doc2).not.toContain('<en>');
		expect(doc2).not.toContain('<inventory');
		assertWellFormedXml(doc2);

		expect(summary.tables[0]).toEqual({
			table_name: 'Coins_DES',
			records_affected: 2,
			records_count: 4,
		});
		expect(tempFilesIn(dir)).toEqual([]);
	});

	test('lang-null rows render inline values (nolan single-lang PHP case)', () => {
		const sectionPlan = section('Coins_DES', 'numisdata5', [field('title'), field('empty')]);
		const doc = renderXmlRecord(sectionPlan, [row(9, null, { title: 'plain', empty: '' })]);
		expect(doc).toContain('  <title>plain</title>');
		// empty string renders an empty element (PHP createElement, no text child)
		expect(doc).toContain('  <empty/>');
		assertWellFormedXml(doc);
	});

	test('removeRecords unlinks; missing file is idempotent success', async () => {
		const sectionPlan = xmlSection();
		const session = await xmlWriter.open(plan('xml', [sectionPlan], 'svc_xml_rm'));
		await session.ensureSchema();
		await session.writeRows(sectionPlan, [row(3, 'lg-eng', { title: 'gone soon' })]);

		const first = await session.removeRecords(sectionPlan, [3]);
		expect(first).toEqual({ written: 0, deleted: 1 });
		expect(existsSync(`${ROOT}/xml/svc_xml_rm/numisdata5_3.xml`)).toBe(false);

		const second = await session.removeRecords(sectionPlan, [3, 99]);
		expect(second).toEqual({ written: 0, deleted: 0 });

		const summary = await session.close();
		expect(existsSync(`${ROOT}/xml/svc_xml_rm/diffusion_xml.zip`)).toBe(false);
		expect(summary.tables.some((t) => t.table_name.startsWith('consolidated'))).toBe(false);
	});

	test('close(): merged document under the first root + zip + summary mapping', async () => {
		const sectionPlan = xmlSection();
		const session = await xmlWriter.open(plan('xml', [sectionPlan], 'svc_xml_merge'));
		await session.ensureSchema();
		await session.writeRows(sectionPlan, [
			row(1, 'lg-eng', { title: 'one' }),
			row(2, 'lg-eng', { title: 'two' }),
		]);
		const summary = await session.close();

		const dir = `${ROOT}/xml/svc_xml_merge`;
		const merged = readFileSync(`${dir}/diffusion_xml_merged.xml`, 'utf-8');
		expect(merged.startsWith('<?xml version="1.0" encoding="utf-8"?>\n')).toBe(true);
		// ONE root wrapping both records' children (old merge_xml_parts pin)
		expect(merged.match(/<Coins_DES>/g)?.length).toBe(1);
		expect(merged.match(/<\/Coins_DES>/g)?.length).toBe(1);
		expect(merged.match(/<title>/g)?.length).toBe(2);
		assertWellFormedXml(merged);

		const zip = readZipStructure(`${dir}/diffusion_xml.zip`);
		expect(zip.names.sort()).toEqual([
			'diffusion_xml_merged.xml',
			'numisdata5_1.xml',
			'numisdata5_2.xml',
		]);

		const consolidatedNames = summary.tables.slice(1).map((t) => t.table_name);
		expect(consolidatedNames).toEqual([
			`${CONSOLIDATED_MERGED_PREFIX}/xml/svc_xml_merge/diffusion_xml_merged.xml`,
			`${CONSOLIDATED_ZIP_PREFIX}/xml/svc_xml_merge/diffusion_xml.zip`,
		]);
		expect(tempFilesIn(dir)).toEqual([]);
	});

	test('abort sweeps stray temps and leaves finalized records', async () => {
		const sectionPlan = xmlSection();
		const session = await xmlWriter.open(plan('xml', [sectionPlan], 'svc_xml_abort'));
		await session.ensureSchema();
		await session.writeRows(sectionPlan, [row(1, 'lg-eng', { title: 'kept' })]);
		const dir = `${ROOT}/xml/svc_xml_abort`;
		writeFileSync(`${dir}/diffusion_xml_merged.xml.tmp-crashed`, 'partial');
		await session.abort();
		expect(tempFilesIn(dir)).toEqual([]);
		expect(existsSync(`${dir}/numisdata5_1.xml`)).toBe(true);
	});

	test('mergeXmlParts: empty → "", single part untouched', () => {
		expect(mergeXmlParts([])).toBe('');
		const single = '<?xml version="1.0" encoding="UTF-8"?>\n<r>\n  <a>1</a>\n</r>\n';
		expect(mergeXmlParts([single])).toBe(single);
	});
});

// ---------------------------------------------------------------- shared

describe('lang mapping (PHP lang::get_alpha2_from_code)', () => {
	test('known codes map, unknown codes degrade deterministically', () => {
		expect(langToAlpha2('lg-eng')).toBe('en');
		expect(langToAlpha2('lg-spa')).toBe('es');
		expect(langToAlpha2('lg-cat')).toBe('ca');
		expect(langToAlpha2('lg-zzz')).toBe('zz');
	});
});
