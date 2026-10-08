/**
 * The artifact contract every renderer meets. Mirrors
 * publication/site_builder/src/provision/render/types.ts (ARTIFACT_KINDS census, artifact()
 * resolving a MODES row, Renderer), plus the three facts the plan needs to order its tail:
 * `effects` (what a WRITE of this file obliges), `validate` (a checker run on the temp file
 * before the rename) and `service` (this file IS a unit the plan enables/starts).
 *
 * ZERO-DEPENDENCY: root-repo tests import the renderers.
 */
import { isAbsolute } from 'node:path';
import { HOST_STAMP_INSTANCE, HOST_WIDE_KINDS, stamp } from '../hash';
import type { AgentLayout, ModeKey, WebServer } from '../layout';
import { MODES, groupName, ownerName } from '../layout';

/** Every kind a renderer produces, one renderer per kind (census both ways in plan.ts RENDERERS). */
export const ARTIFACT_KINDS = [
  'env',
  'unit_agent',
  'unit_v2',
  'v2_scratch_unit',
  'sudoers',
  'polkit',
  'engine_fragment',
  // provision init, step 1 (spec S4, S5, §13.5, §13.6)
  'web_include',
  'fpm_pool',
  'nginx_map_include',
  'host_map_unit',
  // owner decision 1(c): the site's web logs live in the distribution's log dir, per site
  'logrotate',
] as const;
export type ArtifactKind = (typeof ARTIFACT_KINDS)[number];

/** What a WRITE of the artifact obliges the plan to do afterwards. Closed. */
export const ARTIFACT_EFFECTS = ['daemon_reload', 'restart_agent', 'restart_v2', 'reload_web', 'reload_fpm'] as const;
export type ArtifactEffect = (typeof ARTIFACT_EFFECTS)[number];

/**
 * A checker apply runs around the write. Closed. `sudoers`: on the temp file before the rename
 * (visudo -cf, then the whole policy). `web` / `fpm`: AFTER the rename, under the host web lock
 * (the server's own configtest reads the live tree), restoring the previous bytes on failure
 * (apply.ts installValidatedPostRename).
 */
export const ARTIFACT_VALIDATORS = ['sudoers', 'web', 'fpm'] as const;
export type ArtifactValidator = (typeof ARTIFACT_VALIDATORS)[number];

/**
 * What a WRITE action's validator runs (plan.ts WriteAction.validator), resolved from the layout:
 * the web server's configtest binary and unit, or the FPM install's master binary and unit.
 */
export type WriteValidator =
  | { readonly kind: 'sudoers' }
  | { readonly kind: 'web'; readonly server: WebServer; readonly bin: string; readonly unit: string }
  | { readonly kind: 'fpm'; readonly bin: string; readonly unit: string };

/** This artifact is the unit file of `unit`; the plan enables it, and starts it when `start`. */
export interface ArtifactService {
  readonly unit: string;
  readonly start: boolean;
}

export interface Artifact {
  readonly kind: ArtifactKind;
  readonly path: string;
  readonly modeKey: ModeKey;
  readonly owner: string;
  readonly group: string;
  readonly mode: number;
  /** Stamped: the first line is `# dedalo-provision: <instance> <kind> <sha>`. */
  readonly body: string;
  readonly effects: readonly ArtifactEffect[];
  readonly validate: ArtifactValidator | null;
  readonly service: ArtifactService | null;
  /** Stamped `_host` (hash.ts HOST_STAMP_INSTANCE): one file shared by every instance on the host. */
  readonly hostWide: boolean;
}

export interface ArtifactInput {
  readonly kind: ArtifactKind;
  readonly path: string;
  readonly mode: ModeKey;
  readonly body: string;
  readonly commentPrefix?: string;
  readonly effects?: readonly ArtifactEffect[];
  readonly validate?: ArtifactValidator;
  readonly service?: ArtifactService;
  /** A host-wide file (a kind in hash.ts HOST_WIDE_KINDS, and only those): stamped `_host`. */
  readonly hostWide?: true;
}

export function artifact(layout: AgentLayout, input: ArtifactInput): Artifact {
  const row = MODES[input.mode];
  if (!row) {
    throw new Error(`render: '${String(input.mode)}' is not a row of layout's MODES matrix`);
  }
  if (!isAbsolute(input.path)) {
    throw new Error(`render: the ${input.kind} artifact's path '${input.path}' is not absolute`);
  }
  const hostWide = input.hostWide === true;
  if (hostWide !== HOST_WIDE_KINDS.includes(input.kind)) {
    throw new Error(
      hostWide
        ? `render: '${input.kind}' is not a host-wide kind (${HOST_WIDE_KINDS.join(', ')}); it is stamped with its instance`
        : `render: '${input.kind}' is a host-wide kind; render it with hostWide: true (stamped '${HOST_STAMP_INSTANCE}')`,
    );
  }
  return Object.freeze({
    kind: input.kind,
    path: input.path,
    modeKey: input.mode,
    owner: ownerName(layout, row.owner),
    group: groupName(layout, row.group),
    mode: row.mode,
    body: stamp(input.kind, hostWide ? HOST_STAMP_INSTANCE : layout.instance, input.body, input.commentPrefix),
    effects: Object.freeze([...(input.effects ?? [])]),
    validate: input.validate ?? null,
    service: input.service ? Object.freeze({ ...input.service }) : null,
    hostWide,
  });
}

/**
 * What a renderer needs that the declaration does not hold. Today only the pairing
 * fingerprint: it depends on the minted SERVICE_TOKEN, which observeHost never reads. The CLI
 * computes it (render/engine_fragment.ts renderFacts) from the root-only credential and
 * passes it in. PENDING_FACTS is the honest value before the token exists, and the default
 * for every caller that renders only to learn paths and modes (observeHost, the plan gates):
 * no artifact's PATH, MODE, OWNER or EFFECTS may depend on facts.
 */
export interface RenderFacts {
  /** instanceFingerprint(instance, token), or null until the token is minted. */
  readonly fingerprint: string | null;
}

export const PENDING_FACTS: RenderFacts = Object.freeze({ fingerprint: null });

export interface Renderer {
  readonly kind: ArtifactKind;
  /** Absent = always. E.g. a tls-only artifact returns false for a unix instance. */
  appliesTo?(layout: AgentLayout): boolean;
  /** Pure: same layout + facts, same bytes. */
  render(layout: AgentLayout, facts: RenderFacts): Artifact[];
}

/**
 * The groups a rendered unit gives its process: `Group=` (null = no such line, the user's
 * primary group applies) and `SupplementaryGroups=` (empty = no such line). Each unit
 * renderer emits its lines FROM this value (render/unit_agent.ts agentUnitGroups,
 * render/unit_v2.ts v2UnitGroups), and plan.ts judges access with the same value, so the
 * check and the unit cannot disagree. tests/provision_access.test.ts parses the rendered
 * lines back and holds them EQUAL to it.
 */
export interface UnitGroups {
  readonly group: string | null;
  readonly supplementary: readonly string[];
}
