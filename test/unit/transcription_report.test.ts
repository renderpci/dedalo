/**
 * FAILURE CLASSIFIER GATE.
 *
 * The engine's failures reach the user as runtime strings from onnxruntime and
 * the Web Audio API — "Can't create a session. ERROR_CODE: 7, ERROR_MESSAGE:
 * Failed to load model because protobuf parsing failed." is a real one, observed
 * live. This maps each to a cause and a remedy the archivist can act on. The
 * load-bearing case is the LAST one: an unrecognised failure must still produce a
 * complete report carrying the raw text, because silence is the defect this whole
 * change exists to remove.
 */

import { describe, expect, test } from 'bun:test';
import {
	build_report,
	classify_failure,
	installed_answer,
	MODEL_STATES,
	model_state_of,
	server_answered,
} from '../../tools/tool_transcription/js/transcription_report.js';

describe('classify_failure maps runtime strings to remedies', () => {
	test('the ONNX protobuf failure names a damaged model', () => {
		const report = classify_failure(
			"Can't create a session. ERROR_CODE: 7, ERROR_MESSAGE: Failed to load model because protobuf parsing failed.",
			{ phase: 'model', model: 'onnx-community/whisper-large-v3-turbo-ONNX' },
		);
		expect(report.key).toBe('model_damaged');
		expect(report.phase).toBe('model');
		expect(report.action_key).toBe('action_repair_model');
		expect(report.detail).toContain('ERROR_CODE: 7');
	});

	test('a missing file names an uninstalled model', () => {
		expect(classify_failure('Could not locate file: "…/config.json"', {}).key).toBe(
			'model_missing',
		);
		expect(classify_failure('failed with status code 404', {}).key).toBe('model_missing');
	});

	test('memory exhaustion names the size of the job', () => {
		expect(classify_failure('Failed to allocate 2147483648 bytes', {}).key).toBe('out_of_memory');
		expect(classify_failure('WebAssembly.Memory(): out of memory', {}).key).toBe('out_of_memory');
	});

	test('a lost GPU offers the CPU', () => {
		const report = classify_failure('Device was lost while running the pipeline', {});
		expect(report.key).toBe('device_lost');
		expect(report.action_key).toBe('action_retry_cpu');
	});

	test('missing cross-origin isolation is an administrator problem', () => {
		expect(classify_failure('SharedArrayBuffer is not defined', {}).key).toBe('not_isolated');
	});

	test('audio decoding failures blame the recording, not the model', () => {
		expect(classify_failure('Unable to decode audio data', {}).key).toBe('audio_undecodable');
	});

	test('a bare AudioContext.createBuffer failure is audio, not a lost GPU device', () => {
		const report = classify_failure(
			"Failed to execute 'createBuffer' on 'BaseAudioContext': invalid number of channels",
			{},
		);
		expect(report.key).toBe('audio_undecodable');
	});

	test('an UNRECOGNISED failure still yields a complete report with the raw text', () => {
		const report = classify_failure('kaboom 0x8007000E', { phase: 'transcribe' });
		expect(report.key).toBe('unknown');
		expect(report.severity).toBe('error');
		expect(report.phase).toBe('transcribe');
		expect(report.detail).toContain('kaboom 0x8007000E');
	});

	test('an empty message never yields an empty report', () => {
		const report = classify_failure('', {});
		expect(report.key).toBe('unknown');
		expect(report.detail.length).toBeGreaterThan(0);
	});
});

/**
 * MODEL STATE TABLE GATE.
 *
 * MODEL_STATES is read by TWO call sites — the readiness line (before the button is
 * pressed) and the run's own refusal (after it is). They used to hold separate
 * opinions, and the refusal was the one that lied: a DAMAGED model is absent from
 * the server's `installed` list exactly like a missing one, so it was announced as
 * "not installed" and answered with a Download the server short-circuits as "already
 * installed" — the files ARE there, just broken. That is the one failure this whole
 * piece of work exists to fix, so the mapping is pinned here rather than trusted to
 * stay in step in two places.
 */
describe('MODEL_STATES — one table, two call sites', () => {
	test('damaged and incomplete are REPAIRED, never re-downloaded', () => {
		// the defect in one line: both are present-but-broken, and a download is a
		// no-op on them
		for (const state of ['damaged', 'incomplete'] as const) {
			expect(MODEL_STATES[state].action_key).toBe('action_repair_model');
			expect(MODEL_STATES[state].message_key).toBe('error_model_damaged');
			expect(MODEL_STATES[state].cause_key).toBe('cause_model_damaged');
			expect(MODEL_STATES[state].usable).toBe(false);
		}
	});

	test('missing is the only state that offers a download', () => {
		expect(MODEL_STATES.missing.action_key).toBe('action_download_model');
		expect(MODEL_STATES.missing.message_key).toBe('error_model_missing');
		expect(MODEL_STATES.missing.cause_key).toBe('cause_model_missing');
		expect(MODEL_STATES.missing.usable).toBe(false);

		const downloadable = Object.keys(MODEL_STATES).filter(
			(state) =>
				MODEL_STATES[state as keyof typeof MODEL_STATES].action_key === 'action_download_model',
		);
		expect(downloadable).toEqual(['missing']);
	});

	test('ready and unverified both RUN — an unverified store is the normal one', () => {
		// every install seeded before the per-file verification existed reports
		// `unverified`; refusing those would break the tool for its whole user base
		expect(MODEL_STATES.ready.usable).toBe(true);
		expect(MODEL_STATES.unverified.usable).toBe(true);
		expect(MODEL_STATES.ready.action_key).toBeNull();
		// the ONLY route to the verification action in the whole UI
		expect(MODEL_STATES.unverified.action_key).toBe('action_verify_model');

		const runnable = Object.keys(MODEL_STATES).filter(
			(state) => MODEL_STATES[state as keyof typeof MODEL_STATES].usable,
		);
		expect(runnable.sort()).toEqual(['ready', 'unverified']);
	});

	test('every state names a label key for its own word', () => {
		for (const [state, info] of Object.entries(MODEL_STATES)) {
			expect(info.state_key).toBe(`state_${state}`);
		}
	});

	test('an unusable state always carries the words to explain itself', () => {
		for (const info of Object.values(MODEL_STATES)) {
			if (info.usable) continue;
			// a refusal with no message and no remedy is the silence being removed
			expect(typeof info.message_key).toBe('string');
			expect(typeof info.cause_key).toBe('string');
			expect(typeof info.action_key).toBe('string');
		}
	});
});

describe('model_state_of — null is "not answered", never "at fault"', () => {
	const models = [
		{ name: 'onnx-community/whisper-small-ONNX', state: 'ready' },
		{ name: 'onnx-community/whisper-large-v3-turbo-ONNX', state: 'damaged' },
	];

	test('it reads the state of the named model', () => {
		expect(model_state_of(models, 'onnx-community/whisper-small-ONNX')).toBe('ready');
		expect(model_state_of(models, 'onnx-community/whisper-large-v3-turbo-ONNX')).toBe('damaged');
	});

	test('NO models array (an older server) is null, so the caller keeps its coarse message', () => {
		// the compatibility case: a server predating the per-file verification sends
		// no `models` at all. Inventing a verdict here would refuse runs that work.
		expect(model_state_of(undefined, 'onnx-community/whisper-small-ONNX')).toBeNull();
		expect(model_state_of(null, 'onnx-community/whisper-small-ONNX')).toBeNull();
		expect(model_state_of([], 'onnx-community/whisper-small-ONNX')).toBeNull();
	});

	test('a model absent from the answer is null, not a fault', () => {
		expect(model_state_of(models, 'onnx-community/whisper-medium-ONNX')).toBeNull();
	});

	test('a malformed entry is null rather than a bogus state', () => {
		expect(model_state_of([{ name: 'x' }], 'x')).toBeNull();
		expect(model_state_of([{ name: 'x', state: '' }], 'x')).toBeNull();
		expect(model_state_of([null, undefined, { name: 'x', state: 'ready' }], 'x')).toBe('ready');
	});

	test('no name asked, nothing answered', () => {
		expect(model_state_of(models, null)).toBeNull();
		expect(model_state_of(models, '')).toBeNull();
	});

	/**
	 * The load-bearing case, and the reason this returns a bare string: these states
	 * cross a WIRE. A server one version ahead sends a word this build has not
	 * learned, and flattening it to null made the readiness line render NOTHING —
	 * the exact silence the status panel exists to end. It comes back verbatim so
	 * the caller can show the server's own word with no remedy attached.
	 */
	test('an UNKNOWN state does not vanish — it comes back verbatim', () => {
		expect(model_state_of([{ name: 'x', state: 'quarantined' }], 'x')).toBe('quarantined');
		// and the caller's lookup misses, which is how it knows not to interpret it
		expect(MODEL_STATES['quarantined' as keyof typeof MODEL_STATES]).toBeUndefined();
	});
});

describe('build_report normalizes', () => {
	test('missing fields become empty strings, never undefined in the DOM', () => {
		const report = build_report({ phase: 'audio', severity: 'warning', message: 'x' });
		expect(report).toEqual({
			phase: 'audio',
			severity: 'warning',
			message: 'x',
			cause: '',
			action: '',
			detail: '',
		});
	});

	test('an unknown phase or severity falls back rather than rendering garbage', () => {
		const report = build_report({ phase: 'nonsense', severity: 'nonsense', message: 'x' });
		expect(report.phase).toBe('transcribe');
		expect(report.severity).toBe('error');
	});
});

/**
 * THE CLIENT HALF of the degraded-answer contract (the server half lives in
 * tool_transcription.test.ts). ABSENT ≠ EMPTY, and getting it backwards is how a
 * momentary database error told every archivist their model was not installed
 * and handed them a Download the server then refused.
 */
describe('absent is UNKNOWN, empty is NONE', () => {
	test('an absent `installed` cannot answer for any model', () => {
		expect(installed_answer({ store_ready: true }, 'whisper')).toBe('unknown');
		expect(installed_answer(null, 'whisper')).toBe('unknown');
	});

	test('an EMPTY `installed` is a real answer: this model is not installed', () => {
		expect(installed_answer({ installed: [] }, 'whisper')).toBe('no');
	});

	test('a listed model is installed; an unlisted one is not', () => {
		expect(installed_answer({ installed: ['whisper'] }, 'whisper')).toBe('yes');
		expect(installed_answer({ installed: ['other'] }, 'whisper')).toBe('no');
	});

	test('server_answered separates "did not say" from "said nothing is there"', () => {
		// diarization null = this install declares no speaker detection (an answer).
		expect(server_answered({ diarization: null }, 'diarization')).toBe(true);
		expect(server_answered({ diarization: { name: 'x' } }, 'diarization')).toBe(true);
		// absent = cannot tell.
		expect(server_answered({}, 'diarization')).toBe(false);
		expect(server_answered(null, 'diarization')).toBe(false);
		// and the same rule for the two model fields.
		expect(server_answered({ models: [] }, 'models')).toBe(true);
		expect(server_answered({ installed: [] }, 'models')).toBe(false);
	});
});
