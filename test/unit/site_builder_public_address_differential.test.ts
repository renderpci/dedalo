/**
 * DIFFERENTIAL — the site builder's egress classifier answers exactly as the engine's
 * SSRF guard (LEAD-1 / SURF-2), IN THE STATE WHERE NO NAT64 NETWORK-SPECIFIC PREFIX IS
 * DECLARED OR DISCOVERED.
 *
 * The site-builder daemon is its own package and cannot import the engine, so its egress
 * gate carries its own `isPublicAddress` (`publication/site_builder/src/egress/public_address.ts`).
 * A second classifier is a second answer to "is this address public?", and two answers
 * drift: the day one learns a new special-purpose block (a NAT64 prefix, a new benchmark
 * range) and the other does not, the agent's gate dials what the engine's guard refuses.
 *
 * So the package copy is pinned to the engine's `isPrivateIp` by a truth table rather than
 * by review: the edges (first, first+1, last-1, last, and the address just outside on each
 * side) of every block in the PACKAGE's own exported tables and of a hand-kept copy of the
 * engine's (IPv4 and IPv6), the IPv6 translation and tunnel prefixes with a private and a
 * public carried IPv4, the IPv4-mapped spellings, and a seeded random IPv4 sample.
 *
 * WHAT IT FOLLOWS, honestly: a block added to the PACKAGE is probed at its edges
 * automatically (its tables are read, not copied). A block added only to the ENGINE's
 * `ssrf_guard.ts` is probed only if it is in the hand list below or happens to hold a seeded
 * sample (≈300/2^24 for a /24) — `ssrf_guard.ts` does not export its CIDR tables yet. Until
 * it does, adding an engine block means adding it to `ENGINE_V4_BLOCKS`/`ENGINE_V6_BLOCKS`
 * here in the same change.
 *
 * Anchors keep it from being vacuous: two classifiers that both answered a constant would
 * agree on every row, so a handful of rows are ALSO stated absolutely.
 *
 * THE DIMENSION IT DOES NOT TEST: network-specific NAT64 prefixes. The engine honours an
 * operator-declared one (`DEDALO_NAT64_PREFIXES`, read by `isPrivateIp` per call) and an RFC
 * 7050-discovered one (async `assertPublicUrl` only); the daemon has neither, so on a host
 * with one the two DISAGREE by construction — an address inside the prefix carrying a private
 * IPv4 is private to the engine and public to the gate. That is SITE_BUILDER_INSTANCES §10
 * residual 6(g), and the last row below states it as the residual it is (both sides, no
 * prefix declared) rather than letting "exactly as the engine" claim it covered.
 */

import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { isPrivateIp } from '../../src/core/security/ssrf_guard.ts';

const CLASSIFIER = join(
	import.meta.dir,
	'..',
	'..',
	'publication/site_builder/src/egress/public_address.ts',
);

interface ClassifierModule {
	isPublicAddress: (ip: string) => boolean;
	NON_PUBLIC_IPV4_CIDRS: readonly string[];
	IPV4_CARRIER_CIDRS: readonly string[];
	GLOBAL_UNICAST_CIDR: string;
	NON_PUBLIC_GLOBAL_IPV6_CIDRS: readonly string[];
}

/** Loaded once at module scope: the TABLE below is built from the package's own tables. */
const classifier = (await import(CLASSIFIER)) as ClassifierModule;

async function isPublicAddress(): Promise<(ip: string) => boolean> {
	return classifier.isPublicAddress;
}

/* ── the table ──────────────────────────────────────────────────────────────────────── */

function v4ToInt(ip: string): number {
	return ip.split('.').reduce((acc, octet) => acc * 256 + Number(octet), 0);
}
function intToV4(n: number): string {
	const x = ((n % 2 ** 32) + 2 ** 32) % 2 ** 32;
	return [x >>> 24, (x >>> 16) & 255, (x >>> 8) & 255, x & 255].join('.');
}

/**
 * The ENGINE's IPv4 blocks (plus IANA registry entries both treat as public), hand-kept —
 * `ssrf_guard.ts` does not export its tables (see the header).
 */
const ENGINE_V4_BLOCKS = [
	'0.0.0.0/8',
	'10.0.0.0/8',
	'100.64.0.0/10',
	'127.0.0.0/8',
	'169.254.0.0/16',
	'172.16.0.0/12',
	'192.0.0.0/24',
	'192.0.2.0/24',
	'192.31.196.0/24',
	'192.52.193.0/24',
	'192.88.99.0/24',
	'192.168.0.0/16',
	'192.175.48.0/24',
	'198.18.0.0/15',
	'198.51.100.0/24',
	'203.0.113.0/24',
	'224.0.0.0/4',
	'240.0.0.0/4',
];

/** The engine's IPv6 blocks (carriers, global unicast, tunnels, special-purpose), hand-kept. */
const ENGINE_V6_BLOCKS = [
	'::ffff:0:0/96',
	'64:ff9b::/96',
	'2000::/3',
	'2002::/16',
	'2001::/32',
	'2001::/23',
	'2001:db8::/32',
	'3fff::/20',
];

/** Every IPv4 block probed: the hand-kept engine copy ∪ the package's own exported table. */
const V4_BLOCKS = [...new Set([...ENGINE_V4_BLOCKS, ...classifier.NON_PUBLIC_IPV4_CIDRS])];
/** Every IPv6 block probed: the hand-kept engine copy ∪ the package's own exported tables. */
const V6_BLOCKS = [
	...new Set([
		...ENGINE_V6_BLOCKS,
		...classifier.IPV4_CARRIER_CIDRS,
		classifier.GLOBAL_UNICAST_CIDR,
		...classifier.NON_PUBLIC_GLOBAL_IPV6_CIDRS,
	]),
];

function v6ToBig(ip: string): bigint {
	const halves = ip.split('::');
	const words = (part: string) => (part === '' ? [] : part.split(':'));
	const head = words(halves[0] ?? '');
	const rest = halves.length === 2 ? words(halves[1] ?? '') : [];
	const all = [...head, ...Array<string>(8 - head.length - rest.length).fill('0'), ...rest];
	return all.reduce((acc, word) => (acc << 16n) | BigInt(Number.parseInt(word, 16)), 0n);
}
function bigToV6(n: bigint): string {
	const words: string[] = [];
	for (let i = 7; i >= 0; i--) words.push(((n >> BigInt(i * 16)) & 0xffffn).toString(16));
	return words.join(':');
}

function v6Edges(): string[] {
	const out: string[] = [];
	const top = (1n << 128n) - 1n;
	for (const block of V6_BLOCKS) {
		const [net, bits] = block.split('/') as [string, string];
		const size = 1n << BigInt(128 - Number(bits));
		const first = v6ToBig(net);
		const lastAddr = first + size - 1n;
		for (const n of [first - 1n, first, first + 1n, lastAddr - 1n, lastAddr, lastAddr + 1n]) {
			if (n >= 0n && n <= top) out.push(bigToV6(n));
		}
	}
	return out;
}

function v4Edges(): string[] {
	const out: string[] = [];
	for (const block of V4_BLOCKS) {
		const [net, bits] = block.split('/') as [string, string];
		const size = 2 ** (32 - Number(bits));
		const first = v4ToInt(net);
		const lastAddr = first + size - 1;
		for (const n of [first - 1, first, first + 1, lastAddr - 1, lastAddr, lastAddr + 1]) {
			if (n >= 0 && n < 2 ** 32) out.push(intToV4(n));
		}
	}
	return out;
}

/** A seeded LCG, so a red row is reproducible. */
function seededV4(count: number, seed = 0x5eed): string[] {
	let state = seed >>> 0;
	const out: string[] = [];
	for (let i = 0; i < count; i++) {
		state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
		out.push(intToV4(state));
	}
	return out;
}

/** Hex word of a v4 address pair, for embedding: 10.0.0.1 → ['0a00','0001']. */
function v4Words(ip: string): [string, string] {
	const n = v4ToInt(ip);
	return [((n >>> 16) & 0xffff).toString(16), (n & 0xffff).toString(16)];
}

const CARRIED_V4 = [
	'127.0.0.1',
	'10.0.0.5',
	'169.254.169.254',
	'192.168.1.1',
	'100.64.0.1',
	'93.184.216.34',
	'8.8.8.8',
];

function v6Rows(): string[] {
	const rows = [
		'::',
		'::1',
		'::2',
		'0:0:0:0:0:0:0:1',
		'1fff:ffff:ffff:ffff:ffff:ffff:ffff:ffff',
		'2000::',
		'2000::1',
		// 3fff::/20 (RFC 9637 documentation): its edges INSIDE the block, and the first address
		// just outside it — `3fff:ffff:…` above is outside the /20 and was the only 3fff row.
		'3ffe:ffff:ffff:ffff:ffff:ffff:ffff:ffff',
		'3fff::',
		'3fff::1',
		'3fff:fff:ffff:ffff:ffff:ffff:ffff:fffe',
		'3fff:fff:ffff:ffff:ffff:ffff:ffff:ffff',
		'3fff:1000::',
		'3fff:ffff:ffff:ffff:ffff:ffff:ffff:ffff',
		'4000::',
		// A zone id is not an address this gate dials, whatever it is attached to.
		'fe80::1%eth0',
		'2606:4700::1%eth0',
		'2606:4700:4700::1111%25eth0',
		'2001:db7:ffff:ffff:ffff:ffff:ffff:ffff',
		'2001:db8::',
		'2001:db8::1',
		'2001:db8:ffff:ffff:ffff:ffff:ffff:ffff',
		'2001:db9::',
		'2001:10::1',
		'2001:20::1',
		'2001:2::1',
		'100::1',
		'100::ffff:ffff:ffff:ffff',
		'fbff:ffff:ffff:ffff:ffff:ffff:ffff:ffff',
		'fc00::',
		'fd00::5',
		'fdff:ffff:ffff:ffff:ffff:ffff:ffff:ffff',
		'fe00::',
		'fe7f:ffff:ffff:ffff:ffff:ffff:ffff:ffff',
		'fe80::',
		'fe80::1',
		'febf:ffff:ffff:ffff:ffff:ffff:ffff:ffff',
		'fec0::1',
		'ff00::',
		'ff02::1',
		'ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff',
		'2606:4700:4700::1111',
		'2a00:1450:4001:80b::200e',
		'2620:fe::fe',
	];
	for (const v4 of CARRIED_V4) {
		const [hi, lo] = v4Words(v4);
		rows.push(
			`::ffff:${v4}`, // IPv4-mapped, dotted
			`::ffff:${hi}:${lo}`, // IPv4-mapped, hex
			`::${v4}`, // IPv4-compatible (deprecated)
			`64:ff9b::${v4}`, // NAT64 well-known /96
			`64:ff9b::${hi}:${lo}`,
			`64:ff9b:1::${hi}:${lo}`, // local-use NAT64 /48
			`2002:${hi}:${lo}::1`, // 6to4
			`2001:0:4136:e378:8000:63bf:${(~parseInt(hi, 16) & 0xffff).toString(16)}:${(~parseInt(lo, 16) & 0xffff).toString(16)}`, // Teredo (obfuscated client)
		);
	}
	return rows;
}

const TABLE: readonly string[] = Object.freeze([
	...new Set([...v4Edges(), ...v6Edges(), ...v6Rows(), ...seededV4(300)]),
]);

/** Rows whose answer is not a matter of taste — both classifiers must give exactly this. */
const ANCHORS: Readonly<Record<string, boolean>> = Object.freeze({
	'127.0.0.1': false,
	'10.0.0.5': false,
	'169.254.169.254': false,
	'::1': false,
	'::ffff:127.0.0.1': false,
	'64:ff9b::a00:5': false,
	'fe80::1': false,
	'fd00::5': false,
	'2001:db8::1': false,
	'3fff::1': false,
	'3fff:fff:ffff:ffff:ffff:ffff:ffff:ffff': false,
	'3fff:1000::': true,
	'fe80::1%eth0': false,
	'2606:4700::1%eth0': false,
	'93.184.216.34': true,
	'8.8.8.8': true,
	'2606:4700:4700::1111': true,
});

describe('the site builder classifies addresses exactly as the engine', () => {
	test('the table is the size it claims (not a loop over nothing)', () => {
		expect(TABLE.length).toBeGreaterThan(200);
	});

	test('every block in the PACKAGE tables is probed at its edges — derived, not copied', () => {
		// The drift this closes: a block added to the package classifier alone was probed only if
		// someone also copied it here. Each one's first and last address are now TABLE rows.
		const rows = new Set(TABLE);
		for (const block of classifier.NON_PUBLIC_IPV4_CIDRS) {
			const [net, bits] = block.split('/') as [string, string];
			const last = intToV4(v4ToInt(net) + 2 ** (32 - Number(bits)) - 1);
			expect({ block, first: rows.has(net), last: rows.has(last) }).toEqual({
				block,
				first: true,
				last: true,
			});
		}
		for (const block of [
			...classifier.IPV4_CARRIER_CIDRS,
			classifier.GLOBAL_UNICAST_CIDR,
			...classifier.NON_PUBLIC_GLOBAL_IPV6_CIDRS,
		]) {
			const [net, bits] = block.split('/') as [string, string];
			const first = v6ToBig(net);
			const last = first + (1n << BigInt(128 - Number(bits))) - 1n;
			expect({ block, first: rows.has(bigToV6(first)), last: rows.has(bigToV6(last)) }).toEqual({
				block,
				first: true,
				last: true,
			});
		}
	});

	test('anchors: the engine itself answers the unarguable rows', () => {
		for (const [ip, isPublic] of Object.entries(ANCHORS)) {
			expect({ ip, public: !isPrivateIp(ip) }).toEqual({ ip, public: isPublic });
		}
	});

	test('anchors: the package classifier answers them too', async () => {
		const classify = await isPublicAddress();
		for (const [ip, isPublic] of Object.entries(ANCHORS)) {
			expect({ ip, public: classify(ip) }).toEqual({ ip, public: isPublic });
		}
	});

	test('residual 6(g), stated: an address in a network-specific NAT64 prefix nobody declared is PUBLIC to both', async () => {
		// `2a00:1450:4001:64::/96` stands for a provider's NSP: global unicast, and the /96 layout
		// carries 10.0.0.5 in its last 32 bits. With the prefix undeclared both classifiers see only
		// the v6 face. The day either side learns the prefix, this row turns red and the residual
		// is re-decided with the other side in the same change.
		const classify = await isPublicAddress();
		const synthesized = '2a00:1450:4001:64::a00:5';
		expect({ engine: !isPrivateIp(synthesized), gate: classify(synthesized) }).toEqual({
			engine: true,
			gate: true,
		});
	});

	test('every row: isPublicAddress(ip) === !isPrivateIp(ip)', async () => {
		const classify = await isPublicAddress();
		const disagreements = TABLE.filter((ip) => classify(ip) !== !isPrivateIp(ip)).map(
			(ip) =>
				`${ip} package=${classify(ip) ? 'public' : 'private'} engine=${isPrivateIp(ip) ? 'private' : 'public'}`,
		);
		expect(disagreements).toEqual([]);
	});
});
