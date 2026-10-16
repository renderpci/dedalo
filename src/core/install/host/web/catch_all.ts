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
 * Apache gets no such file for NAMES: its default for 443 would need a
 * certificate of its own, and the installer generates no certificate (the one
 * generator is deploy/dedalo-tls-rotate.sh — build_context_secret_tripwire).
 * Each Apache vhost refuses any Host but its own instead (web/apache.ts
 * nameGuard).
 *
 * CLAIMED IPv4 ADDRESSES (owner decision 2026-10-16 — a museum intranet with
 * no local DNS reaches the server BY IP). A browser sends no SNI for an
 * IP-literal URL (RFC 6066 §3: "Literal IPv4 and IPv6 addresses are not
 * permitted in HostName"), so the handshake's certificate is the DEFAULT
 * server's of the address:port — this catch-all. Claiming the address in a
 * site instead (`listen <ip>:443`, `<VirtualHost <ip>:443>`) breaks every
 * name-based site that shares the address — documented for both servers:
 *   - nginx, "How nginx processes a request" (nginx.org/en/docs/http/
 *     request_processing.html): "nginx first tests the IP address and port of
 *     the request against the listen directives of the server blocks. It then
 *     tests the Host header field against the server_name entries of the
 *     server blocks that matched the IP address and port" — a wildcard
 *     `listen 443` server is not among those of `listen <ip>:443`;
 *   - Apache, "An In-Depth Discussion of Virtual Host Matching"
 *     (httpd.apache.org/docs/2.4/vhosts/details.html): "If there are no exact
 *     matches for the address and port, then wildcard (*) matches are
 *     considered" — an exact `<VirtualHost <ip>:443>` hides every `*:443` one.
 * So the claim lives HERE, in the one installer-owned file, re-rendered from
 * the registry's claims (every instance's `addresses`), and no site changes:
 *   - nginx: the 443 server picks its certificate per handshake from
 *     `$server_addr` (ssl_certificate with variables, nginx >= 1.15.9 —
 *     nginx.org/en/docs/http/ngx_http_ssl_module.html#ssl_certificate), keyed
 *     on "<address>|<SNI>" so only a NAMELESS handshake to a CLAIMED address
 *     gets a certificate. Every other handshake the catch-all sees (an
 *     unclaimed address, an unknown name) finds no file and fails before any
 *     certificate is sent — refused as before, with a fatal alert
 *     (internal_error, not unrecognized_name) and a line in the catch-all's
 *     OWN error log (catchAllErrorLog), never the host's main one. The request
 *     then goes where its Host says — the instance's site, whose server_name
 *     lists the address (site.ts siteNames). Measured on nginx 1.26/1.31
 *     (2026-10-16, test/unit/install_host_ip_claims_native.test.ts): a claimed
 *     address answers with the instance's leaf and site; an unclaimed one
 *     refuses the handshake; an operator's vhost on the SAME address still
 *     answers by name. THE PRICE: the certificate is loaded by a WORKER, not
 *     the root master, so the instance's key is group-readable by the web
 *     server's group (host/production/address_claims.ts keyGroup; the
 *     generator keeps it so on every renewal, `--key-group`).
 *   - Apache has no per-address certificate (SSLCertificateFile takes no
 *     variable), so its catch-all — written only while an instance claims an
 *     address — is the first `*:443` vhost, presenting THE claiming
 *     instance's certificate to every nameless handshake, then refusing (421)
 *     any Host no vhost declares; the claimed address's Host reaches the
 *     instance's vhost (its ServerAlias). ONE instance per Apache host may
 *     claim addresses (a second is refused on the Review). Its SSL settings
 *     equal the instance vhost's: mod_ssl answers 421 to a request whose vhost's
 *     SSL setup differs from the handshake's ("no compatible SSL setup").
 *
 * SHARED, REFCOUNTED: written by the first instance's host_web_site, used as
 * it is by every later one that claims no address (a second instance does not
 * duplicate it), re-rendered by one that does and by the --abort of one that
 * did, removed by --abort only when no other instance's registry entry still
 * uses it (registry.ts `catch_all`). With no claim the nginx file is
 * byte-identical to the one before claims existed.
 *
 * PURE.
 */

import type { WebFlavor } from '../os_support.ts';
import { APACHE_EMPTY_ROOT } from './apache.ts';
import type { SiteTuple } from './clash.ts';

/** One claimed IPv4 address: the instance it reaches and that instance's certificate. */
export interface AddressClaim {
	readonly address: string;
	readonly instance: string;
	readonly fullchain: string;
	readonly key: string;
}

/** The first line of the catch-all file: what makes it the installer's own. */
export const CATCH_ALL_STAMP = '# dedalo-install catch-all';

/** The ports the catch-all covers (the standard ones). */
export const CATCH_ALL_PORTS = Object.freeze({ http: '80', https: '443' });

/** The catch-all site file (`dedalo-00-default.conf` beside the instances' sites). */
export function catchAllPath(flavor: WebFlavor): string {
	return flavor.sitePath.replace('dedalo-<i>', 'dedalo-00-default');
}

/** Is a file one of the installer's own sites (an instance's or the catch-all)? */
export function ourSite(file: string): boolean {
	return /\/dedalo-[^/]+\.conf$/.test(file);
}

/** One port's default site as the web server reports it. */
export interface PortDefault {
	port: string;
	file: string;
}

/** Every `default_server` of the sites, by port (the file that declares it). */
export function portDefaults(sites: readonly SiteTuple[]): PortDefault[] {
	return sites.flatMap((site) => (site.defaults ?? []).map((port) => ({ port, file: site.file })));
}

/** The standard ports where an OPERATOR'S `default_server` stays the default (told). */
export function keptDefaults(defaults: readonly PortDefault[]): string[] {
	return Object.values(CATCH_ALL_PORTS).filter((port) =>
		defaults.some((item) => item.port === port && !ourSite(item.file)),
	);
}

/**
 * The certificate path a handshake the catch-all must refuse gets: a file that
 * never exists, named so the error-log line says why (header: CLAIMED).
 */
export const UNCLAIMED_CERTIFICATE = '/nonexistent/dedalo-catch-all-unclaimed-address';

/** The catch-all's own nginx error log (the refused handshakes of a claimed host land there). */
export function catchAllErrorLog(logDir: string): string {
	return `${logDir}/dedalo-catch-all.error.log`;
}

/**
 * The claims in one order (by address, then instance): the render never
 * depends on the registry's file order. ONE per address: a duplicate key in an
 * nginx `map` fails `nginx -t` ("conflicting parameter") for the WHOLE host,
 * so a registry that ever held one address twice (the claim checks refuse
 * that — production/web.ts liveClaimCheck — this is the floor under them)
 * still renders a configuration nginx loads; the first instance by name keeps it.
 */
function sortedClaims(claims: readonly AddressClaim[]): AddressClaim[] {
	const sorted = [...claims].sort(
		(a, b) => a.address.localeCompare(b.address) || a.instance.localeCompare(b.instance),
	);
	return sorted.filter((claim, index) => sorted[index - 1]?.address !== claim.address);
}

/** An http-scope map from "<address>|<SNI>" to one file of each claim (`pick`), else the refusal. */
function claimMap(
	claims: readonly AddressClaim[],
	variable: string,
	pick: (claim: AddressClaim) => string,
): string[] {
	return [
		`map "$server_addr|$ssl_server_name" $${variable} {`,
		`\tdefault ${UNCLAIMED_CERTIFICATE};`,
		// An empty SNI only: a NAMED handshake the catch-all sees is an unknown name — refused.
		...claims.map((claim) => `\t"${claim.address}|" ${pick(claim)};`),
		'}',
	];
}

/** The 443 server: a claimed host's per-address certificate, or the plain refusal. */
function httpsCatchAll(claims: readonly AddressClaim[], logDir: string): string[] {
	const tls =
		claims.length === 0
			? ['\tssl_reject_handshake on;']
			: [
					...claims.map(
						(claim) => `\t# ${claim.address} reaches instance ${claim.instance} (its certificate).`,
					),
					`\terror_log ${catchAllErrorLog(logDir)};`,
					'\thttp2 on;',
					'\tssl_certificate     $dedalo_catch_all_certificate;',
					'\tssl_certificate_key $dedalo_catch_all_certificate_key;',
					'\tssl_protocols       TLSv1.2 TLSv1.3;',
					'\treturn 444;',
				];
	return [
		'server {',
		`\tlisten ${CATCH_ALL_PORTS.https} ssl;`,
		`\tlisten [::]:${CATCH_ALL_PORTS.https} ssl;`,
		'\tserver_name dedalo-catch-all.invalid;',
		...tls,
		'}',
	];
}

/**
 * The catch-all (see the header): both standard ports, the default by order
 * only; `claims` (every instance's claimed addresses) adds the per-address
 * certificate of a nameless handshake. No claim: the file as it always was.
 */
export function renderNginxCatchAll(
	claims: readonly AddressClaim[] = [],
	logDir = '/var/log/nginx',
): string {
	const sorted = sortedClaims(claims);
	const maps =
		sorted.length === 0
			? []
			: [
					'# A browser sends no server name for an IP address: a nameless handshake to an address',
					"# an instance CLAIMED gets that instance's certificate (then its site, by Host); every",
					'# other handshake here finds no certificate and is refused.',
					...claimMap(sorted, 'dedalo_catch_all_certificate', (claim) => claim.fullchain),
					...claimMap(sorted, 'dedalo_catch_all_certificate_key', (claim) => claim.key),
				];
	return [
		CATCH_ALL_STAMP,
		'# Answers every name no site of this host declares, so an unknown name never reaches an',
		'# instance. The default BY ORDER (this file sorts first), never `default_server`: a',
		'# default_server another site declares stays the default. Shared by every Dédalo',
		'# instance; removed with the last one. Written by the installer: never edit it.',
		...maps,
		'server {',
		`\tlisten ${CATCH_ALL_PORTS.http};`,
		`\tlisten [::]:${CATCH_ALL_PORTS.http};`,
		'\tserver_name dedalo-catch-all.invalid;',
		'\treturn 444;',
		'}',
		...httpsCatchAll(sorted, logDir),
		'',
	].join('\n');
}

/**
 * Does the installer's catch-all `text` serve every claim (its certificate to a
 * nameless handshake)? nginx: each "<address>|" map line names the claim's
 * fullchain and key; Apache: the file names the claimant's certificate. What
 * host_web_site's verify reads, so a run interrupted before the catch-all was
 * written is re-run on --resume, never adopted.
 */
export function catchAllServes(
	kind: 'nginx' | 'apache',
	text: string,
	claims: readonly AddressClaim[],
): boolean {
	if (!text.startsWith(`${CATCH_ALL_STAMP}\n`)) return false;
	return claims.every((claim) =>
		kind === 'nginx'
			? text.includes(`\t"${claim.address}|" ${claim.fullchain};\n`) &&
				text.includes(`\t"${claim.address}|" ${claim.key};\n`)
			: text.includes(`\tSSLCertificateFile    ${claim.fullchain}\n`) &&
				text.includes(`\tSSLCertificateKeyFile ${claim.key}\n`),
	);
}

/**
 * Apache's catch-all (header: CLAIMED) — only while ONE instance claims
 * addresses: the first `*:443` vhost, that instance's certificate for every
 * nameless handshake, 421 for any Host no vhost declares. Its SSL settings are
 * the instance vhost's (web/apache.ts httpsVhost), or mod_ssl refuses the
 * request the claimed address's Host routes to the instance (421).
 */
export function renderApacheCatchAll(claim: AddressClaim, addresses: readonly string[]): string {
	return [
		CATCH_ALL_STAMP,
		'# The first *:443 vhost: a browser sends no server name for an IP address, so a nameless',
		`# handshake gets the certificate of instance ${claim.instance}, which claims ${[...addresses].sort().join(', ')};`,
		"# the request then goes to the vhost its Host names (the instance's ServerAlias), and any",
		'# Host no vhost declares is refused (421). Removed with the claim. Written by the',
		'# installer: never edit it.',
		`<VirtualHost *:${CATCH_ALL_PORTS.https}>`,
		'\tServerName dedalo-catch-all.invalid',
		'\tProtocols h2 http/1.1',
		'\tSSLEngine on',
		`\tSSLCertificateFile    ${claim.fullchain}`,
		`\tSSLCertificateKeyFile ${claim.key}`,
		'\tSSLProtocol -all +TLSv1.2 +TLSv1.3',
		`\tDocumentRoot ${APACHE_EMPTY_ROOT}`,
		'\tRewriteEngine On',
		'\tRewriteRule ^ - [R=421,L]',
		'</VirtualHost>',
		'',
	].join('\n');
}
