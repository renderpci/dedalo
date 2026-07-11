/**
 * Tool static-serving fail-closed behavior (src/core/tools/serving.ts).
 * Asserts: real tool assets are served; the server/ subtree and non-asset
 * extensions 404; the tool_common alias resolves to the core-served client
 * dir; path traversal is refused; unknown/non-tool paths fall through (null).
 */

import { describe, expect, test } from 'bun:test';
import { serveToolCommonRequest, serveToolsRequest } from '../../src/core/tools/serving.ts';

const REQ = new Request('http://localhost/');

describe('tool static serving', () => {
	test('serves a real tool image asset (200)', async () => {
		const res = await serveToolsRequest('/dedalo/tools/tool_export/img/icon.svg', REQ);
		expect(res).not.toBeNull();
		expect(res?.status).toBe(200);
	});

	test('serves a real tool css asset (200)', async () => {
		const res = await serveToolsRequest('/dedalo/tools/tool_export/css/tool_export.css', REQ);
		expect(res?.status).toBe(200);
	});

	test('serves tool_common from its CORE url (200)', async () => {
		const res = await serveToolCommonRequest('/dedalo/core/tools_common/js/tool_common.js', REQ);
		expect(res?.status).toBe(200);
	});

	test('tool_common is NO LONGER under /dedalo/tools/ (404)', async () => {
		const res = await serveToolsRequest('/dedalo/tools/tool_common/js/tool_common.js', REQ);
		expect(res?.status).toBe(404);
	});

	test('serveToolCommonRequest ignores non-tools_common paths (null)', async () => {
		expect(await serveToolCommonRequest('/dedalo/core/page/index.html', REQ)).toBeNull();
	});

	test('refuses the server/ subtree (404)', async () => {
		const res = await serveToolsRequest('/dedalo/tools/tool_export/server/index.ts', REQ);
		expect(res?.status).toBe(404);
	});

	test('refuses a non-asset extension (404)', async () => {
		// A .ts file anywhere under a tool dir is not a public asset.
		const res = await serveToolsRequest('/dedalo/tools/tool_export/js/anything.ts', REQ);
		expect(res?.status).toBe(404);
	});

	test('refuses path traversal out of the tool dir (404)', async () => {
		const res = await serveToolsRequest('/dedalo/tools/tool_export/../../../src/server.ts', REQ);
		expect(res?.status).toBe(404);
	});

	test('refuses an unknown tool (404)', async () => {
		const res = await serveToolsRequest('/dedalo/tools/tool_does_not_exist/img/icon.svg', REQ);
		expect(res?.status).toBe(404);
	});

	test('refuses a bad tool name (404)', async () => {
		const res = await serveToolsRequest('/dedalo/tools/..%2f..%2fetc/passwd', REQ);
		expect(res?.status).toBe(404);
	});

	test('register.json IS servable (public registry data)', async () => {
		const res = await serveToolsRequest('/dedalo/tools/tool_export/register.json', REQ);
		expect(res?.status).toBe(200);
	});

	test('non-tools path returns null (falls through to client handler)', async () => {
		const res = await serveToolsRequest('/dedalo/core/page/index.html', REQ);
		expect(res).toBeNull();
	});
});
