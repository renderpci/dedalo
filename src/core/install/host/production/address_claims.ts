/**
 * THE IPv4 ADDRESSES A PRODUCTION INSTANCE CLAIMS (owner decision 2026-10-16 —
 * on a museum intranet with no local DNS, staff reach the server BY IP).
 *
 * A local CA's `tls_extra_names` may list IPv4 addresses on the production
 * route. The certificate names them (the generator puts them in the leaf's SAN
 * and the authority's nameConstraints, unchanged), the site answers to them
 * (web/site.ts siteNames), and the host-wide catch-all hands a NAMELESS
 * handshake to a claimed address this instance's certificate
 * (web/catch_all.ts — why there and not in the site: its header). Here, what a
 * claim needs from the host, said on the Review before anything changes:
 *
 *  - the address is one of THIS host's (`/proc/net/fib_trie` — facts.ts
 *    hostAddresses): an address the host does not answer on would put a name
 *    in the certificate nobody can reach;
 *  - no other instance claims it (the registry's claims): an address reaches
 *    exactly ONE instance — never last-writer-wins. (Another site naming it is
 *    the ordinary name clash: preflight.ts addressProblems over siteNames.)
 *  - no operator site BINDS the address itself (`listen <ip>:443`,
 *    `<VirtualHost <ip>:443>`, on 80 or 443): an exact address:port bind
 *    takes every connection to it from the wildcard sites — the catch-all and
 *    the instance's site never see one (the documents cited in
 *    web/catch_all.ts, CLAIMED). A bind to a NAME the server resolves at start
 *    is refused too: the installer cannot tell which address it is;
 *  - the standard ports (the catch-all covers 80/443 only);
 *  - the catch-all is the installer's (or absent) and is the port's default:
 *    nginx — no operator `default_server` on 443 (a nameless handshake would
 *    reach it, not the catch-all) and no operator 443 server loaded before
 *    the catch-all (the first server is the default); Apache — no operator vhost loaded before
 *    the catch-all, and no OTHER instance already claiming addresses (Apache
 *    presents one certificate to every nameless handshake).
 *
 * IPv6 stays refused by the answers' validation (install_validation.ts — the
 * generator writes the authority's address constraint for IPv4 only).
 *
 * The claim checks run TWICE: here on the Review against the registry as it
 * was then, and again when host_web_site runs (production/web.ts
 * liveClaimCheck) against the registry as it is NOW — another install may
 * have claimed the address in between, and the later writer is refused,
 * never served over the first (claimConflicts).
 *
 * PURE over the plan context.
 */

import type { InstallAnswers } from '../../install_plan.ts';
import type { HostPlanCtx } from '../contract.ts';
import type { InstancePaths } from '../layout.ts';
import {
	type AddressClaim,
	CATCH_ALL_PORTS,
	catchAllErrorLog,
	catchAllPath,
	keptDefaults,
	ourSite,
} from '../web/catch_all.ts';
import type { SiteBind, SiteTuple } from '../web/clash.ts';
import { webFlavor } from './common.ts';

/** A dotted IPv4 address (the answers' validation already refused every other shape). */
const IPV4 = /^\d+\.\d+\.\d+\.\d+$/;

/** The IPv4 addresses a PRODUCTION local-CA instance claims ([] on every other route/mode). */
export function claimedAddresses(
	answers: Pick<InstallAnswers, 'route' | 'tls_mode' | 'tls_extra_names'>,
): string[] {
	if (answers.route !== 'production' || answers.tls_mode !== 'local_ca') return [];
	// `?? ''`: the plan file of a run recorded before the answer existed lacks it.
	const listed = answers.tls_extra_names ?? '';
	return listed === '' ? [] : listed.split(',').filter((name) => IPV4.test(name));
}

/** The local CA's certificate files (the generator's names in the instance's TLS directory). */
export function localCaCertificate(paths: InstancePaths): { fullchain: string; key: string } {
	return { fullchain: `${paths.tlsDir}/fullchain.pem`, key: `${paths.tlsDir}/privkey.pem` };
}

/** This instance's claims, each with its certificate (what the catch-all renders). */
export function ownClaims(ctx: HostPlanCtx): AddressClaim[] {
	const certificate = localCaCertificate(ctx.paths);
	return claimedAddresses(ctx.answers).map((address) => ({
		address,
		instance: ctx.paths.instance,
		...certificate,
	}));
}

/** Is the instance on the standard ports the catch-all covers? */
export function standardPorts(answers: Pick<InstallAnswers, 'http_port' | 'https_port'>): boolean {
	return answers.http_port === CATCH_ALL_PORTS.http && answers.https_port === CATCH_ALL_PORTS.https;
}

/**
 * The group that must read this instance's site key, or null: nginx loads a
 * certificate named by a VARIABLE in a worker (the web user), not the root
 * master — so with a claim the key is root:<web group> 0640, and the generator
 * keeps it so on every renewal (`--key-group`). The web user's own group has
 * its name on every row (www-data, nginx). Apache's catch-all names the file:
 * read by root at start, the key stays 0600.
 */
export function keyGroup(ctx: HostPlanCtx): string | null {
	return ctx.facts.web.kind === 'nginx' && claimedAddresses(ctx.answers).length > 0
		? webFlavor(ctx).user
		: null;
}

/** The address facts' refusals: not this host's, or unreadable. */
function hostAddressProblems(ctx: HostPlanCtx, claimed: readonly string[]): string[] {
	const host = ctx.facts.addresses;
	if (host === undefined || host === null) {
		return [
			`tls_extra_names claims ${claimed.join(', ')}, but this host's addresses could not be read (/proc/net/fib_trie) — the installer serves an IP address only once it is known to be this host's`,
		];
	}
	return claimed
		.filter((address) => !host.includes(address))
		.map(
			(address) =>
				`tls_extra_names: ${address} is not an address of this host (its IPv4 addresses: ${host.length === 0 ? 'none besides loopback' : host.join(', ')}) — a certificate for it would name an address staff cannot reach here`,
		);
}

/** Another instance's claim of one of ours (registry): one address, one instance. */
function claimClashProblems(
	ctx: HostPlanCtx,
	claimed: readonly string[],
	others: readonly AddressClaim[],
): string[] {
	return others
		.filter((claim) => claimed.includes(claim.address) && claim.instance !== ctx.paths.instance)
		.map(
			(claim) =>
				`tls_extra_names: ${claim.address} is already claimed by instance ${claim.instance} — an IP address reaches exactly one instance; give this one another address or a name`,
		);
}

/** nginx: an operator's default_server on 443 answers every nameless handshake, not the catch-all. */
function nginxDefaultProblems(ctx: HostPlanCtx): string[] {
	const { web } = ctx.facts;
	if (!keptDefaults(web.defaults).includes(CATCH_ALL_PORTS.https)) return [];
	const file = web.defaults.find((item) => item.port === CATCH_ALL_PORTS.https)?.file;
	return [
		`an IP address cannot reach this instance: ${file} is nginx's default_server on port ${CATCH_ALL_PORTS.https}, so it answers a handshake that names no site (what a browser sends for an IP address) — remove that default_server, or give staff a name instead`,
	];
}

/** Where a site loads relative to the catch-all: before it, after it, or not tellable. */
export type LoadOrder = 'before' | 'after' | 'unknown';

/** An nginx `include` glob as an anchored RegExp (`*`/`?` never cross a `/`; `[…]` kept). */
function globRegExp(pattern: string): RegExp {
	const body = pattern
		.split(/(\[[^\]]*\])/)
		.map((part, index) =>
			index % 2 === 1
				? part
				: part
						.replace(/[.+^${}()|\\]/g, '\\$&')
						.replace(/\*/g, '[^/]*')
						.replace(/\?/g, '[^/]'),
		)
		.join('');
	return new RegExp(`^${body}$`);
}

/**
 * Does nginx load `file` before the catch-all `ours`? nginx reads a glob
 * include's files SORTED (src/core/ngx_files.c ngx_open_glob: glob(3) without
 * GLOB_NOSORT, the C locale — byte order), and the includes in the order
 * `includes` lists them (web/clash.ts nginxIncludes). So: the same directory
 * → by name; another → by the position of the include that brings each in
 * (the same include → by full path). A file no include brings in (the main
 * nginx.conf, whose own server blocks may sit before or after its includes)
 * is 'unknown' — never guessed.
 */
export function nginxLoadOrder(file: string, ours: string, includes: readonly string[]): LoadOrder {
	const dir = (path: string) => path.slice(0, path.lastIndexOf('/'));
	if (dir(file) === dir(ours)) return byPath(file, ours);
	return byInclude(includePosition(file, includes), includePosition(ours, includes), file, ours);
}

/** Two files of one glob: nginx reads them sorted, so the path decides. */
function byPath(file: string, ours: string): LoadOrder {
	return file < ours ? 'before' : 'after';
}

/** The position of the first include that brings `path` in (-1: none). */
function includePosition(path: string, includes: readonly string[]): number {
	return includes.findIndex((pattern) => globRegExp(pattern).test(path));
}

/** Two files by the includes that bring them in (the same include: by path). */
function byInclude(theirs: number, mine: number, file: string, ours: string): LoadOrder {
	if (mine === -1 || theirs === -1) return 'unknown';
	if (theirs === mine) return byPath(file, ours);
	return theirs < mine ? 'before' : 'after';
}

/**
 * nginx: with no `default_server` on a port, its FIRST server is the default
 * ("How nginx processes a request", nginx.org/en/docs/http/
 * request_processing.html: "If its value does not match any server name …
 * nginx will route the request to the default server for this port … the
 * first one — which is nginx's standard default behaviour"), and the
 * catch-all is the default ONLY by loading first (web/catch_all.ts header).
 * An operator's `*:443` server loaded before it answers every nameless
 * handshake with its own certificate — the claim would do nothing while the
 * install said it reaches the instance (measured: E, an operator
 * conf.d/app.conf). Refused, naming the file; one whose order `nginx -T`
 * cannot tell is refused too. A default_server is nginxDefaultProblems'; an
 * address-bound site, boundProblems'.
 */
function nginxLoadOrderProblems(ctx: HostPlanCtx): string[] {
	const ours = loadedCatchAllPath(ctx);
	const includes = ctx.facts.web.includes ?? [];
	const site = ctx.facts.web.sites.find(
		(item) =>
			item.ports.includes(CATCH_ALL_PORTS.https) &&
			!boundOn(item, CATCH_ALL_PORTS.https) &&
			!(item.defaults ?? []).includes(CATCH_ALL_PORTS.https) &&
			!ourSite(item.file) &&
			nginxLoadOrder(item.file, ours, includes) !== 'after',
	);
	if (site === undefined) return [];
	const name = site.names[0] ?? 'a site';
	const order =
		nginxLoadOrder(site.file, ours, includes) === 'before'
			? `is loaded before the installer's catch-all ${ours}`
			: `may load before the installer's catch-all ${ours} (\`nginx -T\` does not tell its order)`;
	return [
		`an IP address cannot reach this instance: ${site.file} (${name}) listens on port ${CATCH_ALL_PORTS.https} and ${order}, so nginx answers a handshake that names no site (what a browser sends for an IP address) with it — give staff a name instead, or have that site load after ${ours}`,
	];
}

/** Where the catch-all is LOADED from (Debian Apache: the sites-enabled link a2ensite makes). */
export function loadedCatchAllPath(ctx: HostPlanCtx): string {
	const flavor = webFlavor(ctx);
	const path = catchAllPath(flavor);
	return flavor.enableWithA2ensite ? path.replace('/sites-available/', '/sites-enabled/') : path;
}

/**
 * Apache: the first `*:443` vhost answers every nameless handshake (`-S`
 * lists the port's vhosts in load order — the first is the default). An
 * operator's vhost loaded BEFORE the catch-all would stay the default: refused.
 * Loaded before = another directory (Debian's conf-enabled precedes
 * sites-enabled — never guessed: refused), or the same one, sorting first.
 */
function apacheDefaultProblems(ctx: HostPlanCtx): string[] {
	// The `*:443` group only: an address-bound vhost is listed apart (its own
	// address's default — boundProblems), never the wildcard's first.
	const first = ctx.facts.web.sites.find(
		(site) => site.ports.includes(CATCH_ALL_PORTS.https) && !boundOn(site, CATCH_ALL_PORTS.https),
	);
	if (first === undefined || ourSite(first.file)) return [];
	const ours = loadedCatchAllPath(ctx);
	const dir = (path: string) => path.slice(0, path.lastIndexOf('/'));
	const sameDirAfter =
		dir(first.file) === dir(ours) &&
		first.file.slice(dir(first.file).length) > ours.slice(dir(ours).length);
	if (sameDirAfter) return [];
	return [
		`an IP address cannot reach this instance: ${first.file} (${first.names[0] ?? 'a vhost'}) is loaded before the installer's catch-all ${ours}, so Apache answers a handshake that names no site (what a browser sends for an IP address) with it — give staff a name instead, or have that vhost load after ${ours}`,
	];
}

/** Apache presents ONE certificate to a nameless handshake: one claiming instance per host. */
function apacheClaimantProblems(ctx: HostPlanCtx, others: readonly AddressClaim[]): string[] {
	const other = others.find((claim) => claim.instance !== ctx.paths.instance);
	return other === undefined
		? []
		: [
				`an IP address cannot reach this instance: instance ${other.instance} already claims ${other.address} on this Apache host, and Apache presents one certificate to every handshake that names no site (SSLCertificateFile takes no variable) — give this instance a name instead`,
			];
}

/** Does the site bind a specific address on `port`? */
function boundOn(site: SiteTuple, port: string): boolean {
	return (site.binds ?? []).some((bind) => bind.port === port);
}

/** An IP literal (IPv4 dotted, or IPv6 in brackets) — anything else is a name resolved at start. */
function ipLiteral(address: string): boolean {
	return IPV4.test(address) || address.startsWith('[');
}

/** Could a bind take a claimed address's connections (the address itself, or a name never resolved here)? */
function bindTakes(bind: SiteBind, claimed: readonly string[]): boolean {
	if (!(Object.values(CATCH_ALL_PORTS) as string[]).includes(bind.port)) return false;
	if (ipLiteral(bind.address)) return claimed.includes(bind.address);
	return bind.address !== 'localhost';
}

/**
 * An operator site bound to a claimed address on 80/443 (header): that
 * address's connections go to it, never to the catch-all or the instance —
 * the install would say the address reaches the instance while it serves
 * another site. Refused, naming the file.
 */
function boundProblems(ctx: HostPlanCtx, claimed: readonly string[]): string[] {
	const found = ctx.facts.web.sites
		.filter((site) => !ourSite(site.file))
		.flatMap((site) =>
			(site.binds ?? [])
				.filter((bind) => bindTakes(bind, claimed))
				.map(
					(bind) =>
						`an IP address cannot reach this instance: ${site.file} (${site.names[0] ?? 'a site'}) listens on ${bind.address}:${bind.port} itself${ipLiteral(bind.address) ? '' : ` (a name the web server resolves when it starts — it may be ${claimed.join(', ')})`}, and a site bound to an address takes every connection to it from the sites on every address — this instance's included — so remove that address from its listen, or give staff another address or a name`,
				),
		);
	return [...new Set(found)];
}

/**
 * The refusals of this instance's claims against the OTHER instances' claims
 * `others` — on the Review (the registry at preflight) and again when
 * host_web_site runs (the registry now: production/web.ts liveClaimCheck).
 */
export function claimConflicts(ctx: HostPlanCtx, others: readonly AddressClaim[]): string[] {
	const claimed = claimedAddresses(ctx.answers);
	if (claimed.length === 0) return [];
	return [
		...claimClashProblems(ctx, claimed, others),
		...(ctx.facts.web.kind === 'apache' ? apacheClaimantProblems(ctx, others) : []),
	];
}

/**
 * Every refusal of this instance's claims (preflight.ts — on the Review,
 * before anything changes). [] without a claim.
 */
export function claimProblems(ctx: HostPlanCtx): string[] {
	const claimed = claimedAddresses(ctx.answers);
	if (claimed.length === 0) return [];
	const { web } = ctx.facts;
	const ports = standardPorts(ctx.answers)
		? []
		: [
				`tls_extra_names: an IP address needs the standard ports ${CATCH_ALL_PORTS.http}/${CATCH_ALL_PORTS.https} (http_port ${ctx.answers.http_port}, https_port ${ctx.answers.https_port}) — the installer's catch-all picks the certificate by address there only`,
			];
	const foreign =
		web.catchAll === 'foreign'
			? [
					`an IP address cannot reach this instance: ${catchAllPath(webFlavor(ctx))} exists and is not the installer's, and the installer's catch-all is what picks the certificate by address — move that file away`,
				]
			: [];
	return [
		...ports,
		...hostAddressProblems(ctx, claimed),
		...claimConflicts(ctx, web.claims ?? []),
		...foreign,
		...boundProblems(ctx, claimed),
		...(web.kind === 'nginx'
			? [...nginxDefaultProblems(ctx), ...nginxLoadOrderProblems(ctx)]
			: apacheDefaultProblems(ctx)),
	];
}

/** What the operator is told once the site is in place (nothing without a claim). */
export function claimsTold(ctx: HostPlanCtx): string[] {
	const claimed = claimedAddresses(ctx.answers);
	if (claimed.length === 0) return [];
	const urls = claimed.map((address) => `https://${address}/`).join(', ');
	const group = keyGroup(ctx);
	return [
		group === null
			? `${urls} reach this instance: the installer's catch-all presents its certificate to a handshake that names no site (what a browser sends for an IP address)`
			: `${urls} reach this instance: the installer's catch-all picks its certificate by address, loaded by nginx's workers — so the site key is readable by the group ${group} (0640, kept on renewal); a handshake to an address no instance claims is refused and logged in ${catchAllErrorLog(webFlavor(ctx).logDir)}`,
	];
}
