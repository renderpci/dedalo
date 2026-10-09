#!/usr/bin/env bun
/**
 * PAIR THIS ENGINE WITH A PUBLICATION-HOST AGENT — add, replace or remove one entry of the
 * publication-host registry (engineering/PUBLICATION_HOST_SPEC.md §2; phase-3 decision E4).
 * Run it AS THE ENGINE USER, never as root, from the checkout, with the pinned Bun named in
 * full where `bun` is written below (sudo resets PATH; pairInvocation() renders the real form):
 *
 *   sudo -u <engine user> bun run dedalo:pair-publication-host add <name> --fragment <engine.env.fragment> \
 *        --bundle <engine_bundle.pem> --token-file <0600 copy of the agent SERVICE_TOKEN>
 *   sudo cat <agent credential> | sudo -u <engine user> bun run dedalo:pair-publication-host add <name> --fragment <f> --token-stdin
 *   sudo -u <engine user> bun run dedalo:pair-publication-host replace <name> --fragment <f> [--bundle <p>] [--token-file <p>]
 *   sudo -u <engine user> bun run dedalo:pair-publication-host add <name> --package <the sealed pairing package>
 *        (asks for its one-time passphrase on the terminal; or --passphrase-stdin)
 *   sudo -u <engine user> bun run dedalo:pair-publication-host remove <name>
 *   add|replace|remove … --dry-run        prove (add/replace) or describe (remove); keep nothing
 *                                         (no sweep, no registry, no secret; the proof's
 *                                         transient staging copy is removed, see step 5)
 *
 * WHY NO FORM TAKES AN ADDRESS. An agent address typed into a web form is an SSRF and a
 * credential-exfiltration surface. The pairing itself is ONE implementation,
 * src/core/publication_host/pair_flow.ts `pairWith`, with two callers: this command, and the
 * maintenance panel's root-only `pair_package` — which takes no address either: a sealed package
 * must complete a draft the panel created, the address comes from INSIDE the package and must
 * equal the draft's listener, and the live proof runs before anything is stored. The panel can
 * also edit a host's public URL, qualities and probe records, and remove it.
 *
 * WHY THE ENGINE USER AND NOT ROOT (a deliberate reading of E4's "root-run"): the secrets are
 * 0600 and the engine refuses any secret it does not own (secrets.ts bad_owner). Written by
 * root they would block every host. So the caller must own the private directory, and a
 * private directory owned by root is refused outright — no shipped stack runs the engine as
 * root.
 *
 * THE ORDER IS THE CONTRACT:
 *   1. Run as the OWNER of the private directory (the engine user).
 *   1b. A SEALED PACKAGE (`--package`, written by `provision init` on a two-machine host) is
 *      opened in memory with its one-time passphrase (publication/host_agent/src/provision/
 *      pairing_package.ts, the ONE implementation of the format): it yields the fragment's
 *      text, the token and the engine bundle, which then take EXACTLY the steps below — the
 *      loose files and the package feed one function (pair_flow.ts pairWith, which the panel's
 *      upload calls too), never two pairing paths.
 *   2. Read the agent's fragment with the ENGINE's env parser (src/config/env.ts). Unknown
 *      keys, a pending fingerprint, both or neither of URL/SOCKET, a bundle on a socket
 *      pairing, a group-readable credential — including a fragment that carries the token —
 *      are refused before any connection.
 *   3. The token (a 0600 file, stdin, or the 0600 fragment — never argv, never echoed) and the
 *      instance must hash to the fragment's fingerprint: a mis-pasted token names itself
 *      before any connection.
 *   4. The registry slot is checked: add needs a free name, replace an existing one, and one
 *      agent never sits under two names. A corrupt registry is a refusal, never "empty".
 *   5. LIVE PROOF. The secrets are staged under a throwaway `pairing_<hex>` name (a prefix the
 *      registry refuses for a real host) and the agent's unauthenticated /health must publish
 *      the expected fingerprint over the very channel the engine will use
 *      (src/core/publication_host/agent_client.ts proveHostPairing: mTLS with this bundle, or
 *      the socket). No bearer is sent. The staging is removed whatever happens; a crash leaves
 *      it 0600 and the next run sweeps it after an hour.
 *   6. Only then, ALL under the registry lock: the slot re-checked, then the secrets under the
 *      real name, then the registry entry. A refused re-check writes nothing; an add whose
 *      registry write fails removes only the secrets it just wrote.
 *
 * Exit codes: 0 ok · 2 usage · 3 refused (input, owner, pairing, registry state) · 4 failed
 * (I/O, agent unreachable, lock). Nothing printed on any path carries the token, the key, a PEM
 * or a fingerprint.
 *
 * The fragment vocabulary is spelled here AND in the agent's renderer
 * (publication/host_agent/src/provision/render/engine_fragment.ts) — separate deployables that
 * share no module; test/unit/publication_host_pair_cli_native.test.ts holds them equal.
 */

import { readFileSync, statSync } from 'node:fs';
import { dirname } from 'node:path';
import { parseArgs } from 'node:util';
import {
	MAX_PACKAGE_BYTES,
	openPairingPackage,
	PairingPackageRefused,
} from '../publication/host_agent/src/provision/pairing_package.ts';
import { privateDir } from '../src/config/env.ts';
import { isDedaloError } from '../src/core/errors/dedalo_error.ts';
import {
	AGENT_BASE_PATH,
	addressLabel,
	assertFragmentFingerprint,
	BUNDLE_PLACEHOLDER,
	commit,
	EXIT,
	FINGERPRINT_PENDING,
	FRAGMENT_KEYS,
	type FragmentFields,
	type PairInputs,
	PairRefusal,
	pairWith,
	parseAgentAddress,
	parseFragment,
	resolveBundlePath,
	resolvePackageBundle,
	resolveToken,
	STAGING_PREFIX,
	sweepStaleStaging,
	TOKEN_PLACEHOLDER,
} from '../src/core/publication_host/pair_flow.ts';
import {
	HOST_NAME,
	loadRegistry,
	RegistryError,
	registryPath,
	updateRegistry,
} from '../src/core/publication_host/registry.ts';
import {
	hostSecretDir,
	removeHostSecrets,
	SecretError,
	secretPresenceOutcome,
} from '../src/core/publication_host/secrets.ts';

// THE pairing path lives in src/core/publication_host/pair_flow.ts (the panel's pair_package
// action runs the same one); these are re-exported for the CLI gate and the drills.
export {
	AGENT_BASE_PATH,
	assertFragmentFingerprint,
	BUNDLE_PLACEHOLDER,
	commit,
	EXIT,
	FINGERPRINT_PENDING,
	FRAGMENT_KEYS,
	type FragmentFields,
	PairRefusal,
	parseAgentAddress,
	parseFragment,
	resolveBundlePath,
	resolvePackageBundle,
	resolveToken,
	STAGING_PREFIX,
	TOKEN_PLACEHOLDER,
};

const TAG = '[publication_host_pair]';

/** The checkout this script runs from: `bun run` resolves the package script there. */
const CHECKOUT_DIR = dirname(import.meta.dir);

/**
 * The pair command as an operator copies it out of a message: from the checkout, through
 * sudo, with the RUNNING Bun named in full. sudo resets PATH, so a bare `bun` answers
 * "command not found" (exit 127). `who` is sudo's target: `'#<uid>'` (sudo -u takes a uid
 * that way, quoted so the shell does not read a comment) when the owner is known.
 */
export function pairInvocation(who = '<engine user>'): string {
	return `cd ${CHECKOUT_DIR} && sudo -u ${who} ${process.execPath} run dedalo:pair-publication-host`;
}

const USAGE = [
	`Usage (as the engine user): ${pairInvocation()} <add|replace|remove> <name> [options]`,
	'  --fragment <file>      the agent engine.env.fragment (add/replace; 0600 if it carries the token)',
	'  --bundle <file>        engine_bundle.pem carried from the publication host (mTLS; 0600)',
	'  --token-file <file>    a 0600 copy of the agent SERVICE_TOKEN',
	'  --token-stdin          read the token from stdin instead',
	'  --package <file>       the sealed pairing package provision init wrote (two machines; 0600); replaces',
	'                         --fragment/--bundle/--token-*; its passphrase is asked on the terminal',
	'  --passphrase-stdin     read the package passphrase from stdin instead (one line)',
	'  --dry-run              prove the pairing (or describe the removal); keep nothing, sweep nothing',
	'',
].join('\n');

export interface CliResult {
	code: number;
	stdout: string;
	stderr: string;
}

interface CliOptions {
	command: 'add' | 'replace' | 'remove';
	name: string;
	fragment: string | null;
	bundle: string | null;
	tokenFile: string | null;
	tokenStdin: boolean;
	packageFile: string | null;
	passphraseStdin: boolean;
	dryRun: boolean;
}

// ------------------------------------------------------------------------------ pure parts

/**
 * The engine-user rule. A root-owned private dir is refused for EVERY caller: the engine
 * never runs as root, so secrets written there would be root's and the engine would refuse
 * them (bad_owner). Otherwise the caller must be the dir's owner.
 */
export function invocationOwnerProblem(dirUid: number, euid: number): string | null {
	if (dirUid === 0) {
		return (
			'the private directory is owned by root (uid 0). The engine does not run as root, so secrets written ' +
			'here would be unreadable to it. chown the private directory to the engine user, then run this as that ' +
			`user: \`${pairInvocation()} …\`.`
		);
	}
	if (dirUid === euid) return null;
	return (
		`run this as the owner of the private directory (uid ${dirUid}), not as uid ${euid}: the secrets are 0600 ` +
		`and must be owned by the engine user: \`${pairInvocation(`'#${dirUid}'`)} …\`.`
	);
}

// ------------------------------------------------------------------------------ file reads

/**
 * Why a path could not be read — the errno CODE only. Never the path, never the errno message
 * (which repeats the path): a token pasted where a path belongs would be echoed otherwise.
 */
function readFailure(error: unknown): string {
	const code = (error as NodeJS.ErrnoException | null)?.code;
	return typeof code === 'string' && /^E[A-Z]+$/.test(code) ? code : 'not a readable regular file';
}

/**
 * EACCES is nearly always WHERE the copy was put, not its own mode (that one is named on its
 * own): this command runs as the engine user, which must pass every directory above the file.
 * root's home is closed to other accounts (0550 on RHEL, 0700 on Debian and Ubuntu), so a copy
 * carried to /root and chowned as the guide once said still answered a bare EACCES (measured,
 * RHEL 10.2 two-machine drill, 2026-10-09). Generic on purpose: the path is never echoed.
 */
function accessHint(error: unknown): string {
	return (error as NodeJS.ErrnoException | null)?.code === 'EACCES'
		? " The engine user must open it AND pass every directory above it (root's home is closed to other accounts): carry the copy into a directory the engine user owns (install -d -o <engine user> -m 0700 <dir>), chown <engine user> it and chmod 600 it."
		: '';
}

/** A credential at rest: a regular file, not group/other-readable. Its CONTENT never reaches a message. */
function assertPrivateMode(path: string, what: string): void {
	let mode: number;
	try {
		const st = statSync(path);
		if (!st.isFile()) throw new Error('not a regular file');
		mode = st.mode & 0o777;
	} catch (error) {
		throw new PairRefusal(`${what} could not be read (${readFailure(error)}).${accessHint(error)}`);
	}
	if ((mode & 0o077) !== 0) {
		throw new PairRefusal(
			`${what} is readable by group or others (mode ${mode.toString(8)}). It is a credential: chmod 600 it, then re-run.`,
		);
	}
}

function readPrivateFile(path: string, what: string): string {
	assertPrivateMode(path, what);
	// stat() succeeding proves nothing about READ access: a 0600 copy carried as root passes
	// the mode check and then answers EACCES here. Named like every other unreadable file.
	try {
		return readFileSync(path, 'utf8');
	} catch (error) {
		throw new PairRefusal(`${what} could not be read (${readFailure(error)}).${accessHint(error)}`);
	}
}

/** The sealed package: a credential at rest like the others (0600), size-capped before it is read. */
function readPackageBytes(path: string): Uint8Array {
	assertPrivateMode(path, 'the pairing package');
	try {
		if (statSync(path).size > MAX_PACKAGE_BYTES) {
			throw new PairRefusal(
				`the pairing package is larger than ${MAX_PACKAGE_BYTES} bytes: it is not one provision init wrote.`,
			);
		}
		return new Uint8Array(readFileSync(path));
	} catch (error) {
		if (error instanceof PairRefusal) throw error;
		throw new PairRefusal(
			`the pairing package could not be read (${readFailure(error)}).${accessHint(error)}`,
		);
	}
}

/** The fragment. Placeholders only: any mode. Carrying a real token: held to the credential rule. */
function readFragmentFields(path: string): FragmentFields {
	let text: string;
	try {
		text = readFileSync(path, 'utf8');
	} catch (error) {
		throw new PairRefusal(
			`the fragment could not be read (${readFailure(error)}).${accessHint(error)}`,
		);
	}
	const fields = parseFragment(text);
	if (fields.token !== null) assertPrivateMode(path, 'the fragment (it carries the token)');
	return fields;
}

async function suppliedToken(
	opts: CliOptions,
	readStdin: () => Promise<string>,
): Promise<string | null> {
	if (opts.tokenStdin) return (await readStdin()).trim();
	if (opts.tokenFile !== null) return readPrivateFile(opts.tokenFile, 'the token file').trim();
	return null;
}

async function fileInputs(opts: CliOptions, readStdin: () => Promise<string>): Promise<PairInputs> {
	const fields = readFragmentFields(opts.fragment ?? '');
	const supplied = await suppliedToken(opts, readStdin);
	return {
		fields,
		supplied,
		bundle: (kind) => {
			const path = resolveBundlePath(kind, fields.tlsBundle, opts.bundle);
			return path === null ? null : readPrivateFile(path, 'the engine bundle');
		},
	};
}

async function packageInputs(
	opts: CliOptions,
	readPassphrase: (fromStdin: boolean) => Promise<string>,
): Promise<PairInputs> {
	const bytes = readPackageBytes(opts.packageFile ?? '');
	const passphrase = await readPassphrase(opts.passphraseStdin);
	// Decrypted in memory only; the parts reach disk solely through the staging/commit below.
	const parts = openPairingPackage(bytes, passphrase);
	const fields = parseFragment(parts.fragment);
	return {
		fields,
		supplied: parts.token,
		bundle: (kind) => resolvePackageBundle(kind, fields.tlsBundle, parts.bundle),
	};
}

/** The CLI's lines around THE pairing (pair_flow.ts pairWith): proved, then kept or not. */
async function pairFromCli(opts: CliOptions, inputs: PairInputs, out: string[]): Promise<void> {
	const command = opts.command as 'add' | 'replace';
	const outcome = await pairWith(
		{
			command,
			name: opts.name,
			dryRun: opts.dryRun,
			tag: TAG,
			notes: out,
			onProved: (record) =>
				out.push(
					`${TAG} pairing proved: '${opts.name}' → ${addressLabel(record.address)} (the agent published the expected fingerprint on this channel; no bearer was sent).`,
				),
		},
		inputs,
	);
	if (opts.dryRun) {
		out.push(`${TAG} --dry-run: nothing was kept (the proof's transient staging was removed).`);
		return;
	}
	out.push(
		`${TAG} ${command === 'add' ? 'added' : 'replaced'} '${opts.name}': registry ${registryPath()}, secrets ${hostSecretDir(opts.name)} ` +
			`(token${outcome.withBundle ? ' + engine bundle' : ''}, 0600). Maintenance → Publication hosts shows its state.`,
	);
	if (opts.packageFile !== null) {
		out.push(
			`${TAG} delete the package now: this copy (${opts.packageFile}) and the one on the publication host. Its passphrase opens nothing else.`,
		);
	}
}

async function pair(
	opts: CliOptions,
	readStdin: () => Promise<string>,
	readPassphrase: (fromStdin: boolean) => Promise<string>,
	out: string[],
): Promise<void> {
	const inputs =
		opts.packageFile === null
			? await fileInputs(opts, readStdin)
			: await packageInputs(opts, readPassphrase);
	await pairFromCli(opts, inputs, out);
}

function remove(name: string, dryRun: boolean, out: string[]): void {
	const existing = loadRegistry().hosts.find((host) => host.name === name) ?? null;
	// The non-throwing read: a host whose secret the engine refuses (bad mode/owner/shape)
	// must still be removable — that is exactly the host an operator wants gone.
	const presence = secretPresenceOutcome(name);
	const leftovers = presence.token_present || presence.bundle_present || presence.refused !== null;
	if (existing === null && !leftovers) {
		throw new PairRefusal(`no publication host named '${name}' (registry: ${registryPath()}).`);
	}
	const what =
		existing === null
			? 'its leftover secrets (no registry entry)'
			: 'its registry entry and secrets';
	if (dryRun) {
		out.push(`${TAG} --dry-run: would remove '${name}': ${what}. Nothing was written.`);
		return;
	}
	// The widget's order: the secrets go INSIDE the lock, before the entry is dropped, so a
	// failed delete leaves the host listed (and removable) rather than an invisible credential.
	if (existing !== null) {
		updateRegistry((current) => {
			removeHostSecrets(name);
			return { version: 1, hosts: current.hosts.filter((host) => host.name !== name) };
		});
	} else {
		removeHostSecrets(name);
	}
	out.push(`${TAG} removed '${name}': ${what}. The agent itself is untouched.`);
}

// ---------------------------------------------------------------------------------- runner

/** parseArgs' own messages repeat the offending argument verbatim: never shown (a pasted token). */
function parseArgv(argv: readonly string[]) {
	try {
		return parseArgs({
			args: [...argv],
			allowPositionals: true,
			strict: true,
			options: {
				fragment: { type: 'string' },
				bundle: { type: 'string' },
				'token-file': { type: 'string' },
				'token-stdin': { type: 'boolean', default: false },
				package: { type: 'string' },
				'passphrase-stdin': { type: 'boolean', default: false },
				'dry-run': { type: 'boolean', default: false },
			},
		});
	} catch {
		throw new Error(
			'an option is unknown, misspelled, given a value it does not take, or missing its value (not shown: it may be a pasted token).',
		);
	}
}

function parseCliArgs(argv: readonly string[]): CliOptions {
	const { values, positionals } = parseArgv(argv);
	const [command, name, ...rest] = positionals;
	// Never echo a stray positional: it is exactly where a pasted token would land.
	if (rest.length > 0)
		throw new Error(`${rest.length} unexpected positional argument(s) (not shown).`);
	if (command !== 'add' && command !== 'replace' && command !== 'remove') {
		throw new Error('the command is add, replace or remove.');
	}
	if (name === undefined || !HOST_NAME.test(name) || name.startsWith(STAGING_PREFIX)) {
		throw new Error(
			`the host name must match ${HOST_NAME} and must not start with '${STAGING_PREFIX}' (reserved).`,
		);
	}
	const opts: CliOptions = {
		command,
		name,
		fragment: values.fragment ?? null,
		bundle: values.bundle ?? null,
		tokenFile: values['token-file'] ?? null,
		tokenStdin: values['token-stdin'] === true,
		packageFile: values.package ?? null,
		passphraseStdin: values['passphrase-stdin'] === true,
		dryRun: values['dry-run'] === true,
	};
	const looseInputs =
		opts.fragment !== null || opts.bundle !== null || opts.tokenFile !== null || opts.tokenStdin;
	const pairingInputs = looseInputs || opts.packageFile !== null || opts.passphraseStdin;
	if (command === 'remove' && pairingInputs)
		throw new Error('remove takes only <name> [--dry-run].');
	if (opts.packageFile !== null && looseInputs)
		throw new Error(
			'--package carries the fragment, the token and the bundle: it excludes --fragment, --bundle, --token-file and --token-stdin.',
		);
	if (opts.passphraseStdin && opts.packageFile === null)
		throw new Error('--passphrase-stdin is the passphrase of a --package.');
	if (command !== 'remove' && opts.fragment === null && opts.packageFile === null)
		throw new Error(`${command} needs --fragment (or --package).`);
	if (opts.tokenFile !== null && opts.tokenStdin)
		throw new Error('--token-file and --token-stdin are exclusive.');
	return opts;
}

function assertOwner(): void {
	let uid: number;
	try {
		uid = statSync(privateDir).uid;
	} catch (error) {
		throw new PairRefusal(
			`the private directory ${privateDir} is not readable (${(error as Error).message}).`,
			EXIT.failed,
		);
	}
	const problem = invocationOwnerProblem(uid, process.geteuid?.() ?? -1);
	if (problem !== null) throw new PairRefusal(problem);
}

const AGENT_VERDICTS: Readonly<Record<string, readonly [number, string]>> = {
	'publication_host.pairing_mismatch': [
		EXIT.refused,
		"pairing_mismatch: the agent at that address published a DIFFERENT fingerprint — the token or instance is not that agent's, the agent was re-provisioned, or the address reaches another agent. No bearer was sent.",
	],
	'publication_host.unreachable': [
		EXIT.failed,
		'unreachable: the agent did not answer on the paired channel (address, firewall, mTLS bundle, or socket group).',
	],
	'publication_host.timeout': [EXIT.failed, 'timeout: the agent did not answer /health in time.'],
};

function classify(error: unknown): readonly [number, string] {
	if (error instanceof PairRefusal)
		return [error.exit, error.wrote ? error.message : `${error.message} Nothing was written.`];
	if (error instanceof RegistryError) {
		if (error.reason === 'locked') {
			return [
				EXIT.failed,
				`the registry ${registryPath()} is locked by another writer. Retry. Nothing was written.`,
			];
		}
		return [
			EXIT.refused,
			`registry_invalid (${error.reason}): ${registryPath()} is not a valid publication-host registry. It is never ` +
				'treated as empty: restore it from a backup or repair it, then re-run. Nothing was written.',
		];
	}
	if (error instanceof PairingPackageRefused) {
		return [
			EXIT.refused,
			`${error.message}. Nothing was written. A forgotten passphrase cannot be recovered: run provision init on the publication host again with --decide pair.package=again.`,
		];
	}
	if (error instanceof SecretError) {
		return [
			EXIT.refused,
			`a secret was refused by the engine's secrets store (${error.reason}). Carry the agent artifacts unedited; ` +
				'a secret dir with a wrong mode or owner: run as the engine user. Nothing was written.',
		];
	}
	if (isDedaloError(error)) {
		const verdict = AGENT_VERDICTS[error.code] ?? [
			EXIT.failed,
			`the agent call failed (${error.code}).`,
		];
		return [verdict[0], `${verdict[1]} Nothing was written.`];
	}
	return [
		EXIT.failed,
		`unexpected failure (${error instanceof Error ? error.name : typeof error}). Nothing was written.`,
	];
}

/**
 * The passphrase from the controlling terminal: raw mode, nothing echoed, the prompt on stderr
 * (stdout carries the result lines). No terminal: refused, naming --passphrase-stdin. Ctrl-C /
 * Ctrl-D abort; raw mode is restored whatever happens.
 */
export async function promptHidden(prompt: string): Promise<string> {
	const input = process.stdin;
	if (!input.isTTY || typeof input.setRawMode !== 'function') {
		throw new PairRefusal(
			'no terminal to ask the package passphrase on: pipe it with --passphrase-stdin (never as an argument).',
		);
	}
	process.stderr.write(prompt);
	input.setRawMode(true);
	input.resume();
	try {
		return await new Promise<string>((resolve, reject) => {
			let typed = '';
			const onData = (chunk: Buffer | string): void => {
				for (const char of typeof chunk === 'string' ? chunk : chunk.toString('utf8')) {
					if (char === '\r' || char === '\n') {
						input.removeListener('data', onData);
						resolve(typed);
						return;
					}
					if (char === '\x03' || char === '\x04') {
						input.removeListener('data', onData);
						reject(new PairRefusal('aborted at the passphrase prompt.'));
						return;
					}
					if (char === '\x7f' || char === '\b') typed = typed.slice(0, -1);
					else typed += char;
				}
			};
			input.on('data', onData);
		});
	} finally {
		input.setRawMode(false);
		input.pause();
		process.stderr.write('\n');
	}
}

function text(lines: string[]): string {
	return lines.length === 0 ? '' : `${lines.join('\n')}\n`;
}

export async function runPublicationHostPairCli(
	argv: readonly string[],
	readStdin: () => Promise<string> = () => Bun.stdin.text(),
	readTtyPassphrase: () => Promise<string> = () => promptHidden('pairing package passphrase: '),
): Promise<CliResult> {
	// --passphrase-stdin: the first line of stdin; else the terminal (hidden).
	const readPassphrase = async (fromStdin: boolean): Promise<string> =>
		fromStdin ? ((await readStdin()).split(/\r?\n/)[0] ?? '') : readTtyPassphrase();
	let opts: CliOptions;
	try {
		opts = parseCliArgs(argv);
	} catch (error) {
		return { code: EXIT.usage, stdout: '', stderr: `${TAG} ${(error as Error).message}\n${USAGE}` };
	}
	const out: string[] = [];
	try {
		assertOwner();
		if (!opts.dryRun) await sweepStaleStaging(Date.now(), out, TAG); // a dry run deletes nothing
		if (opts.command === 'remove') remove(opts.name, opts.dryRun, out);
		else await pair(opts, readStdin, readPassphrase, out);
		return { code: EXIT.ok, stdout: text(out), stderr: '' };
	} catch (error) {
		const [code, message] = classify(error);
		const verb = code === EXIT.refused ? 'REFUSED' : 'FAILED';
		return { code, stdout: text(out), stderr: `${TAG} ${verb} — ${message}\n` };
	}
}

if (import.meta.main) {
	const result = await runPublicationHostPairCli(process.argv.slice(2));
	if (result.stdout !== '') process.stdout.write(result.stdout);
	if (result.stderr !== '') process.stderr.write(result.stderr);
	process.exit(result.code);
}
