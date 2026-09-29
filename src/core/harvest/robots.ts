/**
 * robots.txt, as RFC 9309 defines it — for the harvesting door only.
 *
 * A heritage institution harvesting another institution's catalogue is a guest;
 * the site's robots.txt is its answer to "may I". So the door asks before every
 * hop — a page, an image, a PDF, a POST alike — and obeys, including the parts
 * that cost us something:
 *
 *   - 2xx: the rules apply; 4xx (a missing file included): everything is allowed
 *     (RFC 9309 §2.3.1.3);
 *   - 5xx, 429, a 3xx the fetch does not follow (no `Location`, or a 300 / 304 /
 *     305), or no answer at all: COMPLETE DISALLOW (§2.3.1.4) — an outage is not
 *     permission. Surfaced as `harvest.robots_unavailable` (retryable);
 *   - more than `MAX_REDIRECTS` redirects: everything is allowed (§2.3.1.2 treats
 *     it as a 4xx);
 *   - a redirect the per-hop URL rules refuse (https → http, credentials, too long,
 *     a `Location` that is not a URL): COMPLETE DISALLOW, but NOT retryable — the
 *     same redirect is refused every time, so it is `harvest.refused`
 *     (`robots_redirect_refused`), remembered for the normal TTL;
 *   - `Crawl-delay` (not in the RFC, but a site's stated wish) sets the pace, and
 *     is CLAMPED by `pacing.ts` so a hostile file cannot park a job for a day.
 *
 * GROUPS (§2.1, §2.2.1). Consecutive `user-agent` lines share one group; only the
 * lines that define groups (`user-agent`, `allow`, `disallow`) end a run of
 * user-agent lines — a `Sitemap:` or `Crawl-delay:` between two `user-agent`
 * lines does not split them. A group is ours when its user-agent value's product
 * token (its leading `[a-zA-Z_-]+`, so `dedalo/7` and `Dedalo bot`) equals ours,
 * case-insensitively; every group that is ours is merged, else every `*` group.
 *
 * THE FETCH is a harvest request under ONE FIXED policy, not the caller's: its
 * own headers (our User-Agent and a text Accept — never the caller's Accept or
 * Referer, which could turn the file into a 406 read as "allow all" and cached
 * for every job), public addresses only, the socket pinned, and redirects
 * followed across authorities as §2.3.1.2 asks — every hop still vetted by the
 * SSRF guard; the verdict applies to the ORIGIN that was asked. It is detached
 * from the asking job's stop signal — the fetch is shared by every job that asks
 * at once, so one stopped job must not turn the site's answer into "unavailable"
 * for the others — while each asking job's own WAIT for it still ends when that
 * job is stopped. It is bounded by its own timeout and byte ceiling: §2.5 asks a
 * parser to read at least 500 KiB, so the first `ROBOTS_MAX_BYTES` are read, the
 * partial last line dropped, and the rest ignored. It is not paced and not
 * robots-checked (it IS the check). An address the SSRF guard refuses is reported
 * AS that refusal, never softened into "unavailable".
 *
 * BOUNDED WORK. Rules and paths come from a third party, and matching runs on the
 * shared event loop before every hop. So: no RegExp (a `*`-heavy pattern compiled
 * to one backtracks polynomially); `globMatches` walks the literal segments
 * between stars left to right with `linearIndexOf` — Knuth–Morris–Pratt, LINEAR in
 * path + segment for every input. Never `String.prototype.indexOf`: its cost is the
 * host engine's choice, and JSC's goes quadratic once the needle passes ~256
 * characters (measured 2026-09-29: 1.4 s of event loop for ONE hop against a
 * 512 KiB file of `/*ab…a` rules). A file with more than `ROBOTS_MAX_RULES` rules
 * for us, or a pattern longer than `ROBOTS_MAX_PATTERN_LENGTH`, is refused whole as
 * `harvest.refused` (`robots_too_complex`, not retryable) — no real site needs
 * either, and dropping the excess would silently drop Disallows. That is a
 * DELIBERATE deviation from §2.5 (which has a parser read at least 500 KiB): a
 * short file of 4097 rules is refused although it is well under the floor. The
 * pattern TEXT is not bounded separately: the file is (`ROBOTS_MAX_BYTES`), and the
 * encoding can at most triple it (one byte → `%XX`), so any file within the byte
 * ceiling and the two caps is obeyed as written, whatever its script.
 *
 * Those bounds cap the INPUTS one at a time; the WORK is their product — every
 * rule with a `*` scans the whole path, once per form the path is judged in, and
 * the path is the ENCODED one (a URL keeps `|` literal and the encoding triples
 * it, so `MAX_URL_LENGTH` does not cap it). Measured 2026-09-29: 4096 short `*`
 * rules against a `|`-padded path in four forms held the loop for 610 ms per hop.
 * So each hop's work is computed before any matching (`matchWork`: wildcard rules ×
 * the length of every form judged, plus the pattern text once per form) and a hop
 * past `ROBOTS_MAX_MATCH_WORK` is refused as `robots_too_complex` — for that path,
 * without matching a single rule.
 *
 * Paths and patterns are compared in one percent-encoding (§2.2.2): non-ASCII,
 * and every ASCII character that is neither unreserved nor reserved (controls,
 * space, `"`, `<`, `>`, `\`, `^`, `` ` ``, `{`, `|`, `}`), is percent-encoded with
 * upper-case hex, and `%XX` of an unreserved character is decoded — so
 * `/%70rivate` cannot slip past `Disallow: /private`, nor `/Collections%20Online/`
 * (what a URL sends) past `Disallow: /Collections Online/`, nor a literal `|` (which
 * a URL keeps) past `Disallow: /a%7Cb`. A reserved character is meaningful as
 * itself, so that form keeps `/` and `%2F` apart, as Google's matcher does; a
 * SECOND form decodes `%XX` of every reserved character except `*` and `$` in rule
 * and path alike, so `Disallow: /foo/bar?baz=https://foo.bar` also reaches the
 * `/foo/bar?baz=https%3A%2F%2Ffoo.bar` a URL sends (the RFC's own table). A path is
 * ALSO judged in a canonical form — runs of `/` collapsed, `;params` stripped from
 * each segment — because many servers answer `//private/lot` and `/;x/private`
 * with the page a `Disallow: /private` names; and with its literal `*` and `$`
 * written `%2A` and `%24`, because a path has no wildcards and §2.2.3 has
 * `Disallow: /path/file-with-a-%2A.html` reach `/path/file-with-a-*.html`. Each
 * distinct form is judged once. Any form disallowed refuses: every extra form can
 * only refuse more.
 *
 * A file that is not UTF-8 (§2.2 requires it; many older heritage sites serve
 * Latin-1) is read BYTE-WISE instead: every byte from 0x80 up becomes its `%XX`,
 * as Google's matcher does, so `Disallow: /caf\xE9` meets the `/caf%E9` such a site's
 * own links send. A valid UTF-8 sequence escapes to exactly what the encoding would
 * make of its character, so nothing a UTF-8 reading would match is lost.
 */

import { currentJobSignal } from '../media/job_scope.ts';
import { isAddressRefusal } from '../security/ssrf_guard.ts';
import { untilJobStopped } from './abort.ts';
import { type FollowDeps, followVetted, siteKey } from './follow.ts';
import { HARVEST_USER_AGENT, ROBOTS_PRODUCT_TOKEN } from './identity.ts';
import {
	type HarvestRefusalReason,
	harvestRefused,
	refusalReason,
	robotsDisallowed,
	robotsUnavailable,
} from './refusals.ts';

export { ROBOTS_PRODUCT_TOKEN } from './identity.ts';

/** RFC 9309 §2.5: a parser must read at least 500 KiB. Beyond this is ignored. */
export const ROBOTS_MAX_BYTES = 512 * 1024;
const ROBOTS_TIMEOUT_MS = 10_000;
/** A read answer is kept for an hour (RFC 9309 §2.4 allows up to 24 h). */
export const ROBOTS_TTL_MS = 60 * 60 * 1000;
/** An unreadable one is re-asked sooner: the site may be back in minutes. */
export const ROBOTS_FAILURE_TTL_MS = 5 * 60 * 1000;
/** Origins remembered at once; the oldest is evicted past this. */
export const ROBOTS_MAX_ORIGINS = 512;
/** Rules that may apply to us in one file; more refuses the file (fails closed). */
export const ROBOTS_MAX_RULES = 4096;
/** The longest single pattern; longer refuses the file (fails closed). */
export const ROBOTS_MAX_PATTERN_LENGTH = 2048;
/**
 * What the whole cache may retain, in estimated bytes (`policyWeight`).
 * `ROBOTS_MAX_ORIGINS` alone bounds the COUNT, not the size: 512 hostile files of
 * 4096 one-character rules pinned 150 MB for an hour (measured 2026-09-29), 230 MB
 * with a second rule form. Past this, the oldest entries go.
 */
export const ROBOTS_CACHE_MAX_WEIGHT = 16 * 1024 * 1024;
/**
 * What one retained rule OBJECT costs beyond its pattern characters, in bytes: the
 * object, its string's header and its slot in the list. Measured 2026-09-29 (Bun
 * 1.4): 512 × 4096 rules of ONE character retained 150 MB, about 75 bytes a rule.
 * A short rule costs this however short its pattern is, so a weight that counted
 * pattern characters alone read that cache as a quarter of its budget.
 */
export const ROBOTS_RULE_WEIGHT = 80;
/** A reserved-form slot that shares the exact form's rule object: the slot alone. */
const ROBOTS_SHARED_SLOT_WEIGHT = 8;
/**
 * The matching work one hop may cost, in character steps (see the header,
 * BOUNDED WORK): about 25 ms of event loop at the worst the bound admits. A real
 * site is far below it — a thousand `*` rules against a 500-character path in two
 * forms is a million.
 */
export const ROBOTS_MAX_MATCH_WORK = 8 * 1024 * 1024;

export interface RobotsRule {
	allow: boolean;
	pattern: string;
}

/**
 * One origin's verdict source. `unavailable` refuses every path (retryable);
 * `too_complex` refuses every path (a file past the work bounds — not retryable);
 * `redirect_refused` refuses every path (its redirect broke a URL rule — not
 * retryable).
 */
export type RobotsPolicy =
	| {
			kind: 'rules';
			rules: RobotsRule[];
			/**
			 * The same rules with reserved `%XX` decoded (`decodeReserved`) — null when
			 * that changes no pattern, so the common file costs nothing twice. A rule
			 * the decoding leaves unchanged is the SAME object as in `rules`.
			 */
			reservedRules: RobotsRule[] | null;
			crawlDelayMs: number | null;
			/** Rules with a `*`: each scans the whole path (`matchWork`). */
			wildcardRules: number;
			/** The pattern characters of `rules`: what judging one form against them reads. */
			patternChars: number;
			/** The same for `reservedRules` (0 when null). */
			reservedPatternChars: number;
			/** What keeping this policy costs, in estimated bytes (`policyWeight`): the cache weight. */
			weight: number;
	  }
	| { kind: 'allow_all' }
	| { kind: 'unavailable' }
	| { kind: 'too_complex' }
	| { kind: 'redirect_refused' };

interface ParsedLine {
	key: string;
	value: string;
}

/** The keys that define groups (§2.1). Only these end a run of user-agent lines. */
const GROUP_KEYS: ReadonlySet<string> = new Set(['user-agent', 'allow', 'disallow']);

/** `key: value`, comment stripped, key lowercased. Null for a line that is neither. */
function parseLine(raw: string): ParsedLine | null {
	const line = (raw.split('#', 1)[0] ?? '').trim();
	const colon = line.indexOf(':');
	if (colon <= 0) return null;
	return { key: line.slice(0, colon).trim().toLowerCase(), value: line.slice(colon + 1).trim() };
}

interface RobotsGroup {
	agents: string[];
	rules: RobotsRule[];
	crawlDelayMs: number | null;
}

/** Fold one line into the group list (§2.1: consecutive user-agent lines share a group). */
function foldLine(groups: RobotsGroup[], line: ParsedLine, previousKey: string | null): void {
	if (line.key === 'user-agent') {
		const current = groups[groups.length - 1];
		if (current !== undefined && previousKey === 'user-agent')
			current.agents.push(line.value.toLowerCase());
		else groups.push({ agents: [line.value.toLowerCase()], rules: [], crawlDelayMs: null });
		return;
	}
	const group = groups[groups.length - 1];
	if (group === undefined) return; // a rule before any user-agent belongs to nobody
	foldRule(group, line);
}

function foldRule(group: RobotsGroup, line: ParsedLine): void {
	if (line.key === 'allow' || line.key === 'disallow') {
		// An empty Disallow means "nothing is disallowed": it adds no rule.
		if (line.value !== '')
			group.rules.push({ allow: line.key === 'allow', pattern: normalizeEncoding(line.value) });
		return;
	}
	// The FIRST usable Crawl-delay of a group wins; an unusable one is skipped.
	if (line.key === 'crawl-delay') group.crawlDelayMs ??= crawlDelayMs(line.value);
}

/**
 * A Crawl-delay value in ms, or null unless it is a plain non-negative number of
 * seconds. An empty value, `-1`, `abc` or `0x10` asked for nothing we can honour.
 */
function crawlDelayMs(value: string): number | null {
	return /^\d+(?:\.\d+)?$/.test(value) ? Number(value) * 1000 : null;
}

/**
 * Does a user-agent value name us? Its product token — the leading
 * `[a-zA-Z_-]+`, Google's reference behaviour — compared case-insensitively.
 * `*` has no token and never names us.
 */
function namesUs(agent: string): boolean {
	return /^[a-z_-]+/i.exec(agent)?.[0].toLowerCase() === ROBOTS_PRODUCT_TOKEN;
}

/** Split the file into groups (§2.1). */
function parseGroups(text: string): RobotsGroup[] {
	const groups: RobotsGroup[] = [];
	let previousKey: string | null = null;
	for (const raw of text.split(/\r\n|\r|\n/)) {
		const line = parseLine(raw);
		if (line === null) continue;
		foldLine(groups, line, previousKey);
		if (GROUP_KEYS.has(line.key)) previousKey = line.key;
	}
	return groups;
}

/**
 * Parse a robots.txt for OUR product token (§2.2.1): every group naming us, merged;
 * if none does, every `*` group, merged; if neither exists, no rules.
 */
export function parseRobots(text: string): RobotsPolicy {
	const groups = parseGroups(text);
	const ours = groups.filter((group) => group.agents.some(namesUs));
	const chosen = ours.length > 0 ? ours : groups.filter((group) => group.agents.includes('*'));
	const delays = chosen.map((group) => group.crawlDelayMs).filter((ms) => ms !== null);
	const rules = chosen.flatMap((group) => group.rules);
	if (exceedsBounds(rules)) return { kind: 'too_complex' };
	const reservedRules = reservedForm(rules);
	return {
		kind: 'rules',
		rules,
		reservedRules,
		crawlDelayMs: delays[0] ?? null,
		wildcardRules: rules.filter((rule) => rule.pattern.includes('*')).length,
		patternChars: patternChars(rules),
		reservedPatternChars: patternChars(reservedRules ?? []),
		weight: policyWeight(rules, reservedRules),
	};
}

/**
 * The rules with reserved `%XX` decoded, or null when no pattern changes. A rule
 * the decoding leaves as it is is SHARED, not copied: one `%2F` in a file of 4096
 * rules must not double what the file costs to keep.
 */
function reservedForm(rules: readonly RobotsRule[]): RobotsRule[] | null {
	let changed = false;
	const decoded = rules.map((rule) => {
		const pattern = decodeReserved(rule.pattern);
		if (pattern === rule.pattern) return rule;
		changed = true;
		return { allow: rule.allow, pattern };
	});
	return changed ? decoded : null;
}

/**
 * More rules, or a longer pattern, than any real site needs — refused whole (the
 * header: a deliberate deviation from §2.5). The pattern text needs no bound of its
 * own: the file's byte ceiling bounds it (the encoding at most triples a byte).
 */
function exceedsBounds(rules: readonly RobotsRule[]): boolean {
	if (rules.length > ROBOTS_MAX_RULES) return true;
	return rules.some((rule) => rule.pattern.length > ROBOTS_MAX_PATTERN_LENGTH);
}

/** The pattern characters a rule list holds — what judging one form against it reads. */
function patternChars(rules: readonly RobotsRule[]): number {
	return rules.reduce((total, rule) => total + rule.pattern.length, 0);
}

/**
 * What a policy retains, in estimated bytes: every rule object (`ROBOTS_RULE_WEIGHT`)
 * and its pattern characters, and for the reserved form the objects it does NOT
 * share with the exact one — a shared rule is only a slot.
 */
function policyWeight(rules: readonly RobotsRule[], reservedRules: RobotsRule[] | null): number {
	const exact = patternChars(rules) + rules.length * ROBOTS_RULE_WEIGHT;
	const reserved = (reservedRules ?? []).reduce(
		(total, rule, index) => total + reservedSlotWeight(rule, rules[index]),
		0,
	);
	return exact + reserved;
}

/** One reserved-form slot: shared with the exact rule, or a rule of its own. */
function reservedSlotWeight(rule: RobotsRule, exact: RobotsRule | undefined): number {
	return rule === exact ? ROBOTS_SHARED_SLOT_WEIGHT : ROBOTS_RULE_WEIGHT + rule.pattern.length;
}

/** Characters RFC 3986 calls unreserved: `%XX` of these means the character itself. */
const UNRESERVED = /^[A-Za-z0-9\-._~]$/;

/**
 * The printable ASCII characters RFC 3986 neither reserves nor leaves unreserved.
 * A URL parser encodes some of them and keeps others literal (the WHATWG path
 * keeps `|` and `^`), so they are ALWAYS compared encoded.
 */
const UNSAFE_ASCII: ReadonlySet<string> = new Set([...' "<>\\^`{|}']);

/** Encoded in the canonical form: non-ASCII, controls, DEL, and `UNSAFE_ASCII`. */
function mustEncode(char: string): boolean {
	const code = char.codePointAt(0) ?? 0;
	return code < 0x20 || code >= 0x7f || UNSAFE_ASCII.has(char);
}

/**
 * One canonical percent-encoding for comparing a rule with a path (§2.2.2):
 * non-ASCII and the unsafe ASCII characters are UTF-8 percent-encoded, `%XX` of
 * an unreserved character is decoded, and every other `%XX` has its hex
 * upper-cased. Reserved characters stay as they are (see `decodeReserved`).
 */
export function normalizeEncoding(value: string): string {
	let encoded = '';
	for (const char of value) encoded += mustEncode(char) ? percentEncode(char) : char;
	return encoded.replace(/%([0-9a-fA-F]{2})/g, (_, hex: string) => {
		const char = String.fromCharCode(Number.parseInt(hex, 16));
		return UNRESERVED.test(char) ? char : `%${hex.toUpperCase()}`;
	});
}

/**
 * The reserved characters (RFC 3986 gen-delims and sub-delims) whose `%XX` the
 * second comparison form decodes. Not `*` or `$`: in a pattern those are the
 * wildcard and the anchor, and a decoded `%2A` must not become either.
 */
const DECODABLE_RESERVED: ReadonlySet<string> = new Set([...":/?#[]@!&'()+,;="]);

/**
 * The second comparison form (see the header): `%XX` of a `DECODABLE_RESERVED`
 * character decoded. Takes a `normalizeEncoding` result (upper-case hex).
 */
export function decodeReserved(value: string): string {
	return value.replace(/%([0-9A-F]{2})/g, (encoded: string, hex: string) => {
		const char = String.fromCharCode(Number.parseInt(hex, 16));
		return DECODABLE_RESERVED.has(char) ? char : encoded;
	});
}

function percentEncode(char: string): string {
	let out = '';
	for (const byte of new TextEncoder().encode(char)) out += hexEscape(byte);
	return out;
}

/** `%XX` of one byte, upper-case hex. */
function hexEscape(byte: number): string {
	return `%${byte.toString(16).toUpperCase().padStart(2, '0')}`;
}

/**
 * A path's literal `*` and `$` as `%2A` and `%24`: a path has no wildcards, so
 * this is the form a rule that spells them encoded (§2.2.3) is compared with.
 * Takes a `normalizeEncoding` result, which leaves both characters literal.
 */
export function escapeWildcards(value: string): string {
	return value.replaceAll('*', '%2A').replaceAll('$', '%24');
}

/**
 * The path as many servers resolve it: `;params` stripped from every segment,
 * then runs of `/` collapsed. The query is kept as it is.
 */
export function canonicalPath(path: string): string {
	const queryAt = path.indexOf('?');
	const pathname = queryAt === -1 ? path : path.slice(0, queryAt);
	const query = queryAt === -1 ? '' : path.slice(queryAt);
	const stripped = pathname
		.split('/')
		.map((segment) => segment.split(';', 1)[0] ?? '')
		.join('/');
	return `${stripped.replace(/\/{2,}/g, '/')}${query}`;
}

/** KMP's failure table: for each prefix of `needle`, its longest proper border. */
function failureTable(needle: string): Int32Array {
	const fail = new Int32Array(needle.length);
	let border = 0;
	for (let at = 1; at < needle.length; at++) {
		border = extendBorder(needle, fail, border, needle.charCodeAt(at));
		fail[at] = border;
	}
	return fail;
}

/** The matched length after reading `code`, falling back along the failure table. */
function extendBorder(needle: string, fail: Int32Array, matched: number, code: number): number {
	let length = matched;
	while (length > 0 && code !== needle.charCodeAt(length)) length = fail[length - 1] ?? 0;
	return code === needle.charCodeAt(length) ? length + 1 : length;
}

/**
 * The first index at or after `from` where `needle` occurs in `haystack`, or -1 —
 * Knuth–Morris–Pratt, so O(haystack + needle) for EVERY input (see the header:
 * `String.prototype.indexOf` makes no such promise). A native single-character
 * search skips to the first candidate: that one is linear in any engine.
 */
export function linearIndexOf(haystack: string, needle: string, from: number): number {
	if (needle.length === 0) return Math.min(from, haystack.length); // as String.indexOf
	const start = haystack.indexOf(needle.charAt(0), from);
	if (start === -1) return -1;
	const fail = failureTable(needle);
	let matched = 0;
	for (let at = start; at < haystack.length; at++) {
		matched = extendBorder(needle, fail, matched, haystack.charCodeAt(at));
		if (matched === needle.length) return at - needle.length + 1;
	}
	return -1;
}

/**
 * Does `path` match a robots pattern? `*` is any run of characters, a trailing
 * `$` anchors the end, anything else is a literal PREFIX match (§2.2.3). The
 * literal segments between stars are found left to right, each at its first
 * occurrence after the previous one — which is optimal for `*`-only globs — so
 * the cost is one linear scan of the path per rule, never a backtracking search.
 */
export function globMatches(pattern: string, path: string): boolean {
	const anchored = pattern.endsWith('$');
	const segments = (anchored ? pattern.slice(0, -1) : pattern).split('*');
	const first = segments[0] ?? '';
	if (!path.startsWith(first)) return false;
	if (segments.length === 1) return !anchored || path.length === first.length;
	return restMatches(segments, path, first.length, anchored);
}

/** Segments 1..n after the leading one, the last one pinned to the end when anchored. */
function restMatches(segments: string[], path: string, from: number, anchored: boolean): boolean {
	const last = segments.length - 1;
	const at = middleSegmentsEnd(segments.slice(1, last), path, from);
	if (at === -1) return false;
	return tailMatches(segments[last] ?? '', path, at, anchored);
}

/** Where the last middle segment ends, each found after the previous; -1 when one is missing. */
function middleSegmentsEnd(middle: readonly string[], path: string, from: number): number {
	let at = from;
	for (const segment of middle) {
		const found = linearIndexOf(path, segment, at);
		if (found === -1) return -1;
		at = found + segment.length;
	}
	return at;
}

/** The last segment: anywhere after `at`, or — anchored — exactly at the end. */
function tailMatches(tail: string, path: string, at: number, anchored: boolean): boolean {
	if (!anchored) return linearIndexOf(path, tail, at) !== -1;
	return path.length - tail.length >= at && path.endsWith(tail);
}

type RulesPolicy = Extract<RobotsPolicy, { kind: 'rules' }>;

/** One path form, the rule list it is judged against, and that list's pattern characters. */
interface Judgement {
	readonly rules: RobotsRule[];
	readonly path: string;
	readonly patternChars: number;
}

/** What the rules say of one path; `too_complex` when judging it would pass the work bound. */
export type PathVerdict = 'allowed' | 'disallowed' | 'too_complex';

/**
 * Is `path` (path + query) allowed? The LONGEST matching pattern wins; on a tie,
 * Allow wins (§2.2.2). `/robots.txt` is always allowed. The path is judged in every
 * form of the header, each distinct form once; any one disallowed refuses. Before
 * any rule is matched, the work that judging would cost is weighed, and a path past
 * `ROBOTS_MAX_MATCH_WORK` is `too_complex`.
 */
export function pathVerdict(policy: RobotsPolicy, path: string): PathVerdict {
	if (policy.kind !== 'rules') return policy.kind === 'allow_all' ? 'allowed' : 'disallowed';
	if (path === '/robots.txt') return 'allowed';
	const judged = judgements(policy, path);
	if (matchWork(policy, judged) > ROBOTS_MAX_MATCH_WORK) return 'too_complex';
	return judged.every((form) => rulesAllow(form.rules, form.path)) ? 'allowed' : 'disallowed';
}

/** `pathVerdict` as a yes/no: a path too complex to judge is not allowed (fails closed). */
export function isPathAllowed(policy: RobotsPolicy, path: string): boolean {
	return pathVerdict(policy, path) === 'allowed';
}

/**
 * The path's encoded forms, each once: as sent and canonical (`canonicalPath`),
 * each `normalizeEncoding`-ed, each also with its wildcards escaped.
 */
function encodedForms(path: string): Set<string> {
	const forms = new Set<string>();
	for (const base of [path, canonicalPath(path)]) {
		const encoded = normalizeEncoding(base);
		forms.add(encoded).add(escapeWildcards(encoded));
	}
	return forms;
}

/**
 * Every (rules, path form) pair to judge: each encoded form against the rules, and
 * each with reserved `%XX` decoded against the decoded rules. When no pattern
 * changes under that decoding, both halves use the same rules, so a decoded form
 * equal to an encoded one is judged once.
 */
function judgements(policy: RulesPolicy, path: string): Judgement[] {
	const exact = [...encodedForms(path)];
	// Distinct encoded forms stay distinct decoded: they differ in `/` runs, `;params`
	// or an escaped wildcard, never in how a reserved character is written.
	const decoded = exact.map(decodeReserved);
	const reserved = policy.reservedRules;
	const { rules, patternChars, reservedPatternChars } = policy;
	if (reserved === null) return judgedAgainst(rules, patternChars, new Set([...exact, ...decoded]));
	return [
		...judgedAgainst(rules, patternChars, exact),
		...judgedAgainst(reserved, reservedPatternChars, decoded),
	];
}

function judgedAgainst(
	rules: RobotsRule[],
	patternChars: number,
	forms: Iterable<string>,
): Judgement[] {
	return [...forms].map((form) => ({ rules, path: form, patternChars }));
}

/**
 * What judging costs, in character steps: every wildcard rule scans the whole form
 * once (`globMatches` is linear), and every rule of the list the form is judged
 * against reads its own pattern once.
 */
function matchWork(policy: RulesPolicy, judged: readonly Judgement[]): number {
	return judged.reduce(
		(work, form) => work + policy.wildcardRules * form.path.length + form.patternChars,
		0,
	);
}

function rulesAllow(rules: RobotsRule[], path: string): boolean {
	const best = decidingRule(rules, path);
	return best === null || best.allow;
}

/** The rule that decides `path`: the longest match, Allow on a tie. */
function decidingRule(rules: RobotsRule[], path: string): RobotsRule | null {
	let best: RobotsRule | null = null;
	for (const rule of rules) {
		if (globMatches(rule.pattern, path) && (best === null || isBetterMatch(rule, best)))
			best = rule;
	}
	return best;
}

function isBetterMatch(rule: RobotsRule, best: RobotsRule): boolean {
	if (rule.pattern.length !== best.pattern.length) return rule.pattern.length > best.pattern.length;
	return rule.allow && !best.allow;
}

/**
 * What a robots.txt response MEANS, by status (§2.3.1). A 3xx reaching here is one
 * the fetch does not follow (the primitive hands back a `location` only for a
 * 301/302/303/307/308 that carries one — so a 300, 304 or 305, or a redirect with
 * no `Location`), so the file could not be read: unavailable.
 */
export function policyFromResponse(status: number, text: string): RobotsPolicy {
	if (status >= 200 && status < 300) return parseRobots(text);
	return serverFailed(status) ? { kind: 'unavailable' } : { kind: 'allow_all' };
}

/** 3xx (not followed), 429 and 5xx: the server did not deliver the file (§2.3.1.4). */
function serverFailed(status: number): boolean {
	return (status >= 300 && status < 400) || status === 429 || status >= 500;
}

/**
 * The body as text: UTF-8, or — for a file that is not — byte-wise (see the header).
 * A body cut at `ROBOTS_MAX_BYTES` loses its partial last line (§2.5): half a
 * `Disallow: /private` would read as `Disallow: /pri`, which is a different rule.
 */
export function robotsText(bytes: Uint8Array, truncated: boolean): string {
	const text = decodeRobots(bytes);
	if (!truncated) return text;
	const lastBreak = Math.max(text.lastIndexOf('\n'), text.lastIndexOf('\r'));
	return lastBreak === -1 ? '' : text.slice(0, lastBreak);
}

/** UTF-8 when the bytes are UTF-8; else every byte from 0x80 up as its `%XX`, a BOM dropped. */
function decodeRobots(bytes: Uint8Array): string {
	try {
		return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
	} catch {
		return byteWise(hasUtf8Bom(bytes) ? bytes.subarray(3) : bytes);
	}
}

function hasUtf8Bom(bytes: Uint8Array): boolean {
	return bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
}

/** ASCII as itself, every other byte `%XX` — what a raw-byte URL path sends. */
function byteWise(bytes: Uint8Array): string {
	let text = '';
	for (const byte of bytes) text += byte < 0x80 ? String.fromCharCode(byte) : hexEscape(byte);
	return text;
}

interface CachedPolicy {
	expiresAt: number;
	policy: Promise<RobotsPolicy>;
	/** What the settled policy retains, in estimated bytes (0 while it loads). */
	weight: number;
}

/**
 * Per-ORIGIN robots verdicts. Deliberately NOT factory-built: robots.txt derives
 * from a remote site, not from the ontology or record data, so neither invalidation
 * channel says anything about it. Lifecycle: TIME and SIZE — an entry expires
 * after its TTL, an expired entry is replaced on the next ask, and past
 * `ROBOTS_MAX_ORIGINS` entries OR `ROBOTS_CACHE_MAX_WEIGHT` retained estimated
 * bytes (rule objects as well as pattern text) the oldest insertions are evicted. Holding the PROMISE coalesces
 * concurrent first asks into one fetch. Keys are an origin, never request identity.
 */
const robotsPolicies = new Map<string, CachedPolicy>();

/** Drop every remembered verdict (tests; an operator-visible reset later). */
export function clearRobotsCache(): void {
	robotsPolicies.clear();
}

/** Origins with a remembered verdict — observability for the gates. */
export function cachedRobotsOrigins(): number {
	return robotsPolicies.size;
}

/** The fetch's own headers — whoever asked (see the header: never the caller's). */
function robotsHeaders(): Headers {
	return new Headers({ 'User-Agent': HARVEST_USER_AGENT, Accept: 'text/plain, */*;q=0.1' });
}

/**
 * Fetch and interpret one origin's robots.txt. Every failure is `unavailable`,
 * except a redirect the URL rules refused (`redirect_refused`), too many redirects
 * (`allow_all`), and an SSRF-guard address refusal, which is rethrown as itself.
 */
async function loadPolicy(origin: string, deps?: FollowDeps): Promise<RobotsPolicy> {
	try {
		const result = await followVetted(
			{ url: new URL('/robots.txt', origin), method: 'GET' },
			{
				hosts: 'public',
				headers: robotsHeaders(),
				maxBytes: ROBOTS_MAX_BYTES,
				overflow: 'truncate',
				timeoutMs: ROBOTS_TIMEOUT_MS,
				detachedFromJob: true,
				beforeHop: async () => undefined,
				...(deps === undefined ? {} : { deps }),
			},
		);
		const { status, bytes, truncated } = result.response;
		return policyFromResponse(status, robotsText(bytes, truncated));
	} catch (error) {
		return policyFromFailure(error);
	}
}

/** What a failed robots.txt fetch means. Rethrows an SSRF-guard address refusal. */
function policyFromFailure(error: unknown): RobotsPolicy {
	const reason = refusalReason(error);
	// Too many redirects is RFC "unavailable" in the 4xx sense: allowed (§2.3.1.2).
	if (reason === 'too_many_redirects') return { kind: 'allow_all' };
	// Any other door refusal is a URL rule the redirect broke: the same every time.
	if (reason !== undefined) return { kind: 'redirect_refused' };
	if (isAddressRefusal(error)) throw error;
	return { kind: 'unavailable' };
}

/**
 * The cache entry for `origin`: the live one, or a fresh load. The load's OWN
 * outcome settles the entry (never an asking caller's, who may leave early): an
 * unavailable verdict is kept only for the failure TTL, and a refused origin is
 * not remembered — the refusal is the answer, every time.
 */
function cachedLoad(origin: string, now: number, deps?: FollowDeps): CachedPolicy {
	const cached = robotsPolicies.get(origin);
	if (cached !== undefined && cached.expiresAt > now) return cached;
	robotsPolicies.delete(origin);
	evictOldestWhile(() => robotsPolicies.size >= ROBOTS_MAX_ORIGINS);
	const policy = loadPolicy(origin, deps);
	const entry: CachedPolicy = { expiresAt: now + ROBOTS_TTL_MS, policy, weight: 0 };
	robotsPolicies.set(origin, entry);
	policy.then(
		(settled) => settleEntry(entry, settled, now),
		() => {
			if (robotsPolicies.get(origin) === entry) robotsPolicies.delete(origin);
		},
	);
	return entry;
}

/** A load has settled: shorten a failure's TTL, weigh the rules, keep the cache in budget. */
function settleEntry(entry: CachedPolicy, policy: RobotsPolicy, now: number): void {
	if (policy.kind === 'unavailable') entry.expiresAt = now + ROBOTS_FAILURE_TTL_MS;
	entry.weight = policy.kind === 'rules' ? policy.weight : 0;
	evictOldestWhile(() => cachedWeight() > ROBOTS_CACHE_MAX_WEIGHT);
}

/** What every settled entry retains. At most `ROBOTS_MAX_ORIGINS` entries. */
function cachedWeight(): number {
	let total = 0;
	for (const entry of robotsPolicies.values()) total += entry.weight;
	return total;
}

/** Evict the oldest insertion while `over()` holds. */
function evictOldestWhile(over: () => boolean): void {
	while (robotsPolicies.size > 0 && over()) {
		const oldest = robotsPolicies.keys().next().value;
		if (oldest !== undefined) robotsPolicies.delete(oldest);
	}
}

/** What the cache retains now, in estimated bytes — observability for the gates. */
export function cachedRobotsWeight(): number {
	return cachedWeight();
}

/**
 * The policy for `url`'s origin, from the cache or freshly read. The shared load
 * ignores any one job's stop signal; THIS caller's wait for it does not.
 */
export function robotsPolicyFor(url: URL, now: number, deps?: FollowDeps): Promise<RobotsPolicy> {
	return untilJobStopped(cachedLoad(siteKey(url), now, deps).policy, currentJobSignal(), 'robots');
}

/** Refuse unless the site's robots.txt allows `url`. Returns the policy (for its delay). */
export async function assertRobotsAllow(
	url: URL,
	now: number,
	deps?: FollowDeps,
): Promise<RobotsPolicy> {
	const policy = await robotsPolicyFor(url, now, deps);
	if (policy.kind === 'unavailable') throw robotsUnavailable(url);
	const refusal = POLICY_REFUSALS[policy.kind];
	if (refusal !== undefined) throw harvestRefused(refusal, url.origin);
	const verdict = pathVerdict(policy, `${url.pathname}${url.search}`);
	if (verdict === 'too_complex') throw harvestRefused('robots_too_complex', url.origin);
	if (verdict === 'disallowed') throw robotsDisallowed(url);
	return policy;
}

/** The whole-origin verdicts that are a `harvest.refused`, not retryable. */
const POLICY_REFUSALS: Partial<Record<RobotsPolicy['kind'], HarvestRefusalReason>> = {
	too_complex: 'robots_too_complex',
	redirect_refused: 'robots_redirect_refused',
};
