/**
 * init/tty.ts — an ESCAPE SEQUENCE is one unit, never part of an answer (closure review
 * cross-diffusion:r5, S3). The raw-mode reader dropped only the ESC byte of a cursor key, so
 * "abc" + Left + Enter answered "abc[D" (and an SS3 key "abcOA"). Now the whole sequence — CSI
 * (ESC [ params intermediates final), SS3 (ESC O final), or ESC + one byte (Alt+key) — is
 * discarded, and a line control that arrives inside one (Enter, Ctrl-C) still acts.
 * Seam: TtyStreams (fake input/output), as init_tty.test.ts.
 */
import { describe, expect, test } from 'bun:test';
import type { TtyInput, TtyOutput } from '../src/provision/init/tty';
import { ttyPrompter } from '../src/provision/init/tty';

class FakeInput implements TtyInput {
	isTTY = true;
	private listener: ((chunk: Buffer | string) => void) | null = null;
	constructor(private readonly chunks: string[]) {}
	setRawMode(): void {}
	on(_event: 'data', listener: (chunk: Buffer | string) => void): void {
		this.listener = listener;
	}
	removeListener(): void {
		this.listener = null;
	}
	resume(): void {
		const chunks = this.chunks.splice(0);
		queueMicrotask(() => {
			for (const chunk of chunks) this.listener?.(Buffer.from(chunk));
		});
	}
	pause(): void {}
}

class FakeOutput implements TtyOutput {
	isTTY = true;
	text = '';
	write(chunk: string): void {
		this.text += chunk;
	}
}

function answer(...chunks: string[]) {
	const output = new FakeOutput();
	const prompter = ttyPrompter({ input: new FakeInput(chunks), output });
	return { output, value: prompter.visible('domain', null) };
}

describe('raw readLine: an escape sequence is discarded whole', () => {
	test('CSI cursor keys (Left, Up, Right, Delete, a parameterised one) leave the answer intact', async () => {
		expect(await answer('abc\x1b[D\r').value).toBe('abc');
		expect(await answer('a\x1b[Ab\x1b[Cc\r').value).toBe('abc');
		expect(await answer('abc\x1b[3~\r').value).toBe('abc');
		expect(await answer('ab\x1b[1;5Dc\r').value).toBe('abc');
	});

	test('SS3 keys and Alt+key are discarded too', async () => {
		expect(await answer('abc\x1bOA\r').value).toBe('abc');
		expect(await answer('ab\x1bxc\r').value).toBe('abc');
	});

	test('a sequence split across reads is still one unit', async () => {
		expect(await answer('abc\x1b', '[', 'D', '\r').value).toBe('abc');
	});

	test('nothing of the sequence is echoed', async () => {
		const t = answer('abc\x1b[D\r');
		await t.value;
		expect(t.output.text).not.toContain('[D');
	});

	test('a lone ESC then Enter still ends the line; Ctrl-C inside a sequence still aborts', async () => {
		expect(await answer('abc\x1b\r').value).toBe('abc');
		expect(await answer('abc\x1b[\r').value).toBe('abc');
		const aborted = answer('abc\x1b[\x03');
		expect(await aborted.value).toBeNull();
		expect(aborted.output.text).toContain('aborted by operator');
	});
});
