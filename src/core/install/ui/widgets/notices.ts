/**
 * THE MODEL'S NOTICES, DRAWN (terminal installer phase 3, 2026-10-12) — a
 * screen's notices by level (info muted, warn, error), its manual step (a
 * phase-4 placeholder), its help links, and the lines the session SAID
 * (`checking: …`, a refusal, a kept secret) by what they start with. Every
 * text sanitized (wrapped() does it).
 */

import type { Notice, Screen } from '../../screen_model.ts';
import type { Role } from '../palette.ts';
import { type Line, seg } from '../styled.ts';
import { wrapped } from './field_parts.ts';

const LEVEL_ROLE: Readonly<Record<Notice['level'], Role>> = Object.freeze({
	info: 'muted',
	warn: 'warn',
	error: 'err',
});

const LEVEL_MARK: Readonly<Record<Notice['level'], string>> = Object.freeze({
	info: '',
	warn: '! ',
	error: '✗ ',
});

export function noticeLines(notices: readonly Notice[], width: number): Line[] {
	return notices.flatMap((notice) =>
		wrapped(`${LEVEL_MARK[notice.level]}${notice.text}`, width, LEVEL_ROLE[notice.level]),
	);
}

/** The manual step of a placeholder screen, and the help links. */
export function screenExtras(screen: Screen, width: number): Line[] {
	const manual =
		screen.placeholder === undefined
			? []
			: wrapped(`manual step: ${screen.placeholder.manual}`, width, 'warn');
	const help = screen.help.flatMap((link) => wrapped(`${link.label} — ${link.url}`, width, 'info'));
	return [...manual, ...help];
}

/** What a said line is, by its start. */
function saidRole(line: string): Role {
	if (/^\s*(error|Check failed|✖)/i.test(line)) return 'err';
	if (/^\s*(warn|!|⚠)/i.test(line)) return 'warn';
	if (/^\s*(checking|reading)/i.test(line)) return 'accent';
	return /^Check passed/.test(line) ? 'ok' : 'muted';
}

/** The session's said lines (a running check gets the spinner mark). */
export function saidLines(said: readonly string[], width: number): Line[] {
	return said.flatMap((line) => {
		const role = saidRole(line);
		return wrapped(`${role === 'accent' ? '◐ ' : ''}${line}`, width, role);
	});
}

export const BLANK: Line = [seg('')];
