/**
 * THE HOST-WIDE CATCH-ALL SITE, nginx (campaign 3 C3-30, 2026-10-13) — a web
 * server answers a request for a name NO site declares with its DEFAULT site:
 * the `default_server` of the port, else the FIRST server block of it in
 * configuration order. On a host whose only sites are instances,
 * `https://<any name that resolves here>/` served an instance — the
 * campaign's second address answered entity museo. The installer therefore
 * writes ONE site for ports 80 and 443 that serves nothing: `return 444` (the
 * connection is closed, no answer) on 80, `ssl_reject_handshake on` on 443
 * (no certificate is presented for an unknown name; nginx >= 1.19.4, below
 * the installer's 1.25.1 floor).
 *
 * IT IS THE DEFAULT BY ORDER, NEVER BY `default_server`: conf.d is included
 * before sites-enabled on Debian and Ubuntu and before nginx.conf's own server
 * block on the RHEL family, and `dedalo-00-default.conf` sorts before every
 * `dedalo-<i>.conf` there. So an OPERATOR'S `default_server` (Debian's own
 * `default` site declares one on 80, installed WITH nginx — after the System
 * check measured the host: campaign 3's Debian drill) stays the default and
 * never clashes — nginx refuses two `default_server`s on one port (owner rule:
 * never another site edited). The ports an operator's default holds are told.
 * Its server_name is its own `.invalid` name, never `_` (Debian's default
 * site uses `_`: nginx warned "conflicting server name" — the Debian drill).
 * Only the standard ports (80/443) are covered: an instance on other ports is
 * that port's only site.
 *
 * Apache gets no such file: its default for 443 would need a certificate of
 * its own, and the installer generates no certificate (the one generator is
 * deploy/dedalo-tls-rotate.sh — build_context_secret_tripwire). Each Apache
 * vhost refuses any Host but its own instead (web/apache.ts nameGuard).
 *
 * SHARED, REFCOUNTED: written by the first instance's host_web_site, used as
 * it is by every later one (never rewritten — a second instance does not
 * duplicate it), removed by --abort only when no other instance's registry
 * entry still uses it (registry.ts `catch_all`).
 *
 * PURE.
 */

import type { WebFlavor } from '../os_support.ts';

/** The first line of the catch-all file: what makes it the installer's own. */
export const CATCH_ALL_STAMP = '# dedalo-install catch-all';

/** The ports the catch-all covers (the standard ones). */
export const CATCH_ALL_PORTS = Object.freeze({ http: '80', https: '443' });

/** The catch-all site file (`dedalo-00-default.conf` beside the instances' sites). */
export function catchAllPath(flavor: WebFlavor): string {
	return flavor.sitePath.replace('dedalo-<i>', 'dedalo-00-default');
}

/** Is a file one of the installer's own sites (an instance's or the catch-all)? */
function ourSite(file: string): boolean {
	return /\/dedalo-[^/]+\.conf$/.test(file);
}

/** One port's default site as the web server reports it. */
export interface PortDefault {
	port: string;
	file: string;
}

/** The standard ports where an OPERATOR'S `default_server` stays the default (told). */
export function keptDefaults(defaults: readonly PortDefault[]): string[] {
	return Object.values(CATCH_ALL_PORTS).filter((port) =>
		defaults.some((item) => item.port === port && !ourSite(item.file)),
	);
}

/** The catch-all (see the header): both standard ports, the default by order only. */
export function renderNginxCatchAll(): string {
	return [
		CATCH_ALL_STAMP,
		'# Answers every name no site of this host declares, so an unknown name never reaches an',
		'# instance. The default BY ORDER (this file sorts first), never `default_server`: a',
		'# default_server another site declares stays the default. Shared by every Dédalo',
		'# instance; removed with the last one. Written by the installer: never edit it.',
		'server {',
		`\tlisten ${CATCH_ALL_PORTS.http};`,
		`\tlisten [::]:${CATCH_ALL_PORTS.http};`,
		'\tserver_name dedalo-catch-all.invalid;',
		'\treturn 444;',
		'}',
		'server {',
		`\tlisten ${CATCH_ALL_PORTS.https} ssl;`,
		`\tlisten [::]:${CATCH_ALL_PORTS.https} ssl;`,
		'\tserver_name dedalo-catch-all.invalid;',
		'\tssl_reject_handshake on;',
		'}',
		'',
	].join('\n');
}
