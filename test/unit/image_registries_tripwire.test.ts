/**
 * IMAGE REGISTRIES TRIPWIRE — the ONE official registry list
 * (engineering/image_registries.json) is valid, and every copy of it is derived.
 *
 * WHY. Dédalo publishes one signed image to its own registry and to mirrors, and the
 * operator is free to choose any of them. Four consumers read the list — CI, the Docker
 * host, the manual, the update panel — and the failure this gate exists for is a
 * consumer that drifted from it: a host script offering a registry CI does not publish
 * to, a workflow mapping a secret the list never declared, or an unprovisioned entry
 * given a guessed address that somebody else could register and serve images from.
 *
 *  A. THE LIST VALIDATES, and every rule of the closed schema is proved to bite: each
 *     is violated in a mutated copy and must be REPORTED by name (a validator that
 *     returns [] for everything would pass the first leg alone).
 *  B. THE HOST COPY IS THE RENDER. deploy/image_registries.sh equals renderShellFile
 *     byte for byte, AND bash — the consumer — sourcing it yields exactly the
 *     provisioned ids and repositories, primary first (executed, not read). A fixture
 *     list with a quote in a label proves the quoting survives the shell.
 *  C. THE WORKFLOW MAPS EXACTLY THE DECLARED SECRETS. In image-release.yml the publish
 *     job's secret env names equal declaredSecretNames in both directions, each bound
 *     to the secret of its own name; the job declares `environment: image-release`;
 *     the workflow has no pull_request / pull_request_target / workflow_run / schedule
 *     trigger; and no repository of the list is typed in the YAML (the targets come
 *     from the list at run time).
 *
 * DB-free and fs-only (plus one bash spawn): hermetic tier.
 */

import { describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
	hasRegistryDocsRegion,
	REGISTRY_DOCS_BEGIN,
	REGISTRY_DOCS_END,
	REGISTRY_SHELL_PATH,
	renderDocsTable,
	renderShellFile,
	spliceRegistryDocs,
} from '../../scripts/image_registries.ts';
import {
	declaredSecretNames,
	IMAGE_REGISTRIES_PATH,
	type ImageRegistryList,
	isRepositoryReference,
	loadImageRegistries,
	matchOfficialRegistry,
	normalizeRepository,
	provisionedRegistries,
	validateImageRegistries,
} from '../../src/core/update/image_registries.ts';

const ROOT = join(import.meta.dir, '..', '..');
const read = (rel: string): string => readFileSync(join(ROOT, rel), 'utf8');
const REAL_RAW = (): Record<string, unknown> =>
	JSON.parse(readFileSync(IMAGE_REGISTRIES_PATH, 'utf8')) as Record<string, unknown>;

/** The list as a mutation target: the controls reach into it by path, untyped on purpose. */
// biome-ignore lint/suspicious/noExplicitAny: each control plants one violation anywhere in the JSON
type MutableList = Record<string, any>;

/** A deep copy of the real list with one mutation applied. */
function mutated(change: (raw: MutableList) => void): Record<string, unknown> {
	const raw = REAL_RAW() as MutableList;
	change(raw);
	return raw;
}

/**
 * A FIXTURE Docker Hub address, so the controls that need a provisioned Hub mirror
 * stay independent of the real list's address — a test-only value that never
 * reaches a shipped file.
 */
const FIXTURE_HUB = 'docker.io/fixture-namespace-not-real/dedalo';

/** A fixture list where every entry is provisioned (the real one has no primary yet). */
function fixtureList(): ImageRegistryList {
	return mutated((raw) => {
		raw.registries[0].repository = 'registry.example.test:5000/dedalo/dedalo';
		raw.registries[0].provisioned = true;
		raw.registries[0].reason = null;
		raw.registries[0].label = "Dédalo's own registry";
		raw.registries[2].repository = FIXTURE_HUB;
		raw.registries[2].provisioned = true;
		raw.registries[2].reason = null;
		raw.registries.push(raw.registries.splice(0, 1)[0]); // primary listed LAST
	}) as unknown as ImageRegistryList;
}

describe('A. the official registry list validates, and every rule bites', () => {
	test('the real list is valid and loads', () => {
		expect(validateImageRegistries(REAL_RAW())).toEqual([]);
		const list = loadImageRegistries();
		// Anti-vacuity: the three registries the project publishes to are all listed.
		expect(list.registries.map((entry) => entry.id)).toEqual(['gitdedalo', 'ghcr', 'dockerhub']);
		expect(list.registries.filter((entry) => entry.role === 'primary').map((e) => e.id)).toEqual([
			'gitdedalo',
		]);
	});

	test('PROVISIONING IS DELIBERATE: the provisioned set is exactly the registries the project controls', () => {
		// Provisioning an entry publishes official images there and makes install.sh offer
		// it, so it is a fact about who OWNS the address — not something a list edit may
		// assert in passing. GHCR (dedalia-org) and Docker Hub (docker.io/dedalia/dedalo,
		// secrets DOCKERHUB_USERNAME/DOCKERHUB_TOKEN on dedalia-org/dedalo) are Dédalo's
		// (verified 2026-10-09); the gitdedalo registry host does not exist yet — a shipped
		// address for it is one a third party could register and serve "official" images
		// from. Flip this line in the same change that provisions an entry, once the
		// address is under Dédalo's control.
		expect(provisionedRegistries(loadImageRegistries()).map((entry) => entry.id)).toEqual([
			'ghcr',
			'dockerhub',
		]);
	});

	test('an unprovisioned entry names NO address; a provisioned one names a real reference', () => {
		for (const entry of loadImageRegistries().registries) {
			if (entry.provisioned) {
				expect(isRepositoryReference(entry.repository), entry.id).toBe(true);
				expect(entry.reason, entry.id).toBeNull();
			} else {
				expect(entry.repository, entry.id).toBeNull();
				expect((entry.reason ?? '').length, entry.id).toBeGreaterThan(20);
			}
		}
	});

	const RULES: [string, (raw: MutableList) => void, string][] = [
		['unknown top-level key', (raw) => (raw.extra = 1), "unknown key 'extra'"],
		['missing signing', (raw) => Reflect.deleteProperty(raw, 'signing'), "missing key 'signing'"],
		['schema 2', (raw) => (raw.schema = 2), 'schema: must be 1'],
		['plain-http issuer', (raw) => (raw.signing.issuer = 'http://x'), 'signing.issuer'],
		['unanchored identity', (raw) => (raw.signing.identity_regexp = 'image-release'), 'anchored'],
		[
			'identity naming another workflow',
			(raw) =>
				(raw.signing.identity_regexp =
					'^https://github\\.com/x/y/\\.github/workflows/ci\\.yml@refs/heads/master$'),
			'must name .github/workflows/image-release.yml',
		],
		[
			'uncompilable identity',
			(raw) => (raw.signing.identity_regexp = '^(unclosed$'),
			'does not compile',
		],
		[
			'staging off GHCR',
			(raw) => (raw.ci.staging_repository = 'docker.io/x/y'),
			'ci.staging_repository',
		],
		[
			'staging under another owner',
			(raw) => (raw.ci.staging_repository = 'ghcr.io/someone-else/dedalo-build'),
			'owner of the github_token entry',
		],
		['unknown ci key', (raw) => (raw.ci.cache = 'x'), "ci: unknown key 'cache'"],
		['empty registries', (raw) => (raw.registries = []), 'non-empty array'],
		['duplicate id', (raw) => (raw.registries[2].id = 'ghcr'), "duplicate id 'ghcr'"],
		[
			'id not a slug',
			(raw) => (raw.registries[2].id = 'Docker Hub'),
			'.id: must be a lowercase slug',
		],
		['empty label', (raw) => (raw.registries[1].label = ' '), '.label: must be a non-empty string'],
		['unknown role', (raw) => (raw.registries[1].role = 'backup'), '.role:'],
		[
			'two primaries',
			(raw) => (raw.registries[1].role = 'primary'),
			'exactly one entry must be primary (found 2)',
		],
		[
			'no primary',
			(raw) => (raw.registries[0].role = 'mirror'),
			'exactly one entry must be primary (found 0)',
		],
		[
			'provisioned without an address',
			(raw) => (raw.registries[1].repository = null),
			'a provisioned entry needs',
		],
		[
			'provisioned with a tag',
			(raw) => (raw.registries[1].repository = 'ghcr.io/dedalia-org/dedalo:7.0.1'),
			'a provisioned entry needs',
		],
		[
			'provisioned with uppercase',
			(raw) => (raw.registries[1].repository = 'ghcr.io/Dedalia-Org/dedalo'),
			'a provisioned entry needs',
		],
		[
			'provisioned with a reason',
			(raw) => (raw.registries[1].reason = 'x'),
			'must be null once provisioned',
		],
		[
			'PLACEHOLDER address on an unprovisioned entry',
			(raw) => (raw.registries[0].repository = 'registry.gitdedalo.example/dedalo'),
			'names NO address',
		],
		['unprovisioned without a reason', (raw) => (raw.registries[0].reason = ''), 'must say why'],
		[
			'provisioned not a boolean',
			(raw) => (raw.registries[2].provisioned = 'no'),
			'.provisioned: must be a boolean',
		],
		[
			'github_token off GHCR',
			(raw) => {
				raw.registries[1].repository = 'docker.io/renderpci/dedalo';
			},
			'github_token is allowed only for a ghcr.io repository',
		],
		[
			'secret name in the reserved GITHUB_ namespace',
			(raw) => (raw.registries[2].auth.password_secret = 'GITHUB_TOKEN'),
			'.auth.password_secret: must match',
		],
		[
			'secret reused by two entries',
			(raw) => (raw.registries[2].auth.username_secret = 'IMAGE_REGISTRY_GITDEDALO_USERNAME'),
			"secret 'IMAGE_REGISTRY_GITDEDALO_USERNAME' is used twice",
		],
		[
			'unknown auth kind',
			(raw) => (raw.registries[2].auth.kind = 'oidc'),
			".auth.kind: must be 'github_token' or 'secret'",
		],
		[
			'unknown auth key',
			(raw) => (raw.registries[1].auth.token = 'x'),
			"auth: unknown key 'token'",
		],
		['unknown entry key', (raw) => (raw.registries[1].url = 'x'), "unknown key 'url'"],
		[
			'missing entry key',
			(raw) => Reflect.deleteProperty(raw.registries[1], 'reason'),
			"missing key 'reason'",
		],
		[
			'lowercase secret name',
			(raw) => (raw.registries[2].auth.username_secret = 'dockerhub_username'),
			'.auth.username_secret: must match',
		],
		[
			'duplicate repository (Docker Hub spelling)',
			(raw) => {
				raw.registries[2].repository = FIXTURE_HUB;
				raw.registries[2].provisioned = true;
				raw.registries[2].reason = null;
				raw.registries[0].repository = 'fixture-namespace-not-real/dedalo';
				raw.registries[0].provisioned = true;
				raw.registries[0].reason = null;
			},
			"duplicate repository 'fixture-namespace-not-real/dedalo'",
		],
	];

	test.each(RULES)('rule bites: %s', (_name, change, fragment) => {
		const problems = validateImageRegistries(mutated(change));
		expect(
			problems.some((problem) => problem.includes(fragment)),
			`expected a problem containing "${fragment}", got:\n  ${problems.join('\n  ')}`,
		).toBe(true);
	});

	test('anti-vacuity: the rule table covers the schema', () => {
		expect(RULES.length).toBeGreaterThanOrEqual(30);
	});

	test('loadImageRegistries THROWS on an invalid file, naming the rule', () => {
		const dir = mkdtempSync(join(tmpdir(), 'dedalo-registries-'));
		try {
			const path = join(dir, 'list.json');
			writeFileSync(
				path,
				JSON.stringify(mutated((raw) => (raw.registries[0].repository = 'x.example/y'))),
			);
			expect(() => loadImageRegistries(path)).toThrow('names NO address');
			expect(validateImageRegistries('not an object')).toEqual([
				'the registry list must be a JSON object',
			]);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test('the repository grammar: lowercase, optional host[:port], no tag, no digest', () => {
		for (const ok of [
			'ghcr.io/dedalia-org/dedalo',
			'dedalo',
			'localhost:5000/dedalo',
			'a.b-c/d_e/f.g',
		])
			expect(isRepositoryReference(ok), ok).toBe(true);
		for (const bad of [
			'ghcr.io/dedalia-org/dedalo:7.0.1',
			`ghcr.io/dedalia-org/dedalo@sha256:${'0'.repeat(64)}`,
			'GHCR.io/Dedalia-Org/dedalo',
			'a//b',
			'/abs',
			'',
			'x'.repeat(256),
			null,
		])
			expect(isRepositoryReference(bad), String(bad)).toBe(false);
	});

	test('normalization: Docker Hub host spellings are one repository', () => {
		expect(normalizeRepository(' Docker.io/dedalia-org/dedalo ')).toBe('dedalia-org/dedalo');
		expect(normalizeRepository('index.docker.io/dedalia-org/dedalo')).toBe('dedalia-org/dedalo');
		expect(normalizeRepository('ghcr.io/dedalia-org/dedalo')).toBe('ghcr.io/dedalia-org/dedalo');
	});

	test('provisioned order is primary first; only provisioned entries match as official', () => {
		const fixture = fixtureList();
		expect(validateImageRegistries(fixture)).toEqual([]);
		expect(provisionedRegistries(fixture).map((entry) => entry.id)).toEqual([
			'gitdedalo',
			'ghcr',
			'dockerhub',
		]);
		expect(matchOfficialRegistry('GHCR.IO/dedalia-org/dedalo', fixture)).toEqual({
			id: 'ghcr',
			label: 'GitHub Container Registry',
			role: 'mirror',
		});
		expect(matchOfficialRegistry('registry.example.test:5000/dedalo/dedalo', fixture)?.role).toBe(
			'primary',
		);
		// Docker Hub's three spellings are one official repository (fixture list).
		expect(matchOfficialRegistry('fixture-namespace-not-real/dedalo', fixture)?.id).toBe(
			'dockerhub',
		);
		expect(
			matchOfficialRegistry('index.docker.io/fixture-namespace-not-real/dedalo', fixture)?.role,
		).toBe('mirror');
		// The real list: GHCR is official; an unprovisioned entry matches nothing.
		expect(matchOfficialRegistry('ghcr.io/dedalia-org/dedalo')?.id).toBe('ghcr');
		expect(matchOfficialRegistry('fixture-namespace-not-real/dedalo')).toBeNull();
		// The pre-transfer GHCR address is NOT official (a redirect is not a publication).
		expect(matchOfficialRegistry('ghcr.io/renderpci/dedalo')).toBeNull();
		expect(matchOfficialRegistry('registry.museum.example/dedalo')).toBeNull();
	});
});

/** What bash sees after sourcing a rendered file: the four arrays, one line per entry. */
function sourcedInBash(file: string): {
	ids: string[];
	labels: string[];
	roles: string[];
	repos: string[];
	issuer: string;
	identity: string;
} {
	const script = [
		'set -eu',
		'. "$1"',
		'n=${#DEDALO_REGISTRY_IDS[@]}',
		'i=0',
		'while [ "$i" -lt "$n" ]; do',
		'  printf "%s\\t%s\\t%s\\t%s\\n" "${DEDALO_REGISTRY_IDS[$i]}" "${DEDALO_REGISTRY_LABELS[$i]}" "${DEDALO_REGISTRY_ROLES[$i]}" "${DEDALO_REGISTRY_REPOSITORIES[$i]}"',
		'  i=$((i + 1))',
		'done',
		'printf "ISSUER\\t%s\\nIDENTITY\\t%s\\n" "$DEDALO_IMAGE_SIGNING_ISSUER" "$DEDALO_IMAGE_SIGNING_IDENTITY_REGEXP"',
	].join('\n');
	const run = Bun.spawnSync(['bash', '-c', script, 'source-test', file], {
		stdout: 'pipe',
		stderr: 'pipe',
	});
	expect(run.stderr.toString()).toBe('');
	expect(run.exitCode).toBe(0);
	const rows = run.stdout
		.toString()
		.trimEnd()
		.split('\n')
		.map((line) => line.split('\t'));
	const entries = rows.filter((row) => row[0] !== 'ISSUER' && row[0] !== 'IDENTITY');
	return {
		ids: entries.map((row) => row[0] as string),
		labels: entries.map((row) => row[1] as string),
		roles: entries.map((row) => row[2] as string),
		repos: entries.map((row) => row[3] as string),
		issuer: rows.find((row) => row[0] === 'ISSUER')?.[1] ?? '',
		identity: rows.find((row) => row[0] === 'IDENTITY')?.[1] ?? '',
	};
}

describe('B. the host copy (deploy/image_registries.sh) is the render, and bash reads it right', () => {
	test('deploy/image_registries.sh equals renderShellFile(list), byte for byte', () => {
		const onDisk = read(REGISTRY_SHELL_PATH);
		const rendered = renderShellFile(loadImageRegistries());
		expect(
			onDisk.split('\n'),
			`${REGISTRY_SHELL_PATH} is stale — run: bun run registries:gen`,
		).toEqual(rendered.split('\n'));
		expect(onDisk === rendered).toBe(true);
	});

	test('sourced by bash, it offers EXACTLY the provisioned registries, primary first', () => {
		const list = loadImageRegistries();
		const seen = sourcedInBash(join(ROOT, REGISTRY_SHELL_PATH));
		const expected = provisionedRegistries(list);
		// Anti-vacuity: the real list provisions at least one registry (GHCR).
		expect(expected.length).toBeGreaterThanOrEqual(1);
		expect(seen.ids).toEqual(expected.map((entry) => entry.id));
		expect(seen.repos).toEqual(expected.map((entry) => entry.repository as string));
		expect(seen.issuer).toBe(list.signing.issuer);
		expect(seen.identity).toBe(list.signing.identity_regexp);
		// An unprovisioned entry appears only as a comment — never as a value.
		const values = read(REGISTRY_SHELL_PATH)
			.split('\n')
			.filter((line) => !line.startsWith('#'))
			.join('\n');
		for (const entry of list.registries.filter((e) => !e.provisioned))
			expect(values.includes(`'${entry.id}'`), entry.id).toBe(false);
	});

	test('POSITIVE CONTROL: a three-registry fixture with a quote in a label survives the shell', () => {
		const fixture = fixtureList();
		const dir = mkdtempSync(join(tmpdir(), 'dedalo-registries-sh-'));
		try {
			const file = join(dir, 'image_registries.sh');
			writeFileSync(file, renderShellFile(fixture));
			const seen = sourcedInBash(file);
			expect(seen.ids).toEqual(['gitdedalo', 'ghcr', 'dockerhub']);
			expect(seen.labels).toEqual([
				"Dédalo's own registry",
				'GitHub Container Registry',
				'Docker Hub',
			]);
			expect(seen.roles).toEqual(['primary', 'mirror', 'mirror']);
			expect(seen.repos).toEqual([
				'registry.example.test:5000/dedalo/dedalo',
				'ghcr.io/dedalia-org/dedalo',
				FIXTURE_HUB,
			]);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test('the docs table lists every entry, and the region splice is strict', () => {
		const list = loadImageRegistries();
		const table = renderDocsTable(list).split('\n');
		expect(table).toHaveLength(2 + list.registries.length);
		expect(table.filter((row) => row.endsWith('| available |'))).toHaveLength(
			provisionedRegistries(list).length,
		);
		expect(table.filter((row) => row.includes('not yet available — '))).toHaveLength(
			list.registries.length - provisionedRegistries(list).length,
		);
		expect(() => spliceRegistryDocs('# page without markers\n', 'T')).toThrow('no registry region');
		const page = `intro\n${REGISTRY_DOCS_BEGIN}\nold\n${REGISTRY_DOCS_END}\noutro\n`;
		expect(hasRegistryDocsRegion(page)).toBe(true);
		expect(spliceRegistryDocs(page, 'NEW')).toBe(
			`intro\n${REGISTRY_DOCS_BEGIN}\nNEW\n${REGISTRY_DOCS_END}\noutro\n`,
		);
	});
});

/** A workflow's `jobs:` section split into `id → block` (2-space job keys). */
function jobBlocks(src: string): Map<string, string> {
	const blocks = new Map<string, string>();
	const at = src.search(/^jobs:/m);
	for (const block of src
		.slice(at)
		.split(/\n(?= {2}[A-Za-z0-9_-]+:\s*$)/m)
		.slice(1)) {
		const id = block.match(/^\s*([A-Za-z0-9_-]+):/)?.[1];
		if (id !== undefined) blocks.set(id, block);
	}
	return blocks;
}

/** The 2-space keys of the `on:` block. */
function triggerNames(src: string): string[] {
	const block = src.match(/^on:\n((?:(?: {2,}.*)?\n)*)/m)?.[1] ?? '';
	return [...block.matchAll(/^ {2}([A-Za-z_]+):/gm)].map((m) => m[1] as string);
}

describe('C. image-release.yml maps exactly the declared secrets, in the environment job only', () => {
	const workflow = read('.github/workflows/image-release.yml');
	const list = loadImageRegistries();
	const declared = declaredSecretNames(list);

	test('the publish job binds each declared secret to an env key of its own name — no more, no less', () => {
		const publish = jobBlocks(workflow).get('publish') ?? '';
		expect(publish.length, 'image-release.yml has no publish job').toBeGreaterThan(100);
		const bound = [
			...publish.matchAll(/^\s+([A-Z0-9_]+):\s*\$\{\{\s*secrets\.([A-Za-z0-9_]+)\s*\}\}\s*$/gm),
		];
		expect(bound.length).toBeGreaterThanOrEqual(2);
		for (const m of bound)
			expect(m[1], 'an env key must carry the secret of its own name').toBe(m[2]);
		expect(bound.map((m) => m[2]).sort()).toEqual([...declared].sort());
		expect(/^ {4}environment:\s*image-release\s*$/m.test(publish)).toBe(true);
	});

	test('no other job references a secret', () => {
		for (const [id, block] of jobBlocks(workflow)) {
			if (id === 'publish') continue;
			expect(/\$\{\{[^}]*secrets\./.test(block), `job '${id}' references a secret`).toBe(false);
		}
	});

	test('no trigger hands the publish job to fork or unattended code', () => {
		const triggers = triggerNames(workflow);
		// Anti-vacuity: the trigger reader sees the workflow's real triggers.
		expect(triggers).toEqual(['push', 'workflow_dispatch']);
		expect(triggerNames('on:\n  pull_request:\n  push:\n')).toEqual(['pull_request', 'push']);
	});

	test('no repository of the list is typed in the YAML (targets come from the list at run time)', () => {
		const repositories = [
			...list.registries.map((entry) => entry.repository).filter((r): r is string => r !== null),
			list.ci.staging_repository,
		];
		expect(repositories.length).toBeGreaterThanOrEqual(2);
		for (const repository of repositories)
			expect(workflow.includes(repository), `image-release.yml names ${repository} literally`).toBe(
				false,
			);
		// ...and the workflow does read them from the plan.
		expect(workflow).toContain('needs.plan.outputs.staging');
	});
});
