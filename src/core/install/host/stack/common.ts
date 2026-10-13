/**
 * THE STACK STEPS' SHARED VOCABULARY (terminal installer phase 4, 2026-10-12):
 * the record of what this install created (`created.stack`), checkout paths,
 * the .dedalo.env reader, the bounded poll, and the generated database password.
 */

import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import type { ExecCommand, HostCommand, HostCtx, HostPlanCtx } from '../contract.ts';
import { requestOf, succeeded } from '../execute.ts';
import { remember } from '../production/common.ts';
import type { RunResult } from '../runner.ts';
import type { StackCreated } from '../state_types.ts';
import { stackFactsOf } from './facts.ts';
import { CERT_DIR, ENV_FILE } from './layout.ts';

/** The empty record (nothing created yet). */
export function emptyStackCreated(): StackCreated {
	return {
		env_file: false,
		override: false,
		generated_conf: false,
		certs: [],
		volumes: [],
		containers_started: false,
		image: null,
	};
}

/** This run's `created.stack` (made on first use). */
export function stackCreated(ctx: HostCtx): StackCreated {
	ctx.created.stack ??= emptyStackCreated();
	return ctx.created.stack;
}

/** A checkout-relative path as a host path. */
export function inCheckout(ctx: HostPlanCtx, relative: string): string {
	return join(ctx.source, relative);
}

/**
 * deploy/certs, the operator's, 0700 (private keys live there; both stack files
 * bind-mount it, and compose would create a missing one as root).
 */
export function certDirCommand(ctx: HostPlanCtx): HostCommand {
	const facts = stackFactsOf(ctx);
	return {
		kind: 'mkdir',
		path: inCheckout(ctx, CERT_DIR),
		mode: 0o700,
		owner: facts.user,
		group: facts.group,
		label: 'the certificate directory nginx mounts',
	};
}

/** Record the volumes of `names` that did not exist before this install (the facts say which did). */
export function rememberNewVolumes(
	ctx: HostCtx,
	names: readonly string[],
	existed: readonly string[],
): void {
	for (const name of names) if (!existed.includes(name)) remember(stackCreated(ctx).volumes, name);
}

/**
 * The value a `.dedalo.env` text assigns to `key` (the LAST assignment wins,
 * as compose and deploy/dedalo-image-lib.sh dedalo_env_get read it), or ''.
 * Only the unquoted `KEY=value` lines the installer itself writes.
 */
export function envFileValue(text: string | null, key: string): string {
	let value = '';
	for (const line of (text ?? '').split('\n')) {
		if (line.startsWith(`${key}=`)) value = line.slice(key.length + 1).trim();
	}
	return value;
}

/** The stack's database password, as .dedalo.env holds it ('' before stack_files wrote it). */
export function databasePassword(ctx: HostCtx): string {
	return envFileValue(ctx.fs.readText(inCheckout(ctx, ENV_FILE)), 'POSTGRES_PASSWORD');
}

const PASSWORD_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

/**
 * A new database password: 32 characters of [A-Za-z0-9] (about 190 bits),
 * unbiased (bytes above the last whole multiple of the alphabet are dropped).
 * Never shown, never in argv: it lives in .dedalo.env (0600) and reaches the
 * engine child on stdin.
 */
export function generatedPassword(): string {
	const limit = 256 - (256 % PASSWORD_ALPHABET.length);
	let out = '';
	while (out.length < 32) {
		for (const byte of randomBytes(48)) {
			if (byte < limit && out.length < 32)
				out += PASSWORD_ALPHABET[byte % PASSWORD_ALPHABET.length];
		}
	}
	return out;
}

/** The bound and cadence of a wait (an engine's first boot can take minutes). */
export interface PollBound {
	limitMs: number;
	everyMs: number;
	/** A progress line every N polls (0 = none). */
	progressEvery: number;
	what: string;
}

/** A progress line on every `progressEvery`-th poll. */
function progress(ctx: HostCtx, bound: PollBound, polls: number, start: number): void {
	if (bound.progressEvery > 0 && polls % bound.progressEvery === 0) {
		ctx.say(`    still waiting for ${bound.what} (${Math.round((ctx.now() - start) / 1000)} s)`);
	}
}

/**
 * Poll `ready` until it answers true or the bound passes; answers whether it
 * did. Bounded by the clock AND by the number of polls the bound allows, so a
 * clock that does not move (a gate's) still ends.
 */
export async function pollUntil(
	ctx: HostCtx,
	bound: PollBound,
	ready: () => Promise<boolean>,
): Promise<boolean> {
	const start = ctx.now();
	const maxPolls = Math.ceil(bound.limitMs / bound.everyMs) + 1;
	for (let polls = 1; polls <= maxPolls && ctx.now() - start <= bound.limitMs; polls++) {
		if (await ready()) return true;
		progress(ctx, bound, polls, start);
		await ctx.sleep(bound.everyMs);
	}
	return false;
}

/**
 * Run one command; on failure hand its result to `refuse` (which throws the
 * step's own sentence — never the command's raw output). Answers the result.
 */
export async function execute(
	ctx: HostCtx,
	command: ExecCommand,
	refuse: (result: RunResult) => never,
): Promise<RunResult> {
	const result = await ctx.runner.run(requestOf(command, ctx));
	if (!succeeded(command, result)) refuse(result);
	return result;
}
