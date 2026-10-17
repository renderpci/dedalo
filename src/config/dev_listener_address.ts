/**
 * THE DEVELOPMENT LISTENER'S ADDRESS, AS A BROWSER OPENS IT — one function for
 * every reader of `SERVER_TCP_PORT` / `SERVER_TCP_HOST` / the TLS pair: the
 * server's boot line (tcp_listener.ts devTcpListener) and the installer's
 * developer route (src/core/install/dev_listener.ts — the Review, the final
 * screen), so the URL an install prints is the URL the server prints, never a
 * second hand-composed spelling (design DEV_ROUTE_SERVE §1.3).
 *
 * IMPORT-FREE on purpose: the installer's plan is config-free (it is built
 * before the process environment config.ts freezes is seeded), so this module
 * may not reach the catalog readers tcp_listener.ts needs.
 * Gates: test/unit/dev_listener_tls_native.test.ts (server side),
 * test/unit/install_dev_route_listener_native.test.ts (installer side).
 */

const LOOPBACK: ReadonlySet<string> = new Set(['127.0.0.1', '::1', 'localhost']);
const WILDCARD: ReadonlySet<string> = new Set(['0.0.0.0', '::']);

/** Does a bind on `hostname` stay on this machine? */
export function isLoopbackBind(hostname: string): boolean {
	return LOOPBACK.has(hostname);
}

/** The host a URL names: a wildcard or loopback bind is opened as localhost. */
function urlHost(hostname: string): string {
	if (LOOPBACK.has(hostname) || WILDCARD.has(hostname)) return 'localhost';
	return hostname.includes(':') ? `[${hostname}]` : hostname;
}

/** The client page's address on a listener bound to `hostname:port` (`https://` with TLS). */
export function devListenerUrl(hostname: string, port: number | string, tls: boolean): string {
	return pageUrl(urlHost(hostname), port, tls);
}

function pageUrl(host: string, port: number | string, tls: boolean): string {
	return `${tls ? 'https' : 'http'}://${host}:${Number(port)}/dedalo/core/page/`;
}

/**
 * EVERY address a browser may open the listener by — what the installer's
 * final screen lists (DEV_ROUTE_SERVE §1.3): a loopback or wildcard bind by
 * `127.0.0.1` and `localhost` (both certified by the local CA), a wildcard
 * bind also by each of this machine's network addresses (`lan`), one bound
 * address by itself. Same spelling as {@link devListenerUrl}, never a second one.
 */
export function devListenerUrls(
	hostname: string,
	port: number | string,
	tls: boolean,
	lan: readonly string[] = [],
): string[] {
	const hosts =
		hostname === '::1'
			? ['[::1]', 'localhost']
			: LOOPBACK.has(hostname) || WILDCARD.has(hostname)
				? ['127.0.0.1', 'localhost', ...(WILDCARD.has(hostname) ? lan.map(urlHost) : [])]
				: [urlHost(hostname)];
	return [...new Set(hosts)].map((host) => pageUrl(host, port, tls));
}
