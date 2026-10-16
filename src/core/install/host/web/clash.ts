/**
 * WHO ELSE SERVES THIS ADDRESS (terminal installer phase 4, 2026-10-12) — the
 * web half of the clash scan: a server name already answered on the same port
 * by ANOTHER site file is a refusal (owner decision round 2 #2: one site file
 * per instance, never another site edited, a clash refused).
 *
 * WHAT IS KEPT (critique A11): `nginx -T` dumps every site's whole
 * configuration — other tenants' paths, upstreams, sometimes credentials in a
 * proxy header. Only (file, server names, ports) TUPLES are extracted here;
 * the dump itself is never stored, logged or put in the state file.
 *
 * Parsers, PURE: `nginx -T` (its `# configuration file <path>:` headers, then
 * each `server { … }` block's server_name and listen directives — brace depth
 * tracked, comments dropped) and `apache2ctl -S` / EL `httpd -S` (its `port N namevhost NAME
 * (file:line)` / `alias NAME` lines and its `*:N NAME (file:line)` default
 * lines).
 */

export interface SiteTuple {
	file: string;
	names: string[];
	ports: string[];
	/**
	 * The directories the site SERVES (nginx `root`/`alias`, Apache
	 * `DocumentRoot`/`Alias` — read from the vhost file): no install folder or
	 * backup folder may lie inside one (identity_rules.ts). Absent = not read.
	 */
	roots?: string[];
	/**
	 * nginx: the ports this server block is the `default_server` of (absent:
	 * none). The installer's own catch-all (web/catch_all.ts) is told apart by
	 * its file, never counted as an operator's default.
	 */
	defaults?: string[];
	/**
	 * The ADDRESS-SPECIFIC listens of the site — nginx `listen 10.0.0.5:443`,
	 * Apache `<VirtualHost 10.0.0.5:443>` (the `-S` address column) — wildcards
	 * (`443`, `*:443`, `0.0.0.0`, `[::]`) left out. Such a bind takes every
	 * connection to that address:port away from the wildcard sites (the
	 * documents cited in web/catch_all.ts, CLAIMED), so a claimed address must
	 * have none (production/address_claims.ts). Absent: none.
	 */
	binds?: SiteBind[];
}

/** One address-specific listen (`address` as written: an IP literal, or a name the server resolves). */
export interface SiteBind {
	address: string;
	port: string;
}

/** Wildcard addresses: every address of the host, never a specific one. */
const WILDCARD_ADDRESSES: readonly string[] = Object.freeze(['*', '0.0.0.0', '[::]', '_default_']);

/** A bind of `address` (as listed) on `port`, or null for a wildcard / no address. */
function bindOf(address: string | undefined, port: string): SiteBind | null {
	if (address === undefined || address === '' || WILDCARD_ADDRESSES.includes(address)) return null;
	return { address, port };
}

/** One nginx `listen` value → its address-specific bind, or null (wildcard, port only, unix socket). */
function listenBind(value: string): SiteBind | null {
	const first = value.trim().split(/\s+/)[0] ?? '';
	if (first.startsWith('unix:') || /^\d+$/.test(first)) return null;
	const withPort = /^(.*):(\d+)$/.exec(first);
	// An address alone listens on 80 (nginx's listen default).
	return withPort === null
		? bindOf(first, '80')
		: bindOf(withPort[1] as string, withPort[2] as string);
}

/** nginx `root` / `alias` values of a server block (nested locations included). */
export function nginxRoots(body: string): string[] {
	return [...body.matchAll(/^\s*(?:root|alias)\s+([^;\s]+)\s*;/gm)].map(
		(m) => (m[1] as string).replace(/^["']|["']$/g, '').replace(/\/+$/, '') || '/',
	);
}

/** Apache `DocumentRoot` / `Alias <url> <dir>` values of a vhost file's text. */
export function apacheRoots(text: string): string[] {
	const clean = text.replace(/#[^\n]*/g, '');
	return [
		...[...clean.matchAll(/^\s*DocumentRoot\s+"?([^"\s]+)"?/gim)].map((m) => m[1] as string),
		...[...clean.matchAll(/^\s*Alias\s+\S+\s+"?([^"\s]+)"?/gim)].map((m) => m[1] as string),
	].map((root) => root.replace(/\/+$/, '') || '/');
}

/** One nginx `listen` value → its port ('80' when only an address is given). */
function listenPort(value: string): string {
	const first = value.trim().split(/\s+/)[0] ?? '';
	const match = /(?:^|:)(\d+)$/.exec(first.replace(/^\[.*\]/, ''));
	return match?.[1] ?? (/^\d+$/.test(first) ? first : '80');
}

/** The (file, chunk) sections of an `nginx -T` dump (split keeps the captured file names). */
function nginxSections(dump: string): { file: string; text: string }[] {
	const parts = dump.split(/^# configuration file (.+?):\s*$/m).slice(1);
	const sections: { file: string; text: string }[] = [];
	for (let index = 0; index + 1 < parts.length; index += 2) {
		sections.push({ file: parts[index] as string, text: parts[index + 1] as string });
	}
	return sections;
}

/**
 * `nginx -T` → its `include` patterns, in the order the dump lists them, made
 * absolute (a relative one is resolved against the directory of the main
 * file, the dump's first: nginx's configuration prefix). The dump lists the
 * files in the order nginx reads them, so the pattern order is the LOAD order
 * of the directories they name — what tells whether a site loads before the
 * installer's catch-all when that file does not exist yet
 * (production/address_claims.ts nginxLoadOrder). Patterns only, never text.
 */
export function nginxIncludes(dump: string): string[] {
	const sections = nginxSections(dump);
	const main = sections[0]?.file ?? '';
	const prefix = main.slice(0, main.lastIndexOf('/') + 1);
	return sections.flatMap(({ text }) =>
		[...text.replace(/#[^\n]*/g, '').matchAll(/(?:^|[;{}\s])include\s+([^;\s]+)\s*;/g)].map((m) => {
			const pattern = (m[1] as string).replace(/^["']|["']$/g, '');
			return pattern.startsWith('/') ? pattern : `${prefix}${pattern}`;
		}),
	);
}

/** The `listen` values of one server block's body. */
function listenValues(body: string): string[] {
	return [...body.matchAll(/^\s*listen\s+([^;]+);/gm)].map((m) => m[1] as string);
}

/** The directives of one server block's body: names, ports, and the ports it is the default of. */
function serverDirectives(body: string): string[][] {
	const names = [...body.matchAll(/^\s*server_name\s+([^;]+);/gm)].flatMap((m) =>
		(m[1] as string).trim().split(/\s+/),
	);
	const listens = listenValues(body);
	const ports = listens.map(listenPort);
	const defaults = listens
		.filter((value) => /\s(default_server|default)(\s|$)/.test(value))
		.map(listenPort);
	return [names, ports.length === 0 ? ['80'] : ports, [...new Set(defaults)]];
}

/** The address-specific binds of one server block's body. */
function serverBinds(body: string): SiteBind[] {
	return listenValues(body)
		.map(listenBind)
		.filter((bind): bind is SiteBind => bind !== null);
}

/** The top-level `server { … }` bodies of a text (brace depth; comments removed). */
function serverBlocks(text: string): string[] {
	const clean = text.replace(/#[^\n]*/g, '');
	const blocks: string[] = [];
	const opener = /\bserver\s*\{/g;
	for (let match = opener.exec(clean); match !== null; match = opener.exec(clean)) {
		const end = blockEnd(clean, match.index + match[0].length);
		blocks.push(clean.slice(match.index + match[0].length, end));
		opener.lastIndex = end;
	}
	return blocks;
}

/** The index of the brace closing a block that opened just before `from`. */
function blockEnd(text: string, from: number): number {
	let depth = 1;
	let index = from;
	for (; index < text.length && depth > 0; index++) {
		if (text[index] === '{') depth++;
		else if (text[index] === '}') depth--;
	}
	return index;
}

/** `nginx -T` → the site tuples (one per server block). */
export function nginxSites(dump: string): SiteTuple[] {
	return nginxSections(dump).flatMap(({ file, text }) =>
		serverBlocks(text).map((body) => {
			const [names = [], ports = [], defaults = []] = serverDirectives(body);
			const binds = serverBinds(body);
			return {
				file,
				names,
				ports,
				roots: nginxRoots(body),
				...(defaults.length === 0 ? {} : { defaults }),
				...(binds.length === 0 ? {} : { binds }),
			};
		}),
	);
}

/** An http-scope name an nginx file defines: an `upstream` or a shared-memory `zone=`. */
export interface HttpName {
	file: string;
	name: string;
}

/**
 * `nginx -T` → every `upstream <name>` and `zone=<name>` (limit_req_zone,
 * limit_conn_zone…) with its file — NAMES only (critique A11). These are global
 * to nginx: a site defining `upstream dedalo_<i>` beside another file's
 * definition makes `nginx -t` fail for the whole host.
 */
export function nginxHttpNames(dump: string): HttpName[] {
	return nginxSections(dump).flatMap(({ file, text }) => {
		const clean = text.replace(/#[^\n]*/g, '');
		return [
			...[...clean.matchAll(/\bupstream\s+([A-Za-z0-9_.-]+)\s*\{/g)].map((m) => m[1] as string),
			...[...clean.matchAll(/\bzone=([A-Za-z0-9_.-]+):/g)].map((m) => m[1] as string),
		].map((name) => ({ file, name }));
	});
}

/** The names this instance's nginx site defines at http scope (web/nginx.ts renderNginxSite). */
export function instanceHttpNames(instance: string): string[] {
	return [`dedalo_${instance}`, `dedalo_${instance}_api`];
}

/** The first of `names` another file already defines, or null. */
export function httpNameClash(
	defined: readonly HttpName[],
	names: readonly string[],
	ownFile: string,
): HttpName | null {
	return defined.find((item) => item.file !== ownFile && names.includes(item.name)) ?? null;
}

/**
 * `apache2ctl -S` / `httpd -S` → the site tuples (one per named vhost line,
 * aliases folded in). The address column: a single vhost's own line
 * (`10.0.0.5:443 name (file:line)`), or the `10.0.0.5:443 is a NameVirtualHost`
 * header its indented `port N namevhost` lines belong to (`binds`).
 */
export function apacheSites(output: string): SiteTuple[] {
	const sites: SiteTuple[] = [];
	const scan = { group: undefined as string | undefined };
	for (const line of output.split('\n')) apacheLine(line, sites, scan);
	return sites;
}

/** One `-S` line into `sites` (`scan.group`: the NameVirtualHost address the next namevhost lines belong to). */
function apacheLine(line: string, sites: SiteTuple[], scan: { group: string | undefined }): void {
	const header = /^(\S+):\d+\s+is a NameVirtualHost/.exec(line.trim());
	const vhost = /port (\d+) namevhost (\S+) \((.+?):\d+\)/.exec(line);
	const single = /^(\S*):(\d+)\s+(\S+) \((.+?):\d+\)/.exec(line.trim());
	const alias = /^\s+alias (\S+)/.exec(line);
	if (header) scan.group = header[1];
	else if (vhost) sites.push(apacheSite(vhost[3], vhost[2], vhost[1], scan.group));
	else if (single) {
		scan.group = undefined;
		sites.push(apacheSite(single[4], single[3], single[2], single[1]));
	} else if (alias) sites.at(-1)?.names.push(alias[1] as string);
}

/** One Apache vhost tuple (`address`: its `-S` address column — a wildcard binds nothing). */
function apacheSite(
	file: string | undefined,
	name: string | undefined,
	port: string | undefined,
	address: string | undefined,
): SiteTuple {
	const bind = bindOf(address, port as string);
	return {
		file: file as string,
		names: [name as string],
		ports: [port as string],
		...(bind === null ? {} : { binds: [bind] }),
	};
}

/**
 * The first OTHER site file that answers `serverName` on one of `ports`, or
 * null. `ownFile` (this instance's site file) never clashes with itself.
 */
export function serverNameClash(
	sites: readonly SiteTuple[],
	serverName: string,
	ports: readonly string[],
	ownFile: string,
): SiteTuple | null {
	return (
		sites.find(
			(site) =>
				site.file !== ownFile &&
				site.names.some((name) => name.toLowerCase() === serverName) &&
				site.ports.some((port) => ports.includes(port)),
		) ?? null
	);
}

/** `ss -ltnpH` → each listening port with the process that holds it. */
export function listeningPorts(output: string): { port: string; process: string }[] {
	return output
		.split('\n')
		.filter((line) => line.trim() !== '')
		.map((line) => {
			const columns = line.trim().split(/\s+/);
			const local = columns[3] ?? '';
			return {
				port: /:(\d+)$/.exec(local)?.[1] ?? '',
				process: /users:\(\("([^"]+)"/.exec(line)?.[1] ?? 'unknown',
			};
		});
}
