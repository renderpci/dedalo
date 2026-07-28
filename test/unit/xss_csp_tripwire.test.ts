/**
 * TRIPWIRE: the app Content-Security-Policy stays XSS-safe and boot-consistent
 * (XSS-02, 2026-07-28 audit).
 *
 * (1) SECURITY-CRITICAL: `script-src` carries NEITHER `'unsafe-inline'` NOR
 *     `'unsafe-hashes'`. That absence is what makes an injected inline handler
 *     (`<img onerror=…>`), inline `<script>` or `javascript:` URL non-executing
 *     — the whole compensating control for stored XSS through CKEditor
 *     rich-text (component_text_area). A future "just add 'unsafe-inline' to fix
 *     a widget" edit re-opens the class; it fails here first.
 * (2) BOOT-CONSISTENT: the `'sha256-…'` in `script-src` equals a fresh hash of
 *     the ONE inline script the page ships (index.html's importmap). If that
 *     block is edited without updating the hash, the browser refuses the
 *     importmap and the app does not boot — caught here, not in production.
 * (3) The CSP is actually applied (present in SECURITY_HEADERS).
 */

import { describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { APP_CSP, SECURITY_HEADERS } from '../../src/core/api/static_asset.ts';

const ROOT = join(import.meta.dir, '..', '..');

/** The one directive's source list, e.g. script-src → ["'self'", "blob:", …]. */
function directive(csp: string, name: string): string[] {
	const seg = csp.split(';').find((s) => s.trim().startsWith(`${name} `));
	return seg ? seg.trim().slice(name.length).trim().split(/\s+/) : [];
}

describe('XSS-02 — enforcing app CSP', () => {
	test('script-src forbids unsafe-inline / unsafe-hashes (the stored-XSS control)', () => {
		const scriptSrc = directive(APP_CSP, 'script-src');
		expect(scriptSrc.length).toBeGreaterThan(0);
		expect(scriptSrc).not.toContain("'unsafe-inline'");
		expect(scriptSrc).not.toContain("'unsafe-hashes'");
	});

	test('no third-party origin in script-src / connect-src (no-remote-code, RC-01)', () => {
		for (const name of ['script-src', 'connect-src']) {
			for (const src of directive(APP_CSP, name)) {
				expect(src.includes('://'), `${name} must not allow a remote origin: ${src}`).toBe(false);
			}
		}
	});

	test('the importmap hash matches index.html (edit without rehash = no boot)', () => {
		const html = readFileSync(join(ROOT, 'client/dedalo/core/page/index.html'), 'utf8');
		const match = html.match(/<script type="importmap">([\s\S]*?)<\/script>/);
		const importmap = match?.[1];
		expect(importmap, 'index.html must ship exactly one importmap').toBeString();
		const fresh = `sha256-${createHash('sha256')
			.update(importmap ?? '')
			.digest('base64')}`;
		expect(
			APP_CSP.includes(`'${fresh}'`),
			`APP_CSP script-src must carry the importmap hash '${fresh}'`,
		).toBe(true);
	});

	test('the CSP is actually served', () => {
		expect(SECURITY_HEADERS['Content-Security-Policy']).toBe(APP_CSP);
	});
});
