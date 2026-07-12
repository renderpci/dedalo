/**
 * MEDIA-PROTECTION LOCKSTEP TRIPWIRE (DEC-12).
 *
 * Media access control is enforced by THREE surfaces that must agree, forever:
 *
 *   1. the generated Apache rules   (buildHtaccess)
 *   2. the generated nginx rules    (buildNginxConf)
 *   3. the marker WRITER            (diffusion/targets/mediastore/media_index.ts)
 *
 * Surfaces 1 and 2 decide, from a media FILE NAME, which record marker to stat().
 * Surface 3 decides, from a record, which marker to create. If they ever disagree, the
 * gate stats a marker nobody writes (every published record 404s — visible, annoying) or
 * — the dangerous direction — parses a filename into the WRONG record and serves a file
 * whose record was never published.
 *
 * This gate is behavioral, not textual: it pulls the regexes BACK OUT of the generated
 * web-server text, compiles them in JS, and asserts that all three surfaces classify one
 * table of real filenames identically. Both patterns are plain PCRE using only constructs
 * JS RegExp supports natively ((?:…), [^/]*, {2,12}, \., and named groups), so compiling
 * them here is a faithful test of the PATTERN.
 *
 * HONEST LIMIT: this proves the patterns, not Apache's/nginx's rewrite ENGINES. The
 * engines are proven by the curl matrix in engineering/MEDIA_PROTECTION.md — which is
 * what actually caught the two historical bugs (the `$1_$2`-vs-`%1_%2` backreference and
 * the nginx `^~` precedence trap). Both of those are additionally pinned below.
 *
 * Registered in engineering/TRIPWIRES.md + scripts/verify.ts + scripts/ci/hermetic.sh.
 */

import { describe, expect, test } from 'bun:test';
import {
	MEDIA_AUTH_COOKIE,
	buildHtaccess,
	buildNginxConf,
	filterPublicQualities,
	getPublicQualities,
} from '../../src/core/media/protection.ts';
import { makeMarkerKey } from '../../src/diffusion/targets/mediastore/media_index.ts';

/** The quality folders every generated rule set in this test allows. */
const QUALITIES = [
	'av/404',
	'av/posterframe',
	'av/subtitles',
	'image/1.5MB',
	'image/thumb',
	'pdf/web',
	'svg/web',
	'3d/web',
];

const HTACCESS = buildHtaccess('publication', QUALITIES, []);
const NGINX = buildNginxConf('publication', QUALITIES);

/** Pull the rule-B pattern back out of the generated Apache text. */
function apachePattern(): RegExp {
	const line = HTACCESS.split('\n').find((l) => l.startsWith('RewriteRule ^(?:'));
	if (line === undefined) throw new Error('rule B not found in the generated .htaccess');
	const match = /^RewriteRule \^(.+?) - \[L\]$/.exec(line);
	if (match?.[1] === undefined) throw new Error(`could not extract the Apache pattern: ${line}`);
	return new RegExp(`^${match[1]}`);
}

/**
 * Pull the rule-B pattern back out of the generated nginx text.
 *
 * The pattern is DOUBLE-QUOTED in the generated conf, and must stay that way: nginx's
 * config lexer treats `{`/`}` as block delimiters, so an unquoted regex carrying the
 * grammar's `{2,12}` quantifier truncates mid-token and nginx refuses to start. That
 * shipped as a real bug (publication mode was unusable on nginx), so the quotes are
 * asserted below, not merely tolerated.
 */
function nginxPattern(): RegExp {
	const line = NGINX.split('\n').find((l) => l.startsWith('location ~ "^/dedalo/'));
	if (line === undefined) {
		throw new Error(
			'rule B not found in the generated nginx conf — it must be `location ~ "<regex>" {`, ' +
				'with the regex DOUBLE-QUOTED (an unquoted `{2,12}` makes nginx refuse to start)',
		);
	}
	const match = /^location ~ "(.+)" \{$/.exec(line);
	if (match?.[1] === undefined) throw new Error(`could not extract the nginx pattern: ${line}`);
	return new RegExp(match[1]);
}

/**
 * ONE table. Every surface must reach the SAME verdict on every row.
 * `key` is the record marker the gate must stat, or null = deny (anonymously).
 */
const CASES: { path: string; key: string | null; why: string }[] = [
	{ path: 'av/404/rsc35_rsc167_2.mp4', key: 'rsc167_2', why: 'av delivery quality' },
	{
		path: 'av/posterframe/rsc35_rsc167_2.jpg',
		key: 'rsc167_2',
		why: 'the posterframe shares its record marker with the video',
	},
	{
		path: 'av/subtitles/rsc35_rsc167_2_lg-spa.vtt',
		key: 'rsc167_2',
		why: 'subtitles ARE media — an unpublished transcription must not leak',
	},
	{ path: 'image/1.5MB/0/rsc29_rsc170_770.jpg', key: 'rsc170_770', why: 'numeric bucket dir' },
	{ path: 'image/thumb/1000/rsc29_rsc170_1770.jpg', key: 'rsc170_1770', why: 'bucket 1000' },
	{
		path: 'image/1.5MB/0/rsc29_rsc170_3_lg-spa.jpg',
		key: 'rsc170_3',
		why: 'translatable image lang suffix',
	},
	{
		path: 'image/1.5MB/dir/deep/rsc29_rsc170_770.jpg',
		key: 'rsc170_770',
		why: 'initial_media_path + additional_path nesting',
	},
	{ path: 'pdf/web/rsc37_rsc176_12.pdf', key: 'rsc176_12', why: 'pdf' },
	{ path: 'svg/web/rsc40_rsc180_5.svg', key: 'rsc180_5', why: 'svg' },
	{ path: '3d/web/rsc50_rsc190_7.glb', key: 'rsc190_7', why: '3d' },
	{
		path: 'image/1.5MB/0/test94_test3_1.jpg',
		key: 'test3_1',
		why: 'THE greedy-prefix case: the component tipo must not be read as the section tipo',
	},

	// ── deny (login-only or refused outright) ──────────────────────────────────────
	{
		path: 'image/original/0/rsc29_rsc170_770.tif',
		key: null,
		why: 'the master tier is not a public quality — even for a published record',
	},
	{
		path: 'image/modified/0/rsc29_rsc170_770.jpg',
		key: null,
		why: 'the retouched tier is not public',
	},
	{
		path: 'image/1.5MB/0/my_custom_name.jpg',
		key: null,
		why: 'a properties.image_id rename does not parse — login-only BY DESIGN, never loosen this',
	},
	{
		path: 'av/404/rsc35_RSC167_2.mp4',
		key: null,
		why: 'the tipo grammar is lowercase',
	},
	{
		path: 'av/subtitles/rsc35_rsc167_2_lg-spa-x-toolongtag.vtt',
		key: null,
		why: 'a lang tag longer than 12 chars does not parse',
	},
	{
		path: '.publication/pub/rsc167_2',
		key: null,
		why: 'the marker store is never served (rule 0)',
	},
];

describe('media protection: the three enforcement surfaces stay in lockstep', () => {
	test('Apache and nginx classify every filename identically, and agree with the writer', () => {
		const apache = apachePattern();
		const nginx = nginxPattern();

		for (const testCase of CASES) {
			// 1. Apache: rule B stats pub/$1_$2 — the captures of THIS pattern.
			const apacheMatch = apache.exec(testCase.path);
			const apacheKey =
				apacheMatch === null ? null : `${apacheMatch[1] ?? ''}_${apacheMatch[2] ?? ''}`;

			// 2. nginx: the location regex runs against the full URL, and stats
			//    pub/${dd_s}_${dd_i} — its NAMED captures.
			const nginxMatch = nginx.exec(`/dedalo/media/${testCase.path}`);
			const nginxKey =
				nginxMatch === null
					? null
					: `${nginxMatch.groups?.dd_s ?? ''}_${nginxMatch.groups?.dd_i ?? ''}`;

			expect(apacheKey, `Apache disagrees on ${testCase.path} (${testCase.why})`).toBe(
				testCase.key,
			);
			expect(nginxKey, `nginx disagrees on ${testCase.path} (${testCase.why})`).toBe(testCase.key);
		}
	});

	test('the WRITER creates exactly the markers the gates stat', () => {
		// Closes the loop: it is not enough that both gates agree on a key — that key must
		// be the one media_index.ts actually writes when the record is published.
		for (const testCase of CASES) {
			if (testCase.key === null) continue;
			const [sectionTipo, sectionId] = testCase.key.split('_');
			expect(makeMarkerKey(sectionTipo as string, sectionId as string)).toBe(testCase.key);
		}
	});
});

describe('media protection: the structural traps that historically shipped as bugs', () => {
	test('Apache rule B uses $1_$2, never %1_%2', () => {
		// %1 would reference rule A's last RewriteCond capture instead of this rule's — the
		// gate would stat a marker built from the wrong values and deny everything.
		expect(HTACCESS).toContain('/.publication/pub/$1_$2" -f');
		expect(HTACCESS).not.toContain('%1_%2');
	});

	test('the Apache rule-B RewriteRule immediately follows its RewriteCond', () => {
		const lines = HTACCESS.split('\n');
		const condIndex = lines.findIndex((line) => line.includes('/.publication/pub/$1_$2'));
		expect(condIndex).toBeGreaterThan(-1);
		expect(lines[condIndex + 1]).toStartWith('RewriteRule ^(?:');
	});

	test('the nginx rule-A location is a PLAIN prefix (a ^~ there skips rule B entirely)', () => {
		expect(NGINX).toContain('location /dedalo/media/ {');
		expect(NGINX).not.toContain('location ^~ /dedalo/media/ {');
	});

	test('the nginx rule-B location precedes the rule-A catch-all', () => {
		// nginx matches regex locations in file order.
		expect(NGINX.indexOf('location ~ ^/dedalo/')).toBeLessThan(
			NGINX.indexOf('location /dedalo/media/ {'),
		);
	});

	test('rule B uses NAMED captures — the inner `if` regex resets the numeric ones', () => {
		expect(NGINX).toContain('(?<dd_s>');
		expect(NGINX).toContain('(?<dd_i>');
	});
});

describe('media protection: the fail-closed constants', () => {
	test('every mode denies the marker store, including off', () => {
		for (const mode of ['off', 'private', 'publication'] as const) {
			expect(buildHtaccess(mode, QUALITIES, [])).toContain('\\.publication');
			expect(buildNginxConf(mode, QUALITIES)).toContain('location ^~ /dedalo/media/.publication/');
		}
	});

	test('the SEC-088 script-execution hardening survives in EVERY mode, including off', () => {
		// 'off' must write the hardening-only template, NOT unlink the file: the media root
		// is full of user-uploaded files, and an .htaccess-less media dir is one where an
		// uploaded .php executes.
		for (const mode of ['off', 'private', 'publication'] as const) {
			expect(buildHtaccess(mode, QUALITIES, [])).toContain('Require all denied');
			expect(buildHtaccess(mode, QUALITIES, [])).toContain('Options -Indexes -ExecCGI');
			expect(buildNginxConf(mode, QUALITIES)).toContain('phps?|phtml|phar');
		}
	});

	test('the gated modes deny by default, as 404 and never 403', () => {
		// 403 would disclose that the file exists.
		for (const mode of ['private', 'publication'] as const) {
			expect(buildHtaccess(mode, QUALITIES, [])).toContain('RewriteRule ^ - [R=404,L]');
			expect(buildHtaccess(mode, QUALITIES, [])).not.toContain('R=403');
		}
	});

	test('the cookie pattern is strict sha512 hex in both surfaces', () => {
		// The cookie VALUE becomes a literal filename under auth/. A loosened capture here
		// turns the gate into an arbitrary-file stat oracle.
		expect(HTACCESS).toContain(`${MEDIA_AUTH_COOKIE}=([a-f0-9]{128})`);
		expect(NGINX).toContain('$dedalo_auth_key');
		expect(buildNginxConf('private')).toContain('/.publication/auth/$dedalo_auth_key');
	});

	test('master qualities can never enter the public list', () => {
		expect(filterPublicQualities(['original', 'image/original', 'image/modified'])).toEqual([]);
		for (const quality of getPublicQualities()) {
			expect(quality.split('/')).not.toContain('original');
			expect(quality.split('/')).not.toContain('modified');
		}
	});

	test('the auth cookie NAME is fixed — rotating names would need a web-server reload', () => {
		expect(MEDIA_AUTH_COOKIE).toBe('dedalo_media_auth');
	});
});
