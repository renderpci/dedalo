#!/usr/bin/env bun
/**
 * THE PRODUCTION-ROUTE DRILL — the terminal installer's host steps (phase 4,
 * 2026-10-12; src/core/install/host/) on a REAL, DISPOSABLE Linux host: a
 * PRIVILEGED container with systemd as PID 1, of the newest supported release
 * (debian:13 by default; --os ubuntu → ubuntu:26.04, --os alma → almalinux:10).
 * Real apt/dnf, real useradd, a real PostgreSQL 18, the real engine install,
 * real systemd units, a real nginx reload, a real first boot, a real backup.
 *
 * OPT-IN, NEVER PART OF `bun test`: it needs a Docker daemon that may start
 * --privileged containers and the network (packages, Bun, npm). `bun run
 * drill:install-host` (engineering/CI.md, local-only drills — a row of
 * test/unit/tier_wiring_tripwire.test.ts LOCAL_ONLY_SCRIPTS). The container is
 * REMOVED in `finally` (unless --keep) — and on SIGINT/SIGTERM too (Bun does
 * not unwind a pending `finally` on a signal: a Ctrl-C would otherwise leave a
 * PRIVILEGED container running). Every drill container carries the label
 * `dedalo.install-drill`, so a leftover is found by
 * `docker ps -a --filter label=dedalo.install-drill`.
 *
 * WHAT IT DOES, as an operator would:
 *   1. copies THIS working tree (tracked + untracked-not-ignored files; no .git,
 *      no node_modules) into the container — the release the bootstrap starts;
 *   2. plants DECOYS: another site's nginx file, another local user;
 *   3. mints a drill CA + a certificate for drill.example.org (the institution's
 *      files mode — no Let's Encrypt from a container), the CA in a directory
 *      marked `.dedalo_install_drill` (the probe's CA seam accepts only that);
 *   4. runs `sh install.sh -- --answers <file> --execute` AS ROOT and KILLS it
 *      (DEDALO_INSTALL_FAULT=<step>:after) after EVERY host step in turn, each
 *      time resuming with `--resume` — then a final `--resume` to completion;
 *   5. checks the outcome from outside the installer: the units active, the
 *      watchdog and backup timers, `nginx -t`, /health over https through the
 *      drill CA, the decoys byte-equal;
 *   6. `--abort --confirm-database` on the LIVE instance: only the host steps
 *      after the engine are undone, the instance and the decoys stay.
 *
 * Flags: --os debian|ubuntu|alma · --web nginx|apache (default nginx; Apache: when
 * the installer stops at the module check with the `a2enmod …` it TOLD, the drill
 * runs that command as the operator would and resumes) · --keep (leave the container) · --no-kills
 * (one uninterrupted run) · --plan (print the legs, touch nothing).
 * Exit: 0 every leg green · 1 a leg red · 2 the drill cannot run here (no
 * docker / no privilege) — RED, never a skip.
 */

import { createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const REPO_ROOT = resolve(import.meta.dir, '..');
const TAG = '[install_host_drill]';
const INSTANCE = 'drill';
const SERVER_NAME = 'drill.example.org';
const DB = `dedalo_${INSTANCE}`;
const ROOT_PASSWORD = `Drill-${randomBytes(6).toString('hex')}-Pw9`;
const SRC = '/opt/dedalo-src';
const DRILL_DIR = '/root/drill';

/** The production host steps, in order (a files-mode install plans no host_web_http). */
const STEPS = [
	'host_preflight',
	'host_packages',
	'host_identity',
	'host_runtime',
	'host_database',
	'host_engine',
	'host_units',
	'host_selinux',
	'host_first_boot',
	'host_watchdog',
	'host_tls',
	'host_web_site',
	'host_public_probe',
	'host_backup_verify',
] as const;

const IMAGES = {
	debian: { base: 'debian:13', family: 'apt' },
	ubuntu: { base: 'ubuntu:26.04', family: 'apt' },
	alma: { base: 'almalinux:10', family: 'dnf' },
} as const;

type OsKey = keyof typeof IMAGES;

type WebKind = 'nginx' | 'apache';

interface Args {
	os: OsKey;
	web: WebKind;
	keep: boolean;
	kills: boolean;
	plan: boolean;
}

class CannotRun extends Error {}

function parseArgs(argv: readonly string[]): Args {
	const at = argv.indexOf('--os');
	const os = (at === -1 ? 'debian' : argv[at + 1]) as OsKey;
	if (!(os in IMAGES)) throw new CannotRun(`--os must be ${Object.keys(IMAGES).join('|')}`);
	const webAt = argv.indexOf('--web');
	const web = (webAt === -1 ? 'nginx' : argv[webAt + 1]) as WebKind;
	if (web !== 'nginx' && web !== 'apache') throw new CannotRun('--web must be nginx|apache');
	return {
		os,
		web,
		keep: argv.includes('--keep'),
		kills: !argv.includes('--no-kills'),
		plan: argv.includes('--plan'),
	};
}

// ── processes ────────────────────────────────────────────────────────────────

interface Ran {
	code: number;
	out: string;
	err: string;
}

async function spawn(
	argv: string[],
	options: { stdin?: Uint8Array; timeoutMs?: number } = {},
): Promise<Ran> {
	const child = Bun.spawn(argv, {
		stdin: options.stdin ?? 'ignore',
		stdout: 'pipe',
		stderr: 'pipe',
	});
	const timer = setTimeout(() => child.kill('SIGKILL'), options.timeoutMs ?? 600_000);
	try {
		const [out, err, code] = await Promise.all([
			new Response(child.stdout).text(),
			new Response(child.stderr).text(),
			child.exited,
		]);
		return { code, out, err };
	} finally {
		clearTimeout(timer);
	}
}

/** A shell command in the container, as root. */
function inContainer(name: string) {
	return (script: string, options: { env?: Record<string, string>; timeoutMs?: number } = {}) =>
		spawn(
			[
				'docker',
				'exec',
				...Object.entries(options.env ?? {}).flatMap(([key, value]) => ['-e', `${key}=${value}`]),
				name,
				'sh',
				'-c',
				script,
			],
			{ timeoutMs: options.timeoutMs ?? 3_600_000 },
		);
}

// ── the container ────────────────────────────────────────────────────────────

/** The drill image: the base, systemd as PID 1, and what an operator's fresh host has. */
function dockerfile(os: OsKey): string {
	const { base, family } = IMAGES[os];
	const install =
		family === 'apt'
			? 'RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends systemd systemd-sysv dbus ca-certificates curl unzip openssl procps iproute2 tar gzip && rm -rf /var/lib/apt/lists/*'
			: 'RUN dnf install -y systemd procps-ng iproute ca-certificates unzip openssl tar gzip findutils && dnf clean all';
	return [`FROM ${base}`, install, 'STOPSIGNAL SIGRTMIN+3', 'CMD ["/sbin/init"]', ''].join('\n');
}

/** The container to remove when the drill is interrupted (null: none, or --keep). */
const cleanup: { name: string | null; keep: boolean } = { name: null, keep: false };

/** Remove the drill container on SIGINT/SIGTERM (once; the drill's own exit codes 130/143). */
function armSignalCleanup(): void {
	const stop = (signal: 'SIGINT' | 'SIGTERM') => {
		if (cleanup.name !== null && !cleanup.keep) {
			console.error(`${TAG} ${signal}: removing container ${cleanup.name}`);
			Bun.spawnSync(['docker', 'rm', '-f', cleanup.name], { stdout: 'ignore', stderr: 'ignore' });
		}
		process.exit(signal === 'SIGINT' ? 130 : 143);
	};
	process.once('SIGINT', () => stop('SIGINT'));
	process.once('SIGTERM', () => stop('SIGTERM'));
}

async function startContainer(args: Args, scratch: string): Promise<string> {
	const version = await spawn(['docker', 'version', '--format', '{{.Server.Version}}']);
	if (version.code !== 0) throw new CannotRun(`no Docker daemon: ${version.err.trim()}`);
	const dir = join(scratch, 'image');
	mkdirSync(dir, { recursive: true });
	const text = dockerfile(args.os);
	writeFileSync(join(dir, 'Dockerfile'), text);
	const tag = `dedalo-install-drill:${createHash('sha256').update(text).digest('hex').slice(0, 12)}`;
	const built = await spawn(['docker', 'build', '-q', '-t', tag, dir], { timeoutMs: 1_800_000 });
	if (built.code !== 0) throw new Error(`docker build: ${built.err}`);
	const name = `dd-install-drill-${randomBytes(4).toString('hex')}`;
	const started = await spawn([
		'docker',
		'run',
		'-d',
		'--privileged',
		'--cgroupns=host',
		'-v',
		'/sys/fs/cgroup:/sys/fs/cgroup:rw',
		'--tmpfs',
		'/run',
		'--tmpfs',
		'/run/lock',
		'--label',
		'dedalo.install-drill=1',
		'--name',
		name,
		'--hostname',
		'drillhost',
		tag,
	]);
	cleanup.name = name;
	if (started.code !== 0)
		throw new CannotRun(`docker run --privileged refused: ${started.err.trim()}`);
	const sh = inContainer(name);
	const booted = await sh(
		'for i in $(seq 1 120); do s=$(systemctl is-system-running 2>/dev/null); [ "$s" = running ] || [ "$s" = degraded ] && exit 0; sleep 0.5; done; exit 1',
	);
	if (booted.code !== 0) throw new Error('systemd did not come up in the container');
	return name;
}

/** This working tree (tracked + untracked-not-ignored, present on disk) into the container. */
async function copySource(name: string, scratch: string): Promise<void> {
	const listed = await spawn([
		'git',
		'-C',
		REPO_ROOT,
		'ls-files',
		'-co',
		'--exclude-standard',
		'-z',
	]);
	if (listed.code !== 0) throw new Error(`git ls-files: ${listed.err}`);
	const files = listed.out
		.split('\0')
		.filter((path) => path !== '' && existsSync(join(REPO_ROOT, path)));
	const list = join(scratch, 'files.txt');
	writeFileSync(list, `${files.join('\n')}\n`);
	const archive = join(scratch, 'source.tar');
	const tar = await spawn(['tar', '-C', REPO_ROOT, '-cf', archive, '-T', list]);
	if (tar.code !== 0) throw new Error(`tar the working tree: ${tar.err}`);
	const copied = await spawn([
		'sh',
		'-c',
		`docker exec -i ${name} sh -c 'mkdir -p ${SRC} && tar -C ${SRC} --no-same-owner -xf -' < '${archive}'`,
	]);
	if (copied.code !== 0) throw new Error(`copy the source in: ${copied.err}`);
}

/** The decoys and the institution's certificate (a drill CA); answers the decoy digest. */
async function prepareHost(sh: ReturnType<typeof inContainer>): Promise<string> {
	const script = [
		'set -e',
		'useradd --create-home --shell /bin/sh museum',
		'mkdir -p /etc/nginx/conf.d',
		"printf 'server {\\n\\tlisten 8081;\\n\\tserver_name shop.example.org;\\n\\treturn 200;\\n}\\n' > /etc/nginx/conf.d/museum-shop.conf",
		`mkdir -p ${DRILL_DIR} /etc/ssl/drill`,
		`touch ${DRILL_DIR}/.dedalo_install_drill`,
		`cd ${DRILL_DIR}`,
		'openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:P-256 -nodes -keyout ca.key -out ca.pem -subj /CN=dedalo-drill-ca -days 30 2>/dev/null',
		`openssl req -newkey ec -pkeyopt ec_paramgen_curve:P-256 -nodes -keyout /etc/ssl/drill/privkey.pem -out leaf.csr -subj /CN=${SERVER_NAME} 2>/dev/null`,
		`printf 'subjectAltName=DNS:${SERVER_NAME}\\n' > leaf.ext`,
		'openssl x509 -req -in leaf.csr -CA ca.pem -CAkey ca.key -CAcreateserial -out leaf.pem -days 30 -extfile leaf.ext 2>/dev/null',
		'cat leaf.pem ca.pem > /etc/ssl/drill/fullchain.pem',
		'chmod 600 /etc/ssl/drill/privkey.pem',
		'sha256sum /etc/nginx/conf.d/museum-shop.conf | cut -d" " -f1',
	].join('\n');
	const prepared = await sh(script);
	if (prepared.code !== 0) throw new Error(`prepare the host: ${prepared.err}`);
	return prepared.out.trim();
}

/** The web server's own facts on the drill host: the site file and the configuration test. */
function webOf(args: Args): { site: string; test: string } {
	if (args.web === 'nginx') return { site: `/etc/nginx/conf.d/dedalo-${INSTANCE}.conf`, test: 'nginx -t' };
	return IMAGES[args.os].family === 'apt'
		? { site: `/etc/apache2/sites-available/dedalo-${INSTANCE}.conf`, test: 'apache2ctl configtest' }
		: { site: `/etc/httpd/conf.d/dedalo-${INSTANCE}.conf`, test: 'httpd -t' };
}

/** The answers file (no secret: the root password travels in the environment). */
async function writeAnswers(sh: ReturnType<typeof inContainer>, args: Args): Promise<void> {
	const answers = {
		schema: 'dedalo.install.answers/1',
		answers: {
			route: 'production',
			instance: INSTANCE,
			entity: 'drill',
			entity_label: 'Drill Museum',
			server_name: SERVER_NAME,
			tls_mode: 'files',
			tls_cert_path: '/etc/ssl/drill/fullchain.pem',
			tls_key_path: '/etc/ssl/drill/privkey.pem',
			web_server: args.web,
			langs: ['lg-eng'],
			app_lang_default: 'lg-eng',
			data_lang_default: 'lg-eng',
			hierarchies: [],
			update_servers: false,
		},
	};
	const json = JSON.stringify(answers).replace(/'/g, "'\\''");
	const written = await sh(`printf '%s' '${json}' > ${DRILL_DIR}/answers.json`);
	if (written.code !== 0) throw new Error(`write the answers: ${written.err}`);
}

// ── the legs ─────────────────────────────────────────────────────────────────

interface Leg {
	name: string;
	ok: boolean;
	detail: string;
}

const ENV = {
	DEDALO_INSTALL_ROOT_PASSWORD: ROOT_PASSWORD,
	DEDALO_INSTALL_PROBE_CA_FILE: `${DRILL_DIR}/ca.pem`,
};

/** One installer run (through the bootstrap), optionally killed after `fault`. */
async function installer(
	sh: ReturnType<typeof inContainer>,
	args: string,
	fault: string | null,
	log: string[],
): Promise<Ran> {
	const run = await sh(`cd ${SRC} && sh install.sh -- ${args} </dev/null`, {
		env: fault === null ? ENV : { ...ENV, DEDALO_INSTALL_FAULT: `${fault}:after` },
		timeoutMs: 3 * 3_600_000,
	});
	log.push(
		`$ sh install.sh -- ${args}${fault === null ? '' : `   [DEDALO_INSTALL_FAULT=${fault}:after]`}`,
		run.out,
		run.err,
		`(exit ${run.code})`,
	);
	return run;
}

const FRESH = `--answers ${DRILL_DIR}/answers.json --execute`;

/**
 * The installer TOLD a module command (Apache: enabling modules is the
 * administrator's) — the drill runs it as the operator would; answers whether it did.
 */
async function enableToldModules(
	sh: ReturnType<typeof inContainer>,
	run: Ran,
	log: string[],
): Promise<boolean> {
	const told = /(a2enmod [a-z0-9_ ]+) && systemctl reload apache2/.exec(`${run.out}${run.err}`)?.[1];
	if (told === undefined) return false;
	const enabled = await sh(`${told} && systemctl reload apache2`);
	log.push(`$ ${told} && systemctl reload apache2`, enabled.out, enabled.err);
	return enabled.code === 0;
}
const RESUME = `--route production --instance ${INSTANCE} --resume`;

/** The install, killed after every step and resumed (or one uninterrupted run). */
async function installLegs(
	sh: ReturnType<typeof inContainer>,
	args: Args,
	log: string[],
): Promise<Leg[]> {
	const legs: Leg[] = [];
	if (!args.kills) {
		let run = await installer(sh, FRESH, null, log);
		if (run.code !== 0 && (await enableToldModules(sh, run, log)))
			run = await installer(sh, RESUME, null, log);
		return [{ name: 'install (uninterrupted)', ok: run.code === 0, detail: `exit ${run.code}` }];
	}
	for (const [index, step] of STEPS.entries()) {
		let run = await installer(sh, index === 0 ? FRESH : RESUME, step, log);
		if (run.code !== 0 && run.code !== 137 && (await enableToldModules(sh, run, log)))
			run = await installer(sh, RESUME, step, log);
		// Killed (137) after the step = it ran and checkpointed; a step not planned never reaches its fault.
		const killed = run.code === 137;
		legs.push({
			name: `kill after ${step}, then resume`,
			ok: killed || run.code === 0,
			detail: `exit ${run.code}`,
		});
		if (!killed && run.code !== 0) return legs;
	}
	const last = await installer(sh, RESUME, null, log);
	legs.push({ name: 'final resume completes', ok: last.code === 0, detail: `exit ${last.code}` });
	return legs;
}

/** The outcome, checked from outside the installer. */
async function outcomeLegs(
	sh: ReturnType<typeof inContainer>,
	decoy: string,
	args: Args,
): Promise<Leg[]> {
	const check = async (name: string, script: string): Promise<Leg> => {
		const run = await sh(script, { timeoutMs: 120_000 });
		return {
			name,
			ok: run.code === 0,
			detail: (run.out + run.err).trim().split('\n').slice(-3).join(' | '),
		};
	};
	return [
		await check('dedalo-ts@drill is active', `systemctl is-active dedalo-ts@${INSTANCE}.service`),
		await check(
			'the watchdog timer is active (armed after the first boot)',
			`systemctl is-active dedalo-ts-watchdog@${INSTANCE}.timer`,
		),
		await check(
			'the backup timer is enabled (after a verified first backup)',
			`systemctl is-enabled dedalo-backup@${INSTANCE}.timer`,
		),
		await check(`${webOf(args).test} passes with the decoy site beside ours`, webOf(args).test),
		await check(
			'/health over https, through the drill CA',
			`curl -fsS --resolve ${SERVER_NAME}:443:127.0.0.1 --cacert ${DRILL_DIR}/ca.pem https://${SERVER_NAME}/health`,
		),
		await check(
			'the decoy site is byte-equal',
			`[ "$(sha256sum /etc/nginx/conf.d/museum-shop.conf | cut -d' ' -f1)" = "${decoy}" ]`,
		),
		await check('the decoy user is untouched', 'getent passwd museum'),
	];
}

/** --abort of the LIVE instance: only the host steps after the engine are undone. */
async function abortLegs(
	sh: ReturnType<typeof inContainer>,
	decoy: string,
	log: string[],
	args: Args,
): Promise<Leg[]> {
	const run = await installer(
		sh,
		`--route production --instance ${INSTANCE} --abort --confirm-database ${DB}`,
		null,
		log,
	);
	const check = async (name: string, script: string): Promise<Leg> => {
		const result = await sh(script, { timeoutMs: 120_000 });
		return {
			name,
			ok: result.code === 0,
			detail: (result.out + result.err).trim().split('\n').slice(-2).join(' | '),
		};
	};
	return [
		{
			name: '--abort of the live instance exits 0',
			ok: run.code === 0,
			detail: `exit ${run.code}`,
		},
		await check('the site file is gone', `[ ! -e ${webOf(args).site} ]`),
		await check('the instance user is KEPT (a live instance)', `getent passwd ded_${INSTANCE}`),
		await check(
			'its database is KEPT',
			`runuser -u postgres -- psql -XAtc "SELECT 1 FROM pg_database WHERE datname='${DB}'" | grep -q 1`,
		),
		await check(
			'the decoy site is byte-equal',
			`[ "$(sha256sum /etc/nginx/conf.d/museum-shop.conf | cut -d' ' -f1)" = "${decoy}" ]`,
		),
		await check(`${webOf(args).test} still passes`, webOf(args).test),
	];
}

function printPlan(args: Args): void {
	console.log(
		`${TAG} os ${args.os} (${IMAGES[args.os].base}), ${args.web}, kills ${args.kills ? 'after every host step' : 'none'}`,
	);
	for (const step of STEPS) console.log(`${TAG}   kill after ${step}, resume`);
	console.log(
		`${TAG}   outcome checks; --abort of the live instance; container removed${args.keep ? ' (kept: --keep)' : ''}`,
	);
}

async function main(): Promise<number> {
	const args = parseArgs(Bun.argv.slice(2));
	printPlan(args);
	if (args.plan) return 0;
	const scratch = mkdtempSync(join(tmpdir(), 'dedalo_install_host_drill_'));
	cleanup.keep = args.keep;
	armSignalCleanup();
	const log: string[] = [];
	let name: string | null = null;
	try {
		name = await startContainer(args, scratch);
		console.log(`${TAG} container ${name} up`);
		const sh = inContainer(name);
		await copySource(name, scratch);
		const decoy = await prepareHost(sh);
		await writeAnswers(sh, args);
		const legs = await installLegs(sh, args, log);
		if (legs.every((leg) => leg.ok)) {
			legs.push(...(await outcomeLegs(sh, decoy, args)));
			legs.push(...(await abortLegs(sh, decoy, log, args)));
		}
		writeFileSync(join(scratch, 'transcript.log'), log.join('\n'));
		for (const leg of legs)
			console.log(`${TAG} ${leg.ok ? 'PASS' : 'FAIL'}  ${leg.name}  — ${leg.detail}`);
		console.log(`${TAG} transcript: ${join(scratch, 'transcript.log')}`);
		return legs.every((leg) => leg.ok) ? 0 : 1;
	} catch (error) {
		writeFileSync(join(scratch, 'transcript.log'), log.join('\n'));
		console.error(`${TAG} ${error instanceof Error ? error.message : String(error)}`);
		console.error(`${TAG} transcript: ${join(scratch, 'transcript.log')}`);
		return error instanceof CannotRun ? 2 : 1;
	} finally {
		if (name !== null && !args.keep) await spawn(['docker', 'rm', '-f', name]);
		if (name !== null && args.keep) console.log(`${TAG} kept container ${name}`);
		if (!args.keep) rmSync(join(scratch, 'source.tar'), { force: true });
	}
}

if (import.meta.main) process.exit(await main());
