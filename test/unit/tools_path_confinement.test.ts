/**
 * PATH CONFINEMENT for the two filesystem doors the tools subsystem opens
 * (engineering/TOOLS_SPEC.md §Loading, §"Roots & static serving").
 *
 * The claims under test — every one of them previously prose only:
 *
 *  - the LOADER's import specifier is never request-influenced: a name is only
 *    ever reachable if the boot scan already imported it, so a traversal-shaped
 *    name is a Map miss, not a dynamic import;
 *  - the canonical path is confined under the root BEFORE the import (TOCTOU-safe);
 *  - static serving refuses the `server/` subtree, every non-asset extension, and
 *    every escape out of the tool package — including a SYMLINK escape, which the
 *    lexical `resolve()` check cannot see (this file is where that hole was found:
 *    `<tool>/js/x.json -> ../../../package.json` normalizes to a path legitimately
 *    under the tool dir and was served 200 with the repo's package.json in the
 *    body). A tool package in an ADDITIONAL root is third-party code, so that is
 *    an arbitrary-file read, not a theoretical one;
 *  - everything fails closed: a miss is a plain 404, never an existence oracle.
 *
 * The symlink cases build their links inside the repo tools/ tree and remove them
 * in afterAll — there is no other way to exercise a link the resolver must refuse.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { rmSync, symlinkSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { getLoadedTool, loadToolModules } from '../../src/core/tools/loader.ts';
import { getRoots, resolveToolAssetPath } from '../../src/core/tools/paths.ts';
import { serveToolsRequest } from '../../src/core/tools/serving.ts';
import { handleRequest } from '../../src/server.ts';

const REQ = new Request('http://localhost/');
const repoRoot = join(import.meta.dir, '..', '..');

// Pin the debug key OFF for the whole file: process.env wins over ../private/.env
// (a dev checkout may carry DEDALO_DEBUG_API_ERRORS=true), and under that flag
// the converter appends `debug.stack` — which names the throw site and would
// make the three fail-closed 404 bodies below distinguishable. The production
// wire shape is what "no existence oracle" is asserted on.
const previousDebug = process.env.DEDALO_DEBUG_API_ERRORS;
beforeAll(() => {
	process.env.DEDALO_DEBUG_API_ERRORS = 'false';
});
afterAll(() => {
	if (previousDebug === undefined) delete process.env.DEDALO_DEBUG_API_ERRORS;
	else process.env.DEDALO_DEBUG_API_ERRORS = previousDebug;
});

/** Scratch symlinks planted inside a real tool package, removed in afterAll. */
const HOST_TOOL = 'tool_dev_template';
const ESCAPE_LINK = join(repoRoot, 'tools', HOST_TOOL, 'js', 'zz_confinement_escape.json');
const INSIDE_LINK = join(repoRoot, 'tools', HOST_TOOL, 'js', 'zz_confinement_inside.json');

beforeAll(() => {
	rmSync(ESCAPE_LINK, { force: true });
	rmSync(INSIDE_LINK, { force: true });
	// Points OUT of the package (three levels up = the repo root's package.json).
	symlinkSync('../../../package.json', ESCAPE_LINK);
	// Points INSIDE the package — must keep working; the fix confines, it does
	// not ban symlinks.
	symlinkSync('../register.json', INSIDE_LINK);
});

afterAll(() => {
	rmSync(ESCAPE_LINK, { force: true });
	rmSync(INSIDE_LINK, { force: true });
});

describe('loader: the import specifier is never request-influenced', () => {
	test('a traversal-shaped or absolute name is a registry MISS, never an import', async () => {
		for (const name of [
			'../../etc/passwd',
			'../src/server',
			'/etc/passwd',
			'tools/../tool_export',
			'tool_export/../tool_export',
			'TOOL_EXPORT',
			'tool_export\0', // NUL as an ESCAPE: a raw 0x00 byte makes this file binary to git
		]) {
			expect({ name, loaded: await getLoadedTool(name) }).toEqual({ name, loaded: undefined });
		}
	});

	test('every loaded tool resolves under one of the declared roots', async () => {
		const registry = await loadToolModules();
		const roots = getRoots().map((root) => root.path);
		expect(registry.size).toBeGreaterThan(0);
		for (const [name, loaded] of registry) {
			const inside = roots.some((root) => loaded.dir.startsWith(`${root}/`));
			expect({ name, inside }).toEqual({ name, inside: true });
			// …and the module it exported names itself, so the Map key is not a
			// second, unvalidated source of truth.
			expect(loaded.module.name).toBe(name);
		}
	});
});

describe('serving: the server/ subtree is never public', () => {
	test.each([
		'/dedalo/tools/tool_export/server/index.ts',
		'/dedalo/tools/tool_dev_template/server/index.ts',
		'/dedalo/tools/tool_export/server/../server/index.ts',
		'/dedalo/tools/tool_export/./server/index.ts',
	])('%p is 404', async (path) => {
		expect((await serveToolsRequest(path, REQ))?.status).toBe(404);
	});

	test('the path resolver refuses it too (not only the extension filter)', () => {
		expect(resolveToolAssetPath('tool_export', 'server/index.ts')).toBeNull();
		expect(resolveToolAssetPath('tool_export', '/server/index.ts')).toBeNull();
	});

	/**
	 * CARRY-09. The denial used to read the RAW FIRST SEGMENT
	 * (`restPath.split('/')[0] === 'server'`), so `server/x` was refused while
	 * `js/../server/x` RESOLVED — its first segment is `js`, and the confinement
	 * step then legitimately placed it inside the package. A path is only what it
	 * RESOLVES to, so the test belongs after resolution.
	 *
	 * HONEST SEVERITY, measured 2026-08-31: end-to-end this was NOT readable,
	 * because the serving layer's extension filter refuses `.ts` and no `server/`
	 * directory currently ships a servable extension. It is a resolver-level hole
	 * that becomes a live read the day a tool adds `server/config.json` — `.json`
	 * is servable. Gated at the resolver, where the rule belongs.
	 */
	test.each([
		'js/../server/index.ts',
		'js/./../server/index.ts',
		'css/../server/index.ts',
		'js/../../tool_export/server/index.ts',
		'js/../server/config.json',
	])('resolver refuses the traversal spelling %p', (rest) => {
		expect(resolveToolAssetPath('tool_export', rest)).toBeNull();
	});

	test('legitimate assets are still resolved (the fix denies nothing real)', () => {
		// A denial that also denies the tool's own JS is not a fix.
		expect(resolveToolAssetPath('tool_export', 'js/tool_export.js')).not.toBeNull();
	});
});

describe('serving: non-asset extensions are refused', () => {
	test.each(['.ts', '.php', '.env', '.sh', '.sql', ''])(
		'a %p file under a tool dir is not public',
		async (extension) => {
			const path = `/dedalo/tools/tool_export/js/whatever${extension}`;
			expect((await serveToolsRequest(path, REQ))?.status).toBe(404);
		},
	);
});

describe('serving: escapes out of the tool package are refused', () => {
	test.each([
		'/dedalo/tools/tool_export/../../package.json',
		'/dedalo/tools/tool_export/../../../package.json',
		'/dedalo/tools/tool_export/js/../../../package.json',
		'/dedalo/tools/tool_export/..%2f..%2fpackage.json',
		'/dedalo/tools/tool_export/%2e%2e/%2e%2e/package.json',
		'/dedalo/tools/..%2f..%2fetc/passwd',
	])('%p is 404', async (path) => {
		expect((await serveToolsRequest(path, REQ))?.status).toBe(404);
	});

	/**
	 * The case the lexical check cannot see. Before the realpath confinement this
	 * returned 200 with the repo's package.json.
	 */
	test('a SYMLINK inside the package pointing OUT of it is refused', async () => {
		expect(resolveToolAssetPath(HOST_TOOL, 'js/zz_confinement_escape.json')).toBeNull();
		const response = await serveToolsRequest(
			`/dedalo/tools/${HOST_TOOL}/js/zz_confinement_escape.json`,
			REQ,
		);
		expect(response?.status).toBe(404);
	});

	test('a symlink pointing INSIDE the package still resolves (confine, do not ban)', async () => {
		const resolved = resolveToolAssetPath(HOST_TOOL, 'js/zz_confinement_inside.json');
		expect(resolved).not.toBeNull();
		expect(resolved).toContain(`/tools/${HOST_TOOL}/`);
		const response = await serveToolsRequest(
			`/dedalo/tools/${HOST_TOOL}/js/zz_confinement_inside.json`,
			REQ,
		);
		expect(response?.status).toBe(200);
	});
});

describe('serving: tool_common (the CORE url) is confined by the CLIENT handler', () => {
	// Since WC-006's 2026-08-16 amendment tool_common is client source
	// (client/dedalo/core/tools_common/) with no route of its own, so the
	// confinement that matters is the generic client handler's.
	//
	// (!) A `../` corpus aimed at handleRequest is VACUOUS: `new Request(url)`
	// normalizes the pathname (WHATWG URL), so the handler never sees the dots
	// — `/dedalo/core/tools_common/../../../package.json` arrives as
	// `/package.json` and 404s on ROUTING, with the traversal guard deleted just
	// as green. Every case below therefore either keeps its dots ENCODED (%2e/%2f
	// survive normalization and reach decodeURIComponent) or plants a real
	// SYMLINK — the two shapes that actually reach the guard.
	const serveClient = (path: string) =>
		handleRequest(new Request(`http://localhost${path}`), { requestId: 'test', startedAt: 0 });

	const ESCAPE_LINK = join(
		import.meta.dir,
		'..',
		'..',
		'client',
		'dedalo',
		'core',
		'tools_common',
		'js',
		'zz_confinement_escape.js',
	);
	beforeAll(() => {
		rmSync(ESCAPE_LINK, { force: true });
		// → repo-root package.json: lexically INSIDE the client tree, canonically outside.
		symlinkSync(join(import.meta.dir, '..', '..', 'package.json'), ESCAPE_LINK);
	});
	afterAll(() => {
		rmSync(ESCAPE_LINK, { force: true });
	});

	test('a real asset is served', async () => {
		expect((await serveClient('/dedalo/core/tools_common/js/tool_common.js')).status).toBe(200);
	});

	// (!) ENCODED SLASHES ONLY. `%2e` is decoded by the URL parser itself and the
	// dot-segments are then normalized away — `%2e%2e/%2e%2e/` reaches the handler
	// as a plain absolute path and 404s on ROUTING, proving nothing. `%2f` is NOT
	// decoded by the parser, so `..%2f..%2f` survives to decodeURIComponent and
	// escapes for real. And each target must EXIST outside the tree: aim one level
	// short (`client/package.json`, which is not there) and the case 404s on
	// absence with the guard deleted — vacuous again. These land on the repo root.
	test.each([
		'/dedalo/core/tools_common/..%2f..%2f..%2f..%2fpackage.json',
		'/dedalo/core/tools_common/js/..%2f..%2f..%2f..%2f..%2fpackage.json',
		'/dedalo/core/tools_common/..%2f..%2f..%2f..%2fsrc%2fserver.ts',
	])('%p is 404 — the traversal guard sees the dots', async (path) => {
		const response = await serveClient(path);
		expect(response.status).toBe(404);
		expect(await response.text()).not.toContain('"dependencies"');
	});

	test('a SYMLINK out of the client tree is 404 (canonical confinement)', async () => {
		// Lexically this path is inside client/dedalo; only realpath catches it.
		const response = await serveClient('/dedalo/core/tools_common/js/zz_confinement_escape.js');
		expect(response.status).toBe(404);
		expect(await response.text()).not.toContain('"name"');
	});

	test('a malformed percent-encoding is a 404, not a throw', async () => {
		expect((await serveClient('/dedalo/core/tools_common/js/%E0%A4%A.js')).status).toBe(404);
	});

	// ANTI-VACUITY: prove the encoded corpus reaches the guard rather than being
	// answered by routing. `%2e%2e` must still be dots after decodeURIComponent,
	// and the lexical resolve must land OUTSIDE the client root — which is
	// exactly what the handler's guard tests.
	test('the encoded corpus really does resolve outside the client root', () => {
		const CLIENT_ROOT = resolve(import.meta.dir, '..', '..', 'client', 'dedalo');
		const decoded = decodeURIComponent(
			'/dedalo/core/tools_common/%2e%2e/%2e%2e/%2e%2e/package.json',
		);
		expect(decoded).toContain('../');
		const full = resolve(CLIENT_ROOT, decoded.replace(/^\/dedalo\/?/, ''));
		expect(full.startsWith(CLIENT_ROOT + sep)).toBe(false);
	});
});

describe('everything fails closed with the SAME 404 body (no existence oracle)', () => {
	test('an existing-but-private path and a wholly absent one are indistinguishable', async () => {
		const privatePath = await serveToolsRequest('/dedalo/tools/tool_export/server/index.ts', REQ);
		const absent = await serveToolsRequest('/dedalo/tools/tool_export/js/no_such_file.js', REQ);
		const unknownTool = await serveToolsRequest('/dedalo/tools/tool_no_such/js/a.js', REQ);
		expect(privatePath?.status).toBe(404);
		const bodies = await Promise.all([privatePath?.text(), absent?.text(), unknownTool?.text()]);
		expect(new Set(bodies).size).toBe(1);
	});

	test('a malformed percent-encoding is a 404, not a throw', async () => {
		expect((await serveToolsRequest('/dedalo/tools/tool_export/js/%E0%A4%A.js', REQ))?.status).toBe(
			404,
		);
	});

	test('a non-tools path falls through (null), it does not 404 the world', async () => {
		expect(await serveToolsRequest('/dedalo/core/page/index.html', REQ)).toBeNull();
	});
});
