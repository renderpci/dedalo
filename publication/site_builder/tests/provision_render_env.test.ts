/**
 * THE ENV RENDERER'S GATE — what the generated environment file GUARANTEES, never how it
 * happens to be spelled today.
 *
 * The artifact this replaces was `sample.env` plus a `sed` in install.sh: a service-owned
 * `.env` inside the checkout, holding the SERVICE_TOKEN and every provider key in
 * plaintext, edited by hand on every host and identical to nothing. The guarantees below
 * are the ones that make the replacement worth having, and each is asserted as a PROPERTY
 * of the rendered text rather than as a string match on it — a test that compared the file
 * to a golden copy would go green on a renderer that quoted nothing and refused nothing,
 * as long as the copy was regenerated.
 *
 * The four that carry the design:
 *
 *   - NO SECRET, IN ANY FORM. Not as a value, not as a key that could hold one. Asserted
 *     from both ends: the rendered file's own keys, and a renderer that REFUSES when a
 *     credential-shaped key reaches it at all.
 *   - A MANIFEST STRING CANNOT ESCAPE ITS DIRECTIVE. Driven through `derive()`, not through
 *     a hand-built layout, because `derive()` is the entry point that validates least — a
 *     `provision adopt` builds a manifest from what is on a host with no declaration ever
 *     checked, and an absolute path is checked for being absolute and nothing else.
 *   - THE FILE IS layout.envVars AND NOTHING ELSE, so the roots the daemon is told about
 *     and the roots the unit makes writable are one derivation read twice.
 *   - THE BYTES ARE STABLE. Same declaration, same file, forever — including when an
 *     operator reorders the keys inside instance.json. The provisioner writes only on
 *     drift, so instability here means rewriting a museum's live configuration on every
 *     run and burying the real change in the noise.
 *
 * And one gate that is not about the bytes at all: the CENSUS against `src/config.ts`,
 * which states in one place — mechanically, with reasons — every key the daemon reads that
 * this file deliberately does not supply. A gap that is written down and ratcheted is a
 * design decision; the same gap left implicit is the museum's daemon failing to boot with
 * nobody able to say whether that was intended.
 */

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  LIMIT_ENV,
  MODES,
  SECRET_KEY_PATTERN,
  derive,
  isWritablePath,
  readWritePaths,
  type InstanceLayout,
  type InstanceManifest,
} from '../src/provision/layout';
import { hasDrifted, parseStamp } from '../src/provision/hash';
import { envRenderer } from '../src/provision/render/env';

/* ────────────────────────────────────────────────────────────────────────────────────
 * Fixtures
 * ──────────────────────────────────────────────────────────────────────────────────── */

/**
 * A valid declaration, built here rather than read from the example file: every refusal
 * test below bends exactly one field of it, and a test input with opinions of its own
 * would make "which change caused the refusal" a question.
 *
 * Typed as the structural manifest and fed straight to `derive()`, WITHOUT the zod schema.
 * That is the adversarial entry point on purpose — `provision adopt` reaches `derive()`
 * with a manifest assembled from a host's existing layout, never validated by the grammar
 * — so a renderer that relied on the schema having refused something would be tested here
 * exactly where the schema is not standing.
 */
function baseManifest(overrides: Partial<InstanceManifest> = {}): InstanceManifest {
  return {
    instance: 'gate',
    description: 'Gate instance',
    engine: { private_dir: '/srv/dedalo/gate/private', group: 'dedalo-gate' },
    web: { server: 'nginx', group: 'www-data' },
    publication_api: {
      url: 'http://127.0.0.1:3100/publication/server_api/v2',
      key_path: '/etc/dedalo_sites/instances/gate/secrets/PUBLICATION_API_KEY',
    },
    agent: { driver: 'claude_code', bins: { claude_code: '/usr/local/bin/claude' } },
    serving: {
      preprod: { enabled: true, auth: { mode: 'htpasswd' } },
      prod: { tls: { mode: 'none' } },
    },
    sites: [{ slug: 'one', domain: 'one.example.org' }],
    secrets: { ANTHROPIC_API_KEY: '/etc/dedalo_sites/instances/gate/secrets/ANTHROPIC_API_KEY' },
    limits: { max_sites: 8, releases_retained: 10 },
    ...overrides,
  };
}

function renderEnv(manifest: InstanceManifest = baseManifest()): string {
  const layout = derive(manifest);
  const artifacts = envRenderer.render(layout, manifest);
  expect(artifacts).toHaveLength(1);
  return artifacts[0]!.body;
}

/** The layout, with one field bent — for the cases `derive()` itself cannot produce. */
function bentLayout(patch: Partial<InstanceLayout>): InstanceLayout {
  return { ...derive(baseManifest()), ...patch } as InstanceLayout;
}

/* ────────────────────────────────────────────────────────────────────────────────────
 * A STRICT reader for the rendered file
 *
 * It is strict on purpose: it is half the escaping assertion. Anything that is not a
 * comment, a blank line or a `KEY="…"` assignment whose only escapes are `\\` and `\"` is
 * a parse failure here — so a value that closed its quote early does not quietly re-parse
 * as a shorter value, it reddens.
 * ──────────────────────────────────────────────────────────────────────────────────── */

const ASSIGNMENT = /^([A-Z][A-Z0-9_]*)="((?:[^"\\]|\\.)*)"$/;

function parseRendered(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  // The stamp is line one and belongs to hash.ts; everything below it is this renderer's.
  const [, ...lines] = text.split('\n');
  for (const line of lines) {
    if (line === '' || line.startsWith('#')) continue;
    const match = ASSIGNMENT.exec(line);
    if (!match) throw new Error(`not a comment and not an assignment: ${JSON.stringify(line)}`);
    const [, key, raw] = match;
    if (key! in out) throw new Error(`assigned twice: ${key}`);
    out[key!] = raw!.replace(/\\(.)/g, (_all, char: string) => {
      // Only two escapes exist by construction; a third would mean the renderer emitted an
      // escape sequence whose meaning depends on which parser reads the file.
      if (char !== '\\' && char !== '"') throw new Error(`unknown escape \\${char} in ${key}`);
      return char;
    });
  }
  return out;
}

/* ────────────────────────────────────────────────────────────────────────────────────
 * The artifact itself
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe('the env artifact', () => {
  test('is one file, at the derived path, with the envFile row of the matrix', () => {
    const layout = derive(baseManifest());
    const artifacts = envRenderer.render(layout, baseManifest());

    expect(artifacts).toHaveLength(1);
    const [file] = artifacts;
    expect(file!.kind).toBe('env');
    expect(file!.path).toBe(layout.envFile);
    // The row, not the number: the renderer names WHICH artifact it is and layout decides
    // what that implies. Both are asserted so a matrix change cannot silently reopen a
    // root-owned file to the world.
    expect(file!.modeKey).toBe('envFile');
    expect(file!.mode).toBe(MODES.envFile.mode);
    expect(file!.owner).toBe('root');
    expect(file!.group).toBe(layout.identity.group);
  });

  test('carries a stamp that reads back and agrees with its own body', () => {
    const body = renderEnv();
    const parsed = parseStamp(body);

    expect(parsed).not.toBeNull();
    expect(parsed!.instance).toBe('gate');
    expect(parsed!.kind).toBe('env');
    // False = "this file has not been edited since it was written". A renderer whose body
    // disagreed with its own stamp would be reported as a hand edit on every single run.
    expect(hasDrifted(body)).toBe(false);
  });

  test('says it is generated, and that a hand edit is drift', () => {
    const body = renderEnv();
    const header = body.split('\n\n')[0]!;

    expect(header).toMatch(/GENERATED/);
    expect(header).toMatch(/do not edit/i);
    expect(header).toMatch(/DRIFT/i);
    // The reader is pointed at the declaration to change instead, by absolute path.
    expect(header).toContain(derive(baseManifest()).manifestPath);
    for (const line of header.split('\n').slice(1)) {
      expect(line.startsWith('#')).toBe(true);
    }
  });
});

/* ────────────────────────────────────────────────────────────────────────────────────
 * The census: layout.envVars, verbatim, and nothing else
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe('the file is layout.envVars and nothing else', () => {
  test('every derived key is assigned, with exactly its derived value', () => {
    const layout = derive(baseManifest());
    const parsed = parseRendered(renderEnv());

    expect(parsed).toEqual({ ...layout.envVars });
  });

  test('nothing but comments, blank lines and assignments', () => {
    // parseRendered throws on anything else; this is the assertion that it does not.
    expect(() => parseRendered(renderEnv())).not.toThrow();
  });

  test('every key is a usable environment variable name', () => {
    for (const key of Object.keys(parseRendered(renderEnv()))) {
      expect(SECRET_KEY_PATTERN.test(key)).toBe(true);
    }
  });

  test('the three state roots are the values the unit will make writable', () => {
    // The env and the unit's ReadWritePaths= come out of ONE derivation. A root the daemon
    // is told to write and the unit does not confine is not an install failure — it is
    // EROFS the first time a museum publishes, which is the defect this subsystem exists
    // to end. Asserted with the roots off their defaults, because the historical bug was
    // precisely that the literal list did not follow an override.
    const manifest = baseManifest({
      roots: { workspaces: '/mnt/big/work', home: '/mnt/big/home', audit: '/srv/audit/gate' },
    });
    const layout = derive(manifest);
    const parsed = parseRendered(renderEnv(manifest));

    expect(parsed.SITES_ROOT).toBe('/mnt/big/work');
    expect(parsed.AGENT_HOME).toBe('/mnt/big/home');
    expect(parsed.AUDIT_DIR).toBe('/srv/audit/gate');
    for (const root of [parsed.SITES_ROOT!, parsed.AGENT_HOME!, parsed.AUDIT_DIR!]) {
      expect(isWritablePath(layout, root)).toBe(true);
      expect(readWritePaths(layout)).toContain(root);
    }
  });

  test('the per-instance identity, serving mode, API url and pinned driver binary are there', () => {
    const parsed = parseRendered(renderEnv());

    expect(parsed.DEDALO_SITE_INSTANCE).toBe('gate');
    expect(parsed.DEPLOYMENT_MODE).toBe('nginx');
    expect(parsed.WEBSPACE_BASE).toBe('/home/www');
    expect(parsed.PUBLICATION_API_URL).toBe('http://127.0.0.1:3100/publication/server_api/v2');
    expect(parsed.AGENT_DRIVER).toBe('claude_code');
    // ABSOLUTE, always: a bare `claude` on PATH is whichever binary the host's PATH happens
    // to resolve for a service user, which is not a decision a museum made.
    expect(parsed.CLAUDE_CODE_BIN).toBe('/usr/local/bin/claude');
  });

  test('ONLY the limits the museum stated — src/config.ts keeps owning its defaults', () => {
    const stated = parseRendered(renderEnv());
    expect(stated.MAX_SITES).toBe('8');
    expect(stated.RELEASES_RETAINED).toBe('10');
    expect(stated.BUILD_TIMEOUT_MS).toBeUndefined();
    expect(stated.SESSION_TURN_TIMEOUT_MS).toBeUndefined();

    // With no limits declared at all, not one of the keys appears: an absent limit must
    // keep meaning "the daemon's own default", or the day that default changes, nothing on
    // any provisioned host moves.
    const bare = parseRendered(renderEnv(baseManifest({ limits: undefined })));
    for (const key of Object.values(LIMIT_ENV)) {
      expect(bare[key]).toBeUndefined();
    }
  });
});

/* ────────────────────────────────────────────────────────────────────────────────────
 * No secret, ever
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe('no secret reaches this file', () => {
  test('a declared credential is named and located, never assigned', () => {
    const layout = derive(baseManifest());
    const body = renderEnv();
    const parsed = parseRendered(body);

    // The key is not an environment value…
    expect(parsed.ANTHROPIC_API_KEY).toBeUndefined();
    // …and the file says where it does come from, so nobody "repairs" the omission by
    // pasting a value in.
    expect(body).toContain('$CREDENTIALS_DIRECTORY');
    expect(body).toContain('LoadCredential');
    expect(body).toContain(layout.secrets.ANTHROPIC_API_KEY!);
    // Named only inside a comment.
    for (const line of body.split('\n')) {
      if (line.includes('ANTHROPIC_API_KEY')) expect(line.startsWith('#')).toBe(true);
    }
  });

  test('an instance with no declared credential still says where one would come from', () => {
    const body = renderEnv(baseManifest({ secrets: {} }));
    expect(body).toContain('$CREDENTIALS_DIRECTORY');
    expect(body).toMatch(/No provider credential is declared/);
  });

  test('the API key is carried as the PATH of its file, never as a key', () => {
    const parsed = parseRendered(renderEnv());
    expect(parsed.PUBLICATION_API_KEY_FILE).toBe(
      '/etc/dedalo_sites/instances/gate/secrets/PUBLICATION_API_KEY',
    );
    expect(parsed.PUBLICATION_API_KEY).toBeUndefined();
  });

  test('no key in the file could be holding a credential', () => {
    for (const key of Object.keys(parseRendered(renderEnv()))) {
      expect(key).not.toMatch(/(TOKEN|SECRET|PASSWORD|PASSPHRASE|CREDENTIAL|_KEY)$/);
    }
  });

  test('a credential-shaped key reaching the renderer is REFUSED, not escaped', () => {
    // The law cannot be typed, so it is enforced where the bytes are made. This is the
    // shape of the accident it catches: a future `buildEnvVars` (or an adopted host's
    // layout) carrying the token as a value, into a group-readable file that is copied
    // wholesale into every agent child's environment.
    for (const key of ['SERVICE_TOKEN', 'OPENAI_API_KEY', 'DB_PASSWORD']) {
      const layout = bentLayout({ envVars: Object.freeze({ [key]: 'shhh' }) });
      expect(() => envRenderer.render(layout, baseManifest())).toThrow(/may never carry one/);
    }
  });

  test('one name cannot be both an environment value and a credential', () => {
    // Otherwise the process gets a value here AND a credential file, and which one it read
    // would decide whether the credential was ever used.
    const layout = bentLayout({
      envVars: Object.freeze({ AGENT_HOME: '/var/lib/x', PUBLICATION_API_URL: 'https://a.example.org' }),
      secrets: Object.freeze({ AGENT_HOME: '/etc/dedalo_sites/instances/gate/secrets/AGENT_HOME' }),
    });
    expect(() => envRenderer.render(layout, baseManifest())).toThrow(/cannot be both/);
  });
});

/* ────────────────────────────────────────────────────────────────────────────────────
 * A manifest string cannot escape its directive
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe('injection through a manifest string', () => {
  test('a newline in a derived path is REFUSED and nothing is rendered', () => {
    // `derive()` checks a root for being ABSOLUTE and nothing else, and the schema is not
    // standing on the adopt path — so this reaches the renderer intact. Rendered
    // unchecked, the second line would be an assignment of the attacker's choosing.
    const manifest = baseManifest({
      webspace_base: '/srv/www\nDEDALO_SITE_INSTANCE=other',
    });
    expect(() => renderEnv(manifest)).toThrow(/control character/);
  });

  test('a carriage return is refused too', () => {
    expect(() => renderEnv(baseManifest({ webspace_base: '/srv/www\rx' }))).toThrow(
      /control character/,
    );
  });

  test('a quote is escaped, and round-trips as its own value', () => {
    const manifest = baseManifest({ webspace_base: '/srv/"www"' });
    const body = renderEnv(manifest);
    const parsed = parseRendered(body);

    // The quote did not close the assignment early: the value comes back whole, and the
    // file still holds exactly the keys it should.
    expect(parsed.WEBSPACE_BASE).toBe('/srv/"www"');
    expect(Object.keys(parsed).sort()).toEqual(Object.keys(derive(manifest).envVars).sort());
  });

  test('a backslash is escaped, and round-trips as its own value', () => {
    const parsed = parseRendered(renderEnv(baseManifest({ webspace_base: '/srv/w\\w' })));
    expect(parsed.WEBSPACE_BASE).toBe('/srv/w\\w');
  });

  test("a value that would be expanded by SOMEBODY's parser is refused", () => {
    // `$` and a backtick are refused rather than escaped because the three readers of this
    // file — systemd, a dotenv loader, and the `set -a; . env` an operator reaches for when
    // a daemon will not start — do not agree about what an escaped one means. The last of
    // the three runs the backtick as root.
    for (const hostile of ['/srv/$HOME/www', '/srv/`id`/www', '/srv/${IFS}www']) {
      expect(() => renderEnv(baseManifest({ webspace_base: hostile }))).toThrow(/backtick/);
    }
  });

  test('a newline in the description cannot open a directive in the header', () => {
    const layout = bentLayout({ description: 'fine\nSERVICE_TOKEN=pwned' });
    expect(() => envRenderer.render(layout, baseManifest())).toThrow();
  });

  test("a newline in a credential's path cannot open one either", () => {
    const layout = bentLayout({
      secrets: Object.freeze({ ANTHROPIC_API_KEY: '/etc/x\nSERVICE_TOKEN=pwned' }),
    });
    expect(() => envRenderer.render(layout, baseManifest())).toThrow(/control character/);
  });
});

/* ────────────────────────────────────────────────────────────────────────────────────
 * Stable bytes
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe('the same declaration renders the same bytes', () => {
  test('rendering twice is byte-identical', () => {
    expect(renderEnv()).toBe(renderEnv());
  });

  test('reordering the keys INSIDE instance.json changes nothing', () => {
    // The one that actually bites: `envVars` picks up the driver binaries by walking
    // `agent.bins` in declaration order, so an operator who swapped two lines would
    // otherwise produce a different file — and a provisioner that writes only on drift
    // would rewrite a museum's live env and report a change nobody made.
    const first = renderEnv(
      baseManifest({
        agent: {
          driver: 'claude_code',
          bins: { claude_code: '/usr/local/bin/claude', opencode: '/usr/local/bin/opencode' },
        },
        limits: { max_sites: 8, releases_retained: 10 },
      }),
    );
    const second = renderEnv(
      baseManifest({
        agent: {
          driver: 'claude_code',
          bins: { opencode: '/usr/local/bin/opencode', claude_code: '/usr/local/bin/claude' },
        },
        limits: { releases_retained: 10, max_sites: 8 },
      }),
    );
    expect(second).toBe(first);
  });

  test('reordering the sites changes nothing', () => {
    const sites = [
      { slug: 'one', domain: 'one.example.org' },
      { slug: 'two', domain: 'two.example.org' },
    ];
    expect(renderEnv(baseManifest({ sites: [...sites].reverse() }))).toBe(
      renderEnv(baseManifest({ sites })),
    );
  });
});

/* ────────────────────────────────────────────────────────────────────────────────────
 * THE CENSUS AGAINST THE DAEMON'S OWN CONFIGURATION
 *
 * `src/config.ts` is the complete list of what this daemon can be tuned with. This file is
 * what a provisioned host actually supplies. The two are written by different hands, and
 * the difference between them is a design decision that must be STATED rather than
 * discovered when a museum's daemon exits 1 at boot.
 *
 * Read as TEXT, never imported: importing the config module parses the ambient environment
 * and can `process.exit(1)`, which would make this gate's verdict depend on the machine it
 * runs on.
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe('the census against src/config.ts', () => {
  const CONFIG_TEXT = readFileSync(join(import.meta.dir, '..', 'src', 'config.ts'), 'utf8');

  /** Every key of the zod schema, and whether it carries a default. */
  function configKeys(): Map<string, { hasDefault: boolean }> {
    const start = CONFIG_TEXT.indexOf('z.object({');
    const end = CONFIG_TEXT.indexOf('\n});', start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);

    const keys = new Map<string, { hasDefault: boolean }>();
    let current: string | null = null;
    for (const line of CONFIG_TEXT.slice(start, end).split('\n')) {
      const declaration = /^ {2}([A-Z][A-Z0-9_]*):/.exec(line);
      if (declaration) current = declaration[1]!;
      if (!current) continue;
      const entry = keys.get(current) ?? { hasDefault: false };
      if (line.includes('.default(')) entry.hasDefault = true;
      keys.set(current, entry);
    }
    return keys;
  }

  test('the schema is still readable as a key list', () => {
    const keys = configKeys();
    expect(keys.size).toBeGreaterThan(20);
    expect(keys.has('SERVICE_TOKEN')).toBe(true);
    expect(keys.get('SERVICE_TOKEN')!.hasDefault).toBe(false);
    expect(keys.get('MAX_SITES')!.hasDefault).toBe(true);
  });

  test('every key this file supplies is a key the daemon reads', () => {
    const supplied = Object.keys(parseRendered(renderEnv()));
    const known = configKeys();
    const unread = supplied.filter(key => !known.has(key)).sort();

    // EMPTY, and it has to stay empty. It held five keys while the daemon still parsed the
    // ambient environment and knew nothing of the instance model: the roots named
    // individually (AGENT_HOME, AUDIT_DIR, WEBSPACE_BASE), the identity the whole design
    // turns on (DEDALO_SITE_INSTANCE), and PUBLICATION_API_KEY_FILE — a PATH the daemon was
    // handed and could not use. All five are read now.
    //
    // A key appearing here again is the shape of a renderer inventing a knob nothing reads,
    // which is a museum's declaration taking effect nowhere while every file on disk looks
    // correct. That is why this is measured rather than trusted.
    expect(unread).toEqual([]);
  });

  test('the only required key this file does NOT supply is the credential, by law', () => {
    const supplied = new Set(Object.keys(parseRendered(renderEnv())));
    const missing = [...configKeys()]
      .filter(([key, meta]) => !meta.hasDefault && !supplied.has(key))
      .map(([key]) => key)
      .sort();

    // A gap that is written down and ratcheted is a decision; the same gap left implicit is
    // a daemon that exits 1 at boot with nobody able to say whether that was meant.
    //
    //   SERVICE_TOKEN — BY LAW, and this is the one entry that must never leave the list.
    //                   It is a credential: it arrives via systemd LoadCredential from the
    //                   root-owned 0600 file the provisioner mints, and the daemon reads it
    //                   at $CREDENTIALS_DIRECTORY/SERVICE_TOKEN (src/config.ts). Putting it
    //                   in THIS file would hand this daemon's authorization to every agent
    //                   turn it runs, because the whole of this file reaches every agent
    //                   child. The unit's LoadCredential= line is rendered from
    //                   credentialSources(layout), which carries the bearer whether or not
    //                   the declaration names it — see tests/provision_render_unit.test.ts.
    //
    // PREPROD_BASE_URL and PROD_BASE_URL used to be here as "single-tenant leftovers". They
    // are gone from this list because the SCHEMA moved, not this file: in the instance model
    // a URL is a property of a SITE (site.domain, site.preprodDomain — one vhost per site
    // per surface), so an instance-wide pair could only ever have been one site's, chosen
    // arbitrarily. The daemon now treats them as optional, and the renderer still refuses to
    // invent them.
    //
    // Shrink-only: a NEW required key appearing in config.ts unsupplied reddens here.
    expect(missing).toEqual(['SERVICE_TOKEN']);
  });
});
