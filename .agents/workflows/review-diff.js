export const meta = {
	name: 'review-diff',
	description:
		'Dédalo-aware adversarial review of the working diff — reviews the change through the invariant lenses the audit found (write-path/json_codec, request-isolation/caching, wire-contract/parity, tripwire-integrity, correctness, tests), then adversarially verifies each finding so only real defects survive. Complements bun run scripts/verify.ts (the deterministic gate): verify proves nothing broke; review-diff finds what a green gate misses. Invoke: Workflow({name:"review-diff"}) for uncommitted work, or Workflow({name:"review-diff", args:{base:"main"}}) for the whole branch.',
	phases: [
		{ title: 'Review', detail: 'one reviewer per Dédalo invariant lens' },
		{ title: 'Verify', detail: 'adversarially refute each finding' },
	],
}

// args.base — the git ref to diff against (default: working tree vs HEAD).
// args may arrive as an object, a JSON string, or (unsupported) a bare ref
// string — tolerate all three without ever throwing. Pass args as the OBJECT
// {base:"main"}; a bare "main" string is NOT parsed as a ref (it degrades to
// HEAD) — this is documented in meta.description.
function resolveArgs(a) {
	if (a && typeof a === 'object') return a
	if (typeof a === 'string' && a.trim().startsWith('{')) {
		try {
			return JSON.parse(a)
		} catch {
			return {}
		}
	}
	return {}
}
const BASE = resolveArgs(args).base || 'HEAD'

const FINDINGS_SCHEMA = {
	type: 'object',
	additionalProperties: false,
	required: ['dimension', 'findings'],
	properties: {
		dimension: { type: 'string' },
		findings: {
			type: 'array',
			items: {
				type: 'object',
				additionalProperties: false,
				required: ['severity', 'title', 'file_line', 'scenario', 'evidence', 'recommendation'],
				properties: {
					severity: { type: 'string', enum: ['S1', 'S2', 'S3'] },
					title: { type: 'string' },
					file_line: { type: 'string' },
					scenario: { type: 'string' },
					evidence: { type: 'string' },
					recommendation: { type: 'string' },
				},
			},
		},
	},
}

const VERDICT_SCHEMA = {
	type: 'object',
	additionalProperties: false,
	required: ['verdict', 'corrected_severity', 'reasoning'],
	properties: {
		verdict: { type: 'string', enum: ['CONFIRMED', 'PLAUSIBLE', 'REFUTED'] },
		corrected_severity: { type: 'string', enum: ['S1', 'S2', 'S3', 'not-a-bug'] },
		reasoning: { type: 'string' },
	},
}

// The Dédalo invariant lenses — each maps to a foundation skill and the exact
// defect classes the 2026-07 audit reproduced. A generic reviewer misses these;
// they are what a green `verify` does NOT catch.
const DIMENSIONS = [
	{
		key: 'write-path',
		skill: 'dedalo-ts-write-path',
		lens: `matrix-DB WRITE safety (coexistence corruption class). Flag: any matrix JSONB write NOT through encodeForJsonb (plain JSON.stringify drops undefined / NaN→null → PHP reads it differently on the SHARED DB); a jsonb/array param bound WITHOUT ::text::jsonb / string_to_array (Bun.sql mis-encodes — the 08P01 / double-encode trap); matrix DML (INSERT/UPDATE/DELETE on matrix_* or dd_ontology) outside src/core/db/matrix_write.ts (SQL-confinement tier T2); a multi-statement write NOT inside withTransaction (lost-update window); a raw BEGIN (Bun pooled rejects it); any inline section_id/locator comparison instead of compareLocators (wrong-row write); a TM/data timestamp NOT from dbTimestamp (UTC skew mis-orders restore history).`,
	},
	{
		key: 'isolation-caching',
		skill: 'dedalo-ts-isolation-caching',
		lens: `request isolation + caching (cross-request bleed class). Flag: any NEW module-level mutable state (let / Map / Set / mutated object) that carries request/principal/lang-scoped data (bleeds across concurrent requests — must go through createOntologyCache/createDataCache or into the module_state_tripwire allowlist with a lifecycle justification); a cache whose KEY omits a dimension its VALUE depends on (tipo/lang/principal/project) — cross-request bleed; a current*() read (currentPrincipal/currentApplicationLang/currentDataLang) inside a cache-key builder or from a non-request context (setTimeout, module-level .then, a background job) where it silently returns the BACKSTOP default (wrong-lang/wrong-user/wrong-actor); a data-derived cache with no save/delete invalidation channel (stale-after-edit).`,
	},
	{
		key: 'wire-contract-parity',
		skill: 'dedalo-ts-testing',
		lens: `the PHP-oracle wire contract. Flag: a client-facing shape that diverges from PHP WITHOUT a engineering/WIRE_CONTRACT.md ledger line (silent divergence the client may crash on); emitting entries:null where the unified contract is entries:[] (WC-001); a scope/behaviour SILENTLY NARROWED instead of throwing loudly + ledgering the gap in rewrite/LEDGER.md; a normalization in a parity test that could hide a real divergence.`,
	},
	{
		key: 'tripwire-integrity',
		skill: 'dedalo-ts-foundation',
		lens: `the "tripwire or delete" law. Flag: a change that introduces a new documented invariant WITHOUT a tripwire test (it will rot); a change that BYPASSES or should update an existing tripwire (SQL confinement T1-T4, config no-process.env, module-state, SCC size, descriptor completeness, COEX tag, boundary seam); a direct process.env read outside src/config/ (bypasses ../private/.env precedence, untestable); a new static import that could CLOSE a cross-subsystem cycle (import_scc_tripwire keeps the SCC at 0 — use boot-time registration instead); a COEX-tagged block missing its DEC cite / COEXISTENCE.md row.`,
	},
	{
		key: 'correctness',
		skill: 'dedalo-ts-foundation',
		lens: `general correctness (the classic review lens). Flag: off-by-one, null/undefined mishandling, a swallowed error that hides a failure, await forgotten on a promise, wrong branch/condition, a resource not released, an unhandled rejection in a detached promise (kills the Bun process), a type-cast that lies. Concrete failing input → wrong output.`,
	},
	{
		key: 'tests',
		skill: 'dedalo-ts-testing',
		lens: `test integrity. Flag: a behavioural fix that ships WITHOUT its gate (regression test); a differential/oracle test not gated by describe.if(hasPhpCredentials()) (silent green when creds absent — the green-suite trap); a test that could pass on an empty/degenerate response (asserts length-only / subset); a DB write to a NON-scratch surface (must be matrix_test / test TLD / dedalo_ts_test_*); a mock.module without afterEach re-install (process-global leak reddens later files); scratch rows not cleaned up.`,
	},
]

const reviewPrompt = (d) => `You are the ${d.key} reviewer in an adversarial, Dédalo-aware review of a code change. Repo (cwd): the Dédalo v7 TS/Bun rewrite.

FIRST: load the ${d.skill} skill (it defines the invariants for your lens and names the real symbols). Then read the CHANGE: run \`git diff ${BASE}\` for tracked edits and \`git status --porcelain\` + \`git diff ${BASE} -- <file>\` per file; include untracked new files (\`git ls-files --others --exclude-standard\`, then read them). Review ONLY what the diff adds/changes — you are not auditing the whole repo.

YOUR LENS (report ONLY findings in this lens; other reviewers cover the rest):
${d.lens}

For each finding: severity (S1 = correctness/isolation/data-loss/coexistence-corruption on a reachable path · S2 = real debt/latent · S3 = minor), a one-line title, file:line (in the CHANGED code), a concrete failure SCENARIO (input → wrong result), the EVIDENCE (the offending line + why it violates the invariant, citing the skill/tripwire), and a specific recommendation. Verify every symbol you cite exists. Empty findings array is a valid, good result — do not invent. Set dimension='${d.key}'.`

const verifyPrompt = (f) => `You are an adversarial verifier. Try to REFUTE this Dédalo code-review finding. Repo (cwd): the Dédalo v7 TS rewrite.

FINDING [${f.severity}] ${f.title}
  at ${f.file_line}
  scenario: ${f.scenario}
  evidence: ${f.evidence}

Re-read the cited code fresh (git diff ${BASE} and the file). Check: is the quoted code real and as described? Is the failing path REACHABLE in production (not behind a disabled flag / test-only / already guarded upstream)? If it cites a Dédalo invariant, is that invariant real (load the relevant dedalo-ts-* skill / check the tripwire)? If it cites PHP-oracle behaviour, is that claim right?

Verdict: CONFIRMED (you validated the defect is real and reachable), PLAUSIBLE (could not refute, could not fully confirm), or REFUTED (decisive evidence it is wrong / unreachable / intended — state it). Also corrected_severity (downgrade honestly; 'not-a-bug' if refuted).`

phase('Review')

// pipeline: each dimension reviews, then each of its findings is verified —
// no barrier between dimensions (a fast lens's findings verify while a slow
// lens is still reading).
const perDimension = await pipeline(
	DIMENSIONS,
	(d) => agent(reviewPrompt(d), { label: `review:${d.key}`, phase: 'Review', schema: FINDINGS_SCHEMA }),
	(review, d) => {
		const findings = (review && review.findings) || []
		if (findings.length === 0) return []
		return parallel(
			findings.map((f) => () =>
				agent(verifyPrompt(f), { label: `verify:${d.key}`, phase: 'Verify', schema: VERDICT_SCHEMA }).then(
					(v) => ({ ...f, dimension: d.key, verdict: v }),
				),
			),
		)
	},
)

const all = perDimension.flat().filter(Boolean)
const surviving = all.filter((f) => f.verdict && f.verdict.verdict !== 'REFUTED')
const refuted = all.filter((f) => f.verdict && f.verdict.verdict === 'REFUTED')

// Rank by corrected severity, most severe first.
const rank = { S1: 0, S2: 1, S3: 2, 'not-a-bug': 3 }
surviving.sort(
	(a, b) => (rank[a.verdict.corrected_severity] ?? 9) - (rank[b.verdict.corrected_severity] ?? 9),
)

log(`Review complete: ${surviving.length} surviving finding(s), ${refuted.length} refuted`)

return {
	base: BASE,
	surviving: surviving.map((f) => ({
		severity: f.verdict.corrected_severity,
		status: f.verdict.verdict,
		dimension: f.dimension,
		title: f.title,
		file_line: f.file_line,
		scenario: f.scenario,
		recommendation: f.recommendation,
	})),
	refuted: refuted.map((f) => ({ title: f.title, why: f.verdict.reasoning })),
}
