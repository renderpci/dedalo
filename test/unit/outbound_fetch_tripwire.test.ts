/**
 * TRIPWIRE — every byte the engine fetches is BOUNDED (P1-26 / CARRY-14).
 *
 * Six outbound sites carried no signal, no timeout and no byte ceiling. That is
 * not a write hazard — an awaited fetch blocks no event loop and holds no
 * transaction, which is Wave 5's correction to the original finding — but it is
 * LANE OCCUPANCY: the engine runs background work in three shared lanes, so one
 * peer that accepts a connection and then goes quiet holds a lane for as long as
 * it likes, and every other class of background work (media, publication, RAG)
 * queues behind it. An answer without a ceiling is unbounded ingest on top.
 *
 * The pattern that produced them is the one this gate exists to stop: a hardened
 * primitive gets written once, and the next caller — whose destination is
 * legitimately private, or who needs a different parse — copies the bare `fetch`
 * instead of the primitive, and copies none of its guarantees. So the census is
 * TOTAL over `src/` and `tools/`, and an exemption must be WRITTEN DOWN here
 * with the reason it is safe, never inferred from the call's shape.
 */

import { describe, expect, test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { stripComments } from '../helpers/strip_comments.ts';

const REPO_ROOT = join(import.meta.dir, '..', '..');

/**
 * How each site bounds the RESPONSE, since a byte ceiling is not one token the
 * way a signal is. Every site must appear: an entry is a claim someone made and
 * can be checked by reading it, which is the point — an unlisted site fails.
 *
 * SHRINK-ONLY in spirit: adding a row means adding an outbound call, and the
 * reason has to survive being read.
 */
const BOUNDED_BY: Record<string, string> = {
	// the primitive itself: streamed reader with a hard maxBytes
	'src/core/security/ssrf_guard.ts': 'streamed byte ceiling (maxBytes) inside the primitive',
	// small JSON answers, read through the primitive above
	'src/core/area_maintenance/widgets/site_builder_status.ts': 'small JSON status payload',
	'src/core/ontology/data_io_import.ts': 'ontology archive streamed to disk under a declared size',
	'tools/tool_sitebuilder/server/daemon_client.ts': 'local daemon over a unix socket',
	// artifacts written straight to disk, bounded by an IDLE timer, not a size
	'src/core/ai/model_fetch.ts': 'multi-GB weights: idle bound, size checked against the manifest',
	'src/core/geoip/download.ts': 'assertAcceptableResponse caps the declared length',
	'src/core/update/code_download.ts': 'release archive verified against a declared sha',
	// the engine's own child process, over a socket it just created
	'src/core/update/smoke_boot.ts': 'own quarantine child; /health is a fixed small body',
	// the external seam's own transport, which has its own contract + gate
	'src/external/transport.ts': 'fetchExternalJson: cap, breaker and concurrency slot',
};

/**
 * Sites that arm the signal on an init object BEFORE the call rather than inside
 * it. One entry today: the external seam builds `init` through its ordered
 * pipeline and dispatches it whole. Enumerated because the alternative — looking
 * for a signal anywhere in the file — excuses every other call in that file too.
 */
const SIGNAL_SET_ON_INIT = new Set(['src/external/transport.ts']);

/**
 * Blank out TypeScript `as <Type>` assertions, braces included.
 *
 * A cast lives INSIDE the call's parentheses, so balancing brackets does not
 * remove it, and a type is not code: measured, deleting smoke_boot's actual
 * bound left `as RequestInit & { unix: string; signal: AbortSignal }` behind and
 * the signal assertion stayed green over a naked fetch.
 */
function withoutTypeAssertions(call: string): string {
	let out = call;
	for (;;) {
		const at = out.search(/\bas\s/);
		if (at === -1) return out;
		// to the end of the assertion: past any brace groups, then to a comma or end
		let i = at + 3;
		let depth = 0;
		for (; i < out.length; i++) {
			const char = out[i];
			if (char === '{') depth++;
			else if (char === '}') depth--;
			else if (char === ',' && depth === 0) break;
		}
		out = `${out.slice(0, at)}${' '.repeat(i - at)}${out.slice(i)}`;
	}
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
	return source.slice(open + 1);
}

/** Outbound `fetch(` call sites, comments and string literals blanked. */
function fetchSites(): Array<{ file: string; line: number; call: string }> {
	const files = execFileSync('git', ['ls-files', '--', 'src/**/*.ts', 'tools/**/*.ts'], {
		cwd: REPO_ROOT,
		encoding: 'utf8',
	})
		.split('\n')
		.filter(Boolean);

	const sites: Array<{ file: string; line: number; call: string }> = [];
	for (const file of files) {
		const source = stripComments(readFileSync(join(REPO_ROOT, file), 'utf8'), {
			blankStrings: true,
		});
		for (const match of source.matchAll(/(?<![.\w])fetch\s*\(/g)) {
			const index = match.index as number;
			// `typeof fetch` is a TYPE position, not a call.
			if (/typeof\s+$/.test(source.slice(Math.max(0, index - 40), index))) continue;
			sites.push({
				file,
				line: source.slice(0, index).split('\n').length,
				// EXACTLY the call's arguments, to its matching close paren. A fixed
				// window overshoots into whatever follows: measured, smoke_boot's
				// `as RequestInit & { unix: string; signal: AbortSignal }` — a TYPE
				// annotation — satisfied the signal assertion over a call whose
				// actual bound had been deleted.
				call: callArguments(source, index),
			});
		}
	}
	return sites;
}

describe('no outbound fetch is unbounded', () => {
	test('the census finds the call sites it is supposed to', () => {
		// A floor, because a broken glob or a stripper change would make every
		// assertion below pass by finding nothing — the failure mode that makes a
		// census gate worthless.
		const sites = fetchSites();
		expect(sites.length, 'the outbound census found almost nothing').toBeGreaterThan(8);
		// And it must reach BOTH trees; src-only would silently drop the tools.
		expect(sites.some((s) => s.file.startsWith('tools/'))).toBe(true);
	});

	test('every outbound fetch carries a cancellation signal', () => {
		const naked: string[] = [];
		for (const site of fetchSites()) {
			// Either in the call's own init, or set on an init object just above it
			// (src/external/transport.ts assigns `init.signal` before dispatching).
			// `signal: x`, or the ES shorthand `signal,` / `signal }` — both are the
			// property, and only accepting the first form reported a false naked
			// site in daemon_client's SSE leg, which passes a caller-owned signal.
			const inCall = /\bsignal\s*(?::|,|\})/.test(withoutTypeAssertions(site.call));
			// ENUMERATED, not pattern-matched. A "does this file mention a signal
			// anywhere" fallback excuses every site in the file: measured, deleting
			// the smoke-boot poll's own bound stayed green under it. A site that
			// arms its signal on an init object above the call says so here.
			// …and the exemption is CHECKED, not taken on trust: an enumerated file
			// that stops arming its init is exactly as naked as an unlisted one.
			const source = stripComments(readFileSync(join(REPO_ROOT, site.file), 'utf8'), {
				blankStrings: true,
			});
			const armedAbove = SIGNAL_SET_ON_INIT.has(site.file) && /\binit\.signal\s*=/.test(source);
			if (!inCall && !armedAbove) naked.push(`${site.file}:${site.line}`);
		}
		expect(
			naked,
			'an outbound fetch with no signal holds a background lane until the peer decides otherwise',
		).toEqual([]);
	});

	test('every file that fetches has declared how its responses are bounded', () => {
		const undeclared = [...new Set(fetchSites().map((s) => s.file))].filter(
			(f) => BOUNDED_BY[f] === undefined,
		);
		expect(
			undeclared,
			'a new outbound call site must state its byte bound in BOUNDED_BY, not inherit silence',
		).toEqual([]);
	});

	test('the declarations describe files that still fetch', () => {
		// The converse, so the list cannot rot into a set of claims about code that
		// no longer exists — which would let a genuinely new site hide behind a
		// long-stale entry.
		const fetching = new Set(fetchSites().map((s) => s.file));
		const stale = Object.keys(BOUNDED_BY).filter((f) => !fetching.has(f));
		expect(stale, 'BOUNDED_BY names files that no longer fetch — delete the rows').toEqual([]);
	});

	test('the guarded primitive is what applies the public-address policy', () => {
		// One primitive, two entry policies. `fetchGuardedText` = address check +
		// transport; `fetchBoundedText` = transport alone, for a caller whose
		// destination is legitimately private and who applied its OWN named policy.
		// If the split ever collapses, the next private-destination caller copies a
		// bare fetch again — which is exactly how CARRY-14 happened.
		const guard = stripComments(
			readFileSync(join(REPO_ROOT, 'src/core/security/ssrf_guard.ts'), 'utf8'),
			{ blankStrings: true },
		);
		expect(guard).toMatch(/export async function fetchBoundedText\(/);
		const guarded = guard.slice(guard.indexOf('export async function fetchGuardedText('));
		const body = guarded.slice(0, guarded.indexOf('\n}'));
		expect(body, 'fetchGuardedText must still apply the address policy').toMatch(
			/assertPublicUrl\(/,
		);
		expect(body, 'fetchGuardedText must delegate the transport, not re-implement it').toMatch(
			/fetchBoundedText\(/,
		);
		// …and the transport half must NOT smuggle the address policy in, or the
		// private-destination caller is refused and copies a bare fetch instead.
		const bounded = guard.slice(guard.indexOf('export async function fetchBoundedText('));
		const transport = bounded.slice(0, bounded.indexOf('\n}'));
		expect(transport).not.toMatch(/assertPublicUrl\(/);

		// AND IT MUST ACTUALLY ENFORCE THE THINGS BOUNDED_BY CLAIMS FOR IT.
		// BOUNDED_BY is a set of written claims; a claim nobody checks is worth
		// nothing, and this one is load-bearing for every caller that delegates
		// here. Assert the three guarantees the entry above promises: a timeout
		// that aborts, a STREAMED comparison against maxBytes that cancels the
		// body, and refusal of redirects.
		expect(transport, 'no abort timer').toMatch(/setTimeout\(\s*\(\)\s*=>\s*\w+\.abort\(\)/);
		expect(transport, 'the byte ceiling is read but never compared').toMatch(/>\s*maxBytes/);
		expect(
			transport,
			'over the ceiling, the body must be cancelled, not merely thrown past',
		).toMatch(/\.cancel\(\)/);
		// The redirect MODE is set — its value is not checkable here, because this
		// file blanks string literals on purpose (a string is not code), and saying
		// so is better than an assertion that quietly checks the property name while
		// its message claims to check the value. The behaviour itself is covered by
		// ssrf_guard.test.ts, which drives a real redirect.
		expect(transport, 'no redirect mode is set at all').toMatch(/redirect:/);
	});

	test('the on-premise transcriber uses the primitive, not a third copy', () => {
		// Its destination is private by design (a sidecar on the institution's LAN),
		// behind an explicit config-gated exemption — the exact case that tempted
		// the original author into a bare fetch.
		const asr = stripComments(
			readFileSync(join(REPO_ROOT, 'src/core/tools/transcription_local_asr.ts'), 'utf8'),
			{ blankStrings: true },
		);
		expect(asr, 'the ASR provider re-grew its own transport').not.toMatch(/(?<![.\w])fetch\s*\(/);
		expect(asr).toMatch(/fetchBoundedText\(/);
		// …and it must still apply an address policy of its own.
		expect(asr).toMatch(/isSafeLocalAsrUrl\(/);
	});
});
