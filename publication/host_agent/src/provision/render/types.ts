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
import { stamp } from '../hash';
import type { AgentLayout, ModeKey } from '../layout';
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
] as const;
export type ArtifactKind = (typeof ARTIFACT_KINDS)[number];

/** What a WRITE of the artifact obliges the plan to do afterwards. Closed. */
export const ARTIFACT_EFFECTS = ['daemon_reload', 'restart_agent', 'restart_v2', 'reload_web'] as const;
export type ArtifactEffect = (typeof ARTIFACT_EFFECTS)[number];

/** A checker apply runs on the temp file before renaming it into place. Closed. */
export const ARTIFACT_VALIDATORS = ['sudoers'] as const;
export type ArtifactValidator = (typeof ARTIFACT_VALIDATORS)[number];

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
}

export function artifact(layout: AgentLayout, input: ArtifactInput): Artifact {
  const row = MODES[input.mode];
  if (!row) {
    throw new Error(`render: '${String(input.mode)}' is not a row of layout's MODES matrix`);
  }
  if (!isAbsolute(input.path)) {
    throw new Error(`render: the ${input.kind} artifact's path '${input.path}' is not absolute`);
  }
  return Object.freeze({
    kind: input.kind,
    path: input.path,
    modeKey: input.mode,
    owner: ownerName(layout, row.owner),
    group: groupName(layout, row.group),
    mode: row.mode,
    body: stamp(input.kind, layout.instance, input.body, input.commentPrefix),
    effects: Object.freeze([...(input.effects ?? [])]),
    validate: input.validate ?? null,
    service: input.service ? Object.freeze({ ...input.service }) : null,
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
