/**
 * THE CONSOLE WHILE THE FULL-SCREEN UI IS UP (terminal installer phase 3,
 * 2026-10-12) — every console method an engine module can print through
 * (log, info, debug, trace, warn, error — errors/log.ts uses info) goes to a
 * bounded ring of SANITIZED lines (the Install screen's `l` log), never onto
 * the alternate screen. Installed when the UI opens, so the executor's own
 * redaction (executor.ts redactConsole) wraps THIS capture: its lines are
 * redacted before they reach the ring.
 */

import { sanitizeLine } from '../display_text.ts';

/** The console methods captured. */
const METHODS = ['log', 'info', 'debug', 'trace', 'warn', 'error'] as const;

/** The ring's size (the newest lines are kept). */
export const LOG_RING_SIZE = 500;

export interface LogRing {
	push(text: string): void;
	lines(): readonly string[];
}

export function logRing(size = LOG_RING_SIZE): LogRing {
	const kept: string[] = [];
	return {
		push: (text: string) => {
			for (const line of text.split('\n')) kept.push(sanitizeLine(line));
			if (kept.length > size) kept.splice(0, kept.length - size);
		},
		lines: () => kept,
	};
}

/** One console argument as text (an Error: its message — the stack is no use on a screen). */
function argText(arg: unknown): string {
	if (typeof arg === 'string') return arg;
	if (arg instanceof Error) return `${arg.name}: ${arg.message}`;
	try {
		return JSON.stringify(arg) ?? String(arg);
	} catch {
		return String(arg);
	}
}

/** Route the console into `ring`; answers the function that puts the console back. */
export function captureConsole(ring: LogRing): () => void {
	const original = Object.fromEntries(METHODS.map((method) => [method, console[method]])) as Record<
		(typeof METHODS)[number],
		(...args: unknown[]) => void
	>;
	for (const method of METHODS) {
		console[method] = (...args: unknown[]) => ring.push(args.map(argText).join(' '));
	}
	return () => {
		for (const method of METHODS) console[method] = original[method];
	};
}
