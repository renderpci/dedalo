/**
 * THE PROBE CHILD (terminal installer phase 2, 2026-10-12) — one probe per
 * process, for the interactive front end (install_probe_client.ts spawns it).
 *
 * WHY A CHILD: config.ts freezes at import, and the probes reach it (pg_bin,
 * the diffusion facade, the ontology manifest fetch). The front end's process
 * must stay config-free until the run seeds the install's own environment
 * (scripts/install.ts), so each probe runs here, in a process of its own, and
 * dies with whatever configuration it froze.
 *
 * PROTOCOL: ONE JSON request on stdin — `{probe, answers, secrets, send_to?,
 * prior_env?}`; the secrets travel ONLY there (never argv, never env) — and
 * ONE JSON line on stdout (the probe's outcome). An unknown probe or a
 * malformed request exits 2. A thrown error becomes `{ok:false, detail}` (the
 * deliberate sentence of install_probe_failure.ts: its class, a short sanitized
 * summary, and the 0600 file the full text was written to) with
 * every secret of the request redacted; the request is never echoed. Anything
 * an engine module prints goes to stderr (the parent redacts and drops it), so
 * stdout carries exactly the one line.
 *
 * BOOT ENVIRONMENT: before the first config-touching import the child seeds
 * the lang keys (a prior partial .env without them would make config throw at
 * import) and — only when the answers name all four — the keys that take
 * config off its unconfigured sentinels (src/config/install_state.ts). Never a secret.
 */

import { seedProcessEnv } from '../../config/env.ts';
import { buildInstallPlan, cliBootEnv, INSTALL_ROUTES, type InstallRoute } from './install_plan.ts';
import { probeFailureSentence } from './install_probe_failure.ts';
import { redactSecrets } from './run_files.ts';

export const PROBE_NAMES = [
	'system',
	'identity',
	'db',
	'media',
	'diffusion',
	'mailer',
	'catalog',
] as const;
export type ProbeName = (typeof PROBE_NAMES)[number];

export interface ProbeRequest {
	probe: ProbeName;
	answers: Record<string, unknown>;
	secrets: { db_password?: string; mysql_password?: string; smtp_pass?: string };
	send_to?: string;
	prior_env?: Record<string, string>;
}

/** The env keys whose presence (all four) takes config off its unconfigured sentinels. */
const REQUIRED_BOOT_KEYS = ['ENTITY', 'DB_NAME', 'DB_HOST', 'DB_USER'] as const;

/** The neutral boot environment of `answers` (see the header) — never a secret. */
export function probeBootEnv(answers: Readonly<Record<string, unknown>>): Record<string, string> {
	const boot = cliBootEnv(buildInstallPlan(answers));
	const langKeys = Object.fromEntries(
		Object.entries(boot).filter(([key]) => /LANG/.test(key)),
	) as Record<string, string>;
	const complete = REQUIRED_BOOT_KEYS.every((key) => (boot[key] ?? '') !== '');
	if (!complete) return langKeys;
	const env: Record<string, string> = { ...langKeys };
	for (const key of [...REQUIRED_BOOT_KEYS, 'DB_PORT', 'DB_SOCKET']) {
		if ((boot[key] ?? '') !== '') env[key] = boot[key] as string;
	}
	return env;
}

const NOT_ONE_OBJECT = 'probe request: not one JSON object';

/** `text` as one JSON object, or null. */
function jsonObject(text: string): Record<string, unknown> | null {
	try {
		const parsed: unknown = JSON.parse(text);
		return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
			? (parsed as Record<string, unknown>)
			: null;
	} catch {
		return null;
	}
}

/** The optional fields of a request, when present and well typed. */
function optionalFields(
	request: Partial<ProbeRequest>,
): Pick<ProbeRequest, 'send_to' | 'prior_env'> {
	return {
		...(typeof request.send_to === 'string' ? { send_to: request.send_to } : {}),
		...(request.prior_env === undefined ? {} : { prior_env: priorEnvKept(request.prior_env) }),
	};
}

/** The prior .env keys a probe reads (the catalog: ONTOLOGY_SERVERS) — nothing else is kept. */
const PRIOR_ENV_KEYS: readonly string[] = Object.freeze(['ONTOLOGY_SERVERS']);

function priorEnvKept(value: unknown): Record<string, string> {
	const kept: Record<string, string> = {};
	if (value === null || typeof value !== 'object') return kept;
	for (const key of PRIOR_ENV_KEYS) {
		const item = (value as Record<string, unknown>)[key];
		if (typeof item === 'string') kept[key] = item;
	}
	return kept;
}

/** A parsed request, or the refusal sentence. */
export function parseProbeRequest(text: string): ProbeRequest | string {
	const request = jsonObject(text) as Partial<ProbeRequest> | null;
	if (request === null) return NOT_ONE_OBJECT;
	if (!(PROBE_NAMES as readonly string[]).includes(String(request.probe))) {
		return `probe request: unknown probe (expected ${PROBE_NAMES.join(', ')})`;
	}
	return {
		probe: request.probe as ProbeName,
		answers: (request.answers ?? {}) as Record<string, unknown>,
		secrets: (request.secrets ?? {}) as ProbeRequest['secrets'],
		...optionalFields(request),
	};
}

/** The route the answers name (system check), developer when none. */
function routeOf(answers: Readonly<Record<string, unknown>>): InstallRoute {
	const route = String(answers.route ?? '');
	return (INSTALL_ROUTES as readonly string[]).includes(route)
		? (route as InstallRoute)
		: 'developer';
}

type Probes = typeof import('./probes.ts');

/** Each probe over the (dynamically imported) probes module. */
const PROBE_RUNNERS: Readonly<
	Record<ProbeName, (probes: Probes, request: ProbeRequest) => Promise<unknown>>
> = Object.freeze({
	system: (probes, request) =>
		probes.systemCheck(routeOf(request.answers), {}, String(request.answers.instance ?? '')),
	identity: (probes, request) => probes.identityProbe(request.answers),
	db: (probes, request) => probes.databaseProbe(request.answers, request.secrets.db_password ?? ''),
	media: (probes, request) => probes.mediaProbe(request.answers),
	diffusion: (probes, request) =>
		probes.diffusionProbe(request.answers, request.secrets.mysql_password ?? ''),
	mailer: (probes, request) =>
		probes.mailerProbe(request.answers, request.secrets.smtp_pass ?? '', request.send_to),
	catalog: (probes, request) => probes.catalogProbe(request.answers, request.prior_env ?? {}),
});

/** Run ONE probe (the config-touching modules are imported only now). */
export async function runProbeRequest(request: ProbeRequest): Promise<unknown> {
	seedProcessEnv(probeBootEnv(request.answers));
	const probes = await import('./probes.ts');
	return PROBE_RUNNERS[request.probe](probes, request);
}

/**
 * Every form a secret can take in the answer line: as typed, and as it reads
 * inside a JSON string (a quote or a backslash in it is escaped there).
 */
export function secretForms(secrets: ProbeRequest['secrets']): string[] {
	return Object.values(secrets)
		.filter((value): value is string => typeof value === 'string' && value !== '')
		.flatMap((value) => [value, JSON.stringify(value).slice(1, -1)]);
}

/**
 * The child's whole run over one stdin text: the line to print and the exit
 * code (exported so a gate drives it without a process).
 */
export async function probeChildMain(
	stdinText: string,
): Promise<{ line: string; exitCode: 0 | 2 }> {
	const request = parseProbeRequest(stdinText);
	if (typeof request === 'string') {
		return { line: JSON.stringify({ ok: false, detail: request }), exitCode: 2 };
	}
	const secrets = secretForms(request.secrets);
	try {
		const outcome = await runProbeRequest(request);
		return { line: redactSecrets(JSON.stringify(outcome), secrets), exitCode: 0 };
	} catch (error) {
		const sentence = probeFailureSentence(request.probe, error, secrets);
		return {
			line: JSON.stringify({ ok: false, detail: redactSecrets(sentence, secrets) }),
			exitCode: 0,
		};
	}
}

if (import.meta.main) {
	// Engine modules print to the console: keep stdout for the one answer line.
	console.log = (...args: unknown[]) => console.error(...args);
	console.info = console.log;
	const { line, exitCode } = await probeChildMain(await Bun.stdin.text());
	process.stdout.write(`${line}\n`);
	process.exit(exitCode);
}
