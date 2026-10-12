/**
 * stack_health — THE STACK THROUGH ITS PUBLISHED ADDRESS (terminal installer
 * phase 4, 2026-10-12), proven from this machine:
 *
 *  1. /health on the engine's socket (inside its container) answers 200;
 *  2. /health through nginx answers 200 — docker: https with a VERIFIED chain
 *     (curl connects to 127.0.0.1 with the server name as SNI and Host, so
 *     split-horizon DNS or a router without hairpin NAT cannot fail a correct
 *     install — critique A12; the local CA is trusted through its own file; a
 *     Let's Encrypt STAGING certificate cannot be verified, which is the only
 *     case the chain is not checked); trial: plain http;
 *  3. docker only — the media gate: the marker store
 *     `/dedalo/media/.publication/auth/` answers 404, and an ANONYMOUS request
 *     for a probe file named with the record grammar (written into the media
 *     volume through the engine's container, removed afterwards) answers 404.
 *
 * Trial says what it is instead: NO media access control (its own route).
 * The logged-in half of the gate (the media cookie) is the drill's.
 */

import type { ExecCommand, HostCtx, HostPlanCtx, HostStepDefinition } from '../contract.ts';
import { executeCommands } from '../execute.ts';
import { probeText, ran } from '../production/common.ts';
import { hostRefuse } from '../refuse.ts';
import { mediaGated } from '../web/site.ts';
import { inCheckout, pollUntil } from './common.ts';
import { composeCommand, stackExec } from './compose.ts';
import { STACK_BINARIES } from './facts.ts';
import { CONTAINER, LOCAL_CA_FILE } from './layout.ts';
import { socketHealthProbe } from './up.ts';

const PROBE_NAME = 'dd_install_probe_dd0_0.jpg';
const PROBE_DIR = `${CONTAINER.media}/image/thumb`;

/** The origin a browser types. */
export function stackOrigin(ctx: HostPlanCtx): string {
	const { answers } = ctx;
	if (answers.route === 'trial') {
		return `http://localhost${answers.http_port === '80' ? '' : `:${answers.http_port}`}`;
	}
	return `https://${answers.server_name}${answers.https_port === '443' ? '' : `:${answers.https_port}`}`;
}

/** How curl trusts the chain: the local CA's file, nothing for staging, else the system's. */
function trustArgs(ctx: HostPlanCtx): string[] {
	if (ctx.answers.tls_mode === 'local_ca') return ['--cacert', inCheckout(ctx, LOCAL_CA_FILE)];
	return ctx.answers.letsencrypt_staging ? ['--insecure'] : [];
}

/** How curl reaches the published port on this machine. */
function addressArgs(ctx: HostPlanCtx): string[] {
	const { answers } = ctx;
	if (answers.route === 'trial') return [];
	return ['--resolve', `${answers.server_name}:${answers.https_port}:127.0.0.1`, ...trustArgs(ctx)];
}

/** One status probe through nginx. */
function statusProbe(ctx: HostPlanCtx, path: string, label: string): ExecCommand {
	const origin =
		ctx.answers.route === 'trial'
			? stackOrigin(ctx).replace('localhost', '127.0.0.1')
			: stackOrigin(ctx);
	return stackExec(
		ctx,
		[
			STACK_BINARIES.curl,
			'-sS',
			'-o',
			'/dev/null',
			'-w',
			'%{http_code}',
			'--max-time',
			'20',
			...addressArgs(ctx),
			`${origin}${path}`,
		],
		label,
		{ mutates: false, okExit: [0, 7, 28, 35, 56, 60] },
	);
}

/** Does this install probe the media gate (the docker route, the gate on)? */
function gateProbed(ctx: HostPlanCtx): boolean {
	return ctx.answers.route === 'docker' && mediaGated(ctx.answers);
}

/** The probes and the status each must answer. */
export function stackProbes(ctx: HostPlanCtx): { command: ExecCommand; expect: string }[] {
	const probes = [
		{ command: socketHealthProbe(ctx), expect: '200' },
		{ command: statusProbe(ctx, '/health', '/health through nginx'), expect: '200' },
	];
	if (!gateProbed(ctx)) return probes;
	return [
		...probes,
		{
			command: statusProbe(
				ctx,
				'/dedalo/media/.publication/auth/',
				'the media marker store is not served',
			),
			expect: '404',
		},
		{
			command: statusProbe(
				ctx,
				`/dedalo/${CONTAINER.mediaDir}/image/thumb/${PROBE_NAME}`,
				'an unpublished media file is refused to an anonymous visitor',
			),
			expect: '404',
		},
	];
}

/** The probe file, written into the media volume through the engine's container. */
function probeFileCommands(ctx: HostPlanCtx): ExecCommand[] {
	return [
		composeCommand(
			ctx,
			['exec', '-T', 'dedalo', 'mkdir', '-p', PROBE_DIR],
			"the probe file's directory",
		),
		composeCommand(
			ctx,
			['exec', '-T', 'dedalo', 'tee', `${PROBE_DIR}/${PROBE_NAME}`],
			'write the media probe file (removed afterwards)',
			{ stdin: { text: 'dedalo install probe\n' } },
		),
	];
}

function probeFileRemoval(ctx: HostPlanCtx): ExecCommand {
	return composeCommand(
		ctx,
		['exec', '-T', 'dedalo', 'rm', '-f', `${PROBE_DIR}/${PROBE_NAME}`],
		'remove the media probe file',
		{ okExit: [0, 1] },
	);
}

export function healthCommands(ctx: HostPlanCtx): ExecCommand[] {
	if (!gateProbed(ctx)) return stackProbes(ctx).map((probe) => probe.command);
	return [
		...probeFileCommands(ctx),
		...stackProbes(ctx).map((probe) => probe.command),
		probeFileRemoval(ctx),
	];
}

/** Run every probe; answers the failures, in words. */
async function failures(ctx: HostCtx): Promise<string[]> {
	const failed: string[] = [];
	for (const { command, expect } of stackProbes(ctx)) {
		const status = (await probeText(ctx, command)).trim() || 'no answer';
		if (status !== expect) failed.push(`${command.label}: expected ${expect}, got ${status}`);
	}
	return failed;
}

/** What the operator must still do or know (told on Done). */
function toldLines(ctx: HostPlanCtx): string[] {
	const { answers } = ctx;
	if (answers.route === 'trial') {
		return [
			`open ${stackOrigin(ctx)}/dedalo/ — THE TRIAL STACK HAS NO MEDIA ACCESS CONTROL: anyone who can reach this machine reads every media file without logging in; plain HTTP: passwords cross the network in clear text`,
		];
	}
	return [
		`check from outside too: open ${stackOrigin(ctx)}/dedalo/ in a browser (this probe connected from this machine)`,
		...(answers.tls_mode === 'local_ca'
			? [
					`install the local certificate authority on every computer that uses Dédalo, or browsers warn every time: ${inCheckout(ctx, LOCAL_CA_FILE)}`,
				]
			: []),
	];
}

async function runHealth(ctx: HostCtx) {
	const gated = gateProbed(ctx);
	if (gated) await executeCommands(probeFileCommands(ctx), ctx);
	try {
		// nginx has only just started (stack_up): a short, bounded wait for it to answer.
		let failed: string[] = [];
		await pollUntil(
			ctx,
			{ limitMs: 60_000, everyMs: 3000, progressEvery: 0, what: 'nginx' },
			async () => {
				failed = await failures(ctx);
				return failed.length === 0;
			},
		);
		if (failed.length > 0) hostRefuse('install.step_failed', failed.join('; '));
	} finally {
		if (gated) await executeCommands([probeFileRemoval(ctx)], ctx);
	}
	return ran(
		gated
			? `${stackOrigin(ctx)} answers; the media gate refuses anonymous access`
			: `${stackOrigin(ctx)} answers`,
		{ told: toldLines(ctx) },
	);
}

export const stack_health: HostStepDefinition = {
	id: 'stack_health',
	privilege: 'operator',
	kind: 'probe',
	needs: [],
	label: (plan) =>
		plan.answers.route === 'trial'
			? '/health through nginx (the trial stack: NO media protection)'
			: `/health through https://${String(plan.answers.server_name)} and the media gate`,
	commands: healthCommands,
	run: runHealth,
};
