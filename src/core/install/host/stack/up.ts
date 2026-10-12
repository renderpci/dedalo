/**
 * stack_up — THE STACK STARTED (terminal installer phase 4, 2026-10-12), in
 * the order the media gate needs: the engine first (`up -d dedalo`), then —
 * once it answers /health on its socket, which is when it has written the
 * media gate's rule files nginx includes — everything (`up -d`). Started the
 * other way round, nginx would refuse a config whose include is not there yet.
 * Before anything starts, the image tag must still be the verified digest
 * (critique A16).
 *
 * --abort takes the containers down (the volumes are stack_database's to remove).
 */

import type { HostCommand, HostCtx, HostPlanCtx, HostStepDefinition } from '../contract.ts';
import { executeCommands } from '../execute.ts';
import { probeText, ran, verdictOf } from '../production/common.ts';
import { hostRefuse } from '../refuse.ts';
import { pollUntil, stackCreated } from './common.ts';
import { composeCommand, composeProbe } from './compose.ts';
import { stackDown } from './database.ts';
import { assertPinnedImage } from './image_verify.ts';
import { CONTAINER, ENV_FILE, stackFileOf } from './layout.ts';

/** The bound of the engine's first boot (migrations and the search-store backfill can take minutes). */
export const STACK_BOOT_LIMIT_MS = 45 * 60 * 1000;

/** /health on the engine's socket, from inside its container → the HTTP status. */
export function socketHealthProbe(ctx: HostPlanCtx) {
	return composeProbe(
		ctx,
		[
			'exec',
			'-T',
			'dedalo',
			'curl',
			'-s',
			'-o',
			'/dev/null',
			'-w',
			'%{http_code}',
			'--max-time',
			'10',
			'--unix-socket',
			CONTAINER.socket,
			'http://localhost/health',
		],
		'the engine answers /health on its socket',
		{ okExit: [0, 7, 28, 56], timeoutMs: 30_000 },
	);
}

/** Is the engine answering 200 on its socket? */
export async function engineHealthy(ctx: HostCtx): Promise<boolean> {
	return (await probeText(ctx, socketHealthProbe(ctx))).trim() === '200';
}

function engineUp(ctx: HostPlanCtx): HostCommand {
	return composeCommand(ctx, ['up', '-d', 'dedalo'], 'start the engine');
}

function everythingUp(ctx: HostPlanCtx): HostCommand {
	return composeCommand(ctx, ['up', '-d'], 'start the whole stack (nginx, backups…)');
}

export function upCommands(ctx: HostPlanCtx): HostCommand[] {
	return [engineUp(ctx), socketHealthProbe(ctx), everythingUp(ctx)];
}

async function runUp(ctx: HostCtx) {
	await assertPinnedImage(ctx);
	await executeCommands([engineUp(ctx)], ctx);
	const healthy = await pollUntil(
		ctx,
		{
			limitMs: STACK_BOOT_LIMIT_MS,
			everyMs: 3000,
			progressEvery: 10,
			what: 'the engine answering /health',
		},
		() => engineHealthy(ctx),
	);
	if (!healthy) {
		hostRefuse(
			'install.step_failed',
			`the engine did not answer /health within ${STACK_BOOT_LIMIT_MS / 60000} minutes — see: docker compose -f ${stackFileOf(ctx.answers)} --env-file ${ENV_FILE} logs dedalo`,
		);
	}
	await executeCommands([everythingUp(ctx)], ctx);
	return ran('the stack is up');
}

/** The services `compose ps` reports running. */
async function runningServices(ctx: HostCtx): Promise<string[]> {
	const text = await probeText(
		ctx,
		composeProbe(ctx, ['ps', '--services', '--status', 'running'], 'the running services'),
	);
	return text.split('\n').map((line) => line.trim());
}

export const stack_up: HostStepDefinition = {
	id: 'stack_up',
	privilege: 'operator',
	kind: 'action',
	needs: [],
	label: () => 'start the stack (the engine first, then nginx and the rest)',
	commands: upCommands,
	verify: async (ctx) => {
		const running = await runningServices(ctx);
		return verdictOf(
			['postgres', 'dedalo', 'nginx'].map((service): [boolean, string] => [
				running.includes(service),
				`${service} is not running`,
			]),
			'postgres, dedalo and nginx are running',
		);
	},
	run: runUp,
	intent: (ctx) => {
		stackCreated(ctx).containers_started = true;
	},
	undo: async (ctx) => {
		await stackDown(ctx);
		return 'the stack is down (its volumes are kept until the database step is undone)';
	},
};
