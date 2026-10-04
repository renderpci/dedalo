/**
 * LIVE WEB-SERVER HARNESS — the user-mode Apache and nginx the publication-host drills boot
 * on 127.0.0.1, as the caller's uid, from configs they write themselves.
 *
 * Born in scripts/media_publication_host_drill.ts; moved here verbatim when
 * scripts/publication_host_agent_drill.ts became its second caller — one copy of "find
 * Apache through apxs and write a main conf it accepts". The only addition is
 * `optionalInclude`: the agent drill boots the server BEFORE the agent has written the
 * include, exactly as a real host does.
 *
 * Needs Apache 2.4 + apxs (binary and module dir resolved through `apxs -q`) and nginx.
 * Callers check PATH first and go RED naming what is missing — never a skip.
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';

export function sh(cmd: string[]): { code: number; out: string } {
	const r = Bun.spawnSync(cmd, { stdout: 'pipe', stderr: 'pipe' });
	return { code: r.exitCode, out: `${r.stdout.toString()}${r.stderr.toString()}` };
}

/**
 * The Apache binary, as apxs names it: `<SBINDIR>/<TARGET>`. Debian ships `apache2`,
 * Homebrew/RHEL `httpd` — a hard-coded name is a red on one of them for no reason.
 */
export function apacheBinary(): string {
	const sbin = sh(['apxs', '-q', 'SBINDIR']).out.trim();
	const target = sh(['apxs', '-q', 'TARGET']).out.trim();
	const bin = join(sbin, target);
	if (sbin === '' || target === '' || !existsSync(bin))
		throw new Error(`apxs names no Apache binary (SBINDIR='${sbin}', TARGET='${target}')`);
	return bin;
}

export function freePort(): number {
	const server = Bun.serve({ port: 0, hostname: '127.0.0.1', fetch: () => new Response('') });
	const port = server.port as number;
	server.stop(true);
	return port;
}

export async function waitUp(base: string): Promise<void> {
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

export interface MainConfOptions {
	/**
	 * The include may not exist yet (the agent writes it later). Apache: `IncludeOptional`.
	 * nginx has no optional include, but a GLOB matching zero files is accepted, so the last
	 * character of the path becomes a one-character class.
	 */
	readonly optionalInclude?: boolean;
}

export function apacheMainConf(
	dir: string,
	port: number,
	include: string,
	withRewrite: boolean,
	options: MainConfOptions = {},
): string {
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
		'AddType application/xml .xml',
		'AddType text/html .html',
		// The media drill mounts UNDER this document root (its hostile harness).
		`DocumentRoot "${dir}/www"`,
		// PERMISSIVE on purpose: a real host may run AllowOverride All. The include's OWN
		// AllowOverride None must be what ignores the work .htaccess — None here would
		// mask its removal (Apache 2.4 defaults to None anyway).
		'<Directory />',
		'\tAllowOverride All',
		'\tRequire all denied',
		'</Directory>',
		`${options.optionalInclude === true ? 'IncludeOptional' : 'Include'} "${include}"`,
		'',
	].join('\n');
}

export function nginxMainConf(
	dir: string,
	port: number,
	include: string,
	map: string,
	options: MainConfOptions = {},
): string {
	const tmp = join(dir, 'nginx_tmp');
	const included =
		options.optionalInclude === true ? `${include.slice(0, -1)}[${include.slice(-1)}]` : include;
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
		'\ttypes { image/jpeg jpg; video/mp4 mp4; text/vtt vtt; image/svg+xml svg; application/xml xml; text/html html; }',
		`\tinclude ${map};`,
		// HOSTILE: root is the media drill's mount parent, and an operator static-asset
		// regex location comes BEFORE the include. Precedence must not hand it the request.
		`\tserver { listen 127.0.0.1:${port}; server_name 127.0.0.1; root ${dir}/www;`,
		'\t\tlocation ~* \\.(jpg|jpeg|png|mp4|vtt|svg|xml|html|php)$ { expires 30d; }',
		'\t\tlocation ~ /\\. { expires 30d; }',
		`\t\tinclude ${included}; }`,
		'}',
		'',
	].join('\n');
}
