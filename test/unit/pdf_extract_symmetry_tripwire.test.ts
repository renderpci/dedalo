/**
 * A TEXT EXTRACTION MUST REACH THE CURATOR AS THE PDF HELD IT (P1-20 / CLI-13).
 *
 * THE DEFECT. PHP's `get_pdf_data` returned `htmlentities($result, ENT_QUOTES,
 * 'UTF-8')` and the client un-did it — an exact identity round trip. The TS port
 * kept the COMMENT and dropped the ENCODE: `src/core/media/tools/pdf_extract.ts`
 * returns raw `pdftotext` output, while the client went on decoding it with
 * `DOMParser().parseFromString(str,'text/html').documentElement.textContent`.
 *
 * Over RAW text that transform DELETES every `<…>` run as a tag and decodes
 * every entity. So what the operator reads in the preview — and copies into the
 * record with "Select text" — was silently mangled:
 *
 *   IMP(erator) CAES<A>R      ->  IMP(erator) CAESR
 *   a <gap/> b <illegible> c  ->  a  b  c
 *
 * An epigraphic edition, a TEI-ish transcription and ordinary prose containing
 * angle brackets all lose characters on the way into the archive, and nothing
 * reports it. The pair must be SYMMETRIC or absent, never half.
 *
 * THE SHAPE SINCE 2026-10-11 (CLIENT-2). The client no longer touches the
 * payload's markup at all: `get_pdf_data` answers `{value, render_class}`
 * (tools/tool_pdf_extractor/server/pdf_payload.ts — `shapePdfPayload`), the text
 * method verbatim, the html method shaped and sanitized on the server, and the
 * client renders through the ONE render-boundary escaper. So the client half of
 * this gate is a BAN (no DOMParser, no parse-then-textContent decode anywhere in
 * the tool's client), and the html half — formerly a brace-depth census of the
 * client loop — is now an OUTCOME over the server door.
 */

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { browserSources } from '../helpers/browser_corpus.ts';

const REPO_ROOT = join(import.meta.dir, '..', '..');
const SERVER = 'src/core/media/tools/pdf_extract.ts';

function read(file: string): string {
	return readFileSync(join(REPO_ROOT, file), 'utf8');
}

/**
 * Comments stripped — the rule is about CODE. This file's own fix documents the
 * banned shape in a comment at the site, and a raw scan convicted it for
 * describing the thing it removed.
 */
function stripComments(source: string): string {
	return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

/** Every client module of the tool (the shared browser corpus, narrowed to it), comments stripped. */
function clientSources(): { file: string; code: string }[] {
	return browserSources()
		.filter((file) => file.startsWith('tools/tool_pdf_extractor/'))
		.sort()
		.map((file) => ({ file, code: stripComments(read(file)) }));
}

type ShapePdfPayload = (
	raw: string,
	method: 'text' | 'html',
	offset: number,
) => { value: string; render_class: string };

async function shaper(): Promise<ShapePdfPayload> {
	const mod = (await import('../../tools/tool_pdf_extractor/server/pdf_payload.ts')) as {
		shapePdfPayload?: ShapePdfPayload;
	};
	expect(typeof mod.shapePdfPayload, 'pdf_payload.ts must export shapePdfPayload').toBe('function');
	return mod.shapePdfPayload as ShapePdfPayload;
}

describe('pdf extraction symmetry', () => {
	test('the SERVER does not encode', () => {
		// The half that decides which half the client may have. If an encode is
		// ever restored here, the client decode must come back in the same change.
		const server = stripComments(read(SERVER));
		expect(server).not.toMatch(/htmlentities|escapeHtml|encodeEntities/i);
	});

	test('the CLIENT therefore does not decode — and never re-parses the payload', () => {
		// The exact shape that ate the characters (parsing raw text as HTML and
		// taking textContent), and the parser itself: a client-side
		// parse -> serialise -> innerHTML round trip is also the mutation-XSS route.
		const sources = clientSources();
		expect(sources.length, 'the tool client is gone — re-read this gate').toBeGreaterThan(0);
		const offenders = sources
			.filter(
				({ code }) =>
					/\bDOMParser\b/.test(code) ||
					/parseFromString\([^)]*\)[\s\S]{0,80}\.textContent/.test(code),
			)
			.map(({ file }) => file);
		expect(
			offenders,
			'The server shapes and sanitizes the payload (shapePdfPayload); the client renders ' +
				'it through render_value by its render_class. A DOMParser here re-opens the decode ' +
				'that deleted every `<…>` run and the parse/serialise round trip.',
		).toEqual([]);
	});

	test('the server keeps text verbatim and returns an html body even with no page anchors', async () => {
		const shape = await shaper();
		// text: what the PDF holds, character for character
		expect(shape('IMP(erator) CAES<A>R a <gap/> b x &amp; y', 'text', 1)).toEqual({
			value: 'IMP(erator) CAES<A>R a <gap/> b x &amp; y',
			render_class: 'text',
		});
		// html with NO a[name] anchor: the body survives (the old in-loop read
		// returned '' for exactly this document)
		const html = shape(
			'<!DOCTYPE html><html><head><title>t</title></head><body><b>WORLD</b><br/></body></html>',
			'html',
			1,
		);
		expect(html.render_class).toBe('html');
		expect(html.value).toContain('<b>WORLD</b>');
	});
});
