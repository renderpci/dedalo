/**
 * THE PUBLIC-URL PROBE DRILL'S OWN PIECES — held without the live servers.
 *
 * scripts/publication_host_probe_drill.ts runs on the instance CI tier only, because it
 * boots Apache and nginx. What it builds must be right before it can prove anything, so
 * this gate holds, hermetically (loopback only):
 *   - the forwarding seam carries the REAL guard: a public name is vetted, PINNED, and
 *     reaches the loopback server with its Host kept; a 404 arrives as the typed
 *     outbound failure carrying its status; a redirect is refused, never followed;
 *   - a private answer (split-horizon DNS) is refused BY THE GUARD, and the forwarder is
 *     never called. The seam cannot carry a private destination through;
 *   - the forwarder refuses any request the guard did not pin;
 *   - the open-gate includes are open by construction (no Rule B, no marker store);
 *   - the child env points the engine at the drill's scratch dirs, whatever the
 *     operator's configuration says;
 *   - missing binaries are named (the drill is RED on a bare runner, never a skip).
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import {
	DRILL_PRIVATE_URL,
	DRILL_PUBLIC_ADDRESS,
	DRILL_PUBLIC_HOST,
	DRILL_PUBLIC_URL,
	type ForwardedCall,
	forwardingHopDeps,
	missingProbeBinaries,
	permissiveApacheInclude,
	permissiveNginxInclude,
	probeChildEnv,
	selectServers,
} from '../../scripts/lib/publication_host_probe_drill_kit.ts';
import { DedaloError } from '../../src/core/errors/dedalo_error.ts';
import { fetchGuardedText } from '../../src/core/security/ssrf_guard.ts';

let server: ReturnType<typeof Bun.serve>;
beforeAll(() => {
	server = Bun.serve({
		hostname: '127.0.0.1',
		port: 0,
		fetch: (req) => {
			const path = new URL(req.url).pathname;
			if (path === '/dedalo/media/ok.jpg') return new Response('OK');
			if (path === '/moved') {
				return new Response(null, { status: 302, headers: { location: '/dedalo/media/ok.jpg' } });
			}
			return new Response('gone', { status: 404 });
		},
	});
});
afterAll(() => server.stop(true));

const OPTIONS = { maxBytes: 64, timeoutMs: 5_000 };
const port = (): number => server.port as number;

async function refusal(promise: Promise<unknown>): Promise<DedaloError> {
	try {
		await promise;
	} catch (error) {
		if (error instanceof DedaloError) return error;
		throw error;
	}
	throw new Error('expected a refusal, got an answer');
}

describe('drill kit — the forwarding seam carries the real guard', () => {
	test('a public name is vetted, PINNED, and forwarded with its Host kept', async () => {
		const calls: ForwardedCall[] = [];
		const deps = forwardingHopDeps(port, calls);
		expect(await fetchGuardedText(`${DRILL_PUBLIC_URL}/dedalo/media/ok.jpg`, OPTIONS, deps)).toBe(
			'OK',
		);
		expect(calls).toEqual([
			{
				pinnedUrl: `https://${DRILL_PUBLIC_ADDRESS}/dedalo/media/ok.jpg`,
				host: DRILL_PUBLIC_HOST,
				method: 'GET',
			},
		]);
	});

	test('a 404 arrives as the typed outbound failure carrying its status', async () => {
		const deps = forwardingHopDeps(port, []);
		const error = await refusal(
			fetchGuardedText(`${DRILL_PUBLIC_URL}/dedalo/media/no.jpg`, OPTIONS, deps),
		);
		expect(error.code).toBe('security.outbound_failed');
		expect(error.coordinates?.status).toBe(404);
	});

	test('a redirect is refused, never followed', async () => {
		const calls: ForwardedCall[] = [];
		const error = await refusal(
			fetchGuardedText(`${DRILL_PUBLIC_URL}/moved`, OPTIONS, forwardingHopDeps(port, calls)),
		);
		expect(error.code).toBe('security.outbound_failed');
		expect(error.coordinates?.reason).toBe('redirect');
		expect(calls.length).toBe(1);
	});

	test('a private answer (split-horizon DNS) is refused by the guard; the forwarder is never called', async () => {
		const calls: ForwardedCall[] = [];
		const error = await refusal(
			fetchGuardedText(
				`${DRILL_PRIVATE_URL}/dedalo/media/ok.jpg`,
				OPTIONS,
				forwardingHopDeps(port, calls),
			),
		);
		expect(error.code).toBe('security.ssrf_blocked');
		expect(calls).toEqual([]);
	});

	test('a name the drill does not own never resolves; nothing is forwarded', async () => {
		const calls: ForwardedCall[] = [];
		await expect(
			fetchGuardedText('https://elsewhere.example/x', OPTIONS, forwardingHopDeps(port, calls)),
		).rejects.toThrow();
		expect(calls).toEqual([]);
	});

	test('the forwarder refuses a request the guard did not pin', async () => {
		const deps = forwardingHopDeps(port, []);
		await expect(deps.fetch?.(`${DRILL_PUBLIC_URL}/x`, { method: 'GET' })).rejects.toThrow(
			'not pinned',
		);
	});
});

describe('drill kit — the open gate, the child env, the binaries', () => {
	test('the open-gate includes serve the whole root: no Rule B, no marker store', () => {
		const apache = permissiveApacheInclude('/srv/m', '/dedalo/media');
		expect(apache).toContain('Alias /dedalo/media "/srv/m"');
		expect(apache).toContain('Require all granted');
		const nginx = permissiveNginxInclude('/srv/m', '/dedalo/media');
		expect(nginx).toContain('location ^~ /dedalo/media/ {');
		expect(nginx).toContain('alias /srv/m/;');
		for (const text of [apache, nginx]) expect(text).not.toContain('.publication');
	});

	test('the child env points the engine at the scratch dirs, whatever the operator says', () => {
		const env = probeChildEnv(
			{
				DB_NAME: 'app',
				DEDALO_PRIVATE_DIR: '/real/private',
				DEDALO_TEST_MEDIA_ROOT: '/real/media',
			},
			{ PATH: '/usr/bin', HOME: '/home/op' },
			{ privateDir: '/s/private', mediaRoot: '/s/media' },
		);
		expect(env).toEqual({
			DB_NAME: 'app',
			DEDALO_PRIVATE_DIR: '/s/private',
			DEDALO_TEST_MEDIA_ROOT: '/s/media',
			PATH: '/usr/bin',
			HOME: '/home/op',
		});
	});

	test('missing binaries are named per server; present ones are not', () => {
		expect(missingProbeBinaries(['apache', 'nginx'], () => null)).toEqual([
			'apache: apxs',
			'nginx: nginx',
		]);
		expect(missingProbeBinaries(['nginx'], () => null)).toEqual(['nginx: nginx']);
		expect(missingProbeBinaries(['apache', 'nginx'], (bin) => `/usr/bin/${bin}`)).toEqual([]);
	});

	test('--only selects one server, none selects both, anything else is refused', () => {
		expect(selectServers(undefined)).toEqual(['apache', 'nginx']);
		expect(selectServers('nginx')).toEqual(['nginx']);
		expect(selectServers('iis')).toBeNull();
	});
});
