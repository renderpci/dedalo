/**
 * TOOL HTTP ROUTES + BOOT HOOKS — the ToolServerModule facets that let a tool
 * serve a GET route and arm a boot timer WITHOUT src/ naming the tool
 * (src/core/tools/{module,loader}.ts; 2026-09-24, tool_export's download route
 * and TTL sweeper moved off server.ts). `core_tool_edge_tripwire` keeps src/
 * from importing a tool; this gate proves the replacement contract holds:
 *
 *  A. the loader REFUSES an unsafe route: bad grammar, a reserved namespace
 *     (the client tree's directories, every engine route segment, the media
 *     dir), a non-function handler or onBoot, and a prefix overlapping one an
 *     already-loaded tool serves (either direction);
 *  B. the reserved list is COMPLETE by derivation: every top-level directory
 *     of the client tree and the first segment of every engine route prefix
 *     (`*_URL_PREFIX` / `*_URL_BASE` constants in src/, `/dedalo/<seg>/`
 *     literals the router compares against) is reserved;
 *  C. the real registry: tool_export's download route is found by
 *     `toolHttpRouteFor`, a client asset path is not, and `startToolBootHooks`
 *     runs every onBoot once, returns their stops, and survives a throwing one;
 *     an async onBoot (a promise) or a handle without stop() is refused, never
 *     registered, and its rejection is logged, never unhandled.
 * The router's dispatch itself is proved end to end by
 * export_artifact_download_native (handleRequest → the tool route → 200).
 */

import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { Glob } from 'bun';
import { config } from '../../src/config/config.ts';
import {
	assertNoRouteOverlap,
	type LoadedTool,
	loadToolModules,
	startToolBootHooks,
	toolHttpRouteFor,
	validateToolModule,
} from '../../src/core/tools/loader.ts';
import {
	TOOL_ROUTE_RESERVED_SEGMENTS,
	type ToolServerModule,
} from '../../src/core/tools/module.ts';
import { stripComments } from '../helpers/strip_comments.ts';

const REPO_ROOT = join(import.meta.dir, '..', '..');
const handle = async () => null;
/** A well-formed read posture (every route must classify itself). */
const readPosture = {
	posture: 'structure_only',
	reason: 'fixture route — serves no record data.',
} as const;

/** A minimal valid module carrying `extra`. */
const moduleWith = (extra: Partial<ToolServerModule>) => ({
	tool: { name: 'tool_zzroute', apiActions: {}, ...extra },
});

function refusal(imported: unknown): string {
	try {
		validateToolModule(imported, 'tool_zzroute');
	} catch (error) {
		return (error as Error).message;
	}
	return '';
}

describe('A. the loader refuses unsafe routes', () => {
	test('a well-formed route and onBoot are accepted (control)', () => {
		expect(
			refusal(
				moduleWith({
					httpRoutes: [{ pathPrefix: '/dedalo/zzroute/files/', handle, readPosture }],
					onBoot: () => undefined,
				}),
			),
		).toBe('');
	});

	for (const pathPrefix of [
		'/dedalo/zzroute', // no trailing slash
		'/zzroute/files/', // outside /dedalo/
		'/dedalo/ZZroute/', // case
		'/dedalo/../core/', // traversal
		'/dedalo/zz route/', // space
		'/dedalo/', // the whole namespace
		'',
	]) {
		test(`grammar: '${pathPrefix}' is refused`, () => {
			expect(refusal(moduleWith({ httpRoutes: [{ pathPrefix, handle, readPosture }] }))).toContain(
				'must match',
			);
		});
	}

	for (const segment of [...TOOL_ROUTE_RESERVED_SEGMENTS, config.mediaDir]) {
		test(`reserved: /dedalo/${segment}/… is refused`, () => {
			expect(
				refusal(
					moduleWith({
						httpRoutes: [{ pathPrefix: `/dedalo/${segment}/zz/`, handle, readPosture }],
					}),
				),
			).toContain('reserved');
		});
	}

	test('a non-function handler, a non-array httpRoutes, a non-function onBoot are refused', () => {
		expect(
			refusal(
				moduleWith({
					httpRoutes: [{ pathPrefix: '/dedalo/zzroute/', handle: 1 as never, readPosture }],
				}),
			),
		).toContain('handle must be a function');
		expect(refusal(moduleWith({ httpRoutes: {} as never }))).toContain('must be an array');
		expect(refusal(moduleWith({ onBoot: 'x' as never }))).toContain('onBoot must be a function');
	});

	test('a route must CLASSIFY its read posture — never absent, never open, never unnamed', () => {
		const withPosture = (posture: unknown) =>
			refusal(
				moduleWith({
					httpRoutes: [
						{ pathPrefix: '/dedalo/zzroute/files/', handle, readPosture: posture as never },
					],
				}),
			);
		expect(withPosture(undefined)).toContain('readPosture is required');
		expect(withPosture({ posture: 'open', reason: 'reads values ungated' })).toContain(
			"may not be 'open'",
		);
		expect(withPosture({ posture: 'nonsense', reason: 'a reason of substance' })).toContain(
			'unknown posture',
		);
		expect(withPosture({ posture: 'chokepoint', reason: 'a reason of substance' })).toContain(
			"needs 'via'",
		);
		expect(withPosture({ posture: 'structure_only', reason: 'x' })).toContain('reason');
		// control: each named posture with its field passes
		expect(
			withPosture({ posture: 'chokepoint', via: 'a door', reason: 'a reason of substance' }),
		).toBe('');
		expect(
			withPosture({ posture: 'component', gate: 'a gate', reason: 'a reason of substance' }),
		).toBe('');
	});

	test('onBoot / httpRoutes may not hide inside apiActions', () => {
		for (const key of ['onBoot', 'httpRoutes']) {
			expect(
				refusal({ tool: { name: 'tool_zzroute', apiActions: { [key]: { handler: handle } } } }),
			).toContain(`lifecycle hook '${key}'`);
		}
	});

	test('a prefix overlapping a loaded tool route is refused, both directions', () => {
		const registry = new Map<string, LoadedTool>([
			[
				'tool_zzfirst',
				{
					module: {
						name: 'tool_zzfirst',
						apiActions: {},
						httpRoutes: [{ pathPrefix: '/dedalo/zzshared/a/', handle, readPosture }],
					},
					dir: '/nowhere',
					rootIndex: 0,
				},
			],
		]);
		const second = (pathPrefix: string): ToolServerModule => ({
			name: 'tool_zzsecond',
			apiActions: {},
			httpRoutes: [{ pathPrefix, handle, readPosture }],
		});
		expect(() => assertNoRouteOverlap(second('/dedalo/zzshared/'), registry)).toThrow(/overlaps/);
		expect(() => assertNoRouteOverlap(second('/dedalo/zzshared/a/b/'), registry)).toThrow(
			/overlaps/,
		);
		expect(() => assertNoRouteOverlap(second('/dedalo/zzshared/a/'), registry)).toThrow(/overlaps/);
		// control: a sibling prefix is fine
		expect(() => assertNoRouteOverlap(second('/dedalo/zzshared/b/'), registry)).not.toThrow();
	});
});

/** First segments of every `/dedalo/<seg>/` the ENGINE routes, derived from src/. */
function engineRouteSegments(): Set<string> {
	const segments = new Set<string>();
	const srcDir = join(REPO_ROOT, 'src');
	for (const rel of new Glob('**/*.ts').scanSync({ cwd: srcDir })) {
		const code = stripComments(readFileSync(join(srcDir, rel), 'utf8'));
		for (const m of code.matchAll(/_URL_(?:PREFIX|BASE)\s*=\s*'\/dedalo\/([a-z0-9_]+)\//g)) {
			segments.add(m[1] as string);
		}
	}
	const server = stripComments(readFileSync(join(srcDir, 'server.ts'), 'utf8'));
	for (const m of server.matchAll(/'\/dedalo\/([a-z0-9_]+)\//g)) segments.add(m[1] as string);
	return segments;
}

describe('B. the reserved list is complete by derivation', () => {
	test('every engine route segment is reserved', () => {
		const segments = engineRouteSegments();
		// anti-vacuity: the scan sees the engine's known namespaces
		for (const known of ['lib', 'install', 'tools', 'core']) expect(segments).toContain(known);
		const open = [...segments].filter(
			(segment) => !TOOL_ROUTE_RESERVED_SEGMENTS.includes(segment) && segment !== config.mediaDir,
		);
		expect(open, 'an engine route namespace a tool could claim').toEqual([]);
	});

	test('every top-level directory of the client tree is reserved', () => {
		const clientDir = join(REPO_ROOT, 'client', 'dedalo');
		// A git-IGNORED directory is a developer's own (.gitignore names
		// `dev_tools/`), not an engine namespace: counting it made this gate pass
		// or fail by what one machine keeps on disk.
		const ignored = (name: string): boolean =>
			Bun.spawnSync(['git', 'check-ignore', '-q', join('client', 'dedalo', name)], {
				cwd: REPO_ROOT,
			}).exitCode === 0;
		const dirs = readdirSync(clientDir).filter(
			(name) => statSync(join(clientDir, name)).isDirectory() && !ignored(name),
		);
		expect(dirs).toContain('core');
		const open = dirs.filter((name) => !TOOL_ROUTE_RESERVED_SEGMENTS.includes(name));
		expect(open, 'a client directory a tool route could shadow').toEqual([]);
	});
});

describe('C. the real registry', () => {
	test("toolHttpRouteFor finds tool_export's download route, and nothing for a client asset", async () => {
		const route = await toolHttpRouteFor('/dedalo/export/artifact/exp_x_0/export.csv');
		expect(route?.pathPrefix).toBe('/dedalo/export/artifact/');
		expect(await toolHttpRouteFor('/dedalo/core/page/index.html')).toBeUndefined();
		expect(await toolHttpRouteFor('/dedalo/export/other')).toBeUndefined();
	});

	test('startToolBootHooks runs each onBoot once, returns the stops, survives a throw', async () => {
		const registry = await loadToolModules();
		const exporter = registry.get('tool_export');
		expect(exporter?.module.onBoot).toBeDefined();
		const victim = [...registry.values()].find((loaded) => loaded.module.onBoot === undefined);
		expect(victim).toBeDefined();
		const exporterModule = (exporter as LoadedTool).module;
		const victimModule = (victim as LoadedTool).module;
		const originalBoot = exporterModule.onBoot;
		let booted = 0;
		let stopped = 0;
		exporterModule.onBoot = () => {
			booted++;
			return { stop: () => void stopped++ };
		};
		victimModule.onBoot = () => {
			throw new Error('zz boot failure');
		};
		const errors: unknown[] = [];
		const originalError = console.error;
		console.error = (...args: unknown[]) => void errors.push(args);
		try {
			const stops = await startToolBootHooks();
			expect(booted).toBe(1);
			expect(stops.length).toBe(
				[...registry.values()].filter((loaded) => loaded.module.onBoot !== undefined).length - 1,
			);
			for (const stop of stops) stop();
			expect(stopped).toBe(1);
			expect(String(errors[0])).toContain(`${victimModule.name}.onBoot failed`);
		} finally {
			console.error = originalError;
			exporterModule.onBoot = originalBoot;
			victimModule.onBoot = undefined;
		}
	});

	test('an ASYNC onBoot (a promise) and a handle without stop() are refused, never registered; the rejection is logged, not unhandled', async () => {
		const registry = await loadToolModules();
		const withoutBoot = [...registry.values()].filter(
			(loaded) => loaded.module.onBoot === undefined,
		);
		expect(withoutBoot.length).toBeGreaterThanOrEqual(2);
		const asyncModule = (withoutBoot[0] as LoadedTool).module;
		const bareModule = (withoutBoot[1] as LoadedTool).module;
		const baseline = [...registry.values()].filter(
			(loaded) => loaded.module.onBoot !== undefined,
		).length;
		let rejectBoot: (error: Error) => void = () => undefined;
		asyncModule.onBoot = (() =>
			new Promise((_resolve, reject) => {
				rejectBoot = reject;
			})) as never;
		bareModule.onBoot = (() => ({ notStop: true })) as never;
		const errors: unknown[] = [];
		const unhandled: unknown[] = [];
		const onUnhandled = (reason: unknown) => void unhandled.push(reason);
		process.on('unhandledRejection', onUnhandled);
		const originalError = console.error;
		console.error = (...args: unknown[]) => void errors.push(args);
		try {
			const stops = await startToolBootHooks();
			// neither is taken for a handle: only the well-formed hooks' stops come back
			expect(stops.length).toBe(baseline);
			for (const stop of stops) stop(); // and no stop throws (a promise has no stop)
			expect(
				errors.some((e) => String(e).includes(`${asyncModule.name}.onBoot returned a promise`)),
			).toBe(true);
			expect(
				errors.some((e) =>
					String(e).includes(`${bareModule.name}.onBoot returned something that is neither`),
				),
			).toBe(true);
			rejectBoot(new Error('zz async boot failure'));
			await Bun.sleep(5);
			expect(errors.some((e) => String(e).includes(`${asyncModule.name}.onBoot rejected`))).toBe(
				true,
			);
			expect(unhandled).toEqual([]);
		} finally {
			console.error = originalError;
			process.off('unhandledRejection', onUnhandled);
			asyncModule.onBoot = undefined;
			bareModule.onBoot = undefined;
		}
	});
});
