/**
 * THE ENGINE PAIRING FRAGMENT — the gate.
 *
 * The artifact under test is the ONE file this subsystem produces that another system
 * reads: the lines a museum's engine needs in its `../private/.env` to reach this daemon.
 * It replaces two values `install.sh` PRINTED at the end of a run and asked an operator to
 * retype on a different host — so the properties worth asserting are not "the text looks
 * right" but the four the retyping never had:
 *
 *   1. THE ENGINE RECEIVES EXACTLY THREE ASSIGNMENTS AND NOTHING ELSE. Asserted by parsing
 *      the rendered bytes the way the ENGINE parses them (src/config/env.ts `parseEnvFile`:
 *      trim, skip `#`, split on the first `=`, strip one surrounding quote pair, no
 *      unescaping) and comparing the whole resulting map. A test that grepped for a
 *      substring would pass on a file that also assigned a fourth key by accident.
 *   2. NO SECRET VALUE, EVER. The token is NAMED and never valued; a declared credential's
 *      PATH may appear (in a comment, for a root who must `cat` it), its value may not —
 *      and there is no value in the declaration for it to leak, which is itself the point.
 *   3. NOTHING IS RESTATED. Every path and identity in the file moves when the declaration
 *      moves it: bend `paths.config_base`, `engine.private_dir`, `engine.group`,
 *      `secrets.SERVICE_TOKEN` or the instance name, and the rendered bytes follow. The
 *      historical defect is a literal that does not.
 *   4. A MANIFEST STRING CANNOT ESCAPE ITS DIRECTIVE. `derive()` is a second entry point —
 *      `provision adopt` builds a layout from what is on disk, with no declaration ever
 *      validated — so the renderer is required to refuse a quote, a newline or an expansion
 *      character ITSELF, and to render NOTHING when it does.
 *
 * Two guarantees named in the phase brief belong to sibling renderers and are asserted
 * there, not here: "the rendered text denies dotfiles" is a property of a VHOST (nginx.ts /
 * apache.ts), and "ReadWritePaths= covers every writable root" is a property of the UNIT
 * (unit.ts). This artifact serves no bytes and confines no process; asserting either here
 * would be a green test about a file that cannot hold the property.
 */

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_PATHS, MODES, derive, type InstanceLayout, type InstanceManifest } from '../src/provision/layout';
import { parseManifest } from '../src/provision/schema';
import { bodyHash, hasDrifted, parseStamp } from '../src/provision/hash';
import {
  ENGINE_FRAGMENT_KEYS,
  ENGINE_KEYS,
  SERVICE_TOKEN_KEY,
  TOKEN_PLACEHOLDER,
  engineFragmentRenderer,
} from '../src/provision/render/engine_fragment';

/* ────────────────────────────────────────────────────────────────────────────────────
 * Fixtures
 * ──────────────────────────────────────────────────────────────────────────────────── */

const EXAMPLE_PATH = join(import.meta.dir, '..', 'deploy', 'examples', 'instance.example.json');

function readExample(): Record<string, unknown> {
  return JSON.parse(readFileSync(EXAMPLE_PATH, 'utf8')) as Record<string, unknown>;
}

/** The committed reference declaration, parsed and derived — the happy path. */
function exampleManifest(patch: Record<string, unknown> = {}): InstanceManifest {
  return parseManifest({ ...readExample(), ...patch });
}

/** Render the fragment for a manifest, returning the single artifact it must produce. */
function renderFragment(manifest: InstanceManifest, layout = derive(manifest)) {
  const produced = engineFragmentRenderer.render(layout, manifest);
  expect(produced).toHaveLength(1);
  return produced[0]!;
}

/**
 * THE ENGINE'S OWN PARSER, restated here on purpose and only here.
 *
 * The engine lives in another package (`src/config/env.ts` in the engine tree) and this
 * one is zero-dep by law, so importing it would drag the engine's config singleton into a
 * site-builder test. What is copied is not a convention — it is the documented BEHAVIOUR
 * of the reader this file is written for, and the whole value of the assertion is that the
 * bytes are read the way its consumer reads them rather than the way its author meant them.
 */
function parseAsEngineWould(text: string): Record<string, string> {
  const parsed: Record<string, string> = {};
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator <= 0) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    parsed[key] = value;
  }
  return parsed;
}

/** A layout with one field bent — the shape `provision adopt` can produce. */
function bend(layout: InstanceLayout, patch: Partial<Record<keyof InstanceLayout, unknown>>): InstanceLayout {
  return { ...layout, ...patch } as InstanceLayout;
}

/* ────────────────────────────────────────────────────────────────────────────────────
 * Placement, ownership and the stamp
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe('the artifact itself', () => {
  test('is one file, at the derived path, with the engineFragment row of MODES', () => {
    const manifest = exampleManifest();
    const layout = derive(manifest);
    const fragment = renderFragment(manifest, layout);

    expect(fragment.kind).toBe('engine_fragment');
    expect(fragment.path).toBe(layout.engineFragment);
    expect(fragment.modeKey).toBe('engineFragment');
    // 0640 root:<engine group>. Not a number spelled here: the row of §3 resolved.
    expect(fragment.mode).toBe(MODES.engineFragment.mode);
    expect(fragment.owner).toBe('root');
    expect(fragment.group).toBe(layout.identity.engineGroup);
  });

  test('is stamped, and agrees with its own stamp', () => {
    const fragment = renderFragment(exampleManifest());
    const stamp = parseStamp(fragment.body);

    expect(stamp).not.toBeNull();
    expect(stamp!.kind).toBe('engine_fragment');
    expect(stamp!.instance).toBe('example');
    expect(stamp!.hash).toBe(bodyHash(stamp!.body));
    // The provisioner writes only on drift; a file that disagreed with its own stamp on
    // the way out would be reported as a hand edit on every single run.
    expect(hasDrifted(fragment.body)).toBe(false);
  });

  test('is pure: the same declaration renders the same bytes, forever', () => {
    const first = renderFragment(exampleManifest());
    const second = renderFragment(exampleManifest());
    expect(second.body).toBe(first.body);
  });

  test('is stable under a reordering of the declaration that changes nothing', () => {
    const document = readExample();
    const sites = document.sites as unknown[];
    const reversed = parseManifest({ ...document, sites: [...sites].reverse() });

    // The fragment names no site — but a renderer that walked one, or that hashed the
    // declaration, would report drift the moment an operator tidied instance.json, and a
    // write-only-on-drift provisioner would rewrite a live pairing over a formatting edit.
    expect(renderFragment(reversed).body).toBe(renderFragment(exampleManifest()).body);
  });

  test('is a comment file: every non-blank line is a comment or an assignment', () => {
    const body = parseStamp(renderFragment(exampleManifest()).body)!.body;
    for (const line of body.split('\n')) {
      if (line.trim().length === 0) continue;
      const isComment = line.startsWith('#');
      const isAssignment = /^[A-Z][A-Z0-9_]*="[^"]*"$/.test(line);
      expect(isComment || isAssignment).toBe(true);
    }
  });
});

/* ────────────────────────────────────────────────────────────────────────────────────
 * What the engine actually receives
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe('what the engine receives', () => {
  test('is EXACTLY the census: three keys, no fourth', () => {
    const manifest = exampleManifest();
    const layout = derive(manifest);
    const received = parseAsEngineWould(renderFragment(manifest, layout).body);

    expect(Object.keys(received).sort()).toEqual([...ENGINE_FRAGMENT_KEYS].sort());
    expect(received[ENGINE_KEYS.instance]).toBe(layout.instance);
    expect(received[ENGINE_KEYS.socket]).toBe(layout.socketPath);
    expect(received[ENGINE_KEYS.token]).toBe(TOKEN_PLACEHOLDER);
  });

  test('the census and the rendered bytes agree in BOTH directions', () => {
    const received = parseAsEngineWould(renderFragment(exampleManifest()).body);
    // A key in the census that nothing renders is a pairing line the engine never gets;
    // a key rendered that the census does not carry is one no reader of this module knows
    // about. Both are the same defect from opposite ends.
    for (const key of ENGINE_FRAGMENT_KEYS) expect(received).toHaveProperty(key);
    for (const key of Object.keys(received)) expect(ENGINE_FRAGMENT_KEYS).toContain(key);
  });

  test('names the per-instance socket, and no port', () => {
    const manifest = exampleManifest();
    const layout = derive(manifest);
    const received = parseAsEngineWould(renderFragment(manifest, layout).body);

    expect(received[ENGINE_KEYS.socket]).toBe(layout.socketPath);
    // The instance name is already in the path; the socket is reachable because of its
    // 0660 <user>:<engineGroup> ownership, not because the path is hard to guess.
    expect(received[ENGINE_KEYS.socket]).toContain(layout.instance);
    expect(MODES.socket.mode).toBe(0o660);
    expect(MODES.socket.group).toBe('engineGroup');
  });

  test('does NOT assign a URL — this instance publishes no TCP listener', () => {
    const received = parseAsEngineWould(renderFragment(exampleManifest()).body);
    expect(received[ENGINE_KEYS.url]).toBeUndefined();
    expect(ENGINE_FRAGMENT_KEYS).not.toContain(ENGINE_KEYS.url);
  });

  test('the engine can tell which daemon it is paired with', () => {
    const received = parseAsEngineWould(renderFragment(exampleManifest({ instance: 'other' })).body);
    expect(received[ENGINE_KEYS.instance]).toBe('other');
    expect(received[ENGINE_KEYS.socket]).toContain('/other/');
  });
});

/* ────────────────────────────────────────────────────────────────────────────────────
 * No secret, ever
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe('no secret value reaches this file', () => {
  test('the token is NAMED, and its value is the placeholder and nothing else', () => {
    const received = parseAsEngineWould(renderFragment(exampleManifest()).body);
    expect(received[ENGINE_KEYS.token]).toBe(TOKEN_PLACEHOLDER);
    // Not empty: an empty bearer is a pairing that fails as "unauthorized" with nothing to
    // grep for, while the sentinel appears verbatim in the engine's .env and names itself.
    expect(TOKEN_PLACEHOLDER.length).toBeGreaterThan(0);
  });

  test('every assigned value is either derived from the layout or the placeholder', () => {
    const manifest = exampleManifest();
    const layout = derive(manifest);
    const received = parseAsEngineWould(renderFragment(manifest, layout).body);

    // The strongest form of "no secret leaked": the SET of values is closed, so a future
    // edit cannot introduce a fourth value at all, credential-shaped or otherwise.
    const permitted = new Set([layout.instance, layout.socketPath, TOKEN_PLACEHOLDER]);
    for (const value of Object.values(received)) expect(permitted.has(value)).toBe(true);
  });

  test('a credential PATH may appear (a root must cat it); a credential VALUE may not', () => {
    const document = readExample();
    const tokenFile = '/etc/dedalo_sites/instances/example/secrets/SERVICE_TOKEN';
    const manifest = parseManifest({
      ...document,
      secrets: {
        ...(document.secrets as Record<string, string>),
        [SERVICE_TOKEN_KEY]: tokenFile,
      },
    });
    const body = renderFragment(manifest).body;

    // The DECLARED file wins over the canonical one — the declaration is the LoadCredential
    // source, and a fragment that pointed root at a different file would be a second owner
    // of the path.
    expect(body).toContain(tokenFile);
    // …and it appears only inside a comment. Nothing assigns it.
    const received = parseAsEngineWould(body);
    for (const value of Object.values(received)) expect(value).not.toBe(tokenFile);
  });

  test('falls back to the provisioner-owned credential path when none is declared', () => {
    const manifest = exampleManifest();
    const layout = derive(manifest);
    // The example declares no SERVICE_TOKEN, so the fragment must still tell root where to
    // look: silence here is an operator who cannot finish the pairing.
    expect(renderFragment(manifest, layout).body).toContain(layout.secretPath(SERVICE_TOKEN_KEY));
  });
});

/* ────────────────────────────────────────────────────────────────────────────────────
 * Derive, never restate
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe('every path in the file follows the declaration', () => {
  test('a moved config base moves the artifact and every path it names', () => {
    const manifest = exampleManifest({ paths: { config_base: '/opt/sites/instances' } });
    const layout = derive(manifest);
    const fragment = renderFragment(manifest, layout);

    expect(fragment.path.startsWith('/opt/sites/instances/')).toBe(true);
    expect(fragment.body).toContain(layout.manifestPath);
    expect(fragment.body).toContain(layout.secretPath(SERVICE_TOKEN_KEY));
    // The historical defect, asserted directly: not one byte of the DEFAULT placement
    // survives an override.
    expect(fragment.body).not.toContain(DEFAULT_PATHS.configBase);
  });

  test('the append target is the PAIRED ENGINE\'s private .env, wherever it was declared', () => {
    const manifest = exampleManifest({
      engine: {
        private_dir: '/srv/other/private',
        group: 'dedalo-other',
        checkout_dir: '/srv/other/master_dedalo',
        bun_bin: '/srv/other/.bun/bin/bun',
      },
    });
    const fragment = renderFragment(manifest);

    expect(fragment.body).toContain('/srv/other/private/.env');
    expect(fragment.group).toBe('dedalo-other');
    expect(fragment.body).toContain('dedalo-other');
  });

  test('the socket path is the layout\'s, never a spelling of its own', () => {
    const manifest = exampleManifest({ instance: 'museum-b' });
    const layout = derive(manifest);
    expect(renderFragment(manifest, layout).body).toContain(layout.socketPath);
  });
});

/* ────────────────────────────────────────────────────────────────────────────────────
 * R6 — a manifest string cannot escape its directive
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe('injection: nothing a string carries can become a directive', () => {
  const manifest = exampleManifest();
  const layout = derive(manifest);

  /** Assert the renderer REFUSES, and that it rendered nothing on the way out. */
  function refuses(patch: Partial<Record<keyof InstanceLayout, unknown>>, because: RegExp): void {
    expect(() => engineFragmentRenderer.render(bend(layout, patch), manifest)).toThrow(because);
  }

  test('a quote in the socket path cannot close the assignment', () => {
    refuses(
      { socketPath: '/run/x.sock"' },
      /socket path contains the character '"'/,
    );
  });

  test('a newline in the socket path cannot open a second directive', () => {
    refuses(
      { socketPath: `/run/x.sock\n${ENGINE_KEYS.token}=stolen` },
      /socket path contains a newline/,
    );
  });

  test('a shell expansion in a path is refused rather than escaped', () => {
    // Inert to the engine's own parser, live to a shell that sources the same file and to
    // systemd's EnvironmentFile= — and there is no escape that round-trips through all
    // three, which is why the value is refused and not quoted harder.
    refuses({ socketPath: '/run/$(id -u)/daemon.sock' }, /socket path contains the character '\$'/);
    refuses({ socketPath: '/run/`id`/daemon.sock' }, /socket path contains the character '`'/);
    refuses({ socketPath: '/run/a\\b/daemon.sock' }, /socket path contains the character '\\'/);
  });

  test('a newline in the DESCRIPTION cannot escape the comment it is written into', () => {
    refuses(
      { description: `ok\n${ENGINE_KEYS.token}=stolen` },
      /description contains a newline/,
    );
  });

  test('a carriage return is refused too — it is a line break to half the readers', () => {
    refuses({ description: 'ok\rmore' }, /description contains a carriage return/);
  });

  test('a hostile instance name is refused before it can be written anywhere', () => {
    // A quote survives the header (a comment ends at the line break, not at a quote) and is
    // stopped where it would have mattered: the assignment.
    refuses({ instance: 'x"1' }, /instance name contains the character '"'/);
    // A newline never even reaches the assignment — the header names the instance first,
    // and a control character there would already have escaped the comment.
    refuses({ instance: `x\n${ENGINE_KEYS.token}=stolen` }, /contains a newline/);
  });

  test('an empty or padded value is refused: no two env parsers trim alike', () => {
    refuses({ socketPath: '' }, /socket path is empty or padded/);
    refuses({ socketPath: '  /run/x.sock  ' }, /socket path is empty or padded/);
  });

  test('a refusal renders NOTHING — there is no partial artifact', () => {
    let produced: unknown = 'not assigned';
    try {
      produced = engineFragmentRenderer.render(bend(layout, { socketPath: '/run/a"b' }), manifest);
    } catch {
      /* expected */
    }
    expect(produced).toBe('not assigned');
  });
});

/* ────────────────────────────────────────────────────────────────────────────────────
 * The TCP listener that does not exist — tripwired, not assumed
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe('a TCP listener the grammar cannot yet declare', () => {
  test('no validated declaration can carry one today', () => {
    // `instanceManifestSchema` is a STRICT object, so this is the mechanical statement of
    // "the socket is the transport": there is no field to put a port in.
    expect(() => parseManifest({ ...readExample(), listener: { tcp: { port: 3200 } } })).toThrow();
  });

  test('but an ADOPTED manifest carrying one is REFUSED, loudly, naming this renderer', () => {
    // `derive()` is a second entry point: `provision adopt` builds a manifest from a host's
    // disk without any declaration ever being validated. A fragment rendered for a
    // declaration this module does not understand would confidently name a socket the
    // engine is not going to use — a museum whose engine cannot reach its own daemon, with
    // every generated file looking correct. So it refuses instead of guessing.
    for (const hint of ['listener', 'listen', 'tcp', 'bind', 'port']) {
      const adopted = { ...exampleManifest(), [hint]: { url: 'http://127.0.0.1:3200' } } as InstanceManifest;
      expect(() => engineFragmentRenderer.render(derive(exampleManifest()), adopted)).toThrow(
        new RegExp(`declares '${hint}'`),
      );
      // The refusal has to say what to do about it, or the next reader adds the URL line
      // somewhere else.
      expect(() => engineFragmentRenderer.render(derive(exampleManifest()), adopted)).toThrow(
        new RegExp(ENGINE_KEYS.url),
      );
    }
  });

  test('the ordinary declaration is not caught by that net', () => {
    expect(() => renderFragment(exampleManifest())).not.toThrow();
  });
});
