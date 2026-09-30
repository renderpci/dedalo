/**
 * IS THIS ADDRESS THE PUBLIC INTERNET? — the egress gate's one question about an answer the
 * resolver gave it (LEAD-1).
 *
 * The site builder is its own package and cannot import the engine, so this is the package's
 * copy of the engine's `isPrivateIp` (`src/core/security/ssrf_guard.ts`), and it is PINNED to
 * it rather than trusted to stay in step: `test/unit/site_builder_public_address_differential.test.ts`
 * compares the two on the edges of every block in THIS file's tables (exported below) and of a
 * hand-kept copy of the engine's, the IPv6 carriers and tunnels, and a seeded random sample. A
 * block added here is probed automatically; one added only to the engine is probed once the
 * engine exports its tables (or the hand copy learns it) — see that gate's header.
 *
 * THE SHAPE, as the engine's tables define it:
 *   - IPv4: public = outside every IANA special-purpose block below.
 *   - IPv6: an ALLOWLIST. Public = inside global unicast `2000::/3`, minus the tunnels (6to4
 *     `2002::/16` and Teredo `2001::/32`, refused WHOLE — the IPv4 inside 6to4 is the RELAY,
 *     not the destination) and minus the special-purpose blocks inside it (`2001::/23`,
 *     documentation `2001:db8::/32` and `3fff::/20`). Everything outside `2000::/3` —
 *     loopback, `::`, unique-local, link-local, site-local, multicast, IPv4-compatible `::/96`,
 *     SIIT, the local-use NAT64 `64:ff9b:1::/48` — is refused by being outside.
 *   - The two STANDARDIZED IPv4 carriers — IPv4-mapped `::ffff:0:0/96` and the well-known
 *     NAT64 `64:ff9b::/96` — are judged as the IPv4 they carry: `64:ff9b::a9fe:a9fe` is the
 *     metadata endpoint on any IPv6-only host with DNS64.
 *   - A zone id (`fe80::1%eth0`) and anything that is not an address are refused.
 *
 * What the engine adds and this copy does not: operator-DECLARED and resolver-DISCOVERED
 * NAT64 network-specific prefixes. This daemon has neither (no such key, no RFC 7050 lookup),
 * so on an IPv6-only host whose DNS64 synthesizes into one, a planned host whose A record is
 * private is answered as a global-unicast address this copy calls PUBLIC — stated as
 * SITE_BUILDER_INSTANCES §10 residual 6(g). The differential pins the two only where no such
 * prefix exists, and says so.
 *
 * Node builtins only: this runs in the daemon's egress gate, and the repo tripwire imports it.
 */

import { isIP } from 'node:net';

interface Block {
  readonly bytes: readonly number[];
  readonly bits: number;
}

function ipv4Bytes(ip: string): number[] | null {
  if (isIP(ip) !== 4) return null;
  return ip.split('.').map(Number);
}

function ipv6Bytes(ip: string): number[] | null {
  if (isIP(ip) !== 6 || ip.includes('%')) return null;
  let text = ip.toLowerCase();
  let tail: number[] = [];
  const dotted = /(\d+\.\d+\.\d+\.\d+)$/.exec(text);
  if (dotted) {
    const v4 = ipv4Bytes(dotted[1] as string);
    if (!v4) return null;
    tail = v4;
    text = `${text.slice(0, -(dotted[1] as string).length)}0:0`;
  }
  const halves = text.split('::');
  const words = (part: string) => (part === '' ? [] : part.split(':'));
  const head = words(halves[0] ?? '');
  const rest = halves.length === 2 ? words(halves[1] ?? '') : [];
  const fill = halves.length === 2 ? 8 - head.length - rest.length : 0;
  const all = [...head, ...Array<string>(fill).fill('0'), ...rest];
  if (all.length !== 8) return null;
  const bytes: number[] = [];
  for (const word of all) {
    const value = Number.parseInt(word, 16);
    bytes.push(value >> 8, value & 0xff);
  }
  if (dotted) bytes.splice(12, 4, ...tail);
  return bytes;
}

function block(cidr: string): Block {
  const [net, bits] = cidr.split('/') as [string, string];
  const bytes = net.includes(':') ? ipv6Bytes(net) : ipv4Bytes(net);
  if (!bytes) throw new Error(`public_address: constant CIDR ${cidr} does not parse`);
  return Object.freeze({ bytes: Object.freeze(bytes), bits: Number(bits) });
}

function inBlock(bytes: readonly number[], range: Block): boolean {
  if (bytes.length !== range.bytes.length) return false;
  for (let bit = 0; bit < range.bits; bit++) {
    const index = bit >> 3;
    const mask = 0x80 >> (bit & 7);
    if (((bytes[index] as number) & mask) !== ((range.bytes[index] as number) & mask)) return false;
  }
  return true;
}

/**
 * THE TABLES, as CIDR text — exported read-only so the engine differential derives its edge
 * rows from THEM (a block added here is probed at its edges the day it is added, not the day
 * someone remembers to copy it into the test).
 */
export const NON_PUBLIC_IPV4_CIDRS: readonly string[] = Object.freeze([
  '0.0.0.0/8', // "this" network
  '10.0.0.0/8', // private
  '100.64.0.0/10', // CGNAT
  '127.0.0.0/8', // loopback
  '169.254.0.0/16', // link-local (cloud metadata 169.254.169.254)
  '172.16.0.0/12', // private
  '192.0.0.0/24', // IETF protocol assignments
  '192.0.2.0/24', // documentation (TEST-NET-1)
  '192.88.99.0/24', // deprecated 6to4 relay anycast
  '192.168.0.0/16', // private
  '198.18.0.0/15', // benchmarking
  '198.51.100.0/24', // documentation (TEST-NET-2)
  '203.0.113.0/24', // documentation (TEST-NET-3)
  '224.0.0.0/4', // multicast
  '240.0.0.0/4', // reserved, incl. broadcast
]);

/** The standardized IPv6 blocks that CARRY an IPv4 in bytes 12-15 (both /96). */
export const IPV4_CARRIER_CIDRS: readonly string[] = Object.freeze(['::ffff:0:0/96', '64:ff9b::/96']);

/** Global unicast — the only IPv6 space the public internet routes. */
export const GLOBAL_UNICAST_CIDR = '2000::/3';

/** Inside global unicast and still not a public host: tunnels, protocol blocks, documentation. */
export const NON_PUBLIC_GLOBAL_IPV6_CIDRS: readonly string[] = Object.freeze([
  '2002::/16', // 6to4 — refused whole
  '2001::/32', // Teredo — refused whole
  '2001::/23', // IETF protocol assignments
  '2001:db8::/32', // documentation
  '3fff::/20', // documentation (RFC 9637)
]);

const NON_PUBLIC_IPV4: readonly Block[] = Object.freeze(NON_PUBLIC_IPV4_CIDRS.map(block));
const IPV4_CARRIERS: readonly Block[] = Object.freeze(IPV4_CARRIER_CIDRS.map(block));
const GLOBAL_UNICAST: Block = block(GLOBAL_UNICAST_CIDR);
const NON_PUBLIC_GLOBAL_IPV6: readonly Block[] = Object.freeze(NON_PUBLIC_GLOBAL_IPV6_CIDRS.map(block));

function isPublicIpv4Bytes(bytes: readonly number[]): boolean {
  return !NON_PUBLIC_IPV4.some(range => inBlock(bytes, range));
}

function isPublicIpv6Bytes(bytes: readonly number[]): boolean {
  if (IPV4_CARRIERS.some(range => inBlock(bytes, range))) return isPublicIpv4Bytes(bytes.slice(12, 16));
  if (!inBlock(bytes, GLOBAL_UNICAST)) return false;
  return !NON_PUBLIC_GLOBAL_IPV6.some(range => inBlock(bytes, range));
}

/** True only for an address on the public internet; anything else — or nothing — is false. */
export function isPublicAddress(ip: string): boolean {
  const v4 = ipv4Bytes(ip);
  if (v4) return isPublicIpv4Bytes(v4);
  const v6 = ipv6Bytes(ip);
  if (v6) return isPublicIpv6Bytes(v6);
  return false;
}
