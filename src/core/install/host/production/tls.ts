/**
 * host_tls — THE CERTIFICATE (terminal installer phase 4, 2026-10-12; owner
 * round 2 #3 — no local CA on production):
 *
 *  - Let's Encrypt (default): `certbot certonly --webroot` against stage 1's
 *    challenge root, the certificate named `dedalo-<i>`, a deploy hook that
 *    reloads the web server, and the distribution's renewal timer enabled.
 *    `--letsencrypt-staging` uses the staging CA (a rehearsal; flags only).
 *  - The institution's own files: checked in TypeScript (tls_files.ts) — the
 *    address, the expiry, the key — AND that THIS host trusts their chain
 *    (tls_trust.ts against the system CA bundle: host_public_probe verifies it
 *    with this host's curl, as a browser does — an internal CA the host does
 *    not trust failed there after 90 s; campaign 3 C3-13) — and used where
 *    they are (never copied, never modified). host_preflight checked them
 *    first; this step checks again (a resume days later sees an expiry that
 *    has passed).
 *
 * UNDO: `certbot delete` of the certificate THIS install issued, only.
 */

import type { HostCtx, HostPlanCtx, HostStepDefinition } from '../contract.ts';
import { executeCommands } from '../execute.ts';
import type { HostFs } from '../fs.ts';
import { hostRefuse } from '../refuse.ts';
import { checkCertificateFiles, type TlsFileVerdict } from '../tls_files.ts';
import { chainTrustVerdict, SYSTEM_CA_BUNDLES } from '../tls_trust.ts';
import { exec, probe, probeOk, ran, remember, systemctl, verdictOf, webFlavor } from './common.ts';
import { selinuxApplies } from './selinux.ts';

export function certName(ctx: HostPlanCtx): string {
	return `dedalo-${ctx.paths.instance}`;
}

function liveCert(ctx: HostPlanCtx): string {
	return `/etc/letsencrypt/live/${certName(ctx)}/fullchain.pem`;
}

export function tlsCommands(ctx: HostPlanCtx) {
	const { answers } = ctx;
	if (answers.tls_mode !== 'letsencrypt') return [];
	return [
		exec(
			ctx,
			'certbot',
			[
				'certonly',
				'--webroot',
				'-w',
				ctx.paths.acmeDir,
				'-d',
				answers.server_name,
				'-m',
				answers.letsencrypt_email,
				'--agree-tos',
				'--non-interactive',
				'--cert-name',
				certName(ctx),
				'--deploy-hook',
				`systemctl reload ${webFlavor(ctx).service}`,
				...(answers.letsencrypt_staging ? ['--staging'] : []),
			],
			`issue the Let's Encrypt certificate ${certName(ctx)} for ${answers.server_name}`,
			{
				unless: probe(ctx, 'test', ['-s', liveCert(ctx)], 'certificate issued'),
				timeoutMs: 10 * 60_000,
			},
		),
		systemctl(ctx, 'enable', ['--now', ctx.row.certbotTimer], 'enable the renewal timer'),
	];
}

/**
 * SELinux (critique B13): the web server reads the certificate as httpd_t —
 * `nginx -t` runs unconfined and passes while the service is denied. Told,
 * with the command (labels of the institution's own files are never changed).
 */
function selinuxCertNote(ctx: HostCtx): string[] {
	if (!selinuxApplies(ctx)) return [];
	const { tls_cert_path: cert, tls_key_path: key } = ctx.answers;
	return [
		`SELinux: the web server must be able to read ${cert} and ${key} — keep them under /etc/pki/tls (cert_t) or label them: semanage fcontext -a -t cert_t '<dir>(/.*)?' && restorecon -RF <dir>`,
	];
}

/**
 * The institution's files, checked now: the address, the expiry (a warning
 * under 30 days), the key — and the chain against this host's trust store.
 * host_preflight, the Review and this step read the same verdict.
 */
export function institutionCertVerdict(
	ctx: Pick<HostPlanCtx, 'answers'>,
	fs: Pick<HostFs, 'readText'>,
	now: number,
): TlsFileVerdict {
	const { answers } = ctx;
	const fullchain = fs.readText(answers.tls_cert_path);
	const verdict = checkCertificateFiles(
		fullchain,
		fs.readText(answers.tls_key_path),
		answers.server_name,
		now,
	);
	if (verdict.validTo === null) return verdict;
	const trust = chainTrustVerdict(
		fullchain,
		SYSTEM_CA_BUNDLES.map((path) => fs.readText(path)),
	);
	return {
		...verdict,
		problems: [...verdict.problems, ...(trust.problem === null ? [] : [trust.problem])],
		warnings: [...verdict.warnings, ...(trust.warning === null ? [] : [trust.warning])],
	};
}

/** The institution's files, checked now. */
function filesVerdict(ctx: HostCtx): TlsFileVerdict {
	return institutionCertVerdict(ctx, ctx.fs, ctx.now());
}

export const host_tls: HostStepDefinition = {
	id: 'host_tls',
	privilege: 'root',
	kind: 'action',
	needs: [],
	label: (plan) =>
		plan.answers.tls_mode === 'letsencrypt'
			? `certificate: Let's Encrypt for ${String(plan.answers.server_name)} (+ renewal timer)`
			: `certificate: the institution's files, checked (${String(plan.answers.tls_cert_path)})`,
	commands: tlsCommands,
	verify: async (ctx) => {
		if (ctx.answers.tls_mode !== 'letsencrypt') {
			const verdict = filesVerdict(ctx);
			return verdict.problems.length === 0
				? { ok: true, detail: `valid until ${verdict.validTo}` }
				: { ok: false, detail: verdict.problems.join('; ') };
		}
		return verdictOf(
			[
				[ctx.fs.exists(liveCert(ctx)), `${liveCert(ctx)} missing`],
				[
					await probeOk(
						ctx,
						probe(ctx, 'systemctl', ['is-enabled', ctx.row.certbotTimer], 'renewal timer'),
					),
					`${ctx.row.certbotTimer} is not enabled`,
				],
			],
			`${certName(ctx)} issued, renewal timer enabled`,
		);
	},
	run: async (ctx) => {
		if (ctx.answers.tls_mode !== 'letsencrypt') {
			const verdict = filesVerdict(ctx);
			if (verdict.problems.length > 0)
				hostRefuse(
					'install.invalid_input',
					`${ctx.answers.tls_cert_path}: ${verdict.problems.join('; ')}`,
				);
			return ran(`the institution's certificate, valid until ${verdict.validTo}`, {
				warnings: verdict.warnings,
				told: selinuxCertNote(ctx),
			});
		}
		await executeCommands(tlsCommands(ctx), ctx);
		return ran(`${certName(ctx)} issued; renewals by ${ctx.row.certbotTimer}`);
	},
	intent: (ctx) => {
		if (ctx.answers.tls_mode === 'letsencrypt' && !ctx.facts.certIssued) {
			ctx.created.cert_name = certName(ctx);
			remember(ctx.created.enabled, ctx.row.certbotTimer);
		}
	},
	undo: async (ctx) => {
		if (ctx.created.cert_name === null) return 'no certificate was issued';
		await executeCommands(
			[
				exec(
					ctx,
					'certbot',
					['delete', '--cert-name', ctx.created.cert_name, '--non-interactive'],
					`delete the certificate ${ctx.created.cert_name}`,
					{ okExit: [0, 1] },
				),
			],
			ctx,
		);
		return `certificate ${ctx.created.cert_name} deleted (the renewal timer is shared: kept)`;
	},
};
