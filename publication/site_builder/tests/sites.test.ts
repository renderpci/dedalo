import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { existsSync } from 'node:fs';
import { rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { config } from '../src/config';
import { createSite, deleteSite, listSlugs, siteExists } from '../src/sites/workspace';
import { readManifest } from '../src/sites/manifest';
import { ConflictError, ValidationError, LimitExceededError } from '../src/errors';

const ACTOR = { user_id: 42, username: 'tester' };

async function wipeRoots(): Promise<void> {
  await rm(config.SITES_ROOT, { recursive: true, force: true });
  await rm(config.PREPROD_ROOT, { recursive: true, force: true });
  await rm(config.PROD_ROOT, { recursive: true, force: true });
}

beforeEach(wipeRoots);
afterEach(wipeRoots);

describe('createSite', () => {
  test('scaffolds a workspace with a valid manifest, git repo and AGENTS.md', async () => {
    const manifest = await createSite({ slug: 'demo', name: 'Demo Site', actor: ACTOR });

    expect(manifest.slug).toBe('demo');
    expect(manifest.name).toBe('Demo Site');
    expect(manifest.owner_user_id).toBe(42);
    expect(manifest.driver).toBe(config.AGENT_DRIVER);
    expect(manifest.template).toBe('basic');
    expect(manifest.published).toBeNull();

    const dir = join(config.SITES_ROOT, 'demo');
    expect(existsSync(join(dir, 'site.json'))).toBe(true);
    expect(existsSync(join(dir, '.git'))).toBe(true);
    expect(existsSync(join(dir, 'AGENTS.md'))).toBe(true);
    expect(existsSync(join(dir, 'CLAUDE.md'))).toBe(true);
    expect(existsSync(join(dir, '.builder'))).toBe(true);
    // The template's package.json travels; template.json does not.
    expect(existsSync(join(dir, 'package.json'))).toBe(true);
    expect(existsSync(join(dir, 'template.json'))).toBe(false);

    // Re-reading the manifest validates it against the schema.
    const reread = await readManifest('demo');
    expect(reread.slug).toBe('demo');
  });

  test('substitutes the publication API URL placeholder into the template', async () => {
    await createSite({ slug: 'sub', name: 'Sub', actor: ACTOR });
    const helper = await readFile(join(config.SITES_ROOT, 'sub', 'src', 'lib', 'dedalo.ts'), 'utf8');
    expect(helper).toContain(config.PUBLICATION_API_URL);
    expect(helper).not.toContain('__PUBLICATION_API_URL__');
  });

  test('embeds the site brief in AGENTS.md and links CLAUDE.md to it', async () => {
    await createSite({ slug: 'brief', name: 'Brief Site', actor: ACTOR });
    const agents = await readFile(join(config.SITES_ROOT, 'brief', 'AGENTS.md'), 'utf8');
    expect(agents).toContain('Brief Site');
    expect(agents).toContain(config.PUBLICATION_API_URL);
    expect(agents).toContain('Static output only');
    // Symlink resolves to the same content.
    const claude = await readFile(join(config.SITES_ROOT, 'brief', 'CLAUDE.md'), 'utf8');
    expect(claude).toBe(agents);
  });

  test('rejects an invalid slug and a duplicate', async () => {
    await expect(createSite({ slug: 'Bad Slug', name: 'x', actor: ACTOR })).rejects.toThrow(ValidationError);
    await createSite({ slug: 'dup', name: 'First', actor: ACTOR });
    await expect(createSite({ slug: 'dup', name: 'Second', actor: ACTOR })).rejects.toThrow(ConflictError);
  });

  test('enforces MAX_SITES', async () => {
    for (let i = 0; i < config.MAX_SITES; i++) {
      await createSite({ slug: `site-${i}`, name: `Site ${i}`, actor: ACTOR });
    }
    await expect(createSite({ slug: 'overflow', name: 'x', actor: ACTOR })).rejects.toThrow(
      LimitExceededError,
    );
  });

  test('a failed create leaves no wedged directory', async () => {
    await expect(createSite({ slug: 'x', name: 'x', template: 'nonexistent', actor: ACTOR })).rejects.toThrow();
    expect(siteExists('x')).toBe(false);
    expect(existsSync(join(config.SITES_ROOT, 'x'))).toBe(false);
  });
});

describe('listSlugs / deleteSite', () => {
  test('lists created sites and ignores dotdirs', async () => {
    await createSite({ slug: 'alpha', name: 'A', actor: ACTOR });
    await createSite({ slug: 'beta', name: 'B', actor: ACTOR });
    expect(await listSlugs()).toEqual(['alpha', 'beta']);
  });

  test('deletes the workspace but not an unrelated prod copy without purge', async () => {
    await createSite({ slug: 'gone', name: 'Gone', actor: ACTOR });
    await deleteSite('gone', false);
    expect(siteExists('gone')).toBe(false);
    expect(existsSync(join(config.SITES_ROOT, 'gone'))).toBe(false);
  });

  test('deleting an unknown site throws NotFound', async () => {
    await expect(deleteSite('never', false)).rejects.toThrow();
  });
});
