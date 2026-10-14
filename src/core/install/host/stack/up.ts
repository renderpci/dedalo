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
 * And it must PUBLISH every port it declares: a container whose start failed
 * (the host port held by another program) is reused by a later `up -d` as
 * "Up" with no port bound at all — `restart` does not rebind it (campaign 3b
 * N2). So nginx is removed before `up -d` creates it again (it holds no state),
 * and its published ports are checked here and on every resume's verify.
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
import { keptImages } from './database.ts';
import { assertPinnedImage } from './image_verify.ts';
import { CONTAINER, ENV_FILE, OVERRIDE_FILE, stackFileOf } from './layout.ts';

/** Where removing a stack by hand is described, per route (campaign 3b N16). */
export function removalDoc(ctx: HostPlanCtx): string {
	return ctx.answers.route === 'docker'
		? 'docs/install/docker.md#removing-the-stack'
		: 'docs/install/quickstart.md#removing-the-trial';
}

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

/** The ports nginx's container DECLARES (`{"443/tcp":[…],…}`; the id is appended at run time). */
function nginxDeclaredPortsProbe(ctx: HostPlanCtx, id: string) {
	return dockerProbe(
		ctx,
		['inspect', '--format', '{{json .HostConfig.PortBindings}}', id],
		'the ports nginx declares',
	);
}

/** The ports nginx's container has BOUND (`443/tcp -> 0.0.0.0:443` per line). */
function nginxBoundPortsProbe(ctx: HostPlanCtx, id: string) {
	return dockerProbe(ctx, ['port', id], 'the ports nginx publishes', { okExit: [0, 1] });
}

/**
 * The declared ports with no binding: `inspect`'s PortBindings keys minus
 * `docker port`'s left-hand sides. Unparseable output declares nothing.
 */
export function unboundPorts(declaredJson: string, bound: string): string[] {
	let declared: string[] = [];
	try {
		const parsed: unknown = JSON.parse(declaredJson.trim() || 'null');
		if (parsed !== null && typeof parsed === 'object') declared = Object.keys(parsed);
	} catch {
		declared = [];
	}
	const published = new Set(
		bound
			.split('\n')
			.map((line) => line.split(' -> ')[0]?.trim() ?? '')
			.filter(Boolean),
	);
	return declared.filter((port) => !published.has(port)).sort();
}

/** nginx's declared ports that are not bound ([] also when there is no container). */
async function nginxUnbound(ctx: HostCtx, id: string): Promise<string[]> {
	if (id === '') return [];
	return unboundPorts(
		await probeText(ctx, nginxDeclaredPortsProbe(ctx, id)),
		await probeText(ctx, nginxBoundPortsProbe(ctx, id)),
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

/**
 * nginx removed before `up -d` creates it (campaign 3b N2): a container an
 * earlier run created but could not start keeps no published port when it is
 * started again. nginx holds no state; absent, this removes nothing.
 */
function nginxRemoved(ctx: HostPlanCtx): HostCommand {
	return composeCommand(
		ctx,
		['rm', '--stop', '--force', 'nginx'],
		'remove an nginx container left by an earlier run (created again, with its ports, by the next command)',
		{ okExit: [0, 1] },
	);
}

export function upCommands(ctx: HostPlanCtx): HostCommand[] {
	return [
		engineUp(ctx),
		socketHealthProbe(ctx),
		nginxRemoved(ctx),
		everythingUp(ctx),
		nginxIdProbe(ctx),
		nginxStateProbe(ctx, '<nginx container>'),
		nginxDeclaredPortsProbe(ctx, '<nginx container>'),
		nginxBoundPortsProbe(ctx, '<nginx container>'),
		nginxConfigProbe(ctx),
	];
}

/**
 * Is nginx settled — running, its restart count the same as at the previous
 * poll (`seen`), and its configuration accepted? `up -d` returns as soon as
 * the container is CREATED: a config nginx refuses (an include that is not
 * there) leaves it restarting while `up` reports success (campaign 3 C3-8).
 */
async function nginxSettled(ctx: HostCtx, seen: NginxSeen): Promise<boolean> {
	const id = (await probeText(ctx, nginxIdProbe(ctx))).trim();
	const state = id === '' ? '' : (await probeText(ctx, nginxStateProbe(ctx, id))).trim();
	const stable = state.startsWith('running ') && state === seen.state;
	seen.state = state;
	seen.unbound = stable ? await nginxUnbound(ctx, id) : [];
	return stable && seen.unbound.length === 0 && (await probeOk(ctx, nginxConfigProbe(ctx)));
}

/** What the last settle poll saw: nginx's state, and the declared ports it had not bound. */
interface NginxSeen {
	state: string;
	unbound: string[];
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
	const seen: NginxSeen = { state: '', unbound: [] };
	const settled = await pollUntil(
		ctx,
		{ limitMs: NGINX_SETTLE_LIMIT_MS, everyMs: 2000, progressEvery: 0, what: 'nginx' },
		() => nginxSettled(ctx, seen),
	);
	if (settled) return;
	if (seen.unbound.length > 0) {
		hostRefuse(
			'install.step_failed',
			`nginx is running but publishes no port for ${seen.unbound.join(', ')} — another program may hold it (sudo ss -tlnp), or Docker could not bind it: free it, then --resume (the installer recreates nginx)`,
		);
	}
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
	await executeCommands([nginxRemoved(ctx), everythingUp(ctx)], ctx);
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
		const unbound = running.includes('nginx')
			? await nginxUnbound(ctx, (await probeText(ctx, nginxIdProbe(ctx))).trim())
			: [];
		return verdictOf(
			[
				...['postgres', 'dedalo', 'nginx'].map((service): [boolean, string] => [
					running.includes(service),
					`${service} is not running`,
				]),
				[unbound.length === 0, `nginx publishes no port for ${unbound.join(', ')}`],
			],
			'postgres, dedalo and nginx are running, nginx with its ports published',
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
		// The instance has served (intent above): the database step is never undone after this
		// one, so say how the operator removes it — and which images stay (campaign 3b N32, C3-52).
		return `stopped and removed ${services.join(', ')} — PostgreSQL keeps running with the data, and --resume starts them again; to remove the instance entirely, see ${removalDoc(ctx)}; ${keptImages(ctx)}`;
	},
};
