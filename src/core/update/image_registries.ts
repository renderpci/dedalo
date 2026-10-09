/**
 * THE OFFICIAL IMAGE REGISTRIES — loader and validator of the ONE list
 * (`engineering/image_registries.json`, installer unification D1, 2026-10-09).
 *
 * Dédalo publishes the same signed image — one digest — to every PROVISIONED
 * registry of that list: the gitdedalo registry (primary, "our way") and the
 * mirrors. Operators are free to pick any of them, their own registry, or a
 * local build. Every consumer derives from the list, never from a copy:
 *   - CI (`scripts/ci/image_release.ts`): the publish targets, the secret names
 *     the release workflow may map, the signing identity it verifies;
 *   - the Docker host (`deploy/image_registries.sh`, GENERATED from this module
 *     by `scripts/image_registries.ts`);
 *   - the operator manual (the generated table in docs/install/docker.md);
 *   - the code-update panel (official primary / official mirror / custom).
 *
 * WHY THE SCHEMA IS CLOSED. An unprovisioned entry carries `repository: null`
 * and a reason — never a placeholder hostname, because a placeholder that ships
 * is an address somebody can register and serve images from. The validator is
 * the mechanical half of that rule: an unknown key, a guessed address on an
 * unprovisioned entry, or a secret name the workflow carve-out would have to
 * trust is a problem reported by name, and `loadImageRegistries` throws on any.
 *
 * PURE: the file is read per call (no module state), and the only engine import
 * is `projectRoot` — never config.ts, so CI, the host generator and the install
 * mode all load it without a configured instance. Gate:
 * test/unit/image_registries_tripwire.test.ts.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { projectRoot } from '../../config/env.ts';
import { DedaloError } from '../errors/dedalo_error.ts';

export type ImageRegistryRole = 'primary' | 'mirror';

/** How the release workflow logs in: the run's own token (GHCR) or two named secrets. */
export type ImageRegistryAuth =
	| { kind: 'github_token' }
	| { kind: 'secret'; username_secret: string; password_secret: string };

export interface ImageRegistry {
	id: string;
	label: string;
	role: ImageRegistryRole;
	/** Lowercase OCI repository reference (no tag, no digest); null while unprovisioned. */
	repository: string | null;
	/** The repository exists under Dédalo's control and the release workflow publishes to it. */
	provisioned: boolean;
	/** Why the entry names no address yet; null once provisioned. */
	reason: string | null;
	auth: ImageRegistryAuth;
}

export interface ImageRegistryList {
	schema: 1;
	/** The keyless-signing identity every consumer verifies (`cosign verify`). */
	signing: { issuer: string; identity_regexp: string };
	/** Where CI assembles and signs the image once, before copying it to every target. */
	ci: { staging_repository: string };
	registries: readonly ImageRegistry[];
}

/** The official subset the panel names a configured repository with. */
export interface OfficialRegistryMatch {
	id: string;
	label: string;
	role: ImageRegistryRole;
}

/** The list's path inside any Dédalo tree (it ships in the image and in release archives). */
export const IMAGE_REGISTRIES_PATH: string = join(
	projectRoot,
	'engineering',
	'image_registries.json',
);

const TOP_KEYS = ['schema', 'signing', 'ci', 'registries'] as const;
const ENTRY_KEYS = ['id', 'label', 'role', 'repository', 'provisioned', 'reason', 'auth'] as const;
/**
 * A GitHub secret name as the workflow may map it: uppercase, digits, underscores,
 * not a digit first, and never the GITHUB_ namespace GitHub reserves. The names are
 * whatever the repository owner created (Docker Hub's are DOCKERHUB_USERNAME /
 * DOCKERHUB_TOKEN); the workflow binds each to an env key of the same name.
 */
const SECRET_NAME_RE = /^(?!GITHUB_)[A-Z][A-Z0-9_]*$/;
const ID_RE = /^[a-z][a-z0-9]*(?:[_-][a-z0-9]+)*$/;
const WORKFLOW_IN_IDENTITY = '/\\.github/workflows/image-release\\.yml@';

const HOST =
	'[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*(?::[0-9]{1,5})?';
const COMPONENT = '[a-z0-9]+(?:[._-][a-z0-9]+)*';
const REPOSITORY_RE = new RegExp(`^(?:${HOST}/)?${COMPONENT}(?:/${COMPONENT})*$`);

/**
 * A lowercase OCI repository reference: an optional `host[:port]/`, then path
 * components `[a-z0-9]+([._-][a-z0-9]+)*` — and NO tag or digest (a repository
 * names where versions live; the version is always a separate, pinned tag).
 */
export function isRepositoryReference(value: unknown): value is string {
	return typeof value === 'string' && value.length <= 255 && REPOSITORY_RE.test(value);
}

/**
 * The comparable form of a repository: trimmed, lowercased, and with Docker
 * Hub's implicit host made explicit-free (`docker.io/x` ≡ `index.docker.io/x` ≡ `x`).
 */
export function normalizeRepository(value: string): string {
	return value
		.trim()
		.toLowerCase()
		.replace(/^(?:index\.)?docker\.io\//, '');
}

/** The registry host of a reference (`ghcr.io`), or null for an implicit Docker Hub one. */
function hostOf(repository: string): string | null {
	const [first, ...rest] = repository.split('/');
	if (rest.length === 0 || first === undefined) return null;
	return /[.:]/.test(first) || first === 'localhost' ? first : null;
}

/** `ghcr.io/<owner>/…` → `<owner>`; null for any other shape. */
function ghcrOwnerOf(repository: string | null): string | null {
	if (repository === null || hostOf(repository) !== 'ghcr.io') return null;
	return repository.split('/')[1] ?? null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function nonEmptyText(value: unknown): value is string {
	return typeof value === 'string' && value.trim() !== '';
}

/** Keys outside `allowed` (and the allowed extras) — the closed-schema rule, one place. */
function unknownKeys(
	where: string,
	record: Record<string, unknown>,
	allowed: readonly string[],
): string[] {
	return Object.keys(record)
		.filter((key) => !allowed.includes(key))
		.map((key) => `${where}: unknown key '${key}' (the schema is closed)`);
}

function missingKeys(
	where: string,
	record: Record<string, unknown>,
	required: readonly string[],
): string[] {
	return required.filter((key) => !(key in record)).map((key) => `${where}: missing key '${key}'`);
}

function validateSigning(raw: unknown): string[] {
	if (!isRecord(raw)) return ['signing: must be an object {issuer, identity_regexp}'];
	const problems = [
		...unknownKeys('signing', raw, ['issuer', 'identity_regexp']),
		...missingKeys('signing', raw, ['issuer', 'identity_regexp']),
	];
	if (!nonEmptyText(raw.issuer) || !raw.issuer.startsWith('https://'))
		problems.push('signing.issuer: must be an https:// OIDC issuer URL');
	return [...problems, ...identityProblems(raw.identity_regexp)];
}

/** The identity regexp is anchored, compiles, and names the release workflow file. */
function identityProblems(value: unknown): string[] {
	if (typeof value !== 'string' || !value.startsWith('^') || !value.endsWith('$'))
		return ['signing.identity_regexp: must be an anchored (^…$) regular expression'];
	try {
		new RegExp(value);
	} catch {
		return ['signing.identity_regexp: does not compile'];
	}
	return value.includes(WORKFLOW_IN_IDENTITY)
		? []
		: ['signing.identity_regexp: must name .github/workflows/image-release.yml'];
}

function validateCi(raw: unknown, registries: readonly unknown[]): string[] {
	if (!isRecord(raw)) return ['ci: must be an object {staging_repository}'];
	const problems = [
		...unknownKeys('ci', raw, ['staging_repository']),
		...missingKeys('ci', raw, ['staging_repository']),
	];
	const staging = raw.staging_repository;
	const owner = isRepositoryReference(staging) ? ghcrOwnerOf(staging) : null;
	if (owner === null)
		return [...problems, 'ci.staging_repository: must be a ghcr.io/<owner>/<name> repository'];
	const tokenOwners = registries
		.filter(
			(entry) => isRecord(entry) && isRecord(entry.auth) && entry.auth.kind === 'github_token',
		)
		.map((entry) => ghcrOwnerOf((entry as { repository: string | null }).repository));
	if (tokenOwners.some((tokenOwner) => tokenOwner !== owner))
		problems.push(
			`ci.staging_repository: must live under the owner of the github_token entry (ghcr.io/${tokenOwners.join(', ')})`,
		);
	return problems;
}

/** provisioned ⇒ a real reference and no reason; unprovisioned ⇒ NO address and a reason. */
function provisioningProblems(where: string, entry: Record<string, unknown>): string[] {
	if (typeof entry.provisioned !== 'boolean') return [`${where}.provisioned: must be a boolean`];
	return entry.provisioned
		? provisionedProblems(where, entry)
		: unprovisionedProblems(where, entry);
}

function provisionedProblems(where: string, entry: Record<string, unknown>): string[] {
	return [
		...(isRepositoryReference(entry.repository)
			? []
			: [
					`${where}.repository: a provisioned entry needs a lowercase OCI repository (no tag, no digest)`,
				]),
		...(entry.reason === null ? [] : [`${where}.reason: must be null once provisioned`]),
	];
}

function unprovisionedProblems(where: string, entry: Record<string, unknown>): string[] {
	return [
		...(entry.repository === null
			? []
			: [
					`${where}.repository: an unprovisioned entry names NO address (null) — never a placeholder`,
				]),
		...(nonEmptyText(entry.reason)
			? []
			: [`${where}.reason: an unprovisioned entry must say why it is not available`]),
	];
}

function authProblems(where: string, entry: Record<string, unknown>): string[] {
	const auth = entry.auth;
	if (!isRecord(auth)) return [`${where}.auth: must be an object`];
	if (auth.kind === 'github_token') {
		const problems = unknownKeys(`${where}.auth`, auth, ['kind']);
		return ghcrOwnerOf(entry.repository as string | null) === null
			? [...problems, `${where}.auth: github_token is allowed only for a ghcr.io repository`]
			: problems;
	}
	if (auth.kind !== 'secret') return [`${where}.auth.kind: must be 'github_token' or 'secret'`];
	return [
		...unknownKeys(`${where}.auth`, auth, ['kind', 'username_secret', 'password_secret']),
		...['username_secret', 'password_secret']
			.filter((key) => typeof auth[key] !== 'string' || !SECRET_NAME_RE.test(auth[key] as string))
			.map((key) => `${where}.auth.${key}: must match ${SECRET_NAME_RE.source}`),
	];
}

/** The per-entry scalar rules: each a predicate and the sentence its failure reports. */
const ENTRY_FIELD_RULES: readonly [string, (entry: Record<string, unknown>) => boolean, string][] =
	[
		[
			'id',
			(entry) => typeof entry.id === 'string' && ID_RE.test(entry.id),
			'must be a lowercase slug',
		],
		['label', (entry) => nonEmptyText(entry.label), 'must be a non-empty string'],
		[
			'role',
			(entry) => entry.role === 'primary' || entry.role === 'mirror',
			"must be 'primary' or 'mirror'",
		],
	];

function entryProblems(raw: unknown, index: number): string[] {
	const where = `registries[${index}]`;
	if (!isRecord(raw)) return [`${where}: must be an object`];
	return [
		...unknownKeys(where, raw, ENTRY_KEYS),
		...missingKeys(where, raw, ENTRY_KEYS),
		...ENTRY_FIELD_RULES.filter(([, holds]) => !holds(raw)).map(
			([field, , rule]) => `${where}.${field}: ${rule}`,
		),
		...provisioningProblems(where, raw),
		...authProblems(where, raw),
	];
}

/** The values that occur more than once. */
function duplicates(values: readonly unknown[]): string[] {
	const seen = new Set<unknown>();
	const repeated = new Set<string>();
	for (const value of values) {
		if (seen.has(value)) repeated.add(String(value));
		seen.add(value);
	}
	return [...repeated];
}

function secretNamesOf(entry: unknown): string[] {
	if (!isRecord(entry) || !isRecord(entry.auth) || entry.auth.kind !== 'secret') return [];
	return [entry.auth.username_secret, entry.auth.password_secret].filter(
		(name): name is string => typeof name === 'string',
	);
}

/** Cross-entry rules: unique ids, unique repositories, unique secrets, exactly one primary. */
function listProblems(registries: readonly unknown[]): string[] {
	const entries = registries.filter(isRecord);
	const repositories = entries
		.map((entry) => entry.repository)
		.filter((repository): repository is string => typeof repository === 'string')
		.map(normalizeRepository);
	const primaries = entries.filter((entry) => entry.role === 'primary').length;
	return [
		...duplicates(entries.map((entry) => entry.id)).map((id) => `registries: duplicate id '${id}'`),
		...duplicates(repositories).map((repo) => `registries: duplicate repository '${repo}'`),
		...duplicates(registries.flatMap(secretNamesOf)).map(
			(name) => `registries: secret '${name}' is used twice`,
		),
		...(primaries === 1
			? []
			: [`registries: exactly one entry must be primary (found ${primaries})`]),
	];
}

function registriesProblems(raw: unknown): string[] {
	if (!Array.isArray(raw) || raw.length === 0) return ['registries: must be a non-empty array'];
	return [...raw.flatMap(entryProblems), ...listProblems(raw)];
}

/**
 * Every rule the list breaks, as sentences naming the field — [] when it is
 * valid. Never throws: a malformed list is a list of problems.
 */
export function validateImageRegistries(raw: unknown): string[] {
	if (!isRecord(raw)) return ['the registry list must be a JSON object'];
	const registries = Array.isArray(raw.registries) ? raw.registries : [];
	return [
		...unknownKeys('top level', raw, ['$comment', ...TOP_KEYS]),
		...missingKeys('top level', raw, TOP_KEYS),
		...(raw.schema === 1 ? [] : ['schema: must be 1']),
		...validateSigning(raw.signing),
		...validateCi(raw.ci, registries),
		...registriesProblems(raw.registries),
	];
}

/** Load and validate the list; throws `internal.invariant` naming every violated rule. */
export function loadImageRegistries(path: string = IMAGE_REGISTRIES_PATH): ImageRegistryList {
	const raw: unknown = JSON.parse(readFileSync(path, 'utf8'));
	const problems = validateImageRegistries(raw);
	// The list ships WITH the code (it is a repo contract, not operator input): a
	// violation is an engine invariant, typed, with every broken rule in the message.
	if (problems.length > 0)
		throw new DedaloError('internal.invariant', {
			message: `${path}: invalid image registry list —\n  ${problems.join('\n  ')}`,
		});
	return raw as ImageRegistryList;
}

/** The PROVISIONED entries, primary first, then the mirrors in list order. */
export function provisionedRegistries(list: ImageRegistryList): ImageRegistry[] {
	const provisioned = list.registries.filter((entry) => entry.provisioned);
	return [
		...provisioned.filter((entry) => entry.role === 'primary'),
		...provisioned.filter((entry) => entry.role !== 'primary'),
	];
}

/** Every secret name the list declares (provisioned or not) — the workflow carve-out's allowlist. */
export function declaredSecretNames(list: ImageRegistryList): string[] {
	return list.registries.flatMap(secretNamesOf);
}

/**
 * The official entry a configured repository IS, or null when it is custom.
 * Only provisioned entries match: an unprovisioned one names no address.
 */
export function matchOfficialRegistry(
	repository: string,
	list: ImageRegistryList = loadImageRegistries(),
): OfficialRegistryMatch | null {
	const wanted = normalizeRepository(repository);
	const found = provisionedRegistries(list).find(
		(entry) => normalizeRepository(entry.repository as string) === wanted,
	);
	return found === undefined ? null : { id: found.id, label: found.label, role: found.role };
}
