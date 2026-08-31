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
 * This gate is a SOURCE census, not a DOM run: `tools/**\/js` has no executing
 * behavioural tier (P0-12's gate shares that limitation). It pins the two
 * properties that made the loss possible.
 */

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const REPO_ROOT = join(import.meta.dir, '..', '..');
const EXTRACTOR = 'tools/tool_pdf_extractor/js/tool_pdf_extractor.js';
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

/** The body of `process_pdf_data`, where the round trip lived. */
function processBody(): string {
	const src = read(EXTRACTOR);
	const start = src.indexOf('tool_pdf_extractor.prototype.process_pdf_data');
	expect(start, `${EXTRACTOR}: process_pdf_data not found`).toBeGreaterThan(-1);
	return stripComments(src.slice(start, src.indexOf('}//end process_pdf_data', start)));
}

describe('pdf extraction symmetry', () => {
	test('the SERVER does not encode', () => {
		// The half that decides which half the client may have. If an encode is
		// ever restored here, the client decode must come back in the same change.
		const server = stripComments(read(SERVER));
		expect(server).not.toMatch(/htmlentities|escapeHtml|encodeEntities/i);
	});

	test('the CLIENT therefore does not decode', () => {
		// The exact shape that ate the characters: parsing raw text as HTML and
		// taking textContent.
		const body = processBody();
		expect(
			/parseFromString\([^)]*\)\s*\.?\s*[\s\S]{0,80}documentElement\.textContent/.test(body),
			`${EXTRACTOR}: process_pdf_data decodes entities out of RAW server text again — ` +
				'over raw text that deletes every `<…>` run as a tag. The server does not encode ' +
				'(see the sibling test), so a decode here is not a round trip, it is a loss.',
		).toBe(false);
		expect(body).not.toContain('original_text = htmlEntities(original_text)');
	});

	test('the html method reads the body AFTER the page loop, not inside it', () => {
		// `final_text = body.innerHTML` inside the `for` returned '' for any PDF
		// whose parse produced no `a[name]` anchor — which, once the decode above
		// had flattened the markup to plain text, was every PDF.
		const body = processBody();
		const loopStart = body.indexOf('for (let i = 0; i < pages_len; i++)');
		const loopEnd = body.indexOf('final_text = body.innerHTML');
		expect(loopStart, 'the html page loop is gone — re-read this gate').toBeGreaterThan(-1);
		expect(loopEnd, 'the html branch no longer reads body.innerHTML').toBeGreaterThan(-1);
		// NESTING DEPTH, not "is there a closing brace" — the loop body contains
		// `${…}` template placeholders, whose braces balance, so a naive
		// `includes('}')` reads as "the loop closed" from INSIDE it. (Measured: it
		// did, and this test passed against the defect until it counted.)
		let depth = 0;
		for (const char of body.slice(loopStart, loopEnd)) {
			if (char === '{') depth += 1;
			else if (char === '}') depth -= 1;
		}
		expect(
			depth,
			`${EXTRACTOR}: \`final_text = body.innerHTML\` is INSIDE the page loop (depth ${depth}), ` +
				'so a PDF whose parse produced no `a[name]` anchor yields an EMPTY extraction.',
		).toBe(0);
	});
});
