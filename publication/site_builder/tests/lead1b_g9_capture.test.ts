/**
 * G9's HONEST LIMIT, ratcheted. The conformance comparator's conforming rows are driven by a
 * SYNTHETIC `systemctl show` (support/lead1b_host.ts `conformingShow`) until the probe's P7
 * capture on a real systemd 255 host is committed as `tests/fixtures/systemd_show_255.txt`.
 *
 * While the capture is absent, the limit must be STATED — as residual 9 of
 * engineering/SITE_BUILDER_INSTANCES.md §10 and beside the fixture — so no reader takes G9 as
 * closed. The day the capture lands, this gate reds until the statements go and the conforming
 * row is driven from the capture: a closed limit left documented as open is drift too.
 */

import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const PACKAGE = join(import.meta.dir, '..');
const CAPTURE = join(PACKAGE, 'tests', 'fixtures', 'systemd_show_255.txt');
const INSTANCES_DOC = join(PACKAGE, '..', '..', 'engineering', 'SITE_BUILDER_INSTANCES.md');
const FIXTURE_SOURCE = join(PACKAGE, 'tests', 'support', 'lead1b_host.ts');

describe('G9 — the synthetic-show limit is stated exactly while the real capture is absent', () => {
  test('capture absent ⇔ residual 9 and the fixture’s honest-limit paragraph are present', () => {
    const captured = existsSync(CAPTURE);
    const residual = /\*\*9\. The conformance comparator's passing row is driven by a SYNTHETIC `systemctl show`\.\*\*/.test(
      readFileSync(INSTANCES_DOC, 'utf8'),
    );
    const beside = readFileSync(FIXTURE_SOURCE, 'utf8').includes('HONEST LIMIT — G9 IS NOT CLOSED');
    expect({ captured, residual, beside }).toEqual({ captured, residual: !captured, beside: !captured });
  });
});
