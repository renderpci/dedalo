#!/usr/bin/env bun
/**
 * PUBLICATION-HOST MEDIA DRILL: the curl matrix of engineering/MEDIA_PROTECTION.md §9
 * for the publication-host profile (engineering/PUBLICATION_HOST_SPEC.md §5.1), run
 * against REAL Apache and nginx. The tripwire proves the regexes; only a live server
 * proves the engines (rewrite phase order, alias + captures, location precedence).
 *
 * Builds a scratch media tree under the OS temp dir, renders the include with the
 * ENGINE's builders (never hand-written rules), boots each server on 127.0.0.1, runs
 * the matrix, stops it, deletes the tree. Exit 1 on any red row.
 * Needs: httpd + apxs (Apache 2.4), nginx with ngx_http_mp4_module.
 */

import { existsSync, mkdirSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { buildNginxMap, MEDIA_AUTH_COOKIE } from '../src/core/media/protection.ts';
import {
	buildPublicationHostApacheConf,
	buildPublicationHostNginxConf,
	publicationHostMediaUrl,
} from '../src/core/media/publication_host_rules.ts';
import { SVG_QUARANTINE_CSP } from '../src/core/media/svg_safety.ts';

const QUALITIES = ['image/thumb', 'av/404', 'av/subtitles', 'svg/web'];
const WORK_COOKIE = 'a'.repeat(128);
const PUBLISHED = 'image/thumb/0/test94_test3_1.jpg';

/** The scratch tree: a published record (test3_1), an unpublished one (test3_2). */
const FILES: Record<string, string> = {
	[PUBLISHED]: 'JPEG-published',
	'image/thumb/0/test94_test3_2.jpg': 'JPEG-unpublished',
	'image/original/0/test94_test3_1.jpg': 'MASTER',
	'image/thumb/0/my_custom_name.jpg': 'NON-GRAMMAR',
	'image/thumb/0/test94_test3_1.php': "<?php echo 'EXECUTED';",
	'av/404/test94_test3_1.mp4': 'M'.repeat(1000),
	'av/subtitles/test94_test3_1_lg-spa.vtt': 'WEBVTT',
	'svg/web/test94_test3_1.svg': '<svg xmlns="http://www.w3.org/2000/svg"/>',
	'.publication/pub/test3_1': '',
	[`.publication/auth/${WORK_COOKIE}`]: '',
	// A PERMISSIVE work-host .htaccess on the shared tree: AllowOverride None must ignore it.
	'.htaccess': 'RewriteEngine Off\nRequire all granted\n',
};

interface Row {
	name: string;
	path: string;
	headers?: Record<string, string>;
	expect: number[];
	before?: (root: string) => void;
	check?: (res: Response, body: string) => string | null;
}

const ROWS: Row[] = [
	{ name: 'published, public quality → 200', path: PUBLISHED, expect: [200] },
	{
		name: 'nosniff on every media file',
		path: PUBLISHED,
		expect: [200],
		check: (r) => (r.headers.get('x-content-type-options') === 'nosniff' ? null : 'no nosniff'),
	},
	{
		name: 'unpublished → 404 (permissive work .htaccess ignored)',
		path: 'image/thumb/0/test94_test3_2.jpg',
		expect: [404],
	},
	{
		name: 'unpublished + VALID work cookie → 404 (no Rule A)',
		path: 'image/thumb/0/test94_test3_2.jpg',
		headers: { Cookie: `${MEDIA_AUTH_COOKIE}=${WORK_COOKIE}` },
		expect: [404],
	},
	{
		name: 'master tier, published record → 404',
		path: 'image/original/0/test94_test3_1.jpg',
		expect: [404],
	},
	{
		name: 'subtitle of a published record → 200',
		path: 'av/subtitles/test94_test3_1_lg-spa.vtt',
		expect: [200],
	},
	{ name: 'non-grammar filename → 404', path: 'image/thumb/0/my_custom_name.jpg', expect: [404] },
	{ name: 'marker store pub/ → 404', path: '.publication/pub/test3_1', expect: [404] },
	{ name: 'marker store auth/ → 404', path: `.publication/auth/${WORK_COOKIE}`, expect: [404] },
	{
		name: 'uploaded .php → denied, never executed, source never served',
		path: 'image/thumb/0/test94_test3_1.php',
		expect: [403, 404],
		check: (_r, body) =>
			body.includes('<?php') || body.includes('EXECUTED') ? 'php leaked' : null,
	},
	{
		name: 'Range → 206 + Content-Range',
		path: 'av/404/test94_test3_1.mp4',
		headers: { Range: 'bytes=0-99' },
		expect: [206],
		check: (r) =>
			(r.headers.get('content-range') ?? '').startsWith('bytes 0-99/') ? null : 'bad Content-Range',
	},
	{
		name: 'raw svg → attachment + sandbox CSP',
		path: 'svg/web/test94_test3_1.svg',
		expect: [200],
		check: (r) =>
			(r.headers.get('content-disposition') ?? '').includes('attachment') &&
			r.headers.get('content-security-policy') === SVG_QUARANTINE_CSP
				? null
				: 'svg not quarantined',
	},
	{
		name: 'unpublish: rm pub marker → 404 on the very next request',
		path: PUBLISHED,
		expect: [404],
		before: (root) => unlinkSync(join(root, '.publication/pub/test3_1')),
	},
	{
		name: 'republish: marker back → 200',
		path: PUBLISHED,
		expect: [200],
		before: (root) => writeFileSync(join(root, '.publication/pub/test3_1'), ''),
	},
];

function sh(cmd: string[]): { code: number; out: string } {
	const r = Bun.spawnSync(cmd, { stdout: 'pipe', stderr: 'pipe' });
	return { code: r.exitCode, out: `${r.stdout.toString()}${r.stderr.toString()}` };
}

function freePort(): number {
	const server = Bun.serve({ port: 0, hostname: '127.0.0.1', fetch: () => new Response('') });
	const port = server.port as number;
	server.stop(true);
	return port;
}

function buildTree(root: string): void {
	for (const [rel, content] of Object.entries(FILES)) {
		const path = join(root, rel);
		mkdirSync(dirname(path), { recursive: true });
		writeFileSync(path, content);
	}
}

async function waitUp(base: string): Promise<void> {
	for (let i = 0; i < 50; i++) {
		try {
			await fetch(base);
			return;
		} catch {
			await Bun.sleep(100);
		}
	}
	throw new Error(`server at ${base} never answered`);
}

async function runRows(server: string, base: string, root: string): Promise<number> {
	let red = 0;
	for (const row of ROWS) {
		row.before?.(root);
		const res = await fetch(`${base}${publicationHostMediaUrl()}/${row.path}`, {
			headers: row.headers,
		});
		const body = await res.text();
		const problem = !row.expect.includes(res.status)
			? `status ${res.status}, expected ${row.expect.join('|')}`
			: (row.check?.(res, body) ?? null);
		if (problem !== null) red++;
		console.log(
			`${problem === null ? 'ok  ' : 'RED '} [${server}] ${row.name}${problem ? ` (${problem})` : ''}`,
		);
	}
	return red;
}

function apacheMainConf(dir: string, port: number, include: string, withRewrite: boolean): string {
	const modules = sh(['apxs', '-q', 'LIBEXECDIR']).out.trim();
	const names = ['mpm_event', 'unixd', 'authz_core', 'alias', 'mime', 'headers'];
	if (withRewrite) names.push('rewrite');
	const loads = names
		.filter((n) => existsSync(join(modules, `mod_${n}.so`)))
		.map((n) => `LoadModule ${n}_module "${join(modules, `mod_${n}.so`)}"`);
	return [
		`ServerRoot "${dir}"`,
		`Listen 127.0.0.1:${port}`,
		'ServerName 127.0.0.1',
		`PidFile "${dir}/httpd.pid"`,
		`ErrorLog "${dir}/httpd_error.log"`,
		...loads,
		'TypesConfig /dev/null',
		'AddType image/jpeg .jpg',
		'AddType video/mp4 .mp4',
		'AddType text/vtt .vtt',
		'AddType image/svg+xml .svg',
		`DocumentRoot "${dir}/docroot"`,
		// PERMISSIVE on purpose: a real host may run AllowOverride All. The include's OWN
		// AllowOverride None must be what ignores the work .htaccess — None here would
		// mask its removal (Apache 2.4 defaults to None anyway).
		'<Directory />',
		'\tAllowOverride All',
		'\tRequire all denied',
		'</Directory>',
		`Include "${include}"`,
		'',
	].join('\n');
}

function nginxMainConf(dir: string, port: number, include: string, map: string): string {
	const tmp = join(dir, 'nginx_tmp');
	return [
		'daemon off;',
		`pid ${dir}/nginx.pid;`,
		`error_log ${dir}/nginx_error.log warn;`,
		'events { worker_connections 64; }',
		'http {',
		'\taccess_log off;',
		...['client_body', 'proxy', 'fastcgi', 'uwsgi', 'scgi'].map(
			(t) => `\t${t}_temp_path ${tmp}/${t};`,
		),
		'\ttypes { image/jpeg jpg; video/mp4 mp4; text/vtt vtt; image/svg+xml svg; }',
		`\tinclude ${map};`,
		`\tserver { listen 127.0.0.1:${port}; server_name 127.0.0.1; root ${dir}/docroot; include ${include}; }`,
		'}',
		'',
	].join('\n');
}

async function drill(server: 'apache' | 'nginx'): Promise<number> {
	const dir = mkdtempSync(join(tmpdir(), `dd_pubhost_${server}_`));
	const root = join(dir, 'media_ro');
	mkdirSync(join(dir, 'docroot'), { recursive: true });
	mkdirSync(join(dir, 'nginx_tmp'), { recursive: true });
	buildTree(root);
	const port = freePort();
	const include = join(dir, `pubhost.${server}.conf`);
	const main = join(dir, `main.${server}.conf`);
	let red = 0;
	let proc: ReturnType<typeof Bun.spawn> | null = null;
	try {
		if (server === 'apache') {
			const conf = buildPublicationHostApacheConf({ root, qualities: QUALITIES });
			const ownsOverride = conf.includes('AllowOverride None');
			if (!ownsOverride) red++;
			console.log(
				`${ownsOverride ? 'ok  ' : 'RED '} [apache] include declares its own AllowOverride None`,
			);
			writeFileSync(include, conf);
			// Review Focus #5: without mod_rewrite the include must NOT pass the syntax check.
			writeFileSync(main, apacheMainConf(dir, port, include, false));
			const norewrite = sh(['httpd', '-t', '-f', main]);
			// Refused FOR THAT REASON: any other configtest failure (a missing module .so,
			// a bad path) would otherwise pass this row while proving nothing.
			const bootRefused =
				norewrite.code !== 0 && norewrite.out.includes("Invalid command 'RewriteEngine'");
			if (!bootRefused) red++;
			console.log(
				`${bootRefused ? 'ok  ' : 'RED '} [apache] no mod_rewrite → configtest refuses${bootRefused ? '' : ` (exit ${norewrite.code}: ${norewrite.out.trim()})`}`,
			);
			writeFileSync(main, apacheMainConf(dir, port, include, true));
			const t = sh(['httpd', '-t', '-f', main]);
			if (t.code !== 0) throw new Error(`httpd -t failed:\n${t.out}`);
			proc = Bun.spawn(['httpd', '-DFOREGROUND', '-f', main], { stdout: 'ignore', stderr: 'pipe' });
		} else {
			const map = join(dir, 'map.nginx.conf');
			writeFileSync(map, buildNginxMap());
			writeFileSync(include, buildPublicationHostNginxConf({ root, qualities: QUALITIES }));
			writeFileSync(main, nginxMainConf(dir, port, include, map));
			const t = sh(['nginx', '-e', join(dir, 'nginx_error.log'), '-t', '-p', dir, '-c', main]);
			if (t.code !== 0) throw new Error(`nginx -t failed:\n${t.out}`);
			proc = Bun.spawn(['nginx', '-e', join(dir, 'nginx_error.log'), '-p', dir, '-c', main], {
				stdout: 'ignore',
				stderr: 'pipe',
			});
		}
		const base = `http://127.0.0.1:${port}`;
		await waitUp(base);
		red += await runRows(server, base, root);
	} finally {
		proc?.kill('SIGTERM');
		await proc?.exited;
		rmSync(dir, { recursive: true, force: true });
	}
	return red;
}

if (import.meta.main) {
	const onlyIndex = process.argv.indexOf('--only');
	const only = onlyIndex >= 0 ? process.argv[onlyIndex + 1] : undefined;
	if (only !== undefined && only !== 'apache' && only !== 'nginx') {
		console.error(`--only must be 'apache' or 'nginx' (got ${JSON.stringify(only)})`);
		process.exit(1);
	}
	const servers = (['apache', 'nginx'] as const).filter((s) => only === undefined || s === only);
	let red = 0;
	if (servers.length === 0) {
		console.error('no server selected — refusing a vacuous green');
		process.exit(1);
	}
	for (const server of servers) red += await drill(server);
	console.log(red === 0 ? '\nALL GREEN' : `\n${red} RED row(s)`);
	process.exit(red === 0 ? 0 : 1);
}
