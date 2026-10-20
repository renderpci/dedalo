/**
 * THE DEVELOPER ROUTE'S CERTIFICATE AND THIS MACHINE'S TRUST IN IT (TODO-055;
 * design DEV_ROUTE_SERVE §1.2 + gate 4; owner answers D1 local_ca default, D2
 * the installer trusts it — the trust step alone elevates).
 *
 * Measured as OUTCOMES:
 *  A. THE PLAN: a developer local_ca plan carries the two steps (certificate,
 *     then trust — before the first .env write) and names exactly localhost +
 *     127.0.0.1, plus the LAN address it binds, or this machine's IPv4 network
 *     addresses under a wildcard; IPv6 is resolved, not dropped silently: a
 *     specific IPv6 bind is REFUSED (the generator cannot certify it and the
 *     URL types it), `::` NOTES that only IPv4 is certified, `::1` needs
 *     nothing (opened as localhost). `none` / `files` and every other route
 *     plan neither step. The Review states the names and the elevation.
 *  B. GATE 4 — THE ONE GENERATOR ON THE DEVELOPER LAYOUT, under EVERY openssl
 *     on the machine (on macOS: the system LibreSSL with /bin/bash 3.2 AND
 *     Homebrew's OpenSSL; on Linux CI: OpenSSL): the issue lands in a 0700
 *     dir, keys 0600, no root key; a REAL Bun.serve TLS handshake verified by
 *     REAL curl --cacert for localhost and 127.0.0.1; the authority REFUSES an
 *     outside name (a rogue leaf signed with the developer's own issuing key
 *     fails `openssl verify`, the install's own name passes); a re-run is
 *     `current` (same authority, same leaf); `bun run tls:renew --force` keeps
 *     the authority and replaces the leaf; an authority made for other names
 *     is REFUSED before anything changes, by the step and by the preflight;
 *     root in a developer's tree is refused with nothing created.
 *  C. THE STEPS AS THE EXECUTOR RUNS THEM (the real step table, a scratch
 *     private dir): run → verify ok → undo removes only a directory THIS
 *     install created.
 *  D. THE TRUST STORE. Linux: the REAL shell command the step runs (install
 *     + the update command, through a stub `sudo` that only logs and execs —
 *     ONE elevation), judged by REAL `openssl verify` over the rebuilt bundle
 *     (SSL_CERT_FILE); a re-run asks nothing; a cancelled sudo is "not trusted
 *     yet" with the manual steps and no failure; root needs no sudo; a rotated
 *     authority's old anchor is removed first; --abort's undo removes only its
 *     own install's entries; `tls:untrust` removes all. Firefox: a REAL NSS
 *     database through certutil, added and removed (when certutil exists),
 *     else the enterprise_roots note. macOS: the login keychain cannot be
 *     driven by a gate (it is the developer's own, and the dialog needs a
 *     person) — the argv, the cancel path and the removal pair are asserted
 *     through the injected runner, and the add is held to its OUTCOME
 *     (verify-cert must accept afterwards, or it is not reported trusted).
 *
 * Isolation: every path is a scratch directory; no real trust store, keychain
 * or sudo is touched.
 */

import { afterAll, describe, expect, test } from 'bun:test';
import { X509Certificate } from 'node:crypto';
import {
	chmodSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	statSync,
	symlinkSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { runDevTls } from '../../scripts/dev_tls.ts';
import {
	DEV_CA_NAME,
	devCertificateNames,
	machineIpv4Addresses,
} from '../../src/core/install/dev_certificate.ts';
import { DEV_TLS_CERT_NAME } from '../../src/core/install/dev_listener.ts';
import { devListenerRefusals } from '../../src/core/install/dev_listener_check.ts';
import {
	devAuthorityRefusal,
	devCaFingerprint,
	devCertificateProblems,
	devStepTarget,
	ensureDevCertificate,
	ISSUING_CA_NAME,
} from '../../src/core/install/dev_tls.ts';
import {
	type CommandRunner,
	machineTrustStoresOff,
	readTrustRecord,
	type TrustEnvironment,
	trustDevAuthority,
	untrustDevAuthority,
	useScratchTrustEnvironment,
} from '../../src/core/install/dev_trust.ts';
import { buildInstallPlan, type InstallPlan } from '../../src/core/install/install_plan.ts';
import { reviewLines } from '../../src/core/install/screen_model.ts';
import { INSTALL_STEPS } from '../../src/core/install/steps.ts';
import { freeTcpPort } from '../helpers/free_tcp_port.ts';
import { BASE_RECORD } from '../helpers/install_answer_cases.ts';
import { withPrivateDir } from '../helpers/install_fake_executor.ts';
import { modelInput } from '../helpers/install_plain_script.ts';

const scratch = mkdtempSync(join(tmpdir(), 'zzdtls_'));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

const DEV = { route: 'developer', ...BASE_RECORD } as const;
const PLAN_DIR = '/zz/private/tls';
const LAN = () => ['10.0.0.5', '192.168.1.20'];
const CURL = Bun.which('curl') ?? '/usr/bin/curl';

function devPlan(answers: Record<string, unknown> = {}): InstallPlan {
	return buildInstallPlan({ ...DEV, ...answers }, { devTlsDir: PLAN_DIR, lanAddresses: LAN });
}

/** The DedaloError a call threw (or null). */
function refusalOf(call: () => unknown): { code: string; message: string } | null {
	try {
		call();
		return null;
	} catch (error) {
		return error as { code: string; message: string };
	}
}

/** Every file below `dir` with its bytes (what "nothing changed" compares). */
function snapshot(dir: string): Record<string, string> {
	const out: Record<string, string> = {};
	for (const entry of readdirSync(dir, { withFileTypes: true, recursive: true })) {
		if (!entry.isFile()) continue;
		const path = join(entry.parentPath, entry.name);
		out[path] = readFileSync(path, 'base64');
	}
	return out;
}

/** The authority's SHA-1, as `security` prints and takes it (uppercase hex, no colons). */
function devCaSha1(dir: string): string {
	return new X509Certificate(readFileSync(join(dir, DEV_CA_NAME))).fingerprint.replace(/:/g, '');
}

// ── A. the plan ──────────────────────────────────────────────────────────────

describe('A. the plan: two steps, the names, IPv6 resolved', () => {
	test('local_ca (the default, D1): certificate then trust, before the first .env write', () => {
		const plan = devPlan();
		expect(plan.errors).toEqual([]);
		const at = (step: string) => plan.steps.indexOf(step as never);
		expect(at('dev_tls_certificate')).toBeGreaterThan(at('install_dev_dependencies'));
		expect(at('dev_trust_ca')).toBe(at('dev_tls_certificate') + 1);
		expect(at('persist_config')).toBe(at('dev_trust_ca') + 1);
		expect(plan.devCertificate).toEqual({
			dir: PLAN_DIR,
			caFile: join(PLAN_DIR, DEV_CA_NAME),
			names: ['localhost', '127.0.0.1'],
			notes: [],
			errors: [],
		});
	});

	test('one LAN address: certified; a wildcard: this machine’s IPv4 addresses, noted', () => {
		expect(devPlan({ dev_host: '192.168.1.20' }).devCertificate?.names).toEqual([
			'localhost',
			'127.0.0.1',
			'192.168.1.20',
		]);
		const wild = devPlan({ dev_host: '0.0.0.0' });
		expect(wild.devCertificate?.names).toEqual([
			'localhost',
			'127.0.0.1',
			'10.0.0.5',
			'192.168.1.20',
		]);
		expect(wild.notes.some((note) => note.includes('10.0.0.5, 192.168.1.20'))).toBe(true);
		const none = devCertificateNames('0.0.0.0', () => []);
		expect(none.names).toEqual(['localhost', '127.0.0.1']);
		expect(none.notes[0]).toContain('no IPv4 network address');
	});

	test('IPv6: a specific address is REFUSED, `::` notes IPv4 only, `::1` needs nothing', () => {
		const specific = devPlan({ dev_host: '2001:db8::5' });
		expect(
			specific.fieldErrors.some((item) => item.key === 'dev_host' && item.message.includes('IPv6')),
		).toBe(true);
		expect(specific.errors.some((message) => message.includes('cannot certify'))).toBe(true);
		const any = devPlan({ dev_host: '::' });
		expect(any.errors).toEqual([]);
		expect(any.notes.some((note) => note.startsWith('IPv6 addresses are not certified'))).toBe(
			true,
		);
		const loop = devPlan({ dev_host: '::1' });
		expect(loop.errors).toEqual([]);
		expect(loop.devCertificate?.names).toEqual(['localhost', '127.0.0.1']);
		// A specific IPv6 bind without the local CA is not this module's to refuse.
		expect(devPlan({ dev_host: '2001:db8::5', tls_mode: 'none' }).errors).toEqual([]);
	});

	test('none / files / every other route: neither step, no certificate', () => {
		for (const plan of [
			devPlan({ tls_mode: 'none' }),
			devPlan({ tls_mode: 'files', tls_cert_path: '/zz/c.pem', tls_key_path: '/zz/k.pem' }),
		]) {
			expect(plan.devCertificate).toBeNull();
			expect(plan.steps).not.toContain('dev_tls_certificate');
			expect(plan.steps).not.toContain('dev_trust_ca');
		}
		for (const route of [
			{
				route: 'production',
				instance: 'prado',
				server_name: 'prado.example.org',
				letsencrypt_email: 'ops@example.org',
			},
			{ route: 'docker', server_name: 'prado.example.org', letsencrypt_email: 'ops@example.org' },
			{ route: 'trial' },
		]) {
			for (const engineOnly of [false, true]) {
				const plan = buildInstallPlan(
					{ ...BASE_RECORD, ...route, engine_only: engineOnly },
					{ devTlsDir: PLAN_DIR },
				);
				expect(plan.devCertificate, route.route).toBeNull();
				expect(plan.steps, route.route).not.toContain('dev_tls_certificate');
				expect(plan.steps, route.route).not.toContain('dev_trust_ca');
			}
		}
	});

	test('the Review names the certificate’s names and the elevation it will ask', () => {
		const lines = reviewLines(
			devPlan({ dev_host: '192.168.1.20' }),
			modelInput({ ...DEV, dev_host: '192.168.1.20' }),
		);
		const value = (label: string) => lines.find((line) => line.label === label)?.value ?? '';
		expect(value('certificate names')).toBe('localhost, 127.0.0.1, 192.168.1.20');
		expect(value('trust store')).toContain(join(PLAN_DIR, DEV_CA_NAME));
		expect(value('trust store')).toMatch(/keychain|sudo|system store|not trusted automatically/);
		expect(
			machineIpv4Addresses({
				lo0: [{ address: '127.0.0.1', family: 'IPv4', internal: true } as never],
				en0: [
					{ address: '169.254.3.3', family: 'IPv4', internal: false } as never,
					{ address: '192.168.1.9', family: 'IPv4', internal: false } as never,
					{ address: 'fe80::1', family: 'IPv6', internal: false } as never,
				],
			}),
		).toEqual(['192.168.1.9']);
	});
});

// ── B. gate 4: the generator on the developer layout ─────────────────────────

/** Every distinct openssl here (PATH's first, then the system one — LibreSSL on macOS). */
function opensslRows(): { bin: string; version: string }[] {
	const rows: { bin: string; version: string }[] = [];
	for (const candidate of [Bun.which('openssl'), '/usr/bin/openssl']) {
		if (candidate === null || !existsSync(candidate)) continue;
		const version = Bun.spawnSync([candidate, 'version'], { stdout: 'pipe' })
			.stdout.toString()
			.trim();
		if (rows.some((row) => row.version === version)) continue;
		rows.push({ bin: candidate, version });
	}
	return rows;
}
const ROWS = opensslRows();

test('gate 4 has at least one openssl row (the generator needs one)', () => {
	expect(ROWS.length).toBeGreaterThan(0);
});

for (const row of ROWS) {
	describe(`B. gate 4 — ${row.version} (${row.bin})`, () => {
		const env = { PATH: `${dirname(row.bin)}:/usr/bin:/bin`, HOME: scratch, TMPDIR: tmpdir() };
		const dir = join(scratch, `row_${ROWS.indexOf(row)}`, 'tls');
		const names = ['localhost', '127.0.0.1'];
		const ssl = (args: string[], cwd = dir) =>
			Bun.spawnSync([row.bin, ...args], { cwd, env, stdout: 'pipe', stderr: 'pipe' });

		/** A leaf for `name`, signed with the developer's OWN issuing key (the leaked-key play). */
		function rogueLeaf(name: string): string {
			const work = mkdtempSync(join(scratch, 'rogue_'));
			const ext = join(work, 'ext.cnf');
			const san = /^\d+\.\d+\.\d+\.\d+$/.test(name) ? `IP:${name}` : `DNS:${name}`;
			writeFileSync(
				ext,
				`basicConstraints=CA:FALSE\nextendedKeyUsage=serverAuth\nsubjectAltName=${san}\n`,
			);
			expect(
				ssl([
					'req',
					'-new',
					'-newkey',
					'rsa:2048',
					'-nodes',
					'-keyout',
					join(work, 'k.pem'),
					'-out',
					join(work, 'c.csr'),
					'-subj',
					`/CN=${name}`,
				]).exitCode,
			).toBe(0);
			expect(
				ssl([
					'x509',
					'-req',
					'-in',
					join(work, 'c.csr'),
					'-CA',
					join(dir, ISSUING_CA_NAME),
					'-CAkey',
					join(dir, 'dedalo-issuing-ca.key'),
					'-CAcreateserial',
					'-CAserial',
					join(work, 's.srl'),
					'-out',
					join(work, 'leaf.pem'),
					'-days',
					'30',
					'-extfile',
					ext,
				]).exitCode,
			).toBe(0);
			return join(work, 'leaf.pem');
		}

		test('issue: 0700 dir, 0600 keys, no root key, the chain usable for exactly the names', () => {
			const result = ensureDevCertificate({ dir, names }, { env });
			expect(result.action).toBe('issued');
			expect(result.names).toEqual(names);
			expect(statSync(dir).mode & 0o777).toBe(0o700);
			for (const key of ['privkey.pem', 'dedalo-issuing-ca.key']) {
				expect(statSync(join(dir, key)).mode & 0o777).toBe(0o600);
			}
			const files = readdirSync(dir).sort();
			expect(files.filter((name) => name.endsWith('.key'))).toEqual(['dedalo-issuing-ca.key']);
			expect(readFileSync(join(dir, 'dedalo-local-ca.names'), 'utf8')).toBe(
				'localhost\n127.0.0.1\n',
			);
			expect(devCertificateProblems(dir, names)).toEqual([]);
			expect(result.fingerprint).toBe(devCaFingerprint(dir) as string);
			// The verify is an outcome check: a name the leaf lacks, and a key opened to others, are problems.
			const wider = devCertificateProblems(dir, [...names, '192.168.1.20']);
			expect(wider.some((line) => line.includes('does not name 192.168.1.20'))).toBe(true);
			chmodSync(join(dir, 'privkey.pem'), 0o644);
			expect(devCertificateProblems(dir, names)).toEqual([
				`${join(dir, 'privkey.pem')} is readable by others (must be 0600)`,
			]);
			chmodSync(join(dir, 'privkey.pem'), 0o600);
		});

		test('a REAL TLS handshake: Bun.serve with the pair, curl --cacert for localhost and 127.0.0.1', async () => {
			const port = freeTcpPort();
			const server = Bun.serve({
				hostname: '127.0.0.1',
				port,
				tls: {
					cert: Bun.file(join(dir, 'fullchain.pem')),
					key: Bun.file(join(dir, 'privkey.pem')),
				},
				fetch: () => new Response('served'),
			});
			try {
				for (const host of ['localhost', '127.0.0.1']) {
					const run = Bun.spawn(
						[
							CURL,
							'-sS',
							'--max-time',
							'10',
							'--resolve',
							`localhost:${port}:127.0.0.1`,
							'--cacert',
							join(dir, DEV_CA_NAME),
							`https://${host}:${port}/`,
						],
						{ stdout: 'pipe', stderr: 'pipe' },
					);
					const [out, err, code] = await Promise.all([
						new Response(run.stdout).text(),
						new Response(run.stderr).text(),
						run.exited,
					]);
					expect({ host, code, out, err }).toEqual({ host, code: 0, out: 'served', err: '' });
				}
				// Control: without the authority the handshake is refused.
				const bare = Bun.spawn([CURL, '-sS', '--max-time', '10', `https://127.0.0.1:${port}/`], {
					stdout: 'pipe',
					stderr: 'pipe',
				});
				expect(await bare.exited).not.toBe(0);
			} finally {
				server.stop(true);
			}
		});

		test('the authority refuses an outside name, even signed with the developer’s own issuing key', () => {
			const verify = (leaf: string) =>
				ssl([
					'verify',
					'-purpose',
					'sslserver',
					'-CAfile',
					join(dir, DEV_CA_NAME),
					'-untrusted',
					join(dir, ISSUING_CA_NAME),
					leaf,
				]).exitCode;
			expect(verify(rogueLeaf('localhost'))).toBe(0);
			expect(verify(rogueLeaf('bank.example'))).not.toBe(0);
			expect(verify(rogueLeaf('x.localhost'))).not.toBe(0);
			expect(verify(rogueLeaf('192.168.1.99'))).not.toBe(0);
		});

		test('a re-run is current; tls:renew --force keeps the authority and replaces the leaf', async () => {
			const authority = readFileSync(join(dir, DEV_CA_NAME), 'utf8');
			const leaf = readFileSync(join(dir, 'fullchain.pem'), 'utf8');
			const again = ensureDevCertificate({ dir, names }, { env });
			expect(again.action).toBe('current');
			expect(readFileSync(join(dir, 'fullchain.pem'), 'utf8')).toBe(leaf);
			const renewed = await runDevTls(['renew', '--force'], dir);
			expect(renewed.err).toEqual([]);
			expect(renewed.code).toBe(0);
			expect(renewed.out[0]).toContain('renewed');
			expect(readFileSync(join(dir, DEV_CA_NAME), 'utf8')).toBe(authority);
			expect(readFileSync(join(dir, 'fullchain.pem'), 'utf8')).not.toBe(leaf);
			expect(devCertificateProblems(dir, names)).toEqual([]);
		});

		test('an authority made for other names: refused by the step AND the preflight, nothing changed', async () => {
			const before = snapshot(dir);
			const wider = [...names, '192.168.1.20'];
			const refused = refusalOf(() => ensureDevCertificate({ dir, names: wider }, { env }));
			expect(refused?.code).toBe('install.state_conflict');
			expect(refused?.message).toContain('--mode local-ca');
			expect(refused?.message).toContain('--host 192.168.1.20');
			expect(snapshot(dir)).toEqual(before);
			const preflight = await devListenerRefusals(
				{ host: '127.0.0.1', socket: join(dir, 'absent.sock'), port: String(freeTcpPort()) },
				{ dir, names: wider },
			);
			expect(preflight).toEqual([devAuthorityRefusal(dir, wider) as string]);
			expect(
				await devListenerRefusals(
					{ host: '127.0.0.1', socket: join(dir, 'absent.sock'), port: String(freeTcpPort()) },
					{ dir, names },
				),
			).toEqual([]);
		});
	});
}

test('root in a developer’s tree is refused, nothing created', () => {
	const dir = join(scratch, 'root_refused', 'tls');
	const refused = refusalOf(() =>
		ensureDevCertificate({ dir, names: ['localhost', '127.0.0.1'] }, { euid: 0, tree: scratch }),
	);
	expect(refused?.code).toBe('install.state_conflict');
	expect(refused?.message).toContain('not root');
	expect(existsSync(dir)).toBe(false);
});

test('tls:renew with no authority is refused with a sentence; untrust with no record removes nothing', async () => {
	const empty = join(scratch, 'empty_tls');
	const renew = await runDevTls(['renew'], empty);
	expect(renew.code).toBe(1);
	expect(renew.err[0]).toContain('no development authority');
	const untrust = await runDevTls(['untrust'], empty);
	expect(untrust.code).toBe(0);
	expect(untrust.out[0]).toContain('nothing to remove');
	expect((await runDevTls(['bogus'], empty)).code).toBe(1);
});

// ── C. the steps as the executor runs them ───────────────────────────────────

describe('C. the step table: run → verify → undo (only what this install created)', () => {
	test('dev_tls_certificate in a scratch private dir', async () => {
		const priv = join(scratch, 'private_c');
		mkdirSync(priv, { recursive: true });
		await withPrivateDir(priv, async () => {
			writeFileSync(join(priv, '.env'), 'SERVER_TCP_HOST=127.0.0.1\n');
			const step = INSTALL_STEPS.dev_tls_certificate;
			expect(devStepTarget({ dev_host: '' })).toEqual({
				dir: join(priv, 'tls'),
				names: ['localhost', '127.0.0.1'],
			});
			const outcome = await step.run({
				posted: { dev_host: '' },
				createDirectories: true,
				actorUserId: -1,
			});
			expect(outcome.ok).toBe(true);
			const ctx = (created: boolean | undefined) =>
				({
					plan: { answers: { dev_host: '' } },
					state: { install_id: 'iid', created: { dev_tls_dir: created } },
					secrets: {},
				}) as never;
			expect((await step.verify?.(ctx(true)))?.ok).toBe(true);
			// Kept when it was there before this install.
			expect(await step.undo?.(ctx(false))).toContain('kept');
			expect(existsSync(join(priv, 'tls', DEV_CA_NAME))).toBe(true);
			expect(await step.undo?.(ctx(true))).toContain('removed');
			expect(existsSync(join(priv, 'tls'))).toBe(false);
			expect((await step.verify?.(ctx(true)))?.ok).toBe(false);
		});
	});
	test('dev_trust_ca in a test run: the MACHINE’s stores are off limits (the preload’s seam) — nothing asked, nothing changed', async () => {
		// The preload sets the seam for every run and every installer child (the CLI
		// e2e once waited on the real macOS keychain dialog without it).
		expect(machineTrustStoresOff()).toBe(true);
		const priv = join(scratch, 'private_seam');
		mkdirSync(priv, { recursive: true });
		await withPrivateDir(priv, async () => {
			ensureDevCertificate({ dir: join(priv, 'tls'), names: ['localhost', '127.0.0.1'] });
			const outcome = await INSTALL_STEPS.dev_trust_ca.run({
				posted: {},
				createDirectories: true,
				actorUserId: -1,
				installId: 'iid-seam',
			});
			expect(outcome.ok).toBe(true);
			expect(outcome.trusted).toBe(false);
			expect(String(outcome.msg)).toContain('DEDALO_TEST_TRUST_STORE_OFF');
			expect(readTrustRecord(join(priv, 'tls'))).toEqual([]);
			const undo = await INSTALL_STEPS.dev_trust_ca.undo?.({
				plan: {},
				state: { install_id: 'iid-seam', created: {} },
				secrets: {},
			} as never);
			expect(undo).toContain('nothing this install trusted');
		});
	});
});

describe('C. dev_trust_ca through the REAL step door, against a scratch Linux store', () => {
	afterAll(() => useScratchTrustEnvironment(null));

	/** The step's ctx for an undo of `installId`. */
	const undoCtx = (installId: string, createdDir: boolean) =>
		({
			plan: { answers: { dev_host: '' } },
			state: { install_id: installId, created: { dev_tls_dir: createdDir } },
			secrets: {},
		}) as never;

	/** Does openssl over the machine's rebuilt bundle accept the development leaf? */
	function opensslAccepts(dir: string, bundle: string): boolean {
		const verified = Bun.spawnSync(
			[
				Bun.which('openssl') ?? '/usr/bin/openssl',
				'verify',
				'-purpose',
				'sslserver',
				'-CAfile',
				bundle,
				'-untrusted',
				join(dir, ISSUING_CA_NAME),
				join(dir, DEV_TLS_CERT_NAME),
			],
			{ stdout: 'pipe', stderr: 'pipe' },
		);
		return verified.exitCode === 0;
	}

	test('run records THIS install id; undo removes only its entries; openssl refuses afterwards', async () => {
		const machine = linuxMachine('door');
		const priv = join(scratch, 'private_door');
		mkdirSync(priv, { recursive: true });
		await withPrivateDir(priv, async () => {
			const dir = join(priv, 'tls');
			ensureDevCertificate({ dir, names: ['localhost', '127.0.0.1'] });
			expect(existsSync(join(dir, ISSUING_CA_NAME))).toBe(true);
			expect(existsSync(join(dir, DEV_TLS_CERT_NAME))).toBe(true);
			// An earlier install's entry for the same authority (a tls:renew kept it):
			// not this install's, so this install's abort must leave it alone.
			const earlier = {
				store: 'linux_anchors',
				target: join(machine.root, 'elsewhere', 'earlier.crt'),
				nickname: null,
				update: ['true'],
				fingerprint256: devCaFingerprint(dir),
				sha1: devCaSha1(dir),
				pem: readFileSync(join(dir, DEV_CA_NAME), 'utf8'),
				install_id: 'iid-earlier',
				added_at: '2026-10-01T00:00:00.000Z',
			};
			writeFileSync(
				join(dir, 'dedalo-trust.json'),
				JSON.stringify({ schema: 'dedalo.dev_trust/1', entries: [earlier] }),
			);
			useScratchTrustEnvironment(machine.tenv);
			const outcome = await INSTALL_STEPS.dev_trust_ca.run({
				posted: {},
				createDirectories: true,
				actorUserId: -1,
				installId: 'iid-door',
			});
			expect(outcome.trusted).toBe(true);
			expect(opensslAccepts(dir, machine.bundle)).toBe(true);
			expect(readTrustRecord(dir).map((entry) => entry.install_id)).toEqual([
				'iid-earlier',
				'iid-door',
			]);
			const undo = await INSTALL_STEPS.dev_trust_ca.undo?.(undoCtx('iid-door', true));
			expect(undo).toContain('trust removed: linux_anchors');
			expect(readTrustRecord(dir).map((entry) => entry.install_id)).toEqual(['iid-earlier']);
			expect(readdirSync(machine.anchors)).toEqual([]);
			expect(opensslAccepts(dir, machine.bundle)).toBe(false);
		});
	});

	test('--abort: a trust undo that FAILS keeps the record through the certificate undo; tls:untrust then removes it', async () => {
		const machine = linuxMachine('abort');
		// The same store, but this sudo refuses (the operator cancels the prompt).
		const refusing = join(machine.root, 'refusing');
		mkdirSync(refusing, { recursive: true });
		writeFileSync(
			join(refusing, 'sudo'),
			"#!/bin/sh\necho 'sudo: a password is required' >&2\nexit 1\n",
		);
		chmodSync(join(refusing, 'sudo'), 0o755);
		const cancelled: TrustEnvironment = {
			...machine.tenv,
			env: { ...machine.tenv.env, PATH: `${refusing}:${machine.tenv.env.PATH}` },
		};
		const priv = join(scratch, 'private_abort');
		mkdirSync(priv, { recursive: true });
		await withPrivateDir(priv, async () => {
			const dir = join(priv, 'tls');
			writeFileSync(join(priv, '.env'), 'SERVER_TCP_HOST=127.0.0.1\n');
			useScratchTrustEnvironment(machine.tenv);
			const made = await INSTALL_STEPS.dev_tls_certificate.run({
				posted: { dev_host: '' },
				createDirectories: true,
				actorUserId: -1,
			});
			expect(made.ok).toBe(true);
			expect(
				(
					await INSTALL_STEPS.dev_trust_ca.run({
						posted: {},
						createDirectories: true,
						actorUserId: -1,
						installId: 'iid-abort',
					})
				).trusted,
			).toBe(true);
			// Reverse order, as --abort runs it: the trust undo is refused…
			useScratchTrustEnvironment(cancelled);
			const trustUndo = await INSTALL_STEPS.dev_trust_ca.undo?.(undoCtx('iid-abort', true));
			expect(trustUndo).toContain('NOT removed');
			// …so the certificate undo keeps the record and the authority it names.
			const certUndo = await INSTALL_STEPS.dev_tls_certificate.undo?.(undoCtx('iid-abort', true));
			expect(certUndo).toContain('bun run tls:untrust');
			expect(readdirSync(dir).sort()).toEqual([DEV_CA_NAME, 'dedalo-trust.json'].sort());
			expect(readdirSync(machine.anchors).length).toBe(1);
			// Later, the prompt answered: tls:untrust takes it out of the store.
			useScratchTrustEnvironment(machine.tenv);
			const untrust = await runDevTls(['untrust'], dir);
			expect(untrust.code).toBe(0);
			expect(readdirSync(machine.anchors)).toEqual([]);
			expect(readTrustRecord(dir)).toEqual([]);
		});
		useScratchTrustEnvironment(null);
	});
});

// ── D. the trust store ───────────────────────────────────────────────────────

/** A machine-like trust environment rooted in scratch, with a logging stub sudo. */
function linuxMachine(name: string, options: { sudo?: 'ok' | 'cancel'; euid?: number } = {}) {
	const root = join(scratch, `trust_${name}`);
	const stubs = join(root, 'stubs');
	const anchors = join(root, 'anchors');
	const bundle = join(root, 'bundle.pem');
	const log = join(root, 'calls.log');
	mkdirSync(stubs, { recursive: true });
	mkdirSync(anchors, { recursive: true });
	writeFileSync(bundle, '');
	symlinkSync(Bun.which('openssl') ?? '/usr/bin/openssl', join(stubs, 'openssl'));
	writeFileSync(log, '');
	writeFileSync(
		join(stubs, 'sudo'),
		options.sudo === 'cancel'
			? `#!/bin/sh\necho "sudo $*" >> '${log}'\necho 'sudo: a password is required' >&2\nexit 1\n`
			: `#!/bin/sh\necho "sudo $*" >> '${log}'\n[ "$1" = "--" ] && shift\nexec "$@"\n`,
	);
	chmodSync(join(stubs, 'sudo'), 0o755);
	// The update command: rebuild the bundle from the anchors (what update-ca-certificates does).
	writeFileSync(
		join(stubs, 'zz-update-ca'),
		`#!/bin/sh\necho "update" >> '${log}'\ncat '${anchors}'/*.crt > '${bundle}' 2>/dev/null || : > '${bundle}'\n`,
	);
	chmodSync(join(stubs, 'zz-update-ca'), 0o755);
	const tenv: TrustEnvironment = {
		platform: 'linux',
		euid: options.euid ?? 1000,
		home: join(root, 'home'),
		env: {
			// The stubs first (the stub sudo shadows any real one; openssl is linked
			// in, so no other tool of its directory — a Homebrew certutil — leaks in).
			PATH: `${stubs}:/usr/bin:/bin`,
			SSL_CERT_FILE: bundle,
		},
		run: async (argv, opts) => {
			const proc = Bun.spawn([...argv], {
				env: opts.env,
				stdin: 'ignore',
				stdout: 'pipe',
				stderr: 'pipe',
			});
			const [out, err, code] = await Promise.all([
				new Response(proc.stdout).text(),
				new Response(proc.stderr).text(),
				proc.exited,
			]);
			return { code, output: `${out}\n${err}` };
		},
		linuxStores: [{ dir: anchors, update: ['zz-update-ca'] }],
		keychain: join(root, 'login.keychain-db'),
		firefoxRoots: [join(root, 'home', 'firefox')],
	};
	const calls = () =>
		readFileSync(log, 'utf8')
			.split('\n')
			.filter((line) => line !== '');
	return { root, anchors, bundle, tenv, calls };
}

/** A developer authority (the real generator) for the trust gates. */
function issuedDir(name: string): string {
	const dir = join(scratch, `trust_ca_${name}`, 'tls');
	ensureDevCertificate({ dir, names: ['localhost', '127.0.0.1'] });
	return dir;
}

describe('D. the trust store — Linux through ONE sudo, judged by openssl over the rebuilt bundle', () => {
	const dir = issuedDir('linux');

	test('trusted: one elevated shell, the anchor in place, openssl now accepts; a re-run asks nothing', async () => {
		const machine = linuxMachine('ok');
		const result = await trustDevAuthority(dir, 'iid-1', machine.tenv);
		expect(result.trusted).toBe(true);
		expect(result.warnings).toEqual([]);
		expect(result.msg).toContain(devCaFingerprint(dir) as string);
		const sudo = machine.calls().filter((line) => line.startsWith('sudo '));
		expect(sudo.length).toBe(1);
		expect(sudo[0]).toContain('sh -c install -m 0644');
		const anchors = readdirSync(machine.anchors);
		expect(anchors.length).toBe(1);
		expect(anchors[0]).toMatch(/^dedalo-dev-ca-[0-9a-f]{16}\.crt$/);
		expect(readFileSync(join(machine.anchors, anchors[0] as string), 'utf8')).toBe(
			readFileSync(join(dir, DEV_CA_NAME), 'utf8'),
		);
		expect(readTrustRecord(dir).map((entry) => [entry.store, entry.install_id])).toEqual([
			['linux_anchors', 'iid-1'],
		]);
		const before = machine.calls().length;
		const again = await trustDevAuthority(dir, 'iid-2', machine.tenv);
		expect(again.trusted).toBe(true);
		expect(again.stores[0]).toContain('already trusted');
		expect(machine.calls().length).toBe(before);
		// --abort of ANOTHER install removes nothing; of this one, its entry; openssl refuses again.
		expect((await untrustDevAuthority(dir, 'iid-other', machine.tenv)).removed).toEqual([]);
		const undone = await untrustDevAuthority(dir, 'iid-1', machine.tenv);
		expect(undone.failed).toEqual([]);
		expect(undone.removed.length).toBe(1);
		expect(readdirSync(machine.anchors)).toEqual([]);
		expect(readTrustRecord(dir)).toEqual([]);
	});

	test('a cancelled sudo is "not trusted yet" with the manual steps — never a failure', async () => {
		const machine = linuxMachine('cancel', { sudo: 'cancel' });
		const result = await trustDevAuthority(dir, 'iid-c', machine.tenv);
		expect(result.ok).toBe(true);
		expect(result.trusted).toBe(false);
		expect(result.msg.startsWith('not trusted yet')).toBe(true);
		expect(result.warnings[0]).toContain('a password is required');
		expect(result.warnings[0]).toContain('update-ca-certificates');
		expect(readdirSync(machine.anchors)).toEqual([]);
		expect(readTrustRecord(dir)).toEqual([]);
	});

	test('already root: no sudo at all', async () => {
		const machine = linuxMachine('root', { euid: 0 });
		const result = await trustDevAuthority(dir, 'iid-r', machine.tenv);
		expect(result.trusted).toBe(true);
		expect(machine.calls().some((line) => line.startsWith('sudo '))).toBe(false);
		expect(machine.calls()).toContain('update');
		expect((await untrustDevAuthority(dir, undefined, machine.tenv)).removed.length).toBe(1);
	});

	test('a rotated authority: the old anchor leaves the store before the new one is trusted', async () => {
		const machine = linuxMachine('rotate');
		const old = issuedDir('rotate_old');
		expect((await trustDevAuthority(old, 'iid-o', machine.tenv)).trusted).toBe(true);
		// The new authority takes the old one's directory (as a rotation does), keeping its record.
		const fresh = issuedDir('rotate_new');
		writeFileSync(join(fresh, 'dedalo-trust.json'), readFileSync(join(old, 'dedalo-trust.json')));
		const result = await trustDevAuthority(fresh, 'iid-n', machine.tenv);
		expect(result.trusted).toBe(true);
		const anchors = readdirSync(machine.anchors);
		expect(anchors.length).toBe(1);
		expect(readFileSync(join(machine.anchors, anchors[0] as string), 'utf8')).toBe(
			readFileSync(join(fresh, DEV_CA_NAME), 'utf8'),
		);
		expect(readTrustRecord(fresh).map((entry) => entry.install_id)).toEqual(['iid-n']);
		// tls:untrust (every entry) through the store it was added to.
		expect((await untrustDevAuthority(fresh, undefined, machine.tenv)).removed.length).toBe(1);
		expect(readdirSync(machine.anchors)).toEqual([]);
	});
});

const CERTUTIL = Bun.which('certutil');
const SYSTEM_DIRS = '/usr/sbin:/sbin:/usr/bin:/bin';

describe('D. Firefox (NSS)', () => {
	const dir = issuedDir('nss');

	test.if(CERTUTIL !== null)(
		'certutil adds the authority to every profile, and takes it back out',
		async () => {
			const machine = linuxMachine('nss', { euid: 0 });
			const profiles = ['a.default', 'b.dev'].map((name) =>
				join(machine.root, 'home', 'firefox', name),
			);
			for (const profile of profiles) {
				mkdirSync(profile, { recursive: true });
				const made = Bun.spawnSync(
					[CERTUTIL as string, '-N', '-d', `sql:${profile}`, '--empty-password'],
					{ stdout: 'pipe', stderr: 'pipe' },
				);
				expect(made.exitCode, made.stderr.toString()).toBe(0);
			}
			const tenv = {
				...machine.tenv,
				env: {
					...machine.tenv.env,
					PATH: `${dirname(CERTUTIL as string)}:${machine.tenv.env.PATH}`,
				},
			};
			const result = await trustDevAuthority(dir, 'iid-f', tenv);
			expect(result.stores.filter((line) => line.startsWith('Firefox profile')).length).toBe(2);
			const listed = (profile: string) =>
				Bun.spawnSync([CERTUTIL as string, '-L', '-d', `sql:${profile}`], {
					stdout: 'pipe',
				}).stdout.toString();
			for (const profile of profiles) expect(listed(profile)).toContain('Dedalo development CA');
			expect(readTrustRecord(dir).filter((entry) => entry.store === 'firefox_nss').length).toBe(2);
			await untrustDevAuthority(dir, 'iid-f', tenv);
			for (const profile of profiles)
				expect(listed(profile)).not.toContain('Dedalo development CA');
		},
	);

	// The tool search always adds the system dirs (a sudo'd command finds tools there):
	// a certutil installed THERE cannot be hidden, so the note is measured where it is not.
	test.if(Bun.which('certutil', { PATH: SYSTEM_DIRS }) === null)(
		'without certutil: the enterprise_roots note, never a failure',
		async () => {
			const machine = linuxMachine('nss_none', { euid: 0 });
			const profile = join(machine.root, 'home', 'firefox', 'p.default');
			mkdirSync(profile, { recursive: true });
			writeFileSync(join(profile, 'cert9.db'), '');
			const result = await trustDevAuthority(dir, 'iid-x', machine.tenv);
			expect(result.ok).toBe(true);
			expect(result.trusted).toBe(true);
			expect(
				result.warnings.filter((line) => line.includes('security.enterprise_roots.enabled')).length,
			).toBe(1);
			await untrustDevAuthority(dir, 'iid-x', machine.tenv);
		},
	);
});

describe('D. macOS (the login keychain): argv, cancel and removal through the injected runner', () => {
	const dir = issuedDir('mac');

	/**
	 * `cancel`: the dialog cancelled AFTER the import (what `add-trusted-cert`
	 * really does — it imports, then asks); `stuck`: the same, and the keychain
	 * refuses the delete too; `cancel_held`: the item was in the keychain before.
	 */
	function macMachine(add: 'ok' | 'cancel' | 'unverified' | 'stuck' | 'cancel_held') {
		const root = join(scratch, `mac_${add}`);
		const stubs = join(root, 'stubs');
		mkdirSync(stubs, { recursive: true });
		// findTool must find a `security` (on Linux CI there is none): an inert stub file.
		writeFileSync(join(stubs, 'security'), '#!/bin/sh\nexit 99\n');
		chmodSync(join(stubs, 'security'), 0o755);
		const calls: { argv: string[]; interactive: boolean }[] = [];
		let trusted = false;
		const sha1 = devCaSha1(dir);
		const keychain = { held: add === 'cancel_held' };
		const run: CommandRunner = async (argv, opts) => {
			calls.push({ argv: [...argv], interactive: opts.interactive });
			const verb = argv[1];
			if (verb === 'verify-cert') return { code: trusted ? 0 : 1, output: '' };
			if (verb === 'find-certificate') {
				return { code: 0, output: keychain.held ? `SHA-1 hash: ${sha1}\nkeychain: "x"` : '' };
			}
			if (verb === 'delete-certificate') {
				if (add === 'stuck' || argv[3] !== sha1) return { code: 1, output: 'refused' };
				keychain.held = false;
				return { code: 0, output: '' };
			}
			if (verb === 'add-trusted-cert') {
				keychain.held = true;
				if (add === 'cancel' || add === 'stuck' || add === 'cancel_held')
					return {
						code: 1,
						output: 'SecTrustSettingsSetTrustSettings: The authorization was canceled by the user.',
					};
				trusted = add === 'ok';
				return { code: 0, output: '' };
			}
			return { code: 0, output: '' };
		};
		const tenv: TrustEnvironment = {
			platform: 'darwin',
			euid: 501,
			home: join(root, 'home'),
			env: { PATH: stubs },
			run,
			linuxStores: [],
			keychain: join(root, 'login.keychain-db'),
			firefoxRoots: [],
		};
		return { tenv, calls, keychain };
	}

	test('add: `security add-trusted-cert -r trustRoot -k <login keychain>`, interactive, no sudo; trusted only once verify-cert accepts', async () => {
		const mac = macMachine('ok');
		const result = await trustDevAuthority(dir, 'iid-m', mac.tenv);
		expect(result.trusted).toBe(true);
		const add = mac.calls.find((call) => call.argv[1] === 'add-trusted-cert');
		expect(add?.argv.slice(1)).toEqual([
			'add-trusted-cert',
			'-r',
			'trustRoot',
			'-k',
			mac.tenv.keychain,
			join(dir, DEV_CA_NAME),
		]);
		expect(add?.interactive).toBe(true);
		expect(mac.calls.some((call) => call.argv.some((word) => word.endsWith('sudo')))).toBe(false);
		const undone = await untrustDevAuthority(dir, 'iid-m', mac.tenv);
		expect(undone.removed.length).toBe(1);
		const verbs = mac.calls.map((call) => call.argv[1]);
		expect(verbs.slice(-2)).toEqual(['remove-trusted-cert', 'delete-certificate']);
		const sha1 = mac.calls.at(-1)?.argv[3] ?? '';
		expect(sha1).toMatch(/^[0-9A-F]{40}$/);
	});

	test('the keychain took it but verify-cert still refuses: NOT reported trusted', async () => {
		const mac = macMachine('unverified');
		const result = await trustDevAuthority(dir, 'iid-mu', mac.tenv);
		expect(result.trusted).toBe(false);
		expect(result.warnings[0]).toContain('verifier still refuses');
		// What it added is recorded, so an abort / tls:untrust can take it back.
		expect(readTrustRecord(dir).map((entry) => entry.install_id)).toEqual(['iid-mu']);
		expect((await untrustDevAuthority(dir, 'iid-mu', mac.tenv)).removed.length).toBe(1);
	});

	test('a cancelled dialog: not trusted yet, the manual command; the import it left is taken back out', async () => {
		const mac = macMachine('cancel');
		const result = await trustDevAuthority(dir, 'iid-mc', mac.tenv);
		expect(result.ok).toBe(true);
		expect(result.trusted).toBe(false);
		expect(result.warnings[0]).toContain('canceled by the user');
		expect(result.warnings[0]).toContain('taken back out');
		expect(result.warnings[0]).toContain('security add-trusted-cert -r trustRoot');
		// add-trusted-cert imported before it asked: nothing of ours stays in the keychain.
		expect(mac.keychain.held).toBe(false);
		const deleted = mac.calls.find((call) => call.argv[1] === 'delete-certificate');
		expect(deleted?.argv.slice(2)).toEqual(['-Z', devCaSha1(dir), mac.tenv.keychain]);
		expect(readTrustRecord(dir)).toEqual([]);
	});

	test('cancelled AND the keychain refuses the delete: the import is RECORDED, so tls:untrust still removes it', async () => {
		const mac = macMachine('stuck');
		const result = await trustDevAuthority(dir, 'iid-ms', mac.tenv);
		expect(result.trusted).toBe(false);
		expect(result.warnings[0]).toContain('bun run tls:untrust');
		expect(mac.keychain.held).toBe(true);
		expect(
			readTrustRecord(dir).map((entry) => [entry.store, entry.install_id, entry.sha1]),
		).toEqual([['macos_keychain', 'iid-ms', devCaSha1(dir)]]);
		// The keychain lets go later: the recorded entry is how it comes out.
		const later = macMachine('cancel');
		later.keychain.held = true;
		expect((await untrustDevAuthority(dir, undefined, later.tenv)).removed.length).toBe(1);
		expect(later.keychain.held).toBe(false);
		expect(readTrustRecord(dir)).toEqual([]);
	});

	test('cancelled with the item ALREADY in the keychain before: not ours to delete', async () => {
		const mac = macMachine('cancel_held');
		const result = await trustDevAuthority(dir, 'iid-mh', mac.tenv);
		expect(result.trusted).toBe(false);
		expect(mac.calls.some((call) => call.argv[1] === 'delete-certificate')).toBe(false);
		expect(mac.keychain.held).toBe(true);
		expect(readTrustRecord(dir)).toEqual([]);
	});
});
