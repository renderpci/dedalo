/**
 * stack_up — THE STACK STARTED (terminal installer phase 4, 2026-10-12), in
 * the order the media gate needs: the engine first (`up -d dedalo`), then —
 * once it answers /health on its socket, which is when it has written the
 * media gate's rule files nginx includes — everything (`up -d`). Started the
 * other way round, nginx would refuse a config whose include is not there yet.
 * Before anything starts, the image tag must still be the verified digest
 * (critique A16).
 *
 * Then nginx must SETTLE: running, not restarting, its configuration accepted
 * (`nginx -t` in its container) — `up -d` reports success for a container that
 * then crash-loops (campaign 3 C3-8); a refusal quotes nginx's [emerg] line.
 *
 * --abort stops and removes only the services this step started — never
 * PostgreSQL, whose step is still recorded done (an abort of a live install
 * undoes only the steps after the engine, and a --resume verifies the rest:
 * a `down` here made that resume fail on a database it had stopped — C3-10).
 */

import type { HostCommand, HostCtx, HostPlanCtx, HostStepDefinition } from '../contract.ts';
import { executeCommands } from '../execute.ts';
import { probeOk, probeText, ran, verdictOf } from '../production/common.ts';
import { hostRefuse } from '../refuse.ts';
import { pollUntil, stackCreated } from './common.ts';
import { composeCommand, composeProbe, dockerProbe } from './compose.ts';
import { assertPinnedImage } from './image_verify.ts';
import { CONTAINER, ENV_FILE, OVERRIDE_FILE, stackFileOf } from './layout.ts';

/** The services `up -d` starts besides PostgreSQL (certbot: the Let's Encrypt override's). */
export function startedServices(ctx: HostPlanCtx): string[] {
	const le = ctx.answers.route === 'docker' && ctx.answers.tls_mode === 'letsencrypt';
	return ['dedalo', 'nginx', 'backup', ...(le ? ['certbot'] : [])];
}

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

/** The bound of nginx settling after `up -d` (a config it refuses restarts it within seconds). */
export const NGINX_SETTLE_LIMIT_MS = 30_000;

/** nginx's container id (`compose ps -q nginx`). */
function nginxIdProbe(ctx: HostPlanCtx) {
	return composeProbe(ctx, ['ps', '-q', 'nginx'], "nginx's container");
}

/** `<status> <restart count>` of a container (the id is appended at run time). */
function nginxStateProbe(ctx: HostPlanCtx, id: string) {
	return dockerProbe(
		ctx,
		['inspect', '--format', '{{.State.Status}} {{.RestartCount}}', id],
		'nginx is running and not restarting',
	);
}

/** nginx accepts its configuration (inside its container). */
function nginxConfigProbe(ctx: HostPlanCtx) {
	return composeProbe(
		ctx,
		['exec', '-T', 'nginx', 'nginx', '-t'],
		'nginx accepts its configuration',
	);
}

/** nginx's last log lines (why it stopped). */
function nginxLogsProbe(ctx: HostPlanCtx) {
	return composeProbe(
		ctx,
		['logs', '--no-color', '--tail', '5', 'nginx'],
		"nginx's last log lines",
	);
}

export function upCommands(ctx: HostPlanCtx): HostCommand[] {
	return [
		engineUp(ctx),
		socketHealthProbe(ctx),
		everythingUp(ctx),
		nginxIdProbe(ctx),
		nginxStateProbe(ctx, '<nginx container>'),
		nginxConfigProbe(ctx),
	];
}

/**
 * Is nginx settled — running, its restart count the same as at the previous
 * poll (`seen`), and its configuration accepted? `up -d` returns as soon as
 * the container is CREATED: a config nginx refuses (an include that is not
 * there) leaves it restarting while `up` reports success (campaign 3 C3-8).
 */
async function nginxSettled(ctx: HostCtx, seen: { state: string }): Promise<boolean> {
	const id = (await probeText(ctx, nginxIdProbe(ctx))).trim();
	const state = id === '' ? '' : (await probeText(ctx, nginxStateProbe(ctx, id))).trim();
	const stable = state.startsWith('running ') && state === seen.state;
	seen.state = state;
	return stable && (await probeOk(ctx, nginxConfigProbe(ctx)));
}

/** The line that says why nginx stopped: its [emerg] line, else its last. */
async function nginxWhy(ctx: HostCtx): Promise<string> {
	const lines = (await probeText(ctx, nginxLogsProbe(ctx)))
		.split('\n')
		.map((line) => line.trim())
		.filter(Boolean);
	return lines.find((line) => line.includes('[emerg]')) ?? lines.at(-1) ?? 'nginx printed nothing';
}

/** Wait for nginx to settle; refuse with its own words when it does not. */
async function assertNginxSettled(ctx: HostCtx): Promise<void> {
	const seen = { state: '' };
	const settled = await pollUntil(
		ctx,
		{ limitMs: NGINX_SETTLE_LIMIT_MS, everyMs: 2000, progressEvery: 0, what: 'nginx' },
		() => nginxSettled(ctx, seen),
	);
	if (settled) return;
	hostRefuse(
		'install.step_failed',
		`nginx did not stay up (${seen.state || 'no container'}): ${await nginxWhy(ctx)} — see: docker compose -f ${stackFileOf(ctx.answers)} -f ${OVERRIDE_FILE} --env-file ${ENV_FILE} logs nginx`,
	);
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
	await assertNginxSettled(ctx);
	return ran('the stack is up (nginx running, its configuration accepted)');
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
	// Starts only: re-run on a resume when the stack stopped since (C3-8/C3-10).
	restartable: true,
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
		// The engine starts serving here: from now on an abort keeps the instance (C3-11).
		ctx.created.served = true;
	},
	undo: async (ctx) => {
		const services = startedServices(ctx);
		await executeCommands(
			[
				composeCommand(
					ctx,
					['rm', '--stop', '--force', ...services],
					'stop and remove the services stack_up started',
					{
						okExit: [0, 1],
					},
				),
			],
			ctx,
		);
		return `stopped and removed ${services.join(', ')} — PostgreSQL keeps running with the data (the database step's undo takes it down)`;
	},
};
