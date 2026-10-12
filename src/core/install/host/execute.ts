/**
 * RUNNING AND SHOWING A HOST STEP'S COMMANDS (terminal installer phase 4,
 * 2026-10-12) — the one place a HostCommand becomes an effect (through the
 * runner or the HostFs) and the one place it becomes a Review line. Both read
 * the SAME list (contract.ts: review equals run).
 *
 *  - `as: instance|postgres` becomes a `runuser -u <user> --` prefix: the argv
 *    the runner logs is the argv that ran.
 *  - `stdin: {secrets}` is ONE JSON object of the named secrets, built here
 *    from the run's secrets; the Review shows only the keys.
 *  - an `unless` probe that exits 0 skips its command (already done).
 *  - a failed command refuses the step with its label, its exit code and the
 *    LAST line of its stderr (redacted by the runner) — never the whole output.
 */

import type { Secrets } from '../run_files_core.ts';
import type { ExecCommand, HostCommand, HostCtx } from './contract.ts';
import { sha256Text } from './fs.ts';
import { binaryOf, type OsRow } from './os_support.ts';
import { shellLine } from './quote.ts';
import { hostRefuse } from './refuse.ts';
import type { RunRequest, RunResult } from './runner.ts';

/** The user a command runs as (null = this process). */
function userOf(command: ExecCommand, instanceUser: string): string | null {
	if (command.as === 'instance') return instanceUser;
	return command.as === 'postgres' ? 'postgres' : null;
}

/** The argv as it is run: a runuser prefix for another user. */
export function effectiveArgv(command: ExecCommand, row: OsRow, instanceUser: string): string[] {
	const user = userOf(command, instanceUser);
	return user === null
		? [...command.argv]
		: [binaryOf(row, 'runuser'), '-u', user, '--', ...command.argv];
}

/** The named secrets as one JSON object (only the given ones). */
function secretsJson(keys: readonly string[], secrets: Secrets): string {
	const picked: Record<string, string> = {};
	for (const key of keys) {
		const value = secrets[key as keyof Secrets];
		if (value !== undefined && value !== '') picked[key] = value;
	}
	return JSON.stringify(picked);
}

/** The stdin a command is fed. */
function stdinOf(command: ExecCommand, secrets: Secrets): string | undefined {
	const stdin = command.stdin;
	if (stdin === undefined) return undefined;
	if (!('secrets' in stdin)) return stdin.text;
	const picked = secretsJson(stdin.secrets, secrets);
	return stdin.with === undefined
		? picked
		: JSON.stringify({ ...stdin.with, secrets: JSON.parse(picked) as unknown });
}

/** The runner request of an exec command. */
export function requestOf(command: ExecCommand, ctx: HostCtx): RunRequest {
	const stdin = stdinOf(command, ctx.secrets);
	return {
		argv: effectiveArgv(command, ctx.row, ctx.paths.user),
		...(stdin === undefined ? {} : { stdin }),
		...(command.cwd === undefined ? {} : { cwd: command.cwd }),
		...(command.env === undefined ? {} : { env: command.env }),
		...(command.timeoutMs === undefined ? {} : { timeoutMs: command.timeoutMs }),
	};
}

/** Did the command succeed (its accepted exit codes, no timeout)? */
export function succeeded(command: ExecCommand, result: RunResult): boolean {
	return !result.timedOut && (command.okExit ?? [0]).includes(result.exitCode);
}

/** The refusal of a failed command: its label, exit and stderr's last line. */
function failedSentence(command: ExecCommand, result: RunResult): string {
	const last = result.stderr.trim().split('\n').at(-1) ?? '';
	const why = result.timedOut ? 'timed out' : `exit ${result.exitCode}`;
	return `${command.label} failed (${why})${last === '' ? '' : `: ${last}`}`;
}

/** Run one exec command (its `unless` probe first); answers its result, or null when skipped. */
export async function runExec(command: ExecCommand, ctx: HostCtx): Promise<RunResult | null> {
	if (command.unless !== undefined) {
		const probe = await ctx.runner.run(requestOf(command.unless, ctx));
		if (succeeded(command.unless, probe)) return null;
	}
	const result = await ctx.runner.run(requestOf(command, ctx));
	if (!succeeded(command, result))
		hostRefuse('install.step_failed', failedSentence(command, result));
	return result;
}

/** Apply one command. */
async function applyCommand(command: HostCommand, ctx: HostCtx): Promise<void> {
	if (command.kind === 'exec') {
		await runExec(command, ctx);
	} else if (command.kind === 'write') {
		ctx.fs.write(command.path, command.content, command.mode, command.owner, command.group);
	} else if (command.kind === 'mkdir') {
		ctx.fs.mkdir(command.path, command.mode, command.owner, command.group);
	} else {
		ctx.fs.remove(command.path);
	}
}

/** Apply every command, in order (the first failure refuses the step). */
export async function executeCommands(
	commands: readonly HostCommand[],
	ctx: HostCtx,
): Promise<void> {
	for (const command of commands) await applyCommand(command, ctx);
}

/** A mode as 4 octal digits. */
function octal(mode: number): string {
	return mode.toString(8).padStart(4, '0');
}

/** The stdin part of a Review line (keys only for secrets). */
function stdinText(command: ExecCommand): string {
	const stdin = command.stdin;
	if (stdin === undefined) return '';
	if (!('secrets' in stdin)) return '  < text on stdin';
	const what = stdin.with === undefined ? '' : `${Object.keys(stdin.with).join(', ')} + `;
	return `  < {${what}secrets: ${stdin.secrets.join(', ') || 'none'}} on stdin`;
}

/** One command as the Review shows it (the exact argv; files by path, mode, owner and hash). */
export function commandText(command: HostCommand, row: OsRow, instanceUser: string): string {
	if (command.kind === 'exec') {
		const unless =
			command.unless === undefined
				? ''
				: `  (unless: ${shellLine(effectiveArgv(command.unless, row, instanceUser))})`;
		return `${shellLine(effectiveArgv(command, row, instanceUser))}${stdinText(command)}${unless}`;
	}
	if (command.kind === 'write') {
		return `write ${command.path} (${octal(command.mode)} ${command.owner}:${command.group}, sha256 ${sha256Text(command.content).slice(0, 12)})`;
	}
	if (command.kind === 'mkdir') {
		return `mkdir ${command.path} (${octal(command.mode)} ${command.owner}:${command.group})`;
	}
	return `remove ${command.path}`;
}

/** The digest of a command list (what host_preflight freezes, what a resume compares). */
export function commandsDigest(
	commands: readonly HostCommand[],
	row: OsRow,
	instanceUser: string,
): string {
	return sha256Text(commands.map((command) => commandText(command, row, instanceUser)).join('\n'));
}
