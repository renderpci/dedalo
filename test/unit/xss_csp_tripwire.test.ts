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
 * (4) FEATURE-CONSISTENT (2026-08-08, WC-2026-08-08-csp-connect-src-update-masters):
 *     `connect-src` carries every update master this install is configured to
 *     pull from, and `script-src`/`object-src` carry none of them. Both update
 *     panels interrogate a master FROM THE BROWSER, so a missing origin refuses
 *     the fetch before it leaves and the panel reports a network failure while
 *     the server-to-server probe beside it still says READY. The derivation is
 *     also pinned on SYNTHETIC entries, because a master is configured on a
 *     CLIENT box and not on a MASTER box — i.e. the config-derived half goes
 *     vacuous exactly where this engine is developed.
 */

import { describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { config } from '../../src/config/config.ts';
import {
	APP_CSP,
	deriveUpdateMasterOrigins,
	MEDIA_CSP_OBJECT_SOURCE,
	MEDIA_CSP_ORIGIN,
	SECURITY_HEADERS,
	UPDATE_MASTER_CSP_ORIGINS,
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
		// connect-src tolerates exactly two CONFIG-DERIVED classes, never a
		// hardcoded one: the install's OWN media host (DEDALO_MEDIA_WEB_BASE —
		// split-origin installs fetch the transcription WAV from it) and the
		// update masters it is configured to pull from (ONTOLOGY_SERVERS /
		// CODE_SERVERS — both panels interrogate them FROM THE BROWSER). Anything
		// else with a scheme is a third party and fails here.
		const tolerated = new Set(
			[MEDIA_CSP_ORIGIN, ...UPDATE_MASTER_CSP_ORIGINS].filter((origin) => origin !== ''),
		);
		for (const src of directive(APP_CSP, 'connect-src')) {
			if (tolerated.has(src)) continue;
			expect(src.includes('://'), `connect-src must not allow a remote origin: ${src}`).toBe(false);
		}
	});

	test('every configured update master reaches connect-src — and never script-src', () => {
		// The failure this pins is silent and total: without the master's origin
		// in connect-src the browser refuses the fetch before it leaves, and the
		// update panel dies with `Max retries reached, request failed` while the
		// server-to-server reachability probe beside it still reports the master
		// READY (observed live 2026-08-08). Deriving the list is what keeps a
		// configured master and a reachable master the same set.
		const configured = [...config.ontologyIo.servers, ...config.update.codeServers].filter(
			(entry) => /^https?:\/\//.test(entry.url),
		);
		expect(UPDATE_MASTER_CSP_ORIGINS.length).toBe(
			new Set(configured.map((entry) => new URL(entry.url).origin)).size,
		);
		const connectSrc = directive(APP_CSP, 'connect-src');
		const scriptSrc = directive(APP_CSP, 'script-src');
		for (const origin of UPDATE_MASTER_CSP_ORIGINS) {
			expect(connectSrc, `connect-src must carry the configured master ${origin}`).toContain(
				origin,
			);
			// A master hands us ONTOLOGY DATA. It must never be able to hand us code.
			expect(scriptSrc).not.toContain(origin);
			expect(directive(APP_CSP, 'object-src')).not.toContain(origin);
		}
	});

	test('the master-origin derivation holds on SYNTHETIC entries (box-independent)', () => {
		// A master IS configured on a client box and NOT on a master box, so the
		// assertions above go vacuous exactly where this engine is developed.
		// These pin the rules themselves.
		expect(
			deriveUpdateMasterOrigins([
				{ url: 'https://master.dedalo.dev/dedalo/core/api/v1/json/' },
				{ url: 'http://192.168.1.7:4000/dedalo/core/api/v1/json/' },
			]),
		).toEqual(['https://master.dedalo.dev', 'http://192.168.1.7:4000']);

		// The PATH is dropped: a source carrying one would narrow the policy to
		// that single endpoint and break every other call to the same master.
		expect(deriveUpdateMasterOrigins([{ url: 'https://m.example/a/b/c' }])).toEqual([
			'https://m.example',
		]);

		// Two entries on one host (ontology + code master) collapse to one source.
		expect(
			deriveUpdateMasterOrigins([
				{ url: 'https://m.example/dedalo/core/api/v1/json/' },
				{ url: 'https://m.example/core/api/v1/json/' },
			]),
		).toEqual(['https://m.example']);

		// The port is part of the origin — a master on :4000 does not admit :80.
		expect(deriveUpdateMasterOrigins([{ url: 'http://m.example:4000/x' }])).toEqual([
			'http://m.example:4000',
		]);

		// Nothing unreachable, non-network or malformed widens the policy.
		expect(
			deriveUpdateMasterOrigins([
				{ url: '/relative/path' },
				{ url: '' },
				{ url: 'file:///etc/passwd' },
				{ url: 'javascript:alert(1)' },
				{ url: 'data:text/html,x' },
				{ url: 'not a url at all' },
				{ url: 'https://' },
			]),
		).toEqual([]);
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
			// Any absolute origin still in the policy must then be an update
			// master — the only other config-derived source (asserted above).
			for (const name of ['media-src', 'img-src', 'script-src', 'object-src']) {
				for (const src of directive(APP_CSP, name)) {
					expect(src.includes('://'), `${name} must carry no absolute origin: ${src}`).toBe(false);
				}
			}
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
