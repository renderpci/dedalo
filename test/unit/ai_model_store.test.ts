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
import { recordFileComplete } from '../../src/core/ai/model_manifest.ts';
import {
	AI_MODEL_URL_PREFIX,
	modelFiles,
	modelHubAllowed,
	modelInstalled,
	modelState,
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
	// unsetting an env var is the point (repo convention)
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
			// unsetting an env var is the point
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

describe('modelState — "installed" is not one bit', () => {
	const STATE_MODEL = 'onnx-community/whisper-state-TEST';
	const dtype = { encoder_model: 'fp32', decoder_model_merged: 'fp32' };
	const files = () => join(STORE, STATE_MODEL);

	test('nothing on disk is missing', () => {
		expect(modelState('onnx-community/whisper-absent-TEST', dtype).state).toBe('missing');
	});

	test('all files present, no manifest: unverified — present but never size-checked', () => {
		mkdirSync(join(files(), 'onnx'), { recursive: true });
		writeFileSync(join(files(), 'config.json'), '{"model_type":"whisper"}');
		writeFileSync(join(files(), 'onnx', 'encoder_model.onnx'), '\x08ENCODER-BYTES');
		writeFileSync(join(files(), 'onnx', 'decoder_model_merged.onnx'), '\x08DECODER-BYTES');
		expect(modelState(STATE_MODEL, dtype).state).toBe('unverified');
	});

	test('one required file absent while others are present: incomplete', () => {
		rmSync(join(files(), 'onnx', 'decoder_model_merged.onnx'));
		expect(modelState(STATE_MODEL, dtype).state).toBe('incomplete');
		writeFileSync(join(files(), 'onnx', 'decoder_model_merged.onnx'), '\x08DECODER-BYTES');
	});

	test('the manifest size contradicts the disk: incomplete — the truncation case', () => {
		recordFileComplete(STORE, STATE_MODEL, 'onnx/encoder_model.onnx', 999999);
		const report = modelState(STATE_MODEL, dtype);
		expect(report.state).toBe('incomplete');
		const evidence = report.files.find((entry) => entry.file === 'onnx/encoder_model.onnx');
		expect(evidence?.expected).toBe(999999);
		expect(evidence?.size).toBe(14);
	});

	test('every manifest size matches the disk: ready', () => {
		recordFileComplete(STORE, STATE_MODEL, 'config.json', 24);
		recordFileComplete(STORE, STATE_MODEL, 'onnx/encoder_model.onnx', 14);
		recordFileComplete(STORE, STATE_MODEL, 'onnx/decoder_model_merged.onnx', 14);
		expect(modelState(STATE_MODEL, dtype).state).toBe('ready');
	});

	test('an HTML error page saved as weights: damaged', () => {
		writeFileSync(join(files(), 'onnx', 'encoder_model.onnx'), '<!DOCTYPE html><html>404');
		recordFileComplete(STORE, STATE_MODEL, 'onnx/encoder_model.onnx', 24);
		expect(modelState(STATE_MODEL, dtype).state).toBe('damaged');
	});
});

describe('modelState — the dtype-less fallback (a catalog that predates per-model quantisation)', () => {
	// getToolConfig reads straight from the DB, so a live install can have a
	// pre-dtype catalog entry alongside quantised weights already on disk. The
	// no-dtype default used to be the exact fp32 filenames, which reported this
	// case as "missing" — directly breaking the wire promise that `installed`
	// never narrows. modelInstalled already had the correct weaker fallback;
	// modelState must give the same answer, with real file evidence.
	const NO_DTYPE_MODEL = 'onnx-community/whisper-no-dtype-TEST';
	const dir = () => join(STORE, NO_DTYPE_MODEL);

	afterAll(() => rmSync(dir(), { recursive: true, force: true }));

	test('quantised weights + no dtype: NOT missing (matches modelInstalled)', () => {
		mkdirSync(join(dir(), 'onnx'), { recursive: true });
		writeFileSync(join(dir(), 'config.json'), '{"model_type":"whisper"}');
		writeFileSync(join(dir(), 'onnx', 'encoder_model_fp16.onnx'), '\x08ENCODER-FP16');
		writeFileSync(join(dir(), 'onnx', 'decoder_model_merged_q4f16.onnx'), '\x08DECODER-Q4F16');

		// modelInstalled's own behaviour is unchanged: the weaker "any variant" test.
		expect(modelInstalled(NO_DTYPE_MODEL)).toBe(true);

		const report = modelState(NO_DTYPE_MODEL);
		expect(report.state).not.toBe('missing');
		// No manifest was ever written for these files: unverified, not a false "ready".
		expect(report.state).toBe('unverified');
		// Evidence reflects the files actually found on disk, not the fp32 guess.
		expect(report.files.map((entry) => entry.file).sort()).toEqual(
			[
				'config.json',
				'onnx/decoder_model_merged_q4f16.onnx',
				'onnx/encoder_model_fp16.onnx',
			].sort(),
		);
		expect(report.files.every((entry) => entry.present)).toBe(true);
	});

	test('only one weight variant present + no dtype: still correctly unusable', () => {
		const model = 'onnx-community/whisper-half-variant-TEST';
		mkdirSync(join(STORE, model, 'onnx'), { recursive: true });
		writeFileSync(join(STORE, model, 'config.json'), '{"model_type":"whisper"}');
		writeFileSync(join(STORE, model, 'onnx', 'encoder_model_fp16.onnx'), '\x08ENCODER-FP16');
		try {
			expect(modelInstalled(model)).toBe(false);
			// No decoder variant at all: the fp32 placeholder fallback correctly
			// reports this as not usable (missing or incomplete, never ready/unverified).
			expect(['missing', 'incomplete']).toContain(modelState(model).state);
		} finally {
			rmSync(join(STORE, model), { recursive: true, force: true });
		}
	});

	test('nothing on disk + no dtype: still missing', () => {
		expect(modelState('onnx-community/whisper-truly-absent-TEST').state).toBe('missing');
	});
});

/**
 * PER-FILE EVIDENCE — what a repair is allowed to act on.
 *
 * `modelState` used to hand back a model-wide verdict only, so the repair path
 * read "damaged" and treated EVERY file as suspect: one HTML error page written
 * over the tokenizer took the healthy weights with it. And on the dtype-less path
 * the file names are fp32 PLACEHOLDERS, not names anything on disk answers to —
 * deleting a weight on that authority is unrecoverable, so the report has to say
 * whether the names are real.
 */
describe('modelState evidences each file, and says whether it knows their names', () => {
	const EV_STORE = join(import.meta.dir, '..', '..', '..', 'private', `ai_ev_test_${process.pid}`);
	const EV_MODEL = 'scratch/evidence-model';
	const ONNX = Buffer.from([0x08, 0x07, 0x12, 0x04]);
	let prior: string | undefined;

	beforeAll(() => {
		prior = process.env.DEDALO_AI_MODEL_STORE;
		mkdirSync(join(EV_STORE, EV_MODEL, 'onnx'), { recursive: true });
		process.env.DEDALO_AI_MODEL_STORE = EV_STORE;
	});
	afterAll(() => {
		if (prior === undefined) delete process.env.DEDALO_AI_MODEL_STORE;
		else process.env.DEDALO_AI_MODEL_STORE = prior;
		rmSync(EV_STORE, { recursive: true, force: true });
	});

	test('an HTML error page marks ONE file implausible, not the whole set', () => {
		writeFileSync(join(EV_STORE, EV_MODEL, 'config.json'), '{"model_type":"whisper"}');
		writeFileSync(join(EV_STORE, EV_MODEL, 'onnx', 'encoder_model_q4.onnx'), '<!doctype html>');
		writeFileSync(join(EV_STORE, EV_MODEL, 'onnx', 'decoder_model_merged_q4.onnx'), ONNX);

		const report = modelState(EV_MODEL, {
			encoder_model: 'q4',
			decoder_model_merged: 'q4',
		});
		expect(report.state).toBe('damaged');
		const implausible = report.files.filter((file) => !file.plausible).map((file) => file.file);
		expect(implausible).toEqual(['onnx/encoder_model_q4.onnx']);
		// A declared dtype IS the names: a repair may delete and re-fetch them.
		expect(report.namesKnown).toBe(true);
	});

	test('a pretty-printed JSON config is not "damaged"', () => {
		writeFileSync(
			join(EV_STORE, EV_MODEL, 'config.json'),
			'\n\t{\n\t\t"model_type": "whisper"\n\t}',
		);
		writeFileSync(join(EV_STORE, EV_MODEL, 'onnx', 'encoder_model_q4.onnx'), ONNX);
		const report = modelState(EV_MODEL, {
			encoder_model: 'q4',
			decoder_model_merged: 'q4',
		});
		expect(report.files.find((file) => file.file === 'config.json')?.plausible).toBe(true);
	});

	test('no dtype and no complete weight pair: the names are guesses, and it says so', () => {
		rmSync(join(EV_STORE, EV_MODEL), { recursive: true, force: true });
		mkdirSync(join(EV_STORE, EV_MODEL, 'onnx'), { recursive: true });
		writeFileSync(join(EV_STORE, EV_MODEL, 'config.json'), '{}');
		// An encoder without a decoder: fallbackWeightsFiles finds no pair.
		writeFileSync(join(EV_STORE, EV_MODEL, 'onnx', 'encoder_model_q4.onnx'), ONNX);

		const guessed = modelState(EV_MODEL);
		expect(guessed.namesKnown).toBe(false);
		expect(guessed.files.map((file) => file.file)).toContain('onnx/encoder_model.onnx');

		// With the pair present the store itself supplies the real names.
		writeFileSync(join(EV_STORE, EV_MODEL, 'onnx', 'decoder_model_merged_q4.onnx'), ONNX);
		const known = modelState(EV_MODEL);
		expect(known.namesKnown).toBe(true);
		expect(known.files.map((file) => file.file)).toContain('onnx/encoder_model_q4.onnx');
	});
});
