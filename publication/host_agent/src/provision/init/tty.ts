/**
 * THE OPERATOR'S TERMINAL (spec §1.2 TTY) — init's only way to ask.
 *
 *   - Interactive means stdin AND stdout are TTYs. Otherwise every question answers `null` (the
 *     caller turns that into "not a terminal: re-run with --yes / --decide …" or a REFUSED secret).
 *   - Everything is read in RAW mode, one character at a time: visible answers are echoed by this
 *     module, hidden ones never are. Backspace edits, Enter ends, Ctrl-C / Ctrl-D abort (null:
 *     "aborted by operator; nothing was written for this item"). Raw mode is restored in `finally`
 *     and on SIGINT (a signal sent from outside while a question is open).
 *   - A secret is asked twice and must match; three mismatches abort.
 *   - A decision shows its options; the default is shown but must be TYPED (an empty answer asks
 *     again): init never takes a default on the operator's behalf.
 *   - Prompts are our own sentences; an item's title and option labels pass sanitizeLine.
 *
 * `scriptedPrompter(answers)` is the same contract with answers given in advance (init_run's
 * gates, and any future non-TTY front end that already holds the operator's answers).
 *
 * I/O: the streams are injected (production: process.stdin/stdout); nothing else is touched.
 */
import { sanitizeLine } from './report';
import type { Item, Prompter } from './types';

/** The input side of a terminal (process.stdin's shape). */
export interface TtyInput {
  readonly isTTY?: boolean;
  setRawMode?(mode: boolean): unknown;
  on(event: 'data', listener: (chunk: Buffer | string) => void): unknown;
  removeListener(event: 'data', listener: (chunk: Buffer | string) => void): unknown;
  resume(): unknown;
  pause(): unknown;
}

/** The output side (process.stdout's shape). */
export interface TtyOutput {
  readonly isTTY?: boolean;
  write(text: string): unknown;
}

/** Signal registration (process's shape); a gate passes a fake to deliver SIGINT. */
export interface TtySignals {
  on(signal: 'SIGINT', listener: () => void): unknown;
  removeListener(signal: 'SIGINT', listener: () => void): unknown;
}

export interface TtyStreams {
  readonly input: TtyInput;
  readonly output: TtyOutput;
  readonly signals?: TtySignals;
}

const CTRL_C = '\x03';
const CTRL_D = '\x04';
const BACKSPACE = new Set(['\x7f', '\b']);
const ENTER = new Set(['\r', '\n']);
/** Secrets: how many times a mismatching pair is asked again before the item is aborted. */
export const SECRET_ATTEMPTS = 3;

/** Thrown inside the reader when the operator aborts; becomes `null` at the API. */
class Aborted extends Error {}

/**
 * One raw-mode session: characters arrive through the `data` listener into a queue; `nextChar`
 * awaits the next one. Raw mode is on only while a question is open.
 */
class RawReader {
  private readonly queue: string[] = [];
  private waiter: ((char: string) => void) | null = null;
  private readonly onData = (chunk: Buffer | string): void => {
    for (const char of typeof chunk === 'string' ? chunk : chunk.toString('utf8')) {
      if (this.waiter !== null) {
        const resolve = this.waiter;
        this.waiter = null;
        resolve(char);
      } else this.queue.push(char);
    }
  };
  private readonly onSignal = (): void => {
    this.restore();
    if (this.waiter !== null) {
      const resolve = this.waiter;
      this.waiter = null;
      resolve(CTRL_C);
    } else this.queue.unshift(CTRL_C);
  };
  private raw = false;

  constructor(private readonly streams: TtyStreams) {}

  open(): void {
    this.streams.input.setRawMode?.(true);
    this.raw = true;
    this.streams.input.on('data', this.onData);
    this.streams.signals?.on('SIGINT', this.onSignal);
    this.streams.input.resume();
  }

  restore(): void {
    if (this.raw) {
      this.streams.input.setRawMode?.(false);
      this.raw = false;
    }
  }

  close(): void {
    this.restore();
    this.streams.input.removeListener('data', this.onData);
    this.streams.signals?.removeListener('SIGINT', this.onSignal);
    this.streams.input.pause();
  }

  nextChar(): Promise<string> {
    const queued = this.queue.shift();
    if (queued !== undefined) return Promise.resolve(queued);
    return new Promise(resolve => {
      this.waiter = resolve;
    });
  }
}

/** Reads one line in raw mode. `echo`: print what is typed (visible) or nothing (hidden). */
async function readLine(reader: RawReader, output: TtyOutput, echo: boolean): Promise<string> {
  let text = '';
  for (;;) {
    const char = await reader.nextChar();
    if (char === CTRL_C || char === CTRL_D) {
      output.write('\n');
      throw new Aborted();
    }
    if (ENTER.has(char)) {
      output.write('\n');
      return text;
    }
    if (BACKSPACE.has(char)) {
      if (text.length > 0) {
        text = text.slice(0, -1);
        if (echo) output.write('\b \b');
      }
      continue;
    }
    // Any other control character (an arrow key's ESC sequence, a tab) is not part of an answer.
    if (char < ' ' || char === '\x7f') continue;
    text += char;
    if (echo) output.write(char);
  }
}

/** The production prompter on process.stdin/stdout. */
export function ttyPrompter(streams: TtyStreams = { input: process.stdin, output: process.stdout, signals: process }): Prompter {
  const interactive = streams.input.isTTY === true && streams.output.isTTY === true && typeof streams.input.setRawMode === 'function';
  const ask = async <T>(body: (reader: RawReader) => Promise<T>): Promise<T | null> => {
    if (!interactive) return null;
    const reader = new RawReader(streams);
    reader.open();
    try {
      return await body(reader);
    } catch (error) {
      if (error instanceof Aborted) {
        streams.output.write('aborted by operator; nothing was written for this item\n');
        return null;
      }
      throw error;
    } finally {
      reader.close();
    }
  };
  const write = (text: string) => streams.output.write(sanitizeLine(text));
  return {
    interactive,
    showOnce: lines => {
      if (!interactive) return;
      for (const line of lines) write(`${line}\n`);
    },
    confirm: async question => {
      const answer = await ask(async reader => {
        write(`${question} [y/N] `);
        return readLine(reader, streams.output, true);
      });
      return answer !== null && /^(y|yes)$/i.test(answer.trim());
    },
    choose: (item: Item) =>
      ask(async reader => {
        const options = item.options ?? [];
        write(`[${item.id}] ${item.title}\n`);
        for (const option of options) {
          write(`  ${option.id}: ${option.label}${option.id === item.defaultOption ? ' (default)' : ''}\n`);
        }
        const ids = options.map(option => option.id);
        for (;;) {
          write(`choose ${ids.join(' | ')}${item.defaultOption === undefined ? '' : ` (default ${item.defaultOption} — type it)`}: `);
          const answer = (await readLine(reader, streams.output, true)).trim();
          if (ids.includes(answer)) return answer;
          write(answer === '' ? 'the default is shown, never taken: type an option\n' : `'${answer}' is not one of ${ids.join(', ')}\n`);
        }
      }),
    visible: (label, defaultValue) =>
      ask(async reader => {
        write(`${label}${defaultValue === null ? '' : ` [${defaultValue}]`}: `);
        const answer = (await readLine(reader, streams.output, true)).trim();
        return answer === '' && defaultValue !== null ? defaultValue : answer;
      }),
    secret: label =>
      ask(async reader => {
        for (let attempt = 1; attempt <= SECRET_ATTEMPTS; attempt += 1) {
          write(`${label} (hidden): `);
          const first = await readLine(reader, streams.output, false);
          write(`${label} again: `);
          const second = await readLine(reader, streams.output, false);
          if (first === second) return first;
          write('the two entries differ; type it again\n');
        }
        write(`the entries did not match ${SECRET_ATTEMPTS} times; aborted\n`);
        throw new Aborted();
      }),
  };
}

/* ── scripted ─────────────────────────────────────────────────────────────────────── */

export interface ScriptedAnswers {
  /** The confirmation's answer ("Apply these N changes?"); default false. */
  readonly confirm?: boolean;
  /** Decision id → option id. A decision not listed is aborted (null). */
  readonly choices?: Readonly<Record<string, string>>;
  /** Visible prompt label → value; a label not listed takes the default, or aborts without one. */
  readonly visible?: Readonly<Record<string, string>>;
  /** Hidden prompt label → value; a label not listed aborts. */
  readonly secrets?: Readonly<Record<string, string>>;
  /** Whether the scripted terminal counts as interactive (default true). */
  readonly interactive?: boolean;
}

/** A prompter that answers from `answers`, recording every question it was asked. */
export function scriptedPrompter(answers: ScriptedAnswers = {}): Prompter & { readonly asked: string[]; readonly shown: string[] } {
  const asked: string[] = [];
  const shown: string[] = [];
  const interactive = answers.interactive ?? true;
  return {
    asked,
    shown,
    interactive,
    showOnce: lines => {
      if (interactive) shown.push(...lines);
    },
    confirm: async question => {
      asked.push(`confirm ${question}`);
      return interactive && answers.confirm === true;
    },
    choose: async item => {
      asked.push(`choose ${item.id}`);
      if (!interactive) return null;
      return answers.choices?.[item.id] ?? null;
    },
    visible: async (label, defaultValue) => {
      asked.push(`visible ${label}`);
      if (!interactive) return null;
      return answers.visible?.[label] ?? defaultValue;
    },
    secret: async label => {
      asked.push(`secret ${label}`);
      if (!interactive) return null;
      return answers.secrets?.[label] ?? null;
    },
  };
}
