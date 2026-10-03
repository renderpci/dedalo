/**
 * The PUBLICATION-HOST media rule profile (src/core/media/publication_host_rules.ts):
 * input refusal, the config hash, the Apache include, the nginx include. PURE builders,
 * so no media tree and no filesystem. Spec: engineering/PUBLICATION_HOST_SPEC.md §5.1.
 * The filename lockstep with the work profile is the tripwire's job
 * (media_protection_tripwire.test.ts), not this file's.
 */

import { describe, expect, test } from 'bun:test';
import { config } from '../../src/config/config.ts';
import { DedaloError } from '../../src/core/errors/dedalo_error.ts';
import {
	htaccessHardeningBlock,
	MEDIA_SCRIPT_DENY_PATTERN,
	nginxHardeningLocations,
} from '../../src/core/media/protection.ts';
import {
	buildPublicationHostApacheConf,
	buildPublicationHostNginxConf,
	getPublicationHostConfigHash,
	normalizePublicationHostInput,
} from '../../src/core/media/publication_host_rules.ts';
import { MEDIA_ACTIVE_DOCUMENT_EXTENSIONS } from '../../src/core/media/svg_safety.ts';

const ROOT = '/srv/dedalo_media_ro';
const QUALITIES = ['image/thumb', 'av/404'];
const MEDIA_URL = `/dedalo/${config.mediaDir}`;

function refusal(fn: () => unknown): DedaloError {
	try {
		fn();
	} catch (error) {
		if (error instanceof DedaloError) return error;
		throw error;
	}
	throw new Error('expected a DedaloError refusal, got none');
}

describe('normalizePublicationHostInput', () => {
	test('trailing slashes are stripped from the root', () => {
		expect(normalizePublicationHostInput({ root: `${ROOT}//`, qualities: QUALITIES }).root).toBe(
			ROOT,
		);
	});

	test.each([
		['/', 'the filesystem root'],
		['srv/media', 'a relative path'],
		['/srv/../etc', 'a .. segment'],
		['/srv/./media', 'a . segment'],
		['/srv/my media', 'a space (unquoted in nginx `if (-f …)`)'],
		['/srv/"media', 'a quote (breaks the Apache directive)'],
		['/srv/media\nRewriteEngine Off', 'a newline (config injection)'],
	])('root %p is refused (%s)', (root) => {
		expect(refusal(() => normalizePublicationHostInput({ root, qualities: QUALITIES })).code).toBe(
			'request.invalid_options',
		);
	});

	test('a master tier is dropped AND reported, never silently', () => {
		const result = normalizePublicationHostInput({
			root: ROOT,
			qualities: ['image/thumb', 'image/original'],
		});
		expect(result.qualities).toEqual(['image/thumb']);
		expect(result.dropped).toEqual(['image/original']);
	});

	test('a list with nothing public left is refused: a host that may serve nothing is a misconfiguration', () => {
		expect(
			refusal(() =>
				normalizePublicationHostInput({ root: ROOT, qualities: ['image/original', 'image'] }),
			).code,
		).toBe('request.invalid_options');
	});
});

describe('getPublicationHostConfigHash', () => {
	const base = normalizePublicationHostInput({ root: ROOT, qualities: QUALITIES });

	test('identical inputs hash identically', () => {
		expect(getPublicationHostConfigHash('apache', base)).toBe(
			getPublicationHostConfigHash('apache', base),
		);
	});

	test('root, qualities and server each change the hash', () => {
		const h = getPublicationHostConfigHash('apache', base);
		const otherRoot = normalizePublicationHostInput({ root: '/srv/other', qualities: QUALITIES });
		const otherQ = normalizePublicationHostInput({ root: ROOT, qualities: ['image/thumb'] });
		expect(getPublicationHostConfigHash('apache', otherRoot)).not.toBe(h);
		expect(getPublicationHostConfigHash('apache', otherQ)).not.toBe(h);
		expect(getPublicationHostConfigHash('nginx', base)).not.toBe(h);
	});
});

describe('buildPublicationHostApacheConf', () => {
	const text = buildPublicationHostApacheConf({ root: ROOT, qualities: QUALITIES });
	const normalized = normalizePublicationHostInput({ root: ROOT, qualities: QUALITIES });

	test('embeds its own config hash', () => {
		expect(text).toContain(`# config-hash: ${getPublicationHostConfigHash('apache', normalized)}`);
	});

	test('maps the SAME media URL as the work host onto the host root, with overrides off', () => {
		expect(text).toContain(`Alias ${MEDIA_URL} "${ROOT}"`);
		expect(text).toContain(`<Directory "${ROOT}">`);
		// The work host's .htaccess lives on the shared tree; it must never be read here.
		expect(text).toContain('\tAllowOverride None');
	});

	test('Rule B stats the HOST root and stays the RewriteCond/RewriteRule pair', () => {
		const lines = text.split('\n');
		const cond = lines.indexOf(`RewriteCond "${ROOT}/.publication/pub/$1_$2" -f`);
		expect(cond).toBeGreaterThan(-1);
		expect(lines[cond + 1]).toStartWith('RewriteRule ^(?:image/thumb|av/404)/');
	});

	test('the gate is NOT wrapped in <IfModule>: no mod_rewrite = no boot, never ungated', () => {
		// Everything AFTER the shared hardening block (whose own IfModule wrappers are
		// belts, not the gate) must be bare: an opener right before RewriteEngine counts.
		const hardening = htaccessHardeningBlock();
		const at = text.indexOf(hardening);
		expect(at).toBeGreaterThan(-1);
		const gate = text.slice(at + hardening.length);
		expect(gate).not.toContain('IfModule');
		expect(gate).toStartWith('\nRewriteEngine On\n# 0. The marker store itself is never served.');
	});

	test('default deny is the last rule, as 404, inside the Directory', () => {
		expect(text.trimEnd()).toEndWith('RewriteRule ^ - [R=404,L]\n</Directory>');
	});

	test('carries the always-on hardening block (SEC-088, MEDIA-03)', () => {
		expect(text).toContain('# SEC-088: block script execution inside the media root.');
		expect(text).toContain('X-Content-Type-Options');
	});

	test('carries NO Rule A: work-session cookies are never honoured publicly', () => {
		expect(text).not.toContain('dedalo_media_auth');
		expect(text).not.toContain('.publication/auth/');
	});
});

describe('buildPublicationHostNginxConf', () => {
	const text = buildPublicationHostNginxConf({ root: ROOT, qualities: QUALITIES });
	const normalized = normalizePublicationHostInput({ root: ROOT, qualities: QUALITIES });

	test('embeds its own config hash (distinct from the Apache one)', () => {
		expect(text).toContain(`# config-hash: ${getPublicationHostConfigHash('nginx', normalized)}`);
	});

	test('the marker store is denied with a nested ^~ so no regex can reach it', () => {
		expect(text).toContain(`\tlocation ^~ ${MEDIA_URL}/.publication/ { deny all; return 404; }`);
	});

	test('Rule B is a DOUBLE-QUOTED regex location that stats the HOST root and aliases into it', () => {
		const line = text.split('\n').find((l) => l.startsWith('\tlocation ~ "^/dedalo/'));
		expect(line).toBeDefined();
		expect(line).toEndWith('" {');
		expect(text).toContain(
			`\t\tif (!-f ${ROOT}/.publication/pub/\${dd_s}_\${dd_i}) { return 404; }`,
		);
		expect(text).toContain(`\t\talias ${ROOT}/$dd_path;`);
	});

	test('ONE outer ^~ prefix holds every location, default return 404: no server regex can win', () => {
		// A plain-prefix catch-all lost to ANY server-level regex location (an operator's
		// `location ~* \.(jpg|mp4)$`), which then served masters/unpublished files from root.
		const lines = text.split('\n');
		const opener = `location ^~ ${MEDIA_URL}/ {`;
		const top = lines.filter((l) => l.startsWith('location'));
		expect(top).toEqual([opener]);
		const body = lines.slice(lines.indexOf(opener) + 1);
		const close = body.indexOf('}');
		expect(close).toBeGreaterThan(-1);
		expect(body.slice(close + 1).every((l) => l === '')).toBe(true);
		expect(body.slice(0, close).every((l) => l === '' || l.startsWith('\t'))).toBe(true);
		expect(
			body
				.slice(0, close)
				.filter((l) => l !== '')
				.at(-1),
		).toBe('\treturn 404;');
	});

	test('the hardening is protection.ts nginxHardeningLocations, nested verbatim (never a copy)', () => {
		const nested = nginxHardeningLocations(MEDIA_URL)
			.map((l) => (l === '' ? '' : `\t${l}`))
			.join('\n');
		expect(text).toContain(nested);
	});

	test('script and active-document extensions are denied as 404, whole location pinned', () => {
		const esc = MEDIA_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
		expect(text).toContain(
			`\tlocation ~* ^${esc}/.+\\.(${MEDIA_SCRIPT_DENY_PATTERN})$ {\n\t\tdeny all;\n\t\treturn 404;\n\t}`,
		);
		expect(text).toContain(
			`\tlocation ~* ^${esc}/.+\\.(${MEDIA_ACTIVE_DOCUMENT_EXTENSIONS.join('|')})$ {\n\t\tdeny all;\n\t\treturn 404;\n\t}`,
		);
		// the active-document deny precedes Rule B (regex locations match in order)
		expect(text.indexOf('(html|')).toBeLessThan(text.indexOf('(?<dd_path>'));
	});

	test('the byte-serving location carries the MEDIA-03 headers and mp4 clipping', () => {
		expect(text).toContain('add_header Content-Security-Policy $dedalo_svg_csp always;');
		expect(text).toContain('\tmp4;');
	});

	test('carries NO Rule A', () => {
		expect(text).not.toContain('$dedalo_auth_key');
		expect(text).not.toContain('.publication/auth/');
	});
});
