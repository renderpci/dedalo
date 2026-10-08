/**
 * EDITS TO AN OPERATOR'S VHOST FILE (spec S4, §5.10) — pure text in, text out. init's act computes
 * the new bytes here, then writes them through init/web_txn.ts (TOCTOU re-read, backup, configtest,
 * reload, rollback). compare emits only `{path, beforeSha, edit}` (§4.2): it never depends on these
 * bytes.
 *
 * THE REFERENCE (two lines, inserted right after the vhost's opener — Apache `<VirtualHost …>`,
 * nginx `server {`):
 *
 *     # dedalo-provision: <instance> vhost_reference — managed by `provision init`; delete both lines to detach
 *     IncludeOptional <configBase>/<instance>/web.apache.conf          (nginx: include …/web.nginx.con[f];)
 *
 * The include is optional on both servers (nginx: a zero-match glob), so a removed instance never
 * breaks the web server. Insertion is IDEMPOTENT (the marker line for this instance already inside
 * that vhost = the text unchanged) and keeps the file's line ending (CRLF stays CRLF).
 *
 * WHICH VHOST: `atLine` (1-based) names the opener; without it the file must hold exactly one
 * opener — several are refused (a port-80 redirect and the TLS site in one file must not both get
 * the APIs), never guessed.
 *
 * PURE, ZERO-DEPENDENCY: ../layout only.
 */
import { ABSOLUTE_PATH_PATTERN, INSTANCE_PATTERN } from '../layout';

/** The marker comment (without the leading `# `) that names an instance's reference. */
export function REFERENCE_MARKER(instance: string): string {
  if (!INSTANCE_PATTERN.test(instance)) throw new Error(`web_edit: instance '${instance}' must match ${INSTANCE_PATTERN.source}`);
  return `dedalo-provision: ${instance} vhost_reference`;
}

const REFERENCE_TAIL = " — managed by `provision init`; delete both lines to detach";

const APACHE_OPENER = /^(\s*)<VirtualHost\b[^>]*>\s*$/i;
const APACHE_CLOSER = /^\s*<\/VirtualHost>\s*$/i;
const NGINX_OPENER = /^(\s*)server\s*\{\s*(#.*)?$/;

/** The text's line ending (the first one found; `\n` for a one-line file). */
function eolOf(text: string): string {
  const cut = text.indexOf('\n');
  return cut > 0 && text[cut - 1] === '\r' ? '\r\n' : '\n';
}

function splitLines(text: string, eol: string): string[] {
  return text.split(eol);
}

function checkedInclude(includePath: string): string {
  if (!ABSOLUTE_PATH_PATTERN.test(includePath) || includePath.split('/').includes('..') || includePath.endsWith('/')) {
    throw new Error(`web_edit: the include path '${includePath}' is not a clean absolute file path`);
  }
  return includePath;
}

/** The 0-based index of the opener to edit: `atLine`'s, or the file's only one. */
function openerIndex(lines: readonly string[], opener: RegExp, what: string, atLine: number | undefined): number {
  if (atLine !== undefined) {
    const index = atLine - 1;
    if (!Number.isInteger(atLine) || index < 0 || index >= lines.length || !opener.test(lines[index] ?? '')) {
      throw new Error(`web_edit: line ${atLine} is not a ${what} opener`);
    }
    return index;
  }
  const found = lines.flatMap((line, index) => (opener.test(line) ? [index] : []));
  if (found.length !== 1) {
    throw new Error(`web_edit: the file holds ${found.length} ${what} openers — name the one to edit (atLine)`);
  }
  return found[0] as number;
}

/** The last line index of the block that `start` opens (Apache: its </VirtualHost>; nginx: brace depth). */
function blockEnd(lines: readonly string[], start: number, server: 'apache' | 'nginx'): number {
  if (server === 'apache') {
    for (let index = start + 1; index < lines.length; index += 1) if (APACHE_CLOSER.test(lines[index] ?? '')) return index;
    throw new Error(`web_edit: the <VirtualHost> at line ${start + 1} is never closed`);
  }
  let depth = 0;
  for (let index = start; index < lines.length; index += 1) {
    const code = (lines[index] ?? '').replace(/#.*$/, '').replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, '');
    for (const char of code) {
      if (char === '{') depth += 1;
      else if (char === '}') {
        depth -= 1;
        if (depth === 0) return index;
      }
    }
  }
  throw new Error(`web_edit: the server block at line ${start + 1} is never closed`);
}

function insertReference(
  text: string,
  instance: string,
  includeLine: string,
  server: 'apache' | 'nginx',
  atLine: number | undefined,
): string {
  const marker = REFERENCE_MARKER(instance);
  const eol = eolOf(text);
  const lines = splitLines(text, eol);
  const opener = server === 'apache' ? APACHE_OPENER : NGINX_OPENER;
  const start = openerIndex(lines, opener, server === 'apache' ? '<VirtualHost>' : 'server {', atLine);
  const end = blockEnd(lines, start, server);
  const markerLine = new RegExp(`^\\s*#\\s*${marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s|$)`);
  if (lines.slice(start + 1, end).some(line => markerLine.test(line))) return text;
  const indent = `${(opener.exec(lines[start] ?? '')?.[1] ?? '')}    `;
  const inserted = [`${indent}# ${marker}${REFERENCE_TAIL}`, `${indent}${includeLine}`];
  return [...lines.slice(0, start + 1), ...inserted, ...lines.slice(start + 1)].join(eol);
}

/** Inserts `IncludeOptional <includePath>` (with its marker) right after the vhost's `<VirtualHost …>`. */
export function insertApacheReference(text: string, instance: string, includePath: string, atLine?: number): string {
  return insertReference(text, instance, `IncludeOptional ${checkedInclude(includePath)}`, 'apache', atLine);
}

/** Inserts `include <includePath as a zero-match glob>;` (with its marker) right after `server {`. */
export function insertNginxReference(text: string, instance: string, includePath: string, atLine?: number): string {
  const path = checkedInclude(includePath);
  return insertReference(text, instance, `include ${path.slice(0, -1)}[${path.slice(-1)}];`, 'nginx', atLine);
}

/**
 * Removes the given 1-based lines (the guide's hand-written Dédalo lines that compare listed),
 * keeping every other byte and the line ending. A line out of range or listed twice throws.
 */
export function removeManualLines(text: string, lines: readonly number[]): string {
  const eol = eolOf(text);
  const all = splitLines(text, eol);
  const drop = new Set<number>();
  for (const line of lines) {
    if (!Number.isInteger(line) || line < 1 || line > all.length) throw new Error(`web_edit: line ${line} is not a line of the file`);
    if (drop.has(line)) throw new Error(`web_edit: line ${line} is listed twice`);
    drop.add(line);
  }
  if (drop.size === 0) throw new Error('web_edit: no line to remove');
  return all.filter((_, index) => !drop.has(index + 1)).join(eol);
}
