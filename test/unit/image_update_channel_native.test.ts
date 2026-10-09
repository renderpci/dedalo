/**
 * image_update_channel_native — the image-update channel CLI, EXECUTED
 * (installer unification D3/D4, 2026-10-09).
 *
 * scripts/ops/image_update_channel.ts is the ONLY door the Docker host uses to
 * talk to the engine about image updates: deploy/dedalo-image-update.sh asks
 * `check-target`, the opt-in host updater runs every other verb through
 * `docker compose exec|run`. So every verb is run here as the host runs it — a
 * real `bun` process, argv, stdin, exit code, stdout — against a scratch
 * `--dir`, and the files it leaves are read back.
 *
 * What is pinned:
 *   1. check-target's verdict IS the walk rule: for a census of targets around
 *      the running version, exit 0 ⇔ assertLinearUpgrade answers null, and a
 *      refusal prints the id walkRefusalOf names (or malformed_version);
 *   2. heartbeat / outcome accept exactly the closed shapes and stamp their
 *      own instant (seen_at / recorded_at are the CLI's, never the host's);
 *   3. claim moves request → inflight atomically and prints `<id> <tag>`;
 *      a malformed request becomes a `refused / malformed_request` outcome;
 *   4. orphan reports a request in flight; outcome clears it when it answers it;
 *   5. modes: the dir 0750 and every file 0640, whatever the umask.
 *
 * Hermetic: no DB, no network — scratch dirs under the OS tmp dir.
 */

import { afterAll, describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
	type ImageUpdateRequest,
	readChannelStatus,
	writeRequest,
} from '../../src/core/update/image_update_channel.ts';
import { DEDALO_VERSION_TRIPLE } from '../../src/core/update/version.ts';
import {
	assertLinearUpgrade,
	parseImageTag,
	walkRefusalOf,
} from '../../src/core/update/version_walk.ts';

const CLI = join(import.meta.dir, '..', '..', 'scripts', 'ops', 'image_update_channel.ts');
const SCRATCH: string[] = [];

afterAll(() => {
	for (const dir of SCRATCH) rmSync(dir, { recursive: true, force: true });
});

/** A fresh channel dir (not created yet: the CLI creates it with its own mode). */
function scratchDir(): string {
	const parent = mkdtempSync(join(tmpdir(), 'dedalo_image_channel_'));
	SCRATCH.push(parent);
	return join(parent, 'image_update');
}

interface Run {
	code: number;
	out: string;
	err: string;
}

/** Run the CLI exactly as the host does. */
function cli(args: string[], stdin?: string): Run {
	const result = Bun.spawnSync(['bun', CLI, ...args], {
		stdin: stdin === undefined ? 'ignore' : Buffer.from(stdin),
		stdout: 'pipe',
		stderr: 'pipe',
	});
	return {
		code: result.exitCode ?? -1,
		out: result.stdout.toString().trim(),
		err: result.stderr.toString().trim(),
	};
}

const [MAJOR, MINOR, PATCH] = DEDALO_VERSION_TRIPLE;

/** The census of targets around the running version (each a tag the code server could name). */
const TARGETS: readonly string[] = [
	`${MAJOR}.${MINOR}.${PATCH + 1}`, // next patch
	`${MAJOR}.${MINOR + 1}.0`, // next minor
	`${MAJOR + 1}.0.0`, // next major
	`${MAJOR}.${MINOR}.${PATCH}`, // same version, release channel
	`${MAJOR}.${MINOR}.${PATCH}-dev`, // same version, developer image
	`${MAJOR}.${MINOR}.${PATCH + 1}-dev`, // next patch, developer image
	`${MAJOR}.${MINOR}.${PATCH + 2}`, // patch skip
	`${MAJOR}.${MINOR + 2}.0`, // minor skip
	`${MAJOR}.${MINOR + 1}.1`, // minor bump not on .0
	`${MAJOR + 2}.0.0`, // major skip
	`${MAJOR + 1}.1.0`, // major bump not on .0.0
	...(PATCH > 0 ? [`${MAJOR}.${MINOR}.${PATCH - 1}`] : []), // downgrade (patch)
	...(MAJOR > 0 ? [`${MAJOR - 1}.9.9`] : []), // downgrade (major)
];

const MALFORMED: readonly string[] = ['7.0', 'v7.0.1', '7.0.1-beta.1', '7.0.1.dev', '7.0.1;id', ''];

function uuid(): string {
	return crypto.randomUUID();
}

function request(tag: string): ImageUpdateRequest {
	const parsed = parseImageTag(tag);
	if (parsed === null) throw new Error(`bad fixture tag ${tag}`);
	return {
		schema: 1,
		id: uuid(),
		tag,
		version: parsed.version,
		channel: parsed.channel,
		from_version: DEDALO_VERSION_TRIPLE.join('.'),
		requested_at: new Date().toISOString(),
		requested_by: -1,
	};
}

const HEARTBEAT = {
	schema: 1,
	interval_seconds: 60,
	mode: 'pull',
	image: 'ghcr.io/dedalia-org/dedalo',
	pinned: DEDALO_VERSION_TRIPLE.join('.'),
	verify: 'cosign',
	running_digest: `sha256:${'a'.repeat(64)}`,
};

/** An outcome exactly as deploy/dedalo-image-update.sh writes it (its documented shape). */
function outcome(requestId: string | null, overrides: Record<string, unknown> = {}) {
	return {
		schema: 1,
		request_id: requestId,
		from: DEDALO_VERSION_TRIPLE.join('.'),
		to: `${MAJOR}.${MINOR}.${PATCH + 1}`,
		mode: 'pull',
		image: 'ghcr.io/dedalia-org/dedalo',
		status: 'green',
		detail: 'healthy',
		backup: '/backups/db/2026-10-09_101010.pre-image-update.custom.backup',
		digest: `sha256:${'b'.repeat(64)}`,
		started_at: '2026-10-09T10:10:10Z',
		finished_at: '2026-10-09T10:14:02Z',
		...overrides,
	};
}

function readJson(path: string): Record<string, unknown> {
	return JSON.parse(readFileSync(path, 'utf8'));
}

function modeOf(path: string): number {
	return statSync(path).mode & 0o777;
}

describe('check-target: the verdict IS the walk rule', () => {
	test('the census is populated and has both verdicts (anti-vacuity)', () => {
		const verdicts = TARGETS.map((tag) => {
			const parsed = parseImageTag(tag);
			return parsed === null
				? 'malformed'
				: assertLinearUpgrade(DEDALO_VERSION_TRIPLE, parsed.triple, parsed.channel);
		});
		expect(TARGETS.length).toBeGreaterThanOrEqual(11);
		expect(verdicts.filter((verdict) => verdict === null).length).toBeGreaterThanOrEqual(4);
		expect(verdicts.filter((verdict) => verdict !== null).length).toBeGreaterThanOrEqual(6);
	});

	for (const tag of TARGETS) {
		test(`${tag}: exit and reason equal assertLinearUpgrade / walkRefusalOf`, () => {
			const parsed = parseImageTag(tag);
			if (parsed === null) throw new Error(`census tag ${tag} does not parse`);
			const expected = walkRefusalOf(DEDALO_VERSION_TRIPLE, parsed.triple, parsed.channel);
			// the id partition agrees with the sentence rule it is derived from
			expect(expected === null).toBe(
				assertLinearUpgrade(DEDALO_VERSION_TRIPLE, parsed.triple, parsed.channel) === null,
			);
			const run = cli(['check-target', tag, '--dir', scratchDir()]);
			expect(run.code).toBe(expected === null ? 0 : 3);
			expect(run.out).toBe(expected ?? '');
		});
	}

	test('the same version is refused on the release channel and accepted as a developer image', () => {
		const same = DEDALO_VERSION_TRIPLE.join('.');
		expect(cli(['check-target', same]).out).toBe('downgrade_or_same_version');
		expect(cli(['check-target', `${same}-dev`]).code).toBe(0);
	});

	for (const tag of MALFORMED) {
		test(`malformed '${tag}' → exit 3, malformed_version`, () => {
			const run = cli(['check-target', tag]);
			expect(run.code).toBe(3);
			expect(run.out).toBe('malformed_version');
		});
	}

	test('usage errors exit 2 and print nothing on stdout', () => {
		for (const args of [
			[],
			['check-target'],
			['check-target', '7.0.1', 'x'],
			['nope'],
			['status', '--dir'],
		]) {
			const run = cli(args);
			expect(run.code, args.join(' ')).toBe(2);
			expect(run.out).toBe('');
		}
	});
});

describe('heartbeat', () => {
	test('a valid heartbeat is stored with the CLI’s own seen_at, dir 0750 and file 0640', () => {
		const dir = scratchDir();
		const before = Date.now();
		const run = cli(['heartbeat', '--dir', dir], JSON.stringify(HEARTBEAT));
		expect(run.code).toBe(0);
		const stored = readJson(join(dir, 'host_updater.json'));
		expect({ ...stored, seen_at: undefined }).toEqual({ ...HEARTBEAT, seen_at: undefined });
		expect(Date.parse(stored.seen_at as string)).toBeGreaterThanOrEqual(before - 1000);
		expect(modeOf(dir)).toBe(0o750);
		expect(modeOf(join(dir, 'host_updater.json'))).toBe(0o640);
		expect(readChannelStatus(new Date(), dir).host_updater.state).toBe('alive');
	});

	test('a host-supplied seen_at is refused (the instant is the engine’s)', () => {
		const dir = scratchDir();
		const run = cli(
			['heartbeat', '--dir', dir],
			JSON.stringify({ ...HEARTBEAT, seen_at: '2030-01-01T00:00:00Z' }),
		);
		expect(run.code).toBe(2);
		expect(existsSync(join(dir, 'host_updater.json'))).toBe(false);
	});

	const INVALID: Record<string, unknown> = {
		'not JSON': '{',
		'an extra key': { ...HEARTBEAT, docker_sock: '/var/run/docker.sock' },
		'an interval below 10 s': { ...HEARTBEAT, interval_seconds: 5 },
		'an interval above an hour': { ...HEARTBEAT, interval_seconds: 3601 },
		'an image WITH a tag': { ...HEARTBEAT, image: 'ghcr.io/dedalia-org/dedalo:7.0.1' },
		'an unknown mode': { ...HEARTBEAT, mode: 'sideload' },
		'a pinned version outside the tag grammar': { ...HEARTBEAT, pinned: 'latest' },
		'a malformed digest': { ...HEARTBEAT, running_digest: 'sha256:abc' },
		'a wrong schema': { ...HEARTBEAT, schema: 2 },
	};
	for (const [what, body] of Object.entries(INVALID)) {
		test(`refused: ${what}`, () => {
			const dir = scratchDir();
			const run = cli(
				['heartbeat', '--dir', dir],
				typeof body === 'string' ? body : JSON.stringify(body),
			);
			expect(run.code).toBe(2);
			expect(existsSync(join(dir, 'host_updater.json'))).toBe(false);
		});
	}
});

describe('claim / orphan / outcome', () => {
	test('nothing pending: claim and orphan print nothing, exit 0', () => {
		const dir = scratchDir();
		expect(cli(['claim', '--dir', dir])).toEqual({ code: 0, out: '', err: '' });
		expect(cli(['orphan', '--dir', dir])).toEqual({ code: 0, out: '', err: '' });
	});

	test('claim moves the request in flight and prints `<id> <tag>`; a second claim prints nothing', () => {
		const dir = scratchDir();
		const pending = request(`${MAJOR}.${MINOR}.${PATCH + 1}`);
		expect(writeRequest(pending, dir)).toEqual({ ok: true });
		expect(modeOf(join(dir, 'request.json'))).toBe(0o640);

		const run = cli(['claim', '--dir', dir]);
		expect(run).toEqual({ code: 0, out: `${pending.id} ${pending.tag}`, err: '' });
		expect(existsSync(join(dir, 'request.json'))).toBe(false);
		const inflight = readJson(join(dir, 'inflight.json'));
		expect({ ...inflight, claimed_at: undefined }).toEqual({ ...pending, claimed_at: undefined });
		expect(Number.isNaN(Date.parse(inflight.claimed_at as string))).toBe(false);
		expect(modeOf(join(dir, 'inflight.json'))).toBe(0o640);

		expect(cli(['claim', '--dir', dir]).out).toBe('');
		// orphan sees the request in flight (the host died before `outcome`)
		expect(cli(['orphan', '--dir', dir]).out).toBe(`${pending.id} ${pending.tag}`);
	});

	test('a developer request is claimed with its -dev tag', () => {
		const dir = scratchDir();
		const pending = request(`${MAJOR}.${MINOR}.${PATCH}-dev`);
		expect(writeRequest(pending, dir)).toEqual({ ok: true });
		expect(cli(['claim', '--dir', dir]).out).toBe(`${pending.id} ${MAJOR}.${MINOR}.${PATCH}-dev`);
	});

	test('a malformed request is never claimed: it becomes a refused / malformed_request outcome', () => {
		const dir = scratchDir();
		cli(['status', '--dir', dir]); // creates nothing
		writeRequest(request(`${MAJOR}.${MINOR}.${PATCH + 1}`), dir);
		// tamper: a tag that does not name the version it claims
		const path = join(dir, 'request.json');
		writeFileSync(path, JSON.stringify({ ...readJson(path), tag: '9.9.9' }));
		const run = cli(['claim', '--dir', dir]);
		expect(run.code).toBe(0);
		expect(run.out).toBe('');
		expect(existsSync(path)).toBe(false);
		expect(existsSync(join(dir, 'inflight.json'))).toBe(false);
		const recorded = readJson(join(dir, 'last_outcome.json'));
		expect(recorded.status).toBe('refused');
		expect(recorded.detail).toBe('malformed_request');
		expect(recorded.request_id).toBeNull();
	});

	test('an outcome answering the request in flight is recorded and clears it', () => {
		const dir = scratchDir();
		const pending = request(`${MAJOR}.${MINOR}.${PATCH + 1}`);
		writeRequest(pending, dir);
		cli(['claim', '--dir', dir]);
		const result = outcome(pending.id);
		const run = cli(['outcome', '--dir', dir], JSON.stringify(result));
		expect(run.code).toBe(0);
		const recorded = readJson(join(dir, 'last_outcome.json'));
		expect({ ...recorded, recorded_at: undefined }).toEqual({ ...result, recorded_at: undefined });
		expect(modeOf(join(dir, 'last_outcome.json'))).toBe(0o640);
		expect(existsSync(join(dir, 'inflight.json'))).toBe(false);
		expect(readChannelStatus(new Date(), dir).request).toBeNull();
	});

	test('an outcome for ANOTHER request is recorded but leaves the one in flight alone', () => {
		const dir = scratchDir();
		const pending = request(`${MAJOR}.${MINOR}.${PATCH + 1}`);
		writeRequest(pending, dir);
		cli(['claim', '--dir', dir]);
		expect(cli(['outcome', '--dir', dir], JSON.stringify(outcome(uuid()))).code).toBe(0);
		expect(existsSync(join(dir, 'inflight.json'))).toBe(true);
	});

	test('the script’s early-refusal shape is accepted (mode null, from empty, request id null)', () => {
		const dir = scratchDir();
		const early = outcome(null, {
			from: '',
			mode: null,
			image: '',
			status: 'refused',
			detail: 'env_incomplete',
			backup: null,
			digest: null,
		});
		expect(cli(['outcome', '--dir', dir], JSON.stringify(early)).code).toBe(0);
	});

	const INVALID: Record<string, Record<string, unknown>> = {
		'an unknown detail': { detail: 'exploded' },
		'an unknown status': { status: 'maybe' },
		'an extra key': { note: 'hello' },
		'a request id that is not a uuid v4': { request_id: '12345' },
		'a relative backup path': { backup: 'backups/db/x' },
		'an image with a tag': { image: 'ghcr.io/dedalia-org/dedalo:7.0.1' },
		'a host-supplied recorded_at': { recorded_at: '2026-10-09T10:14:02Z' },
	};
	for (const [what, overrides] of Object.entries(INVALID)) {
		test(`outcome refused: ${what}`, () => {
			const dir = scratchDir();
			const run = cli(['outcome', '--dir', dir], JSON.stringify(outcome(uuid(), overrides)));
			expect(run.code).toBe(2);
			expect(existsSync(join(dir, 'last_outcome.json'))).toBe(false);
		});
	}

	test('status prints the channel as JSON (the verb the operator can read by hand)', () => {
		const dir = scratchDir();
		cli(['heartbeat', '--dir', dir], JSON.stringify(HEARTBEAT));
		const pending = request(`${MAJOR}.${MINOR}.${PATCH + 1}`);
		writeRequest(pending, dir);
		const status = JSON.parse(cli(['status', '--dir', dir]).out);
		expect(status.host_updater.state).toBe('alive');
		expect(status.request.id).toBe(pending.id);
		expect(status.request.state).toBe('requested');
		expect(status.last_outcome).toBeNull();
	});
});
