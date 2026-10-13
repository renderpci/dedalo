/**
 * THE TERMINAL'S LIFECYCLE UNDER THE FULL-SCREEN UI (terminal installer phase
 * 3, 2026-10-12) — every way the process can end puts the terminal back:
 *
 *  - a chosen end (quit, Done, a refusal): `close` destroys the renderer,
 *    AWAITS its restore (`renderer.closed`), prints the exit notice on the
 *    main screen, exits with the code;
 *  - a synchronous end (scripts/install.ts `fail`, an uncaught error):
 *    `exitNow` destroys and exits at once — the renderer's own exit handler
 *    (registered when it was created, so it runs FIRST) restores the
 *    terminal, then OUR exit hook (registered after it) prints the notice;
 *  - SIGINT / SIGTERM / Ctrl-C on the Done card: the card's own end (its
 *    lines, already queued, and the run's exit code — a finished run never
 *    reports 130);
 *  - SIGINT / SIGTERM: while the walk runs, the pending question ends as
 *    `interrupted` (the session unwinds, exit 130) or the UI closes (143);
 *    while the EXECUTOR's own handlers are armed (it records the step failed
 *    and exits 130/143 itself) this lifecycle does nothing — the exit hook
 *    restores and replays the executor's interrupt lines; in the gaps around
 *    the executor (preparing, finishing) it closes the UI with 130/143;
 *  - an uncaught exception or rejection: restore, the sanitized message, 1.
 *
 * The process is INJECTED (ProcessPort): openTui passes the real one; a gate
 * passes a fake, so a test never installs a handler that exits the test
 * runner. Only the PTY fixture exercises the real process.
 */

import { firstLine, sanitizeLine } from '../display_text.ts';

/** The process as the lifecycle uses it (the real `process`'s shape). */
export interface ProcessPort {
	readonly pid: number;
	on(event: string, listener: (...args: never[]) => void): unknown;
	off(event: string, listener: (...args: never[]) => void): unknown;
	exit(code: number): never;
	kill(pid: number, signal: string): unknown;
	/** stderr, synchronously (the exit notice is written inside the `exit` event). */
	writeErr(text: string): void;
	/** stdin's raw mode off (a last resort when the renderer did not restore). */
	cookStdin(): void;
}

/** What the lifecycle needs from the UI. */
export interface LifecycleHost {
	/** The renderer is gone (destroyed, restore started). */
	isDestroyed(): boolean;
	destroy(): void;
	/** Resolves when the renderer's terminal restore is complete. */
	closed(): Promise<void>;
	/** SIGINT/SIGTERM or Ctrl-C while the walk runs: end the pending question; false = none pending. */
	cancelAsk(): boolean;
}

export type Phase = 'walk' | 'run' | 'final';

export interface Lifecycle {
	phase(next?: Phase): Phase;
	/**
	 * The Done card is up: the outcome is decided. Its lines are queued for the
	 * main screen NOW and its code is the exit code of every way out (a key,
	 * Ctrl-C, SIGINT, SIGTERM) — a signal only dismisses a finished run.
	 */
	final(code: number, lines: readonly string[]): void;
	/** The executor's signal handlers are armed (RunIo.signals). */
	armed(value: boolean): void;
	/** Ctrl-C typed (raw mode: no SIGINT reaches the process by itself). */
	ctrlC(): void;
	/** Lines printed on the main screen after the restore. */
	notice(lines: readonly string[]): void;
	close(code: number, lines?: readonly string[]): Promise<never>;
	exitNow(code: number, lines?: readonly string[]): never;
	/** Run when the UI ends (kill the probe children). */
	onClose(hook: () => void): void;
	/** The handlers off (a gate's teardown — never exits). */
	dispose(): void;
}

const RESTORE_WAIT_MS = 2000;

export function lifecycle(port: ProcessPort, host: LifecycleHost): Lifecycle {
	let phase: Phase = 'walk';
	let armed = false;
	let closing = false;
	let finalCode: number | null = null;
	const notices: string[] = [];
	const hooks: (() => void)[] = [];
	const flush = (): void => {
		for (const line of notices.splice(0)) port.writeErr(`${line}\n`);
	};
	const endHooks = (): void => {
		for (const hook of hooks.splice(0)) {
			try {
				hook();
			} catch {
				// a cleanup hook never blocks the exit
			}
		}
	};
	const exitNow = (code: number, lines: readonly string[] = []): never => {
		notices.push(...lines.map(sanitizeLine));
		endHooks();
		if (!host.isDestroyed()) host.destroy();
		return port.exit(code);
	};
	const close = async (code: number, lines: readonly string[] = []): Promise<never> => {
		if (closing) return new Promise<never>(() => undefined);
		closing = true;
		notices.push(...lines.map(sanitizeLine));
		endHooks();
		if (!host.isDestroyed()) host.destroy();
		await Promise.race([host.closed(), Bun.sleep(RESTORE_WAIT_MS)]);
		flush();
		return port.exit(code);
	};
	/** A signal the UI does not close on: the executor's (armed), or the pending question's. */
	const handledElsewhere = (code: 130 | 143): boolean =>
		(phase === 'run' && armed) || (phase === 'walk' && code === 130 && host.cancelAsk());
	/** A signal: on the Done card the card's own end; else handled elsewhere; else close. */
	const signal = (code: 130 | 143) => (): void => {
		if (phase === 'final' && finalCode !== null) void close(finalCode);
		else if (!handledElsewhere(code)) void close(code);
	};
	const onSigint = signal(130);
	const onSigterm = signal(143);
	const onExit = (): void => {
		if (!host.isDestroyed()) host.destroy();
		port.cookStdin();
		flush();
	};
	const onFatal = (error: unknown): void => {
		const message = error instanceof Error ? error.message : String(error);
		exitNow(1, [`✖ install failed: ${firstLine(message)}`]);
	};
	port.on('SIGINT', onSigint);
	port.on('SIGTERM', onSigterm);
	port.on('exit', onExit);
	port.on('uncaughtException', onFatal);
	port.on('unhandledRejection', onFatal);
	return {
		phase: (next?: Phase) => {
			if (next !== undefined) phase = next;
			return phase;
		},
		final: (code: number, lines: readonly string[]) => {
			phase = 'final';
			finalCode = code;
			notices.push(...lines.map(sanitizeLine));
		},
		armed: (value: boolean) => {
			armed = value;
		},
		ctrlC: () => {
			if (phase === 'run' && armed) {
				port.kill(port.pid, 'SIGINT');
				return;
			}
			onSigint();
		},
		notice: (lines: readonly string[]) => {
			notices.push(...lines.map(sanitizeLine));
		},
		close,
		exitNow,
		onClose: (hook: () => void) => {
			hooks.push(hook);
		},
		dispose: () => {
			port.off('SIGINT', onSigint);
			port.off('SIGTERM', onSigterm);
			port.off('exit', onExit);
			port.off('uncaughtException', onFatal);
			port.off('unhandledRejection', onFatal);
		},
	};
}
