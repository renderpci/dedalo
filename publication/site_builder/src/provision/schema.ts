/**
 * instance.json — THE declaration of one museum's site-builder tenancy, and the only place
 * a host artifact's shape is ever stated.
 *
 * An INSTANCE is one museum. The topology is fixed and 1:1 — that museum's Dédalo engine,
 * its database, its ../private/.env, and this daemon, paired by a single
 * DEDALO_SITE_BUILDER_URL/_TOKEN. There is no engine-side tenant map to keep in sync,
 * because there is nothing to map: one engine, one site builder, one user, one group.
 *
 * Everything else on the host is GENERATED from the file this module validates — the
 * systemd unit, the nginx/apache vhosts, the rendered env, the per-instance htpasswd, the
 * users/groups/roots/modes, the engine pairing fragment. That is the same discipline as
 * the engine's src/core/media/protection.ts: pure builders fed by one declaration, written
 * only on drift. It is why install.sh, deploy/*.service, nginx/*.conf, apache/*.conf and
 * sample.env stop being editable text and become functions of THIS object.
 *
 * WHY THE VALIDATION IS SO SEVERE. A site-builder agent turn executes arbitrary generated
 * code as the service user, so the isolation between two museums is a uid, a gid, and a
 * set of filesystem modes — nothing else. Every one of those is derived from this file. A
 * typo that is quietly accepted here does not produce a wrong log line; it produces a
 * museum whose drafts, credentials or published bytes are reachable from another museum's
 * agent. So: no unknown keys, no relative paths, no inlined credentials, and never a
 * default for a switch that decides who can read something.
 *
 * DIVISION OF LABOUR — AND WHY THIS FILE OWNS NO CONSTANT.
 * `src/provision/layout.ts` DERIVES and therefore OWNS: every grammar, every default path,
 * the identity prefix and its arithmetic, the mode matrix, and the containment predicate.
 * This module VALIDATES: it imports all of them and adds only what zod is for — shape,
 * strictness, cross-field agreement, and an error an operator can act on. The provisioner
 * WRITES.
 *
 * That direction is not a preference. These two files were once written blind to each
 * other, and each declared its own instance pattern, its own `dedalo-site-` prefix (one of
 * them off by a character, which moved the length ceiling), its own `/home/www`, and its
 * own "does a contain b" predicate. Nothing composed the two, so nothing could notice.
 * A grammar with two owners is a grammar that will disagree with itself on the day it
 * matters; the composition is now asserted directly — `derive(parseManifest(doc))` — in
 * `tests/provision.test.ts`.
 *
 * DEFAULTS BELONG TO WHOEVER OWNS THE THING DEFAULTED. So there are almost none here: the
 * webspace base, the preprod host prefix, the realm and the web-server flavour default in
 * `layout.ts`, and the seven `limits` default in `src/config.ts` — which is why `limits`
 * fields below are optional and defaultless. A default in this file would silently shadow
 * the owner's, and the shadow only becomes visible on the day the owner's value changes
 * and nothing moves.
 *
 * Same voice as src/config.ts and src/sites/manifest.ts: zod, a frozen validated result,
 * and a loud refusal in preference to a surprising default.
 */

import { isAbsolute } from 'node:path';
import { z } from 'zod';
import { SLUG_PATTERN } from '../util/slug';
import type { DriverId } from '../drivers/types';
import {
  API_URL_PATTERN,
  CPU_QUOTA_PATTERN,
  DESCRIPTION_PATTERN,
  DOMAIN_PATTERN,
  DRIVER_IDS,
  EMAIL_PATTERN,
  HOST_LABEL_PATTERN,
  INSTANCE_PATTERN,
  LIMIT_ENV,
  LOGIN_NAME_PATTERN,
  MAX_INSTANCE_LENGTH,
  MAX_USERNAME_LENGTH,
  REALM_PATTERN,
  SECRET_KEY_PATTERN,
  SYSTEMD_SIZE_PATTERN,
  UNIX_NAME_PATTERN,
  USER_PREFIX,
  isStrictlyWithin,
  pathsOverlap,
  tidyPath,
} from './layout';
import type { InstanceManifest } from './layout';

/**
 * The manifest type is layout's, re-exported so a consumer that only needs the parser does
 * not have to know there are two files. It is a RE-EXPORT and not a second declaration:
 * `parseManifest()` returns exactly what `derive()` accepts, and the compiler is what says
 * so — if the schema below ever stops producing that shape, this file stops building,
 * which is the failure the three-file drift never had.
 */
export type { InstanceManifest } from './layout';

/**
 * The driver list is layout's too. This assignment is the tripwire in the other direction:
 * if `src/drivers/types.ts` gains or renames a driver, one of the two lines below stops
 * compiling and the declaration grammar is corrected in the same commit as the driver.
 */
const _driverIdsAreExhaustive: readonly DriverId[] = DRIVER_IDS;
const _driverIdsAreExact: (typeof DRIVER_IDS)[number] extends DriverId ? true : never = true;
void _driverIdsAreExhaustive;
void _driverIdsAreExact;

/**
 * THE CREDENTIAL LAW. Any property whose NAME says it holds a credential must carry a
 * PATH to a root-owned 0600 file — never the credential. Enforced by a walk over the RAW
 * document (see collectInlinedCredentials), not by the schema alone, because the point is
 * to catch a secret pasted ANYWHERE: in a key this schema does not know, in a nested
 * object, in a list. instance.json is 0644 root-readable configuration that gets copied
 * into tickets and backups; the secret material lives in `secrets/<KEY>`, 0600 root:root,
 * and reaches the process only through systemd's LoadCredential.
 *
 * This one grammar lives here rather than in layout.ts because it describes what a
 * DECLARATION may contain, not what the host layout is: nothing is ever derived from it.
 */
export const CREDENTIAL_NAME_PATTERN = /(KEY|TOKEN|SECRET|PASSWORD)/i;

// ---------------------------------------------------------------------------------------
// Path primitives
// ---------------------------------------------------------------------------------------

/**
 * An absolute filesystem path — REFUSED when relative, unlike src/config.ts's
 * `absolutePath`, which resolves against cwd.
 *
 * The difference is deliberate and is the difference between the two files. config.ts
 * parses the daemon's OWN environment, where a relative root is a developer running from
 * the repo. This file is a host declaration read by root and turned into ownerships and
 * mount-visible directories: resolving a root against cwd would give one museum a
 * different layout depending on which directory the operator happened to run the
 * provisioner from. A path here means the same thing from everywhere, or it is refused.
 *
 * A '..' segment is refused for the same reason — `/var/lib/../etc` is a real path that
 * reads as a mistake, and every containment check below would be reasoning about a string
 * that is not where the bytes go.
 */
function absolutePathSchema(what: string) {
  return z
    .string()
    // `abort` on each step: one wrong value earns ONE message. Reporting that a path is
    // both relative and traversing tells the operator nothing the first line did not.
    .refine(value => isAbsolute(value.trim()), {
      message: `${what} must be an ABSOLUTE path (starting with '/'); a relative path would mean a different directory depending on where the provisioner was run`,
      abort: true,
    })
    .refine(value => !value.split('/').includes('..'), {
      message: `${what} must not contain a '..' segment — write the path it actually resolves to`,
      abort: true,
    })
    .refine(value => tidyPath(value) !== '/', {
      message: `${what} must not be '/' — a root of '/' contains every other path, which would make every isolation check below vacuously true`,
      abort: true,
    })
    .transform(tidyPath);
}

// ---------------------------------------------------------------------------------------
// Field schemas
// ---------------------------------------------------------------------------------------

/**
 * A public hostname, against layout's DOMAIN_PATTERN. The regex alone would reject the
 * three things operators actually type — a URL, a host:port, a host with a path — with
 * "invalid string", so those get their own message naming the fix.
 */
function hostnameSchema(what: string) {
  return z
    .string()
    .trim()
    .refine(value => !value.includes('://') && !value.includes('/'), {
      message: `${what} is a HOSTNAME, not a URL — write 'www.example.org', with no scheme and no path`,
      abort: true,
    })
    .refine(value => !value.includes(':'), {
      message: `${what} must not carry a port — the generated vhost decides the ports`,
      abort: true,
    })
    .refine(value => value === value.toLowerCase(), {
      message: `${what} must be lowercase — it is compared against the other declared hostnames, and two spellings of one name would pass the duplicate check`,
      abort: true,
    })
    .refine(value => DOMAIN_PATTERN.test(value), {
      message: `${what} must be a dotted DNS hostname of up to 253 characters (letters, digits and hyphens per label)`,
    });
}

/**
 * An agent CLI binary — an ABSOLUTE path, never a bare command name.
 *
 * src/config.ts still defaults CLAUDE_CODE_BIN to the bare name 'claude', which is
 * resolvable only through PATH. PATH is shared: on a host running several museums, a bare
 * name is a cross-instance substitution vector — anything that lands a `claude` earlier on
 * the search path runs, as this museum's service user, inside this museum's workspaces.
 * The instance declaration pins the inode, not the lookup.
 */
const agentBinSchema = z
  .string()
  .refine(value => isAbsolute(value.trim()), {
    message:
      "agent.bins entries must be ABSOLUTE paths, never bare command names: a bare name is resolved through the shared PATH, so another instance (or anything that can write a directory on it) chooses which binary runs as this museum's service user",
    abort: true,
  })
  .transform(tidyPath);

/** A unix user or group name the host already owns, or an adopted instance already uses. */
function unixNameSchema(what: string) {
  return z
    .string()
    .regex(
      UNIX_NAME_PATTERN,
      `${what} must be a valid Linux user/group name (lowercase, up to ${MAX_USERNAME_LENGTH} characters)`,
    );
}

/**
 * An ADOPTED identity — a museum already running under a hand-made user, kept expressible
 * in this vocabulary instead of being the one host the provisioner cannot describe. New
 * instances omit it and layout.ts derives `dedalo-site-<instance>`, which is the safer
 * form: derived names cannot collide, and cannot escape the length arithmetic.
 */
const identitySchema = z.strictObject({
  user: unixNameSchema('identity.user'),
  group: unixNameSchema('identity.group'),
});

/**
 * One site: a slug, the domain it owns, and optionally the webspace it lives in.
 *
 * The slug grammar is the EXISTING one (src/util/slug.ts), unchanged and instance-local —
 * two museums may both own 'coleccion', because a slug is a directory under one instance's
 * roots and never a global name. The domain is what makes a site addressable, and it is
 * global to the host, so it joins the hostname census below.
 */
const siteSchema = z.strictObject({
  slug: z
    .string()
    .regex(
      SLUG_PATTERN,
      'sites[].slug must be 2-40 lowercase letters, digits and hyphens, starting with a letter (src/util/slug.ts) — the slug is a directory name and a git repo name',
    ),
  domain: hostnameSchema('sites[].domain'),
  /** `web`, `pre` and the two `.releases` stores. Derived from webspace_base + domain when absent. */
  webspace: absolutePathSchema('sites[].webspace').optional(),
});

/**
 * A preprod reviewer. The PASSWORD IS A PATH — the provisioner reads that root-owned file
 * and runs htpasswd; instance.json carries the name and the location, never the secret.
 * (`password_file` matches the credential law's pattern, and satisfies it, which is the
 * point: the law is not a special case for provider keys, it is how this file talks about
 * every credential.)
 */
const preprodUserSchema = z.strictObject({
  name: z
    .string()
    .regex(LOGIN_NAME_PATTERN, 'serving.preprod.auth.users[].name must be a plain lowercase login name'),
  password_file: absolutePathSchema('serving.preprod.auth.users[].password_file'),
});

/**
 * SECURITY SWITCHES HAVE NO DEFAULTS. `enabled` and `auth.mode` are required, so a
 * declaration cannot leave a museum's unpublished drafts open by omission — the file
 * either says the draft surface is authenticated or it says, in as many words, that it is
 * not.
 *
 * `realm` and `host_prefix` are ergonomic and DO have defaults — in layout.ts, which owns
 * them, not here. What they are checked for here is the thing a length or an enum cannot
 * express: both are rendered VERBATIM into a root-owned web-server configuration file, the
 * realm inside a pair of double quotes (`auth_basic "…";`, `AuthName "…"`). An
 * unconstrained realm can therefore close its own quote and open a `location` block of the
 * declaration author's choosing, in a file nginx reads as root. Every string in this file
 * that reaches a rendered artifact is treated with the same suspicion a domain always was.
 */
const preprodSchema = z.strictObject({
  enabled: z.boolean(),
  /** The label prefixed to a site's domain for its draft vhost: 'pre' → pre.www.example.org. */
  host_prefix: z
    .string()
    .regex(HOST_LABEL_PATTERN, 'serving.preprod.host_prefix must be a single DNS label')
    .optional(),
  auth: z.strictObject({
    mode: z.enum(['htpasswd', 'none']),
    realm: z
      .string()
      .regex(
        REALM_PATTERN,
        'serving.preprod.auth.realm is rendered inside quotes in a root-owned web-server config: letters, digits, spaces and . _ : , ( ) / - only, up to 64 characters. No quote, no backslash, no semicolon, no newline.',
      )
      .optional(),
    /** PER INSTANCE, 0640 root:<web group>. Derived when absent; stated only by an adopted layout. */
    htpasswd: absolutePathSchema('serving.preprod.auth.htpasswd').optional(),
    users: z.array(preprodUserSchema).default([]),
  }),
});

/**
 * TLS is REQUIRED to be stated, including the choice not to terminate it here ('none', for
 * a museum behind an upstream terminator). An absent `tls` block would have to mean either
 * "no TLS" or "TLS elsewhere", and a public heritage site is not a place to guess which.
 * 'files' additionally requires both paths (cross-checked below).
 */
const tlsSchema = z.strictObject({
  mode: z.enum(['letsencrypt', 'files', 'none']),
  certificate: absolutePathSchema('serving.prod.tls.certificate').optional(),
  /** The private key PATH. (`key` matches the credential law, and a path is what it must be.) */
  key: absolutePathSchema('serving.prod.tls.key').optional(),
  /** Rendered into the ACME registration; narrow, because it lands on a command line. */
  account_email: z
    .string()
    .trim()
    .regex(
      EMAIL_PATTERN,
      'serving.prod.tls.account_email must be a plain address (no display name, no quotes, no spaces) — it is rendered into the certificate-provisioning invocation',
    )
    .optional(),
});

/**
 * `aliases` maps an extra hostname to the site that owns it, rather than listing bare
 * hostnames: an alias with no target cannot be turned into a vhost, so a list would be a
 * declaration the provisioner has to guess at. As a map it is checkable — the target must
 * be a declared slug — and it joins the same hostname-uniqueness census as the domains.
 */
const servingSchema = z.strictObject({
  preprod: preprodSchema,
  prod: z.strictObject({ tls: tlsSchema }),
  aliases: z.record(hostnameSchema('serving.aliases key'), z.string().regex(SLUG_PATTERN)).prefault({}),
});

const agentSchema = z.strictObject({
  driver: z.enum(DRIVER_IDS),
  /** Only the drivers this museum actually has installed; the selected one is required (checked below). */
  bins: z.partialRecord(z.enum(DRIVER_IDS), agentBinSchema).prefault({}),
});

/**
 * THIS museum's read-only Publication API v2 — the one data source every site it builds is
 * built against, and a per-instance fact because each museum publishes its OWN data.
 *
 * It is declared here because it was, until now, a deployment fact that existed in the
 * documentation and in the daemon's hand-written env and in NOTHING the provisioner could
 * read: exactly the shape of duplication this file exists to end. `key_path` names a
 * root-owned 0600 file (the credential law again — never the key itself), and the rendered
 * env carries the PATH under `PUBLICATION_API_KEY_FILE`, never a value.
 */
const publicationApiSchema = z.strictObject({
  url: z
    .string()
    .trim()
    .regex(
      API_URL_PATTERN,
      "publication_api.url must be a plain http(s) BASE url — scheme, host, optional port and path, nothing else. It is rendered into the instance's env and substituted into every scaffolded site's source, so a query, a fragment or an embedded credential would be baked into published bytes.",
    ),
  key_path: absolutePathSchema('publication_api.key_path').optional(),
});

/**
 * The per-museum caps. These are the SAME quantities as src/config.ts's MAX_SITES,
 * SESSION_TURN_TIMEOUT_MS &c., and every field here is OPTIONAL WITH NO DEFAULT on
 * purpose: config.ts owns those defaults, and a second copy of them in this grammar would
 * shadow it silently. With defaults here, every rendered env would state today's value
 * explicitly, and the day somebody changed the daemon's default nothing would move on any
 * museum — the owner would have stopped owning it without any file saying so.
 *
 * So a stated limit is rendered into the env and a missing one is simply absent, and the
 * daemon applies its own. A museum that wants a different cap edits instance.json, never
 * the generated env — which the provisioner would overwrite anyway.
 *
 * The KEYS are layout's LIMIT_ENV, so the census cannot drift from the rendering.
 */
const limitsSchema = z
  .strictObject({
    max_sites: z.number().int().min(1).optional(),
    max_concurrent_sessions: z.number().int().min(1).optional(),
    session_turn_timeout_ms: z.number().int().min(1000).optional(),
    install_timeout_ms: z.number().int().min(1000).optional(),
    build_timeout_ms: z.number().int().min(1000).optional(),
    site_disk_quota_mb: z.number().int().min(1).optional(),
    releases_retained: z.number().int().min(1).optional(),
  })
  .optional();

/**
 * The kernel-enforced share of the host, rendered into the instance's systemd unit. Every
 * field is optional and an absent one means "the host's default", which is a truthful
 * absence: inventing a MemoryMax for a museum nobody sized would turn an unstated policy
 * into a silent OOM kill mid-build.
 */
const resourcesSchema = z
  .strictObject({
    /** systemd MemoryMax= — e.g. '4G'. */
    memory_max: z
      .string()
      .regex(SYSTEMD_SIZE_PATTERN, "resources.memory_max must be a systemd size such as '4G'")
      .optional(),
    /** systemd MemoryHigh= — the throttling threshold below memory_max. */
    memory_high: z
      .string()
      .regex(SYSTEMD_SIZE_PATTERN, "resources.memory_high must be a systemd size such as '3G'")
      .optional(),
    /** systemd CPUQuota= — e.g. '150%' (one and a half cores). */
    cpu_quota: z
      .string()
      .regex(CPU_QUOTA_PATTERN, "resources.cpu_quota must be a percentage such as '150%'")
      .optional(),
    /** systemd TasksMax= — a fork bomb in generated build code is a plausible Tuesday. */
    tasks_max: z.number().int().min(1).optional(),
  })
  .prefault({});

/** The three private roots, each optional: layout.ts derives every one that is not stated. */
const rootsSchema = z.strictObject({
  workspaces: absolutePathSchema('roots.workspaces').optional(),
  home: absolutePathSchema('roots.home').optional(),
  audit: absolutePathSchema('roots.audit').optional(),
});

/**
 * The host's BASES, all optional. `paths.state_base` moves the three roots together;
 * `roots.<x>` above moves one. Both exist because both questions are real, and both flow
 * through the same `derive()` — an override that reached one artifact and missed another
 * is the defect this subsystem was built to remove.
 */
const pathsSchema = z.strictObject({
  config_base: absolutePathSchema('paths.config_base').optional(),
  state_base: absolutePathSchema('paths.state_base').optional(),
  unit_dir: absolutePathSchema('paths.unit_dir').optional(),
  vhost_dir: absolutePathSchema('paths.vhost_dir').optional(),
  /**
   * Where the web server READS its vhosts. Debian's `sites-enabled/` by default; state it
   * EQUAL to `vhost_dir` on a host whose web server includes that directory wholesale
   * (RHEL's `conf.d/`), which is how such a host says "writing the file enables it".
   */
  vhost_enabled_dir: absolutePathSchema('paths.vhost_enabled_dir').optional(),
});

/**
 * THE MANIFEST. Every object is strict: an unknown property is refused, never ignored. A
 * silently dropped `webspacebase` would be a museum serving from the default root while
 * its declaration says otherwise — the exact class of divergence this whole design exists
 * to make impossible.
 */
export const instanceManifestSchema = z.strictObject({
  instance: z
    .string()
    .regex(
      INSTANCE_PATTERN,
      `instance must be 2-${MAX_INSTANCE_LENGTH} characters, lowercase letters/digits/hyphens, starting with a letter: it becomes the Linux user and group '${USER_PREFIX}<instance>', and the prefix plus that maximum must not exceed the ${MAX_USERNAME_LENGTH}-character user-name ceiling (asserted in layout.ts, never restated as a number)`,
    ),
  /** One line, rendered into every generated artifact's header — so, no newline. */
  description: z
    .string()
    .trim()
    .regex(
      DESCRIPTION_PATTERN,
      'description must be a single line of up to 200 characters with no control characters — it is rendered into the header comment of every generated artifact, where a newline would begin a directive',
    )
    .optional(),

  /**
   * The museum's engine. `private_dir` is that engine's ../private/ — the directory
   * holding its .env, its backups and its media. It is declared for TWO reasons: so the
   * provisioner can assert it lies OUTSIDE every root this daemon owns, and so the
   * generated pairing fragment lands in the right engine. The site builder never reads it.
   *
   * `group` is that engine's OS group. REQUIRED AND NEVER DEFAULTED, like `web.group`: the
   * name belongs to the host (whatever the engine's own unit was given), and a guessed one
   * is a 0660 socket the engine cannot open — discovered at the first request instead of
   * at provisioning time.
   */
  engine: z.strictObject({
    private_dir: absolutePathSchema('engine.private_dir'),
    group: unixNameSchema('engine.group'),
    /**
     * WHERE THE DAEMON'S OWN CODE AND RUNTIME ARE — the unit's `WorkingDirectory=` and
     * `ExecStart=`, both REQUIRED and both absolute.
     *
     * They were inferred, until 2026-08-30, from `private_dir` by a sibling convention:
     * `<parent>/master_dedalo/publication/site_builder` and `<parent>/.bun/bin/bun`. A
     * museum whose tree is laid out otherwise got a unit that could not start, pointed at
     * a directory nobody had created — and the unit it rendered told the operator to
     * declare `engine.checkout_dir`, which this schema then refused as an unknown field.
     * A required field is the honest form of a fact nobody can compute.
     */
    checkout_dir: absolutePathSchema('engine.checkout_dir'),
    bun_bin: absolutePathSchema('engine.bun_bin'),
  }),

  /**
   * The web server. `server` picks the vhost renderer (absent means layout's default) and
   * `group` is the runtime group that reads the served trees and the htpasswd — REQUIRED,
   * because it is `www-data` on Debian and `nginx` or `apache` elsewhere, and a guess is a
   * 0640 htpasswd the web server cannot read.
   */
  web: z.strictObject({
    server: z.enum(['nginx', 'apache']).optional(),
    group: unixNameSchema('web.group'),
  }),

  publication_api: publicationApiSchema,

  identity: identitySchema.optional(),
  paths: pathsSchema.optional(),
  roots: rootsSchema.optional(),
  webspace_base: absolutePathSchema('webspace_base').optional(),

  /** May be empty: a museum is provisioned before it has its first site. */
  sites: z.array(siteSchema).prefault([]),

  serving: servingSchema,
  agent: agentSchema,

  /**
   * PATHS ONLY, one per credential:
   * `{"ANTHROPIC_API_KEY": "/etc/dedalo_sites/instances/x/secrets/ANTHROPIC_API_KEY"}`.
   * Each becomes a systemd LoadCredential of the same name, read by systemd as root from a
   * 0600 file and exposed to the process alone. The daemon's env never holds the value, so
   * neither does a core dump of a build child, nor `systemctl show`, nor this file.
   */
  secrets: z
    .record(
      z
        .string()
        .regex(
          SECRET_KEY_PATTERN,
          'a secret name must be UPPER_SNAKE_CASE starting with a letter — it becomes a systemd LoadCredential id and an environment variable name',
        ),
      absolutePathSchema('secrets.<KEY>'),
    )
    .prefault({}),

  limits: limitsSchema,
  resources: resourcesSchema,
});

export type InstanceSite = z.infer<typeof siteSchema>;
export type InstanceIdentity = z.infer<typeof identitySchema>;
export type InstanceLimits = z.infer<typeof limitsSchema>;
export type InstanceResources = z.infer<typeof resourcesSchema>;

// ---------------------------------------------------------------------------------------
// Refusal
// ---------------------------------------------------------------------------------------

/** One thing wrong with the declaration, addressed by the property that is wrong. */
export interface ManifestIssue {
  /** Dotted/indexed property path, e.g. `sites[1].domain`. Empty string for the document itself. */
  path: string;
  message: string;
}

/**
 * The refusal. Not an ApiError (src/errors.ts): nothing about a host declaration belongs on
 * the HTTP surface — this is thrown at provisioning time and at boot, where the reader is
 * an operator with root and the right response is a non-zero exit and a list to fix.
 */
export class InstanceManifestError extends Error {
  constructor(
    readonly issues: readonly ManifestIssue[],
    readonly source?: string,
  ) {
    const where = source ? ` in ${source}` : '';
    const count = `${issues.length} problem${issues.length === 1 ? '' : 's'}`;
    super(
      `Invalid instance manifest${where} (${count}):\n` +
        issues.map(issue => `  - ${issue.path || '<document>'}: ${issue.message}`).join('\n'),
    );
    this.name = 'InstanceManifestError';
  }
}

/**
 * A rejected record KEY (a secret named in lower case, an alias that is not a hostname)
 * arrives as zod's generic "Invalid key in record" wrapping the real message. Unwrap it:
 * the operator needs the grammar, not the fact that a map had a bad key.
 */
function issueMessage(issue: z.core.$ZodIssue): string {
  const nested = (issue as { issues?: readonly { message: string }[] }).issues;
  if (nested && nested.length > 0) return nested.map(inner => inner.message).join('; ');
  return issue.message;
}

/**
 * zod's issue paths, rendered the way an operator would find the line in the JSON. A
 * segment that is not a bare identifier — a secret name is, a hostname key is not — is
 * bracketed and quoted, so `serving.aliases['museum-a.org']` reads as one map entry
 * rather than as three nested properties.
 */
function formatPath(path: readonly PropertyKey[]): string {
  let out = '';
  for (const segment of path) {
    if (typeof segment === 'number') out += `[${segment}]`;
    else if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(String(segment))) out += out ? `.${String(segment)}` : String(segment);
    else out += `['${String(segment)}']`;
  }
  return out;
}

/**
 * THE CREDENTIAL WALK — over the RAW document, before and independently of the schema.
 *
 * It has to be raw, and it has to be a walk: the pasted secret this catches is as likely to
 * be in a key this schema has never heard of as in `secrets`. A NAME that matches the law
 * carries either a container (an object or a list — `secrets` itself matches, and must:
 * recurse into it) or an absolute path. Anything else is the credential itself, and the
 * refusal names the property so the operator knows which value to move into secrets/ and
 * which key to rotate — because a secret that reached a 0644 file has been disclosed, and
 * moving it is only half the fix.
 */
function collectInlinedCredentials(node: unknown, path: string, into: ManifestIssue[]): void {
  if (Array.isArray(node)) {
    node.forEach((item, index) => collectInlinedCredentials(item, `${path}[${index}]`, into));
    return;
  }
  if (node === null || typeof node !== 'object') return;

  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    const here = path ? `${path}.${key}` : key;
    const isContainer = value !== null && typeof value === 'object';

    if (CREDENTIAL_NAME_PATTERN.test(key) && !isContainer) {
      if (typeof value !== 'string' || !isAbsolute(value.trim())) {
        into.push({
          path: here,
          message:
            `'${key}' names a credential (KEY|TOKEN|SECRET|PASSWORD), so it must carry the ABSOLUTE PATH of a ` +
            `root-owned 0600 file, never the value. instance.json is world-readable configuration that gets ` +
            `copied into backups and tickets — move this value to the instance's secrets/ directory, declare ` +
            `the path here, and ROTATE it: it has already been written to a readable file.`,
        });
      }
      continue;
    }

    if (isContainer) collectInlinedCredentials(value, here, into);
  }
}

/**
 * The checks that need the WHOLE parsed document — uniqueness, containment, and the pairs
 * of fields that must agree. They run only once the shape is valid (they read fields a
 * failed parse has not produced), which is why the credential walk above does not: it must
 * report a pasted secret even in a document that is otherwise unparseable.
 *
 * Containment is checked here over the paths the museum WROTE DOWN, and again in
 * `derive()` over the ones it produced. Two passes, ONE predicate (layout's
 * `pathsOverlap`) — because a derived root landing inside a served tree is the same defect
 * as a declared one, and this pass cannot see the derived paths at all.
 */
function collectSemanticIssues(manifest: z.infer<typeof instanceManifestSchema>): ManifestIssue[] {
  const issues: ManifestIssue[] = [];

  // --- Uniqueness. A duplicate slug is two sites sharing a directory; a duplicate domain
  // is two vhosts racing for the same name, where the winner is whichever file the web
  // server read last.
  const seenSlugs = new Map<string, number>();
  const seenDomains = new Map<string, string>();
  manifest.sites.forEach((site, index) => {
    const first = seenSlugs.get(site.slug);
    if (first !== undefined) {
      issues.push({
        path: `sites[${index}].slug`,
        message: `duplicate slug '${site.slug}' (already declared at sites[${first}]) — two sites would share one workspace and one release store`,
      });
    } else {
      seenSlugs.set(site.slug, index);
    }

    const owner = seenDomains.get(site.domain);
    if (owner !== undefined) {
      issues.push({
        path: `sites[${index}].domain`,
        message: `duplicate domain '${site.domain}' (already owned by '${owner}') — one hostname resolves to one site`,
      });
    } else {
      seenDomains.set(site.domain, site.slug);
    }
  });

  // --- Aliases: must target a declared site, and must not collide with a real domain.
  for (const [alias, slug] of Object.entries(manifest.serving.aliases)) {
    if (!seenSlugs.has(slug)) {
      issues.push({
        path: `serving.aliases['${alias}']`,
        message: `alias points at '${slug}', which is not a declared site — an alias with no target cannot become a vhost`,
      });
    }
    if (seenDomains.has(alias)) {
      issues.push({
        path: `serving.aliases['${alias}']`,
        message: `'${alias}' is already the canonical domain of site '${seenDomains.get(alias)}' — it cannot also be an alias`,
      });
    }
  }

  // --- The path inventory: everything this declaration positions on the filesystem.
  // Only DECLARED paths are here; layout.ts re-runs the same predicate over the derived
  // ones, and reports in the same vocabulary.
  const privateRoots: { label: string; path: string }[] = [];
  if (manifest.roots?.workspaces) privateRoots.push({ label: 'roots.workspaces', path: manifest.roots.workspaces });
  if (manifest.roots?.home) privateRoots.push({ label: 'roots.home', path: manifest.roots.home });
  if (manifest.roots?.audit) privateRoots.push({ label: 'roots.audit', path: manifest.roots.audit });

  const webspaces: { label: string; path: string }[] = manifest.sites.flatMap((site, index) =>
    site.webspace ? [{ label: `sites[${index}].webspace`, path: site.webspace }] : [],
  );

  const servedTrees = manifest.webspace_base
    ? [{ label: 'webspace_base', path: manifest.webspace_base }, ...webspaces]
    : webspaces;

  // Private roots must not nest in one another: audit inside workspaces would be an
  // append-only trail an agent turn can reach, which is not an append-only trail.
  for (let i = 0; i < privateRoots.length; i++) {
    for (let j = i + 1; j < privateRoots.length; j++) {
      const a = privateRoots[i]!;
      const b = privateRoots[j]!;
      if (pathsOverlap(a.path, b.path)) {
        issues.push({
          path: b.label,
          message: `'${b.path}' overlaps ${a.label} ('${a.path}') — the three private roots carry different owners and modes, so one inside another is a mode that does not hold`,
        });
      }
    }
  }

  // THE HARD RULE: web/pre/.releases may live in a webspace; a WORKSPACE never may. A git
  // repo, node_modules and .builder/ under a served root is the whole source tree (and the
  // agent's own state) one dotfile-rule mistake away from being downloadable.
  for (const root of privateRoots) {
    for (const space of servedTrees) {
      if (pathsOverlap(root.path, space.path)) {
        issues.push({
          path: root.label,
          message: `'${root.path}' overlaps ${space.label} ('${space.path}') — a workspace, the agent HOME and the audit trail must never be inside a SERVED tree`,
        });
      }
    }
  }

  // Two sites must not share (or nest inside) a webspace: publishing one would rewrite the
  // other's symlink, and pruning one's releases would delete bytes the other serves.
  for (let i = 0; i < webspaces.length; i++) {
    for (let j = i + 1; j < webspaces.length; j++) {
      const a = webspaces[i]!;
      const b = webspaces[j]!;
      if (pathsOverlap(a.path, b.path)) {
        issues.push({
          path: b.label,
          message: `'${b.path}' overlaps ${a.label} ('${a.path}') — one webspace per site, or a publish on one site rewrites the other`,
        });
      }
    }
  }

  // A stated webspace may sit under webspace_base, but may not BE it (nor contain it): the
  // base holding one site's release stores would put every other site inside that site's
  // webspace. Only checkable when the base was stated — otherwise it is layout's default,
  // and layout re-runs the whole containment pass over the derived paths anyway.
  if (manifest.webspace_base) {
    const base = manifest.webspace_base;
    for (const space of webspaces) {
      if (tidyPath(space.path) === tidyPath(base)) {
        issues.push({
          path: space.label,
          message: `'${space.path}' is webspace_base itself — a site's webspace must be a directory under it, not the base`,
        });
      } else if (pathsOverlap(space.path, base) && !isStrictlyWithin(space.path, base)) {
        issues.push({
          path: space.label,
          message: `'${space.path}' contains webspace_base ('${base}') — a site cannot own the tree every other site lives in`,
        });
      }
    }
  }

  // The engine's private directory holds that museum's .env, its backups and its media. The
  // service user must not be able to reach it — that separation is the entire reason this
  // daemon runs as its own uid — so it must lie outside every root and every webspace.
  const enginePrivate = manifest.engine.private_dir;
  for (const other of [...privateRoots, ...servedTrees]) {
    if (pathsOverlap(enginePrivate, other.path)) {
      issues.push({
        path: 'engine.private_dir',
        message: `'${enginePrivate}' overlaps ${other.label} ('${other.path}') — the engine's private directory must lie OUTSIDE every site-builder root, or the service user (and every agent turn it runs) can read the engine's credentials`,
      });
    }
  }

  // --- The selected driver must actually be installed here, by absolute path.
  if (!manifest.agent.bins[manifest.agent.driver]) {
    issues.push({
      path: `agent.bins.${manifest.agent.driver}`,
      message: `agent.driver is '${manifest.agent.driver}' but no binary is declared for it — a driver with no bin fails at the first turn, not at provisioning time`,
    });
  }

  // --- Field pairs that must agree, so the file cannot describe a host it did not produce.
  const auth = manifest.serving.preprod.auth;
  if (manifest.serving.preprod.enabled && auth.mode === 'htpasswd' && auth.users.length === 0 && !auth.htpasswd) {
    issues.push({
      path: 'serving.preprod.auth.users',
      message: `preprod is enabled with htpasswd auth but declares no users and no existing htpasswd file — the provisioner would generate an empty password file, which locks the museum out of its own drafts`,
    });
  }
  if (auth.mode === 'none' && auth.users.length > 0) {
    issues.push({
      path: 'serving.preprod.auth.users',
      message: `auth.mode is 'none' but users are declared — the file would describe an authentication the vhost does not perform. Remove the users, or set mode to 'htpasswd'.`,
    });
  }

  const tls = manifest.serving.prod.tls;
  if (tls.mode === 'files' && (!tls.certificate || !tls.key)) {
    issues.push({
      path: 'serving.prod.tls',
      message: "tls.mode is 'files', so both certificate and key paths are required",
    });
  }
  if (tls.mode !== 'files' && (tls.certificate || tls.key)) {
    issues.push({
      path: 'serving.prod.tls',
      message: `tls.mode is '${tls.mode}', so the declared certificate/key paths would be ignored — a file that names a certificate nobody serves is a file that will be trusted`,
    });
  }
  if (tls.mode === 'letsencrypt' && !tls.account_email) {
    issues.push({
      path: 'serving.prod.tls.account_email',
      message: "tls.mode is 'letsencrypt', which registers an ACME account — the address that receives the expiry warnings must be stated, not discovered when a certificate lapses",
    });
  }

  // --- A limit the museum states must be a limit the env can carry. The keys come from
  // layout's LIMIT_ENV, so this is a real check and not a restatement of the field list.
  for (const field of Object.keys(manifest.limits ?? {})) {
    if (!(field in LIMIT_ENV)) {
      issues.push({
        path: `limits.${field}`,
        message: `'${field}' is not a limit the rendered env knows how to carry — it would validate here and vanish before the daemon ever saw it`,
      });
    }
  }

  return issues;
}

/** Freezes the validated result, and everything under it. */
function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const inner of Object.values(value as Record<string, unknown>)) deepFreeze(inner);
  return Object.freeze(value);
}

export interface ParseManifestOptions {
  /** The file the document came from, quoted in the refusal — an operator provisioning eight museums needs to know WHICH declaration is wrong. */
  source?: string;
}

/**
 * Validate one instance.json and hand back a frozen manifest — or refuse with EVERY
 * problem at once.
 *
 * The return type is layout's `InstanceManifest`, which is the whole contract between
 * these two files: `derive(parseManifest(doc))` is the only composition either of them
 * supports, and the compiler enforces it here rather than a reader noticing.
 *
 * All at once, by src/config.ts's discipline: a misconfigured deploy is fixed in one pass,
 * not one restart per typo. Here that matters more than it does at boot, because the
 * operator holding this file is on a host with a museum's live site on it, and each round
 * trip is another provisioner run against a half-configured system.
 *
 * Three phases, in the order of what each can know:
 *   1. the credential walk, over the RAW document — it must report a pasted secret even in
 *      a document too broken to parse;
 *   2. the schema — every field error zod can see, reported together;
 *   3. the semantic checks — uniqueness, containment, agreeing pairs; they read parsed
 *      fields, so they are reachable only once the shape is valid.
 * Phase 3 is therefore skipped when phase 2 failed. That is not a shortcut around
 * "all at once": it is that a duplicate domain cannot be computed from a document that
 * does not yet have domains.
 */
export function parseManifest(raw: unknown, opts: ParseManifestOptions = {}): InstanceManifest {
  const issues: ManifestIssue[] = [];
  collectInlinedCredentials(raw, '', issues);

  const parsed = instanceManifestSchema.safeParse(raw);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      issues.push({ path: formatPath(issue.path), message: issueMessage(issue) });
    }
    throw new InstanceManifestError(issues, opts.source);
  }

  issues.push(...collectSemanticIssues(parsed.data));
  if (issues.length > 0) throw new InstanceManifestError(issues, opts.source);

  // Frozen for the same reason tests/fixtures/instance.ts freezes its roots: a declaration
  // that can be mutated in memory is no longer the declaration on disk, and every artifact
  // downstream is generated from it.
  return deepFreeze(parsed.data);
}

/** The instance-name grammar as a predicate, for callers that validate a name on its own (a CLI argument, a directory under /etc/dedalo_sites/instances). */
export function isValidInstanceName(value: string): boolean {
  return INSTANCE_PATTERN.test(value);
}
