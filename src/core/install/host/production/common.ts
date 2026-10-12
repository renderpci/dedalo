/**
 * THE PRODUCTION HOST STEPS' SHARED VOCABULARY (terminal installer phase 4,
 * 2026-10-12): command builders (an exec is always an absolute binary of the
 * OS row), the instance's names (site file, units), the read-only probes a
 * verify runs, and the result shapes. Every production step module builds on
 * these, so a step reads as its commands.
 */

import { canonicalJson, type InstallState, type PlanFile } from '../../run_files_core.ts';
import type { VerifyResult } from '../../step_loop.ts';
import type { ExecCommand, HostCtx, HostPlanCtx, HostRunResult, RunAs } from '../contract.ts';
import { requestOf, succeeded } from '../execute.ts';
import { sha256Text } from '../fs.ts';
import { type Binary, binaryOf, type WebFlavor } from '../os_support.ts';
import { dropinStamp } from '../systemd/render.ts';

/** An exec command of a row binary. */
export function exec(
	ctx: HostPlanCtx,
	binary: Binary,
	args: readonly string[],
	label: string,
	options: Partial<Omit<ExecCommand, 'kind' | 'argv' | 'label'>> & { as?: RunAs } = {},
): ExecCommand {
	return {
		kind: 'exec',
		argv: [binaryOf(ctx.row, binary), ...args],
		as: options.as ?? 'root',
		label,
		mutates: options.mutates ?? true,
		...options,
	};
}

/** A read-only probe (never mutates — the only kind a verify or an `unless` runs). */
export function probe(
	ctx: HostPlanCtx,
	binary: Binary,
	args: readonly string[],
	label: string,
	options: { as?: RunAs } = {},
): ExecCommand {
	return exec(ctx, binary, args, label, { ...options, mutates: false });
}

/** `systemctl <verb> <units…>`. */
export function systemctl(
	ctx: HostPlanCtx,
	verb: string,
	units: readonly string[],
	label: string,
): ExecCommand {
	return exec(ctx, 'systemctl', [verb, ...units], label);
}

/** Run a probe; answers whether it exited with an accepted code. */
export async function probeOk(ctx: HostCtx, command: ExecCommand): Promise<boolean> {
	return succeeded(command, await ctx.runner.run(requestOf(command, ctx)));
}

/** Run a probe; answers its stdout ('' when it failed). */
export async function probeText(ctx: HostCtx, command: ExecCommand): Promise<string> {
	const result = await ctx.runner.run(requestOf(command, ctx));
	return succeeded(command, result) ? result.stdout : '';
}

/** A verify verdict from a list of (ok, what-is-missing) checks. */
export function verdictOf(
	checks: readonly (readonly [boolean, string])[],
	done: string,
): VerifyResult {
	const missing = checks.filter(([ok]) => !ok).map(([, what]) => what);
	return missing.length === 0
		? { ok: true, detail: done }
		: { ok: false, detail: missing.join('; ') };
}

/** The successful run result. */
export function ran(detail: string, extra: Partial<HostRunResult> = {}): HostRunResult {
	return { ok: true, detail, ...extra };
}

/** The web server flavor this install configures. */
export function webFlavor(ctx: HostPlanCtx): WebFlavor {
	return ctx.row.web[ctx.facts.web.kind];
}

/** This instance's site file path. */
export function sitePath(ctx: HostPlanCtx): string {
	return webFlavor(ctx).sitePath.replace('<i>', ctx.paths.instance);
}

/**
 * The identity a stamp names: the digest of the plan's ANSWERS — never
 * `plan_hash`, which also hashes WHICH secrets were supplied: the Review is
 * computed before the run is handed every secret, and its stamped files must
 * be the bytes the run writes (review equals run — install_host_steps_native).
 */
export function answersDigest(plan: PlanFile): string {
	return sha256Text(canonicalJson(plan.answers));
}

/** The stamp of every file this install writes for the instance. */
export function stampOf(ctx: { plan: PlanFile; paths: { instance: string } }): string {
	return dropinStamp(ctx.paths.instance, answersDigest(ctx.plan));
}

/** The web server's configuration test (nginx -t / apachectl configtest). */
export function configTest(ctx: HostPlanCtx): ExecCommand {
	return ctx.facts.web.kind === 'nginx'
		? probe(ctx, 'nginx', ['-t'], 'test the nginx configuration')
		: probe(ctx, 'apachectl', ['configtest'], 'test the Apache configuration');
}

/**
 * Reload the web server — which applies EVERY pending change of its
 * configuration, another administrator's included (critique A18: the Review
 * says so next to the command).
 */
export function reloadWeb(ctx: HostPlanCtx): ExecCommand {
	return systemctl(
		ctx,
		'reload',
		[webFlavor(ctx).service],
		`reload ${webFlavor(ctx).service} (applies every pending change of its configuration, not only this site's)`,
	);
}

/** The host state's `created.host` (a host run always has it). */
export function hostCreatedOf(state: InstallState) {
	return state.created.host as NonNullable<InstallState['created']['host']>;
}

/** Push `value` into `list` once. */
export function remember(list: string[], value: string): void {
	if (!list.includes(value)) list.push(value);
}

/** `--confirm-database <the operator's value>` — absent when the operator gave none. */
export function confirmFlags(ctx: { confirmDatabase?: string }): string[] {
	return ctx.confirmDatabase === undefined ? [] : ['--confirm-database', ctx.confirmDatabase];
}
