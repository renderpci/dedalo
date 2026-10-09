#!/usr/bin/env bun
/**
 * THE PUBLICATION-HOST KIT — run on the WORK host, carried to the publication host, installed by
 * `sh install.sh <instance> --kit <file> --kit-sha256 <sha256>` (engineering/PUBLICATION_HOST_SPEC.md
 * §9.12; docs/install/publication_host.md, the guided path):
 *
 *   bun run hostagent:pack -- --draft <draft.json> [--out <file>]
 *
 * ONE archive, deterministic (the same checkout and draft always give the same bytes, so the same
 * sha256): gzip around ustar written by src/core/publication_host/bundle_writer.ts (the release
 * bundle's writer: mtime 0, uid/gid 0, normalized modes, tree order). It holds exactly:
 *
 *   MANIFEST     '# dedalo publication-host kit 1', then `<sha256>  <path>` for every other file
 *   draft.json   the operator's draft, byte for byte, after the agent's OWN parseDraft accepted it
 *   install.sh   publication/host_agent/deploy/install.sh (what the operator runs first)
 *   source/      the SOURCE_MANIFEST layout install.sh stages: .bun-version, .bun-sha256,
 *                publication/host_agent/** (the git-TRACKED files, minus the test material
 *                KIT_AGENT_EXCLUDES names, plus PRODUCTION node_modules), the v2 .env.example,
 *                and the v1 sample ONLY when the draft serves v1
 *
 * WHAT IT REFUSES (exit 3): a draft the agent's parseDraft refuses (run in a CHILD inside the
 * scratch copy, so the kit's own code and its own zod judge it); a draft whose instance is not a
 * file name; a tracked file missing from the working tree; a node_modules symlink, a special
 * file, or a development dependency; a path outside the kit grammar; anything secret-shaped (a
 * credential file name, a PEM private-key block) — a kit never carries a secret: the database
 * passwords are typed on the publication host (D6), the service token is minted there.
 *
 * WHERE node_modules COMES FROM: a scratch copy of the tracked agent files, then
 * `bun install --frozen-lockfile --production` there — never the developer's tree (which holds
 * dev dependencies, a test scratch and whatever else was installed by hand). That install is the
 * only network access, and it happens HERE, on the work host: the agent package fetches nothing
 * on the publication host but Bun itself (install.sh, verified against .bun-sha256).
 *
 * The kit's constants (format line, names, path grammar, the source layout) are READ from
 * install.sh — the verifier's own copy (held equal to init/constants.ts by
 * publication/host_agent/tests/init_install_kit.test.ts) — so packer and verifier cannot drift
 * and this script imports no agent module. Gate: test/unit/publication_host_kit_pack.test.ts.
 *
 * Exit: 0 written · 2 usage · 3 refused · 4 failed.
 */

import {
	chmodSync,
	existsSync,
	lstatSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	renameSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import {
	AGENT_REL,
	buildKit,
	type DraftVerdict,
	draftJudgeProgram,
	draftVerdictFrom,
	excludedFromKit,
	INSTALL_SH_REL,
	KIT_AGENT_EXCLUDES,
	KIT_DEPS_INSTALL_ARGS,
	type KitConstants,
	type KitFile,
	kitConstants,
	kitEntries,
	kitFileName,
	kitManifest,
	kitProblems,
	PackRefused,
} from '../src/core/publication_host/kit.ts';

// The kit's FORMAT is src/core/publication_host/kit.ts (the panel's kit_build.ts shares it);
// re-exported for the gate.
export {
	buildKit,
	type DraftVerdict,
	excludedFromKit,
	KIT_AGENT_EXCLUDES,
	KIT_DEPS_INSTALL_ARGS,
	type KitConstants,
	type KitFile,
	kitConstants,
	kitEntries,
	kitManifest,
	kitProblems,
	PackRefused,
};

export const EXIT = Object.freeze({ ok: 0, usage: 2, refused: 3, failed: 4 } as const);
export const REPO_ROOT = resolve(import.meta.dir, '..');
export { AGENT_REL };

const TAG = '[hostagent:pack]';

/** The only ambient keys the install child sees: PATH, the cache (offline-capable), the proxies. */
const INSTALL_ENV_PASSTHROUGH: readonly string[] = Object.freeze([
	'PATH',
	'HOME',
	'TMPDIR',
	'BUN_INSTALL_CACHE_DIR',
	'HTTPS_PROXY',
	'HTTP_PROXY',
	'NO_PROXY',
	'https_proxy',
	'http_proxy',
	'no_proxy',
]);

const byPath = (a: string, b: string): number => Buffer.compare(Buffer.from(a), Buffer.from(b));

/* ── collecting them from this checkout (I/O) ──────────────────────────────────────── */

export interface Spawned {
	readonly code: number;
	readonly out: string;
	readonly err: string;
}

function run(argv: readonly string[], cwd: string, env?: Record<string, string>): Spawned {
	const done = Bun.spawnSync([...argv], {
		cwd,
		env: env ?? {
			PATH: process.env.PATH ?? '/usr/bin:/bin',
			HOME: process.env.HOME ?? '/tmp',
			LC_ALL: 'C',
		},
		stdout: 'pipe',
		stderr: 'pipe',
	});
	return { code: done.exitCode ?? -1, out: done.stdout.toString(), err: done.stderr.toString() };
}

/**
 * The checkout's files under `paths`: what git tracks (`ls-files -s`, its mode: 100755 =
 * executable) plus what it would add (`--others --exclude-standard`: untracked, not ignored, so a
 * new module that is not committed yet is carried, and nothing .gitignore names — node_modules,
 * .test-tmp, a local .env — ever is). path → executable.
 */
export function trackedFiles(repo: string, paths: readonly string[]): Map<string, boolean> {
	const cached = run(['git', 'ls-files', '-s', '-z', '--', ...paths], repo);
	if (cached.code !== 0) throw new Error(`git ls-files: ${cached.err.trim()}`);
	const out = new Map<string, boolean>();
	for (const record of cached.out.split('\0')) {
		if (record === '') continue;
		const match = /^(\d{6}) [0-9a-f]+ \d\t(.+)$/s.exec(record);
		if (match === null) throw new Error(`git ls-files: unexpected record '${record.slice(0, 80)}'`);
		if (match[1] === '120000')
			throw new PackRefused(`'${match[2]}' is a tracked symlink: a kit holds regular files only`);
		out.set(match[2] as string, match[1] === '100755');
	}
	const others = run(
		['git', 'ls-files', '--others', '--exclude-standard', '-z', '--', ...paths],
		repo,
	);
	if (others.code !== 0) throw new Error(`git ls-files --others: ${others.err.trim()}`);
	for (const rel of others.out.split('\0')) {
		if (rel === '' || out.has(rel)) continue;
		const st = lstatSync(join(repo, rel));
		if (st.isSymbolicLink())
			throw new PackRefused(`'${rel}' is a symlink: a kit holds regular files only`);
		out.set(rel, (st.mode & 0o111) !== 0);
	}
	return out;
}

function readTracked(repo: string, rel: string): Uint8Array {
	const full = join(repo, rel);
	let st: ReturnType<typeof lstatSync>;
	try {
		st = lstatSync(full);
	} catch {
		throw new PackRefused(
			`'${rel}' is tracked but missing from the working tree: restore it (git checkout -- '${rel}') or commit its removal`,
		);
	}
	if (!st.isFile()) throw new PackRefused(`'${rel}' is not a regular file in the working tree`);
	return new Uint8Array(readFileSync(full));
}

/** Every regular file under `dir` (kit-relative to `prefix`); a symlink or special file is a refusal. */
export function walkFiles(
	dir: string,
	prefix: string,
	skip: (rel: string) => boolean = () => false,
): KitFile[] {
	const out: KitFile[] = [];
	const walk = (here: string, rel: string): void => {
		for (const name of readdirSync(here).sort(byPath)) {
			const childRel = rel === '' ? name : `${rel}/${name}`;
			if (skip(childRel)) continue;
			const full = join(here, name);
			const st = lstatSync(full);
			if (st.isSymbolicLink())
				throw new PackRefused(
					`'${prefix}/${childRel}' is a symlink: a kit holds regular files only`,
				);
			if (st.isDirectory()) walk(full, childRel);
			else if (st.isFile())
				out.push({
					path: `${prefix}/${childRel}`,
					bytes: new Uint8Array(readFileSync(full)),
					executable: (st.mode & 0o111) !== 0,
				});
			else throw new PackRefused(`'${prefix}/${childRel}' is not a regular file or directory`);
		}
	};
	walk(dir, '');
	return out;
}

/**
 * The agent's OWN parseDraft (draft_schema.ts) and draftServesV1 (draft.ts), in a child Bun inside
 * the scratch copy — the code and the zod that go into the kit judge the draft, and this script
 * imports no agent module (kit.ts draftJudgeProgram, shared with the panel).
 */
export function judgeDraft(scratchAgent: string, draftPath: string): DraftVerdict {
	const done = run(
		[process.execPath, '--no-install', '-e', draftJudgeProgram(scratchAgent, draftPath)],
		scratchAgent,
	);
	return draftVerdictFrom(done.out, done.code, done.err);
}

export interface CollectOptions {
	readonly repo: string;
	readonly draftPath: string;
	/** Where the scratch copy lives (removed by the caller). */
	readonly scratch: string;
	/**
	 * Installs the production dependencies into the scratch agent dir (default: installDeps, the
	 * real `bun install`, which needs the network or a warm cache). The hermetic gate passes a
	 * stand-in; the real one runs in the init drill's kit leg (`bun run hostagent:pack`).
	 */
	readonly installDeps?: (scratchAgent: string) => void;
}

/** `bun install` (KIT_DEPS_INSTALL_ARGS) in the scratch agent dir, with a minimal environment. */
export function installDeps(scratchAgent: string): void {
	const env: Record<string, string> = { LC_ALL: 'C' };
	for (const key of INSTALL_ENV_PASSTHROUGH) {
		const value = process.env[key];
		if (value !== undefined && value !== '') env[key] = value;
	}
	const install = run([process.execPath, ...KIT_DEPS_INSTALL_ARGS], scratchAgent, env);
	if (install.code !== 0)
		throw new Error(
			`bun install --frozen-lockfile --production in the scratch copy failed: ${install.err.trim()}`,
		);
}

export interface Collected {
	readonly files: KitFile[];
	readonly instance: string;
	readonly servesV1: boolean;
}

/** Everything the kit holds, from the tracked files of `repo` and a fresh production install. */
export function collectKit(opts: CollectOptions, constants: KitConstants): Collected {
	const { repo, scratch } = opts;
	const agent = constants.sourceManifest.find((entry) => entry.kind === 'tree');
	if (agent === undefined || agent.path !== AGENT_REL)
		throw new Error(`SOURCE_MANIFEST names no '${AGENT_REL}' tree`);
	// 1. the tracked agent files (minus test material) into the scratch copy
	const tracked = trackedFiles(repo, [AGENT_REL]);
	const scratchAgent = join(scratch, AGENT_REL);
	mkdirSync(scratchAgent, { recursive: true });
	const agentFiles: KitFile[] = [];
	for (const [rel, executable] of [...tracked].sort(([a], [b]) => byPath(a, b))) {
		const inAgent = rel.slice(AGENT_REL.length + 1);
		if (
			excludedFromKit(inAgent) ||
			inAgent.startsWith('node_modules/') ||
			inAgent.startsWith('.test-tmp/')
		)
			continue;
		const bytes = readTracked(repo, rel);
		mkdirSync(dirname(join(scratchAgent, inAgent)), { recursive: true });
		writeFileSync(join(scratchAgent, inAgent), bytes);
		agentFiles.push({ path: `${constants.sourceDir}/${rel}`, bytes, executable });
	}
	// 2. production node_modules, installed in the scratch copy (never the developer's tree)
	(opts.installDeps ?? installDeps)(scratchAgent);
	const pkg = JSON.parse(readFileSync(join(scratchAgent, 'package.json'), 'utf8')) as {
		devDependencies?: Record<string, string>;
	};
	const modules = join(scratchAgent, 'node_modules');
	for (const dev of Object.keys(pkg.devDependencies ?? {})) {
		if (existsSync(join(modules, dev)))
			throw new PackRefused(
				`node_modules holds the development dependency '${dev}': the kit carries production dependencies only`,
			);
	}
	// `.bin` holds the packages' launcher symlinks; the agent runs `bun src/index.ts` and needs none.
	const moduleFiles = existsSync(modules)
		? walkFiles(
				modules,
				`${constants.sourceDir}/${AGENT_REL}/node_modules`,
				(rel) => rel === '.bin',
			)
		: [];
	// 3. the draft, judged by the code that goes into the kit
	const verdict = judgeDraft(scratchAgent, opts.draftPath);
	// 4. the other SOURCE_MANIFEST files (the v1 sample only for a draft that serves v1)
	const rootFiles = trackedFiles(
		repo,
		constants.sourceManifest.filter((entry) => entry.kind === 'file').map((entry) => entry.path),
	);
	const others: KitFile[] = [];
	for (const entry of constants.sourceManifest) {
		if (entry.kind !== 'file') continue;
		if (constants.sourceOptional.includes(entry.path) && !verdict.servesV1) continue;
		if (!rootFiles.has(entry.path))
			throw new PackRefused(`'${entry.path}' is not a tracked file of this checkout`);
		others.push({
			path: `${constants.sourceDir}/${entry.path}`,
			bytes: readTracked(repo, entry.path),
			executable: rootFiles.get(entry.path) === true,
		});
	}
	const draftBytes = new Uint8Array(readFileSync(opts.draftPath));
	const installSh = readTracked(repo, INSTALL_SH_REL);
	return {
		files: [
			{ path: constants.draftName, bytes: draftBytes, executable: false },
			{ path: constants.installName, bytes: installSh, executable: true },
			...others,
			...agentFiles,
			...moduleFiles,
		],
		instance: verdict.instance,
		servesV1: verdict.servesV1,
	};
}

/* ── the command ───────────────────────────────────────────────────────────────────── */

export interface PackArgs {
	readonly draft: string;
	readonly out: string | null;
}

export function parsePackArgs(argv: readonly string[]): PackArgs | { readonly error: string } {
	let draft: string | null = null;
	let out: string | null = null;
	for (let i = 0; i < argv.length; i += 1) {
		const arg = argv[i];
		const next = argv[i + 1];
		if ((arg === '--draft' || arg === '--out') && (next === undefined || next.startsWith('--')))
			return { error: `${arg} needs a file` };
		if (arg === '--draft') draft = next as string;
		else if (arg === '--out') out = next as string;
		else return { error: `unknown argument '${arg}'` };
		i += 1;
	}
	if (draft === null) return { error: '--draft <draft.json> is required' };
	return { draft, out };
}

export const USAGE = 'usage: bun run hostagent:pack -- --draft <draft.json> [--out <kit.tar.gz>]';

export interface PackResult {
	readonly code: number;
	readonly stdout: string;
	readonly stderr: string;
}

export async function runPack(
	argv: readonly string[],
	repo: string = REPO_ROOT,
	seams: Pick<CollectOptions, 'installDeps'> = {},
): Promise<PackResult> {
	const args = parsePackArgs(argv);
	if ('error' in args)
		return { code: EXIT.usage, stdout: '', stderr: `${TAG} ${args.error}\n${USAGE}\n` };
	const scratch = mkdtempSync(join(tmpdir(), 'dd_hostagent_pack_'));
	try {
		const draftPath = resolve(args.draft);
		if (!existsSync(draftPath) || !lstatSync(draftPath).isFile())
			throw new PackRefused(`--draft ${args.draft} is not a regular file`);
		const constants = kitConstants(readFileSync(join(repo, INSTALL_SH_REL), 'utf8'));
		const collected = collectKit({ repo, draftPath, scratch, ...seams }, constants);
		const kit = await buildKit(collected.files, constants);
		const out = resolve(args.out ?? kitFileName(collected.instance));
		const tmp = join(dirname(out), `.${basename(out)}.${process.pid}.tmp`);
		writeFileSync(tmp, kit.bytes);
		chmodSync(tmp, 0o644);
		renameSync(tmp, out);
		const head = run(['git', 'rev-parse', 'HEAD'], repo).out.trim();
		const dirty = run(['git', 'status', '--porcelain'], repo)
			.out.split('\n')
			.filter(Boolean).length;
		const lines = [
			`${TAG} kit for instance '${collected.instance}' (${collected.servesV1 ? 'v1 and v2' : 'v2 only'}): ${out}`,
			`${TAG} ${collected.files.length} files, ${kit.bytes.length} bytes; from git ${head || 'unknown'}, ${dirty} uncommitted change(s)`,
			`sha256 ${kit.sha256}`,
			'',
			'On the publication host, as root (copy the kit there over a channel you trust):',
			`  sha256sum ${basename(out)}    # must print ${kit.sha256}`,
			`  tar -xzf ${basename(out)} install.sh`,
			`  sh install.sh ${collected.instance} --kit ${basename(out)} --kit-sha256 ${kit.sha256}`,
		];
		return { code: EXIT.ok, stdout: `${lines.join('\n')}\n`, stderr: '' };
	} catch (error) {
		if (error instanceof PackRefused)
			return { code: EXIT.refused, stdout: '', stderr: `${TAG} REFUSED — ${error.message}\n` };
		return {
			code: EXIT.failed,
			stdout: '',
			stderr: `${TAG} FAILED — ${(error as Error).message}\n`,
		};
	} finally {
		rmSync(scratch, { recursive: true, force: true });
	}
}

if (import.meta.main) {
	const result = await runPack(process.argv.slice(2));
	if (result.stdout !== '') process.stdout.write(result.stdout);
	if (result.stderr !== '') process.stderr.write(result.stderr);
	process.exit(result.code);
}
