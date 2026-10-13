/**
 * THE DOCKER AND COMPOSE COMMANDS OF THE STACK STEPS (terminal installer
 * phase 4, 2026-10-12) — every docker invocation a docker/trial host step runs
 * is built here, so the shape is decided once:
 *
 *  - argv[0] is the docker CLI stack_preflight FOUND (an absolute path,
 *    frozen in the facts — never a PATH lookup);
 *  - the child's HOME is the OPERATOR's (the runner's fixed environment would
 *    hand the docker CLI root's: no contexts, no registry logins);
 *  - the working directory is the checkout (the stack files' relative paths);
 *  - EVERY compose call carries `-f <stack>`, the build override when it
 *    builds, `-f compose.override.yaml` and `--env-file .dedalo.env` — the
 *    exact argv deploy/dedalo-image-lib.sh dedalo_compose_args emits for the
 *    same stack, so the installer, the image updater and the operator's own
 *    commands drive ONE stack (a compose call without the env file resolves
 *    the built-in defaults: no TLS, no image pin — compose_invocation_tripwire).
 *
 * PURE.
 */

import type { ExecCommand, HostPlanCtx } from '../contract.ts';
import { dockerOf, stackFactsOf } from './facts.ts';
import { BUILD_OVERRIDE, ENV_FILE, OVERRIDE_FILE, stackFileOf } from './layout.ts';

/** What a stack command may set besides its argv and label. */
export type StackCommandOptions = Partial<
	Pick<ExecCommand, 'mutates' | 'stdin' | 'okExit' | 'unless' | 'timeoutMs'>
>;

/** An exec of `binary` as the operator, in the checkout, with the operator's HOME. */
export function stackExec(
	ctx: HostPlanCtx,
	argv: readonly string[],
	label: string,
	options: StackCommandOptions = {},
): ExecCommand {
	return {
		kind: 'exec',
		argv,
		as: 'root',
		label,
		mutates: options.mutates ?? true,
		cwd: ctx.source,
		env: { HOME: stackFactsOf(ctx).home },
		...options,
	};
}

/** `docker <args…>`. */
export function dockerCommand(
	ctx: HostPlanCtx,
	args: readonly string[],
	label: string,
	options: StackCommandOptions = {},
): ExecCommand {
	return stackExec(ctx, [dockerOf(ctx), ...args], label, options);
}

/** The compose file arguments of this stack (the host library's order, then the override). */
export function composeFiles(ctx: HostPlanCtx, variant: 'plain' | 'build' = 'plain'): string[] {
	return [
		'-f',
		stackFileOf(ctx.answers),
		...(variant === 'build' ? ['-f', BUILD_OVERRIDE] : []),
		'-f',
		OVERRIDE_FILE,
		'--env-file',
		ENV_FILE,
	];
}

/** `docker compose -f <stack> [-f build] -f compose.override.yaml --env-file .dedalo.env <args…>`. */
export function composeCommand(
	ctx: HostPlanCtx,
	args: readonly string[],
	label: string,
	options: StackCommandOptions & { variant?: 'plain' | 'build' } = {},
): ExecCommand {
	const { variant, ...rest } = options;
	return dockerCommand(ctx, ['compose', ...composeFiles(ctx, variant), ...args], label, rest);
}

/** A read-only compose command (a probe: the only kind a verify runs). */
export function composeProbe(
	ctx: HostPlanCtx,
	args: readonly string[],
	label: string,
	options: StackCommandOptions = {},
): ExecCommand {
	return composeCommand(ctx, args, label, { timeoutMs: 120_000, ...options, mutates: false });
}

/** A read-only docker command. */
export function dockerProbe(
	ctx: HostPlanCtx,
	args: readonly string[],
	label: string,
	options: StackCommandOptions = {},
): ExecCommand {
	return dockerCommand(ctx, args, label, { timeoutMs: 120_000, ...options, mutates: false });
}
