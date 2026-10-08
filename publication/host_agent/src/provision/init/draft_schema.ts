/**
 * The DRAFT's structure (spec S1, §2.1): the declaration format with every field discovery can
 * fill made optional, plus the draft-only `layout` (S6). Built FROM schema.ts's declaration shapes
 * (never restated), so a field the declaration gains or tightens is the draft's too; strict
 * everywhere, unknown keys refused, every issue listed in one DeclarationError.
 *
 * What a draft must still say — discovery cannot know it: `instance`, and `media` (which media
 * mode, and where the files are, is the operator's choice; a default would silently narrow).
 * `site.domain` when a site is declared. Everything else is filled by completeDraft (draft.ts).
 *
 * zod (not zero-dep); the pure draft.ts never imports it.
 */
import { z } from 'zod';
import type { LayoutKind } from '../layout';
import { DeclarationError, declarationSchema } from '../schema';
import type { DraftDeclaration } from './draft';

export { DeclarationError as DraftError };

const shape = declarationSchema.shape;
const site = shape.site.unwrap();

/** Every draft key but `layout` is a declaration key (tests/init_draft.test.ts holds it). */
export const DRAFT_LAYOUTS: readonly LayoutKind[] = Object.freeze(['home', 'system']);

export const draftSchema = z.strictObject({
  instance: shape.instance,
  layout: z.enum(['home', 'system']).optional(),
  listen: shape.listen.optional(),
  agent_user: shape.agent_user.optional(),
  engine_group: shape.engine_group,
  agent_dir: shape.agent_dir.optional(),
  web: shape.web.partial().optional(),
  site: site.extend({ fpm: site.shape.fpm.optional() }).optional(),
  v1: shape.v1.partial().optional(),
  state_root: shape.state_root.optional(),
  media: shape.media,
  php_bin: shape.php_bin.optional(),
  bun_bin: shape.bun_bin.optional(),
  v2: shape.v2.partial().optional(),
  releases_retained: shape.releases_retained,
  paths: shape.paths,
});

/**
 * Structure only; completeDraft fills, then parseDeclaration (schema.ts + derive) judges the
 * result. A final declaration is itself a valid draft (spec §1.2: without --draft it IS the draft).
 * `source` only names the file in the error.
 */
export function parseDraft(raw: unknown, source: string): DraftDeclaration {
  const parsed = draftSchema.safeParse(raw);
  if (!parsed.success) {
    throw new DeclarationError(
      source,
      parsed.error.issues.map(issue => ({
        path: issue.path.length > 0 ? issue.path.map(String).join('.') : '(root)',
        message: issue.message,
      })),
    );
  }
  return parsed.data;
}
