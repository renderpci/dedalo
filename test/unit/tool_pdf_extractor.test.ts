/**
 * tool_pdf_extractor server module gates (the extraction core itself is driven
 * in media_tools.test.ts, which builds a real PDF and reads its text back).
 *
 * What this pins:
 *  - the declarative record gate stays READ-level on the record;
 *  - the handler's own (section_tipo, component_tipo) READ assertion — PHP
 *    gates on the PAIR (assert_tipo_permission(…, 1)); the port had only the
 *    section-level 'record' gate, which a component-specific dd774 grant does
 *    not imply;
 *  - the method allowlist and the pdf-only model check, both of which must fail
 *    with an envelope rather than throwing;
 *  - THE PAYLOAD CONTRACT (CLIENT-2, 2026-10-11): `get_pdf_data` answers
 *    `{value, render_class}`. The text method is the PDF's characters VERBATIM
 *    with render_class 'text' (the client escapes it — `CAES<A>R` is an
 *    epigraphic edition, not a tag); the html method is shaped on the SERVER
 *    (head/doctype gone, `a[name]` page anchors become Dédalo page tags) and
 *    passes the ONE sanitizer LAST, judged by the spec-parser oracle
 *    (test/helpers/html_oracle.ts). The client used to re-parse the payload
 *    with DOMParser and assign it to innerHTML whatever the method — that
 *    round trip is gone.
 */
// Migrated to the generic `test` TLD 2026-08-19: the "not a media component" probe only
// needs a literal component, so it now names the generic `test52` (input_text).

import { afterAll, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname } from 'node:path';
import { config } from '../../src/config/config.ts';
import { mediaTypeOf } from '../../src/core/concepts/media.ts';
import { runBinary } from '../../src/core/media/engine/spawn.ts';
import { resolveMediaPathOptions } from '../../src/core/media/ontology_path.ts';
import { buildMediaLocation } from '../../src/core/media/path.ts';
import { extractPdfCore } from '../../src/core/media/tools/pdf_extract.ts';
import type { Principal } from '../../src/core/security/permissions.ts';
import { getLoadedTool } from '../../src/core/tools/loader.ts';
import type { ToolActionContext, ToolResponse } from '../../src/core/tools/module.ts';
import { mustGet } from '../helpers/assert.ts';
import { browserViolations } from '../helpers/html_oracle.ts';
import { refusalOf, refusalOfSync } from '../helpers/refusal.ts';

const SUPERUSER: Principal = { userId: -1, isGlobalAdmin: true, isDeveloper: true };
const NO_ACCESS: Principal = { userId: 999999, isGlobalAdmin: false, isDeveloper: false };

async function handler(): Promise<(ctx: ToolActionContext) => Promise<ToolResponse>> {
	const loaded = await getLoadedTool('tool_pdf_extractor');
	expect(loaded).not.toBeNull();
	return mustGet(loaded?.module.apiActions.get_pdf_data, 'get_pdf_data').handler;
}

const contextOf = (
	options: Record<string, unknown>,
	principal: Principal = SUPERUSER,
): ToolActionContext =>
	({ principal, userId: principal.userId, options, background: false }) as ToolActionContext;

// test85 is the test-tree component_pdf (parent test45); test52 is a literal.
const PDF_TIPO = 'test85';
const PDF_SECTION = 'test45';

describe('tool_pdf_extractor module surface', () => {
	test('get_pdf_data is the only action, record-gated at READ level', async () => {
		const loaded = await getLoadedTool('tool_pdf_extractor');
		const actions = loaded?.module.apiActions ?? {};
		expect(Object.keys(actions)).toEqual(['get_pdf_data']);
		const spec = mustGet(actions.get_pdf_data, 'get_pdf_data');
		expect(spec.permission).toBe('record_tipo');
		expect(spec.minLevel).toBe(1);
		// A read tool must never be offered a background fork.
		expect(loaded?.module.backgroundRunnable).toBeUndefined();
	});
});

describe('tool_pdf_extractor gates', () => {
	test('a caller without READ on the (section, component) pair is refused', async () => {
		const run = await handler();
		const refusal = await refusalOf(
			run(
				contextOf(
					{ tipo: PDF_TIPO, section_tipo: PDF_SECTION, section_id: 1, method: 'text' },
					NO_ACCESS,
				),
			),
		);
		expect(refusal.code).toBe('perm.denied');
	});

	test('an unknown method is refused before any filesystem access', async () => {
		const run = await handler();
		for (const method of ['xml', '', undefined, 'TEXT']) {
			const refusal = await refusalOf(
				run(contextOf({ tipo: PDF_TIPO, section_tipo: PDF_SECTION, section_id: 1, method })),
			);
			expect(refusal.code).toBe('request.invalid_options');
			expect(refusal.publicMessage).toContain("method must be 'text' or 'html'");
		}
	});

	test('a non-media component is refused, never answered with empty text', async () => {
		const run = await handler();
		// The media-context resolve still refuses with an UNTYPED engine throw
		// (tool_support.ts is a different sweep); it reaches the chokepoint as
		// internal.unexpected rather than a body the handler dresses up.
		expect(
			run(
				contextOf({
					tipo: 'test52',
					section_tipo: 'test2',
					section_id: 1,
					method: 'text',
				}),
			),
		).rejects.toThrow(/is not a media component/);
	});

	test('a missing default-quality file is reported, never returned as empty text', async () => {
		const run = await handler();
		expect(
			run(
				contextOf({
					tipo: PDF_TIPO,
					section_tipo: PDF_SECTION,
					section_id: 999999,
					method: 'text',
				}),
			),
		).rejects.toThrow();
	});
});

// ---------------------------------------------------------------------------
// THE PAYLOAD CONTRACT (CLIENT-2).
// ---------------------------------------------------------------------------

interface PdfPayload {
	value: string;
	render_class: 'text' | 'html';
}
type ShapePdfPayload = (raw: string, method: 'text' | 'html', offset: number) => PdfPayload;

/**
 * The shaping door, loaded lazily so the module-surface and gate tests above
 * keep running (and keep their own verdict) while it does not exist.
 */
async function shaper(): Promise<ShapePdfPayload> {
	const mod = (await import('../../tools/tool_pdf_extractor/server/pdf_payload.ts')) as {
		shapePdfPayload?: ShapePdfPayload;
	};
	return mustGet(mod.shapePdfPayload, 'shapePdfPayload');
}

/** A real pdftohtml-shaped document (doctype, head + title, page anchors). */
const PDFTOHTML_DOC = (body: string): string =>
	'<!DOCTYPE html><html>\n<head>\n<title>out</title>\n<meta http-equiv="Content-Type" content="text/html; charset=UTF-8"/>\n</head>\n' +
	`<body bgcolor="#A0A0A0" vlink="blue" link="blue">\n${body}\n</body>\n</html>\n`;

describe('shapePdfPayload — text is the PDF verbatim, html is shaped then sanitized', () => {
	test('text: verbatim characters, render_class text', async () => {
		const shape = await shaper();
		for (const raw of [
			'IMP CAES<A>R',
			'x &amp; y',
			'a <gap/> b <illegible> c',
			'<img src=x onerror="window.__pdfx=1">',
		]) {
			expect(shape(raw, 'text', 1)).toEqual({ value: raw, render_class: 'text' });
		}
	});

	test('html with NO page anchors still yields its body (P1-20 as an outcome)', async () => {
		const shape = await shaper();
		const out = shape(PDFTOHTML_DOC('<b>WORLD</b><br/>\nsecond line<br/>'), 'html', 1);
		expect(out.render_class).toBe('html');
		expect(out.value).toContain('WORLD');
		expect(out.value).toContain('second line');
		// the document scaffolding is gone — the preview is a fragment
		expect(out.value).not.toMatch(/<!doctype|<html|<head|<title|<body|<meta/i);
		expect(out.value).not.toContain('>out<');
	});

	test('html page anchors become Dédalo page tags keyed by the offset', async () => {
		const shape = await shaper();
		const out = shape(
			PDFTOHTML_DOC('<a name=1></a>page one<br/><hr/><a name="2"></a>page two<br/>'),
			'html',
			3,
		);
		expect(out.value).toContain('<p>[page-n-1-3-data:[1]:data]</p>');
		expect(out.value).toContain('<p>[page-n-2-4-data:[2]:data]</p>');
		expect(out.value).toContain('page one');
		expect(out.value).toContain('page two');
		expect(out.value).not.toMatch(/<a\s+name=/i);
	});

	test('html: a NON-numeric named anchor is content — kept, and given no page tag', async () => {
		const shape = await shaper();
		const out = shape(PDFTOHTML_DOC('<a name="foo">x</a> and <a name="1x">y</a>'), 'html', 1);
		expect(out.value).toContain('<a name="foo">x</a>');
		expect(out.value).toContain('<a name="1x">y</a>');
		expect(out.value).not.toContain('[page-');
	});

	test('html: a hostile PDF link or markup is never live in the payload', async () => {
		const shape = await shaper();
		const hostile = PDFTOHTML_DOC(
			'<a name=1></a>' +
				'<a href="https://x/&quot;&gt;&lt;img src=x onerror=alert(1)&gt;">ext</a>' +
				'<a href="https://x/"><img src=x onerror=alert(1)>">ext2</a>' +
				'<a href="javascript:alert(1)">js</a>' +
				'<a href="&#106;avascript:alert(1)">js2</a>' +
				'<img/onerror=alert(1) src=x>' +
				'<svg><![CDATA[><img src=x onerror=alert(1)>]]></svg>' +
				'<noscript><p title="</noscript><img src=x onerror=alert(1)>"></noscript>',
		);
		// positive control: the oracle convicts the raw document
		expect(browserViolations(hostile).length).toBeGreaterThan(0);
		const out = shape(hostile, 'html', 1);
		expect(out.render_class).toBe('html');
		expect(browserViolations(out.value), out.value).toEqual([]);
		// ...and the benign half survived the sanitizer
		expect(out.value).toContain('[page-n-1-1-data:[1]:data]');
		expect(out.value).toContain('ext');
	});

	// SANITIZE LAST, as an outcome. Every shaper removal (doctype, head, the
	// html/body unwrap) JOINS the text on either side: `<` + a removed construct
	// + `img onerror=…>` comes out of the shaper as a live `<img onerror>`. Only
	// a sanitizer pass over the SHAPED bytes judges that tag, so the swapped order
	// (sanitize, then shape) is convicted here — per input, the positive control.
	test('html: a shaper removal never splices its neighbours into live markup (sanitize LAST)', async () => {
		const shape = await shaper();
		const mod = (await import('../../tools/tool_pdf_extractor/server/pdf_payload.ts')) as {
			shapePdfHtml?: (raw: string, offset: number) => string;
		};
		const shapeOnly = mustGet(mod.shapePdfHtml, 'shapePdfHtml');
		const { sanitizeRichText } = await import('../../src/core/security/html_sanitize.ts');
		// [construct, does the swapped order splice it bare?, …wrapped in a document?]
		// A bare STRAY end tag fires no element event, so the shaper leaves it in
		// place; a numeric page anchor is REPLACED by an element, never by nothing.
		// Both are judged for the real order all the same, and pinned as
		// non-splicing so a stale exemption goes red.
		const constructs: ReadonlyArray<readonly [string, boolean, boolean]> = [
			['<!DOCTYPE html>', true, true],
			['<head></head>', true, true],
			['<head><title>t</title></head>', true, true],
			['<html>', true, true],
			['<body>', true, true],
			['</html>', false, true],
			['</body>', false, true],
			['<a name=7></a>', false, false],
		];
		const tails = ['img src=x onerror=alert(1)>', 'a href="javascript:alert(1)">y</a>'];
		const offenders: string[] = [];
		let convicted = 0;
		for (const [construct, bareSplices, wrappedSplices] of constructs) {
			for (const tail of tails) {
				for (const [input, splices] of [
					[`<${construct}${tail}`, bareSplices],
					[PDFTOHTML_DOC(`<${construct}${tail}`), wrappedSplices],
				] as const) {
					const swapped = shapeOnly(sanitizeRichText(input), 1);
					expect(browserViolations(swapped).length > 0, `swapped order on ${input}`).toBe(splices);
					if (splices) convicted += 1;
					const out = shape(input, 'html', 1);
					if (browserViolations(out.value).length > 0) offenders.push(`${input} => ${out.value}`);
				}
			}
		}
		expect(convicted).toBeGreaterThanOrEqual(2 * 12);
		expect(offenders).toEqual([]);
	});
});

// ---------------------------------------------------------------------------
// THE REQUEST HALF: the validated options are what the payload is shaped by.
// ---------------------------------------------------------------------------

interface PdfPayloadRequest {
	method: 'text' | 'html';
	offset: number;
}
interface RequestDoor {
	pdfPayloadRequest: (options: Record<string, unknown>) => PdfPayloadRequest;
	answerPdfPayload: (raw: string, request: PdfPayloadRequest) => PdfPayload;
}

async function requestDoor(): Promise<RequestDoor> {
	const mod = (await import(
		'../../tools/tool_pdf_extractor/server/pdf_payload.ts'
	)) as Partial<RequestDoor>;
	return {
		pdfPayloadRequest: mustGet(mod.pdfPayloadRequest, 'pdfPayloadRequest'),
		answerPdfPayload: mustGet(mod.answerPdfPayload, 'answerPdfPayload'),
	};
}

describe('pdfPayloadRequest + answerPdfPayload — the offset reaches the page keys', () => {
	const TWO_PAGES = PDFTOHTML_DOC('<a name=1></a>page one<br/><a name=2></a>page two<br/>');

	test('an absent offset means logical page 1 = physical page 1', async () => {
		const { pdfPayloadRequest, answerPdfPayload } = await requestDoor();
		for (const options of [
			{ method: 'html' },
			{ method: 'html', offset: '' },
			{ method: 'html', offset: null },
		]) {
			const request = pdfPayloadRequest(options);
			expect(request).toEqual({ method: 'html', offset: 1 });
			const out = answerPdfPayload(TWO_PAGES, request);
			expect(out.value).toContain('[page-n-1-1-data:[1]:data]');
			expect(out.value).toContain('[page-n-2-2-data:[2]:data]');
		}
	});

	test('a sent offset (number or digit string) keys every page by it', async () => {
		const { pdfPayloadRequest, answerPdfPayload } = await requestDoor();
		for (const offset of [3, '3']) {
			const out = answerPdfPayload(TWO_PAGES, pdfPayloadRequest({ method: 'html', offset }));
			expect(out.value, `offset ${JSON.stringify(offset)}`).toContain('[page-n-1-3-data:[1]:data]');
			expect(out.value).toContain('[page-n-2-4-data:[2]:data]');
		}
		const negative = answerPdfPayload(
			TWO_PAGES,
			pdfPayloadRequest({ method: 'html', offset: '-1' }),
		);
		expect(negative.value).toContain('[page-n-2-0-data:[2]:data]');
	});

	test('the method allowlist and the offset are refused at the door, never coerced', async () => {
		const { pdfPayloadRequest } = await requestDoor();
		for (const options of [
			{ method: 'xml' },
			{},
			{ method: 'html', offset: 1.5 },
			{ method: 'html', offset: '2x' },
		]) {
			const refusal = refusalOfSync(() => pdfPayloadRequest(options));
			expect(refusal.code, JSON.stringify(options)).toBe('request.invalid_options');
		}
	});
});

/**
 * The handler END TO END: a REAL PDF (gs-built, carrying the characters a
 * mangling decode or a markup render would destroy) at the SUITE media root,
 * extracted by the real pdftotext / pdftohtml. The html method is measured HERE
 * and not only through `answerPdfPayload` directly: the property at stake is
 * that the offset the handler VALIDATED reaches the page keys of a real
 * extraction — a handler that validates it and shapes with another value is
 * green on every direct call. (It also measures the html method at all: the
 * PHP-era `-layout` flag made pdftohtml exit 1 on every call.)
 */
/**
 * Ghostscript BUILDS the fixture PDF, and it is the ENGINE'S configured binary
 * (DEDALO_GS_PATH, derived from DEDALO_BINARY_BASE — the one the cover/thumbnail
 * render uses), not a guessed install path. A missing gs is a RED precondition,
 * never a silent skip: the CI image ships it, and a skipped case measures
 * nothing while the run reads green.
 */
const GS_BIN = config.media.binaries.ghostscript;
const HOSTILE_LINE = 'IMP CAES<A>R x &amp; y <img src=x onerror=alert(1)>';

describe('get_pdf_data end to end — text and html methods', () => {
	const pdf = mustGet(mediaTypeOf('component_pdf'), 'component_pdf spec');
	// Everything this block creates — the PDFs and any directory mkdir had to
	// make for them — is ours alone and goes after.
	const created: string[] = [];
	afterAll(() => {
		for (const path of created.reverse()) rmSync(path, { recursive: true, force: true });
	});

	/** A free section_id slot for test85/test3 on the suite media root; the file is ours alone. One page per line. */
	async function plantHostilePdf(
		lines: readonly string[] = [HOSTILE_LINE],
	): Promise<{ sectionId: number; file: string }> {
		const pathOpts = await resolveMediaPathOptions(PDF_TIPO, 'test3');
		for (let sectionId = 7000 + (process.pid % 1000); ; sectionId += 1) {
			const file = buildMediaLocation(
				pdf,
				{ componentTipo: PDF_TIPO, sectionTipo: 'test3', sectionId, lang: null },
				pdf.defaultQuality,
				'pdf',
				pathOpts,
			).absolutePath;
			if (existsSync(file)) continue;
			const firstNewDir = mkdirSync(dirname(file), { recursive: true });
			if (firstNewDir !== undefined) created.push(firstNewDir);
			// PostScript string: parentheses balance, backslash-free.
			await runBinary(
				[
					GS_BIN,
					'-q',
					'-dNOPAUSE',
					'-dBATCH',
					'-sDEVICE=pdfwrite',
					'-o',
					file,
					'-c',
					`<< /PageSize [700 200] >> setpagedevice /Helvetica findfont 14 scalefont setfont ${lines
						.map((line) => `20 100 moveto (${line}) show showpage`)
						.join(' ')}`,
				],
				{ nice: false },
			);
			created.push(file);
			return { sectionId, file };
		}
	}

	test('precondition — Ghostscript is installed at the engine-configured path (the cases below build their PDF with it)', () => {
		expect(
			existsSync(GS_BIN),
			`gs not found at '${GS_BIN}' (DEDALO_GS_PATH / DEDALO_BINARY_BASE): install Ghostscript ` +
				'(brew install ghostscript / apt install ghostscript) or point DEDALO_GS_PATH at it',
		).toBe(true);
	});

	test('the text method answers {value: the PDF verbatim, render_class: text}', async () => {
		const { sectionId } = await plantHostilePdf();
		const pathOpts = await resolveMediaPathOptions(PDF_TIPO, 'test3');
		const raw = await extractPdfCore(
			pdf,
			{ componentTipo: PDF_TIPO, sectionTipo: 'test3', sectionId, lang: null },
			pathOpts,
			{ method: 'text' },
		);
		// the fixture really carries the characters at stake
		expect(raw).toContain('CAES<A>R');
		expect(raw).toContain('<img src=x onerror=alert(1)>');

		const run = await handler();
		const response = await run(
			contextOf({
				tipo: PDF_TIPO,
				section_tipo: 'test3',
				section_id: sectionId,
				method: 'text',
				offset: 1,
			}),
		);
		expect((response as { data?: unknown }).data).toEqual({ value: raw, render_class: 'text' });
	});

	test('the html method: the VALIDATED offset keys every page of a real extraction, and nothing is live', async () => {
		const { sectionId } = await plantHostilePdf([`one ${HOSTILE_LINE}`, 'two']);
		const run = await handler();
		const answer = async (offset: unknown): Promise<{ value: string; render_class: string }> => {
			const options: Record<string, unknown> = {
				tipo: PDF_TIPO,
				section_tipo: 'test3',
				section_id: sectionId,
				method: 'html',
			};
			if (offset !== undefined) options.offset = offset;
			const response = await run(contextOf(options));
			return (response as { data: { value: string; render_class: string } }).data;
		};

		for (const [offset, keys] of [
			[undefined, ['[page-n-1-1-data:[1]:data]', '[page-n-2-2-data:[2]:data]']],
			[3, ['[page-n-1-3-data:[1]:data]', '[page-n-2-4-data:[2]:data]']],
			['3', ['[page-n-1-3-data:[1]:data]', '[page-n-2-4-data:[2]:data]']],
		] as const) {
			const data = await answer(offset);
			expect(data.render_class, `offset ${String(offset)}`).toBe('html');
			for (const key of keys) expect(data.value, `offset ${String(offset)}`).toContain(key);
			expect(data.value).not.toContain(offset === undefined ? '-1-3-' : '-1-1-');
			// the real pdftohtml output, shaped: a fragment, the hostile line inert
			expect(data.value).toContain('one');
			expect(data.value).toContain('two');
			expect(data.value).not.toMatch(/<!doctype|<html|<head|<body/i);
			expect(browserViolations(data.value), data.value).toEqual([]);
		}
	});

	test('a non-integer offset is refused', async () => {
		const { sectionId } = await plantHostilePdf();
		const run = await handler();
		for (const offset of ['abc', 1.5, '2x', {}]) {
			const refusal = await refusalOf(
				run(
					contextOf({
						tipo: PDF_TIPO,
						section_tipo: 'test3',
						section_id: sectionId,
						method: 'text',
						offset,
					}),
				),
			);
			expect(refusal.code, `offset ${JSON.stringify(offset)}`).toBe('request.invalid_options');
		}
	});
});
