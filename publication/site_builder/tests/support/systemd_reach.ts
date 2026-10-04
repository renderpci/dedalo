/**
 * A MODEL OF WHAT A TRANSIENT UNIT CAN REACH, from the unit properties systemd was handed.
 *
 * Test-only, and deliberately a model of systemd rather than of this daemon: the gates feed
 * it the properties the REAL renderer produced (`confineTurn()` / `runConfined()` argv, or
 * the network leaf's own list) and ask "can a process in that unit open this destination?".
 * A gate that compared property STRINGS would pass the day someone rewrote a correct list
 * into an equivalent-looking wrong one; this one answers the question the finding asked.
 *
 * THE RULES IT ENCODES — each one is systemd's documented behaviour, and each one is the
 * reason a past version of the confinement was wrong:
 *
 *   - IP FILTERING IS ALLOW-WINS, not longest-prefix. systemd.resource-control(5): "access
 *     is granted if the address matches an IPAddressAllow= entry, otherwise denied if it
 *     matches an IPAddressDeny= entry, otherwise granted". So `IPAddressAllow=any` grants
 *     EVERY address and the deny list after it is dead text — the defect LEAD-1 found.
 *   - A PRIVATE NETWORK NAMESPACE (`PrivateNetwork=yes`, when the host honours it) holds
 *     only its own `lo`: no host address, no host loopback, no DNS stub, no LAN, and no
 *     ABSTRACT AF_UNIX socket (that namespace is per netns). `netnsHonoured:false` models a
 *     host that silently ignores the directive (a container without CAP_SYS_ADMIN) — then
 *     the BPF filter is all there is.
 *   - A PATH AF_UNIX SOCKET IGNORES NETWORK NAMESPACES. Only mount visibility decides it:
 *     `TemporaryFileSystem=`, `PrivateTmp=`, `ProtectHome=` and `InaccessiblePaths=` mask;
 *     `BindPaths=src:dst` re-exposes `src` at `dst`, over any mask.
 *   - A `ReadWritePaths=`/`ReadOnlyPaths=` entry NESTED inside an inaccessible path re-exposes
 *     that subtree (systemd.exec(5): "Nest ReadWritePaths= inside of InaccessiblePaths= in
 *     order to provide writable subdirectories within otherwise inaccessible directories").
 *     `ProtectHome=yes` IS `InaccessiblePaths=/home /root /run/user`, so a unit whose
 *     workspace or HOME lies under `/home` sees THAT directory — and only it — inside the mask.
 *     A tmpfs mask (`TemporaryFileSystem=`, `PrivateTmp=`, `ProtectHome=tmpfs`) is not lifted:
 *     what was under it is not there to re-expose.
 *   - `PrivateDevices=yes` builds a PRIVATE /dev (a tmpfs with only the API pseudo-devices),
 *     but binds the HOST's `/dev/shm`, `/dev/mqueue` and `/dev/hugepages` back into it
 *     (systemd namespace.c, mount_private_dev). So the host's `/dev/shm` — tmpfs, mode 1777,
 *     shared by every unit and the host — stays visible unless a deeper mask
 *     (`TemporaryFileSystem=/dev/shm`) covers it.
 *   - `RestrictAddressFamilies=` gates socket(2) itself — including AF_NETLINK, which
 *     interface enumeration needs (`canEnumerateInterfaces`). Repeated assignments MERGE
 *     (systemd load-fragment.c, config_parse_address_families): the first non-empty one sets
 *     the polarity (a list = allow-list, `~list` = deny-list), a later one of the SAME polarity
 *     adds to it and one of the OPPOSITE polarity removes from it; an empty assignment resets,
 *     and `none` is an empty allow-list. Reading only the last assignment would call a unit
 *     with an extra `RestrictAddressFamilies=AF_INET` in front of `AF_UNIX` inet-free.
 *   - WITHOUT A PID NAMESPACE, A CONCURRENT UNIT OF THE SAME UID IS AN OPEN DOOR TO ITS MOUNT
 *     VIEW. `/proc/<pid>/root` is that process's root directory, and following it needs only
 *     ptrace READ access (proc(5)), which a same-uid caller has: `ProtectProc=invisible`
 *     hides only the processes the caller could not ptrace-read (other uids), and Yama
 *     restricts ATTACH, not read. So a path visible inside ANY concurrent same-uid unit — its
 *     bound egress directory above all — is reachable from a unit that lacks
 *     `PrivatePIDs=yes`; with it, the unit's own /proc shows only its own processes and there
 *     is no pid to follow (`ReachOptions.concurrent`). Abstract sockets and a unit's own
 *     loopback are NOT reached this way: joining another network namespace (setns) needs
 *     CAP_SYS_ADMIN.
 *   - SYSV IPC AND POSIX MESSAGE QUEUES ARE KEYED PER IPC NAMESPACE, not by path
 *     (`kind:'ipc'`): a unit without `PrivateIPC=yes` shares the host's, where every other
 *     unit without it — any museum's — and the host itself live.
 *
 * A destination is always stated from the HOST's side (the host path of a socket, the host
 * address of a listener), because that is what must not be reachable; the model finds any
 * unit-side route to it. `scope:'unit'` names the unit's OWN loopback (the egress shim's
 * listeners), which exists only inside the unit's namespace.
 */

export type Destination =
  | { readonly kind: 'inet'; readonly ip: string; readonly port: number; readonly scope?: 'host' | 'unit' }
  | { readonly kind: 'unix'; readonly path: string }
  | { readonly kind: 'abstract'; readonly name: string }
  /** A SysV IPC key or a POSIX message queue held in the HOST's IPC namespace. */
  | { readonly kind: 'ipc'; readonly name: string };

export interface ReachOptions {
  /** Does the host honour PrivateNetwork=? (false = the directive silently had no effect). */
  readonly netnsHonoured: boolean;
  /**
   * The unit properties of every OTHER unit running at the same time under the SAME uid
   * (a museum's concurrent turn, build or git run). Absent = the unit runs alone — which a
   * gate about isolation between runs must never assume.
   */
  readonly concurrent?: readonly (readonly string[])[];
}

/** `--property=K=V` / `K=V` entries → a multimap (a key may repeat: BindPaths, …). */
export function parseProperties(props: readonly string[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const raw of props) {
    const entry = raw.startsWith('--property=') ? raw.slice('--property='.length) : raw;
    const eq = entry.indexOf('=');
    if (eq <= 0) continue;
    const key = entry.slice(0, eq);
    const list = out.get(key) ?? [];
    list.push(entry.slice(eq + 1));
    out.set(key, list);
  }
  return out;
}

/** Only the `--property=` entries of a systemd-run argv (what the unit actually received). */
export function unitPropertiesOf(argv: readonly string[]): string[] {
  const separator = argv.indexOf('--');
  const head = separator === -1 ? argv : argv.slice(0, separator);
  return head.filter(entry => entry.startsWith('--property=')).map(entry => entry.slice('--property='.length));
}

function yes(value: string | undefined): boolean {
  return value !== undefined && /^(yes|true|1|on)$/i.test(value.trim());
}

function last(map: Map<string, string[]>, key: string): string | undefined {
  const list = map.get(key);
  return list?.[list.length - 1];
}

/* ── addresses ─────────────────────────────────────────────────────────────────────── */

function v4Bytes(ip: string): number[] | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  const bytes = parts.map(Number);
  return bytes.every(b => Number.isInteger(b) && b >= 0 && b <= 255) ? bytes : null;
}

function v6Bytes(ip: string): number[] | null {
  let text = ip.replace(/^\[|\]$/g, '').split('%')[0] ?? '';
  const tailV4 = /(\d+\.\d+\.\d+\.\d+)$/.exec(text);
  let tail: number[] = [];
  if (tailV4) {
    const b = v4Bytes(tailV4[1] as string);
    if (!b) return null;
    tail = b;
    text = text.slice(0, -(tailV4[1] as string).length) + '0:0';
  }
  const halves = text.split('::');
  if (halves.length > 2) return null;
  const words = (s: string) => (s === '' ? [] : s.split(':'));
  const head = words(halves[0] ?? '');
  const rest = halves.length === 2 ? words(halves[1] ?? '') : [];
  const fill = 8 - head.length - rest.length;
  if (halves.length === 1 ? head.length !== 8 : fill < 0) return null;
  const all = [...head, ...Array(halves.length === 2 ? fill : 0).fill('0'), ...rest];
  const bytes: number[] = [];
  for (const w of all) {
    if (!/^[0-9a-f]{1,4}$/i.test(w)) return null;
    const n = parseInt(w, 16);
    bytes.push(n >> 8, n & 0xff);
  }
  if (tailV4) bytes.splice(12, 4, ...tail);
  return bytes.length === 16 ? bytes : null;
}

function bytesOf(ip: string): { family: 4 | 6; bytes: number[] } | null {
  const b4 = v4Bytes(ip);
  if (b4) return { family: 4, bytes: b4 };
  const b6 = v6Bytes(ip);
  return b6 ? { family: 6, bytes: b6 } : null;
}

function inPrefix(addr: number[], net: number[], bits: number): boolean {
  for (let i = 0; i < bits; i++) {
    const byte = i >> 3;
    const mask = 0x80 >> (i & 7);
    if (((addr[byte] ?? 0) & mask) !== ((net[byte] ?? 0) & mask)) return false;
  }
  return true;
}

/** systemd's symbolic tokens (systemd.resource-control(5)). */
const SYMBOLIC: Readonly<Record<string, readonly string[]>> = {
  any: ['0.0.0.0/0', '::/0'],
  localhost: ['127.0.0.0/8', '::1/128'],
  'link-local': ['169.254.0.0/16', 'fe80::/64'],
  multicast: ['224.0.0.0/4', 'ff00::/8'],
};

/** Does one IPAddressAllow=/Deny= token cover this address? */
function tokenMatches(token: string, ip: string): boolean {
  const expanded = SYMBOLIC[token];
  if (expanded) return expanded.some(t => tokenMatches(t, ip));
  const [net, bitsText] = token.split('/');
  const target = bytesOf(ip);
  const network = bytesOf(net ?? '');
  if (!target || !network || target.family !== network.family) return false;
  const bits = bitsText === undefined ? (network.family === 4 ? 32 : 128) : Number(bitsText);
  return inPrefix(target.bytes, network.bytes, bits);
}

function tokens(map: Map<string, string[]>, key: string): string[] {
  // Assignments accumulate; an EMPTY assignment resets the list (systemd semantics).
  let list: string[] = [];
  for (const value of map.get(key) ?? []) {
    if (value.trim() === '') list = [];
    else list.push(...value.split(/\s+/).filter(Boolean));
  }
  return list;
}

/** The BPF verdict, ALLOW-WINS. */
function ipFilterGrants(map: Map<string, string[]>, ip: string): boolean {
  if (tokens(map, 'IPAddressAllow').some(t => tokenMatches(t, ip))) return true;
  if (tokens(map, 'IPAddressDeny').some(t => tokenMatches(t, ip))) return false;
  return true;
}

/** The socket families a unit may be allowed or denied — the ones the confinement decides. */
export type SocketFamily = 'AF_UNIX' | 'AF_INET' | 'AF_INET6' | 'AF_NETLINK';

function familyAllowed(map: Map<string, string[]>, family: SocketFamily): boolean {
  // systemd's merge, assignment by assignment (see the header): null = no restriction.
  let state: { allowList: boolean; families: Set<string> } | null = null;
  for (const raw of map.get('RestrictAddressFamilies') ?? []) {
    const value = raw.trim();
    if (value === '') {
      state = null;
      continue;
    }
    if (value === 'none') {
      state = { allowList: true, families: new Set() };
      continue;
    }
    const invert = value.startsWith('~');
    const names = (invert ? value.slice(1) : value).split(/\s+/).filter(Boolean);
    state ??= { allowList: !invert, families: new Set() };
    for (const name of names) {
      if (!invert === state.allowList) state.families.add(name);
      else state.families.delete(name);
    }
  }
  if (state === null) return true;
  return state.allowList ? state.families.has(family) : !state.families.has(family);
}

/* ── paths ─────────────────────────────────────────────────────────────────────────── */

function normalize(path: string): string {
  // /var/run is a symlink to /run on every systemd host.
  return path.replace(/^\/var\/run(?=\/|$)/, '/run').replace(/\/+$/, '') || '/';
}

function under(path: string, prefix: string): boolean {
  const p = normalize(path);
  const q = normalize(prefix);
  return p === q || p.startsWith(q === '/' ? '/' : `${q}/`);
}

/** A host prefix the unit's mount namespace hides; `liftable` = a nested RW/RO path re-exposes. */
interface Mask {
  readonly prefix: string;
  readonly liftable: boolean;
  /** Host subtrees the mask re-exposes itself (PrivateDevices='s bound-back host dirs). */
  readonly holes?: readonly string[];
}

/** What `PrivateDevices=yes` binds from the HOST into its private /dev. */
const PRIVATE_DEV_HOST_BINDS = Object.freeze(['/dev/shm', '/dev/mqueue', '/dev/hugepages']);

/** Every host prefix the unit's mount namespace hides. */
function masks(map: Map<string, string[]>): Mask[] {
  const out: Mask[] = [];
  for (const value of map.get('TemporaryFileSystem') ?? []) {
    for (const entry of value.split(/\s+/).filter(Boolean)) out.push({ prefix: entry.split(':')[0] as string, liftable: false });
  }
  if (yes(last(map, 'PrivateTmp'))) out.push({ prefix: '/tmp', liftable: false }, { prefix: '/var/tmp', liftable: false });
  const home = last(map, 'ProtectHome');
  if (home !== undefined && (yes(home) || home === 'tmpfs')) {
    for (const prefix of ['/home', '/root', '/run/user']) out.push({ prefix, liftable: home !== 'tmpfs' });
  }
  if (yes(last(map, 'PrivateDevices'))) out.push({ prefix: '/dev', liftable: false, holes: PRIVATE_DEV_HOST_BINDS });
  for (const value of map.get('InaccessiblePaths') ?? []) {
    for (const entry of value.split(/\s+/).filter(Boolean)) out.push({ prefix: entry.replace(/^[-+]/, ''), liftable: true });
  }
  return out;
}

/** `ReadWritePaths=` / `ReadOnlyPaths=` entries — the paths that can lift an inaccessible mask. */
function listedPaths(map: Map<string, string[]>): string[] {
  const out: string[] = [];
  for (const key of ['ReadWritePaths', 'ReadOnlyPaths']) {
    for (const value of map.get(key) ?? []) {
      for (const entry of value.split(/\s+/).filter(Boolean)) out.push(entry.replace(/^[-+]/, ''));
    }
  }
  return out;
}

/** `BindPaths=src:dst …` → [src, dst] pairs. */
function binds(map: Map<string, string[]>): Array<[string, string]> {
  const pairs: Array<[string, string]> = [];
  for (const key of ['BindPaths', 'BindReadOnlyPaths']) {
    for (const value of map.get(key) ?? []) {
      for (const entry of value.split(/\s+/).filter(Boolean)) {
        const [src, dst] = entry.replace(/^-/, '').split(':');
        if (src) pairs.push([src, dst || src]);
      }
    }
  }
  return pairs;
}

/** Is there ANY unit-side path that resolves to this host path? */
function hostPathVisible(map: Map<string, string[]>, hostPath: string): boolean {
  if (binds(map).some(([src]) => under(hostPath, src))) return true;
  const listed = listedPaths(map);
  return !masks(map).some(mask => {
    if (!under(hostPath, mask.prefix)) return false;
    if (mask.holes?.some(hole => under(hostPath, hole))) return false;
    // Lifted only by a listed path STRICTLY inside the mask that also holds this path.
    const lifted =
      mask.liftable &&
      listed.some(path => under(path, mask.prefix) && normalize(path) !== normalize(mask.prefix) && under(hostPath, path));
    return !lifted;
  });
}

/* ── the verdict ───────────────────────────────────────────────────────────────────── */

/** Can a process inside the unit described by `props` open `dest`? */
export function reach(props: readonly string[], dest: Destination, opts: ReachOptions): boolean {
  const map = parseProperties(props);
  const isolated = yes(last(map, 'PrivateNetwork')) && opts.netnsHonoured;

  if (dest.kind === 'unix') {
    if (!familyAllowed(map, 'AF_UNIX')) return false;
    if (hostPathVisible(map, dest.path)) return true;
    // Through /proc/<pid>/root of a concurrent same-uid unit — unless this unit has its own
    // PID namespace, where no other unit's pid exists to follow.
    if (yes(last(map, 'PrivatePIDs'))) return false;
    return (opts.concurrent ?? []).some(other => hostPathVisible(parseProperties(other), dest.path));
  }
  if (dest.kind === 'ipc') {
    // Keyed per IPC namespace; no path, no mount and no netns reaches another one.
    return !yes(last(map, 'PrivateIPC'));
  }
  if (dest.kind === 'abstract') {
    // The abstract namespace belongs to the NETWORK namespace.
    return familyAllowed(map, 'AF_UNIX') && !isolated;
  }
  const parsed = bytesOf(dest.ip);
  if (!parsed) throw new Error(`systemd_reach: not an address: ${dest.ip}`);
  if (!familyAllowed(map, parsed.family === 4 ? 'AF_INET' : 'AF_INET6')) return false;
  if (dest.scope === 'unit') {
    // The unit's own loopback — only meaningful inside its own namespace.
    if (!isolated) return false;
    if (!tokenMatches('localhost', dest.ip)) return false;
    return ipFilterGrants(map, dest.ip);
  }
  if (isolated) return false; // a host address does not exist inside the unit's netns
  return ipFilterGrants(map, dest.ip);
}

/** May a process in the unit described by `props` create a socket of `family` at all? */
export function allowsFamily(props: readonly string[], family: SocketFamily): boolean {
  return familyAllowed(parseProperties(props), family);
}

/**
 * Can a process in the unit enumerate its own network interfaces? `getifaddrs(3)` (node's
 * `os.networkInterfaces()`) is an AF_NETLINK query: a unit denied that family sees NO
 * interface — and the egress shim refuses "none at all" (exit 78), so every run of such a
 * unit is a total outage.
 */
export function canEnumerateInterfaces(props: readonly string[]): boolean {
  return allowsFamily(props, 'AF_NETLINK');
}

/** Human-readable label for a destination, for assertion messages. */
export function describeDestination(dest: Destination): string {
  if (dest.kind === 'unix') return `unix:${dest.path}`;
  if (dest.kind === 'abstract') return `abstract:@${dest.name}`;
  if (dest.kind === 'ipc') return `ipc:${dest.name}`;
  const host = dest.ip.includes(':') ? `[${dest.ip}]` : dest.ip;
  return `${dest.scope === 'unit' ? 'unit-lo ' : ''}${host}:${dest.port}`;
}

/**
 * Is `hostPath` visible — as ITSELF, at any unit-side path — inside the mount view the unit
 * properties describe? Mount visibility only (masks, nested lifts, BindPaths); no family, no
 * DAC and no /proc route. Exported for the uid-aware model (`unit_file_reach.ts`, LEAD-1b G6),
 * which adds the principal half on top of this one.
 */
export function mountVisible(props: readonly string[], hostPath: string): boolean {
  return hostPathVisible(parseProperties(props), hostPath);
}

/**
 * Is `hostPath` visible AND WRITABLE in that mount view? Under `ProtectSystem=strict` the tree
 * is read-only except a `ReadWritePaths=` entry or a writable `BindPaths=` source; a
 * `BindReadOnlyPaths=` source is read-only however it is reached. The most specific of the
 * two decides (a writable bind nested in a read-only one is writable, and the reverse).
 */
export function mountWritable(props: readonly string[], hostPath: string): boolean {
  const map = parseProperties(props);
  if (!hostPathVisible(map, hostPath)) return false;
  const sources = (key: string) =>
    (map.get(key) ?? []).flatMap(value => value.split(/\s+/).filter(Boolean)).map(entry => entry.replace(/^[-+]/, '').split(':')[0] as string);
  const depth = (paths: readonly string[]) =>
    Math.max(-1, ...paths.filter(path => under(hostPath, path)).map(path => normalize(path).split('/').filter(Boolean).length));
  return depth([...sources('BindPaths'), ...sources('ReadWritePaths')]) > depth(sources('BindReadOnlyPaths'));
}
