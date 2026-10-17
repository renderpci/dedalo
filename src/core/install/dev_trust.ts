/**
 * TRUST THE DEVELOPMENT AUTHORITY ON THIS MACHINE (TODO-055; design
 * DEV_ROUTE_SERVE §1.2, owner answer D2: the installer installs it).
 *
 * WHY THE STEP ELEVATES ONLY ITSELF. The developer route runs as the developer
 * — it must: a root-owned `../private/.env` or `../private/tls/` is unreadable
 * to `bun run dev`. Putting an authority into the machine's trust store is the
 * one act that needs more, so this step asks for exactly that and nothing else:
 *
 *  - macOS: `security add-trusted-cert -r trustRoot -k <login keychain>` — the
 *    USER's trust settings, no root; macOS itself asks for the user's password
 *    in a system dialog (Safari, Chrome and Edge follow it);
 *  - Linux: the distribution's anchor directory + its update command
 *    (update-ca-certificates / update-ca-trust), through `sudo` for that ONE
 *    shell (copy + update, one prompt); already root → no sudo;
 *  - Firefox keeps its own store (NSS): `certutil -A` into every existing
 *    profile when certutil is installed; without it, the
 *    `security.enterprise_roots.enabled` note (Firefox then reads the OS store).
 *
 * A REFUSED PROMPT IS NOT A FAILED INSTALL. Cancelling the dialog, a wrong
 * sudo password, no sudo, an unsupported platform: the step reports "not
 * trusted yet" with the manual steps and the install goes on — the server
 * serves either way; only the browser's warning remains, which the operator
 * can lift by hand. The step never throws for the trust store's answer.
 *
 * ALREADY TRUSTED = NOTHING ASKED. Before any prompt the OUTCOME is measured —
 * does this machine's verifier accept the development certificate? (macOS
 * `security verify-cert`, Linux `openssl verify` over the default store, NSS
 * `certutil -L`) — so a re-run or a resume never prompts again.
 *
 * WHAT IT ADDED IS RECORDED, SO IT CAN BE TAKEN BACK. `<private>/tls/
 * dedalo-trust.json` lists every entry this installer put in a trust store
 * (the store, where, the authority's fingerprints and PEM, the install id).
 * Three readers: `--abort` (steps.ts dev_trust_ca undo: the entries of THAT
 * install), `bun run tls:untrust` (every entry — the way back for a finished
 * install, which --abort never undoes), and this step itself: an entry for an
 * authority that is no longer the one in the directory (a rotation) is removed
 * before the new one is trusted — a replaced key must not stay trusted.
 *
 * Every command goes through an injectable runner/environment, so the gate
 * drives the real Linux shell, a real NSS database and real openssl with a
 * stub `sudo` (test/unit/install_dev_tls_native.test.ts).
 */

import { X509Certificate } from 'node:crypto';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { liveProcessEnv, processEnvValue } from '../../config/env.ts';
import { DEV_TLS_CERT_NAME } from './dev_listener.ts';
import { ISSUING_CA_NAME } from './dev_tls.ts';
import { authorityFile } from './host/tls_authority.ts';

/** The record of what this installer put in a trust store (see the header). */
export const TRUST_RECORD_NAME = 'dedalo-trust.json';
const TRUST_RECORD_SCHEMA = 'dedalo.dev_trust/1';

/** The trust stores this step writes. */
export type TrustStoreKind = 'macos_keychain' | 'linux_anchors' | 'firefox_nss';

/** One entry this installer added to a trust store. */
export interface TrustRecordEntry {
	readonly store: TrustStoreKind;
	/** The keychain file, the anchor file, or the NSS profile directory. */
	readonly target: string;
	/** NSS: the nickname; Linux: the update argv; null otherwise. */
	readonly nickname: string | null;
	readonly update: readonly string[] | null;
	readonly fingerprint256: string;
	readonly sha1: string;
	/** The authority itself (a public certificate): what a removal needs once its file is gone. */
	readonly pem: string;
	/** The install that added it (null: added by hand through a script). */
	readonly install_id: string | null;
	readonly added_at: string;
}

interface TrustRecord {
	schema: typeof TRUST_RECORD_SCHEMA;
	entries: TrustRecordEntry[];
}

/** One command's exit code and combined output. */
export interface CommandOutcome {
	readonly code: number;
	readonly output: string;
}

/** Runs one argv. `interactive`: it may prompt (sudo, the macOS dialog) — the terminal is shared. */
export type CommandRunner = (
	argv: readonly string[],
	options: { readonly env: Record<string, string>; readonly interactive: boolean },
) => Promise<CommandOutcome>;

/** A Linux distribution family's anchor directory and the command that rebuilds the store. */
export interface LinuxAnchorStore {
	readonly dir: string;
	readonly update: readonly string[];
}

/**
 * The Linux anchor stores, probed in order: the first whose directory exists
 * and whose update command is installed is this machine's.
 */
export const LINUX_ANCHOR_STORES: readonly LinuxAnchorStore[] = Object.freeze([
	// Fedora, RHEL, Rocky, Alma (p11-kit's update-ca-trust)
	{ dir: '/etc/pki/ca-trust/source/anchors', update: ['update-ca-trust', 'extract'] },
	// Arch (also p11-kit)
	{ dir: '/etc/ca-certificates/trust-source/anchors', update: ['update-ca-trust'] },
	// openSUSE
	{ dir: '/etc/pki/trust/anchors', update: ['update-ca-certificates'] },
	// Debian, Ubuntu, Alpine — the file must end in .crt
	{ dir: '/usr/local/share/ca-certificates', update: ['update-ca-certificates'] },
]);

/** Where the step looks and how it runs commands (the machine, unless a gate says otherwise). */
export interface TrustEnvironment {
	readonly platform: NodeJS.Platform;
	/** null = no uids on this platform. */
	readonly euid: number | null;
	readonly home: string;
	/** The environment commands run with (PATH, HOME…; SSL_CERT_FILE reaches openssl). */
	readonly env: Record<string, string>;
	readonly run: CommandRunner;
	readonly linuxStores: readonly LinuxAnchorStore[];
	/** The macOS keychain the authority is added to. */
	readonly keychain: string;
	/** The directories holding Firefox profiles. */
	readonly firefoxRoots: readonly string[];
}

/** The environment commands run with: the tools' needs, never the installer's secrets. */
const COMMAND_KEYS: readonly string[] = [
	'PATH',
	'HOME',
	'USER',
	'LOGNAME',
	'TMPDIR',
	'LANG',
	'LC_ALL',
	'DISPLAY',
	'SUDO_ASKPASS',
	'SSL_CERT_FILE',
	'SSL_CERT_DIR',
];

/** Spawn one argv; a prompt reads the shared terminal, the output is captured for the report. */
const spawnRunner: CommandRunner = async (argv, options) => {
	try {
		const child = Bun.spawn([...argv], {
			env: options.env,
			stdin: options.interactive ? 'inherit' : 'ignore',
			stdout: 'pipe',
			stderr: 'pipe',
			// A prompt waits for a person; ten minutes is a person who walked away.
			timeout: 600_000,
		});
		const [stdout, stderr, code] = await Promise.all([
			new Response(child.stdout).text(),
			new Response(child.stderr).text(),
			child.exited,
		]);
		return { code, output: `${stdout}\n${stderr}` };
	} catch {
		// A missing binary is an outcome ("not trusted yet"), never an exception.
		return { code: 127, output: `${argv[0]} could not be started` };
	}
};

/** This machine's trust environment. */
export function machineTrustEnvironment(): TrustEnvironment {
	const source = liveProcessEnv();
	const env: Record<string, string> = {};
	for (const key of COMMAND_KEYS) if (source[key] !== undefined) env[key] = source[key] as string;
	const home = homedir();
	return {
		platform: process.platform,
		euid: process.geteuid?.() ?? null,
		home,
		env,
		run: spawnRunner,
		linuxStores: LINUX_ANCHOR_STORES,
		keychain: join(home, 'Library/Keychains/login.keychain-db'),
		firefoxRoots:
			process.platform === 'darwin'
				? [join(home, 'Library/Application Support/Firefox/Profiles')]
				: [
						join(home, '.mozilla/firefox'),
						join(home, 'snap/firefox/common/.mozilla/firefox'),
						join(home, '.var/app/org.mozilla.firefox/.mozilla/firefox'),
					],
	};
}

/** A tool on PATH, or in the system directories a sudo'd command finds it in. */
function findTool(name: string, tenv: TrustEnvironment): string | null {
	return Bun.which(name, { PATH: `${tenv.env.PATH ?? ''}:/usr/sbin:/sbin:/usr/bin:/bin` });
}

/** The authority's identity: its PEM and fingerprints. */
interface Authority {
	readonly file: string;
	readonly pem: string;
	readonly fingerprint256: string;
	readonly sha1: string;
	/** 16 hex digits of the SHA-256: what names its anchor file and NSS nickname. */
	readonly short: string;
}

function readAuthority(dir: string): Authority | null {
	const file = authorityFile(dir);
	try {
		const pem = readFileSync(file, 'utf8');
		const cert = new X509Certificate(pem);
		return {
			file,
			pem,
			fingerprint256: cert.fingerprint256,
			sha1: cert.fingerprint.replace(/:/g, ''),
			short: cert.fingerprint256.replace(/:/g, '').slice(0, 16).toLowerCase(),
		};
	} catch {
		return null;
	}
}

function recordPath(dir: string): string {
	return join(dir, TRUST_RECORD_NAME);
}

/** The record (empty when absent or unreadable — then there is nothing of ours to take back). */
export function readTrustRecord(dir: string): TrustRecordEntry[] {
	try {
		const parsed = JSON.parse(readFileSync(recordPath(dir), 'utf8')) as Partial<TrustRecord>;
		return parsed.schema === TRUST_RECORD_SCHEMA && Array.isArray(parsed.entries)
			? parsed.entries
			: [];
	} catch {
		return [];
	}
}

function writeTrustRecord(dir: string, entries: readonly TrustRecordEntry[]): void {
	const body: TrustRecord = { schema: TRUST_RECORD_SCHEMA, entries: [...entries] };
	writeFileSync(recordPath(dir), `${JSON.stringify(body, null, '\t')}\n`, { mode: 0o644 });
}

/** A terminal colour sequence (the generator colours its refusals red). */
const ANSI_COLOUR = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g');

/** The last lines of a command's output (a report quotes them; never a raw exception). */
function tail(output: string): string {
	return output
		.split('\n')
		.map((line) => line.replace(ANSI_COLOUR, '').trim())
		.filter((line) => line !== '')
		.slice(-2)
		.join(' | ');
}

/** The manual way, per platform (what "not trusted yet" tells the operator). */
export function manualTrustSteps(platform: NodeJS.Platform, caFile: string): string {
	if (platform === 'darwin') {
		return `trust it by hand: security add-trusted-cert -r trustRoot -k ~/Library/Keychains/login.keychain-db ${caFile} (or Keychain Access → login → import it → Always Trust)`;
	}
	if (platform === 'linux') {
		return `trust it by hand: sudo cp ${caFile} /usr/local/share/ca-certificates/dedalo-dev-ca.crt && sudo update-ca-certificates (Debian/Ubuntu), or into /etc/pki/ca-trust/source/anchors/ then sudo update-ca-trust (Fedora/RHEL)`;
	}
	return `trust it by hand: import ${caFile} into this system's trusted root authorities`;
}

/** The sentence when Firefox has profiles but certutil is missing. */
export function firefoxNote(caFile: string): string {
	return `Firefox keeps its own trust store and certutil (NSS tools) is not installed: in about:config set security.enterprise_roots.enabled to true (Firefox then trusts what this system trusts), or import ${caFile} under Settings → Privacy & Security → Certificates → View Certificates → Authorities`;
}

// ── the system store ─────────────────────────────────────────────────────────

/** Does this machine's verifier already accept the development certificate (localhost)? */
async function systemTrusts(dir: string, tenv: TrustEnvironment): Promise<boolean> {
	const leaf = join(dir, DEV_TLS_CERT_NAME);
	const issuing = join(dir, ISSUING_CA_NAME);
	if (tenv.platform === 'darwin') {
		const security = findTool('security', tenv);
		if (security === null) return false;
		const outcome = await tenv.run(
			[
				security,
				'verify-cert',
				'-q',
				'-L',
				'-p',
				'ssl',
				'-s',
				'localhost',
				'-c',
				leaf,
				'-c',
				issuing,
			],
			{ env: tenv.env, interactive: false },
		);
		return outcome.code === 0;
	}
	const openssl = findTool('openssl', tenv);
	if (openssl === null) return false;
	// The default store (SSL_CERT_FILE / SSL_CERT_DIR when set) — the one the update rebuilt.
	const outcome = await tenv.run(
		[openssl, 'verify', '-purpose', 'sslserver', '-untrusted', issuing, leaf],
		{ env: tenv.env, interactive: false },
	);
	return outcome.code === 0;
}

/** This machine's Linux anchor store, or null (none of the known families). */
export function linuxAnchorStore(tenv: TrustEnvironment): LinuxAnchorStore | null {
	for (const store of tenv.linuxStores) {
		const update = findTool(store.update[0] as string, tenv);
		if (existsSync(store.dir) && update !== null) {
			return { dir: store.dir, update: [update, ...store.update.slice(1)] };
		}
	}
	return null;
}

/** `argv` as root: itself when root already, else through sudo (null: no way to elevate). */
function elevated(argv: readonly string[], tenv: TrustEnvironment): string[] | null {
	if (tenv.euid === 0) return [...argv];
	const sudo = findTool('sudo', tenv);
	return sudo === null ? null : [sudo, '--', ...argv];
}

interface StoreOutcome {
	readonly trusted: boolean;
	readonly added: TrustRecordEntry | null;
	readonly line: string;
}

function entryOf(
	store: TrustStoreKind,
	target: string,
	authority: Authority,
	installId: string | null,
	extra: { nickname?: string; update?: readonly string[] } = {},
): TrustRecordEntry {
	return {
		store,
		target,
		nickname: extra.nickname ?? null,
		update: extra.update ? [...extra.update] : null,
		fingerprint256: authority.fingerprint256,
		sha1: authority.sha1,
		pem: authority.pem,
		install_id: installId,
		added_at: new Date().toISOString(),
	};
}

/** macOS: the login keychain, as the user (macOS asks the password itself). */
async function trustMac(
	authority: Authority,
	tenv: TrustEnvironment,
	installId: string | null,
): Promise<StoreOutcome> {
	const security = findTool('security', tenv);
	if (security === null) {
		return { trusted: false, added: null, line: 'macOS `security` tool not found' };
	}
	const heldBefore = await keychainHolds(security, authority, tenv);
	const outcome = await tenv.run(
		[security, 'add-trusted-cert', '-r', 'trustRoot', '-k', tenv.keychain, authority.file],
		{ env: tenv.env, interactive: true },
	);
	if (outcome.code !== 0) {
		const why = `the keychain refused or the dialog was cancelled (${tail(outcome.output) || `exit ${outcome.code}`})`;
		return heldBefore
			? { trusted: false, added: null, line: why }
			: takeBackImport(security, authority, tenv, installId, why);
	}
	return {
		trusted: true,
		added: entryOf('macos_keychain', tenv.keychain, authority, installId),
		line: `your login keychain (${tenv.keychain})`,
	};
}

/** Does the keychain hold the authority (by SHA-1), trusted or not? */
async function keychainHolds(
	security: string,
	authority: Authority,
	tenv: TrustEnvironment,
): Promise<boolean> {
	const listed = await tenv.run([security, 'find-certificate', '-a', '-Z', tenv.keychain], {
		env: tenv.env,
		interactive: false,
	});
	return listed.output.toUpperCase().includes(`SHA-1 HASH: ${authority.sha1.toUpperCase()}`);
}

/**
 * `add-trusted-cert` IMPORTS the certificate before it asks for the trust
 * setting's password, so a cancelled dialog (or a killed command) leaves it in
 * the keychain — measured 2026-10-16: four untracked "Dedalo local CA" items.
 * What this step put there it takes back out at once (no prompt: a certificate
 * without trust settings); when the keychain refuses even that, the item is
 * RECORDED, so `--abort` / `bun run tls:untrust` can still remove it.
 */
async function takeBackImport(
	security: string,
	authority: Authority,
	tenv: TrustEnvironment,
	installId: string | null,
	why: string,
): Promise<StoreOutcome> {
	if (!(await keychainHolds(security, authority, tenv))) {
		return { trusted: false, added: null, line: why };
	}
	const deleted = await tenv.run(
		[security, 'delete-certificate', '-Z', authority.sha1, tenv.keychain],
		{ env: tenv.env, interactive: true },
	);
	if (deleted.code === 0 && !(await keychainHolds(security, authority, tenv))) {
		return {
			trusted: false,
			added: null,
			line: `${why}; the certificate it had imported was taken back out`,
		};
	}
	return {
		trusted: false,
		added: entryOf('macos_keychain', tenv.keychain, authority, installId),
		line: `${why}; the certificate it had imported is still in ${tenv.keychain} (recorded: \`bun run tls:untrust\` removes it)`,
	};
}

/** Linux: the anchor directory + its update, through sudo for that one shell. */
async function trustLinux(
	authority: Authority,
	tenv: TrustEnvironment,
	installId: string | null,
): Promise<StoreOutcome> {
	const store = linuxAnchorStore(tenv);
	if (store === null) {
		return {
			trusted: false,
			added: null,
			line: 'no known trust-store layout on this Linux (update-ca-certificates / update-ca-trust not found)',
		};
	}
	const anchor = join(store.dir, `dedalo-dev-ca-${authority.short}.crt`);
	// One shell, one prompt: copy the authority in, then rebuild the store.
	const argv = elevated(
		[
			'sh',
			'-c',
			'install -m 0644 "$1" "$2" && shift 2 && "$@"',
			'sh',
			authority.file,
			anchor,
			...store.update,
		],
		tenv,
	);
	if (argv === null) {
		return { trusted: false, added: null, line: 'sudo is not installed and this is not root' };
	}
	const outcome = await tenv.run(argv, { env: tenv.env, interactive: true });
	if (outcome.code !== 0) {
		return {
			trusted: false,
			added: null,
			line: `the system store was not updated — sudo refused or was cancelled (${tail(outcome.output) || `exit ${outcome.code}`})`,
		};
	}
	return {
		trusted: true,
		added: entryOf('linux_anchors', anchor, authority, installId, { update: store.update }),
		line: `the system store (${anchor})`,
	};
}

// ── Firefox (NSS) ────────────────────────────────────────────────────────────

/** Every Firefox profile directory (one holding an NSS cert9.db). */
export function firefoxProfiles(tenv: TrustEnvironment): string[] {
	const profiles: string[] = [];
	for (const root of tenv.firefoxRoots) {
		if (!existsSync(root)) continue;
		for (const entry of readdirSync(root, { withFileTypes: true })) {
			const dir = join(root, entry.name);
			if (entry.isDirectory() && existsSync(join(dir, 'cert9.db'))) profiles.push(dir);
		}
	}
	return profiles.sort();
}

function nssNickname(authority: Authority): string {
	return `Dedalo development CA ${authority.short}`;
}

interface NssOutcome {
	readonly added: TrustRecordEntry[];
	readonly lines: string[];
	readonly warnings: string[];
}

/** Firefox: certutil into each profile that does not hold it yet; the note without certutil. */
async function trustFirefox(
	authority: Authority,
	tenv: TrustEnvironment,
	installId: string | null,
): Promise<NssOutcome> {
	const profiles = firefoxProfiles(tenv);
	if (profiles.length === 0) return { added: [], lines: [], warnings: [] };
	const certutil = findTool('certutil', tenv);
	if (certutil === null) return { added: [], lines: [], warnings: [firefoxNote(authority.file)] };
	const outcome: NssOutcome = { added: [], lines: [], warnings: [] };
	for (const profile of profiles) {
		await trustFirefoxProfile({ certutil, profile, authority, tenv, installId }, outcome);
	}
	return outcome;
}

/** One Firefox profile: already there, added (recorded), or a warning with the manual way. */
async function trustFirefoxProfile(
	job: {
		certutil: string;
		profile: string;
		authority: Authority;
		tenv: TrustEnvironment;
		installId: string | null;
	},
	outcome: NssOutcome,
): Promise<void> {
	const { certutil, profile, authority, tenv, installId } = job;
	const database = `sql:${profile}`;
	const nickname = nssNickname(authority);
	const quiet = { env: tenv.env, interactive: false };
	if ((await tenv.run([certutil, '-L', '-d', database, '-n', nickname], quiet)).code === 0) {
		outcome.lines.push(`Firefox profile ${profile} (already)`);
		return;
	}
	const added = await tenv.run(
		[certutil, '-A', '-d', database, '-n', nickname, '-t', 'C,,', '-i', authority.file],
		quiet,
	);
	if (added.code === 0) {
		outcome.added.push(entryOf('firefox_nss', profile, authority, installId, { nickname }));
		outcome.lines.push(`Firefox profile ${profile}`);
		return;
	}
	outcome.warnings.push(
		`Firefox profile ${profile}: certutil could not add the authority (${tail(added.output) || `exit ${added.code}`}) — import ${authority.file} under Settings → Privacy & Security → Certificates → View Certificates → Authorities`,
	);
}

// ── removal ──────────────────────────────────────────────────────────────────

/** Take one recorded entry back out of its store; null = done, else why not. */
function removeEntry(entry: TrustRecordEntry, tenv: TrustEnvironment): Promise<string | null> {
	if (entry.store === 'firefox_nss') return removeNssEntry(entry, tenv);
	if (entry.store === 'linux_anchors') return removeLinuxEntry(entry, tenv);
	return removeMacEntry(entry, tenv);
}

/** NSS: certutil -D (a profile that is gone has nothing left to remove). */
async function removeNssEntry(
	entry: TrustRecordEntry,
	tenv: TrustEnvironment,
): Promise<string | null> {
	const certutil = findTool('certutil', tenv);
	if (certutil === null) return 'certutil is not installed';
	const outcome = await tenv.run(
		[certutil, '-D', '-d', `sql:${entry.target}`, '-n', entry.nickname ?? ''],
		{ env: tenv.env, interactive: false },
	);
	return outcome.code === 0 || !existsSync(entry.target) ? null : tail(outcome.output);
}

/** Linux: remove the anchor and rebuild the store, through ONE sudo (none as root). */
async function removeLinuxEntry(
	entry: TrustRecordEntry,
	tenv: TrustEnvironment,
): Promise<string | null> {
	const update = entry.update ?? ['true'];
	const argv = elevated(
		['sh', '-c', 'rm -f "$1" && shift && "$@"', 'sh', entry.target, ...update],
		tenv,
	);
	if (argv === null) return 'sudo is not installed and this is not root';
	const outcome = await tenv.run(argv, { env: tenv.env, interactive: true });
	return outcome.code === 0 ? null : tail(outcome.output) || `exit ${outcome.code}`;
}

/** macOS: drop the trust setting, then the certificate from the keychain. */
async function removeMacEntry(
	entry: TrustRecordEntry,
	tenv: TrustEnvironment,
): Promise<string | null> {
	const security = findTool('security', tenv);
	if (security === null) return 'macOS `security` tool not found';
	// The trust setting needs the certificate itself; its file may be archived or gone.
	const scratch = mkdtempSync(join(tmpdir(), 'dedalo-untrust-'));
	try {
		const pem = join(scratch, 'ca.pem');
		writeFileSync(pem, entry.pem);
		const prompt = { env: tenv.env, interactive: true };
		const untrusted = await tenv.run([security, 'remove-trusted-cert', pem], prompt);
		const deleted = await tenv.run(
			[security, 'delete-certificate', '-Z', entry.sha1, entry.target],
			prompt,
		);
		if (untrusted.code === 0 || deleted.code === 0) return null;
		return tail(`${untrusted.output}\n${deleted.output}`) || 'the keychain refused';
	} finally {
		rmSync(scratch, { recursive: true, force: true });
	}
}

export interface UntrustResult {
	readonly removed: string[];
	readonly failed: string[];
}

/**
 * Remove the recorded entries `which` selects from their stores; the record
 * keeps only what could not be removed (so a later attempt still knows it).
 */
async function removeEntries(
	dir: string,
	which: (entry: TrustRecordEntry) => boolean,
	tenv: TrustEnvironment,
): Promise<UntrustResult> {
	const entries = readTrustRecord(dir);
	const kept: TrustRecordEntry[] = [];
	const removed: string[] = [];
	const failed: string[] = [];
	for (const entry of entries) {
		if (!which(entry)) {
			kept.push(entry);
			continue;
		}
		const problem = await removeEntry(entry, tenv);
		if (problem === null) removed.push(`${entry.store} ${entry.target}`);
		else {
			kept.push(entry);
			failed.push(`${entry.store} ${entry.target}: ${problem}`);
		}
	}
	if (entries.length > 0 && existsSync(dir)) writeTrustRecord(dir, kept);
	return { removed, failed };
}

/**
 * Take the development authority back out of every store this installer put
 * it in: all entries (`bun run tls:untrust`), or one install's (`--abort`).
 */
export function untrustDevAuthority(
	dir: string,
	installId: string | null | undefined,
	tenv: TrustEnvironment = machineTrustEnvironment(),
): Promise<UntrustResult> {
	return removeEntries(
		dir,
		(entry) => installId === undefined || entry.install_id === installId,
		tenv,
	);
}

// ── the test seam ────────────────────────────────────────────────────────────

/**
 * DEDALO_TEST_TRUST_STORE_OFF=true (a test run — test/preload/session_db.ts):
 * the MACHINE's stores are off limits. Read from the process environment only
 * (a stray line in the .env can never switch trust off on a real install). An
 * injected environment (the gate's scratch stores) is not affected.
 */
export function machineTrustStoresOff(): boolean {
	return processEnvValue('DEDALO_TEST_TRUST_STORE_OFF') === 'true';
}

const SEAM_REASON =
	"DEDALO_TEST_TRUST_STORE_OFF is set (a test run): this machine's trust stores are never changed";

/**
 * The scratch stores a gate hands the step's doors, so the REAL door (the step
 * run → its install id in the record → the undo scoped to that install) is
 * driven end to end against a scratch store. Honoured ONLY under the seam: a
 * real install can never be pointed away from its machine's stores.
 */
let scratchTrustEnvironment: TrustEnvironment | null = null;

/** Test-only: drive the doors against `tenv` (null: back to the seam's no-op). */
export function useScratchTrustEnvironment(tenv: TrustEnvironment | null): void {
	scratchTrustEnvironment = tenv;
}

/** Under the seam: the gate's scratch stores, or none (null: change nothing). */
function seamEnvironment(): TrustEnvironment | null {
	return machineTrustStoresOff() ? scratchTrustEnvironment : null;
}

/** The step's door: the machine's stores, unless the test seam keeps them out of reach. */
export async function trustDevAuthorityOnMachine(
	dir: string,
	installId: string | null,
): Promise<DevTrustResult> {
	if (!machineTrustStoresOff()) return trustDevAuthority(dir, installId);
	const scratch = seamEnvironment();
	if (scratch !== null) return trustDevAuthority(dir, installId, scratch);
	return {
		ok: true,
		msg: `not trusted yet: ${SEAM_REASON}`,
		trusted: false,
		stores: [],
		warnings: [`the development authority is not trusted yet: ${SEAM_REASON}`],
	};
}

/**
 * Does this machine's verifier accept the development certificate in `dir`
 * NOW? — the final screen's trust line (dev_serve.ts), measured, never read
 * back from what the trust step reported earlier (a resume, a by-hand trust or
 * untrust since). null = not measured: the test seam keeps the machine's
 * stores out of reach and no scratch store was given.
 */
export async function devAuthorityTrustedOnMachine(dir: string): Promise<boolean | null> {
	if (!machineTrustStoresOff()) return systemTrusts(dir, machineTrustEnvironment());
	const scratch = seamEnvironment();
	return scratch === null ? null : systemTrusts(dir, scratch);
}

/** The undo's / `tls:untrust`'s door, under the same seam. */
export async function untrustDevAuthorityOnMachine(
	dir: string,
	installId: string | null | undefined,
): Promise<UntrustResult> {
	if (!machineTrustStoresOff()) return untrustDevAuthority(dir, installId);
	const scratch = seamEnvironment();
	return scratch === null
		? { removed: [], failed: [] }
		: untrustDevAuthority(dir, installId, scratch);
}

// ── the step ─────────────────────────────────────────────────────────────────

export interface DevTrustResult {
	ok: true;
	msg: string;
	/** Does this machine's verifier accept the development certificate now? */
	trusted: boolean;
	/** The stores the authority is in (added now or already). */
	stores: string[];
	warnings: string[];
}

/** The system store half: already trusted, newly added, or not trusted yet (+ why). */
async function systemStore(
	authority: Authority,
	dir: string,
	tenv: TrustEnvironment,
	installId: string | null,
): Promise<StoreOutcome> {
	if (await systemTrusts(dir, tenv)) {
		return { trusted: true, added: null, line: 'this system (already trusted)' };
	}
	const add = SYSTEM_TRUST[tenv.platform];
	if (add === undefined) {
		return {
			trusted: false,
			added: null,
			line: `the installer trusts the authority on macOS and Linux, not ${tenv.platform}`,
		};
	}
	const outcome = await add(authority, tenv, installId);
	// The command's exit is not the outcome: the verifier must now accept the certificate.
	if (!outcome.trusted || (await systemTrusts(dir, tenv))) return outcome;
	return {
		trusted: false,
		added: outcome.added,
		line: `${outcome.line} took the authority, but this system's verifier still refuses the certificate`,
	};
}

/** The platforms whose system store this step writes, and how. */
const SYSTEM_TRUST: Readonly<Partial<Record<NodeJS.Platform, typeof trustMac>>> = Object.freeze({
	darwin: trustMac,
	linux: trustLinux,
});

/**
 * Trust the development authority in `dir` on this machine (see the header).
 * Never throws for the stores' answers: a refusal is "not trusted yet".
 */
export async function trustDevAuthority(
	dir: string,
	installId: string | null,
	tenv: TrustEnvironment = machineTrustEnvironment(),
): Promise<DevTrustResult> {
	const authority = readAuthority(dir);
	if (authority === null) {
		return {
			ok: true,
			msg: `not trusted yet: no development authority in ${dir}`,
			trusted: false,
			stores: [],
			warnings: [`no development authority in ${authorityFile(dir)} to trust`],
		};
	}
	const stale = await removeStaleEntries(dir, authority, tenv);
	const system = await systemStore(authority, dir, tenv, installId);
	const firefox = await trustFirefox(authority, tenv, installId);
	const added = [system.added, ...firefox.added].filter(
		(entry): entry is TrustRecordEntry => entry !== null,
	);
	if (added.length > 0) writeTrustRecord(dir, [...readTrustRecord(dir), ...added]);
	return trustResult(authority, tenv.platform, system, firefox, stale);
}

/** A replaced authority (rotation) leaves the stores first — its key is gone from here. */
async function removeStaleEntries(
	dir: string,
	authority: Authority,
	tenv: TrustEnvironment,
): Promise<string[]> {
	const stale = await removeEntries(
		dir,
		(entry) => entry.fingerprint256 !== authority.fingerprint256,
		tenv,
	);
	return stale.failed.map(
		(line) => `the previous development authority is still trusted in ${line} — remove it by hand`,
	);
}

/** The step's report: where the authority is trusted, or "not trusted yet" with the manual way. */
function trustResult(
	authority: Authority,
	platform: NodeJS.Platform,
	system: StoreOutcome,
	firefox: NssOutcome,
	staleWarnings: readonly string[],
): DevTrustResult {
	const stores = [...(system.trusted ? [system.line] : []), ...firefox.lines];
	const identity = `${authority.file} (SHA-256 ${authority.fingerprint256})`;
	const notYet = system.trusted
		? []
		: [
				`the development authority is not trusted yet: ${system.line} — ${manualTrustSteps(platform, authority.file)}. \`bun run dev\` serves either way; until then the browser warns`,
			];
	const where = stores.length > 0 ? ` (in: ${stores.join('; ')})` : '';
	return {
		ok: true,
		msg: system.trusted
			? `authority ${identity} trusted in: ${stores.join('; ')}`
			: `not trusted yet: authority ${identity}${where}`,
		trusted: system.trusted,
		stores,
		warnings: [...notYet, ...staleWarnings, ...firefox.warnings],
	};
}
