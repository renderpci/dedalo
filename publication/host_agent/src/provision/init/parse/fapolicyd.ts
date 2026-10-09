/**
 * DISCOVERY: fapolicyd's configuration (`/etc/fapolicyd/fapolicyd.conf`, fapolicyd.conf(5)) —
 * the three keys the guided install judges (§4.3 `host.fapolicyd`, `host.fapolicyd_integrity`,
 * `host.fapolicyd_mounts`):
 *
 *   - `trust` — the trust backends, comma-separated (`rpmdb,file` by default): without `file`
 *     the daemon never reads /etc/fapolicyd/trust.d, so the instance's trust file is inert;
 *   - `integrity` — how a trusted file is re-checked when it is opened: `none` (the default:
 *     the path alone), `size`, `ima` or `sha256`. Under `none` or `size` a file changed AFTER it
 *     was trusted (same path, same size) still runs;
 *   - `allow_filesystem_mark` — `0` (the default) marks MOUNTS, so fapolicyd never sees what a
 *     process in its own mount namespace opens: every publication-host unit (ProtectSystem=,
 *     ProtectHome=, PrivateTmp=) runs unchecked, trusted or not (measured, RHEL 9.8: an untrusted
 *     agent and a changed release both started); `1` marks the filesystems and checks them.
 *
 * `key = value` lines, `#` comments; the last assignment wins; an absent key is fapolicyd's own
 * default. PURE, ZERO-DEPENDENCY.
 */

export interface FapolicydConf {
  /** The `trust` backends, in order; fapolicyd's default when the key is absent. */
  readonly trust: readonly string[];
  /** The `integrity` mode; `none` (fapolicyd's default) when absent. */
  readonly integrity: string;
  /** `allow_filesystem_mark = 1`; false (fapolicyd's default 0) when absent or anything else. */
  readonly filesystemMark: boolean;
}

/** fapolicyd's own defaults (fapolicyd.conf(5)). */
export const FAPOLICYD_DEFAULTS: FapolicydConf = Object.freeze({ trust: Object.freeze(['rpmdb', 'file']), integrity: 'none', filesystemMark: false });

/** The integrity modes under which a file changed after it was trusted is refused. */
export const STRICT_INTEGRITY: readonly string[] = Object.freeze(['sha256', 'ima']);

export function parseFapolicydConf(text: string): FapolicydConf {
  let trust: readonly string[] = FAPOLICYD_DEFAULTS.trust;
  let integrity = FAPOLICYD_DEFAULTS.integrity;
  let filesystemMark = FAPOLICYD_DEFAULTS.filesystemMark;
  for (const raw of text.split('\n')) {
    const line = raw.replace(/#.*$/, '').trim();
    const cut = line.indexOf('=');
    if (cut <= 0) continue;
    const key = line.slice(0, cut).trim();
    const value = line.slice(cut + 1).trim();
    if (key === 'trust') {
      trust = Object.freeze(
        value
          .split(',')
          .map(part => part.trim())
          .filter(part => part !== ''),
      );
    } else if (key === 'integrity') integrity = value;
    else if (key === 'allow_filesystem_mark') filesystemMark = value === '1';
  }
  return Object.freeze({ trust, integrity, filesystemMark });
}
