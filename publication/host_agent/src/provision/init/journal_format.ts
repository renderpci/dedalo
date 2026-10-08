/**
 * THE JOURNAL'S LINE FORMAT (spec §7) — one JSON object per line:
 *   {"v":1,"seq":N,"at":"<ISO>","run":"<16 hex>","item":"<id>","phase":"…","detail":{…}}
 *
 * THE DETAIL IS SECRET-FREE BY CONSTRUCTION, not by care: its keys are a CLOSED set, each with
 * the one value shape it may carry (paths, shas of non-secret files, exit codes, uids, modes,
 * module/unit/boolean names, fcontext specs, the source digest). A key outside the set, or a
 * value of another shape, is refused before a byte is appended. On top of that, a sha-shaped
 * value is refused in any record that names a secret-bearing file (v2.env, the v1 config, the
 * service token) or belongs to an `api_config.*` item: such files are journaled as
 * `{exists, uid, gid, mode}` only (spec §7, "Secret-bearing files").
 *
 * Decoding tolerates exactly one damage: a torn LAST line (the process died inside a write).
 * Any other unreadable line is a refusal — the journal is root's own file, so a corrupt middle
 * means someone else wrote it.
 *
 * PURE, ZERO-DEPENDENCY: node: builtins and the day-0 types only.
 */
import { basename } from 'node:path';
import type { JournalPhase, JournalRecord } from './types';
import { ITEM_ID_PATTERN } from './types';

export const JOURNAL_VERSION = 1;
export const JOURNAL_PHASES: readonly JournalPhase[] = Object.freeze(['begin', 'done', 'noop', 'failed', 'rolled_back', 'skipped']);
/** The phases that close a `begin`. */
export const TERMINAL_PHASES: readonly JournalPhase[] = Object.freeze(['done', 'noop', 'failed', 'rolled_back', 'skipped']);
export const RUN_ID_PATTERN = /^[0-9a-f]{16}$/;

/** The value shapes a detail key may carry. */
export type DetailShape =
  | 'path' //       one absolute path
  | 'paths' //      a list of absolute paths
  | 'sha' //        64 lowercase hex (a non-secret file's sha, the source digest)
  | 'int' //        a non-negative integer (exit codes, uids, gids, modes, counts)
  | 'ints' //       a list of them (vhost line numbers)
  | 'bool'
  | 'word' //       a name: account, group, unit, module, boolean, server, outcome…
  | 'words' //      a list of names
  | 'text' //       one of OUR OWN sentences (a refusal), never file content
  | 'previous' //   a boolean, null, or {uid, gid, mode} (what a change replaced)
  | 'specs'; //     fcontext rules [{spec, type}]

/** THE CLOSED SET of detail keys. Adding one is a deliberate edit of this table (and its test). */
export const DETAIL_KEYS: Readonly<Record<string, DetailShape>> = Object.freeze({
  path: 'path',
  target: 'path',
  realpath: 'path',
  backup: 'path',
  temp: 'path',
  src: 'path',
  dst: 'path',
  new: 'path',
  prev: 'path',
  archive: 'path',
  sums: 'path',
  include: 'path',
  temps: 'paths',
  seeded: 'paths',
  removed: 'paths',
  restored: 'paths',
  sha: 'sha',
  beforeSha: 'sha',
  afterSha: 'sha',
  digest: 'sha',
  sourceDigest: 'sha',
  exit: 'int',
  exit1: 'int',
  exit2: 'int',
  uid: 'int',
  gid: 'int',
  mode: 'int',
  lines: 'ints',
  exists: 'bool',
  value: 'bool',
  swapped: 'bool',
  resumed: 'bool',
  standalone: 'bool',
  hadPrevious: 'bool',
  name: 'word',
  group: 'word',
  owner: 'word',
  server: 'word',
  unit: 'word',
  kind: 'word',
  outcome: 'word',
  pin: 'word',
  asset: 'word',
  edit: 'word',
  transport: 'word',
  deploymentMode: 'word',
  instance: 'word',
  mods: 'words',
  modsEnabled: 'words',
  units: 'words',
  files: 'words',
  reason: 'text',
  previous: 'previous',
  remove: 'specs',
});

/** The detail keys whose value is a sha: refused in any record touching a secret-bearing file. */
const SHA_KEYS = Object.freeze(Object.keys(DETAIL_KEYS).filter(key => DETAIL_KEYS[key] === 'sha'));

/**
 * Basenames of the secret-bearing files init writes or reads (spec §5.8, §6 B4). Their temps
 * (`.<base>.dedalo-init.tmp`) are secret-bearing too.
 */
export const SECRET_FILE_BASENAMES: readonly string[] = Object.freeze(['v2.env', 'server_config_api.php', 'SERVICE_TOKEN']);

export function isSecretFile(path: string): boolean {
  const base = basename(path);
  return SECRET_FILE_BASENAMES.some(name => base === name || base === `.${name}.dedalo-init.tmp` || base.startsWith(`${name}.`));
}

export class JournalFormatError extends Error {
  constructor(message: string) {
    super(`journal: ${message}`);
    this.name = 'JournalFormatError';
  }
}

const PATH_VALUE = /^\/[^\0\n\r]{0,4095}$/;
const SHA_VALUE = /^[0-9a-f]{64}$/;
const WORD_VALUE = /^[A-Za-z0-9_.@:+=-]{1,128}$/;
const ISO_VALUE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const LIST_CAP = 256;
const TEXT_CAP = 300;

function isNonNegativeInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 0xffffffff;
}

function listOf(value: unknown, each: (entry: unknown) => boolean): boolean {
  return Array.isArray(value) && value.length <= LIST_CAP && value.every(each);
}

function isPath(value: unknown): boolean {
  return typeof value === 'string' && PATH_VALUE.test(value);
}

function isWord(value: unknown): boolean {
  return typeof value === 'string' && WORD_VALUE.test(value);
}

function isPrevious(value: unknown): boolean {
  if (value === null || typeof value === 'boolean') return true;
  if (typeof value !== 'object' || Array.isArray(value)) return false;
  const keys = Object.keys(value as object).sort();
  if (keys.join(',') !== 'gid,mode,uid') return false;
  const meta = value as Record<string, unknown>;
  return isNonNegativeInt(meta.uid) && isNonNegativeInt(meta.gid) && isNonNegativeInt(meta.mode);
}

function isSpecs(value: unknown): boolean {
  return listOf(value, entry => {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) return false;
    const keys = Object.keys(entry as object).sort();
    const rule = entry as Record<string, unknown>;
    return (
      keys.join(',') === 'spec,type' &&
      typeof rule.spec === 'string' &&
      /^\/[A-Za-z0-9._/\\()?*-]{0,1023}$/.test(rule.spec) &&
      typeof rule.type === 'string' &&
      /^[a-z0-9_]{1,64}$/.test(rule.type)
    );
  });
}

/** Our own sentence: printable, one line, short. Never a file's content. */
function isText(value: unknown): boolean {
  if (typeof value !== 'string' || value.length > TEXT_CAP) return false;
  for (const char of value) {
    const code = char.codePointAt(0) as number;
    if (code < 0x20 || code === 0x7f || (code >= 0x80 && code < 0xa0)) return false;
  }
  return true;
}

const SHAPE_CHECKS: Readonly<Record<DetailShape, (value: unknown) => boolean>> = {
  path: isPath,
  paths: value => listOf(value, isPath),
  sha: value => typeof value === 'string' && SHA_VALUE.test(value),
  int: isNonNegativeInt,
  ints: value => listOf(value, isNonNegativeInt),
  bool: value => typeof value === 'boolean',
  word: isWord,
  words: value => listOf(value, isWord),
  text: isText,
  previous: isPrevious,
  specs: isSpecs,
};

/** The record's paths, for the secret-file rule. */
function pathsOf(detail: Readonly<Record<string, unknown>>): string[] {
  const out: string[] = [];
  for (const [key, value] of Object.entries(detail)) {
    const shape = DETAIL_KEYS[key];
    if (shape === 'path' && typeof value === 'string') out.push(value);
    if (shape === 'paths' && Array.isArray(value)) out.push(...value.filter((v): v is string => typeof v === 'string'));
  }
  return out;
}

/** Throws the first reason a detail may not be journaled. The message names keys, never values. */
export function assertDetail(item: string, detail: Readonly<Record<string, unknown>>): void {
  if (detail === null || typeof detail !== 'object' || Array.isArray(detail)) {
    throw new JournalFormatError(`item '${item}': detail must be an object`);
  }
  for (const [key, value] of Object.entries(detail)) {
    const shape = DETAIL_KEYS[key];
    if (shape === undefined) throw new JournalFormatError(`item '${item}': detail key '${key}' is not journalable`);
    if (!SHAPE_CHECKS[shape](value)) {
      throw new JournalFormatError(`item '${item}': detail key '${key}' must be a ${shape} value`);
    }
  }
  const digested = SHA_KEYS.filter(key => key in detail);
  if (digested.length === 0) return;
  if (item.startsWith('api_config.')) {
    throw new JournalFormatError(`item '${item}': a secret-bearing item is journaled as metadata only, never digested (${digested.join(', ')})`);
  }
  const secret = pathsOf(detail).find(isSecretFile);
  if (secret !== undefined) {
    throw new JournalFormatError(
      `item '${item}': '${basename(secret)}' is secret-bearing; it is journaled as {exists, uid, gid, mode} only, never digested`,
    );
  }
}

export function assertRecord(record: JournalRecord): void {
  if (record.v !== JOURNAL_VERSION) throw new JournalFormatError(`version must be ${JOURNAL_VERSION}`);
  if (!Number.isInteger(record.seq) || record.seq < 1) throw new JournalFormatError('seq must be a positive integer');
  if (typeof record.at !== 'string' || !ISO_VALUE.test(record.at)) throw new JournalFormatError('at must be an ISO UTC timestamp');
  if (typeof record.run !== 'string' || !RUN_ID_PATTERN.test(record.run)) throw new JournalFormatError('run must be 16 hex');
  if (typeof record.item !== 'string' || !ITEM_ID_PATTERN.test(record.item) || record.item.length > 128) {
    throw new JournalFormatError(`item must match ${ITEM_ID_PATTERN.source}`);
  }
  if (!JOURNAL_PHASES.includes(record.phase)) throw new JournalFormatError(`phase '${String(record.phase)}' is not a journal phase`);
  assertDetail(record.item, record.detail);
}

/** One line, `\n`-terminated, keys in the spec's order. Throws when the record may not be journaled. */
export function encodeRecord(record: JournalRecord): string {
  assertRecord(record);
  const { v, seq, at, run, item, phase, detail } = record;
  return `${JSON.stringify({ v, seq, at, run, item, phase, detail })}\n`;
}

export interface DecodedJournal {
  readonly records: readonly JournalRecord[];
  /** The torn final line was dropped (the writer died mid-line). */
  readonly tornTail: boolean;
}

function decodeLine(line: string, number: number): JournalRecord {
  let raw: unknown;
  try {
    raw = JSON.parse(line);
  } catch {
    throw new JournalFormatError(`line ${number} is not JSON`);
  }
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) throw new JournalFormatError(`line ${number} is not an object`);
  const keys = Object.keys(raw as object).sort().join(',');
  if (keys !== 'at,detail,item,phase,run,seq,v') throw new JournalFormatError(`line ${number} has keys ${keys}`);
  const record = raw as JournalRecord;
  try {
    assertRecord(record);
  } catch (error) {
    throw new JournalFormatError(`line ${number}: ${(error as Error).message.replace(/^journal: /, '')}`);
  }
  return record;
}

/** The whole journal. Sequence numbers must strictly increase. */
export function decodeJournal(text: string): DecodedJournal {
  if (text === '') return { records: [], tornTail: false };
  const lines = text.split('\n');
  const last = lines.pop() as string;
  const tornTail = last !== '';
  const records: JournalRecord[] = [];
  lines.forEach((line, index) => {
    const record = decodeLine(line, index + 1);
    const previous = records[records.length - 1];
    if (previous !== undefined && record.seq <= previous.seq) {
      throw new JournalFormatError(`line ${index + 1}: seq ${record.seq} does not follow ${previous.seq}`);
    }
    records.push(record);
  });
  return { records, tornTail };
}

/**
 * The `begin` records nothing closed: per item, the last record is a `begin`. A later run's
 * terminal record closes an earlier run's begin (resume writes it under its own run id).
 */
export function unfinished(records: readonly JournalRecord[]): JournalRecord[] {
  const last = new Map<string, JournalRecord>();
  for (const record of records) last.set(record.item, record);
  return [...last.values()].filter(record => record.phase === 'begin').sort((a, b) => a.seq - b.seq);
}

/** The next sequence number after `records`. */
export function nextSeq(records: readonly JournalRecord[]): number {
  return records.reduce((max, record) => Math.max(max, record.seq), 0) + 1;
}
