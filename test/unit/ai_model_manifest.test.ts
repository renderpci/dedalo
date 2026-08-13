/**
 * MODEL COMPLETION MANIFEST GATE.
 *
 * "The file exists and is not empty" is not "the file is complete": a download
 * killed mid-file leaves a non-zero partial that curl's own resume then skips,
 * and the browser dies inside the ONNX runtime with a protobuf parse error the
 * archivist cannot act on. The manifest is what makes completion knowable.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
	MANIFEST_FILE,
	expectedSize,
	forgetFile,
	readManifest,
	recordFileComplete,
} from '../../src/core/ai/model_manifest.ts';

const MODEL = 'onnx-community/whisper-tiny-TEST';
let store = '';

beforeAll(() => {
	store = mkdtempSync(join(tmpdir(), 'dd_model_manifest_'));
	mkdirSync(join(store, MODEL, 'onnx'), { recursive: true });
});

afterAll(() => {
	if (store !== '') rmSync(store, { recursive: true, force: true });
});

describe('the manifest records completion', () => {
	test('an unseeded model has an empty manifest and no expected sizes', () => {
		expect(readManifest(store, MODEL)).toEqual({ files: {} });
		expect(expectedSize(store, MODEL, 'config.json')).toBeNull();
	});

	test('a recorded file yields its expected size', () => {
		recordFileComplete(store, MODEL, 'config.json', 42);
		expect(expectedSize(store, MODEL, 'config.json')).toBe(42);
		expect(existsSync(join(store, MODEL, MANIFEST_FILE))).toBe(true);
	});

	test('a second record does not erase the first', () => {
		recordFileComplete(store, MODEL, 'onnx/encoder_model.onnx', 1024);
		expect(expectedSize(store, MODEL, 'config.json')).toBe(42);
		expect(expectedSize(store, MODEL, 'onnx/encoder_model.onnx')).toBe(1024);
	});

	test('a corrupt manifest reads as empty, never throws', () => {
		const other = 'onnx-community/whisper-broken-TEST';
		mkdirSync(join(store, other), { recursive: true });
		writeFileSync(join(store, other, MANIFEST_FILE), 'not json{');
		expect(readManifest(store, other)).toEqual({ files: {} });
		expect(expectedSize(store, other, 'config.json')).toBeNull();
	});

	test('forgetting a file drops its claim without asserting a false one', () => {
		recordFileComplete(store, MODEL, 'onnx/decoder_model_merged.onnx', 2048);
		forgetFile(store, MODEL, 'onnx/decoder_model_merged.onnx');
		expect(expectedSize(store, MODEL, 'onnx/decoder_model_merged.onnx')).toBeNull();
		// the siblings' claims survive
		expect(expectedSize(store, MODEL, 'config.json')).toBe(42);
	});

	test('an unsafe model id or file never escapes the store', () => {
		recordFileComplete(store, '../escape', 'config.json', 1);
		expect(existsSync(join(store, '..', 'escape'))).toBe(false);
		expect(expectedSize(store, MODEL, '../../etc/passwd')).toBeNull();
	});
});
