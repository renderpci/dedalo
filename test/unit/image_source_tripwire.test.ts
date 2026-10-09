/**
 * TRIPWIRE — the stacks RUN a pinned image; building is an override; the engine
 * publishes its own client (installer unification D2, 2026-10-09).
 *
 * WHAT WENT WRONG BEFORE. Both root stacks built the product image from `.`, so
 * the image was whatever the checkout happened to be, and nginx bind-mounted the
 * checkout's `./client`. Once images are PULLED, that bind serves client A
 * against engine B — and the wire contract between them is exact.
 *
 * WHAT IS HELD HERE, by OUTCOME — every stack is parsed and interpolated the way
 * compose does it (`${VAR:-default}`), with no environment and with a sample
 * operator `.dedalo.env`:
 *   1. dedalo AND backup resolve to `${DEDALO_IMAGE:-localhost/dedalo}:${DEDALO_VERSION:-local}`.
 *      The default registry host is `localhost`, so a bare stack can never pull a
 *      look-alike image from a public registry;
 *   2. no root stack builds the product image; deploy/compose.build.yml is the
 *      ONLY build, of `dedalo` only, from the project root, tagged with the same name;
 *   3. the engine is told its own source (DEDALO_CONTAINER_IMAGE / _MODE), and the
 *      engine's reader (src/core/update/image_source.ts) reads back what the stack
 *      resolved;
 *   4. the `client` volume: the engine mounts it writable at exactly
 *      DEDALO_CLIENT_PUBLISH_DIR; nginx mounts the same volume read-only at the
 *      directory every shipped proxy conf's `alias` points into (read from the
 *      confs, not typed here); no root stack's nginx binds ./client;
 *   5. the QNAP dev overlay re-mounts the LIVE client and names localhost/dedalo:dev.
 */

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { declaredImageSource } from '../../src/core/update/image_source.ts';
import {
	buildsRepoDockerfile,
	type ComposeDocument,
	type ComposeEnv,
	type ComposeServiceShape,
	imageRepositoryOf,
	imageTagOf,
	interpolateCompose,
	isProductImageService,
	nginxConfFiles,
	PRODUCT_IMAGE_DEFAULT_REPOSITORY,
	parseComposeFile,
	productImageServices,
	shippedComposeStacks,
} from '../helpers/deploy_artifact_corpus.ts';

const REPO_ROOT = join(import.meta.dir, '..', '..');
const BUILD_OVERRIDE = 'deploy/compose.build.yml';
const QNAP_OVERLAY = 'deploy/docker-compose.qnap-dev.yml';
const PUBLISH_KEY = 'DEDALO_CLIENT_PUBLISH_DIR';
/** The link the engine publishes inside the volume (src/core/install/client_publish.ts). */
const PUBLISHED_LINK = 'dedalo';

const STACKS = shippedComposeStacks();

/** Operator environments: none, an official mirror pin, a custom registry with a port. */
const ENVS: { label: string; env: ComposeEnv; image: string; mode: 'pull' | 'build' }[] = [
	{ label: 'no .dedalo.env', env: {}, image: 'localhost/dedalo:local', mode: 'build' },
	{
		label: 'pull from GHCR',
		env: {
			DEDALO_IMAGE: 'ghcr.io/dedalia-org/dedalo',
			DEDALO_VERSION: '7.0.1',
			DEDALO_IMAGE_MODE: 'pull',
			POSTGRES_PASSWORD: 'x',
		},
		image: 'ghcr.io/dedalia-org/dedalo:7.0.1',
		mode: 'pull',
	},
	{
		label: 'custom registry, dev tag',
		env: {
			DEDALO_IMAGE: 'registry.museum.example:5000/ops/dedalo',
			DEDALO_VERSION: '7.0.2-dev',
			DEDALO_IMAGE_MODE: 'pull',
			POSTGRES_PASSWORD: 'x',
		},
		image: 'registry.museum.example:5000/ops/dedalo:7.0.2-dev',
		mode: 'pull',
	},
];

function services(doc: ComposeDocument): Record<string, ComposeServiceShape> {
	return doc.services ?? {};
}

function service(doc: ComposeDocument, name: string): ComposeServiceShape {
	const found = services(doc)[name];
	expect(found, `no '${name}' service`).toBeDefined();
	return found as ComposeServiceShape;
}

function envValue(svc: ComposeServiceShape, key: string): string | undefined {
	const env = svc.environment;
	if (Array.isArray(env))
		return env.find((line) => line.startsWith(`${key}=`))?.slice(key.length + 1);
	const value = env?.[key];
	return value === undefined || value === null ? undefined : String(value);
}

/** Short-syntax volume entries: {source, target, readOnly}. */
function mounts(svc: ComposeServiceShape): { source: string; target: string; readOnly: boolean }[] {
	return (svc.volumes ?? [])
		.filter((entry): entry is string => typeof entry === 'string')
		.map((entry) => {
			const [source = '', target = '', mode = ''] = entry.split(':');
			return { source, target, readOnly: mode.split(',').includes('ro') };
		});
}

/** Docker's rule: the first path component is a registry host iff it has '.' or ':' or is 'localhost'. */
function registryHostOf(repository: string): string | null {
	const first = repository.split('/')[0] as string;
	return repository.includes('/') && (/[.:]/.test(first) || first === 'localhost') ? first : null;
}

/** The client alias of every shipped proxy configuration (comment lines stripped). */
function clientAliases(): { file: string; alias: string }[] {
	const found: { file: string; alias: string }[] = [];
	for (const file of nginxConfFiles()) {
		for (const line of readFileSync(file, 'utf8').split('\n')) {
			const match = /^\s*alias\s+(\S*\/client\/\S*?);/.exec(line);
			if (match !== null) found.push({ file, alias: match[1] as string });
		}
	}
	return found;
}

describe('the compose interpolation helper is honest (positive controls)', () => {
	test('interpolates as compose does', () => {
		expect(interpolateCompose('${A:-x}:${B:-y}', {})).toBe('x:y');
		expect(interpolateCompose('${A:-x}:${B:-y}', { A: 'a', B: '' })).toBe('a:y');
		expect(interpolateCompose('${A-x}', { A: '' })).toBe('');
		expect(interpolateCompose('${A:+on}|${B:+on}', { A: '1' })).toBe('on|');
		expect(interpolateCompose('$$HOME ${A:?need it} $A', { A: 'v' })).toBe('$HOME v v');
		expect(interpolateCompose('${A:-${B:-deep}}', {})).toBe('deep');
	});

	test('product-image detection is by outcome, not spelling', () => {
		expect(isProductImageService({ build: '.' })).toBe(true);
		expect(isProductImageService({ build: { context: './', target: 'dev' } })).toBe(true);
		expect(isProductImageService({ build: { context: '.', dockerfile: 'Other' } })).toBe(false);
		expect(isProductImageService({ image: 'localhost/dedalo:dev' })).toBe(true);
		expect(isProductImageService({ image: 'nginx:alpine' })).toBe(false);
		expect(isProductImageService({ image: 'ghcr.io/dedalia-org/dedalo:7.0.1' })).toBe(false);
		expect(
			isProductImageService(
				{ image: 'ghcr.io/dedalia-org/dedalo:7.0.1' },
				{ DEDALO_IMAGE: 'ghcr.io/dedalia-org/dedalo' },
			),
		).toBe(true);
		expect(imageRepositoryOf('host:5000/a/b:7.0.1@sha256:00')).toBe('host:5000/a/b');
		expect(imageTagOf('host:5000/a/b:7.0.1-dev')).toBe('7.0.1-dev');
		expect(imageTagOf('host:5000/a/b')).toBeNull();
	});
});

describe('the root stacks run a pinned image', () => {
	test('census floor: both root stacks were found', () => {
		expect(STACKS).toContain('docker-compose.yml');
		expect(STACKS).toContain('docker-compose.simple.yml');
	});

	test('dedalo AND backup resolve to DEDALO_IMAGE:DEDALO_VERSION, localhost by default', () => {
		let checked = 0;
		for (const stack of STACKS) {
			for (const { label, env, image } of ENVS) {
				const doc = parseComposeFile(stack, env);
				expect(productImageServices(stack, env), `${stack} (${label})`).toEqual([
					'backup',
					'dedalo',
				]);
				for (const name of ['dedalo', 'backup']) {
					expect(service(doc, name).image, `${stack}:${name} (${label})`).toBe(image);
					checked++;
				}
			}
		}
		expect(checked).toBeGreaterThanOrEqual(12);
		// The default names the registry host `localhost`: docker never resolves it to a
		// public registry, so a bare stack cannot pull a squatted look-alike.
		expect(registryHostOf(PRODUCT_IMAGE_DEFAULT_REPOSITORY)).toBe('localhost');
	});

	test('no root stack builds anything; the build override builds only dedalo, from the root', () => {
		for (const stack of STACKS) {
			for (const [name, svc] of Object.entries(services(parseComposeFile(stack)))) {
				expect(svc.build, `${stack}:${name} builds — building is ${BUILD_OVERRIDE}'s job`).toBe(
					undefined,
				);
			}
		}
		// The override, raw: exactly one service, one key, one context — no target (the
		// Dockerfile's default `production`), no environment, no image of its own.
		const raw = Bun.YAML.parse(readFileSync(join(REPO_ROOT, BUILD_OVERRIDE), 'utf8'));
		expect(raw).toEqual({ services: { dedalo: { build: { context: '.' } } } });
		// Layered over each stack, the built image carries the pinned product name.
		for (const stack of STACKS) {
			const base = service(parseComposeFile(stack), 'dedalo');
			const layered = { ...base, ...service(parseComposeFile(BUILD_OVERRIDE), 'dedalo') };
			expect(buildsRepoDockerfile(layered), stack).toBe(true);
			expect(isProductImageService({ image: layered.image }), stack).toBe(true);
		}
	});

	test("the engine is told its own image source, and the engine's reader reads it back", () => {
		let checked = 0;
		for (const stack of STACKS) {
			for (const { label, env, mode } of ENVS) {
				const dedalo = service(parseComposeFile(stack, env), 'dedalo');
				const repository = imageRepositoryOf(dedalo.image as string);
				expect(envValue(dedalo, 'DEDALO_CONTAINER_IMAGE'), `${stack} (${label})`).toBe(repository);
				expect(envValue(dedalo, 'DEDALO_CONTAINER_IMAGE_MODE'), `${stack} (${label})`).toBe(mode);
				const read = declaredImageSource((key) => envValue(dedalo, key));
				expect(read, `${stack} (${label})`).toEqual({ mode, repository });
				checked++;
			}
		}
		expect(checked).toBeGreaterThanOrEqual(6);
		// Control: the reader refuses what is not a source.
		expect(
			declaredImageSource((key) =>
				key === 'DEDALO_CONTAINER_IMAGE' ? 'ghcr.io/x/dedalo:7.0.1' : 'sideload',
			),
		).toEqual({ mode: null, repository: null });
	});
});

describe('the client volume: the engine publishes, the proxy reads', () => {
	test('the engine mounts `client` writable at exactly DEDALO_CLIENT_PUBLISH_DIR', () => {
		for (const stack of STACKS) {
			const doc = parseComposeFile(stack);
			expect(Object.keys(doc.volumes ?? {}), `${stack}: no top-level client volume`).toContain(
				'client',
			);
			const dedalo = service(doc, 'dedalo');
			const dir = envValue(dedalo, PUBLISH_KEY);
			expect(dir, `${stack}: dedalo does not declare ${PUBLISH_KEY}`).toBeString();
			const mount = mounts(dedalo).filter((m) => m.source === 'client');
			expect(mount, stack).toEqual([{ source: 'client', target: dir as string, readOnly: false }]);
		}
	});

	test('nginx mounts the same volume read-only where every proxy alias points', () => {
		const aliases = clientAliases();
		// Floor: the full stack's conf, the simple one, and the simple TLS template.
		expect(aliases.length).toBeGreaterThanOrEqual(3);
		for (const stack of STACKS) {
			const nginx = mounts(service(parseComposeFile(stack), 'nginx'));
			const client = nginx.filter((m) => m.source === 'client');
			expect(client.length, `${stack}: nginx does not mount the client volume`).toBe(1);
			expect(client[0]?.readOnly, `${stack}: nginx must mount the client read-only`).toBe(true);
			for (const { file, alias } of aliases) {
				expect(alias, `${file} vs ${stack}`).toBe(`${client[0]?.target}/${PUBLISHED_LINK}/`);
			}
			// The confs this stack can be pointed at are among those read.
			const conf = nginx.find((m) => m.target === '/etc/nginx/conf.d/default.conf');
			expect(conf, `${stack}: no proxy conf mount`).toBeDefined();
			expect(nginxConfFiles().map((f) => `./deploy/${f.split('/').at(-1)}`)).toContain(
				conf?.source ?? '',
			);
			// No bind of the checkout's client, anywhere in a root stack's proxy.
			expect(
				nginx.filter((m) => m.source.startsWith('./client')),
				stack,
			).toEqual([]);
		}
	});
});

describe('the QNAP dev overlay', () => {
	test('names the dev tag and serves the LIVE client on purpose', () => {
		const doc = parseComposeFile(QNAP_OVERLAY);
		for (const name of ['dedalo', 'backup', 'git']) {
			expect(service(doc, name).image, `${QNAP_OVERLAY}:${name}`).toBe('localhost/dedalo:dev');
		}
		for (const name of ['dedalo', 'git']) {
			const build = service(doc, name).build as { context?: string; target?: string };
			expect(build, `${QNAP_OVERLAY}:${name}`).toEqual({ context: '.', target: 'dev' });
		}
		expect(mounts(service(doc, 'nginx'))).toContainEqual({
			source: './client',
			target: '/opt/dedalo/master_dedalo/client',
			readOnly: true,
		});
	});
});
