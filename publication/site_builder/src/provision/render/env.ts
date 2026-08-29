/**
 * THE RENDERED ENV for one instance — the daemon's whole environment, and not one secret
 * in it.
 *
 * This file replaces `sample.env` + the `sed`-and-`chmod` step in install.sh, and the
 * replacement is not cosmetic. The old arrangement had a museum's daemon reading a `.env`
 * that lived INSIDE the checkout, owned by the service user, holding the SERVICE_TOKEN and
 * every provider key in plaintext — a file the daemon could read, rewrite, and hand to any
 * agent turn that talked it into `cat`ting a path. The instance model inverts all three
 * facts: the environment is root-owned (0640 root:<instance group> — the `envFile` row of
 * layout's matrix), it is DERIVED from the declaration rather than edited by hand, and it
 * carries NO CREDENTIAL AT ALL. Provider material reaches the process through systemd
 * `LoadCredential=`, out of root-owned 0600 files the service user cannot open, and is read
 * at `$CREDENTIALS_DIRECTORY/<KEY>`. That is precisely what makes it safe for this file to
 * be group-readable at all.
 *
 * WHAT IT CONTAINS: `layout.envVars`, verbatim, and nothing else.
 *
 * Not "roughly that" — exactly that. layout.ts's `envVars` is documented as *what this file
 * must contain*, and it is the same object the rest of the subsystem derives its paths from,
 * so the roots the daemon is told about and the roots the unit makes writable cannot drift
 * apart: they are one derivation, read twice. A renderer that appended a key of its own
 * would be the second owner of the env census, which is the exact defect this phase deletes
 * (an installer, a unit and a sample env each stating the same facts, none of them able to
 * notice the others). The consequence is deliberate and worth stating plainly: a value the
 * daemon needs and `envVars` does not carry is a gap in `buildEnvVars()` — it is fixed
 * there, where the declaration is, and never patched in here.
 *
 * That is also why UNSTATED LIMITS ARE ABSENT. An unstated limit means "the daemon's own
 * default"; writing today's default into a museum's env would freeze it, silently, so that
 * the day `src/config.ts` changed a number nothing on any provisioned host would move.
 *
 * ESCAPING IS THIS FILE'S OBLIGATION, not the schema's. The schema constrains what a museum
 * may write down, but `derive()` is a second entry point — `provision adopt` builds a
 * manifest from what is already on a host, with no declaration ever validated — and an
 * absolute path is checked for being absolute and nothing else. A path carrying a newline
 * would end this file's line and begin a directive of its own choosing, in a file loaded
 * into a service's environment; a path carrying `$` or a backtick would be a command
 * substitution the first time an operator did the entirely normal `set -a; . env`. So this
 * renderer refuses those characters and escapes the rest, on its own account.
 */

import type { InstanceLayout } from '../layout';
import { DESCRIPTION_PATTERN, SECRET_KEY_PATTERN } from '../layout';
import type { Renderer } from './types';
import { artifact } from './types';

/* ────────────────────────────────────────────────────────────────────────────────────
 * The value grammar — what may cross into a file the service loads as its environment
 * ──────────────────────────────────────────────────────────────────────────────────── */

/**
 * Control characters, the NUL and the DEL included. REFUSED, never escaped.
 *
 * A newline is the one that matters: it closes the assignment and opens the next line as a
 * fresh `KEY=VALUE`, which is a manifest string choosing what this museum's daemon believes
 * about itself. The rest of the range is refused with it because a bare CR or a form feed in
 * a value is never a museum's intention and every parser in the path (systemd's
 * EnvironmentFile reader, a dotenv loader, a shell) has a different opinion about it.
 */
const CONTROL_CHARACTER = /[\x00-\x1f\x7f]/;

/**
 * `$` and the backtick. REFUSED rather than escaped, and this is the deliberate one.
 *
 * Escaping them correctly would require picking a parser: systemd's EnvironmentFile does no
 * variable expansion, a dotenv loader may expand `${VAR}`, and a shell being handed this
 * file by `set -a; . env` — which is how an operator debugs a daemon that will not start —
 * expands both and executes the backtick, as root. A value whose meaning depends on which of
 * those read it is a value that will one day mean the wrong thing on a museum's host. None
 * of the grammars layout owns (an absolute path, an https URL, a driver id, a number, an
 * instance name) needs either character, so refusing them costs an adopted host nothing it
 * can legitimately want and closes the class outright.
 */
const SHELL_EXPANSION = /[$`]/;

/**
 * A key that would be carrying a SECRET if it carried a value at all.
 *
 * The no-secret law is the renderers' obligation and cannot be typed, so it is checked
 * where the bytes are made. Suffix-anchored on purpose: `PUBLICATION_API_KEY_FILE` is a
 * PATH and must pass, while `PUBLICATION_API_KEY`, `SERVICE_TOKEN` and `ANTHROPIC_API_KEY`
 * are values and must not exist here in any form. If one ever appears in `envVars`, that is
 * a credential about to be written into a group-readable file and copied into every agent
 * child's environment — nothing is rendered.
 */
const SECRET_LOOKING_KEY = /(TOKEN|SECRET|PASSWORD|PASSPHRASE|CREDENTIAL|_KEY)$/;

/**
 * Refuse a string that cannot live on one line of a generated file.
 *
 * Used for the values AND for the strings that reach the header comments (the description,
 * a credential's path): a comment is only a comment until something in it ends the line, and
 * a second line beginning with `SERVICE_TOKEN=` is not a comment at all.
 */
function assertOneLine(what: string, value: string): string {
  const control = CONTROL_CHARACTER.exec(value);
  if (control) {
    const code = `\\x${control[0].charCodeAt(0).toString(16).padStart(2, '0')}`;
    throw new Error(
      `render(env): ${what} contains the control character ${code}. A newline (or any control ` +
        `character) in a rendered environment file ends the line it is on and starts a ` +
        `directive of its own — this string would be choosing what the daemon believes about ` +
        `itself. Nothing was rendered.`,
    );
  }
  return value;
}

/**
 * ONE ASSIGNMENT, quoted and escaped.
 *
 * ALWAYS quoted, never "quoted when it needs to be": a renderer that decided per value
 * which ones need quotes would be a second opinion about the grammar, and the values that
 * need them (a path with a space, a description-shaped string on an adopted host) are
 * exactly the ones a happy-path test never has.
 *
 * Inside the quotes only two characters are escaped, because only two survive the refusals
 * above: a backslash (which would otherwise escape whatever followed it) and the closing
 * quote (which would otherwise be the closing quote). Both are escaped the same way in
 * systemd's parser, in every dotenv implementation, and in a POSIX shell — which is the
 * property that lets one rendering be read by all three.
 */
function assignment(key: string, value: string): string {
  if (!SECRET_KEY_PATTERN.test(key)) {
    // layout owns exactly one uppercase-identifier grammar, and it owns it for this reason:
    // the same string is a credential filename, a LoadCredential id AND an environment
    // variable name. Re-checking it here is the last gate before it becomes the second.
    throw new Error(
      `render(env): '${key}' is not a usable environment variable name (${SECRET_KEY_PATTERN.source}). ` +
        `Nothing was rendered.`,
    );
  }
  if (SECRET_LOOKING_KEY.test(key)) {
    throw new Error(
      `render(env): '${key}' names a credential, and this file may never carry one — it is ` +
        `readable by the service user's group, and its whole contents reach every agent child. ` +
        `Declare it under 'secrets' in instance.json so it arrives as a systemd credential, or ` +
        `name the PATH of its file (…_FILE) instead of its value. Nothing was rendered.`,
    );
  }

  assertOneLine(`the value of ${key}`, value);
  if (SHELL_EXPANSION.test(value)) {
    throw new Error(
      `render(env): the value of ${key} contains '$' or a backtick. This file is read by ` +
        `systemd, may be read by a dotenv loader, and WILL be read by an operator's ` +
        `'set -a; . env' — which expands and executes both, as root. Those three disagree about ` +
        `what such a value means, so it is refused rather than escaped. Nothing was rendered.`,
    );
  }

  return `${key}="${value.replace(/[\\"]/g, '\\$&')}"`;
}

/* ────────────────────────────────────────────────────────────────────────────────────
 * The renderer
 * ──────────────────────────────────────────────────────────────────────────────────── */

export const envRenderer: Renderer = {
  kind: 'env',
  render(layout) {
    return [
      artifact(layout, {
        kind: 'env',
        path: layout.envFile,
        // 0640 root:<instance group>. Root-owned so the daemon cannot rewrite its own
        // configuration; group-readable so it can read it — which is only defensible
        // because of the refusals above.
        mode: 'envFile',
        body: renderEnvBody(layout),
      }),
    ];
  },
};

/**
 * The file, minus the stamp `artifact()` puts on top of it.
 *
 * PURE and STABLE: no clock, no filesystem, no `process.env`, and the assignments SORTED.
 * The sort is load-bearing rather than tidy — `envVars` picks up the driver binaries by
 * walking `agent.bins` in DECLARATION ORDER, so an operator who swapped two lines in
 * instance.json would otherwise produce a different file, and a provisioner that writes
 * only on drift would report a museum's env as changed and rewrite it. Alphabetical, in one
 * block, because any grouping into sections would be a second census of the key names
 * layout owns; a total order taken from the data itself cannot fall out of step with it.
 */
function renderEnvBody(layout: InstanceLayout): string {
  const lines: string[] = [
    `# GENERATED FILE — do not edit.`,
    `#`,
    `# The environment of the Dédalo site-builder daemon for instance '${layout.instance}'.`,
  ];

  if (layout.description) {
    // Re-checked against the grammar that governs it: `derive()` asserts a description only
    // when the manifest states one, and an adopted host's manifest was never validated at
    // all. One line, no control characters — see assertOneLine.
    if (!DESCRIPTION_PATTERN.test(layout.description)) {
      throw new Error(
        `render(env): the instance description does not match ${DESCRIPTION_PATTERN.source}. It is ` +
          `rendered into the header of every artifact, where a second line is not a comment. ` +
          `Nothing was rendered.`,
      );
    }
    lines.push(`# ${assertOneLine('the instance description', layout.description)}`);
  }

  lines.push(
    `#`,
    `# Every value below is DERIVED from the declaration at`,
    `#   ${assertOneLine('the manifest path', layout.manifestPath)}`,
    `# and installed by the provisioner; the generated unit (${layout.unitName})`,
    `# is what puts it into the daemon's environment. A hand edit here is DRIFT: the stamp on`,
    `# the first line is a hash of everything below it, so the next 'provision check' reports`,
    `# this file as edited. Change the declaration and re-run the provisioner instead — an`,
    `# edit made here is lost, and until it is lost it is a museum running a configuration`,
    `# nothing on disk describes.`,
    `#`,
    `# NO SECRET APPEARS IN THIS FILE. That is not a habit, it is what makes the file safe to`,
    `# be readable by the service user's group at all — and its whole contents reach every`,
    `# agent child this daemon spawns.`,
  );

  lines.push(...credentialBlock(layout));

  lines.push(
    `#`,
    `# A limit that is absent below is absent ON PURPOSE: it means 'the daemon's own default'.`,
    `# Writing today's default here would freeze it on this host, so that the day the daemon`,
    `# changed the number, nothing would move. State a limit in instance.json to override it.`,
    ``,
  );

  // ONE ASSIGNMENT PER KEY OF layout.envVars, sorted. Nothing added, nothing dropped.
  for (const key of Object.keys(layout.envVars).sort()) {
    if (key in layout.secrets) {
      throw new Error(
        `render(env): '${key}' is both an environment value and a declared credential for ` +
          `instance '${layout.instance}'. One name cannot be both: the process would receive a ` +
          `value here AND a credential file, and which one it read would decide whether the ` +
          `credential was ever used. Rename one of the two. Nothing was rendered.`,
      );
    }
    lines.push(assignment(key, layout.envVars[key] as string));
  }

  return `${lines.join('\n')}\n`;
}

/**
 * WHICH KEYS ARRIVE BY CREDENTIAL, AND FROM WHERE — as comments, so that an operator who
 * opens this file looking for the API key finds the answer to the question they actually
 * have ("where is it, then?") instead of concluding the provisioner forgot it and pasting
 * one in. A file that is silent about what it deliberately omits gets that omission
 * repaired by hand.
 *
 * Sorted, like the assignments, and for the same reason: the map comes out of the
 * declaration in declaration order.
 */
function credentialBlock(layout: InstanceLayout): string[] {
  const keys = Object.keys(layout.secrets).sort();
  if (keys.length === 0) {
    return [
      `#`,
      `# No provider credential is declared for this instance. One is added by naming it under`,
      `# 'secrets' in the declaration, as KEY -> the absolute path of a root-owned 0600 file;`,
      `# the provisioner then renders the unit's LoadCredential= line and the daemon reads the`,
      `# value at $CREDENTIALS_DIRECTORY/<KEY>. Never by pasting a value into this file.`,
    ];
  }

  const block = [
    `#`,
    `# The credentials this instance uses arrive through systemd LoadCredential=, out of`,
    `# root-owned 0600 files the service user cannot open, and are read by the daemon at`,
    `# $CREDENTIALS_DIRECTORY/<KEY>:`,
    `#`,
  ];
  for (const key of keys) {
    // The key is a filename and a LoadCredential id as well as a name in this comment, so it
    // is held to the grammar that governs all three; the path is re-checked for the same
    // reason the description is (the adopt path validated nothing).
    if (!SECRET_KEY_PATTERN.test(key)) {
      throw new Error(
        `render(env): the credential key '${key}' does not match ${SECRET_KEY_PATTERN.source}. ` +
          `Nothing was rendered.`,
      );
    }
    const path = assertOneLine(`the path of credential '${key}'`, layout.secrets[key] as string);
    block.push(`#   ${key}  <-  ${path}`);
  }
  return block;
}
