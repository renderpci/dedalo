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
