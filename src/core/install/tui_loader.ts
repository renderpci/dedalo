/**
 * THE FULL-SCREEN UI'S DOOR (terminal installer phase 3, 2026-10-12) — the
 * ONE place that loads it: a dynamic import of ui/app.ts (OpenTUI, a native
 * library per platform) and the renderer's creation, in ONE try — a missing
 * native package only throws when the renderer is created, not at import. On
 * any failure the caller falls back to the plain mode with one line saying why
 * (scripts/install.ts); the UI itself guarantees no renderer is left holding
 * the terminal (ui/app.ts openTui destroys and awaits it before rethrowing).
 *
 * The specifier is a relative LITERAL so the import-closure walker sees the
 * edge (opentui_confinement_tripwire: reachable from scripts/install.ts only
 * through this dynamic import, never from the server).
 */

import { firstLine } from './display_text.ts';
import type { InstallPrompter } from './prompter_contract.ts';
import type { RunReporter } from './run_events.ts';

/** The terminal the UI draws on (process.stdin / process.stdout's shape). */
export interface TuiOptions {
	stdin: NodeJS.ReadStream;
	stdout: NodeJS.WriteStream;
	noColor: boolean;
	version: string;
}

/** A read-only description of the pending ask (the gates' key driver reads it). */
export interface PendingView {
	id: string;
	kind: string;
	options?: readonly string[];
	selected?: readonly string[];
	cursor?: number;
	filter?: string;
	value?: string;
	phase?: string;
}

/** What the open UI offers scripts/install.ts. */
export interface TuiFrontEnd {
	prompter: InstallPrompter & { pending(): PendingView | null };
	reporter: RunReporter;
	/** Put the terminal back now (idempotent) — before a synchronous exit. */
	restoreSync(): void;
	/** End now: restore, exit `code`; `lines` are printed on the main screen after the restore. */
	exitNow(code: number, lines?: readonly string[]): never;
	/** End after the restore completed. */
	close(code: number, lines?: readonly string[]): Promise<never>;
	/** The answers were written from the Review: the Done card (trial: its warning), a key, exit 0. */
	written(path: string): Promise<never>;
	/** Run when the UI ends (the probe children are killed there). */
	onClose(hook: () => void): void;
}

export type FullScreen = { kind: 'tui'; front: TuiFrontEnd } | { kind: 'plain'; reason: string };

type UiModule = { openTui(options: TuiOptions): Promise<TuiFrontEnd> };

/** Open the full-screen UI, or say why it cannot be (never throws). */
export async function openFullScreen(
	options: TuiOptions,
	load: () => Promise<UiModule> = () => import('./ui/app.ts'),
): Promise<FullScreen> {
	try {
		const ui = await load();
		return { kind: 'tui', front: await ui.openTui(options) };
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return { kind: 'plain', reason: firstLine(message) || 'the full-screen UI could not start' };
	}
}
