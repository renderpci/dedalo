/**
 * IP address literals as BYTES — the one parser every address predicate shares.
 *
 * Two security predicates need to know what an address literal IS rather than how
 * it is spelled: the install/error-report allow gate (does this peer fall inside
 * an operator-written CIDR?) and the outbound SSRF guard (is this resolved address
 * public?). An address has many spellings (`::ffff:7f00:1` and `::ffff:127.0.0.1`,
 * `::1` and `0:0:0:0:0:0:0:1`), and every hand-rolled STRING check so far has
 * matched one of them and let the others through. Packed into bytes, they are one
 * value — so both callers ask here, and a spelling cannot reach one and not the
 * other.
 *
 * PURE and TOTAL: no imports, no I/O, and every failure is a null or a `false`,
 * never a throw — both callers are security predicates (one of them pre-auth), where
 * an exception on a hostile input is itself the vulnerability. What "I could not
 * parse it" MEANS (no match, or refuse) is the caller's decision, not this module's.
 */

/**
 * Normalize an address for comparison: trim, lowercase, and fold the IPv4-mapped
 * IPv6 form (`::ffff:203.0.113.10`) down to its v4 spelling. A dual-stack listener
 * reports a v4 peer in that mapped form, so without the fold a literal entry the
 * operator copied out of their own `ip addr` output would never match.
 */
export function normalizeAddress(value: string): string {
	const trimmed = value.trim().toLowerCase();
	const mapped = /^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/.exec(trimmed);
	return mapped?.[1] ?? trimmed;
}

/** Pack a dotted-quad into 4 bytes, or null when it is not one. */
export function packIpv4(value: string): Uint8Array | null {
	const parts = value.split('.');
	if (parts.length !== 4) return null;
	const bytes = new Uint8Array(4);
	for (let index = 0; index < 4; index++) {
		const part = parts[index] ?? '';
		if (!/^\d{1,3}$/.test(part)) return null;
		const byte = Number(part);
		if (byte > 255) return null;
		bytes[index] = byte;
	}
	return bytes;
}

/**
 * The hex groups of an IPv6 literal, split around the `::` elision, with any embedded
 * IPv4 tail already packed. Null when the literal is not one.
 *
 * Split out of `packIpv6` deliberately: PARSING an address and WRITING its bytes are two
 * jobs, and doing both in one function made it the most complex in this module — inside a
 * pre-auth security predicate, which is the last place a reader should have to hold two
 * problems at once. Every failure is a null, never a throw: a caller here decides whether
 * to admit an unauthenticated request, so "I could not parse it" must degrade to "no
 * match", not to an exception on the request path.
 */
function splitIpv6(value: string): {
	head: string[];
	tail: string[];
	v4Tail: Uint8Array;
} | null {
	const halves = ipv6Halves(value);
	if (halves === null) return null;
	const trailing = splitV4Tail([...halves.head, ...halves.tail]);
	if (trailing === null) return null;
	const { hexGroups, v4Tail } = trailing;
	// An embedded v4 tail (`::ffff:203.0.113.10`) occupies TWO groups' worth of bytes.
	const groupCount = hexGroups.length + v4Tail.length / 2;
	if (!ipv6GroupCountValid(groupCount, halves.elided)) return null;

	const headLength = halves.elided
		? Math.min(halves.head.length, hexGroups.length)
		: hexGroups.length;
	return { head: hexGroups.slice(0, headLength), tail: hexGroups.slice(headLength), v4Tail };
}

/**
 * Peel an embedded dotted-IPv4 tail off the group list. `v4Tail` is EMPTY (zero bytes,
 * so callers size and write it without a branch) when the last group is plain hex; the
 * whole result is null when it LOOKS like a v4 tail but does not pack as one
 * (`::ffff:1.2.3`), which is a malformed literal, not hex.
 */
function splitV4Tail(groups: string[]): { hexGroups: string[]; v4Tail: Uint8Array } | null {
	const last = groups[groups.length - 1] ?? '';
	if (!last.includes('.')) return { hexGroups: groups, v4Tail: new Uint8Array(0) };
	const v4Tail = packIpv4(last);
	return v4Tail === null ? null : { hexGroups: groups.slice(0, -1), v4Tail };
}

/** The groups either side of the `::` elision, or null when the literal is malformed. */
function ipv6Halves(value: string): { head: string[]; tail: string[]; elided: boolean } | null {
	if (!value.includes(':')) return null;
	const halves = value.split('::');
	if (halves.length > 2) return null;
	const expand = (half: string): string[] => (half === '' ? [] : half.split(':'));
	return {
		head: expand(halves[0] ?? ''),
		tail: halves.length === 2 ? expand(halves[1] ?? '') : [],
		elided: halves.length === 2,
	};
}

/**
 * Is this group count legal? Without an elision an address is EXACTLY 8 groups; with
 * one it must be fewer, since `::` stands for at least one zero group — a `::` that
 * elided nothing would be a second spelling of an address that already has one.
 */
function ipv6GroupCountValid(groupCount: number, elided: boolean): boolean {
	return elided ? groupCount <= 7 : groupCount === 8;
}

/** Write one 16-bit hex group at a byte offset. False when it is not a hex group. */
function writeIpv6Group(bytes: Uint8Array, group: string, at: number): boolean {
	if (!/^[0-9a-f]{1,4}$/.test(group)) return false;
	const numeric = Number.parseInt(group, 16);
	bytes[at] = (numeric >> 8) & 0xff;
	bytes[at + 1] = numeric & 0xff;
	return true;
}

/**
 * Pack an IPv6 literal into 16 bytes, or null when it is not one. Handles the `::`
 * elision and the embedded-v4 tail (`::ffff:203.0.113.10`, `64:ff9b::192.0.2.1`).
 * Returns null rather than throwing on anything it does not understand — every
 * caller here is a security predicate, so "I could not parse it" must degrade to
 * "no match", never to an exception on the request path.
 */
export function packIpv6(value: string): Uint8Array | null {
	const parsed = splitIpv6(value);
	if (parsed === null) return null;

	const bytes = new Uint8Array(16);
	// The elision fills the gap with zero bytes; `bytes` is already zeroed, so the tail
	// simply starts at its right-aligned offset.
	const tailStart = 16 - parsed.tail.length * 2 - parsed.v4Tail.length;
	if (tailStart < parsed.head.length * 2) return null;
	if (!writeIpv6Groups(bytes, parsed.head, 0)) return null;
	if (!writeIpv6Groups(bytes, parsed.tail, tailStart)) return null;
	bytes.set(parsed.v4Tail, tailStart + parsed.tail.length * 2);
	return bytes;
}

/** Write consecutive hex groups from a byte offset. False on the first non-hex group. */
function writeIpv6Groups(bytes: Uint8Array, groups: string[], start: number): boolean {
	return groups.every((group, index) => writeIpv6Group(bytes, group, start + index * 2));
}

/** Pack an address of either family; the byte length IS the family (4 or 16). */
export function packAddress(value: string): Uint8Array | null {
	return value.includes(':') ? packIpv6(value) : packIpv4(value);
}

/**
 * Is `ip` inside `cidr`? PURE, total, and FAIL-CLOSED: a malformed address, a
 * malformed or missing prefix length, a prefix wider than the family allows, or a
 * cross-family pair (a v4 address against a v6 block) all return false. It never
 * throws — this runs inside a pre-auth gate, where an exception on a hostile input
 * is itself the vulnerability.
 *
 * Comparison is bitwise on the packed address: whole bytes are compared directly,
 * and the straddling byte is masked to the remaining bits, so `/23` and `/25` mean
 * what they say instead of what a string-prefix comparison would guess.
 */
export function ipInCidr(ip: string, cidr: string): boolean {
	const address = packAddress(normalizeAddress(ip));
	return address !== null && packedInCidr(address, cidr);
}

/**
 * Is an ALREADY-PACKED address inside `cidr`? The same bitwise, total, fail-closed
 * comparison as `ipInCidr`, minus its text normalization.
 *
 * Exists because that normalization is a POLICY, not parsing: `ipInCidr` folds a
 * dotted IPv4-mapped peer (`::ffff:203.0.113.10`) down to IPv4 so an operator's v4
 * allow entry matches a dual-stack listener's report of it. A caller asking which
 * IPv6 block an address sits in (the SSRF guard) must not have `::ffff:…` quietly
 * become a v4 value first — it would then match no IPv6 block at all.
 */
export function packedInCidr(address: Uint8Array, cidr: string): boolean {
	const parsed = parseCidr(cidr);
	if (parsed === null) return false;
	if (parsed.network.length !== address.length) return false; // never match across families
	return sharesPrefix(parsed.network, address, parsed.prefixBits);
}

/** A CIDR's packed network address and prefix length, or null when it is not one. */
function parseCidr(cidr: string): { network: Uint8Array; prefixBits: number } | null {
	const slash = cidr.indexOf('/');
	if (slash < 0) return null;
	const prefixText = cidr.slice(slash + 1).trim();
	if (!/^\d{1,3}$/.test(prefixText)) return null;
	const network = packAddress(normalizeAddress(cidr.slice(0, slash)));
	if (network === null) return null;
	const prefixBits = Number(prefixText);
	// A prefix wider than the family is a typo, not a wildcard. Refusing it is what
	// keeps `/33` from silently meaning `/32`.
	if (prefixBits > network.length * 8) return null;
	return { network, prefixBits };
}

/**
 * Do two equal-length packed addresses agree on their first `prefixBits` bits?
 *
 * Bitwise, not by string prefix: whole bytes compare directly and the STRADDLING byte
 * is masked to the remaining bits, so `/23` and `/25` mean what they say rather than
 * what a textual comparison would guess.
 */
function sharesPrefix(network: Uint8Array, address: Uint8Array, prefixBits: number): boolean {
	const wholeBytes = prefixBits >> 3;
	for (let index = 0; index < wholeBytes; index++) {
		if (network[index] !== address[index]) return false;
	}
	const remainingBits = prefixBits & 7;
	if (remainingBits === 0) return true;
	const mask = (0xff << (8 - remainingBits)) & 0xff;
	return ((network[wholeBytes] ?? 0) & mask) === ((address[wholeBytes] ?? 0) & mask);
}
