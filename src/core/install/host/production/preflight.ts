/**
 * host_preflight — THE SYSTEM CHECK OF A PRODUCTION RUN (terminal installer
 * phase 4, 2026-10-12). Measures the host (facts.ts) and REFUSES, before any
 * change, everything the later steps would trip on:
 *
 *  - an unsupported system (the sentence lists the supported ones — newest
 *    releases only), no systemd, no root;
 *  - nginx older than 1.25.1 (`http2 on;` — no fallback form);
 *  - the SERVICE ACCOUNT and the INSTALL FOLDER (identity_rules.ts — the same
 *    verdict the identity probe showed): root/system accounts and groups, an
 *    account holding a privileged group, another instance's user, group or
 *    folder (one per instance), a folder that is not the user's and not
 *    empty, a symlinked or foreign-writable path, a folder a web site serves;
 *  - a CLASH under this instance's names: the database or the role (a created
 *    database), a dedalo-ts@<i> unit or drop-in, the site file, the socket,
 *    the server name on our ports in another site file, a non-standard port
 *    held by another program;
 *  - PostgreSQL: another major's cluster on the database port (critique B5 —
 *    a second cluster would be created beside it on another port, and the
 *    engine and pg_dump would disagree about which one holds the database);
 *  - the institution's certificate files (address, expiry, key).
 *
 * Then FREEZES the facts and the digest of every step's commands in the state
 * file (state_types.ts): what the rest of the run, and any resume, executes.
 * The firewall is TOLD (never changed). It creates nothing, so it has no undo;
 * done once, a resume skips it (the frozen facts stand).
 */

import type { HostCtx, HostPlanCtx, HostRunResult, HostStepDefinition } from '../contract.ts';
import { gatherHostFacts, type HostFacts } from '../facts.ts';
import { bunPinOfPaths, pathsFor } from '../layout.ts';
import { NGINX_MIN_VERSION, osRowById, supportedOsList, versionAtLeast } from '../os_support.ts';
import { hostRefuse } from '../refuse.ts';
import { checkCertificateFiles } from '../tls_files.ts';
import { httpNameClash, instanceHttpNames, serverNameClash } from '../web/clash.ts';
import { ran, sitePath } from './common.ts';
import { identityOf, instanceDirs, ownedDirs } from './identity.ts';

/** Refuse with every problem, joined (the operator fixes them all in one pass). */
function refuseAll(problems: readonly string[]): void {
	if (problems.length > 0) hostRefuse('install.state_conflict', problems.join('; '));
}

/** The system itself: supported, systemd, root. */
function systemProblems(facts: HostFacts): string[] {
	if (facts.os === null) {
		return [
			`${facts.osName} is not supported — the production route supports ${supportedOsList()} (newest releases only)`,
		];
	}
	return [
		...(facts.systemd
			? []
			: [
					'systemd is not running (/run/systemd/system is absent) — the instance runs as systemd units',
				]),
		...(facts.euid === 0 ? [] : ['the production route must run as root: sudo sh install.sh …']),
	];
}

/** The web server's configuration probes and its version floor. */
function webProblems(facts: HostFacts): string[] {
	const probes = facts.web.probeFailures.map(
		(line) =>
			`${line} — the installer cannot see the web server's sites; fix its configuration first`,
	);
	const version = facts.web.version;
	if (facts.web.kind !== 'nginx' || version === null) return probes;
	return versionAtLeast(version, NGINX_MIN_VERSION)
		? probes
		: [
				...probes,
				`nginx ${version} is older than ${NGINX_MIN_VERSION} (it rejects \`http2 on;\`) — upgrade nginx first`,
			];
}

/** What already exists under this instance's names (units, site, socket). */
function nameProblems(ctx: HostPlanCtx): string[] {
	const { facts, paths } = ctx;
	const unit = `dedalo-ts@${paths.instance}.service`;
	return [
		...(facts.units.some((item) => item.name === unit && item.state === 'enabled')
			? [`${unit} is already enabled`]
			: []),
		...(facts.dropinExists ? [`${unit} already has drop-ins (/etc/systemd/system/${unit}.d)`] : []),
		...(facts.siteFile.exists ? [`${sitePath(ctx)} already exists`] : []),
		...(facts.socketExists
			? [`the socket ${paths.socket} already exists (another server is listening there)`]
			: []),
	];
}

/** The database side: names taken, another cluster on the port. */
function databaseProblems(ctx: HostPlanCtx): string[] {
	const { facts, answers } = ctx;
	if (answers.db_mode !== 'create') return [];
	const other = facts.pgClusters.find(
		(cluster) =>
			cluster.version !== '18' && (cluster.port === answers.db_port || cluster.port === ''),
	);
	return [
		...(facts.dbExists === true
			? [`database ${answers.db_database} already exists (--db-mode existing uses it as it is)`]
			: []),
		...(facts.roleExists === true
			? [`role ${answers.db_username} already exists (--db-mode existing uses it as it is)`]
			: []),
		...(other === undefined
			? []
			: [
					`PostgreSQL ${other.version} already runs on this host${other.port === '' ? '' : ` on port ${other.port}`} — this install creates the database on PostgreSQL 18; stop that cluster or use --db-mode existing`,
				]),
	];
}

/** The web side: the address served elsewhere on our ports, a port held by another program. */
function addressProblems(ctx: HostPlanCtx): string[] {
	const { facts, answers } = ctx;
	const ports = [answers.http_port, answers.https_port];
	const clash = serverNameClash(facts.web.sites, answers.server_name, ports, sitePath(ctx));
	const named = httpNameClash(
		facts.web.httpNames,
		instanceHttpNames(ctx.paths.instance),
		sitePath(ctx),
	);
	const webProcesses = ['nginx', 'apache2', 'httpd'];
	const held = facts.ports.filter(
		(item) =>
			ports.includes(item.port) &&
			!['80', '443'].includes(item.port) &&
			!webProcesses.includes(item.process),
	);
	return [
		...(clash === null
			? []
			: [`${answers.server_name} is already served on port ${ports.join('/')} by ${clash.file}`]),
		...held.map((item) => `port ${item.port} is held by ${item.process}`),
		...(named === null
			? []
			: [
					`nginx name ${named.name} is already defined in ${named.file} — the site of instance ${ctx.paths.instance} defines it (upstream/zone names are global to nginx): choose another instance name`,
				]),
	];
}

/**
 * The directories: an INSTANCE directory that already exists is someone
 * else's (the answers may point at /var/www, /srv, /etc…) — refused, never
 * handed to the instance user; a shared root one must be a root-owned
 * directory others can traverse (it is used as it is, never re-moded).
 */
function dirProblems(ctx: HostCtx): string[] {
	const owned = ownedDirs(ctx);
	const taken = owned.filter((path) => ctx.fs.exists(path));
	// Only the SHARED root directories: the install folder and its parents are the verdict's.
	const shared = instanceDirs(ctx)
		.filter((spec) => spec.owner === 'root' && !owned.includes(spec.path))
		.filter((spec) => {
			const stat = ctx.fs.stat(spec.path);
			return (
				stat !== null && !(stat.isDirectory && stat.owner === 'root' && (stat.mode & 0o001) !== 0)
			);
		});
	return [
		...taken.map(
			(path) =>
				`${path} already exists — the installer creates the instance's directories itself and never takes over an existing one (remove it or choose another path)`,
		),
		...shared.map(
			(spec) =>
				`${spec.path} exists but is not a root-owned directory others can traverse — the installer never changes it`,
		),
	];
}

/** The institution's own certificate, checked before use. */
function tlsProblems(ctx: HostCtx): { problems: string[]; warnings: string[] } {
	const { answers } = ctx;
	if (answers.tls_mode !== 'files') return { problems: [], warnings: [] };
	const verdict = checkCertificateFiles(
		ctx.fs.readText(answers.tls_cert_path),
		ctx.fs.readText(answers.tls_key_path),
		answers.server_name,
		ctx.now(),
	);
	return {
		problems: verdict.problems.map((problem) => `${answers.tls_cert_path}: ${problem}`),
		warnings: verdict.warnings,
	};
}

/** Every refusal of a supported system's facts. */
function hostProblems(ctx: HostPlanCtx): string[] {
	return [
		...webProblems(ctx.facts),
		...identityOf(ctx).problems,
		...nameProblems(ctx),
		...databaseProblems(ctx),
		...addressProblems(ctx),
	];
}

/**
 * The facts of the live host, measured now. The plan context the steps' command
 * lists are computed from is rebuilt by the executor from the frozen copy.
 */
export async function measure(ctx: HostCtx): Promise<HostFacts> {
	return gatherHostFacts(ctx.runner, ctx.fs, ctx.answers, ctx.paths, osRowById, ctx.source);
}

/** The preflight's own run: measure, refuse, freeze. */
async function runPreflight(
	ctx: HostCtx,
	digest: (facts: HostFacts) => Record<string, string>,
): Promise<HostRunResult> {
	const facts = await measure(ctx);
	refuseAll(systemProblems(facts));
	const planCtx: HostPlanCtx = {
		...ctx,
		facts,
		row: osRowById(facts.os as NonNullable<HostFacts['os']>),
		// The service group is the measured account's (critique B2).
		paths: pathsFor(ctx.answers, bunPinOfPaths(ctx.paths), facts),
	};
	const tls = tlsProblems({ ...ctx, ...planCtx });
	refuseAll([...hostProblems(planCtx), ...dirProblems({ ...ctx, ...planCtx }), ...tls.problems]);
	ctx.state.preflight.host = { facts, commands_digest: digest(facts) };
	return ran(
		`${facts.osName}, ${facts.web.kind}${facts.web.version === null ? ' (to be installed)' : ` ${facts.web.version}`}`,
		{
			warnings: tls.warnings,
			told: [
				...facts.firewall.map((line) => `firewall (checked, not changed): ${line}`),
				...identityOf(planCtx).told,
			],
		},
	);
}

/**
 * The step. `digest` is the host table's: every step's command list for the
 * frozen facts (passed in, so this module does not import the table).
 */
export function preflightStep(
	digest: (facts: HostFacts) => Record<string, string>,
): HostStepDefinition {
	return {
		id: 'host_preflight',
		privilege: 'root',
		kind: 'probe',
		needs: [],
		label: () =>
			'system check: supported OS, root, web server, names free, PostgreSQL, certificate',
		commands: () => [],
		run: (ctx) => runPreflight(ctx, digest),
	};
}
