/**
 * Media protection, Rule A (src/core/media/protection.ts) — the behavior gate.
 *
 * Covers the mode resolver, the public-quality hard filter, the generated rule text for
 * every mode, the config-hash idempotency guard, and the auth-marker/cookie lifecycle.
 *
 * Everything runs against a per-test temp dir through the guarded
 * overrideMediaProtectionPathsForTests seam (it REFUSES non-temp paths), so a test can
 * never write to the real media tree — a stray syncAuthMarkers() against the live store
 * would rotate out every real marker and 404 every logged-in user's media until they
 * logged in again.
 *
 * The lockstep between the three enforcement surfaces is a separate, registered tripwire:
 * media_protection_tripwire.test.ts.
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	readdirSync,
	rmSync,
	statSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
	MEDIA_AUTH_COOKIE,
	buildHtaccess,
	buildNginxConf,
	filterPublicQualities,
	getConfigHash,
	getDefaultPublicQualities,
	getPublicQualities,
	getRulesStatus,
	initMediaAuthCookie,
	mintAuthCookieValue,
	overrideMediaProtectionPathsForTests,
	readAuthStore,
	resolveMediaAccessMode,
	ruleFilePaths,
	syncAuthMarkers,
	syncAuthMarkersFromStore,
	writeAuthStore,
	writeRuleFiles,
} from '../../src/core/media/protection.ts';
import { getServerState, setServerState } from '../../src/core/resolve/server_state.ts';

let scratch: string;
let mediaRoot: string;
let authStore: string;

const HEX_A = 'a'.repeat(128);
const HEX_B = 'b'.repeat(128);

beforeEach(() => {
	scratch = mkdtempSync(join(tmpdir(), 'dedalo_media_prot_'));
	mediaRoot = join(scratch, 'media');
	authStore = join(scratch, 'private', 'media_auth.json');
	mkdirSync(mediaRoot, { recursive: true });
	overrideMediaProtectionPathsForTests({ mediaRoot, authStorePath: authStore });
	// DEDALO_TS_STATE_PATH already points at a per-run scratch file (test/preload), so
	// touching the override here can never reach the live server state.
	setServerState({ media_access_mode: null });
});

afterEach(() => {
	setServerState({ media_access_mode: null });
	overrideMediaProtectionPathsForTests(null);
	rmSync(scratch, { recursive: true, force: true });
});

describe('the test seam refuses to touch a real media tree', () => {
	test('a non-temp path is rejected outright', () => {
		expect(() =>
			overrideMediaProtectionPathsForTests({
				mediaRoot: '/var/www/dedalo/media',
				authStorePath: '/tmp/x/media_auth.json',
			}),
		).toThrow(/temp-dir paths/);
		// restore the scratch override the beforeEach installed
		overrideMediaProtectionPathsForTests({ mediaRoot, authStorePath: authStore });
	});
});

describe('mode resolution', () => {
	test('the ts_state override wins over the .env layer', () => {
		setServerState({ media_access_mode: 'publication' });
		expect(resolveMediaAccessMode()).toBe('publication');
	});

	test('an explicit `false` override is OFF — it does NOT fall through to .env', () => {
		// The nastiest bug in the resolver: writing `override ?? configValue` is correct,
		// but `override || configValue` would flip an operator's explicit OFF back on, and
		// the reverse mistake would silently disable a configured install. Pin both.
		setServerState({ media_access_mode: false });
		expect(resolveMediaAccessMode()).toBe(false);
	});

	test('null means "no override" — the .env layer decides', () => {
		setServerState({ media_access_mode: null });
		// The catalog value is whatever this test env configures; the contract under test
		// is only that a null override defers to it rather than forcing false.
		const { config } = require('../../src/config/config.ts');
		expect(resolveMediaAccessMode()).toBe(config.features.mediaAccessMode);
	});

	test('a garbage override value fails CLOSED to false, never to a mode', () => {
		setServerState({ media_access_mode: 'publicaton' as unknown as 'publication' });
		expect(resolveMediaAccessMode()).toBe(false);
	});

	test('the resolver is never memoized — a mode change is visible immediately', () => {
		// This Bun process lives for weeks. A module-level cache here would make the
		// widget report success while the server kept serving the old mode until restart.
		setServerState({ media_access_mode: 'private' });
		expect(resolveMediaAccessMode()).toBe('private');
		setServerState({ media_access_mode: 'publication' });
		expect(resolveMediaAccessMode()).toBe('publication');
	});
});

describe('public qualities (rule B folder allowlist)', () => {
	test('defaults are DERIVED from the install quality catalog', () => {
		const defaults = getDefaultPublicQualities();
		expect(defaults).toContain('image/thumb');
		expect(defaults).toContain('av/posterframe');
		expect(defaults).toContain('pdf/web');
		// masters are never in the default set
		expect(defaults).not.toContain('image/original');
		expect(defaults).not.toContain('image/modified');
	});

	test('master/work qualities are refused even when explicitly configured', () => {
		// The single worst config mistake: publishing the masters. 16-32 GB source files,
		// anonymously. The filter must beat the configuration, not defer to it.
		expect(
			filterPublicQualities([
				'original',
				'image/original',
				'image/modified',
				'foo/original/bar',
				'image/thumb',
			]),
		).toEqual(['image/thumb']);
	});

	test('traversal and hostile charsets are refused', () => {
		expect(
			filterPublicQualities(['image/../../etc', '..', 'image/1.5MB;rm -rf /', 'image/thumb', '']),
		).toEqual(['image/thumb']);
	});

	test('the live list never contains a master quality, whatever the config says', () => {
		for (const quality of getPublicQualities()) {
			expect(quality.split('/')).not.toContain('original');
			expect(quality.split('/')).not.toContain('modified');
		}
	});
});

describe('the generated Apache rules', () => {
	test("mode 'off' keeps the hardening but adds NO access gate", () => {
		// If 'off' ever UNLINKS the rule file instead of writing this, the media root —
		// full of user-uploaded files — becomes a directory where Apache will execute an
		// uploaded .php. That is an RCE, not a permissions nit.
		const text = buildHtaccess('off');
		expect(text).toContain('Require all denied');
		expect(text).toContain('Options -Indexes -ExecCGI');
		// The marker store stays denied even with protection off (auth/ filenames are live
		// credentials), but nothing GATES media access:
		expect(text).toContain('\\.publication');
		expect(text).not.toContain(MEDIA_AUTH_COOKIE);
		expect(text).not.toContain('/.publication/pub/');
		expect(text).not.toContain('RewriteRule ^ - [R=404,L]'); // no default deny
	});

	test("mode 'private' gates on the auth cookie and denies everything else as 404", () => {
		const text = buildHtaccess('private');
		expect(text).toContain(`${MEDIA_AUTH_COOKIE}=([a-f0-9]{128})`);
		expect(text).toContain('/.publication/auth/%1" -f');
		expect(text).toContain('RewriteRule (^|/)\\.publication(/|$) - [R=404,L]');
		// 404, never 403: the existence of unpublished media is not disclosed.
		expect(text).toContain('RewriteRule ^ - [R=404,L]');
		expect(text).not.toContain('/.publication/pub/');
	});

	test("mode 'publication' adds the pub-marker rule with the $1_$2 backreference", () => {
		const text = buildHtaccess('publication', ['image/thumb']);
		// THE documented real bug: %1 would reference rule A's last RewriteCond capture,
		// not this rule's. It must be $1_$2, and the RewriteRule must immediately follow.
		expect(text).toContain('/.publication/pub/$1_$2" -f');
		expect(text).not.toContain('%1_%2');
		const lines = text.split('\n');
		const condIndex = lines.findIndex((line) => line.includes('/.publication/pub/$1_$2'));
		expect(lines[condIndex + 1]).toStartWith('RewriteRule ^(?:');
	});

	test('quality folders are regex-escaped in the alternation', () => {
		// Unescaped, `image/1.5MB` also matches `image/1x5MB`.
		const text = buildHtaccess('publication', ['image/1.5MB']);
		expect(text).toContain('image/1\\.5MB');
	});
});

describe('the generated nginx rules', () => {
	test('the rule-A location is a PLAIN prefix, never ^~', () => {
		// `^~` on the catch-all makes nginx stop before ever consulting the rule-B regex
		// location, and every anonymous request for published media 404s.
		const text = buildNginxConf('publication', ['image/thumb']);
		expect(text).toContain('location /dedalo/media/ {');
		expect(text).not.toContain('location ^~ /dedalo/media/ {');
	});

	test('the marker store is denied with ^~ so no regex can reach it', () => {
		expect(buildNginxConf('private')).toContain('location ^~ /dedalo/media/.publication/');
	});

	test('rule B uses NAMED captures (the inner `if` resets numeric ones)', () => {
		const text = buildNginxConf('publication', ['image/thumb']);
		expect(text).toContain('(?<dd_s>[a-z0-9]+)');
		expect(text).toContain('(?<dd_i>[0-9]+)');
		expect(text).toContain('pub/${dd_s}_${dd_i}');
	});

	test('the SEC-088 script block is emitted in EVERY mode, including off', () => {
		for (const mode of ['off', 'private', 'publication'] as const) {
			expect(buildNginxConf(mode, ['image/thumb'])).toContain('phps?|phtml|phar');
		}
	});
});

describe('the config-hash idempotency guard', () => {
	test('identical inputs produce identical bytes', () => {
		expect(buildHtaccess('private')).toBe(buildHtaccess('private'));
	});

	test('the hash changes with the mode and with the quality list', () => {
		const a = getConfigHash('private', [], []);
		const b = getConfigHash('publication', [], []);
		const c = getConfigHash('publication', ['image/thumb'], []);
		expect(a).not.toBe(b);
		expect(b).not.toBe(c);
	});

	test('writeRuleFiles rewrites only when the config actually changed', () => {
		setServerState({ media_access_mode: 'private' });
		writeRuleFiles();
		const paths = ruleFilePaths();
		expect(paths).not.toBeNull();
		if (paths === null) return;

		const firstWrite = statSync(paths.htaccess).mtimeMs;
		const firstText = readFileSync(paths.htaccess, 'utf8');
		expect(firstText).toContain('# config-hash: ');

		// Same config → no rewrite at all (the normal login path is a no-op).
		writeRuleFiles();
		expect(statSync(paths.htaccess).mtimeMs).toBe(firstWrite);

		// Changed config → rewritten.
		writeRuleFiles('publication');
		expect(readFileSync(paths.htaccess, 'utf8')).not.toBe(firstText);
	});

	test('getRulesStatus reports up_to_date honestly', () => {
		setServerState({ media_access_mode: 'private' });
		writeRuleFiles();
		expect(getRulesStatus().htaccess.up_to_date).toBe(true);

		// Simulate a config drift: the file on disk carries another mode's hash.
		const paths = ruleFilePaths();
		if (paths === null) throw new Error('media root not configured');
		writeFileSync(paths.htaccess, '# config-hash: stale\n');
		expect(getRulesStatus().htaccess.up_to_date).toBe(false);
	});
});

describe('the auth markers (rule A)', () => {
	test('markers are laid for the valid values and stale ones are rotated out', () => {
		const authDir = join(mediaRoot, '.publication', 'auth');
		mkdirSync(authDir, { recursive: true });
		writeFileSync(join(authDir, 'c'.repeat(128)), ''); // yesterday's yesterday

		syncAuthMarkers([HEX_A, HEX_B]);

		expect(readdirSync(authDir).sort()).toEqual([HEX_A, HEX_B].sort());
	});

	test('anything that is not sha512 hex is refused — the value becomes a FILENAME', () => {
		// This is the path-traversal guard. A loosened pattern here lets a crafted cookie
		// stat any file on the box.
		syncAuthMarkers([
			'../../../etc/passwd',
			'..',
			'',
			'abc',
			'A'.repeat(128), // uppercase
			'g'.repeat(128), // non-hex
			'a'.repeat(127), // one short
			HEX_A,
		]);
		const authDir = join(mediaRoot, '.publication', 'auth');
		expect(readdirSync(authDir)).toEqual([HEX_A]);
		expect(existsSync(join(scratch, 'etc'))).toBe(false);
	});

	test('the auth marker dir is not world-readable (its filenames ARE credentials)', () => {
		syncAuthMarkers([HEX_A]);
		const mode = statSync(join(mediaRoot, '.publication', 'auth')).mode & 0o777;
		expect(mode & 0o007).toBe(0);
	});

	test('minted values match the pattern the web server validates, and are unique', () => {
		const values = new Set(Array.from({ length: 50 }, () => mintAuthCookieValue()));
		expect(values.size).toBe(50);
		for (const value of values) expect(value).toMatch(/^[a-f0-9]{128}$/);
	});
});

describe('the login hook (initMediaAuthCookie)', () => {
	test('mode false is a TOTAL no-op: no cookie, no markers, no rule files', () => {
		setServerState({ media_access_mode: false });
		expect(initMediaAuthCookie()).toBeNull();
		expect(existsSync(join(mediaRoot, '.publication'))).toBe(false);
		expect(existsSync(join(mediaRoot, '.htaccess'))).toBe(false);
	});

	test("mode 'private' mints a cookie, lays its marker and writes the rules", () => {
		setServerState({ media_access_mode: 'private' });
		const value = initMediaAuthCookie();
		expect(value).toMatch(/^[a-f0-9]{128}$/);
		if (value === null) return;
		expect(existsSync(join(mediaRoot, '.publication', 'auth', value))).toBe(true);
		expect(existsSync(join(mediaRoot, '.htaccess'))).toBe(true);
	});

	test('a second login the same day RECYCLES the value (it does not rotate everyone out)', () => {
		setServerState({ media_access_mode: 'private' });
		const first = initMediaAuthCookie();
		const second = initMediaAuthCookie();
		expect(second).toBe(first);
	});

	test('today AND yesterday stay valid, so sessions do not break at midnight', () => {
		setServerState({ media_access_mode: 'private' });
		initMediaAuthCookie();
		const store = readAuthStore();
		expect(store).not.toBeNull();
		expect(Object.keys(store ?? {})).toHaveLength(2);
		// both values have markers
		const authDir = join(mediaRoot, '.publication', 'auth');
		expect(readdirSync(authDir)).toHaveLength(2);
	});

	test('the auth store is written 0600 — it holds live credentials', () => {
		setServerState({ media_access_mode: 'private' });
		initMediaAuthCookie();
		expect(statSync(authStore).mode & 0o777).toBe(0o600);
	});

	test('it REFUSES to write the auth store inside the media root', () => {
		// A served auth store is the worst failure in the subsystem: anyone could fetch
		// today's value and read the whole tree for up to 48h.
		overrideMediaProtectionPathsForTests({
			mediaRoot,
			authStorePath: join(mediaRoot, 'media_auth.json'),
		});
		expect(() => writeAuthStore({})).toThrow(/REFUSING/);
	});

	test('re-enabling restores markers for cookies users already hold', () => {
		setServerState({ media_access_mode: 'private' });
		const value = initMediaAuthCookie();
		// operator disables, and the marker dir gets wiped with the store still on disk
		rmSync(join(mediaRoot, '.publication'), { recursive: true, force: true });

		syncAuthMarkersFromStore();
		if (value === null) return;
		expect(existsSync(join(mediaRoot, '.publication', 'auth', value))).toBe(true);
	});

	test('a configured mode with no media root fails LOUD, never silently unprotected', () => {
		setServerState({ media_access_mode: 'private' });
		overrideMediaProtectionPathsForTests(null); // no MEDIA_PATH in this test env
		const { config } = require('../../src/config/config.ts');
		if (config.media.rootPath !== null) return; // a configured dev env: not applicable
		expect(() => initMediaAuthCookie()).toThrow(/MEDIA_PATH is not configured/);
	});
});

describe('server state round-trip', () => {
	test('the override persists and reads back', () => {
		setServerState({ media_access_mode: 'publication' });
		expect(getServerState().media_access_mode).toBe('publication');
	});
});
