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
import { readFileSync } from 'node:fs';
import { config } from '../../src/config/config.ts';
import {
	buildHtaccess,
	buildNginxConf,
	buildNginxMap,
	filterPublicQualities,
	getPublicQualities,
	MEDIA_AUTH_COOKIE,
} from '../../src/core/media/protection.ts';
import {
	MEDIA_ACTIVE_DOCUMENT_EXTENSIONS,
	SVG_ENVELOPE_CSP,
	SVG_QUARANTINE_CSP,
	SVG_QUARANTINE_DISPOSITION,
} from '../../src/core/media/svg_safety.ts';
import { makeMarkerKey } from '../../src/diffusion/targets/mediastore/media_index.ts';
import { mediaSvgSafetyHeaders } from '../../src/server.ts';

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

	test('a bare/ancestor top-level folder is refused — it would expose its master subdir (MEDIA-05)', () => {
		// A bare `image`/`av`/`pdf` has no forbidden SEGMENT of its own, but rule B's
		// `(?:.+/)?` descends from an allowed quality into any subdir, so a public
		// `image` matched `image/original/0/…rsc.tif` and served the master. Refused.
		expect(filterPublicQualities(['image'])).toEqual([]);
		expect(filterPublicQualities(['av'])).toEqual([]);
		expect(filterPublicQualities(['pdf'])).toEqual([]);
		// A trailing slash trims to the same bare folder (the empty-default trigger:
		// DEDALO_IMAGE_QUALITY_DEFAULT="" → getDefaultPublicQualities emits `image/`).
		expect(filterPublicQualities(['image/'])).toEqual([]);
		// A real, specific quality (≥2 segments, no master segment) SURVIVES — it
		// cannot reach a sibling `original/`.
		expect(filterPublicQualities(['image/1.5MB'])).toEqual(['image/1.5MB']);
		// Mixed: the bare ancestor is dropped, the specific quality kept.
		expect(filterPublicQualities(['image', 'image/1.5MB'])).toEqual(['image/1.5MB']);
		// Every emitted default is a specific ≥2-segment quality (defence in depth).
		for (const quality of getPublicQualities()) {
			expect(quality.split('/').length).toBeGreaterThanOrEqual(2);
		}
	});

	test('the auth cookie NAME is fixed — rotating names would need a web-server reload', () => {
		expect(MEDIA_AUTH_COOKIE).toBe('dedalo_media_auth');
	});
});

// ---------------------------------------------------------------------------
// The FOURTH lockstep axis: the MEDIA-03 response headers (2026-08-24)
// ---------------------------------------------------------------------------

/**
 * SVG is the one image format that is also a DOCUMENT, and the media origin is the
 * application origin. The rule for which SVG population may be served inline is now
 * implemented for THREE consumers — the Bun media route (`mediaSvgSafetyHeaders`), the
 * generated Apache text and the generated nginx map — and a fourth definition of the
 * same rule is exactly the drift this file exists to catch. The rule itself lives in
 * ONE place, src/core/media/svg_safety.ts; these tests pull the patterns back out of
 * the generated web-server text, compile them, and assert that both generators
 * classify a table of REAL paths exactly as the route function does.
 *
 * Why the table is paths and not extensions: the envelope really lives one bucket
 * directory below its `svg/` segment (`image/svg/0/rsc29_rsc170_1.svg`). A pattern
 * anchoring the file directly inside `svg/` compiles, looks right, matches no real
 * envelope, and blanks every `<object type="image/svg+xml">` edit view on every
 * Apache/nginx install. That is the failure this table is shaped to catch.
 *
 * HONEST LIMIT (the same one as above): this proves the PATTERNS agree, not that
 * Apache's `<If>`/`<FilesMatch>` merge order or nginx's map evaluation behave as
 * intended. Those are the four header rows of the curl matrix in
 * engineering/MEDIA_PROTECTION.md §9.
 */
describe('media protection: the MEDIA-03 response headers stay in lockstep', () => {
	const MEDIA_URL = `/dedalo/${config.mediaDir}`;
	const IMAGE_FOLDER = config.media.image.folder.replace(/^\/+/, '').replace(/\/+$/, '');

	/** media-root-relative segments → the URI the web server sees. */
	const uriOf = (relSegments: readonly string[]): string => `${MEDIA_URL}/${relSegments.join('/')}`;

	const CASES: { what: string; rel: string[]; type: string }[] = [
		{
			what: 'a server-generated image envelope (inline, script-free CSP)',
			rel: [IMAGE_FOLDER, 'svg', '0', 'rsc29_rsc170_1.svg'],
			type: 'image/svg+xml',
		},
		{
			what: 'an envelope below a non-empty initial media path',
			rel: [IMAGE_FOLDER, 'sub', 'svg', '12', 'rsc29_rsc170_9.svg'],
			type: 'image/svg+xml',
		},
		{
			what: 'a raw uploaded vector (attachment + sandbox)',
			rel: ['svg', 'web', '0', 'svg29_svg170_1.svg'],
			type: 'image/svg+xml',
		},
		{
			what: 'an SVG in an image quality folder that is NOT the envelope folder',
			rel: [IMAGE_FOLDER, '1.5MB', '0', 'rsc29_rsc170_1.svg'],
			type: 'image/svg+xml',
		},
		{
			what: 'a raster (no SVG headers at all)',
			rel: [IMAGE_FOLDER, '1.5MB', '0', 'rsc29_rsc170_1.jpg'],
			type: 'image/jpeg',
		},
	];

	/** Compile the envelope PCRE out of the generated Apache `<If>` line. */
	function apacheEnvelopePattern(): RegExp {
		const line = HTACCESS.split('\n').find((l) => l.includes('%{REQUEST_URI} =~ m#'));
		if (line === undefined) throw new Error('the MEDIA-03 <If> is missing from the .htaccess');
		const match = /=~ m#(.+?)#">$/.exec(line.trim());
		if (match?.[1] === undefined) throw new Error(`could not extract the Apache <If>: ${line}`);
		return new RegExp(match[1]);
	}

	/** Compile the quarantine extension pattern out of the generated Apache text. */
	function apacheQuarantinePattern(): RegExp {
		const line = HTACCESS.split('\n').find(
			(l) =>
				l.includes('<FilesMatch') &&
				l.includes('Content-Disposition') === false &&
				l.includes('svg|'),
		);
		if (line === undefined) throw new Error('the MEDIA-03 <FilesMatch> is missing');
		const match = /<FilesMatch "\(\?i\)(.+?)">/.exec(line.trim());
		if (match?.[1] === undefined) throw new Error(`could not extract the FilesMatch: ${line}`);
		return new RegExp(match[1], 'i');
	}

	/** Compile one nginx `map` block into an ordered list of [pattern, value]. */
	function nginxMapEntries(variable: string): { pattern: RegExp; value: string }[] {
		const text = buildNginxMap();
		const start = text.indexOf(`map $uri $${variable} {`);
		if (start < 0) throw new Error(`the ${variable} map is missing from the generated map file`);
		const body = text.slice(start, text.indexOf('\n}', start));
		const entries: { pattern: RegExp; value: string }[] = [];
		for (const line of body.split('\n').slice(1)) {
			const match = /^\s*"~(.+?)"\s+"(.*)";$/.exec(line);
			if (match?.[1] !== undefined && match[2] !== undefined) {
				entries.push({ pattern: new RegExp(match[1]), value: match[2] });
			}
		}
		if (entries.length === 0) throw new Error(`the ${variable} map compiled to no entries`);
		return entries;
	}

	/** nginx map semantics: FIRST matching regex wins; no match ⇒ the default. */
	function nginxMapValue(variable: string, uri: string): string {
		for (const { pattern, value } of nginxMapEntries(variable)) {
			if (pattern.test(uri)) return value;
		}
		return '';
	}

	for (const testCase of CASES) {
		test(`${testCase.what}: route, Apache and nginx agree`, () => {
			const uri = uriOf(testCase.rel);
			const routeHeaders = mediaSvgSafetyHeaders(testCase.rel, testCase.type);
			const expectedCsp = routeHeaders['Content-Security-Policy'] ?? '';
			const expectedDisposition = routeHeaders['Content-Disposition'] ?? '';

			// nginx: the two maps ARE the classification, so they must equal the route.
			expect(nginxMapValue('dedalo_svg_csp', uri)).toBe(expectedCsp);
			expect(nginxMapValue('dedalo_svg_disposition', uri)).toBe(expectedDisposition);

			// Apache: the <FilesMatch> sets the quarantine pair, the <If> overrides it
			// for the envelope. Reconstruct that merge and compare the same way.
			const quarantined = apacheQuarantinePattern().test(uri);
			const isEnvelope = apacheEnvelopePattern().test(uri);
			const apacheCsp = isEnvelope ? SVG_ENVELOPE_CSP : quarantined ? SVG_QUARANTINE_CSP : '';
			const apacheDisposition = isEnvelope ? '' : quarantined ? SVG_QUARANTINE_DISPOSITION : '';
			expect(apacheCsp).toBe(expectedCsp);
			expect(apacheDisposition).toBe(expectedDisposition);
		});
	}

	test('ANTI-VACUITY: the case table really exercises both verdicts', () => {
		// A table that only ever produced one verdict would pass against a generator
		// that classified everything identically — the exact bug this axis exists for.
		const verdicts = new Set(
			CASES.map((c) => JSON.stringify(mediaSvgSafetyHeaders(c.rel, c.type))),
		);
		expect(verdicts.size).toBe(3); // envelope / quarantine / no headers
	});

	test('the nginx envelope pattern is tested BEFORE the extension pattern', () => {
		// nginx map regexes are evaluated in order and an envelope is also an `.svg`.
		// Reversed, every envelope becomes an attachment and the edit view goes blank.
		for (const variable of ['dedalo_svg_csp', 'dedalo_svg_disposition']) {
			const entries = nginxMapEntries(variable);
			// The envelope entry is the PATH-anchored one; the quarantine entry keys on
			// the extension alone. (Do not match on 'svg/': RegExp.source escapes the
			// slash, so the needle would never be found and the test would be vacuous.)
			const envelopeIndex = entries.findIndex((e) => e.pattern.source.startsWith('^'));
			const extensionIndex = entries.findIndex((e) => e.pattern.source.startsWith('\\.'));
			expect(envelopeIndex).toBeGreaterThanOrEqual(0);
			expect(extensionIndex).toBeGreaterThan(envelopeIndex);
		}
	});

	test('EVERY byte-serving nginx location carries the full header set, in every mode', () => {
		// add_header does NOT inherit into a location that declares any add_header of
		// its own, so there is no server-level shortcut: a location that serves bytes
		// and omits these serves them bare.
		for (const mode of ['off', 'private', 'publication'] as const) {
			const text = buildNginxConf(mode, mode === 'publication' ? QUALITIES : []);
			const serving = text
				.split('\n')
				.filter((l) => l.startsWith('location') && !l.includes('deny all'));
			expect(serving.length).toBeGreaterThan(0);
			// Split on the LINE START only — the word 'location' also occurs in the
			// generated prose, and splitting on the bare word invents empty blocks.
			const blocks = text.split('\nlocation ').slice(1);
			for (const block of blocks) {
				if (block.includes('deny all')) continue; // a deny location serves no bytes
				expect(block).toContain('add_header X-Content-Type-Options');
				expect(block).toContain('add_header Content-Disposition $dedalo_svg_disposition');
				expect(block).toContain('add_header Content-Security-Policy $dedalo_svg_csp');
			}
		}
	});

	test('the headers cannot FAIL OPEN when mod_headers is absent', () => {
		// Without mod_headers the CSP simply is not emitted. An install in that state
		// must refuse the uploader-supplied population, not serve it inline unprotected.
		expect(HTACCESS).toContain('<IfModule !mod_headers.c>');
		const branch = HTACCESS.slice(
			HTACCESS.indexOf('<IfModule !mod_headers.c>'),
			HTACCESS.indexOf('# Protect working files'),
		);
		expect(branch).toContain('Require all denied');
		expect(branch).toContain('Require all granted'); // the envelope stays reachable
	});

	test('the Apache <If> is merged AFTER the <FilesMatch> it overrides', () => {
		// Apache merges <If> last; if the envelope override were emitted first the
		// FilesMatch would win and every envelope would be an attachment.
		expect(HTACCESS.indexOf('<FilesMatch "(?i)\\.(svg|')).toBeLessThan(
			HTACCESS.indexOf('%{REQUEST_URI} =~ m#'),
		);
	});

	test('active-document extensions are DENIED on both surfaces, in every mode', () => {
		// Nothing legitimate under the media root is named .html/.swf/.hta — no media
		// model's allowedExtensions list contains one. These are refused, not quarantined.
		for (const extension of MEDIA_ACTIVE_DOCUMENT_EXTENSIONS) {
			expect(buildHtaccess('off', [], [])).toContain(extension);
			expect(buildNginxConf('off', [])).toContain(extension);
		}
	});

	test('the nginx map carries its own config hash (it is no longer static)', () => {
		// It used to be written only when ABSENT. Now that the server block references
		// variables the map defines, an install that keeps an old map cannot reload
		// nginx at all — so the map must be rewritten on drift like the other two.
		expect(buildNginxMap()).toContain('# config-hash: ');
	});
	test('the auth marker directory is created 0750, never world-listable', () => {
		// The FILENAMES in that directory are live media credentials: a 0755 marker dir
		// hands every local user a working cookie by `ls`. This used to be pinned
		// indirectly by the MEDIA_DIR_MODE census, which scans for inline mkdir mode
		// LITERALS — the per-session credential gave the directory a second creator, so
		// the mode became one named constant and left that census with nothing to see.
		// Pin the value here instead of leaving the blind spot open.
		const source = readFileSync('src/core/media/protection.ts', 'utf8');
		expect(source).toContain('const AUTH_MARKER_DIR_MODE = 0o750;');
		const inlineModes = source.match(/mkdirSync\([^)]*mode:\s*0o\d+/g) ?? [];
		expect(inlineModes).toEqual([]); // every creator goes through the constant
	});
});
