/**
 * THE DOCKER / TRIAL HOST FACTS (terminal installer phase 4, 2026-10-12) —
 * what the operator's machine IS for the compose stack, measured with
 * READ-ONLY commands through the runner (stack_preflight, and the Review):
 *
 *  - WHICH docker and cosign binaries: an ABSOLUTE path from a closed list of
 *    candidate places (the runner never searches PATH — host/runner.ts), or
 *    null when none is there;
 *  - the Compose v2 plugin's version, whether the daemon answers (as THIS
 *    operator — the daemon socket's group decides), Docker's root directory
 *    and the free space under it;
 *  - the volumes already named like this stack's (`dedalo_*`): an existing
 *    `dedalo_private` is an existing instance, and `--abort` removes ONLY the
 *    volumes this install created (the rest were here before);
 *  - who runs the install (names for the files it writes, the home the docker
 *    CLI reads its contexts and registry logins from — the runner's fixed
 *    environment would otherwise hand it root's).
 *
 * Frozen by stack_preflight in the state file (HostFacts.stack) so a resume
 * runs the commands the run showed (critique A2). Nothing secret is gathered.
 */

import { userInfo } from 'node:os';
import type { HostPlanCtx } from '../contract.ts';
import type { HostFs } from '../fs.ts';
import type { CommandRunner, RunResult } from '../runner.ts';
import { listeningPorts } from '../web/clash.ts';

export interface StackFacts {
	/** The docker CLI (absolute), or null: Docker is not installed. */
	docker: string | null;
	/** `docker compose version --short`, without a leading v; null: no Compose v2 plugin. */
	composeVersion: string | null;
	/** The daemon answered `docker info` as this operator. */
	daemon: boolean;
	dockerRoot: string | null;
	/** Free GiB under the Docker root; null when it cannot be measured (a VM, a remote daemon). */
	freeGib: number | null;
	/** cosign (absolute), or null. */
	cosign: string | null;
	/** The operator: user and group names (the owner of what the install writes), uid, home. */
	user: string;
	group: string;
	uid: number;
	home: string;
	/** The volumes named `dedalo_*` that exist now. */
	volumes: string[];
	/**
	 * The TCP ports something listens on now, with the program when this
	 * operator may see it (`ss -ltnpH`); absent/null: not measurable (no ss —
	 * macOS). The preflight refuses a published port already held (campaign
	 * 3c D2: a held 443 was found only at stack_up, after the build).
	 */
	listening?: { port: string; process: string }[] | null;
}

/** Where a docker CLI is looked for (distribution packages, Docker's own, the snap). */
export const DOCKER_CANDIDATES: readonly string[] = Object.freeze([
	'/usr/bin/docker',
	'/usr/local/bin/docker',
	'/snap/bin/docker',
]);

/** Where cosign is looked for (Sigstore's release binary, the distribution package). */
export const COSIGN_CANDIDATES: readonly string[] = Object.freeze([
	'/usr/local/bin/cosign',
	'/usr/bin/cosign',
]);

/** Where `ss` is looked for (iproute2 — every Linux the routes support; absent on macOS). */
export const SS_CANDIDATES: readonly string[] = Object.freeze([
	'/usr/bin/ss',
	'/usr/sbin/ss',
	'/bin/ss',
	'/sbin/ss',
]);

/** The fixed binaries the stack steps run besides docker and cosign. */
export const STACK_BINARIES = Object.freeze({
	id: '/usr/bin/id',
	df: '/bin/df',
	curl: '/usr/bin/curl',
	bash: '/bin/bash',
	install: '/usr/bin/install',
	test: '/usr/bin/test',
});

/** The facts before anything was measured (the Review of a machine that cannot be). */
export function pendingStackFacts(): StackFacts {
	return {
		docker: null,
		composeVersion: null,
		daemon: false,
		dockerRoot: null,
		freeGib: null,
		cosign: null,
		user: '',
		group: '',
		uid: -1,
		home: '',
		volumes: [],
	};
}

/** The stack facts of a plan context (pending ones before stack_preflight froze them). */
export function stackFactsOf(ctx: HostPlanCtx): StackFacts {
	return ctx.facts.stack ?? pendingStackFacts();
}

/** The docker CLI of a plan context — the first candidate when none was measured (the Review only). */
export function dockerOf(ctx: HostPlanCtx): string {
	return stackFactsOf(ctx).docker ?? (DOCKER_CANDIDATES[0] as string);
}

/** The first candidate that exists (null: none). */
export function firstPresent(fs: HostFs, candidates: readonly string[]): string | null {
	return candidates.find((path) => fs.exists(path)) ?? null;
}

/** One read-only probe (never throws: a missing binary is a non-zero exit). */
async function probe(runner: CommandRunner, argv: string[], home: string): Promise<RunResult> {
	try {
		return await runner.run({ argv, env: { HOME: home }, timeoutMs: 60_000 });
	} catch {
		return { exitCode: 127, stdout: '', stderr: '', timedOut: false };
	}
}

/** stdout trimmed when the probe succeeded, else null. */
function answered(result: RunResult): string | null {
	return result.exitCode === 0 && result.stdout.trim() !== '' ? result.stdout.trim() : null;
}

/**
 * `df -Pk <dir>` → whole GiB available, or null (POSIX df: the second line's
 * fourth field — the port of install.sh's docker_free_gib, whose GNU-only
 * flags once killed the script on macOS and on a Docker root inside a VM).
 */
export function freeGibOf(dfOutput: string): number | null {
	const fields = (dfOutput.split('\n')[1] ?? '').trim().split(/\s+/);
	const kib = fields[3] ?? '';
	return /^\d+$/.test(kib) ? Math.floor(Number(kib) / 1048576) : null;
}

/** The operator's names and id (through the runner, so a scratch run answers for its fake host). */
async function operatorFacts(
	runner: CommandRunner,
	home: string,
): Promise<Pick<StackFacts, 'user' | 'group' | 'uid' | 'home'>> {
	const uid = answered(await probe(runner, [STACK_BINARIES.id, '-u'], home)) ?? '';
	return {
		user: answered(await probe(runner, [STACK_BINARIES.id, '-un'], home)) ?? '',
		group: answered(await probe(runner, [STACK_BINARIES.id, '-gn'], home)) ?? '',
		uid: /^\d+$/.test(uid) ? Number(uid) : -1,
		home,
	};
}

/** Compose, the daemon, its root and the space under it. */
async function daemonFacts(
	runner: CommandRunner,
	docker: string,
	home: string,
): Promise<Pick<StackFacts, 'composeVersion' | 'daemon' | 'dockerRoot' | 'freeGib' | 'volumes'>> {
	const compose = answered(await probe(runner, [docker, 'compose', 'version', '--short'], home));
	const root = answered(
		await probe(runner, [docker, 'info', '--format', '{{.DockerRootDir}}'], home),
	);
	const df =
		root === null ? null : answered(await probe(runner, [STACK_BINARIES.df, '-Pk', root], home));
	const volumes = answered(
		await probe(runner, [docker, 'volume', 'ls', '--format', '{{.Name}}'], home),
	);
	return {
		composeVersion: compose === null ? null : compose.replace(/^v/, ''),
		daemon: root !== null,
		dockerRoot: root,
		freeGib: df === null ? null : freeGibOf(`${df}\n`),
		volumes: (volumes ?? '').split('\n').filter((name) => name.startsWith('dedalo_')),
	};
}

/** The listening TCP ports (see StackFacts.listening): null when `ss` is not here or did not answer. */
async function listeningFacts(
	runner: CommandRunner,
	fs: HostFs,
	home: string,
): Promise<{ port: string; process: string }[] | null> {
	const ss = firstPresent(fs, SS_CANDIDATES);
	if (ss === null) return null;
	const result = await probe(runner, [ss, '-ltnpH'], home);
	return result.exitCode === 0 ? listeningPorts(result.stdout) : null;
}

/** Gather every stack fact (see the header). */
export async function gatherStackFacts(runner: CommandRunner, fs: HostFs): Promise<StackFacts> {
	const home = userInfo().homedir;
	const docker = firstPresent(fs, DOCKER_CANDIDATES);
	const operator = await operatorFacts(runner, home);
	const daemon =
		docker === null
			? { composeVersion: null, daemon: false, dockerRoot: null, freeGib: null, volumes: [] }
			: await daemonFacts(runner, docker, home);
	return {
		...operator,
		...daemon,
		docker,
		cosign: firstPresent(fs, COSIGN_CANDIDATES),
		listening: await listeningFacts(runner, fs, home),
	};
}
