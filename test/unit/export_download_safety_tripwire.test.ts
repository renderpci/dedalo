/**
 * TRIPWIRE — an export download does not truncate silently, and does not
 * execute (P2-4 / CLI-25, CLI-31).
 *
 * CLI-25. The HTML export built its data: URL as
 * `'data:text/text;charset=utf-8,' + html.outerHTML` — RAW, while the CSV and
 * TSV siblings 100 lines above both `encodeURIComponent`. A `#` ANYWHERE in the
 * markup begins the URL fragment, so the browser stops reading there and the
 * file still arrives with the expected name, NO error and NO truncation marker.
 * `#` is ordinary in heritage text (`Inv. #1234`), so a curator could export a
 * catalogue and receive a quietly shortened one. The same block also appended
 * `<body>` INSIDE `<head>` and used the invented MIME `text/text`.
 *
 * CLI-31. DIFF-E was fixed on the ENGINE's CSV writer (src/diffusion/writers/
 * csv.ts::csvField, 2026-07-28) and never mirrored onto tool_export's CLIENT
 * writer. A cell beginning =, +, -, @, TAB or CR is EXECUTED AS A FORMULA by
 * Excel, Sheets and LibreOffice, and quoting does not stop it: RFC-4180 quotes
 * delimit a field, they do not make its content literal. So a curator's export
 * of a catalogue whose values a contributor authored was a spreadsheet that
 * could execute on open.
 *
 * ONE RULE, BOTH SIDES. This gate asserts the client writer's neutralization is
 * the engine's — not merely present, but the SAME character class — because the
 * failure mode here is precisely that one side got fixed and the other did not.
 */

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const REPO_ROOT = join(import.meta.dir, '..', '..');
const read = (rel: string): string => readFileSync(join(REPO_ROOT, rel), 'utf8');

const ENGINE_WRITER = 'src/diffusion/writers/csv.ts';
const CLIENT_TABLE = 'tools/tool_export/js/flat_table.js';
const CLIENT_RENDER = 'tools/tool_export/js/render_tool_export.js';

/** The leading characters a spreadsheet treats as the start of a formula. */
const FORMULA_START = /\^\[=\+\\?-@\\t\\r\]/;

describe('an export download is neither truncated nor executable', () => {
	test('the HTML export encodes its payload', () => {
		const source = read(CLIENT_RENDER);
		expect(
			source,
			"raw outerHTML in a data: URL — a '#' in the markup silently truncates the download",
		).not.toContain("'data:text/text;charset=utf-8,' + html.outerHTML");
		const block = source.slice(source.indexOf('data:text/html'));
		expect(block.slice(0, 200)).toContain('encodeURIComponent');
	});

	test('the HTML export declares a real MIME type and a real document', () => {
		const source = read(CLIENT_RENDER);
		expect(source, "'text/text' is not a MIME type").not.toContain('data:text/text');
		expect(source).toContain('data:text/html');
		// <body> is a SIBLING of <head>, not its child.
		expect(source, '<body> was appended inside <head>').not.toContain('head.appendChild(body)');
		expect(source).toContain('html.appendChild(body)');
	});

	test('the client CSV/TSV writer neutralizes formulas AT ALL', () => {
		const source = read(CLIENT_TABLE);
		expect(
			source,
			'tool_export writes CSV/TSV with no formula neutralization — a contributor-authored ' +
				"value becomes code in the curator's spreadsheet on open",
		).toContain('neutralize');
		// It must run on BOTH formats: quoting is not protection.
		const fn = source.slice(source.indexOf('to_delimited = function'));
		const formatBlock = fn.slice(0, 1600);
		expect((formatBlock.match(/neutralize\(/g) ?? []).length).toBeGreaterThanOrEqual(2);
	});

	test('the client rule IS the engine rule, character for character', () => {
		// The whole finding is a DIVERGENCE: one side fixed, one side not. Asserting
		// only that the client has "some" neutralization would let the two drift
		// apart again the next time either is edited.
		const engine = read(ENGINE_WRITER);
		const client = read(CLIENT_TABLE);
		const engineClass = /\/\^\[([^\]]+)\]\//.exec(
			engine.slice(engine.indexOf('export function csvField')),
		)?.[1];
		const clientClass = /\/\^\[([^\]]+)\]\//.exec(
			client.slice(client.indexOf('const neutralize')),
		)?.[1];
		expect(engineClass, 'the engine writer no longer neutralizes').toBeDefined();
		expect(clientClass, 'the client writer no longer neutralizes').toBeDefined();
		expect(
			clientClass,
			`the client writer's formula class (${clientClass}) has drifted from the engine's ` +
				`(${engineClass}). One rule, both sides.`,
		).toBe(engineClass as string);
	});

	test('anti-vacuity: the engine rule this mirrors still exists', () => {
		const engine = read(ENGINE_WRITER);
		expect(engine).toContain('export function csvField');
		expect(engine).toContain('DIFF-E');
		expect(read(CLIENT_TABLE)).toContain('to_delimited = function');
	});
});
