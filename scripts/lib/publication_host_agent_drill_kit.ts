/**
 * PUBLICATION-HOST AGENT DRILL KIT — the pure pieces of scripts/publication_host_agent_drill.ts,
 * kept apart so test/unit/publication_host_agent_drill_kit.test.ts can hold them without
 * importing the drill (which reaches the engine config and the suite MariaDB helpers, and
 * would make the gate an acquirer of the suite server).
 *
 *   - bundleBytes / collectTree / releaseIdFor: the D7 bundle and the D9 release id. The
 *     bytes come from THE engine writer (src/core/publication_host/bundle_writer.ts, node
 *     builtins only — one writer, never two, held by publication_host_bundle_twin_tripwire);
 *     collectTree and releaseIdFor stay until the phase-4 API bundle builder replaces them.
 *   - renderStandIns: the drill's `sudo` / `systemctl` / `php` stand-ins (why: the drill's
 *     header, THE EXEC SEAM). The argv they accept is spelled by the AGENT's own constants
 *     (publication/host_agent/src/exec.ts SUDO, SYSTEMCTL; the configtest binary is
 *     layout.ts pickConfigtestBinary, the one
 *     definition), never respelled here. `php` lints for real under the v1 API root when
 *     asked (phase 4: the engine drill's lockstep rows push real v1 releases). On nginx with
 *     the host-wide map, `systemctl start dedalo-pubhost-map.service` runs
 *   - renderHostMapDriver: the drill's stand-in for that root oneshot — the agent's OWN renderer
 *     (publication/host_agent/src/rules/host_map_main.ts runHostMap) over the scene's paths and user-mode nginx.
 *   - SVG_DRILL_FILES / svgTreatmentProblem: the MEDIA-03 rows (provision init §13.8) — the
 *     envelope SVG inline with the envelope CSP, the uploaded SVG `attachment`; the header
 *     contract is passed in (svg_safety.ts reads the engine config at import).
 *   - EXEC_SEAM_DIR / EXEC_SEAM_MARKER / execSeamProblem: the CI image's seam (ci/Dockerfile,
 *     "exec seam"): a dispatcher at each of exec.ts's absolute binaries that runs the stand-in
 *     the drill writes into EXEC_SEAM_DIR.
 *   - renderEnvFile: `KEY="value"` lines in the agent's env-file grammar (site_builder's
 *     `src/env_file.ts`, copied by the agent: double quotes, `\` and `"` escaped).
 *   - issueTlsMaterial: a private CA, the server and client leaves, and a ROGUE CA + client
 *     leaf, with the openssl CLI (OpenSSL 3 and LibreSSL 3 both accept every call below).
 *
 * One engine import: the bundle writer (itself node-builtins-only, so no engine config is
 * reached). The only package import is exec.ts's four constants (exec.ts imports nothing
 * outside node builtins and zero-dep agent modules; it never loads the agent's
 * configuration at import — its header).
 */

import { createHash } from 'node:crypto';
import {
	accessSync,
	chmodSync,
	constants as FS,
	lstatSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	statSync,
	writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import {
	SUDO,
	SYSTEMCTL,
	V2_SCRATCH_TEMPLATE_SUFFIX,
} from '../../publication/host_agent/src/exec.ts';
import {
	HOST_MAP_UNIT,
	pickConfigtestBinary,
} from '../../publication/host_agent/src/provision/layout.ts';
import { compareBundlePaths, writeBundle } from '../../src/core/publication_host/bundle_writer.ts';

// ── the bundle ───────────────────────────────────────────────────────────────

export interface BundleSourceEntry {
	/** Relative, '/'-separated: no leading '/', no trailing '/', no '.'/'..' segment. */
	readonly path: string;
	readonly type: 'file' | 'dir';
	readonly mode: number;
	readonly data?: Uint8Array;
}

/**
 * The D7 bundle, written by THE engine writer (src/core/publication_host/bundle_writer.ts —
 * one writer, never two; held by test/unit/publication_host_bundle_twin_tripwire.test.ts).
 * Callers may pass entries in any order (the drill appends its DRILL_RELEASE marker last);
 * they are sorted into tree order here because the writer refuses anything else.
 */
export async function bundleBytes(
	entries: readonly BundleSourceEntry[],
): Promise<Uint8Array<ArrayBuffer>> {
	const sorted = [...entries].sort((a, b) => compareBundlePaths(a.path, b.path));
	const out = await writeBundle(
		(async function* () {
			yield* sorted;
		})(),
	);
	return new Uint8Array(await new Response(out.stream).arrayBuffer());
}

/** Any `node_modules/.bin`, at any depth: package-binary symlinks v2 never runs (D6). */
const BIN_DIR = /(^|\/)node_modules\/\.bin$/;

/**
 * Every entry under `root`, sorted, each directory before its contents. `node_modules/.bin`
 * is left out; ANY OTHER symlink, and any non-regular entry, THROWS — a tree the bundle
 * format cannot carry is a red, never a silently dropped file.
 */
export function collectTree(root: string): BundleSourceEntry[] {
	const out: BundleSourceEntry[] = [];
	const walk = (rel: string): void => {
		for (const name of readdirSync(rel === '' ? root : join(root, rel)).sort()) {
			const path = rel === '' ? name : `${rel}/${name}`;
			if (BIN_DIR.test(path)) continue;
			const stat = lstatSync(join(root, path));
			if (stat.isSymbolicLink())
				throw new Error(`bundle tree holds a symlink the bundle format cannot carry: ${path}`);
			if (stat.isDirectory()) {
				out.push({ path, type: 'dir', mode: 0o755 });
				walk(path);
			} else if (stat.isFile()) {
				out.push({
					path,
					type: 'file',
					mode: (stat.mode & 0o111) !== 0 ? 0o755 : 0o644,
					data: readFileSync(join(root, path)),
				});
			} else {
				throw new Error(`bundle tree holds a non-regular entry: ${path}`);
			}
		}
	};
	walk('');
	return out;
}

export function sha256Hex(bytes: Uint8Array): string {
	return createHash('sha256').update(bytes).digest('hex');
}

/** D9: `<version>_<digest7>`, the digest of the bundle bytes the request carries. */
export function releaseIdFor(version: string, bundle: Uint8Array): string {
	return `${version}_${sha256Hex(bundle).slice(0, 7)}`;
}

// ── the env file ─────────────────────────────────────────────────────────────

export function renderEnvFile(values: Readonly<Record<string, string | number>>): string {
	const lines = Object.entries(values).map(([key, raw]) => {
		if (!/^[A-Z_][A-Z0-9_]*$/.test(key)) throw new Error(`env key '${key}' is not KEY grammar`);
		const value = String(raw);
		if (/[\r\n]/.test(value)) throw new Error(`env value of ${key} holds a newline`);
		return `${key}="${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
	});
	return `${lines.join('\n')}\n`;
}

/**
 * The header every agent mutation reads its actor from: publication/host_agent/src/security/
 * auth.ts ACTOR_HEADER. Respelled because auth.ts loads the agent's configuration at import
 * (which refuses outside a provisioned host); the kit gate pins the two equal.
 */
export const AGENT_ACTOR_HEADER = 'X-Dedalo-Actor';

// ── the SVG treatment (MEDIA-03 through the publication host) ─────────────────

/**
 * The two SVG populations the drills plant under the scene's media root, one published
 * record (`test3_1`) each, so Rule B serves both and the HEADERS are what tells them apart:
 *   - the server-generated image envelope (`<image folder>/…/svg/<bucket>/x.svg`): inline,
 *     the envelope CSP, NO Content-Disposition (an `attachment` blanks the edit view);
 *   - an uploaded vector (`svg/<quality>/x.svg`, component_svg): `attachment` + the
 *     quarantine CSP.
 * Their qualities (`image/svg`, `svg/web`) must be public on the host, or Rule B 404s them
 * and the rows measure nothing. The kit gate pins that each path IS the population it names
 * (the engine's own selection rule), so a moved path cannot turn a row vacuous.
 */
export const SVG_DRILL_FILES = {
	envelope: 'image/svg/0/test94_test3_1.svg',
	uploaded: 'svg/web/test94_test3_1.svg',
} as const;
export const SVG_DRILL_QUALITIES: readonly string[] = ['image/svg', 'svg/web'];
export type SvgPopulation = keyof typeof SVG_DRILL_FILES;

/**
 * The header contract, PASSED IN by the caller (src/core/media/svg_safety.ts's constants):
 * that module reads the engine config at import, which this kit never does (its header).
 */
export interface SvgHeaderContract {
	readonly envelopeCsp: string;
	readonly quarantineCsp: string;
	readonly quarantineDisposition: string;
	readonly nosniff: string;
}

/**
 * What is wrong with one served SVG's response, or null. A 200 is required first: a 404
 * carries no media headers, and a row that accepted it would pass with the file unserved.
 * nginx drops an `add_header` whose value is empty and Apache `unset`s it, so the envelope's
 * "empty Content-Disposition" is ABSENT or empty on the wire, never `inline` or `attachment`.
 */
export function svgTreatmentProblem(
	population: SvgPopulation,
	status: number,
	headers: Headers,
	contract: SvgHeaderContract,
): string | null {
	if (status !== 200) return `${population} svg: status ${status}, expected 200`;
	const disposition = headers.get('content-disposition');
	const csp = headers.get('content-security-policy');
	const found = `disposition ${JSON.stringify(disposition)}, csp ${JSON.stringify(csp)}`;
	const wrong: string[] = [];
	if (headers.get('x-content-type-options') !== contract.nosniff) wrong.push('no nosniff');
	if (population === 'envelope') {
		if (disposition !== null && disposition.trim() !== '') wrong.push('a Content-Disposition');
		if (csp !== contract.envelopeCsp) wrong.push('not the envelope CSP');
	} else {
		if (disposition?.trim() !== contract.quarantineDisposition)
			wrong.push(`not Content-Disposition ${contract.quarantineDisposition}`);
		if (csp !== contract.quarantineCsp) wrong.push('not the quarantine CSP');
	}
	return wrong.length === 0 ? null : `${population} svg: ${wrong.join(', ')} (${found})`;
}

// ── the exec seam ────────────────────────────────────────────────────────────

/**
 * Where the CI image's dispatchers (at exec.ts's SUDO and SYSTEMCTL) look for the stand-in
 * to run. root:root 0770 in the image: the job's bare uid 1001 runs with gid 0 on every host
 * (GitHub `--user 1001`, GitLab, ci:local), so it may arm the seam; nothing in it is
 * privileged — sudo's setuid bit is stripped and the real binary diverted.
 */
export const EXEC_SEAM_DIR = '/opt/dedalo-ci/exec-seam';
/** The line every dispatcher carries; how the drill tells the seam from a real binary. */
export const EXEC_SEAM_MARKER = 'DEDALO CI EXEC SEAM DISPATCHER';

/**
 * Why the stand-ins cannot be put AT the agent's absolute binaries here, or null when they
 * can: each binary must be the image's dispatcher, and the seam directory writable.
 */
export function execSeamProblem(
	options: { binaries?: readonly string[]; seamDir?: string } = {},
): string | null {
	const binaries = options.binaries ?? [SUDO, SYSTEMCTL];
	const seamDir = options.seamDir ?? EXEC_SEAM_DIR;
	for (const bin of binaries) {
		let body: string;
		try {
			if (!statSync(bin).isFile()) return `${bin} is not a regular file`;
			body = readFileSync(bin, 'utf8');
		} catch (error) {
			const code = (error as NodeJS.ErrnoException).code;
			return code === 'ENOENT'
				? `${bin} does not exist`
				: `${bin} is not the CI image's seam dispatcher (unreadable: ${code ?? 'error'})`;
		}
		if (!body.includes(EXEC_SEAM_MARKER)) return `${bin} is not the CI image's seam dispatcher`;
	}
	try {
		if (!statSync(seamDir).isDirectory()) throw new Error('not a directory');
		accessSync(seamDir, FS.W_OK | FS.X_OK);
	} catch {
		return `the seam directory ${seamDir} is missing or not writable`;
	}
	return null;
}

// ── the exec stand-ins ───────────────────────────────────────────────────────

/** POSIX single-quoting: the one quoting that needs no escape table. */
export function shellQuote(value: string): string {
	return `'${value.replace(/'/g, `'\\''`)}'`;
}

export interface StandInInput {
	readonly server: 'apache' | 'nginx';
	/** Absolute path of the Apache binary (apxs-resolved) or of nginx. */
	readonly webBinary: string;
	/** The user-mode server's main conf, its prefix dir and (nginx) error log. */
	readonly webMain: string;
	readonly webDir: string;
	readonly webErrorLog: string;
	readonly webUnit: string;
	readonly v2Unit: string;
	/** `<STATE_ROOT>/publication_api/v2/current` and `…/shared/v2.env`. */
	readonly v2Current: string;
	/** `<STATE_ROOT>/publication_api/v2/scratch`: the scratch template unit's WorkingDirectory. */
	readonly v2Scratch: string;
	readonly v2EnvFile: string;
	readonly v2PidFile: string;
	readonly v2Output: string;
	readonly bun: string;
	/**
	 * `php -l <file>` with <file> a `.php` under `root` (`<STATE_ROOT>/publication_api/v1`,
	 * real path: the agent lints the realpath) execs the REAL `binary` — the engine drill's
	 * lockstep rows push a real v1 release and the agent lints each file before promoting
	 * it. Absent: php refuses everything.
	 */
	readonly phpLint?: { readonly binary: string; readonly root: string };
	/** Every invocation is appended here, one line: `<binary> <argv>`. */
	readonly log: string;
	/**
	 * nginx with the HOST-WIDE map (`NGINX_MAP_MODE=conf_d`): the driver renderHostMapDriver
	 * wrote. `systemctl start <HOST_MAP_UNIT>.service` (the agent's one map spawn, no argument)
	 * then runs it with this Bun — what the root oneshot runs on a host. Absent: that argv is
	 * refused like any other.
	 */
	readonly hostMapDriver?: string;
}

export interface StandIns {
	readonly sudo: string;
	readonly systemctl: string;
	readonly php: string;
}

/**
 * The three stand-ins. Each logs its argv FIRST — under the absolute path the agent spawned
 * (SUDO / SYSTEMCTL) — accepts only the agent's closed argv for the configured server and
 * units, and refuses anything else with 64: an exec module that grew a command, or changed
 * one, is a logged refusal the drill reads back, never a silent success.
 */
export function renderStandIns(input: StandInInput): StandIns {
	const q = shellQuote;
	const log = (label: string) => `printf '%s\\n' "${label} $*" >> ${q(input.log)}`;
	const refuse = (label: string) => [
		`echo "drill ${label} stand-in: argv outside the closed set: $*" >&2`,
		'exit 64',
		'',
	];
	const header = (label: string) => [
		'#!/usr/bin/env bash',
		`# DRILL STAND-IN for ${label} — rendered by scripts/publication_host_agent_drill.ts.`,
		"# Accepts only the publication agent's closed argv; logs every call; refuses the rest.",
		log(label),
	];
	const configtestArgv = `-n ${pickConfigtestBinary(input.server)} -t`;
	const configtest =
		input.server === 'apache'
			? `exec ${q(input.webBinary)} -t -f ${q(input.webMain)}`
			: `exec ${q(input.webBinary)} -e ${q(input.webErrorLog)} -t -p ${q(input.webDir)} -c ${q(input.webMain)}`;
	const reload =
		input.server === 'apache'
			? `exec ${q(input.webBinary)} -k graceful -f ${q(input.webMain)}`
			: `exec ${q(input.webBinary)} -e ${q(input.webErrorLog)} -s reload -p ${q(input.webDir)} -c ${q(input.webMain)}`;
	const sudo = [
		...header(SUDO),
		`if [ "$*" = ${q(configtestArgv)} ]; then ${configtest}; fi`,
		...refuse(SUDO),
	].join('\n');
	const pid = q(input.v2PidFile);
	const hostMap =
		input.hostMapDriver === undefined
			? []
			: [
					`\t${q(`start ${HOST_MAP_UNIT}.service`)})`,
					// systemd starts the oneshot with an EMPTY environment (render/host_map_unit.ts
					// Environment=): nothing of the agent's reaches the renderer here either.
					`\t\texec env -i PATH="$PATH" ${q(input.bun)} --no-env-file ${q(input.hostMapDriver)} ;;`,
				];
	const systemctl = [
		...header(SYSTEMCTL),
		'case "$*" in',
		`\t${q(`reload ${input.webUnit}`)})`,
		`\t\t${reload} ;;`,
		...hostMap,
		`\t${q(`restart ${input.v2Unit}`)})`,
		`\t\tif [ -f ${pid} ]; then`,
		`\t\t\told="$(cat ${pid})"`,
		'\t\t\tkill "$old" 2>/dev/null || true',
		'\t\t\tfor _ in $(seq 1 200); do kill -0 "$old" 2>/dev/null || break; sleep 0.05; done',
		'\t\t\tkill -9 "$old" 2>/dev/null || true',
		'\t\tfi',
		`\t\tcd ${q(input.v2Current)} || exit 1`,
		`\t\tprintf '%s\\n' "v2 started in $(pwd -P)" >> ${q(input.log)}`,
		// systemd's EnvironmentFile= semantics: a CLEAN environment plus the file, nothing
		// of the agent's own environment (its CREDENTIALS_DIRECTORY above all).
		`\t\tnohup env -i PATH="$PATH" HOME="\${HOME:-/}" bash -c 'set -a; . "$1"; set +a; exec "$2" run src/index.ts' _ ${q(input.v2EnvFile)} ${q(input.bun)} >> ${q(input.v2Output)} 2>&1 < /dev/null &`,
		`\t\techo "$!" > ${pid}`,
		'\t\texit 0 ;;',
		// The scratch TEMPLATE instance (exec.ts v2ScratchBoot): what the rendered
		// `<V2_UNIT>-scratch@.service` does — WorkingDirectory=<v2>/scratch, EnvironmentFile=v2.env,
		// then env(1) NODE_ENV/HOST/PORT=%i. The port must be the polkit rule's 4-5 digits.
		`\t${q(`start ${input.v2Unit}${V2_SCRATCH_TEMPLATE_SUFFIX}`)}[1-9][0-9][0-9][0-9]${q('.service')}|${q(`start ${input.v2Unit}${V2_SCRATCH_TEMPLATE_SUFFIX}`)}[1-9][0-9][0-9][0-9][0-9]${q('.service')})`,
		`\t\tport="\${2#${input.v2Unit}${V2_SCRATCH_TEMPLATE_SUFFIX}}"; port="\${port%.service}"`,
		`\t\tcd ${q(input.v2Scratch)} || exit 1`,
		`\t\tprintf '%s\\n' "scratch started in $(pwd -P)" >> ${q(input.log)}`,
		`\t\tnohup env -i PATH="$PATH" HOME="\${HOME:-/}" bash -c 'set -a; . "$1"; set +a; export NODE_ENV=production HOST=127.0.0.1 PORT="$3"; exec "$2" run src/index.ts' _ ${q(input.v2EnvFile)} ${q(input.bun)} "$port" >> ${q(input.v2Output)} 2>&1 < /dev/null &`,
		`\t\techo "$!" > ${pid}.scratch-"$port"`,
		'\t\texit 0 ;;',
		`\t${q(`stop ${input.v2Unit}${V2_SCRATCH_TEMPLATE_SUFFIX}`)}[1-9][0-9][0-9][0-9]${q('.service')}|${q(`stop ${input.v2Unit}${V2_SCRATCH_TEMPLATE_SUFFIX}`)}[1-9][0-9][0-9][0-9][0-9]${q('.service')})`,
		`\t\tport="\${2#${input.v2Unit}${V2_SCRATCH_TEMPLATE_SUFFIX}}"; port="\${port%.service}"`,
		`\t\tf=${pid}.scratch-"$port"`,
		'\t\tif [ -f "$f" ]; then',
		'\t\t\told="$(cat "$f")"',
		'\t\t\tkill "$old" 2>/dev/null || true',
		'\t\t\tfor _ in $(seq 1 200); do kill -0 "$old" 2>/dev/null || break; sleep 0.05; done',
		'\t\t\tkill -9 "$old" 2>/dev/null || true',
		'\t\t\trm -f "$f"',
		'\t\tfi',
		'\t\texit 0 ;;',
		'esac',
		...refuse(SYSTEMCTL),
	].join('\n');
	// php: without `phpLint`, every call is a logged refusal the drill reports as RED (PHP_BIN
	// must still name an executable). With it, exactly `-l <*.php under root>` reaches the
	// real binary; a `.`/`..` segment never does, so the prefix test cannot be walked out of.
	const php =
		input.phpLint === undefined
			? [...header('php'), ...refuse('php')].join('\n')
			: [
					...header('php'),
					'if [ "$#" -eq 2 ] && [ "$1" = -l ]; then',
					'\tcase "$2" in',
					'\t\t*/..|*/.|*/../*|*/./*) ;;',
					`\t\t${q(`${input.phpLint.root}/`)}*.[pP][hH][pP]) exec ${q(input.phpLint.binary)} -l "$2" ;;`,
					'\tesac',
					'fi',
					...refuse('php'),
				].join('\n');
	return { sudo, systemctl, php };
}

// ── the host-wide nginx map's root renderer, as the drill runs it ────────────

export interface HostMapDriverInput {
	/** publication/host_agent: the driver imports the REAL renderer (publication/host_agent/src/rules/host_map_main.ts) from here. */
	readonly agentDir: string;
	/** `<HOST_BASE>/nginx_map`, `<HOST_BASE>/locks`, `<HOST_BASE>/map_renderer/identities.json`. */
	readonly mapDir: string;
	readonly locksDir: string;
	readonly identitiesPath: string;
	/** The user-mode nginx the scene runs: its binary, error log, prefix dir, main conf and pid file. */
	readonly nginx: {
		readonly binary: string;
		readonly errorLog: string;
		readonly dir: string;
		readonly main: string;
		readonly pid: string;
	};
}

/**
 * The drill's stand-in for the root oneshot `dedalo-pubhost-map.service`: a Bun entry that runs
 * the agent's OWN renderer (`runHostMap` + `hostMapIo` + `exitCodeOf` of publication/host_agent/src/rules/host_map_main.ts,
 * unmodified — contributions lstat-judged against identities.json, rendered, re-parsed, installed
 * through the shared transaction, result.json written) with the scene's paths. Two drill seams,
 * both named: the host web lock is the scene's (its owner is the drill's uid, not root's — the
 * renderer asks uid 0), and the transaction's exec runs the scene's user-mode nginx (`-t`, `-s
 * reload`, the master's pid alive) instead of rendererExec's `/usr/sbin/nginx` + `systemctl`.
 */
export function renderHostMapDriver(input: HostMapDriverInput): string {
	const j = (value: unknown) => JSON.stringify(value);
	const ngx = input.nginx;
	const base = [ngx.binary, '-e', ngx.errorLog];
	const tail = ['-p', ngx.dir, '-c', ngx.main];
	return [
		'// DRILL STAND-IN for the root oneshot dedalo-pubhost-map.service — rendered by scripts/lib/publication_host_agent_drill_kit.ts.',
		`import { existsSync, readFileSync } from 'node:fs';`,
		`import { exitCodeOf, hostMapIo, runHostMap } from ${j(`${input.agentDir}/src/rules/host_map_main.ts`)};`,
		`import { flockIo } from ${j(`${input.agentDir}/src/provision/flock.ts`)};`,
		'const uid = process.getuid?.() ?? 0;',
		'const real = flockIo();',
		"// The scene's web.lock is the drill uid's: the renderer's uid-0 expectation is pointed at it.",
		'const lockIo = { ...real, openLockFile: (path, spec) => real.openLockFile(path, { ...spec, uid }) };',
		'const run = async (argv) => {',
		"\tconst p = Bun.spawnSync(argv, { stdout: 'pipe', stderr: 'pipe' });",
		'\treturn { code: p.exitCode ?? -1, stdout: p.stdout.toString(), stderr: p.stderr.toString() };',
		'};',
		'const exec = {',
		`\twebConfigtest: () => run(${j([...base, '-t', ...tail])}),`,
		`\twebReload: () => run(${j([...base, '-s', 'reload', ...tail])}),`,
		'\twebActive: async () => {',
		`\t\tif (!existsSync(${j(ngx.pid)})) return false;`,
		'\t\ttry {',
		`\t\t\tprocess.kill(Number(readFileSync(${j(ngx.pid)}, 'utf8').trim()), 0);`,
		'\t\t\treturn true;',
		'\t\t} catch {',
		'\t\t\treturn false;',
		'\t\t}',
		'\t},',
		'};',
		'const result = await runHostMap({',
		`\tmapDir: ${j(input.mapDir)},`,
		`\tlocksDir: ${j(input.locksDir)},`,
		`\tidentitiesPath: ${j(input.identitiesPath)},`,
		'\tlockIo,',
		'\texec,',
		'\tio: hostMapIo(),',
		'\tnow: () => new Date(),',
		'\tlog: (line) => console.error(line),',
		'});',
		'process.exit(exitCodeOf(result));',
		'',
	].join('\n');
}

/** Write the given stand-ins as `<dir>/<name>`, 0755 (the dir is created 0700 when absent). */
export function writeStandIns(dir: string, standIns: Partial<StandIns>): void {
	mkdirSync(dir, { recursive: true, mode: 0o700 });
	for (const [name, text] of Object.entries(standIns)) {
		if (text === undefined) continue;
		writeFileSync(join(dir, name), text);
		chmodSync(join(dir, name), 0o755);
	}
}

// ── the TLS material ─────────────────────────────────────────────────────────

const OPENSSL_CNF = `[req]
distinguished_name = dn
prompt = no
[dn]
CN = dedalo-publication-host-drill
[v3_ca]
basicConstraints = critical,CA:TRUE
keyUsage = critical,keyCertSign,cRLSign
subjectKeyIdentifier = hash
[server]
basicConstraints = critical,CA:FALSE
keyUsage = critical,digitalSignature,keyEncipherment
extendedKeyUsage = serverAuth
subjectAltName = IP:127.0.0.1
[client]
basicConstraints = critical,CA:FALSE
keyUsage = critical,digitalSignature
extendedKeyUsage = clientAuth
`;

export interface KeyPair {
	readonly cert: string;
	readonly key: string;
}

export interface TlsMaterial {
	readonly ca: KeyPair;
	readonly server: KeyPair;
	readonly client: KeyPair;
	readonly rogueCa: KeyPair;
	readonly rogueClient: KeyPair;
}

/** CA → server leaf (SAN IP:127.0.0.1, serverAuth) + client leaf (clientAuth); a rogue CA + client. */
export function issueTlsMaterial(dir: string): TlsMaterial {
	mkdirSync(dir, { recursive: true, mode: 0o700 });
	const cnf = join(dir, 'openssl.cnf');
	writeFileSync(cnf, OPENSSL_CNF);
	const run = (args: string[]): void => {
		const r = Bun.spawnSync(['openssl', ...args], { stdout: 'pipe', stderr: 'pipe' });
		if (r.exitCode !== 0)
			throw new Error(`openssl ${args.join(' ')} failed: ${r.stderr.toString()}`);
	};
	let serial = 1000;
	const key = (name: string): string => {
		const path = join(dir, `${name}.key`);
		run(['ecparam', '-name', 'prime256v1', '-genkey', '-noout', '-out', path]);
		chmodSync(path, 0o600);
		return path;
	};
	const authority = (name: string): KeyPair => {
		const keyPath = key(name);
		const cert = join(dir, `${name}.pem`);
		run([
			'req',
			'-x509',
			'-new',
			'-key',
			keyPath,
			'-subj',
			`/CN=${name}`,
			'-days',
			'2',
			'-config',
			cnf,
			'-extensions',
			'v3_ca',
			'-out',
			cert,
		]);
		return { cert, key: keyPath };
	};
	const leaf = (name: string, extensions: 'server' | 'client', issuer: KeyPair): KeyPair => {
		const keyPath = key(name);
		const csr = join(dir, `${name}.csr`);
		run(['req', '-new', '-key', keyPath, '-subj', `/CN=${name}`, '-config', cnf, '-out', csr]);
		const cert = join(dir, `${name}.pem`);
		run([
			'x509',
			'-req',
			'-in',
			csr,
			'-CA',
			issuer.cert,
			'-CAkey',
			issuer.key,
			'-set_serial',
			String(serial++),
			'-days',
			'2',
			'-extfile',
			cnf,
			'-extensions',
			extensions,
			'-out',
			cert,
		]);
		return { cert, key: keyPath };
	};
	const ca = authority('ca');
	const rogueCa = authority('rogue_ca');
	return {
		ca,
		server: leaf('server', 'server', ca),
		client: leaf('client', 'client', ca),
		rogueCa,
		rogueClient: leaf('rogue_client', 'client', rogueCa),
	};
}
