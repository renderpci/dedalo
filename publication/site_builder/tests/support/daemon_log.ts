/**
 * THE DAEMON'S LOG, as a gate reads it. Since WIRE-MAP's stream door an error EVENT carries a
 * reason and no sentence (`src/drivers/turn_errors.ts`): the refusal's detail — the key an
 * operator must set, the path that was refused — is a `console.error` line of the daemon. A gate
 * that asserts WHICH refusal happened reads the reason off the event and the detail off this log.
 */

import { spyOn } from 'bun:test';

/** Run `fn` with `console.error` captured (and still written); the lines it logged, joined. */
export async function withDaemonLog<T>(fn: () => Promise<T>): Promise<{ readonly value: T; readonly log: string }> {
  const lines: string[] = [];
  const original = console.error;
  const spy = spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    lines.push(args.map(arg => (arg instanceof Error ? arg.message : String(arg))).join(' '));
    original.apply(console, args as []);
  });
  try {
    const value = await fn();
    return { value, log: lines.join('\n') };
  } finally {
    spy.mockRestore();
  }
}
