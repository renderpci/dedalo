/**
 * site.json — the daemon-owned manifest that describes one site.
 *
 * It is validated on read (a hand-edited or corrupt manifest is a loud failure, not a
 * silent default) and written atomically (tmp file + rename) so a crash mid-write can
 * never leave a half-written manifest that fails validation forever. The agent is told
 * NOT to touch this file (AGENTS.md rules); the daemon is its sole writer.
 *
 * `owner_user_id` is informational only — the site model is collaborative (any user with
 * the engine tool grant may work on any site), so ownership drives display and audit,
 * not authorization.
 */

import { join } from 'node:path';
import { readFileShared, writeFileSharedAtomic } from '../util/shared_tree';
import { z } from 'zod';
import { confinedPath } from '../util/paths';
import { config } from '../config';
import { DOMAIN_PATTERN } from '../provision/layout';

export const buildSpecSchema = z.object({
  install: z.string().default('bun install'),
  build: z.string().default('bun run build'),
  output: z.string().default('dist'),
});

export const manifestSchema = z.object({
  slug: z.string(),
  name: z.string(),
  owner_user_id: z.number().int(),
  created_at: z.string(),
  driver: z.enum(['claude_code', 'opencode', 'pi']),
  template: z.string(),
  build: buildSpecSchema,
  /**
   * THE DOMAIN THIS SITE ANSWERS ON — and therefore WHERE ON DISK IT LIVES.
   *
   * It was `custom_domain`, optional and read by nothing: a field that recorded an
   * operator's intention while the daemon published into `<PREPROD_ROOT>/<slug>` and the
   * generated vhosts served `<webspace>/pre` and `<webspace>/web`. It is now the site's
   * pairing with the host — `<WEBSPACE_BASE>/<domain>` is the webspace the provisioner
   * created for it (`src/sites/webspace.ts`), and its two URLs are built from it.
   *
   * REQUIRED, and validated against the SAME grammar the provisioner validates a declared
   * site's domain with (`DOMAIN_PATTERN`, owned by layout.ts): a site whose domain does not
   * match cannot have a webspace, because no directory the provisioner made is named that.
   * A manifest without one is a loud read failure, not a default — the daemon has nowhere to
   * publish such a site and must say so where it can be fixed rather than at midnight.
   */
  domain: z.string().regex(DOMAIN_PATTERN, 'domain must be a lowercase dotted hostname'),
  /** The currently published release, or null if never published. */
  published: z
    .object({
      release: z.string(),
      at: z.string(),
      by: z.string(),
    })
    .nullable()
    .default(null),
});

export type SiteManifest = z.infer<typeof manifestSchema>;
export type BuildSpec = z.infer<typeof buildSpecSchema>;

function manifestPath(slug: string): string {
  return confinedPath(config.SITES_ROOT, slug, 'site.json');
}

/**
 * READ THROUGH THE SAME O_NOFOLLOW DOOR AS IT IS WRITTEN.
 *
 * `manifestPath` is lexical and `<slug>/` is the agent's own workspace, so a turn that
 * replaced `site.json` with a link had this daemon read whatever it pointed at as ITSELF —
 * and the manifest is parsed into the domain a publish then writes to, so the confused
 * deputy is a read AND a redirect. `readFileShared` walks every component `O_NOFOLLOW` and
 * refuses a second name on the inode. SHARED, not private: the agent may legitimately
 * rewrite `site.json` (it is 0660 and the directory around it is its own), which is why the
 * schema — not the owner — is what this file trusts.
 */
export async function readManifest(slug: string): Promise<SiteManifest> {
  const raw = await readFileShared(config.SITES_ROOT, join(slug, 'site.json'));
  if (raw === null) {
    const error = new Error(
      `ENOENT: no manifest for site '${slug}' at '${manifestPath(slug)}'`,
    ) as NodeJS.ErrnoException;
    error.code = 'ENOENT';
    throw error;
  }
  return manifestSchema.parse(JSON.parse(raw));
}

/**
 * Atomic write: serialize to a sibling tmp file, then rename over the target.
 *
 * SHARED, because `site.json` sits inside the workspace the AGENT works in and the agent
 * is a different uid than this daemon (`util/shared_tree.ts`). A 0640 manifest would be a
 * file the turn can read and not edit — and, since the directory around it is group
 * writable, one it would replace by unlinking instead, which is worse than letting it write.
 */
export async function writeManifest(manifest: SiteManifest): Promise<void> {
  // The ROOT is the provisioned prefix and the rest is untrusted: `manifestPath` is
  // lexical (`util/paths.ts`), and the tmp file it implies sits in a directory the agent
  // writes. The writer opens every component O_NOFOLLOW (`util/shared_tree.ts`).
  await writeFileSharedAtomic(
    config.SITES_ROOT,
    join(manifest.slug, 'site.json'),
    JSON.stringify(manifest, null, 2) + '\n',
  );
}
