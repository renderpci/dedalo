/**
 * THE HARVESTING DOOR (src/core/harvest/) — every rule it promises, driven.
 *
 * Each describe block pins one clause of the door's headers against a FAKE HOP
 * (the `hop` seam): the scripted "site" answers per URL — honouring `maxBytes`,
 * `overflow` and `acceptBody` the way the primitive does — and the test reads
 * what the door sent and what it refused. A few cases run the REAL primitive,
 * `fetchPinnedHop`, under its own seams (a scripted resolver and socket), so the
 * door's reading of the primitive's errors is pinned against the primitive itself.
 *
 * NO WALL CLOCK. The clock, the pacing sleep and the drain timer are seams; a
 * negative claim ("the second request has NOT started") is checked after
 * `settle()`, which drains every pending microtask — deterministic, because
 * nothing in these fakes waits on a timer or on I/O.
 *
 * Written for the PR #114 review (2026-09-29) and hardened by its mutation
 * audit: each case below failed against at least one surviving mutant.
 */

import { beforeEach, describe, expect, test } from 'bun:test';
import { DedaloError, isDedaloError, toErrorBody } from '../../src/core/errors/index.ts';
import { specOf } from '../../src/core/errors/registry.ts';
import {
	assertHopAllowed,
	hostMatches,
	MAX_REDIRECTS,
	MAX_URL_LENGTH,
	nextPlan,
	siteKey,
} from '../../src/core/harvest/follow.ts';
import {
	decodeBody,
	HARVEST_DEFAULT_IDLE_TIMEOUT_MS,
	HARVEST_DEFAULT_MAX_BYTES,
	HARVEST_DEFAULT_TIMEOUT_MS,
	HARVEST_MAX_BYTES,
	HARVEST_MAX_TIMEOUT_MS,
	HARVEST_USER_AGENT,
	type HarvestDeps,
	type HarvestRequest,
	harvestFetch,
	retryAfterMs,
} from '../../src/core/harvest/harvest.ts';
import {
	acquireTurn,
	clearPacingForTests,
	MAX_INTERVAL_MS,
	MIN_INTERVAL_MS,
	type PacingDeps,
	paceInterval,
	trackedOrigins,
} from '../../src/core/harvest/pacing.ts';
import { siteOf, UNPARSEABLE_SITE, unexpectedType } from '../../src/core/harvest/refusals.ts';
import {
	cachedRobotsOrigins,
	cachedRobotsWeight,
	canonicalPath,
	clearRobotsCache,
	escapeWildcards,
	globMatches,
	isPathAllowed,
	linearIndexOf,
	parseRobots,
	pathVerdict,
	policyFromResponse,
	ROBOTS_CACHE_MAX_WEIGHT,
	ROBOTS_FAILURE_TTL_MS,
	ROBOTS_MAX_BYTES,
	ROBOTS_MAX_MATCH_WORK,
	ROBOTS_MAX_ORIGINS,
	ROBOTS_MAX_PATTERN_LENGTH,
	ROBOTS_MAX_RULES,
	ROBOTS_RULE_WEIGHT,
	ROBOTS_TTL_MS,
	type RobotsPolicy,
	robotsPolicyFor,
	robotsText,
} from '../../src/core/harvest/robots.ts';
import { runWithJobSignal } from '../../src/core/media/job_scope.ts';
import {
	fetchPinnedHop,
	type PinnedHopRequest,
	type PinnedHopResponse,
	SSRF_REFUSAL_KINDS,
} from '../../src/core/security/ssrf_guard.ts';

// ---------------------------------------------------------------------------
// The fake site
// ---------------------------------------------------------------------------

/** A scripted answer. A 301/302/303/307/308 with `location` is a redirect. */
interface Scripted {
	status: number;
	body?: string;
	location?: string;
	contentType?: string;
	headers?: Record<string, string>;
	/** Thrown instead of answering (a refusal, a transport failure). */
	error?: unknown;
	/** Held until this settles (a slow site). */
	gate?: Promise<void>;
}

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

/** Answer one request the way the primitive would: cap, overflow, acceptBody. */
function scriptedResponse(request: PinnedHopRequest, answer: Scripted): PinnedHopResponse {
	const headers = new Headers(answer.headers);
	if (answer.contentType !== undefined) headers.set('content-type', answer.contentType);
	const location = REDIRECT_STATUSES.has(answer.status) ? (answer.location ?? null) : null;
	const base = { status: answer.status, headers, location, truncated: false };
	if (location !== null || request.acceptBody?.(answer.status, headers) === false) {
		return { ...base, bytes: new Uint8Array(0), bodySkipped: true };
	}
	const body = new TextEncoder().encode(answer.body ?? '');
	if (body.byteLength <= request.maxBytes) return { ...base, bytes: body, bodySkipped: false };
	if (request.overflow !== 'truncate') {
		throw new DedaloError('security.outbound_failed', {
			coordinates: { reason: 'body_cap', max_bytes: request.maxBytes },
		});
	}
	return {
		...base,
		bytes: body.subarray(0, request.maxBytes),
		truncated: true,
		bodySkipped: false,
	};
}

interface FakeSite {
	deps: HarvestDeps;
	/** Every request the door sent, in order. */
	sent: PinnedHopRequest[];
	/** Every pacing sleep, in ms. */
	slept: number[];
	/** Drain timers scheduled (never run unless a test runs them). */
	timers: { callback: () => void; ms: number }[];
	clock: { now: number };
}

/** A fake site: answers by URL, records every request, owns the clock. */
function fakeSite(routes: Record<string, Scripted>): FakeSite {
	const sent: PinnedHopRequest[] = [];
	const slept: number[] = [];
	const timers: FakeSite['timers'] = [];
	const clock = { now: 1_000_000 };
	const hop = async (request: PinnedHopRequest): Promise<PinnedHopResponse> => {
		sent.push(request);
		const answer = routes[request.url.toString()] ?? { status: 404 };
		if (answer.gate !== undefined) await answer.gate;
		if (answer.error !== undefined) throw answer.error;
		return scriptedResponse(request, answer);
	};
	const deps: HarvestDeps = {
		hop,
		now: () => clock.now,
		sleep: async (ms) => {
			slept.push(ms);
			clock.now += ms;
		},
		setTimer: (callback, ms) => {
			timers.push({ callback, ms });
		},
	};
	return { deps, sent, slept, timers, clock };
}

/** The paths of the requests sent to `host`. */
function pathsSent(site: FakeSite, host: string): string[] {
	return site.sent
		.filter((r) => r.url.host === host)
		.map((r) => `${r.url.pathname}${r.url.search}`);
}

/** The DedaloError a rejected promise carried (fails the test if it resolved). */
async function failureOf(promise: Promise<unknown>): Promise<DedaloError> {
	try {
		await promise;
	} catch (error) {
		if (isDedaloError(error)) return error;
		throw new Error(`untyped failure: ${String(error)}`);
	}
	throw new Error('expected a failure, the promise resolved');
}

async function codeOf(promise: Promise<unknown>): Promise<string> {
	try {
		await promise;
		return 'none';
	} catch (error) {
		return isDedaloError(error) ? error.code : `untyped: ${String(error)}`;
	}
}

/**
 * Drain every pending microtask. Deterministic here: the fakes resolve through
 * promises only, so after one macrotask tick everything that CAN run has run.
 */
function settle(): Promise<void> {
	return new Promise((resolve) => setImmediate(resolve));
}

/** A promise and the function that settles it. */
function deferred(): { promise: Promise<void>; resolve: () => void } {
	let resolve = (): void => {};
	const promise = new Promise<void>((done) => {
		resolve = done;
	});
	return { promise, resolve };
}

function harvest(site: FakeSite, request: Partial<HarvestRequest> & { url: string }) {
	return harvestFetch({ hosts: 'public', ...request }, site.deps);
}

const NOT_FOUND: Scripted = { status: 404 };

beforeEach(() => {
	clearRobotsCache();
	clearPacingForTests();
});

// ---------------------------------------------------------------------------
// robots.txt — parsing and matching (RFC 9309)
// ---------------------------------------------------------------------------

/**
 * THE DOCUMENTED NUMBERS, pinned literally — once each. Every other case reads the
 * exported constant, so a silent change to one (20 MiB → 21, an hour → a day) would
 * move the test with it and stay green; these are what server_contract.md and
 * OUTBOUND_SPEC.md promise, and changing one is a documented decision.
 */
describe('the documented bounds', () => {
	test('each bound is the number the documentation states', () => {
		const MiB = 1024 * 1024;
		expect(HARVEST_DEFAULT_MAX_BYTES).toBe(20 * MiB);
		expect(HARVEST_MAX_BYTES).toBe(100 * MiB);
		expect(HARVEST_DEFAULT_TIMEOUT_MS).toBe(120_000);
		expect(HARVEST_MAX_TIMEOUT_MS).toBe(600_000);
		expect(HARVEST_DEFAULT_IDLE_TIMEOUT_MS).toBe(30_000);
		expect(MAX_REDIRECTS).toBe(5);
		expect(MAX_URL_LENGTH).toBe(4096);
		expect(MIN_INTERVAL_MS).toBe(3_000);
		expect(MAX_INTERVAL_MS).toBe(60_000);
		expect(ROBOTS_MAX_BYTES).toBe(512 * 1024);
		expect(ROBOTS_TTL_MS).toBe(3_600_000);
		expect(ROBOTS_FAILURE_TTL_MS).toBe(300_000);
		expect(ROBOTS_MAX_ORIGINS).toBe(512);
		expect(ROBOTS_MAX_RULES).toBe(4096);
		expect(ROBOTS_MAX_PATTERN_LENGTH).toBe(2048);
		expect(ROBOTS_CACHE_MAX_WEIGHT).toBe(16 * MiB);
		expect(ROBOTS_RULE_WEIGHT).toBe(80);
		expect(ROBOTS_MAX_MATCH_WORK).toBe(8 * MiB);
	});
});

describe('robots.txt — RFC 9309 group selection and matching', () => {
	const text = [
		'User-agent: *',
		'Disallow: /',
		'',
		'User-agent: Dedalo',
		'User-agent: otherbot',
		'Disallow: /private',
		'Allow: /private/open',
		'Disallow: /*.pdf$',
		'Crawl-delay: 7',
	].join('\n');

	test('a group naming our token wins over *, and all its agents share it', () => {
		const policy = parseRobots(text);
		expect(isPathAllowed(policy, '/catalogue')).toBe(true); // * says "/" — not ours
		expect(isPathAllowed(policy, '/private/x')).toBe(false);
		expect(policy.kind === 'rules' && policy.crawlDelayMs).toBe(7000);
	});

	test('the product token is the leading [a-zA-Z_-]+ of the value, any case', () => {
		const ours = (agent: string) =>
			isPathAllowed(
				parseRobots(`User-agent: *\nDisallow: /\n\nUser-agent: ${agent}\nAllow: /`),
				'/x',
			);
		expect(ours('dedalo/7')).toBe(true);
		expect(ours('Dedalo bot')).toBe(true);
		expect(ours('DEDALO')).toBe(true);
		expect(ours('dedalobot')).toBe(false);
		expect(ours('otherbot dedalo')).toBe(false);
	});

	test('a Sitemap or Crawl-delay line between user-agent lines does not split the group', () => {
		for (const between of ['Sitemap: https://a.test/s.xml', 'Crawl-delay: 5']) {
			const policy = parseRobots(
				`User-agent: dedalo\n${between}\nUser-agent: otherbot\nDisallow: /x`,
			);
			expect(isPathAllowed(policy, '/x'), between).toBe(false);
		}
		// …while a rule line DOES end it: the next user-agent starts a new group.
		const split = parseRobots('User-agent: dedalo\nAllow: /\nUser-agent: otherbot\nDisallow: /x');
		expect(isPathAllowed(split, '/x')).toBe(true);
	});

	test('longest match wins, and Allow wins a tie — in either order of the lines', () => {
		const policy = parseRobots(text);
		expect(isPathAllowed(policy, '/private/open/lot1')).toBe(true);
		const tie = parseRobots('User-agent: *\nDisallow: /a\nAllow: /a');
		expect(isPathAllowed(tie, '/a/b')).toBe(true);
		const allowFirst = parseRobots('User-agent: *\nAllow: /page\nDisallow: /page');
		expect(isPathAllowed(allowFirst, '/page')).toBe(true);
	});

	test('a value with no space after the colon is the same rule', () => {
		const policy = parseRobots('User-agent:*\nDisallow:/private');
		expect(isPathAllowed(policy, '/private/x')).toBe(false);
		expect(isPathAllowed(policy, '/public')).toBe(true);
	});

	test('longest match wins the other way too: a shorter Allow never beats a longer Disallow', () => {
		// §2.2.2: length decides, not the kind — in either order of the lines.
		for (const lines of ['Allow: /\nDisallow: /private', 'Disallow: /private\nAllow: /']) {
			const policy = parseRobots(`User-agent: *\n${lines}`);
			expect(isPathAllowed(policy, '/private/x'), lines).toBe(false);
			expect(isPathAllowed(policy, '/public'), lines).toBe(true);
		}
	});

	test('every group naming us is merged, however it spells the token (§2.2.1)', () => {
		const policy = parseRobots(
			'User-agent: dedalo\nDisallow: /a\n\nUser-agent: *\nDisallow: /c\n\nUser-agent: Dedalo/7\nDisallow: /b\n',
		);
		expect(isPathAllowed(policy, '/a')).toBe(false);
		expect(isPathAllowed(policy, '/b')).toBe(false); // the SECOND group naming us
		expect(isPathAllowed(policy, '/c')).toBe(true); // `*` is not ours once one group is
	});

	test('* and $ mean what the RFC says; an empty Disallow allows everything', () => {
		const policy = parseRobots(text);
		expect(isPathAllowed(policy, '/docs/x.pdf')).toBe(false);
		expect(isPathAllowed(policy, '/docs/x.pdf?download=1')).toBe(true); // $ anchors
		expect(isPathAllowed(parseRobots('User-agent: *\nDisallow:'), '/anything')).toBe(true);
		expect(globMatches('/a*c', '/abbbc/x')).toBe(true);
		expect(globMatches('/a*c$', '/abbbc/x')).toBe(false);
		// A MIDDLE segment is required: missing, the glob does not match.
		expect(globMatches('/a*b*c', '/ac')).toBe(false);
		expect(globMatches('/a*b*c$', '/ac')).toBe(false);
		expect(globMatches('/a*b*c', '/a-b-c')).toBe(true);
	});

	test('a single-segment $ anchors: "Allow: /$" admits the root and nothing else', () => {
		const policy = parseRobots('User-agent: *\nDisallow: /\nAllow: /$');
		expect(isPathAllowed(policy, '/')).toBe(true);
		expect(isPathAllowed(policy, '/x')).toBe(false);
	});

	test('/robots.txt itself is always allowed', () => {
		const policy = parseRobots('User-agent: *\nDisallow: /');
		expect(isPathAllowed(policy, '/robots.txt')).toBe(true);
		expect(isPathAllowed(policy, '/robots.txt.bak')).toBe(false);
	});

	test('without our group or a * group, nothing is disallowed', () => {
		expect(isPathAllowed(parseRobots('User-agent: somebot\nDisallow: /'), '/x')).toBe(true);
	});

	test('a path is also judged in canonical form: doubled slashes and ;params cannot dodge', () => {
		const policy = parseRobots('User-agent: *\nDisallow: /private');
		expect(canonicalPath('//private/lot')).toBe('/private/lot');
		expect(canonicalPath('/;x/private?a=1;b')).toBe('/private?a=1;b');
		expect(isPathAllowed(policy, '//private/lot')).toBe(false);
		expect(isPathAllowed(policy, '/;x/private')).toBe(false);
		expect(isPathAllowed(policy, '/public;private')).toBe(true);
	});

	test('Crawl-delay: empty, negative or non-numeric asks nothing; the first usable one wins', () => {
		const delay = (lines: string) => {
			const policy = parseRobots(`User-agent: *\n${lines}`);
			return policy.kind === 'rules' ? policy.crawlDelayMs : 'not rules';
		};
		expect(delay('Crawl-delay:')).toBeNull();
		expect(delay('Crawl-delay: abc')).toBeNull();
		expect(delay('Crawl-delay: -1')).toBeNull();
		expect(delay('Crawl-delay: 2\nCrawl-delay: 9')).toBe(2000);
		expect(delay('Crawl-delay: abc\nCrawl-delay: 4')).toBe(4000);
		expect(delay('Crawl-delay: 1.5')).toBe(1500);
	});

	test('status decides meaning: 4xx allows all; 5xx, 429 and a bare 3xx refuse all', () => {
		expect(policyFromResponse(400, '').kind).toBe('allow_all'); // the first 4xx
		expect(policyFromResponse(404, '').kind).toBe('allow_all');
		expect(policyFromResponse(401, '').kind).toBe('allow_all');
		expect(policyFromResponse(499, '').kind).toBe('allow_all');
		expect(policyFromResponse(500, '').kind).toBe('unavailable');
		expect(policyFromResponse(399, '').kind).toBe('unavailable');
		expect(policyFromResponse(299, 'User-agent: *\nDisallow: /').kind).toBe('rules');
		expect(policyFromResponse(503, '').kind).toBe('unavailable');
		expect(policyFromResponse(429, '').kind).toBe('unavailable');
		expect(policyFromResponse(302, '').kind).toBe('unavailable');
		expect(policyFromResponse(300, '').kind).toBe('unavailable');
		expect(policyFromResponse(200, 'User-agent: *\nDisallow: /').kind).toBe('rules');
		expect(isPathAllowed({ kind: 'unavailable' }, '/')).toBe(false);
		expect(isPathAllowed({ kind: 'too_complex' }, '/')).toBe(false);
	});

	test('an inline comment ends the rule; a rule before any User-agent belongs to nobody', () => {
		const policy = parseRobots('Disallow: /orphan\nUser-agent: *\nDisallow: /private # staff only');
		expect(isPathAllowed(policy, '/private/x')).toBe(false);
		expect(isPathAllowed(policy, '/orphan')).toBe(true);
	});

	test('one percent-encoding: %xx hex case, and non-ASCII as UTF-8 octets, never dodge a rule', () => {
		const lowerHex = parseRobots('User-agent: *\nDisallow: /a%2fb');
		expect(isPathAllowed(lowerHex, '/a%2Fb')).toBe(false); // a URL's path is upper-case hex
		const unicode = parseRobots('User-agent: *\nDisallow: /café');
		expect(isPathAllowed(unicode, '/caf%C3%A9')).toBe(false); // what new URL() sends
		expect(isPathAllowed(unicode, new URL('https://s.test/café').pathname)).toBe(false);
	});

	test('one percent-encoding: %XX of an unreserved character IS that character', () => {
		const policy = parseRobots('User-agent: *\nDisallow: /private\nDisallow: /~user');
		expect(isPathAllowed(policy, '/%70rivate')).toBe(false);
		expect(isPathAllowed(policy, '/%7Euser')).toBe(false);
		expect(isPathAllowed(parseRobots('User-agent: *\nDisallow: /%7euser'), '/~user')).toBe(false);
	});

	test('one percent-encoding: space, {}, " and | meet in one form, whichever side encodes', () => {
		// The path is what `new URL()` sends: it encodes space, {, }, " and keeps | and ^.
		const refuses = (rule: string, url: string): boolean => {
			const parsed = new URL(url);
			const policy = parseRobots(`User-agent: *\nDisallow: ${rule}`);
			return !isPathAllowed(policy, `${parsed.pathname}${parsed.search}`);
		};
		const pairs: [string, string][] = [
			['/Collections Online/', 'https://s.test/Collections Online/lot1'],
			['/Collections%20Online/', 'https://s.test/Collections Online/lot1'],
			['/search/{id}', 'https://s.test/search/{id}'],
			['/search/%7Bid%7D', 'https://s.test/search/{id}'],
			['/q?term="', 'https://s.test/q?term="x'],
			['/q?term=%22', 'https://s.test/q?term="x'],
			['/a%7Cb', 'https://s.test/a|b'],
			['/a|b', 'https://s.test/a|b'],
			['/a|b', 'https://s.test/a%7Cb'],
			['/a%5Eb', 'https://s.test/a^b'],
		];
		for (const [rule, url] of pairs) expect(refuses(rule, url), `${rule} vs ${url}`).toBe(true);
		expect(refuses('/a|b', 'https://s.test/ab')).toBe(false);
	});

	test('RFC 9309 §2.2.2 table, rows 1-5: each rule reaches the path a URL sends', () => {
		const rows: [string, string][] = [
			['/foo/bar?baz=quz', '/foo/bar?baz=quz'],
			['/foo/bar?baz=https://foo.bar', '/foo/bar?baz=https%3A%2F%2Ffoo.bar'],
			['/foo/bar/ツ', '/foo/bar/%E3%83%84'],
			['/foo/bar/%E3%83%84', '/foo/bar/%E3%83%84'],
			['/foo/bar/%62%61%7A', '/foo/bar/baz'],
		];
		for (const [rule, path] of rows) {
			const policy = parseRobots(`User-agent: *\nDisallow: ${rule}`);
			expect(isPathAllowed(policy, path), rule).toBe(false);
		}
		// The rule's side decoded too: an encoded reserved rule reaches the raw character.
		expect(isPathAllowed(parseRobots('User-agent: *\nDisallow: /a%3Ab'), '/a:b')).toBe(false);
	});

	test('the reserved-decoded form only refuses more; %2A and %24 never become * or $', () => {
		// Decoded, the Allow ties the Disallow and would win — the exact form still refuses.
		const policy = parseRobots('User-agent: *\nDisallow: /a%2Fb\nAllow: /a/b');
		expect(isPathAllowed(policy, '/a%2Fb')).toBe(false);
		expect(isPathAllowed(policy, '/a/b')).toBe(true);
		const star = parseRobots('User-agent: *\nDisallow: /a%2Ab\nDisallow: /c%24');
		expect(isPathAllowed(star, '/aXXb')).toBe(true);
		expect(isPathAllowed(star, '/c/more')).toBe(true);
		expect(isPathAllowed(star, '/a%2Ab')).toBe(false);
	});

	test('RFC 9309 §2.2.3 table: %2A and %24 in a rule reach a literal * and $ in the path', () => {
		const rows: [string, string][] = [
			['/path/file-with-a-%2A.html', '/path/file-with-a-*.html'],
			['/path/foo-%24', '/path/foo-$'],
		];
		for (const [rule, url] of rows) {
			const parsed = new URL(`https://www.example.com${url}`);
			const policy = parseRobots(`User-agent: *\nDisallow: ${rule}`);
			expect(isPathAllowed(policy, `${parsed.pathname}${parsed.search}`), rule).toBe(false);
		}
		expect(escapeWildcards('/a*b$')).toBe('/a%2Ab%24');
		// Still literal-only: %2A is no wildcard, and a mid-pattern $ still meets a literal one.
		const star = parseRobots('User-agent: *\nDisallow: /a%2Ab');
		expect(isPathAllowed(star, '/aXb')).toBe(true);
		expect(isPathAllowed(parseRobots('User-agent: *\nDisallow: /a$b'), '/a$b')).toBe(false);
	});

	test('a path with no second form is judged ONCE: forms are deduplicated before weighing', () => {
		// 4096 wildcard rules against a 1500-character plain path: one form fits the work
		// bound, two would not — so a judgement repeated for an identical form refuses it.
		const policy = parseRobots(`User-agent: *\n${'Disallow: *zz\n'.repeat(ROBOTS_MAX_RULES)}`);
		expect(pathVerdict(policy, `/${'a'.repeat(1500)}`)).toBe('allowed');
		expect(pathVerdict(policy, `/${'a'.repeat(1500)}zz`)).toBe('disallowed');
		// With a reserved-decoded rule list, a plain path is two judgements (one per list),
		// never one per duplicate spelling: 700 characters fit twice, not five times.
		const reserved = parseRobots(
			`User-agent: *\nDisallow: /q%2Fr\n${'Disallow: *zz\n'.repeat(ROBOTS_MAX_RULES - 1)}`,
		);
		expect(pathVerdict(reserved, `/${'a'.repeat(700)}`)).toBe('allowed');
	});

	test('a robots.txt that is not UTF-8 is read byte-wise, and its rules still bind', () => {
		const latin1 = Uint8Array.from([
			...new TextEncoder().encode('User-agent: *\nDisallow: /caf'),
			0xe9,
		]);
		const policy = parseRobots(robotsText(latin1, false));
		expect(isPathAllowed(policy, '/caf%E9')).toBe(false); // what the site's own links send
		expect(isPathAllowed(policy, '/cafe')).toBe(true);
		// Mixed: a UTF-8 line escapes to what the encoding makes of it; a BOM is dropped.
		const mixed = Uint8Array.from([
			0xef,
			0xbb,
			0xbf,
			...new TextEncoder().encode('User-agent: *\nDisallow: /café\nDisallow: /na'),
			0xef,
			0x76,
			0x65,
		]);
		const both = parseRobots(robotsText(mixed, false));
		expect(isPathAllowed(both, new URL('https://s.test/café').pathname)).toBe(false);
		expect(isPathAllowed(both, '/na%EFve')).toBe(false);
		expect(robotsText(new TextEncoder().encode('Disallow: /café'), false)).toBe('Disallow: /café');
	});

	test('glob edges: an anchored tail cannot overlap the prefix; segments cannot overlap', () => {
		expect(globMatches('/a*a$', '/a')).toBe(false);
		expect(globMatches('/a*a$', '/aa')).toBe(true);
		expect(globMatches('/*ab*ab', '/ab')).toBe(false);
		expect(globMatches('/*ab*ab', '/abab')).toBe(true);
	});

	test('a CR-only file splits into lines like any other', () => {
		expect(isPathAllowed(parseRobots('User-agent: *\rDisallow: /x'), '/x')).toBe(false);
		const bytes = new TextEncoder().encode('User-agent: *\rDisallow: /a\rDisallow: /pri');
		expect(robotsText(bytes, true)).toBe('User-agent: *\rDisallow: /a');
	});

	test('a truncated file loses its partial last line (half a rule is another rule)', () => {
		const bytes = new TextEncoder().encode('User-agent: *\nDisallow: /a\nDisallow: /pri');
		expect(robotsText(bytes, true)).toBe('User-agent: *\nDisallow: /a');
		expect(robotsText(bytes, false)).toEndWith('/pri');
		expect(robotsText(new TextEncoder().encode('no line break at all'), true)).toBe('');
		const policy = parseRobots(robotsText(bytes, true));
		expect(isPathAllowed(policy, '/private')).toBe(true);
		expect(isPathAllowed(policy, '/a')).toBe(false);
	});
});

describe('robots.txt — bounded work (M1)', () => {
	test('a many-star pattern costs one indexOf per star, never a backtracking search', () => {
		const pattern = `/${'*a'.repeat(40)}b`; // 40 stars
		const path = `/${'a'.repeat(50_000)}`;
		const original = String.prototype.indexOf;
		let calls = 0;
		String.prototype.indexOf = function (this: string, ...args: Parameters<string['indexOf']>) {
			calls++;
			return original.apply(this, args);
		};
		try {
			expect(globMatches(pattern, path)).toBe(false);
		} finally {
			String.prototype.indexOf = original;
		}
		expect(calls).toBe(40);
	});

	test('linearIndexOf finds what String.indexOf finds, on hostile and ordinary inputs', () => {
		const haystacks = ['', 'a', 'abab', 'aaaaaaab', 'abcabcabd', `/${'a'.repeat(300)}b`, 'xyz'];
		const needles = ['', 'a', 'ab', 'aab', 'abcabd', 'abab', `a${'b'}`, `${'a'.repeat(260)}b`, 'z'];
		for (const haystack of haystacks) {
			for (const needle of needles) {
				for (const from of [0, 1, 3, haystack.length]) {
					expect(linearIndexOf(haystack, needle, from), `${needle} in ${haystack} @${from}`).toBe(
						haystack.indexOf(needle, from),
					);
				}
			}
		}
	});

	/**
	 * The most rules of one kind a file may hold and still have `path` JUDGED (not
	 * refused as too complex) — found by bisection on the verdict itself, so each
	 * shape below is measured AT the work bound, never comfortably under it.
	 */
	function largestJudged(rule: string, path: string): RobotsPolicy {
		const fileOf = (count: number) => parseRobots(`User-agent: *\n${`${rule}\n`.repeat(count)}`);
		let low = 1;
		let high = ROBOTS_MAX_RULES;
		while (low < high) {
			const middle = Math.ceil((low + high) / 2);
			const candidate = fileOf(middle);
			// A file past its own bounds is no policy at all: too big, like past the work bound.
			if (candidate.kind !== 'rules' || pathVerdict(candidate, path) === 'too_complex')
				high = middle - 1;
			else low = middle;
		}
		const policy = fileOf(low);
		expect(pathVerdict(policy, path)).not.toBe('too_complex');
		expect(pathVerdict(fileOf(low + 1), path)).toBe('too_complex'); // it IS the bound
		return policy;
	}

	/** Milliseconds one verdict takes (the best of three: the gate measures work, not noise). */
	function verdictMs(policy: RobotsPolicy, path: string): number {
		let best = Number.POSITIVE_INFINITY;
		for (let run = 0; run < 3; run++) {
			const started = performance.now();
			pathVerdict(policy, path);
			best = Math.min(best, performance.now() - started);
		}
		return best;
	}

	/**
	 * The shapes that cost the most per character step, each AT the work bound:
	 *  - JSC's `String.indexOf` degrades once a needle passes ~256 characters, so a
	 *    257-character literal the path almost matches everywhere (measured
	 *    2026-09-29: 1.4 s of event loop for ONE hop with the old matcher);
	 *  - the bounds do not compose: a hop URL keeps `|` literal and the encoding
	 *    triples it, `//` makes the canonical form differ, `*` and `$` the escaped
	 *    one, `%3A` the reserved-decoded one — eight forms of a 12 000-character
	 *    path (measured 2026-09-29: 610 ms per hop against 4096 short `*` rules,
	 *    every input inside its own bound).
	 * At the bound a linear matcher takes about 25 ms; the ceiling is ten times that.
	 */
	test('every hostile shape at the work bound is judged within the ceiling', () => {
		const flat = `/${'a'.repeat(MAX_URL_LENGTH - 30)}`;
		const amplified = new URL(`https://evil.test/x//${'|'.repeat(MAX_URL_LENGTH - 42)}*$%3A`);
		expect(amplified.href.length).toBeLessThanOrEqual(MAX_URL_LENGTH);
		expect(() => assertHopAllowed(amplified, null, { hosts: 'public' })).not.toThrow();
		const shapes: [string, string][] = [
			[`Disallow: /*ab${'a'.repeat(255)}`, flat],
			[`Disallow: /*ab${'a'.repeat(255)}*z`, flat], // the literal as a MIDDLE segment
			[`Disallow: *${'|'.repeat(40)}X`, `${amplified.pathname}${amplified.search}`],
			[`Disallow: *${'a'.repeat(60)}b`, `/${'a'.repeat(MAX_URL_LENGTH - 30)}%3A`],
		];
		for (const [rule, path] of shapes) {
			const policy = largestJudged(rule, path);
			expect(verdictMs(policy, path), rule.slice(0, 24)).toBeLessThan(250);
		}
	});

	test('past the work bound a hop is refused unmatched: 4096 short * rules, eight path forms', () => {
		const url = new URL(`https://evil.test/x//${'|'.repeat(MAX_URL_LENGTH - 42)}*$%3A`);
		const policy = parseRobots(
			`User-agent: *\n${`Disallow: *${'|'.repeat(40)}X\n`.repeat(ROBOTS_MAX_RULES)}`,
		);
		expect(policy.kind).toBe('rules'); // every INPUT is inside its own bound
		const started = performance.now();
		expect(pathVerdict(policy, `${url.pathname}${url.search}`)).toBe('too_complex');
		expect(isPathAllowed(policy, `${url.pathname}${url.search}`)).toBe(false); // fails closed
		expect(performance.now() - started).toBeLessThan(50); // weighed, never matched
		// The same file judges an ordinary path: the refusal is the hop's, not the file's.
		expect(pathVerdict(policy, '/catalogue/lot-17')).toBe('allowed');
	});

	test('a hop past the work bound is harvest.refused robots_too_complex, the page never asked', async () => {
		const path = `/x//${'|'.repeat(MAX_URL_LENGTH - 42)}*$%3A`;
		const site = fakeSite({
			'https://heavy.test/robots.txt': {
				status: 200,
				body: `User-agent: *\n${`Disallow: *${'|'.repeat(40)}X\n`.repeat(ROBOTS_MAX_RULES)}`,
			},
		});
		const error = await failureOf(harvest(site, { url: `https://heavy.test${path}` }));
		expect(toErrorBody(error).details).toEqual({
			site: 'https://heavy.test',
			reason: 'robots_too_complex',
		});
		expect(pathsSent(site, 'heavy.test')).toEqual(['/robots.txt']);
	});

	test('a file within the byte ceiling is obeyed as written, whatever its script (§2.5)', () => {
		// 3-byte characters: nine pattern characters each once encoded — a file of them
		// near the byte ceiling holds three times its size in pattern text.
		const rule = `Disallow: /${'漢'.repeat(200)}\n`; // 612 bytes, 1801 encoded characters
		const count = Math.min(ROBOTS_MAX_RULES, Math.floor((ROBOTS_MAX_BYTES - 20) / 612));
		const body = `User-agent: *\n${rule.repeat(count)}`;
		expect(new TextEncoder().encode(body).length).toBeLessThanOrEqual(ROBOTS_MAX_BYTES);
		const policy = parseRobots(body);
		expect(policy.kind).toBe('rules');
		expect(isPathAllowed(policy, `/${encodeURI('漢'.repeat(200))}/x`)).toBe(false);
		expect(isPathAllowed(policy, '/other')).toBe(true);
	});

	test('ONE reserved escape does not turn a large file into too_complex', () => {
		// Measured 2026-09-29: 3000 rules parsed, and one added `/a%2Fb` refused the whole
		// file — the decoded form was a full second copy counted against a text total.
		const rules = Array.from({ length: 3000 }, (_, i) => `Disallow: /${'x'.repeat(80)}${i}\n`);
		const body = `User-agent: *\n${rules.join('')}Disallow: /a%2Fb\n`;
		const policy = parseRobots(body);
		expect(policy.kind).toBe('rules');
		expect(isPathAllowed(policy, '/a/b')).toBe(false);
		expect(isPathAllowed(policy, '/a%2Fb')).toBe(false);
		// …and the decoded form shares every rule it leaves unchanged.
		if (policy.kind !== 'rules' || policy.reservedRules === null) throw new Error('two forms');
		expect(policy.reservedRules[0] === policy.rules[0]).toBe(true);
		expect(policy.reservedRules[3000] === policy.rules[3000]).toBe(false);
	});

	test('past the rule or pattern bound the file is refused whole, never truncated', () => {
		const many = `User-agent: *\n${'Disallow: /x\n'.repeat(ROBOTS_MAX_RULES + 1)}`;
		expect(parseRobots(many).kind).toBe('too_complex');
		const long = `User-agent: *\nDisallow: /${'a'.repeat(ROBOTS_MAX_PATTERN_LENGTH)}`;
		expect(parseRobots(long).kind).toBe('too_complex');
		const atBound = `User-agent: *\n${'Disallow: /x\n'.repeat(ROBOTS_MAX_RULES)}`;
		expect(parseRobots(atBound).kind).toBe('rules');
	});

	test('a too-complex file refuses the harvest as harvest.refused, not retryable', async () => {
		const site = fakeSite({
			'https://big.test/robots.txt': {
				status: 200,
				body: `User-agent: *\n${'Disallow: /x\n'.repeat(ROBOTS_MAX_RULES + 1)}`,
			},
		});
		const error = await failureOf(harvest(site, { url: 'https://big.test/lot' }));
		expect(error.code).toBe('harvest.refused');
		expect(toErrorBody(error).details).toEqual({
			site: 'https://big.test',
			reason: 'robots_too_complex',
		});
		expect(toErrorBody(error).retryable).toBe(false);
	});

	test('after a redirect, robots_too_complex names the site whose robots.txt decided', async () => {
		// The disclosure rule (refusals.ts): every robots verdict names the deciding
		// origin, which already answered its robots.txt from a public address.
		const site = fakeSite({
			'https://asked.test/robots.txt': NOT_FOUND,
			'https://asked.test/lot': { status: 302, location: 'https://other.test/lot' },
			'https://other.test/robots.txt': {
				status: 200,
				body: `User-agent: *\n${'Disallow: /x\n'.repeat(ROBOTS_MAX_RULES + 1)}`,
			},
		});
		const error = await failureOf(harvest(site, { url: 'https://asked.test/lot' }));
		expect(toErrorBody(error).details).toEqual({
			site: 'https://other.test',
			reason: 'robots_too_complex',
		});
	});

	test('a hop URL past MAX_URL_LENGTH is refused; one exactly at it is not', () => {
		const base = 'https://a.test/';
		const at = new URL(`${base}${'a'.repeat(MAX_URL_LENGTH - base.length)}`);
		expect(at.href.length).toBe(MAX_URL_LENGTH);
		expect(() => assertHopAllowed(at, null, { hosts: 'public' })).not.toThrow();
		const over = new URL(`${base}${'a'.repeat(MAX_URL_LENGTH - base.length + 1)}`);
		expect(() => assertHopAllowed(over, null, { hosts: 'public' })).toThrow(DedaloError);
		try {
			assertHopAllowed(over, null, { hosts: 'public' });
		} catch (error) {
			expect((error as DedaloError).details?.reason).toBe('url_too_long');
		}
	});
});

// ---------------------------------------------------------------------------
// robots.txt — the fetch, its policy, its cache
// ---------------------------------------------------------------------------

describe('robots.txt — the fetch runs under the door’s own policy', () => {
	test('it sends its OWN headers, never the caller’s Accept or Referer', async () => {
		const site = fakeSite({
			'https://h.test/robots.txt': NOT_FOUND,
			'https://h.test/': { status: 200 },
		});
		await harvest(site, {
			url: 'https://h.test/',
			headers: { Accept: 'application/json', Referer: 'https://secret.test/page' },
		});
		const robots = site.sent[0];
		expect(robots?.url.pathname).toBe('/robots.txt');
		expect(robots?.headers.get('accept')).toBe('text/plain, */*;q=0.1');
		expect(robots?.headers.get('referer')).toBeNull();
		expect(robots?.headers.get('user-agent')).toBe(HARVEST_USER_AGENT);
		expect(site.sent[1]?.headers.get('referer')).toBe('https://secret.test/page');
	});

	test('a cross-authority redirect is followed, and the verdict applies to the origin asked', async () => {
		const site = fakeSite({
			'https://off.test/robots.txt': {
				status: 302,
				location: 'https://cdn.example/robots/off.txt',
			},
			'https://cdn.example/robots/off.txt': { status: 200, body: 'User-agent: *\nDisallow: /x' },
			'https://off.test/y': { status: 200 },
		});
		expect(await codeOf(harvest(site, { url: 'https://off.test/x' }))).toBe(
			'harvest.robots_disallowed',
		);
		expect(pathsSent(site, 'cdn.example')).toEqual(['/robots/off.txt']);
		const answer = await harvest(site, { url: 'https://off.test/y' });
		expect(answer.ok).toBe(true);
		expect(pathsSent(site, 'cdn.example')).toHaveLength(1); // cached for off.test
	});

	test('a robots redirect is followed even when the caller allowlists only the page’s host', async () => {
		const site = fakeSite({
			'https://site.test/robots.txt': { status: 301, location: 'https://www.site.test/robots.txt' },
			'https://www.site.test/robots.txt': { status: 200, body: 'User-agent: *\nDisallow: /no' },
		});
		expect(await codeOf(harvest(site, { url: 'https://site.test/no', hosts: ['site.test'] }))).toBe(
			'harvest.robots_disallowed',
		);
	});

	test('a 3xx without a Location is unavailable, not "allow all"', async () => {
		const site = fakeSite({ 'https://bare.test/robots.txt': { status: 302 } });
		expect(await codeOf(harvest(site, { url: 'https://bare.test/lot' }))).toBe(
			'harvest.robots_unavailable',
		);
	});

	test('a robots redirect the URL rules refuse is harvest.refused, NOT retryable, kept the full TTL', async () => {
		const site = fakeSite({
			'https://a.test/robots.txt': { status: 301, location: 'http://a.test/robots.txt' },
		});
		const error = await failureOf(harvest(site, { url: 'https://a.test/lot' }));
		expect(error.code).toBe('harvest.refused');
		expect(toErrorBody(error).details).toEqual({
			site: 'https://a.test',
			reason: 'robots_redirect_refused',
		});
		expect(toErrorBody(error).retryable).toBe(false);
		expect(site.sent.map((r) => r.url.href)).toEqual(['https://a.test/robots.txt']);
		// Deterministic, so not re-asked after the failure TTL (an outage would be).
		site.clock.now += ROBOTS_FAILURE_TTL_MS + 1;
		expect(await codeOf(harvest(site, { url: 'https://a.test/lot' }))).toBe('harvest.refused');
		expect(site.sent).toHaveLength(1);
	});

	test('too many robots redirects reads as "allow all" (RFC 9309 §2.3.1.2)', async () => {
		const routes: Record<string, Scripted> = { 'https://loop.test/lot': { status: 200 } };
		routes['https://loop.test/robots.txt'] = { status: 302, location: '/r1' };
		for (let i = 1; i <= 10; i++)
			routes[`https://loop.test/r${i}`] = { status: 302, location: `/r${i + 1}` };
		const site = fakeSite(routes);
		const answer = await harvest(site, { url: 'https://loop.test/lot' });
		expect(answer.ok).toBe(true);
	});

	test('a file over the byte bound is read to the bound, not refused (§2.5)', async () => {
		const filler = `# ${'x'.repeat(100)}\n`.repeat(Math.ceil(ROBOTS_MAX_BYTES / 100));
		const site = fakeSite({
			'https://huge.test/robots.txt': {
				status: 200,
				body: `User-agent: *\nDisallow: /early\n${filler}Disallow: /late\n`,
			},
			'https://huge.test/late': { status: 200 },
		});
		expect(await codeOf(harvest(site, { url: 'https://huge.test/early' }))).toBe(
			'harvest.robots_disallowed',
		);
		expect((await harvest(site, { url: 'https://huge.test/late' })).ok).toBe(true);
		expect(site.sent[0]?.maxBytes).toBe(ROBOTS_MAX_BYTES);
		expect(site.sent[0]?.overflow).toBe('truncate');
	});

	test('the shared robots fetch ignores any one job’s stop signal; the page does not', async () => {
		const site = fakeSite({
			'https://job.test/robots.txt': NOT_FOUND,
			'https://job.test/': { status: 200 },
		});
		await harvest(site, { url: 'https://job.test/' });
		expect(site.sent.find((r) => r.url.pathname === '/robots.txt')?.detachedFromJob).toBe(true);
		expect(site.sent.find((r) => r.url.pathname === '/')?.detachedFromJob).toBeUndefined();
	});

	test('a stopped job leaves a robots load at once; the load finishes for everyone else', async () => {
		const robotsGate = deferred();
		const robotsSent = deferred();
		const site = fakeSite({
			'https://wait.test/robots.txt': { status: 404, gate: robotsGate.promise },
			'https://wait.test/a': { status: 200 },
		});
		const hop = site.deps.hop;
		const deps: HarvestDeps = {
			...site.deps,
			hop: (request) => {
				if (request.url.pathname === '/robots.txt') robotsSent.resolve();
				return hop?.(request) as Promise<PinnedHopResponse>;
			},
		};
		const job = new AbortController();
		const stopped = runWithJobSignal(job.signal, () =>
			harvestFetch({ url: 'https://wait.test/a', hosts: 'public' }, deps),
		);
		await robotsSent.promise;
		job.abort();
		const error = await failureOf(stopped);
		expect(error.code).toBe('security.outbound_failed');
		expect(error.coordinates).toEqual({ reason: 'aborted', stage: 'robots' });
		// The load itself was never cancelled: release it, and another caller uses it.
		robotsGate.resolve();
		const answer = await harvestFetch({ url: 'https://wait.test/a', hosts: 'public' }, deps);
		expect(answer.ok).toBe(true);
		expect(pathsSent(site, 'wait.test')).toEqual(['/robots.txt', '/a']);
	});
});

describe('robots.txt — the per-origin cache', () => {
	test('two harvests of one origin read robots.txt once', async () => {
		const site = fakeSite({
			'https://c.test/robots.txt': NOT_FOUND,
			'https://c.test/a': { status: 200 },
			'https://c.test/b': { status: 200 },
		});
		await harvest(site, { url: 'https://c.test/a' });
		await harvest(site, { url: 'https://c.test/b' });
		expect(pathsSent(site, 'c.test')).toEqual(['/robots.txt', '/a', '/b']);
	});

	test('an unavailable verdict is re-asked after the failure TTL — a good one is kept longer', async () => {
		const site = fakeSite({ 'https://down.test/robots.txt': { status: 503 } });
		const now = () => site.clock.now;
		const ask = () => robotsPolicyFor(new URL('https://down.test/x'), now(), site.deps);
		expect((await ask()).kind).toBe('unavailable');
		site.clock.now += ROBOTS_FAILURE_TTL_MS - 1;
		await ask();
		expect(pathsSent(site, 'down.test')).toHaveLength(1);
		site.clock.now += 2;
		await ask();
		expect(pathsSent(site, 'down.test')).toHaveLength(2);

		const good = fakeSite({ 'https://up.test/robots.txt': NOT_FOUND });
		const askGood = () => robotsPolicyFor(new URL('https://up.test/x'), good.clock.now, good.deps);
		await askGood();
		good.clock.now += ROBOTS_FAILURE_TTL_MS + 1;
		await askGood();
		expect(pathsSent(good, 'up.test')).toHaveLength(1);
	});

	test('an origin the guard refuses is not remembered: the refusal is the answer every time', async () => {
		const refusal = new DedaloError('security.ssrf_blocked', {
			coordinates: { reason: 'private_resolved', host: 'inside.test' },
		});
		const site = fakeSite({ 'https://inside.test/robots.txt': { status: 0, error: refusal } });
		for (let i = 0; i < 2; i++) {
			expect(await codeOf(harvest(site, { url: 'https://inside.test/x' }))).toBe(
				'security.ssrf_blocked',
			);
		}
		expect(pathsSent(site, 'inside.test')).toEqual(['/robots.txt', '/robots.txt']);
		expect(cachedRobotsOrigins()).toBe(0);
	});

	test('the cache is bounded by what it retains, not only by origin count', async () => {
		// Each file holds as much pattern text as the byte ceiling admits; a handful of
		// them pass the cache's budget long before ROBOTS_MAX_ORIGINS entries.
		const rule = `Disallow: /${'x'.repeat(ROBOTS_MAX_PATTERN_LENGTH - 2)}\n`;
		const body = `User-agent: *\n${rule.repeat(Math.floor(ROBOTS_MAX_BYTES / rule.length) - 1)}`;
		const policy = parseRobots(body);
		const per = policy.kind === 'rules' ? policy.weight : 0;
		expect(per).toBeGreaterThan(0);
		const needed = Math.ceil(ROBOTS_CACHE_MAX_WEIGHT / per) + 2;
		const routes: Record<string, Scripted> = {};
		for (let i = 0; i < needed; i++)
			routes[`https://w${i}.test/robots.txt`] = { status: 200, body };
		const site = fakeSite(routes);
		for (let i = 0; i < needed; i++)
			await robotsPolicyFor(new URL(`https://w${i}.test/`), site.clock.now, site.deps);
		expect(cachedRobotsWeight()).toBeLessThanOrEqual(ROBOTS_CACHE_MAX_WEIGHT);
		expect(cachedRobotsOrigins()).toBeLessThan(needed);
		const before = site.sent.length;
		await robotsPolicyFor(new URL(`https://w${needed - 1}.test/`), site.clock.now, site.deps);
		expect(site.sent.length).toBe(before); // newest kept
		await robotsPolicyFor(new URL('https://w0.test/'), site.clock.now, site.deps);
		expect(site.sent.length).toBe(before + 1); // oldest evicted, fetched again
	});

	test('a policy weighs its rule OBJECTS too: exact rules, and the reserved rules it does not share', async () => {
		const site = fakeSite({
			'https://w.test/robots.txt': {
				status: 200,
				body: 'User-agent: *\nDisallow: /a%2Fb\nDisallow: /c\n',
			},
		});
		await robotsPolicyFor(new URL('https://w.test/'), site.clock.now, site.deps);
		const exact = '/a%2Fb'.length + '/c'.length + 2 * ROBOTS_RULE_WEIGHT;
		const reserved = '/a/b'.length + ROBOTS_RULE_WEIGHT + 8; // `/c` is shared: a slot
		expect(cachedRobotsWeight()).toBe(exact + reserved);
	});

	/**
	 * The budget is a promise about MEMORY, so it is measured as memory: 512 origins of
	 * 4096 one-character rules (plus one reserved escape, which once copied them all)
	 * pinned 230 MB while the weight read a quarter of its budget (measured 2026-09-29).
	 */
	test('512 hostile files of short rules retain no more than the cache budget', async () => {
		const body = `User-agent: *\n${'Disallow: /\n'.repeat(ROBOTS_MAX_RULES - 1)}Disallow: /%2F\n`;
		const encoded = new TextEncoder().encode(body);
		const hop = async () => ({
			status: 200,
			headers: new Headers(),
			location: null,
			bytes: encoded,
			truncated: false,
			bodySkipped: false,
		});
		clearRobotsCache();
		Bun.gc(true);
		const before = process.memoryUsage().heapUsed;
		const now = Date.now();
		for (let i = 0; i < ROBOTS_MAX_ORIGINS; i++)
			await robotsPolicyFor(new URL(`https://s${i}.hostile.test/x`), now, { hop });
		Bun.gc(true);
		const retained = process.memoryUsage().heapUsed - before;
		expect(cachedRobotsWeight()).toBeLessThanOrEqual(ROBOTS_CACHE_MAX_WEIGHT);
		expect(cachedRobotsOrigins()).toBeLessThan(ROBOTS_MAX_ORIGINS);
		// The estimate must not undercount: what is retained stays within the budget
		// (a quarter of slack for the heap's own noise).
		expect(retained).toBeLessThan(ROBOTS_CACHE_MAX_WEIGHT * 1.25);
		clearRobotsCache();
	}, 30_000);

	test('a trailing-dot host is the same server: one robots.txt read, one pace', async () => {
		const site = fakeSite({
			'https://dot.test/robots.txt': NOT_FOUND,
			'https://dot.test/a': { status: 200 },
			'https://dot.test./b': { status: 200 },
		});
		await harvest(site, { url: 'https://dot.test./b' });
		await harvest(site, { url: 'https://dot.test/a' });
		expect(site.sent.map((r) => r.url.href)).toEqual([
			'https://dot.test/robots.txt',
			'https://dot.test./b',
			'https://dot.test/a',
		]);
		expect(cachedRobotsOrigins()).toBe(1);
		// …and the second request waited out the first one's interval: one queue.
		expect(site.slept).toEqual([MIN_INTERVAL_MS]);
		expect(siteKey(new URL('https://Dot.Test.:8443/x'))).toBe('https://dot.test:8443');
		expect(siteKey(new URL('https://[::1]/x'))).toBe('https://[::1]');
	});

	test(`past ${ROBOTS_MAX_ORIGINS} origins the oldest is evicted`, async () => {
		const site = fakeSite({});
		const ask = (i: number) =>
			robotsPolicyFor(new URL(`https://o${i}.test/`), site.clock.now, site.deps);
		for (let i = 0; i <= ROBOTS_MAX_ORIGINS; i++) await ask(i);
		expect(cachedRobotsOrigins()).toBe(ROBOTS_MAX_ORIGINS);
		const before = site.sent.length;
		await ask(ROBOTS_MAX_ORIGINS); // newest: still cached
		expect(site.sent.length).toBe(before);
		await ask(0); // oldest: evicted, fetched again
		expect(site.sent.length).toBe(before + 1);
	});
});

describe('M2: an address refusal is reported AS itself, never as "robots unavailable"', () => {
	// Every address reason the guard can throw — read from its own compiler-checked table.
	const addressReasons = Object.entries(SSRF_REFUSAL_KINDS)
		.filter(([, kind]) => kind === 'address')
		.map(([reason]) => reason);
	test('the guard has address reasons to drive (anti-vacuity)', () => {
		expect(addressReasons.length).toBeGreaterThanOrEqual(7);
	});
	for (const reason of addressReasons) {
		test(`reason ${reason}`, async () => {
			const refusal = new DedaloError('security.ssrf_blocked', {
				coordinates: { reason, host: 'x.test' },
			});
			const site = fakeSite({ 'https://x.test/robots.txt': { status: 0, error: refusal } });
			const error = await failureOf(harvest(site, { url: 'https://x.test/admin' }));
			expect(error).toBe(refusal);
		});
	}

	test('a transport failure of the robots fetch IS "unavailable"', async () => {
		const failure = new DedaloError('security.outbound_failed', {
			coordinates: { reason: 'timeout', stage: 'connect' },
		});
		const site = fakeSite({ 'https://t.test/robots.txt': { status: 0, error: failure } });
		expect(await codeOf(harvest(site, { url: 'https://t.test/x' }))).toBe(
			'harvest.robots_unavailable',
		);
	});
});

// ---------------------------------------------------------------------------
// The per-hop policy: shape, host, redirects
// ---------------------------------------------------------------------------

describe('per-hop policy — URL shape and host', () => {
	test('an allowlist admits the site and its subdomains, never a look-alike', () => {
		expect(hostMatches('lots.example.org', ['example.org'])).toBe(true);
		expect(hostMatches('EXAMPLE.org.', ['example.org'])).toBe(true);
		expect(hostMatches('evilexample.org', ['example.org'])).toBe(false);
		expect(hostMatches('example.org.evil.net', ['example.org'])).toBe(false);
	});

	test('IPv6 literals match bracketed or bare, on either side; an IP admits only itself', () => {
		expect(hostMatches('[2606:4700:4700::1111]', ['2606:4700:4700::1111'])).toBe(true);
		expect(hostMatches('[2606:4700:4700::1111]', ['[2606:4700:4700::1111]'])).toBe(true);
		expect(hostMatches('2606:4700:4700::1111', ['[2606:4700:4700::1111]'])).toBe(true);
		expect(hostMatches('[2606:4700:4700::1112]', ['[2606:4700:4700::1111]'])).toBe(false);
		expect(hostMatches('9.1.2.3', ['1.2.3'])).toBe(false);
	});

	test('a foreign scheme, a credential (a user name alone too) and a downgrade are refused', () => {
		const https = new URL('https://a.test/');
		const cases: [string, URL | null, string][] = [
			['ftp://a.test/', null, 'protocol'],
			['https://user:pw@a.test/', null, 'credentials'],
			['https://user@a.test/', null, 'credentials'],
			['https://:secret@a.test/', null, 'credentials'], // a password alone too
			['http://a.test/x', https, 'downgrade'],
			['https://b.test/', null, 'host_not_allowed'],
		];
		for (const [url, previous, reason] of cases) {
			let caught: unknown;
			try {
				assertHopAllowed(new URL(url), previous, { hosts: ['a.test'] });
			} catch (error) {
				caught = error;
			}
			expect(isDedaloError(caught) && caught.code, url).toBe('harvest.refused');
			expect((caught as DedaloError).details?.reason, url).toBe(reason);
		}
		expect(() => assertHopAllowed(new URL('http://a.test/'), https, { hosts: 'public' })).toThrow();
		expect(() =>
			assertHopAllowed(new URL('http://a.test/'), null, { hosts: 'public' }),
		).not.toThrow();
	});

	test('requireHttps refuses an http first hop', () => {
		expect(() =>
			assertHopAllowed(new URL('http://a.test/'), null, { hosts: 'public', requireHttps: true }),
		).toThrow(DedaloError);
		expect(() =>
			assertHopAllowed(new URL('https://a.test/'), null, { hosts: 'public', requireHttps: true }),
		).not.toThrow();
	});

	test('the redirect rules: 303 → bodiless GET; 301/302 turn a POST into a GET; 307/308 keep both', () => {
		const post = { url: new URL('https://a.test/form'), method: 'POST' as const, body: 'q=1' };
		for (const status of [301, 302, 303]) {
			expect(nextPlan(post, status, '/result')).toEqual({
				url: new URL('https://a.test/result'),
				method: 'GET',
			});
		}
		for (const status of [307, 308]) {
			expect(nextPlan(post, status, '/again')).toEqual({
				...post,
				url: new URL('https://a.test/again'),
			});
		}
	});

	test('a Location that is not a URL is a hop refusal, not a raw TypeError', () => {
		const plan = { url: new URL('https://a.test/'), method: 'GET' as const };
		expect(() => nextPlan(plan, 302, 'http://[::1')).toThrow(DedaloError);
	});
});

describe('harvestFetch — redirects end to end', () => {
	test('an https → http redirect is refused and no http hop is ever sent', async () => {
		const site = fakeSite({
			'https://sec.test/robots.txt': NOT_FOUND,
			'https://sec.test/lot': { status: 301, location: 'http://sec.test/lot' },
			'http://sec.test/robots.txt': NOT_FOUND,
			'http://sec.test/lot': { status: 200 },
		});
		const error = await failureOf(harvest(site, { url: 'https://sec.test/lot' }));
		expect(error.code).toBe('harvest.refused');
		expect(error.details?.reason).toBe('downgrade');
		expect(site.sent.some((r) => r.url.protocol === 'http:')).toBe(false);
	});

	test('a bad Location after a cross-origin redirect names the site ASKED, the hop only in the log', async () => {
		const site = fakeSite({
			'https://a.test/robots.txt': NOT_FOUND,
			'https://a.test/x': { status: 302, location: 'https://other.test/y' },
			'https://other.test/robots.txt': NOT_FOUND,
			'https://other.test/y': { status: 302, location: 'http://[bad' },
		});
		const error = await failureOf(harvest(site, { url: 'https://a.test/x' }));
		expect(toErrorBody(error).details).toEqual({ site: 'https://a.test', reason: 'bad_location' });
		expect(error.coordinates?.hop).toBe('other.test');
	});

	test('a user name alone in the URL is refused before anything is sent', async () => {
		const site = fakeSite({});
		const error = await failureOf(harvest(site, { url: 'https://user@cred.test/' }));
		expect(error.details?.reason).toBe('credentials');
		expect(site.sent).toHaveLength(0);
	});

	test(`exactly ${MAX_REDIRECTS} redirects are followed; the next one is refused, never sent`, async () => {
		const chain = (length: number): Record<string, Scripted> => {
			const routes: Record<string, Scripted> = { 'https://r.test/robots.txt': NOT_FOUND };
			for (let i = 0; i < length; i++)
				routes[`https://r.test/r${i}`] = { status: 302, location: `/r${i + 1}` };
			routes[`https://r.test/r${length}`] = { status: 200, body: 'end' };
			return routes;
		};
		const five = fakeSite(chain(MAX_REDIRECTS));
		const answer = await harvest(five, { url: 'https://r.test/r0' });
		expect(answer.url).toBe(`https://r.test/r${MAX_REDIRECTS}`);
		expect(answer.text()).toBe('end');

		clearRobotsCache();
		const six = fakeSite(chain(MAX_REDIRECTS + 1));
		const error = await failureOf(harvest(six, { url: 'https://r.test/r0' }));
		expect(error.details?.reason).toBe('too_many_redirects');
		const pages = pathsSent(six, 'r.test').filter((p) => p !== '/robots.txt');
		expect(pages).toHaveLength(MAX_REDIRECTS + 1);
		expect(pages).not.toContain(`/r${MAX_REDIRECTS + 1}`);
	});

	test('POST sends its method and body; 308 keeps them; 301 drops them and the Content-Type', async () => {
		const site = fakeSite({
			'https://p.test/robots.txt': NOT_FOUND,
			'https://p.test/search': { status: 308, location: '/search2' },
			'https://p.test/search2': { status: 301, location: '/results' },
			'https://p.test/results': { status: 200 },
		});
		await harvest(site, {
			url: 'https://p.test/search',
			method: 'POST',
			body: 'q=coin',
			headers: { 'Content-Type': 'text/plain' },
		});
		const [first, second, third] = site.sent.filter((r) => r.url.pathname !== '/robots.txt');
		expect([first?.method, first?.body, first?.headers.get('content-type')]).toEqual([
			'POST',
			'q=coin',
			'text/plain',
		]);
		expect([second?.method, second?.body]).toEqual(['POST', 'q=coin']);
		expect([third?.method, third?.body, third?.headers.get('content-type')]).toEqual([
			'GET',
			undefined,
			null,
		]);
	});

	test('a redirect leaving the allowlist is refused, and the wire names the site ASKED', async () => {
		const site = fakeSite({
			'https://a.test/robots.txt': NOT_FOUND,
			'https://a.test/out': { status: 301, location: 'https://10.0.0.5/admin' },
			'https://a.test/in': { status: 301, location: 'https://www.a.test/page' },
			'https://www.a.test/robots.txt': NOT_FOUND,
			'https://www.a.test/page': { status: 200, body: 'hello', contentType: 'text/html' },
		});
		const error = await failureOf(harvest(site, { url: 'https://a.test/out', hosts: ['a.test'] }));
		const body = toErrorBody(error);
		expect(body.code).toBe('harvest.refused');
		expect(body.details).toEqual({ site: 'https://a.test', reason: 'host_not_allowed' });
		const { debug: _debugOnly, ...wire } = body; // debug exists only under DEDALO_DEBUG_API_ERRORS
		expect(JSON.stringify(wire)).not.toContain('10.0.0.5');
		expect(body.message).toBe('This request may not visit that host');
		const answer = await harvest(site, { url: 'https://a.test/in', hosts: ['a.test'] });
		expect(answer.url).toBe('https://www.a.test/page');
		expect(answer.text()).toBe('hello');
	});

	test('an unparseable URL and a refused scheme are harvest.refused, with their reason', async () => {
		const site = fakeSite({});
		const bad = await failureOf(harvest(site, { url: 'not a url' }));
		expect(toErrorBody(bad).details).toEqual({ site: UNPARSEABLE_SITE, reason: 'unparseable' });
		// The caller's text never reaches the wire: it may hold credentials, a path, a query.
		const leaky = 'https://user:s3cret@exa mple.org/private/lot?token=abc';
		// The PUBLIC wire only: `debug` (DEDALO_DEBUG_API_ERRORS) carries a stack whose
		// file paths would make this depend on where the checkout lives.
		const { debug: _operatorOnly, ...body } = toErrorBody(
			await failureOf(harvest(site, { url: leaky })),
		);
		const wire = JSON.stringify(body);
		for (const secret of ['s3cret', 'private', 'token', 'exa mple']) {
			expect(wire).not.toContain(secret);
		}
		// A URL that parses but has no http(s) origin (an opaque one) names the fixed token,
		// never the literal "null".
		for (const opaque of ['file:///etc/passwd', 'data:text/plain,hi', 'javascript:alert(1)']) {
			const refused = toErrorBody(await failureOf(harvest(site, { url: opaque })));
			expect(refused.details, opaque).toEqual({ site: UNPARSEABLE_SITE, reason: 'protocol' });
			expect(refused.message, opaque).not.toContain('null');
		}
		expect(siteOf('x'.repeat(5000))).toBe(UNPARSEABLE_SITE);
		expect(siteOf('https://ok.test/a?b=1')).toBe('https://ok.test');
		// A first hop outside the allowlist: no redirect happened, and the sentence says so.
		const first = toErrorBody(
			await failureOf(harvest(site, { url: 'https://evil.test/lot', hosts: ['museum.test'] })),
		);
		expect(first.details).toEqual({ site: 'https://evil.test', reason: 'host_not_allowed' });
		expect(first.message).not.toContain('redirect');
		const ftp = await failureOf(harvest(site, { url: 'ftp://a.test/x' }));
		expect(ftp.details?.reason).toBe('protocol');
		const plain = await failureOf(harvest(site, { url: 'http://a.test/x', requireHttps: true }));
		expect(plain.details?.reason).toBe('requires_https');
	});

	test('https://[2606:4700:4700::1111]/x harvests — allowlisted bracketed, bare, or public', async () => {
		for (const hosts of [['[2606:4700:4700::1111]'], ['2606:4700:4700::1111'], 'public'] as const) {
			clearRobotsCache();
			clearPacingForTests();
			const site = fakeSite({
				'https://[2606:4700:4700::1111]/robots.txt': NOT_FOUND,
				'https://[2606:4700:4700::1111]/x': { status: 200, body: 'v6' },
			});
			const answer = await harvest(site, { url: 'https://[2606:4700:4700::1111]/x', hosts });
			expect(answer.text(), JSON.stringify(hosts)).toBe('v6');
		}
	});
});

// ---------------------------------------------------------------------------
// harvestFetch — the request and the response
// ---------------------------------------------------------------------------

describe('harvestFetch — the request the door sends', () => {
	test('robots Disallow refuses BEFORE the page is requested; the wire names the site', async () => {
		const site = fakeSite({
			'https://a.test/robots.txt': { status: 200, body: 'User-agent: *\nDisallow: /lots' },
		});
		const error = await failureOf(harvest(site, { url: 'https://a.test/lots/1' }));
		expect(error.code).toBe('harvest.robots_disallowed');
		expect(toErrorBody(error).details).toEqual({ site: 'https://a.test' });
		expect(site.sent.map((r) => r.url.pathname)).toEqual(['/robots.txt']);
	});

	test('a query-only Disallow (/*?sessionid) applies through harvestFetch', async () => {
		const site = fakeSite({
			'https://q.test/robots.txt': { status: 200, body: 'User-agent: *\nDisallow: /*?sessionid' },
			'https://q.test/lot?page=2': { status: 200 },
		});
		expect(await codeOf(harvest(site, { url: 'https://q.test/lot?sessionid=9' }))).toBe(
			'harvest.robots_disallowed',
		);
		expect((await harvest(site, { url: 'https://q.test/lot?page=2' })).ok).toBe(true);
	});

	test('an unreadable robots.txt (5xx) refuses, retryably, naming the site', async () => {
		const site = fakeSite({ 'https://a.test/robots.txt': { status: 500 } });
		const error = await failureOf(harvest(site, { url: 'https://a.test/lot' }));
		expect(error.code).toBe('harvest.robots_unavailable');
		expect(toErrorBody(error)).toMatchObject({
			retryable: true,
			details: { site: 'https://a.test' },
		});
	});

	test('the caller-header allowlist is exactly five names, any case', async () => {
		const site = fakeSite({
			'https://ua.test/robots.txt': NOT_FOUND,
			'https://ua.test/': { status: 200 },
		});
		await harvest(site, {
			url: 'https://ua.test/',
			headers: {
				accept: 'text/html',
				'Accept-Language': 'es',
				'X-Requested-With': 'XMLHttpRequest',
				Referer: 'https://ua.test/list',
			},
		});
		const page = site.sent[1];
		expect(page?.headers.get('accept-language')).toBe('es');
		expect(page?.headers.get('user-agent')).toBe(HARVEST_USER_AGENT);
		expect(HARVEST_USER_AGENT.toLowerCase().startsWith('dedalo/')).toBe(true);
		for (const name of ['Authorization', 'Host', 'User-Agent', 'Cookie', 'cookie', 'Origin']) {
			expect(
				await codeOf(harvest(site, { url: 'https://ua.test/', headers: { [name]: 'x' } })),
				name,
			).toBe('internal.invariant');
		}
	});

	test('a form body (URLSearchParams) is sent urlencoded; a caller Content-Type wins', async () => {
		const site = fakeSite({
			'https://f.test/robots.txt': NOT_FOUND,
			'https://f.test/s': { status: 200 },
		});
		await harvest(site, {
			url: 'https://f.test/s',
			method: 'POST',
			body: new URLSearchParams({ q: 'denario romano', page: '2' }),
		});
		const form = site.sent[1];
		expect(form?.body).toBe('q=denario+romano&page=2');
		expect(form?.headers.get('content-type')).toBe(
			'application/x-www-form-urlencoded;charset=UTF-8',
		);
		await harvest(site, {
			url: 'https://f.test/s',
			method: 'POST',
			body: new URLSearchParams({ q: '1' }),
			headers: { 'Content-Type': 'application/x-custom' },
		});
		expect(site.sent[2]?.headers.get('content-type')).toBe('application/x-custom');
		expect(await codeOf(harvest(site, { url: 'https://f.test/s', body: 'q=1' }))).toBe(
			'internal.invariant',
		);
	});

	test('limits: absent → default; huge → clamped; a fraction never rounds to 0; NaN/0/∞ → defect', async () => {
		const site = fakeSite({
			'https://l.test/robots.txt': NOT_FOUND,
			'https://l.test/': { status: 200 },
		});
		await harvest(site, { url: 'https://l.test/' });
		expect(site.sent[1]).toMatchObject({
			timeoutMs: HARVEST_DEFAULT_TIMEOUT_MS,
			idleTimeoutMs: HARVEST_DEFAULT_IDLE_TIMEOUT_MS,
		});
		await harvest(site, {
			url: 'https://l.test/',
			maxBytes: 1e12,
			timeoutMs: 1e12,
			idleTimeoutMs: 1e12,
		});
		expect(site.sent[2]).toMatchObject({
			maxBytes: HARVEST_MAX_BYTES,
			timeoutMs: HARVEST_MAX_TIMEOUT_MS,
			idleTimeoutMs: HARVEST_MAX_TIMEOUT_MS,
		});
		await harvest(site, { url: 'https://l.test/', maxBytes: 0.5, timeoutMs: 5_000 });
		expect(site.sent[3]).toMatchObject({ maxBytes: 1, timeoutMs: 5_000, idleTimeoutMs: 5_000 });
		for (const bad of [Number.NaN, 0, -1, Number.POSITIVE_INFINITY]) {
			for (const key of ['maxBytes', 'timeoutMs', 'idleTimeoutMs'] as const) {
				expect(
					await codeOf(harvest(site, { url: 'https://l.test/', [key]: bad })),
					`${key}=${bad}`,
				).toBe('internal.invariant');
			}
		}
	});

	test('allowlist entries are normalized; a non-host entry is a defect', async () => {
		const site = fakeSite({
			'https://lots.norm.test/robots.txt': NOT_FOUND,
			'https://lots.norm.test/x': { status: 200 },
		});
		const answer = await harvest(site, {
			url: 'https://lots.norm.test/x',
			hosts: [' Norm.TEST. '],
		});
		expect(answer.ok).toBe(true);
		for (const bad of ['', 'norm.test/path', 'norm.test:8080']) {
			expect(await codeOf(harvest(site, { url: 'https://norm.test/', hosts: [bad] })), bad).toBe(
				'internal.invariant',
			);
		}
	});
});

describe('harvestFetch — the answer it returns', () => {
	test('ok is exactly 2xx; a non-2xx page is returned with its status, not thrown', async () => {
		const site = fakeSite({
			'https://s.test/robots.txt': NOT_FOUND,
			'https://s.test/200': { status: 200 },
			'https://s.test/299': { status: 299 },
			'https://s.test/300': { status: 300 },
			'https://s.test/410': { status: 410 },
		});
		const status = async (path: string) => {
			const answer = await harvest(site, { url: `https://s.test/${path}` });
			return [answer.status, answer.ok];
		};
		expect(await status('200')).toEqual([200, true]);
		expect(await status('299')).toEqual([299, true]);
		expect(await status('300')).toEqual([300, false]);
		expect(await status('410')).toEqual([410, false]);
	});

	test('content type lowercased; only the exposed headers, frozen', async () => {
		const site = fakeSite({
			'https://h2.test/robots.txt': NOT_FOUND,
			'https://h2.test/f': {
				status: 200,
				contentType: 'Application/PDF',
				headers: {
					'Content-Disposition': 'attachment; filename="lot.pdf"',
					ETag: '"v1"',
					'Last-Modified': 'Tue, 29 Sep 2026 10:00:00 GMT',
					'cf-mitigated': 'challenge',
					'Retry-After': '120',
					'Set-Cookie': 'session=secret',
					Server: 'nginx',
				},
			},
		});
		const answer = await harvest(site, { url: 'https://h2.test/f' });
		expect(answer.contentType).toBe('application/pdf');
		expect(answer.headers).toEqual({
			'cf-mitigated': 'challenge',
			'content-disposition': 'attachment; filename="lot.pdf"',
			'content-type': 'Application/PDF',
			etag: '"v1"',
			'last-modified': 'Tue, 29 Sep 2026 10:00:00 GMT',
			'retry-after': '120',
		});
		expect(Object.isFrozen(answer.headers)).toBe(true);
	});

	test('a body over the ceiling is harvest.too_large, naming the site and the limit', async () => {
		const site = fakeSite({
			'https://big2.test/robots.txt': NOT_FOUND,
			'https://big2.test/f': { status: 200, body: 'x'.repeat(100) },
		});
		const error = await failureOf(harvest(site, { url: 'https://big2.test/f', maxBytes: 10 }));
		expect(error.code).toBe('harvest.too_large');
		expect(toErrorBody(error)).toMatchObject({
			retryable: false,
			details: { site: 'https://big2.test', max_bytes: 10 },
		});
		// The request is wrong for this file (400, like media.too_large) — not a
		// rate limit: a 429 that is not retryable would contradict itself.
		expect(specOf('harvest.too_large')).toMatchObject({ category: 'caller', status: 400 });
	});

	test('expectContentType refuses a 2xx of another type unread; a non-2xx is returned', async () => {
		const site = fakeSite({
			'https://img.test/robots.txt': NOT_FOUND,
			'https://img.test/a.jpg': { status: 200, contentType: 'IMAGE/JPEG', body: 'jpg' },
			'https://img.test/page': {
				status: 200,
				contentType: 'text/html; charset=utf-8',
				body: '<p>',
			},
			'https://img.test/gone': { status: 404, contentType: 'text/html', body: 'nope' },
		});
		const expectContentType = ['image/'];
		expect((await harvest(site, { url: 'https://img.test/a.jpg', expectContentType })).text()).toBe(
			'jpg',
		);
		const error = await failureOf(
			harvest(site, { url: 'https://img.test/page', expectContentType }),
		);
		expect(error.code).toBe('harvest.unexpected_type');
		expect(toErrorBody(error).details).toEqual({
			site: 'https://img.test',
			content_type: 'text/html',
		});
		const gone = await harvest(site, { url: 'https://img.test/gone', expectContentType });
		expect([gone.status, gone.text()]).toEqual([404, 'nope']);
		for (const empty of [[], [''], ['  ']]) {
			expect(
				await codeOf(harvest(site, { url: 'https://img.test/a.jpg', expectContentType: empty })),
				JSON.stringify(empty),
			).toBe('internal.invariant');
		}
	});

	test('expectContentType prefixes are case-blind; a 3xx the door does not follow is returned whole', async () => {
		const site = fakeSite({
			'https://case.test/robots.txt': NOT_FOUND,
			'https://case.test/a.png': { status: 200, contentType: 'image/png', body: 'png' },
			'https://case.test/choices': { status: 300, contentType: 'text/html', body: 'pick one' },
		});
		const expectContentType = ['Image/'];
		const image = await harvest(site, { url: 'https://case.test/a.png', expectContentType });
		expect(image.text()).toBe('png');
		// Only a 2xx is type-filtered: a 300 is information, read and returned.
		const choices = await harvest(site, { url: 'https://case.test/choices', expectContentType });
		expect([choices.status, choices.ok, choices.text()]).toEqual([300, false, 'pick one']);
	});

	test('expectContentType is a PREFIX of the media type, not a substring anywhere in the header', async () => {
		const site = fakeSite({
			'https://pre.test/robots.txt': NOT_FOUND,
			'https://pre.test/p': { status: 200, contentType: 'text/html; x=image/', body: '<p>' },
		});
		const error = await failureOf(
			harvest(site, { url: 'https://pre.test/p', expectContentType: ['image/'] }),
		);
		expect(error.code).toBe('harvest.unexpected_type');
	});

	test('a media type on the wire is type/subtype or "none" — never the site’s free text', () => {
		const hostile = unexpectedType('https://s.test', 'text/html<script>alert(1)</script>');
		expect(toErrorBody(hostile).details).toEqual({ site: 'https://s.test', content_type: 'none' });
		const plain = unexpectedType('https://s.test', 'Text/HTML; charset=utf-8');
		expect(toErrorBody(plain).details).toEqual({
			site: 'https://s.test',
			content_type: 'text/html',
		});
	});

	test('charset: the header wins, then an XML declaration or <meta> in the first KiB, else UTF-8', () => {
		const latin1 = new Uint8Array([0x4d, 0xe1, 0x6c, 0x61, 0x67, 0x61]); // "Málaga"
		expect(decodeBody(latin1, 'text/html; charset=iso-8859-1')).toBe('Málaga');
		const meta = new TextEncoder().encode('<meta charset="windows-1252">');
		expect(decodeBody(new Uint8Array([...meta, 0xe1]), 'text/html')).toEndWith('á');
		const xml = new TextEncoder().encode('<?xml version="1.0" encoding="ISO-8859-1"?><r>');
		expect(decodeBody(new Uint8Array([...xml, 0xe1]), 'text/xml')).toEndWith('á');
		// The header outranks the document's own declaration.
		const utf8 = new TextEncoder().encode('<meta charset="windows-1252">é');
		expect(decodeBody(utf8, 'text/html; charset=utf-8')).toEndWith('é');
		// A label no decoder knows falls back to UTF-8 instead of throwing.
		expect(decodeBody(new TextEncoder().encode('ñ'), 'text/html; charset=x-no-such')).toBe('ñ');
		expect(decodeBody(new TextEncoder().encode('ñ'), 'text/html')).toBe('ñ');
		// A declaration past the first KiB is not a declaration: the body stays UTF-8.
		const late = new TextEncoder().encode(`${' '.repeat(1024)}<meta charset="windows-1252">`);
		expect(decodeBody(new Uint8Array([...late, 0xe1]), 'text/html')).toEndWith('\uFFFD');
	});
});

// ---------------------------------------------------------------------------
// Pacing
// ---------------------------------------------------------------------------

/** Clock + sleep + timer seams for acquireTurn alone. */
function pacingSeams(start = 5_000_000) {
	const clock = { now: start };
	const slept: number[] = [];
	const timers: { callback: () => void; ms: number }[] = [];
	const deps: PacingDeps = {
		now: () => clock.now,
		sleep: async (ms) => {
			slept.push(ms);
			clock.now += ms;
		},
		setTimer: (callback, ms) => {
			timers.push({ callback, ms });
		},
	};
	const runTimers = () => {
		for (const timer of timers.splice(0)) timer.callback();
	};
	return { clock, slept, timers, deps, runTimers };
}

describe('pacing — strictly serial per origin', () => {
	test('paceInterval clamps; NaN is the default, never NaN; Infinity is the ceiling', () => {
		expect(paceInterval(0)).toBe(MIN_INTERVAL_MS);
		expect(paceInterval(null)).toBe(MIN_INTERVAL_MS);
		expect(paceInterval(7_000)).toBe(7_000);
		expect(paceInterval(86_400_000)).toBe(MAX_INTERVAL_MS);
		expect(paceInterval(Number.NaN)).toBe(MIN_INTERVAL_MS);
		// The slowest pace asked for is our slowest, never our fastest.
		expect(paceInterval(Number.POSITIVE_INFINITY)).toBe(MAX_INTERVAL_MS);
		const overlong = parseRobots(`User-agent: *\nCrawl-delay: ${'9'.repeat(400)}`);
		expect(overlong.kind === 'rules' && paceInterval(overlong.crawlDelayMs)).toBe(MAX_INTERVAL_MS);
	});

	test('a turn is HELD across the request: the next waits for done, then the interval', async () => {
		const { clock, slept, deps } = pacingSeams();
		const first = await acquireTurn('https://pace.test', 4_000, deps);
		let secondStarted = false;
		const queued = deferred();
		const second = acquireTurn('https://pace.test', 4_000, deps, () => queued.resolve()).then(
			(done) => {
				secondStarted = true;
				return done;
			},
		);
		await queued.promise;
		await settle();
		expect(secondStarted, 'a slow request must not overlap the next one').toBe(false);
		clock.now += 10_000; // the first request took 10 s
		first();
		(await second)();
		expect(slept).toEqual([4_000]); // interval counted from the END of the first
	});

	test('onWait hears the queue (at least the interval) and then the exact pause', async () => {
		const { deps } = pacingSeams();
		const waits: [number, string][] = [];
		const onWait = (ms: number, origin: string) => {
			waits.push([ms, origin]);
		};
		const first = await acquireTurn('https://w.test', 5_000, deps, onWait);
		expect(waits).toEqual([]); // nobody ahead, nothing to wait for
		const second = acquireTurn('https://w.test', 5_000, deps, onWait);
		await settle();
		first();
		(await second)();
		expect(waits).toEqual([
			[5_000, 'https://w.test'],
			[5_000, 'https://w.test'],
		]);
	});

	test('done called twice is harmless: the next holder still excludes a third caller', async () => {
		const { clock, deps, runTimers } = pacingSeams();
		const first = await acquireTurn('https://twice.test', 3_000, deps);
		first();
		first();
		const holder = await acquireTurn('https://twice.test', 3_000, deps);
		clock.now += 60_000;
		runTimers(); // a drain must not forget an origin somebody holds
		let thirdStarted = false;
		const third = acquireTurn('https://twice.test', 3_000, deps).then((done) => {
			thirdStarted = true;
			return done;
		});
		await settle();
		expect(thirdStarted).toBe(false);
		holder();
		(await third)();
	});

	test('an idle origin is drained; a drain that fires early re-arms instead of stranding it', async () => {
		const { clock, timers, deps, runTimers } = pacingSeams();
		(await acquireTurn('https://drain.test', 3_000, deps))();
		expect(trackedOrigins()).toBe(1);
		expect(timers.map((t) => t.ms)).toEqual([3_000]); // armed for the interval, not 0
		runTimers(); // fires before the interval is over
		expect(trackedOrigins()).toBe(1);
		expect(timers.map((t) => t.ms)).toEqual([3_000]); // re-armed for what is LEFT
		clock.now += 3_000;
		runTimers();
		expect(trackedOrigins()).toBe(0);
	});

	test('a STALE drain timer never deletes the queue that replaced its own', async () => {
		const { clock, timers, deps } = pacingSeams();
		(await acquireTurn('https://stale.test', 3_000, deps))();
		(await acquireTurn('https://stale.test', 3_000, deps))();
		expect(timers).toHaveLength(2); // two drains armed on the same (first) queue
		clock.now += 60_000;
		timers[0]?.callback(); // drains the first queue
		expect(trackedOrigins()).toBe(0);
		const holder = await acquireTurn('https://stale.test', 3_000, deps); // a NEW queue, held
		timers[1]?.callback(); // the first queue's leftover timer
		expect(trackedOrigins()).toBe(1);
		let nextStarted = false;
		const next = acquireTurn('https://stale.test', 3_000, deps).then((done) => {
			nextStarted = true;
			return done;
		});
		await settle();
		expect(nextStarted, 'second request started while the first still holds the turn').toBe(false);
		holder();
		(await next)();
	});

	test('an onWait observer that throws never wedges the origin — queued or pausing', async () => {
		const { clock, deps } = pacingSeams();
		const throwing = () => {
			throw new Error('observer bug');
		};
		const logged: unknown[] = [];
		const originalError = console.error;
		console.error = (...args: unknown[]) => {
			logged.push(args);
		};
		try {
			// Queued branch: B joins behind A with a throwing observer.
			const a = await acquireTurn('https://obs.test', 3_000, deps);
			const b = acquireTurn('https://obs.test', 3_000, deps, throwing);
			await settle();
			a();
			(await b)(); // B still got its turn, and releases it
			// Interval branch: C pauses with a throwing observer.
			const c = await acquireTurn('https://obs.test', 3_000, deps, throwing);
			c();
			clock.now += 60_000;
			(await acquireTurn('https://obs.test', 3_000, deps))(); // nobody is stuck
		} finally {
			console.error = originalError;
		}
		expect(logged.length).toBeGreaterThanOrEqual(2);
	});

	test('a 429/503 Retry-After lengthens the next caller’s wait, clamped', async () => {
		expect(retryAfterMs('30', 0)).toBe(30_000);
		expect(retryAfterMs('86400', 0)).toBe(MAX_INTERVAL_MS);
		expect(
			retryAfterMs('Tue, 29 Sep 2026 10:00:20 GMT', Date.parse('Tue, 29 Sep 2026 10:00:00 GMT')),
		).toBe(20_000);
		expect(retryAfterMs('soon', 0)).toBe(0);
		expect(retryAfterMs(null, 0)).toBe(0);
		const site = fakeSite({
			'https://busy.test/robots.txt': NOT_FOUND,
			'https://busy.test/a': { status: 429, headers: { 'Retry-After': '30' } },
			'https://busy.test/b': { status: 200 },
			'https://busy.test/c': { status: 200, headers: { 'Retry-After': '50' } },
			'https://busy.test/d': { status: 200 },
		});
		expect((await harvest(site, { url: 'https://busy.test/a' })).status).toBe(429);
		await harvest(site, { url: 'https://busy.test/b' });
		expect(site.slept).toEqual([30_000]);
		await harvest(site, { url: 'https://busy.test/c' }); // Retry-After on a 200: ignored
		await harvest(site, { url: 'https://busy.test/d' });
		expect(site.slept).toEqual([30_000, MIN_INTERVAL_MS, MIN_INTERVAL_MS]);

		const unavailable = fakeSite({
			'https://down2.test/robots.txt': NOT_FOUND,
			'https://down2.test/a': { status: 503, headers: { 'Retry-After': '20' } },
			'https://down2.test/b': { status: 200 },
		});
		expect((await harvest(unavailable, { url: 'https://down2.test/a' })).status).toBe(503);
		await harvest(unavailable, { url: 'https://down2.test/b' });
		expect(unavailable.slept).toEqual([20_000]);
	});

	test('Retry-After is read by the guard’s ONE reader: a lenient date asks no wait', async () => {
		// `Date.parse` reads each as a far-future instant — a private reader would hold the
		// origin for the full minute; RFC 9110 knows neither form.
		for (const asked of ['2099-01-01T00:00:00Z', 'Fri, 01 Jan 2100 00:00:00 +0000', '1.5']) {
			clearPacingForTests();
			clearRobotsCache();
			const site = fakeSite({
				'https://lenient.test/robots.txt': NOT_FOUND,
				'https://lenient.test/a': { status: 429, headers: { 'Retry-After': asked } },
				'https://lenient.test/b': { status: 200 },
			});
			await harvest(site, { url: 'https://lenient.test/a' });
			await harvest(site, { url: 'https://lenient.test/b' });
			expect(site.slept, asked).toEqual([MIN_INTERVAL_MS]);
		}
	});

	test('every wait on the job’s signal removes its abort listener when it ends', async () => {
		// A wait that leaves its listener behind leaks one per request on a long job's
		// signal: the queue, the pause and the shared robots load all use one primitive.
		const signal = new AbortController().signal;
		const live = new Set<unknown>();
		let added = 0;
		const add = signal.addEventListener.bind(signal);
		const remove = signal.removeEventListener.bind(signal);
		signal.addEventListener = ((type: string, listener: EventListener, options?: object) => {
			if (type === 'abort') {
				added++;
				live.add(listener);
			}
			add(type, listener, options);
		}) as typeof signal.addEventListener;
		signal.removeEventListener = ((type: string, listener: EventListener, options?: object) => {
			if (type === 'abort') live.delete(listener);
			remove(type, listener, options);
		}) as typeof signal.removeEventListener;
		const site = fakeSite({
			'https://quiet.test/robots.txt': NOT_FOUND,
			'https://quiet.test/a': { status: 200 },
			'https://quiet.test/b': { status: 200 },
		});
		await runWithJobSignal(signal, async () => {
			await harvest(site, { url: 'https://quiet.test/a' });
			await Promise.all([
				harvest(site, { url: 'https://quiet.test/b' }),
				harvest(site, { url: 'https://quiet.test/a' }),
			]);
		});
		expect(added).toBeGreaterThan(0); // the waits did listen (anti-vacuity)
		expect(live.size).toBe(0);
	});

	test('Crawl-delay is obeyed but clamped; each redirect hop takes its own turn', async () => {
		const slow = fakeSite({
			'https://slow.test/robots.txt': { status: 200, body: 'User-agent: *\nCrawl-delay: 86400' },
			'https://slow.test/a': { status: 301, location: '/b' },
			'https://slow.test/b': { status: 200 },
		});
		await harvest(slow, { url: 'https://slow.test/a' });
		expect(slow.slept).toEqual([MAX_INTERVAL_MS]);
	});

	test('a hop that throws still releases its turn: the next harvest to the origin completes', async () => {
		const site = fakeSite({
			'https://fail.test/robots.txt': NOT_FOUND,
			'https://fail.test/a': {
				status: 0,
				error: new DedaloError('security.outbound_failed', {
					coordinates: { reason: 'transport' },
				}),
			},
			'https://fail.test/b': { status: 200 },
		});
		expect(await codeOf(harvest(site, { url: 'https://fail.test/a' }))).toBe(
			'security.outbound_failed',
		);
		let finished = false;
		const next = harvest(site, { url: 'https://fail.test/b' }).then(() => {
			finished = true;
		});
		await settle();
		expect(finished).toBe(true);
		await next;
		expect(site.slept).toEqual([MIN_INTERVAL_MS]);
	});

	test('a slow site never gets a second request while the first is unanswered', async () => {
		const firstAnswered = deferred();
		const site = fakeSite({
			'https://slow2.test/robots.txt': NOT_FOUND,
			'https://slow2.test/a': { status: 200, gate: firstAnswered.promise },
			'https://slow2.test/b': { status: 200 },
		});
		const first = harvest(site, { url: 'https://slow2.test/a' });
		const queued = deferred();
		const second = harvest(site, { url: 'https://slow2.test/b', onWait: () => queued.resolve() });
		await queued.promise;
		await settle();
		expect(pathsSent(site, 'slow2.test')).toEqual(['/robots.txt', '/a']);
		firstAnswered.resolve();
		await Promise.all([first, second]);
		expect(pathsSent(site, 'slow2.test')).toEqual(['/robots.txt', '/a', '/b']);
	});

	test('a job stopped in the QUEUE leaves at once, and its place never lets the next caller jump', async () => {
		const { deps } = pacingSeams();
		const holder = await acquireTurn('https://q2.test', 3_000, deps);
		const job = new AbortController();
		const queued = deferred();
		const stopped = runWithJobSignal(job.signal, () =>
			acquireTurn('https://q2.test', 3_000, deps, () => queued.resolve()),
		);
		await queued.promise;
		let thirdStarted = false;
		const third = acquireTurn('https://q2.test', 3_000, deps).then((done) => {
			thirdStarted = true;
			return done;
		});
		job.abort();
		const error = await failureOf(stopped);
		expect(error.coordinates).toEqual({ reason: 'aborted', stage: 'queue' });
		await settle();
		expect(thirdStarted, 'the stopped place released before the holder finished').toBe(false);
		holder();
		(await third)();
	});

	test('a job stopped during the PAUSE leaves at once (real sleep, timer cleared)', async () => {
		const clock = { now: 7_000_000 };
		const deps: PacingDeps = { now: () => clock.now, setTimer: () => {} };
		(await acquireTurn('https://p2.test', MAX_INTERVAL_MS, deps))();
		const job = new AbortController();
		const pausing = deferred();
		// Watch the real sleep's timer: a stopped pause must CLEAR it, not leave a
		// minute-long timer holding its closure.
		const originalSet = globalThis.setTimeout;
		const originalClear = globalThis.clearTimeout;
		const armed: unknown[] = [];
		const cleared: unknown[] = [];
		globalThis.setTimeout = ((callback: () => void, ms?: number) => {
			const timer = originalSet(callback, ms);
			if ((ms ?? 0) >= MAX_INTERVAL_MS) armed.push(timer);
			return timer;
		}) as unknown as typeof setTimeout;
		globalThis.clearTimeout = ((timer: Parameters<typeof clearTimeout>[0]) => {
			cleared.push(timer);
			originalClear(timer);
		}) as typeof clearTimeout;
		let stopped: Promise<unknown>;
		try {
			stopped = runWithJobSignal(job.signal, () =>
				acquireTurn('https://p2.test', 3_000, deps, () => pausing.resolve()),
			);
			await pausing.promise;
			await settle();
			job.abort();
		} finally {
			globalThis.setTimeout = originalSet;
			globalThis.clearTimeout = originalClear;
		}
		expect(armed).toHaveLength(1);
		expect(cleared).toContain(armed[0]);
		const error = await failureOf(stopped);
		expect(error.coordinates).toEqual({ reason: 'aborted', stage: 'pace' });
		// The place was given back: the origin's next caller is not stuck behind it.
		clock.now += MAX_INTERVAL_MS;
		(await acquireTurn('https://p2.test', 3_000, deps))();
	});

	test('done() clamps what it is handed: past the ceiling waits the ceiling, NaN waits the interval', async () => {
		const { slept, deps } = pacingSeams();
		(await acquireTurn('https://clamp.test', 3_000, deps))(10 * MAX_INTERVAL_MS);
		(await acquireTurn('https://clamp.test', 3_000, deps))(Number.NaN);
		(await acquireTurn('https://clamp.test', 3_000, deps))();
		expect(slept).toEqual([MAX_INTERVAL_MS, 3_000]);
	});

	test('a job stopped just before its pause never sleeps it (the real sleep checks first)', async () => {
		const job = new AbortController();
		const clock = { now: 7_000_000 };
		const deps: PacingDeps = { now: () => clock.now, setTimer: () => {} }; // the REAL sleep
		(await acquireTurn('https://late.test', 3_000, deps))();
		const started = performance.now();
		const error = await failureOf(
			runWithJobSignal(job.signal, () =>
				acquireTurn('https://late.test', 3_000, deps, () => job.abort()),
			),
		);
		expect(error.coordinates).toEqual({ reason: 'aborted', stage: 'pace' });
		expect(performance.now() - started).toBeLessThan(1_000);
	});

	test('an already-stopped job never takes a turn', async () => {
		const job = new AbortController();
		job.abort();
		const { deps } = pacingSeams();
		(await acquireTurn('https://pre.test', 3_000, deps))();
		const error = await failureOf(
			runWithJobSignal(job.signal, () => acquireTurn('https://pre.test', 3_000, deps)),
		);
		expect(error.coordinates?.reason).toBe('aborted');
	});
});

// ---------------------------------------------------------------------------
// The REAL primitive under the door
// ---------------------------------------------------------------------------

describe('fetchPinnedHop — the guard runs inside the primitive', () => {
	test('a private or rebinding-shaped target is refused before any socket', async () => {
		for (const url of [
			'http://127.0.0.1/',
			'http://[::1]/',
			'http://[64:ff9b::a9fe:a9fe]/',
			'http://localhost/',
		]) {
			const code = await codeOf(
				fetchPinnedHop(
					{
						url: new URL(url),
						method: 'GET',
						headers: new Headers(),
						maxBytes: 1,
						timeoutMs: 1_000,
					},
					{
						// A name resolves through the seam, never the machine's resolver.
						lookup: async () => [
							{ address: '127.0.0.1', family: 4 },
							{ address: '::1', family: 6 },
						],
					},
				),
			);
			expect(code, url).toBe('security.ssrf_blocked');
		}
	});

	test('the door reads the real primitive’s body cap and skipped body as its own codes', async () => {
		const answers: Record<string, Response> = {};
		const pinned = {
			lookup: async () => [{ address: '93.184.215.14', family: 4 }],
			fetch: async (url: string) => {
				const path = new URL(url).pathname;
				if (path === '/robots.txt') return new Response('', { status: 404 });
				return answers[path] ?? new Response('', { status: 404 });
			},
		};
		answers['/big'] = new Response('x'.repeat(64), { status: 200 });
		const big = await failureOf(
			harvestFetch(
				{ url: 'https://real.test/big', hosts: 'public', maxBytes: 8 },
				{ pinned, sleep: async () => {} },
			),
		);
		expect(big.code).toBe('harvest.too_large');
		answers['/page'] = new Response('<p>', {
			status: 200,
			headers: { 'content-type': 'text/html' },
		});
		const page = await failureOf(
			harvestFetch(
				{ url: 'https://real.test/page', hosts: 'public', expectContentType: ['image/'] },
				{ pinned, sleep: async () => {} },
			),
		);
		expect(page.code).toBe('harvest.unexpected_type');
	});
});
