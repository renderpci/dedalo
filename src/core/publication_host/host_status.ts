/**
 * PUBLICATION-HOST PANEL STATUS, PURE. Turns what the engine knows about ONE host into
 * the fixed check list and the panel row the `publication_hosts` widget serves:
 * the registry record, which secret files exist, the outcome of `hostStatus`, the
 * expected rule hash (rules.ts) and the engine version. No I/O, no clock, no config:
 * the widget gathers, this file decides. Spec: engineering/PUBLICATION_HOST_SPEC.md
 * §2.3 (pairing), §3 (API lockstep), §5 (media modes), §6 (status).
 *
 * THE CONTRACT WITH THE WIDGET. HostStatusInput is defined here and the widget builds it
 * exactly; buildHostPanelRow is the ONLY row builder. The widget never derives
 * `pairing_proved`, `apis` or `rules.reported` itself: a status body whose fingerprint is
 * not the registry's would then read as proved.
 *
 * VOCABULARY is update_code's StatusCheck (src/core/update/status.ts): ok / warn /
 * blocked / unknown, and `detail` is a FACT (a code, a version, a count), never a
 * sentence. The client owns the wording.
 *
 * (!) SECRETS NEVER ENTER. The input carries presence booleans and a refusal REASON
 * (secretPresenceOutcome), not tokens or PEM; a
 * failed `hostStatus` contributes its error CODE only (statusOutcomeFromError), and the
 * agent's prose (`media.problems`) is never copied into a check or a row. The agent's
 * free strings that DO surface (agent_version, API release ids, the rules hash) cross only
 * when they match their shape; otherwise the check reads `malformed` and the row null.
 * Even so the client renders every `detail` as text, never HTML.
 *
 * (!) AN UNPROVED AGENT SAYS NOTHING. When the pairing fails (`pairing_mismatch`,
 * `auth`) or the status body's fingerprint is not the registry's, the pairing check is
 * BLOCKED and every agent-derived check reads `unknown`: a body from an unproved peer
 * is not evidence. The row's reported hash and API versions are null for the same reason.
 */

import { DedaloError } from '../errors/dedalo_error.ts';
import type { ErrorCode } from '../errors/registry.ts';
import type { StatusCheck } from '../update/status.ts';
import { AGENT_RELEASE_ID, type AgentStatus, type MediaProbe } from './agent_client.ts';
import { publicationHostFingerprintMatches } from './pairing.ts';
import type { PublicationHostRecord, RegistryError } from './registry.ts';
import type { ExpectedRulesOutcome } from './rules.ts';
import type { SecretPresenceOutcome } from './secrets.ts';
import { AGENT_ANSWER_CODES, LOCAL_STAGE } from './wire.ts';

/** ONE state vocabulary with update_code's readiness lines. */
export type CheckState = StatusCheck['state'];

/** Every row carries exactly these checks, in this order (the client renders by id). */
export const HOST_CHECK_IDS = Object.freeze([
	'registry',
	'secrets',
	'reachable',
	'pairing',
	'agent_version',
	'media_mode',
	'media_mount',
	'media_read_only',
	'rules_hash',
	'api_v1',
	'api_v2',
] as const);

export type HostCheckId = (typeof HOST_CHECK_IDS)[number];

export interface HostCheck {
	id: HostCheckId;
	state: CheckState;
	detail?: string;
}

/**
 * What `hostStatus(name)` produced: the body, or the typed code it failed with. `local`:
 * the failure was minted before anything was dialled (wire.ts LOCAL_STAGE) — it says
 * nothing about the agent, so it never reads reachable ok or pairing ok.
 */
export type StatusOutcome =
	| { ok: true; status: AgentStatus }
	| { ok: false; code: ErrorCode; local?: true };

export interface HostStatusInput {
	record: PublicationHostRecord;
	/** secretPresenceOutcome(name): presence of a USABLE secret plus why one was refused.
	 * A refusal is blocked with its reason, never read as plain absence. */
	secrets: SecretPresenceOutcome;
	status: StatusOutcome;
	/** expectedRulesOutcome(record, body) when `status` is ok; null otherwise. */
	expected: ExpectedRulesOutcome | null;
	/** DEDALO_VERSION (src/core/update/version.ts), NEVER the tagged DEDALO_ENGINE_VERSION:
	 * each API release `<version>_<digest7>` must be the engine release's twin (spec §3). */
	engineVersion: string;
}

export interface HostPanelRow {
	name: string;
	address_label: string;
	public_url: string | null;
	checks: HostCheck[];
	rules: { expected: string | null; reported: string | null };
	apis: Record<'v1' | 'v2', { current: string | null; previous: string | null }>;
	token_present: boolean;
	bundle_present: boolean;
	pairing_proved: boolean;
}

/**
 * How each failed `hostStatus` reads on the two transport checks. EVERY
 * `publication_host.*` code is listed (the test enumerates the error registry), so a
 * new code is a decision here, never a silent `unknown`. A code outside the family
 * (an engine bug) reads `unknown` on both.
 *  - unconfigured: nothing was dialled (missing secret), so neither is known;
 *  - registry_invalid: nothing was dialled (the registry could not be read), so neither
 *    is known;
 *  - unreachable / timeout: no answer, pairing never reached;
 *  - pairing_mismatch / auth: the agent answered and the proof FAILED;
 *  - rejected / failed / busy: the bearer request was answered after the proof (the
 *    first two from wire.ts AGENT_ANSWER_CODES: only wire.ts spells them).
 * Those `ok`s hold only for an ANSWER: a failure minted before any dial (`local` — the
 * local token-vs-registry pairing check, the registry lock's `busy`) reads `unknown`
 * instead (failureState), never ok.
 */
export const REACHABLE_ON_FAILURE: ReadonlyMap<string, CheckState> = new Map<string, CheckState>([
	['publication_host.unconfigured', 'unknown'],
	['publication_host.registry_invalid', 'unknown'],
	['publication_host.unreachable', 'blocked'],
	['publication_host.timeout', 'blocked'],
	['publication_host.pairing_mismatch', 'ok'],
	['publication_host.auth', 'ok'],
	...AGENT_ANSWER_CODES.map((code) => [code, 'ok'] as const),
	['publication_host.busy', 'ok'],
]);

export const PAIRING_ON_FAILURE: ReadonlyMap<string, CheckState> = new Map<string, CheckState>([
	['publication_host.unconfigured', 'unknown'],
	['publication_host.registry_invalid', 'unknown'],
	['publication_host.unreachable', 'unknown'],
	['publication_host.timeout', 'unknown'],
	['publication_host.pairing_mismatch', 'blocked'],
	['publication_host.auth', 'blocked'],
	...AGENT_ANSWER_CODES.map((code) => [code, 'ok'] as const),
	['publication_host.busy', 'ok'],
]);

type MediaMode = MediaProbe['mode'];

/** `shared` must be mounted read-only (it is the WORK host's tree); `copy` must be
 * writable (the agent is its only writer). `none` is decided before this is read. */
const WANT_READ_ONLY: ReadonlyMap<MediaMode, boolean> = new Map<MediaMode, boolean>([
	['shared', true],
	['copy', false],
]);

const UNAVAILABLE = 'status_unavailable';

/** An agent-supplied string that is not the expected shape: the check names this, and the
 * value itself never reaches a check or the row (agent text is not a fact until shaped). */
const MALFORMED = 'malformed';
/** Bounded semver-like: digits, dots, an optional short pre-release/build tail. */
const AGENT_VERSION = /^\d{1,6}(\.\d{1,6}){1,3}([-+][0-9A-Za-z.-]{1,32})?$/;
const SHA256_HEX = /^[0-9a-f]{64}$/;

/** A release id only when it is one (`<version>_<digest7>`); null otherwise. */
function releaseId(value: string | null): string | null {
	return value !== null && AGENT_RELEASE_ID.test(value) ? value : null;
}

function check(id: HostCheckId, state: CheckState, detail?: string): HostCheck {
	return detail === undefined ? { id, state } : { id, state, detail };
}

function unavailable(id: HostCheckId): HostCheck {
	return check(id, 'unknown', UNAVAILABLE);
}

/** The panel's loud line for a registry file that cannot be trusted (never "no hosts"). */
export function registryInvalidCheck(reason: RegistryError['reason']): HostCheck {
	return check('registry', 'blocked', reason);
}

/** A failed `hostStatus` as a code. Only the code crosses: an error MESSAGE may carry
 * agent prose, and agent prose is log-only. */
export function statusOutcomeFromError(thrown: unknown): StatusOutcome {
	if (!(thrown instanceof DedaloError)) return { ok: false, code: 'internal.unexpected' };
	return thrown.coordinates?.stage === LOCAL_STAGE
		? { ok: false, code: thrown.code, local: true }
		: { ok: false, code: thrown.code };
}

/** A failure minted before any dial can never read `ok` on an agent check. */
function failureState(
	table: ReadonlyMap<string, CheckState>,
	code: string,
	local: boolean,
): CheckState {
	const state = table.get(code) ?? 'unknown';
	return local && state === 'ok' ? 'unknown' : state;
}

/** The status body, only when its fingerprint is the registry's. */
function trustedStatus(record: PublicationHostRecord, outcome: StatusOutcome): AgentStatus | null {
	if (!outcome.ok) return null;
	return publicationHostFingerprintMatches(record.fingerprint, outcome.status.instance_fingerprint)
		? outcome.status
		: null;
}

function missingSecrets(
	record: PublicationHostRecord,
	secrets: HostStatusInput['secrets'],
): string[] {
	const missing: string[] = [];
	if (!secrets.token_present) missing.push('token');
	if (record.address.kind === 'tls' && !secrets.bundle_present) missing.push('engine_bundle');
	return missing;
}

function secretsCheck(
	record: PublicationHostRecord,
	secrets: HostStatusInput['secrets'],
): HostCheck {
	if (secrets.refused !== null) return check('secrets', 'blocked', secrets.refused);
	const missing = missingSecrets(record, secrets);
	return missing.length === 0
		? check('secrets', 'ok')
		: check('secrets', 'blocked', missing.join(','));
}

function reachableCheck(outcome: StatusOutcome): HostCheck {
	if (outcome.ok) return check('reachable', 'ok');
	return check(
		'reachable',
		failureState(REACHABLE_ON_FAILURE, outcome.code, outcome.local === true),
		outcome.code,
	);
}

function pairingCheck(record: PublicationHostRecord, outcome: StatusOutcome): HostCheck {
	if (!outcome.ok) {
		return check(
			'pairing',
			failureState(PAIRING_ON_FAILURE, outcome.code, outcome.local === true),
			outcome.code,
		);
	}
	return trustedStatus(record, outcome) === null
		? check('pairing', 'blocked', 'status_fingerprint')
		: check('pairing', 'ok');
}

function agentVersionCheck(status: AgentStatus | null): HostCheck {
	return status === null
		? unavailable('agent_version')
		: AGENT_VERSION.test(status.agent_version)
			? check('agent_version', 'ok', status.agent_version)
			: check('agent_version', 'warn', MALFORMED);
}

/** `shared` and `copy` both serve media (phase 5 built the copy target: the media_copy
 * reconcile keeps a copy host converged); `none` serves none — a warning. */
function mediaModeCheck(status: AgentStatus | null): HostCheck {
	if (status === null) return unavailable('media_mode');
	const { mode } = status.media;
	return check('media_mode', mode === 'none' ? 'warn' : 'ok', mode);
}

function publishedMarkersCheck(media: MediaProbe): HostCheck {
	if (media.mode !== 'shared') return check('media_mount', 'ok', 'present');
	return media.pub_readable === true
		? check('media_mount', 'ok', String(media.pub_markers))
		: check('media_mount', 'blocked', 'pub_unreadable');
}

function mediaMountCheck(status: AgentStatus | null): HostCheck {
	if (status === null) return unavailable('media_mount');
	const { media } = status;
	if (media.mode === 'none') return check('media_mount', 'ok', 'none');
	return media.present ? publishedMarkersCheck(media) : check('media_mount', 'blocked', 'absent');
}

function mediaReadOnlyCheck(status: AgentStatus | null): HostCheck {
	if (status === null) return unavailable('media_read_only');
	const { media } = status;
	if (media.mode === 'none') return check('media_read_only', 'ok', 'none');
	if (media.read_only === null) return check('media_read_only', 'unknown', 'unmeasured');
	const state = media.read_only === WANT_READ_ONLY.get(media.mode) ? 'ok' : 'blocked';
	return check('media_read_only', state, media.read_only ? 'read_only' : 'writable');
}

function compareRuleHashes(
	reported: string | null,
	expected: Extract<ExpectedRulesOutcome, { ok: true }>,
): HostCheck {
	if (reported === null) return check('rules_hash', 'blocked', 'none');
	if (!SHA256_HEX.test(reported)) return check('rules_hash', 'blocked', MALFORMED);
	if (reported !== expected.hash) return check('rules_hash', 'blocked', 'drift');
	return expected.dropped.length > 0
		? check('rules_hash', 'warn', `dropped:${expected.dropped.join(',')}`)
		: check('rules_hash', 'ok', expected.hash.slice(0, 12));
}

/** Drift is BLOCKED, not a warning: the host runs a gate this engine did not render
 * (an old quality list may still expose a tier that is no longer public). */
function rulesHashCheck(
	status: AgentStatus | null,
	expected: ExpectedRulesOutcome | null,
): HostCheck {
	if (status === null) return unavailable('rules_hash');
	// ONE gate profile for shared AND copy (rules.ts rulesRootFor): a copy host's markers
	// are what make an unpublish a 404 before its files are deleted — never not_applicable.
	if (status.media.mode === 'none') return check('rules_hash', 'ok', 'not_applicable');
	if (expected === null || !expected.ok) {
		return check('rules_hash', 'blocked', expected?.reason ?? 'not_computed');
	}
	return compareRuleHashes(status.rules.hash, expected);
}

/** Lockstep (spec §3): release id `<version>_<digest7>`, version = DEDALO_VERSION. */
function apiCheck(api: 'v1' | 'v2', status: AgentStatus | null, engineVersion: string): HostCheck {
	const id = `api_${api}` as const;
	if (status === null) return unavailable(id);
	const { current } = status.apis[api];
	if (current === null) return check(id, 'warn', 'none');
	if (releaseId(current) === null) return check(id, 'warn', MALFORMED);
	return current.split('_')[0] === engineVersion
		? check(id, 'ok', current)
		: check(id, 'warn', `${current} != ${engineVersion}`);
}

export function buildHostChecks(input: HostStatusInput): HostCheck[] {
	const { record, secrets, status, expected, engineVersion } = input;
	const trusted = trustedStatus(record, status);
	return [
		check('registry', 'ok', record.paired_at),
		secretsCheck(record, secrets),
		reachableCheck(status),
		pairingCheck(record, status),
		agentVersionCheck(trusted),
		mediaModeCheck(trusted),
		mediaMountCheck(trusted),
		mediaReadOnlyCheck(trusted),
		rulesHashCheck(trusted, expected),
		apiCheck('v1', trusted, engineVersion),
		apiCheck('v2', trusted, engineVersion),
	];
}

function addressLabel(address: PublicationHostRecord['address']): string {
	return address.kind === 'tls' ? `${address.host}:${address.port}` : `unix:${address.socket}`;
}

function apiVersions(status: AgentStatus | null): HostPanelRow['apis'] {
	const pick = (api: 'v1' | 'v2') => ({
		current: releaseId(status?.apis[api].current ?? null),
		previous: releaseId(status?.apis[api].previous ?? null),
	});
	return { v1: pick('v1'), v2: pick('v2') };
}

function expectedHash(
	status: AgentStatus | null,
	expected: ExpectedRulesOutcome | null,
): string | null {
	return status !== null && expected?.ok === true ? expected.hash : null;
}

function reportedHash(status: AgentStatus | null): string | null {
	const hash = status?.rules.hash ?? null;
	return hash !== null && SHA256_HEX.test(hash) ? hash : null;
}

/** THE row builder: the widget serves this row as-is (see header). */
export function buildHostPanelRow(input: HostStatusInput): HostPanelRow {
	const trusted = trustedStatus(input.record, input.status);
	const checks = buildHostChecks(input);
	return {
		name: input.record.name,
		address_label: addressLabel(input.record.address),
		public_url: input.record.public_url,
		checks,
		rules: {
			expected: expectedHash(trusted, input.expected),
			reported: reportedHash(trusted),
		},
		apis: apiVersions(trusted),
		token_present: input.secrets.token_present,
		bundle_present: input.secrets.bundle_present,
		pairing_proved: checks.some((entry) => entry.id === 'pairing' && entry.state === 'ok'),
	};
}
