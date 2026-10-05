/**
 * PUBLICATION_HOST ERROR FAMILY + AGENT WIRE MAPPING (phase-3 plan E7;
 * engineering/PUBLICATION_HOST_SPEC.md §2; engineering/ERRORS_SPEC.md §2, §9).
 *
 * What it proves:
 *  1. the `publication_host.*` registry rows are exactly the nine this family owns, each with
 *     the category/status/disclosure/retryable it promises (a drift changes what the panel
 *     offers: a retry, or "an operator must act");
 *  2. every row's label exists in master.json AND lg-spa / lg-cat with the declared
 *     `${reason}` placeholder set;
 *  3. the engine's agent-reason table EQUALS the agent's closed vocabulary
 *     (publication/host_agent/src/errors.ts REASON_CODES ∪ RELEASE_REFUSAL_REASONS); the
 *     engine's own reasons are a separate, disjoint table an agent can never name;
 *  4. every agent answer maps onto the right code; the agent's prose and the host name never
 *     reach the wire; an unknown reason is never echoed;
 *  5. `rejected` / `failed` always carry a closed `details.reason`, because only wire.ts can
 *     mint them: no other file spells either literal or builds a `publication_host.` code
 *     dynamically, EVERY wire.ts export that can yield an answer code (AGENT_ANSWER_CODES,
 *     PUBLICATION_HOST_CODES; the status→code classifier is module-private) is read only by
 *     the declared classifiers (none of which constructs a DedaloError), and hostError's type
 *     excludes both. A hand-built throw would render a literal `${reason}`.
 *
 * HERMETIC: no DB, no network; reads tracked source + the label catalogs.
 */

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Glob } from 'bun';
import { REASON_CODES, RELEASE_REFUSAL_REASONS } from '../../publication/host_agent/src/errors.ts';
import {
	ERROR_CODES,
	ERROR_REGISTRY,
	type ErrorSpec,
	toErrorBody,
} from '../../src/core/errors/index.ts';
import {
	AGENT_ANSWER_CODES,
	AGENT_REASON_SENTENCES,
	agentReason,
	agentResponseError,
	DETAIL_REASONS,
	ENGINE_REASON_SENTENCES,
	engineFailure,
	engineRefusal,
	hostError,
	PUBLICATION_HOST_CODES,
	type PublicationHostCode,
	parseAgentProblem,
	registryError,
} from '../../src/core/publication_host/wire.ts';
import { stripComments } from '../helpers/strip_comments.ts';

const REPO_ROOT = resolve(import.meta.dir, '../..');
const TABLE: Record<string, ErrorSpec> = ERROR_REGISTRY;
const WIRE = 'src/core/publication_host/wire.ts';

/**
 * Every wire.ts export whose VALUE can be an answer code (rejected / failed). A file outside
 * wire.ts that holds one could feed it to `new DedaloError(` without `details.reason`.
 */
const ANSWER_CODE_SOURCES = ['AGENT_ANSWER_CODES', 'PUBLICATION_HOST_CODES'] as const;

/**
 * The ONLY files besides wire.ts that may name an ANSWER_CODE_SOURCES export — classifiers,
 * never minters — and exactly which ones. Exact in both directions: host_status.ts builds its
 * failure-code maps from AGENT_ANSWER_CODES.
 */
const ANSWER_CODE_READERS: Record<string, { reads: string[]; why: string }> = {
	'src/core/publication_host/host_status.ts': {
		reads: ['AGENT_ANSWER_CODES'],
		why: 'classifies agent-answer codes into reachable/pairing check states; mints nothing',
	},
};

function readLabels(path: string): Record<string, string> {
	return JSON.parse(readFileSync(join(REPO_ROOT, path), 'utf8')) as Record<string, string>;
}
const LABEL_FILES: [string, Record<string, string>][] = [
	['master', readLabels('src/core/labels/master.json')],
	['lg-spa', readLabels('src/core/labels/catalog/lg-spa.json')],
	['lg-cat', readLabels('src/core/labels/catalog/lg-cat.json')],
];

interface Expected {
	category: ErrorSpec['category'];
	status: number;
	disclosure: ErrorSpec['disclosure'];
	retryable: boolean;
	details_keys: string[];
}

const UNAVAILABLE_OPERATOR = {
	category: 'unavailable',
	status: 503,
	disclosure: 'operator',
} as const;

const FAMILY: Record<string, Expected> = {
	'publication_host.unconfigured': { ...UNAVAILABLE_OPERATOR, retryable: false, details_keys: [] },
	'publication_host.registry_invalid': {
		...UNAVAILABLE_OPERATOR,
		retryable: false,
		details_keys: [],
	},
	'publication_host.unreachable': { ...UNAVAILABLE_OPERATOR, retryable: true, details_keys: [] },
	'publication_host.timeout': { ...UNAVAILABLE_OPERATOR, retryable: true, details_keys: [] },
	'publication_host.pairing_mismatch': {
		...UNAVAILABLE_OPERATOR,
		retryable: false,
		details_keys: [],
	},
	'publication_host.auth': { ...UNAVAILABLE_OPERATOR, retryable: false, details_keys: [] },
	'publication_host.rejected': {
		category: 'caller',
		status: 400,
		disclosure: 'public',
		retryable: false,
		details_keys: ['reason'],
	},
	'publication_host.failed': {
		...UNAVAILABLE_OPERATOR,
		retryable: false,
		details_keys: ['reason'],
	},
	'publication_host.busy': {
		category: 'conflict',
		status: 409,
		disclosure: 'operator',
		retryable: true,
		details_keys: [],
	},
};

function placeholders(text: string): string[] {
	return [...text.matchAll(/\$\{([a-z0-9_]+)\}/g)].map((m) => m[1] as string).sort();
}

/** The agent's own prose — must reach the LOG, never the wire. */
const PROSE = 'AGENT-PROSE-MARKER /srv/dedalo_pubhost/state/rules';

function problemText(status: number, reason?: string): string {
	return JSON.stringify({
		type: 'https://dedalo.dev/publication-host/problems/x',
		title: 'X',
		status,
		detail: PROSE,
		...(reason === undefined ? {} : { reason }),
	});
}

/** The wire body minus the flag-gated debug block (DEDALO_DEBUG_API_ERRORS is not this gate's). */
function wireOf(error: Parameters<typeof toErrorBody>[0]): Record<string, unknown> {
	const { debug: _debug, ...wire } = toErrorBody(error);
	return wire;
}

/** Compile-time pin: hostError cannot mint the two ${reason} codes. Never called. */
function _typeLaw(): void {
	// @ts-expect-error — rejected is minted only by agentResponseError / engineRefusal
	hostError('publication_host.rejected', 'x');
	// @ts-expect-error — failed is minted only by agentResponseError / engineFailure
	hostError('publication_host.failed', 'x');
}
void _typeLaw;

describe('publication_host.* — the family', () => {
	test('the registry holds exactly the family, and PUBLICATION_HOST_CODES lists it', () => {
		const registered = ERROR_CODES.filter((code) => code.startsWith('publication_host.')).sort();
		expect<string[]>(registered).toEqual(Object.keys(FAMILY).sort());
		expect<string[]>([...PUBLICATION_HOST_CODES].sort()).toEqual(registered);
		expect<string[]>([...AGENT_ANSWER_CODES].sort()).toEqual([
			'publication_host.failed',
			'publication_host.rejected',
		]);
	});

	test('each row keeps its promise (category, status, disclosure, retryable, details, label key)', () => {
		for (const [code, want] of Object.entries(FAMILY)) {
			const spec = TABLE[code] as ErrorSpec;
			expect(
				{
					category: spec.category,
					status: spec.status,
					disclosure: spec.disclosure,
					retryable: spec.retryable,
					details_keys: [...(spec.details_keys ?? [])],
				},
				code,
			).toEqual(want);
			expect(spec.label_key, code).toBe(`error_${code.replace('.', '_')}`);
		}
	});

	test('every label exists in master, lg-spa and lg-cat with exactly the declared placeholders', () => {
		for (const [code, want] of Object.entries(FAMILY)) {
			const key = (TABLE[code] as ErrorSpec).label_key;
			for (const [name, labels] of LABEL_FILES) {
				const text = labels[key];
				expect(typeof text, `${name}.${key}`).toBe('string');
				expect(placeholders(text as string), `${name}.${key}`).toEqual(want.details_keys);
			}
		}
	});
});

describe('the reason vocabularies — agent table ≡ agent closed lists; engine table disjoint', () => {
	test('AGENT_REASON_SENTENCES keys EQUAL REASON_CODES ∪ RELEASE_REFUSAL_REASONS', () => {
		const agent = [...new Set<string>([...REASON_CODES, ...RELEASE_REFUSAL_REASONS])].sort();
		expect(agent.length).toBeGreaterThan(20); // anti-vacuity: both agent lists were read
		expect(Object.keys(AGENT_REASON_SENTENCES).sort()).toEqual(agent);
	});

	test('the engine reasons are disjoint from the agent ones; DETAIL_REASONS is their union + unspecified', () => {
		const engine = Object.keys(ENGINE_REASON_SENTENCES).sort();
		expect(engine).toEqual(['body_cap', 'input_invalid', 'unreadable_body']);
		expect(engine.filter((reason) => Object.hasOwn(AGENT_REASON_SENTENCES, reason))).toEqual([]);
		expect([...DETAIL_REASONS].sort()).toEqual(
			[...Object.keys(AGENT_REASON_SENTENCES), ...engine, 'unspecified'].sort(),
		);
	});

	test('every sentence is an engine-authored sentence, never a template', () => {
		const all = { ...AGENT_REASON_SENTENCES, ...ENGINE_REASON_SENTENCES };
		for (const [reason, sentence] of Object.entries(all)) {
			expect(sentence.length, reason).toBeGreaterThan(30);
			expect(sentence.endsWith('.'), reason).toBe(true);
			expect(sentence.includes('{'), reason).toBe(false);
		}
	});

	test('agentReason admits only agent closed-list members; an engine reason or anything else is "unspecified"', () => {
		expect(agentReason({ reason: 'configtest_failed' })).toBe('configtest_failed');
		expect(agentReason({ reason: 'busy' })).toBe('busy');
		for (const reason of [
			'constructor',
			'__proto__',
			'toString',
			'evil<script>',
			'',
			'body_cap',
			'input_invalid',
		]) {
			expect(agentReason({ reason }), reason).toBe('unspecified');
		}
		expect(agentReason({})).toBe('unspecified');
		expect(agentReason(parseAgentProblem('[1,2]'))).toBe('unspecified');
		expect(agentReason(parseAgentProblem('not json'))).toBe('unspecified');
	});
});

describe('agent answer → code', () => {
	const CASES: [string, number, string, PublicationHostCode][] = [
		['unauthenticated (401)', 401, problemText(401), 'publication_host.auth'],
		['forbidden (403)', 403, problemText(403), 'publication_host.auth'],
		['busy (409)', 409, problemText(409, 'busy'), 'publication_host.busy'],
		[
			'a 409 that is not busy',
			409,
			problemText(409, 'no_previous_release'),
			'publication_host.rejected',
		],
		['validation (400)', 400, problemText(400, 'actor_missing'), 'publication_host.rejected'],
		[
			'rules refused (422)',
			422,
			problemText(422, 'configtest_failed'),
			'publication_host.rejected',
		],
		['release refused (422)', 422, problemText(422, 'health_failed'), 'publication_host.rejected'],
		['unknown route (404, version skew)', 404, problemText(404), 'publication_host.failed'],
		['method not allowed (405)', 405, problemText(405), 'publication_host.failed'],
		['host action failed (503)', 503, problemText(503, 'reload_failed'), 'publication_host.failed'],
		['internal (500), body not JSON', 500, '<html>oops</html>', 'publication_host.failed'],
	];

	test('every status/reason pair lands on its code, with a closed reason and no prose or host name on the wire', () => {
		for (const [label, status, body, code] of CASES) {
			const error = agentResponseError('museum_a', status, body);
			expect(error.code, label).toBe(code);
			expect(DETAIL_REASONS.has(String(error.details?.reason)), label).toBe(true);
			// the wire reason is the agent's classified one, never re-derived elsewhere
			expect(error.details?.reason, label).toBe(agentReason(parseAgentProblem(body)));
			const wire = JSON.stringify(wireOf(error));
			expect(wire, label).not.toContain('AGENT-PROSE-MARKER');
			expect(wire, label).not.toContain('museum_a');
		}
	});

	test('rejected: the engine sentence + the closed reason on the wire; the agent prose in the log', () => {
		const error = agentResponseError('museum_a', 422, problemText(422, 'configtest_failed'));
		const wire = wireOf(error);
		expect(wire.code).toBe('publication_host.rejected');
		expect(wire.message).toBe(AGENT_REASON_SENTENCES.configtest_failed as string);
		expect(wire.details).toEqual({ reason: 'configtest_failed' });
		expect(error.message).toContain('AGENT-PROSE-MARKER');
		expect(error.coordinates).toEqual({
			publication_host: 'museum_a',
			agent_status: 422,
			agent_reason: 'configtest_failed',
		});
	});

	test('failed: the reason rides details, the wire message stays the registry English', () => {
		const error = agentResponseError('museum_a', 503, problemText(503, 'reload_failed'));
		const wire = wireOf(error);
		expect(wire.code).toBe('publication_host.failed');
		expect(wire.message).toBe(ERROR_REGISTRY['publication_host.failed'].message);
		expect(wire.details).toEqual({ reason: 'reload_failed' });
	});

	test('an unknown reason is never echoed: no sentence, details.reason = "unspecified"', () => {
		const error = agentResponseError('museum_a', 422, problemText(422, 'evil<img src=x>'));
		const wire = wireOf(error);
		expect(wire.code).toBe('publication_host.rejected');
		expect(wire.message).toBe(ERROR_REGISTRY['publication_host.rejected'].message);
		expect(wire.details).toEqual({ reason: 'unspecified' });
		expect(JSON.stringify(wire)).not.toContain('evil');
	});

	test('the log line is single-line and capped (agent prose cannot flood or forge log lines)', () => {
		const body = JSON.stringify({ status: 500, detail: `a\nb\r\u0007${'x'.repeat(5000)}` });
		const error = agentResponseError('museum_a', 500, body);
		expect(/[\r\n]/.test(error.message)).toBe(false);
		expect(error.message.includes(String.fromCharCode(7))).toBe(false);
		expect(error.message.length).toBeLessThan(500);
	});
});

describe('engine-side refusals', () => {
	test('hostError: the code, the host only in the log coordinates, nothing extra on the wire', () => {
		const codes = [
			'publication_host.unconfigured',
			'publication_host.registry_invalid',
			'publication_host.unreachable',
			'publication_host.timeout',
			'publication_host.pairing_mismatch',
			'publication_host.auth',
			'publication_host.busy',
		] as const;
		for (const code of codes) {
			const error = hostError(code, 'museum_a', {
				message: 'log only: connect ECONNREFUSED 10.0.0.7:8443',
			});
			const wire = wireOf(error);
			expect(wire.code).toBe(code);
			expect(wire.details).toBeUndefined();
			expect(JSON.stringify(wire)).not.toContain('10.0.0.7');
			expect(JSON.stringify(wire)).not.toContain('museum_a');
			expect(error.message).toContain('10.0.0.7');
			expect(error.coordinates).toEqual({ publication_host: 'museum_a' });
		}
		const merged = hostError('publication_host.unreachable', 'museum_a', {
			coordinates: { reason: 'tls', stage: 'connect', publication_host: 'spoofed' },
		});
		expect(merged.coordinates).toEqual({
			reason: 'tls',
			stage: 'connect',
			publication_host: 'museum_a',
		});
	});

	test('engineFailure: failed with the engine reason in details; operator wire message; host log-only', () => {
		const error = engineFailure('museum_a', 'body_cap', { coordinates: { max_bytes: 1024 } });
		const wire = wireOf(error);
		expect(wire.code).toBe('publication_host.failed');
		expect(wire.details).toEqual({ reason: 'body_cap' });
		expect(wire.message).toBe(ERROR_REGISTRY['publication_host.failed'].message);
		expect(JSON.stringify(wire)).not.toContain('museum_a');
		expect(error.coordinates).toEqual({
			max_bytes: 1024,
			publication_host: 'museum_a',
			reason: 'body_cap',
		});
	});

	test('engineRefusal: rejected with the ENGINE sentence and the engine reason; host log-only', () => {
		const error = engineRefusal('museum_a', 'input_invalid', {
			message: 'release.install refused before dialling: bad sha',
			coordinates: { command: 'release.install' },
		});
		const wire = wireOf(error);
		expect(wire.code).toBe('publication_host.rejected');
		expect(wire.details).toEqual({ reason: 'input_invalid' });
		expect(wire.message).toBe(ENGINE_REASON_SENTENCES.input_invalid);
		expect(JSON.stringify(wire)).not.toContain('museum_a');
		expect(JSON.stringify(wire)).not.toContain('bad sha');
		expect(error.coordinates).toEqual({
			command: 'release.install',
			publication_host: 'museum_a',
			reason: 'input_invalid',
		});
	});

	test('registryError: a held lock is busy; every other registry fault is registry_invalid', () => {
		expect(registryError('locked').code).toBe('publication_host.busy');
		expect(registryError('locked').coordinates).toEqual({
			registry_reason: 'locked',
			stage: 'local',
		});
		for (const reason of ['unreadable', 'invalid_json', 'invalid_shape', 'duplicate_name']) {
			const error = registryError(reason);
			expect(error.code, reason).toBe('publication_host.registry_invalid');
			expect(error.coordinates).toEqual({ registry_reason: reason, stage: 'local' });
		}
	});
});

describe('source law: rejected / failed are minted only by wire.ts', () => {
	const ANSWER_LITERAL = /['"`]publication_host\.(?:rejected|failed)['"`]/;
	const READER = new RegExp(`\\b(?:${ANSWER_CODE_SOURCES.join('|')})\\b`, 'g');
	const reads = (code: string): string[] =>
		[...new Set([...code.matchAll(READER)].map((m) => m[0]))].sort();
	const CONSTRUCTS = /\bnew\s+DedaloError\s*\(/;
	/** A family code assembled at runtime: `publication_host.${x}` or 'publication_host.' + x. */
	const DYNAMIC = /`publication_host\.\$\{|['"`]publication_host\.['"`]\s*\+/;

	/** Non-test TypeScript under the three trees the engine ships (comments stripped, literals kept). */
	function sources(): Map<string, string> {
		const found = new Map<string, string>();
		for (const dir of ['src', 'tools', 'scripts']) {
			for (const match of new Glob('**/*.ts').scanSync({ cwd: join(REPO_ROOT, dir) })) {
				const path = `${dir}/${match.split('\\').join('/')}`;
				if (path.endsWith('.test.ts') || path.includes('/node_modules/')) continue;
				found.set(path, stripComments(readFileSync(join(REPO_ROOT, path), 'utf8')));
			}
		}
		return found;
	}

	test('the scanners see what they claim (synthetic sources)', () => {
		expect(ANSWER_LITERAL.test("x('publication_host.failed')")).toBe(true);
		expect(ANSWER_LITERAL.test('x("publication_host.rejected")')).toBe(true);
		expect(ANSWER_LITERAL.test('x(`publication_host.failed`)')).toBe(true);
		expect(ANSWER_LITERAL.test("x('publication_host.failed_x')")).toBe(false);
		expect(ANSWER_LITERAL.test(stripComments("// 'publication_host.failed'\nconst a = 1;"))).toBe(
			false,
		);
		expect(reads('const m = new Map(AGENT_ANSWER_CODES.map((c) => [c, 1]));')).toEqual([
			'AGENT_ANSWER_CODES',
		]);
		expect(reads('const c = PUBLICATION_HOST_CODES[7]; AGENT_ANSWER_CODES;')).toEqual([
			'AGENT_ANSWER_CODES',
			'PUBLICATION_HOST_CODES',
		]);
		expect(reads('const PUBLICATION_HOST_CODES_X = 1;')).toEqual([]);
		expect(CONSTRUCTS.test('throw new DedaloError(code, {});')).toBe(true);
		expect(DYNAMIC.test('new DedaloError(`publication_host.${kind}`, {})')).toBe(true);
		expect(DYNAMIC.test("const c = 'publication_host.' + kind;")).toBe(true);
		expect(DYNAMIC.test("error.code.startsWith('publication_host.')")).toBe(false);
	});

	test('no file but wire.ts spells either literal (the registry row is the code’s definition)', () => {
		const all = sources();
		expect(all.size).toBeGreaterThan(500); // anti-vacuity: the trees were walked
		expect(all.has(WIRE)).toBe(true);
		const spelling = [...all]
			.filter(([path, code]) => path !== 'src/core/errors/registry.ts' && ANSWER_LITERAL.test(code))
			.map(([path]) => path);
		expect(spelling).toEqual([WIRE]);
	});

	test('no file but wire.ts assembles a publication_host code at runtime', () => {
		const dynamic = [...sources()]
			.filter(([path, code]) => path !== WIRE && DYNAMIC.test(code))
			.map(([path]) => path);
		expect(dynamic).toEqual([]);
	});

	test('every answer-code export of wire.ts is read only by the declared classifiers, and none of them constructs a DedaloError', () => {
		const readers = [...sources()]
			.filter(([path]) => path !== WIRE)
			.map(([path, code]) => ({ path, reads: reads(code), constructs: CONSTRUCTS.test(code) }))
			.filter((r) => r.reads.length > 0);
		expect(Object.fromEntries(readers.map((r) => [r.path, r.reads]))).toEqual(
			Object.fromEntries(
				Object.entries(ANSWER_CODE_READERS).map(([path, entry]) => [path, entry.reads]),
			),
		);
		expect(readers.filter((r) => r.constructs).map((r) => r.path)).toEqual([]);
	});

	test('wire.ts exports nothing else that yields an answer code (the status classifier is private)', () => {
		const wire = stripComments(readFileSync(join(REPO_ROOT, WIRE), 'utf8'));
		const exported = [...wire.matchAll(/^export\s+(?:const|function|let|var)\s+(\w+)/gm)].map(
			(m) => m[1],
		);
		// the answer-code-valued exports are exactly the gated sources + the four minters
		// (agentResponseError / engineFailure / engineRefusal return a DedaloError WITH a reason)
		const yieldsCode = exported.filter((name) =>
			new RegExp(
				`export\\s+(?:const|function)\\s+${name}\\b[^{;]*(?::\\s*(?:PublicationHostCode|AgentAnswerCode)\\b|Object\\.freeze\\(\\[)`,
			).test(wire),
		);
		expect(yieldsCode.sort()).toEqual([...ANSWER_CODE_SOURCES].sort());
	});
});
