/**
 * THE HOST-WIDE NGINX MAP UNDER A REAL `nginx -t` (provision init §13.6, §13.8).
 *
 * What the pure gates cannot prove: that the files nginx actually loads on a publication host
 * parse together. Scratch prefix, the caller's uid, `nginx -t` only (nothing listens):
 *   1. the PROVISIONED include (render/nginx_map_include.ts, its zero-match glob) + root's live
 *      host map holding TWO contributions (renderHostMap) + two instances' media includes
 *      (the engine's buildPublicationHostNginxConf) in two server blocks → passes;
 *   2. the same with a hand-placed duplicate map (the guide's buildNginxMap() include): MEASURED
 *      2026-10-08 on nginx 1.31.2, nginx does NOT refuse a second `map` of the same variable — it
 *      passes configtest and the LATER definition silently wins. So a leftover hand map is never
 *      caught by a configtest: it is init's job to find it (`web.nginx_manual_map`, the parsed
 *      `nginx -T` map definitions) and remove it in the seeded transaction. This case pins the
 *      measured behaviour, so an nginx that starts refusing duplicates turns it red (and the
 *      guard can be revisited);
 *   3. the SEED MIGRATION: the guide's hand map + the loaded media includes pass; then the seeded
 *      live file + the provisioned include, the hand map removed → one passing configtest;
 *   4. before any push (the glob matches nothing, no media include yet) nginx stays valid.
 *
 * nginx is REQUIRED on Linux (CI): missing → RED, naming it. On another platform a missing nginx
 * is a skip with its reason (the CI image carries nginx). Runs nginx through
 * scripts/lib/web_server_harness.ts `sh`.
 */
import { afterAll, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { derive } from '../../publication/host_agent/src/provision/layout.ts';
import { nginxMapIncludeBody } from '../../publication/host_agent/src/provision/render/nginx_map_include.ts';
import {
	contributionOf,
	envelopePcre,
	isMapRefusal,
	parseNginxMap,
} from '../../publication/host_agent/src/rules/directives.ts';
import { HOST_MAP_FILE, renderHostMap } from '../../publication/host_agent/src/rules/host_map.ts';
import { sh } from '../../scripts/lib/web_server_harness.ts';
import { buildNginxMap } from '../../src/core/media/protection.ts';
import { buildPublicationHostNginxConf } from '../../src/core/media/publication_host_rules.ts';

const NGINX =
	Bun.which('nginx') ??
	(Bun.which('nginx', { PATH: '/usr/sbin:/usr/local/sbin:/opt/homebrew/bin' }) as string | null);
const missing = NGINX === null;
const DIR = mkdtempSync(join(tmpdir(), 'zz-nginx-map-'));
afterAll(() => rmSync(DIR, { recursive: true, force: true }));

const HOST_BASE = join(DIR, '_host');
const MAP_DIR = join(HOST_BASE, 'nginx_map');
const CONF_D = join(DIR, 'conf.d');

/** The provisioned include's body, for a declaration whose host paths sit in the scratch prefix. */
function provisionedInclude(): string {
	const layout = derive({
		instance: 'test',
		listen: { kind: 'tls', host: '10.8.0.2', port: 7443 },
		agent_user: 'dedalo-pubhost',
		agent_dir: '/opt/dedalo/publication/host_agent',
		web: { server: 'nginx', unit: 'nginx', nginx_map: 'conf_d' },
		v1: { user: 'dedalo-api-v1' },
		state_root: '/srv/dedalo_publication',
		media: { mode: 'shared', root: '/mnt/dedalo_media' },
		php_bin: '/usr/bin/php',
		bun_bin: '/usr/local/bin/bun',
		v2: {
			unit: 'dedalo-publication-api-v2',
			user: 'dedalo-api-v2',
			group: 'dedalo-api-v2',
			port: 3100,
			health_url: 'http://127.0.0.1:3100/health',
		},
		paths: { host_base: HOST_BASE, nginx_conf_d: CONF_D },
	});
	return nginxMapIncludeBody(layout);
}

/** The engine map's contribution, with another media dir when asked (a second instance). */
function contribution(instance: string, mediaDir?: string) {
	let text = buildNginxMap();
	const parsed = parseNginxMap(text);
	if (isMapRefusal(parsed)) throw new Error(parsed.why);
	if (mediaDir !== undefined)
		text = text.replaceAll(parsed.envelopes[0] as string, envelopePcre(mediaDir, 'image'));
	const again = parseNginxMap(text);
	if (isMapRefusal(again)) throw new Error(again.why);
	const made = contributionOf(again, instance);
	if (typeof made === 'string') throw new Error(made);
	return made;
}

function mediaInclude(name: string, root: string): string {
	const path = join(DIR, `${name}.media.conf`);
	writeFileSync(path, buildPublicationHostNginxConf({ root, qualities: ['image/thumb'] }));
	return path;
}

function conf(name: string, httpLines: readonly string[], servers: readonly string[]): string {
	const tmp = join(DIR, 'tmp');
	mkdirSync(tmp, { recursive: true });
	const path = join(DIR, `${name}.nginx.conf`);
	writeFileSync(
		path,
		[
			`pid ${DIR}/nginx.pid;`,
			`error_log ${DIR}/error.log warn;`,
			'events { worker_connections 16; }',
			'http {',
			'\taccess_log off;',
			...['client_body', 'proxy', 'fastcgi', 'uwsgi', 'scgi'].map(
				(t) => `\t${t}_temp_path ${tmp}/${t};`,
			),
			...httpLines.map((line) => `\t${line}`),
			...servers.map(
				(include, index) =>
					`\tserver { listen 127.0.0.1:${18_080 + index}; server_name s${index}.test; include ${include}; }`,
			),
			'}',
			'',
		].join('\n'),
	);
	return path;
}

function configtest(path: string): { code: number; out: string } {
	return sh([NGINX as string, '-t', '-p', DIR, '-c', path]);
}

function writeLive(text: string): void {
	mkdirSync(MAP_DIR, { recursive: true });
	writeFileSync(join(MAP_DIR, HOST_MAP_FILE), text);
}

function writeProvisioned(): string {
	mkdirSync(CONF_D, { recursive: true });
	const path = join(CONF_D, 'dedalo_media_map.conf');
	writeFileSync(path, provisionedInclude());
	return path;
}

describe('nginx -t over the host-wide map', () => {
	test('nginx is present (RED on Linux when missing)', () => {
		if (missing && process.platform === 'linux')
			throw new Error('nginx is not installed: the host-map syntax gate cannot run');
		if (missing)
			console.warn(
				'[nginx_map_syntax] nginx not installed on this machine: the syntax cases are skipped here',
			);
	});

	test.skipIf(missing)(
		'before any push: the zero-match include defines nothing and nginx stays valid',
		() => {
			rmSync(MAP_DIR, { recursive: true, force: true });
			const result = configtest(conf('empty', [`include ${writeProvisioned()};`], []));
			expect(result.out).toContain('test is successful');
			expect(result.code).toBe(0);
		},
	);

	test.skipIf(missing)(
		'the provisioned include + a two-contribution host map + two instances in two server blocks',
		() => {
			const host = renderHostMap([contribution('alpha'), contribution('beta', 'media_beta')]);
			writeLive(host.text);
			const path = conf(
				'two',
				[`include ${writeProvisioned()};`],
				[mediaInclude('alpha', '/srv/alpha_media'), mediaInclude('beta', '/srv/beta_media')],
			);
			const result = configtest(path);
			expect(result.out).toContain('test is successful');
			expect(result.code).toBe(0);
		},
	);

	test.skipIf(missing)(
		'a hand-placed duplicate map beside it is NOT refused by nginx (measured): configtest is no guard',
		() => {
			writeLive(renderHostMap([contribution('alpha')]).text);
			const hand = join(DIR, 'hand_map.conf');
			writeFileSync(hand, buildNginxMap().replace(/"attachment"/, '"inline"'));
			const result = configtest(
				conf(
					'duplicate',
					[`include ${writeProvisioned()};`, `include ${hand};`],
					[mediaInclude('alpha', '/srv/alpha_media')],
				),
			);
			expect(result.out).toContain('test is successful');
			expect(result.code).toBe(0);
		},
	);

	test.skipIf(missing)(
		'the seed migration: hand map + media includes pass; seeded live file + include, hand map removed, pass',
		() => {
			const hand = join(DIR, 'guide_map.conf');
			writeFileSync(hand, buildNginxMap());
			const media = mediaInclude('alpha', '/srv/alpha_media');
			expect(configtest(conf('guide', [`include ${hand};`], [media])).code).toBe(0);
			writeLive(renderHostMap([contribution('_seed')]).text);
			const result = configtest(conf('seeded', [`include ${writeProvisioned()};`], [media]));
			expect(result.out).toContain('test is successful');
			expect(result.code).toBe(0);
			// …and without the seed the media include's variables are unknown: why init seeds first.
			rmSync(join(MAP_DIR, HOST_MAP_FILE));
			const unseeded = configtest(conf('unseeded', [`include ${writeProvisioned()};`], [media]));
			expect(unseeded.code).not.toBe(0);
			expect(unseeded.out).toMatch(/unknown "dedalo_/);
		},
	);
});
