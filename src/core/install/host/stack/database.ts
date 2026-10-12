/**
 * stack_database — THE STACK'S POSTGRESQL (terminal installer phase 4,
 * 2026-10-12): `compose up -d postgres`, then wait (bounded) for pg_isready —
 * the engine steps that follow restore the seed into it.
 *
 * --abort: the stack's containers go down; the VOLUMES this install created
 * (the database's, the engine's, never one that existed before it) are
 * removed only with `--confirm-database <db>` — the same confirmation a
 * production abort asks before it drops a database. The image is kept.
 */

import type { HostCommand, HostCtx, HostPlanCtx, HostStepDefinition } from '../contract.ts';
import { executeCommands } from '../execute.ts';
import { probeOk, ran, verdictOf } from '../production/common.ts';
import { hostRefuse } from '../refuse.ts';
import { pollUntil, rememberNewVolumes, stackCreated } from './common.ts';
import { composeCommand, composeProbe, dockerCommand } from './compose.ts';
import { stackFactsOf } from './facts.ts';
import { DATABASE_VOLUME, ENV_FILE, stackFileOf } from './layout.ts';

/** `pg_isready` inside the postgres container. */
export function readyProbe(ctx: HostPlanCtx): HostCommand & { kind: 'exec' } {
	return composeProbe(
		ctx,
		[
			'exec',
			'-T',
			'postgres',
			'pg_isready',
			'-U',
			ctx.answers.db_username,
			'-d',
			ctx.answers.db_database,
		],
		'PostgreSQL accepts connections',
		{ timeoutMs: 30_000 },
	);
}

export function databaseCommands(ctx: HostPlanCtx): HostCommand[] {
	return [composeCommand(ctx, ['up', '-d', 'postgres'], 'start PostgreSQL'), readyProbe(ctx)];
}

async function runDatabase(ctx: HostCtx) {
	await executeCommands([composeCommand(ctx, ['up', '-d', 'postgres'], 'start PostgreSQL')], ctx);
	const ready = await pollUntil(
		ctx,
		{ limitMs: 180_000, everyMs: 2000, progressEvery: 15, what: 'PostgreSQL' },
		() => probeOk(ctx, readyProbe(ctx)),
	);
	if (!ready) {
		hostRefuse(
			'install.step_failed',
			`PostgreSQL did not become ready — inspect it with: docker compose -f ${stackFileOf(ctx.answers)} --env-file ${ENV_FILE} logs postgres`,
		);
	}
	return ran(`PostgreSQL is up (database ${ctx.answers.db_database})`);
}

/** The stack's containers down (volumes kept). */
export async function stackDown(ctx: HostCtx): Promise<void> {
	await executeCommands(
		[
			composeCommand(ctx, ['down', '--remove-orphans'], 'stop and remove the stack containers', {
				okExit: [0, 1],
			}),
		],
		ctx,
	);
}

/** Remove the volumes this install created — only with the database confirmed. */
async function removeCreatedVolumes(ctx: HostCtx): Promise<string> {
	const created = stackCreated(ctx);
	if (created.volumes.length === 0) return '; no volume was created';
	if (ctx.confirmDatabase !== ctx.answers.db_database) {
		hostRefuse(
			'install.invalid_input',
			`--abort removes the stack's volumes (the database ${ctx.answers.db_database} with them): confirm with --confirm-database ${ctx.answers.db_database}`,
		);
	}
	const names = [...created.volumes];
	await executeCommands(
		[
			dockerCommand(ctx, ['volume', 'rm', ...names], 'remove the volumes this install created', {
				okExit: [0, 1],
			}),
		],
		ctx,
	);
	created.volumes = [];
	return `; volumes removed: ${names.join(', ')}`;
}

export const stack_database: HostStepDefinition = {
	id: 'stack_database',
	privilege: 'operator',
	kind: 'action',
	needs: [],
	label: (plan) => `start PostgreSQL (database ${String(plan.answers.db_database)})`,
	commands: databaseCommands,
	verify: async (ctx) =>
		verdictOf(
			[[await probeOk(ctx, readyProbe(ctx)), 'PostgreSQL does not accept connections']],
			'PostgreSQL is up',
		),
	run: runDatabase,
	intent: (ctx) => rememberNewVolumes(ctx, [DATABASE_VOLUME], stackFactsOf(ctx).volumes),
	undo: async (ctx) => {
		await stackDown(ctx);
		return `the stack is down${await removeCreatedVolumes(ctx)}`;
	},
};
