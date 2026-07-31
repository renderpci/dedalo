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
import { config } from '../../src/config/config.ts';
import {
	APP_CSP,
	MEDIA_CSP_OBJECT_SOURCE,
	MEDIA_CSP_ORIGIN,
	SECURITY_HEADERS,
} from '../../src/core/api/static_asset.ts';

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
		// script-src: ABSOLUTE — code loads from this app origin only, ever.
		for (const src of directive(APP_CSP, 'script-src')) {
			expect(src.includes('://'), `script-src must not allow a remote origin: ${src}`).toBe(false);
		}
		// connect-src: the ONE tolerated origin is the install's OWN configured
		// media host (DEDALO_MEDIA_WEB_BASE — split-origin installs fetch the
		// transcription WAV from it). It is config-derived, never hardcoded, and
		// nothing else with a scheme may appear.
		for (const src of directive(APP_CSP, 'connect-src')) {
			if (src === MEDIA_CSP_ORIGIN && MEDIA_CSP_ORIGIN !== '') continue;
			expect(src.includes('://'), `connect-src must not allow a remote origin: ${src}`).toBe(false);
		}
	});

	test('object-src is EXACTLY self + the path-scoped envelope prefix (MEDIA-03)', () => {
		// component_image's default edit view hosts the server-generated SVG
		// envelope as <object type="image/svg+xml"> (client
		// component_image/js/view_default_edit_image.js render_image_node), so
		// `object-src 'none'` rendered every edit-view image blank. What replaces
		// it must stay EXACT, not merely "not obviously bad": <object> opens a
		// nested browsing context, so any source added here is a place an SVG's
		// script can execute. An allowlist, deliberately — a denylist here passed
		// `data:`, `blob:`, `https:` and `*.host.example` unmoved (each is one
		// whitespace-split token containing neither '*' alone nor '://'), i.e. it
		// would have been green for exactly the widenings it advertised guarding.
		// The header selection this leans on is gated corpus-independently by
		// media_serving.test.ts::svgSafetyHeaders (the MEDIA-03 route cases there
		// need an .svg on disk and SKIP without one).
		const objectSrc = directive(APP_CSP, 'object-src');
		expect(objectSrc).toEqual(
			MEDIA_CSP_OBJECT_SOURCE === '' ? ["'self'"] : ["'self'", MEDIA_CSP_OBJECT_SOURCE],
		);
		if (MEDIA_CSP_OBJECT_SOURCE !== '') {
			// Path-scoped to the envelope folder — never the bare media host, which
			// also serves uploader-supplied svg/ files with no sandbox/CSP (the
			// generated rules emit no headers). A trailing '/' is what makes CSP
			// treat it as a prefix rather than one exact file.
			expect(MEDIA_CSP_OBJECT_SOURCE.startsWith(`${MEDIA_CSP_ORIGIN}/`)).toBe(true);
			expect(MEDIA_CSP_OBJECT_SOURCE.endsWith(`${config.media.image.folder}/`)).toBe(true);
			expect(objectSrc).not.toContain(MEDIA_CSP_ORIGIN);
		}
	});

	test('the configured media origin reaches media/img/connect — and never script', () => {
		if (MEDIA_CSP_ORIGIN === '') {
			// Same-origin install: 'self' covers media; nothing to add anywhere.
			expect(APP_CSP.includes('http://')).toBe(false);
			return;
		}
		for (const name of ['media-src', 'img-src', 'connect-src']) {
			expect(
				directive(APP_CSP, name),
				`${name} must carry the configured media origin (split-origin installs play no media without it)`,
			).toContain(MEDIA_CSP_ORIGIN);
		}
		expect(directive(APP_CSP, 'script-src')).not.toContain(MEDIA_CSP_ORIGIN);
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
