/**
 * DISCOVERY: the mount table (spec §3.2 row Mounts; S6 "the home cannot be given to root",
 * `host.noexec`, `selinux.media_access`).
 *
 * /proc/self/mountinfo, proc(5): `<id> <parent> <maj:min> <root> <mount point> <mount options>
 * [optional fields…] - <fs type> <source> <super options>`. The per-mount options carry
 * `ro`/`noexec`; the super options carry `seclabel` (the filesystem supports labels — an
 * NFSv4.2 export labelled like a local one) and `context=` (one label for the whole mount,
 * e.g. `context="system_u:object_r:httpd_sys_content_t:s0"`). Paths are octal-escaped
 * (`\040` = space).
 *
 * PURE, ZERO-DEPENDENCY (tests/provision_zero_dep.test.ts): ../types only.
 */
import type { MountRow } from '../types';

/** The filesystems S6 refuses to put root-run code on, and §4.3 `selinux.media_access` calls network. */
export const NETWORK_FS_TYPES: readonly string[] = Object.freeze(['nfs', 'nfs4', 'cifs', 'smb3', 'autofs']);

/** nfs, nfs4, cifs, smb3, autofs, or any FUSE filesystem (`fuse`, `fuse.sshfs`, …). */
export function isNetworkFs(fsType: string): boolean {
  return NETWORK_FS_TYPES.includes(fsType) || fsType === 'fuse' || fsType.startsWith('fuse.');
}

function unescapeOctal(text: string): string {
  return text.replace(/\\([0-7]{3})/g, (_, code: string) => String.fromCharCode(Number.parseInt(code, 8)));
}

/** Splits an option list on commas outside double quotes (`context="a:b:c:s0:c1,c2"` stays one). */
function splitOptions(text: string): string[] {
  const out: string[] = [];
  let current = '';
  let quoted = false;
  for (const char of text) {
    if (char === '"') quoted = !quoted;
    if (char === ',' && !quoted) {
      out.push(current);
      current = '';
    } else current += char;
  }
  if (current !== '') out.push(current);
  return out;
}

/** proc(5) mountinfo → one row per mount, in the kernel's order (later rows stack over earlier ones). */
export function parseMountinfo(text: string): MountRow[] {
  const rows: MountRow[] = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (line === '') continue;
    const fields = line.split(' ');
    const separator = fields.indexOf('-', 6);
    if (separator === -1 || fields.length < separator + 4) {
      throw new Error(`parse(mounts): mountinfo line has no '-' separator or too few fields: '${line.slice(0, 160)}'`);
    }
    const mountPoint = unescapeOctal(fields[4] as string);
    const mountOptions = splitOptions(fields[5] as string);
    const fsType = fields[separator + 1] as string;
    const superOptions = splitOptions(fields[separator + 3] ?? '');
    const all = [...mountOptions, ...superOptions];
    const contextOption = all.find(option => option.startsWith('context='));
    rows.push(
      Object.freeze({
        mountPoint,
        fsType,
        readOnly: mountOptions.includes('ro'),
        noexec: mountOptions.includes('noexec'),
        seclabel: superOptions.includes('seclabel'),
        context: contextOption === undefined ? null : contextOption.slice('context='.length).replace(/^"(.*)"$/, '$1'),
      }),
    );
  }
  return rows;
}

/** `path` lies at or below `mountPoint`, segment-wise (`/home` does not contain `/homes`). */
function under(path: string, mountPoint: string): boolean {
  if (mountPoint === '/') return path.startsWith('/');
  return path === mountPoint || path.startsWith(`${mountPoint}/`);
}

/**
 * The mount a path lives on: the longest mount point containing it; at an equal mount point
 * the LAST row (a later mount stacks over an earlier one). null when no row contains it.
 */
export function mountOf(path: string, mounts: readonly MountRow[]): MountRow | null {
  let best: MountRow | null = null;
  for (const mount of mounts) {
    if (!under(path, mount.mountPoint)) continue;
    if (best === null || mount.mountPoint.length >= best.mountPoint.length) best = mount;
  }
  return best;
}

/** The filesystem type a path lives on (`fsTypeOf`, spec §2.1), or null. */
export function fsTypeOf(path: string, mounts: readonly MountRow[]): string | null {
  return mountOf(path, mounts)?.fsType ?? null;
}
