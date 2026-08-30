/**
 * THE EXAMPLES ARE THE DOCUMENTATION, AND THIS IS WHAT KEEPS THEM TRUE.
 *
 * Phase 2 deleted the six hand-written artifacts this subsystem used to ship — `install.sh`,
 * `deploy/dedalo-site-builder.service`, `nginx/dedalo_sites_prod.conf`,
 * `nginx/dedalo_sites_preprod.conf`, `apache/dedalo_sites.conf` and `sample.env`. Their TEXT
 * survives as five pure renderers; what did NOT survive is the thing that made them
 * dangerous, which was never the text. It was that each of them stated a deployment fact
 * independently, so the installer could hardcode a service user, the unit could hardcode the
 * same user AGAIN, and the unit's `ReadWritePaths=` could name two roots that did not follow
 * the installer's own overrides — a clean install, and a read-only filesystem at publish
 * time, on a museum's site, with every file on disk looking correct.
 *
 * Deleting them cost something real, though, and this file is the repayment. A hand-written
 * config is READABLE: an operator opened `nginx/dedalo_sites_prod.conf` and saw, in one
 * screen, exactly what would land on the host. A pure function is not readable in that way —
 * you cannot diff a function against the box in front of you. So the rendered output of the
 * one committed declaration is COMMITTED TOO, byte for byte, and this gate is what stops it
 * from becoming the seventh hand-written artifact:
 *
 *   - EVERY COMMITTED EXAMPLE IS BYTE-EQUAL TO ITS FRESHLY RENDERED FORM. A hand edit to an
 *     example cannot land. That is the whole point: an example an operator can edit is a
 *     document that will eventually describe a system nobody built, which is the state this
 *     subsystem was in before Phase 2 and the state the deletion was for.
 *   - THE SET IS CLOSED IN BOTH DIRECTIONS. An artifact with no committed example is an
 *     undocumented file landing on a museum's host; a committed example no renderer claims
 *     is a file describing an artifact that no longer exists — the `sample.env` failure mode
 *     wearing a generated file's clothes.
 *   - THE DELETED FILES STAY DELETED. `engineering/SITE_BUILDER_INSTANCES.md` §9 listed this
 *     as an assertion still to be written; it is written here, because this file is the
 *     retirement's gate. A resurrected `install.sh` is not a merge accident to discover on a
 *     host — it is a second owner of the identity, and the whole defect is back.
 *
 * REGENERATING. The committed examples are not edited, they are re-rendered:
 *
 *     UPDATE_EXAMPLES=1 bun test ./tests/provision_examples.test.ts
 *
 * That run WRITES the files and then FAILS ON PURPOSE (see `updateMode`), so a stray
 * environment variable can never turn this gate green by rewriting the thing it checks. Run
 * it, read the diff `git diff` shows you, and re-run without the variable.
 *
 * TWO TREES, ONE DECLARATION. `rendered/` is `renderAll(derive(parseManifest(…)))` on the
 * committed declaration exactly as it stands. `rendered-apache/` is the same declaration with
 * `web.server` flipped to `apache` — the single field an httpd host changes — because
 * deleting `apache/dedalo_sites.conf` with nothing in its place would leave every Apache
 * operator with no example at all, and the Apache renderer's bytes undocumented. There is
 * still exactly ONE declaration in the tree: the variant is computed here, never committed,
 * so the two can no more disagree than the unit and the vhosts can.
 *
 * Nothing here touches the filesystem except to READ the committed tree (and, in update
 * mode, to write it). The renderers are pure; this gate is a comparison.
 */

import { describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';

import { derive, type InstanceLayout, type InstanceManifest } from '../src/provision/layout';
import { parseManifest } from '../src/provision/schema';
import { SCRATCH_DIR_NAME } from './fixtures/instance';
import { renderAll, type Artifact } from '../src/provision/render';
import { STAMP_TOKEN, parseStamp } from '../src/provision/hash';
import { TOKEN_PLACEHOLDER } from '../src/provision/render/engine_fragment';
import { SITE_TABLE_COMMENT_PREFIX } from '../src/provision/render/sites';

const PACKAGE_DIR = join(import.meta.dir, '..');
const EXAMPLES_DIR = join(PACKAGE_DIR, 'deploy', 'examples');
const DECLARATION_PATH = join(EXAMPLES_DIR, 'instance.example.json');
const INDEX_PATH = join(EXAMPLES_DIR, 'rendered.index');
const SPEC_PATH = join(PACKAGE_DIR, '..', '..', 'engineering', 'SITE_BUILDER_INSTANCES.md');

/**
 * UPDATE MODE, and why it is not a way to make this gate pass.
 *
 * A golden-file gate needs a regeneration path or the first legitimate renderer change is
 * repaired by hand — which is the very edit this file exists to refuse. The usual shape of
 * that escape hatch is also its usual failure: an environment variable left set in a shell,
 * a CI job that inherited it, and the gate silently rewrites the expectation and reports
 * green forever. So an update run WRITES and then FAILS. There is no configuration of this
 * process in which "the examples were rewritten" and "the suite is green" are both true.
 */
const updateMode = process.env.UPDATE_EXAMPLES === '1';

/* ────────────────────────────────────────────────────────────────────────────────────
 * The two renders
 * ──────────────────────────────────────────────────────────────────────────────────── */

interface Variant {
  /** The directory under deploy/examples/ that holds this render, and its name in messages. */
  readonly dir: string;
  /** What this variant IS, in one line — it becomes the index's section header. */
  readonly note: string;
  /** The web server this render is for. `null` = whatever the declaration itself says. */
  readonly webServer: 'apache' | null;
}

const VARIANTS: readonly Variant[] = Object.freeze([
  Object.freeze({
    dir: 'rendered',
    note: 'the declaration exactly as committed',
    webServer: null,
  }),
  Object.freeze({
    dir: 'rendered-apache',
    note: 'the same declaration with web.server = "apache"',
    webServer: 'apache' as const,
  }),
]);

/** The committed declaration, re-read per call so no test can mutate another's input. */
function readDeclaration(): Record<string, unknown> {
  return JSON.parse(readFileSync(DECLARATION_PATH, 'utf8')) as Record<string, unknown>;
}

interface Rendered {
  readonly variant: Variant;
  readonly manifest: InstanceManifest;
  readonly layout: InstanceLayout;
  readonly artifacts: readonly Artifact[];
}

/**
 * ONE DECLARATION IN, ONE COMPLETE HOST SET OUT — the whole composition, in the order the
 * provisioner performs it. If this throws, no example is comparable and every test below is
 * meaningless, which is why the first test in the file is exactly this call.
 */
function render(variant: Variant): Rendered {
  const doc = readDeclaration();
  if (variant.webServer) {
    const web = (doc.web ?? {}) as Record<string, unknown>;
    doc.web = { ...web, server: variant.webServer };
  }
  const manifest = parseManifest(doc);
  const layout = derive(manifest);
  return { variant, manifest, layout, artifacts: renderAll(layout, manifest) };
}

const RENDERS: readonly Rendered[] = VARIANTS.map(render);

/**
 * WHERE AN ARTIFACT'S EXAMPLE IS COMMITTED: the host path, mirrored under the variant's
 * directory.
 *
 * A mirror and not a flattened name, because the mapping has to be mechanical in BOTH
 * directions — this gate walks the committed tree looking for files no renderer claims, and
 * a naming scheme with an escape rule ('/' → '_', say) would make two different host paths
 * collide into one example and the sweep would call the survivor complete. It also happens to
 * be the best documentation available: the directory layout IS the host layout, so an
 * operator reads where each file goes without a table telling them.
 */
function committedPathFor(variant: Variant, hostPath: string): string {
  return join(EXAMPLES_DIR, variant.dir, ...hostPath.split('/').filter(Boolean));
}

/** Every file under a committed variant tree, as absolute paths, sorted. */
function walkCommitted(variant: Variant): string[] {
  const root = join(EXAMPLES_DIR, variant.dir);
  const found: string[] = [];
  const visit = (dir: string): void => {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir).sort()) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) visit(full);
      else found.push(full);
    }
  };
  visit(root);
  return found.sort();
}

/* ────────────────────────────────────────────────────────────────────────────────────
 * The index
 * ──────────────────────────────────────────────────────────────────────────────────── */

/**
 * THE CENSUS — the one fact about these artifacts that a checked-out file cannot carry.
 *
 * A committed example holds the BYTES. It cannot hold `root:root 0644`, and the ownership is
 * not a detail here: it is the isolation model. `env` is 0640 root:<service group> because it
 * must be readable by the daemon and by nothing else on a shared host; the engine fragment is
 * group-owned by the ENGINE's group because that is the one file crossing the pairing
 * boundary. An example set that showed the text and hid the access would document the least
 * interesting half.
 *
 * Generated by the same function that writes it and asserted byte-for-byte like every other
 * example, so it is a census and not a second opinion: an artifact that appears, disappears
 * or changes hands reddens here.
 */
function formatIndex(): string {
  interface Row {
    readonly file: string;
    readonly mode: string;
    readonly ownership: string;
    readonly modeKey: string;
    readonly kind: string;
  }
  const sections: { variant: Variant; rows: Row[] }[] = RENDERS.map(rendered => ({
    variant: rendered.variant,
    rows: rendered.artifacts.map(a => ({
      file: relative(join(EXAMPLES_DIR, rendered.variant.dir), committedPathFor(rendered.variant, a.path)).split(sep).join('/'),
      mode: a.mode.toString(8).padStart(4, '0'),
      ownership: `${a.owner}:${a.group}`,
      modeKey: a.modeKey,
      kind: a.kind,
    })),
  }));

  // Column widths over EVERY row of EVERY section, so adding a variant cannot reflow the
  // sections above it and turn a one-artifact change into a whole-file diff.
  const all = sections.flatMap(s => s.rows);
  const width = (pick: (row: Row) => string): number => Math.max(...all.map(row => pick(row).length));
  const wMode = width(r => r.mode);
  const wOwn = width(r => r.ownership);
  const wKey = width(r => r.modeKey);
  const wKind = width(r => r.kind);

  const lines: string[] = [
    '# The rendered examples, and the access each artifact is installed with.',
    '#',
    '# GENERATED — do not edit. Every file listed below, and this file, are byte-compared',
    '# against a fresh render by tests/provision_examples.test.ts. To change one, change the',
    '# renderer or deploy/examples/instance.example.json, then:',
    '#',
    '#     UPDATE_EXAMPLES=1 bun test ./tests/provision_examples.test.ts',
    '#',
    '# The trees mirror the HOST: deploy/examples/<tree>/etc/... is /etc/... on the museum\'s',
    '# machine. The mode and owner are what the provisioner applies; a checked-out file cannot',
    '# carry them, which is the only reason this listing exists.',
    '#',
    '# mode owner:group  MODES row  kind  ->  path on the host',
  ];
  for (const section of sections) {
    lines.push('', `[${section.variant.dir}]  ${section.variant.note}`);
    for (const row of section.rows) {
      lines.push(
        `${row.mode.padEnd(wMode)}  ${row.ownership.padEnd(wOwn)}  ${row.modeKey.padEnd(wKey)}  ` +
          `${row.kind.padEnd(wKind)}  /${row.file}`,
      );
    }
  }
  return `${lines.join('\n')}\n`;
}

/* ────────────────────────────────────────────────────────────────────────────────────
 * Update mode
 * ──────────────────────────────────────────────────────────────────────────────────── */

if (updateMode) {
  describe('UPDATE_EXAMPLES=1', () => {
    test('rewrites the committed examples, and fails so the run is never green', () => {
      const written: string[] = [];
      for (const rendered of RENDERS) {
        // Sweep first: a renamed or removed artifact must lose its example in the same run,
        // or the next plain run reports a stale file the update was supposed to clear.
        const claimed = new Set(rendered.artifacts.map(a => committedPathFor(rendered.variant, a.path)));
        for (const stale of walkCommitted(rendered.variant)) {
          if (!claimed.has(stale)) {
            rmSync(stale);
            written.push(`removed ${relative(PACKAGE_DIR, stale)}`);
          }
        }
        for (const a of rendered.artifacts) {
          const target = committedPathFor(rendered.variant, a.path);
          mkdirSync(dirname(target), { recursive: true });
          const before = existsSync(target) ? readFileSync(target, 'utf8') : null;
          if (before !== a.body) {
            writeFileSync(target, a.body);
            written.push(`${before === null ? 'created' : 'updated'} ${relative(PACKAGE_DIR, target)}`);
          }
        }
      }
      const index = formatIndex();
      if (!existsSync(INDEX_PATH) || readFileSync(INDEX_PATH, 'utf8') !== index) {
        writeFileSync(INDEX_PATH, index);
        written.push(`wrote ${relative(PACKAGE_DIR, INDEX_PATH)}`);
      }

      throw new Error(
        `UPDATE_EXAMPLES=1 rewrote the committed examples — this run is deliberately RED so ` +
          `that a stray environment variable can never make this gate pass by rewriting what ` +
          `it checks.\n\n${written.length ? written.map(l => `  ${l}`).join('\n') : '  (nothing changed)'}` +
          `\n\nReview the diff, then re-run WITHOUT UPDATE_EXAMPLES.`,
      );
    });
  });
}

/* ────────────────────────────────────────────────────────────────────────────────────
 * The gate
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe('the one declaration composes into a complete host set', () => {
  // The assertion whose absence is the reason this subsystem needed a composition gate at
  // all. Everything below compares bytes; this is the line that says there ARE bytes.
  test('derive(parseManifest(instance.example.json)) renders, for both web servers', () => {
    for (const rendered of RENDERS) {
      expect(rendered.artifacts.length).toBeGreaterThan(0);
      expect(rendered.layout.instance).toBe('example');
    }
  });

  test('a render is STABLE — the same declaration is the same bytes, every time', () => {
    // Not tidiness. The provisioner writes only on drift, so an unstable rendering rewrites a
    // museum's live unit and vhosts on every run and buries the one real change in the noise.
    // It is also what makes a committed example meaningful at all: an example of a rendering
    // that differs from itself documents nothing.
    for (const variant of VARIANTS) {
      const first = render(variant).artifacts;
      const second = render(variant).artifacts;
      expect(second.map(a => `${a.path}\n${a.body}`)).toEqual(first.map(a => `${a.path}\n${a.body}`));
    }
  });

  test('every artifact kind a museum gets is represented in the committed examples', () => {
    // Both vhost kinds appear across the two trees — which is the reason the second tree
    // exists. A kind rendered by nobody would mean an example set that documents four of the
    // five renderers and says nothing about the fifth.
    const kinds = new Set(RENDERS.flatMap(r => r.artifacts.map(a => a.kind)));
    expect([...kinds].sort()).toEqual([
      'apache_vhost',
      'engine_fragment',
      'env',
      'nginx_vhost',
      'sites',
      'unit',
    ]);
  });

  test('the web-server choice changes the vhosts and ONE line of env, and nothing else', () => {
    // This is why the second tree is a computed variant and not a second declaration, stated
    // as an assertion instead of as a claim in a comment. The unit and the pairing fragment
    // are byte-identical across the two renders — the daemon and the engine do not care which
    // web server serves the museum's sites — so the duplication in `rendered-apache/` is
    // three files a gate keeps identical, not three files a person keeps in step.
    //
    // It is also the honest correction of an assumption that was wrong when this gate was
    // designed: the env is NOT identical. It carries DEPLOYMENT_MODE, and that single line is
    // the whole of the difference. Asserting the exact difference means a renderer that
    // started varying something else by web server — a root, an identity, a limit — reddens
    // here, where the two renders are the only place in the tree that can see it.
    const [nginxRender, apacheRender] = RENDERS;
    const byKind = (rendered: Rendered): Map<string, Artifact> =>
      new Map(rendered.artifacts.map(a => [a.kind, a]));
    const left = byKind(nginxRender!);
    const right = byKind(apacheRender!);

    for (const kind of ['unit', 'engine_fragment']) {
      expect({ kind, body: right.get(kind)!.body }).toEqual({ kind, body: left.get(kind)!.body });
      expect({ kind, path: right.get(kind)!.path }).toEqual({ kind, path: left.get(kind)!.path });
    }

    // The env, line for line, with the stamp skipped: it is a hash of the body, so it is a
    // CONSEQUENCE of the difference below and would report it twice.
    const envLines = (a: Artifact): string[] => a.body.split('\n').slice(1);
    const before = envLines(left.get('env')!);
    const after = envLines(right.get('env')!);
    const differing = before
      .map((line, index) => (line === after[index] ? null : `${line}  ->  ${after[index]}`))
      .filter((entry): entry is string => entry !== null);
    expect({ lineCount: after.length, differing }).toEqual({
      lineCount: before.length,
      differing: ['DEPLOYMENT_MODE="nginx"  ->  DEPLOYMENT_MODE="apache"'],
    });

    // And exactly one vhost renderer applies to a host, which is the property that makes
    // `appliesTo` worth having: a host that got both would have two web servers claiming the
    // same document roots.
    expect(left.has('nginx_vhost') && !left.has('apache_vhost')).toBe(true);
    expect(right.has('apache_vhost') && !right.has('nginx_vhost')).toBe(true);
  });
});

describe('every committed example is byte-equal to its freshly rendered form', () => {
  for (const rendered of RENDERS) {
    for (const artifact of rendered.artifacts) {
      const committed = committedPathFor(rendered.variant, artifact.path);
      const shown = relative(PACKAGE_DIR, committed);

      test(`${shown}`, () => {
        expect({ path: shown, exists: existsSync(committed) }).toEqual({ path: shown, exists: true });
        // Compared as a whole string and not line by line: the stamp on the first line is a
        // hash of everything under it, so a one-character edit anywhere shows up twice, and
        // seeing both halves disagree is what tells an operator they are looking at a hand
        // edit rather than at a renderer change.
        expect(readFileSync(committed, 'utf8')).toBe(artifact.body);
      });
    }
  }
});

describe('the committed set is closed', () => {
  for (const rendered of RENDERS) {
    test(`${rendered.variant.dir}/ holds nothing the renderers do not produce`, () => {
      // The other direction, and the one that rots quietly: a renamed vhost, a retired
      // artifact kind, a site removed from the declaration all leave a file behind that reads
      // like current documentation and describes a host nobody provisions. That is `sample.env`
      // again — a file everybody trusted, that nothing produced and nothing checked.
      const claimed = new Set(rendered.artifacts.map(a => committedPathFor(rendered.variant, a.path)));
      const stale = walkCommitted(rendered.variant)
        .filter(file => !claimed.has(file))
        .map(file => relative(PACKAGE_DIR, file));
      expect(stale).toEqual([]);
    });
  }

  test('the index is the census of both trees', () => {
    expect(existsSync(INDEX_PATH)).toBe(true);
    expect(readFileSync(INDEX_PATH, 'utf8')).toBe(formatIndex());
  });

  test('the index names every committed example, and the ownership the provisioner applies', () => {
    // The index earns its place only if it is complete: read as a census with a file missing,
    // it is worse than no census, because the absence reads as "this artifact has no special
    // access" rather than as "nobody wrote this row".
    const index = formatIndex();
    for (const rendered of RENDERS) {
      for (const artifact of rendered.artifacts) {
        expect(index).toContain(artifact.path);
        expect(index).toContain(`${artifact.owner}:${artifact.group}`);
        expect(index).toContain(artifact.modeKey);
      }
    }
  });
});

describe('no committed example carries a secret', () => {
  // R4, asserted over the BYTES THAT ARE IN GIT FOREVER. Each renderer refuses a credential
  // value on its own account, and those gates are the real defence; this one is different in
  // kind and worth having anyway — it is the last check before a value becomes permanent
  // history that no later commit can remove. A leaked token in a rendered artifact is a
  // museum's provider account; a leaked token in a COMMITTED example is every reader's.
  const CREDENTIAL_SHAPED = /^([A-Z][A-Z0-9_]*(?:TOKEN|SECRET|PASSWORD|PASSPHRASE|CREDENTIAL|_KEY))="?([^"]*)"?$/;

  for (const rendered of RENDERS) {
    for (const artifact of rendered.artifacts) {
      const shown = relative(PACKAGE_DIR, committedPathFor(rendered.variant, artifact.path));

      test(`${shown} assigns no credential a value`, () => {
        const lines = readFileSync(committedPathFor(rendered.variant, artifact.path), 'utf8').split('\n');
        for (const [index, line] of lines.entries()) {
          const assignment = CREDENTIAL_SHAPED.exec(line.trim());
          if (assignment) {
            // The one permitted value is the fragment's unmistakable sentinel, which exists
            // precisely so that "the pairing is unfinished" is greppable rather than being an
            // empty string that fails later as a plain 401.
            expect({ line: index + 1, key: assignment[1], value: assignment[2] }).toEqual({
              line: index + 1,
              key: assignment[1],
              value: TOKEN_PLACEHOLDER,
            });
          }
          // A long hex run is what a generated token looks like. The stamp on line 1 is a
          // sha256 by design, so it is the one line exempt — and only that line, so a hash
          // pasted anywhere else still reddens.
          if (index > 0) {
            expect({ line: index + 1, hexRun: /[0-9a-f]{32,}/.test(line) }).toEqual({
              line: index + 1,
              hexRun: false,
            });
          }
        }
      });
    }
  }

  test('a credential KEY appears only as a name and a path', () => {
    // The declaration names ANTHROPIC_API_KEY and a file to read it from. Both are safe to
    // commit and both must be visible — an operator has to see which credentials an instance
    // needs and where the provisioner expects them. What must never appear is the value, and
    // the shape that would carry one is an assignment, which the per-artifact test above
    // closes. This asserts the positive half: the key IS documented.
    const fragment = RENDERS[0]!.artifacts.find(a => a.kind === 'env');
    expect(fragment).toBeDefined();
    expect(fragment!.body).toContain('ANTHROPIC_API_KEY');
    expect(fragment!.body).toContain('/etc/dedalo_sites/instances/example/secrets/ANTHROPIC_API_KEY');
  });
});

describe('the retired hand-written artifacts stay retired', () => {
  /**
   * `engineering/SITE_BUILDER_INSTANCES.md` §9 listed this as an assertion still to be
   * written. It is written here because this file is the retirement's gate, and because the
   * thing being asserted is not "a file is absent" — it is that no deployment fact has a
   * second owner again. Each of these stated one, and the pair that stated the SAME one
   * (`install.sh:13-14` and the unit's `User=`/`Group=`) is why the identity was silently
   * non-overridable while looking overridable.
   *
   * A resurrected file here is not a merge accident to be discovered on a museum's host. It
   * is the whole defect back, and it would look like documentation.
   */
  const RETIRED: readonly { readonly path: string; readonly renderer: string }[] = Object.freeze([
    { path: 'install.sh', renderer: 'the provisioner (identities, roots, modes, markers, secrets)' },
    { path: 'deploy/dedalo-site-builder.service', renderer: 'src/provision/render/unit.ts' },
    { path: 'nginx/dedalo_sites_preprod.conf', renderer: 'src/provision/render/nginx.ts' },
    { path: 'nginx/dedalo_sites_prod.conf', renderer: 'src/provision/render/nginx.ts' },
    { path: 'apache/dedalo_sites.conf', renderer: 'src/provision/render/apache.ts' },
    { path: 'sample.env', renderer: 'src/provision/render/env.ts' },
  ]);

  for (const retired of RETIRED) {
    test(`${retired.path} does not exist — its text is ${retired.renderer}`, () => {
      expect({ path: retired.path, exists: existsSync(join(PACKAGE_DIR, retired.path)) }).toEqual({
        path: retired.path,
        exists: false,
      });
    });
  }

  test('the directories that held only those files are gone too', () => {
    // An empty `nginx/` left behind is an invitation to put a vhost back in it.
    for (const dir of ['nginx', 'apache']) {
      expect({ dir, exists: existsSync(join(PACKAGE_DIR, dir)) }).toEqual({ dir, exists: false });
    }
  });

  /** The one directory that legitimately holds the retired bytes. See the skip below. */
  const RECOVERED_FIXTURE_DIR = 'pre_instance';

  test('the recovered installer files live ONLY in that fixture, and nowhere a run could reach', () => {
    // The exemption below costs nothing only while this holds: the retired files exist at
    // exactly one path, under `tests/fixtures/`, and no live path in this package is that
    // directory. A copy anywhere else is the resurrection this section refuses.
    const found: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir).sort()) {
        if (entry === 'node_modules' || entry === '.git' || entry === SCRATCH_DIR_NAME) continue;
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) {
          walk(full);
          continue;
        }
        if (['install.sh', 'sample.env', 'dedalo-site-builder.service'].includes(entry)) {
          found.push(relative(PACKAGE_DIR, full));
        }
      }
    };
    walk(PACKAGE_DIR);
    expect(found.sort()).toEqual([
      join('tests', 'fixtures', RECOVERED_FIXTURE_DIR, 'dedalo-site-builder.service'),
      join('tests', 'fixtures', RECOVERED_FIXTURE_DIR, 'install.sh'),
      join('tests', 'fixtures', RECOVERED_FIXTURE_DIR, 'sample.env'),
    ]);
  });

  test('nothing in the package still tells an operator to run or copy one of them', () => {
    // A dangling instruction is worse than the installer was: the installer at least did
    // something. This walks the package's own tracked prose and source — not the whole repo,
    // which a package-local gate has no business asserting about — and refuses an INSTRUCTION
    // naming a retired file. Explanations of why a file was retired are the point of several
    // comments in this tree, so the pattern matches the imperative forms only.
    const instruction =
      /(?:^|[\s`'"(])(?:sudo\s+)?(?:\.\/install\.sh|cp\s+\S*sample\.env|cp\s+\S*deploy\/dedalo-site-builder\.service|copy\s+nginx\/dedalo_sites)/;
    const offenders: string[] = [];
    // `tests/fixtures/pre_instance/` holds the three retired files VERBATIM, recovered from
    // b46a29418e^ and frozen by hash, because `provision adopt` is a migration FROM that
    // install and a fixture written from memory is how adoption came to read three keys the
    // installer never wrote. They are evidence, not instructions: nothing runs them, nothing
    // links to them, and `tests/provision_adopt.test.ts` asserts their hashes so they cannot
    // be edited into something history was not. The rule this exempts them from is about a
    // LIVE instruction, and a byte-frozen artifact under `tests/fixtures/` is not one.
    const skip = new Set(['node_modules', '.git', SCRATCH_DIR_NAME, RECOVERED_FIXTURE_DIR]);
    const visit = (dir: string): void => {
      for (const entry of readdirSync(dir).sort()) {
        if (skip.has(entry)) continue;
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) {
          visit(full);
          continue;
        }
        if (!/\.(ts|md|json|sh|conf|service|env)$/.test(entry)) continue;
        for (const [index, line] of readFileSync(full, 'utf8').split('\n').entries()) {
          if (instruction.test(line)) offenders.push(`${relative(PACKAGE_DIR, full)}:${index + 1}: ${line.trim()}`);
        }
      }
    };
    visit(PACKAGE_DIR);
    expect(offenders).toEqual([]);
  });
});

describe('the stamp shape §4 describes is the one hash.ts renders', () => {
  /**
   * This assertion exists because the document was WRONG here, and nothing could notice.
   *
   * §4 specified a two-line header — `# GENERATED by publication/site_builder/src/provision`
   * followed by `# body-hash: <sha256>` — and no renderer has ever produced it; the
   * implemented stamp is one line, `# dedalo-provision: <instance> <kind> <sha256>`. That is
   * the same failure the composition gate was written for, one level up: a document and a
   * module, each internally coherent, never read against each other. A permanent definition
   * that describes a header shape nothing writes is worse than no definition, because an
   * operator handed a drifted host would go looking for `body-hash:` and conclude the file
   * was hand-written.
   *
   * So the spec now quotes the real shape and this gate holds it to `hash.ts` — and to the
   * committed examples, which is the third corner: the document, the code and the artifacts
   * on disk are one system or the gate is red.
   */
  const spec = readFileSync(SPEC_PATH, 'utf8');

  /** §4, from its heading to §5's — where the artifact law is SPECIFIED. */
  const generatedArtifactLaw = spec.slice(
    spec.indexOf('## 4. The generated-artifact law'),
    spec.indexOf('## 5. The marker law'),
  );

  test('§4 quotes the stamp token hash.ts actually writes, and no longer the one it never did', () => {
    expect(generatedArtifactLaw.length).toBeGreaterThan(0);
    expect(generatedArtifactLaw).toContain(STAMP_TOKEN);
    // The stale spelling is refused HERE and not document-wide, and the distinction is the
    // point: §4 is where an operator reads what a stamp IS, so a second shape stated there
    // is a second specification. §9 is where the document remembers that it once said
    // something else, which is worth keeping — a gate that forbade the file from explaining
    // its own corrections would teach people to delete the explanations.
    expect(generatedArtifactLaw).not.toContain('body-hash:');
    // Only `body-hash:` is refused, and the near miss is worth naming: the artifacts DO
    // carry a `# GENERATED by <module> — do NOT edit.` second line, so a gate that
    // forbade that string would forbid the document from describing the header truthfully.
    // A gate that can only be satisfied by saying less is a worse gate than none.
  });

  test('every committed example opens with a stamp that reads back', () => {
    for (const rendered of RENDERS) {
      for (const artifact of rendered.artifacts) {
        const committed = committedPathFor(rendered.variant, artifact.path);
        const firstLine = readFileSync(committed, 'utf8').split('\n')[0]!;
        // The PREFIX is the artifact's own comment syntax and not a constant: `sites.json`
        // is JSON, which has no comment at all, so its stamp rides on a `//` line that its
        // reader strips before parsing (src/sites/site_table.ts). Asserting '#' everywhere
        // would have been a gate that could only be satisfied by making the one artifact a
        // program reads unparseable.
        const prefix = artifact.kind === 'sites' ? SITE_TABLE_COMMENT_PREFIX : '#';
        expect({ path: artifact.path, startsWith: firstLine.startsWith(`${prefix} ${STAMP_TOKEN} `) }).toEqual({
          path: artifact.path,
          startsWith: true,
        });
        // Read back through the real parser, not by string surgery: the stamp's whole job is
        // to be re-readable by a later `check` run on a host, and a stamp that only LOOKS
        // right is a file the provisioner would treat as a hand edit forever after.
        const parsed = parseStamp(readFileSync(committed, 'utf8'));
        expect({ path: artifact.path, parsed: parsed && { kind: parsed.kind, instance: parsed.instance } }).toEqual({
          path: artifact.path,
          parsed: { kind: artifact.kind, instance: 'example' },
        });
      }
    }
  });
});
