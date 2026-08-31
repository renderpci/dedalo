/**
 * TRIPWIRE — every byte the engine fetches is BOUNDED (P1-26 / CARRY-14).
 *
 * Six outbound sites carried no signal, no timeout and no byte ceiling. That is
 * not a write hazard — an awaited fetch blocks no event loop and holds no
 * transaction, which is Wave 5's own correction to the original finding — but it
 * is LANE OCCUPANCY: background work runs in three shared lanes, so one peer that
 * accepts a connection and then goes quiet holds a lane for as long as it likes,
 * and media, publication and RAG queue behind it. An answer without a ceiling is
 * unbounded ingest on top.
 *
 * The pattern that produced them is what this gate exists to stop: a hardened
 * primitive is written once, and the next caller — whose destination is
 * legitimately private — copies the bare `fetch` instead of the primitive, and
 * copies none of its guarantees. So the census is TOTAL over `src/` and `tools/`,
 * and an exemption must be WRITTEN DOWN here with its reason, never inferred.
 *
 * ITS OWN SCANNER IS THE WEAK POINT, and adversarial review proved it four times
 * before this version. Each is closed and named at the assertion it broke:
 *   - a fixed-width call window ran past the call into the next statements;
 *   - a REGEX LITERAL's escaped paren desynced the bracket count, so the window
 *     ran on and a decoy `signal:` in the following line satisfied it;
 *   - a TYPE ANNOTATION (`as …`, `satisfies …`) sits INSIDE the call's
 *     parentheses, so a pure type spelled `signal: AbortSignal` passed;
 *   - `Bun.fetch(` and any other member spelling were invisible to a census
 *     calling itself TOTAL.
 * A scanner that cannot be sure must FAIL, not guess.
 */

import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { curlArgv } from '../../src/core/ai/model_fetch.ts';
import { stripComments } from '../helpers/strip_comments.ts';

const REPO_ROOT = join(import.meta.dir, '..', '..');

/**
 * Code with comments, literal bodies AND regex bodies blanked, and `${…}`
 * substitutions kept as code.
 *
 * Every one of those four is load-bearing: a string is not code, a regex body
 * desyncs bracket counting, and a substitution IS code — blanking it hides a
 * call made inside a template.
 */
function code(rel: string): string {
	return stripComments(readFileSync(join(REPO_ROOT, rel), 'utf8'), {
		blankStrings: true,
		blankRegexBodies: true,
		keepTemplateSubstitutions: true,
	});
}

/**
 * How each file bounds its RESPONSES, and HOW MANY outbound calls it makes.
 *
 * The count is not bookkeeping: keyed by file alone, a new unbounded call could
 * be added to an already-declared file and the declaration would cover it
 * silently. Adding a call now forces someone to raise the number, which means
 * re-reading the reason and deciding it still applies.
 */
const BOUNDED_BY: Record<string, { sites: number; how: string }> = {
	'src/core/security/ssrf_guard.ts': {
		sites: 1,
		how: 'THE primitive: streamed byte ceiling (maxBytes) with the body cancelled on breach',
	},
	'src/core/area_maintenance/widgets/site_builder_status.ts': {
		sites: 1,
		how: 'small JSON status payload from the local daemon',
	},
	'src/core/ontology/data_io_import.ts': {
		sites: 2,
		how: 'ontology archive streamed to disk under a declared size',
	},
	'tools/tool_sitebuilder/server/daemon_client.ts': {
		sites: 3,
		how: 'local site_builder daemon over a unix socket',
	},
	'src/core/ai/model_fetch.ts': {
		sites: 2,
		how: 'multi-GB weights: IDLE bound on both transports, size checked against the manifest',
	},
	'src/core/geoip/download.ts': {
		sites: 1,
		how: 'assertAcceptableResponse caps the declared length',
	},
	'src/core/update/code_download.ts': {
		sites: 1,
		how: 'release archive verified against a declared sha',
	},
	'src/core/update/smoke_boot.ts': {
		sites: 1,
		how: 'own quarantine child over a socket it just made; /health is a fixed small body',
	},
	'src/external/transport.ts': {
		sites: 1,
		how: 'fetchExternalJson: byte cap, breaker and concurrency slot, with its own gate',
	},
};

/**
 * Sites that arm the signal on an init object BEFORE the call rather than in it.
 * Enumerated AND checked below — an enumerated file that stops arming its init
 * is exactly as naked as an unlisted one.
 */
const SIGNAL_SET_ON_INIT = new Set(['src/external/transport.ts']);

/**
 * Every caller of the no-address-policy transport must apply a policy of its
 * own, and say which. `fetchBoundedText` is deliberately an unguarded door — it
 * exists so a private-destination caller need not copy a bare `fetch` — so the
 * thing that keeps it safe is this census, not the function.
 */
const ADDRESS_POLICY: Record<string, string> = {
	'src/core/security/ssrf_guard.ts': 'fetchGuardedText applies assertPublicUrl before delegating',
	'src/core/tools/transcription_local_asr.ts':
		'isSafeLocalAsrUrl: http(s) only, private hosts ONLY behind DEDALO_TRANSCRIBER_ALLOW_PRIVATE_HOSTS',
};

/**
 * Source files in both trees, WALKED FROM DISK.
 *
 * `git ls-files` would miss a file that is not staged yet — so the census was
 * blind to exactly the code most likely to be wrong: the file the author is
 * still writing. A tripwire that only sees committed work is a tripwire that
 * reports after the fact.
 */
function sourceFiles(): string[] {
	const found: string[] = [];
	const walk = (dir: string): void => {
		for (const entry of readdirSync(join(REPO_ROOT, dir), { withFileTypes: true })) {
			const rel = `${dir}/${entry.name}`;
			if (entry.isDirectory()) {
				if (entry.name === 'node_modules' || entry.name === 'dist') continue;
				walk(rel);
			} else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
				found.push(rel);
			}
		}
	};
	walk('src');
	walk('tools');
	return found.sort();
}

/** Index of the `)` matching the `(` at or after `from`, or -1 when unbalanced. */
function matchingClose(source: string, from: number): number {
	const open = source.indexOf('(', from);
	let depth = 0;
	for (let i = open; i < source.length; i++) {
		const char = source[i];
		if (char === '(') depth++;
		else if (char === ')') {
			depth--;
			if (depth === 0) return i;
		}
	}
	return -1;
}

/** Argument `index` of a balanced argument list, split on DEPTH-0 commas. */
function callArgument(call: string, index: number): string {
	const parts: string[] = [];
	let depth = 0;
	let start = 0;
	for (let i = 0; i < call.length; i++) {
		const char = call[i];
		if (char === '{' || char === '[' || char === '(') depth++;
		else if (char === '}' || char === ']' || char === ')') depth--;
		else if (char === ',' && depth === 0) {
			parts.push(call.slice(start, i));
			start = i + 1;
		}
	}
	parts.push(call.slice(start));
	return parts[index] ?? '';
}

/** The text between `fetch(` and its matching close paren, brackets balanced. */
function callArguments(source: string, fetchIndex: number): string {
	const open = source.indexOf('(', fetchIndex);
	let depth = 0;
	for (let i = open; i < source.length; i++) {
		const char = source[i];
		if (char === '(') depth++;
		else if (char === ')') {
			depth--;
			if (depth === 0) return source.slice(open + 1, i);
		}
	}
	// Unbalanced: the scanner does not know where the call ends, so it must not
	// pretend. Empty text carries no `signal`, so the site reports as naked.
	return '';
}

/**
 * Blank TypeScript `as` / `satisfies` assertions, braces and type arguments
 * included. A type is not code, and both keywords put one INSIDE the call's
 * parentheses where bracket balancing cannot reach it.
 */
function withoutTypeAssertions(call: string): string {
	let out = call;
	for (;;) {
		const match = /\b(?:as|satisfies)\s/.exec(out);
		if (match === null) return out;
		const at = match.index;
		let i = at + match[0].length;
		let braces = 0;
		let angles = 0;
		for (; i < out.length; i++) {
			const char = out[i];
			if (char === '{') braces++;
			else if (char === '}') braces--;
			else if (char === '<') angles++;
			else if (char === '>') angles--;
			// A comma inside `Partial<{a, b}>` does NOT end the annotation — the
			// early-exit version left the type's own `signal:` behind.
			else if (char === ',' && braces === 0 && angles === 0) break;
		}
		out = `${out.slice(0, at)}${' '.repeat(i - at)}${out.slice(i)}`;
	}
}

/**
 * Does the init object carry `signal` as a TOP-LEVEL key?
 *
 * Testing the flattened argument text counted a `signal` at ANY nesting depth:
 * measured, `fetch(url, { headers: { accept: 'text/plain', signal: 'none' } })`
 * — no controller, no timeout, no cancellation of any kind — passed. The
 * scanner already balances brackets, so it can look only where the property
 * would actually take effect.
 */
function hasTopLevelSignal(call: string): boolean {
	// THE SECOND ARGUMENT, not the first `{` in the text. A URL built from a
	// template literal — `fetch(`${base}/health`, { … })` — opens a brace inside
	// argument ONE, and starting there closed at the substitution's own `}` and
	// reported a properly bounded call as naked.
	const init = callArgument(call, 1);
	const open = init.indexOf('{');
	if (open === -1) return false;
	let depth = 0;
	for (let i = open; i < init.length; i++) {
		const char = init[i];
		if (char === '{' || char === '[' || char === '(') depth++;
		else if (char === '}' || char === ']' || char === ')') {
			depth--;
			if (depth === 0) return false; // the init object closed without one
		} else if (depth === 1 && /[\w$]/.test(char as string)) {
			const rest = init.slice(i);
			const key = /^(signal)\s*(?::|,|\})/.exec(rest);
			if (key !== null) return true;
			// skip the whole token so `resignal` cannot match mid-word
			i += (/^[\w$]+/.exec(rest) as RegExpExecArray)[0].length - 1;
		}
	}
	return false;
}

/**
 * Outbound `fetch(` sites, INCLUDING member spellings (`Bun.fetch(`,
 * `globalThis.fetch(`). A census that only knew the bare identifier called
 * itself TOTAL while `Bun.fetch(` walked straight past it.
 */
function fetchSites(): Array<{ file: string; line: number; call: string }> {
	const sites: Array<{ file: string; line: number; call: string }> = [];
	for (const file of sourceFiles()) {
		const source = code(file);
		// Dotted (`Bun.fetch(`), optional (`globalThis?.fetch(`) AND COMPUTED
		// (`globalThis['fetch'](`) — a census that recognised only the first two
		// still called itself TOTAL while a legal spelling walked past it.
		const SITE =
			/(?<![\w$])(?:[\w$]+(?:\??\.[\w$]+)*\??\.)?fetch\s*\(|\[\s*(?:'|")fetch(?:'|")\s*\]\s*\(/g;
		for (const match of source.matchAll(SITE)) {
			const index = match.index as number;
			if (/typeof\s+$/.test(source.slice(Math.max(0, index - 40), index))) continue;
			// `fetch(request, server) { … }` is Bun.serve's INBOUND handler — a method
			// definition, not a call. The discriminator is what follows the matching
			// close paren: a body brace means a definition, and this server defines
			// two of them.
			const closeAt = matchingClose(source, index + match[0].length - 1);
			if (closeAt !== -1 && /^\s*\{/.test(source.slice(closeAt + 1, closeAt + 4))) continue;
			sites.push({
				file,
				line: source.slice(0, index).split('\n').length,
				call: callArguments(source, index + match[0].length - 1),
			});
		}
	}
	return sites;
}

describe('no outbound fetch is unbounded', () => {
	test('the census finds the call sites it is supposed to', () => {
		// A floor, because a broken pathspec or a stripper change would make every
		// assertion below pass by finding nothing.
		const files = sourceFiles();
		expect(files.length, 'the source census found almost nothing').toBeGreaterThan(500);
		const sites = fetchSites();
		expect(sites.length, 'the outbound census found almost nothing').toBeGreaterThan(8);
		expect(
			sites.some((s) => s.file.startsWith('tools/')),
			'the tools tree is missing',
		).toBe(true);
	});

	test('every outbound fetch carries a cancellation signal', () => {
		const naked: string[] = [];
		for (const site of fetchSites()) {
			const inCall = hasTopLevelSignal(withoutTypeAssertions(site.call));
			const armedAbove =
				SIGNAL_SET_ON_INIT.has(site.file) && /\binit\.signal\s*=/.test(code(site.file));
			if (!inCall && !armedAbove) naked.push(`${site.file}:${site.line}`);
		}
		expect(
			naked,
			'an outbound fetch with no signal holds a background lane until the peer decides otherwise',
		).toEqual([]);
	});

	test('fetch is never aliased out of the census', () => {
		// `const f = fetch; f(url)` is invisible to any textual census, so the
		// aliasing itself is banned rather than chased. Injectable `fetchImpl`
		// parameters are a different thing: they are DECLARED seams whose callers
		// are the sites above.
		// Every form measured to slip past the first version of this ban:
		//   const f = fetch                     — the plain one
		//   const { fetch: go } = globalThis    — renamed destructuring
		//   const b = globalThis.fetch.bind(…)  — a trailing method call
		//   private readonly grab = fetch       — a class field, no const/let/var
		//   function pull(impl = fetch)         — a DEFAULT-VALUED seam, which is
		//     itself the outbound site: the seam reasoning below holds only when a
		//     CALLER supplies the implementation.
		const ALIAS_FORMS: Array<[RegExp, string]> = [
			[
				/(?:const|let|var)\s+[\w$]+\s*(?::[^=;]+)?=\s*(?:globalThis|Bun)?\??\.?fetch\s*(?:[;,\n)]|\.bind)/g,
				'assigned',
			],
			[/\{\s*fetch\s*(?::\s*[\w$]+)?\s*\}\s*=/g, 'destructured'],
			[
				/(?:readonly\s+)?[\w$]+\s*(?::[^=;]+)?=\s*(?:globalThis|Bun)?\??\.?fetch\s*;/g,
				'class field',
			],
			[
				/[\w$]+\s*(?::\s*typeof\s+fetch)?\s*=\s*(?:globalThis|Bun)?\??\.?fetch\s*[,)]/g,
				'default parameter',
			],
		];
		// A DEFAULT-VALUED SEAM (`impl: typeof fetch = fetch`) is a real outbound
		// site when nobody passes an implementation, so it cannot simply be blessed
		// as "a seam" — but banning it would be wrong too: it is the tree's own
		// idiom for a testable outbound call. Enumerated, and each one must bound
		// the call it makes, asserted below.
		const DEFAULT_FETCH_SEAMS: Record<string, string> = {
			'src/core/update/status.ts':
				'advertisedUrlReachableCheck — bounded by AbortSignal.timeout(REACHABILITY_TIMEOUT_MS) at its own call',
		};
		const aliases: string[] = [];
		for (const file of sourceFiles()) {
			const source = code(file);
			for (const [pattern, form] of ALIAS_FORMS) {
				for (const match of source.matchAll(pattern)) {
					if (form === 'default parameter' && DEFAULT_FETCH_SEAMS[file] !== undefined) continue;
					const line = source.slice(0, match.index as number).split('\n').length;
					aliases.push(`${file}:${line} (${form})`);
				}
			}
		}
		expect(aliases, 'an aliased fetch cannot be censused — call it directly').toEqual([]);

		// The enumerated seams must still be bounded — the exemption covers being
		// invisible to the census, never being unbounded.
		const unboundedSeams = Object.keys(DEFAULT_FETCH_SEAMS).filter(
			(f) => !/signal:\s*AbortSignal\.timeout\(|signal:\s*\w+\.signal/.test(code(f)),
		);
		expect(unboundedSeams, 'a declared fetch seam makes an unbounded call').toEqual([]);
	});

	test('every fetching file declares how its responses are bounded, and how many calls it makes', () => {
		const perFile = new Map<string, number>();
		for (const site of fetchSites()) {
			perFile.set(site.file, (perFile.get(site.file) ?? 0) + 1);
		}
		const problems: string[] = [];
		for (const [file, count] of perFile) {
			const declared = BOUNDED_BY[file];
			if (declared === undefined) {
				problems.push(`${file}: undeclared — state its byte bound in BOUNDED_BY`);
			} else if (declared.sites !== count) {
				problems.push(
					`${file}: ${count} outbound calls, ${declared.sites} declared — a new call is not covered by an old reason`,
				);
			}
		}
		expect(problems).toEqual([]);
	});

	test('the declarations describe files that still fetch', () => {
		// The converse, so the list cannot rot into claims about code that is gone
		// and become cover for something new.
		const fetching = new Set(fetchSites().map((s) => s.file));
		const stale = Object.keys(BOUNDED_BY).filter((f) => !fetching.has(f));
		expect(stale, 'BOUNDED_BY names files that no longer fetch — delete the rows').toEqual([]);
	});

	test('the guarded primitive is what applies the public-address policy', () => {
		// One primitive, two entry policies. If the split collapses, the next
		// private-destination caller copies a bare fetch — which is how this
		// happened the first time.
		const guard = code('src/core/security/ssrf_guard.ts');
		expect(guard).toMatch(/export async function fetchBoundedText\(/);
		const guarded = guard.slice(guard.indexOf('export async function fetchGuardedText('));
		const entry = guarded.slice(0, guarded.indexOf('\n}'));
		expect(entry, 'fetchGuardedText must still apply the address policy').toMatch(
			/assertPublicUrl\(/,
		);
		expect(entry, 'fetchGuardedText must delegate the transport, not re-implement it').toMatch(
			/fetchBoundedText\(/,
		);

		const bounded = guard.slice(guard.indexOf('export async function fetchBoundedText('));
		const transport = bounded.slice(0, bounded.indexOf('\n}'));
		expect(transport, 'the transport half must stay usable by a private destination').not.toMatch(
			/assertPublicUrl\(/,
		);

		// AND IT MUST ENFORCE WHAT BOUNDED_BY CLAIMS FOR IT. A written claim nobody
		// checks is worth nothing, and this one is load-bearing for every delegator.
		expect(transport, 'no abort timer').toMatch(/setTimeout\(\s*\(\)\s*=>\s*\w+\.abort\(\)/);
		expect(transport, 'the byte ceiling is read but never compared').toMatch(/>\s*maxBytes/);
		expect(transport, 'over the ceiling the body must be cancelled').toMatch(/\.cancel\(\)/);
		expect(transport, 'no redirect mode is set at all').toMatch(/redirect:/);
	});

	test('every caller of the unguarded transport applies an address policy', () => {
		// fetchBoundedText is an outbound door with no address check by design.
		// What keeps it safe is this census.
		const callers = sourceFiles().filter((f) => /\bfetchBoundedText\s*\(/.test(code(f)));
		expect(callers.length, 'the transport has no callers — has it been renamed?').toBeGreaterThan(
			1,
		);
		const undeclared = callers.filter((f) => ADDRESS_POLICY[f] === undefined);
		expect(
			undeclared,
			'a caller of the unguarded transport must declare its own address policy in ADDRESS_POLICY',
		).toEqual([]);
		// …and the policy must GUARD the call, not merely appear in the file. Every
		// exported entry point that reaches the transport has to run the check
		// itself: a policy called once, somewhere else, guards nothing.
		const notApplied: string[] = [];
		for (const file of callers) {
			const source = code(file);
			const policy = /isSafeLocalAsrUrl\(|assertPublicUrl\(/g;
			const guards = [...source.matchAll(policy)].length;
			const uses = [...source.matchAll(/fetchBoundedText\s*\(/g)].length;
			if (guards < uses) {
				notApplied.push(`${file}: ${uses} transport calls, ${guards} address checks`);
			}
		}
		expect(
			notApplied,
			'a caller reaches the unguarded transport more often than it checks the address',
		).toEqual([]);
	});

	test('the on-premise transcriber uses the primitive, not a third copy', () => {
		const asr = code('src/core/tools/transcription_local_asr.ts');
		expect(asr, 'the ASR provider re-grew its own transport').not.toMatch(/(?<![\w$.])fetch\s*\(/);
		expect(asr).toMatch(/fetchBoundedText\(/);
		expect(asr).toMatch(/isSafeLocalAsrUrl\(/);
	});

	test('BOTH model transports are idle-bounded, including the default one', () => {
		// curl is the DEFAULT path (`haveCurl() ? curlFetch : plainFetch`), so a
		// gate that only watched the fallback watched the minority of installs.
		// An IDLE bound, never a total one: a multi-GB artifact on a museum's
		// uplink legitimately runs for hours, and what must not last is silence.
		// CALL IT AND READ THE ARGV. Asserting that the flag STRINGS appear in the
		// body proved nothing: measured, `'--speed-limit','0','--speed-time','0'`
		// — which disables curl's idle abort entirely, so curl waits forever, the
		// exact condition this bound exists to forbid — passed, and so did
		// `...(false ? [...] : [])`, an argv with no bound at all reachable.
		const argv = curlArgv('/tmp/t', 'https://example.invalid/w', true);
		const bound = (flag: string): number => {
			const at = argv.indexOf(flag);
			expect(at, `${flag} never reaches the argv`).toBeGreaterThan(-1);
			return Number(argv[at + 1]);
		};
		expect(bound('--speed-limit'), 'a floor of 0 bytes/s means curl waits forever').toBeGreaterThan(
			0,
		);
		expect(bound('--speed-time'), 'a window of 0 disables the abort').toBeGreaterThan(0);
		// A TOTAL deadline would kill a healthy multi-GB transfer on a museum's
		// uplink; the bound must stay a bound on SILENCE.
		expect(argv, 'a total deadline is the wrong instrument here').not.toContain('--max-time');

		// The FALLBACK transport's bound is not asserted here at all any more. It is
		// behavioural — "a stalled peer stops holding the lane and leaves nothing on
		// disk" — and the source-shape version of it was measured to be defeated by
		// renaming one local (`const sink = target; await Bun.write(sink, …)` left
		// the gate green over the exact >8s hang). It is driven against a loopback
		// peer in ai_model_fetch_native.test.ts, "the fallback transport is bounded
		// by silence, not by hope". This assertion only pins that the two live in
		// the same place, so deleting the behavioural gate is visible from here.
		expect(
			readFileSync(join(REPO_ROOT, 'test/unit/ai_model_fetch_native.test.ts'), 'utf8'),
			'the behavioural bound gate for plainFetch is gone',
		).toContain('bounded by silence, not by hope');
	});
});
