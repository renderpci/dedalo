import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { rm } from 'node:fs/promises';
import { config } from '../src/config';
import { audit, readAudit } from '../src/audit';

async function wipe(): Promise<void> {
  await rm(config.SITES_ROOT, { recursive: true, force: true });
}

beforeEach(wipe);
afterEach(wipe);

describe('audit log', () => {
  test('appends entries and reads them back newest-first with a site filter', async () => {
    await audit({ actor: { user_id: 1, username: 'a' }, action: 'create_site', site: 'one' });
    await audit({ actor: { user_id: 2, username: 'b' }, action: 'build', site: 'two' });
    await audit({ actor: { user_id: 1, username: 'a' }, action: 'publish', site: 'one', detail: { release: 'r1' } });

    const all = await readAudit();
    expect(all.length).toBe(3);
    // Newest first.
    expect(all[0].action).toBe('publish');

    const forOne = await readAudit({ site: 'one' });
    expect(forOne.length).toBe(2);
    expect(forOne.every(e => e.site === 'one')).toBe(true);

    const limited = await readAudit({ limit: 1 });
    expect(limited.length).toBe(1);
    expect(limited[0].action).toBe('publish');
  });

  test('reading an absent log returns empty', async () => {
    expect(await readAudit()).toEqual([]);
  });
});
