/**
 * THE LAYOUT — the one module that knows a naming, placement or ownership convention.
 *
 * An INSTANCE is one museum's site-builder tenancy: its own daemon process, its own unix
 * user, its own state roots, its own webspaces. Every host artifact that names an instance
 * — the systemd unit, the per-site vhosts, the rendered env, the htpasswd, the engine
 * pairing fragment, the credential files, the directories and the socket — is GENERATED
 * from a single declaration (/etc/dedalo_sites/instances/<i>/instance.json) by an
 * idempotent provisioner. This module is the layer underneath the provisioner: it turns
 * that declaration into every derived NAME, PATH, OWNER and MODE, and it is the only place
 * in the tree allowed to decide what those are.
 *
 * WHY IT IS ONE MODULE, AND WHY IT IS THIS SMALL.
 * The artifacts it replaces spelled the same facts several times over and disagreed: the
 * service identity was hardcoded once in the installer and once in the unit file, with no
 * templating between them, so an operator who overrode the roots got a daemon running as
 * a user nobody had declared; and the unit's ReadWritePaths= named two literal roots that
 * did NOT follow those overrides, which under ProtectSystem=strict is not an install-time
 * failure but a read-only filesystem error at publish time, on a real museum's site, at
 * the worst possible moment. A convention duplicated is a convention that drifts. So the
 * rule here is absolute: `derive()` is the only source of a path, `readWritePaths()` is
 * the only source of the writable set, `MODES` is the only source of an owner or a mode,
 * and all three read the SAME layout object — the unit cannot disagree with the
 * directories it is confining, because it is not told about them separately.
 *
 * WHY IT IS PURE, AND WHAT IT MAY IMPORT.
 * No filesystem access, no config singleton, no process.env, NO ZOD: a repo-side tripwire
 * renders every artifact and compares it against what is committed, and it does so
 * WITHOUT this package's node_modules. Anything this file imports, that gate must be able
 * to import too, so the dependency budget is `node:` builtins and package-local siblings
 * that are themselves dependency-free (`../util/paths`, `../util/slug`). The manifest
 * arrives here as an ALREADY-VALIDATED plain object — `src/provision/schema.ts` owns the
 * zod grammar, IMPORTS every constant and predicate below, and validates INTO the
 * `InstanceManifest` type declared here, so `derive(parseManifest(doc))` is the whole
 * contract between the two files. This module re-checks the few grammars whose violation
 * would put a caller-controlled string into a filesystem path, because it is the last
 * function before a string becomes a path.
 *
 * WHY EVERY CONSTANT LIVES HERE AND NOWHERE ELSE.
 * This file and the schema were once written blind to each other, and each declared its
 * own instance grammar, its own prefix, its own /home/www and its own containment
 * predicate. They disagreed — about the prefix's length, about who owned a webspace, about
 * whether an override was honoured at all — and every disagreement was invisible because
 * no caller ever composed the two. One owner per grammar is the property that makes those
 * defects impossible to write, not a stylistic preference.
 *
 * Precedent for the whole shape: src/core/media/protection.ts in the engine — pure
 * builders, a body hash in the header, write only on drift.
 */

import { isAbsolute, join, resolve, sep } from 'node:path';
import { isWithin } from '../util/paths';
import { SLUG_PATTERN } from '../util/slug';

/* ────────────────────────────────────────────────────────────────────────────────────
 * The one constant, and everything spelled from it
 * ──────────────────────────────────────────────────────────────────────────────────── */

/**
 * THE prefix. Every user, group, unit, vhost file and host namespace below is spelled
 * from this string and from nothing else — change it here and the whole host layout
 * moves together. It is deliberately the only place in this tree where the project's
 * name appears as a literal: a reviewer (or a grep-shaped gate) finding it twice has
 * found a convention with two owners.
 */
export const USER_PREFIX = 'dedalo-site-';

/** The bare project name — the prefix without its trailing separator. */
const PROJECT = USER_PREFIX.slice(0, -1);

/** The plural namespace used for host-level directories in the hyphen spelling (/run). */
const NAMESPACE = `${PROJECT}s`;

/** The same namespace in the underscore spelling /etc and /var/lib already use. */
const NAMESPACE_SNAKE = NAMESPACE.replace(/-/g, '_');

/**
 * The name of the marker file a root plants to declare which instance owns it.
 *
 * The daemon refuses to boot against a root that does not declare itself — the same law
 * the engine applies to its test database (`dedalo_test_marker`) and its test media root
 * (`.dedalo_test_media`). A path is a claim; a marker is the directory itself saying
 * whose it is. It lives here because it is a naming convention, and this is where naming
 * conventions live: the boot check, the provisioner and the test fixture must all be
 * spelling the same filename or the guarantee is decorative — which is why
 * `tests/fixtures/instance.ts` imports this constant rather than repeating the literal.
 */
export const INSTANCE_MARKER = `.${PROJECT.replace(/-/g, '_')}_instance`;

/**
 * A marker's ENTIRE content: the instance name and a newline.
 *
 * Owned here for the same reason the filename is. The content is a bare name and not a
 * document so the boot check can be a string compare rather than a parse — which is what
 * makes "this root belongs to ANOTHER instance" exactly as refusable as "this root
 * declares nothing", instead of a JSON shape somebody has to decide how lenient to be
 * about while holding an `rm -rf`.
 */
export function markerContent(instance: string): string {
  return `${instance}\n`;
}

/** The Linux user-name ceiling: `useradd` refuses anything longer (LOGIN_NAME_MAX - 1). */
export const MAX_USERNAME_LENGTH = 32;

/**
 * The longest instance name we accept. The bound is ARITHMETIC, not taste: the name
 * becomes a unix user name as `${USER_PREFIX}${instance}`, so the prefix's length plus
 * this number must stay within the ceiling above. A longer name would not fail here or in
 * any rendered file; it would fail in `useradd` on the museum's host, halfway through a
 * provisioning run, complaining about a name that is not the one written in instance.json.
 * So the ceiling is enforced at the declaration, where it is still legible.
 *
 * The relation is ASSERTED below rather than described, because a comment carrying an
 * arithmetic claim is a comment that can be quietly wrong about it — two earlier written
 * statements of this very rule put the prefix at 13 characters, and it is 12. The check
 * costs nothing, cannot drift when the prefix changes, and is the reason no other file
 * (the specification included) may restate the sum as a literal: what is checkable is
 * checked here, and quoted from here.
 */
export const MAX_INSTANCE_LENGTH = 19;

if (USER_PREFIX.length + MAX_INSTANCE_LENGTH > MAX_USERNAME_LENGTH) {
  throw new Error(
    `layout: '${USER_PREFIX}' (${USER_PREFIX.length}) plus a ${MAX_INSTANCE_LENGTH}-character ` +
      `instance name exceeds the ${MAX_USERNAME_LENGTH}-character unix user-name ceiling. ` +
      `Shorten one of the two — every instance would fail at useradd, not here.`,
  );
}

/**
 * THE INSTANCE NAME GRAMMAR — 2 to MAX_INSTANCE_LENGTH characters, lowercase, starting
 * with a letter. Built from the constant above so the bound has ONE spelling: a pattern
 * and a ceiling that are written separately are a pattern and a ceiling that will one day
 * disagree.
 *
 * Lowercase-and-hyphen only, leading letter: the same reasoning as the site slug — this
 * string is a user name, a group name, a directory name, a systemd unit instance and a
 * filename, and every one of those has a different opinion about anything else.
 */
export const INSTANCE_PATTERN = new RegExp(`^[a-z][a-z0-9-]{1,${MAX_INSTANCE_LENGTH - 1}}$`);

/**
 * A provider credential's key: it becomes a FILENAME under secrets/, a systemd
 * LoadCredential id and an environment variable name.
 */
export const SECRET_KEY_PATTERN = /^[A-Z][A-Z0-9_]{0,63}$/;

/**
 * A site's public domain: it becomes a directory name under the webspace base AND lands
 * verbatim in a generated vhost's server_name / ServerName. Lowercase, at least two
 * labels, 63 characters per label and 253 overall (the DNS bounds), no leading or
 * trailing hyphen in a label, nothing that could close a directive or climb a path.
 */
export const DOMAIN_PATTERN =
  /^(?=.{1,253}$)[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/;

/** A single DNS label — the preprod host prefix, prepended to a site's domain. */
export const HOST_LABEL_PATTERN = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;

/**
 * A unix user or group name that this file does NOT derive — the web server's group, the
 * paired engine's group, and the user/group of an ADOPTED instance (see `derive()`). Same
 * ceiling as a derived identity for the same reason, plus the leading-underscore form some
 * distros use for system accounts.
 */
export const UNIX_NAME_PATTERN = /^[a-z_][a-z0-9_-]{0,31}$/;

/** A preprod reviewer's login name: it becomes a field in a generated htpasswd line. */
export const LOGIN_NAME_PATTERN = /^[a-z][a-z0-9._-]{0,31}$/;

/* ────────────────────────────────────────────────────────────────────────────────────
 * The grammars of strings that reach a RENDERED artifact
 *
 * Every one of these lands verbatim inside a root-owned web-server configuration file, a
 * systemd unit, or a generated header comment. A domain has always been checked for this
 * reason; a realm, an ACME address, a description and an API base URL are the same class
 * of string and were not — a realm alone was enough to close its quote and open an
 * attacker-chosen `location` block in a file the web server reads as root. The grammar is
 * the only thing between a declaration and that, so these are ALLOWLISTS: a character
 * that is not obviously safe in nginx, in Apache AND in a systemd unit is not permitted.
 * ──────────────────────────────────────────────────────────────────────────────────── */

/**
 * The HTTP Basic realm. Rendered inside double quotes in `auth_basic "…";` and
 * `AuthName "…"`, so a quote, a backslash, a semicolon, a brace or a newline is REFUSED
 * rather than escaped: escaping is a per-renderer property that two renderers would have
 * to agree on forever, and a grammar is a property of the value itself.
 */
export const REALM_PATTERN = /^[A-Za-z0-9 ._:,()\/-]{1,64}$/;

/**
 * The realm shown when a preprod visitor is challenged. Defaulted HERE and not in the
 * schema: a default is a fact about the layout, and a grammar file that also carried
 * defaults would be a second owner of them — which is how `/home/www` came to be written
 * in two files that could disagree about it.
 */
export const DEFAULT_REALM = 'Dedalo preprod';

/**
 * A human description. It reaches the `# GENERATED by … — instance <i>` header of every
 * rendered artifact, so it must be ONE line with no control characters: a newline would
 * let the second line of a description be the first line of a directive.
 */
export const DESCRIPTION_PATTERN = /^[^\x00-\x1f\x7f]{1,200}$/;

/**
 * An ACME account address, rendered into the certificate-provisioning invocation. Narrow
 * on purpose — an email grammar that accepts quoted local parts accepts a space and a
 * quote, which is the whole problem.
 */
export const EMAIL_PATTERN = /^(?=.{3,254}$)[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/;

/**
 * The Publication API base URL. It is rendered into the instance's env AND substituted
 * into every scaffolded site's source, so it is a base and nothing else: no query, no
 * fragment, no embedded credentials, no whitespace, no quote.
 */
export const API_URL_PATTERN = /^https?:\/\/[a-z0-9.-]+(:\d{1,5})?(\/[A-Za-z0-9._~-]+)*\/?$/;

/** A systemd size (MemoryMax=, MemoryHigh=). */
export const SYSTEMD_SIZE_PATTERN = /^\d+[KMG]$/;

/** A systemd CPU share (CPUQuota=). */
export const CPU_QUOTA_PATTERN = /^\d+%$/;

/**
 * The agent drivers, as runtime values. Owned here (rather than in the schema, which needs
 * them as a zod enum, or in src/config.ts, which needs them as an env enum) for the same
 * one-owner reason as everything else in this section; `schema.ts` carries the type-level
 * assignment that reddens if `src/drivers/types.ts` gains or renames one.
 */
export const DRIVER_IDS = ['claude_code', 'opencode', 'pi'] as const;
export type AgentDriverId = (typeof DRIVER_IDS)[number];

/**
 * The env-var name a driver's pinned binary is rendered under. `src/config.ts` reads
 * exactly these keys, so this map is the seam between a declaration and the daemon's own
 * configuration rather than a naming convention repeated in two files.
 */
export const DRIVER_BIN_ENV: Readonly<Record<AgentDriverId, string>> = Object.freeze({
  claude_code: 'CLAUDE_CODE_BIN',
  opencode: 'OPENCODE_BIN',
  pi: 'PI_BIN',
});

/**
 * The per-museum caps, and the env key each is rendered under.
 *
 * NO DEFAULTS LIVE HERE, and none live in the schema either. `src/config.ts` owns every
 * one of these defaults; a second set in the manifest grammar would shadow them silently,
 * so that on the day someone changed the daemon's default nothing would move — every
 * rendered env would already be stating the old value explicitly. A limit absent from the
 * declaration is absent from the rendered env, and the daemon's own default applies, which
 * is the only arrangement in which config.ts is still the owner.
 */
/**
 * THE SHARED BEARER'S KEY — the daemon's `SERVICE_TOKEN`, the engine's
 * `DEDALO_SITE_BUILDER_TOKEN`, a credential filename, a `LoadCredential=` id and a
 * `$CREDENTIALS_DIRECTORY` entry, all at once.
 *
 * It lives here because it is a NAME, and this module owns names. It was spelled in
 * `render/engine_fragment.ts` while `plan.ts` and `render/unit.ts` also needed it, which is
 * one owner too few for a string that has to be identical in five places or the pairing
 * silently fails on one side.
 */
/**
 * A KEY THAT WOULD BE CARRYING A SECRET if it carried a value at all.
 *
 * Suffix-anchored: `PUBLICATION_API_KEY_FILE` is a PATH and passes, `PUBLICATION_API_KEY`
 * is a value and does not. Owned here because BOTH ends of the no-secret law read it —
 * `render/env.ts` refuses to WRITE such a key into the rendered env, and
 * `src/instance/roots.ts` refuses to BOOT a daemon whose env file carries one. Two
 * spellings of this pattern is a law enforced on one end and decorative on the other.
 */
export const SECRET_LOOKING_KEY = /(TOKEN|SECRET|PASSWORD|PASSPHRASE|CREDENTIAL|_KEY)$/;

export const SERVICE_TOKEN_KEY = 'SERVICE_TOKEN';

/**
 * The Publication API key: a VALUE the daemon needs and must never read out of the rendered
 * env, and the PATH of the file it lives in, which is all the env may carry.
 *
 * Both spellings are here for the same reason the bearer is: `buildEnvVars()` writes the
 * `_FILE` key, `credentialSources()` turns the same path into a `LoadCredential=` line, and
 * `src/config.ts` reads the value at `$CREDENTIALS_DIRECTORY/PUBLICATION_API_KEY`. Three
 * readers, one name.
 */
export const PUBLICATION_API_KEY_KEY = 'PUBLICATION_API_KEY';
export const PUBLICATION_API_KEY_FILE_KEY = `${PUBLICATION_API_KEY_KEY}_FILE`;

/**
 * The name of the audit log inside the audit root.
 *
 * The daemon appends to it (`src/audit.ts`) and the provisioner CREATES and chowns it
 * (`auditFile` below, `plan.ts`'s tree phase) — because the directory is root-owned, which
 * is what makes the trail append-only in the filesystem rather than by convention. Two
 * spellings of this filename would be a daemon appending to a file nothing had created,
 * inside a directory it is not allowed to create one in.
 */
export const AUDIT_FILE_NAME = 'audit.jsonl';

/**
 * HOW THE ENGINE REACHES THE DAEMON, in the daemon's own vocabulary.
 *
 * The pairing fragment tells the ENGINE to connect to `layout.socketPath`; these two keys
 * are the other half of that sentence, and until they existed the daemon was never told —
 * it bound a TCP port while the engine dialled a unix socket nothing was listening on, and
 * every artifact on the host looked right. A fact that only one side of a connection knows
 * is not a convention, it is a coincidence waiting to end.
 */
export const LISTEN_KIND_KEY = 'LISTEN_KIND';
export const LISTEN_SOCKET_KEY = 'LISTEN_SOCKET';

/**
 * THE SITE TABLE — the file through which the provisioner TELLS the daemon where every site
 * of this instance lives, and the env key that names it.
 *
 * WHY IT EXISTS AT ALL. `sites[].webspace` is an override the provisioner honours (a host
 * with its own www layout), so `<webspace_base>/<domain>` is only the DEFAULT placement, not
 * a law. While the daemon computed the placement for itself, the two ends were two
 * independent derivations of the same fact, free to disagree — and on the committed
 * reference declaration they DID: the vhosts of site 'archive' served
 * `/srv/legacy-www/archive-example` while the daemon published into
 * `/home/www/archive.example.net`, a directory no web server has ever read. Measured, not
 * theorised.
 *
 * So the derivation is now published, once, by the side that owns it. `derive()` produces
 * every string; the renderer writes them into `<configDir>/sites.json`; the daemon READS
 * them and computes nothing (`src/sites/site_table.ts`). A site missing from the table is a
 * named refusal, never a publish into a directory no vhost serves.
 *
 * The file is root:root 0644 — only root writes it (`MODES.siteTable`), everybody may read
 * it, because the daemon runs as the service user and is in none of root's groups.
 */
export const SITE_TABLE_FILE_NAME = 'sites.json';
export const SITE_TABLE_FILE_KEY = 'SITE_TABLE_FILE';

export const LIMIT_ENV: Readonly<Record<string, string>> = Object.freeze({
  max_sites: 'MAX_SITES',
  max_concurrent_sessions: 'MAX_CONCURRENT_SESSIONS',
  session_turn_timeout_ms: 'SESSION_TURN_TIMEOUT_MS',
  install_timeout_ms: 'INSTALL_TIMEOUT_MS',
  build_timeout_ms: 'BUILD_TIMEOUT_MS',
  site_disk_quota_mb: 'SITE_DISK_QUOTA_MB',
  releases_retained: 'RELEASES_RETAINED',
});

/* ────────────────────────────────────────────────────────────────────────────────────
 * Path primitives — one containment predicate, one tidier
 *
 * The schema checks the paths a museum WROTE DOWN; this module checks the ones it
 * DERIVED. Two callers, one predicate: a derived root landing inside the engine's private
 * directory is the same defect as a declared one, and a second implementation of "is a
 * inside b" is a second set of edge cases about trailing slashes.
 * ──────────────────────────────────────────────────────────────────────────────────── */

/** Drops trailing separators so `/var/lib/x/` and `/var/lib/x` are one path, not two. */
export function tidyPath(value: string): string {
  const trimmed = value.trim();
  return trimmed.length > 1 ? trimmed.replace(/\/+$/, '') : trimmed;
}

/**
 * The prefix that means "inside this directory".
 *
 * For every path but the filesystem root that is `<path>/`. For `/` it is `/` itself,
 * because `tidyPath` leaves the root as a bare separator and the naive `path + sep` would
 * ask whether a path starts with `//` — which nothing does. That made `/` overlap NOTHING,
 * so a declaration naming `/` as a root or a webspace passed every containment check in
 * this file while actually containing all of them. The one-character case has to be
 * spelled out; it cannot be left to string concatenation.
 */
function containmentPrefix(path: string): string {
  return path === sep ? sep : path + sep;
}

/** True when `a` and `b` are the same path, or either contains the other. */
export function pathsOverlap(a: string, b: string): boolean {
  const left = tidyPath(a);
  const right = tidyPath(b);
  return (
    left === right ||
    left.startsWith(containmentPrefix(right)) ||
    right.startsWith(containmentPrefix(left))
  );
}

/** True when `child` is STRICTLY inside `parent` (not equal to it). */
export function isStrictlyWithin(child: string, parent: string): boolean {
  const inner = tidyPath(child);
  const outer = tidyPath(parent);
  return inner !== outer && inner.startsWith(containmentPrefix(outer));
}

/* ────────────────────────────────────────────────────────────────────────────────────
 * The default placement
 * ──────────────────────────────────────────────────────────────────────────────────── */

/**
 * Where this host keeps things when the declaration says nothing. Spelled from the
 * namespace constants above, never from a literal, so the whole host layout still moves
 * with USER_PREFIX. `webspaceBase` is the one exception and deliberately so: `/home/www`
 * is a HOST convention older than this project, not a namespace of ours.
 */
export const DEFAULT_PATHS = Object.freeze({
  /** Holds one directory per instance: the declaration, its secrets and its rendered env. */
  configBase: `/etc/${NAMESPACE_SNAKE}/instances`,
  /** Holds one directory per instance: workspaces, agent home, audit. */
  stateBase: `/var/lib/${NAMESPACE_SNAKE}`,
  /** Holds one directory per instance: the daemon socket. */
  runtimeBase: `/run/${NAMESPACE}`,
  /** Holds one directory per SITE (not per instance): the webspaces. */
  webspaceBase: '/home/www',
  /** Where the generated unit file is installed. */
  unitDir: '/etc/systemd/system',
});

/** The vhost directory follows the web server, so it is a function and not a constant. */
export function defaultVhostDir(webServer: WebServer): string {
  return webServer === 'apache' ? '/etc/apache2/sites-available' : '/etc/nginx/sites-available';
}

/* ────────────────────────────────────────────────────────────────────────────────────
 * The declaration (structural types — schema.ts validates INTO these)
 *
 * These are the types `parseManifest()` returns. A field is written OPTIONAL wherever the
 * schema supplies a default, because a schema output that has the field is assignable to
 * an input type where it is optional, and because `derive()` must also be callable from a
 * hand-built object in a gate.
 *
 * ONE SPELLING PER CONCEPT, in two languages. The manifest is JSON and spells its fields
 * in snake_case; the DERIVED layout is TypeScript and spells them in camelCase. So
 * `sites[].webspace` derives to `sites[n].webspace`, `webspace_base` to `webspaceBase`,
 * `web.group` to `identity.webGroup`, `roots.workspaces` to `roots.workspaces` — never two
 * NAMES for one thing, which is what `webspace` versus `webspaceDir` was.
 * ──────────────────────────────────────────────────────────────────────────────────── */

export type WebServer = 'nginx' | 'apache';

/**
 * The two served SURFACES of a site, named in the daemon's existing vocabulary (config's
 * PREPROD_ROOT/PROD_ROOT, promote.ts, publish.ts, the test fixture) rather than in the
 * on-disk spelling. The directory names differ from the surface names on purpose — see
 * SURFACE_DIR.
 */
export type Surface = 'preprod' | 'prod';

/** Both surfaces, in the order every generator should walk them. */
export const SURFACES: readonly Surface[] = Object.freeze<Surface[]>(['preprod', 'prod']);

/**
 * Surface → the directory name inside a webspace. The public paths are short because they
 * are *public*: a visitor's URL and an operator's `ls` both read better as `pre`/`web`
 * than as `preprod`/`prod`, and `web` is the name a webspace's live tree has had on shared
 * hosts for twenty years. The mapping is here so exactly one file knows that the surface
 * called `prod` is the directory called `web`.
 */
export const SURFACE_DIR: Readonly<Record<Surface, string>> = Object.freeze({
  preprod: 'pre',
  prod: 'web',
});

/**
 * The immutable release stores' parent, inside a webspace.
 *
 * A SIBLING of `pre` and `web`, never underneath either: the served symlink must be
 * swappable without the store moving with it, and a store under a served path would be
 * reachable by URL. Dot-prefixed so the generated vhosts' "deny anything hidden" rule
 * covers it without a rule of its own.
 */
export const RELEASE_STORE_DIR = '.releases';

/**
 * A SURFACE IS A PAIR, NOT A ROOT — the two paths one surface of one site actually is.
 *
 * The daemon used to address a surface as `(root, slug)`: a release store at
 * `<root>/.releases/<slug>` and a served link at `<root>/<slug>`, one root per SURFACE
 * shared by every site. That is not the shape this module derives and it is not the shape
 * the generated vhosts serve — here a surface belongs to a SITE (`<webspace>/pre`,
 * `<webspace>/web`), because a site answers on its own domain and a vhost carries one
 * document root. A fully converged host therefore had vhosts pointing at a document root
 * the daemon never wrote to, and a daemon publishing into a tree no web server served.
 *
 * So the pair is named, derived HERE like every other path, and handed to the promote layer
 * whole (`src/build/promote.ts`). The daemon and the provisioner do not agree about these
 * two paths by convention — they read the same function.
 */
export interface SurfacePaths {
  readonly surface: Surface;
  /** The pair's parent, and the directory the served link's RELATIVE target resolves in. */
  readonly webspace: string;
  /** `<webspace>/.releases/<pre|web>` — the immutable copies, one directory per release. */
  readonly storeDir: string;
  /** `<webspace>/<pre|web>` — the symlink a vhost's document root names. */
  readonly linkPath: string;
}

/**
 * The two paths of one surface, from the webspace they both live in.
 *
 * TWO STORES, ONE PER SURFACE, deliberately. Sharing a store between `pre` and `web` would
 * save copies and would let preprod's pruning delete the bytes production is serving — the
 * one class of bug a release store exists to make impossible.
 */
export function surfacePaths(webspace: string, surface: Surface): SurfacePaths {
  const dir = surfaceDir(surface);
  return Object.freeze({
    surface,
    webspace,
    storeDir: join(webspace, RELEASE_STORE_DIR, dir),
    linkPath: join(webspace, dir),
  });
}

/**
 * WHERE A SITE'S WEBSPACE IS — the one derivation the provisioner and the daemon share.
 *
 * The provisioner CREATES `<webspace_base>/<domain>` (marks it, chowns it, renders two
 * vhosts against it); the daemon must find that same directory at publish time knowing only
 * its instance's `WEBSPACE_BASE` and the site's own domain (`site.json`). Two spellings of
 * this join would be a museum publishing into a directory no vhost serves — which is
 * exactly the defect this function exists to close, so it is ONE function, called from both
 * ends, and neither end is allowed to re-implement it.
 */
export function webspaceFor(webspaceBase: string, domain: string): string {
  return join(webspaceBase, assertMatches(DOMAIN_PATTERN, 'site domain', domain));
}

/** `<host_prefix>.<domain>` — the draft vhost's server_name, and the preview host. */
export function preprodDomainFor(hostPrefix: string, domain: string): string {
  return `${assertMatches(HOST_LABEL_PATTERN, 'preprod host prefix', hostPrefix)}.${domain}`;
}

/** One site: a slug, the domain it answers on, and (optionally) an explicit webspace. */
export interface ManifestSite {
  /**
   * INSTANCE-LOCAL. The slug grammar is unchanged (src/util/slug.ts) and stays scoped to
   * one museum: two instances may both own the slug 'coleccion', because nothing outside
   * an instance's own tree ever names it.
   */
  readonly slug: string;
  readonly domain: string;
  /** Defaults to `<webspace_base>/<domain>`; override for a host with its own www layout. */
  readonly webspace?: string;
}

/**
 * Where this host keeps its BASES. Every field is optional and every default comes from
 * DEFAULT_PATHS; an override changes the derived paths AND the writable set together,
 * because both come out of the same `derive()` call.
 */
export interface ManifestPaths {
  readonly config_base?: string;
  readonly state_base?: string;
  readonly unit_dir?: string;
  readonly vhost_dir?: string;
}

/**
 * The three STATE roots, stated INDIVIDUALLY. `paths.state_base` moves all three together
 * (a host whose /var is on a small disk); these move ONE, which is how an adopted host —
 * a museum already keeping its audit trail on a separate volume — stays describable in
 * this vocabulary instead of being the one host the provisioner cannot express.
 */
export interface ManifestRoots {
  readonly workspaces?: string;
  readonly home?: string;
  readonly audit?: string;
}

/**
 * An ADOPTED identity. See `derive()` for why the derived form is the safe one and why an
 * override is nevertheless accepted.
 */
export interface ManifestIdentity {
  readonly user: string;
  readonly group: string;
}

export interface ManifestPreprodUser {
  readonly name: string;
  /** The PATH of a root-owned 0600 file. Never the password. */
  readonly password_file: string;
}

export interface ManifestServing {
  readonly preprod: {
    readonly enabled: boolean;
    /** Prefixed to a site's domain for its draft vhost: 'pre' → pre.www.example.org. */
    readonly host_prefix?: string;
    readonly auth: {
      readonly mode: 'htpasswd' | 'none';
      readonly realm?: string;
      /** PER INSTANCE. Derived when absent; stated only by an adopted layout. */
      readonly htpasswd?: string;
      readonly users?: readonly ManifestPreprodUser[];
    };
  };
  readonly prod: {
    readonly tls: {
      readonly mode: 'letsencrypt' | 'files' | 'none';
      readonly certificate?: string;
      readonly key?: string;
      readonly account_email?: string;
    };
  };
  /** Extra hostname → the slug of the site it redirects to. */
  readonly aliases?: Readonly<Record<string, string>>;
}

export interface ManifestAgent {
  readonly driver: AgentDriverId;
  /** Only the drivers this museum has installed, pinned by ABSOLUTE path. */
  readonly bins?: Readonly<Partial<Record<AgentDriverId, string>>>;
}

/** The per-museum caps. Every field is optional and NONE has a default — see LIMIT_ENV. */
export interface ManifestLimits {
  readonly max_sites?: number;
  readonly max_concurrent_sessions?: number;
  readonly session_turn_timeout_ms?: number;
  readonly install_timeout_ms?: number;
  readonly build_timeout_ms?: number;
  readonly site_disk_quota_mb?: number;
  readonly releases_retained?: number;
}

/** The kernel-enforced share of the host, rendered into the instance's systemd unit. */
export interface ManifestResources {
  readonly memory_max?: string;
  readonly memory_high?: string;
  readonly cpu_quota?: string;
  readonly tasks_max?: number;
}

/**
 * THE DECLARATION — instance.json, already validated. Read-only by type, because
 * `derive()` must be a pure function of it: a layout that could be changed after it was
 * derived would let a caller move a path without moving the writable set with it.
 */
export interface InstanceManifest {
  /** The museum's tenancy name. Must match INSTANCE_PATTERN. */
  readonly instance: string;
  /** One line, for the generated headers and the operator's benefit. Never a path. */
  readonly description?: string;

  /**
   * The paired engine. `private_dir` is that engine's `../private/` — the directory
   * holding its .env, its backups and its media, declared here so the provisioner can
   * assert it lies OUTSIDE every root this daemon owns. `group` is the OS group that
   * engine runs as: it owns the pairing fragment and the daemon's socket.
   *
   * DECLARED, NEVER DEFAULTED — and the same for `web.group`. These two names belong to
   * the HOST, not to this convention: the web server's group is `www-data` on Debian and
   * `nginx` or `apache` elsewhere, and the engine's group is whatever that install's unit
   * was given (the engine's own unit refuses to guess it too — it ships a DEDALO_USER
   * placeholder). A guessed group is not a cosmetic default: it is a 0640 htpasswd the web
   * server cannot read and a 0660 socket the engine cannot open, discovered at the first
   * request rather than at provisioning time. Exactly the class of defect this module
   * exists to remove.
   */
  readonly engine: {
    readonly private_dir: string;
    readonly group: string;
  };

  /** The web server: which vhost flavour to render, and the group that reads the trees. */
  readonly web: {
    readonly server?: WebServer;
    readonly group: string;
  };

  /**
   * THIS museum's read-only Publication API v2 — the only data source a site is ever built
   * against. Per instance because each museum publishes its OWN data; a deployment fact
   * that lived only in a hand-written env was a deployment fact the provisioner could not
   * render, and therefore one more thing stated twice. `key_path` names a root-owned 0600
   * file, never the key.
   */
  readonly publication_api: {
    readonly url: string;
    readonly key_path?: string;
  };

  readonly agent: ManifestAgent;
  readonly serving: ManifestServing;

  /** ADOPTED hosts only. Absent means the identity is derived — which is the safe form. */
  readonly identity?: ManifestIdentity;
  readonly paths?: ManifestPaths;
  readonly roots?: ManifestRoots;
  readonly webspace_base?: string;

  /** May be empty: a museum is provisioned before it has its first site. */
  readonly sites?: readonly ManifestSite[];

  /**
   * Provider credential KEY → the ABSOLUTE PATH of a root-owned 0600 file. Never a value.
   * Each becomes one systemd LoadCredential of the same name, so the material reaches the
   * process through `$CREDENTIALS_DIRECTORY` and is absent from the rendered env, from
   * `/proc/<pid>/environ`, and from this file.
   */
  readonly secrets?: Readonly<Record<string, string>>;

  readonly limits?: ManifestLimits;
  readonly resources?: ManifestResources;
}

/* ────────────────────────────────────────────────────────────────────────────────────
 * The derived layout
 * ──────────────────────────────────────────────────────────────────────────────────── */

/** One site's derived placement. These accessors are the ONLY way to spell them. */
export interface SiteLayout {
  readonly slug: string;
  readonly domain: string;
  /** `<host_prefix>.<domain>` — the draft vhost's server_name. */
  readonly preprodDomain: string;
  /** The webspace root. Servable; holds `.releases/`, `pre` and `web` and nothing else. */
  readonly webspace: string;
  /** The immutable release store for a surface: `<webspace>/.releases/<pre|web>`. */
  releasesDir(surface: Surface): string;
  /** The served symlink for a surface: `<webspace>/<pre|web>`. */
  linkPath(surface: Surface): string;
  /**
   * ONE VHOST FILE PER SITE PER SURFACE. A vhost carries one server_name, one document
   * root and one TLS block; two sites sharing a file would share all three. So the vhosts
   * are per SITE even though the unit is per INSTANCE — the two artifacts have different
   * natural grains, and pretending otherwise is how a template ends up with a drop-in.
   */
  readonly vhostPaths: Readonly<Record<Surface, string>>;
}

export interface InstanceLayout {
  /** The declared name, echoed back so a consumer never has to keep the manifest around. */
  readonly instance: string;
  /** One line, or '' — rendered into every artifact's generated header. */
  readonly description: string;
  readonly webServer: WebServer;
  readonly identity: {
    /** `${USER_PREFIX}${instance}` unless adopted — ≤ MAX_USERNAME_LENGTH either way. */
    readonly user: string;
    /**
     * One GROUP per museum, named identically to the user unless adopted. Named explicitly
     * rather than left to `useradd`'s distro-dependent default: a unit that hard-requires
     * a Group= the installer never guaranteed to exist is a boot failure waiting for a
     * host whose USERGROUPS_ENAB says no.
     */
    readonly group: string;
    /** The web server's group — reads the htpasswd and the served trees. */
    readonly webGroup: string;
    /** The paired engine's group — reads the pairing fragment, owns the socket. */
    readonly engineGroup: string;
    /** True when the identity came from the declaration rather than from the prefix. */
    readonly adopted: boolean;
  };
  /**
   * The three STATE roots. They are listed (and confined) individually rather than as
   * their parent, because the parent is root-owned: the daemon must be able to write
   * INSIDE its roots and unable to create, move or replace the roots themselves.
   */
  readonly roots: {
    /**
     * Git repos, the agent tree, node_modules, `.builder/`. NEVER inside a webspace —
     * a webspace is servable, and an agent turn writes arbitrary files into a workspace.
     */
    readonly workspaces: string;
    /** The agent's HOME (`~/.claude` and friends). 0700: nothing else has business here. */
    readonly home: string;
    /**
     * The audit DIRECTORY. Root-owned; the FILE inside it is the daemon's, so the daemon
     * appends and cannot rename or unlink — a compromised turn cannot erase the record of
     * itself.
     */
    readonly audit: string;
  };
  /** The parent of the three roots. Root-owned: the daemon may not replace its own roots. */
  readonly stateDir: string;
  /** The audit FILE. Created and chowned to the service user by the provisioner. */
  readonly auditFile: string;
  readonly configDir: string;
  readonly secretsDir: string;
  /** The instance's copy of the declaration. Hand-written; everything else is rendered. */
  readonly manifestPath: string;
  /**
   * THE SITE TABLE the daemon reads its placements out of (`<configDir>/sites.json`).
   *
   * Named here, in the layout, because it is a derived path like every other; rendered by
   * `render/sites.ts` from `sites` below; found by the daemon through the `SITE_TABLE_FILE`
   * key of `envVars`. Three consumers, one string.
   */
  readonly siteTablePath: string;
  /** The path of one credential file. Throws on a key outside SECRET_KEY_PATTERN. */
  secretPath(key: string): string;
  /** Declared credential KEY → the file the provisioner must find its value in. */
  readonly secrets: Readonly<Record<string, string>>;
  /** PER INSTANCE, shared by that museum's sites — never one file for every museum. */
  readonly htpasswd: string;
  /** The Basic-auth realm the preprod vhost renders, resolved against DEFAULT_REALM. */
  readonly preprodRealm: string;
  /** The rendered environment file. SECRET-FREE by construction (see `secrets`). */
  readonly envFile: string;
  /** Exactly what that file must contain. Only STATED limits appear — see LIMIT_ENV. */
  readonly envVars: Readonly<Record<string, string>>;
  /** The fragment the paired engine appends: its URL and token for THIS daemon. */
  readonly engineFragment: string;
  /** The unit's NAME, instantiated: `${USER_PREFIX}builder@<instance>.service`. */
  readonly unitName: string;
  readonly unitPath: string;
  /** The value of systemd's RuntimeDirectory= — relative to /run, as systemd requires. */
  readonly runtimeDirectory: string;
  readonly runtimeDir: string;
  /** 0660, group = the ENGINE's group: one engine, one daemon, one socket. */
  readonly socketPath: string;
  readonly webspaceBase: string;
  readonly sites: readonly SiteLayout[];
  /** Echoed so a vhost renderer reads ONE object rather than the manifest AND the layout. */
  readonly serving: ManifestServing;
  readonly resources: ManifestResources;
  /** The engine's private directory — asserted disjoint from everything above. */
  readonly enginePrivateDir: string;
}

/* ────────────────────────────────────────────────────────────────────────────────────
 * The ownership / mode matrix
 * ──────────────────────────────────────────────────────────────────────────────────── */

/** Who owns a generated artifact. `user` is the instance's service user. */
export type ModeOwner = 'root' | 'user';

/**
 * Which group owns it. Four values, and the choice between them IS the isolation design:
 * `group` is the instance's own group (nothing outside the museum is in it), `webGroup`
 * and `engineGroup` belong to the host, and `root` means nobody but root.
 */
export type ModeGroup = 'root' | 'group' | 'webGroup' | 'engineGroup';

export interface ArtifactMode {
  readonly owner: ModeOwner;
  readonly group: ModeGroup;
  readonly mode: number;
}

function artifactMode(owner: ModeOwner, group: ModeGroup, mode: number): ArtifactMode {
  return Object.freeze({ owner, group, mode });
}

/**
 * THE OWNER, GROUP AND MODE of every artifact this layout names.
 *
 * Each row carries an owner AND a group AND a number, because a mode without an owner is
 * not a permission: `0750` means "the daemon may write here" or "the daemon may NOT write
 * here" depending entirely on who owns the directory, and those two readings were, for a
 * while, written in two different files about the same path. The matrix lives beside the
 * paths, not in the provisioner, for the same reason the paths live in one module: a mode
 * remembered in a different file from the path it applies to is a mode that will one day
 * apply to the wrong path.
 *
 * The rows that carry the design:
 *
 *  - `workspaces` is <user>:<group>. The daemon MKDIRS a site workspace, so a root-owned
 *    workspaces root makes creating a site a permission error. The property "the daemon
 *    cannot replace its own roots" is kept by `stateDir` instead, which is root-owned
 *    0755: the daemon writes INSIDE its roots and cannot create, move or replace one.
 *  - `webspace` and `releases` are 2750 — SETGID, <user>:<webGroup>. The bits are
 *    load-bearing twice over. With the world bits open, every museum's UNPUBLISHED preprod
 *    tree would be readable by every uid on the host, another museum's service user
 *    included, which defeats the entire boundary this design exists to draw. And without
 *    SETGID, a release directory the daemon creates carries the daemon's primary group and
 *    the web server 403s on a site that published successfully.
 *  - `auditDir` is ROOT-owned and `auditFile` is the daemon's. Unlink and rename are
 *    permissions on the DIRECTORY, so this pair is what makes the trail append-only in the
 *    filesystem rather than by convention (src/audit.ts says so honestly today: "enforced
 *    by convention here, not by the filesystem"). The provisioner CREATES and chowns the
 *    file — a root-owned directory the daemon cannot create a file in would otherwise mean
 *    no log at all — and rotation is the provisioner's job for the same reason.
 *  - `socket` is 0660 <user>:<engineGroup>. Group-owning the socket with the ENGINE's own
 *    group gives the engine reachability with NO group membership at all — the same
 *    argument that keeps the web server out of every instance group. Nothing joins
 *    anything; a `usermod -aG` in a provisioning script is the shape this replaces.
 */
export const MODES = Object.freeze({
  /** `/etc/dedalo_sites/instances/<i>/` — traversable by anyone, writable by root. */
  configDir: artifactMode('root', 'root', 0o755),
  /** The credential directory. Root alone; systemd reads it as root for LoadCredential. */
  secretsDir: artifactMode('root', 'root', 0o700),
  /** One credential file. Unreachable to the service user through the filesystem. */
  secret: artifactMode('root', 'root', 0o600),
  /** The rendered env: secret-free, but it names paths and limits — group read only. */
  envFile: artifactMode('root', 'group', 0o640),
  htpasswd: artifactMode('root', 'webGroup', 0o640),
  engineFragment: artifactMode('root', 'engineGroup', 0o640),
  /** The unit and the vhosts: read by root-run daemons. */
  hostConfig: artifactMode('root', 'root', 0o644),
  /**
   * The SITE TABLE (`<configDir>/sites.json`). Root-owned, like every other artifact, so
   * the daemon cannot rewrite the one file that tells it where it may publish — a daemon
   * able to edit its own table is a daemon able to point itself at another museum's
   * webspace, which is the derivation this file exists to take away from it.
   *
   * 0644 and not 0640 root:<group>, and the difference matters: the reader is the SERVICE
   * USER, which is in its own group and in none of root's. World-readable is safe here in
   * a way it never is for the env — the table holds paths and domains, all of them public
   * facts already written into the vhosts on the same host.
   */
  siteTable: artifactMode('root', 'root', 0o644),
  /** The parent of the three roots — root-owned, so the daemon cannot replace a root. */
  stateDir: artifactMode('root', 'root', 0o755),
  workspaces: artifactMode('user', 'group', 0o750),
  /** The agent's HOME — not even the instance group has business in it. */
  home: artifactMode('user', 'group', 0o700),
  auditDir: artifactMode('root', 'group', 0o750),
  auditFile: artifactMode('user', 'group', 0o640),
  runtimeDir: artifactMode('user', 'group', 0o750),
  socket: artifactMode('user', 'engineGroup', 0o660),
  webspace: artifactMode('user', 'webGroup', 0o2750),
  releases: artifactMode('user', 'webGroup', 0o2750),
});

/* ────────────────────────────────────────────────────────────────────────────────────
 * derive()
 * ──────────────────────────────────────────────────────────────────────────────────── */

/** An override must be absolute: everything downstream confines against these. */
function absoluteRoot(label: string, value: string): string {
  if (typeof value !== 'string' || !isAbsolute(value)) {
    throw new Error(`layout: ${label} must be an absolute path, got '${value}'`);
  }
  return resolve(tidyPath(value));
}

function assertMatches(pattern: RegExp, label: string, value: string): string {
  if (typeof value !== 'string' || !pattern.test(value)) {
    throw new Error(`layout: invalid ${label} '${value}' — must match ${pattern.source}`);
  }
  return value;
}

/**
 * DERIVE EVERY NAME, PATH, OWNER AND MODE FROM THE DECLARATION.
 *
 * Manifest values override the defaults, but they ALWAYS flow through here: there is no
 * second way to spell any of these strings, so an override cannot reach one artifact and
 * miss another.
 *
 * NO FIELD MAY VALIDATE AND THEN BE IGNORED. A field the schema accepts and this function
 * never reads is worse than a field nobody validated at all: it installs cleanly and
 * diverges at runtime, on a museum's host, with the declaration on disk saying otherwise —
 * which is the same defect as the unit whose ReadWritePaths= did not follow the
 * installer's root overrides, and the reason this module exists. Every accepted field is
 * read below, and `tests/provision.test.ts` asserts it the only way that stays true:
 * by overriding each one and demanding the derived value move.
 *
 * The returned object is frozen at every level — a layout that could be mutated after
 * `readWritePaths()` read it would be a confinement set describing a directory tree that
 * no longer exists.
 */
export function derive(manifest: InstanceManifest): InstanceLayout {
  const instance = assertMatches(INSTANCE_PATTERN, 'instance name', manifest.instance);
  const webServer: WebServer = manifest.web?.server ?? 'nginx';
  const paths = manifest.paths ?? {};

  const configBase = absoluteRoot(
    'paths.config_base',
    paths.config_base ?? DEFAULT_PATHS.configBase,
  );
  const stateBase = absoluteRoot('paths.state_base', paths.state_base ?? DEFAULT_PATHS.stateBase);
  const runtimeBase = DEFAULT_PATHS.runtimeBase;
  const unitDir = absoluteRoot('paths.unit_dir', paths.unit_dir ?? DEFAULT_PATHS.unitDir);
  const vhostDir = absoluteRoot('paths.vhost_dir', paths.vhost_dir ?? defaultVhostDir(webServer));
  const webspaceBase = absoluteRoot(
    'webspace_base',
    manifest.webspace_base ?? DEFAULT_PATHS.webspaceBase,
  );

  // ── Identity.
  //
  // THE DERIVED FORM IS THE SAFE ONE and stays the default. Letting instance.json name the
  // user reopens the arithmetic at the top of this file (a declared name carries no
  // 32-character ceiling of its own), and lets two instances declare the SAME user — which
  // is not a naming mistake but a silent un-isolation: one museum's agent turn running as
  // the user that owns another museum's tree. `dedalo-site-<instance>` cannot collide,
  // because the instance name IS the directory under /etc and the provisioner refuses a
  // manifest that disagrees with its own directory.
  //
  // The override exists anyway, because a museum already running under a hand-made user
  // must be describable in THIS vocabulary rather than through a second code path — an
  // adopted install the provisioner cannot express is an adopted install that keeps its
  // hand-written unit forever, which is the duplication this whole design removes. What
  // the derived form gave for free is therefore ENFORCED here instead: both names are
  // checked against the unix grammar AND against the same ceiling, so an adopted identity
  // fails at the declaration and not at `usermod` time, halfway through a run.
  const declaredIdentity = manifest.identity;
  const user = declaredIdentity
    ? assertMatches(UNIX_NAME_PATTERN, 'identity.user', declaredIdentity.user)
    : `${USER_PREFIX}${instance}`;
  const group = declaredIdentity
    ? assertMatches(UNIX_NAME_PATTERN, 'identity.group', declaredIdentity.group)
    : user;
  for (const [label, name] of [
    ['identity.user', user],
    ['identity.group', group],
  ] as const) {
    if (name.length > MAX_USERNAME_LENGTH) {
      throw new Error(
        `layout: ${label} '${name}' is ${name.length} characters; the Linux ceiling is ` +
          `${MAX_USERNAME_LENGTH}. useradd would refuse it on the museum's host, mid-run.`,
      );
    }
  }

  const webGroup = assertMatches(UNIX_NAME_PATTERN, 'web.group', manifest.web?.group as string);
  const engineGroup = assertMatches(
    UNIX_NAME_PATTERN,
    'engine.group',
    manifest.engine?.group as string,
  );

  // THE SERVICE GROUP MUST BE THE INSTANCE'S OWN, AND NOTHING ELSE'S.
  //
  // The service user is created with this group as its PRIMARY group (`useradd --gid`), and
  // an agent turn runs as that user executing arbitrary generated code. Declaring the host's
  // web group here would put every museum's webspace — 2750 <user>:<webGroup>, group-readable
  // and group-writable by design so the web server can serve it — inside this instance's
  // reach. Declaring the paired engine's group would hand it the socket and whatever else
  // that group opens. Either one silently converts a per-museum identity into a shared one,
  // which is the entire boundary this subsystem exists to draw.
  if (group === webGroup) {
    throw new Error(
      `layout: the service group '${group}' is also web.group. The service user's PRIMARY ` +
        `group would then be the web server's, giving this instance's agent turns access to ` +
        `every instance's served tree (2750 <user>:<webGroup>). Give the instance its own ` +
        `group. Nothing was derived.`,
    );
  }
  if (group === engineGroup) {
    throw new Error(
      `layout: the service group '${group}' is also engine.group — the group that reaches ` +
        `the engine's socket. The daemon runs as its own uid precisely so an agent turn ` +
        `cannot become the engine. Give the instance its own group. Nothing was derived.`,
    );
  }

  const description = manifest.description ?? '';
  if (description) assertMatches(DESCRIPTION_PATTERN, 'description', description);

  const configDir = join(configBase, instance);
  const secretsDir = join(configDir, 'secrets');
  const stateDir = join(stateBase, instance);
  // systemd's own separator, not the platform's: this is a unit-file value, not a path.
  //
  // `RuntimeDirectory=` is BY DEFINITION relative to /run — systemd resolves it there and
  // nowhere else. There is deliberately NO `paths.runtime_base` override: a unit cannot
  // express any other base, so honouring one would leave the unit creating
  // /run/<ns>/<i> while the daemon bound its socket elsewhere and the engine connected to
  // a path nothing ever created. A field whose only legal value is its default is not a
  // knob, it is a trap, so the knob does not exist.
  const runtimeDirectory = `${NAMESPACE}/${instance}`;
  const runtimeDir = join(runtimeBase, instance);

  // The three roots: an explicit `roots.<x>` wins, else a sibling under the state dir.
  // Both spellings exist because they answer different questions — `paths.state_base`
  // moves the whole tree, `roots.audit` moves exactly one.
  const declaredRoots = manifest.roots ?? {};
  const roots = Object.freeze({
    workspaces: declaredRoots.workspaces
      ? absoluteRoot('roots.workspaces', declaredRoots.workspaces)
      : join(stateDir, 'workspaces'),
    home: declaredRoots.home ? absoluteRoot('roots.home', declaredRoots.home) : join(stateDir, 'home'),
    audit: declaredRoots.audit
      ? absoluteRoot('roots.audit', declaredRoots.audit)
      : join(stateDir, 'audit'),
  });

  // Pre-validated in the schema; re-checked here because this is the last function before
  // a key becomes a filename and a path becomes a LoadCredential source.
  const secrets: Record<string, string> = {};
  for (const [key, file] of Object.entries(manifest.secrets ?? {})) {
    assertMatches(SECRET_KEY_PATTERN, 'secret key', key);
    secrets[key] = absoluteRoot(`secrets.${key}`, file);
  }

  const hostPrefix = assertMatches(
    HOST_LABEL_PATTERN,
    'serving.preprod.host_prefix',
    manifest.serving?.preprod?.host_prefix ?? 'pre',
  );

  const sites = Object.freeze(
    (manifest.sites ?? []).map(site =>
      buildSite(site, { webspaceBase, vhostDir, instance, hostPrefix }),
    ),
  );

  assertNoCollisions(sites);
  assertRootsAreNotServed(roots, sites, webspaceBase);

  const enginePrivateDir = absoluteRoot(
    'engine.private_dir',
    manifest.engine?.private_dir as string,
  );
  assertEnginePrivateIsDisjoint(enginePrivateDir, roots, sites, webspaceBase);
  assertWritableSetIsSane(
    { workspaces: roots.workspaces, home: roots.home, audit: roots.audit },
    runtimeDir,
    sites,
    webspaceBase,
    { configDir, secretsDir, unitDir },
  );

  // An adopted layout may pin the htpasswd where it already lives; otherwise it is one
  // file per instance, beside the declaration. Per INSTANCE and never per host: one
  // shared password file is every museum's unpublished work behind one credential.
  const htpasswd = manifest.serving?.preprod?.auth?.htpasswd
    ? absoluteRoot('serving.preprod.auth.htpasswd', manifest.serving.preprod.auth.htpasswd)
    : join(configDir, 'preprod.htpasswd');

  // A basic-auth password file inside a SERVED tree is served. The dotfile guard only
  // saves it when its name happens to begin with a dot, and an adopted layout may pin it
  // anywhere — so the placement is refused here rather than left to a filename.
  for (const site of sites) {
    if (pathsOverlap(htpasswd, site.webspace)) {
      throw new Error(
        `layout: the preprod password file '${htpasswd}' lies inside site ` +
          `'${site.slug}'s webspace ('${site.webspace}'), where the web server would ` +
          `serve it over HTTP. Keep it under the instance config directory. Nothing was ` +
          `derived.`,
      );
    }
  }


  const preprodRealm = assertMatches(
    REALM_PATTERN,
    'serving.preprod.auth.realm',
    manifest.serving?.preprod?.auth?.realm ?? DEFAULT_REALM,
  );

  // Hoisted out of the object literal below because `buildEnvVars()` needs it: the daemon
  // is told where to listen by the same expression the engine is told where to dial.
  const socketPath = join(runtimeDir, 'daemon.sock');

  const layout: InstanceLayout = {
    instance,
    description,
    webServer,
    identity: Object.freeze({
      user,
      group,
      webGroup,
      engineGroup,
      adopted: declaredIdentity !== undefined,
    }),
    roots,
    stateDir,
    auditFile: join(roots.audit, AUDIT_FILE_NAME),
    configDir,
    secretsDir,
    manifestPath: join(configDir, 'instance.json'),
    siteTablePath: join(configDir, SITE_TABLE_FILE_NAME),
    secretPath(key: string): string {
      return join(secretsDir, assertMatches(SECRET_KEY_PATTERN, 'secret key', key));
    },
    secrets: Object.freeze(secrets),
    htpasswd,
    preprodRealm,
    envFile: join(configDir, 'env'),
    envVars: buildEnvVars(manifest, {
      instance,
      roots,
      webspaceBase,
      webServer,
      socketPath,
      hostPrefix,
      siteTablePath: join(configDir, SITE_TABLE_FILE_NAME),
    }),
    engineFragment: join(configDir, 'engine.env.fragment'),
    // ONE UNIT PER INSTANCE, not a shared template. A template (`…@.service`) can vary the
    // instance name and nothing else — but ReadWritePaths= has to name THIS museum's
    // webspaces, which are per-site and therefore per-instance. An explicit instance file
    // is what systemd resolves first, so the generated unit is complete rather than a
    // template plus a drop-in that has to be kept in step with it. The vhosts go the other
    // way, per SITE, because a vhost carries one server_name and one document root.
    unitName: `${USER_PREFIX}builder@${instance}.service`,
    unitPath: join(unitDir, `${USER_PREFIX}builder@${instance}.service`),
    runtimeDirectory,
    runtimeDir,
    socketPath,
    webspaceBase,
    sites,
    serving: manifest.serving,
    resources: manifest.resources ?? {},
    enginePrivateDir,
  };

  return Object.freeze(layout);
}

/**
 * THE RENDERED ENV, as a record — the instance's `env` file before it is a file.
 *
 * Derived rather than hand-written because that is the whole point of the declaration:
 * `SITES_ROOT`, `AGENT_HOME`, `AUDIT_DIR` and `WEBSPACE_BASE` are the same roots
 * `readWritePaths()` confines and the provisioner creates, so a root that moved in
 * instance.json moves in all three at once, or in none.
 *
 * SECRET-FREE BY CONSTRUCTION. Provider values reach the process only through systemd
 * LoadCredential; what appears here is at most a PATH (`PUBLICATION_API_KEY_FILE`), which
 * is exactly what makes it safe for this file to be readable by the service user at all.
 *
 * ONLY STATED LIMITS APPEAR — see LIMIT_ENV for why src/config.ts must stay their owner.
 */
function buildEnvVars(
  manifest: InstanceManifest,
  derived: {
    instance: string;
    roots: { workspaces: string; home: string; audit: string };
    webspaceBase: string;
    webServer: WebServer;
    socketPath: string;
    hostPrefix: string;
    siteTablePath: string;
  },
): Readonly<Record<string, string>> {
  const env: Record<string, string> = {
    DEDALO_SITE_INSTANCE: derived.instance,
    DEPLOYMENT_MODE: derived.webServer,
    // WHERE THE DAEMON LISTENS — the same socket the engine is told to dial, spelled once.
    // Never a port: the socket's ownership (0660 <user>:<engineGroup>) IS the access
    // decision, and a TCP listener would publish the daemon to every uid on the host.
    [LISTEN_KIND_KEY]: 'unix',
    [LISTEN_SOCKET_KEY]: derived.socketPath,
    SITES_ROOT: derived.roots.workspaces,
    AGENT_HOME: derived.roots.home,
    AUDIT_DIR: derived.roots.audit,
    WEBSPACE_BASE: derived.webspaceBase,
    // WHERE EVERY SITE OF THIS INSTANCE LIVES — the file, not the rule.
    //
    // WEBSPACE_BASE above is still rendered because the unit confines it and an operator
    // reads it, but the daemon no longer computes a placement out of it: `sites[].webspace`
    // may override the default per site, and a daemon re-deriving `<base>/<domain>` would
    // publish into a directory no vhost serves (measured on the reference declaration's
    // 'archive' site). This key names the table that answers instead.
    [SITE_TABLE_FILE_KEY]: derived.siteTablePath,
    // WHERE A SITE ANSWERS, in the two halves the daemon cannot derive for itself.
    //
    // A site's URL is now a fact about the SITE (its domain, in site.json) and not about
    // the instance — that is why PREPROD_BASE_URL/PROD_BASE_URL are gone; an instance-wide
    // pair could only ever be one site's. What is left over is the part the DECLARATION
    // owns and the daemon has no other way to learn: the draft vhost's host prefix
    // (`pre` → https://pre.www.example.org/) and whether this host answers the public site
    // over TLS at all. Rendered here rather than guessed there, because a guessed scheme is
    // a "your site is live at …" link that does not open.
    PREPROD_HOST_PREFIX: derived.hostPrefix,
    PROD_URL_SCHEME: manifest.serving?.prod?.tls?.mode === 'none' ? 'http' : 'https',
    PUBLICATION_API_URL: assertMatches(
      API_URL_PATTERN,
      'publication_api.url',
      manifest.publication_api?.url as string,
    ),
    AGENT_DRIVER: manifest.agent.driver,
  };

  if (manifest.publication_api?.key_path) {
    env[PUBLICATION_API_KEY_FILE_KEY] = absoluteRoot(
      'publication_api.key_path',
      manifest.publication_api.key_path,
    );
  }

  for (const [driver, bin] of Object.entries(manifest.agent.bins ?? {})) {
    if (!bin) continue;
    env[DRIVER_BIN_ENV[driver as AgentDriverId]] = absoluteRoot(`agent.bins.${driver}`, bin);
  }

  for (const [field, key] of Object.entries(LIMIT_ENV)) {
    const value = (manifest.limits ?? {})[field as keyof ManifestLimits];
    if (value !== undefined) env[key] = String(value);
  }

  return Object.freeze(env);
}

/**
 * One site's placement: its webspace, its two release stores, its two served links and its
 * two vhost files.
 */
function buildSite(
  site: ManifestSite,
  ctx: { webspaceBase: string; vhostDir: string; instance: string; hostPrefix: string },
): SiteLayout {
  const slug = assertMatches(SLUG_PATTERN, 'site slug', site.slug);
  const domain = assertMatches(DOMAIN_PATTERN, `domain for site '${slug}'`, site.domain);
  // The DEFAULT is `webspaceFor()` — the same function `src/sites/webspace.ts` calls at
  // runtime, so the directory this provisioner creates is the directory that daemon
  // publishes into. An explicit override is accepted for a host with its own www layout,
  // and it is the one shape the daemon cannot re-derive: it will refuse such a site by
  // name at build time rather than publish into a tree no vhost serves.
  const webspace = site.webspace
    ? absoluteRoot(`webspace for site '${slug}'`, site.webspace)
    : webspaceFor(ctx.webspaceBase, domain);

  // The vhost file name is spelled from USER_PREFIX like everything else, and carries the
  // instance AND the slug: two museums on one host may both own the slug 'coleccion', and
  // two files of that name in /etc/nginx/sites-available would be one museum silently
  // serving the other's document root.
  const vhostPaths = Object.freeze({
    prod: join(ctx.vhostDir, `${USER_PREFIX}${ctx.instance}-${slug}.conf`),
    preprod: join(ctx.vhostDir, `${USER_PREFIX}${ctx.instance}-${slug}-pre.conf`),
  });

  return Object.freeze({
    slug,
    domain,
    preprodDomain: preprodDomainFor(ctx.hostPrefix, domain),
    webspace,
    releasesDir(surface: Surface): string {
      return surfacePaths(webspace, surface).storeDir;
    },
    linkPath(surface: Surface): string {
      return surfacePaths(webspace, surface).linkPath;
    },
    vhostPaths,
  });
}

function surfaceDir(surface: Surface): string {
  const dir = SURFACE_DIR[surface];
  if (!dir) throw new Error(`layout: unknown surface '${surface}'`);
  return dir;
}

/**
 * Two sites may not share a slug, a domain or a webspace. A duplicate slug is an
 * instance-local id collision; a duplicate domain or webspace is worse — two sites
 * publishing into the same served tree, where the last promote silently wins.
 */
function assertNoCollisions(sites: readonly SiteLayout[]): void {
  const seen = new Map<string, string>();
  for (const site of sites) {
    for (const [what, value] of [
      ['slug', site.slug],
      ['domain', site.domain],
      ['webspace', site.webspace],
    ] as const) {
      const key = `${what}:${value}`;
      const first = seen.get(key);
      if (first !== undefined) {
        throw new Error(
          `layout: sites '${first}' and '${site.slug}' declare the same ${what} '${value}'.`,
        );
      }
      seen.set(key, site.slug);
    }
  }
}

/**
 * THE HARD RULE, re-run over the DERIVED paths.
 *
 * A webspace is served by a web server that follows symlinks and would happily hand out
 * anything under it. A workspace holds a git repository (every past revision of the site,
 * including anything an agent ever pasted into it), the agent's working tree, a
 * `node_modules` nobody in this project audited, and the daemon's private `.builder/`
 * state; the agent HOME holds the vendor CLI's session state; the audit directory holds
 * the record of what was done. None of the three may overlap a served tree in EITHER
 * direction.
 *
 * The schema checks this over the paths the museum WROTE DOWN. It must be checked AGAIN
 * here, because a root and a webspace can both be defaults and still collide once an
 * override moved one of them: `paths.state_base: "/home/www/state"` is a declaration in
 * which nothing overlaps until it is derived.
 */
function assertRootsAreNotServed(
  roots: { workspaces: string; home: string; audit: string },
  sites: readonly SiteLayout[],
  webspaceBase: string,
): void {
  const served: { label: string; path: string }[] = [
    { label: 'the webspace base', path: webspaceBase },
    ...sites.map(site => ({ label: `site '${site.slug}'s webspace`, path: site.webspace })),
  ];
  for (const [label, root] of Object.entries(roots)) {
    for (const space of served) {
      if (pathsOverlap(root, space.path)) {
        throw new Error(
          `layout: the derived '${label}' root '${root}' overlaps ${space.label} ` +
            `('${space.path}'). A workspace holds the git repo, the agent tree and ` +
            `.builder/; the agent HOME holds its session state; a webspace is SERVED. ` +
            `Nothing was derived.`,
        );
      }
    }
  }
}

/**
 * The engine's private directory holds that museum's `.env`, its backups and its media.
 * The service user must not be able to reach it — that separation is the entire reason
 * this daemon runs as its own uid — so it must lie outside every root and every webspace,
 * the derived ones included.
 */
function assertEnginePrivateIsDisjoint(
  enginePrivateDir: string,
  roots: { workspaces: string; home: string; audit: string },
  sites: readonly SiteLayout[],
  webspaceBase: string,
): void {
  const others: { label: string; path: string }[] = [
    ...Object.entries(roots).map(([label, path]) => ({ label: `roots.${label}`, path })),
    { label: 'the webspace base', path: webspaceBase },
    ...sites.map(site => ({ label: `site '${site.slug}'s webspace`, path: site.webspace })),
  ];
  for (const other of others) {
    if (pathsOverlap(enginePrivateDir, other.path)) {
      throw new Error(
        `layout: engine.private_dir '${enginePrivateDir}' overlaps ${other.label} ` +
          `('${other.path}') — the engine's private directory must lie OUTSIDE every ` +
          `site-builder root, or the service user (and every agent turn it runs) can read ` +
          `the engine's credentials. Nothing was derived.`,
      );
    }
  }
}


/**
 * THE WRITABLE SET MUST BE SANE ON ITS OWN TERMS.
 *
 * `readWritePaths()` turns this set into the unit's `ReadWritePaths=`, i.e. into the exact
 * list of places `ProtectSystem=strict` will let this museum's daemon — and every agent
 * turn it runs — write. Three failures are possible and none of them is caught by checking
 * roots against webspaces:
 *
 *   - A site may declare its webspace AS the shared webspace base. Nothing about that is
 *     ill-formed, and the result is `ReadWritePaths=/home/www`: this museum's agent can
 *     write EVERY other museum's served tree. The default per-site webspace is a child of
 *     the base, so the rule is "strictly inside, or wholly outside — never the base
 *     itself, and never a parent of it".
 *   - Two sites may resolve to overlapping webspaces (the same declared path, or one
 *     inside the other), which makes one site's publish able to overwrite another's.
 *   - A control path may land INSIDE the writable set. `paths.config_base` inside
 *     `roots.workspaces` puts the rendered env, the htpasswd and — fatally — `secrets/`
 *     under ReadWritePaths, so the daemon can rewrite its own configuration and read the
 *     credentials that `LoadCredential` exists to keep it from reading. That is the whole
 *     isolation story inverted by one declaration.
 *
 * Checked HERE, on derived values, for the same reason as the roots-vs-served check: two
 * defaults that overlap only after an override moved one of them are still an overlap.
 */
function assertWritableSetIsSane(
  roots: { workspaces: string; home: string; audit: string },
  runtimeDir: string,
  sites: readonly SiteLayout[],
  webspaceBase: string,
  control: { configDir: string; secretsDir: string; unitDir: string },
): void {
  // A site webspace may sit under the shared base or somewhere else entirely, but it may
  // never BE the base, nor contain it.
  for (const site of sites) {
    if (site.webspace === webspaceBase || isStrictlyWithin(webspaceBase, site.webspace)) {
      throw new Error(
        `layout: site '${site.slug}' declares its webspace as '${site.webspace}', which ` +
          `is (or contains) the shared webspace base '${webspaceBase}'. The unit's ` +
          `ReadWritePaths= would then grant this instance write access to every other ` +
          `instance's served tree. Give the site its own directory under the base, or a ` +
          `path outside it. Nothing was derived.`,
      );
    }
  }

  // Everything the unit will make writable, pairwise disjoint.
  const writable: { label: string; path: string }[] = [
    { label: "roots.workspaces", path: roots.workspaces },
    { label: "roots.home", path: roots.home },
    { label: "roots.audit", path: roots.audit },
    { label: 'the runtime directory', path: runtimeDir },
    ...sites.map(site => ({ label: `site '${site.slug}'s webspace`, path: site.webspace })),
  ];
  for (let i = 0; i < writable.length; i++) {
    for (let j = i + 1; j < writable.length; j++) {
      const a = writable[i]!;
      const b = writable[j]!;
      if (pathsOverlap(a.path, b.path)) {
        throw new Error(
          `layout: ${a.label} ('${a.path}') overlaps ${b.label} ('${b.path}'). Every ` +
            `entry of ReadWritePaths= must name a distinct tree, or one site's publish ` +
            `can overwrite another's. Nothing was derived.`,
        );
      }
    }
  }

  // The control paths are root-owned on purpose and must stay outside all of it.
  const controls: { label: string; path: string }[] = [
    { label: 'the instance config directory', path: control.configDir },
    { label: 'the secrets directory', path: control.secretsDir },
    { label: 'the systemd unit directory', path: control.unitDir },
  ];
  for (const c of controls) {
    for (const w of writable) {
      if (pathsOverlap(c.path, w.path)) {
        throw new Error(
          `layout: ${c.label} ('${c.path}') overlaps ${w.label} ('${w.path}'). The ` +
            `daemon would be able to rewrite its own configuration, or read the secret ` +
            `files that LoadCredential exists to keep out of its reach. Nothing was ` +
            `derived.`,
        );
      }
    }
  }
}

/* ────────────────────────────────────────────────────────────────────────────────────
 * readWritePaths()
 * ──────────────────────────────────────────────────────────────────────────────────── */

/**
 * THE EXACT SET the generated unit's ReadWritePaths= must name, under
 * ProtectSystem=strict.
 *
 * This function exists because the artifact it replaces named two literal roots that did
 * not follow the installer's root overrides. Under ProtectSystem=strict everything not
 * listed here is mounted read-only, so a path the daemon legitimately writes and this set
 * omits does not fail at install time or at boot — it fails as EROFS the first time a
 * museum publishes. The fix is structural, not a longer list: this takes the same LAYOUT
 * OBJECT the paths came from, so there is no second place where a root could be renamed
 * and forgotten.
 *
 * What is in, and why the rest is out:
 *   - the three state roots (workspaces, home, audit) — the daemon and its agent children
 *     write inside all three, wherever an override put them;
 *   - the runtime dir — the daemon binds its socket there. systemd's RuntimeDirectory=
 *     already makes it writable; it is listed anyway so this set is complete on its own
 *     terms, and so a reader of this one function sees everything the process may write;
 *   - EVERY site webspace — publish copies release bytes in and swaps the served symlink.
 *     Every site individually, including one whose `webspace` override put it outside the
 *     webspace base: naming the base instead of the sites is precisely the shortcut that
 *     produced the EROFS.
 * NOT the config dir, NOT the secrets dir, NOT the state dir itself: those are root-owned
 * on purpose. The daemon must be unable to rewrite its own env, read a credential file off
 * the disk, or replace one of its own roots.
 *
 * Every path returned must EXIST when the unit starts (systemd fails a unit on a missing
 * ReadWritePaths entry unless it is prefixed with '-', and hiding a missing root behind
 * '-' would restore exactly the silent-EROFS failure this function removes). Creating them
 * is the provisioner's job, from this same list.
 *
 * Sorted and de-duplicated so the rendered line is a pure function of the layout:
 * re-ordering the sites in instance.json must not look like drift to a
 * write-only-on-drift provisioner.
 */
export function readWritePaths(layout: InstanceLayout): string[] {
  const paths = [
    layout.roots.workspaces,
    layout.roots.home,
    layout.roots.audit,
    layout.runtimeDir,
    ...layout.sites.map(site => site.webspace),
  ];
  return [...new Set(paths)].sort();
}

/**
 * Is `path` covered by the unit's writable set? The predicate a gate — and the
 * provisioner's `--check` — asks, rather than re-deriving containment at each call site.
 * `isWithin` is the daemon's own confinement helper, the same one that keeps a copy inside
 * a root, so "the unit permits this write" and "the daemon permits this write" stay one
 * question with one answer.
 */
export function isWritablePath(layout: InstanceLayout, path: string): boolean {
  return readWritePaths(layout).some(root => isWithin(root, path));
}

/* ────────────────────────────────────────────────────────────────────────────────────
 * credentialSources()
 * ──────────────────────────────────────────────────────────────────────────────────── */

/**
 * EVERY SECRET THIS INSTANCE'S DAEMON MUST BE HANDED, and the root-owned file each comes
 * out of — the exact map the unit's `LoadCredential=` lines are rendered from.
 *
 * WHY IT IS NOT JUST `layout.secrets`. `secrets` is what the museum DECLARED, and two of
 * the daemon's credentials are never declared:
 *
 *   - `SERVICE_TOKEN` is minted by the provisioner (`plan.ts`) at `secretPath(SERVICE_TOKEN)`
 *     and quoted to the operator by the pairing fragment. Rendering `LoadCredential=` from
 *     `secrets` alone left that file minted, named in the fragment, `cat`-ed by the operator
 *     into the engine's env — and never handed to the daemon at all. The daemon then refuses
 *     to boot for want of the one credential the provisioner had just created for it, which
 *     is a fully converged provision that cannot run.
 *   - `PUBLICATION_API_KEY` is declared as a PATH (`publication_api.key_path`) rather than
 *     under `secrets`, and that path is a 0600 root:root file inside a 0700 directory. The
 *     rendered env carries the path, which the service user cannot open. Naming it here is
 *     what turns a path the daemon can read ABOUT into a value it can read.
 *
 * A DECLARED KEY ALWAYS WINS. If the declaration names its own `secrets.SERVICE_TOKEN`, that
 * file is the one loaded — the same expression `plan.ts` mints into and the fragment quotes,
 * so the three cannot name three different files. And one key can never appear twice:
 * `LoadCredential=` takes an id, and two lines with the same id is a unit systemd refuses.
 *
 * Sorted, so the rendered lines are a pure function of the layout rather than of the order
 * the declaration happened to list its secrets in.
 */
export function credentialSources(layout: InstanceLayout): Readonly<Record<string, string>> {
  const sources: Record<string, string> = {};

  // The bearer first, so a declared entry below overwrites it with the museum's own path
  // rather than the other way round.
  sources[SERVICE_TOKEN_KEY] = layout.secretPath(SERVICE_TOKEN_KEY);

  const apiKeyFile = layout.envVars[PUBLICATION_API_KEY_FILE_KEY];
  if (apiKeyFile) sources[PUBLICATION_API_KEY_KEY] = apiKeyFile;

  for (const [key, path] of Object.entries(layout.secrets)) sources[key] = path;

  return Object.freeze(
    Object.fromEntries(Object.entries(sources).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))),
  );
}
