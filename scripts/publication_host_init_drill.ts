#!/usr/bin/env bun
/**
 * THE `provision init` DRILLS — the guided install (engineering/PUBLICATION_HOST_SPEC.md §9,
 * §9.11) end to end on a REAL host: real accounts, real systemd, real polkit, a real
 * PHP-FPM and web-server reload, a real `kill -9` mid-change. Both are local-only
 * (engineering/CI.md, *Local-only drills of the guided install*; the reasons are rows of
 * test/unit/tier_wiring_tripwire.test.ts LOCAL_ONLY_SCRIPTS).
 *
 *   bun run test:pubhost:init       Debian: a disposable PRIVILEGED container with systemd as
 *                                   PID 1, on the CI image's Debian trixie base (its digest is
 *                                   read from ci/Dockerfile), with apache2, nginx, php-fpm and
 *                                   polkitd. Needs a Docker daemon that may start --privileged.
 *   bun run test:pubhost:init:el    EL: `--family el --in-place`, run AS ROOT ON a disposable
 *                                   RHEL/Rocky/Alma 9 or 10 VM with SELinux enforcing. Refuses unless
 *                                   /etc/dedalo_init_drill_host exists and getenforce says
 *                                   Enforcing, so it can never run on a real install.
 *
 * WHAT IT NEVER DOES: import an init module. The guided install is driven ONLY as a child —
 * `sh <source>/publication/host_agent/deploy/install.sh …` and the provisioner CLI — so the
 * drill proves the shipped entry point, and test/unit/tool_lossless_writeback_tripwire's
 * host-agent-package class is untouched. Facts the drill needs from the agent package (the
 * EL ratchet's input list, the S9 rules of a declaration) come from a CHILD `bun -e`.
 *
 * Flags:
 *   --family debian|el     default debian
 *   --in-place             run on THIS host (EL: required; Debian: a disposable VM instead of docker)
 *   --record               EL, after a green run: write the EL drill record (engineering/)
 *   --capture <dir>        EL: keep the raw discovery outputs (the typed EL fixtures' replacements)
 *   --media-nfs <src>      EL: the NFS export the network-media leg mounts (`host:/export`)
 *   --skip <leg>           skip one leg BY NAME (repeatable); the record lists every skipped leg,
 *                          and a record with a skipped required leg is refused
 *   --keep                 leave the container (Debian) for inspection
 *   --plan                 print the legs and exit 0, touching nothing
 *
 * Exit: 0 every leg green · 1 a leg red · 2 the drill cannot run here (no docker, not root,
 * no marker, not enforcing) — RED, never a skip.
 *
 * THE PROMPT TABLE (`PROMPTS`) is the one place that knows how init's terminal asks: the
 * source-digest confirmation, `Apply these N changes? [y/N]`, a decision's typed option, the
 * hidden secrets asked twice. The secret steps run through a pty (`script -qec`), as the
 * spec requires; the pre-created-API-files variant runs without one (`--yes`).
 */

import { createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';

export const REPO_ROOT = resolve(import.meta.dir, '..');
export const AGENT_DIR = join(REPO_ROOT, 'publication/host_agent');
const INSTALL_SH_REL = 'publication/host_agent/deploy/install.sh';
/** Created BY HAND on a drill VM; the EL drill refuses any host without it. */
export const DRILL_HOST_MARKER = '/etc/dedalo_init_drill_host';
/** The EL drill record, written only by `--record` after a green run. */
export const EL_DRILL_RECORD = join(REPO_ROOT, 'engineering/el_drill_record.json');
const TAG = '[init_drill]';

/* ── arguments ─────────────────────────────────────────────────────────────────────── */

export interface DrillArgs {
	readonly family: 'debian' | 'el';
	readonly inPlace: boolean;
	readonly record: boolean;
	readonly capture: string | null;
	readonly mediaNfs: string | null;
	readonly skip: readonly string[];
	readonly keep: boolean;
	readonly plan: boolean;
}

export function parseDrillArgs(argv: readonly string[]): DrillArgs | { readonly error: string } {
	let family: 'debian' | 'el' = 'debian';
	let inPlace = false;
	let record = false;
	let capture: string | null = null;
	let mediaNfs: string | null = null;
	const skip: string[] = [];
	let keep = false;
	let plan = false;
	for (let i = 0; i < argv.length; i += 1) {
		const arg = argv[i];
		const value = (): string | null => {
			const next = argv[i + 1];
			if (next === undefined || next.startsWith('--')) return null;
			i += 1;
			return next;
		};
		if (arg === '--family') {
			const v = value();
			if (v !== 'debian' && v !== 'el') return { error: '--family is debian or el' };
			family = v;
		} else if (arg === '--in-place') inPlace = true;
		else if (arg === '--record') record = true;
		else if (arg === '--keep') keep = true;
		else if (arg === '--plan') plan = true;
		else if (arg === '--capture') {
			capture = value();
			if (capture === null || !capture.startsWith('/'))
				return { error: '--capture needs an absolute directory' };
		} else if (arg === '--media-nfs') {
			mediaNfs = value();
			if (mediaNfs === null || !/^[A-Za-z0-9.-]+:\/[A-Za-z0-9._/-]*$/.test(mediaNfs))
				return { error: '--media-nfs needs host:/export' };
		} else if (arg === '--skip') {
			const v = value();
			if (v === null) return { error: '--skip needs a leg name' };
			skip.push(v);
		} else return { error: `unknown argument '${arg}'` };
	}
	if (family === 'el' && !inPlace)
		return { error: 'the EL drill runs ON the VM: --family el --in-place' };
	if (record && family !== 'el')
		return { error: '--record writes the EL drill record: --family el only' };
	return { family, inPlace, record, capture, mediaNfs, skip, keep, plan };
}

/* ── processes ─────────────────────────────────────────────────────────────────────── */

export interface Done {
	readonly code: number;
	readonly out: string;
	readonly err: string;
}

/** One child, async (the mock HTTPS mirror and the pty runs live beside it). */
export async function spawnText(
	argv: readonly string[],
	opts: { cwd?: string; env?: Record<string, string>; stdin?: string; timeoutMs?: number } = {},
): Promise<Done> {
	const child = Bun.spawn([...argv], {
		cwd: opts.cwd ?? REPO_ROOT,
		env: opts.env ?? {
			PATH: process.env.PATH ?? '/usr/bin:/bin',
			HOME: process.env.HOME ?? '/root',
		},
		stdin: opts.stdin === undefined ? 'ignore' : new Blob([opts.stdin]),
		stdout: 'pipe',
		stderr: 'pipe',
	});
	const timer = setTimeout(() => child.kill('SIGKILL'), opts.timeoutMs ?? 600_000);
	const [out, err, code] = await Promise.all([
		new Response(child.stdout).text(),
		new Response(child.stderr).text(),
		child.exited,
	]);
	clearTimeout(timer);
	return { code, out, err };
}

/** Where the drill's commands run: inside the container (docker exec) or on this host. */
export interface Runner {
	readonly where: string;
	sh(script: string, opts?: { stdin?: string; timeoutMs?: number }): Promise<Done>;
	/** argv to start a long-lived interactive child (the pty runs) with stdin piped. */
	interactive(script: string): string[];
}

export function dockerRunner(container: string): Runner {
	return {
		where: `container ${container}`,
		sh: (script, opts = {}) =>
			spawnText(['docker', 'exec', '-i', container, 'sh', '-c', script], {
				stdin: opts.stdin,
				timeoutMs: opts.timeoutMs,
			}),
		interactive: (script) => ['docker', 'exec', '-i', container, 'sh', '-c', script],
	};
}

export function localRunner(): Runner {
	return {
		where: 'this host',
		sh: (script, opts = {}) =>
			spawnText(['sh', '-c', script], {
				stdin: opts.stdin,
				timeoutMs: opts.timeoutMs,
				env: {
					PATH: '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
					HOME: '/root',
					LC_ALL: 'C',
				},
			}),
		interactive: (script) => ['sh', '-c', script],
	};
}

/**
 * The tar the drill packs the source with: on macOS, bsdtar stores extended attributes as `._<name>`
 * AppleDouble entries, which land in the target's checkout as files of their own — the source
 * digest the drill confirms (computed over the checkout) then differs from the one install.sh
 * computes over its staged copy of the manifest, and every non-terminal run is refused. GNU tar
 * ignores the variable.
 */
const TAR_ENV: Record<string, string> = {
	PATH: process.env.PATH ?? '/usr/bin:/bin',
	HOME: process.env.HOME ?? '/tmp',
	COPYFILE_DISABLE: '1',
};

/** Single-quote one shell word (every value the drill passes is its own constant or a path it made). */
export function q(word: string): string {
	return `'${word.replace(/'/g, `'\\''`)}'`;
}

/* ── the pty and the prompt table ──────────────────────────────────────────────────── */

export interface PromptRule {
	readonly name: string;
	readonly pattern: RegExp;
	/** What to type (a newline is appended); null = the prompt is unexpected → red. */
	readonly answer: (match: RegExpMatchArray, secrets: DrillSecrets) => string | null;
}

export interface DrillSecrets {
	readonly dbPassword: string;
	readonly apiWebUserCode: string;
}

/** The drill's answers to the visible prompts that have no default. */
const DRILL_VISIBLE: Readonly<Record<string, string>> = Object.freeze({
	'v1 database user': 'drill_v1',
	'v2 database user': 'drill_v2',
	'v2 database names (comma list)': 'drill_web',
	'v1 database name': 'drill_web',
	'v1 API entity': 'drill',
});

/**
 * HOW INIT ASKS (spec §1.2 TTY). The only place the drill knows it; adjust it with init/tty.ts.
 * Order matters: the first matching rule answers.
 */
const PROMPT_RULES: PromptRule[] = [
	{
		name: 'source digest',
		pattern: /will run as root\. Continue\? \[y\/N\]\s*$/,
		answer: () => 'y',
	},
	{ name: 'apply changes', pattern: /Apply these \d+ changes\? \[y\/N\]\s*$/, answer: () => 'y' },
	{
		name: 'database password',
		pattern: /(database )?password[^\n]*:\s*$/i,
		answer: (_m, s) => s.dbPassword,
	},
	{
		name: 'API_WEB_USER_CODE',
		pattern: /API_WEB_USER_CODE[^\n]*:\s*$/,
		answer: (_m, s) => s.apiWebUserCode,
	},
	// A decision: the default is shown and must be typed (spec §1.2) — init/tty.ts prints
	// `choose a | b (default a — type it): `.
	{
		name: 'decision (typed default)',
		pattern: /^choose [^\n]*\(default ([a-z0-9_-]+) — type it\):\s*$/m,
		answer: (m) => m[1] ?? null,
	},
	// The visible values with NO default (init/run.ts SECRET_PROMPTS): the drill's own (no database is reached).
	{
		name: 'visible value (no default)',
		pattern:
			/(v[12] database user|v2 database names \(comma list\)|v1 database name|v1 API entity): $/,
		answer: (m) => DRILL_VISIBLE[m[1] as string] ?? null,
	},
	// A visible value with its default in brackets: type the default. An EMPTY default (`[]`, the v2
	// socket prompt on a host without a local MariaDB socket: TCP) is answered with Enter.
	{
		name: 'visible value (default)',
		pattern: /\[([^\]\n]{0,200})\]:\s*$/,
		answer: (m) => m[1] ?? null,
	},
];
export const PROMPTS: readonly PromptRule[] = Object.freeze(PROMPT_RULES);

/**
 * Drives `script -qec <command>` (a pty: the hidden-input steps need one) through PROMPTS.
 * Returns the exit code and the transcript; a prompt no rule answers within `idleMs` is red.
 */
export async function drivePty(
	runner: Runner,
	command: string,
	secrets: DrillSecrets,
	opts: { idleMs?: number; timeoutMs?: number } = {},
): Promise<{ code: number; transcript: string; answered: string[] }> {
	const child = Bun.spawn(runner.interactive(`script -qec ${q(command)} /dev/null`), {
		stdin: 'pipe',
		stdout: 'pipe',
		stderr: 'pipe',
	});
	const decoder = new TextDecoder();
	let transcript = '';
	let pending = '';
	const answered: string[] = [];
	let lastData = Date.now();
	const reader = (child.stdout as ReadableStream<Uint8Array>).getReader();
	const idle = opts.idleMs ?? 30_000;
	const deadline = Date.now() + (opts.timeoutMs ?? 1_200_000);
	const pump = (async () => {
		for (;;) {
			const chunk = await reader.read();
			if (chunk.done) return;
			const text = decoder.decode(chunk.value);
			transcript += text;
			pending += text;
			lastData = Date.now();
			for (const rule of PROMPTS) {
				const match = pending.match(rule.pattern);
				if (match === null) continue;
				const answer = rule.answer(match, secrets);
				if (answer === null) break;
				answered.push(rule.name);
				pending = '';
				child.stdin.write(`${answer}\n`);
				break;
			}
		}
	})();
	const watchdog = setInterval(() => {
		if (Date.now() > deadline || (Date.now() - lastData > idle && /[:?\]]\s*$/.test(pending)))
			child.kill('SIGKILL');
	}, 1_000);
	const code = await child.exited;
	clearInterval(watchdog);
	await pump.catch(() => undefined);
	// The secrets never stay in the transcript the drill prints (hidden input has no echo; a defect would).
	for (const secret of [secrets.dbPassword, secrets.apiWebUserCode])
		transcript = transcript.split(secret).join('[SECRET LEAKED]');
	return { code, transcript, answered };
}

/* ── the source, the Bun mirror ────────────────────────────────────────────────────── */

/** The source's closed layout, read from install.sh's own SOURCE_MANIFEST line (held equal to the TS one by its gate). */
export function sourceManifest(): { path: string; kind: 'file' | 'tree' }[] {
	const text = readFileSync(join(REPO_ROOT, INSTALL_SH_REL), 'utf8');
	const line = text.match(/^SOURCE_MANIFEST='([^']+)'$/m)?.[1];
	if (line === undefined) throw new Error(`${INSTALL_SH_REL}: no SOURCE_MANIFEST line`);
	return line.split(' ').map((entry) => {
		const [path = '', kind = ''] = entry.split(':');
		if (kind !== 'file' && kind !== 'tree') throw new Error(`SOURCE_MANIFEST entry '${entry}'`);
		return { path, kind };
	});
}

/** A scratch copy of the source with production node_modules (installed here: the agent's deps are pure JS). */
export async function stageSource(scratch: string): Promise<string> {
	const dir = join(scratch, 'source');
	for (const entry of sourceManifest()) {
		const from = join(REPO_ROOT, entry.path);
		const to = join(dir, entry.path);
		mkdirSync(dirname(to), { recursive: true });
		const args =
			entry.kind === 'tree'
				? [
						'rsync',
						'-a',
						'--delete',
						'--exclude',
						'.test-tmp',
						'--exclude',
						'node_modules',
						`${from}/`,
						`${to}/`,
					]
				: ['cp', '-p', from, to];
		const done = await spawnText(args);
		if (done.code !== 0) throw new Error(`staging ${entry.path}: ${done.err}`);
	}
	const install = await spawnText(
		[process.execPath, 'install', '--frozen-lockfile', '--production'],
		{
			cwd: join(dir, 'publication/host_agent'),
			env: { PATH: process.env.PATH ?? '/usr/bin:/bin', HOME: process.env.HOME ?? '/tmp' },
		},
	);
	if (install.code !== 0)
		throw new Error(`bun install --production in the staged source: ${install.err}`);
	return dir;
}

/** `.bun-sha256` → {pin, hashes by asset}. */
export function shaTable(): { pin: string; hashes: Record<string, string> } {
	const lines = readFileSync(join(REPO_ROOT, '.bun-sha256'), 'utf8').split('\n');
	const pin = lines[0]?.match(/^# bun-v(\d+\.\d+\.\d+)$/)?.[1];
	if (pin === undefined) throw new Error('.bun-sha256: no "# bun-v<pin>" first line');
	const hashes: Record<string, string> = {};
	for (const line of lines) {
		const m = line.match(/^([0-9a-f]{64}) {2}(bun-linux-[a-z0-9-]+)\.zip$/);
		if (m) hashes[m[2] as string] = m[1] as string;
	}
	return { pin, hashes };
}

/** The asset install.sh picks for a machine (the same rule as its pick_asset). */
export function assetFor(unameM: string, avx2: boolean): string {
	if (unameM === 'x86_64') return avx2 ? 'bun-linux-x64' : 'bun-linux-x64-baseline';
	if (unameM === 'aarch64' || unameM === 'arm64') return 'bun-linux-aarch64';
	throw new Error(`no Bun asset for ${unameM}`);
}

/** The real Bun archive, downloaded HERE and checked against the committed table before any use. */
export async function fetchVerifiedBun(
	asset: string,
	into: string,
): Promise<{ zip: string; sums: string }> {
	const { pin, hashes } = shaTable();
	const want = hashes[asset];
	if (want === undefined) throw new Error(`.bun-sha256 names no ${asset}.zip`);
	const response = await fetch(
		`https://github.com/oven-sh/bun/releases/download/bun-v${pin}/${asset}.zip`,
		{ redirect: 'follow' },
	);
	if (!response.ok) throw new Error(`Bun ${pin} ${asset}: HTTP ${response.status}`);
	const bytes = new Uint8Array(await response.arrayBuffer());
	const got = createHash('sha256').update(bytes).digest('hex');
	if (got !== want) throw new Error(`Bun ${asset}.zip sha256 ${got} is not .bun-sha256's ${want}`);
	const dir = join(into, `bun-v${pin}`);
	mkdirSync(dir, { recursive: true });
	writeFileSync(join(dir, `${asset}.zip`), bytes);
	// The mirror's SHASUMS256.txt carries the table's own lines (= the signed payload's): the cross-check agrees.
	const sums = Object.entries(hashes)
		.map(([name, sha]) => `${sha}  ${name}.zip`)
		.join('\n');
	writeFileSync(join(dir, 'SHASUMS256.txt'), `${sums}\n`);
	return { zip: join(dir, `${asset}.zip`), sums: join(dir, 'SHASUMS256.txt') };
}

/* ── the EL drill record (the ratchet's input) ─────────────────────────────────────── */

export interface ElHost {
	readonly os: 'el9' | 'el10';
	readonly id: string;
	readonly version: string;
	readonly kernel: string;
	readonly selinux: 'enforcing';
}

export interface ElDrillRecord {
	readonly inputs_digest: string;
	readonly sha: string;
	readonly at: string;
	readonly hosts: readonly ElHost[];
	readonly measured: {
		readonly booleans: Readonly<
			Record<string, { readonly needed_for: string; readonly denied_without: boolean }>
		>;
		readonly supported_directives: Readonly<Record<string, readonly string[]>>;
		readonly home_traverse_type: string | null;
		readonly system_default_readable: boolean | null;
		readonly v1_php_floor: string | null;
		readonly nginx_floor: string | null;
	};
	readonly legs: readonly string[];
	readonly skipped: readonly string[];
}

/**
 * THE INPUTS DIGEST — over the EL-relevant sources (`EL_DRILL_INPUTS`, agent-package
 * relative): sha256 of `<path>\0<sha256 of its bytes>\n` lines in byte order of the path.
 * The ratchet recomputes it with THIS function; a changed input makes it differ.
 */
export function elDrillInputsDigest(agentDir: string, inputs: readonly string[]): string {
	const lines = [...inputs].sort().map(
		(path) =>
			`${path}\0${createHash('sha256')
				.update(readFileSync(join(agentDir, path)))
				.digest('hex')}\n`,
	);
	return createHash('sha256').update(lines.join('')).digest('hex');
}

/** The input list, from the agent package in a CHILD (the drill imports no agent module). */
export async function elDrillInputs(): Promise<string[]> {
	const probe = `const m = await import(${JSON.stringify(join(AGENT_DIR, 'src/provision/selinux.ts'))}); console.log(JSON.stringify(m.EL_DRILL_INPUTS ?? null));`;
	const done = await spawnText([process.execPath, '-e', probe], { cwd: AGENT_DIR });
	const list = done.code === 0 ? (JSON.parse(done.out.trim()) as unknown) : null;
	if (
		!Array.isArray(list) ||
		list.length === 0 ||
		!list.every((p) => typeof p === 'string' && !p.startsWith('/') && !p.includes('..'))
	) {
		throw new Error(
			'publication/host_agent/src/provision/selinux.ts exports no EL_DRILL_INPUTS (relative paths): the record has no inputs',
		);
	}
	return list as string[];
}

/**
 * One VM's run into the record. Same inputs digest: the host is added or replaced and the
 * measurements of this run win for this host's OS. Another digest: a fresh record — an EL
 * input changed, so every host must be measured again.
 */
export function mergeRecord(existing: ElDrillRecord | null, run: ElDrillRecord): ElDrillRecord {
	if (existing === null || existing.inputs_digest !== run.inputs_digest) return run;
	const host = run.hosts[0];
	const hosts = [...existing.hosts.filter((h) => h.os !== host?.os), ...run.hosts].sort((a, b) =>
		a.os.localeCompare(b.os),
	);
	return {
		...run,
		hosts,
		measured: {
			...run.measured,
			booleans: { ...existing.measured.booleans, ...run.measured.booleans },
			supported_directives: {
				...existing.measured.supported_directives,
				...run.measured.supported_directives,
			},
		},
		legs: [...new Set([...existing.legs, ...run.legs])].sort(),
		skipped: [
			...new Set([...existing.skipped.filter((s) => !run.legs.includes(s)), ...run.skipped]),
		].sort(),
	};
}

/* ── legs ──────────────────────────────────────────────────────────────────────────── */

export const INSTANCE = 'drill_museum';
export const DOMAIN = 'museum.test';
export const SECOND_INSTANCE = 'drill_second';
export const SECOND_DOMAIN = 'second.test';
export const NGINX_INSTANCE = 'drill_nginx';
export const NGINX_DOMAIN = 'nginx.test';
/** The v2-only site (no v1 block in its draft): the recommended shape for a new site, no PHP anywhere. */
export const V2_ONLY_INSTANCE = 'drill_v2only';
export const V2_ONLY_DOMAIN = 'v2only.test';

interface Ctx {
	readonly args: DrillArgs;
	readonly runner: Runner;
	readonly scratch: string;
	/** The source as the target sees it. */
	readonly source: string;
	readonly mirror: string;
	readonly secrets: DrillSecrets;
	readonly facts: Record<string, unknown>;
	readonly startedAt: string;
}

interface Leg {
	readonly name: string;
	readonly family: 'both' | 'debian' | 'el';
	/** A record that skipped it is refused (spec §9: the measurement the ratchet rests on). */
	readonly required: boolean;
	readonly what: string;
	run(ctx: Ctx): Promise<void>;
}

class LegFailure extends Error {}

function check(cond: boolean, message: string): void {
	if (!cond) throw new LegFailure(message);
}

async function must(ctx: Ctx, script: string, what: string, timeoutMs?: number): Promise<string> {
	const done = await ctx.runner.sh(script, timeoutMs === undefined ? {} : { timeoutMs });
	check(done.code === 0, `${what}: exit ${done.code}\n${done.out}${done.err}`);
	return done.out;
}

const installSh = (ctx: Ctx, instance: string, flags: string): string =>
	`sh ${q(join(ctx.source, INSTALL_SH_REL))} ${instance} ${flags}`;
const rerunSh = (instance: string, home: string, flags: string): string =>
	`sh ${q(`${home}/host_agent/deploy/install.sh`)} ${instance} ${flags}`;

/**
 * The drill's draft. The legs judge the v1+v2 shape (the v1 pool, the v1 config typed on the pty),
 * so `apis: 'v1_and_v2'` is said; `{ apis: undefined }` drops it — a draft without the v1 block is
 * a v2-only site.
 */
function draftFor(instance: string, domain: string, extra: Record<string, unknown> = {}): string {
	return `${JSON.stringify({ instance, layout: 'home', apis: 'v1_and_v2', site: { domain }, media: { mode: 'none' }, ...extra }, null, 2)}\n`;
}

async function putRootFile(ctx: Ctx, path: string, body: string, mode = '0600'): Promise<void> {
	const done = await ctx.runner.sh(
		`install -d -m 0755 ${q(dirname(path))} && cat > ${q(path)} && chown root:root ${q(path)} && chmod ${mode} ${q(path)}`,
		{ stdin: body },
	);
	check(done.code === 0, `write ${path}: ${done.err}`);
}

/** The source digest install.sh will show (its own tree_digest, run in its library mode). */
async function sourceDigest(ctx: Ctx): Promise<string> {
	const out = await must(
		ctx,
		`set -- --lib; . ${q(join(ctx.source, INSTALL_SH_REL))}; resolve_sha256; tree_digest ${q(ctx.source)}`,
		'tree_digest',
	);
	const digest = out.trim().split('\n').at(-1) ?? '';
	check(/^[0-9a-f]{64}$/.test(digest), `tree_digest printed '${digest}'`);
	return digest;
}

/** Every record of one instance's journal, in order. */
async function journalRecords(
	ctx: Ctx,
	instance: string,
): Promise<{ run: string; item: string; phase: string }[]> {
	const text = await must(
		ctx,
		`cat /var/lib/dedalo_publication_host_init/${instance}/journal.jsonl`,
		'read the journal',
	);
	return text
		.split('\n')
		.filter(Boolean)
		.map((line) => JSON.parse(line) as { run: string; item: string; phase: string });
}

async function healthOverSocket(ctx: Ctx, instance: string): Promise<void> {
	const out = await must(
		ctx,
		`curl -fsS --unix-socket /run/dedalo_publication_host/${instance}/agent.sock http://localhost/publication/host_agent/health`,
		`${instance}: GET /health over its socket`,
	);
	check(
		/"status":"ok"/.test(out) && /"instance_fingerprint":"[0-9a-f]{64}"/.test(out),
		`${instance}: /health answered ${out}`,
	);
}

/** The vhost sha8 compare names an item by (spec §4.3: sha256(realpath\0port\0serverName)). */
export function vhostSha8(realpath: string, port: number, serverName: string): string {
	return createHash('sha256')
		.update(`${realpath}\0${port}\0${serverName}`)
		.digest('hex')
		.slice(0, 8);
}

/** Every item id a report prints (`--decide` takes them). */
export function itemIds(report: string): string[] {
	return [
		...new Set(
			[
				...report.matchAll(
					/\b((?:host|selinux|account|home|bun|code|declaration|provision|api_config|web|verify|pair|init)\.[a-z0-9_.-]+[a-z0-9])\b/g,
				),
			].map((m) => m[1] as string),
		),
	];
}

/**
 * The site's log directory, as the operator's existing site has it and init's `web.logs` expects it
 * (owner decision 1(c): OUTSIDE the home, the distribution's log directory per site — Ubuntu 26.04's
 * apache2.service runs with ProtectHome=read-only, so a log under /home fails the unit's start).
 */
export function siteLogDir(
	family: 'debian' | 'el',
	server: 'apache' | 'nginx',
	domain: string,
): string {
	if (server === 'nginx') return `/var/log/nginx/${domain}`;
	return family === 'el' ? `/var/log/httpd/${domain}` : `/var/log/apache2/${domain}`;
}

const APACHE_VHOST = (domain: string, home: string, logs: string, eol = '\n') =>
	[
		'<VirtualHost *:443>',
		`    ServerName ${domain}`,
		`    DocumentRoot ${home}/httpdocs`,
		`    ErrorLog ${logs}/error.log`,
		`    CustomLog ${logs}/access.log combined`,
		'    SSLEngine on',
		`    SSLCertificateFile /etc/ssl/drill/${domain}.pem`,
		`    SSLCertificateKeyFile /etc/ssl/drill/${domain}.key`,
		'</VirtualHost>',
		'',
	].join(eol);

async function makeSite(ctx: Ctx, domain: string, server: 'apache' | 'nginx'): Promise<void> {
	const home = `/home/${domain}`;
	const user = domain.split('.')[0] ?? 'site';
	const el = ctx.args.family === 'el';
	const logs = siteLogDir(ctx.args.family, server, domain);
	const confDir =
		server === 'apache'
			? el
				? '/etc/httpd/conf.d'
				: '/etc/apache2/sites-available'
			: el
				? '/etc/nginx/conf.d'
				: '/etc/nginx/sites-available';
	await must(
		ctx,
		[
			`id ${user} >/dev/null 2>&1 || useradd --create-home --home-dir ${home} --shell /bin/sh ${user}`,
			// The widening home.root must report: 0700 is what useradd gives on Debian 13 and EL (and
			// adduser on Debian 12, whose useradd gives 0755; Ubuntu's gives 0750) — measured.
			`chmod 0700 ${home}`,
			`install -d -o ${user} -m 0755 ${home}/httpdocs`,
			`install -d -m 0755 ${logs}`,
			`echo ok > ${home}/httpdocs/index.html`,
			'install -d -m 0755 /etc/ssl/drill',
			`openssl req -x509 -newkey rsa:2048 -nodes -days 2 -subj /CN=${domain} -keyout /etc/ssl/drill/${domain}.key -out /etc/ssl/drill/${domain}.pem 2>/dev/null`,
		].join(' && '),
		`site ${domain}`,
	);
	const file = server === 'apache' ? `${confDir}/${domain}-ssl.conf` : `${confDir}/${domain}.conf`;
	const body =
		server === 'apache'
			? APACHE_VHOST(domain, home, logs)
			: [
					'server {',
					'    listen 443 ssl;',
					`    server_name ${domain};`,
					`    root ${home}/httpdocs;`,
					`    access_log ${logs}/access.log;`,
					`    error_log ${logs}/error.log;`,
					`    ssl_certificate /etc/ssl/drill/${domain}.pem;`,
					`    ssl_certificate_key /etc/ssl/drill/${domain}.key;`,
					'}',
					'',
				].join('\n');
	await putRootFile(ctx, file, body, '0644');
	if (!el) {
		await must(
			ctx,
			server === 'apache'
				? `a2enmod -q ssl && a2ensite -q ${domain}-ssl && apache2ctl -t && systemctl reload apache2`
				: `ln -sf ${file} /etc/nginx/sites-enabled/${domain}.conf && nginx -t && systemctl reload nginx`,
			`enable ${domain}`,
		);
	}
}

async function webCheck(
	ctx: Ctx,
	domain: string,
	path: string,
): Promise<{ status: number; body: string }> {
	const done = await ctx.runner.sh(
		`curl -sk --resolve ${domain}:443:127.0.0.1 -o /tmp/dd_body -w '%{http_code}' https://${domain}${path}; echo; cat /tmp/dd_body`,
	);
	const [status = '0', ...rest] = done.out.split('\n');
	return { status: Number(status), body: rest.join('\n') };
}

/** A fresh guided install of one instance through the pty, every prompt answered by PROMPTS. */
async function guidedInstall(
	ctx: Ctx,
	instance: string,
	domain: string,
	extraFlags = '',
	draft: string = draftFor(instance, domain),
): Promise<string> {
	await putRootFile(ctx, `/root/${instance}.draft.json`, draft);
	const digest = await sourceDigest(ctx);
	const run = await drivePty(
		ctx.runner,
		installSh(
			ctx,
			instance,
			`--source ${q(ctx.source)} --draft /root/${instance}.draft.json --mirror ${ctx.mirror} --source-digest ${digest} -- --no-pair ${extraFlags}`,
		),
		ctx.secrets,
	);
	check(
		!run.transcript.includes('[SECRET LEAKED]'),
		`${instance}: a typed secret appeared on the terminal`,
	);
	check(
		run.code === 0,
		`${instance}: guided install exited ${run.code}; answered ${run.answered.join(', ')}\n${run.transcript.slice(-4000)}`,
	);
	check(
		run.answered.includes('apply changes'),
		`${instance}: init never asked to apply its changes`,
	);
	return run.transcript;
}

export const LEGS: readonly Leg[] = Object.freeze([
	{
		name: 'fresh-converge',
		family: 'both',
		required: true,
		what: 'install.sh with --source through the local https mirror: accounts, the root-owned home, Bun verified, the code, the declaration, apply (v1 pool, web include), the vhost reference, the API files typed on a pty, a real FPM and web reload, B4',
		async run(ctx) {
			await makeSite(ctx, DOMAIN, 'apache');
			const transcript = await guidedInstall(ctx, INSTANCE, DOMAIN);
			check(/widen|0700/.test(transcript), 'home.root did not state the widening of a 0700 home');
			const home = `/home/${DOMAIN}`;
			check(
				(await must(ctx, `stat -c '%U:%G %a' ${home}`, 'stat home')).trim() === 'root:root 755',
				'the home is not root:root 0755',
			);
			// The site logs: outside the home, root's, rotated by our stamped file (logrotate parses it).
			const logs = siteLogDir(ctx.args.family, 'apache', DOMAIN);
			check(
				(await must(ctx, `stat -c '%U:%G %a' ${logs}`, 'stat the site log dir')).trim() ===
					'root:root 755',
				`${logs} is not root:root 0755`,
			);
			await must(
				ctx,
				`head -n1 /etc/logrotate.d/dedalo_${INSTANCE}_web | grep -q '^# dedalo-provision: ${INSTANCE} logrotate ' && logrotate -d /etc/logrotate.d/dedalo_${INSTANCE}_web 2>&1`,
				'the stamped logrotate file parses (logrotate -d)',
			);
			for (const account of [`${INSTANCE}_agent`, `${INSTANCE}_v1`, `${INSTANCE}_v2`])
				await must(ctx, `getent passwd ${account}`, `account ${account}`);
			await must(ctx, 'getent group dedalo_pubhost', 'the dedalo_pubhost group');
			await must(
				ctx,
				`systemctl is-active dedalo-publication-host-${INSTANCE}`,
				'the agent is active',
			);
			await healthOverSocket(ctx, INSTANCE);
			const dump = await must(
				ctx,
				ctx.args.family === 'el'
					? 'httpd -t -D DUMP_INCLUDES 2>&1'
					: 'apache2ctl -t -D DUMP_INCLUDES 2>&1',
				'DUMP_INCLUDES',
			);
			check(
				dump.includes(`/etc/dedalo_publication_host/${INSTANCE}/web.apache.conf`),
				'the web server does not load the web include',
			);
			await must(
				ctx,
				`ls /etc/php*/*/fpm/pool.d/dedalo_${INSTANCE}_v1.conf /etc/php-fpm.d/dedalo_${INSTANCE}_v1.conf /etc/opt/remi/php*/php-fpm.d/dedalo_${INSTANCE}_v1.conf 2>/dev/null | head -n1 | grep -q .`,
				'the v1 pool file',
			);
			const meta = await must(
				ctx,
				`stat -c '%U:%G %a' ${home}/dedalo/publication_api/v2/shared/v2.env ${home}/dedalo/publication_api/v1/shared/server_config_api.php`,
				'API files',
			);
			check(meta.split('\n')[0] === `root:${INSTANCE}_v2 640`, `v2.env metadata ${meta}`);
			check(
				meta.split('\n')[1]?.startsWith(`${INSTANCE}_v1:`) === true &&
					meta.split('\n')[1]?.endsWith(' 400') === true,
				`v1 config metadata ${meta}`,
			);
			const journal = await must(
				ctx,
				`cat /var/lib/dedalo_publication_host_init/${INSTANCE}/journal.jsonl`,
				'journal',
			);
			check(
				!journal.includes(ctx.secrets.dbPassword) && !journal.includes(ctx.secrets.apiWebUserCode),
				'a secret reached the journal',
			);
		},
	},
	{
		name: 'rerun-all-right',
		family: 'both',
		required: true,
		what: 're-run mode (no --source): every item already right, zero mutations',
		async run(ctx) {
			// A run with nothing to change journals nothing: judge only the records THIS run appended.
			const before = (await journalRecords(ctx, INSTANCE)).length;
			const done = await ctx.runner.sh(
				`${rerunSh(INSTANCE, `/home/${DOMAIN}`, '-- --yes --no-pair')} </dev/null`,
			);
			check(done.code === 0, `the all-right re-run exited ${done.code}\n${done.out}${done.err}`);
			const changed = (await journalRecords(ctx, INSTANCE))
				.slice(before)
				.filter((p) => p.phase === 'done');
			check(changed.length === 0, `the re-run changed ${changed.map((p) => p.item).join(', ')}`);
		},
	},
	{
		name: 'configtest-rollback',
		family: 'both',
		required: true,
		what: 'a vhost edit whose configtest fails is restored byte for byte, the web server stays up, FAILED (4); repaired, the next run converges',
		async run(ctx) {
			const el = ctx.args.family === 'el';
			const vhost = el
				? `/etc/httpd/conf.d/${DOMAIN}-ssl.conf`
				: `/etc/apache2/sites-available/${DOMAIN}-ssl.conf`;
			// Detach: the next run must edit the vhost again.
			await putRootFile(
				ctx,
				vhost,
				APACHE_VHOST(DOMAIN, `/home/${DOMAIN}`, siteLogDir(ctx.args.family, 'apache', DOMAIN)),
				'0644',
			);
			const before = (await must(ctx, `sha256sum ${vhost}`, 'sha')).split(' ')[0];
			// Broken only once the vhost references the instance's include: the media-rules file that
			// include loads (absent until the first push). A file the web server loads anyway would break
			// init's own discovery (`-S`) as well, and no web.vhost item would exist to act on.
			const broken = `/home/${DOMAIN}/dedalo/rules/dedalo_media_publication.apache.conf`;
			await putRootFile(ctx, broken, 'ThisIsNotADirective on\n', '0644');
			let vhostId = '';
			try {
				const report = (
					await ctx.runner.sh(
						`${rerunSh(INSTANCE, `/home/${DOMAIN}`, '-- --dry-run --no-pair')} </dev/null`,
					)
				).out;
				const ids = itemIds(report).filter((id) => id.startsWith('web.vhost.'));
				check(ids.length === 1, `expected one web.vhost item, saw ${ids.join(', ')}`);
				vhostId = ids[0] as string;
				const done = await ctx.runner.sh(
					`${rerunSh(INSTANCE, `/home/${DOMAIN}`, `-- --yes --no-pair --decide ${vhostId}=act`)} </dev/null`,
				);
				check(done.code === 4, `a failing configtest must end FAILED (4), got ${done.code}`);
				check(
					(await must(ctx, `sha256sum ${vhost}`, 'sha')).split(' ')[0] === before,
					'the vhost was not restored',
				);
				await must(
					ctx,
					`systemctl is-active ${el ? 'httpd' : 'apache2'}`,
					'the web server stayed up',
				);
			} finally {
				// Never leave the web server broken for the legs after this one.
				await ctx.runner.sh(`rm -f ${broken}`);
			}
			const again = await ctx.runner.sh(
				`${rerunSh(INSTANCE, `/home/${DOMAIN}`, `-- --yes --no-pair --decide ${vhostId}=act`)} </dev/null`,
			);
			check(again.code === 0, `the repaired run exited ${again.code}`);
		},
	},
	{
		name: 'kill-resume',
		family: 'both',
		required: true,
		what: 'kill -9 of init right after a begin: without --resume REFUSED naming the item; with it, converged',
		async run(ctx) {
			const el = ctx.args.family === 'el';
			const vhost = el
				? `/etc/httpd/conf.d/${DOMAIN}-ssl.conf`
				: `/etc/apache2/sites-available/${DOMAIN}-ssl.conf`;
			await putRootFile(
				ctx,
				vhost,
				APACHE_VHOST(DOMAIN, `/home/${DOMAIN}`, siteLogDir(ctx.args.family, 'apache', DOMAIN)),
				'0644',
			);
			const report = (
				await ctx.runner.sh(
					`${rerunSh(INSTANCE, `/home/${DOMAIN}`, '-- --dry-run --no-pair')} </dev/null`,
				)
			).out;
			const id = itemIds(report).find((i) => i.startsWith('web.vhost.'));
			check(id !== undefined, 'no web.vhost item to interrupt');
			const journal = `/var/lib/dedalo_publication_host_init/${INSTANCE}/journal.jsonl`;
			// Start init, wait for the item's begin record, kill -9 the whole process group.
			await must(
				ctx,
				`( setsid ${rerunSh(INSTANCE, `/home/${DOMAIN}`, `-- --yes --no-pair --decide ${id}=act`)} </dev/null >/tmp/dd_kill.log 2>&1 & echo $! > /tmp/dd_kill.pid ); ` +
					`for i in $(seq 1 600); do tail -n1 ${journal} | grep -q '"item":"${id}","phase":"begin"' && break; sleep 0.05; done; ` +
					'kill -9 -- -$(cat /tmp/dd_kill.pid) 2>/dev/null || kill -9 $(cat /tmp/dd_kill.pid)',
				'interrupt init mid-item',
			);
			const refused = await ctx.runner.sh(
				`${rerunSh(INSTANCE, `/home/${DOMAIN}`, '-- --yes --no-pair')} </dev/null`,
			);
			check(
				refused.code === 3,
				`an unfinished run without --resume must be REFUSED (3), got ${refused.code}`,
			);
			check(
				`${refused.out}${refused.err}`.includes(id as string),
				'the refusal does not name the unfinished item',
			);
			const resumed = await ctx.runner.sh(
				`${rerunSh(INSTANCE, `/home/${DOMAIN}`, `-- --yes --no-pair --resume --decide ${id}=act`)} </dev/null`,
			);
			check(resumed.code === 0, `--resume exited ${resumed.code}\n${resumed.out}${resumed.err}`);
			const apache = await must(
				ctx,
				el ? 'apachectl -t 2>&1' : 'apache2ctl -t 2>&1',
				'configtest after resume',
			);
			check(apache.includes('Syntax OK'), 'the web server configuration is broken after resume');
		},
	},
	{
		name: 'precreated-api-files',
		family: 'both',
		required: true,
		what: 'a second instance whose two API files exist with the right metadata: no terminal, --yes converges (the right-metadata path), and siblings share the host group',
		async run(ctx) {
			await makeSite(ctx, SECOND_DOMAIN, 'apache');
			// The files' metadata only exists after apply: run once to create the tree (no TTY → REFUSED on the secrets).
			await putRootFile(
				ctx,
				`/root/${SECOND_INSTANCE}.draft.json`,
				draftFor(SECOND_INSTANCE, SECOND_DOMAIN),
			);
			const digest = await sourceDigest(ctx);
			const vhostId = `web.vhost.${vhostSha8(ctx.args.family === 'el' ? `/etc/httpd/conf.d/${SECOND_DOMAIN}-ssl.conf` : `/etc/apache2/sites-available/${SECOND_DOMAIN}-ssl.conf`, 443, SECOND_DOMAIN)}`;
			const first = await ctx.runner.sh(
				`${installSh(ctx, SECOND_INSTANCE, `--source ${q(ctx.source)} --draft /root/${SECOND_INSTANCE}.draft.json --mirror ${ctx.mirror} --source-digest ${digest} -- --yes --no-pair --decide ${vhostId}=act`)} </dev/null`,
			);
			check(
				first.code === 3,
				`without a terminal the secret items must stay open (REFUSED 3), got ${first.code}`,
			);
			const home = `/home/${SECOND_DOMAIN}/dedalo/publication_api`;
			check(
				(await ctx.runner.sh(`test -d ${home}/v2/shared`)).code === 0,
				`the no-terminal run applied nothing (no ${home}/v2/shared):\n${first.out.slice(-3000)}${first.err.slice(-2000)}`,
			);
			await must(
				ctx,
				[
					`install -o root -g ${SECOND_INSTANCE}_v2 -m 0640 ${q(join(ctx.source, 'publication/server_api/v2/.env.example'))} ${home}/v2/shared/v2.env`,
					`install -o ${SECOND_INSTANCE}_v1 -m 0400 ${q(join(ctx.source, 'publication/server_api/v1/config_api/sample.server_config_api.php'))} ${home}/v1/shared/server_config_api.php`,
				].join(' && '),
				'pre-create the API files',
			);
			// Source mode again: rerun.env (re-run mode's input) is written only by a run that ENDED
			// right (init.keep_ref is always last), and the first run ended REFUSED on the secrets.
			const second = await ctx.runner.sh(
				`${installSh(ctx, SECOND_INSTANCE, `--source ${q(ctx.source)} --draft /root/${SECOND_INSTANCE}.draft.json --mirror ${ctx.mirror} --source-digest ${digest} -- --yes --no-pair --decide ${vhostId}=act`)} </dev/null`,
			);
			check(
				second.code === 0,
				`the right-metadata run exited ${second.code}\n${second.out}${second.err}`,
			);
			await healthOverSocket(ctx, SECOND_INSTANCE);
			await healthOverSocket(ctx, INSTANCE);
		},
	},
	{
		name: 'v2-only-site',
		family: 'both',
		required: true,
		what: 'a draft without the v1 block: no PHP discovered, asked or provisioned (no v1 account, pool, tree, handler, PHP_BIN); the agent serves v2 only (status served_apis) and refuses a v1 release api_not_served',
		async run(ctx) {
			await makeSite(ctx, V2_ONLY_DOMAIN, 'apache');
			const transcript = await guidedInstall(
				ctx,
				V2_ONLY_INSTANCE,
				V2_ONLY_DOMAIN,
				'',
				draftFor(V2_ONLY_INSTANCE, V2_ONLY_DOMAIN, { apis: undefined }),
			);
			for (const item of [
				'host.fpm_install',
				'host.fpm_cli',
				'declaration.v1_user',
				'account.v1_user',
				'api_config.v1_config',
				'api_config.v1_db_transport',
			])
				check(!transcript.includes(`[${item}]`), `a v2-only run printed the PHP item ${item}`);
			check(
				transcript.includes('v2 only: no PHP anywhere'),
				'declaration.apis did not say v2 only',
			);
			const home = `/home/${V2_ONLY_DOMAIN}`;
			const conf = `/etc/dedalo_publication_host/${V2_ONLY_INSTANCE}`;
			check(
				(await ctx.runner.sh(`getent passwd ${V2_ONLY_INSTANCE}_v1`)).code !== 0,
				'a v1 account was created for a v2-only site',
			);
			await must(ctx, `getent passwd ${V2_ONLY_INSTANCE}_v2`, 'the v2 account');
			check(
				(await ctx.runner.sh(`test -e ${home}/dedalo/publication_api/v1`)).code !== 0,
				'a v1 tree exists on a v2-only site',
			);
			check(
				(
					await ctx.runner.sh(
						`ls /etc/php*/*/fpm/pool.d/dedalo_${V2_ONLY_INSTANCE}_v1.conf /etc/php-fpm.d/dedalo_${V2_ONLY_INSTANCE}_v1.conf /etc/opt/remi/php*/php-fpm.d/dedalo_${V2_ONLY_INSTANCE}_v1.conf /etc/logrotate.d/dedalo_${V2_ONLY_INSTANCE}_v1 /var/lib/dedalo_publication_host/${V2_ONLY_INSTANCE} 2>/dev/null | grep -q .`,
					)
				).code !== 0,
				'a v1 pool, v1 log rotation or v1 pool directory exists on a v2-only site',
			);
			const declared = await must(
				ctx,
				`cat /etc/dedalo_publication_host/${V2_ONLY_INSTANCE}.json`,
				'the declaration',
			);
			check(
				!/"v1"|php_bin|"fpm"/.test(declared) && declared.includes('"os_family"'),
				`the declaration is not v2-only:\n${declared}`,
			);
			check(
				!(await must(ctx, `cat ${conf}/agent.env`, 'agent.env')).includes('PHP_BIN'),
				'agent.env carries PHP_BIN',
			);
			const include = await must(ctx, `cat ${conf}/web.apache.conf`, 'the web include');
			check(
				!/^Alias |SetHandler|fcgi/m.test(include) && include.includes('ProxyPass'),
				`the web include is not v2-only:\n${include}`,
			);
			await must(
				ctx,
				`stat -c '%U:%G %a' ${home}/dedalo/publication_api/v2/shared/v2.env`,
				'v2.env',
			);
			await healthOverSocket(ctx, V2_ONLY_INSTANCE);
			const curl = (path: string, extra = '') =>
				`curl -s -o /tmp/dd_v2only -w '%{http_code}' --unix-socket /run/dedalo_publication_host/${V2_ONLY_INSTANCE}/agent.sock ` +
				`-H "Authorization: Bearer $(cat ${conf}/credentials/SERVICE_TOKEN)" ${extra} http://localhost/publication/host_agent${path}; echo; cat /tmp/dd_v2only`;
			const status = (await must(ctx, curl('/v1/status'), 'GET /v1/status')).split('\n');
			check(
				status[0] === '200' && /"served_apis":\["v2"\]/.test(status.slice(1).join('\n')),
				`status: ${status.join(' ')}`,
			);
			const refused = (
				await must(
					ctx,
					curl(
						'/v1/releases/v1',
						`-X POST -H 'Content-Type: application/gzip' -H 'X-Dedalo-Actor: init_drill' -H 'X-Release-Id: 7.0.0_aaaaaaa' -H 'X-Bundle-Sha256: ${'a'.repeat(64)}' --data-binary x`,
					),
					'POST /v1/releases/v1',
				)
			).split('\n');
			check(
				refused[0] === '422' && refused.slice(1).join('\n').includes('"reason":"api_not_served"'),
				`a v1 install answered ${refused.join(' ')}`,
			);
		},
	},
	{
		name: 'nginx-host-map',
		family: 'both',
		required: true,
		what: 'nginx with conf.d in http{}: the provisioned map include, the map pushed as rules.map through a mock engine, rendered by the root renderer (one contribution: byte-identical to buildNginxMap()), loaded by nginx',
		async run(ctx) {
			const el = ctx.args.family === 'el';
			await must(
				ctx,
				`systemctl stop ${el ? 'httpd' : 'apache2'} && systemctl disable ${el ? 'httpd' : 'apache2'} && systemctl enable --now nginx`,
				'switch to nginx',
			);
			await makeSite(ctx, NGINX_DOMAIN, 'nginx');
			await guidedInstall(ctx, NGINX_INSTANCE, NGINX_DOMAIN);
			await must(
				ctx,
				"grep -q '^# dedalo-provision: _host nginx_map_include ' /etc/nginx/conf.d/dedalo_media_map.conf",
				'the _host-stamped map include',
			);
			const map = await engineMap();
			const pushed = await pushMap(ctx, NGINX_INSTANCE, map);
			check(pushed.status === 200, `rules.map answered ${pushed.status}: ${pushed.body}`);
			const answer = JSON.parse(pushed.body) as {
				hash?: string;
				host_hash?: string;
				contributions?: number;
				reloaded?: boolean;
			};
			check(
				answer.hash === map.hash && answer.host_hash === map.hash && answer.contributions === 1,
				`rules.map answer ${pushed.body}`,
			);
			const live = await must(
				ctx,
				'cat /var/lib/dedalo_publication_host/_host/nginx_map/dedalo_media_map.nginx.conf',
				'the live map',
			);
			check(
				live.trimEnd() === map.text.trimEnd(),
				'one contribution: the live map is not byte-identical to buildNginxMap()',
			);
			const dumped = await must(ctx, 'nginx -T 2>/dev/null', 'nginx -T');
			check(dumped.includes('$dedalo_auth_key'), 'nginx does not load the map');
			const result = JSON.parse(
				await must(
					ctx,
					'cat /var/lib/dedalo_publication_host/_host/nginx_map/result.json',
					'result.json',
				),
			) as { outcome?: string };
			check(result.outcome !== undefined, 'the root renderer wrote no result.json');
		},
	},
	{
		name: 'hand-map-migration',
		family: 'both',
		required: true,
		what: "a guide-style hand-placed map with loaded media includes → init's web.nginx_manual_map act converges in ONE configtest + reload, the hand map removed, the live map seeded",
		async run(ctx) {
			const map = await engineMap();
			// Undo the provisioned map to model a guide-installed host: the hand map in conf.d.
			await must(
				ctx,
				'rm -f /etc/nginx/conf.d/dedalo_media_map.conf && rm -rf /var/lib/dedalo_publication_host/_host/nginx_map/dedalo_media_map.nginx.conf',
				'remove the provisioned map',
			);
			await putRootFile(
				ctx,
				'/etc/nginx/conf.d/dedalo_hand_map.conf',
				`${map.text.trimEnd()}\n`,
				'0644',
			);
			await must(ctx, 'nginx -t 2>&1 && systemctl reload nginx', 'the hand map loads');
			const report = (
				await ctx.runner.sh(
					`${rerunSh(NGINX_INSTANCE, `/home/${NGINX_DOMAIN}`, '-- --dry-run --no-pair')} </dev/null`,
				)
			).out;
			const id = itemIds(report).find((i) => i.startsWith('web.nginx_manual_map.'));
			check(id !== undefined, `no web.nginx_manual_map item for the hand map\n${report}`);
			const done = await ctx.runner.sh(
				`${rerunSh(NGINX_INSTANCE, `/home/${NGINX_DOMAIN}`, `-- --yes --no-pair --decide ${id}=act`)} </dev/null`,
			);
			check(done.code === 0, `the migration exited ${done.code}\n${done.out}${done.err}`);
			check(
				(await ctx.runner.sh('test -e /etc/nginx/conf.d/dedalo_hand_map.conf')).code !== 0,
				'the hand map is still there',
			);
			await must(
				ctx,
				'test -f /var/lib/dedalo_publication_host/_host/nginx_map/contrib/_seed.json',
				'the seed contribution',
			);
			await must(ctx, 'nginx -t 2>&1', 'one valid configuration after the migration');
			const pushed = await pushMap(ctx, NGINX_INSTANCE, map);
			check(pushed.status === 200, `the first real push after the seed answered ${pushed.status}`);
			check(
				(
					await ctx.runner.sh(
						'test -e /var/lib/dedalo_publication_host/_host/nginx_map/contrib/_seed.json',
					)
				).code !== 0,
				'the seed was not swept by the first real push',
			);
		},
	},
	{
		name: 'mixed-version-map',
		family: 'both',
		required: true,
		what: "an older instance's apply never downgrades the root renderer; a newer-grammar contribution under an older renderer is refused loudly (map_contribution_newer), the live map left as it is",
		async run(ctx) {
			const dir = '/var/lib/dedalo_publication_host/_host';
			const version = JSON.parse(
				await must(ctx, `cat ${dir}/map_renderer/VERSION`, 'renderer VERSION'),
			) as { grammar: number; digest: string };
			// Pretend a newer instance installed a newer renderer: apply of THIS (older) one must keep it.
			await putRootFile(
				ctx,
				`${dir}/map_renderer/VERSION`,
				`${JSON.stringify({ ...version, grammar: version.grammar + 1 })}\n`,
				'0644',
			);
			await must(
				ctx,
				`cd /home/${NGINX_DOMAIN}/host_agent && /home/${NGINX_DOMAIN}/.bun/bin/bun --no-env-file --no-install run src/provision/cli.ts apply ${NGINX_INSTANCE}`,
				'apply of the older instance',
			);
			const kept = JSON.parse(
				await must(ctx, `cat ${dir}/map_renderer/VERSION`, 'renderer VERSION'),
			) as { grammar: number };
			check(kept.grammar === version.grammar + 1, 'an older apply downgraded the root renderer');
			await putRootFile(ctx, `${dir}/map_renderer/VERSION`, `${JSON.stringify(version)}\n`, '0644');
			// A contribution of a grammar this renderer does not know, as an agent identities.json NAMES:
			// only nginx `conf_d` instances are there, so the nginx instance's own file is replaced (and
			// put back after). The second instance is apache: its file would be refused `undeclared`
			// before its grammar is ever read.
			const own = `${dir}/nginx_map/contrib/${NGINX_INSTANCE}.json`;
			const before = await must(
				ctx,
				`sha256sum ${dir}/nginx_map/dedalo_media_map.nginx.conf`,
				'sha',
			);
			const contrib = JSON.stringify({
				v: 1,
				grammar: version.grammar + 1,
				instance: NGINX_INSTANCE,
				hash: 'f'.repeat(64),
				envelope: 'x',
				pinsId: 'future',
			});
			await must(
				ctx,
				`cp -p ${own} /root/dd_contrib.bak && printf '%s' ${q(contrib)} > ${own} && chown ${NGINX_INSTANCE}_agent:dedalo_pubhost ${own} && chmod 0640 ${own}`,
				'plant a newer contribution',
			);
			await ctx.runner.sh('systemctl start dedalo-pubhost-map.service');
			const result = await must(ctx, `cat ${dir}/nginx_map/result.json`, 'result.json');
			check(
				result.includes('map_contribution_newer'),
				`the newer contribution was not refused loudly: ${result}`,
			);
			check(
				(await must(ctx, `sha256sum ${dir}/nginx_map/dedalo_media_map.nginx.conf`, 'sha')) ===
					before,
				'the live map changed under a refused render',
			);
			await must(ctx, `cp -p /root/dd_contrib.bak ${own}`, 'put the real contribution back');
		},
	},
	// ── EL only ──
	{
		name: 'selinux-labels',
		family: 'el',
		required: true,
		what: 'every S9 rule registered (semanage fcontext -l -C), the v2 port typed http_port_t, restorecon -n -v empty on every target',
		async run(ctx) {
			const local = await must(ctx, 'semanage fcontext -l -C', 'semanage fcontext -l -C');
			const rules = await s9Rules(INSTANCE);
			for (const rule of rules)
				check(
					local.includes(rule.spec) && local.includes(rule.type),
					`the S9 rule ${rule.spec} ${rule.type} is not registered`,
				);
			const pending = await must(
				ctx,
				`restorecon -n -v -R ${rules
					.filter((r) => r.recursive)
					.map((r) => q(r.path))
					.join(' ')} 2>&1; restorecon -n -v ${rules
					.filter((r) => !r.recursive)
					.map((r) => q(r.path))
					.join(' ')} 2>&1`,
				'restorecon -n',
			);
			check(pending.trim() === '', `restorecon would still relabel:\n${pending}`);
			ctx.facts.home_traverse_type =
				(await must(ctx, `stat -c '%C' /home/${DOMAIN}`, 'home label')).trim().split(':')[2] ??
				null;
		},
	},
	{
		name: 'v1-handler-probe',
		family: 'el',
		required: true,
		what: "a probe .php and a probe .phtml under the v1 release answer v1.user and fpm-fcgi through httpd: the include's <If> handler beats conf.d/php.conf's (this VM's EL major) — and under mod_php when it is loaded",
		async run(ctx) {
			const root = `/home/${DOMAIN}/dedalo/publication_api/v1`;
			const probe = "<?php echo get_current_user() . '|' . php_sapi_name();";
			await must(
				ctx,
				`systemctl disable --now nginx; systemctl enable --now httpd`,
				'back to httpd',
			);
			await must(
				ctx,
				`install -d ${root}/releases/0.0.0_drill00 && printf '%s' ${q(probe)} > ${root}/releases/0.0.0_drill00/probe.php && cp ${root}/releases/0.0.0_drill00/probe.php ${root}/releases/0.0.0_drill00/probe.phtml && ln -sfn releases/0.0.0_drill00 ${root}/current && restorecon -R ${root}`,
				'a probe release',
			);
			for (const file of ['probe.php', 'probe.phtml']) {
				const got = await webCheck(ctx, DOMAIN, `/dedalo/publication/server_api/v1/${file}`);
				check(
					got.status === 200 && got.body.trim() === `${INSTANCE}_v1|fpm-fcgi`,
					`${file} answered ${got.status} '${got.body.trim()}'`,
				);
			}
			ctx.facts.php_conf_if = (
				await ctx.runner.sh("grep -c '<If' /etc/httpd/conf.d/php.conf")
			).out.trim();
			const modules = await must(ctx, 'httpd -M 2>&1', 'httpd -M');
			ctx.facts.mod_php = /php\d?_module/.test(modules);
			const phpVersion = (
				await must(ctx, `php -r 'echo PHP_MAJOR_VERSION.".".PHP_MINOR_VERSION;'`, 'php version')
			).trim();
			const lint = await ctx.runner.sh(
				`find ${q(join(ctx.source, 'publication/server_api/v1'))} -name '*.php' -exec php -l {} + >/dev/null 2>&1`,
			);
			if (lint.code === 0) ctx.facts.v1_php_floor = phpVersion;
		},
	},
	{
		name: 'home-login-and-logs',
		family: 'el',
		required: true,
		what: 'the site user still logs in over sshd into its relabelled, root-owned home; httpd writes the site log outside it (/var/log/httpd/<domain>)',
		async run(ctx) {
			const user = DOMAIN.split('.')[0] ?? 'museum';
			await must(
				ctx,
				`install -d -m 0700 /root/.dd_ssh && rm -f /root/.dd_ssh/k* && ssh-keygen -q -t ed25519 -N '' -f /root/.dd_ssh/k && install -d -o ${user} -m 0700 /home/${DOMAIN}/.ssh && install -o ${user} -m 0600 /root/.dd_ssh/k.pub /home/${DOMAIN}/.ssh/authorized_keys && restorecon -R /home/${DOMAIN}/.ssh`,
				'a key for the site user',
			);
			await must(
				ctx,
				`ssh -i /root/.dd_ssh/k -o BatchMode=yes -o StrictHostKeyChecking=no ${user}@127.0.0.1 true`,
				'sshd login of the site user',
			);
			const pending = await must(
				ctx,
				`restorecon -n -v /home/${DOMAIN} 2>&1`,
				'restorecon -n on the home',
			);
			check(pending.trim() === '', `the home would be relabelled: ${pending}`);
			const before = Number(
				(
					await must(
						ctx,
						`stat -c %s ${siteLogDir('el', 'apache', DOMAIN)}/access.log 2>/dev/null || echo 0`,
						'log size',
					)
				).trim(),
			);
			await webCheck(ctx, DOMAIN, '/');
			const after = Number(
				(
					await must(ctx, `stat -c %s ${siteLogDir('el', 'apache', DOMAIN)}/access.log`, 'log size')
				).trim(),
			);
			check(after > before, `httpd did not write ${siteLogDir('el', 'apache', DOMAIN)}/access.log`);
		},
	},
	{
		name: 'network-media',
		family: 'el',
		required: true,
		what: 'an NFS media mount with the printed context= option is served by httpd (no httpd_use_nfs)',
		async run(ctx) {
			check(
				ctx.args.mediaNfs !== null,
				'give --media-nfs host:/export (or --skip network-media; the record then names it skipped)',
			);
			await must(
				ctx,
				`install -d /mnt/dd_media && mount -t nfs4 -o ro,context="system_u:object_r:httpd_sys_content_t:s0" ${q(ctx.args.mediaNfs as string)} /mnt/dd_media`,
				'mount the media with context=',
			);
			const bool = (await must(ctx, 'getsebool httpd_use_nfs', 'getsebool')).trim();
			check(bool.endsWith('off'), 'httpd_use_nfs is on: the leg would not prove the mount option');
			const label = (await must(ctx, "stat -c '%C' /mnt/dd_media", 'label')).trim();
			check(label.includes('httpd_sys_content_t'), `the mount is labelled ${label}`);
		},
	},
	{
		name: 'fapolicyd',
		family: 'el',
		required: true,
		what: 'with fapolicyd active, the printed trust lines make the agent start, and v2 /health answers',
		async run(ctx) {
			const active = (await ctx.runner.sh('systemctl is-active fapolicyd')).out.trim() === 'active';
			ctx.facts.fapolicyd = active;
			check(
				active,
				'fapolicyd is not active on this VM (run this leg on the fapolicyd VM, or --skip fapolicyd)',
			);
			await must(
				ctx,
				`systemctl restart dedalo-publication-host-${INSTANCE}`,
				'restart the agent under fapolicyd',
			);
			await healthOverSocket(ctx, INSTANCE);
		},
	},
	{
		name: 'systemd-analyze',
		family: 'el',
		required: true,
		what: 'systemd-analyze verify prints NO warning naming a rendered unit; which omitted directives this systemd actually supports is measured',
		async run(ctx) {
			const units = (await must(ctx, `ls /etc/systemd/system/dedalo-*.service`, 'rendered units'))
				.trim()
				.split('\n');
			const verify = await ctx.runner.sh(`systemd-analyze verify ${units.map(q).join(' ')} 2>&1`);
			const named = verify.out
				.split('\n')
				.filter((line) => units.some((u) => line.includes(u.split('/').at(-1) as string)));
			check(
				named.length === 0,
				`systemd-analyze verify warns about a rendered unit:\n${named.join('\n')}`,
			);
			const version = (
				await must(ctx, 'systemctl --version | head -n1', 'systemctl --version')
			).trim();
			const omitted =
				(
					await must(
						ctx,
						`grep -h '^# omitted' ${units.map(q).join(' ')} || true`,
						'omitted comments',
					)
				).match(/[A-Za-z]+=[A-Za-z@-]*/g) ?? [];
			const supported: string[] = [];
			for (const form of [...new Set(omitted)]) {
				const scratch = `/run/systemd/system/dd-floor-probe.service`;
				await putRootFile(
					ctx,
					scratch,
					`[Service]\nExecStart=/bin/true\n${form.endsWith('=') ? `${form}yes` : form}\n`,
					'0644',
				);
				const out = await ctx.runner.sh(`systemd-analyze verify ${scratch} 2>&1; rm -f ${scratch}`);
				if (!/Unknown (key|lvalue)|Failed to parse/i.test(out.out)) supported.push(form);
			}
			ctx.facts.supported_directives = { [version]: supported };
		},
	},
	{
		name: 'booleans-measured',
		family: 'el',
		required: true,
		what: "the booleans the default install rests on, measured by turning each off: httpd_can_network_relay (the v2 proxy: off → an AVC and a 5xx) and httpd_enable_homedirs (with the home's -f d rule: off → the site still answers); restored after",
		async run(ctx) {
			const measured: Record<string, { needed_for: string; denied_without: boolean }> = {};
			for (const [name, needed, probe] of [
				['httpd_can_network_relay', 'the v2 proxy', '/dedalo/publication/server_api/v2/'],
				['httpd_enable_homedirs', 'home traversal (the H rule replaces it)', '/'],
			] as const) {
				const before = (await must(ctx, `getsebool ${name}`, 'getsebool')).trim().endsWith('on');
				await must(ctx, `setsebool ${name} off`, `${name} off`);
				const got = await webCheck(ctx, DOMAIN, probe);
				const avc = await ctx.runner.sh(
					`ausearch -m AVC -ts recent 2>/dev/null | grep -c 'denied' || true`,
				);
				measured[name] = {
					needed_for: needed,
					denied_without: (got.status === 0 || got.status >= 400) && Number(avc.out.trim()) > 0,
				};
				await must(ctx, `setsebool ${name} ${before ? 'on' : 'off'}`, `${name} restored`);
			}
			ctx.facts.booleans = measured;
		},
	},
	{
		name: 'no-avc',
		family: 'el',
		required: true,
		what: 'ausearch -m AVC,USER_AVC since the drill started finds nothing outside the booleans leg',
		async run(ctx) {
			const out = await ctx.runner.sh(`ausearch -m AVC,USER_AVC -ts ${ctx.startedAt} 2>&1`);
			const lines = out.out
				.split('\n')
				.filter((line) => /avc:/.test(line) && !/name_connect/.test(line));
			check(lines.length === 0, `AVC denials during the drill:\n${lines.slice(0, 20).join('\n')}`);
		},
	},
]);

/** The S9 rules of an instance's final declaration, from the agent package in a CHILD. */
async function s9Rules(
	instance: string,
): Promise<{ spec: string; type: string; path: string; recursive: boolean }[]> {
	const probe = [
		`const { parseDeclaration } = await import(${JSON.stringify(join(AGENT_DIR, 'src/provision/schema.ts'))});`,
		`const { derive } = await import(${JSON.stringify(join(AGENT_DIR, 'src/provision/layout.ts'))});`,
		`const { selinuxRules } = await import(${JSON.stringify(join(AGENT_DIR, 'src/provision/selinux.ts'))});`,
		`const text = await Bun.file('/etc/dedalo_publication_host/${instance}.json').text();`,
		`const decl = parseDeclaration(JSON.parse(text), '${instance}');`,
		'console.log(JSON.stringify(selinuxRules(derive(decl))));',
	].join('\n');
	const done = await spawnText([process.execPath, '-e', probe], { cwd: AGENT_DIR });
	if (done.code !== 0) throw new LegFailure(`computing the S9 rules: ${done.err}`);
	return JSON.parse(done.out) as { spec: string; type: string; path: string; recursive: boolean }[];
}

/** buildNginxMap() and its hash, from the ENGINE in a child (the drill imports no engine module). */
async function engineMap(): Promise<{ text: string; hash: string }> {
	const probe = `const m = await import(${JSON.stringify(join(REPO_ROOT, 'src/core/media/protection.ts'))}); console.log(JSON.stringify({ text: m.buildNginxMap(), hash: m.nginxMapConfigHash() }));`;
	const done = await spawnText([process.execPath, '-e', probe], {
		env: { ...(process.env as Record<string, string>) },
	});
	if (done.code !== 0) throw new LegFailure(`the engine's buildNginxMap(): ${done.err}`);
	return JSON.parse(done.out.trim().split('\n').at(-1) ?? '{}') as { text: string; hash: string };
}

/** The mock engine's push: POST /v1/rules/map over the agent's socket with its bearer (read as root). */
async function pushMap(
	ctx: Ctx,
	instance: string,
	map: { text: string; hash: string },
): Promise<{ status: number; body: string }> {
	const body = JSON.stringify({ text: map.text, hash: map.hash, actor: 'init_drill' });
	const done = await ctx.runner.sh(
		`curl -s -o /tmp/dd_map -w '%{http_code}' --unix-socket /run/dedalo_publication_host/${instance}/agent.sock ` +
			`-H "Authorization: Bearer $(cat /etc/dedalo_publication_host/${instance}/credentials/SERVICE_TOKEN)" ` +
			`-H 'Content-Type: application/json' -H 'X-Dedalo-Actor: init_drill' --data-binary @- http://localhost/publication/host_agent/v1/rules/map; echo; cat /tmp/dd_map`,
		{ stdin: body },
	);
	const [status = '0', ...rest] = done.out.split('\n');
	return { status: Number(status), body: rest.join('\n') };
}

/* ── the two worlds ────────────────────────────────────────────────────────────────── */

/** The CI image's base (ci/Dockerfile FROM), so the drill's Debian is the CI image's Debian. */
export function ciBaseImage(): string {
	const from = readFileSync(join(REPO_ROOT, 'ci/Dockerfile'), 'utf8').match(
		/^FROM (debian:trixie-slim@sha256:[0-9a-f]{64})$/m,
	)?.[1];
	if (from === undefined)
		throw new Error('ci/Dockerfile: no digest-pinned debian:trixie-slim FROM line');
	return from;
}

export function drillDockerfile(): string {
	return [
		`FROM ${ciBaseImage()}`,
		'ENV DEBIAN_FRONTEND=noninteractive LANG=C.UTF-8',
		'RUN set -eux; apt-get update; apt-get install -y --no-install-recommends \\',
		'      systemd systemd-sysv dbus polkitd sudo apache2 nginx php-fpm php-cli \\',
		'      curl unzip e2fsprogs logrotate ca-certificates openssl procps util-linux passwd coreutils findutils; \\',
		'    systemctl disable nginx; systemctl mask getty@tty1.service; \\',
		'    rm -rf /var/lib/apt/lists/*',
		'STOPSIGNAL SIGRTMIN+3',
		'CMD ["/sbin/init"]',
		'',
	].join('\n');
}

async function debianWorld(
	args: DrillArgs,
	scratch: string,
): Promise<{ runner: Runner; source: string; mirror: string; stop: () => Promise<void> }> {
	const docker = await spawnText(['docker', 'version', '--format', '{{.Server.Version}}']);
	if (docker.code !== 0)
		throw new CannotRun(
			`no Docker daemon (${docker.err.trim()}): the Debian drill needs one that may start --privileged containers`,
		);
	const dockerfileDir = join(scratch, 'image');
	mkdirSync(dockerfileDir, { recursive: true });
	writeFileSync(join(dockerfileDir, 'Dockerfile'), drillDockerfile());
	const tag = `dedalo-init-drill:${createHash('sha256').update(drillDockerfile()).digest('hex').slice(0, 12)}`;
	const built = await spawnText(['docker', 'build', '-q', '-t', tag, dockerfileDir], {
		timeoutMs: 1_800_000,
	});
	if (built.code !== 0) throw new Error(`docker build: ${built.err}`);
	const name = `dd-init-drill-${randomBytes(4).toString('hex')}`;
	const started = await spawnText([
		'docker',
		'run',
		'-d',
		'--privileged',
		'--cgroupns=host',
		'-v',
		'/sys/fs/cgroup:/sys/fs/cgroup:rw',
		'--tmpfs',
		'/run',
		'--tmpfs',
		'/run/lock',
		'--name',
		name,
		'--hostname',
		'pubhost',
		tag,
	]);
	if (started.code !== 0)
		throw new CannotRun(`docker run --privileged refused: ${started.err.trim()}`);
	const runner = dockerRunner(name);
	const stop = async () => {
		if (!args.keep) await spawnText(['docker', 'rm', '-f', name]);
		else console.log(`${TAG} kept container ${name}`);
	};
	await runner.sh(
		'for i in $(seq 1 120); do s=$(systemctl is-system-running 2>/dev/null); [ "$s" = running ] || [ "$s" = degraded ] && exit 0; sleep 0.5; done; exit 1',
	);
	// On a real host systemd (PID 1) makes / a SHARED mount at boot; Docker hands the container a
	// private one. systemd 257 (Debian 13) builds a unit's LoadCredential= directory in a helper's
	// own mount namespace and MOVES it into /run/credentials/<unit>: under a private / the move never
	// reaches the service, so the agent finds no SERVICE_TOKEN (measured: an empty
	// /run/credentials/<unit>; systemd 259, Ubuntu 26.04, mounts it differently and is unaffected).
	// The host the drill models has / shared.
	const shared = await runner.sh('mount --make-rshared /');
	if (shared.code !== 0) throw new Error(`mount --make-rshared /: ${shared.err}`);
	// The source, as a non-root work user owns it (the warning's case: init must still run it as root only after consent).
	const local = await stageSource(scratch);
	await runner.sh(
		'useradd --create-home --shell /bin/sh dedalo || true; install -d -o dedalo -m 0755 /opt/dedalo',
	);
	const tar = await spawnText(['tar', '-C', local, '-cf', join(scratch, 'source.tar'), '.'], {
		env: TAR_ENV,
	});
	if (tar.code !== 0) throw new Error(`tar the source: ${tar.err}`);
	const copied = await spawnText([
		'sh',
		'-c',
		`docker exec -i ${name} sh -c 'install -d -o dedalo /opt/dedalo/master_dedalo && tar -C /opt/dedalo/master_dedalo -xf - && chown -R dedalo /opt/dedalo/master_dedalo' < ${q(join(scratch, 'source.tar'))}`,
	]);
	if (copied.code !== 0) throw new Error(`copy the source in: ${copied.err}`);
	await startWorkUnit(runner);
	const mirror = await startMirror(runner, scratch);
	return { runner, source: '/opt/dedalo/master_dedalo', mirror, stop };
}

/**
 * THE WORK ENGINE OF THE ONE-MACHINE HOST. A unix listener pairs with a Dédalo work engine on the
 * same machine, and init takes `engine_group` from its unit (the socket is 0660 with that group);
 * it never invents one. A host without a `dedalo-ts` unit and a draft without `engine_group` is
 * therefore BLOCKED by design (`declaration.fields` + `declaration.work_unit`) — the drill models
 * the one-machine host, so it runs a stand-in engine unit as the work user `dedalo` that owns the
 * source checkout: init discovers it exactly as it discovers a real one (systemctl list-units/show).
 * The legs pass `--no-pair`, so nothing is ever sent to it.
 */
export const WORK_UNIT_FILE = [
	'[Unit]',
	'Description=Dédalo work engine (init drill stand-in: discovery only, never paired)',
	'',
	'[Service]',
	'User=dedalo',
	'Group=dedalo',
	'WorkingDirectory=/opt/dedalo/master_dedalo',
	'ExecStart=/bin/sleep infinity',
	'',
	'[Install]',
	'WantedBy=multi-user.target',
	'',
].join('\n');

async function startWorkUnit(runner: Runner): Promise<void> {
	const done = await runner.sh(
		'cat > /etc/systemd/system/dedalo-ts.service && systemctl daemon-reload && systemctl enable --now dedalo-ts.service',
		{ stdin: WORK_UNIT_FILE },
	);
	if (done.code !== 0) throw new Error(`the stand-in work engine unit: ${done.err}${done.out}`);
}

/** A local https mirror (openssl s_server -WWW) serving the verified Bun archive; its CA trusted by the target. */
async function startMirror(runner: Runner, scratch: string): Promise<string> {
	const arch = (await runner.sh('uname -m')).out.trim();
	const avx2 = (await runner.sh('grep -qw avx2 /proc/cpuinfo')).code === 0;
	const files = join(scratch, 'mirror');
	await fetchVerifiedBun(assetFor(arch, avx2), files);
	const tar = await spawnText(['tar', '-C', files, '-cf', join(scratch, 'mirror.tar'), '.'], {
		env: TAR_ENV,
	});
	if (tar.code !== 0) throw new Error(`tar the mirror: ${tar.err}`);
	const where = runner.where.startsWith('container ')
		? runner.where.slice('container '.length)
		: null;
	const load =
		where === null
			? await spawnText([
					'sh',
					'-c',
					`install -d /var/tmp/dd_mirror && tar -C /var/tmp/dd_mirror -xf ${q(join(scratch, 'mirror.tar'))}`,
				])
			: await spawnText([
					'sh',
					'-c',
					`docker exec -i ${where} sh -c 'install -d /var/tmp/dd_mirror && tar -C /var/tmp/dd_mirror -xf -' < ${q(join(scratch, 'mirror.tar'))}`,
				]);
	if (load.code !== 0) throw new Error(`load the mirror: ${load.err}`);
	const trust =
		(await runner.sh('test -d /etc/pki/ca-trust/source/anchors')).code === 0
			? 'cp /var/tmp/dd_mirror_ca.pem /etc/pki/ca-trust/source/anchors/dd_mirror.pem && update-ca-trust'
			: 'cp /var/tmp/dd_mirror_ca.pem /usr/local/share/ca-certificates/dd_mirror.crt && update-ca-certificates >/dev/null';
	const started = await runner.sh(
		[
			'cd /var/tmp',
			"grep -q 'mirror.drill' /etc/hosts || echo '127.0.0.1 mirror.drill' >> /etc/hosts",
			'openssl req -x509 -newkey rsa:2048 -nodes -days 2 -subj /CN=dd-mirror-ca -keyout dd_mirror_ca.key -out dd_mirror_ca.pem 2>/dev/null',
			'openssl req -newkey rsa:2048 -nodes -subj /CN=mirror.drill -keyout dd_mirror.key -out dd_mirror.csr 2>/dev/null',
			"printf 'subjectAltName=DNS:mirror.drill\\n' > dd_mirror.ext",
			'openssl x509 -req -in dd_mirror.csr -CA dd_mirror_ca.pem -CAkey dd_mirror_ca.key -CAcreateserial -days 2 -extfile dd_mirror.ext -out dd_mirror.pem 2>/dev/null',
			trust,
			'cd /var/tmp/dd_mirror && (setsid openssl s_server -quiet -accept 8443 -cert ../dd_mirror.pem -key ../dd_mirror.key -WWW </dev/null >/dev/null 2>&1 &)',
			'for i in $(seq 1 50); do curl -fsS -o /dev/null https://mirror.drill:8443/bun-v$(ls /var/tmp/dd_mirror | sed -n "s/^bun-v//p" | head -n1)/SHASUMS256.txt && exit 0; sleep 0.2; done; exit 1',
		].join(' && '),
	);
	if (started.code !== 0)
		throw new Error(`the https mirror did not answer: ${started.err}${started.out}`);
	return 'https://mirror.drill:8443';
}

class CannotRun extends Error {}

async function elWorld(
	args: DrillArgs,
	scratch: string,
): Promise<{ runner: Runner; source: string; mirror: string; stop: () => Promise<void> }> {
	if (process.platform !== 'linux') throw new CannotRun('the EL drill runs ON the EL VM');
	if (process.getuid?.() !== 0) throw new CannotRun('run the EL drill as root on the drill VM');
	if (!existsSync(DRILL_HOST_MARKER))
		throw new CannotRun(
			`${DRILL_HOST_MARKER} does not exist: this is not a drill VM (create it by hand on a disposable VM only)`,
		);
	const runner = localRunner();
	const mode = (await runner.sh('getenforce')).out.trim();
	if (mode !== 'Enforcing')
		throw new CannotRun(`getenforce says '${mode}': the EL drill needs SELinux enforcing`);
	const release = readFileSync('/etc/os-release', 'utf8');
	if (
		!/^ID="?(rhel|rocky|almalinux)"?$/m.test(release) ||
		!/^VERSION_ID="?(9|10)(\.\d+)?"?$/m.test(release)
	) {
		throw new CannotRun('the EL drill needs RHEL, Rocky or Alma 9 or 10');
	}
	const local = await stageSource(scratch);
	await runner.sh(
		'useradd --create-home --shell /bin/sh dedalo 2>/dev/null; install -d -o dedalo -m 0755 /opt/dedalo',
	);
	const copied = await runner.sh(
		`rm -rf /opt/dedalo/master_dedalo && cp -a ${q(local)} /opt/dedalo/master_dedalo && chown -R dedalo /opt/dedalo/master_dedalo`,
	);
	if (copied.code !== 0) throw new Error(`stage the source: ${copied.err}`);
	if (args.capture !== null) mkdirSync(args.capture, { recursive: true });
	await startWorkUnit(runner);
	const mirror = await startMirror(runner, scratch);
	return { runner, source: '/opt/dedalo/master_dedalo', mirror, stop: async () => undefined };
}

/* ── main ──────────────────────────────────────────────────────────────────────────── */

export function legsFor(args: DrillArgs): Leg[] {
	return LEGS.filter((leg) => leg.family === 'both' || leg.family === args.family);
}

async function writeRecord(ctx: Ctx, passed: string[], skipped: string[]): Promise<void> {
	const required = legsFor(ctx.args)
		.filter((l) => l.required)
		.map((l) => l.name);
	const missing = required.filter((name) => !passed.includes(name) && !skipped.includes(name));
	if (missing.length > 0)
		throw new Error(`--record after a run that did not pass ${missing.join(', ')}`);
	const release = (await ctx.runner.sh('. /etc/os-release; echo "$ID $VERSION_ID"')).out
		.trim()
		.split(' ');
	const os = release[1]?.split('.')[0] === '10' ? 'el10' : 'el9';
	const inputs = await elDrillInputs();
	const sha = (await spawnText(['git', 'rev-parse', 'HEAD'])).out.trim();
	const kernel = (await ctx.runner.sh('uname -r')).out.trim();
	const run: ElDrillRecord = {
		inputs_digest: elDrillInputsDigest(AGENT_DIR, inputs),
		sha,
		at: new Date().toISOString(),
		hosts: [{ os, id: release[0] ?? '', version: release[1] ?? '', kernel, selinux: 'enforcing' }],
		measured: {
			booleans: (ctx.facts.booleans as ElDrillRecord['measured']['booleans']) ?? {},
			supported_directives:
				(ctx.facts.supported_directives as ElDrillRecord['measured']['supported_directives']) ?? {},
			home_traverse_type: (ctx.facts.home_traverse_type as string | null) ?? null,
			system_default_readable: null,
			v1_php_floor: (ctx.facts.v1_php_floor as string | null) ?? null,
			nginx_floor: null,
		},
		legs: passed.sort(),
		skipped: skipped.sort(),
	};
	if (skipped.some((name) => required.includes(name))) {
		throw new Error(
			`--record refuses a run that skipped a required leg (${skipped.join(', ')}): the ratchet would rest on an unmeasured property`,
		);
	}
	const existing = existsSync(EL_DRILL_RECORD)
		? (JSON.parse(readFileSync(EL_DRILL_RECORD, 'utf8')) as ElDrillRecord)
		: null;
	writeFileSync(EL_DRILL_RECORD, `${JSON.stringify(mergeRecord(existing, run), null, 2)}\n`);
	console.log(
		`${TAG} recorded ${relative(REPO_ROOT, EL_DRILL_RECORD)} (${os}, inputs ${run.inputs_digest.slice(0, 12)})`,
	);
}

export async function main(argv: readonly string[]): Promise<number> {
	const args = parseDrillArgs(argv);
	if ('error' in args) {
		console.error(`${TAG} ${args.error}`);
		return 2;
	}
	const legs = legsFor(args);
	if (args.plan) {
		for (const leg of legs)
			console.log(`${leg.name}${leg.required ? '' : ' (optional)'} [${leg.family}] — ${leg.what}`);
		return 0;
	}
	const scratch = mkdtempSync(
		join(process.platform === 'darwin' ? '/tmp' : tmpdir(), 'dd-init-drill-'),
	);
	let world: Awaited<ReturnType<typeof debianWorld>> | null = null;
	const passed: string[] = [];
	const failed: string[] = [];
	const skipped = legs.filter((l) => args.skip.includes(l.name)).map((l) => l.name);
	try {
		try {
			world =
				args.family === 'el' ? await elWorld(args, scratch) : await debianWorld(args, scratch);
		} catch (error) {
			if (error instanceof CannotRun) {
				console.error(`${TAG} RED — cannot run here: ${error.message}`);
				return 2;
			}
			throw error;
		}
		const ctx: Ctx = {
			args,
			runner: world.runner,
			scratch,
			source: world.source,
			mirror: world.mirror,
			secrets: {
				dbPassword: `Db-${randomBytes(9).toString('base64url')}`,
				apiWebUserCode: `Code-${randomBytes(9).toString('base64url')}`,
			},
			facts: {},
			startedAt: new Date().toLocaleTimeString('en-GB', { hour12: false }),
		};
		for (const leg of legs) {
			if (skipped.includes(leg.name)) {
				console.log(`${TAG} SKIP ${leg.name} (--skip)`);
				continue;
			}
			const t0 = Date.now();
			try {
				await leg.run(ctx);
				passed.push(leg.name);
				console.log(`${TAG} ok   ${leg.name} (${Math.round((Date.now() - t0) / 1000)} s)`);
			} catch (error) {
				failed.push(leg.name);
				console.log(`${TAG} RED  ${leg.name}: ${(error as Error).message}`);
			}
		}
		if (failed.length === 0 && args.record) await writeRecord(ctx, passed, skipped);
	} finally {
		await world?.stop();
		rmSync(scratch, { recursive: true, force: true });
	}
	console.log(
		`${TAG} ${failed.length === 0 ? 'OK' : `RED (${failed.join(', ')})`} on ${args.family}: ${passed.length} green, ${failed.length} red, ${skipped.length} skipped`,
	);
	return failed.length === 0 ? 0 : 1;
}

if (import.meta.main) process.exit(await main(process.argv.slice(2)));
