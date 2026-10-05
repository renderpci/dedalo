#!/usr/bin/env bun
/**
 * PUBLIC-URL PROBE DRILL — the ENGINE half. scripts/publication_host_probe_drill.ts
 * spawns it with a scratch DEDALO_PRIVATE_DIR and a scratch DEDALO_TEST_MEDIA_ROOT, and
 * it refuses to run otherwise. Never point it at an installation.
 *
 * Per server it boots a REAL Apache or nginx with the ENGINE-rendered publication-host
 * include over the scratch media tree, then drives the ENGINE's probe
 * (src/core/publication_host/probe.ts) through the public door. The guard's seams
 * (scripts/lib/publication_host_probe_drill_kit.ts) are handed to every
 * `probePublicGate(HOST, ctx.deps)` call as its optional per-call argument — the probe
 * module has no process-wide override, so nothing outside this drill can be repointed.
 * The rows are the spec §7 contract:
 *   gated: validation ok; published 200 + unpublished 404 → ok, each request pinned;
 *          the verdict persisted in the runtime file;
 *          "published" file unpublished / "unpublished" file published / a master tier
 *          / a public name resolving to a private address → unknown, NOTHING sent;
 *   open gate (no Rule B): unpublished 200 → failed, persisted;
 *   gate down: never ok, always with a reason.
 */

import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { config } from '../../src/config/config.ts';
import { privateDir } from '../../src/config/env.ts';
import {
	buildNginxMap,
	getPublicQualities,
	markerStoreBase,
	mediaRoot,
} from '../../src/core/media/protection.ts';
import {
	buildPublicationHostApacheConf,
	buildPublicationHostNginxConf,
	publicationHostMediaUrl,
} from '../../src/core/media/publication_host_rules.ts';
import { publicationHostFingerprint } from '../../src/core/publication_host/pairing.ts';
import {
	type ProbeDeps,
	probePublicGate,
	validateProbePaths,
} from '../../src/core/publication_host/probe.ts';
import {
	getHost,
	type PublicationHostRecord,
	updateRegistry,
} from '../../src/core/publication_host/registry.ts';
import { type HostRuntime, loadRuntime } from '../../src/core/publication_host/runtime.ts';
import { makeMarkerKey } from '../../src/diffusion/targets/mediastore/media_index.ts';
import { markMediaRoot } from '../../test/helpers/media_scratch_root.ts';
import {
	DRILL_PRIVATE_URL,
	DRILL_PUBLIC_HOST,
	DRILL_PUBLIC_URL,
	DRILL_SERVERS,
	type DrillServer,
	type ForwardedCall,
	forwardingHopDeps,
	permissiveApacheInclude,
	permissiveNginxInclude,
} from './publication_host_probe_drill_kit.ts';
import {
	apacheBinary,
	apacheMainConf,
	freePort,
	nginxMainConf,
	sh,
	waitUp,
} from './web_server_harness.ts';

const HOST = 'drill';

type Probe = HostRuntime['probe'];
type Check = () => Promise<string | null>;

interface DrillPaths {
	published: string;
	unpublished: string;
	master: string;
	publishedKey: string;
	unpublishedKey: string;
}

interface DrillContext {
	scratch: string;
	root: string;
	paths: DrillPaths;
	calls: ForwardedCall[];
	/** The guard's seams, passed to every probePublicGate call (never installed globally). */
	deps: ProbeDeps;
	setPort(port: number): void;
}

interface LiveServer {
	stop(): Promise<void>;
}

interface Want {
	state: Probe['state'];
	published?: number;
	unpublished?: number;
	detail?: RegExp;
}

function childArgs(): { scratch: string; servers: DrillServer[] } {
	const { values } = parseArgs({
		options: { scratch: { type: 'string' }, servers: { type: 'string' } },
		strict: true,
	});
	const servers = (values.servers ?? '')
		.split(',')
		.filter((name): name is DrillServer => (DRILL_SERVERS as readonly string[]).includes(name));
	if (values.scratch === undefined || servers.length === 0) {
		throw new Error(
			'usage: spawned by scripts/publication_host_probe_drill.ts (--scratch <dir> --servers apache,nginx)',
		);
	}
	return { scratch: values.scratch, servers };
}

/** Refuse unless BOTH engine roots are this drill's scratch; then declare the media root. */
function claimScratch(scratch: string): string {
	const media = resolve(scratch, 'media');
	if (config.media.testRoot === null || resolve(config.media.testRoot) !== media) {
		throw new Error(
			`refusing: DEDALO_TEST_MEDIA_ROOT is not ${media} — run scripts/publication_host_probe_drill.ts`,
		);
	}
	if (privateDir !== resolve(scratch, 'private')) {
		throw new Error(`refusing: DEDALO_PRIVATE_DIR is ${privateDir}, not the drill's scratch`);
	}
	markMediaRoot(media);
	const root = mediaRoot();
	if (root === null || resolve(root) !== media)
		throw new Error(`media root resolved to ${root}, not ${media}`);
	return root;
}

function markerKey(sectionTipo: string, sectionId: number): string {
	const key = makeMarkerKey(sectionTipo, sectionId);
	if (key === null) throw new Error(`no marker key for ${sectionTipo}_${sectionId}`);
	return key;
}

function drillPaths(): DrillPaths {
	const quality = getPublicQualities()[0];
	if (quality === undefined)
		throw new Error('no public media quality on this configuration — nothing to probe');
	const imageFolder = config.media.image.folder.replace(/^\/+|\/+$/g, '');
	return {
		published: `${quality}/0/test99_test3_1.jpg`,
		unpublished: `${quality}/0/test99_test3_2.jpg`,
		master: `${imageFolder}/${config.media.image.originalQuality}/0/test99_test3_1.jpg`,
		publishedKey: markerKey('test3', 1),
		unpublishedKey: markerKey('test3', 2),
	};
}

function setMarker(key: string, published: boolean): void {
	const base = markerStoreBase();
	if (base === null) throw new Error('no marker store base');
	const path = join(base, 'pub', key);
	if (!published) {
		rmSync(path, { force: true });
		return;
	}
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, '');
}

function plantTree(root: string, paths: DrillPaths): void {
	const files: [string, string][] = [
		[paths.published, 'PUBLISHED'],
		[paths.unpublished, 'UNPUBLISHED'],
		[paths.master, 'MASTER'],
	];
	for (const [rel, body] of files) {
		mkdirSync(dirname(join(root, rel)), { recursive: true });
		writeFileSync(join(root, rel), body);
	}
	setMarker(paths.publishedKey, true);
	setMarker(paths.unpublishedKey, false);
}

function freshRecord(ctx: DrillContext): PublicationHostRecord {
	return {
		name: HOST,
		instance: 'drill',
		fingerprint: publicationHostFingerprint('drill', 'd'.repeat(32)),
		address: { kind: 'unix', socket: join(ctx.scratch, 'agent.sock') },
		public_url: DRILL_PUBLIC_URL,
		qualities: null,
		probe: { published: ctx.paths.published, unpublished: ctx.paths.unpublished },
		paired_at: new Date().toISOString(),
	};
}

function putHost(next: PublicationHostRecord): void {
	updateRegistry((cur) => ({ ...cur, hosts: [...cur.hosts.filter((h) => h.name !== HOST), next] }));
}

function host(): PublicationHostRecord {
	const record = getHost(HOST);
	if (record === null) throw new Error('the drill host vanished from the registry');
	return record;
}

function gatedInclude(server: DrillServer, root: string): string {
	const input = { root, qualities: getPublicQualities() };
	return server === 'apache'
		? buildPublicationHostApacheConf(input)
		: buildPublicationHostNginxConf(input);
}

function openInclude(server: DrillServer, root: string): string {
	const url = publicationHostMediaUrl();
	return server === 'apache'
		? permissiveApacheInclude(root, url)
		: permissiveNginxInclude(root, url);
}

function apacheArgv(dir: string, port: number, include: string): string[] {
	const main = join(dir, 'main.apache.conf');
	writeFileSync(main, apacheMainConf(dir, port, include, true));
	const httpd = apacheBinary();
	const test = sh([httpd, '-t', '-f', main]);
	if (test.code !== 0) throw new Error(`${httpd} -t failed:\n${test.out}`);
	return [httpd, '-DFOREGROUND', '-f', main];
}

function nginxArgv(dir: string, port: number, include: string): string[] {
	const map = join(dir, 'map.nginx.conf');
	writeFileSync(map, buildNginxMap());
	const main = join(dir, 'main.nginx.conf');
	writeFileSync(main, nginxMainConf(dir, port, include, map));
	const errorLog = join(dir, 'nginx_error.log');
	const test = sh(['nginx', '-e', errorLog, '-t', '-p', dir, '-c', main]);
	if (test.code !== 0) throw new Error(`nginx -t failed:\n${test.out}`);
	return ['nginx', '-e', errorLog, '-p', dir, '-c', main];
}

async function startServer(
	server: DrillServer,
	ctx: DrillContext,
	label: string,
	include: string,
): Promise<LiveServer> {
	const dir = join(ctx.scratch, `${server}_${label}`);
	mkdirSync(join(dir, 'www'), { recursive: true });
	mkdirSync(join(dir, 'nginx_tmp'), { recursive: true });
	const includePath = join(dir, `pubhost.${server}.conf`);
	writeFileSync(includePath, include);
	const port = freePort();
	const argv =
		server === 'apache' ? apacheArgv(dir, port, includePath) : nginxArgv(dir, port, includePath);
	const proc = Bun.spawn(argv, { stdout: 'ignore', stderr: 'pipe' });
	const stop = async (): Promise<void> => {
		proc.kill('SIGTERM');
		await proc.exited;
	};
	try {
		await waitUp(`http://127.0.0.1:${port}`);
	} catch (error) {
		await stop();
		throw error;
	}
	ctx.setPort(port);
	return { stop };
}

function judge(probe: Probe, want: Want): string | null {
	if (probe.state !== want.state)
		return `state ${probe.state}, expected ${want.state} (detail: ${probe.detail ?? 'none'})`;
	if (want.published !== undefined && probe.published_status !== want.published) {
		return `published answered ${probe.published_status}, expected ${want.published}`;
	}
	if (want.unpublished !== undefined && probe.unpublished_status !== want.unpublished) {
		return `unpublished answered ${probe.unpublished_status}, expected ${want.unpublished}`;
	}
	if (want.detail !== undefined && !want.detail.test(probe.detail ?? '')) {
		return `detail ${JSON.stringify(probe.detail)} does not match ${want.detail}`;
	}
	return null;
}

const PROBE_FIELDS = ['state', 'at', 'published_status', 'unpublished_status', 'detail'] as const;

function sameProbe(stored: Probe | undefined, answer: Probe): boolean {
	return stored !== undefined && PROBE_FIELDS.every((field) => stored[field] === answer[field]);
}

async function withChange(
	apply: () => void,
	undo: () => void,
	check: Check,
): Promise<string | null> {
	apply();
	try {
		return await check();
	} finally {
		undo();
	}
}

/** The probe must decide WITHOUT a request: validation (or the guard) refused first. */
async function probeWithoutRequest(ctx: DrillContext, want: Want): Promise<string | null> {
	const before = ctx.calls.length;
	const probe = await probePublicGate(HOST, ctx.deps);
	if (ctx.calls.length !== before)
		return `${ctx.calls.length - before} request(s) left although the probe could not be valid`;
	return judge(probe, want);
}

async function gatedOkRow(ctx: DrillContext): Promise<string | null> {
	const before = ctx.calls.length;
	const probe = await probePublicGate(HOST, ctx.deps);
	const sent = ctx.calls.slice(before);
	if (sent.length < 2)
		return `${sent.length} request(s) reached the web server, expected one per file`;
	const lost = sent.find((call) => call.host !== DRILL_PUBLIC_HOST);
	if (lost !== undefined)
		return `a request lost the public Host (${lost.host}) — not the pinned public door`;
	return judge(probe, { state: 'ok', published: 200, unpublished: 404 });
}

async function persistedRow(ctx: DrillContext): Promise<string | null> {
	const probe = await probePublicGate(HOST, ctx.deps);
	const stored = (await loadRuntime())[HOST]?.probe;
	return sameProbe(stored, probe)
		? null
		: `runtime holds ${JSON.stringify(stored)}, the probe answered ${JSON.stringify(probe)}`;
}

function gatedRows(ctx: DrillContext): [string, Check][] {
	const { paths } = ctx;
	const unknown: Want = { state: 'unknown', detail: /\S/ };
	const restorePaths = (): void =>
		putHost({ ...host(), probe: { published: paths.published, unpublished: paths.unpublished } });
	return [
		[
			'the operator pair is validated against ground truth → ok',
			async () => {
				const verdict = await validateProbePaths(host());
				return verdict.ok ? null : `refused: ${verdict.reason}`;
			},
		],
		[
			'gated host: published 200 + unpublished 404 → ok, through the pinned public door',
			() => gatedOkRow(ctx),
		],
		['the verdict is persisted: runtime.probe equals the answer', () => persistedRow(ctx)],
		[
			'"published" file whose record was unpublished → unknown, nothing sent (never ok)',
			() =>
				withChange(
					() => setMarker(paths.publishedKey, false),
					() => setMarker(paths.publishedKey, true),
					() => probeWithoutRequest(ctx, unknown),
				),
		],
		[
			'"unpublished" file whose record was published → unknown, nothing sent',
			() =>
				withChange(
					() => setMarker(paths.unpublishedKey, true),
					() => setMarker(paths.unpublishedKey, false),
					() => probeWithoutRequest(ctx, unknown),
				),
		],
		[
			'a master-tier file as the published one → unknown, nothing sent',
			() =>
				withChange(
					() =>
						putHost({
							...host(),
							probe: { published: paths.master, unpublished: paths.unpublished },
						}),
					restorePaths,
					() => probeWithoutRequest(ctx, unknown),
				),
		],
		[
			'public URL resolving to a private address (split-horizon DNS) → unknown: private address, nothing sent',
			() =>
				withChange(
					() => putHost({ ...host(), public_url: DRILL_PRIVATE_URL }),
					() => putHost({ ...host(), public_url: DRILL_PUBLIC_URL }),
					() => probeWithoutRequest(ctx, { state: 'unknown', detail: /private address/i }),
				),
		],
	];
}

async function openGateRow(ctx: DrillContext): Promise<string | null> {
	const probe = await probePublicGate(HOST, ctx.deps);
	const wrong = judge(probe, { state: 'failed', published: 200, unpublished: 200 });
	if (wrong !== null) return wrong;
	return (await loadRuntime())[HOST]?.probe.state === 'failed'
		? null
		: 'the runtime does not hold the failed verdict';
}

async function downRow(ctx: DrillContext): Promise<string | null> {
	const probe = await probePublicGate(HOST, ctx.deps);
	if (probe.state === 'ok') return 'ok with no web server listening';
	return probe.detail === null ? `state ${probe.state} without a reason` : null;
}

async function row(server: DrillServer, name: string, check: Check): Promise<number> {
	let problem: string | null;
	try {
		problem = await check();
	} catch (error) {
		problem = `threw: ${error instanceof Error ? error.message : String(error)}`;
	}
	console.log(
		`${problem === null ? 'ok  ' : 'RED '} [${server}] ${name}${problem === null ? '' : ` (${problem})`}`,
	);
	return problem === null ? 0 : 1;
}

async function drillServer(server: DrillServer, ctx: DrillContext): Promise<number> {
	putHost(freshRecord(ctx));
	let red = 0;
	let live: LiveServer | null = await startServer(
		server,
		ctx,
		'gated',
		gatedInclude(server, ctx.root),
	);
	try {
		for (const [name, check] of gatedRows(ctx)) red += await row(server, name, check);
		await live.stop();
		live = await startServer(server, ctx, 'open', openInclude(server, ctx.root));
		red += await row(
			server,
			'OPEN gate (no Rule B): the unpublished file answers 200 → failed, persisted',
			() => openGateRow(ctx),
		);
		await live.stop();
		live = null;
		red += await row(server, 'gate down: nothing listens → never ok, with a reason', () =>
			downRow(ctx),
		);
	} finally {
		await live?.stop();
	}
	return red;
}

async function main(): Promise<number> {
	const { scratch, servers } = childArgs();
	const root = claimScratch(scratch);
	const paths = drillPaths();
	plantTree(root, paths);
	const calls: ForwardedCall[] = [];
	let port = 0;
	const ctx: DrillContext = {
		scratch,
		root,
		paths,
		calls,
		deps: forwardingHopDeps(() => port, calls),
		setPort: (next) => {
			port = next;
		},
	};
	let red = 0;
	for (const server of servers) red += await drillServer(server, ctx);
	console.log(red === 0 ? '\nALL GREEN' : `\n${red} RED row(s)`);
	return red === 0 ? 0 : 1;
}

if (import.meta.main) process.exit(await main());
