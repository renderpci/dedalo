/**
 * The declaration file `/etc/dedalo_publication_host/<instance>.json` — STRUCTURE, strictly
 * (zod, unknown keys refused); then `derive()` (layout.ts) for every cross-field law. One
 * entry point, `parseDeclaration`, and one error, `DeclarationError`, listing every issue.
 *
 * Mirrors publication/site_builder/src/provision/schema.ts (strictObject everywhere,
 * collect-all issues) for one agent. Not zero-dependency (zod): no root-repo test imports it.
 * The configtest binary is not a field: it is derived (layout.ts WEB_CONFIGTEST_BINARY), so a
 * declared one is an unknown key.
 */
import { z } from 'zod';
import type { AgentLayout, HostDeclaration } from './layout';
import {
  ABSOLUTE_PATH_PATTERN,
  INSTANCE_PATTERN,
  LISTEN_HOST_PATTERN,
  LayoutError,
  RELEASES_RETAINED_MAX,
  RELEASES_RETAINED_MIN,
  UNIT_NAME_PATTERN,
  UNIX_NAME_PATTERN,
  derive,
} from './layout';

const absolutePath = z.string().regex(ABSOLUTE_PATH_PATTERN, 'must be an absolute path of [A-Za-z0-9._/-]');
const unixName = z.string().regex(UNIX_NAME_PATTERN, `must match ${UNIX_NAME_PATTERN.source}`);
const unitName = z.string().regex(UNIT_NAME_PATTERN, `must match ${UNIT_NAME_PATTERN.source}`);
const port = z.number().int().min(1).max(65535);

const listenSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('unix') }),
  z.strictObject({
    kind: z.literal('tls'),
    host: z.string().regex(LISTEN_HOST_PATTERN, 'must be a canonical non-zero IPv4 address (Task 1 deviation 1)'),
    port,
  }),
]);

export const declarationSchema = z.strictObject({
  instance: z.string().regex(INSTANCE_PATTERN, `must match ${INSTANCE_PATTERN.source}`),
  listen: listenSchema,
  agent_user: unixName,
  engine_group: unixName.optional(),
  agent_dir: absolutePath,
  web: z.strictObject({
    server: z.enum(['apache', 'nginx']),
    unit: unitName,
    group: unixName,
  }),
  state_root: absolutePath,
  media: z.strictObject({
    mode: z.enum(['shared', 'copy', 'none']),
    root: absolutePath.optional(),
  }),
  php_bin: absolutePath,
  bun_bin: absolutePath,
  v2: z.strictObject({
    unit: unitName,
    user: unixName,
    group: unixName,
    port,
    health_url: z.string().min(1),
  }),
  releases_retained: z.number().int().min(RELEASES_RETAINED_MIN).max(RELEASES_RETAINED_MAX).optional(),
  paths: z
    .strictObject({
      config_base: absolutePath.optional(),
      unit_dir: absolutePath.optional(),
      sudoers_dir: absolutePath.optional(),
      polkit_rules_dir: absolutePath.optional(),
    })
    .optional(),
});

export interface DeclarationIssue {
  readonly path: string;
  readonly message: string;
}

export class DeclarationError extends Error {
  readonly issues: readonly DeclarationIssue[];
  constructor(source: string, issues: readonly DeclarationIssue[]) {
    super(
      `declaration '${source}' refused:\n${issues.map(issue => `  - ${issue.path}: ${issue.message}`).join('\n')}`,
    );
    this.name = 'DeclarationError';
    this.issues = issues;
  }
}

/** Structure (zod) then semantics (derive). `source` only names the file in the error. */
export function parseDeclaration(
  raw: unknown,
  source: string,
): { declaration: HostDeclaration; layout: AgentLayout } {
  const parsed = declarationSchema.safeParse(raw);
  if (!parsed.success) {
    throw new DeclarationError(
      source,
      parsed.error.issues.map(issue => ({
        path: issue.path.length > 0 ? issue.path.map(String).join('.') : '(root)',
        message: issue.message,
      })),
    );
  }
  const declaration: HostDeclaration = parsed.data;
  try {
    return { declaration, layout: derive(declaration) };
  } catch (error) {
    if (error instanceof LayoutError) {
      throw new DeclarationError(source, [{ path: error.field, message: error.message }]);
    }
    throw error;
  }
}
