/**
 * THE ENGINE DRILL'S PURE PIECES — what scripts/publication_host_engine_drill.ts needs to
 * stand where the operator stands, held hermetically by
 * test/unit/publication_host_engine_drill_kit.test.ts:
 *   - the engine fragment AS THE OPERATOR LEAVES IT after pasting the token and the bundle
 *     path, keyed by the agent renderer's own ENGINE_KEYS (one spelling of the key names);
 *   - the engine bundle in the order the agent's provisioner writes it (spec §2: client
 *     certificate, client key PKCS#8, CA), 0600 in a 0700 dir;
 *   - where the engine keeps hosts (E2/E3), the pair CLI argv and exit codes (Task 5) and
 *     the widget's wire names (Task 7) — each spelled ONCE here, so a settled rename upstream
 *     is one edit;
 *   - the secret scan every payload and CLI output goes through (Review Focus 5). It
 *     reports LABELS, never the value it found: a red row must not print the secret.
 * No engine import (the drill loads this before it repoints itself to the suite database).
 * That is why the CLI's EXIT is MIRRORED in PAIR_CLI.exit rather than imported: the CLI
 * statically imports src/config/env.ts, the registry and the agent client. The kit gate
 * holds the mirror equal to the CLI's own EXIT.
 */

import {
	chmodSync,
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	statSync,
	writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import {
	agentUrl,
	ENGINE_KEYS,
} from '../../publication/host_agent/src/provision/render/engine_fragment.ts';
import type { TlsMaterial } from './publication_host_agent_drill_kit.ts';

// ── where the engine keeps hosts (E2/E3) ─────────────────────────────────────

export const REGISTRY = {
	file: 'publication_hosts.json',
	secretsDir: 'publication_hosts',
	token: 'token',
	bundle: 'engine_bundle.pem',
} as const;

export function registryFile(privateDir: string): string {
	return join(privateDir, REGISTRY.file);
}

export interface HostSecretFiles {
	readonly dir: string;
	readonly token: string;
	readonly bundle: string;
}

export function hostSecretFiles(privateDir: string, name: string): HostSecretFiles {
	const dir = join(privateDir, REGISTRY.secretsDir, name);
	return { dir, token: join(dir, REGISTRY.token), bundle: join(dir, REGISTRY.bundle) };
}

/** Permission bits, or -1 when the path does not exist. */
export function modeOf(path: string): number {
	return existsSync(path) ? statSync(path).mode & 0o777 : -1;
}

// ── the pair CLI (Task 5) ────────────────────────────────────────────────────

/**
 * `bun run scripts/publication_host_pair.ts <add|replace|remove> <name> [--fragment <f>]`.
 * The host name is POSITIONAL: the CLI's strict parseArgs has no `name` option, so a
 * `--name` flag would be a usage error (exit 2). The token and the bundle path ride inside
 * the fragment (pasted by the operator), so the drill passes neither --token-file nor
 * --bundle. `exit` mirrors the CLI's EXIT (see the header).
 */
export const PAIR_CLI = {
	script: 'scripts/publication_host_pair.ts',
	fragment: '--fragment',
	exit: { ok: 0, usage: 2, refused: 3, failed: 4 },
	/** The live-proof staging dir prefix (the CLI's STAGING_PREFIX, held equal in the kit gate). */
	stagingPrefix: 'pairing_',
} as const;

/**
 * Staging dirs the CLI left under `<private>/publication_hosts/` (it removes its own in
 * `finally`): a refused run that leaves one leaves the token it refused on disk.
 */
export function stagingLeftovers(privateDir: string): string[] {
	const root = join(privateDir, REGISTRY.secretsDir);
	return existsSync(root)
		? readdirSync(root).filter((entry) => entry.startsWith(PAIR_CLI.stagingPrefix))
		: [];
}

export type PairCommand = 'add' | 'replace' | 'remove';

export function pairArgv(command: PairCommand, name: string, fragment?: string): string[] {
	if (command === 'remove') return [command, name];
	if (fragment === undefined) throw new Error(`pair ${command} needs ${PAIR_CLI.fragment}`);
	return [command, name, PAIR_CLI.fragment, fragment];
}

// ── the agent's request log (RF1 observed on the agent side) ────────────────

/** The agent's per-request line at LOG_LEVEL info (publication/host_agent/src/index.ts). */
const AGENT_REQUEST_LINE = /^([A-Z]+) (\S+) (\d{3}) [\d.]+ms$/;

/**
 * RF1, observed where it happens: the agent lines of a refused mutation hold the anonymous
 * pairing probe(s) — `GET <health> 200` — and NOTHING else. Any other request (a 401 on a
 * bearer route above all) means the bearer left before the proof; an engine code alone cannot
 * say so (a 401 is re-probed and reported pairing_mismatch too). No probe at all = the
 * observation is vacuous (logging off, wrong offset) — also a problem. Non-request lines are
 * ignored.
 */
export function bearerSentProblem(lines: readonly string[], healthPath: string): string | null {
	const requests = lines.flatMap((line) => {
		const m = AGENT_REQUEST_LINE.exec(line.trim());
		return m === null ? [] : [{ method: m[1], path: m[2], status: m[3], line: line.trim() }];
	});
	const other = requests.filter(
		(r) => !(r.method === 'GET' && r.path === healthPath && r.status === '200'),
	);
	if (other.length > 0)
		return `the agent saw more than the anonymous probe — the bearer left before the proof: ${other.map((r) => r.line).join(' | ')}`;
	if (requests.length === 0)
		return `no request line in the agent log (is LOG_LEVEL info?): the probe-only claim is unobserved`;
	return null;
}

// ── the widget (Task 7) ──────────────────────────────────────────────────────

export const PANEL = {
	widget: 'publication_hosts',
	registry: 'registry',
	hosts: 'hosts',
	registryOk: 'ok',
	registryInvalid: 'registry_invalid',
} as const;

export const ACTIONS = {
	applyRules: 'apply_rules',
	probe: 'probe',
	rollbackApi: 'rollback_api',
	setHostFields: 'set_host_fields',
	removeHost: 'remove_host',
} as const;

export type CheckState = 'ok' | 'warn' | 'blocked' | 'unknown';
export interface PanelCheck {
	id: string;
	state: CheckState;
	detail?: string;
}
/** The plan's HostPanelRow (Interfaces, host_status.ts), as the wire carries it. */
export interface PanelRow {
	name: string;
	address_label: string;
	public_url: string | null;
	checks: PanelCheck[];
	rules: { expected: string | null; reported: string | null };
	apis: Record<'v1' | 'v2', { current: string | null; previous: string | null }>;
	token_present: boolean;
	bundle_present: boolean;
	pairing_proved: boolean;
}
/**
 * Task 7's get_value data: `registry: {state, reason}` and `hosts`, an array exactly when
 * the state is 'ok' and NULL otherwise ('registry_invalid' / 'registry_locked'). An unusable
 * registry carrying an array is refused here: that is the empty list Review Focus 2 forbids.
 */
export interface Panel {
	readonly registryState: string;
	readonly registryReason: string | null;
	readonly hosts: readonly PanelRow[] | null;
}

const preview = (value: unknown, length: number): string =>
	String(JSON.stringify(value)).slice(0, length);

export function readPanel(data: unknown): Panel {
	const record = (data ?? {}) as Record<string, unknown>;
	const registry = record[PANEL.registry] as Record<string, unknown> | null | undefined;
	const state = registry?.state;
	if (typeof state !== 'string')
		throw new Error(
			`get_value data has no string '${PANEL.registry}.state': ${preview(data, 300)}`,
		);
	const reason = typeof registry?.reason === 'string' ? registry.reason : null;
	const hosts = record[PANEL.hosts];
	if (state === PANEL.registryOk) {
		if (!Array.isArray(hosts))
			throw new Error(`get_value: registry ok but '${PANEL.hosts}' is not an array`);
		return { registryState: state, registryReason: reason, hosts: hosts as PanelRow[] };
	}
	if (hosts !== null)
		throw new Error(
			`get_value: registry ${state} but '${PANEL.hosts}' is ${preview(hosts, 80)}, not null (an unusable registry is never a list)`,
		);
	return { registryState: state, registryReason: reason, hosts: null };
}

export function hostRow(panel: Panel, name: string): PanelRow | null {
	return panel.hosts?.find((row) => row.name === name) ?? null;
}

/** The rows of a usable registry; throws, naming the state, when there are none to read. */
export function okHosts(panel: Panel): readonly PanelRow[] {
	if (panel.hosts === null)
		throw new Error(
			`the registry is ${panel.registryState} (${panel.registryReason ?? 'no reason'})`,
		);
	return panel.hosts;
}

export function checkState(row: PanelRow, id: string): CheckState | null {
	return row.checks.find((check) => check.id === id)?.state ?? null;
}

// ── the engine fragment ──────────────────────────────────────────────────────

export type FragmentAddress =
	| {
			readonly kind: 'tls';
			readonly host: string;
			readonly port: number;
			readonly bundlePath: string;
	  }
	| { readonly kind: 'unix'; readonly socket: string };

export interface FragmentInput {
	readonly instance: string;
	/** The value the operator pastes (or the agent's TOKEN_PLACEHOLDER, left unpasted). */
	readonly token: string;
	readonly fingerprint: string;
	readonly address: FragmentAddress;
}

const UNSAFE_VALUE = /["\\\r\n]/;

function assignment(key: string, value: string): string {
	if (value === '' || UNSAFE_VALUE.test(value))
		throw new Error(`fragment: ${key} is empty or cannot be one double-quoted line`);
	return `${key}="${value}"`;
}

export function renderEngineFragment(input: FragmentInput): string {
	const a = input.address;
	const where =
		a.kind === 'tls'
			? [
					assignment(ENGINE_KEYS.url, agentUrl(a.host, a.port)),
					assignment(ENGINE_KEYS.tlsBundle, a.bundlePath),
				]
			: [assignment(ENGINE_KEYS.socket, a.socket)];
	const lines = [
		'# Engine pairing fragment AS THE OPERATOR LEAVES IT: keys from the agent renderer',
		'# (publication/host_agent/src/provision/render/engine_fragment.ts ENGINE_KEYS), values pasted.',
		assignment(ENGINE_KEYS.instance, input.instance),
		...where,
		assignment(ENGINE_KEYS.token, input.token),
		assignment(ENGINE_KEYS.fingerprint, input.fingerprint),
	];
	return `${lines.join('\n')}\n`;
}

// ── the engine bundle ────────────────────────────────────────────────────────

const PEM_BLOCK = /-----BEGIN ([A-Z0-9 ]+)-----\r?\n[\s\S]*?-----END \1-----\r?\n?/g;

function pemLabels(text: string): string[] {
	return [...text.matchAll(PEM_BLOCK)].map((m) => m[1] as string);
}

export interface BundleParts {
	readonly cert: string;
	readonly key: string;
	readonly ca: string;
}

/** cert + key + ca, one block each, the key PKCS#8 — the provisioner's order and form. */
export function engineBundlePem(parts: BundleParts): string {
	const want: readonly (readonly [keyof BundleParts, string])[] = [
		['cert', 'CERTIFICATE'],
		['key', 'PRIVATE KEY'],
		['ca', 'CERTIFICATE'],
	];
	for (const [part, label] of want) {
		const labels = pemLabels(parts[part]);
		if (labels.length !== 1 || labels[0] !== label)
			throw new Error(
				`engine bundle: the ${part} must be exactly one '${label}' block${part === 'key' ? ' (PKCS#8 — the form the provisioner writes)' : ''}; got ${labels.join(', ') || 'none'}`,
			);
	}
	return [parts.cert, parts.key, parts.ca].map((p) => (p.endsWith('\n') ? p : `${p}\n`)).join('');
}

export function writeEngineBundlePem(path: string, pem: string): void {
	mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
	writeFileSync(path, pem, { mode: 0o600 });
	chmodSync(path, 0o600);
}

/** The client key as PKCS#8 (the drill CA's keys are SEC1: `openssl ecparam -genkey`). */
export function pkcs8Pem(keyPath: string): string {
	const r = Bun.spawnSync(['openssl', 'pkcs8', '-topk8', '-nocrypt', '-in', keyPath], {
		stdout: 'pipe',
		stderr: 'pipe',
	});
	if (r.exitCode !== 0) throw new Error(`openssl pkcs8 failed: ${r.stderr.toString()}`);
	return r.stdout.toString();
}

/** The engine half of the drill CA, as the agent's provisioner would hand it over. */
export function writeEngineBundle(path: string, tls: TlsMaterial): void {
	writeEngineBundlePem(
		path,
		engineBundlePem({
			cert: readFileSync(tls.client.cert, 'utf8'),
			key: pkcs8Pem(tls.client.key),
			ca: readFileSync(tls.ca.cert, 'utf8'),
		}),
	);
}

// ── the secret scan (Review Focus 5) ─────────────────────────────────────────

export interface Secret {
	readonly label: string;
	readonly value: string;
}

export function pemBodyLines(pem: string): string[] {
	return pem.split(/\r?\n/).filter((line) => line.length >= 16 && !line.startsWith('-----'));
}

/** Every body line of the bundle's PRIVATE KEY block, labelled. */
export function bundleKeySecrets(bundlePem: string): Secret[] {
	const key = [...bundlePem.matchAll(PEM_BLOCK)].find((m) => m[1] === 'PRIVATE KEY')?.[0] ?? '';
	return pemBodyLines(key).map((value) => ({ label: 'the engine client key', value }));
}

const PEM_MARKER = /-----BEGIN [A-Z0-9 ]+-----/;

/** The LABELS of the secrets found in `text` (never the values), plus any PEM block. */
export function secretLeaks(text: string, secrets: readonly Secret[]): string[] {
	const found = new Set<string>();
	for (const secret of secrets)
		if (secret.value.length > 0 && text.includes(secret.value)) found.add(secret.label);
	if (PEM_MARKER.test(text)) found.add('a PEM block');
	return [...found];
}

/**
 * The CENTRAL scan (RF5): every get_value / action answer and every pair-CLI output passes
 * through it, whatever its status or exit code — error states included. Throws (the row goes
 * RED) naming WHERE and the LABELS only: the message never carries the secret it found.
 */
export function assertSecretFree(where: string, text: string, secrets: readonly Secret[]): void {
	const found = secretLeaks(text, secrets);
	if (found.length > 0) throw new Error(`secret material in ${where}: ${found.join(', ')}`);
}
