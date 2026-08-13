/**
 * AI MODELS WIDGET GATE — the administrator's answer to "can this install
 * transcribe at all?".
 *
 * The panel shape is a pure function of already-read facts, so this gate never
 * touches the store or the catalog: the widget's own I/O shell reads those.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
	buildAiModelsPanel,
	toModelRow,
	widget,
} from '../../src/core/area_maintenance/widgets/ai_models.ts';

describe('the panel tells an administrator what to do', () => {
	test('an unreachable store is reported as such, with no model rows invented', () => {
		const panel = buildAiModelsPanel({
			storePath: '/private/ai_models',
			storeAvailable: false,
			hubAllowed: false,
			models: [],
		});
		expect(panel.store_available).toBe(false);
		expect(panel.models).toEqual([]);
		expect(panel.usable_count).toBe(0);
	});

	test('every state is carried through, and usable_count counts only runnable ones', () => {
		const panel = buildAiModelsPanel({
			storePath: '/private/ai_models',
			storeAvailable: true,
			hubAllowed: false,
			models: [
				{ name: 'a', label: 'High', state: 'ready', bytes: 100 },
				{ name: 'b', label: 'Medium', state: 'unverified', bytes: 50 },
				{ name: 'c', label: 'Low', state: 'incomplete', bytes: 7 },
				{ name: 'd', label: 'Tiny', state: 'missing', bytes: 0 },
			],
		});
		expect(panel.models.map((model) => model.state)).toEqual([
			'ready',
			'unverified',
			'incomplete',
			'missing',
		]);
		expect(panel.usable_count).toBe(2);
		expect(panel.total_bytes).toBe(157);
	});

	test('a damaged model is never counted as usable', () => {
		const panel = buildAiModelsPanel({
			storePath: '/private/ai_models',
			storeAvailable: true,
			hubAllowed: true,
			models: [{ name: 'a', label: 'High', state: 'damaged', bytes: 900 }],
		});
		expect(panel.usable_count).toBe(0);
		expect(panel.hub_allowed).toBe(true);
		expect(panel.total_bytes).toBe(900);
	});

	/**
	 * SPEC §6: the speaker-detection pair is its own row group — and the SAME
	 * population for the headline. Reading only `transcriber_quality` let the
	 * dashboard say "2 of 2 usable" in green while the transcription tool showed a
	 * damaged segmentation model: two humans, two truths, one install.
	 */
	test('the speaker pair is its own group, and a damaged half is never green', () => {
		const panel = buildAiModelsPanel({
			storePath: '/private/ai_models',
			storeAvailable: true,
			hubAllowed: false,
			models: [{ name: 'a', label: 'High', state: 'ready', bytes: 100 }],
			speakers: [
				{ name: 'seg', label: 'Segmentation', state: 'damaged', bytes: 6, role: 'segmentation' },
				{ name: 'emb', label: 'Voices', state: 'ready', bytes: 26, role: 'embedding' },
			],
		});
		// Its own group, in role order — never folded into the pickable qualities.
		expect(panel.models.map((model) => model.name)).toEqual(['a']);
		expect(panel.speakers.map((model) => model.role)).toEqual(['segmentation', 'embedding']);
		// 2 of 3, not 1 of 1: the damaged half counts, so the headline cannot be
		// green while speaker detection is broken.
		expect(panel.usable_count).toBe(2);
		expect(panel.models.length + panel.speakers.length).toBe(3);
		// Bytes are the whole store, both groups.
		expect(panel.total_bytes).toBe(132);
	});

	test('an unreadable catalog is UNKNOWN, never an empty model list', () => {
		// The widget's half of the degraded-answer contract: an empty list drawn
		// here would tell the administrator that nothing is installed.
		const panel = buildAiModelsPanel({
			storePath: '/private/ai_models',
			storeAvailable: true,
			hubAllowed: false,
			catalogReadable: false,
			models: [],
		});
		expect(panel.catalog_readable).toBe(false);
		expect(panel.models).toEqual([]);
		// A readable catalog that declares nothing is the OTHER answer.
		expect(
			buildAiModelsPanel({
				storePath: '/private/ai_models',
				storeAvailable: true,
				hubAllowed: false,
				models: [],
			}).catalog_readable,
		).toBe(true);
	});

	test('the widget registers under a stable id and serves a value', () => {
		expect(widget.spec.id).toBe('ai_models');
		expect(typeof widget.getValue).toBe('function');
	});

	test('it is DISPLAY-ONLY: no apiActions reach the wire', () => {
		// The download / verify / repair executes live in tool_transcription,
		// admin-gated there. A second copy here would be a second gate to keep right.
		expect(widget.apiActions).toBeUndefined();
	});
});

/**
 * THE SIZE AND THE STATE MUST READ THE SAME FILES.
 *
 * They did not: the bytes were summed over the fp32 placeholder names while the
 * state read the real ones off disk, so a healthy quantised install showed
 * "Installed, not verified" beside a size of "—" and the store total undercounted
 * every quantised model it listed.
 */
describe("a row's size answers for the files its state was read from", () => {
	const STORE = join(
		import.meta.dir,
		'..',
		'..',
		'..',
		'private',
		`ai_models_widget_${process.pid}`,
	);
	const MODEL = 'onnx-community/whisper-quantised-TEST';
	let prior: string | undefined;

	beforeAll(() => {
		prior = process.env.DEDALO_AI_MODEL_STORE;
		mkdirSync(join(STORE, MODEL, 'onnx'), { recursive: true });
		writeFileSync(join(STORE, MODEL, 'config.json'), '{"model_type":"whisper"}');
		// A QUANTISED install with no dtype in the catalog — the live case.
		writeFileSync(join(STORE, MODEL, 'onnx', 'encoder_model_fp16.onnx'), '\x08ENCODER-FP16');
		writeFileSync(join(STORE, MODEL, 'onnx', 'decoder_model_merged_q4f16.onnx'), '\x08DECODER');
		process.env.DEDALO_AI_MODEL_STORE = STORE;
	});
	afterAll(() => {
		if (prior === undefined) delete process.env.DEDALO_AI_MODEL_STORE;
		else process.env.DEDALO_AI_MODEL_STORE = prior;
		rmSync(STORE, { recursive: true, force: true });
	});

	test('a quantised, dtype-less install reports both a state and its bytes', () => {
		const row = toModelRow({ name: MODEL, label: 'Medium', kind: 'asr' });
		expect(row.state).toBe('unverified');
		// It used to be 0 — "Installed, not verified · —", a row contradicting itself.
		expect(row.bytes).toBeGreaterThan(0);
	});
});
