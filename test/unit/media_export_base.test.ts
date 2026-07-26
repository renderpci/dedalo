/**
 * DEDALO_MEDIA_EXPORT_BASE — the base of media URLs that LEAVE the application
 * (config.media.exportBase): export/relation-list cells and the URL handed to an
 * external transcriber.
 *
 * Renamed 2026-07-25 from DEDALO_MEDIA_BASE_URL (retired in env.ts's
 * RETIRED_ENV_KEYS, so the old spelling refuses the boot). The pair now names its
 * AUDIENCE — WEB_BASE = the client, EXPORT_BASE = what travels — because the two
 * carry the SAME kind of value (origin + `/dedalo/<mediaDir>`) and were told
 * apart by nothing but their spelling.
 *
 * Two invariants, both of which had already been violated in live code while the
 * name was ambiguous:
 *   - the value is prefixed to the media-root relative file_path UNCHANGED, so a
 *     trailing slash must be stripped (it emitted `…/media//image/…`), and no
 *     consumer may re-append `/dedalo/<mediaDir>` (tool_transcription did, so the
 *     one value that worked there broke the export cells and vice versa);
 *   - unset stays undefined — a travelling cell is reported unresolved, never
 *     guessed. That is the difference from webBase, which has a relative default.
 *
 * `config` freezes at first import, so every env case boots a subprocess.
 */

import { describe, expect, test } from 'bun:test';

const ROOT = `${import.meta.dir}/../..`;
const READ_EXPORT_BASE =
	'const { config } = await import("./src/config/config.ts");' +
	'console.log(JSON.stringify(config.media.exportBase ?? null));';

/** Boot config in a child with the export base overlaid, and read it back. */
function exportBaseWith(value: string): string | null {
	const probe = Bun.spawnSync(['bun', '-e', READ_EXPORT_BASE], {
		cwd: ROOT,
		env: { ...process.env, DEDALO_MEDIA_EXPORT_BASE: value },
	});
	return JSON.parse((probe.stdout.toString().trim().split('\n').pop() ?? 'null').trim());
}

describe('media export base (DEDALO_MEDIA_EXPORT_BASE)', () => {
	test('a trailing slash is stripped, exactly like webBase', () => {
		expect(exportBaseWith('http://localhost:8080/dedalo/media/')).toBe(
			'http://localhost:8080/dedalo/media',
		);
		// Several, too — the base is concatenated with a '/'-rooted path.
		expect(exportBaseWith('http://localhost:8080/dedalo/media///')).toBe(
			'http://localhost:8080/dedalo/media',
		);
	});

	test('a clean absolute value passes through untouched', () => {
		expect(exportBaseWith('https://my_institution.org/dedalo/media')).toBe(
			'https://my_institution.org/dedalo/media',
		);
	});

	test('unset is undefined — unresolved, never a guessed origin', () => {
		expect(exportBaseWith('')).toBe(null);
	});
});
