/**
 * THE DOCKER / TRIAL HOST STEPS (terminal installer phase 4, 2026-10-12) —
 * every stack step id (install_plan.ts STACK_HOST_STEP_IDS) → its definition,
 * EXHAUSTIVE: a new id fails to compile until it has a row. Run by the HOST
 * executor as the OPERATOR (no root), its record in <checkout>/.dedalo-install/:
 *
 *   stack_preflight  Docker, Compose v2, disk, no instance yet, the image source; facts frozen
 *   stack_image      pull + verify (cosign, version label) — or build here
 *   stack_tls        docker only: Let's Encrypt | local CA | the institution's files
 *   stack_files      .dedalo.env (0600), compose.override.yaml, the full stack's nginx site
 *   stack_database   PostgreSQL up
 *   stack_engine     the ENGINE steps, delegated into the container (the same headless executor)
 *   stack_up         the engine, then the whole stack
 *   stack_health     /health through nginx, the media gate (docker); trial says it has none
 *
 * Also here: the digest stack_preflight freezes — every stack step's command
 * list for the facts it measured (review equals run, across a resume too).
 */

import type { StackHostStepId } from '../../install_plan.ts';
import type { HostPlanCtx, HostStepDefinition } from '../contract.ts';
import { commandsDigest } from '../execute.ts';
import { stack_database } from './database.ts';
import { stack_engine } from './engine_delegate.ts';
import { stack_files } from './files.ts';
import { stack_health } from './health.ts';
import { stack_image } from './image.ts';
import { stackPreflightStep } from './preflight.ts';
import { stack_tls } from './tls.ts';
import { stack_up } from './up.ts';

/** The rows after the preflight (the preflight digests their commands). */
const STACK_ROWS: {
	readonly [K in Exclude<StackHostStepId, 'stack_preflight'>]: HostStepDefinition;
} = Object.freeze({
	stack_image,
	stack_tls,
	stack_files,
	stack_database,
	stack_engine,
	stack_up,
	stack_health,
});

/** The digest of every planned stack step's commands for the facts `ctx` carries. */
export function stackDigest(ctx: HostPlanCtx): Record<string, string> {
	const digest: Record<string, string> = {};
	for (const step of ctx.plan.steps) {
		const definition = STACK_ROWS[step as keyof typeof STACK_ROWS];
		if (definition !== undefined) {
			digest[step] = commandsDigest(definition.commands(ctx), ctx.row, ctx.paths.user);
		}
	}
	return digest;
}

/** EXHAUSTIVE over the stack ids: a new id fails to compile until it has a row. */
export const STACK_HOST_STEPS: { readonly [K in StackHostStepId]: HostStepDefinition } =
	Object.freeze({
		stack_preflight: stackPreflightStep(stackDigest),
		...STACK_ROWS,
	});
