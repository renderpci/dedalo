/**
 * THE NGINX SITE FILE OF ONE INSTANCE (terminal installer phase 4, 2026-10-12)
 * — `/etc/nginx/conf.d/dedalo-<i>.conf`, rendered from deploy/nginx.conf's
 * routes with every name made the instance's own (`upstream dedalo_<i>`,
 * `zone=dedalo_<i>_api`, `dedalo-<i>.*.log`), so two instances on one host
 * never share a name.
 *
 *  - THE ROOT RULE: `root` is MEDIA_PATH minus `/dedalo/<dir>` (layout.ts
 *    webRootOf); the plan refuses a MEDIA_PATH that has no such root.
 *  - BOTH media includes, always — of ROOT-OWNED, VALIDATED COPIES under
 *    /etc/nginx/dedalo/<i>/ (deploy/dedalo-media-rules.sh), NEVER the engine's
 *    generated files in MEDIA_PATH: nginx's master parses every include as
 *    root, and MEDIA_PATH is the instance user's — an include of it would let
 *    the web-facing engine write root-parsed configuration (an access_log to
 *    any file, another site's server block). The server-scope copy here; the
 *    http-scope map through the ONE host-wide include file
 *    (`dedalo-00-media-map.conf`, mapInclude below — critique B6/F1: the map's
 *    variables are global, so exactly one instance's map copy is included; an
 *    instance whose map differs is refused).
 *  - The client is served from the engine's PUBLISHED copy
 *    (DEDALO_CLIENT_PUBLISH_DIR — the version of the code that runs).
 *  - `http2 on;` (nginx >= 1.25.1 — the System check refuses an older one),
 *    `server_tokens off` (L76), the security headers in every location that
 *    sets its own (L5/L55).
 *
 * PURE.
 */

import {
	ENGINE_PREFIXES,
	httpsOrigin,
	mediaGated,
	SECURITY_HEADERS,
	type SiteInput,
	siteHeader,
} from './site.ts';

/** The security header lines at `indent`. */
function headerLines(indent: string): string[] {
	return SECURITY_HEADERS.map(([name, value]) => `${indent}add_header ${name} "${value}" always;`);
}

/** A proxied location to this instance's upstream. */
function proxied(name: string, path: string, extra: readonly string[] = []): string[] {
	return [
		`\tlocation ${path} {`,
		`\t\tproxy_pass http://dedalo_${name};`,
		'\t\tproxy_http_version 1.1;',
		'\t\tproxy_set_header Host $host;',
		...extra.map((line) => `\t\t${line}`),
		'\t}',
	];
}

/** The plain-HTTP server: the challenge root (Let's Encrypt) and the redirect. */
function httpServer(input: SiteInput): string[] {
	const { answers, paths } = input;
	const acme = input.acme
		? [
				'\tlocation ^~ /.well-known/acme-challenge/ {',
				`\t\troot ${paths.acmeDir};`,
				'\t\tdefault_type text/plain;',
				'\t}',
			]
		: [];
	return [
		'server {',
		`\tlisten ${answers.http_port};`,
		`\tlisten [::]:${answers.http_port};`,
		`\tserver_name ${answers.server_name};`,
		'\tserver_tokens off;',
		...acme,
		`\tlocation / { return 301 https://$host${httpsOrigin(answers)}$request_uri; }`,
		'}',
		'',
	];
}

/** The API door: rate-limited, long timeouts, streaming. */
function apiLocation(name: string): string[] {
	return proxied(name, '~ ^/(api/v1/|dedalo/core/api/)', [
		`limit_req zone=dedalo_${name}_api burst=40 nodelay;`,
		'proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;',
		'proxy_set_header X-Forwarded-Proto $scheme;',
		'proxy_read_timeout 300s;',
		'proxy_send_timeout 300s;',
		'proxy_buffering off;',
	]);
}

/** The engine's own routes and the entry redirects. */
function engineLocations(name: string): string[] {
	return [
		...proxied(name, '= /health'),
		...apiLocation(name),
		...ENGINE_PREFIXES.flatMap((prefix) => proxied(name, prefix)),
		...proxied(name, '= /dedalo/core/component_text_area/tag/'),
		...proxied(name, '/dedalo/export/artifact/', ['proxy_buffering off;']),
		...['/dedalo', '/dedalo/', '/dedalo/core', '/dedalo/core/'].map(
			(path) => `\tlocation = ${path} { return 302 /dedalo/core/page/; }`,
		),
	];
}

/** The client tree (the engine's published copy). */
function clientLocation(input: SiteInput): string[] {
	return [
		'\tlocation /dedalo/ {',
		`\t\talias ${input.paths.clientPublish}/dedalo/;`,
		'\t\tetag on;',
		...headerLines('\t\t'),
		'\t\tadd_header Cache-Control "no-cache";',
		'\t\tgzip on;',
		'\t\tgzip_types text/css application/javascript application/json image/svg+xml;',
		'\t\tgzip_min_length 1024;',
		'\t\tlocation ~* \\.(png|jpe?g|gif|webp|ico|woff2?|ttf|otf)$ {',
		...headerLines('\t\t\t'),
		'\t\t\tadd_header Cache-Control "public, max-age=3600";',
		'\t\t}',
		'\t}',
	];
}

/** The root-owned directory of an instance's validated media-rule copies. */
export function nginxRulesDir(instance: string): string {
	return `/etc/nginx/dedalo/${instance}`;
}

/** The root-owned copies (server scope, http-scope map) of an instance's generated rules. */
export function nginxRuleCopies(instance: string): { server: string; map: string } {
	return {
		server: `${nginxRulesDir(instance)}/media_protection.conf`,
		map: `${nginxRulesDir(instance)}/media_protection_map.conf`,
	};
}

/**
 * The media: the root-owned, validated copy of the engine's GENERATED gate, or
 * — with DEDALO_MEDIA_ACCESS_MODE false — the open location, said so.
 */
function mediaLines(input: SiteInput): string[] {
	if (mediaGated(input.answers)) {
		return [
			'\t# The media gate: a root-owned, validated copy of the rules the engine generates',
			'\t# (deploy/dedalo-media-rules.sh — never the instance-writable file itself).',
			`\tinclude ${nginxRuleCopies(input.paths.instance).server};`,
		];
	}
	return [
		'\t# MEDIA ACCESS CONTROL IS OFF (media_access_mode false): every media file is public.',
		'\tlocation /dedalo/media/ { open_file_cache off; }',
	];
}

/** The https server (stage 2: the certificate exists). */
function httpsServer(input: SiteInput, cert: { fullchain: string; key: string }): string[] {
	const { answers, paths } = input;
	const name = paths.instance;
	return [
		'server {',
		`\tlisten ${answers.https_port} ssl;`,
		`\tlisten [::]:${answers.https_port} ssl;`,
		'\thttp2 on;',
		`\tserver_name ${answers.server_name};`,
		'\tserver_tokens off;',
		`\tssl_certificate     ${cert.fullchain};`,
		`\tssl_certificate_key ${cert.key};`,
		'\tssl_protocols       TLSv1.2 TLSv1.3;',
		`\taccess_log ${input.logDir}/dedalo-${name}.access.log;`,
		`\terror_log  ${input.logDir}/dedalo-${name}.error.log;`,
		'\t# THE ROOT RULE: root + /dedalo/<media dir>/… == MEDIA_PATH/…',
		`\troot ${paths.webRoot};`,
		'\tclient_max_body_size 300m;',
		...headerLines('\t'),
		...mediaLines(input),
		'\topen_file_cache off;',
		...engineLocations(name),
		...clientLocation(input),
		'\tlocation = / { return 302 /dedalo/core/page/; }',
		'\tlocation   / { return 404; }',
		'}',
		'',
	];
}

/** The whole site file (stage 1 without a certificate: upstream, zone and the HTTP server). */
export function renderNginxSite(input: SiteInput): string {
	const name = input.paths.instance;
	return [
		...siteHeader(input),
		`limit_req_zone $binary_remote_addr zone=dedalo_${name}_api:10m rate=20r/s;`,
		`upstream dedalo_${name} { server unix:${input.paths.socket}; }`,
		'',
		...httpServer(input),
		...(input.cert === null ? [] : httpsServer(input, input.cert)),
	].join('\n');
}

/** The host-wide map include file (F1): ONE instance's live map, included in place. */
export const NGINX_MAP_INCLUDE = '/etc/nginx/conf.d/dedalo-00-media-map.conf';

/** The map include file's text, pointing at `instance`'s root-owned map copy. */
export function mapInclude(instance: string): string {
	return [
		"# dedalo-install media map — WRITTEN BY THE INSTALLER. The media gate's map variables",
		"# are global to nginx: ONE instance's map (its root-owned, validated copy) is included",
		'# here for every Dédalo instance on this host (the installer refuses an instance whose',
		'# map differs — keep same-host instances at the same release).',
		`include ${nginxRuleCopies(instance).map};`,
		'',
	].join('\n');
}

/** The `# config-hash:` of a generated map text, or null. */
export function mapConfigHash(text: string | null): string | null {
	return /^# config-hash: (\S+)$/m.exec(text ?? '')?.[1] ?? null;
}
