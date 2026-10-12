/**
 * THE HOST STEP TABLE (terminal installer phase 4, 2026-10-12) — every host
 * step id → its definition (contract.ts), EXHAUSTIVE: a new id in
 * install_plan.ts fails to compile until it has a row. Production rows live
 * in production/, docker/trial rows in stack/ (its package's).
 *
 * Also here: the Review's command list of a plan (`hostReview`) and the digest
 * host_preflight freezes — both computed from the SAME `commands()` the run
 * executes (review equals run).
 */

import type { HostStepId, ProductionHostStepId } from '../install_plan.ts';
import type { HostPlanCtx, HostStepDefinition } from './contract.ts';
import { commandsDigest, commandText } from './execute.ts';
import type { HostFacts } from './facts.ts';
import { osRowById } from './os_support.ts';
import { host_backup_verify } from './production/backup_verify.ts';
import { host_database } from './production/database.ts';
import { host_engine } from './production/engine_delegate.ts';
import { host_first_boot } from './production/first_boot.ts';
import { host_identity } from './production/identity.ts';
import { host_packages } from './production/packages.ts';
import { preflightStep } from './production/preflight.ts';
import { host_public_probe } from './production/public_probe.ts';
import { host_runtime } from './production/runtime.ts';
import { host_selinux } from './production/selinux.ts';
import { host_tls } from './production/tls.ts';
import { host_units } from './production/units.ts';
import { host_watchdog } from './production/watchdog.ts';
import { host_web_http, host_web_site } from './production/web.ts';
import { STACK_HOST_STEPS } from './stack/table.ts';

/** The production rows after the preflight (the preflight digests their commands). */
const PRODUCTION_ROWS: {
	readonly [K in Exclude<ProductionHostStepId, 'host_preflight'>]: HostStepDefinition;
} = Object.freeze({
	host_packages,
	host_identity,
	host_runtime,
	host_database,
	host_engine,
	host_units,
	host_selinux,
	host_first_boot,
	host_watchdog,
	host_web_http,
	host_tls,
	host_web_site,
	host_public_probe,
	host_backup_verify,
});

/** The plan context minus the facts (and the row they decide) — read when the preflight digests. */
export type HostBaseCtx = Omit<HostPlanCtx, 'facts' | 'row'>;

/** The digest of every production step's commands for `facts` (host_preflight freezes it). */
function digestFor(base: HostBaseCtx, facts: HostFacts): Record<string, string> {
	const row = osRowById(facts.os as NonNullable<HostFacts['os']>);
	const ctx: HostPlanCtx = { ...base, facts, row };
	const digest: Record<string, string> = {};
	for (const step of ctx.plan.steps) {
		const definition = PRODUCTION_ROWS[step as keyof typeof PRODUCTION_ROWS];
		if (definition !== undefined)
			digest[step] = commandsDigest(definition.commands(ctx), row, ctx.paths.user);
	}
	return digest;
}

/**
 * The whole host table; `base` is read only when the preflight digests (the
 * run's plan context — a caller that only reads labels or `needs` never calls it).
 */
export function hostTable(base: () => HostBaseCtx): {
	readonly [K in HostStepId]: HostStepDefinition;
} {
	return {
		host_preflight: preflightStep((facts) => digestFor(base(), facts)),
		...PRODUCTION_ROWS,
		...STACK_HOST_STEPS,
	};
}

/** One step's Review block: its label and the exact commands it will run. */
export interface HostReviewBlock {
	step: HostStepId;
	label: string;
	commands: string[];
}

/** The Review's host commands of a plan, for the facts measured (review equals run). */
export function hostReview(ctx: HostPlanCtx): HostReviewBlock[] {
	const table = hostTable(() => ctx);
	return (ctx.plan.steps as HostStepId[])
		.filter((step) => step in table)
		.map((step) => ({
			step,
			label: table[step].label(ctx.plan),
			commands: table[step]
				.commands(ctx)
				.map((command) => commandText(command, ctx.row, ctx.paths.user)),
		}));
}

/** The digest of one step's commands now (a resume compares it with the frozen one). */
export function stepDigest(definition: HostStepDefinition, ctx: HostPlanCtx): string {
	return commandsDigest(definition.commands(ctx), ctx.row, ctx.paths.user);
}
