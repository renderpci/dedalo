/**
 * THE AGENT'S COPY OF THE MEDIA FILENAME LAW — zero imports.
 *
 * Copied from src/core/media/protection.ts (MEDIA_FILENAME_GRAMMAR,
 * MEDIA_WORKING_FILE_EXTENSIONS, MEDIA_SCRIPT_DENY_PATTERN) and src/core/media/svg_safety.ts
 * (MEDIA_ACTIVE_DOCUMENT_EXTENSIONS) because the agent never imports the engine. The ROOT gate
 * test/unit/media_protection_tripwire.test.ts holds these constants equal to the engine's,
 * character for character, and runs classifyMediaPath over the same filename table the
 * generated Apache/nginx rules are checked against. Zero imports, so that gate loads this
 * module without the agent's configuration (and zod).
 *
 * WHAT THE AGENT CAN KNOW (spec §2.6, trust model): the ENGINE decides which files are
 * public (getPublicQualities → filterPublicQualities, which also knows install-renamed
 * master tiers the agent cannot learn). The agent checks SHAPE:
 *   - every purpose: at most MAX_MEDIA_PATH_BYTES, no control character, relative, no
 *     empty / `.` / `..` segment;
 *   - a PUT additionally: no hidden segment at all, ≥ type/quality/file (a bare type folder
 *     is the ancestor of its master dir — MEDIA-05), never under a segment equal to
 *     `original`/`modified` in any letter case, not a working file, an active document or a
 *     script (the hardening block 404s all three for everyone, in any letter case), and a
 *     basename the grammar parses (a file the gate can never serve is
 *     never copied);
 *   - a DELETE additionally: nothing under RESERVED_TOP_LEVEL (the marker store + the
 *     agent's copy state, and the instance marker). Hidden entries BELOW those stay
 *     deletable: the manifest reports them as `irregular`, and a stray the reconcile cannot
 *     remove would never converge.
 */

/** src/core/media/protection.ts MEDIA_FILENAME_GRAMMAR — the two captures are the record key. */
export const MEDIA_FILENAME_GRAMMAR =
  '[^/]*_([a-z0-9]+)_([0-9]+)(?:_lg-[a-zA-Z0-9-]{2,12})?\\.[A-Za-z0-9]+$';

/** src/core/media/protection.ts MEDIA_WORKING_FILE_EXTENSIONS — denied to everyone, any case. */
export const MEDIA_WORKING_FILE_EXTENSIONS = ['deleted', 'temp', 'tmp', 'import', 'csv'] as const;

/** src/core/media/svg_safety.ts MEDIA_ACTIVE_DOCUMENT_EXTENSIONS — denied, never quarantined. */
export const MEDIA_ACTIVE_DOCUMENT_EXTENSIONS = ['html', 'htm', 'xhtml', 'xht', 'shtml', 'swf', 'hta'] as const;

/** src/core/media/protection.ts MEDIA_SCRIPT_DENY_PATTERN (SEC-088) — never served, never executed. */
export const MEDIA_SCRIPT_DENY_PATTERN = 'phps?|phtml|phar|pht|cgi|pl|py|rb|sh|lua|asp|aspx|jsp';

/** The master tiers EVERY install has (protection.ts masterQualities' literals). */
export const ALWAYS_MASTER_TIERS = ['original', 'modified'] as const;

/** `pub/<key>` — the grammar's two captures joined, exactly what Rule B stats. */
export const MARKER_KEY = /^[a-z0-9]+_[0-9]+$/;

/**
 * The agent's own top-level entries of MEDIA_ROOT: never a media path, never in the
 * manifest, never deletable. `.publication` = markers + copy state (rule 0 keeps it
 * unserved); the second is src/instance/roots.ts INSTANCE_MARKER (restated because this
 * module is zero-import; tests/media_grammar.test.ts pins the equality).
 */
export const RESERVED_TOP_LEVEL = ['.publication', '.dedalo_host_agent_instance'] as const;

export const MAX_MEDIA_PATH_BYTES = 1024;

/** type/quality/file: the shallowest path a public quality can hold. */
export const MIN_PUT_SEGMENTS = 3;

/** The largest single media file a put accepts — also the Bun.serve body cap of a copy host (boot.ts). */
export const MAX_MEDIA_FILE_BYTES = 64 * 1024 ** 3;

export type MediaPathPurpose = 'put' | 'delete';

export type MediaPathRefusal =
  | 'too_long'
  | 'control_char'
  | 'not_relative'
  | 'empty_segment'
  | 'dot_segment'
  | 'hidden_segment'
  | 'reserved_segment'
  | 'too_shallow'
  | 'master_tier'
  | 'working_file'
  | 'denied_extension'
  | 'grammar'
  | 'escapes_root';

export type MediaPathVerdict =
  | { ok: true; path: string; key: string | null }
  | { ok: false; reason: MediaPathRefusal; detail: string };

const BASENAME_GRAMMAR = new RegExp(`^${MEDIA_FILENAME_GRAMMAR}`);
/** Everything the hardening block 404s besides working files: active documents + scripts. */
const DENIED_EXTENSION = new RegExp(
  `\\.(?:${MEDIA_ACTIVE_DOCUMENT_EXTENSIONS.join('|')}|${MEDIA_SCRIPT_DENY_PATTERN})$`,
  'i',
);
const CONTROL_CHAR = /[\u0000-\u001f\u007f]/;
const encoder = new TextEncoder();

function refuse(reason: MediaPathRefusal, detail: string): MediaPathVerdict {
  return { ok: false, reason, detail };
}

/** The record a media basename names (`{section_tipo}_{section_id}`), or null when it names none. */
export function markerKeyOf(basename: string): string | null {
  const match = BASENAME_GRAMMAR.exec(basename);
  return match === null ? null : `${match[1]}_${match[2]}`;
}

function segmentRefusal(segment: string, purpose: MediaPathPurpose): MediaPathVerdict | null {
  if (segment === '') return refuse('empty_segment', 'it has an empty segment');
  if (segment === '.' || segment === '..') return refuse('dot_segment', `it has a '${segment}' segment`);
  if (purpose === 'put' && segment.startsWith('.')) return refuse('hidden_segment', `'${segment}' is hidden`);
  return null;
}

function reservedRefusal(first: string): MediaPathVerdict | null {
  const reserved: readonly string[] = RESERVED_TOP_LEVEL;
  if (!reserved.includes(first)) return null;
  return refuse('reserved_segment', `'${first}' belongs to the agent and is never a media path`);
}

function shapeRefusal(path: string, purpose: MediaPathPurpose): MediaPathVerdict | null {
  if (encoder.encode(path).byteLength > MAX_MEDIA_PATH_BYTES) {
    return refuse('too_long', `it is longer than ${MAX_MEDIA_PATH_BYTES} bytes`);
  }
  if (CONTROL_CHAR.test(path)) return refuse('control_char', 'it contains a control character');
  if (path.startsWith('/')) return refuse('not_relative', 'it must be relative to the media root');
  const segments = path.split('/');
  for (const segment of segments) {
    const refusal = segmentRefusal(segment, purpose);
    if (refusal !== null) return refusal;
  }
  return reservedRefusal(segments[0] ?? '');
}

function isWorkingFile(basename: string): boolean {
  const dot = basename.lastIndexOf('.');
  const extension = dot === -1 ? '' : basename.slice(dot + 1).toLowerCase();
  return (MEDIA_WORKING_FILE_EXTENSIONS as readonly string[]).includes(extension);
}

function putRefusal(segments: string[]): MediaPathVerdict | null {
  if (segments.length < MIN_PUT_SEGMENTS) {
    return refuse('too_shallow', 'a put names <type>/<quality>/…/<file>');
  }
  const tiers: readonly string[] = ALWAYS_MASTER_TIERS;
  const master = segments.slice(0, -1).find(segment => tiers.includes(segment.toLowerCase()));
  if (master !== undefined) {
    return refuse('master_tier', `'${master}' is a master tier: masters never leave the work host`);
  }
  const basename = segments[segments.length - 1] ?? '';
  if (isWorkingFile(basename)) return refuse('working_file', `'${basename}' is a working file the gate never serves`);
  if (DENIED_EXTENSION.test(basename)) {
    return refuse('denied_extension', `'${basename}' is a script or active document the hardening never serves`);
  }
  if (markerKeyOf(basename) === null) return refuse('grammar', `'${basename}' names no record the gate can serve`);
  return null;
}

/** THE path check of every media command. Pure. */
export function classifyMediaPath(path: string, purpose: MediaPathPurpose): MediaPathVerdict {
  const shape = shapeRefusal(path, purpose);
  if (shape !== null) return shape;
  const segments = path.split('/');
  if (purpose === 'put') {
    const refusal = putRefusal(segments);
    if (refusal !== null) return refusal;
  }
  return { ok: true, path, key: markerKeyOf(segments[segments.length - 1] ?? '') };
}
