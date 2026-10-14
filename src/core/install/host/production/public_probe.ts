/**
 * host_public_probe — THE INSTANCE THROUGH ITS PUBLIC ADDRESS (terminal
 * installer phase 4, 2026-10-12): what an outside browser gets, proven from
 * the host itself. curl connects to 127.0.0.1:<https port> with the server
 * name as SNI and Host (`--resolve`) and a VERIFIED chain — split-horizon DNS
 * or a router without hairpin NAT cannot fail a correct install (critique
 * A12); the external check is told on Done.
 *
 *  1. /health answers 200 (the web server reaches the engine's socket).
 *  2. With the media gate on: the marker store `/dedalo/media/.publication/auth/`
 *     answers 404, and an ANONYMOUS request for a probe file named with the
 *     record grammar (`<media>/image/thumb/dd_install_probe_dd0_0.jpg`) answers
 *     404 — rule A and rule B of the generated gate both exercised. The probe
 *     file is written and removed BY THE INSTANCE USER (`runuser … install` /
 *     `rm`): the media tree is the running engine's, and a root write by path
 *     into a directory another account owns could be redirected (a swapped-in
 *     symlink between the rename and the chown).
 *
 * POLLED, BOUNDED: a web server's reload returns before its new workers serve
 * (Debian's nginx: `nginx -s reload`), so a single probe raced it — every probe
 * is retried every 2 s until all answer as expected, refused after 90 s.
 *
 * The logged-in half (the media cookie answering 200/206) needs a root
 * session on the wire; it is the drill's (scripts/install_host_drill.ts),
 * not this step's.
 */

import type { ExecCommand, HostCtx, HostPlanCtx, HostStepDefinition } from '../contract.ts';
import { executeCommands, requestOf } from '../execute.ts';
import { hostRefuse } from '../refuse.ts';
import type { RunResult } from '../runner.ts';
import { readProbeCaSeam } from '../scratch.ts';
import { TRUST_CA_STEPS } from '../tls_trust.ts';
import { mediaGated } from '../web/site.ts';
import { exec, ran, webFlavor } from './common.ts';
import { pollUntil } from './first_boot.ts';

const PROBE_NAME = 'dd_install_probe_dd0_0.jpg';

function probeFile(ctx: HostPlanCtx): string {
	return `${ctx.paths.media}/image/thumb/${PROBE_NAME}`;
}

/** The origin as the browser writes it. */
function origin(ctx: HostPlanCtx): string {
	const port = ctx.answers.https_port === '443' ? '' : `:${ctx.answers.https_port}`;
	return `https://${ctx.answers.server_name}${port}`;
}

/**
 * How curl trusts the chain: the drill's CA seam, else NOTHING for a Let's
 * Encrypt STAGING certificate (untrusted by design — the operator asked for a
 * test certificate; without this the probe could never pass and a staging
 * install could never complete — stack/health.ts trustArgs is the twin), else
 * the system's store, verified.
 */
function trustArgs(ctx: HostPlanCtx, ca: string | null): string[] {
	if (ca !== null) return ['--cacert', ca];
	return ctx.answers.tls_mode === 'letsencrypt' && ctx.answers.letsencrypt_staging
		? ['--insecure']
		: [];
}

/** One HTTPS status probe through the local address. */
function statusProbe(
	ctx: HostPlanCtx,
	path: string,
	label: string,
	ca: string | null,
): ExecCommand {
	return exec(
		ctx,
		'curl',
		[
			'-sS',
			'-o',
			'/dev/null',
			'-w',
			'%{http_code}',
			'--max-time',
			'20',
			'--resolve',
			`${ctx.answers.server_name}:${ctx.answers.https_port}:127.0.0.1`,
			...trustArgs(ctx, ca),
			`${origin(ctx)}${path}`,
		],
		label,
		{ mutates: false },
	);
}

/** The probes and the status each must answer. */
export function publicProbes(
	ctx: HostPlanCtx,
	ca: string | null,
): { command: ExecCommand; expect: string }[] {
	const health = {
		command: statusProbe(ctx, '/health', '/health through the public address', ca),
		expect: '200',
	};
	if (!mediaGated(ctx.answers)) return [health];
	return [
		health,
		{
			command: statusProbe(
				ctx,
				'/dedalo/media/.publication/auth/',
				'the media marker store is not served',
				ca,
			),
			expect: '404',
		},
		{
			command: statusProbe(
				ctx,
				`/dedalo/${ctx.paths.mediaDir}/image/thumb/${PROBE_NAME}`,
				'an unpublished media file is refused to an anonymous visitor',
				ca,
			),
			expect: '404',
		},
	];
}

/**
 * The probe file, created EMPTY as the instance user (`install -D` from
 * /dev/null, its own mode — an open gate would serve it 200, so its bytes do
 * not matter; never `/dev/stdin`: the runner's stdin is a socket, which
 * `install` cannot open — measured on debian:13).
 */
export function probeFileWrite(ctx: HostPlanCtx): ExecCommand {
	return exec(
		ctx,
		'install',
		['-D', '-m', '0640', '/dev/null', probeFile(ctx)],
		'the media-gate probe file (as the instance user)',
		{ as: 'instance' },
	);
}

/** The probe file's removal, as the instance user. */
export function probeFileRemove(ctx: HostPlanCtx): ExecCommand {
	return exec(ctx, 'rm', ['-f', probeFile(ctx)], 'remove the probe file (as the instance user)', {
		as: 'instance',
	});
}

/** The probes' bound: the reload is asynchronous (see the header). */
const PUBLIC_PROBE_BOUND = {
	limitMs: 90_000,
	intervalMs: 2_000,
	look: 'the web server serves another configuration — check `nginx -t` / `apachectl configtest`, its error log, then --resume',
};

/**
 * What curl's exit code means, in words (campaign 3 C3-13: an untrusted chain
 * read "expected 200, got no answer", three times, after 90 seconds). The
 * docker route's twin is stack/health.ts curlReason.
 */
function curlMeaning(exitCode: number, service: string): string {
	const meanings: Readonly<Record<number, string>> = {
		6: 'the address does not resolve on this host',
		7: `nothing answers on that port (is ${service} running? systemctl status ${service})`,
		28: 'no answer within the timeout',
		35: 'the TLS handshake failed',
		51: 'the certificate does not name this address',
		52: 'the server closed the connection without an answer',
		56: 'the connection broke while reading the answer',
		60: `the certificate chain is not trusted by this host — the probe verifies it as a browser does: ${TRUST_CA_STEPS}, then --resume`,
	};
	return meanings[exitCode] ?? `curl exit ${exitCode}`;
}

/** The reason a probe's curl failed: its exit code in words, and curl's own line. */
export function curlReason(result: RunResult, service: string): string {
	if (result.timedOut) return 'the probe timed out';
	if (result.exitCode === 0) return '';
	const said = result.stderr.trim().split('\n').at(-1) ?? '';
	const meaning = curlMeaning(result.exitCode, service);
	return said === '' ? meaning : `${meaning} (${said})`;
}

/** One probe's failure sentence, or null when it answered what it must. */
async function probeFailure(
	ctx: HostCtx,
	command: ExecCommand,
	expect: string,
): Promise<string | null> {
	const result = await ctx.runner.run(requestOf(command, ctx));
	const status = result.stdout.trim() || 'no answer';
	if (status === expect && !result.timedOut) return null;
	const reason = curlReason(result, webFlavor(ctx).service);
	return `${command.label}: expected ${expect}, got ${status}${reason === '' ? '' : ` — ${reason}`}`;
}

/** Run every probe; answers the failures, in words. */
async function failures(ctx: HostCtx, ca: string | null): Promise<string[]> {
	const failed: string[] = [];
	for (const { command, expect } of publicProbes(ctx, ca)) {
		const failure = await probeFailure(ctx, command, expect);
		if (failure !== null) failed.push(failure);
	}
	return failed;
}

/** A staging certificate is a test one: say so, and how to replace it. */
function stagingNote(ctx: HostPlanCtx): string[] {
	if (ctx.answers.tls_mode !== 'letsencrypt' || !ctx.answers.letsencrypt_staging) return [];
	return [
		`the certificate is a Let's Encrypt STAGING certificate: browsers do not trust it, and the chain was not verified. Replace it with a real one: certbot certonly --webroot -w ${ctx.paths.acmeDir} -d ${ctx.answers.server_name} --cert-name dedalo-${ctx.paths.instance} --force-renewal --server https://acme-v02.api.letsencrypt.org/directory`,
	];
}

export const host_public_probe: HostStepDefinition = {
	id: 'host_public_probe',
	privilege: 'root',
	kind: 'probe',
	needs: [],
	label: (plan) =>
		`the public address https://${String(plan.answers.server_name)} — /health and the media gate`,
	commands: (ctx) => [
		...(mediaGated(ctx.answers) ? [probeFileWrite(ctx)] : []),
		...publicProbes(ctx, null).map((item) => item.command),
		...(mediaGated(ctx.answers) ? [probeFileRemove(ctx)] : []),
	],
	run: async (ctx) => {
		const ca = readProbeCaSeam();
		const gated = mediaGated(ctx.answers);
		if (gated) await executeCommands([probeFileWrite(ctx)], ctx);
		try {
			let failed: string[] = [];
			await pollUntil(
				ctx,
				async () => {
					failed = await failures(ctx, ca);
					return failed.length === 0;
				},
				'the public address answering as expected',
				PUBLIC_PROBE_BOUND,
			).catch(() => hostRefuse('install.step_failed', failed.join('; ')));
		} finally {
			if (gated) await executeCommands([probeFileRemove(ctx)], ctx);
		}
		return ran(`${origin(ctx)} answers; the media gate refuses anonymous access`, {
			told: [
				`check from outside too: open ${origin(ctx)}/dedalo/ in a browser (this probe connected from the host itself)`,
				...stagingNote(ctx),
			],
		});
	},
};
