/**
 * THE PUBLIC-URL PROBE DRILL'S OWN PIECES — pure, and free of the engine's config.
 * The parent drill (scripts/publication_host_probe_drill.ts) imports them without
 * evaluating a configuration it is about to replace, and
 * test/unit/publication_host_probe_drill_kit.test.ts holds them hermetically.
 *
 * THE ONE SEAM, AND WHAT IT DOES NOT BYPASS. The probe must go through the PUBLIC door
 * (`fetchGuardedText`, engineering/PUBLICATION_HOST_SPEC.md §7). That door refuses
 * 127.0.0.1, where the drill's web servers listen, by design. `forwardingHopDeps` gets
 * the drill in WITHOUT weakening the door. It supplies the guard's two injectable seams
 * (`PinnedHopDeps`) and nothing else, and the drill hands them to
 * `probePublicGate(name, deps)` as its per-call argument: nothing is installed
 * process-wide, so no other caller of the probe or the guard ever sees them.
 *   - `lookup` answers a PUBLIC address for the drill's public name, a PRIVATE one for its
 *     split-horizon name, and nothing for any other name. The guard still vets every
 *     answer.
 *   - `fetch` receives the request AFTER the guard has pinned it. It refuses one not
 *     pinned to the vetted public address, records it, and only then forwards it to the
 *     loopback server.
 * Everything the probe decides (validation, URL, status reading, verdict, runtime write)
 * and everything the guard decides (vetting, pinning, the redirect refusal) runs
 * unmodified.
 */

import type {
	AddressLookup,
	PinnedFetchInit,
	PinnedHopDeps,
} from '../../src/core/security/ssrf_guard.ts';

export const DRILL_SERVERS = ['apache', 'nginx'] as const;
export type DrillServer = (typeof DRILL_SERVERS)[number];

/** The drill's public site: a name no real resolver is ever asked. */
export const DRILL_PUBLIC_HOST = 'www.pubhost-drill.example';
/** A globally routable address the guard accepts; nothing is ever sent to it. */
export const DRILL_PUBLIC_ADDRESS = '93.184.215.14';
export const DRILL_PUBLIC_URL = `https://${DRILL_PUBLIC_HOST}`;
/** Split-horizon DNS: the institution's own name resolving to an internal address. */
export const DRILL_PRIVATE_HOST = 'internal.pubhost-drill.example';
export const DRILL_PRIVATE_ADDRESS = '10.20.30.40';
export const DRILL_PRIVATE_URL = `https://${DRILL_PRIVATE_HOST}`;

/** One request that reached the forwarder: the pinned URL and the Host it carried. */
export interface ForwardedCall {
	pinnedUrl: string;
	host: string | null;
	method: string;
}

const ANSWERS: Readonly<Record<string, string>> = {
	[DRILL_PUBLIC_HOST]: DRILL_PUBLIC_ADDRESS,
	[DRILL_PRIVATE_HOST]: DRILL_PRIVATE_ADDRESS,
};

/**
 * The guard's seams for the drill. `port` is read per request (the drill restarts its
 * server on a fresh port); `calls` records every request the guard let through.
 */
export function forwardingHopDeps(port: () => number, calls: ForwardedCall[]): PinnedHopDeps {
	// Unknown names (and RFC 7050 discovery's ipv4only.arpa) get NO answer, never a throw:
	// the guard then refuses an unresolvable target on its own terms.
	const lookup: AddressLookup = async (host) => {
		const address = ANSWERS[host];
		return address === undefined ? [] : [{ address, family: 4 }];
	};
	const forward = async (url: string, init: PinnedFetchInit): Promise<Response> => {
		const target = new URL(url);
		if (target.hostname !== DRILL_PUBLIC_ADDRESS) {
			throw new Error(
				`drill fetch refused a request not pinned to ${DRILL_PUBLIC_ADDRESS}: ${url}`,
			);
		}
		const headers = new Headers(init.headers);
		calls.push({ pinnedUrl: url, host: headers.get('host'), method: init.method ?? 'GET' });
		headers.delete('host');
		return fetch(`http://127.0.0.1:${port()}${target.pathname}${target.search}`, {
			method: init.method,
			headers,
			redirect: 'manual',
			signal: init.signal,
		});
	};
	return { lookup, fetch: forward };
}

/** An OPEN gate on Apache: the whole root served, no Rule B, no marker store. */
export function permissiveApacheInclude(root: string, url: string): string {
	return [
		`Alias ${url} "${root}"`,
		`<Directory "${root}">`,
		'\tRequire all granted',
		'</Directory>',
		'',
	].join('\n');
}

/** An OPEN gate on nginx: `^~` so the harness's operator regex location cannot take it. */
export function permissiveNginxInclude(root: string, url: string): string {
	return [`location ^~ ${url}/ {`, `\talias ${root}/;`, '}', ''].join('\n');
}

const NEEDS: Readonly<Record<DrillServer, readonly string[]>> = {
	apache: ['apxs'],
	nginx: ['nginx'],
};

/** `<server>: <binary>` for every binary a selected server needs that PATH lacks. */
export function missingProbeBinaries(
	servers: readonly DrillServer[],
	which: (bin: string) => string | null = (bin) => Bun.which(bin),
): string[] {
	return servers.flatMap((server) =>
		NEEDS[server].filter((bin) => which(bin) === null).map((bin) => `${server}: ${bin}`),
	);
}

/** `--only` → the servers to drill; null = an invalid value (refused, never ignored). */
export function selectServers(only: string | undefined): DrillServer[] | null {
	if (only === undefined) return [...DRILL_SERVERS];
	return (DRILL_SERVERS as readonly string[]).includes(only) ? [only as DrillServer] : null;
}

/**
 * The child's whole environment: the operator's composed config (catalog keys only,
 * scripts/lib/operator_config.ts), PATH/HOME, and the two scratch pointers, which ALWAYS
 * win. The engine half then cannot read or write the installation's registry, runtime
 * file or media tree (the test media root also outranks MEDIA_PATH, src/config/config.ts).
 */
export function probeChildEnv(
	operator: Readonly<Record<string, string>>,
	ambient: { PATH?: string; HOME?: string },
	scratch: { privateDir: string; mediaRoot: string },
): Record<string, string> {
	return {
		...operator,
		PATH: ambient.PATH ?? '/usr/local/bin:/usr/bin:/bin',
		HOME: ambient.HOME ?? scratch.privateDir,
		DEDALO_PRIVATE_DIR: scratch.privateDir,
		DEDALO_TEST_MEDIA_ROOT: scratch.mediaRoot,
	};
}
