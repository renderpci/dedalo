/**
 * LOCAL AI MODEL STORE GATE.
 *
 * In-browser speech recognition is the tool's answer to "these recordings hold
 * personal data and may not be uploaded". That answer only holds if the MODEL
 * comes from the institution's own install too — otherwise an air-gapped archive
 * cannot transcribe at all, and a connected one tells a public hub when a record
 * is being worked on.
 *
 * This gate pins the store's serving contract: it resolves real model files,
 * caches them hard (a model id IS its version, and re-downloading a gigabyte over
 * the LAN for every transcription is not acceptable), and is fail-closed in every
 * other direction — traversal, non-model extensions and misses all 404 without
 * leaking whether the target exists.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
	AI_MODEL_URL_PREFIX,
	modelFiles,
	modelHubAllowed,
	modelInstalled,
	modelStoreAvailable,
	resolveModelPath,
} from '../../src/core/ai/model_store.ts';
import { handleRequest } from '../../src/server.ts';

const STORE = join(import.meta.dir, '..', '..', '..', 'private', `ai_models_test_${process.pid}`);
const MODEL = 'onnx-community/whisper-tiny-TEST';

const context = { requestId: 'test', startedAt: 0 };

async function get(path: string): Promise<Response> {
	return handleRequest(new Request(`http://localhost${path}`), context);
}

beforeAll(() => {
	mkdirSync(join(STORE, MODEL, 'onnx'), { recursive: true });
	writeFileSync(join(STORE, MODEL, 'config.json'), '{"model_type":"whisper"}');
	writeFileSync(join(STORE, MODEL, 'onnx', 'encoder_model.onnx'), 'ONNX-BYTES');
	// Something that is NOT part of what a browser needs to run the model.
	writeFileSync(join(STORE, MODEL, 'README.md'), '# not servable');
	process.env.DEDALO_AI_MODEL_STORE = STORE;
});

afterAll(() => {
	// biome-ignore lint/performance/noDelete: unsetting an env var is the point (repo convention)
	delete process.env.DEDALO_AI_MODEL_STORE;
	rmSync(STORE, { recursive: true, force: true });
});

describe('the model store resolves what the browser needs', () => {
	test('the store reports itself available once it exists', () => {
		expect(modelStoreAvailable()).toBe(true);
	});

	test('serves model weights and their config', async () => {
		const weights = await get(`${AI_MODEL_URL_PREFIX}${MODEL}/onnx/encoder_model.onnx`);
		expect(weights.status).toBe(200);
		expect(await weights.text()).toBe('ONNX-BYTES');

		const config = await get(`${AI_MODEL_URL_PREFIX}${MODEL}/config.json`);
		expect(config.status).toBe(200);
	});

	test('model files are immutable-cached (a second transcription re-downloads nothing)', async () => {
		const response = await get(`${AI_MODEL_URL_PREFIX}${MODEL}/onnx/encoder_model.onnx`);
		expect(response.headers.get('Cache-Control')).toContain('immutable');
	});
});

describe('the model store is fail-closed', () => {
	test('a non-model extension is not served', async () => {
		expect((await get(`${AI_MODEL_URL_PREFIX}${MODEL}/README.md`)).status).toBe(404);
		expect(resolveModelPath(`${MODEL}/README.md`)).toBeNull();
	});

	test('traversal out of the store is refused', () => {
		expect(resolveModelPath('../../.env')).toBeNull();
		expect(resolveModelPath('../../../src/config/config.ts')).toBeNull();
	});

	test('a missing model 404s without leaking that it is missing', async () => {
		const response = await get(`${AI_MODEL_URL_PREFIX}does-not-exist/onnx/model.onnx`);
		expect(response.status).toBe(404);
		expect(await response.text()).not.toContain('does-not-exist');
	});
});

describe('the public hub is opt-in', () => {
	test('downloads from a public hub are OFF unless the operator says otherwise', () => {
		expect(modelHubAllowed()).toBe(false);
	});

	test('and can be turned on deliberately', () => {
		process.env.DEDALO_AI_MODEL_ALLOW_HUB = 'true';
		try {
			expect(modelHubAllowed()).toBe(true);
		} finally {
			// biome-ignore lint/performance/noDelete: unsetting an env var is the point
			delete process.env.DEDALO_AI_MODEL_ALLOW_HUB;
		}
	});
});

describe('"installed" means USABLE, not merely present', () => {
	// The picker offers what this says is installed, and refuses what it does not.
	// The bug it exists to stop: a store holding a model's config and the WRONG
	// quantisation looks full, so the browser is offered a model that fails deep
	// inside the ONNX loader with "Could not locate file: …/config.json" — after
	// the audio has already been prepared.
	test('the file list follows the catalog dtype, never a guess', () => {
		expect(modelFiles({ encoder_model: 'fp16', decoder_model_merged: 'q4f16' })).toEqual([
			'config.json',
			'onnx/encoder_model_fp16.onnx',
			'onnx/decoder_model_merged_q4f16.onnx',
		]);
		// No dtype declared = the repo's plain fp32 files.
		expect(modelFiles()).toEqual([
			'config.json',
			'onnx/encoder_model.onnx',
			'onnx/decoder_model_merged.onnx',
		]);
	});

	test('a model whose weights are a DIFFERENT quantisation is not installed', () => {
		// The fixture store holds config.json + onnx/encoder_model.onnx only.
		expect(modelInstalled(MODEL, { encoder_model: 'fp32' })).toBe(true);
		// Same model, asking for the fp16 variant nobody downloaded:
		expect(modelInstalled(MODEL, { encoder_model: 'fp16' })).toBe(false);
		// Config present but the decoder missing entirely:
		expect(modelInstalled(MODEL, { encoder_model: 'fp32', decoder_model_merged: 'fp32' })).toBe(
			false,
		);
	});

	test('an unknown model is never installed', () => {
		expect(modelInstalled('nobody/at-all', { encoder_model: 'fp32' })).toBe(false);
	});
});
