/**
 * THE JOURNAL (spec §7) — `<INIT_BASE>/<instance>/journal.jsonl`, root 0600 (MODES.journal):
 * every action records `begin` before it acts and one terminal record (`done`, `noop`, `failed`,
 * `rolled_back`, `skipped`) after. Appends go through InitIo.appendSync (O_APPEND|O_NOFOLLOW +
 * fsync; the directory fsynced when the file is created), so a record either is on disk whole
 * or is the torn last line journal_format.ts drops.
 *
 * Correctness never depends on the journal: every run re-discovers and re-compares. It serves
 * `--resume` (the `begin` records nothing closed — `unfinished()`) and the operator's record of
 * what was done. Its line format and the CLOSED, secret-free detail grammar are
 * journal_format.ts's: this module cannot write a key that grammar does not admit.
 *
 * `--dry-run` never opens it (spec §1.2: writes nothing, the journal included).
 */
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { MODES } from '../layout';
import { decodeJournal, encodeRecord, nextSeq, unfinished as unfinishedOf } from './journal_format';
import type { InitIo, JournalPhase, JournalRecord } from './types';

export const JOURNAL_NAME = 'journal.jsonl';

export interface Journal {
  readonly path: string;
  /** This run's id (16 hex). */
  readonly run: string;
  /** Every record, the ones this run appended included. */
  records(): readonly JournalRecord[];
  /** `begin` records nothing closed, oldest first (before this run appended anything: `openUnfinished`). */
  unfinished(): readonly JournalRecord[];
  /** The unfinished begins as they were when the journal was opened. */
  readonly openUnfinished: readonly JournalRecord[];
  /** The previous run left a torn last line (it died mid-write). */
  readonly tornTail: boolean;
  append(item: string, phase: JournalPhase, detail?: Readonly<Record<string, unknown>>): JournalRecord;
  /** The seq the next append will get (act names backups `<seq>-<basename>` with it). */
  peekSeq(): number;
}

export interface JournalOptions {
  readonly now?: () => Date;
  /** The run id (tests); default 8 random bytes as hex. */
  readonly run?: string;
  /** The journal's owner: root (0:0) in production; the test's own ids on a scratch base. */
  readonly uid?: number;
  readonly gid?: number;
}

export function newRunId(): string {
  return randomBytes(8).toString('hex');
}

/**
 * Opens (reading what is there) the journal in `dir` (`<INIT_BASE>/<instance>`, which the
 * instance lock already proved root's). Throws when the existing journal is not one this
 * format wrote — a corrupt middle line means someone else wrote root's file.
 */
export function openJournal(dir: string, io: InitIo, options: JournalOptions = {}): Journal {
  const path = join(dir, JOURNAL_NAME);
  const now = options.now ?? (() => new Date());
  const run = options.run ?? newRunId();
  const existing = io.readRootFile(path);
  const decoded = decodeJournal(existing ?? '');
  const records: JournalRecord[] = [...decoded.records];
  let seq = nextSeq(records);
  const uid = options.uid ?? 0;
  const gid = options.gid ?? 0;
  let metaAsserted = existing !== null;
  let torn = decoded.tornTail;
  const openUnfinished = Object.freeze(unfinishedOf(records));
  return {
    path,
    run,
    openUnfinished,
    tornTail: decoded.tornTail,
    records: () => Object.freeze([...records]),
    unfinished: () => Object.freeze(unfinishedOf(records)),
    peekSeq: () => seq,
    append(item: string, phase: JournalPhase, detail: Readonly<Record<string, unknown>> = {}): JournalRecord {
      const record: JournalRecord = Object.freeze({ v: 1, seq, at: now().toISOString(), run, item, phase, detail: Object.freeze({ ...detail }) });
      const line = encodeRecord(record);
      if (torn) {
        // The previous run died mid-line: the file is rewritten whole (atomically) without the
        // torn tail, so no reader ever meets a broken line in the middle.
        const body = [...records.map(encodeRecord), line].join('');
        io.writeBytesAtomic(path, new TextEncoder().encode(body), MODES.journal.mode, uid, gid);
        torn = false;
        metaAsserted = true;
      } else {
        io.appendSync(path, line);
      }
      if (!metaAsserted) {
        // appendSync creates 0600 (umask can only narrow it); the row's owner and mode are re-asserted once.
        io.chown(path, uid, gid);
        io.chmod(path, MODES.journal.mode);
        metaAsserted = true;
      }
      records.push(record);
      seq += 1;
      return record;
    },
  };
}
