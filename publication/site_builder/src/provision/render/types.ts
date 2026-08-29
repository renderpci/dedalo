/**
 * THE RENDERER CONTRACT — what an artifact is, and what every renderer of one must be.
 *
 * The provisioner is three moves: DERIVE (layout.ts turns one declaration into every name,
 * path, owner and mode), RENDER (this directory turns that layout into the exact bytes of
 * each host artifact), APPLY (write the ones that drifted, with the owner and mode the
 * matrix says). This file is the seam between the second and the third, so it is small and
 * it is strict: an `Artifact` is a complete unit of work — WHERE the bytes go, WHAT they
 * are, and WHO may read them — and nothing downstream has to look anything up to act on it.
 *
 * THE LAW EVERY RENDERER OBEYS (the reason these types are shaped this way):
 *
 *   PURE. `(layout, manifest) => Artifact[]`. No filesystem, no process.env, no clock, no
 *   randomness. The provisioner writes only on drift, so a timestamp or a hostname read
 *   from the machine would make every artifact differ from itself on every run — the tool
 *   would rewrite a museum's live vhosts nightly and the drift report would be noise.
 *
 *   ZERO-DEP, like layout.ts and hash.ts: `node:` builtins and package-local siblings that
 *   are themselves dependency-free. A repo-side tripwire renders all of these WITHOUT this
 *   package's node_modules, so an import of `zod` (or of `../schema`, which imports it)
 *   breaks the gate that keeps the committed artifacts honest.
 *
 *   STAMPED. Every artifact's first line is `# dedalo-provision: <instance> <kind> <sha>`.
 *   Not by convention — `artifact()` below is the only constructor, and it stamps. A
 *   renderer cannot forget, and the check in `renderAll()` re-reads the stamp back off
 *   every artifact so it cannot be bypassed either.
 *
 *   NO SECRET, EVER. Not in the unit, not in the env file, not in a vhost, not in the
 *   engine fragment. Credentials reach the process through systemd `LoadCredential=` from
 *   root-owned 0600 files; a rendered artifact may name a KEY and a PATH and never a value.
 *   Nothing in a type can enforce that — it is the renderers' obligation and the gates' —
 *   but it is why `layout.secrets` is a map to PATHS and why `envVars` holds
 *   `PUBLICATION_API_KEY_FILE` rather than a key.
 *
 *   DERIVE, NEVER RESTATE. Every path, name, mode and group comes from the layout. A
 *   literal path or identity inside a renderer is the exact defect this phase deletes: the
 *   installer hardcoded the service user, the unit hardcoded it AGAIN, and the unit's
 *   ReadWritePaths= named two roots that did not follow the installer's overrides — a clean
 *   install and a read-only filesystem at publish time, on a museum's site. That is why
 *   `artifact()` takes a MODES ROW NAME and not three numbers: a renderer states which row
 *   of the matrix its file is, and layout.ts remains the only file that knows what that row
 *   means.
 *
 *   ESCAPE EVERYTHING THAT REACHES A CONFIG. The schema constrains a domain, a realm, a
 *   description — but `derive()` is a second entry point (an adopted host's manifest is
 *   built from disk, with no declaration ever validated), so a renderer escapes or refuses
 *   the strings it interpolates on its own account. Defence in depth, not delegation.
 */

import { isAbsolute } from 'node:path';
import type { InstanceLayout, InstanceManifest, ModeGroup, ModeOwner } from '../layout';
import { MODES } from '../layout';
import { stamp } from '../hash';

/* ────────────────────────────────────────────────────────────────────────────────────
 * Kinds
 * ──────────────────────────────────────────────────────────────────────────────────── */

/**
 * THE ARTIFACT KINDS — one per renderer module, spelled exactly as the module is named
 * (unit.ts, env.ts, nginx.ts, apache.ts, engine_fragment.ts), so a stamp line read off a
 * museum's host names the file in this tree that produced it.
 *
 * The list is closed and lives here rather than in each renderer: `renderAll()` must be
 * able to say "nothing rendered the unit" and `check` must be able to map a stamp back to a
 * renderer, and neither is possible over a set that each module extends privately.
 *
 * The two vhost kinds are separate because they are separate FILES with separate grammars,
 * even though exactly one of them applies to any given host. Collapsing them to 'vhost'
 * would make a stamp ambiguous on a host whose web server changed — which is precisely the
 * moment an operator needs the file to say which renderer wrote it.
 */
export const ARTIFACT_KINDS = ['unit', 'env', 'nginx_vhost', 'apache_vhost', 'engine_fragment'] as const;

export type ArtifactKind = (typeof ARTIFACT_KINDS)[number];

/**
 * A row of layout's ownership/mode matrix, BY NAME. This is the type that keeps a mode out
 * of a renderer: `mode: 'hostConfig'` is a claim about what KIND of thing the file is, and
 * layout.ts decides what that implies. A renderer that could write `0o644` could write
 * `0o646`, and nothing would notice until a museum's htpasswd was world-readable.
 */
export type ModeKey = keyof typeof MODES;

/* ────────────────────────────────────────────────────────────────────────────────────
 * The artifact
 * ──────────────────────────────────────────────────────────────────────────────────── */

/**
 * ONE FILE THE HOST MUST HOLD: its bytes, its place, and its access.
 *
 * `owner` and `group` are RESOLVED NAMES ('root', 'dedalo-site-mib', 'www-data'), not the
 * matrix's symbols, because the consumer of this record runs `chown owner:group` and
 * `chmod mode` — and a consumer that had to resolve 'webGroup' against the layout would be
 * a second place that knows what 'webGroup' means. `modeKey` is carried alongside so the
 * provenance survives: an error message, a `check` report and the specification gate can
 * all point at the row of §3 this file is, instead of at a number.
 */
export interface Artifact {
  readonly kind: ArtifactKind;
  /** Absolute, and always a path the LAYOUT produced — never one a renderer spelled. */
  readonly path: string;
  /** The numeric mode, setgid bit included where the matrix sets one (0o2750). */
  readonly mode: number;
  /** Resolved user name: 'root', or the instance's service user. */
  readonly owner: string;
  /** Resolved group name: 'root', the instance's group, the web server's, the engine's. */
  readonly group: string;
  /** The MODES row this file is, kept for provenance — see the note above. */
  readonly modeKey: ModeKey;
  /**
   * THE COMPLETE FILE, stamp line first: exactly the bytes `apply` writes, byte for byte.
   *
   * The word shifts meaning by one line between here and `hash.ts`, and this is the only
   * place in the tree where it does, so it is stated rather than left to be discovered:
   * `stamp()` takes a BODY (what the renderer wrote) and returns a FILE (the stamp plus
   * that body); this field holds the FILE. A renderer never sees the difference, because
   * `artifact()` below is what crosses it.
   */
  readonly body: string;
}

/**
 * What `artifact()` needs. An options object rather than five positional arguments: four of
 * them are strings, and a transposed `kind`/`path` pair would produce a plausible-looking
 * artifact pointed at a filename called 'unit'.
 */
export interface ArtifactInput {
  readonly kind: ArtifactKind;
  /** From the layout: `layout.unitPath`, `layout.envFile`, `site.vhostPaths[surface]`… */
  readonly path: string;
  /** WHICH ROW of layout's MODES matrix this file is. Never a number. */
  readonly mode: ModeKey;
  /** The rendered content, UNSTAMPED — the stamp is added here so it cannot be forgotten. */
  readonly body: string;
  /**
   * The artifact's own comment syntax. Defaulted to '#' because all five of today's
   * artifacts happen to use it (systemd, nginx, Apache and an env file agree), which is a
   * coincidence and not a rule — the first renderer that emits another format passes its
   * own, rather than discovering that the stamp is a syntax error.
   */
  readonly commentPrefix?: string;
}

/**
 * THE ONLY CONSTRUCTOR OF AN ARTIFACT.
 *
 * It exists so that three things are impossible to get wrong once, let alone five times in
 * five modules written in parallel: an unstamped file, a mode invented by a renderer, and a
 * relative path. Each is checked here, at the one point every artifact passes through.
 *
 * The path is required to be ABSOLUTE and nothing more — this function cannot know whether
 * a path came out of the layout, and a renderer that spelled one by hand is caught by the
 * gate that compares rendered paths against the derived ones, not by a string check here.
 */
export function artifact(layout: InstanceLayout, input: ArtifactInput): Artifact {
  const row = MODES[input.mode];
  if (!row) {
    throw new Error(
      `render: '${String(input.mode)}' is not a row of layout's MODES matrix. A renderer names ` +
        `the row its file is; it never states an owner, a group or a number.`,
    );
  }
  if (!isAbsolute(input.path)) {
    throw new Error(
      `render: the ${input.kind} artifact's path '${input.path}' is not absolute. Every path ` +
        `comes from derive(); a relative one means a renderer spelled it itself.`,
    );
  }

  return Object.freeze({
    kind: input.kind,
    path: input.path,
    mode: row.mode,
    owner: resolveOwner(layout, row.owner),
    group: resolveGroup(layout, row.group),
    modeKey: input.mode,
    body: stamp(input.kind, layout.instance, input.body, input.commentPrefix),
  });
}

/**
 * The matrix's owner symbol → the name on the host. Two values, and the distinction is the
 * whole isolation story: 'root' is a file the daemon may read at most, 'user' is a file the
 * daemon owns.
 */
function resolveOwner(layout: InstanceLayout, owner: ModeOwner): string {
  switch (owner) {
    case 'root':
      return 'root';
    case 'user':
      return layout.identity.user;
    default: {
      // Exhaustiveness as a compile error: a fifth owner added to layout's matrix must be
      // resolved HERE in the same commit, not defaulted to root by a fall-through.
      const unreachable: never = owner;
      throw new Error(`render: unknown mode owner '${String(unreachable)}'`);
    }
  }
}

/**
 * The matrix's group symbol → the name on the host. Four values, and choosing between them
 * IS the design: the instance's own group contains nothing outside this museum, while
 * `webGroup` and `engineGroup` are the HOST's groups — which is how the web server reads a
 * 0640 htpasswd and the engine opens a 0660 socket with no group membership granted to
 * anyone, instead of the `usermod -aG` this subsystem replaces.
 */
function resolveGroup(layout: InstanceLayout, group: ModeGroup): string {
  switch (group) {
    case 'root':
      return 'root';
    case 'group':
      return layout.identity.group;
    case 'webGroup':
      return layout.identity.webGroup;
    case 'engineGroup':
      return layout.identity.engineGroup;
    default: {
      const unreachable: never = group;
      throw new Error(`render: unknown mode group '${String(unreachable)}'`);
    }
  }
}

/* ────────────────────────────────────────────────────────────────────────────────────
 * The renderer
 * ──────────────────────────────────────────────────────────────────────────────────── */

/**
 * ONE RENDERER PER KIND — a value, not a class and not a bare function, so the registry can
 * hold the kind, the applicability and the rendering as one object and nothing has to keep
 * a parallel list of which function produces which kind.
 *
 * `render` returns an ARRAY because the artifacts have different natural grains: the unit,
 * the env and the engine fragment are one file per INSTANCE, while a vhost is one file per
 * SITE PER SURFACE — a vhost carries one server_name, one document root and one TLS block,
 * so two sites sharing a file would share all three. A signature that forced one string per
 * renderer would have been answered by a renderer concatenating vhosts into one file, which
 * is the same defect wearing a type that permits it.
 */
export interface Renderer {
  /** The kind this renderer produces. Every artifact it returns must carry it. */
  readonly kind: ArtifactKind;

  /**
   * Does this renderer apply to this host at all? Default: yes.
   *
   * It exists for the two vhost renderers — a host runs nginx OR Apache, never both — and
   * it lives HERE, on the renderer, so that `index.ts` never has to know why: a registry
   * that branched on `layout.webServer` would be a third file with an opinion about web
   * servers, and the next conditional artifact would add a fourth.
   */
  appliesTo?(layout: InstanceLayout): boolean;

  /**
   * The bytes. PURE, and STABLE for equivalent input — reordering the sites in
   * instance.json must not change a byte, or the provisioner reports drift and rewrites a
   * museum's live configuration over a formatting change. Sort the sets you emit; the
   * layout already sorts the ones it owns (`readWritePaths()`).
   *
   * The MANIFEST is passed alongside the layout for the fields that are declarations rather
   * than derived placements. Reach for the layout first: anything with a path, a name, an
   * owner or a mode in it has already been derived, and reading it off the manifest instead
   * is how an override reaches one artifact and misses another.
   */
  render(layout: InstanceLayout, manifest: InstanceManifest): Artifact[];
}
