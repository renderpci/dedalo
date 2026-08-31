/**
 * TRIPWIRE — every record-authored URL passes ONE scheme allowlist
 * (P2-6 / CARRY-02, XSS-04).
 *
 * A record's value reaches `href`, `src` and — newly found by the deep audit —
 * `window.open(input_iri.value)`, with no scheme check anywhere. A
 * `javascript:` URL in `window.open` EXECUTES in the window this page opens,
 * and the app CSP does not reach it: a contributor who can write an IRI could
 * run script in a curator's session by getting them to click the link button.
 *
 * XSS-04's scheme allowlist was PRESCRIBED on 2026-07-28 and never shipped.
 * What changed since is that the now-enforcing APP_CSP makes injected script
 * non-executing in-app, which is why this class is S3 today rather than S2 —
 * and a CSP is one header away from being the only control. Defence in depth is
 * the entire point.
 *
 * ALLOWLIST, NEVER A BLOCKLIST. `javascript:` has too many spellings to deny:
 * the URL parser strips leading control characters and whitespace, the scheme
 * is case-insensitive, and HTML entities decode before the URL is read. Naming
 * what is PERMITTED needs none of that.
 *
 * AT THE SINK, NOT AT THE CALLERS. The audit found a FOURTH sink in this class;
 * checking at each caller is exactly how the third and fourth were missed.
 */

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const REPO_ROOT = join(import.meta.dir, '..', '..');
const read = (rel: string): string => readFileSync(join(REPO_ROOT, rel), 'utf8');

const UTIL = 'client/dedalo/core/common/js/utils/util.js';
const UI = 'client/dedalo/core/common/js/ui.js';
const IRI = 'client/dedalo/core/component_iri/js/render_edit_component_iri.js';

/** Load the real `safe_url` out of the browser module, without a DOM. */
function loadSafeUrl(): (value: unknown) => string | null {
	const source = read(UTIL);
	const start = source.indexOf('export const safe_url');
	const body = source.slice(start, source.indexOf('}//end safe_url') + 1);
	const factory = new Function(
		'window',
		'URL',
		`return ${body.slice(body.indexOf('function(value)'))}`,
	);
	return factory({ location: { origin: 'https://example.org' } }, URL) as (
		value: unknown,
	) => string | null;
}

describe('one scheme allowlist, at the URL sinks', () => {
	const safeUrl = loadSafeUrl();

	test('every javascript: spelling is refused', () => {
		// The spellings a BLOCKLIST would have to enumerate, and why one is not
		// used: the parser normalizes all of these before the scheme is read.
		const TAB = String.fromCharCode(9);
		const NEWLINE = String.fromCharCode(10);
		for (const hostile of [
			'javascript:alert(1)',
			'JaVaScRiPt:alert(1)',
			`java${TAB}script:alert(1)`,
			`java${NEWLINE}script:alert(1)`,
			' javascript:alert(1)',
			'vbscript:msgbox(1)',
			'data:text/html,<script>alert(1)</script>',
		]) {
			expect(safeUrl(hostile), `${JSON.stringify(hostile)} was permitted`).toBeNull();
		}
	});

	test('the URLs an archive actually uses are permitted', () => {
		// A gate that refuses everything is not a gate — and this one guards the
		// link button a curator presses on ordinary catalogue records.
		for (const legitimate of [
			'https://viaf.org/viaf/12345',
			'http://example.org/x?y=1#frag',
			'mailto:archivist@example.org',
			'/dedalo/core/page/?tipo=test3',
			'ftp://files.example.org/scan.tif',
		]) {
			expect(safeUrl(legitimate), `${legitimate} was refused`).toBe(legitimate);
		}
	});

	test('non-strings and empties are refused, not coerced', () => {
		for (const junk of [null, undefined, 42, {}, '', '   ']) {
			expect(safeUrl(junk)).toBeNull();
		}
	});

	test('the IRI link button goes through the allowlist', () => {
		const source = read(IRI);
		expect(
			source,
			'window.open on a record-authored value with no scheme check — a javascript: URL ' +
				'executes there and the CSP does not reach it',
		).not.toMatch(/window\.open\(\s*input_iri\.value/);
		expect(source).toContain('safe_url(input_iri.value)');
	});

	test('the shared DOM builder guards href AND src', () => {
		const source = read(UI);
		// Both sinks, at the ONE place every caller shares.
		expect(source).toMatch(/const href = safe_url\(options\.href\)/);
		expect(source).toMatch(/const src = safe_url\(options\.src\)/);
		expect(source, 'a raw assignment bypasses the allowlist').not.toMatch(
			/element\.href = options\.href/,
		);
		expect(source).not.toMatch(/element\.src = options\.src/);
	});

	test('the allowlist is an allowlist (anti-vacuity on the rule itself)', () => {
		// If this ever becomes a blocklist, every assertion above still passes
		// while the guarantee is gone — a denied-list is only as good as its
		// enumeration, which is the thing that cannot be got right.
		const source = read(UTIL);
		const fn = source.slice(source.indexOf('export const safe_url'));
		expect(fn.slice(0, 2500)).toMatch(/allowed\s*=\s*\[/);
		expect(fn.slice(0, 2500)).toMatch(/allowed\.includes\(/);
	});
});
