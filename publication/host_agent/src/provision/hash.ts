/**
 * THE STAMP — the first line of every generated artifact, and the only thing on the host
 * that tells OUR bytes from an operator's edit:
 *
 *     # dedalo-provision: <instance> <kind> <sha256-of-body>
 *
 * Copied from publication/site_builder/src/provision/hash.ts (same token, same line
 * grammar, same semantics); only the INSTANCE_PATTERN it checks is this package's
 * (`./layout`). `hasDrifted(file)` TRUE = a hand edit (the body no longer matches its own
 * stamp); rendered !== on-disk with a valid stamp = OUR renderer moved, safe to rewrite.
 *
 * ZERO-DEPENDENCY: root-repo tests import this module.
 */
import { createHash } from 'node:crypto';
import { INSTANCE_PATTERN } from './layout';

export const STAMP_TOKEN = 'dedalo-provision:';
export const STAMP_KIND_PATTERN = /^[a-z][a-z0-9_]*$/;
const COMMENT_PREFIX_PATTERN = /^\S{1,4}$/;
const HASH_PATTERN = /^[0-9a-f]{64}$/;
const STAMP_LINE_PATTERN = new RegExp(
  `^(\\S{1,4})[ \\t]+${STAMP_TOKEN}[ \\t]+(\\S+)[ \\t]+(\\S+)[ \\t]+([0-9a-f]{64})[ \\t]*$`,
);

export function bodyHash(body: string): string {
  return createHash('sha256').update(body, 'utf8').digest('hex');
}

export interface ParsedStamp {
  readonly kind: string;
  readonly instance: string;
  readonly hash: string;
  readonly body: string;
}

export function stamp(kind: string, instance: string, body: string, commentPrefix = '#'): string {
  if (!STAMP_KIND_PATTERN.test(kind)) {
    throw new Error(`hash: artifact kind '${kind}' must match ${STAMP_KIND_PATTERN.source}`);
  }
  if (!INSTANCE_PATTERN.test(instance)) {
    throw new Error(`hash: instance '${instance}' must match ${INSTANCE_PATTERN.source}`);
  }
  if (!COMMENT_PREFIX_PATTERN.test(commentPrefix)) {
    throw new Error(`hash: comment prefix '${commentPrefix}' must be 1-4 non-space characters`);
  }
  return `${commentPrefix} ${STAMP_TOKEN} ${instance} ${kind} ${bodyHash(body)}\n${body}`;
}

/** null for anything that is not one of our stamped files — never a throw. */
export function parseStamp(text: string): ParsedStamp | null {
  if (typeof text !== 'string' || text.length === 0) return null;
  const cut = text.indexOf('\n');
  const firstLine = cut === -1 ? text : text.slice(0, cut);
  const body = cut === -1 ? '' : text.slice(cut + 1);
  const match = STAMP_LINE_PATTERN.exec(firstLine.replace(/\r$/, ''));
  if (!match) return null;
  const [, , instance = '', kind = '', hash = ''] = match;
  if (!INSTANCE_PATTERN.test(instance)) return null;
  if (!STAMP_KIND_PATTERN.test(kind)) return null;
  if (!HASH_PATTERN.test(hash)) return null;
  return Object.freeze({ kind, instance, hash, body });
}

/** TRUE when the file is not ours or its body no longer matches its own stamp. */
export function hasDrifted(text: string): boolean {
  const parsed = parseStamp(text);
  if (!parsed) return true;
  return bodyHash(parsed.body) !== parsed.hash;
}
