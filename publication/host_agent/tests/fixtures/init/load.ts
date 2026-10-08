/**
 * The discovery fixtures (spec §3.2): `captured/<case>/` holds real output from the
 * distributions' own packages (container captures, case.json `typed: false` with its limits),
 * `typed/<topic>/` output typed from the documented formats where no capture is possible yet
 * (an SELinux kernel, a hardened mount table, a unit sandbox) — case.json `typed: true`. The EL
 * drill replaces every typed EL fixture with a capture (spec §9).
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const FIXTURES = join(import.meta.dir);

/** A fixture's text, relative to tests/fixtures/init. */
export function fixture(relative: string): string {
  return readFileSync(join(FIXTURES, relative), 'utf8');
}

/** Every case directory (`captured/<case>`, `typed/<topic>`). */
export function caseDirs(): string[] {
  return ['captured', 'typed'].flatMap(kind =>
    readdirSync(join(FIXTURES, kind), { withFileTypes: true })
      .filter(entry => entry.isDirectory())
      .map(entry => `${kind}/${entry.name}`),
  );
}

export interface CaseJson {
  readonly typed: boolean;
  readonly captured?: string;
  readonly limits?: string;
  readonly source?: string;
  readonly replace?: string;
}

export function caseJson(dir: string): CaseJson {
  return JSON.parse(fixture(join(dir, 'case.json'))) as CaseJson;
}
