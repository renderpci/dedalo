/**
 * `provision init` B5 (engineering/PUBLICATION_HOST_SPEC.md §9, spec §6) against the REAL
 * pairing command: publication/host_agent/src/provision/init/pair.ts `pairOneMachine` drives
 * scripts/publication_host_pair.ts through the agent's REAL exec.ts `initExec().pairAsEngine`
 * — its argv, its cwd, its allowlisted env, its stdin token and its timeout — with ONE seam:
 * the spawner drops the six-word `setsid --wait runuser -u <user> --` prefix (a non-root test
 * cannot switch users) and runs the rest exactly as built. Everything after that prefix is
 * what production runs.
 *
 * The world is the pair CLI gate's layer 3 (publication_host_pair_cli_native): a scratch
 * private dir owned by this uid and declared a scratch publication-hosts base, and a loopback
 * unix-socket mock agent publishing the fingerprint. The mock runs in its OWN process: the
 * exec door is synchronous (spawnSync) and would block an in-process server.
 *
 * Asserted: a first add proves and registers (no bearer reaches the agent); a second add
 * meets the CLI's "already registered. Use `replace`" and becomes the replace decision; the
 * replace then succeeds; another name for the same agent meets "this agent is already
 * registered as '<twin>'" and becomes the twin decision; nothing printed carries the token.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir, userInfo } from 'node:os';
import { join, resolve } from 'node:path';
import {
	initExec,
	provisionSpawner,
	type SyncSpawner,
} from '../../publication/host_agent/src/exec.ts';
import {
	type PairPorts,
	pairInvocation,
	pairOneMachine,
} from '../../publication/host_agent/src/provision/init/pair.ts';
import type { WorkUnit } from '../../publication/host_agent/src/provision/init/types.ts';
import { type AgentLayout, derive } from '../../publication/host_agent/src/provision/layout.ts';
import { engineFragmentRenderer } from '../../publication/host_agent/src/provision/render/engine_fragment.ts';
import { instanceFingerprint } from '../../publication/host_agent/src/security/pairing.ts';
import { declareScratchPublicationHostsDir } from '../../scripts/lib/publication_host_scratch.ts';

const ROOT = resolve(import.meta.dir, '../..');
const INSTANCE = 'test';
const TOKEN = 'init-pair-native-token-not-a-secret-0123456789';
const NAME = 'init_pair';
const RUNUSER_PREFIX = 6; // setsid --wait runuser -u <user> --

let work: string;
let sockDir: string;
let privateRoot: string;
let layout: AgentLayout;
let agent: ReturnType<typeof Bun.spawn> | null = null;
const hits: string[] = [];

/** exec.ts's real spawner minus the user switch; records every argv it ran. */
const spawner: SyncSpawner = {
	run(argv, options) {
		expect(argv.slice(0, RUNUSER_PREFIX)).toEqual([
			'setsid',
			'--wait',
			'runuser',
			'-u',
			userInfo().username,
			'--',
		]);
		hits.push(argv.slice(RUNUSER_PREFIX).join(' '));
		return provisionSpawner.run(argv.slice(RUNUSER_PREFIX), options);
	},
};

function ports(): PairPorts {
	return {
		exec: initExec(spawner),
		io: {
			readRootFile: (path: string) => (path === layout.serviceTokenPath ? `${TOKEN}\n` : null),
		},
		// biome-ignore lint/suspicious/noControlCharactersInRegex: stripping C0 controls IS the sanitizer's job.
		sanitize: (line: string) => line.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, ''),
	};
}

function engineUnit(): WorkUnit {
	return {
		unit: 'dedalo-ts',
		user: userInfo().username,
		group: 'staff',
		checkout: ROOT,
		bun: process.execPath,
		// NODE_ENV and the rest of the unit's Environment= never reach the child (pair.ts pairEnv).
		env: { DEDALO_PRIVATE_DIR: privateRoot, NODE_ENV: 'production' },
		privateDir: privateRoot,
		privateUid: userInfo().uid,
		fragmentPending: false,
	};
}

const invocation = (name: string, verb: 'add' | 'replace' = 'add') =>
	pairInvocation(engineUnit(), layout, userInfo().homedir, { name, verb, dryRun: false });

const registry = (): { hosts: { name: string; fingerprint: string }[] } =>
	JSON.parse(readFileSync(join(privateRoot, 'publication_hosts.json'), 'utf8'));

function expectNoToken(value: unknown): void {
	expect(JSON.stringify(value)).not.toContain(TOKEN);
}

beforeAll(async () => {
	work = mkdtempSync(join(tmpdir(), 'dedalo-init-pair-'));
	// macOS caps a unix socket path at 104 bytes; the default TMPDIR is too long for it.
	sockDir = mkdtempSync('/tmp/dd-ip-');
	const socket = join(sockDir, 'agent.sock');
	const base = derive({
		instance: INSTANCE,
		listen: { kind: 'unix' },
		agent_user: 'dedalo-pubhost',
		engine_group: 'dedalo',
		agent_dir: '/opt/dedalo/publication/host_agent',
		web: { server: 'apache', unit: 'apache2' },
		v1: { user: 'dedalo-api-v1' },
		state_root: '/srv/dedalo_publication',
		media: { mode: 'shared', root: '/mnt/dedalo_media' },
		php_bin: '/usr/bin/php',
		bun_bin: '/usr/local/bin/bun',
		v2: {
			unit: 'dedalo-publication-api-v2',
			user: 'dedalo-api-v2',
			group: 'dedalo-api-v2',
			port: 3100,
			health_url: 'http://127.0.0.1:3100/health',
		},
		paths: { config_base: work },
	});
	if (base.listen.kind !== 'unix') throw new Error('unix declaration expected');
	// The PROVISIONER's own fragment, re-pointed at the scratch socket (the one seam of the layout).
	layout = { ...base, listen: { ...base.listen, socketPath: socket } };
	const [fragment] = engineFragmentRenderer.render(layout, {
		fingerprint: instanceFingerprint(INSTANCE, TOKEN),
	});
	if (fragment === undefined) throw new Error('the fragment renderer rendered nothing');
	writeFileSync(join(work, 'fragment.env'), fragment.body, { mode: 0o644 });
	layout = { ...layout, engineFragmentPath: join(work, 'fragment.env') };

	const fp = instanceFingerprint(INSTANCE, TOKEN);
	const source = `Bun.serve({ unix: ${JSON.stringify(socket)}, fetch(req) {
		const u = new URL(req.url);
		console.log(req.method + ' ' + u.pathname + ' ' + (req.headers.get('authorization') === null ? 'nobearer' : 'BEARER'));
		if (req.method === 'GET' && u.pathname === '/publication/host_agent/health')
			return Response.json({ status: 'ok', service: 'dedalo-publication-host-agent', instance_fingerprint: ${JSON.stringify(fp)} });
		return new Response(null, { status: 404 });
	} }); console.log('listening');`;
	agent = Bun.spawn([process.execPath, '-e', source], { stdout: 'pipe', stderr: 'inherit' });
	const reader = (agent.stdout as ReadableStream<Uint8Array>).getReader();
	const decoder = new TextDecoder();
	let buffered = '';
	while (!buffered.includes('listening')) {
		const chunk = await reader.read();
		if (chunk.done) throw new Error('the mock agent exited before it listened');
		buffered += decoder.decode(chunk.value);
	}
	void (async () => {
		for (;;) {
			const chunk = await reader.read().catch(() => ({ done: true, value: undefined }));
			if (chunk.done) return;
			hits.push(
				...decoder
					.decode(chunk.value)
					.split('\n')
					.filter((l) => l.startsWith('GET') || l.startsWith('POST')),
			);
		}
	})();
});

afterAll(() => {
	agent?.kill();
	rmSync(work, { recursive: true, force: true });
	rmSync(sockDir, { recursive: true, force: true });
});

beforeEach(() => {
	privateRoot = mkdtempSync(join(work, 'private-'));
	declareScratchPublicationHostsDir(privateRoot, 'publication_host_init_pair_native');
	hits.length = 0;
});

describe('init B5 against the real pairing command', () => {
	test('add: dry run then the real pairing, registered, no bearer at the agent, no token printed', async () => {
		const outcome = pairOneMachine(invocation(NAME), layout, ports());
		expect(outcome.kind, JSON.stringify(outcome)).toBe('done');
		expectNoToken(outcome);
		expect(registry().hosts.map((h) => [h.name, h.fingerprint])).toEqual([
			[NAME, instanceFingerprint(INSTANCE, TOKEN)],
		]);
		await Bun.sleep(50); // the mock's stdout is read asynchronously
		const runs = hits.filter((h) => h.includes('publication_host_pair.ts'));
		expect(runs).toHaveLength(2);
		expect(runs[0]).toEndWith('--token-stdin --dry-run');
		expect(runs[1]).toEndWith('--token-stdin');
		const agentHits = hits.filter((h) => h.startsWith('GET') || h.startsWith('POST'));
		expect(agentHits.length).toBeGreaterThan(0);
		for (const hit of agentHits) expect(hit).toBe('GET /publication/host_agent/health nobearer');
	});

	test('a second add is the replace decision; replace then succeeds', () => {
		expect(pairOneMachine(invocation(NAME), layout, ports()).kind).toBe('done');
		const again = pairOneMachine(invocation(NAME), layout, ports());
		expect(again.kind === 'decision' ? again.id : again.kind, JSON.stringify(again)).toBe(
			'replace',
		);
		expectNoToken(again);
		const replaced = pairOneMachine(invocation(NAME, 'replace'), layout, ports());
		expect(replaced.kind, JSON.stringify(replaced)).toBe('done');
		expect(registry().hosts.map((h) => h.name)).toEqual([NAME]);
	});

	test('the same agent under another name is the twin decision, naming the registered name', () => {
		expect(pairOneMachine(invocation(NAME), layout, ports()).kind).toBe('done');
		const twin = pairOneMachine(invocation('init_pair_two'), layout, ports());
		expect(twin.kind === 'decision' && twin.id === 'twin' ? twin.twin : JSON.stringify(twin)).toBe(
			NAME,
		);
		expect(registry().hosts.map((h) => h.name)).toEqual([NAME]);
		expect(existsSync(join(privateRoot, 'publication_hosts', 'init_pair_two'))).toBe(false);
	});

	test('a fragment whose fingerprint another token made is refused by the CLI and nothing is written', () => {
		const ports_ = ports();
		const other: PairPorts = {
			...ports_,
			io: { readRootFile: () => 'init-pair-native-OTHER-token-0123456789abcdefgh' },
		};
		const outcome = pairOneMachine(invocation(NAME), layout, other);
		expect(outcome.kind).toBe('refused');
		expect(existsSync(join(privateRoot, 'publication_hosts.json'))).toBe(false);
	});
});
