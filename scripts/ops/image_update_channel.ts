/**
 * THE IMAGE-UPDATE CHANNEL CLI — the one door the Docker HOST uses to talk to
 * the engine about image updates (installer unification D3/D4, 2026-10-09).
 *
 *   bun scripts/ops/image_update_channel.ts <verb> [--dir D]
 *
 *   check-target <tag>  may the RUNNING engine walk to <tag> (X.Y.Z | X.Y.Z-dev)?
 *                       exit 0 yes; exit 3 no, the reason id on stdout
 *                       (downgrade_or_same_version | version_skip | malformed_version)
 *   heartbeat           stdin: the host updater's heartbeat JSON; stamps seen_at
 *   claim               prints `<id> <tag>` when it claimed the pending request;
 *                       nothing when there is none (or one is already in flight)
 *   orphan              prints `<id> <tag>` of a request in flight nobody finished
 *   outcome             stdin: the outcome JSON dedalo-image-update.sh wrote
 *   status              prints the channel state as JSON
 *
 * Exit codes: 0 ok, 2 usage or invalid input, 3 check-target refusal.
 *
 * WHO CALLS IT. deploy/dedalo-image-update.sh (`check-target`, through
 * `docker compose exec`) and the opt-in host updater (every other verb). The
 * host never reads the channel files itself: it gets back only what this
 * program validated — a uuid and a tag grammar, or an exit code.
 *
 * WHY A LEAF. It runs inside the image the operator is about to replace, in
 * whatever state that engine is in — install mode included — and must answer
 * fast. So it imports the channel module and the version walk only, never
 * config.ts (which would demand a configured instance and open the pool).
 * The walk is THE rule the tree swap and the panel request use
 * (src/core/update/version_walk.ts), so all three doors agree by construction.
 *
 * Gate: test/unit/image_update_channel_native.test.ts (executes every verb).
 */

import {
	claimRequest,
	imageUpdateDir,
	orphanInflight,
	readChannelStatus,
	recordHeartbeat,
	recordOutcome,
} from '../../src/core/update/image_update_channel.ts';
import { DEDALO_VERSION_TRIPLE } from '../../src/core/update/version.ts';
import { parseImageTag, walkRefusalOf } from '../../src/core/update/version_walk.ts';

const EXIT_OK = 0;
const EXIT_USAGE = 2;
const EXIT_REFUSED = 3;

const USAGE =
	'usage: image_update_channel.ts <check-target <tag> | heartbeat | claim | orphan | outcome | status> [--dir D]';

/** What a verb needs from the world — the seam the in-process path would use. */
export interface CliIo {
	stdin: () => Promise<string>;
	out: (line: string) => void;
	err: (line: string) => void;
	now: () => Date;
}

interface Invocation {
	verb: string | undefined;
	args: string[];
	dir: string;
}

/** Split `--dir D` out of argv; everything else is positional. */
export function parseArgs(argv: readonly string[]): Invocation | null {
	const positional: string[] = [];
	let dir: string | undefined;
	for (let i = 0; i < argv.length; i++) {
		if (argv[i] !== '--dir') {
			positional.push(argv[i] as string);
			continue;
		}
		dir = argv[i + 1];
		if (dir === undefined || dir === '') return null;
		i++;
	}
	return { verb: positional[0], args: positional.slice(1), dir: imageUpdateDir(dir) };
}

function checkTarget(args: readonly string[], io: CliIo): number {
	if (args.length !== 1) return usage(io);
	const target = parseImageTag(args[0]);
	if (target === null) {
		io.out('malformed_version');
		return EXIT_REFUSED;
	}
	const refusal = walkRefusalOf(DEDALO_VERSION_TRIPLE, target.triple, target.channel);
	if (refusal === null) return EXIT_OK;
	io.out(refusal);
	return EXIT_REFUSED;
}

/** stdin as JSON, or undefined when it is not JSON. */
async function readJson(io: CliIo): Promise<unknown> {
	try {
		return JSON.parse(await io.stdin());
	} catch {
		return undefined;
	}
}

async function heartbeat(invocation: Invocation, io: CliIo): Promise<number> {
	if (await recordHeartbeat(await readJson(io), io.now(), invocation.dir)) return EXIT_OK;
	io.err('heartbeat: invalid heartbeat on stdin');
	return EXIT_USAGE;
}

async function outcome(invocation: Invocation, io: CliIo): Promise<number> {
	if (await recordOutcome(await readJson(io), io.now(), invocation.dir)) return EXIT_OK;
	io.err('outcome: invalid outcome on stdin');
	return EXIT_USAGE;
}

async function claim(invocation: Invocation, io: CliIo): Promise<number> {
	const result = await claimRequest(io.now(), invocation.dir);
	if (result.kind === 'claimed') io.out(`${result.inflight.id} ${result.inflight.tag}`);
	if (result.kind === 'malformed')
		io.err('claim: the pending request was malformed — recorded as refused');
	return EXIT_OK;
}

async function orphan(invocation: Invocation, io: CliIo): Promise<number> {
	const result = await orphanInflight(io.now(), invocation.dir);
	if (result.kind === 'orphan') io.out(`${result.inflight.id} ${result.inflight.tag}`);
	if (result.kind === 'malformed')
		io.err('orphan: the request in flight was malformed — recorded as interrupted');
	return EXIT_OK;
}

async function status(invocation: Invocation, io: CliIo): Promise<number> {
	io.out(JSON.stringify(await readChannelStatus(io.now(), invocation.dir)));
	return EXIT_OK;
}

function usage(io: CliIo): number {
	io.err(USAGE);
	return EXIT_USAGE;
}

/** The verbs that take no positional argument. */
const NO_ARG_VERBS: Readonly<
	Record<string, (invocation: Invocation, io: CliIo) => number | Promise<number>>
> = Object.freeze({ heartbeat, outcome, claim, orphan, status });

/** Run one invocation; resolves the exit code. */
export async function runCli(argv: readonly string[], io: CliIo): Promise<number> {
	const invocation = parseArgs(argv);
	if (invocation === null || invocation.verb === undefined) return usage(io);
	if (invocation.verb === 'check-target') return checkTarget(invocation.args, io);
	const verb = NO_ARG_VERBS[invocation.verb];
	if (verb === undefined || invocation.args.length > 0) return usage(io);
	return await verb(invocation, io);
}

if (import.meta.main) {
	const code = await runCli(process.argv.slice(2), {
		stdin: () => Bun.stdin.text(),
		out: (line) => process.stdout.write(`${line}\n`),
		err: (line) => process.stderr.write(`${line}\n`),
		now: () => new Date(),
	});
	process.exit(code);
}
