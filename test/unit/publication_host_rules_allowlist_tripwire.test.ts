/**
 * PUBLICATION-HOST RULES ALLOWLIST TRIPWIRE (DEC-12: every documented invariant has a gate).
 *
 * THE FAILURE IT GUARDS. `rules.apply` (publication/host_agent/src/rules/apply.ts) hands
 * free text to root: the agent's sudo'd configtest parses it and the polkit reload makes the
 * root master load it. The agent therefore refuses every directive outside a closed
 * allowlist (publication/host_agent/src/rules/directives.ts) — no LoadModule, no Include,
 * no log directive, no piped value, no path outside MEDIA_ROOT — before a byte is written.
 * That list is a COPY of what phase 1's renderers emit (src/core/media/publication_host_rules.ts),
 * held in a separate deployable. If the two drift, a renderer change becomes a production
 * refusal on every publication host, and the temptation is to widen the list by hand.
 *
 * WHAT IS PINNED HERE:
 *   1. EVERY INCLUDE THE ENGINE RENDERS PASSES. Both servers, over a quality table (one
 *      folder, every default public quality, and the shapes the filter keeps), against the
 *      root the include names. A renderer that grows a directive is red HERE.
 *   2. CONFINEMENT BITES ON A REAL RENDER: the same include against another MEDIA_ROOT, or
 *      none, is refused — the path check is not vacuous.
 *   3. THE ROOT DOORS STAY CLOSED: a real render plus one hostile line per known root door
 *      (Apache LoadModule / Include / piped ErrorLog / +ExecCGI / proxy RewriteRule; nginx
 *      load_module / include / error_log / access_log) is refused, naming that line.
 *
 *   4. THE HOST-WIDE NGINX MAP (provision init §13.3): the engine's buildNginxMap() passes the
 *      agent's closed map grammar (parseNginxMap) — for this install's media dir, and for a
 *      matrix of other media dirs / image folders (the envelope of each written with the
 *      engine's own imageEnvelopePcre escaping); the NEWEST pin set (NGINX_MAP_PINS, last entry)
 *      equals the engine's svg_safety constants, so an engine change to any of them is red HERE
 *      until a new pin set is appended; and a real map plus one root door (include, load_module,
 *      a piped or variable value, a fourth variable) is refused.
 *
 * HERMETIC: no database, no network. The agent module imports nothing; the engine renderer
 * reads only config.mediaDir.
 */

import { describe, expect, test } from 'bun:test';
import {
	envelopePcre,
	isMapRefusal,
	MAP_GRAMMAR,
	NGINX_MAP_PINS,
	parseNginxMap,
	type RulesServer,
	refuseDirectives,
} from '../../publication/host_agent/src/rules/directives.ts';
import { config } from '../../src/config/config.ts';
import {
	buildNginxMap,
	getPublicQualities,
	nginxMapConfigHash,
} from '../../src/core/media/protection.ts';
import {
	buildPublicationHostApacheConf,
	buildPublicationHostNginxConf,
} from '../../src/core/media/publication_host_rules.ts';
import {
	imageEnvelopePcre,
	SVG_ENVELOPE_CSP,
	SVG_QUARANTINE_CSP,
	SVG_QUARANTINE_DISPOSITION,
	svgQuarantinePcre,
} from '../../src/core/media/svg_safety.ts';

const ROOT = '/srv/dedalo_publication_media';
const SERVERS: readonly RulesServer[] = ['apache', 'nginx'];

const QUALITY_TABLE: readonly (readonly string[])[] = [
	['image/thumb'],
	getPublicQualities(),
	['image/1.5MB', 'av/404', 'pdf/web', 'svg/standard', 'image/thumb'],
];

function render(server: RulesServer, qualities: readonly string[], root = ROOT): string {
	const input = { root, qualities };
	return server === 'apache'
		? buildPublicationHostApacheConf(input)
		: buildPublicationHostNginxConf(input);
}

describe('every include the engine renders passes the agent allowlist', () => {
	test('anti-vacuity: the quality table renders, and getPublicQualities is not empty', () => {
		expect(getPublicQualities().length).toBeGreaterThan(0);
		for (const server of SERVERS)
			expect(render(server, ['image/thumb'])).toContain('# config-hash: ');
	});

	for (const server of SERVERS) {
		for (const qualities of QUALITY_TABLE) {
			test(`${server}: ${qualities.join(', ')}`, () => {
				expect(refuseDirectives(server, render(server, qualities), ROOT)).toBeNull();
			});
		}
	}
});

describe('confinement bites on a real render', () => {
	for (const server of SERVERS) {
		test(`${server}: another MEDIA_ROOT, or none, is refused`, () => {
			const include = render(server, ['image/thumb']);
			expect(refuseDirectives(server, include, '/srv/other')?.why).toContain('outside MEDIA_ROOT');
			expect(refuseDirectives(server, include, null)?.why).toContain('no MEDIA_ROOT');
		});
	}
});

describe('the root doors stay closed', () => {
	const HOSTILE: Readonly<Record<RulesServer, readonly string[]>> = {
		apache: [
			`LoadModule evil_module ${ROOT}/evil.so`,
			`Include ${ROOT}/evil.conf`,
			'ErrorLog "|/bin/sh -c id"',
			'Options +ExecCGI',
			'RewriteRule ^ http://127.0.0.1/ [P]',
		],
		nginx: [
			`load_module ${ROOT}/evil.so;`,
			`include ${ROOT}/evil.conf;`,
			'error_log /etc/cron.d/evil;',
			'access_log /etc/cron.d/evil;',
		],
	};
	for (const server of SERVERS) {
		for (const line of HOSTILE[server]) {
			test(`${server}: ${line}`, () => {
				const include = render(server, ['image/thumb']);
				const refused = refuseDirectives(server, `${include}${line}\n`, ROOT);
				expect(refused?.line).toBe(include.split('\n').length);
			});
		}
	}
});

describe('the host-wide nginx map passes the agent map grammar', () => {
	test('buildNginxMap() for this install parses: its hash, its one envelope, the newest pin set', () => {
		const parsed = parseNginxMap(buildNginxMap());
		if (isMapRefusal(parsed))
			throw new Error(`line ${parsed.line} '${parsed.directive}': ${parsed.why}`);
		expect(parsed).toEqual({
			hash: nginxMapConfigHash(),
			envelopes: [imageEnvelopePcre()],
			pinsId: NGINX_MAP_PINS.at(-1)?.id as string,
		});
	});

	test('the agent writes the envelope exactly as the engine does (this install)', () => {
		const folder = config.media.image.folder.replace(/^\/+/, '').replace(/\/+$/, '');
		expect(envelopePcre(config.mediaDir, folder)).toBe(imageEnvelopePcre());
	});

	const MATRIX: readonly (readonly [string, string])[] = [
		['media', 'image'],
		['dedalo_media', 'img'],
		['media.v7', 'image-2'],
		['m', 'x_y.z'],
		['a'.repeat(64), 'b'.repeat(64)],
	];
	for (const [mediaDir, folder] of MATRIX) {
		test(`a media dir '${mediaDir.slice(0, 12)}', image folder '${folder.slice(0, 12)}' passes`, () => {
			const variant = buildNginxMap().replaceAll(
				imageEnvelopePcre(),
				envelopePcre(mediaDir, folder),
			);
			const parsed = parseNginxMap(variant);
			expect(isMapRefusal(parsed) ? parsed.why : parsed.envelopes).toEqual([
				envelopePcre(mediaDir, folder),
			]);
		});
	}

	test('the newest pin set IS the engine svg_safety constants (append a pin set when they change)', () => {
		const newest = NGINX_MAP_PINS.at(-1);
		expect(newest).toMatchObject({
			quarantine: svgQuarantinePcre(),
			disposition: SVG_QUARANTINE_DISPOSITION,
			envelopeCsp: SVG_ENVELOPE_CSP,
			quarantineCsp: SVG_QUARANTINE_CSP,
		});
		expect(newest?.grammar).toBe(MAP_GRAMMAR);
		expect(new Set(NGINX_MAP_PINS.map((pins) => pins.id)).size).toBe(NGINX_MAP_PINS.length);
	});

	const DOORS: readonly (readonly [string, (map: string) => string])[] = [
		['include', (map) => `${map}include /etc/nginx/evil.conf;\n`],
		['load_module', (map) => `${map}load_module /tmp/evil.so;\n`],
		['a piped value', (map) => map.replace(`"${SVG_QUARANTINE_DISPOSITION}"`, '"|/bin/sh -c id"')],
		['a variable value', (map) => map.replace(`"${SVG_QUARANTINE_CSP}"`, '"$http_cookie"')],
		['a fourth variable', (map) => `${map}map $uri $dedalo_extra {\n\tdefault "";\n}\n`],
		[
			'a second auth value',
			(map) =>
				map.replace(
					'\tdefault                   "_invalid_";',
					'\t"~.*"  $h;\n\tdefault "_invalid_";',
				),
		],
	];
	for (const [door, mutate] of DOORS) {
		test(`a real map + ${door} is refused`, () => {
			const hostile = mutate(buildNginxMap());
			expect(hostile).not.toBe(buildNginxMap());
			expect(isMapRefusal(parseNginxMap(hostile))).toBe(true);
		});
	}
});
