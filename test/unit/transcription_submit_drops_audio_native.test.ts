/**
 * tool_transcription — the on-premise engine's throwaway WAV is dropped when the
 * SUBMIT settles, on every outcome, and never handed to the poll
 * (W4 cross-authz_read:r2, review-diff S3 ×2).
 *
 * The local engine is POSTed the WAV's BYTES in the submit itself, so nothing
 * reads the file once the submit has settled. The file used to ride the enqueued
 * completion poll (`cleanup_path`), deleted only when that poll's HANDLER ran: a
 * refused or failed submit (nothing enqueued), an unloaded tool, a job stopped
 * while queued or lost to a restart each left a copy of a heritage interview on
 * disk, unmanaged.
 *
 * OUTCOMES, driven through automatic_transcription itself (the handler the wire
 * reaches — pinned below) with its seams: the gate, the transcriber config, the
 * provider and the poll scheduler are injected; the media context, the WAV's
 * location under the suite media root and the cleanup run for real.
 *   W1 the provider REFUSES (ok:false): the action fails as before, the WAV is
 *      gone, nothing is scheduled;
 *   W2 the provider THROWS: the error propagates, the WAV is gone;
 *   W3 the provider ACCEPTS: the poll is scheduled AFTER the WAV is gone (it is
 *      absent when the scheduler is called) and its options carry no file path.
 * FLOOR in every case: the provider really received the WAV's path, and the file
 * existed at that moment.
 *
 * SITUATION: a runtime test3 record (generic `test` TLD; test94 component_av),
 * its WAV pre-placed at the real transcribable-audio location in the suite's
 * marked media root. Record swept after; no transcript is written.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { sql } from '../../src/core/db/postgres.ts';
import { resolveMediaToolContext } from '../../src/core/media/tool_support.ts';
import { transcribableAudioLocation } from '../../src/core/media/tools/transcription.ts';
import { getMatrixTableFromTipo } from '../../src/core/ontology/resolver.ts';
import { createSectionRecord } from '../../src/core/section/record/create_record.ts';
import type { Principal } from '../../src/core/security/permissions.ts';
import type { RecordGrant } from '../../src/core/security/write_door.ts';
import { assertTestDatabase } from '../../src/core/test_data/test_database_marker.ts';
import type { ToolActionContext } from '../../src/core/tools/module.ts';
import type {
	TranscribeRequest,
	TranscribeResult,
} from '../../src/core/tools/transcription_asr.ts';
import { LOCAL_ASR_ENGINE } from '../../src/core/tools/transcription_asr.ts';
import {
	type AutomaticSubmitSeams,
	automaticTranscription,
	tool,
} from '../../tools/tool_transcription/server/index.ts';
import { mustGet } from '../helpers/assert.ts';

const SECTION = 'test3';
const AV = 'test94';
const TRANSCRIPT = 'test17';
const USER_ID = -1;

let recordId = 0;
let table = '';
let wavPath = '';

const contextFor = (): ToolActionContext =>
	({
		principal: { userId: USER_ID, isGlobalAdmin: true, isDeveloper: true } as unknown as Principal,
		userId: USER_ID,
		background: false,
		options: {
			media_ddo: { component_tipo: AV, section_tipo: SECTION, section_id: recordId },
			transcription_ddo: {
				component_tipo: TRANSCRIPT,
				section_tipo: SECTION,
				section_id: recordId,
			},
			source_lang: 'lg-spa',
			transcriber_quality: 'medium',
			transcriber_engine: LOCAL_ASR_ENGINE,
		},
	}) as ToolActionContext;

function placeWav(): void {
	mkdirSync(dirname(wavPath), { recursive: true });
	writeFileSync(wavPath, 'RIFF....WAVEzz-interview');
}

/** The seams: every external half injected; what the provider and the scheduler saw, recorded. */
function seamsWith(provider: (req: TranscribeRequest) => Promise<TranscribeResult>) {
	const seen = {
		submittedPath: undefined as string | undefined,
		fileAtSubmit: false,
		scheduled: [] as { options: Record<string, unknown>; fileAtSchedule: boolean }[],
	};
	const seams: AutomaticSubmitSeams = {
		gate: async (ddo) =>
			({
				sectionTipo: String(ddo.section_tipo),
				componentTipo: String(ddo.component_tipo),
				sectionId: Number(ddo.section_id),
			}) as RecordGrant,
		transcriberConfig: async () => ({ uri: 'http://zzasr.invalid/', key: 'zz-key' }),
		provider: async (req) => {
			seen.submittedPath = req.audioPath;
			seen.fileAtSubmit = req.audioPath !== undefined && existsSync(req.audioPath);
			return provider(req);
		},
		schedule: async (options) => {
			seen.scheduled.push({ options, fileAtSchedule: existsSync(wavPath) });
		},
	};
	return { seams, seen };
}

beforeAll(async () => {
	await assertTestDatabase('transcription_submit_drops_audio_native');
	table = mustGet(await getMatrixTableFromTipo(SECTION), 'test3 table');
	recordId = await createSectionRecord(SECTION, USER_ID);
	const { spec, identity, pathOpts } = await resolveMediaToolContext({
		component_tipo: AV,
		section_tipo: SECTION,
		section_id: recordId,
	});
	wavPath = transcribableAudioLocation(spec, identity, pathOpts).absolutePath;
}, 60_000);

afterAll(async () => {
	rmSync(wavPath, { force: true });
	await sql.unsafe(`DELETE FROM "${table}" WHERE section_tipo = $1 AND section_id = $2`, [
		SECTION,
		recordId,
	]);
	await sql.unsafe('DELETE FROM matrix_time_machine WHERE section_tipo = $1 AND section_id = $2', [
		SECTION,
		recordId,
	]);
	await sql.unsafe(
		`DELETE FROM matrix_activity WHERE data->>'section_tipo' = $1 AND data->>'section_id' = $2`,
		[SECTION, String(recordId)],
	);
});

describe('automatic_transcription drops the on-premise WAV when the submit settles', () => {
	test('pin: the handler the wire reaches IS the function driven here', () => {
		expect(tool.apiActions.automatic_transcription?.handler).toBe(automaticTranscription);
	});

	test('W1 a REFUSED submit: the action fails, the WAV is gone, nothing scheduled', async () => {
		placeWav();
		const { seams, seen } = seamsWith(async () => ({ ok: false, msg: 'zz sidecar refused' }));
		const outcome = await automaticTranscription(contextFor(), seams).then(
			() => 'resolved',
			(error: unknown) => (error as { code?: string }).code,
		);
		expect(outcome).toBe('tool.dependency_unavailable');
		expect(seen.submittedPath).toBe(wavPath);
		expect(seen.fileAtSubmit).toBe(true);
		expect(existsSync(wavPath)).toBe(false);
		expect(seen.scheduled).toEqual([]);
	});

	test('W2 a submit that THROWS: the error propagates, the WAV is gone', async () => {
		placeWav();
		const failure = new Error('zz sidecar socket closed');
		const { seams, seen } = seamsWith(async () => {
			throw failure;
		});
		const outcome = await automaticTranscription(contextFor(), seams).then(
			() => 'resolved',
			(error: unknown) => error,
		);
		expect(outcome).toBe(failure);
		expect(seen.fileAtSubmit).toBe(true);
		expect(existsSync(wavPath)).toBe(false);
	});

	test('W3 an ACCEPTED submit: the WAV is gone before the poll is scheduled, which carries no path', async () => {
		placeWav();
		const { seams, seen } = seamsWith(async () => ({ ok: true, pid: 'zz-job-1', msg: 'ok' }));
		const response = await automaticTranscription(contextFor(), seams);
		expect(typeof (response.data as { pid?: unknown }).pid).toBe('string');
		expect(seen.fileAtSubmit).toBe(true);
		expect(seen.scheduled).toHaveLength(1);
		expect(seen.scheduled[0]?.fileAtSchedule).toBe(false);
		expect(Object.values(seen.scheduled[0]?.options ?? {})).not.toContain(wavPath);
		expect(existsSync(wavPath)).toBe(false);
	});
});
