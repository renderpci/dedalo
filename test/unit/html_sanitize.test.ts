/**
 * XSS-01 defense-in-depth sanitizer (2026-07-28 audit). Adversarial: each test
 * is a real stored-XSS payload that must be neutralized, plus proof that
 * legitimate CKEditor formatting survives (the sanitizer must not eat content).
 * The CSP is the primary control; this reduces the stored attack surface.
 */

import { describe, expect, test } from 'bun:test';
import { sanitizeRichText } from '../../src/core/security/html_sanitize.ts';

describe('sanitizeRichText — removes executable constructs', () => {
	test('strips inline event handlers', () => {
		expect(sanitizeRichText('<img src=x onerror="alert(1)">')).not.toMatch(/onerror/i);
		expect(sanitizeRichText("<a href='#' onclick='steal()'>x</a>")).not.toMatch(/onclick/i);
		expect(sanitizeRichText('<div onmouseover=alert(1)>x</div>')).not.toMatch(/onmouseover/i);
	});

	test('removes <script> and <style> with their content', () => {
		expect(sanitizeRichText('a<script>alert(1)</script>b')).toBe('ab');
		expect(sanitizeRichText('a<style>body{x:url(javascript:1)}</style>b')).toBe('ab');
		expect(sanitizeRichText('a<script>unterminated')).toBe('a');
	});

	test('removes embedding elements (iframe/object/embed/svg/form)', () => {
		for (const tag of ['iframe', 'object', 'embed', 'svg', 'form', 'meta', 'base']) {
			const out = sanitizeRichText(`x<${tag} src="evil">y</${tag}>z`);
			expect(out, `${tag} tag must be gone`).not.toMatch(new RegExp(`<${tag}`, 'i'));
		}
	});

	test('neutralizes javascript:/vbscript:/data:text/html URLs', () => {
		expect(sanitizeRichText('<a href="javascript:alert(1)">x</a>')).not.toMatch(/javascript:/i);
		expect(sanitizeRichText('<a href="vbscript:msgbox">x</a>')).not.toMatch(/vbscript:/i);
		expect(sanitizeRichText('<a href="data:text/html,<script>">x</a>')).not.toMatch(
			/data:text\/html/i,
		);
		// Whitespace/control-char evasion inside the scheme is collapsed first.
		expect(sanitizeRichText('<a href="java\tscript:alert(1)">x</a>')).not.toMatch(
			/java\s*script:/i,
		);
	});
});

describe('sanitizeRichText — preserves legitimate CKEditor formatting', () => {
	test('keeps formatting tags, links, images, tables', () => {
		const legit =
			'<p><b>Bold</b> <i>italic</i> <a href="https://example.org">link</a></p>' +
			'<img src="/dedalo/media/x.jpg" alt="pic"><ul><li>one</li></ul>' +
			'<table><tr><td>cell</td></tr></table>';
		const out = sanitizeRichText(legit);
		expect(out).toContain('<b>Bold</b>');
		expect(out).toContain('<a href="https://example.org">');
		expect(out).toContain('<img src="/dedalo/media/x.jpg"');
		expect(out).toContain('<td>cell</td>');
	});

	test('non-strings and empty pass through', () => {
		expect(sanitizeRichText('')).toBe('');
		expect(sanitizeRichText('plain text, no tags')).toBe('plain text, no tags');
	});
});
