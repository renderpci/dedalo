/**
 * host_tls — THE CERTIFICATE (terminal installer phase 4, 2026-10-12; owner
 * round 2 #3; the local CA joined the production route on 2026-10-16 — owner
 * decision: a museum installed with internet access that then runs on an
 * isolated intranet with no public name, or a VM rehearsal with no domain):
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
 *  - A local certificate authority: deploy/dedalo-tls-rotate.sh — the ONE
 *    generator (the docker route's, a rotation's and a renewal's: no second
 *    one in TypeScript), run from the ROOT-OWNED copy host_runtime placed in
 *    the instance's bin dir (F2: never a file of the instance's tree) into
 *    /opt/dedalo/instances/<i>/tls (root 0755, keys 0600). The authority is
 *    NAME-CONSTRAINED to the server name and the extra addresses
 *    (tls_extra_names) + localhost, and its root key is deleted at issue
 *    (engineering/PRODUCTION.md §13.2). `--no-reload`: the site that names the
 *    certificate is written next (host_web_site, which reloads). Skipped when
 *    the authority and the certificate are already there — and REFUSED when
 *    that authority was made for other addresses (it cannot certify them; a
 *    skipped issue would leave a certificate the browsers reject) or before
 *    2026-10-16 (unconstrained, no names list: never adopted silently —
 *    host/tls_authority.ts, one rule with the docker route). Then its
 *    renewal: `dedalo-tls-renew@<i>.timer` (daily; the generator re-issues the
 *    leaf from the SAME authority in its last 30 days and reloads the HOST web
 *    server through systemctl — workstations never re-trust). On Done: where the
 *    authority is, its SHA-256 fingerprint, how to trust it, the curl check.
 *
 * UNDO: `certbot delete` of the certificate THIS install issued, only; the
 * local CA's timer and drop-in, and its directory when THIS install created it
 * (every file in it is the generator's) — nothing else.
 */

import { X509Certificate } from 'node:crypto';
import type {
	ExecCommand,
	HostCommand,
	HostCtx,
	HostPlanCtx,
	HostStepDefinition,
	WriteCommand,
} from '../contract.ts';
import { executeCommands } from '../execute.ts';
import type { HostFs } from '../fs.ts';
import { hostRefuse } from '../refuse.ts';
import { dropinPath, SYSTEMD_DIR, tlsRenewDropin, tlsRenewUnit } from '../systemd/render.ts';
import { authorityConflict, authorityFile } from '../tls_authority.ts';
import { checkCertificateFiles, type TlsFileVerdict } from '../tls_files.ts';
import { chainTrustVerdict, SYSTEM_CA_BUNDLES } from '../tls_trust.ts';
import { siteNames } from '../web/site.ts';
import {
	exec,
	probe,
	probeOk,
	ran,
	remember,
	stampOf,
	systemctl,
	verdictOf,
	webFlavor,
} from './common.ts';
import { selinuxApplies } from './selinux.ts';

export function certName(ctx: HostPlanCtx): string {
	return `dedalo-${ctx.paths.instance}`;
}

function liveCert(ctx: HostPlanCtx): string {
	return `/etc/letsencrypt/live/${certName(ctx)}/fullchain.pem`;
}

// ── the local certificate authority (local_ca) ───────────────────────────────

/** The authority staff computers trust (the generator's name for it). */
export function localCaFile(ctx: HostPlanCtx): string {
	return authorityFile(ctx.paths.tlsDir);
}

/** The root-owned copy of the ONE generator (host_runtime writes it, F2). */
function generator(ctx: HostPlanCtx): string {
	return `${ctx.paths.binDir}/dedalo-tls-rotate.sh`;
}

/** The renewal unit's drop-in (written here, on local_ca only). */
export function tlsRenewWrite(ctx: HostPlanCtx): WriteCommand {
	const path = dropinPath('dedalo-tls-renew@.service', ctx.paths.instance);
	return {
		kind: 'write',
		path,
		mode: 0o644,
		owner: 'root',
		group: 'root',
		content: tlsRenewDropin(ctx.paths, webFlavor(ctx).service, stampOf(ctx)),
		label: `drop-in ${path.slice(SYSTEMD_DIR.length + 1)} (the renewal: the root-owned generator, this certificate directory, reload ${webFlavor(ctx).service})`,
	};
}

/** The first issue: the generator, every address as a `--host` (the first is the subject). */
function issueCommand(ctx: HostPlanCtx): ExecCommand {
	const dir = ctx.paths.tlsDir;
	const names = siteNames(ctx.answers);
	return {
		kind: 'exec',
		argv: [
			generator(ctx),
			'--mode',
			'local-ca',
			...names.flatMap((name) => ['--host', name]),
			'--dir',
			dir,
			'--no-reload',
			'--quiet',
		],
		as: 'root',
		label: `create the local certificate authority — it can certify exactly ${names.join(', ')} (and localhost) — and the site certificate`,
		mutates: true,
		unless: probe(
			ctx,
			'test',
			['-s', `${dir}/fullchain.pem`, '-a', '-s', localCaFile(ctx)],
			'the local CA and its certificate exist',
		),
	};
}

/** The local CA's commands: its directory, the issue, its label (EL), the renewal timer. */
function localCaCommands(ctx: HostPlanCtx): HostCommand[] {
	const dir = ctx.paths.tlsDir;
	const timer = tlsRenewUnit(ctx.paths.instance, 'timer');
	return [
		{
			kind: 'mkdir',
			path: dir,
			mode: 0o755,
			owner: 'root',
			group: 'root',
			label: 'the certificate directory (root; the keys in it 0600)',
		},
		issueCommand(ctx),
		...(selinuxApplies(ctx)
			? [exec(ctx, 'restorecon', ['-RF', dir], `label ${dir} cert_t (the web server reads it)`)]
			: []),
		tlsRenewWrite(ctx),
		systemctl(ctx, 'daemon-reload', [], 'reload systemd'),
		systemctl(
			ctx,
			'enable',
			['--now', timer],
			`enable the renewal timer ${timer} (re-issues the certificate from the same authority before it expires)`,
		),
	];
}

/**
 * An authority already in the directory that cannot serve the answers — made
 * for OTHER addresses, or before 2026-10-16 (unconstrained, no names list: never
 * adopted silently on this route). ONE rule with the docker route
 * (host/tls_authority.ts); the issue is skipped when its files exist, so this
 * refusal is what stands between a re-run and a certificate the browsers reject.
 */
export function foreignAuthority(ctx: HostCtx): string | null {
	const wanted = siteNames(ctx.answers);
	return authorityConflict(
		ctx.fs,
		{
			dir: ctx.paths.tlsDir,
			route: 'native',
			rotate: `${generator(ctx)} --mode local-ca --dir ${ctx.paths.tlsDir} --reload systemd --unit ${webFlavor(ctx).service} ${wanted.map((name) => `--host ${name}`).join(' ')}`,
		},
		wanted,
	);
}

/** The authority's SHA-256 fingerprint as browsers and openssl print it, or null. */
function caFingerprint(ctx: HostCtx): string | null {
	const pem = ctx.fs.readText(localCaFile(ctx));
	if (pem === null) return null;
	try {
		return new X509Certificate(pem).fingerprint256;
	} catch {
		return null;
	}
}

/** What only the operator can do (told on Done): trust the authority, once, on every staff computer. */
export function localCaTold(ctx: HostCtx): string[] {
	const file = localCaFile(ctx);
	const fingerprint = caFingerprint(ctx);
	const names = siteNames(ctx.answers);
	const port = ctx.answers.https_port === '443' ? '' : `:${ctx.answers.https_port}`;
	return [
		`the local certificate authority is ${file} — SHA-256 fingerprint ${fingerprint ?? `(unreadable here: openssl x509 -in ${file} -noout -fingerprint -sha256)`}; it can certify exactly ${names.join(', ')}, localhost and 127.0.0.1 — no other name, not even one below them`,
		`trust it ONCE on every computer that uses Dédalo (copy the file there and compare the fingerprint first): Windows — save it as dedalo-local-ca.crt (Windows opens .crt files as certificates, not .pem files) and double-click it → Install Certificate → Local Machine → Trusted Root Certification Authorities, or as Administrator: certutil -addstore -f Root dedalo-local-ca.pem; macOS — open it in Keychain Access, System keychain → Always Trust; Debian/Ubuntu — copy it to /usr/local/share/ca-certificates/dedalo-local-ca.crt, then sudo update-ca-certificates; Fedora/RHEL — copy it to /etc/pki/ca-trust/source/anchors/, then sudo update-ca-trust; Firefox keeps its own store — Settings → Privacy & Security → Certificates → View Certificates → Authorities → Import, then tick 'Trust this CA to identify websites' (off by default)`,
		`check from a staff computer (the address must resolve there): curl --cacert dedalo-local-ca.pem https://${names[0]}${port}/health — answers 200`,
		`the site certificate renews itself from the same authority (${tlsRenewUnit(ctx.paths.instance, 'timer')}, in its last 30 days; the authority lives 10 years): the staff computers never trust anything again — unless it is rotated (${generator(ctx)} --mode local-ca — docs/install/production.md, Done)`,
	];
}

/** The local CA in place: its files (the key root-only), the renewal drop-in, the timer enabled. */
async function localCaVerify(ctx: HostCtx) {
	const dir = ctx.paths.tlsDir;
	const key = ctx.fs.stat(`${dir}/privkey.pem`);
	const write = tlsRenewWrite(ctx);
	const timer = tlsRenewUnit(ctx.paths.instance, 'timer');
	return verdictOf(
		[
			[ctx.fs.exists(localCaFile(ctx)), `${localCaFile(ctx)} missing`],
			[ctx.fs.exists(`${dir}/fullchain.pem`), `${dir}/fullchain.pem missing`],
			[
				key !== null && key.owner === 'root' && (key.mode & 0o077) === 0,
				`${dir}/privkey.pem is missing or not root-only`,
			],
			[ctx.fs.readText(write.path) === write.content, `${write.path} differs from its render`],
			[
				await probeOk(ctx, probe(ctx, 'systemctl', ['is-enabled', timer], 'renewal timer')),
				`${timer} is not enabled`,
			],
		],
		`local CA in ${dir}, renewal timer enabled`,
	);
}

/** Was the renewal set up (its drop-in there, or its timer recorded as enabled)? */
function renewalSetUp(ctx: HostCtx): boolean {
	const timer = tlsRenewUnit(ctx.paths.instance, 'timer');
	return ctx.fs.exists(tlsRenewWrite(ctx).path) || ctx.created.enabled.includes(timer);
}

/** Undo the renewal: the timer disabled, OUR drop-in (this install's stamp) removed. */
async function undoRenewal(ctx: HostCtx): Promise<string | null> {
	if (!renewalSetUp(ctx)) return null;
	const timer = tlsRenewUnit(ctx.paths.instance, 'timer');
	await executeCommands(
		[
			exec(ctx, 'systemctl', ['disable', '--now', timer], 'stop and disable the renewal timer', {
				okExit: [0, 1, 5],
			}),
		],
		ctx,
	);
	const path = tlsRenewWrite(ctx).path;
	if (ctx.fs.readText(path)?.startsWith(stampOf(ctx)) === true) {
		ctx.fs.remove(path);
		ctx.fs.rmdirIfEmpty(path.slice(0, path.lastIndexOf('/')));
	}
	await executeCommands([systemctl(ctx, 'daemon-reload', [], 'reload systemd')], ctx);
	return 'renewal timer disabled and its drop-in removed';
}

/** Undo the certificate directory — only when THIS install created it. */
async function undoTlsDir(ctx: HostCtx): Promise<string | null> {
	const dir = ctx.created.tls_dir ?? null;
	if (dir === null || !ctx.fs.exists(dir)) return null;
	await executeCommands(
		[exec(ctx, 'rm', ['-rf', dir], `remove ${dir} (this install made it)`)],
		ctx,
	);
	return `${dir} removed`;
}

/** Undo the local CA: the timer, its drop-in, and the directory THIS install created. */
async function undoLocalCa(ctx: HostCtx): Promise<string[]> {
	const done = [await undoRenewal(ctx), await undoTlsDir(ctx)];
	return done.filter((line): line is string => line !== null);
}

// ── the mode's commands ──────────────────────────────────────────────────────

export function tlsCommands(ctx: HostPlanCtx): HostCommand[] {
	const { answers } = ctx;
	if (answers.tls_mode === 'local_ca') return localCaCommands(ctx);
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
	label: (plan) => {
		if (plan.answers.tls_mode === 'local_ca') {
			const extra = String(plan.answers.tls_extra_names ?? '');
			return `certificate: a local certificate authority for ${String(plan.answers.server_name)}${extra === '' ? '' : `, ${extra.split(',').join(', ')}`} (+ renewal timer)`;
		}
		return plan.answers.tls_mode === 'letsencrypt'
			? `certificate: Let's Encrypt for ${String(plan.answers.server_name)} (+ renewal timer)`
			: `certificate: the institution's files, checked (${String(plan.answers.tls_cert_path)})`;
	},
	commands: tlsCommands,
	verify: async (ctx) => {
		if (ctx.answers.tls_mode === 'local_ca') return localCaVerify(ctx);
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
		if (ctx.answers.tls_mode === 'local_ca') {
			const foreign = foreignAuthority(ctx);
			if (foreign !== null) hostRefuse('install.state_conflict', foreign);
			await executeCommands(tlsCommands(ctx), ctx);
			return ran(
				`local certificate authority and certificate in ${ctx.paths.tlsDir}; renewals by ${tlsRenewUnit(ctx.paths.instance, 'timer')}`,
				{ told: localCaTold(ctx) },
			);
		}
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
		if (ctx.answers.tls_mode === 'local_ca') {
			// Only a directory this install creates is ever removed (an existing one —
			// an earlier install's authority staff already trust — is used as it is).
			if (!ctx.fs.exists(ctx.paths.tlsDir)) ctx.created.tls_dir = ctx.paths.tlsDir;
			remember(ctx.created.enabled, tlsRenewUnit(ctx.paths.instance, 'timer'));
			return;
		}
		if (ctx.answers.tls_mode === 'letsencrypt' && !ctx.facts.certIssued) {
			ctx.created.cert_name = certName(ctx);
			remember(ctx.created.enabled, ctx.row.certbotTimer);
		}
	},
	undo: async (ctx) => {
		if (ctx.answers.tls_mode === 'local_ca') {
			const done = await undoLocalCa(ctx);
			return done.length === 0 ? 'no local CA was made by this install' : done.join('; ');
		}
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
