/**
 * PUBLICATION-HOST AGENT DRILL KIT — the pure pieces of scripts/publication_host_agent_drill.ts,
 * kept apart so test/unit/publication_host_agent_drill_kit.test.ts can hold them without
 * importing the drill (which reaches the engine config and the suite MariaDB helpers, and
 * would make the gate an acquirer of the suite server).
 *
 *   - writeUstarGz / collectTree / releaseIdFor: the D7 bundle (gzip'd ustar, entry types
 *     `0` and `5`, PAX `x` records carrying only `path`) and the D9 release id. Written here
 *     until phase 4 lands the engine-side writer; the drill then imports that writer and
 *     these three are deleted (one writer, never two).
 *   - renderStandIns: the drill's `sudo` / `systemctl` / `php` stand-ins (why: the drill's
 *     header, THE EXEC SEAM). The argv they accept is spelled by the AGENT's own constants
 *     (publication/host_agent/src/exec.ts SUDO, SYSTEMCTL, WEB_CONFIGTEST_BINARY — the one
 *     definition), never respelled here.
 *   - EXEC_SEAM_DIR / EXEC_SEAM_MARKER / execSeamProblem: the CI image's seam (ci/Dockerfile,
 *     "exec seam"): a dispatcher at each of exec.ts's absolute binaries that runs the stand-in
 *     the drill writes into EXEC_SEAM_DIR.
 *   - renderEnvFile: `KEY="value"` lines in the agent's env-file grammar (site_builder's
 *     `src/env_file.ts`, copied by the agent: double quotes, `\` and `"` escaped).
 *   - issueTlsMaterial: a private CA, the server and client leaves, and a ROGUE CA + client
 *     leaf, with the openssl CLI (OpenSSL 3 and LibreSSL 3 both accept every call below).
 *
 * No engine import. The only package import is exec.ts's four constants (exec.ts imports
 * nothing outside node builtins and zero-dep agent modules; it never loads the agent's
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
	WEB_CONFIGTEST_BINARY,
} from '../../publication/host_agent/src/exec.ts';

// ── the bundle ───────────────────────────────────────────────────────────────

const BLOCK = 512;
const encoder = new TextEncoder();

export interface BundleSourceEntry {
	/** Relative, '/'-separated: no leading '/', no trailing '/', no '.'/'..' segment. */
	readonly path: string;
	readonly type: 'file' | 'dir';
	readonly mode: number;
	readonly data?: Uint8Array;
}

function field(header: Uint8Array, text: string, offset: number, length: number): void {
	const bytes = encoder.encode(text);
	if (bytes.length > length)
		throw new Error(`ustar field at offset ${offset} overflows ${length} bytes: '${text}'`);
	header.set(bytes, offset);
}

const octal = (value: number, width: number): string =>
	`${value.toString(8).padStart(width - 1, '0')}\0`;

/** One ustar header. uid/gid/mtime 0: the same tree always yields the same bytes. */
function headerBlock(name: string, type: '0' | '5' | 'x', size: number, mode: number): Uint8Array {
	const header = new Uint8Array(BLOCK);
	field(header, name, 0, 100);
	field(header, octal(mode & 0o7777, 8), 100, 8);
	field(header, octal(0, 8), 108, 8);
	field(header, octal(0, 8), 116, 8);
	field(header, octal(size, 12), 124, 12);
	field(header, octal(0, 12), 136, 12);
	header.fill(0x20, 148, 156); // the checksum is computed over spaces in its own field
	field(header, type, 156, 1);
	field(header, 'ustar\0', 257, 6);
	field(header, '00', 263, 2);
	let sum = 0;
	for (const byte of header) sum += byte;
	field(header, `${sum.toString(8).padStart(6, '0')}\0 `, 148, 8);
	return header;
}

function padded(data: Uint8Array): Uint8Array[] {
	const rest = data.length % BLOCK;
	return rest === 0 ? [data] : [data, new Uint8Array(BLOCK - rest)];
}

/** `<len> path=<path>\n`, where <len> counts its own digits (POSIX pax). */
export function paxPathRecord(path: string): Uint8Array {
	const body = ` path=${path}\n`;
	const bodyBytes = encoder.encode(body).length;
	let length = bodyBytes + String(bodyBytes).length;
	if (String(length).length !== String(bodyBytes).length)
		length = bodyBytes + String(length).length;
	return encoder.encode(`${length}${body}`);
}

/**
 * The bundle. A name of ≤100 bytes goes in the header; a longer one in a PAX `x` record
 * carrying ONLY `path` (D7 refuses any other key), never the ustar `prefix` split — one
 * long-path mechanism, the one the reader must implement anyway.
 */
export function writeUstarGz(entries: Iterable<BundleSourceEntry>): Uint8Array<ArrayBuffer> {
	const chunks: Uint8Array[] = [];
	for (const entry of entries) {
		const name = entry.type === 'dir' ? `${entry.path}/` : entry.path;
		const data = entry.type === 'file' ? (entry.data ?? new Uint8Array(0)) : new Uint8Array(0);
		const type = entry.type === 'dir' ? '5' : '0';
		if (encoder.encode(name).length <= 100) {
			chunks.push(headerBlock(name, type, data.length, entry.mode));
		} else {
			const record = paxPathRecord(name);
			chunks.push(headerBlock('PaxHeader', 'x', record.length, 0o644), ...padded(record));
			chunks.push(headerBlock('pax_path', type, data.length, entry.mode));
		}
		if (data.length > 0) chunks.push(...padded(data));
	}
	chunks.push(new Uint8Array(BLOCK * 2));
	return Bun.gzipSync(Buffer.concat(chunks));
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
	/** Every invocation is appended here, one line: `<binary> <argv>`. */
	readonly log: string;
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
	const configtestArgv = `-n ${WEB_CONFIGTEST_BINARY[input.server]} -t`;
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
	const systemctl = [
		...header(SYSTEMCTL),
		'case "$*" in',
		`\t${q(`reload ${input.webUnit}`)})`,
		`\t\t${reload} ;;`,
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
	// v1 is not driven by this drill (Task 7's hermetic gates own it): PHP_BIN must name an
	// executable, and any call to it is a logged refusal the drill reports as RED.
	const php = [...header('php'), ...refuse('php')].join('\n');
	return { sudo, systemctl, php };
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
