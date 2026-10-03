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
import { htaccessHardeningBlock } from '../../src/core/media/protection.ts';
import {
	buildPublicationHostApacheConf,
	getPublicationHostConfigHash,
	normalizePublicationHostInput,
} from '../../src/core/media/publication_host_rules.ts';

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
