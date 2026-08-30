/**
 * ADOPTION — turning a live, hand-built install into instance N=1 OF THE SAME MECHANISM.
 *
 * A museum that has been running a site builder since before this subsystem existed has a
 * daemon, a `.env` full of plaintext credentials, an installed unit, three roots and, most
 * importantly, LIVE SITES. Adoption is how that host stops being the one host the
 * provisioner cannot express. It is emphatically NOT a second provisioner: this module
 * INFERS a declaration from what is already on disk and then the ordinary
 * `plan()` / `apply()` pair converges the host onto it. Everything adoption itself does is
 * something `plan()` structurally cannot:
 *
 *   - WRITE THE DECLARATION. `plan()` takes a manifest; it cannot invent one.
 *   - MOVE THE CREDENTIALS. `plan()` is pure and a plan is printed, so a plan may name a
 *     credential FILE and never carry a VALUE — which is exactly what moving a secret out
 *     of a `.env` and into `secrets/<KEY>` requires. `FileContent` has no source that
 *     carries a literal credential, deliberately, and it must not grow one.
 *   - RETIRE THE OLD FILES. The `.env` is RENAMED, never deleted, and the pre-instance unit
 *     is stopped and disabled. `apply` has no `rm` and no `rename` at all (see
 *     `ProvisionIo`'s header: "a provisioner that could delete is a provisioner that will
 *     one day delete a museum's published site").
 *
 * EVERYTHING ELSE IS plan()'s, and is listed here so the boundary is checkable rather than
 * remembered: the missing GROUP (the latent failure the retired installer left — it ran
 * `useradd --system --create-home` with no `--user-group` while the unit hard-required a
 * `Group=`, so on a host whose `USERGROUPS_ENAB` says no the install "succeeded" and the
 * daemon never started) is created by `identityActions`; the `.dedalo_site_instance` marker
 * in every root is stamped by `treeActions`; the unit, the vhosts, the env, `sites.json` and
 * the engine pairing fragment are rendered and installed by `artifactActions`; the new unit
 * is enabled by `serviceActions`. Adoption adds no rule about any of them.
 *
 * ── NOTHING MOVES ───────────────────────────────────────────────────────────────────────
 *
 * The inferred declaration states the identity and the roots VERBATIM — `identity`,
 * `roots.*` and `webspace_base` exist in the grammar precisely so an adopted host keeps its
 * own names — so the derived layout is the tree that is already there. A site is not
 * republished, a webspace is not moved, a served symlink is not re-pointed (`plan()` creates
 * a served link only when it is ABSENT, and `apply` never re-points one).
 *
 * Whether that actually held is not asserted, it is PROVED: `verify.ts` runs the same
 * serving check before and after, and the run is not allowed to report success unless every
 * surface of every slug still resolves to the same release. A migration that cannot prove
 * the live site still serves is not done.
 *
 * ── RESUMABLE, AND THEREFORE IDEMPOTENT ─────────────────────────────────────────────────
 *
 * A migration that can only be run once is a migration nobody can recover from. Every step
 * here is a no-op when it has already happened, and the observation looks for the RETIRED
 * env file when the live one is gone — so a second `adopt` of the same instance re-reads the
 * same facts, infers the same declaration, finds the credentials already placed and the unit
 * already disabled, and converges. It refuses only when the declaration on disk DIFFERS from
 * what it infers, because that file is the one every artifact is generated from and
 * replacing it with an inference, silently, is not a thing this command may do.
 *
 * ── THE VALUES ──────────────────────────────────────────────────────────────────────────
 *
 * `PreInstance.credentials` is the only place in this process where a credential VALUE
 * exists. It is kept apart from `settings` for that reason: nothing that is reported,
 * described, planned or printed is allowed to reach it, and the two are separate fields so
 * that "did this record carry a secret" is answerable by reading a type. The values leave it
 * exactly once, into `io.writeFile(path, value, 0600)`.
 */

import { readdirSync, readlinkSync, renameSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { basename, dirname, join, relative, sep } from 'node:path';

import { parseEnvFile } from '../env_file';
import type { ProvisionIo } from './apply';
import { hostIo } from './apply';
import { MARKER_MODE, markedRoots, markerPath } from './plan';
import {
  INSTANCE_MARKER,
  AUDIT_FILE_NAME,
  DAEMON_SUBDIR,
  DEFAULT_PATHS,
  SECRET_KEY_PATTERN,
  SURFACES,
  UNIX_NAME_PATTERN,
  credentialSources,
  derive,
  markerContent,
  releaseNameFromLinkTarget,
  type AgentDriverId,
  type InstanceLayout,
  type InstanceManifest,
  type SiteLayout,
  type Surface,
  type SurfacePaths,
} from './layout';
import { parseManifest } from './schema';

/* ────────────────────────────────────────────────────────────────────────────────────
 * The io seam
 * ──────────────────────────────────────────────────────────────────────────────────── */

/**
 * WHAT ADOPTION MAY DO TO A HOST — `apply`'s seam plus the three doors a MIGRATION needs
 * and a provisioning run must never have.
 *
 * `rename` is here and not in `ProvisionIo` on purpose. Renaming is how this module retires
 * a file instead of deleting it, and it is the one operation that can make a museum's
 * `.env` disappear from where something was reading it. `apply` executes an already-decided
 * plan and has no business moving anything, so it is not offered the door — the same
 * reasoning that keeps `rm` out of the interface altogether.
 *
 * `readLink` and `readDir` are reads, and they are separate from `readFile` because what
 * they answer is structural: which slugs exist under the workspaces root, and which release
 * a served symlink points at. `verify.ts` needs exactly those two and nothing else, which is
 * why it declares its own narrower interface that this one satisfies.
 */
export interface AdoptIo extends ProvisionIo {
  /** Move a path. Never used to overwrite: every caller checks the destination first. */
  rename(from: string, to: string): void;
  /** A symlink's target, verbatim, or null when the path is not a symlink. */
  readLink(path: string): string | null;
  /** A directory's entries, or null when it cannot be read. Never throws for absence. */
  readDir(path: string): string[] | null;
  /**
   * The instance a root DECLARES, from its `.dedalo_site_instance` marker, or null when it
   * carries none. The tree's own statement of whose it is — the only thing that separates
   * an instance's webspace from an identically-derived one belonging to a live museum.
   */
  readInstanceMarker(root: string): string | null;
}

/** The real wiring: the provisioner's own io, plus the three doors above. */
export function adoptIo(): AdoptIo {
  const base = hostIo();
  return {
    readInstanceMarker(root: string): string | null {
      try {
        return readFileSync(join(root, INSTANCE_MARKER), 'utf8').trim() || null;
      } catch {
        return null;
      }
    },
    ...base,
    rename(from: string, to: string): void {
      renameSync(from, to);
    },
    readLink(path: string): string | null {
      try {
        return readlinkSync(path);
      } catch {
        return null;
      }
    },
    readDir(path: string): string[] | null {
      try {
        return readdirSync(path).sort();
      } catch {
        return null;
      }
    },
  };
}

/* ────────────────────────────────────────────────────────────────────────────────────
 * What a pre-instance install is
 * ──────────────────────────────────────────────────────────────────────────────────── */

/** The file a pre-instance install keeps its configuration in, beside the checkout. */
export const PRE_INSTANCE_ENV = '.env';

/**
 * What the retired file is renamed to. RENAMED AND NEVER DELETED: it is the only record of
 * how a museum's daemon was configured before the migration, an operator will want to read
 * it when something does not match, and it is also what makes a second `adopt` able to infer
 * the same facts. It keeps its 0600-ish placement beside the checkout, untouched.
 */
export const RETIRED_ENV = '.env.pre-instance';

/** Where the retired installer put the one unit a pre-instance host had. */
export const LEGACY_UNIT_PATH = join(DEFAULT_PATHS.unitDir, 'dedalo-site-builder.service');

/**
 * THE KEYS THAT CARRY A CREDENTIAL VALUE and must therefore leave the env file.
 *
 * Not "keys that look like secrets": these five are the daemon's whole set of value-bearing
 * credentials (`src/config.ts`), and every one of them is a key the rendered env file is
 * FORBIDDEN to carry — the shared bearer, the Anthropic key, the two per-driver provider
 * allowlists (comma-separated `KEY=VALUE` pairs, which is prose around a secret and still a
 * secret), and the Publication API key. `render/env.ts` refuses three of them by name
 * through `SECRET_LOOKING_KEY`; the two `*_ENV` ones do not match that suffix rule and are
 * caught here, which is why the list is stated rather than computed from a pattern.
 *
 * After adoption every one of them reaches the daemon through systemd `LoadCredential=`,
 * out of a root-owned 0600 file the service user cannot open.
 */
export const MIGRATED_CREDENTIALS: readonly string[] = Object.freeze([
  'ANTHROPIC_API_KEY',
  'OPENCODE_ENV',
  'PI_ENV',
  'PUBLICATION_API_KEY',
  'SERVICE_TOKEN',
]);

/** The bearer: canonical rather than declared, so `credentialSources()` places it. */
const SERVICE_TOKEN = 'SERVICE_TOKEN';
/** The Publication API key: declared as a PATH on the manifest, not under `secrets`. */
const PUBLICATION_API_KEY = 'PUBLICATION_API_KEY';

/**
 * THE PRE-INSTANCE SURFACE SHAPE — the retired `(root, slug)` pair, spelled here because
 * nothing else in the tree remembers it any more.
 *
 * The only daemon that ever shipped addressed a surface as a SHARED ROOT plus a slug: the
 * release store at `<root>/.releases/<slug>/<release>` and the served link at
 * `<root>/<slug>`, one `PREPROD_ROOT` and one `PROD_ROOT` for every site of the install
 * (the retired `src/build/promote.ts` says exactly that in its header). The layout this
 * subsystem derives has no way to express it: a surface belongs to a SITE now
 * (`<webspace>/.releases/<pre|web>`, `<webspace>/<pre|web>`), because a site answers on its
 * own domain and a vhost carries one document root.
 *
 * So this is the ONE place the retired convention survives, and it survives as a migration
 * source and nothing else — `surfacePaths()` remains the only spelling of where a surface
 * lives today.
 */
export function preInstanceSurface(root: string, slug: string, surface: Surface): SurfacePaths {
  return Object.freeze({
    surface,
    // The pair's parent, which the retired layout shared between every site of the install.
    webspace: root,
    storeDir: join(root, '.releases', slug),
    linkPath: join(root, slug),
  });
}

/** One surface of a pre-instance site: where its bytes are, and what it is serving. */
export interface PreInstanceSurface {
  readonly paths: SurfacePaths;
  /** The release the served link names, or null for a placeholder — or no link at all. */
  readonly release: string | null;
}

/** One site of a pre-instance install, as its own `site.json` describes it. */
export interface PreInstanceSite {
  readonly slug: string;
  readonly domain: string;
  /** What the daemon's manifest says is live on production, or null if never published. */
  readonly publishedRelease: string | null;
  /**
   * The surfaces still standing at their PRE-INSTANCE address, one entry each.
   *
   * A surface is listed only while its old served link is still there, which is what makes
   * a second adoption read the world correctly rather than looking for bytes it moved
   * itself an hour earlier: after the migration the entry is gone and every consumer falls
   * back to the webspace pair, which is where they now are.
   */
  readonly surfaces: Readonly<Partial<Record<Surface, PreInstanceSurface>>>;
}

/**
 * EVERYTHING ADOPTION READ FROM THE HOST. Plain data, so `inferManifest()` can be pure and a
 * gate can build one by hand.
 */
export interface PreInstance {
  /** The install directory the `.env` was found beside. */
  readonly from: string;
  /** The file that was actually read — the live one, or the retired one on a second run. */
  readonly envPath: string;
  /** True when the live `.env` was already retired: this is a resumed migration. */
  readonly envAlreadyRetired: boolean;
  /** Every non-credential assignment. Safe to print; nothing here is a value nobody may see. */
  readonly settings: Readonly<Record<string, string>>;
  /**
   * THE CREDENTIAL VALUES — the only place one exists in this process. Never described,
   * never reported, never logged. Read once, written once, at 0600 root:root.
   */
  readonly credentials: Readonly<Record<string, string>>;
  /** The pre-instance unit, and whether it is actually installed. */
  readonly legacyUnitPath: string;
  readonly legacyUnitPresent: boolean;
  /** `User=` / `Group=` as the installed unit spells them. Null when there is no unit. */
  readonly identity: { readonly user: string; readonly group: string } | null;
  /**
   * WHERE THE PRE-INSTANCE DAEMON'S CODE AND RUNTIME ACTUALLY ARE, read off the installed
   * unit's own `WorkingDirectory=` and `ExecStart=`. Null when there is no unit.
   *
   * The new declaration requires both (`engine.checkout_dir`, `engine.bun_bin`), and the
   * installed unit is the only authority on this host that states them: the retired
   * installer copied a unit carrying `/opt/dedalo/master_dedalo/publication/site_builder`
   * and `/opt/dedalo/.bun/bin/bun` verbatim, and an operator was told to "adjust the
   * ALL-CAPS/example placeholders to the host layout". So they are READ, exactly like the
   * identity beside them, rather than guessed from a topology.
   */
  readonly runtime: { readonly checkoutDir: string; readonly bunBin: string } | null;
  /** Every site the daemon holds, in slug order. */
  readonly sites: readonly PreInstanceSite[];
}

/* ────────────────────────────────────────────────────────────────────────────────────
 * Observation
 * ──────────────────────────────────────────────────────────────────────────────────── */

/** What an operator points `adopt` at. */
export interface AdoptSource {
  /** The pre-instance install directory — the one holding the `.env`. */
  readonly from: string;
  /** The installed pre-instance unit, whose `User=`/`Group=` are the museum's identity. */
  readonly legacyUnitPath: string;
}

/**
 * REFUSE, in this module's voice.
 *
 * A plain `Error`, deliberately, and not a class of its own. Every refusal adoption can raise
 * IS a refusal of this one instance — a `--from` pointing at the wrong directory, a unit with
 * no `User=`, a site with no domain, a declaration the schema will not accept — and so is
 * every refusal `derive()` raises on the manifest that comes out of it. There is no second
 * category for a caller to tell apart, so there is no second type: the CLI reports all of
 * them as REFUSED, which is what they are.
 *
 * The trailer is not decoration either. Adoption is reached by an operator on a live museum's
 * host, and the first question a refusal has to answer is whether it happened before or after
 * something was written.
 */
function refuse(message: string): never {
  throw new Error(`${message} Nothing was read further and nothing was written.`);
}

/**
 * READ A PRE-INSTANCE INSTALL. The only impure half of this module.
 *
 * It looks for the LIVE env file first and the RETIRED one second, which is what makes a
 * resumed migration read the same facts as the first attempt rather than refusing for want
 * of a file it renamed itself.
 */
export function observePreInstance(source: AdoptSource, io: AdoptIo): PreInstance {
  const live = join(source.from, PRE_INSTANCE_ENV);
  const retired = join(source.from, RETIRED_ENV);

  const liveText = io.readFile(live);
  const envPath = liveText !== null ? live : retired;
  const text = liveText !== null ? liveText : io.readFile(retired);
  if (text === null) {
    refuse(
      `adopt: '${source.from}' holds neither '${PRE_INSTANCE_ENV}' nor '${RETIRED_ENV}'. ` +
        `Adoption infers a museum's declaration from the configuration its daemon was ` +
        `actually running with, and that file is where it is written down; point --from at ` +
        `the install directory the pre-instance daemon reads its environment from.`,
    );
  }

  let values: Record<string, string>;
  try {
    values = parseEnvFile(text, envPath);
  } catch (error) {
    refuse(`adopt: ${(error as Error).message}`);
  }

  const settings: Record<string, string> = {};
  const credentials: Record<string, string> = {};
  for (const [key, value] of Object.entries(values)) {
    if (MIGRATED_CREDENTIALS.includes(key)) {
      // An EMPTY assignment is not a credential — the daemon's schema defaults every one of
      // these to '' — and carrying it forward would make adoption "migrate" a secret that
      // was never there, leaving a 0600 file holding nothing and a unit whose
      // LoadCredential= points at it.
      if (value !== '') credentials[key] = value;
      continue;
    }
    settings[key] = value;
  }

  const unitText = io.readFile(source.legacyUnitPath);

  return Object.freeze({
    from: source.from,
    envPath,
    envAlreadyRetired: liveText === null,
    settings: Object.freeze(settings),
    credentials: Object.freeze(credentials),
    legacyUnitPath: source.legacyUnitPath,
    legacyUnitPresent: unitText !== null,
    identity: unitText === null ? null : identityOf(unitText, source.legacyUnitPath),
    runtime: unitText === null ? null : runtimeOf(unitText, source.legacyUnitPath),
    sites: observeSites(settings, io),
  });
}

/**
 * THE MUSEUM'S IDENTITY, OUT OF ITS OWN UNIT — verbatim, and never derived.
 *
 * `dedalo-site-<instance>` is the safe form for a NEW instance and is exactly the wrong
 * answer here: the uid that owns every byte of this museum's workspaces, releases and audit
 * trail is whatever the retired installer created, and renaming it would orphan all of them
 * at once.
 *
 * A unit with no `Group=` is the retired installer's latent failure, and it is read as "the
 * group is named after the user" rather than as an error — because that is what
 * `useradd --system` does on a host whose `USERGROUPS_ENAB` says yes, and on a host where it
 * says no the group simply does not exist yet. `plan()` creates it either way: a `group`
 * action is planned whenever `getent` does not resolve the name, and it is planned BEFORE
 * the user that names it.
 */
function identityOf(unitText: string, path: string): { user: string; group: string } {
  const user = directive(unitText, 'User');
  if (user === null) {
    refuse(
      `adopt: the pre-instance unit '${path}' states no 'User='. The service user is the ` +
        `whole isolation boundary and it owns every byte of this museum's tree, so adoption ` +
        `will not guess it.`,
    );
  }
  if (!UNIX_NAME_PATTERN.test(user)) {
    refuse(
      `adopt: the pre-instance unit '${path}' states User='${user}', which is not a usable ` +
        `unix name (${UNIX_NAME_PATTERN.source}).`,
    );
  }

  const declared = directive(unitText, 'Group');
  const group = declared ?? user;
  if (!UNIX_NAME_PATTERN.test(group)) {
    refuse(
      `adopt: the pre-instance unit '${path}' states Group='${group}', which is not a usable ` +
        `unix name (${UNIX_NAME_PATTERN.source}).`,
    );
  }
  return { user, group };
}

/**
 * THE DAEMON'S CODE AND RUNTIME, OUT OF ITS OWN UNIT — read, never inferred.
 *
 * `WorkingDirectory=` is the site-builder package inside the engine checkout, so the
 * checkout is what stands in front of `publication/site_builder`; `ExecStart=` begins with
 * the pinned bun. Both are then absolute paths this host is DEMONSTRABLY running, which is
 * a better answer than any convention: the retired unit shipped `/opt/dedalo/...` as an
 * example placeholder an operator was told to adjust, and a museum that adjusted it is
 * exactly the museum a guessed topology gets wrong.
 *
 * A unit whose `WorkingDirectory=` does not end in this package's own subdirectory is
 * refused rather than reinterpreted: it is not the daemon this migration is about, and
 * inventing a checkout for it would put a path nobody has ever run into a museum's unit.
 */
function runtimeOf(unitText: string, path: string): { checkoutDir: string; bunBin: string } {
  const working = directive(unitText, 'WorkingDirectory');
  const exec = directive(unitText, 'ExecStart');
  const bunBin = exec === null ? null : (exec.split(/\s+/)[0] as string);

  for (const [what, value] of [
    ['WorkingDirectory=', working],
    ['ExecStart=', bunBin],
  ] as const) {
    if (value === null || !value.startsWith('/')) {
      refuse(
        `adopt: the pre-instance unit '${path}' states no absolute ${what}. The new ` +
          `declaration requires engine.checkout_dir and engine.bun_bin — the daemon's own ` +
          `code and runtime — and this unit is where this host says what they are. State ` +
          `them under 'engine' in the --declare fragment instead.`,
      );
    }
  }

  const suffix = `${sep}${DAEMON_SUBDIR}`;
  if (!(working as string).endsWith(suffix)) {
    refuse(
      `adopt: the pre-instance unit '${path}' runs from WorkingDirectory=` +
        `'${working}', which does not end in '${DAEMON_SUBDIR}'. That path is the site-builder ` +
        `package inside an engine checkout, and the checkout is what engine.checkout_dir ` +
        `names; adoption will not invent one from a directory it does not recognise. State ` +
        `engine.checkout_dir and engine.bun_bin in the --declare fragment.`,
    );
  }

  return {
    checkoutDir: (working as string).slice(0, -suffix.length),
    bunBin: bunBin as string,
  };
}

/** The LAST value of a systemd directive — systemd's own precedence for a repeated key. */
function directive(text: string, name: string): string | null {
  let found: string | null = null;
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith('#') || trimmed.startsWith(';')) continue;
    const match = new RegExp(`^${name}\\s*=\\s*(.*)$`).exec(trimmed);
    if (match) found = (match[1] as string).trim();
  }
  return found === null || found === '' ? null : found;
}

/**
 * EVERY SITE THE DAEMON HOLDS, read out of the daemon's OWN manifests — and where each
 * one's bytes actually are.
 *
 * `<workspaces root>/<slug>/site.json` is the file the daemon writes when a site is created
 * and rewrites when it is published, so it is the only honest answer to "what is this museum
 * actually serving". A directory with no readable manifest is not a site and is skipped
 * silently: a workspaces root accumulates a `.builder/` and whatever an agent turn left.
 */
function observeSites(
  settings: Readonly<Record<string, string>>,
  io: AdoptIo,
): readonly PreInstanceSite[] {
  const root = settings.SITES_ROOT;
  if (!root) {
    refuse(
      `adopt: the pre-instance environment names no SITES_ROOT. That root is where the ` +
        `daemon keeps every site's manifest, and without it adoption cannot tell what this ` +
        `museum publishes — which is the one thing the migration must not get wrong.`,
    );
  }

  const entries = io.readDir(root);
  if (entries === null) {
    refuse(`adopt: the workspaces root '${root}' could not be read.`);
  }

  const sites: PreInstanceSite[] = [];
  for (const slug of entries) {
    const text = io.readFile(join(root, slug, 'site.json'));
    if (text === null) continue;

    let document: { domain?: unknown; published?: unknown };
    try {
      document = JSON.parse(text) as { domain?: unknown; published?: unknown };
    } catch {
      refuse(
        `adopt: '${join(root, slug, 'site.json')}' is not valid JSON. The parser's message is ` +
          `deliberately not quoted — it echoes the token it tripped on, and adoption reads ` +
          `files that sit beside credentials. Run \`jq . '${join(root, slug, 'site.json')}'\`.`,
      );
    }

    const site = document.domain;
    if (typeof site !== 'string' || site === '') {
      refuse(
        `adopt: site '${slug}' has no domain in its manifest. A site's domain is where its ` +
          `webspace is, so a site without one cannot be placed on the adopted host.`,
      );
    }

    const published = document.published as { release?: unknown } | null | undefined;
    const release = published && typeof published.release === 'string' ? published.release : null;
    sites.push(
      Object.freeze({
        slug,
        domain: site,
        publishedRelease: release,
        surfaces: observeSurfaces(settings, slug, io),
      }),
    );
  }

  return Object.freeze(sites);
}

/**
 * WHICH OF THIS SITE'S SURFACES ARE STILL AT THEIR PRE-INSTANCE ADDRESS.
 *
 * A surface is listed only while its old served link is a symlink that is really there. That
 * is the whole idempotence of the relocation below: on a resumed adoption the old links are
 * gone, nothing is listed, and every consumer reads the webspace pair — which is where the
 * bytes now are. A `PREPROD_ROOT`/`PROD_ROOT` the environment never named lists nothing
 * either, which is how an install that was already in the modern shape adopts unchanged.
 */
function observeSurfaces(
  settings: Readonly<Record<string, string>>,
  slug: string,
  io: AdoptIo,
): Readonly<Partial<Record<Surface, PreInstanceSurface>>> {
  const roots: Readonly<Record<Surface, string | undefined>> = {
    preprod: settings.PREPROD_ROOT,
    prod: settings.PROD_ROOT,
  };

  const found: Partial<Record<Surface, PreInstanceSurface>> = {};
  for (const surface of SURFACES) {
    const root = roots[surface];
    if (!root) continue;
    const paths = preInstanceSurface(root, slug, surface);
    const target = io.readLink(paths.linkPath);
    if (target === null) continue;
    found[surface] = Object.freeze({ paths, release: releaseNameFromLinkTarget(paths, target) });
  }
  return Object.freeze(found);
}

/* ────────────────────────────────────────────────────────────────────────────────────
 * Inference
 * ──────────────────────────────────────────────────────────────────────────────────── */

/**
 * THE FACTS A PRE-INSTANCE INSTALL NEVER WROTE DOWN.
 *
 * Three of the declaration's required fields describe the museum's PAIRING with its host —
 * the engine's private directory and OS group, and the web server's group — and the retired
 * arrangement recorded none of them anywhere: they lived in an operator's head, in a
 * hand-copied nginx file and in whatever `useradd` had done. There is nothing on disk to
 * infer them from, and a guessed group is not a cosmetic default (`InstanceManifest`'s own
 * header: a 0640 htpasswd the web server cannot read and a 0660 socket the engine cannot
 * open, discovered at the first request). The TLS mode is the same kind of fact.
 *
 * So they are DECLARED, in a small JSON fragment merged over the inference — one file rather
 * than a row of flags, because it is a fragment of the declaration and validating it as one
 * means the schema refuses a typo instead of the CLI silently ignoring it. Whatever it
 * states wins; everything else is inferred.
 */
export type AdoptOverlay = Record<string, unknown>;

/** What `inferManifest` needs beyond the observation itself. */
export interface InferOptions {
  readonly instance: string;
  /** Where the fleet's declarations live — becomes `paths.config_base`. */
  readonly configDir: string;
  /** The declared fragment, merged over the inference. */
  readonly overlay?: AdoptOverlay;
}

/**
 * BUILD THE DECLARATION THAT DESCRIBES WHAT IS ALREADY THERE. Pure.
 *
 * Two passes over `derive()`, and the second one is not an accident of style: the credential
 * files land in the instance's own `secrets/` directory, and only the layout knows where
 * that is. Spelling `<config base>/<instance>/secrets` here would be a second derivation of
 * a path `layout.ts` owns — the subsystem's defect #1, in its purest form — so the first
 * pass derives a layout WITHOUT credentials in order to ask it, and the second states them.
 *
 * It throws `AdoptionRefused` naming every field it could not infer at once, because an
 * operator fixing them one refusal per run is an operator running a migration six times on a
 * live host.
 */
export function inferManifest(pre: PreInstance, options: InferOptions): InstanceManifest {
  const inferred = inferredBase(pre, options);

  // PASS ONE derives a layout WITHOUT credentials, for one reason: the credential files land
  // in the instance's own `secrets/` directory and only the layout knows where that is.
  // Spelling `<config base>/<instance>/secrets` here would be a second derivation of a path
  // `layout.ts` owns — the subsystem's defect #1, in its purest form — so the layout is asked.
  const layout = derive(validate(mergeOverlay(inferred, options.overlay), pre));

  return validate(mergeOverlay(withCredentialPlacements(inferred, pre, layout), options.overlay), pre);
}

/** Everything the pre-instance environment and unit say, in declaration shape. */
function inferredBase(pre: PreInstance, options: InferOptions): Record<string, unknown> {
  const settings = pre.settings;
  const need = (key: string, what: string): string => {
    const value = settings[key];
    if (value === undefined || value === '') {
      refuse(
        `adopt: the pre-instance environment at '${pre.envPath}' states no ${key}, and ` +
          `${what} cannot be inferred from anything else on this host.`,
      );
    }
    return value;
  };

  const identity = pre.identity;
  const runtime = pre.runtime;
  if (identity === null || runtime === null) {
    refuse(
      `adopt: no pre-instance unit was found at '${pre.legacyUnitPath}', so the service ` +
        `identity — the uid that owns every byte of this museum's tree — cannot be read. ` +
        `Name the installed unit with --unit.`,
    );
  }

  const bins: Record<string, string> = {};
  for (const [driver, key] of Object.entries(DRIVER_BINS)) {
    const value = settings[key];
    if (value) bins[driver] = value;
  }

  return {
    instance: options.instance,
    description: `Adopted from the pre-instance install at ${pre.from}.`,
    identity: { user: identity.user, group: identity.group },
    // The engine PAIRING (private_dir, group) is an operator fact and comes from
    // `--declare`; the two RUNTIME paths are this host's own, read off the unit it is
    // running. Merging them under one key is what lets the fragment state two fields
    // rather than four.
    engine: { checkout_dir: runtime.checkoutDir, bun_bin: runtime.bunBin },
    paths: { config_base: options.configDir },
    // ── THE ROOTS, MAPPED FROM THE SHAPE THAT ACTUALLY EXISTED.
    //
    // The only installer that ever shipped configured the daemon with SITES_ROOT,
    // PREPROD_ROOT and PROD_ROOT — and with no AGENT_HOME, no AUDIT_DIR and no
    // WEBSPACE_BASE, because the daemon of that era had no such keys. Reading the modern
    // names and refusing without them made `adopt` unable to adopt any install that has
    // ever existed, which is a migration path in name only.
    //
    // WHAT KEEPS ITS PLACE and what does not, stated here because an operator has to be
    // told (docs/management/site_builder.md says the same in prose):
    //
    //   SITES_ROOT → roots.workspaces, VERBATIM. Every site's source and its whole git
    //     history stays exactly where it is; nothing about it moves.
    //   AGENT_HOME → absent, so the layout derives one. The retired installer ran
    //     `useradd --create-home` and the vendor CLI kept its state in that home; the new
    //     HOME is 0700 under the state root and starts empty. It holds a CLI's session
    //     cache, never a museum's material.
    //   AUDIT_DIR → absent, so the layout derives one — and the trail is MOVED into it (see
    //     `migrationSteps`). The pre-instance daemon appended to `<SITES_ROOT>/.audit`,
    //     inside a root the service user owns, so an agent turn could erase the record of
    //     itself; §3's matrix puts the audit directory outside the writable set for exactly
    //     that reason, and it cannot be adopted where it stands.
    //   PREPROD_ROOT / PROD_ROOT → each site's own webspace, and the published bytes MOVE
    //     (again `migrationSteps`): the old shape shares one root between every site of the
    //     install and the new one gives each site a webspace, which is what lets a vhost
    //     carry one document root.
    //
    // Each of the three absent fields is left UNSTATED rather than given today's default,
    // for the reason `inferredLimits` gives about caps: writing a derived value into a
    // museum's declaration freezes it there.
    roots: {
      workspaces: need('SITES_ROOT', 'the workspaces root'),
      ...(settings.AGENT_HOME ? { home: settings.AGENT_HOME } : {}),
      ...(settings.AUDIT_DIR ? { audit: settings.AUDIT_DIR } : {}),
    },
    ...(settings.WEBSPACE_BASE ? { webspace_base: settings.WEBSPACE_BASE } : {}),
    publication_api: { url: need('PUBLICATION_API_URL', "the museum's Publication API") },
    agent: {
      driver: (settings.AGENT_DRIVER ?? 'claude_code') as AgentDriverId,
      ...(Object.keys(bins).length > 0 ? { bins } : {}),
    },
    serving: {
      preprod: {
        enabled: true,
        ...(settings.PREPROD_HOST_PREFIX ? { host_prefix: settings.PREPROD_HOST_PREFIX } : {}),
        auth: { mode: 'none' },
      },
      prod: { tls: { mode: settings.PROD_URL_SCHEME === 'http' ? 'none' : 'letsencrypt' } },
    },
    sites: pre.sites.map(site => ({ slug: site.slug, domain: site.domain })),
    limits: inferredLimits(settings),
  };
}

/**
 * WHERE EACH MIGRATED CREDENTIAL WILL LIVE, asked of the layout rather than spelled.
 *
 * Two keys are not declared under `secrets` and both for a reason the layout owns: the shared
 * bearer is CANONICAL (`credentialSources()` places it, and the pairing fragment quotes the
 * same expression), and the Publication API key is stated as a PATH on `publication_api`
 * because the rendered env carries that path and never the value.
 */
function withCredentialPlacements(
  inferred: Record<string, unknown>,
  pre: PreInstance,
  layout: InstanceLayout,
): Record<string, unknown> {
  const secrets: Record<string, string> = {};
  for (const key of Object.keys(pre.credentials).sort()) {
    if (key === SERVICE_TOKEN || key === PUBLICATION_API_KEY) continue;
    if (!SECRET_KEY_PATTERN.test(key)) continue;
    secrets[key] = layout.secretPath(key);
  }

  // An operator's existing key file is kept VERBATIM: it sits outside the directories this
  // tool owns, and re-chowning somebody else's file is not adoption.
  const keyPath =
    pre.credentials[PUBLICATION_API_KEY] !== undefined
      ? layout.secretPath(PUBLICATION_API_KEY)
      : pre.settings.PUBLICATION_API_KEY_FILE;

  return {
    ...inferred,
    ...(Object.keys(secrets).length > 0 ? { secrets } : {}),
    ...(keyPath
      ? { publication_api: { ...(inferred.publication_api as Record<string, unknown>), key_path: keyPath } }
      : {}),
  };
}

/** Env key per driver, so a pinned binary survives the migration. Layout owns the names. */
const DRIVER_BINS: Readonly<Record<string, string>> = Object.freeze({
  claude_code: 'CLAUDE_CODE_BIN',
  opencode: 'OPENCODE_BIN',
  pi: 'PI_BIN',
});

/** Env key → declaration field, for the caps a pre-instance install had stated. */
const LIMIT_FIELDS: Readonly<Record<string, string>> = Object.freeze({
  MAX_SITES: 'max_sites',
  MAX_CONCURRENT_SESSIONS: 'max_concurrent_sessions',
  SESSION_TURN_TIMEOUT_MS: 'session_turn_timeout_ms',
  INSTALL_TIMEOUT_MS: 'install_timeout_ms',
  BUILD_TIMEOUT_MS: 'build_timeout_ms',
  SITE_DISK_QUOTA_MB: 'site_disk_quota_mb',
  RELEASES_RETAINED: 'releases_retained',
});

/**
 * The caps this install actually stated. An UNSTATED one stays unstated — writing today's
 * default into a museum's declaration would freeze it there, so that the day the daemon
 * changed the number nothing on this host would move. `render/env.ts` makes the same
 * argument about the rendered file.
 */
function inferredLimits(settings: Readonly<Record<string, string>>): Record<string, number> {
  const limits: Record<string, number> = {};
  for (const [key, field] of Object.entries(LIMIT_FIELDS)) {
    const raw = settings[key];
    if (raw === undefined || raw === '') continue;
    const value = Number(raw);
    if (Number.isInteger(value) && value > 0) limits[field] = value;
  }
  return limits;
}

/** Two levels of merge — the declaration is two levels deep and no more. */
function mergeOverlay(base: Record<string, unknown>, overlay?: AdoptOverlay): Record<string, unknown> {
  if (!overlay) return base;
  const merged: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(overlay)) {
    const existing = merged[key];
    merged[key] =
      isPlainObject(existing) && isPlainObject(value)
        ? mergeOverlay(existing, value as AdoptOverlay)
        : value;
  }
  return merged;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Validate the candidate with the SAME parser a hand-written declaration goes through.
 *
 * Not a convenience: adoption is a second entry point into `derive()`, and several modules
 * downstream (`render/env.ts` says so in its header) re-check strings on their own account
 * precisely because "an adopted host's manifest was never validated at all". After this it
 * has been. A parse failure is re-voiced as the operator's actual next move.
 */
function validate(candidate: Record<string, unknown>, pre: PreInstance): InstanceManifest {
  try {
    return parseManifest(candidate, { source: `${pre.envPath} (inferred)` });
  } catch (error) {
    refuse(
      `adopt: the declaration inferred from '${pre.envPath}' is not complete.\n` +
        `${(error as Error).message}\n` +
        `A pre-instance install records nothing about the engine it is paired with, the ` +
        `web server's group, or how the public vhost terminates TLS — those live in an ` +
        `operator's head and in a hand-copied vhost. State them in a JSON fragment and ` +
        `pass it with --declare; it is merged over everything inferred here.`,
    );
  }
}

/* ────────────────────────────────────────────────────────────────────────────────────
 * The migration steps
 * ──────────────────────────────────────────────────────────────────────────────────── */

/**
 * ONE STEP OF THE MIGRATION. It never carries a credential VALUE — a step is described in a
 * report and printed in a terminal, and the value is looked up from `PreInstance` by the
 * executor at the moment it writes the file.
 */
export type MigrationStep =
  | { readonly kind: 'exec'; readonly what: string; readonly argv: readonly string[] }
  | { readonly kind: 'declaration'; readonly path: string; readonly body: string }
  /** §5's claim on a root that already holds a museum's data. See `migrationSteps`. */
  | { readonly kind: 'marker'; readonly root: string; readonly path: string; readonly body: string }
  /**
   * A tree the new layout keeps somewhere else, RENAMED whole. One rename per tree, never a
   * file-by-file copy: a rename is atomic, keeps every mode and owner inside, and either
   * happens or does not. See `migrationSteps` for the two that exist and why each moves.
   */
  | { readonly kind: 'relocate'; readonly what: string; readonly from: string; readonly to: string }
  /** The served link for a relocated surface, re-made at its new address. */
  | { readonly kind: 'serve'; readonly what: string; readonly path: string; readonly target: string }
  | { readonly kind: 'secret'; readonly key: string; readonly path: string }
  | { readonly kind: 'retire_env'; readonly from: string; readonly to: string };

export const SECRET_MODE = Object.freeze({ owner: 'root', group: 'root', mode: 0o600 });

/**
 * WHAT THE RETIRED ENVIRONMENT FILE MUST BECOME. The same row as a credential file, because
 * that is what it is: a plaintext copy of every credential this migration moved. See
 * `retireEnv()` for why a rename alone leaves the door open.
 */
export const RETIRED_ENV_MODE = SECRET_MODE;

/**
 * WHAT ADOPTION ITSELF WILL DO, IN ORDER, AS A VALUE. Pure, like `plan()` and for the same
 * reason: the ORDER is the whole safety argument and a gate must be able to read it without
 * a host.
 *
 * The order:
 *
 *   1. STOP AND DISABLE THE PRE-INSTANCE DAEMON. First, because two daemons pointed at one
 *      workspaces root will interleave git operations and build outputs in the same trees.
 *      It is a `stop`, not a `kill`: the old unit's own shutdown is what commits an
 *      in-flight session's work. The museum's SITES keep serving throughout — they are
 *      static bytes behind a web server and no daemon is in that path.
 *   2. WRITE THE DECLARATION. Everything after this is generated from it.
 *   3. CLAIM THE ROOTS. §5's marker law says an EMPTY unmarked root is adopted and a
 *      NON-EMPTY unmarked root is REFUSED — because there is something there to lose — and
 *      every root of a pre-instance install is non-empty and unmarked. `plan()` therefore
 *      cannot provision an adopted host at all until somebody states that these trees are
 *      this instance's, and that statement is not one a provisioner may make on its own
 *      evidence: the whole value of the marker is that it was written deliberately. Running
 *      `provision adopt --instance <i>` IS the deliberate act, so it is the one place the
 *      claim is written. A root already carrying ANOTHER instance's marker stops the
 *      migration dead — that is a second museum's tree, and there is no flag for it.
 *   4. MOVE THE CREDENTIALS out of the env file and into root-owned 0600 files.
 *   5. RETIRE THE ENV FILE — last of the five, so that a run interrupted anywhere before it
 *      leaves the original file exactly where it was, still holding everything.
 *
 * Then the caller runs the ordinary `plan()`/`apply()`, which creates the group, installs
 * the unit and the vhosts, writes the site table and the pairing fragment, and enables the
 * new service. The roots it finds are already claimed, so it adopts them rather than
 * refusing them, and it stamps any root this instance does not yet have at all.
 */
export function migrationSteps(pre: PreInstance, layout: InstanceLayout, manifest: InstanceManifest): MigrationStep[] {
  const steps: MigrationStep[] = [];

  if (pre.legacyUnitPresent) {
    const unit = basename(pre.legacyUnitPath);
    steps.push({ kind: 'exec', what: `stop the pre-instance daemon (${unit})`, argv: ['systemctl', 'stop', unit] });
    steps.push({
      kind: 'exec',
      what: `disable the pre-instance daemon (${unit}) — it is superseded by ${layout.unitName}`,
      argv: ['systemctl', 'disable', unit],
    });
  }

  steps.push({
    kind: 'declaration',
    path: layout.manifestPath,
    body: `${JSON.stringify(manifest, null, 2)}\n`,
  });

  // THE MOVES COME BEFORE THE CLAIMS, and that order is load-bearing: a webspace this
  // migration creates and fills would otherwise be a NON-EMPTY UNMARKED root when `plan()`
  // looked at it, which §5 refuses — the museum's own bytes read as another instance's.
  // Moving first means every root exists and holds what it will hold at the moment it is
  // claimed.
  steps.push(...relocations(pre, layout));

  const content = markerContent(layout.instance);
  for (const root of markedRoots(layout)) {
    steps.push({ kind: 'marker', root, path: markerPath(root), body: content });
  }

  const sources = credentialSources(layout);
  for (const key of Object.keys(pre.credentials).sort()) {
    const path = sources[key];
    if (path === undefined) {
      // LOUD, never a silent skip. This means the declaration — after `--declare` was merged
      // over the inference — names no file for a credential the old environment really held,
      // so the value would be left behind in the retired file and the daemon would boot
      // without it. The value is safe (nothing is deleted); the museum's provider is not.
      refuse(
        `adopt: '${pre.envPath}' holds a value for ${key}, and the declaration being adopted ` +
          `names no file for it. Every credential must have somewhere to go — declare it under ` +
          `'secrets' in the --declare fragment, or remove it from the environment file.`,
      );
    }
    steps.push({ kind: 'secret', key, path });
  }

  if (!pre.envAlreadyRetired) {
    steps.push({ kind: 'retire_env', from: pre.envPath, to: join(pre.from, RETIRED_ENV) });
  }

  return steps;
}

/**
 * WHAT THE NEW LAYOUT KEEPS SOMEWHERE ELSE — the only two things adoption moves, and the
 * reason each one cannot stay.
 *
 * 1. EVERY PUBLISHED SURFACE. The pre-instance shape is one `PREPROD_ROOT` and one
 *    `PROD_ROOT` shared by every site (`<root>/.releases/<slug>`, served through
 *    `<root>/<slug>`); the derived layout gives each site a webspace holding both its
 *    stores and both its links, because a vhost carries ONE document root and a per-site
 *    domain needs a per-site tree. There is no declaration that expresses the old shape, so
 *    the store is RENAMED — whole, once, keeping every release and every mode inside it —
 *    and the served link is re-made at the new address pointing at the SAME release. A
 *    surface already at its new address is not listed at all (see `observeSurfaces`), so a
 *    second run moves nothing.
 * 2. THE AUDIT TRAIL, when the environment named no `AUDIT_DIR`. The pre-instance daemon
 *    appended to `<SITES_ROOT>/.audit/audit.jsonl` — inside a root the service user owns,
 *    where an agent turn could unlink the record of itself. §3's matrix puts the audit
 *    directory outside the writable set precisely so it cannot, which means this one file
 *    has nowhere to stay.
 *
 * WHAT IS SERVED WHILE THIS HAPPENS. The old vhost points at the old link, so between the
 * rename and the reload of the new vhost that path resolves to nothing. The window is one
 * rename plus one `apply` long, no byte is copied and none is deleted, and the operator is
 * told to expect it (docs/management/site_builder.md). A rename that would CROSS a
 * filesystem fails loudly with both paths named, having moved nothing.
 */
function relocations(pre: PreInstance, layout: InstanceLayout): MigrationStep[] {
  const steps: MigrationStep[] = [];

  for (const site of pre.sites) {
    const placed = layout.sites.find(candidate => candidate.slug === site.slug);
    if (!placed) {
      refuse(
        `adopt: site '${site.slug}' is on this host and the declaration being adopted does ` +
          `not carry it, so its published bytes have nowhere to go.`,
      );
    }
    for (const surface of SURFACES) {
      const current = site.surfaces[surface];
      if (current === undefined) continue;
      steps.push({
        kind: 'relocate',
        what: `site '${site.slug}'s ${surface} release store`,
        from: current.paths.storeDir,
        to: (placed as SiteLayout).releasesDir(surface),
      });
      steps.push({
        kind: 'serve',
        what:
          `site '${site.slug}'s ${surface} document root, serving ` +
          `${current.release === null ? 'no release yet' : `'${current.release}'`} as before`,
        path: (placed as SiteLayout).linkPath(surface),
        target: servedTarget(placed as SiteLayout, surface, current.release),
      });
    }
  }

  // The audit trail, only when the install kept it where the retired daemon put it. An
  // environment that names AUDIT_DIR is describing a directory an operator chose, and the
  // inference keeps that directory verbatim — there is nothing to move.
  if (!pre.settings.AUDIT_DIR && pre.settings.SITES_ROOT) {
    steps.push({
      kind: 'relocate',
      what: `the audit trail, out of a root the service user can unlink from`,
      from: join(pre.settings.SITES_ROOT, '.audit', AUDIT_FILE_NAME),
      to: layout.auditFile,
    });
  }

  return steps;
}

/**
 * The RELATIVE target a served link must carry, which is `promote.ts`'s own rule ("so the
 * surface tree stays relocatable") and the one this provisioner's placeholder links follow.
 * A surface that was serving nothing points at the store, exactly as a freshly provisioned
 * site does.
 */
function servedTarget(site: SiteLayout, surface: Surface, release: string | null): string {
  const store = site.releasesDir(surface);
  return relative(site.webspace, release === null ? store : join(store, release));
}

/** One step, in words an operator reads. NEVER a value — see `MigrationStep`. */
export function describeMigration(step: MigrationStep): string {
  switch (step.kind) {
    case 'exec':
      return `${step.what}: ${step.argv.join(' ')}`;
    case 'declaration':
      return `write the declaration ${step.path}`;
    case 'marker':
      return `claim ${step.root} for this instance (${step.path})`;
    case 'relocate':
      return `move ${step.what}: ${step.from} → ${step.to}`;
    case 'serve':
      return `serve ${step.what}: ${step.path} → ${step.target}`;
    case 'secret':
      return `move ${step.key} out of the environment file and into ${step.path} (0600 root:root)`;
    case 'retire_env':
      return `rename ${step.from} to ${step.to} — retired, never deleted`;
  }
}

/* ────────────────────────────────────────────────────────────────────────────────────
 * Executing them
 * ──────────────────────────────────────────────────────────────────────────────────── */

export interface MigrationOutcome {
  readonly step: MigrationStep;
  readonly status: 'done' | 'skipped' | 'failed';
  /** WHY, in one line. Paths, keys and exit codes — never a byte of a credential. */
  readonly detail: string;
}

export interface MigrationReport {
  readonly ok: boolean;
  readonly outcomes: readonly MigrationOutcome[];
  /**
   * Did this run move any BYTES? False is what a resumed migration reports.
   *
   * Deliberately not "did any step report done". The two `systemctl` steps are re-issued on
   * every adopt and report done every time — a `stop` on a unit that is already stopped
   * succeeds — and that is the safe direction: re-asserting that a superseded daemon is not
   * running costs nothing, while skipping it on the strength of a file still being on disk
   * would leave two daemons pointed at one workspaces root. What must be provably ONCE is
   * every write: the declaration, the root markers, the credentials, the retirement.
   */
  readonly changed: boolean;
  readonly failure: MigrationOutcome | null;
}

/** Does this step move bytes? The `changed` question, answered in one place. */
export function movesBytes(step: MigrationStep): boolean {
  return step.kind !== 'exec';
}

/**
 * RUN THE STEPS, IN ORDER, STOPPING AT THE FIRST FAILURE — and write only what has not
 * already happened.
 *
 * Every step is guarded by the question "is this already true?", which is what makes a
 * second adopt a row of `skipped`. The guards are not optimisations: re-writing a credential
 * file would replace a museum's SERVICE_TOKEN with the copy in a retired env file, and
 * re-writing the declaration would silently revert an operator's edit to it.
 */
export function applyMigration(steps: readonly MigrationStep[], pre: PreInstance, io: AdoptIo): MigrationReport {
  const outcomes: MigrationOutcome[] = [];
  let failure: MigrationOutcome | null = null;
  let changed = false;

  for (const step of steps) {
    if (failure) {
      outcomes.push({ step, status: 'skipped', detail: 'not reached — an earlier step failed' });
      continue;
    }
    const outcome = runStep(step, pre, io);
    outcomes.push(outcome);
    if (outcome.status === 'failed') failure = outcome;
    if (outcome.status === 'done' && movesBytes(step)) changed = true;
  }

  return Object.freeze({ ok: failure === null, outcomes: Object.freeze(outcomes), changed, failure });
}

/**
 * ONE STEP. A thin dispatch over four small functions, each of which is the whole of what its
 * own step decides — including the guard that makes it a no-op when it has already happened.
 * The guards are not optimisations: re-writing a credential file would replace a museum's
 * SERVICE_TOKEN with the copy in a retired env file, and re-writing the declaration would
 * silently revert an operator's edit to it.
 */
function runStep(step: MigrationStep, pre: PreInstance, io: AdoptIo): MigrationOutcome {
  try {
    switch (step.kind) {
      case 'exec':
        return runExec(step, io);
      case 'declaration':
        return writeDeclaration(step, io);
      case 'marker':
        return claimRoot(step, io);
      case 'relocate':
        return relocateTree(step, io);
      case 'serve':
        return serveLink(step, io);
      case 'secret':
        return placeCredential(step, pre, io);
      case 'retire_env':
        return retireEnv(step, io);
    }
  } catch (error) {
    return { step, status: 'failed', detail: (error as Error).message };
  }
}

/**
 * A unit that is not installed, not loaded or already disabled reports non-zero, and that is
 * the resumed run's normal answer rather than a failure. What must NOT be tolerated is
 * silence: the exit status is reported verbatim either way.
 */
function runExec(step: MigrationStep & { kind: 'exec' }, io: AdoptIo): MigrationOutcome {
  const result = io.exec(step.argv);
  return result.code === 0
    ? { step, status: 'done', detail: step.argv.join(' ') }
    : {
        step,
        status: 'skipped',
        detail: `${step.argv.join(' ')} exited ${result.code} — already done, or never installed`,
      };
}

function writeDeclaration(step: MigrationStep & { kind: 'declaration' }, io: AdoptIo): MigrationOutcome {
  const current = io.readFile(step.path);
  if (current === step.body) {
    return { step, status: 'skipped', detail: 'the declaration on disk is already this one' };
  }
  if (current !== null) {
    return {
      step,
      status: 'failed',
      detail:
        `'${step.path}' already exists and is NOT what adoption infers. That file is what ` +
        `every artifact on this host is generated from; replacing it with an inference is ` +
        `not something this command may do silently.`,
    };
  }
  io.mkdir(dirname(step.path));
  io.writeFile(step.path, step.body, 0o640);
  io.chown(step.path, 'root', 'root');
  return { step, status: 'done', detail: `wrote ${step.path}` };
}

/** §5's claim. A root already claimed by ANOTHER instance stops the migration dead. */
function claimRoot(step: MigrationStep & { kind: 'marker' }, io: AdoptIo): MigrationOutcome {
  const current = io.readFile(step.path);
  if (current === step.body) {
    return { step, status: 'skipped', detail: `${step.root} already declares itself this instance's` };
  }
  if (current !== null) {
    return {
      step,
      status: 'failed',
      detail:
        `'${step.root}' already declares itself ANOTHER instance's (${step.path}). Adoption ` +
        `stops here: claiming it would provision this museum on top of that one's tree, and ` +
        `nothing about a decommission or a typo makes that recoverable.`,
    };
  }
  if (io.stat(step.root) === null) {
    // Not there yet — `plan()` creates it and stamps it in the same phase, which is the
    // ordinary path for a root a pre-instance install never had.
    return { step, status: 'skipped', detail: `${step.root} does not exist yet; the plan creates and stamps it` };
  }
  io.writeFile(step.path, step.body, MARKER_MODE.mode);
  io.chown(step.path, MARKER_MODE.owner, MARKER_MODE.group);
  return { step, status: 'done', detail: `${step.root} now declares itself this instance's` };
}

/**
 * A CREDENTIAL IS NEVER REWRITTEN — `plan()`'s own law, for the same reason: the value is the
 * museum's and this tool does not hold it. On a resumed run the file already in place is the
 * one the daemon is authenticating with.
 */
function placeCredential(step: MigrationStep & { kind: 'secret' }, pre: PreInstance, io: AdoptIo): MigrationOutcome {
  if (io.stat(step.path) !== null) {
    return { step, status: 'skipped', detail: `${step.path} is already in place` };
  }
  const value = pre.credentials[step.key];
  if (value === undefined) {
    return { step, status: 'failed', detail: `no value for ${step.key} was read from the environment file` };
  }
  io.mkdir(dirname(step.path));
  io.writeFile(step.path, `${value}\n`, SECRET_MODE.mode);
  io.chown(step.path, SECRET_MODE.owner, SECRET_MODE.group);
  return { step, status: 'done', detail: `${step.key} placed at ${step.path}, 0600 root:root` };
}

/**
 * ONE RENAME, GUARDED FROM BOTH SIDES.
 *
 * Absent source → the move already happened (or there was never anything there), which is
 * what makes a resumed adoption a row of `skipped`. Occupied destination with the source
 * still present → FAILED, never a merge: renaming onto an existing tree is how a museum's
 * releases would be buried under a half-migration nobody could unpick.
 *
 * A rename that would cross a filesystem is re-voiced rather than passed through as
 * `EXDEV`: it is the one failure here an operator can actually act on, and the action is
 * theirs to take — this tool does not copy a museum's published bytes.
 */
function relocateTree(step: MigrationStep & { kind: 'relocate' }, io: AdoptIo): MigrationOutcome {
  if (io.stat(step.from) === null) {
    return { step, status: 'skipped', detail: `'${step.from}' is not there — already moved, or never was` };
  }
  if (io.stat(step.to) !== null) {
    return {
      step,
      status: 'failed',
      detail:
        `'${step.to}' already exists and '${step.from}' is still there. Moving onto it would ` +
        `bury whatever is already at the destination; nothing was moved.`,
    };
  }
  io.mkdir(dirname(step.to));
  try {
    io.rename(step.from, step.to);
  } catch (error) {
    const message = (error as Error).message;
    if (/EXDEV/.test(message)) {
      return {
        step,
        status: 'failed',
        detail:
          `'${step.from}' and '${step.to}' are on different filesystems, so this move cannot ` +
          `be a rename. Nothing was moved and nothing was lost: copy it yourself, preserving ` +
          `ownership, modes and symlinks (\`cp -a\`), remove the original when you are ` +
          `satisfied, and run this command again.`,
      };
    }
    throw error;
  }
  return { step, status: 'done', detail: `${step.from} → ${step.to}` };
}

/**
 * The served link at its new address. CREATE-IF-ABSENT, like `plan()`'s own link action and
 * for a sharper version of the same reason: an existing link here is one this migration
 * already made, and re-pointing it would roll a museum's live site to whatever the
 * observation said an hour ago.
 */
function serveLink(step: MigrationStep & { kind: 'serve' }, io: AdoptIo): MigrationOutcome {
  const facts = io.stat(step.path);
  if (facts?.type === 'symlink') {
    return { step, status: 'skipped', detail: `${step.path} is already a link — a published site is never re-pointed` };
  }
  if (facts) {
    return {
      step,
      status: 'failed',
      detail:
        `'${step.path}' is a ${facts.type} where the served link must be. Publishing swaps ` +
        `that path with an atomic rename, which cannot replace a directory; nothing was written.`,
    };
  }
  io.mkdir(dirname(step.path));
  io.symlink(step.path, step.target);
  return { step, status: 'done', detail: `${step.path} → ${step.target}` };
}

/**
 * RETIRING THE PRE-INSTANCE ENVIRONMENT IS A RENAME AND A REVOCATION — never just a rename.
 *
 * The retired installer wrote that file `chown $SERVICE_USER:$SERVICE_GROUP`, `chmod 600`
 * (its §4), and it holds the SERVICE_TOKEN and every provider key in plaintext. Renaming it
 * and stopping there leaves the daemon's own uid — and therefore every agent turn that runs
 * as it — owning and reading a file with all five credentials in it, which undoes the entire
 * point of moving them into `LoadCredential`: they would be under `$CREDENTIALS_DIRECTORY`
 * AND one `cat` away in the directory the daemon starts in.
 *
 * So the file ends up ROOT-OWNED AND 0600, and the mode is asserted rather than assumed. It
 * is still kept — it is the only record of how this museum's daemon was configured before
 * the migration, and it is what makes a second `adopt` able to infer the same facts — but it
 * is kept as root's.
 *
 * A REVOCATION THAT FAILED IS A FAILED STEP, loudly, even though the bytes moved: the whole
 * migration stops rather than continuing to a report that says the credentials were secured
 * when they are readable by the uid they were being taken away from. Nothing is lost — the
 * file is at its new name and the operator is told the one command to run.
 */
function retireEnv(step: MigrationStep & { kind: 'retire_env' }, io: AdoptIo): MigrationOutcome {
  if (io.stat(step.to) !== null) {
    return { step, status: 'failed', detail: `'${step.to}' already exists; the retired copy would be overwritten` };
  }
  if (io.stat(step.from) === null) {
    return { step, status: 'skipped', detail: `'${step.from}' is already gone` };
  }
  io.rename(step.from, step.to);

  try {
    io.chown(step.to, RETIRED_ENV_MODE.owner, RETIRED_ENV_MODE.group);
    io.chmod(step.to, RETIRED_ENV_MODE.mode);
  } catch (error) {
    return {
      step,
      status: 'failed',
      detail:
        `'${step.to}' was renamed and could NOT be taken away from the service user: ` +
        `${(error as Error).message}. That file holds this museum's bearer and every provider ` +
        `key in plaintext, and the daemon's own uid still owns it. Run ` +
        `\`chown root:root '${step.to}' && chmod 600 '${step.to}'\` and adopt again.`,
    };
  }

  const facts = io.stat(step.to);
  const mode = facts?.mode === undefined ? undefined : facts.mode & 0o7777;
  if (facts?.owner !== RETIRED_ENV_MODE.owner || (mode !== undefined && mode !== RETIRED_ENV_MODE.mode)) {
    return {
      step,
      status: 'failed',
      detail:
        `'${step.to}' is still ${facts?.owner ?? '(unknown)'}:${facts?.group ?? '(unknown)'} ` +
        `${mode === undefined ? '(mode unknown)' : `0${mode.toString(8).padStart(3, '0')}`} after ` +
        `being retired; it must be root:root 0600 because it holds every credential this ` +
        `migration just moved. Nothing further was done.`,
    };
  }

  return {
    step,
    status: 'done',
    detail: `${step.from} → ${step.to}, now root:root 0600 — the service user can no longer read it`,
  };
}
