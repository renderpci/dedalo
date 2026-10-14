/**
 * THE HOST FACTS (terminal installer phase 4, 2026-10-12) — what the machine
 * IS, measured with READ-ONLY commands through the runner and reads through
 * the HostFs: the OS row, privilege, the web server and its version, what
 * PostgreSQL runs, what already exists under the names this instance would
 * take (user, database, role, units, site file, socket, ports), SELinux and
 * the firewall (told, never changed).
 *
 * WHEN: the interactive Review gathers them to show the exact commands; the
 * run's host_preflight gathers them again and FREEZES them in the state file —
 * every later step's commands come from the frozen facts, so a resume runs what
 * the run showed (critique A2). Nothing secret is gathered, and the web
 * configuration dumps are reduced to (file, names, ports) tuples here, before
 * anything keeps them (A11).
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { InstallAnswers } from '../install_plan.ts';
import { type FirewallFacts, parseUfwStatus, words } from './firewall.ts';
import type { HostFs } from './fs.ts';
import type { InstancePaths } from './layout.ts';
import {
	binaryOf,
	nginxVersionOf,
	type OsRow,
	type OsRowId,
	osRowOf,
	parseOsRelease,
} from './os_support.ts';
import {
	type AccountFacts,
	gatherAccountFacts,
	pendingAccountFacts,
	primaryGroupName,
} from './production/account_facts.ts';
import {
	type OtherInstance,
	otherInstances,
	sameNameRecords,
	withPrimaryGroups,
} from './production/instances.ts';
import type { CommandRunner, RunResult } from './runner.ts';
import type { StackFacts } from './stack/facts.ts';
import { CATCH_ALL_STAMP, catchAllPath, type PortDefault, portDefaults } from './web/catch_all.ts';
import {
	apacheRoots,
	apacheSites,
	type HttpName,
	listeningPorts,
	nginxHttpNames,
	nginxSites,
	type SiteTuple,
} from './web/clash.ts';

export type SelinuxMode = 'enforcing' | 'permissive' | 'disabled' | 'absent';

export interface HostFacts {
	/** null = not a supported system (host_preflight refuses with the list). */
	os: OsRowId | null;
	osName: string;
	arch: string;
	/** The CPU has AVX2 (x64: the non-baseline Bun build). */
	avx2: boolean;
	euid: number;
	systemd: boolean;
	web: {
		kind: 'nginx' | 'apache';
		installed: boolean;
		version: string | null;
		sites: SiteTuple[];
		/** nginx http-scope names (upstream / zone) and the file defining each — names only. */
		httpNames: HttpName[];
		apacheModules: string[];
		/** A configuration probe that failed (host_preflight refuses: an unread dump is no evidence). */
		probeFailures: string[];
		/** nginx: each port's `default_server` and its file (web/catch_all.ts keeps an operator's). */
		defaults: PortDefault[];
		/** nginx's host-wide catch-all site (web/catch_all.ts): absent, the installer's, or another file there. */
		catchAll: 'absent' | 'ours' | 'foreign';
	};
	packages: string[];
	/** apt: `pg_lsclusters`; EL: the installed postgresqlNN-server versions (port unknown). */
	pgClusters: { version: string; port: string }[];
	pgInitialized: boolean;
	pgRunning: boolean;
	/** null = PostgreSQL is not running yet (unknowable; it will be created). */
	dbExists: boolean | null;
	roleExists: boolean | null;
	/** The service account and the install folder (production/account_facts.ts). */
	account: AccountFacts;
	/** The other Dédalo instances of this host (production/instances.ts). */
	instances: OtherInstance[];
	/**
	 * An instance ALREADY INSTALLED under this run's name (its registry entry,
	 * its stamped drop-in — instances.ts sameNameRecords; campaign 3d C3d-F1).
	 * Optional: a state frozen before it existed reads as none.
	 */
	taken?: OtherInstance[];
	units: { name: string; state: string }[];
	dropinExists: boolean;
	siteFile: { exists: boolean; ours: boolean };
	socketExists: boolean;
	ports: { port: string; process: string }[];
	selinux: SelinuxMode;
	/**
	 * The policy's path equivalences (`file_contexts.subs_dist` + `.subs`:
	 * `<alias> <target>` — `/var/run /run` on EL 10): a file-context rule must
	 * be written on the TARGET side (production/selinux.ts). [] off the RHEL family.
	 */
	selinuxSubs: (readonly [string, string])[];
	/** What the host firewall reports (firewall.ts gives the verdict — told, never changed). */
	firewall: FirewallFacts;
	certIssued: boolean;
	/** The source tree is a git checkout (its HEAD is the release) — else a verified release tree. */
	sourceIsGit: boolean;
	/** docker/trial only: the compose stack's facts (stack/facts.ts), frozen by stack_preflight. */
	stack?: StackFacts;
}

/** One read-only probe: argv → result (never throws: a missing binary is a non-zero exit). */
async function probe(runner: CommandRunner, argv: string[]): Promise<RunResult> {
	try {
		return await runner.run({ argv, timeoutMs: 60_000 });
	} catch {
		return { exitCode: 127, stdout: '', stderr: '', timedOut: false };
	}
}

/** The OS row and its name. */
function osFacts(fs: HostFs): { os: OsRowId | null; osName: string } {
	const release = parseOsRelease(fs.readText('/etc/os-release') ?? '');
	return {
		os: osRowOf(release)?.id ?? null,
		osName: release.prettyName || release.id || 'unknown',
	};
}

/** The installed packages (names). */
export async function packageFacts(runner: CommandRunner, row: OsRow): Promise<string[]> {
	const result =
		row.tool === 'apt'
			? await probe(runner, [
					binaryOf(row, 'dpkg-query'),
					'-W',
					'-f=${Package} ${db:Status-Abbrev}\\n',
				])
			: await probe(runner, [binaryOf(row, 'rpm'), '-qa', '--qf', '%{NAME}\\n']);
	return result.stdout
		.split('\n')
		.map((line) => line.trim())
		.filter((line) => line !== '' && (row.tool === 'dnf' || / ii\s*$/.test(line)))
		.map((line) => line.split(' ')[0] as string);
}

/** The web server this install configures: the answer, else the one present, else nginx. */
export function webKindOf(answers: InstallAnswers, fs: HostFs): 'nginx' | 'apache' {
	if (answers.web_server === 'nginx' || answers.web_server === 'apache') return answers.web_server;
	if (fs.exists('/usr/sbin/nginx')) return 'nginx';
	return fs.exists('/usr/sbin/apachectl') ? 'apache' : 'nginx';
}

/** A probe's output, or a named failure (a failed dump is never parsed as "nothing there"). */
function probeOutput(result: RunResult, what: string, failures: string[]): string {
	if (result.exitCode === 0) return `${result.stdout}\n${result.stderr}`;
	const last = result.stderr.trim().split('\n').at(-1) ?? '';
	failures.push(`${what} failed (exit ${result.exitCode})${last === '' ? '' : `: ${last}`}`);
	return '';
}

/** nginx: version, every site tuple and the http-scope names (never the dump itself). */
async function nginxFacts(runner: CommandRunner, row: OsRow): Promise<HostFacts['web']> {
	const failures: string[] = [];
	const version = await probe(runner, [binaryOf(row, 'nginx'), '-v']);
	const dump = probeOutput(
		await probe(runner, [binaryOf(row, 'nginx'), '-T']),
		'`nginx -T` (the configuration dump)',
		failures,
	);
	const sites = nginxSites(dump);
	return {
		kind: 'nginx',
		installed: true,
		version: nginxVersionOf(`${version.stderr}${version.stdout}`),
		sites,
		httpNames: nginxHttpNames(dump),
		apacheModules: [],
		probeFailures: failures,
		defaults: portDefaults(sites),
		catchAll: 'absent',
	};
}

/** Apache's site tuples with the directories each vhost file serves (read through the fs). */
function apacheSitesWithRoots(output: string, fs: HostFs): SiteTuple[] {
	return apacheSites(output).map((site) => ({
		...site,
		roots: apacheRoots(fs.readText(site.file) ?? ''),
	}));
}

/** Apache: version, site tuples, loaded modules — through the row's query binary (EL: httpd). */
async function apacheFacts(
	runner: CommandRunner,
	row: OsRow,
	fs: HostFs,
): Promise<HostFacts['web']> {
	const query = binaryOf(row, 'apache-query');
	const failures: string[] = [];
	const version = await probe(runner, [query, '-v']);
	const sites = probeOutput(await probe(runner, [query, '-S']), `\`${query} -S\``, failures);
	const modules = probeOutput(await probe(runner, [query, '-M']), `\`${query} -M\``, failures);
	return {
		kind: 'apache',
		installed: true,
		version: /Apache\/(\d+\.\d+\.\d+)/.exec(version.stdout)?.[1] ?? null,
		sites: apacheSitesWithRoots(sites, fs),
		httpNames: [],
		apacheModules: [...modules.matchAll(/^\s*(\w+)_module/gm)].map((m) => m[1] as string),
		probeFailures: failures,
		defaults: [],
		catchAll: 'absent',
	};
}

/** A web server with nothing measured (not installed yet: nothing to read). */
function emptyWeb(kind: 'nginx' | 'apache'): HostFacts['web'] {
	return {
		kind,
		installed: false,
		version: null,
		sites: [],
		httpNames: [],
		apacheModules: [],
		probeFailures: [],
		defaults: [],
		catchAll: 'absent',
	};
}

/** The web server's facts (not installed yet: nothing to read). */
export async function webFacts(
	runner: CommandRunner,
	fs: HostFs,
	row: OsRow,
	kind: 'nginx' | 'apache',
): Promise<HostFacts['web']> {
	const binary = binaryOf(row, kind === 'nginx' ? 'nginx' : 'apachectl');
	if (!fs.exists(binary)) return emptyWeb(kind);
	if (kind === 'apache') return apacheFacts(runner, row, fs);
	return { ...(await nginxFacts(runner, row)), catchAll: catchAllState(fs, row) };
}

/** The nginx catch-all site file: absent, the installer's (its stamp), or another file at that path. */
function catchAllState(fs: HostFs, row: OsRow): HostFacts['web']['catchAll'] {
	const text = fs.readText(catchAllPath(row.web.nginx));
	if (text === null) return 'absent';
	return text.startsWith(`${CATCH_ALL_STAMP}\n`) ? 'ours' : 'foreign';
}

/** apt: `pg_lsclusters`; EL: the postgresqlNN-server packages. */
async function pgClusterFacts(
	runner: CommandRunner,
	fs: HostFs,
	row: OsRow,
	packages: readonly string[],
): Promise<{ version: string; port: string }[]> {
	if (row.tool === 'dnf') {
		return packages
			.map((name) => /^postgresql(\d+)-server$/.exec(name)?.[1])
			.filter((version): version is string => version !== undefined)
			.map((version) => ({ version, port: '' }));
	}
	if (!fs.exists('/usr/bin/pg_lsclusters')) return [];
	const result = await probe(runner, [binaryOf(row, 'pg_lsclusters'), '--no-header']);
	return result.stdout
		.split('\n')
		.map((line) => line.trim().split(/\s+/))
		.filter((cols) => /^\d+$/.test(cols[0] ?? '') && /^\d+$/.test(cols[2] ?? ''))
		.map((cols) => ({ version: cols[0] as string, port: cols[2] as string }));
}

/** A SQL string literal (the names are validated by the plan; quotes doubled anyway). */
export function sqlLiteral(value: string): string {
	return `'${value.replace(/'/g, "''")}'`;
}

/** Does the database / the role exist? (PostgreSQL running; null each when it is not.) */
async function pgObjectFacts(
	runner: CommandRunner,
	row: OsRow,
	answers: InstallAnswers,
	running: boolean,
): Promise<{ dbExists: boolean | null; roleExists: boolean | null }> {
	if (!running) return { dbExists: null, roleExists: null };
	const sql = `SELECT (SELECT count(*) FROM pg_database WHERE datname = ${sqlLiteral(answers.db_database)}) || ' ' || (SELECT count(*) FROM pg_roles WHERE rolname = ${sqlLiteral(answers.db_username)})`;
	const result = await probe(runner, [
		binaryOf(row, 'runuser'),
		'-u',
		'postgres',
		'--',
		`${row.pgBinDir}/psql`,
		'-XAtq',
		'-d',
		'postgres',
		'-c',
		sql,
	]);
	// Exactly "<n> <n>", or unknown — a psql that failed answers nothing, never "exists".
	const counts = /^(\d+) (\d+)$/.exec(result.stdout.trim());
	if (counts === null) return { dbExists: null, roleExists: null };
	return { dbExists: counts[1] !== '0', roleExists: counts[2] !== '0' };
}

/** The dedalo-* unit files and their enablement state. */
async function unitFacts(
	runner: CommandRunner,
	row: OsRow,
): Promise<{ name: string; state: string }[]> {
	const result = await probe(runner, [
		binaryOf(row, 'systemctl'),
		'list-unit-files',
		'dedalo-*',
		'--no-legend',
		'--no-pager',
	]);
	return result.stdout
		.split('\n')
		.map((line) => line.trim().split(/\s+/))
		.filter((cols) => (cols[0] ?? '') !== '')
		.map((cols) => ({ name: cols[0] as string, state: cols[1] ?? '' }));
}

/** SELinux's mode (RHEL family only; absent elsewhere). */
async function selinuxFacts(runner: CommandRunner, fs: HostFs, row: OsRow): Promise<SelinuxMode> {
	if (!row.selinux || !fs.exists(binaryOf(row, 'getenforce'))) return 'absent';
	const mode = (await probe(runner, [binaryOf(row, 'getenforce')])).stdout.trim().toLowerCase();
	return mode === 'enforcing' || mode === 'permissive' ? mode : 'disabled';
}

/** The loaded policy's name (/etc/selinux/config SELINUXTYPE=, else `targeted`). */
function selinuxPolicy(fs: HostFs): string {
	const type = /^\s*SELINUXTYPE=([A-Za-z0-9_-]+)\s*$/m.exec(
		fs.readText('/etc/selinux/config') ?? '',
	);
	return type?.[1] ?? 'targeted';
}

/** `<alias> <target>` lines of a subs file (comments and malformed lines dropped). */
export function parseSubs(text: string): [string, string][] {
	return text
		.split('\n')
		.map((line) => line.replace(/#.*/, '').trim().split(/\s+/))
		.filter((cols) => cols.length === 2 && cols.every((col) => col.startsWith('/')))
		.map((cols) => [cols[0] as string, cols[1] as string]);
}

/** The policy's path equivalences, the operator's (.subs) before the distribution's (RHEL family). */
function selinuxSubsFacts(fs: HostFs, row: OsRow): [string, string][] {
	if (!row.selinux) return [];
	const dir = `/etc/selinux/${selinuxPolicy(fs)}/contexts/files`;
	return [
		...parseSubs(fs.readText(`${dir}/file_contexts.subs`) ?? ''),
		...parseSubs(fs.readText(`${dir}/file_contexts.subs_dist`) ?? ''),
	];
}

/** One firewall-cmd query's words, or null when it failed. */
async function firewallCmd(
	runner: CommandRunner,
	row: OsRow,
	args: readonly string[],
): Promise<string | null> {
	const result = await probe(runner, [binaryOf(row, 'firewall-cmd'), ...args]);
	return result.exitCode === 0 ? result.stdout : null;
}

/** firewalld's DEFAULT zone, its services and ports (firewall.ts reads them). */
async function firewalldFacts(runner: CommandRunner, row: OsRow): Promise<FirewallFacts> {
	const zone = (await firewallCmd(runner, row, ['--get-default-zone']))?.trim() ?? '';
	if (zone === '') return { tool: 'unknown', what: '`firewall-cmd --get-default-zone`' };
	const services = await firewallCmd(runner, row, [`--zone=${zone}`, '--list-services']);
	const ports = await firewallCmd(runner, row, [`--zone=${zone}`, '--list-ports']);
	if (services === null || ports === null) {
		return {
			tool: 'unknown',
			what: `\`firewall-cmd --zone=${zone} --list-services/--list-ports\``,
		};
	}
	return { tool: 'firewalld', zone, services: words(services), ports: words(ports) };
}

/** What the host firewall reports (told, never changed by the installer). */
export async function firewallFacts(
	runner: CommandRunner,
	fs: HostFs,
	row: OsRow,
): Promise<FirewallFacts> {
	const active = await probe(runner, [binaryOf(row, 'systemctl'), 'is-active', 'firewalld']);
	if (active.exitCode === 0) return firewalldFacts(runner, row);
	if (!fs.exists(binaryOf(row, 'ufw'))) return { tool: 'none' };
	const status = await probe(runner, [binaryOf(row, 'ufw'), 'status']);
	if (status.exitCode !== 0) return { tool: 'unknown', what: '`ufw status`' };
	return { tool: 'ufw', ...parseUfwStatus(status.stdout) };
}

/** The architecture and AVX2 (the Bun asset choice). */
async function cpuFacts(
	runner: CommandRunner,
	fs: HostFs,
): Promise<{ arch: string; avx2: boolean }> {
	const arch = (await probe(runner, ['/usr/bin/uname', '-m'])).stdout.trim();
	return { arch, avx2: /\bavx2\b/.test(fs.readText('/proc/cpuinfo') ?? '') };
}

/** What exists under this instance's names (units, site file, socket, certificate). */
async function nameFacts(
	runner: CommandRunner,
	fs: HostFs,
	row: OsRow,
	paths: InstancePaths,
	kind: 'nginx' | 'apache',
): Promise<Pick<HostFacts, 'units' | 'dropinExists' | 'siteFile' | 'socketExists' | 'certIssued'>> {
	const sitePath = row.web[kind].sitePath.replace('<i>', paths.instance);
	const site = fs.readText(sitePath);
	return {
		units: await unitFacts(runner, row),
		dropinExists: fs.exists(`/etc/systemd/system/dedalo-ts@${paths.instance}.service.d`),
		siteFile: {
			exists: site !== null,
			ours: site?.startsWith(`# dedalo-install ${paths.instance} `) === true,
		},
		socketExists: paths.socket !== '' && fs.exists(paths.socket),
		certIssued: fs.exists(`/etc/letsencrypt/live/dedalo-${paths.instance}/fullchain.pem`),
	};
}

/** PostgreSQL's state on this host. */
async function pgFacts(
	runner: CommandRunner,
	fs: HostFs,
	row: OsRow,
	answers: InstallAnswers,
	packages: readonly string[],
): Promise<
	Pick<HostFacts, 'pgClusters' | 'pgInitialized' | 'pgRunning' | 'dbExists' | 'roleExists'>
> {
	const running =
		(await probe(runner, [binaryOf(row, 'systemctl'), 'is-active', row.pgService])).exitCode === 0;
	return {
		pgClusters: await pgClusterFacts(runner, fs, row, packages),
		pgInitialized: row.tool === 'apt' || fs.exists('/var/lib/pgsql/18/data/PG_VERSION'),
		pgRunning: running,
		...(await pgObjectFacts(runner, row, answers, running)),
	};
}

/** The facts of an UNSUPPORTED system: only what names it (host_preflight refuses). */
function unsupportedFacts(os: { os: OsRowId | null; osName: string }, euid: number): HostFacts {
	return {
		...os,
		arch: '',
		avx2: false,
		euid,
		systemd: false,
		web: emptyWeb('nginx'),
		packages: [],
		pgClusters: [],
		pgInitialized: false,
		pgRunning: false,
		dbExists: null,
		roleExists: null,
		account: pendingAccountFacts(),
		instances: [],
		units: [],
		dropinExists: false,
		siteFile: { exists: false, ours: false },
		socketExists: false,
		ports: [],
		selinux: 'absent',
		selinuxSubs: [],
		firewall: { tool: 'none' },
		certIssued: false,
		sourceIsGit: false,
	};
}

/** The facts before host_preflight measured anything (only the preflight runs with these). */
export function pendingFacts(): HostFacts {
	return unsupportedFacts({ os: null, osName: 'not measured yet' }, -1);
}

/** The effective user id (through the runner, so a scratch run answers for its fake host). */
async function euidOf(runner: CommandRunner): Promise<number> {
	const result = await probe(runner, ['/usr/bin/id', '-u']);
	return /^\d+$/.test(result.stdout.trim()) ? Number(result.stdout.trim()) : -1;
}

/**
 * The identity facts (the service account, the install folder, the other
 * instances) — from the ANSWERS alone: the service group the instance paths
 * carry is decided by these (layout.ts serviceGroupOf).
 */
export async function gatherIdentityFacts(
	runner: CommandRunner,
	fs: HostFs,
	row: OsRow,
	answers: InstallAnswers,
): Promise<Pick<HostFacts, 'account' | 'instances' | 'taken'>> {
	return {
		taken: sameNameRecords(fs, answers.instance),
		account: await gatherAccountFacts(runner, fs, row, answers),
		instances: await withPrimaryGroups(otherInstances(fs, answers.instance), (user) =>
			primaryGroupName(runner, row, user),
		),
	};
}

/**
 * Gather every fact (see the header). `paths` names the instance's units,
 * site file and socket — instance-derived names only (its group is not read:
 * the account facts decide it).
 */
export async function gatherHostFacts(
	runner: CommandRunner,
	fs: HostFs,
	answers: InstallAnswers,
	paths: InstancePaths,
	rowOf: (id: OsRowId) => OsRow,
	source: string,
): Promise<HostFacts> {
	const os = osFacts(fs);
	const euid = await euidOf(runner);
	if (os.os === null) return unsupportedFacts(os, euid);
	const row = rowOf(os.os);
	const packages = await packageFacts(runner, row);
	const kind = webKindOf(answers, fs);
	const ss = await probe(runner, [binaryOf(row, 'ss'), '-ltnpH']);
	return {
		...os,
		...(await cpuFacts(runner, fs)),
		euid,
		systemd: fs.exists('/run/systemd/system'),
		web: await webFacts(runner, fs, row, kind),
		packages,
		...(await pgFacts(runner, fs, row, answers, packages)),
		...(await gatherIdentityFacts(runner, fs, row, answers)),
		...(await nameFacts(runner, fs, row, paths, kind)),
		ports: listeningPorts(ss.stdout),
		selinux: await selinuxFacts(runner, fs, row),
		selinuxSubs: selinuxSubsFacts(fs, row),
		firewall: await firewallFacts(runner, fs, row),
		sourceIsGit: existsSync(join(source, '.git')),
	};
}
