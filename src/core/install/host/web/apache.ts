/**
 * THE APACHE SITE FILE OF ONE INSTANCE (terminal installer phase 4,
 * 2026-10-12) — one file holding this instance's two <VirtualHost>s:
 * Debian `/etc/apache2/sites-available/dedalo-<i>.conf` (enabled with
 * `a2ensite dedalo-<i>` — our site only), EL `/etc/httpd/conf.d/dedalo-<i>.conf`.
 * Mirrors deploy/apache.conf's vhost: ProxyPass before the aliases, `Alias
 * /dedalo/media` before `Alias /dedalo`, an EMPTY DocumentRoot (L89), a
 * CSP-free client Directory, the security headers — and in both vhosts THE
 * NAME GUARD (nameGuard: any Host but the site's own is refused with 421;
 * campaign 3 C3-30).
 *
 * THE MEDIA .htaccess IS THE GATE, and the instance user writes it: so the
 * override is only what the generated file uses — AuthConfig (Require),
 * FileInfo (Rewrite*, Header, SetHandler/AddHandler) and
 * Options=Indexes,ExecCGI (its own `Options -Indexes -ExecCGI`) — never
 * `All`; and a <Location> (merged AFTER every .htaccess) turns Indexes and
 * ExecCGI off again, so the instance's .htaccess can never switch CGI on and
 * run code as the web user, who is in every instance's group.
 *
 * MODULES ARE THE SYSADMIN'S (owner): ssl, headers, http2, rewrite, proxy and
 * proxy_http are CHECKED (`-M` through the row's query binary — EL: httpd) and the exact enabling command TOLD;
 * the installer never enables one (REQUIRED_APACHE_MODULES, the host steps).
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
	siteNames,
} from './site.ts';

/** The modules the vhost needs (checked, told — never enabled by the installer). */
export const REQUIRED_APACHE_MODULES: readonly string[] = Object.freeze([
	'ssl',
	'headers',
	'http2',
	'rewrite',
	'proxy',
	'proxy_http',
]);

/** The shared EMPTY DocumentRoot (nothing is ever served from it). */
export const APACHE_EMPTY_ROOT = '/var/www/empty';

/** `unix:<socket>|http://localhost<path>` — this instance's socket. */
function backend(input: SiteInput, path: string): string {
	return `unix:${input.paths.socket}|http://localhost${path}`;
}

/**
 * THE NAME GUARD (campaign 3 C3-30): Apache answers a name no vhost declares
 * with the FIRST vhost loaded for that port — on a host whose only sites are
 * instances, an instance (`https://<any other name of this host>/` served
 * museo). Each vhost therefore refuses any Host but its own with 421
 * Misdirected Request before anything is served or proxied. (nginx gets the
 * host-wide catch-all site instead — web/catch_all.ts: it needs no
 * certificate there, while an Apache catch-all on 443 would; Apache gets one
 * only while an instance claims an IPv4 address, with that instance's.)
 */
function nameGuard(names: readonly string[], port: string): string[] {
	const escaped = names.map((name) => name.replace(/[.^$*+?()[\]{}|\\]/g, '\\$&'));
	// One name: the guard as it always was; several (a local CA's extra addresses): any of them.
	const pattern = escaped.length === 1 ? escaped[0] : `(${escaped.join('|')})`;
	return [
		"\t# Only this site's own name: any other Host is refused (421), never served.",
		`\tRewriteCond %{HTTP_HOST} !^${pattern}(:${port})?$ [NC]`,
		'\tRewriteRule ^ - [R=421,L]',
	];
}

/** The local CA's extra addresses as a ServerAlias (none on every other mode). */
function serverAlias(input: SiteInput): string[] {
	const extra = siteNames(input.answers).slice(1);
	return extra.length === 0 ? [] : [`\tServerAlias ${extra.join(' ')}`];
}

/** The plain-HTTP vhost: the name guard, the challenge root (Let's Encrypt) and the redirect. */
function httpVhost(input: SiteInput): string[] {
	const { answers, paths } = input;
	const acme = input.acme
		? [
				`\tAlias /.well-known/acme-challenge/ ${paths.acmeDir}/.well-known/acme-challenge/`,
				`\t<Directory ${paths.acmeDir}>`,
				'\t\tRequire all granted',
				'\t</Directory>',
			]
		: [];
	const challenge = input.acme
		? ['\tRewriteCond %{REQUEST_URI} !^/\\.well-known/acme-challenge/']
		: [];
	return [
		`<VirtualHost *:${answers.http_port}>`,
		`\tServerName ${answers.server_name}`,
		...serverAlias(input),
		`\tDocumentRoot ${APACHE_EMPTY_ROOT}`,
		...acme,
		'\tRewriteEngine On',
		...nameGuard(siteNames(answers), answers.http_port),
		...challenge,
		`\tRewriteRule ^ https://%{HTTP_HOST}${httpsOrigin(answers)}%{REQUEST_URI} [R=301,L]`,
		'</VirtualHost>',
		'',
	];
}

/** The ProxyPass lines (the engine's routes) — before every Alias. */
function proxyLines(input: SiteInput): string[] {
	const paths = ['/health', '/api/v1/', '/dedalo/core/api/', ...ENGINE_PREFIXES];
	return [
		'\tProxyPreserveHost On',
		'\tProxyTimeout 300',
		...[...paths, '/dedalo/core/component_text_area/tag/', '/dedalo/export/artifact/'].map(
			(path) => `\tProxyPass ${path} ${backend(input, path)}`,
		),
		`\tProxyPassReverse /health ${backend(input, '/health')}`,
		'\tProxyPass /dedalo/media !',
		'\tProxyPass /dedalo !',
		'\tRedirectMatch 302 "^/dedalo/?$" /dedalo/core/page/',
		'\tRedirectMatch 302 "^/dedalo/core/?$" /dedalo/core/page/',
		'\tRedirectMatch 302 "^/$" /dedalo/core/page/',
	];
}

/** The media directory: the generated .htaccess gate (only the overrides it uses), or open. */
function mediaLines(input: SiteInput): string[] {
	const media = input.paths.media;
	const override = mediaGated(input.answers)
		? [
				'\t\t# The generated .htaccess IS the gate: without these overrides it is ignored, OPEN.',
				'\t\t# Only what it uses — never All (the instance user writes it).',
				'\t\tAllowOverride AuthConfig FileInfo Options=Indexes,ExecCGI',
			]
		: [
				'\t\t# MEDIA ACCESS CONTROL IS OFF (media_access_mode false): every media file is public.',
				'\t\tAllowOverride None',
			];
	return [
		`\tAlias /dedalo/media ${media}`,
		`\t<Directory ${media}>`,
		...override,
		'\t\tOptions -Indexes -ExecCGI',
		'\t\tRequire all granted',
		'\t</Directory>',
		'\t# Merged after every .htaccess: whatever the media tree says, no listing, no CGI.',
		'\t<Location "/dedalo/media/">',
		'\t\tOptions -Indexes -ExecCGI',
		'\t</Location>',
	];
}

/** The client tree (the engine's published copy). */
function clientLines(input: SiteInput): string[] {
	const client = `${input.paths.clientPublish}/dedalo`;
	return [
		`\tAlias /dedalo ${client}`,
		`\t<Directory ${client}>`,
		'\t\tOptions -Indexes',
		'\t\tAllowOverride None',
		'\t\tRequire all granted',
		'\t\tHeader set Cache-Control "no-cache"',
		'\t</Directory>',
	];
}

/** The https vhost (stage 2). */
function httpsVhost(input: SiteInput, cert: { fullchain: string; key: string }): string[] {
	const { answers, paths } = input;
	return [
		`<VirtualHost *:${answers.https_port}>`,
		`\tServerName ${answers.server_name}`,
		...serverAlias(input),
		'\tProtocols h2 http/1.1',
		'\tSSLEngine on',
		`\tSSLCertificateFile    ${cert.fullchain}`,
		`\tSSLCertificateKeyFile ${cert.key}`,
		'\tSSLProtocol -all +TLSv1.2 +TLSv1.3',
		`\tDocumentRoot ${APACHE_EMPTY_ROOT}`,
		`\tErrorLog ${input.logDir}/dedalo-${paths.instance}.error.log`,
		`\tCustomLog ${input.logDir}/dedalo-${paths.instance}.access.log combined`,
		'\tLimitRequestBody 314572800',
		'\tRewriteEngine On',
		...nameGuard(siteNames(answers), answers.https_port),
		...proxyLines(input),
		...mediaLines(input),
		...clientLines(input),
		...SECURITY_HEADERS.map(([name, value]) => `\tHeader always set ${name} "${value}"`),
		'</VirtualHost>',
		'',
	];
}

/** The whole site file (stage 1 without a certificate: the HTTP vhost only). */
export function renderApacheSite(input: SiteInput): string {
	return [
		...siteHeader(input),
		...(input.answers.https_port === '443' && input.answers.http_port === '80'
			? []
			: [
					`# Listen ${input.answers.http_port} / ${input.answers.https_port}: non-standard ports need a Listen line in the global configuration (told by the installer, never edited).`,
				]),
		...httpVhost(input),
		...(input.cert === null ? [] : httpsVhost(input, input.cert)),
	].join('\n');
}

/** The modules `-M` does not list, of the required ones. */
export function missingApacheModules(loaded: readonly string[]): string[] {
	return REQUIRED_APACHE_MODULES.filter((module) => !loaded.includes(module));
}

/**
 * The exact command that enables `missing` (told — the installer never runs
 * it). RESTART, as a2enmod itself advises: loading a module is a process
 * change, and a reload also applies every other pending configuration change.
 */
export function apacheModuleCommand(missing: readonly string[], debianLayout: boolean): string {
	return debianLayout
		? `a2enmod ${missing.join(' ')} && systemctl restart apache2`
		: `install the packages / LoadModule lines for: ${missing.join(', ')} (conf.modules.d), then systemctl restart httpd`;
}
