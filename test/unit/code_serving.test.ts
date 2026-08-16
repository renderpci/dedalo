/**
 * Code-master release serving (src/core/update/code_serving.ts) — the route
 * that answers the URL `buildCodeUpdateInfo` advertises.
 *
 * Asserts the fail-closed posture: nothing is servable unless IS_A_CODE_SERVER
 * is set AND the files dir is configured; only that release's own archive (or
 * its .sha256 sidecar) resolves; traversal and neighbour-release names are
 * refused; every refusal is the SAME opaque 404.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
	CODE_RELEASE_URL_PREFIX,
	resolveCodeReleaseFile,
	serveCodeReleaseRequest,
} from '../../src/core/update/code_serving.ts';

const ROOT = join(
	process.env.TMPDIR ?? '/tmp',
	`dedalo_code_serving_${process.pid}_${Math.random().toString(36).slice(2)}`,
);
const FILES_DIR = join(ROOT, 'files');
const ARCHIVE = join(FILES_DIR, '7', '7.0', '7.0.1.zip');
const OPEN = { isCodeServer: true, codeFilesDir: FILES_DIR };

beforeAll(() => {
	mkdirSync(join(FILES_DIR, '7', '7.0'), { recursive: true });
	writeFileSync(ARCHIVE, 'PK-not-a-real-zip');
	writeFileSync(`${ARCHIVE}.sha256`, `${'c'.repeat(64)}  7.0.1.zip\n`);
});
afterAll(() => {
	rmSync(ROOT, { recursive: true, force: true });
});

describe('resolveCodeReleaseFile', () => {
	test('the advertised URL resolves to the archive, the sidecar to the digest file', () => {
		// This URL shape is the manifest's own: `${publicBaseUrl}/${v}/${v}.zip`.
		expect(resolveCodeReleaseFile('/dedalo/install/code/7.0.1/7.0.1.zip', OPEN)).toEqual({
			path: ARCHIVE,
			contentType: 'application/zip',
		});
		expect(resolveCodeReleaseFile('/dedalo/install/code/7.0.1/7.0.1.zip.sha256', OPEN)).toEqual({
			path: `${ARCHIVE}.sha256`,
			contentType: 'text/plain; charset=utf-8',
		});
	});

	test('fail-closed: not a code server, or no files dir → null', () => {
		const url = '/dedalo/install/code/7.0.1/7.0.1.zip';
		expect(
			resolveCodeReleaseFile(url, { isCodeServer: false, codeFilesDir: FILES_DIR }),
		).toBeNull();
		expect(resolveCodeReleaseFile(url, { isCodeServer: true, codeFilesDir: undefined })).toBeNull();
	});

	test('only THIS release’s own names resolve', () => {
		for (const url of [
			'/dedalo/install/code/7.0.1/7.0.2.zip', // a neighbour release under our dir
			'/dedalo/install/code/7.0.1/7.0.1.tar', // not the zip grammar
			'/dedalo/install/code/7.0.1/', // no file
			'/dedalo/install/code/7.0/7.0.zip', // not a triple
			'/dedalo/install/code/7.0.1/sub/7.0.1.zip', // nested
			'/dedalo/install/code/7.0.1/..%2F..%2Fetc%2Fpasswd',
			'/dedalo/install/code/7.0.1/../../../etc/passwd',
			'/dedalo/install/code/x.y.z/x.y.z.zip',
		]) {
			expect(resolveCodeReleaseFile(url, OPEN)).toBeNull();
		}
	});
});

describe('serveCodeReleaseRequest', () => {
	test('serves the archive with no-store + the security headers', async () => {
		const res = await serveCodeReleaseRequest('/dedalo/install/code/7.0.1/7.0.1.zip', OPEN);
		expect(res.status).toBe(200);
		expect(res.headers.get('Content-Type')).toBe('application/zip');
		expect(res.headers.get('Cache-Control')).toBe('no-store');
		expect(await res.text()).toBe('PK-not-a-real-zip');
	});

	test('a release that was never built 404s like everything else', async () => {
		const missing = await serveCodeReleaseRequest('/dedalo/install/code/7.0.9/7.0.9.zip', OPEN);
		const refused = await serveCodeReleaseRequest('/dedalo/install/code/7.0.1/7.0.1.zip', {
			isCodeServer: false,
			codeFilesDir: FILES_DIR,
		});
		expect(missing.status).toBe(404);
		expect(refused.status).toBe(404);
		// indistinguishable from outside: a probe cannot map the release dir
		expect(await missing.text()).toBe(await refused.text());
	});

	test('the exported prefix is the one the manifest URL starts with', () => {
		expect('/dedalo/install/code/7.0.1/7.0.1.zip'.startsWith(CODE_RELEASE_URL_PREFIX)).toBe(true);
	});
});
