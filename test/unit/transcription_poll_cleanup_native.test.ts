/**
 * tool_transcription — the detached completion poll removes the job's temporary
 * audio copy on EVERY exit (backgroundTranscriberPoll, `cleanup_path`).
 *
 * The copy is a recording of a heritage interview: left behind it is a second,
 * unmanaged copy of protected media. The cleanup used to run only when the poll
 * RETURNED; a poll that THREW (the status provider failing, a save re-gate
 * failing untyped) skipped it. OUTCOME: after a poll whose status provider
 * throws, the error still reaches the job (the poll rejects with it) AND the
 * temporary file is gone. Twin: a poll that ends normally removes it too.
 *
 * SITUATION: a temporary file in a fresh OS temp dir (the poll unlinks the path
 * it was handed; no media root is resolved). No database writes.
 */

import { afterAll, describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Principal } from '../../src/core/security/permissions.ts';
import { backgroundTranscriberPoll } from '../../tools/tool_transcription/server/index.ts';

const dir = mkdtempSync(join(tmpdir(), 'dd_transcription_cleanup_'));

afterAll(() => {
	rmSync(dir, { recursive: true, force: true });
});

function tempAudio(name: string): string {
	const path = join(dir, name);
	writeFileSync(path, 'RIFF....WAVE');
	return path;
}

function pollContext(cleanupPath: string) {
	return {
		principal: { userId: -1, isGlobalAdmin: true, isDeveloper: true } as unknown as Principal,
		userId: -1,
		background: true,
		options: {
			key: 'zz-key',
			url: 'http://zztranscription.invalid/api/',
			lang: 'lg-spa',
			av_url: '',
			engine: 'babel',
			user_id: -1,
			entity_name: 'poll_cleanup',
			transcription_ddo: { component_tipo: 'test17', section_tipo: 'test3', section_id: 1 },
			pid: 123,
			cleanup_path: cleanupPath,
		},
	};
}

describe('the background transcription poll drops its temporary audio on every exit', () => {
	test('a status provider that THROWS: the error reaches the job AND the copy is gone', async () => {
		const path = tempAudio('throws.wav');
		const failure = new Error('zz transcriber unreachable');
		const outcome = await backgroundTranscriberPoll(pollContext(path), {
			statusProvider: (() => {
				throw failure;
			}) as never,
			maxAttempts: 1,
			intervalMs: 0,
		}).then(
			() => 'resolved',
			(error: unknown) => error,
		);
		expect(outcome).toBe(failure);
		expect(existsSync(path)).toBe(false);
	});

	test('twin: a poll that ENDS (status 1, nothing to save) removes it too', async () => {
		const path = tempAudio('ends.wav');
		const outcome = await backgroundTranscriberPoll(pollContext(path), {
			statusProvider: (async () => ({ status: 1 })) as never,
			maxAttempts: 1,
			intervalMs: 0,
		}).then(
			() => 'resolved',
			(error: unknown) => (error as { code?: string }).code ?? String(error),
		);
		expect(outcome).toBe('tool.action_failed');
		expect(existsSync(path)).toBe(false);
	});
});
