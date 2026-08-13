/**
 * MODEL FETCH — the decision half of src/core/ai/model_fetch.ts.
 *
 * Gates path confinement + URL policy (`resolveFetchTarget`), the curl transport
 * flags (`curlArgv`), cache freshness (`isUsableCachedFile`) and the
 * `downloadModel` orchestration through its injectable `fetchFile` seam.
 *
 * NEVER hits the network: every case here is pure, or uses a stub transport.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, sep } from 'node:path';
import {
	COMMON_FILES,
	curlArgv,
	DIARIZATION_COMMON_FILES,
	downloadModel,
	HUB_BASE,
	isUsableCachedFile,
	OPTIONAL_FILES,
	resolveFetchTarget,
} from '../../src/core/ai/model_fetch.ts';
import { expectedSize } from '../../src/core/ai/model_manifest.ts';

let scratch = '';

beforeAll(() => {
	scratch = mkdtempSync(join(tmpdir(), 'dd_model_fetch_'));
});

afterAll(() => {
	if (scratch !== '') rmSync(scratch, { recursive: true, force: true });
});

describe('resolveFetchTarget — refusals', () => {
	// Each refusal is asserted SEPARATELY: the charset guard is independently
	// gated, so a loosened regex cannot hide behind the later path-confinement
	// check (join() keeps '?', '#', '%2e%2e' and 'http://…' inside the store).
	const store = () => join(scratch, 'refusals');

	test('empty model id', () => {
		expect(resolveFetchTarget('', 'config.json', store())).toBeNull();
	});

	test('space in model id', () => {
		expect(resolveFetchTarget('a b', 'config.json', store())).toBeNull();
	});

	test('query string in model id', () => {
		expect(resolveFetchTarget('model?x=1', 'config.json', store())).toBeNull();
	});

	test('fragment in model id', () => {
		expect(resolveFetchTarget('model#frag', 'config.json', store())).toBeNull();
	});

	test('percent-encoded traversal in model id', () => {
		expect(resolveFetchTarget('model%2e%2e', 'config.json', store())).toBeNull();
	});

	test('absolute URL as model id', () => {
		expect(resolveFetchTarget('http://evil.test/x', 'config.json', store())).toBeNull();
	});

	test('literal .. segment in model id', () => {
		expect(resolveFetchTarget('a/../../etc', 'config.json', store())).toBeNull();
	});

	test('the file segment is guarded by the same charset rule', () => {
		expect(resolveFetchTarget('org/model', '../escape.json', store())).toBeNull();
		expect(resolveFetchTarget('org/model', 'a b.json', store())).toBeNull();
		expect(resolveFetchTarget('org/model', '', store())).toBeNull();
	});
});

describe('resolveFetchTarget — accepted', () => {
	test('a real catalog id resolves target + url, pinning /resolve/main/', () => {
		const store = join(scratch, 'ok');
		const got = resolveFetchTarget('onnx-community/whisper-tiny.en', 'config.json', store);
		expect(got).not.toBeNull();
		expect(got?.target).toBe(join(store, 'onnx-community/whisper-tiny.en', 'config.json'));
		expect(got?.url).toBe(`${HUB_BASE}/onnx-community/whisper-tiny.en/resolve/main/config.json`);
		expect(got?.url).toContain('/resolve/main/');
		expect(got?.url.startsWith('https://')).toBe(true);
	});

	test('a nested weights path stays under the store root', () => {
		const store = join(scratch, 'ok');
		const got = resolveFetchTarget(
			'onnx-community/whisper-tiny.en',
			'onnx/encoder_model.onnx',
			store,
		);
		expect(got?.target.startsWith(store + sep)).toBe(true);
	});
});

describe('curlArgv', () => {
	test('quiet mode keeps -fL, resume, retry and -sS', () => {
		const argv = curlArgv('/store/a/config.json', 'https://h/x', true);
		expect(argv[0]).toBe('curl');
		expect(argv).toContain('-fL');
		expect(argv.join(' ')).toContain('-C -');
		expect(argv.join(' ')).toContain('--retry 3');
		expect(argv).toContain('-sS');
		expect(argv).not.toContain('--progress-bar');
		// -o must immediately precede the target, and the url is last.
		expect(argv[argv.length - 3]).toBe('-o');
		expect(argv[argv.length - 2]).toBe('/store/a/config.json');
		expect(argv[argv.length - 1]).toBe('https://h/x');
	});

	test('non-quiet mode swaps -sS for the progress bar and nothing else', () => {
		const quiet = curlArgv('/t', 'https://h/x', true);
		const loud = curlArgv('/t', 'https://h/x', false);
		expect(loud).toContain('--progress-bar');
		expect(loud).not.toContain('-sS');
		expect(loud.length).toBe(quiet.length);
	});
});

describe('isUsableCachedFile', () => {
	test('missing file is not usable', () => {
		expect(isUsableCachedFile(join(scratch, 'nope', 'absent.json'))).toBe(false);
	});

	test('zero-byte file is not usable (curl leaves one behind on a 404)', () => {
		const dir = join(scratch, 'cache');
		mkdirSync(dir, { recursive: true });
		const empty = join(dir, 'empty.json');
		writeFileSync(empty, '');
		expect(isUsableCachedFile(empty)).toBe(false);
	});

	test('non-empty file is usable', () => {
		const dir = join(scratch, 'cache');
		mkdirSync(dir, { recursive: true });
		const full = join(dir, 'full.json');
		writeFileSync(full, '{}');
		expect(isUsableCachedFile(full)).toBe(true);
	});
});

describe('downloadModel — orchestration through the injected fetchFile', () => {
	/** A transport stub: succeeds for every file EXCEPT those named. */
	function stub(missing: readonly string[], seen: string[]) {
		return async (_modelId: string, file: string): Promise<boolean> => {
			seen.push(file);
			return !missing.includes(file);
		};
	}

	test('an optional-file miss is skipped, not an error', async () => {
		const seen: string[] = [];
		const report = await downloadModel('org/model', undefined, {
			store: join(scratch, 'dl1'),
			fetchFile: stub(['generation_config.json'], seen),
		});
		expect(report.skipped).toEqual(['generation_config.json']);
		expect(report.errors).toEqual([]);
		expect(report.ok).toBe(true);
		expect(report.files).toContain('config.json');
		expect(report.files).toContain('onnx/encoder_model.onnx');
		expect(report.files).toContain('onnx/decoder_model_merged.onnx');
		// The default lists are the ASR ones.
		expect(seen).toContain('tokenizer.json');
		expect(OPTIONAL_FILES).toContain('generation_config.json');
	});

	test('a JSON-only result is a FAILED seed: no ONNX weights', async () => {
		const seen: string[] = [];
		const report = await downloadModel('org/model', undefined, {
			store: join(scratch, 'dl2'),
			fetchFile: stub(['onnx/encoder_model.onnx', 'onnx/decoder_model_merged.onnx'], seen),
		});
		expect(report.ok).toBe(false);
		expect(report.errors.some((e) => /no ONNX weights/.test(e))).toBe(true);
		expect(report.files.every((f) => !f.endsWith('.onnx'))).toBe(true);
	});

	test('quantised weights follow the catalog dtype', async () => {
		const seen: string[] = [];
		const report = await downloadModel(
			'org/model',
			{ encoder_model: 'fp32', decoder_model_merged: 'q8' },
			{ store: join(scratch, 'dl3'), fetchFile: stub([], seen) },
		);
		expect(seen).toContain('onnx/decoder_model_merged_quantized.onnx');
		expect(report.ok).toBe(true);
	});

	test('the diarization set drops tokenizer.json and REQUIRES preprocessor_config.json', async () => {
		const seen: string[] = [];
		const report = await downloadModel('org/segmentation', undefined, {
			store: join(scratch, 'dl4'),
			commonFiles: DIARIZATION_COMMON_FILES,
			optionalFiles: [],
			fetchFile: stub(['preprocessor_config.json'], seen),
		});
		expect(seen).not.toContain('tokenizer.json');
		expect(seen).not.toContain('tokenizer_config.json');
		expect(seen).toContain('preprocessor_config.json');
		expect(report.skipped).toEqual([]);
		expect(report.ok).toBe(false);
		expect(report.errors.some((e) => /preprocessor_config\.json: download failed/.test(e))).toBe(
			true,
		);
		expect(COMMON_FILES).toContain('tokenizer.json');
	});

	test('onFile is called once per wanted file, in request order', async () => {
		const seen: string[] = [];
		const announced: string[] = [];
		await downloadModel('org/model', undefined, {
			store: join(scratch, 'dl5'),
			onFile: (f) => announced.push(f),
			fetchFile: stub([], seen),
		});
		expect(announced).toEqual(seen);
	});

	test('the store root is created even when every file fails', async () => {
		const store = join(scratch, 'dl6');
		const seen: string[] = [];
		const report = await downloadModel('org/model', undefined, {
			store,
			fetchFile: stub(
				[
					...COMMON_FILES,
					'config.json',
					'onnx/encoder_model.onnx',
					'onnx/decoder_model_merged.onnx',
				],
				seen,
			),
		});
		expect(existsSync(store)).toBe(true);
		expect(report.ok).toBe(false);
	});
});

describe('isUsableCachedFile — a truncated file is not a cache hit', () => {
	const store = () => join(scratch, 'truncation');

	test('no expected size: any non-empty file is accepted (legacy store)', () => {
		const target = join(store(), 'legacy.onnx');
		mkdirSync(store(), { recursive: true });
		writeFileSync(target, 'ONNX-BYTES');
		expect(isUsableCachedFile(target)).toBe(true);
		expect(isUsableCachedFile(target, null)).toBe(true);
	});

	test('the expected size matches: a cache hit', () => {
		const target = join(store(), 'complete.onnx');
		writeFileSync(target, 'ONNX-BYTES'); // 10 bytes
		expect(isUsableCachedFile(target, 10)).toBe(true);
	});

	test('the file is SHORTER than expected: NOT a cache hit — this is the bug', () => {
		const target = join(store(), 'partial.onnx');
		writeFileSync(target, 'ONNX'); // 4 of 10 bytes
		expect(isUsableCachedFile(target, 10)).toBe(false);
	});

	test('the file is longer than expected: not a cache hit either', () => {
		const target = join(store(), 'overlong.onnx');
		writeFileSync(target, 'ONNX-BYTES-AND-MORE');
		expect(isUsableCachedFile(target, 10)).toBe(false);
	});

	test('an absent file is never a cache hit', () => {
		expect(isUsableCachedFile(join(store(), 'nothing.onnx'), 10)).toBe(false);
	});
});

describe('downloadModel records completion in the manifest', () => {
	test('every fetched file lands in the manifest at its on-disk size', async () => {
		const store = join(scratch, 'manifest_seed');
		const model = 'onnx-community/whisper-tiny-TEST';
		const report = await downloadModel(model, { encoder_model: 'fp32' }, {
			store,
			fetchFile: async (modelId, file, target) => {
				const path = join(target, modelId, file);
				mkdirSync(dirname(path), { recursive: true });
				writeFileSync(path, 'BYTES');
				return true;
			},
		});
		expect(report.ok).toBe(true);
		expect(expectedSize(store, model, 'config.json')).toBe(5);
	});
});

describe('the inline duplicates are GONE from the production file', () => {
	test('fetchOneFile no longer builds the url, the argv or the cache check itself', async () => {
		const source = await Bun.file(
			new URL('../../src/core/ai/model_fetch.ts', import.meta.url),
		).text();
		// URL policy: the template literal now lives only in resolveFetchTarget.
		expect(source.split('/resolve/main/').length - 1).toBe(1);
		// The argv array literal was replaced by the curlArgv call.
		expect(source).not.toContain('const argv = [');
		expect(source).not.toContain("'--progress-bar',\n\t\t\t'-o',");
		// The inline confinement + cache checks are gone.
		expect(source).not.toContain(
			'if (!isSafeModelSegment(modelId) || !isSafeModelSegment(file)) return false;',
		);
		expect(source).not.toContain(
			'if (existsSync(target) && statSync(target).size > 0) return true;',
		);
		// The orchestration goes through the seam.
		expect(source).toContain('options.fetchFile ?? fetchOneFile');
	});
});
