import { beforeEach, describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { audit, auditPath, readAudit } from '../src/audit';
import { freshScratch, resetInstance, statePath } from './fixtures/instance';

beforeEach(resetInstance);

describe('audit', () => {
  test('lives at <STATE_ROOT>/audit/audit.jsonl', () => {
    expect(auditPath()).toBe(statePath('audit', 'audit.jsonl'));
  });

  test('appends one NDJSON line per entry; read is newest first', async () => {
    await audit({ actor: 'ana', action: 'release.install', outcome: 'ok', detail: { from: null, to: '7.0.3_a1b2c3d' } });
    await audit({ actor: 'ana', action: 'release.rollback', outcome: 'ok', detail: { from: '7.0.3_a1b2c3d', to: '7.0.2_0000000' } });
    const raw = await Bun.file(auditPath()).text();
    expect(raw.trimEnd().split('\n')).toHaveLength(2);
    const entries = await readAudit();
    expect(entries.map(e => e.action)).toEqual(['release.rollback', 'release.install']);
    expect(entries[1]).toMatchObject({ actor: 'ana', outcome: 'ok', detail: { to: '7.0.3_a1b2c3d' } });
    expect(Number.isNaN(Date.parse(entries[0]!.ts))).toBe(false);
  });

  test('a corrupt line is skipped, and limit caps the read', async () => {
    await audit({ actor: 'ana', action: 'rules.apply', outcome: 'ok' });
    await Bun.write(auditPath(), `${await Bun.file(auditPath()).text()}{not json\n`);
    await audit({ actor: 'bo', action: 'rules.apply', outcome: 'failed' });
    expect((await readAudit()).map(e => e.actor)).toEqual(['bo', 'ana']);
    expect((await readAudit(auditPath(), 1)).map(e => e.actor)).toEqual(['bo']);
  });

  test('rules.map is an action of the trail (the host-wide nginx map contribution)', async () => {
    await audit({ actor: 'ana', action: 'rules.map', outcome: 'refused', detail: { result: 'map_unmanaged' } });
    expect((await readAudit())[0]).toMatchObject({ action: 'rules.map', outcome: 'refused', detail: { result: 'map_unmanaged' } });
  });

  test('a failed write never throws into the request path', async () => {
    const unwritable = join(await freshScratch('auditfail'), 'missing_dir', 'audit.jsonl');
    await audit({ actor: 'ana', action: 'rules.apply', outcome: 'failed' }, unwritable);
    expect(await readAudit(unwritable)).toEqual([]);
  });
});
