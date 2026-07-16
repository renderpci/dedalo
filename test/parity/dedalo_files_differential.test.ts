/**
 * S1-19 gate: authenticated get_dedalo_files differential vs the live PHP
 * oracle. This is the service-worker pre-cache manifest whose absence stalled
 * every production-posture login (the SW got HTTP 400 and never posted
 * 'finish').
 *
 * Compared byte-for-byte: msg, the {type,url} entry shape (including the PHP
 * quirk that tools-branch css entries are typed 'js'), main.css pinned first,
 * and the FULL file SET. Normalizations (each justified, nothing else):
 *  - ORDER: PHP emits RecursiveDirectoryIterator (filesystem-dependent) order;
 *    TS emits sorted order. The SW only maps el.url into a Set, so order is
 *    not contractual beyond files[0] = main.css — compared as sets.
 *  - TOOL_COMMON URL: PHP serves the tool_common client machinery from
 *    tools/tool_common (/dedalo/tools/tool_common/…); the TS server relocated
 *    it to src/core/tools/client served at /dedalo/core/tools_common/… (see
 *    core/tools/paths.ts). Same files, TS-resolvable URL — PHP urls are mapped
 *    to the TS base before comparing.
 *  - DEDALO_VERSION: a deploy stamp (PHP constant vs the TS install literal) —
 *    asserted non-empty string on both sides, not byte-equal.
 */

import { beforeAll, describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { config } from '../../src/config/config.ts';
import { dispatchRqo } from '../../src/core/api/dispatch.ts';
import type { Rqo } from '../../src/core/concepts/rqo.ts';
import { resolvePrincipal } from '../../src/core/security/permissions.ts';
import { createSession, getSession } from '../../src/core/security/session_store.ts';
import { resolveToolAssetPath, resolveToolCommonAssetPath } from '../../src/core/tools/paths.ts';
import { registerSessionCleanup } from '../helpers/session_cleanup.ts';
import { PhpApiClient, hasPhpCredentials } from './php_client.ts';

registerSessionCleanup();

interface ManifestEntry {
	type: string;
	url: string;
}
interface ManifestBody {
	result: ManifestEntry[];
	dedalo_version: string;
	msg: string;
}

const RQO = { action: 'get_dedalo_files', dd_api: 'dd_utils_api' };

/** Root of the copied client tree the TS server serves at /dedalo/. */
const CLIENT_ROOT = resolve(import.meta.dir, '../../client/dedalo');

/** Normalize one entry to a comparable line, mapping the tool_common seam —
 * a LEDGERED wire divergence (engineering/WIRE_CONTRACT.md WC-006). */
function comparableLine(entry: ManifestEntry): string {
	const url = entry.url.replace('/dedalo/tools/tool_common/', '/dedalo/core/tools_common/');
	return `${entry.type} ${url}`;
}

/** tool_assistant is TS-NATIVE since the server-driven rewrite — its file
 * census deliberately diverges from the PHP tree's copy (11 js → 9 js; the
 * in-browser engine died). LEDGERED: engineering/WIRE_CONTRACT.md WC-013. Filtered
 * from BOTH sides of the set compare; the every-TS-url-resolves test below
 * still validates the new files serve. */
function isToolAssistantEntry(entry: ManifestEntry): boolean {
	return entry.url.startsWith('/dedalo/tools/tool_assistant/');
}

/** TS-ONLY packages with no PHP twin (the WC-013 normalization pattern):
 *  - tool_error_report (WC-019) — TS-only tool in the TS-owned tools/ tree;
 *  - error_reports maintenance widget (WC-018) — TS-owned client files,
 *    excluded from sync_client.sh like diffusion_server_control.
 * Their files exist only in the TS census; filtered from BOTH sides. */
function isTsOnlyEntry(entry: ManifestEntry): boolean {
	return (
		entry.url.startsWith('/dedalo/tools/tool_error_report/') ||
		entry.url.startsWith('/dedalo/core/area_maintenance/widgets/error_reports/')
	);
}

/** php_info and php_runtime were merged into ONE TS-native runtime_info widget
 * (WC-030): php_info (a phpinfo() iframe with no Bun equivalent) is gone, and
 * php_runtime's real Bun-runtime panel took over the runtime_info slot under
 * new file names. The frozen PHP oracle still serves BOTH old php_info/ and
 * php_runtime/ files (as two separate widgets); the TS census now serves only
 * runtime_info/. Filtered from BOTH sides of the set compare, like the WC-013
 * pattern. */
function isRuntimeInfoRenameEntry(entry: ManifestEntry): boolean {
	return (
		entry.url.startsWith('/dedalo/core/area_maintenance/widgets/php_info/') ||
		entry.url.startsWith('/dedalo/core/area_maintenance/widgets/php_runtime/') ||
		entry.url.startsWith('/dedalo/core/area_maintenance/widgets/runtime_info/')
	);
}

/** The generated JS lang files are GONE from the TS client tree (WC-033):
 * UI labels are repo catalogs under src/core/labels/catalog/, served only
 * through get_environment's `get_label` — the client never fetched these
 * files directly, so the SW pre-caching them was dead weight. The frozen PHP
 * oracle still lists its generated core/common/js/lang/*.js; filtered from
 * BOTH sides of the set compare, like the WC-013 pattern. */
function isLangFileEntry(entry: ManifestEntry): boolean {
	return entry.url.startsWith('/dedalo/core/common/js/lang/');
}

describe.if(hasPhpCredentials())('get_dedalo_files differential (S1-19 gate)', () => {
	let phpBody: ManifestBody;
	let tsBody: ManifestBody;

	beforeAll(async () => {
		if (!hasPhpCredentials()) return;
		const client = new PhpApiClient();
		await client.login(
			config.phpReference.username as string,
			config.phpReference.password as string,
		);
		const { body } = await client.call(RQO);
		phpBody = body as unknown as ManifestBody;

		const token = createSession(-1, 'root', true);
		const session = getSession(token);
		const principal = await resolvePrincipal(-1);
		const tsResult = await dispatchRqo(RQO as unknown as Rqo, {
			requestId: 't',
			clientIp: '127.0.0.1',
			session,
			csrfCandidate: session?.csrfToken ?? null,
			principal,
		});
		tsBody = tsResult.body as unknown as ManifestBody;
	});

	test('anonymous call is refused (authenticated action, like PHP)', async () => {
		const result = await dispatchRqo(RQO as unknown as Rqo, {
			requestId: 't-anon',
			clientIp: '127.0.0.1',
			session: null,
			csrfCandidate: null,
		});
		expect(result.status).toBe(401);
		expect(result.body.result).toBe(false);
	});

	test('envelope: msg byte-equal, dedalo_version present on both', () => {
		if (!hasPhpCredentials()) return;
		expect(tsBody.msg).toBe(phpBody.msg);
		// Deploy stamp — presence/type only (see header note).
		expect(typeof tsBody.dedalo_version).toBe('string');
		expect(tsBody.dedalo_version.length).toBeGreaterThan(0);
		expect(typeof phpBody.dedalo_version).toBe('string');
		expect(phpBody.dedalo_version.length).toBeGreaterThan(0);
	});

	test('main.css is pinned first on both sides (the one contractual order)', () => {
		if (!hasPhpCredentials()) return;
		expect(tsBody.result[0]).toEqual({ type: 'css', url: '/dedalo/core/page/css/main.css' });
		expect(phpBody.result[0]).toEqual({ type: 'css', url: '/dedalo/core/page/css/main.css' });
	});

	test('entry shape: exactly {type,url}, type js|css, root-relative url', () => {
		if (!hasPhpCredentials()) return;
		expect(tsBody.result.length).toBeGreaterThan(100);
		for (const entry of tsBody.result) {
			expect(Object.keys(entry).sort()).toEqual(['type', 'url']);
			expect(['js', 'css']).toContain(entry.type);
			expect(entry.url.startsWith('/dedalo/')).toBe(true);
		}
	});

	test('file set matches the oracle exactly (order + tool_common + WC-013 normalized)', () => {
		if (!hasPhpCredentials()) return;
		const keep = (entry: ManifestEntry) =>
			!isToolAssistantEntry(entry) &&
			!isTsOnlyEntry(entry) &&
			!isRuntimeInfoRenameEntry(entry) &&
			!isLangFileEntry(entry);
		const phpSet = phpBody.result.filter(keep).map(comparableLine).sort();
		const tsSet = tsBody.result.filter(keep).map(comparableLine).sort();
		expect(tsSet).toEqual(phpSet);
	});

	test('WC-013: the TS tool_assistant census is the server-driven file set', () => {
		if (!hasPhpCredentials()) return;
		const tsAssistant = tsBody.result
			.filter(isToolAssistantEntry)
			.map((entry) => entry.url.split('/').pop())
			.sort();
		expect(tsAssistant).toEqual([
			'agent_stream.js',
			// compat alias the frozen client's edit-menu panel imports by name
			'ai_assistant.js',
			'assistant_controller.js',
			'chat_render.js',
			'client_context.js',
			'conversation_store.js',
			'index.js',
			'markdown.js',
			'render_tool_assistant.js',
			'tool_assistant.css',
			'tool_assistant.js',
		]);
	});

	test('every TS url resolves through the static surfaces the server serves', () => {
		if (!hasPhpCredentials()) return;
		for (const entry of tsBody.result) {
			let servedPath: string | null = null;
			if (entry.url.startsWith('/dedalo/core/tools_common/')) {
				servedPath = resolveToolCommonAssetPath(
					entry.url.slice('/dedalo/core/tools_common/'.length),
				);
			} else if (entry.url.startsWith('/dedalo/tools/')) {
				const rest = entry.url.slice('/dedalo/tools/'.length);
				const [name = '', ...restPath] = rest.split('/');
				servedPath = resolveToolAssetPath(name, restPath.join('/'));
			} else {
				// Generic copied-client asset (server.ts serveClientAsset mapping),
				// confined the same way: strip /dedalo, resolve under CLIENT_ROOT.
				const candidate = resolve(CLIENT_ROOT, entry.url.slice('/dedalo/'.length));
				if (
					(candidate === CLIENT_ROOT || candidate.startsWith(CLIENT_ROOT + sep)) &&
					existsSync(candidate)
				) {
					servedPath = candidate;
				}
			}
			if (servedPath === null) {
				throw new Error(`manifest url does not resolve on the TS server: ${entry.url}`);
			}
		}
	});
});
