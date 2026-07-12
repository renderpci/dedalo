/**
 * CLIENT-LIB TRIPWIRE (DEC-12) — the third-party browser libraries resolve, and
 * the registry is the only way to reach them.
 *
 * WHY THIS EXISTS. Until 2026-07-12 the libs were a 118 MB gitignored directory
 * that no gate ever touched: the service worker (`client/dedalo/core/sw.js`) and
 * the precache manifest builder (`src/core/api/dedalo_files.ts`) both EXCLUDE
 * `/lib/`, so libs are only ever fetched lazily by a component that needs one.
 * Consequence: the whole tree sat at the WRONG PATH (`client/lib/` instead of
 * `client/dedalo/lib/`) with every `/dedalo/lib/*` request 404ing, and the suite
 * stayed green. A missing lib must be a RED GATE, not a blank widget.
 *
 * The load-bearing assertion is `every lib URL the client references resolves`.
 * It scans the client + tools source, resolves each `lib/…` reference IN URL SPACE
 * (tools are served from the repo `tools/` root, so filesystem resolution would be
 * wrong), and requires each one to come back 200 through the real request handler.
 */

import { describe, expect, test } from 'bun:test';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, extname, join, posix, resolve } from 'node:path';
import { CLIENT_LIBS } from '../../src/core/client_libs/registry.ts';
import { handleRequest } from '../../src/server.ts';

const REPO_ROOT = resolve(import.meta.dir, '../..');
const context = { requestId: 'test', startedAt: 0 };

async function get(path: string): Promise<Response> {
	return handleRequest(new Request(`http://localhost${path}`), context);
}

// The client test harness (mocha/chai) is only served in dev mode, and its
// packages are devDependencies. Serve them for the duration of this gate.
process.env.DEDALO_DEV_MODE = 'true';

// ---------------------------------------------------------------------------
// Source scan: every lib URL the client/tools actually reference
// ---------------------------------------------------------------------------

const SCAN_ROOTS = ['client/dedalo/core', 'client/dedalo/test', 'tools'];
const SCAN_EXTENSIONS = new Set(['.js', '.mjs', '.html', '.json']);

function walk(dir: string, out: string[] = []): string[] {
	for (const entry of readdirSync(dir)) {
		const full = join(dir, entry);
		if (statSync(full).isDirectory()) {
			// A tool's OWN lib/ dir (tools/<tool>/js/lib/…) is a different URL space,
			// served by serveToolsRequest — not a client lib. Never scan into node_modules.
			if (entry === 'node_modules') continue;
			walk(full, out);
		} else if (SCAN_EXTENSIONS.has(extname(entry).toLowerCase())) {
			out.push(full);
		}
	}
	return out;
}

/**
 * The URL a source file is served at. Client files live under client/dedalo/ and
 * serve at /dedalo/…; tool files live at the repo `tools/` root and serve at
 * /dedalo/tools/… . Getting this right is the whole point of resolving in URL
 * space: `../../../lib/x` from a tool means something different on disk.
 */
function fileToUrl(absPath: string): string | null {
	const rel = absPath.slice(REPO_ROOT.length + 1);
	if (rel.startsWith('client/dedalo/')) return `/dedalo/${rel.slice('client/dedalo/'.length)}`;
	if (rel.startsWith('tools/')) return `/dedalo/tools/${rel.slice('tools/'.length)}`;
	return null;
}

/** Every quoted string in `source` that mentions `lib/`, excluding comment lines. */
function libStringsIn(source: string): string[] {
	const found: string[] = [];
	for (const line of source.split('\n')) {
		const trimmed = line.trimStart();
		// Skip comment lines: `// …` and the `* …` continuation of a block comment.
		// (A trailing comment on a code line is fine — the code half still scans.)
		if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) continue;
		for (const m of line.matchAll(/['"`]([^'"`]*\blib\/[^'"`]*)['"`]/g)) {
			const value = m[1];
			if (value !== undefined) found.push(value);
		}
	}
	return found;
}

/**
 * Resolve a reference found in `fileUrl` to the /dedalo/lib/… URL it denotes, or
 * null when it is not a client-lib reference at all (a tool-local `./lib/…`, an
 * unrelated string, an absolute http URL…).
 */
function toLibUrl(fileUrl: string, ref: string): string | null {
	if (ref.startsWith('http://') || ref.startsWith('https://')) return null;
	let url: string;
	if (ref.startsWith('/dedalo/lib/')) url = ref;
	// DEDALO_ROOT_WEB is '/dedalo' (src/core/resolve/environment.ts) — the client
	// concatenates it with '/lib/…'.
	else if (ref.startsWith('/lib/')) url = `/dedalo${ref}`;
	else if (ref.startsWith('.')) url = posix.resolve(posix.dirname(fileUrl), ref);
	else return null;
	if (!url.startsWith('/dedalo/lib/')) return null;
	// posix.resolve() drops a trailing slash; keep it, because it is what marks a
	// DIRECTORY reference (the `three/addons/` import-map prefix) as not fetchable.
	if (ref.endsWith('/') && !url.endsWith('/')) url += '/';
	// The bare prefix itself is not a reference to any lib — sw.js and
	// dedalo_files.ts both carry the literal '/lib/' as a precache EXCLUSION filter.
	if (url === '/dedalo/lib/') return null;
	return url;
}

const references: { fileUrl: string; ref: string; url: string }[] = [];
for (const root of SCAN_ROOTS) {
	for (const file of walk(join(REPO_ROOT, root))) {
		const fileUrl = fileToUrl(file);
		if (fileUrl === null) continue;
		for (const ref of libStringsIn(readFileSync(file, 'utf8'))) {
			const url = toLibUrl(fileUrl, ref);
			if (url !== null) references.push({ fileUrl, ref, url });
		}
	}
}

describe('client libs — the registry resolves every lib the client loads', () => {
	test('the source scan actually found references (guards against a silently empty gate)', () => {
		// If a refactor moves the client, this gate must fail loudly rather than
		// pass by scanning nothing — the exact failure mode it exists to prevent.
		expect(references.length).toBeGreaterThan(20);
	});

	test('every lib URL referenced by the client or tools serves 200', async () => {
		const broken: string[] = [];
		for (const { fileUrl, ref, url } of references) {
			// Directory references (import-map prefixes like `…/jsm/`) are not fetchable
			// on their own; assert their id is registered and probe the id instead.
			const id = url.slice('/dedalo/lib/'.length).split('/')[0] ?? '';
			if (CLIENT_LIBS[id] === undefined) {
				broken.push(`${fileUrl}: "${ref}" → unregistered lib id "${id}"`);
				continue;
			}
			if (url.endsWith('/')) continue;
			const response = await get(url);
			if (response.status !== 200) {
				broken.push(`${fileUrl}: "${ref}" → ${url} → HTTP ${response.status}`);
				continue;
			}
			const bytes = await response.arrayBuffer();
			if (bytes.byteLength === 0) broken.push(`${fileUrl}: "${ref}" → ${url} → EMPTY`);
		}
		expect(broken).toEqual([]);
	});

	test("every registry entry's probe serves 200 with real bytes", async () => {
		const broken: string[] = [];
		for (const [id, lib] of Object.entries(CLIENT_LIBS)) {
			const response = await get(`/dedalo/lib/${id}/${lib.probe}`);
			if (response.status !== 200) {
				broken.push(`${id}: probe ${lib.probe} → HTTP ${response.status}`);
				continue;
			}
			if ((await response.arrayBuffer()).byteLength === 0) {
				broken.push(`${id}: probe ${lib.probe} → EMPTY`);
			}
		}
		expect(broken).toEqual([]);
	});

	test('every non-npm lib names WHY it cannot be package-manager tracked', () => {
		for (const [id, lib] of Object.entries(CLIENT_LIBS)) {
			if (lib.source === 'npm') continue;
			// The never-narrow law: a lib escapes package-manager tracking only with a
			// substantive reason recorded at the declaration, not in a doc.
			expect(lib.reason ?? '', `${id} (source=${lib.source}) must carry a reason`).not.toBe('');
			expect((lib.reason ?? '').length, `${id}: reason is too thin`).toBeGreaterThan(40);
		}
	});
});

describe('client libs — the registry is a chokepoint, not a passthrough', () => {
	test('an unregistered id 404s', async () => {
		expect((await get('/dedalo/lib/zod/package.json')).status).toBe(404);
		expect((await get('/dedalo/lib/nvd3/build/nv.d3.min.js')).status).toBe(404);
	});

	test("the SERVER's own dependencies are not reachable", async () => {
		// node_modules holds the Anthropic SDK, the MCP SDK, zod, Puppeteer… A
		// prefix-based passthrough would publish the whole dependency tree.
		for (const path of [
			'/dedalo/lib/@anthropic-ai/sdk/package.json',
			'/dedalo/lib/zod/package.json',
			'/dedalo/lib/puppeteer/package.json',
			'/dedalo/lib/@modelcontextprotocol/sdk/package.json',
		]) {
			expect((await get(path)).status, path).toBe(404);
		}
	});

	test('traversal out of a lib root 404s', async () => {
		for (const path of [
			'/dedalo/lib/three/../../../package.json',
			'/dedalo/lib/three/../zod/package.json',
			'/dedalo/lib/three/%2e%2e/%2e%2e/package.json',
			'/dedalo/lib/ckeditor/../../src/server.ts',
		]) {
			expect((await get(path)).status, path).toBe(404);
		}
	});

	test('a non-servable extension inside a real lib 404s', async () => {
		// three ships .ts type declarations; they are not browser assets.
		const response = await get('/dedalo/lib/three/src/Three.d.ts');
		expect(response.status).toBe(404);
	});
});
