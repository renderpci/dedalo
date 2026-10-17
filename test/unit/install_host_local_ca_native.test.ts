/**
 * install_host_local_ca_native — THE PRODUCTION ROUTE'S LOCAL CERTIFICATE
 * AUTHORITY, MEASURED (owner decision 2026-10-16: tls_mode local_ca on the
 * native route — an isolated intranet with no public name, a VM rehearsal with
 * no domain).
 *
 * What this gate holds, over the suite's production fixtures (every supported
 * OS row × nginx|apache — test/helpers/install_host_scratch.ts LOCAL_CA_VARIANTS):
 *
 *  A. THE PLAN. The answers validate; the step list has no challenge site;
 *     host_packages installs openssl and never certbot; host_tls makes the
 *     certificate directory root 0755, runs the ONE generator from its
 *     ROOT-OWNED copy (host_runtime copies it: a ROOT_RUN_SCRIPT) with every
 *     address as a --host, relabels the directory cert_t on EL only, writes the
 *     renewal drop-in and enables the renewal timer; the site names the local
 *     CA's files and every address (nginx server_name; Apache ServerAlias and
 *     a name guard that admits each, escaped); the public probe trusts the
 *     install's own authority; the renewal unit is fail-closed without its
 *     drop-in and, merged, runs the root-owned generator against this directory
 *     reloading this row's web server.
 *  B. THE PLAN'S COMMANDS RUN FOR REAL. The issue argv the plan renders and the
 *     renewal drop-in's ExecStart are EXECUTED (deploy/dedalo-tls-rotate.sh in
 *     place of its root-owned copy, a scratch directory in place of
 *     /opt/dedalo/instances/<i>/tls, systemctl stubbed on PATH — never docker):
 *     keys 0600, certificates 0644; the leaf names every address and verifies
 *     against the authority; a leaf for an address OUTSIDE the list, signed
 *     with the issuing key left on the server, is REFUSED by `openssl verify`;
 *     the renewal re-issues the leaf from the SAME authority (fingerprint
 *     unchanged, leaf changed) and reloads exactly the unit the drop-in names,
 *     for every row's web server unit (nginx, apache2, httpd).
 *
 * Proven red by breaking the code (2026-10-16): the generator run from the
 * instance tree instead of the bin dir, certbot added on local_ca, the renewal
 * drop-in naming another unit, the extra addresses dropped from the issue, the
 * probe without --cacert — each turned a leg here red.
 *
 * DB-free; openssl and bash on PATH (absent = RED, never a skip).
 */

import { afterAll, describe, expect, test } from 'bun:test';
import { X509Certificate } from 'node:crypto';
import {
	chmodSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	statSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type {
	ExecCommand,
	HostCommand,
	HostPlanCtx,
} from '../../src/core/install/host/contract.ts';
import { desiredPackages } from '../../src/core/install/host/production/packages.ts';
import { publicProbes } from '../../src/core/install/host/production/public_probe.ts';
import { fcontextRules } from '../../src/core/install/host/production/selinux.ts';
import { tlsCommands, tlsRenewWrite } from '../../src/core/install/host/production/tls.ts';
import { certificatePaths, siteText } from '../../src/core/install/host/production/web.ts';
import {
	ROOT_RUN_SCRIPTS,
	renderTemplate,
	UNIT_TEMPLATES,
} from '../../src/core/install/host/systemd/render.ts';
import {
	INSTANCE,
	LOCAL_CA_EXTRA_NAMES,
	LOCAL_CA_VARIANTS,
	mergedUnit,
	productionPlan,
	productionPlanCtx,
	REPO_ROOT,
	SERVER_NAME,
	systemdWords,
	variantName,
} from '../helpers/install_host_scratch.ts';

const OPENSSL = Bun.which('openssl');
const SCRIPT = join(REPO_ROOT, 'deploy/dedalo-tls-rotate.sh');
const SCRATCH = mkdtempSync(join(tmpdir(), 'dedalo_install_local_ca_'));
afterAll(() => rmSync(SCRATCH, { recursive: true, force: true }));

const NAMES = [SERVER_NAME, ...LOCAL_CA_EXTRA_NAMES.split(',')];
const TLS_DIR = `/opt/dedalo/instances/${INSTANCE}/tls`;
const BIN_DIR = `/opt/dedalo/instances/${INSTANCE}/bin`;

/** The exec commands of a list. */
const execs = (commands: readonly HostCommand[]): ExecCommand[] =>
	commands.filter((command): command is ExecCommand => command.kind === 'exec');

// ── A. the plan ──────────────────────────────────────────────────────────────

describe('A. the production plan of a local CA, every row × web server', () => {
	test('the fixtures: every supported row × nginx|apache', () => {
		expect(LOCAL_CA_VARIANTS.length).toBe(6);
	});

	for (const variant of LOCAL_CA_VARIANTS) {
		describe(variantName(variant), () => {
			// SELinux measured enforcing where the row has it (EL): its relabel is planned.
			const plain = productionPlanCtx(variant);
			const ctx: HostPlanCtx = {
				...plain,
				facts: { ...plain.facts, selinux: plain.row.selinux ? 'enforcing' : plain.facts.selinux },
			};
			const service = ctx.row.web[variant.web].service;

			test('the answers validate; no challenge site; openssl installed, certbot never', () => {
				const { plan } = productionPlan(variant);
				expect(plan.errors).toEqual([]);
				expect(plan.answers.tls_mode).toBe('local_ca');
				expect(plan.answers.tls_extra_names).toBe(LOCAL_CA_EXTRA_NAMES);
				expect(plan.steps).toContain('host_tls');
				expect(plan.steps).not.toContain('host_web_http');
				const packages = desiredPackages(ctx);
				expect(packages).toContain('openssl');
				expect(packages.filter((name) => name.includes('certbot'))).toEqual([]);
			});

			test('host_tls: root 0755 directory, the root-owned generator with every address, cert_t on EL, the renewal timer', () => {
				const commands = tlsCommands(ctx);
				const mkdir = commands.find((command) => command.kind === 'mkdir');
				expect(mkdir).toMatchObject({ path: TLS_DIR, mode: 0o755, owner: 'root', group: 'root' });
				const generator = execs(commands).find((command) =>
					command.argv[0]?.endsWith('dedalo-tls-rotate.sh'),
				);
				expect(generator?.as).toBe('root');
				expect(generator?.argv).toEqual([
					`${BIN_DIR}/dedalo-tls-rotate.sh`,
					'--mode',
					'local-ca',
					...NAMES.flatMap((name) => ['--host', name]),
					'--dir',
					TLS_DIR,
					'--no-reload',
					'--quiet',
				]);
				// F2: the copy root runs is root-owned, outside the instance's tree.
				expect(ROOT_RUN_SCRIPTS as readonly string[]).toContain('dedalo-tls-rotate.sh');
				expect(generator?.argv[0]?.startsWith(ctx.paths.instanceDir)).toBe(false);
				// Skipped when the authority and its certificate already exist (a resume, an earlier install).
				expect(generator?.unless?.argv.join(' ')).toBe(
					`/usr/bin/test -s ${TLS_DIR}/fullchain.pem -a -s ${TLS_DIR}/dedalo-local-ca.pem`,
				);
				const lines = execs(commands).map((command) => command.argv.join(' '));
				expect(lines.includes(`/usr/sbin/restorecon -RF ${TLS_DIR}`)).toBe(ctx.row.selinux);
				expect(lines).toContain(
					`/usr/bin/systemctl enable --now dedalo-tls-renew@${INSTANCE}.timer`,
				);
				expect(lines.filter((line) => line.includes('certbot'))).toEqual([]);
				// SELinux (EL): the rule types the directory cert_t; relabelled by host_tls itself.
				const rule = fcontextRules(ctx).find((item) => item.type === 'cert_t');
				expect(rule?.spec).toBe(`${TLS_DIR.replace(/[.^$*+?()[\]{}|\\]/g, '\\$&')}(/.*)?`);
				expect(rule?.path).toBeNull();
			});

			test('the renewal unit: fail-closed bare; merged, the root-owned generator renews this directory and reloads this web server', () => {
				expect(UNIT_TEMPLATES as readonly string[]).toContain('dedalo-tls-renew@.service');
				expect(UNIT_TEMPLATES as readonly string[]).toContain('dedalo-tls-renew@.timer');
				const template = renderTemplate('dedalo-tls-renew@.service', ctx.row, REPO_ROOT);
				const bare = mergedUnit(template, []);
				expect(bare.get('Service.ExecStart')).toEqual(['/bin/false']);
				expect(bare.get('Service.User') ?? []).toEqual([]);
				const write = tlsRenewWrite(ctx);
				expect(write).toMatchObject({
					path: `/etc/systemd/system/dedalo-tls-renew@${INSTANCE}.service.d/10-dedalo-install.conf`,
					mode: 0o644,
					owner: 'root',
					group: 'root',
				});
				const merged = mergedUnit(template, [write.content]);
				expect(merged.get('Service.ExecStart')).toEqual([
					`${BIN_DIR}/dedalo-tls-rotate.sh --mode renew --dir ${TLS_DIR} --reload systemd --unit ${service}`,
				]);
				const timer = mergedUnit(renderTemplate('dedalo-tls-renew@.timer', ctx.row, REPO_ROOT), []);
				expect(timer.get('Timer.Persistent')).toEqual(['true']);
				expect(timer.get('Timer.OnCalendar')?.length).toBe(1);
				expect(timer.get('Install.WantedBy')).toEqual(['timers.target']);
			});

			test('the site names the local CA files and every address; the probe trusts the own authority', () => {
				expect(certificatePaths(ctx)).toEqual({
					fullchain: `${TLS_DIR}/fullchain.pem`,
					key: `${TLS_DIR}/privkey.pem`,
				});
				const site = siteText(ctx, certificatePaths(ctx));
				if (variant.web === 'nginx') {
					const names = [...site.matchAll(/^\tserver_name ([^;]+);$/gm)].map((m) => m[1]);
					expect(names).toEqual([NAMES.join(' '), NAMES.join(' ')]);
				} else {
					expect([...site.matchAll(/^\tServerAlias (.+)$/gm)].map((m) => m[1])).toEqual([
						NAMES.slice(1).join(' '),
						NAMES.slice(1).join(' '),
					]);
					// The name guard admits every address (escaped) and nothing else.
					const guard = /RewriteCond %\{HTTP_HOST\} !\^(.+)\(:443\)\?\$ \[NC\]/.exec(site)?.[1];
					const admits = (host: string) => new RegExp(`^${guard}(:443)?$`, 'i').test(host);
					for (const name of NAMES) expect(admits(name), name).toBe(true);
					for (const other of [
						'demoxlan',
						'demo.lan.evil.org',
						'192.168.1.200',
						'other.example.org',
					])
						expect(admits(other), other).toBe(false);
				}
				const health = publicProbes(ctx, null)[0]?.command.argv ?? [];
				expect(health.slice(health.indexOf('--cacert'), health.indexOf('--cacert') + 2)).toEqual([
					'--cacert',
					`${TLS_DIR}/dedalo-local-ca.pem`,
				]);
				expect(health).not.toContain('--insecure');
			});
		});
	}
});

// ── B. the plan's commands, executed ─────────────────────────────────────────

/** A PATH directory with a systemctl stub that logs its argv and answers 0. */
function systemctlStub(dir: string): { path: string; log: string } {
	const bin = join(dir, 'stub-bin');
	mkdirSync(bin, { recursive: true });
	const log = join(dir, 'systemctl.log');
	writeFileSync(join(bin, 'systemctl'), `#!/bin/sh\nprintf '%s\\n' "$*" >> '${log}'\nexit 0\n`);
	chmodSync(join(bin, 'systemctl'), 0o755);
	return { path: `${bin}:${process.env.PATH ?? '/usr/bin:/bin'}`, log };
}

/** Run a plan argv with the root-owned copy and the certificate directory mapped to this machine. */
function runMapped(argv: readonly string[], dir: string, path?: string) {
	const mapped = argv.map((word) =>
		word === `${BIN_DIR}/dedalo-tls-rotate.sh` ? SCRIPT : word === TLS_DIR ? dir : word,
	);
	const run = Bun.spawnSync(mapped, {
		stdout: 'pipe',
		stderr: 'pipe',
		env: { ...process.env, ...(path === undefined ? {} : { PATH: path }) },
	});
	return { code: run.exitCode, err: run.stderr.toString() };
}

/** `openssl` with these arguments: exit code and output. */
function openssl(args: string[]): { code: number | null; out: string } {
	const run = Bun.spawnSync([OPENSSL as string, ...args], { stdout: 'pipe', stderr: 'pipe' });
	return { code: run.exitCode, out: `${run.stdout.toString()}${run.stderr.toString()}` };
}

/** Does the chain verify against the directory's authority (the issuing CA untrusted, as a browser takes it)? */
function verifies(dir: string, chain: string): boolean {
	return (
		openssl([
			'verify',
			'-CAfile',
			join(dir, 'dedalo-local-ca.pem'),
			'-untrusted',
			join(dir, 'dedalo-issuing-ca.pem'),
			chain,
		]).code === 0
	);
}

/** A leaf for `name`, signed with the directory's issuing key (the key that lives on the server). */
function rogueLeaf(dir: string, name: string, out: string): string {
	// No CN: OpenSSL checks a hostname-like CN against the DNS constraint too, which
	// would refuse an IP leaf for the wrong reason.
	const isIp = /^\d+\.\d+\.\d+\.\d+$/.test(name);
	const ext = join(out, 'ext.cnf');
	writeFileSync(
		ext,
		`subjectAltName=${isIp ? 'IP' : 'DNS'}:${name}\nextendedKeyUsage=serverAuth\n`,
	);
	const key = join(out, 'rogue.key');
	const csr = join(out, 'rogue.csr');
	const crt = join(out, `rogue-${name}.pem`);
	expect(
		openssl([
			'req',
			'-new',
			'-newkey',
			'rsa:2048',
			'-nodes',
			'-keyout',
			key,
			'-out',
			csr,
			'-subj',
			'/O=Dedalo gate rogue leaf',
		]).code,
	).toBe(0);
	expect(
		openssl([
			'x509',
			'-req',
			'-in',
			csr,
			'-CA',
			join(dir, 'dedalo-issuing-ca.pem'),
			'-CAkey',
			join(dir, 'dedalo-issuing-ca.key'),
			'-CAcreateserial',
			'-CAserial',
			join(out, 'rogue.srl'),
			'-out',
			crt,
			'-days',
			'30',
			'-extfile',
			ext,
		]).code,
	).toBe(0);
	return crt;
}

describe('B. the commands the plan renders, executed (real openssl, systemctl stubbed)', () => {
	test('openssl and bash are on PATH (the CI image ships both — absent is RED)', () => {
		expect(OPENSSL).not.toBeNull();
		expect(Bun.which('bash')).not.toBeNull();
	});

	const variant = LOCAL_CA_VARIANTS[0] as (typeof LOCAL_CA_VARIANTS)[number];
	const ctx = productionPlanCtx(variant);
	const dir = join(SCRATCH, 'issue', 'tls');
	mkdirSync(dir, { recursive: true });

	test('the issue: keys 0600, certificates 0644, the leaf names every address and verifies; nothing outside the list does', () => {
		const issue = execs(tlsCommands(ctx)).find((command) =>
			command.argv[0]?.endsWith('dedalo-tls-rotate.sh'),
		) as ExecCommand;
		const run = runMapped(issue.argv, dir);
		expect(run.err).toBe('');
		expect(run.code).toBe(0);
		const modes = Object.fromEntries(
			readdirSync(dir)
				.filter((name) => !name.startsWith('.'))
				.map((name) => [name, (statSync(join(dir, name)).mode & 0o777).toString(8)]),
		);
		expect(modes).toEqual({
			'dedalo-issuing-ca.key': '600',
			'dedalo-issuing-ca.pem': '644',
			'dedalo-issuing-ca.srl': '600',
			'dedalo-local-ca.names': '644',
			'dedalo-local-ca.pem': '644',
			'fullchain.pem': '644',
			'privkey.pem': '600',
		});
		const leaf = new X509Certificate(readFileSync(join(dir, 'fullchain.pem')));
		const san = leaf.subjectAltName ?? '';
		for (const name of NAMES) expect(san).toContain(name);
		const lifeDays = (Date.parse(leaf.validTo) - Date.parse(leaf.validFrom)) / 86_400_000;
		expect(lifeDays).toBeLessThanOrEqual(397);
		expect(verifies(dir, join(dir, 'fullchain.pem'))).toBe(true);
		// The leaked-key case: the issuing key signs, the authority's constraint refuses.
		const out = join(SCRATCH, 'rogue');
		mkdirSync(out, { recursive: true });
		for (const name of NAMES) expect(verifies(dir, rogueLeaf(dir, name, out)), name).toBe(true);
		for (const other of ['bank.example.com', 'example.org', '192.168.1.21'])
			expect(verifies(dir, rogueLeaf(dir, other, out)), other).toBe(false);
	});

	const services = [...new Set(LOCAL_CA_VARIANTS.map((item) => productionPlanCtx(item)))].map(
		(item) => ({ ctx: item, service: item.row.web[item.facts.web.kind].service }),
	);
	const distinct = services.filter(
		(item, index) => services.findIndex((other) => other.service === item.service) === index,
	);

	test('the renewal units of the rows name nginx, apache2 and httpd', () => {
		expect(distinct.map((item) => item.service).sort()).toEqual(['apache2', 'httpd', 'nginx']);
	});

	for (const { ctx: rowCtx, service } of distinct) {
		test(`the renewal drop-in's ExecStart (${service}): nothing to do while fresh; inside its window the SAME authority re-issues the leaf and ${service} is reloaded`, () => {
			const renewDir = join(SCRATCH, `renew-${service}`, 'tls');
			mkdirSync(renewDir, { recursive: true });
			const issue = execs(tlsCommands(rowCtx)).find((command) =>
				command.argv[0]?.endsWith('dedalo-tls-rotate.sh'),
			) as ExecCommand;
			expect(runMapped(issue.argv, renewDir).code).toBe(0);
			const merged = mergedUnit(
				renderTemplate('dedalo-tls-renew@.service', rowCtx.row, REPO_ROOT),
				[tlsRenewWrite(rowCtx).content],
			);
			const argv = systemdWords(merged.get('Service.ExecStart')?.[0] ?? '');
			const stub = systemctlStub(join(SCRATCH, `renew-${service}`));
			const caBefore = readFileSync(join(renewDir, 'dedalo-local-ca.pem'), 'utf8');
			const leafBefore = readFileSync(join(renewDir, 'fullchain.pem'), 'utf8');
			// A fresh certificate: the daily run does nothing, reloads nothing.
			const idle = runMapped(argv, renewDir, stub.path);
			expect(idle.code).toBe(0);
			expect(readFileSync(join(renewDir, 'fullchain.pem'), 'utf8')).toBe(leafBefore);
			// Inside the renewal window (a window wider than the certificate's life = now).
			const due = runMapped([...argv, '--renew-days', '398'], renewDir, stub.path);
			expect(due.err).toBe('');
			expect(due.code).toBe(0);
			expect(readFileSync(join(renewDir, 'dedalo-local-ca.pem'), 'utf8')).toBe(caBefore);
			expect(new X509Certificate(caBefore).fingerprint256).toBe(
				new X509Certificate(readFileSync(join(renewDir, 'dedalo-local-ca.pem'))).fingerprint256,
			);
			const leafAfter = readFileSync(join(renewDir, 'fullchain.pem'), 'utf8');
			expect(leafAfter).not.toBe(leafBefore);
			expect(verifies(renewDir, join(renewDir, 'fullchain.pem'))).toBe(true);
			expect(statSync(join(renewDir, 'privkey.pem')).mode & 0o777).toBe(0o600);
			const calls = readFileSync(stub.log, 'utf8').trim().split('\n');
			expect(calls).toContain(`reload ${service}`);
			expect(calls.filter((line) => line.startsWith('reload ')).length).toBe(1);
			expect(calls.filter((line) => /docker/.test(line))).toEqual([]);
		});
	}
});
