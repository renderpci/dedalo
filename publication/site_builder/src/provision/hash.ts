/**
 * THE STAMP — the first line of every generated artifact, and the only thing on the host
 * that can tell OUR bytes from an operator's edit.
 *
 * The provisioner is idempotent and WRITES ONLY ON DRIFT: it renders what the declaration
 * says the host should hold, compares, and touches nothing when the two agree. That
 * discipline needs an answer to a question a plain file comparison cannot give — "is this
 * file different because WE changed the renderer, or because SOMEBODY EDITED IT?" Those two
 * differences look identical byte for byte and must not be treated identically: the first
 * is a fix to install, the second is a museum's hand-tuned vhost about to be silently
 * overwritten, on a live public site, by a tool that was only meant to be idempotent.
 *
 * So each artifact carries, on its own first line, the hash of everything below it:
 *
 *     # dedalo-provision: <instance> <kind> <sha256-of-body>
 *
 * and the two questions separate cleanly:
 *
 *   - `hasDrifted(fileOnDisk)` — the file's own stamp against the file's own body. TRUE
 *     means a HAND EDIT (or a corruption): nobody but this module writes that line, so a
 *     body that no longer matches it was changed by something that did not restamp.
 *   - rendered text !== file text — the RENDERER moved (a new field in the declaration, a
 *     better unit). That is our own change and is safe to write.
 *
 * WHAT THE HASH COVERS, EXACTLY. The bytes of the body, verbatim, after the first line's
 * newline. Nothing else:
 *
 *   - NOT the stamp line. It cannot be — the line holds the hash — and that is also the
 *     useful behaviour: renaming a kind or moving an instance changes the stamp and leaves
 *     `hasDrifted` false, because the artifact's CONTENT did not change.
 *   - NOT semantics. This is a byte hash, so two configurations that mean the same thing in
 *     a different order hash differently. Making equivalent inputs produce IDENTICAL BYTES
 *     is the renderers' job, not this file's, and it is a real obligation on them: a
 *     renderer that walks a JSON object's keys in declaration order, or lists sites
 *     unsorted, will report drift every time an operator reorders instance.json without
 *     changing a thing. `readWritePaths()` in layout.ts already sorts and de-duplicates for
 *     exactly this reason — every renderer owes its output the same stability.
 *   - NOT ownership or mode. A `chmod 0644` on a 0600 credential is invisible here; the
 *     provisioner's check compares the stat against MODES separately, and must, because a
 *     mode is not in the bytes.
 *
 * ZERO-DEP BY LAW, like layout.ts: `node:` builtins plus package-local siblings that are
 * themselves dependency-free. A repo-side tripwire renders every artifact WITHOUT this
 * package's node_modules, so a `zod` import here would break the very gate that keeps the
 * committed artifacts honest. `./layout` qualifies and is imported on purpose — the
 * instance grammar has ONE owner, and a stamp parser with its own idea of what an instance
 * name looks like would be the second.
 *
 * Precedent: src/core/media/protection.ts in the engine — pure builders, a body hash in the
 * header, write only on drift.
 */

import { createHash } from 'node:crypto';
import { INSTANCE_PATTERN } from './layout';

/**
 * The word that marks a line as ours. It is not "generated" or "dedalo" — both appear in
 * hand-written headers all over this host — but a token no human writes by accident, so
 * finding it is finding a file this provisioner owns and may overwrite.
 */
export const STAMP_TOKEN = 'dedalo-provision:';

/**
 * The KIND grammar. A kind names the renderer that produced the artifact; it lands in the
 * stamp line as a bare word, so it may not contain whitespace (the line is parsed by
 * position) and is held to the same lowercase spelling as every other identifier in this
 * subsystem.
 */
export const STAMP_KIND_PATTERN = /^[a-z][a-z0-9_]*$/;

/**
 * A comment prefix: 1-4 non-space characters. Constrained rather than trusted because the
 * caller's string becomes the first characters of a root-owned configuration file — a
 * prefix that is not a comment introducer would turn the stamp into a DIRECTIVE, and the
 * first thing nginx or systemd reads about this museum would be a syntax error at best.
 */
const COMMENT_PREFIX_PATTERN = /^\S{1,4}$/;

/** sha256, lowercase hex, 64 characters — the only shape a stamp's hash field may have. */
const HASH_PATTERN = /^[0-9a-f]{64}$/;

/**
 * The stamp line, built FROM the token above rather than beside it: a regex that restated
 * the marker would be the second place that decides what one of our files looks like, and
 * the two would disagree the day the marker changed. (The token is regex-inert — word
 * characters, a hyphen and a colon — so it needs no escaping, which is checked below rather
 * than assumed.)
 */
if (/[.*+?^${}()|[\]\\]/.test(STAMP_TOKEN)) {
  throw new Error(
    `hash: STAMP_TOKEN '${STAMP_TOKEN}' contains a regex metacharacter and is interpolated ` +
      `into the stamp-line pattern unescaped. Keep the token to word characters, or escape it here.`,
  );
}
const STAMP_LINE_PATTERN = new RegExp(
  `^(\\S{1,4})[ \\t]+${STAMP_TOKEN}[ \\t]+(\\S+)[ \\t]+(\\S+)[ \\t]+([0-9a-f]{64})[ \\t]*$`,
);

/**
 * The sha256 of an artifact's BODY, lowercase hex.
 *
 * Explicitly utf8: the renderers produce JavaScript strings and the provisioner writes them
 * as utf8, so the hash must be taken over the same encoding the file will hold, or a body
 * with one accented character in a museum's description would "drift" the instant it was
 * read back.
 */
export function bodyHash(body: string): string {
  return createHash('sha256').update(body, 'utf8').digest('hex');
}

/** What a stamped artifact says about itself. */
export interface ParsedStamp {
  /** The renderer that produced it — see STAMP_KIND_PATTERN. */
  readonly kind: string;
  /** The instance it belongs to, against layout's INSTANCE_PATTERN. */
  readonly instance: string;
  /** The body hash the stamp CLAIMS. Compare with `bodyHash(body)`; see `hasDrifted`. */
  readonly hash: string;
  /** Everything below the stamp line, verbatim. */
  readonly body: string;
}

/**
 * Stamp a body and hand back THE WHOLE ARTIFACT — the line, then the body, unmodified.
 *
 * The comment prefix is a PARAMETER and not a constant here because this module does not
 * know what it is stamping. Today's five artifacts all comment with '#' (systemd, nginx,
 * Apache and an env file agree, which is a coincidence and not a rule); the first artifact
 * that does not would otherwise be a file whose first line is a parse error. The caller
 * knows its own syntax, so the caller says it.
 *
 * The inputs are checked rather than trusted, even though the schema constrains the
 * instance and the registry constrains the kind. `derive()` is a second entry point — a
 * `provision adopt` builds a manifest from what is on disk, without any declaration having
 * been validated — and a stamp is the one line in the file nobody proofreads. A kind with a
 * space in it would silently produce an unparseable stamp, which reads as "hand-edited" to
 * every later check and makes the provisioner refuse to touch a file it wrote itself.
 */
export function stamp(kind: string, instance: string, body: string, commentPrefix = '#'): string {
  if (!STAMP_KIND_PATTERN.test(kind)) {
    throw new Error(
      `hash: artifact kind '${kind}' must match ${STAMP_KIND_PATTERN.source} — it is written ` +
        `into the stamp line as a bare word, and the line is parsed by position.`,
    );
  }
  if (!INSTANCE_PATTERN.test(instance)) {
    throw new Error(
      `hash: instance '${instance}' must match ${INSTANCE_PATTERN.source} (layout.ts owns that ` +
        `grammar) — a stamp naming an instance that cannot exist can never be matched again.`,
    );
  }
  if (!COMMENT_PREFIX_PATTERN.test(commentPrefix)) {
    throw new Error(
      `hash: comment prefix '${commentPrefix}' must be 1-4 non-space characters. It becomes the ` +
        `first bytes of a root-owned configuration file, where anything that is not a comment ` +
        `introducer is a directive.`,
    );
  }
  return `${commentPrefix} ${STAMP_TOKEN} ${instance} ${kind} ${bodyHash(body)}\n${body}`;
}

/**
 * Read a stamp back — or `null` when there is not one to read.
 *
 * NULL, NEVER A THROW. The caller is `check`/`apply` walking whatever the host actually
 * holds: a hand-written vhost from before this subsystem existed, a truncated file, an
 * empty one, a binary blob at a path the declaration now claims. None of those is
 * exceptional — they are the normal contents of a real host, and the answer the caller
 * needs is "this is not ours", which it must be able to act on (refuse to overwrite, or
 * report) rather than catch.
 *
 * The comment prefix is accepted as whatever the file uses and deliberately NOT returned:
 * a caller who needs the prefix knows the artifact's kind, and the kind knows its syntax.
 * Reading it back from disk would make an operator's `//` the syntax we rewrite the file in.
 */
export function parseStamp(text: string): ParsedStamp | null {
  if (typeof text !== 'string' || text.length === 0) return null;

  // The body is everything after the FIRST newline, verbatim — including a trailing one.
  // A file that is a stamp line and nothing else has an empty body, which is a legitimate
  // (if useless) artifact and must parse rather than fail.
  const cut = text.indexOf('\n');
  const firstLine = cut === -1 ? text : text.slice(0, cut);
  const body = cut === -1 ? '' : text.slice(cut + 1);

  // A CRLF file's first line carries a '\r' that is not part of the stamp. Tolerated on the
  // STAMP LINE only: the body stays byte-exact, so a file whose body was converted to CRLF
  // still reports drift — because it was, in fact, changed.
  const match = STAMP_LINE_PATTERN.exec(firstLine.replace(/\r$/, ''));
  if (!match) return null;

  // Positions: 1 = the comment prefix (read and discarded, see above), 2 = instance,
  // 3 = kind, 4 = hash. The pattern matched, so all four are present — spelled with a
  // default rather than asserted, because the engine's own tsconfig compiles this file
  // (test/unit/site_builder_single_source_tripwire.test.ts imports the provisioner) under
  // `noUncheckedIndexedAccess`, and a non-null assertion here would be the one place in
  // this module where a promise about a regex stood in for a value.
  const [, , instance = '', kind = '', hash = ''] = match;
  if (!INSTANCE_PATTERN.test(instance)) return null;
  if (!STAMP_KIND_PATTERN.test(kind)) return null;
  if (!HASH_PATTERN.test(hash)) return null;

  return Object.freeze({ kind, instance, hash, body });
}

/**
 * Has this file been changed since we wrote it?
 *
 * TRUE for an unstamped or unparseable text as well as for a mismatching hash, and those
 * really are one answer to this question: the stamp line is written by nothing but `stamp()`
 * above, so a file that lost it was edited by something that did not restamp — the commonest
 * hand edit there is, because the first thing an operator does to a generated file is delete
 * the header telling them not to edit it. A caller that must tell "no stamp" from "stamp
 * disagrees" — the provisioner's `check` reports them differently, and `apply` refuses an
 * unstamped file rather than overwriting a vhost this subsystem never wrote — asks
 * `parseStamp` instead.
 *
 * This compares a file against ITSELF and never against a rendered artifact. "Differs from
 * what we would write today" is a separate and much weaker fact (we changed a renderer), and
 * conflating the two is what would let a museum's hand-edited vhost be silently overwritten
 * on the next release.
 */
export function hasDrifted(text: string): boolean {
  const parsed = parseStamp(text);
  if (!parsed) return true;
  return bodyHash(parsed.body) !== parsed.hash;
}
