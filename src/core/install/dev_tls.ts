/**
 * THE DEVELOPER ROUTE'S CERTIFICATE (TODO-055; design DEV_ROUTE_SERVE §1.2,
 * owner answer D1: `local_ca` is the developer route's default).
 *
 * ONE GENERATOR. The material is issued by deploy/dedalo-tls-rotate.sh — the
 * SAME script the docker and production routes run (build_context_secret_tripwire
 * H: no second generator anywhere; this module never calls openssl to make a
 * certificate). The developer layout is only its arguments:
 *
 *   --mode local-ca --dir <private>/tls --reload none --quiet
 *   --host localhost --host 127.0.0.1 [--host <LAN address> …]
 *
 * `--reload none`: nothing to reload — `bun run dev` reads the pair at boot.
 * `<private>/tls` (paths.ts devTlsDir): outside the checkout, so never in a
 * release zip or an image; the directory 0700, the keys 0600 (the generator's).
 * The authority is name-constrained to exactly that list and its root key is
 * deleted at issue (the generator's header) — a stolen issuing key on a
 * developer's laptop certifies nothing but that laptop's own names.
 *
 * THE NAMES and the IPv6 resolution: dev_certificate.ts (the plan half).
 *
 * A RE-RUN. The authority is skipped-and-kept when it is already there for the
 * same names: the step then RENEWS (`--mode renew`: a new leaf from the same
 * authority only when it expires within 30 days — "a re-run of the installer
 * also renews", §1.2). An authority made for OTHER names is refused, before
 * anything is written (dev_listener_check.ts devListenerRefusals → this
 * module's devAuthorityRefusal — host/tls_authority.ts, the ONE rule of every
 * route), naming the rotation command: a constrained authority cannot certify
 * a new name, and rotating one this machine trusts is the operator's decision.
 *
 * AS THE DEVELOPER, NEVER ROOT. The route runs as the checkout's owner, and so
 * does the generator: a root-owned `<private>/tls` would be unreadable to
 * `bun run dev`. Root in a tree root does not own is refused (dev_dependencies.ts
 * ownerRefusal — one sentence for both steps). Only the trust-store step
 * elevates, and only itself (dev_trust.ts).
 *
 * Gate: test/unit/install_dev_tls_native.test.ts (gate 4 of the design: the
 * real generator under every openssl on the machine — macOS LibreSSL, OpenSSL).
 */

import { createPublicKey, X509Certificate } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { isIP } from 'node:net';
import { join } from 'node:path';
import { liveProcessEnv, parseEnvFile, projectRoot } from '../../config/env.ts';
import { type DevCertificatePlan, devCertificateNames } from './dev_certificate.ts';
import { ownerRefusal } from './dev_dependencies.ts';
import { DEV_HOST_DEFAULT, DEV_TLS_CERT_NAME, DEV_TLS_KEY_NAME } from './dev_listener.ts';
import { authorityConflict, authorityFile, authorityNamesFile } from './host/tls_authority.ts';
import { devTlsDir } from './paths.ts';
import { refuseInstall } from './refuse.ts';
import { installEnvPath } from './run_files.ts';

/** The ONE local-CA generator (deploy/dedalo-tls-rotate.sh). */
export const TLS_GENERATOR: string = join(projectRoot, 'deploy/dedalo-tls-rotate.sh');
/** The issuing authority the generator keeps beside the leaf (it signs renewals). */
export const ISSUING_CA_NAME = 'dedalo-issuing-ca.pem';
/** The command that re-issues the leaf from the same authority (package.json). */
export const DEV_TLS_RENEW_COMMAND = 'bun run tls:renew';

/** The rotation command for `names` in `dir` (what a refusal tells the operator to run). */
export function devRotateCommand(dir: string, names: readonly string[]): string {
	return `bash ${TLS_GENERATOR} --mode local-ca --dir ${dir} --reload none ${names.map((name) => `--host ${name}`).join(' ')}`;
}

/** The plain-file reader the shared authority rule takes (host/tls_authority.ts). */
const LOCAL_FS = {
	exists: (path: string) => existsSync(path),
	readText: (path: string) => {
		try {
			return readFileSync(path, 'utf8');
		} catch {
			return null;
		}
	},
};

/**
 * The refusal of an authority already in `dir` that cannot serve `names`, or
 * null (none there, or made for exactly these names). The ONE rule of every
 * route (host/tls_authority.ts), with the native rule for an authority with no
 * names list: an unconstrained pre-2026-10-16 key is never adopted silently.
 */
export function devAuthorityRefusal(dir: string, names: readonly string[]): string | null {
	const conflict = authorityConflict(
		LOCAL_FS,
		{ dir, route: 'native', rotate: devRotateCommand(dir, names) },
		names,
	);
	return conflict === null
		? null
		: `${conflict}. After a rotation the installer trusts the new authority on this machine and removes the old one it trusted`;
}

// ── the material, as it is on disk ───────────────────────────────────────────

/** The PEM blocks of a file, in order ([] when unreadable). */
function pemBlocks(path: string): string[] {
	const text = LOCAL_FS.readText(path) ?? '';
	return text.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g) ?? [];
}

/** A certificate, or null when it does not parse. */
function certificate(pem: string | undefined): X509Certificate | null {
	if (pem === undefined) return null;
	try {
		return new X509Certificate(pem);
	} catch {
		return null;
	}
}

/** The authority's SHA-256 fingerprint (`AB:CD:…`), or null when there is none. */
export function devCaFingerprint(dir: string): string | null {
	return certificate(pemBlocks(authorityFile(dir))[0])?.fingerprint256 ?? null;
}

/** The names the authority records (dedalo-local-ca.names), lower-cased. */
function recordedNames(dir: string): string[] {
	return (LOCAL_FS.readText(authorityNamesFile(dir)) ?? '')
		.split('\n')
		.map((line) => line.trim().toLowerCase())
		.filter((line) => line !== '');
}

/** Does the leaf's public key belong to the private key on disk? */
function keyMatches(leaf: X509Certificate, keyFile: string): boolean {
	try {
		const fromKey = createPublicKey(readFileSync(keyFile)).export({ type: 'spki', format: 'der' });
		const fromLeaf = leaf.publicKey.export({ type: 'spki', format: 'der' });
		return Buffer.compare(fromKey, fromLeaf) === 0;
	} catch {
		return false;
	}
}

/** Does the leaf answer `name` (a DNS name or an IPv4 address)? */
function leafNames(leaf: X509Certificate, name: string): boolean {
	return isIP(name) === 0 ? leaf.checkHost(name) !== undefined : leaf.checkIP(name) !== undefined;
}

/**
 * The developer certificate's problems as found on disk ([] = usable): the
 * authority, its names list, a leaf that chains to it (leaf ← issuing ←
 * authority, each signature checked), is valid now, names every name and
 * matches its key; the key and the issuing key private (0600).
 */
export function devCertificateProblems(
	dir: string,
	names: readonly string[],
	now: Date = new Date(),
): string[] {
	const root = certificate(pemBlocks(authorityFile(dir))[0]);
	if (root === null) return [`no local authority in ${authorityFile(dir)}`];
	const listed = namesListProblem(dir, names);
	const [leafPem, issuingPem] = pemBlocks(join(dir, DEV_TLS_CERT_NAME));
	const leaf = certificate(leafPem);
	const issuing = certificate(issuingPem);
	if (leaf === null || issuing === null) {
		return [
			...listed,
			`${join(dir, DEV_TLS_CERT_NAME)} does not hold a certificate and its issuing authority`,
		];
	}
	return [
		...listed,
		...leafProblems({ dir, names, now, root, issuing, leaf }),
		...privateKeyProblems(dir),
	];
}

/** The authority's names list against the names wanted (as sets). */
function namesListProblem(dir: string, names: readonly string[]): string[] {
	const recorded = recordedNames(dir);
	const same = recorded.length === names.length && names.every((name) => recorded.includes(name));
	return same
		? []
		: [`the authority is for ${recorded.join(', ') || '(no names list)'}, not ${names.join(', ')}`];
}

/** The leaf: chained (leaf ← issuing ← root), valid now, naming every name, matching its key. */
function leafProblems(found: {
	dir: string;
	names: readonly string[];
	now: Date;
	root: X509Certificate;
	issuing: X509Certificate;
	leaf: X509Certificate;
}): string[] {
	const { dir, names, now, root, issuing, leaf } = found;
	const unnamed = names.filter((name) => !leafNames(leaf, name));
	const checks: [boolean, string][] = [
		[
			issuing.verify(root.publicKey) && leaf.verify(issuing.publicKey),
			`${join(dir, DEV_TLS_CERT_NAME)} does not chain to ${authorityFile(dir)}`,
		],
		[
			new Date(leaf.validTo).getTime() > now.getTime(),
			`the certificate expired on ${leaf.validTo} — ${DEV_TLS_RENEW_COMMAND}`,
		],
		[unnamed.length === 0, `the certificate does not name ${unnamed.join(', ')}`],
		[
			keyMatches(leaf, join(dir, DEV_TLS_KEY_NAME)),
			`${join(dir, DEV_TLS_KEY_NAME)} is not the certificate's key`,
		],
	];
	return checks.filter(([ok]) => !ok).map(([, problem]) => problem);
}

/** The site key and the issuing key: 0600 (never readable by group or others). */
function privateKeyProblems(dir: string): string[] {
	return [DEV_TLS_KEY_NAME, 'dedalo-issuing-ca.key']
		.map((name) => join(dir, name))
		.filter((path) => existsSync(path) && (statSync(path).mode & 0o077) !== 0)
		.map((path) => `${path} is readable by others (must be 0600)`);
}

// ── running the generator ────────────────────────────────────────────────────

/**
 * The generator's environment: what openssl and bash need, NOTHING else — the
 * installer's process carries the install secrets (DEDALO_INSTALL_*, the
 * seeded database password), and a certificate script is no place for them.
 */
const GENERATOR_KEYS: readonly string[] = [
	'PATH',
	'HOME',
	'USER',
	'LOGNAME',
	'TMPDIR',
	'LANG',
	'LC_ALL',
];

/** The generator's environment, from `source` (default: this process's). */
export function generatorEnv(
	source: Readonly<Record<string, string>> = liveProcessEnv(),
): Record<string, string> {
	const env: Record<string, string> = {};
	for (const key of GENERATOR_KEYS) if (source[key] !== undefined) env[key] = source[key] as string;
	return env;
}

/** The generator's argv for a first issue of `names` into `dir`. */
export function devIssueArgv(dir: string, names: readonly string[]): string[] {
	return [
		'bash',
		TLS_GENERATOR,
		'--mode',
		'local-ca',
		'--dir',
		dir,
		'--reload',
		'none',
		'--quiet',
		...names.flatMap((name) => ['--host', name]),
	];
}

/** The generator's argv for a renewal in `dir` (the authority's own names list). */
export function devRenewArgv(dir: string, force: boolean): string[] {
	return [
		'bash',
		TLS_GENERATOR,
		'--mode',
		'renew',
		'--dir',
		dir,
		'--reload',
		'none',
		'--quiet',
		...(force ? ['--force'] : []),
	];
}

/** A terminal colour sequence (the generator colours its refusals red). */
const ANSI_COLOUR = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g');

/** The last lines of the generator's output (what a refusal quotes; never a raw exception). */
function tail(text: string): string {
	return text
		.split('\n')
		.map((line) => line.replace(ANSI_COLOUR, '').trim())
		.filter((line) => line !== '')
		.slice(-3)
		.join(' | ');
}

export interface DevTlsRunOptions {
	/** The effective uid (default: this process's; null = no uids on this platform). */
	readonly euid?: number | null;
	/** The checkout whose owner the step runs as (default: this engine's tree). */
	readonly tree?: string;
	/** The generator's environment (default: generatorEnv()). */
	readonly env?: Record<string, string>;
}

/** Run the generator; refuse with its own last lines when it fails. */
function runGenerator(argv: readonly string[], env: Record<string, string>, what: string): void {
	if (Bun.which('openssl', { PATH: env.PATH ?? '' }) === null) {
		refuseInstall(
			'install.step_failed',
			`the development certificate needs openssl (the local CA generator runs it) — install it (macOS ships /usr/bin/openssl; Debian/Ubuntu: apt install openssl), or choose tls_mode none / files`,
		);
	}
	const run = Bun.spawnSync([...argv], { env, stdin: 'ignore', stdout: 'pipe', stderr: 'pipe' });
	if (run.exitCode !== 0) {
		refuseInstall(
			'install.step_failed',
			`${what} failed (deploy/dedalo-tls-rotate.sh exited ${run.exitCode}): ${tail(`${run.stdout.toString()}\n${run.stderr.toString()}`) || '(no output)'}`,
		);
	}
}

/** Root writing in a tree it does not own: refused (the developer's files stay the developer's). */
function refuseForeignOwner(options: DevTlsRunOptions): void {
	const euid = options.euid === undefined ? (process.geteuid?.() ?? null) : options.euid;
	const refusal = ownerRefusal(euid, statSync(options.tree ?? projectRoot).uid);
	if (refusal !== null) refuseInstall('install.state_conflict', refusal);
}

/** The directory, private (0700) — created when missing (the developer owns it). */
function ensurePrivateDir(dir: string): void {
	mkdirSync(dir, { recursive: true, mode: 0o700 });
	chmodSync(dir, 0o700);
}

/** Refuse when the material on disk is not usable for `names` (devCertificateProblems). */
function refuseUnusable(dir: string, names: readonly string[], what: string): void {
	const problems = devCertificateProblems(dir, names);
	if (problems.length > 0) refuseInstall('install.step_failed', `${what}: ${problems.join('; ')}`);
}

/** The first issue (no authority yet), or a renewal from the one there; answers what it did. */
function issueOrRenew(
	dir: string,
	names: readonly string[],
	env: Record<string, string>,
): DevCertificateResult['action'] {
	const hadAuthority = existsSync(authorityFile(dir));
	const leafBefore = leafFingerprint(dir);
	ensurePrivateDir(dir);
	if (!hadAuthority) {
		runGenerator(devIssueArgv(dir, names), env, 'issuing the development certificate');
		return 'issued';
	}
	runGenerator(devRenewArgv(dir, false), env, 'renewing the development certificate');
	return leafFingerprint(dir) === leafBefore ? 'current' : 'renewed';
}

export interface DevCertificateResult {
	ok: true;
	msg: string;
	/** What the run did: a new authority, a renewed leaf, or nothing (current). */
	action: 'issued' | 'renewed' | 'current';
	caFile: string;
	fingerprint: string;
	names: string[];
}

/** The leaf's SHA-256 fingerprint, or null (no leaf yet). */
function leafFingerprint(dir: string): string | null {
	return certificate(pemBlocks(join(dir, DEV_TLS_CERT_NAME))[0])?.fingerprint256 ?? null;
}

/**
 * Issue the developer certificate (no authority yet), or renew its leaf from
 * the authority already there for the same names; refuse an authority made for
 * other names (see the header). Then hold the outcome to devCertificateProblems.
 */
export function ensureDevCertificate(
	target: Pick<DevCertificatePlan, 'dir' | 'names'>,
	options: DevTlsRunOptions = {},
): DevCertificateResult {
	const { dir, names } = target;
	const refusal = devAuthorityRefusal(dir, names);
	if (refusal !== null) refuseInstall('install.state_conflict', refusal);
	refuseForeignOwner(options);
	const action = issueOrRenew(dir, names, options.env ?? generatorEnv());
	refuseUnusable(dir, names, `the development certificate in ${dir} is not usable`);
	const fingerprint = devCaFingerprint(dir) as string;
	const done = {
		issued: 'a new local authority and certificate',
		renewed: 'certificate renewed from the same authority',
		current: 'certificate current (valid for more than 30 days)',
	}[action];
	return {
		ok: true,
		msg: `${done} for ${names.join(', ')} — authority ${authorityFile(dir)} (SHA-256 ${fingerprint})`,
		action,
		caFile: authorityFile(dir),
		fingerprint,
		names: [...names],
	};
}

/**
 * `bun run tls:renew`: a new leaf from the SAME authority (the browsers that
 * trust it need nothing). `force` re-issues now; otherwise only within the
 * generator's 30-day window.
 */
export function renewDevCertificate(
	dir: string,
	force: boolean,
	options: DevTlsRunOptions = {},
): DevCertificateResult {
	if (!existsSync(authorityFile(dir))) {
		refuseInstall(
			'install.state_conflict',
			`no development authority in ${dir} — the developer route's installer issues it (tls_mode local_ca)`,
		);
	}
	refuseForeignOwner(options);
	const names = recordedNames(dir);
	const before = leafFingerprint(dir);
	runGenerator(
		devRenewArgv(dir, force),
		options.env ?? generatorEnv(),
		'renewing the development certificate',
	);
	refuseUnusable(dir, names, 'the renewed certificate is not usable');
	const renewed = leafFingerprint(dir) !== before;
	const fingerprint = devCaFingerprint(dir) as string;
	return {
		ok: true,
		msg: renewed
			? `certificate renewed for ${names.join(', ')} from the same authority (SHA-256 ${fingerprint}) — restart \`bun run dev\` to serve it`
			: `certificate valid for more than 30 days — nothing renewed (--force re-issues now)`,
		action: renewed ? 'renewed' : 'current',
		caFile: authorityFile(dir),
		fingerprint,
		names,
	};
}

/**
 * The certificate a STEP issues or verifies, from the saved answers: the
 * address the listener binds is the answer, or — unanswered, the PRESERVE rule
 * — the .env's own SERVER_TCP_HOST (before persist_config that is the prior
 * value the plan keeps, after it the same line carried verbatim), else the
 * route default. The SAME names function as the plan (dev_certificate.ts).
 */
export function devStepTarget(
	answers: Readonly<Record<string, unknown>>,
	dir: string = devTlsDir(),
	envPath: string = installEnvPath(),
): Pick<DevCertificatePlan, 'dir' | 'names'> {
	const answered = typeof answers.dev_host === 'string' ? answers.dev_host.trim() : '';
	const host = answered || keptHost(envPath) || DEV_HOST_DEFAULT;
	return { dir, names: devCertificateNames(host).names };
}

/** The .env's own SERVER_TCP_HOST ('' when there is no .env or no value). */
function keptHost(envPath: string): string {
	if (!existsSync(envPath)) return '';
	return parseEnvFile(readFileSync(envPath, 'utf8')).SERVER_TCP_HOST?.trim() ?? '';
}
