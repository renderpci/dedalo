/**
 * publication_hosts widget — the work engine's view of its publication hosts, and the
 * five things the panel may do to one (engineering/PUBLICATION_HOST_SPEC.md §2, §5, §6).
 *
 * WHAT IT READS. The registry (`core/publication_host/registry.ts`) lists the hosts; for
 * each one the panel asks the agent for its `status` through `agent_client.ts`, which
 * proves the pairing on the unauthenticated `/health` BEFORE it sends the bearer. The row
 * itself is built by `host_status.ts` (buildHostPanelRow), never here: that is where a
 * status body whose fingerprint is not the registry's is refused as evidence, so an
 * unproved agent contributes no version, no hash and no expectation to its row.
 *
 * WHAT IT NEVER CARRIES. The token, the client key, the bundle PEM. A row says only
 * `token_present` / `bundle_present` / `pairing_proved`. A failed agent call contributes
 * its registered error CODE (statusOutcomeFromError), never its message, details or cause:
 * those may hold agent prose, and agent prose is log-only (phase-3 decision E7).
 *
 * WHO SEES WHAT. Any global admin may read the panel (E10). Root's rows add the agent
 * address and the edit-form fields (`qualities`, `probe`) and the payload names the
 * registry path; another admin's rows carry none of that topology. A non-root read still
 * asks each agent for its read-only `status` (no actor, no mutation): the panel's checks
 * are the point of the panel (WC-2026-10-03-publication-hosts-widget records it).
 *
 * ONE HOST NEVER BLANKS THE PANEL. Secrets are read with `secretPresenceOutcome`, which
 * never throws a SecretError: a refused secret (a widened mode, a foreign owner, a
 * malformed bundle) arrives as `refused` and is passed to buildHostPanelRow UNCHANGED —
 * Task 6 blocks that host's `secrets` check with the reason; the widget patches no check.
 * A host with a refused or missing required secret is not dialled. An engine error while
 * computing one host's expectation reads as "not computed". The others render.
 *
 * A REGISTRY FAULT IN AN ACTION is the family's typed error (wire.ts `registryError`:
 * `publication_host.busy` for a held lock, `publication_host.registry_invalid` otherwise);
 * the widget never hand-builds a publication_host.* error.
 *
 * A REGISTRY THAT CANNOT BE READ IS LOUD. A corrupt or hand-edited registry file answers
 * `registry.state: 'registry_invalid'` with `hosts: null` — never an empty list, which
 * would tell the operator that no publication host exists while one is serving.
 *
 * EVERY ACTION IS ROOT-ONLY (decision E10, the media_control precedent). The maintenance
 * dispatch only checks `isGlobalAdmin`; a profile admin must not be able to rewrite a
 * public host's media gate or roll back a public API. The root check runs FIRST, before
 * any module is loaded or any agent is dialled.
 *
 * Hosts are ADDED only by `scripts/publication_host_pair.ts` on the work host. The panel
 * edits `public_url` / `qualities` / `probe` and removes a host; it never takes an
 * address or a credential.
 *
 * TESTABILITY: the widget is built by `createPublicationHostsWidget(loadDeps)`. Production
 * passes `loadDefaultDeps` (the real modules, dynamically imported like media_control's);
 * test/unit/publication_host_widget_native.test.ts passes recording fakes for every I/O
 * dependency and the real pure Task 6 functions.
 */

import { DedaloError } from '../../errors/dedalo_error.ts';
import {
	AGENT_RELEASE_ID,
	type AgentStatus,
	type MediaProbe,
} from '../../publication_host/agent_client.ts';
import {
	type HostPanelRow,
	type HostStatusInput,
	registryInvalidCheck,
	type StatusOutcome,
} from '../../publication_host/host_status.ts';
import {
	HOST_NAME,
	loadRegistry,
	type PublicationHostRecord,
	RegistryError,
	type RegistryFile,
	registryPath,
	updateRegistry,
	validateProbePath,
	validateQualities,
} from '../../publication_host/registry.ts';
import type { ExpectedRules, ExpectedRulesOutcome } from '../../publication_host/rules.ts';
// BY NAME, never a namespace: publication_host_door_tripwire allows only the door to load
// the TLS material (readHostTls); a namespace / whole-module import() would count as one.
import {
	removeHostSecrets,
	type SecretPresenceOutcome,
	secretPresenceOutcome,
} from '../../publication_host/secrets.ts';
import { registryError } from '../../publication_host/wire.ts';
import { type Principal, SUPERUSER_ID } from '../../security/permissions.ts';
import { failAction, refuseAction, type WidgetModule, type WidgetResponse } from './support.ts';

type ApiName = 'v1' | 'v2';
type RulesServer = ExpectedRules['server'];
type ProbePaths = PublicationHostRecord['probe'];
type HostFieldPatch = Partial<Pick<PublicationHostRecord, 'public_url' | 'qualities' | 'probe'>>;

/** A served row: Task 6's row, plus the edit-form fields for root, minus the address otherwise. */
export type ServedHostRow = Omit<HostPanelRow, 'address_label'> & {
	address_label?: string;
	qualities?: string[] | null;
	probe?: ProbePaths;
};

/** Everything the widget touches outside itself. One object, so a test can replace all of it. */
export interface PublicationHostsDeps {
	registryPath(): string;
	loadRegistry(): RegistryFile;
	updateRegistry(fn: (current: RegistryFile) => RegistryFile): RegistryFile;
	/** Never throws a SecretError: a refused secret is reported as `refused` (Task 1). */
	secretPresenceOutcome(name: string): SecretPresenceOutcome;
	/** Called INSIDE the registry lock by remove_host (never before taking it). */
	removeHostSecrets(name: string): void;
	forgetPairing(name: string): void;
	hostStatus(name: string): Promise<AgentStatus>;
	hostMediaProbe(name: string): Promise<MediaProbe>;
	hostApplyRules(
		name: string,
		req: { server: RulesServer; text: string; hash: string },
		actor: string,
	): Promise<{ hash: string; reloaded: true }>;
	hostRollbackRelease(
		name: string,
		api: ApiName,
		actor: string,
	): Promise<{ from: string; to: string }>;
	expectedRulesForHost(record: PublicationHostRecord, status: AgentStatus): ExpectedRules;
	expectedRulesOutcome(record: PublicationHostRecord, status: AgentStatus): ExpectedRulesOutcome;
	statusOutcomeFromError(error: unknown): StatusOutcome;
	buildHostPanelRow(input: HostStatusInput): HostPanelRow;
	engineQualities(): string[];
	filterPublicQualities(configured: readonly string[]): string[];
	engineVersion(): string;
}

export type DepsLoader = () => Promise<PublicationHostsDeps>;

type BoundAction = (
	options: Record<string, unknown>,
	principal: Principal,
	loadDeps: DepsLoader,
) => Promise<WidgetResponse>;

/** The production dependencies: the real modules, imported on first use. */
export async function loadDefaultDeps(): Promise<PublicationHostsDeps> {
	const client = await import('../../publication_host/agent_client.ts');
	const rules = await import('../../publication_host/rules.ts');
	const status = await import('../../publication_host/host_status.ts');
	const protection = await import('../../media/protection.ts');
	// DEDALO_VERSION, not DEDALO_ENGINE_VERSION: release ids are `<DEDALO_VERSION>_<digest7>`
	// (Task 6 lockstep); the prerelease tag would put every API check at warn.
	const { DEDALO_VERSION } = await import('../../update/version.ts');
	return {
		registryPath,
		loadRegistry,
		updateRegistry,
		secretPresenceOutcome,
		removeHostSecrets,
		forgetPairing: client.forgetPairing,
		hostStatus: client.hostStatus,
		hostMediaProbe: client.hostMediaProbe,
		hostApplyRules: client.hostApplyRules,
		hostRollbackRelease: client.hostRollbackRelease,
		expectedRulesForHost: rules.expectedRulesForHost,
		expectedRulesOutcome: rules.expectedRulesOutcome,
		statusOutcomeFromError: status.statusOutcomeFromError,
		buildHostPanelRow: status.buildHostPanelRow,
		engineQualities: protection.getPublicQualities,
		filterPublicQualities: protection.filterPublicQualities,
		engineVersion: () => DEDALO_VERSION,
	};
}

// ── guards ──────────────────────────────────────────────────────────────────

/** Root, not merely global admin (E10). Runs before anything is loaded or dialled. */
function requireRoot(principal: Principal, action: string): void {
	if (principal.userId !== SUPERUSER_ID) {
		throw new DedaloError('perm.denied', {
			message: `only the root user can run publication_hosts.${action}`,
		});
	}
}

function hostName(options: Record<string, unknown>): string {
	const name = options.name;
	if (typeof name !== 'string' || !HOST_NAME.test(name)) {
		refuseAction('Error. Invalid publication host name.');
	}
	return name;
}

function apiName(options: Record<string, unknown>): ApiName {
	const api = options.api;
	if (api !== 'v1' && api !== 'v2') refuseAction('Error. Invalid api. Allowed: v1 | v2');
	return api;
}

function refuseUnknownHost(name: string): never {
	refuseAction(
		`Error. No publication host named '${name}' is registered. Hosts are added on the work host with sudo -u <engine user> bun run dedalo:pair-publication-host (run as the user that runs Dédalo, never root).`,
		{ host: name },
	);
}

/** A RegistryError becomes the family's typed error (Task 2); anything else passes through. */
function registryFailure(error: unknown): unknown {
	return error instanceof RegistryError ? registryError(error.reason) : error;
}

function readRegistryOrFail(deps: PublicationHostsDeps): RegistryFile {
	try {
		return deps.loadRegistry();
	} catch (error) {
		throw registryFailure(error);
	}
}

/** Load + fn + save under the registry lock. A refusal thrown by `fn` writes nothing. */
function writeRegistry(
	deps: PublicationHostsDeps,
	fn: (current: RegistryFile) => RegistryFile,
): RegistryFile {
	try {
		return deps.updateRegistry(fn);
	} catch (error) {
		throw registryFailure(error);
	}
}

function requireHost(deps: PublicationHostsDeps, name: string): PublicationHostRecord {
	const record = readRegistryOrFail(deps).hosts.find((host) => host.name === name);
	if (record === undefined) refuseUnknownHost(name);
	return record;
}

/** The `X-Dedalo-Actor` value the agent audits. Every action is root-only, so this names root. */
function actorFor(principal: Principal): string {
	return `dedalo_user:${principal.userId}`;
}

/** One log line per mutation. Never a token, a key or a request body. */
function logMutation(action: string, name: string, principal: Principal, detail: string): void {
	console.info(`[publication_hosts] ${action} host=${name} user=${principal.userId} ${detail}`);
}

// ── panel (get_value) ───────────────────────────────────────────────────────

type RegistryRead =
	| { ok: true; file: RegistryFile }
	| { ok: false; reason: RegistryError['reason'] };

function readRegistry(deps: PublicationHostsDeps): RegistryRead {
	try {
		return { ok: true, file: deps.loadRegistry() };
	} catch (error) {
		if (!(error instanceof RegistryError)) throw error;
		// loadRegistry takes no lock, so a read never meets a held one; were it to, the file
		// is busy, not broken: the action family's `publication_host.busy`, never a "repair".
		if (error.reason === 'locked') throw registryFailure(error);
		console.error(`[publication_hosts] registry unusable: ${error.reason}`, error);
		return { ok: false, reason: error.reason };
	}
}

export function addressLabel(address: PublicationHostRecord['address']): string {
	return address.kind === 'tls' ? `${address.host}:${address.port}` : `unix:${address.socket}`;
}

/** Dial only a host whose required secrets are present AND accepted (bundle: TLS hosts only). */
function dialable(record: PublicationHostRecord, secrets: SecretPresenceOutcome): boolean {
	if (secrets.refused !== null) {
		console.warn(
			`[publication_hosts] secret refused host=${record.name} reason=${secrets.refused}`,
		);
		return false;
	}
	return secrets.token_present && (record.address.kind !== 'tls' || secrets.bundle_present);
}

function notDialled(): StatusOutcome {
	return { ok: false, code: 'publication_host.unconfigured' };
}

/** The agent's status, or the registered CODE of why there is none (Task 6). Never the message. */
async function readStatus(name: string, deps: PublicationHostsDeps): Promise<StatusOutcome> {
	try {
		return { ok: true, status: await deps.hostStatus(name) };
	} catch (error) {
		const outcome = deps.statusOutcomeFromError(error);
		console.warn(
			`[publication_hosts] status failed host=${name} code=${outcome.ok ? 'none' : outcome.code}`,
		);
		// an untyped failure is an engine bug: it keeps its stack in the log
		if (!(error instanceof DedaloError)) console.error(error);
		return outcome;
	}
}

/** Task 6's expectation, only from a status this call obtained. An engine bug reads "not computed". */
function readExpected(
	record: PublicationHostRecord,
	status: StatusOutcome,
	deps: PublicationHostsDeps,
): ExpectedRulesOutcome | null {
	if (!status.ok) return null;
	try {
		return deps.expectedRulesOutcome(record, status.status);
	} catch (error) {
		console.error(`[publication_hosts] expected rules failed host=${record.name}`, error);
		return null;
	}
}

function servedRow(
	row: HostPanelRow,
	record: PublicationHostRecord,
	isRoot: boolean,
): ServedHostRow {
	if (isRoot) return { ...row, qualities: record.qualities, probe: record.probe };
	const { address_label: _topology, ...reduced } = row;
	return reduced;
}

async function hostRow(
	record: PublicationHostRecord,
	deps: PublicationHostsDeps,
	isRoot: boolean,
): Promise<ServedHostRow> {
	const secrets = deps.secretPresenceOutcome(record.name);
	const status = dialable(record, secrets) ? await readStatus(record.name, deps) : notDialled();
	const row = deps.buildHostPanelRow({
		record,
		secrets,
		status,
		expected: readExpected(record, status, deps),
		engineVersion: deps.engineVersion(),
	});
	return servedRow(row, record, isRoot);
}

export async function publicationHostsValue(
	deps: PublicationHostsDeps,
	principal: Principal,
): Promise<WidgetResponse> {
	const isRoot = principal.userId === SUPERUSER_ID;
	const read = readRegistry(deps);
	const common = {
		registry_path: isRoot ? deps.registryPath() : null,
		engine_qualities: deps.engineQualities(),
		is_root: isRoot,
	};
	if (!read.ok) {
		return {
			data: {
				...common,
				registry: {
					state: 'registry_invalid',
					reason: read.reason,
					check: registryInvalidCheck(read.reason),
				},
				hosts: null,
			},
		};
	}
	const hosts = await Promise.all(read.file.hosts.map((record) => hostRow(record, deps, isRoot)));
	return { data: { ...common, registry: { state: 'ok', reason: null, check: null }, hosts } };
}

// ── field validation (set_host_fields) ──────────────────────────────────────

function parseUrl(value: string): URL | null {
	try {
		return new URL(value);
	} catch {
		return null;
	}
}

/**
 * An https ORIGIN and nothing else: no credentials, path, query or fragment. Stored as
 * `url.origin`. Syntax only — the phase-6 probe dials it through the SSRF guard, which
 * is where an address is judged (at fetch time, not at save time).
 */
export function normalizePublicUrl(value: unknown): string | null {
	if (value === null) return null;
	const url = typeof value === 'string' ? parseUrl(value) : null;
	if (url === null || url.href !== `https://${url.host}/`) {
		refuseAction('Error. public_url must be an https origin (https://host[:port]), or null.');
	}
	return url.origin;
}

function assertQualityList(value: unknown): asserts value is string[] {
	if (!Array.isArray(value) || value.length === 0 || !value.every((q) => typeof q === 'string')) {
		refuseAction('Error. qualities must be a non-empty list of quality folders, or null.');
	}
}

/**
 * The host's public qualities. `null` = follow the engine's. A list must survive the
 * engine's own public filter WHOLE (a master tier or a malformed folder is refused, by
 * name — never silently dropped), and hold no duplicate.
 */
export function normalizeQualities(
	value: unknown,
	filter: (configured: readonly string[]) => string[],
): string[] | null {
	if (value === null) return null;
	assertQualityList(value);
	const kept = filter(value);
	const refused = value.filter((quality) => !kept.includes(quality.replace(/^\/+|\/+$/g, '')));
	if (refused.length > 0) {
		refuseAction(`Error. Not a public quality: ${refused.join(', ')}.`);
	}
	if (new Set(kept).size !== kept.length) refuseAction('Error. qualities holds a duplicate.');
	return registryField(() => validateQualities(kept), 'Error. qualities: ');
}

/**
 * The registry's OWN field check (registry.ts), run before the locked write: a value the
 * registry would refuse is the operator's input error, never a "corrupt registry"
 * (saveRegistry's invalid_shape would map to publication_host.registry_invalid).
 */
function registryField<T>(validate: () => T, prefix: string): T {
	try {
		return validate();
	} catch (error) {
		if (error instanceof RegistryError) refuseAction(`${prefix}${error.message}.`);
		throw error;
	}
}

function probePath(value: unknown, which: string): string | null {
	if (value === null || value === undefined) return null;
	return registryField(
		() => validateProbePath(value, `probe.${which}`),
		'Error. A probe path must be a media path relative to the media folder, or null: ',
	);
}

/** The two phase-6 probe files, as paths relative to /dedalo/<mediaDir>/. */
export function normalizeProbe(value: unknown): ProbePaths {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		refuseAction('Error. probe must be an object {published, unpublished}.');
	}
	const paths = value as Record<string, unknown>;
	return {
		published: probePath(paths.published, 'published'),
		unpublished: probePath(paths.unpublished, 'unpublished'),
	};
}

export function hostFieldPatch(
	options: Record<string, unknown>,
	filter: (configured: readonly string[]) => string[],
): HostFieldPatch {
	const patch: HostFieldPatch = {};
	if (Object.hasOwn(options, 'public_url'))
		patch.public_url = normalizePublicUrl(options.public_url);
	if (Object.hasOwn(options, 'qualities'))
		patch.qualities = normalizeQualities(options.qualities, filter);
	if (Object.hasOwn(options, 'probe')) patch.probe = normalizeProbe(options.probe);
	if (Object.keys(patch).length === 0) {
		refuseAction('Error. Nothing to change: send public_url, qualities and/or probe.');
	}
	return patch;
}

export function replaceHost(
	current: RegistryFile,
	name: string,
	patch: HostFieldPatch,
): RegistryFile {
	if (!current.hosts.some((host) => host.name === name)) refuseUnknownHost(name);
	return {
		...current,
		hosts: current.hosts.map((host) => (host.name === name ? { ...host, ...patch } : host)),
	};
}

export function withoutHost(current: RegistryFile, name: string): RegistryFile {
	if (!current.hosts.some((host) => host.name === name)) refuseUnknownHost(name);
	return { ...current, hosts: current.hosts.filter((host) => host.name !== name) };
}

/** withoutHost, only while the entry is still the pairing `seen` (never a newer re-pairing). */
export function withoutPairing(current: RegistryFile, seen: PublicationHostRecord): RegistryFile {
	const now = current.hosts.find((host) => host.name === seen.name);
	if (now === undefined) refuseUnknownHost(seen.name);
	if (now.fingerprint !== seen.fingerprint || now.paired_at !== seen.paired_at) {
		refuseAction(
			`Error. Host '${seen.name}' was re-paired while it was being removed; nothing was removed. Reload the panel and retry.`,
			{ host: seen.name },
		);
	}
	return withoutHost(current, seen.name);
}

// ── actions ─────────────────────────────────────────────────────────────────

function renderRules(
	deps: PublicationHostsDeps,
	record: PublicationHostRecord,
	status: AgentStatus,
): ExpectedRules {
	try {
		return deps.expectedRulesForHost(record, status);
	} catch (error) {
		console.warn(`[publication_hosts] rules not renderable host=${record.name}`, error);
		refuseAction(
			`Error. The media rules for '${record.name}' cannot be rendered from its reported root and qualities. See the server log.`,
			{ host: record.name },
		);
	}
}

const SHA256_HEX = /^[0-9a-f]{64}$/;

/** An agent-reported hash, named only when it has the shape of one. */
function reportedHash(hash: unknown): string {
	return typeof hash === 'string' && SHA256_HEX.test(hash)
		? `rule hash ${hash}`
		: 'a malformed rule hash';
}

/** An agent-reported release id, only when it has the shape of one (E7); otherwise 'malformed'. */
export function releaseIdOrMalformed(value: unknown): string {
	return typeof value === 'string' && AGENT_RELEASE_ID.test(value) ? value : 'malformed';
}

function rulesAppliedMsg(
	name: string,
	server: RulesServer,
	hash: string,
	dropped: string[],
): string {
	const note = dropped.length === 0 ? '' : ` Not public, left out: ${dropped.join(', ')}.`;
	return `OK. Media rules applied on '${name}' (${server}, ${hash.slice(0, 12)}).${note}`;
}

/**
 * apply_rules: status (pairing proved first) → expected rules from THAT status → rules.apply.
 * A host that is not `shared` is refused before anything is sent. A reported hash other
 * than the one sent is a failure, never an OK.
 */
const applyRulesAction: BoundAction = async (options, principal, loadDeps) => {
	requireRoot(principal, 'apply_rules');
	const name = hostName(options);
	const deps = await loadDeps();
	const record = requireHost(deps, name);
	const status = await deps.hostStatus(name);
	if (status.media.mode !== 'shared') {
		refuseAction(
			`Error. Host '${name}' reports media mode '${status.media.mode}': media rules apply only to a 'shared' host.`,
			{ host: name },
		);
	}
	const rules = renderRules(deps, record, status);
	const request = { server: rules.server, text: rules.text, hash: rules.hash };
	const applied = await deps.hostApplyRules(name, request, actorFor(principal));
	if (applied.hash !== rules.hash) {
		// agent prose is log-only (E7): the raw value goes to the log, never into the sentence
		console.warn(`[publication_hosts] rule hash mismatch host=${name} reported=${applied.hash}`);
		failAction(
			`Error. Host '${name}' reports ${reportedHash(applied.hash)}, but ${rules.hash} was sent. Check the agent audit log.`,
			{ coordinates: { host: name } },
		);
	}
	logMutation('apply_rules', name, principal, `hash=${rules.hash}`);
	return {
		data: { host: name, server: rules.server, hash: rules.hash, dropped: rules.dropped },
		msg: rulesAppliedMsg(name, rules.server, rules.hash, rules.dropped),
	};
};

/** probe: the agent's media.probe, read-only, but still root-only (E10: one rule for every action). */
const probeAction: BoundAction = async (options, principal, loadDeps) => {
	requireRoot(principal, 'probe');
	const name = hostName(options);
	const deps = await loadDeps();
	requireHost(deps, name);
	const probe = await deps.hostMediaProbe(name);
	const count = probe.problems.length;
	return {
		data: { host: name, probe },
		msg:
			count === 0
				? `OK. Media probe on '${name}' found no problem.`
				: `Media probe on '${name}' found ${count} problem(s).`,
	};
};

/** rollback_api: swap the API's `current` back on the agent. */
const rollbackApiAction: BoundAction = async (options, principal, loadDeps) => {
	requireRoot(principal, 'rollback_api');
	const name = hostName(options);
	const api = apiName(options);
	const deps = await loadDeps();
	requireHost(deps, name);
	const swap = await deps.hostRollbackRelease(name, api, actorFor(principal));
	const from = releaseIdOrMalformed(swap.from);
	const to = releaseIdOrMalformed(swap.to);
	logMutation('rollback_api', name, principal, `api=${api} ${from} -> ${to}`);
	if (from === 'malformed' || to === 'malformed') {
		console.warn(
			`[publication_hosts] rollback_api host=${name} malformed release id from=${JSON.stringify(swap.from)} to=${JSON.stringify(swap.to)}`,
		);
	}
	return {
		data: { host: name, api, from, to },
		msg: `OK. API ${api} on '${name}' rolled back: ${from} → ${to}.`,
	};
};

/**
 * set_host_fields: the three operator-editable fields, validated whole before the locked
 * write. No pairing proof is touched: none of the three is the address, the instance or a
 * credential.
 */
const setHostFieldsAction: BoundAction = async (options, principal, loadDeps) => {
	requireRoot(principal, 'set_host_fields');
	const name = hostName(options);
	const deps = await loadDeps();
	const patch = hostFieldPatch(options, deps.filterPublicQualities);
	writeRegistry(deps, (current) => replaceHost(current, name, patch));
	const fields = Object.keys(patch);
	logMutation('set_host_fields', name, principal, `fields=${fields.join(',')}`);
	return {
		data: { host: name, fields },
		msg: `OK. Host '${name}' updated: ${fields.join(', ')}.`,
	};
};

/**
 * remove_host: ONE registry lock hold — re-check that the entry is still the pairing the
 * operator saw (fingerprint + paired_at; a pair `replace` in between refuses, retry), delete
 * the SECRETS, then drop the entry — then this process's pairing proof (Task 4
 * forgetPairing). Secrets before the entry: a failure between them leaves a VISIBLE entry
 * whose `secrets` check is red and which the operator can remove again; the other order
 * would leave an invisible credential on disk that no panel lists. A secrets failure throws
 * inside the lock, so the registry is not written.
 */
const removeHostAction: BoundAction = async (options, principal, loadDeps) => {
	requireRoot(principal, 'remove_host');
	const name = hostName(options);
	const deps = await loadDeps();
	const seen = requireHost(deps, name);
	writeRegistry(deps, (current) => {
		const next = withoutPairing(current, seen);
		try {
			deps.removeHostSecrets(name);
		} catch (error) {
			failAction(
				`Error. The credentials of host '${name}' could not be deleted, so the host stays registered. See the server log.`,
				{ cause: error, coordinates: { host: name } },
			);
		}
		return next;
	});
	deps.forgetPairing(name);
	logMutation('remove_host', name, principal, 'removed');
	return {
		data: { host: name, removed: true },
		msg: `OK. Host '${name}' removed from this engine (registry entry and credentials). The agent on the publication host is untouched.`,
	};
};

export function createPublicationHostsWidget(loadDeps: DepsLoader): WidgetModule {
	const bind =
		(action: BoundAction) =>
		(options: Record<string, unknown>, principal: Principal): Promise<WidgetResponse> =>
			action(options, principal, loadDeps);
	return {
		spec: {
			id: 'publication_hosts',
			category: 'publication',
			label: { kind: 'label', key: 'publication_hosts' },
		},
		apiActions: {
			apply_rules: bind(applyRulesAction),
			probe: bind(probeAction),
			rollback_api: bind(rollbackApiAction),
			set_host_fields: bind(setHostFieldsAction),
			remove_host: bind(removeHostAction),
		},
		getValue: async (_options, principal) => publicationHostsValue(await loadDeps(), principal),
	};
}

export const widget: WidgetModule = createPublicationHostsWidget(loadDefaultDeps);
