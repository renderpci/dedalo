/**
 * THE ENGINE PAIRING FRAGMENT — the lines the paired engine's `../private/.env` receives.
 *
 * The topology is 1:1 and fixed (SITE_BUILDER_INSTANCES.md §1): one museum, one engine,
 * one site-builder daemon. There is no engine-side tenant map and there must not be one —
 * an engine does not SELECT an instance, it has ONE address. This artifact is the engine's
 * half of that address, and it exists as a rendered file for the reason the whole phase
 * exists: the pairing used to be two values `install.sh` PRINTED at the end of a run and
 * asked an operator to retype into a different file on a different host, with nothing on
 * either side able to notice when one of them was rotated and the other was not.
 *
 * WHAT IT SAYS, AND WHAT IT REFUSES TO SAY.
 *
 *   - WHERE: `DEDALO_SITE_BUILDER_SOCKET`, the per-instance unix socket. A path, not a
 *     port — the socket is 0660 <user>:<engineGroup>, so the engine can open it because it
 *     GROUP-OWNS it, while no other uid on the host (another museum's service user
 *     included) can. The path itself is not a secret: it already carries the instance
 *     name, the runtime directory above it is world-traversable, and the access decision
 *     is the kernel's, not the path's obscurity.
 *   - WHO: `DEDALO_SITE_BUILDER_INSTANCE`, the tenancy name. Not routing — the daemon
 *     serves one instance, so a request that reaches it is by construction that museum's.
 *     It is here so that an operator holding two engines' `.env` files can tell which
 *     daemon each is paired with, and so a socket path pointing at the WRONG instance is
 *     a visible disagreement between two lines rather than a silently wrong connection.
 *   - NOT THE TOKEN'S VALUE. See TOKEN_PLACEHOLDER below for the whole argument.
 *   - NOT A URL. See `assertNoTcpListenerDeclared()` — there is no TCP listener to name,
 *     and that absence is tripwired rather than assumed.
 *
 * APPEND-ONLY MANNERS. This renders a FRAGMENT the operator (or the engine's own
 * installer) appends. The provisioner NEVER edits the engine's `.env` in place, and this
 * daemon must not be able to read that file at all — `engine.private_dir` is declared for
 * exactly two reasons, and asserting it lies outside every root this daemon owns is one of
 * them. The one manual step in the pairing is deliberate: it is the step that crosses the
 * isolation boundary, so a human crosses it.
 *
 * ZERO-DEP, PURE, STAMPED — see ./types.ts for the law all five renderers are written to.
 */

import { join } from 'node:path';
import type { InstanceLayout, InstanceManifest } from '../layout';
import { SECRET_KEY_PATTERN } from '../layout';
import type { Artifact, Renderer } from './types';
import { artifact } from './types';

/* ────────────────────────────────────────────────────────────────────────────────────
 * The two vocabularies this file is the seam between
 * ──────────────────────────────────────────────────────────────────────────────────── */

/**
 * THE ENGINE'S KEYS. This module is the ONE place in the site-builder tree that spells
 * them, because this artifact is the only thing the site builder produces that the engine
 * reads. Their definitions live on the engine's side, in its config catalog
 * (`src/config/catalog/sitebuilder.ts`) — the engine's `../private/.env` takes DOCUMENTED
 * keys only, so a key rendered here that the catalog does not carry is a line the engine
 * ignores and an operator cannot debug.
 */
export const ENGINE_KEYS = Object.freeze({
  instance: 'DEDALO_SITE_BUILDER_INSTANCE',
  socket: 'DEDALO_SITE_BUILDER_SOCKET',
  token: 'DEDALO_SITE_BUILDER_TOKEN',
  /** Rendered by nothing today — see `assertNoTcpListenerDeclared()`. */
  url: 'DEDALO_SITE_BUILDER_URL',
});

/**
 * THE CENSUS: every key this fragment assigns, in the order it assigns them.
 *
 * Exported so a gate can compare it against the rendered TEXT in both directions. A
 * renderer's output is bytes, and bytes drift away from the list a reader believes in
 * unless something reads both — the same argument `RENDERER_BY_KIND` makes about the five
 * modules. It is also the thing that changes the day a URL joins the fragment.
 */
export const ENGINE_FRAGMENT_KEYS: readonly string[] = Object.freeze([
  ENGINE_KEYS.instance,
  ENGINE_KEYS.socket,
  ENGINE_KEYS.token,
]);

/**
 * THE DAEMON'S OWN NAME FOR THE SHARED BEARER (`src/config.ts`: `SERVICE_TOKEN`), which is
 * also the credential key the declaration names in `secrets` and the name of the
 * `LoadCredential=` the unit gets. It is spelled here because this file is where the two
 * vocabularies meet: `SERVICE_TOKEN` on the daemon's side of the socket,
 * `DEDALO_SITE_BUILDER_TOKEN` on the engine's, one value.
 */
export const SERVICE_TOKEN_KEY = 'SERVICE_TOKEN';

/**
 * WHAT STANDS WHERE THE TOKEN WOULD BE, and why a placeholder rather than a path.
 *
 * The choice was between naming the KEY with an unmistakable sentinel value, and referring
 * the engine at the credential FILE (`…_TOKEN_FILE=<path>`). The sentinel wins on two
 * facts about this host, not on taste:
 *
 *   1. THE ENGINE CANNOT FOLLOW THE PATH. `secrets/` is 0700 root:root and each credential
 *      file is 0600 root:root — unreachable to the engine's uid by design, because that is
 *      what makes `LoadCredential=` worth anything. A `…_FILE=` line would state the
 *      pairing in a form its only reader can never act on, which is worse than stating it
 *      in a form that visibly needs a human.
 *   2. THE VALUE MUST EXIST IN EXACTLY ONE PLACE ON THIS SIDE. This fragment is generated,
 *      rewritten on drift, group-readable by the ENGINE's group (a host group, not this
 *      instance's), and quoted into `check` reports and bug reports. A token written here
 *      would exist twice, and rotation would become a two-file operation with nothing able
 *      to notice a stale copy — the exact defect the whole phase deletes.
 *
 * So the fragment carries the key, an IMPOSSIBLE value, and the root-only command that
 * reads the real one. The sentinel is deliberately not empty and not plausible: an empty
 * value is a pairing that fails as "unauthorized" with nothing to grep for, while this
 * string appears verbatim in the engine's `.env` and in the daemon's 401, and names its own
 * remedy. `provision check` can find every unfinished pairing by looking for it.
 */
export const TOKEN_PLACEHOLDER = 'PASTE_THE_SERVICE_TOKEN_VALUE_HERE';

/* ────────────────────────────────────────────────────────────────────────────────────
 * Escaping — R6, on a file with more than one parser
 * ──────────────────────────────────────────────────────────────────────────────────── */

/**
 * REFUSED, NOT ESCAPED — and that is the design, not a shortcut.
 *
 * These bytes are appended to a file that is read by at least three parsers with three
 * different unescaping rules: the engine's own loader (`src/config/env.ts` `parseEnvFile`:
 * it trims, strips ONE surrounding quote pair, and unescapes NOTHING), a shell that
 * `.`-sources an env file, and systemd's `EnvironmentFile=`. There is therefore no escape
 * sequence that round-trips through all three — a backslash written for the shell arrives
 * at the engine as a literal backslash, and a value carrying a newline arrives as a
 * TRUNCATED value plus a line the next parser reads as a directive.
 *
 * Given no correct escape exists, the only honest behaviour is to refuse the value and
 * render nothing. Everything on this list is either a quote (which would end the
 * assignment), an expansion character (`$`, backtick — inert to the engine, live to a
 * shell), a backslash (the escape nobody agrees about) or a control character (the newline
 * that turns one directive into two, and the NUL that truncates the file).
 *
 * Defence in depth, on purpose: the schema constrains a domain and a realm, and `derive()`
 * re-checks the instance name — but `derive()` is a SECOND ENTRY POINT (a `provision adopt`
 * builds a manifest from what is on disk, with no declaration ever validated), so this
 * renderer owes the check on its own account rather than delegating it upward.
 */
const FORBIDDEN_IN_VALUE = /["'`$\\]|[\x00-\x1f\x7f]/;

/** The same rule for text that lands in a COMMENT: only the line break matters there. */
const FORBIDDEN_IN_COMMENT = /[\x00-\x1f\x7f]/;

/**
 * One `KEY="value"` line, or nothing at all.
 *
 * The key is checked against layout's `SECRET_KEY_PATTERN` — the same UPPER_SNAKE grammar
 * that governs a credential key, reused rather than restated because it is the identical
 * shape and layout owns it. Today every key here is a module constant, so the check guards
 * a future edit rather than manifest input; it costs a regex and it means the day someone
 * interpolates a key, the key is constrained too.
 *
 * Quoted always. The engine's loader strips one surrounding pair, so quoting is a no-op
 * for it — but a bare value with a trailing space is silently trimmed by one parser and
 * kept by another, and a quoted one shows an operator exactly where the value ends.
 */
function assignment(key: string, value: string, what: string): string {
  if (!SECRET_KEY_PATTERN.test(key)) {
    throw new Error(
      `engine_fragment: '${key}' is not a legal environment key (${SECRET_KEY_PATTERN.source}). ` +
        `It would be appended to the engine's private .env, where a malformed key is a line ` +
        `every parser reads differently. Nothing was rendered.`,
    );
  }
  if (typeof value !== 'string' || value.length === 0 || value.trim() !== value) {
    throw new Error(
      `engine_fragment: ${what} is empty or padded with whitespace, which no two env parsers ` +
        `read the same way. Nothing was rendered.`,
    );
  }
  const offending = FORBIDDEN_IN_VALUE.exec(value);
  if (offending) {
    throw new Error(
      `engine_fragment: ${what} contains ${describe(offending[0])}, which cannot be safely ` +
        `written into an environment file — a quote ends the assignment, a newline starts a ` +
        `second directive, and '$'/backtick/backslash mean different things to the engine's ` +
        `loader, to a shell that sources the file and to systemd. There is no escape that ` +
        `round-trips through all three, so the value is refused rather than escaped. ` +
        `Nothing was rendered.`,
    );
  }
  return `${key}="${value}"`;
}

/**
 * Comment lines. Every line is prefixed, and the text is refused if it carries a control
 * character — a newline inside "a comment" is how a hostile `description` would leave the
 * comment and become a line the engine reads as configuration.
 */
function comment(what: string, ...lines: readonly string[]): string[] {
  return lines.map(line => {
    const offending = FORBIDDEN_IN_COMMENT.exec(line);
    if (offending) {
      throw new Error(
        `engine_fragment: ${what} contains ${describe(offending[0])}. A comment ends at the ` +
          `line break, so a control character there would let the text escape the comment and ` +
          `become a directive in the engine's private .env. Nothing was rendered.`,
      );
    }
    return line.length === 0 ? '#' : `# ${line}`;
  });
}

/** A readable name for a byte, so the refusal message says WHICH character was wrong. */
function describe(character: string): string {
  const code = character.charCodeAt(0);
  if (code === 0x0a) return 'a newline';
  if (code === 0x0d) return 'a carriage return';
  if (code < 0x20 || code === 0x7f) return `a control character (0x${code.toString(16).padStart(2, '0')})`;
  return `the character '${character}'`;
}

/* ────────────────────────────────────────────────────────────────────────────────────
 * The TCP listener that does not exist — tripwired, not assumed
 * ──────────────────────────────────────────────────────────────────────────────────── */

/**
 * Names a declaration of a TCP listener would plausibly take, in the grammar this fragment
 * reads. A NET, not a grammar: this renderer must not invent a field (`derive`, never
 * restate — a shape spelled here would be a second owner of a declaration `schema.ts` and
 * `layout.ts` have not agreed to). What it CAN do is refuse to render a pairing fragment
 * for a declaration it does not fully understand.
 */
const TCP_LISTENER_HINTS: readonly string[] = Object.freeze(['listener', 'listen', 'tcp', 'bind', 'port']);

/**
 * WHY `DEDALO_SITE_BUILDER_URL` IS NOT IN THIS FILE, EXPRESSED AS A GATE.
 *
 * The engine reaches this daemon over the unix socket, and the socket is not a fallback for
 * a port — it IS the transport, and its 0660 <user>:<engineGroup> ownership is the whole
 * pairing mechanism (no port on the host, no group joined by anybody, no uid but the
 * engine's able to connect). The declaration grammar accordingly has no way to say
 * "listen on TCP", and `instanceManifestSchema` is a strict object, so no validated
 * manifest can carry one.
 *
 * That leaves one real risk, and this function is the answer to it: a listener declaration
 * ADDED to the grammar later, or a manifest built by `provision adopt` straight from a
 * host's disk. Either would produce a fragment that confidently names a socket the engine
 * is not going to use, and a museum whose engine cannot reach its own daemon with every
 * generated file looking correct. So the unknown key is a REFUSAL that names this file:
 * when a listener becomes declarable, the URL line is added HERE, to `ENGINE_FRAGMENT_KEYS`
 * and to the engine's catalog, in the same commit that makes it declarable.
 *
 * A dead `if` around a URL line would have been the alternative — a branch nothing can
 * reach, and therefore a branch nothing keeps honest. This subsystem's law is that an
 * invariant is tripwired or deleted; this one is tripwired.
 */
function assertNoTcpListenerDeclared(manifest: InstanceManifest): void {
  // `render(layout, manifest)` is the contract, but this renderer is the only one that
  // reads the manifest at all — so it is the only one that would fault on a caller that
  // passed a layout and nothing else. An empty object is the right reading: nothing was
  // declared, therefore no listener was.
  const declared = (manifest ?? {}) as unknown as Record<string, unknown>;
  for (const hint of TCP_LISTENER_HINTS) {
    if (declared[hint] === undefined) continue;
    throw new Error(
      `engine_fragment: instance '${String(declared.instance)}' declares '${hint}', which this ` +
        `renderer does not understand. The pairing fragment names the unix socket as THE ` +
        `transport (0660 <user>:<engine group>); if this declaration adds a TCP listener, the ` +
        `engine must be told with ${ENGINE_KEYS.url} instead — render it from ` +
        `src/provision/render/engine_fragment.ts and add it to ENGINE_FRAGMENT_KEYS. A ` +
        `fragment naming a socket the engine will not use pairs nothing while looking right. ` +
        `Nothing was rendered.`,
    );
  }
}

/* ────────────────────────────────────────────────────────────────────────────────────
 * The renderer
 * ──────────────────────────────────────────────────────────────────────────────────── */

export const engineFragmentRenderer: Renderer = {
  kind: 'engine_fragment',

  render(layout: InstanceLayout, manifest: InstanceManifest): Artifact[] {
    assertNoTcpListenerDeclared(manifest);

    return [
      artifact(layout, {
        kind: 'engine_fragment',
        path: layout.engineFragment,
        mode: 'engineFragment',
        body: fragmentBody(layout),
      }),
    ];
  },
};

/**
 * The bytes, below the stamp. A pure function of the layout, in a fixed order: nothing
 * here iterates a declared collection, so there is no set to sort and no way for two
 * equivalent declarations to render differently.
 */
function fragmentBody(layout: InstanceLayout): string {
  // The engine's private environment file — derived, because `engine.private_dir` is
  // declared and asserted disjoint from every root this daemon owns. '.env' is the
  // ENGINE's convention (src/config/env.ts reads `<private>/.env`), which is why it is
  // spelled on this side of the socket and nowhere else in this tree.
  const engineEnvFile = join(layout.enginePrivateDir, '.env');

  // Where the shared bearer actually lives. The declaration may name the file itself
  // (`secrets.SERVICE_TOKEN`, the LoadCredential source); otherwise it is the provisioner's
  // own canonical place for that key. Derived either way — a literal here would be the
  // second owner of a path, which is the defect this phase deletes.
  const tokenFile = layout.secrets[SERVICE_TOKEN_KEY] ?? layout.secretPath(SERVICE_TOKEN_KEY);

  const lines: string[] = [
    ...comment(
      'the generated header',
      `Dédalo site builder — engine pairing fragment for instance '${layout.instance}'.`,
      '',
      'GENERATED FILE. Rendered from the declaration at',
      `  ${layout.manifestPath}`,
      'by publication/site_builder/src/provision/render/engine_fragment.ts.',
      'Do not edit it: the provisioner rewrites it whenever that declaration changes, and',
      'reports a hand edit as drift, so a change made here survives until the next apply.',
      '',
      'WHAT IT IS. These are the lines the PAIRED ENGINE needs in its private environment',
      'file in order to reach this daemon. The topology is 1:1 and fixed: one museum, one',
      'engine, one site builder. There is no tenant map on either side — this daemon serves',
      'one instance, and the engine has one address.',
      '',
      'HOW TO USE IT. Append it to the engine’s private environment file, then replace the',
      'token placeholder below, then restart the engine:',
      '',
      `  sudo sh -c 'cat ${layout.engineFragment} >> ${engineEnvFile}'`,
      '',
      'That file is APPEND-ONLY and takes documented keys only. Appending is the operator’s',
      'move and the only manual step in the pairing, deliberately: it is the step that',
      'crosses the isolation boundary, and this daemon must not be able to read — let alone',
      'write — the engine’s private directory. It never does.',
    ),
  ];

  if (layout.description) {
    lines.push(...comment('the declared description', '', layout.description));
  }

  lines.push(
    '',
    ...comment(
      'the instance note',
      'WHICH TENANCY THIS ENGINE IS PAIRED WITH. Not routing — the daemon serves exactly one',
      'instance, so a request that reaches it is by construction this museum’s. It is here so',
      'that an operator holding two engines’ files can tell which daemon each talks to, and so',
      'that a socket path naming another instance is a visible disagreement between two lines',
      'rather than a connection to the wrong museum.',
    ),
    assignment(ENGINE_KEYS.instance, layout.instance, 'the instance name'),

    '',
    ...comment(
      'the socket note',
      'WHERE THE ENGINE CONNECTS. A unix socket, not a port. It is owned',
      `  ${layout.identity.user}:${layout.identity.engineGroup}, mode 0660`,
      'so the engine opens it because it GROUP-OWNS it — no user is added to any group',
      'anywhere in this design — and no other uid on this host, another museum’s service user',
      'included, can connect to it at all. The path is not a secret: it carries the instance',
      'name already, and the access decision is the kernel’s rather than the path’s obscurity.',
    ),
    assignment(ENGINE_KEYS.socket, layout.socketPath, 'the socket path'),

    '',
    ...comment(
      'the token note',
      'THE SHARED BEARER — NAMED HERE, NEVER VALUED HERE.',
      '',
      'The engine presents this token on every call; the daemon knows the same value as its',
      `own ${SERVICE_TOKEN_KEY}, delivered to it by systemd LoadCredential from a root-owned`,
      '0600 file. It is absent from this fragment on purpose. This file is generated,',
      `group-readable by ${layout.identity.engineGroup}, and quoted into drift reports; a token`,
      'written here would exist in two places, and rotating it would become a two-file',
      'operation with nothing able to notice the stale copy.',
      '',
      'Read the real value as root and paste it over the placeholder:',
      '',
      `  sudo cat ${tokenFile}`,
      '',
      'The placeholder is not empty and not plausible on purpose: left in place it produces a',
      'refusal that names itself, instead of an unauthenticated pairing that fails with',
      'nothing to search for.',
    ),
    assignment(ENGINE_KEYS.token, TOKEN_PLACEHOLDER, 'the token placeholder'),

    '',
    ...comment(
      'the missing-URL note',
      `WHY THERE IS NO ${ENGINE_KEYS.url} HERE. The socket above is not a fallback for a port:`,
      'it is the transport, and its ownership is the entire pairing mechanism. This instance',
      'publishes no TCP listener, so there is no URL to give. An engine configured with a URL',
      'for this daemon is reaching something else.',
    ),
    '',
  );

  return lines.join('\n');
}
