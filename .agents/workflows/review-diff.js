export const meta = {
	name: 'review-diff',
	description:
		'Dédalo-aware adversarial review of a diff — a preflight that freezes the matched file set (empty ⇒ throw), freezes base/head/merge-base to commit shas, then one reviewer per invariant lens (write-path/json_codec/SQL-building, obligation-door, security-authz, client-security, ssrf-egress, request-isolation/caching, wire-contract, tripwire-integrity, gate-honesty, ops-durability, supply-ci, correctness, tests), then N independent refuters per finding (majority refutes → dropped) so only real defects survive. Complements bun run scripts/verify.ts: verify proves nothing broke; review-diff finds what a green gate misses. Args (object): base (ref/sha, default HEAD = working tree vs HEAD; resolved ONCE to a sha in the preflight — a commit landing mid-run does not move it), paths (array of git pathspecs, REPO-ROOT-relative whatever the session cwd — prefixes or globs, ":(glob)src/**/x.ts" for ** — restricting diff + file list; REQUIRED in a shared multi-lane tree; a literal path matching no changed file THROWS), mergeBase (true → diff from merge-base(base, HEAD)), head (ref/sha, frozen to a sha: review base..head from git objects, never the working tree — use while a mutation lock is live), lenses (subset of lens keys), refuters (1-5, default 3). Examples: Workflow({name:"review-diff"}); Workflow({name:"review-diff", args:{base:"main", mergeBase:true}}); Workflow({name:"review-diff", args:{base:"<pre-item sha>", paths:["src/core/security/","test/unit/write_door_native.test.ts"]}}). A bare string arg is taken as base.',
	phases: [
		{ title: 'Preflight', detail: 'freeze root + base/head/merge-base shas, then the matched file set; empty or unmatched path ⇒ throw' },
		{ title: 'Review', detail: 'one reviewer per Dédalo invariant lens' },
		{ title: 'Verify', detail: 'N independent refuters per finding, majority verdict' },
	],
}

// ── Args ─────────────────────────────────────────────────────────────────────
// args may arrive as an object, a JSON string, or a bare ref string. Malformed
// args THROW (never silently degrade to reviewing something else: a review of
// the wrong diff that comes back clean is the worst outcome).
function resolveArgs(a) {
	if (a === undefined || a === null) return {}
	if (typeof a === 'object' && !Array.isArray(a)) return a
	if (typeof a === 'string') {
		const s = a.trim()
		if (s === '') return {}
		if (s.startsWith('{')) {
			try {
				return JSON.parse(s)
			} catch (e) {
				throw new Error(`review-diff: args is not valid JSON: ${String(e)}`)
			}
		}
		return { base: s }
	}
	throw new Error('review-diff: args must be an object {base?, paths?, mergeBase?, head?, lenses?, refuters?}')
}

// A git revision the prompts may interpolate into shell commands: refs, shas,
// HEAD~n, HEAD^, ref@{n}. No whitespace, quotes, shell metachars, '..' or a
// leading '-' (which git would read as an option).
const REV_RE = /^[A-Za-z0-9][A-Za-z0-9._/~^@{}+-]*$/
function checkRev(name, v) {
	if (typeof v !== 'string' || !REV_RE.test(v) || v.includes('..') || v.length > 200) {
		throw new Error(`review-diff: ${name} ${JSON.stringify(v)} is not a plain git revision (ref or sha)`)
	}
	return v
}

// A pathspec is single-quoted into the command; refuse what would break the
// quoting or be read as an option.
function checkPath(p) {
	if (typeof p !== 'string' || p.trim() === '' || /['\n\r\0]/.test(p) || p.startsWith('-')) {
		throw new Error(`review-diff: path ${JSON.stringify(p)} is not a usable pathspec (no quotes, newlines or leading '-')`)
	}
	return p.trim()
}

// Every pathspec is anchored to the REPO ROOT. Git resolves a plain pathspec
// against the cwd, and a subagent inherits the session's cwd (e.g. an audit
// subdirectory): from there a root-relative spec silently matches nothing and
// every lens reviews an empty diff. `:(top)` pins the root; existing long-form
// magic is merged, short forms are translated, anything else is refused.
// Returns { spec, literal } — literal = a plain path (no glob/exclude magic,
// no wildcard chars) that MUST match at least one changed file.
const KNOWN_MAGIC = ['top', 'literal', 'glob', 'icase', 'exclude']
function anchorPath(p) {
	let magic = []
	let rest = p
	if (p.startsWith(':(')) {
		const close = p.indexOf(')')
		if (close < 0) throw new Error(`review-diff: path ${JSON.stringify(p)} has unterminated pathspec magic`)
		magic = p
			.slice(2, close)
			.split(',')
			.map((m) => m.trim())
			.filter(Boolean)
		rest = p.slice(close + 1)
		const unknown = magic.filter((m) => !KNOWN_MAGIC.includes(m))
		if (unknown.length) throw new Error(`review-diff: path ${JSON.stringify(p)} uses unsupported magic ${unknown.join(',')}`)
	} else if (p.startsWith(':/')) {
		rest = p.slice(2)
	} else if (p.startsWith(':!') || p.startsWith(':^')) {
		magic = ['exclude']
		rest = p.slice(2)
	} else if (p.startsWith(':')) {
		throw new Error(`review-diff: path ${JSON.stringify(p)} uses short pathspec magic this workflow does not translate; use the long form :(…)`)
	}
	if (rest === '' || rest.startsWith('-')) throw new Error(`review-diff: path ${JSON.stringify(p)} names no path`)
	if (!magic.includes('top')) magic = ['top', ...magic]
	const literal =
		!magic.includes('exclude') &&
		!magic.includes('glob') &&
		!magic.includes('icase') &&
		(magic.includes('literal') || !/[*?[]/.test(rest))
	return { spec: `:(${magic.join(',')})${rest}`, literal, path: rest.replace(/^\.\//, '') }
}

const ARGS = resolveArgs(args)
const BASE = checkRev('base', ARGS.base === undefined ? 'HEAD' : ARGS.base)
const HEAD_REV = ARGS.head === undefined ? null : checkRev('head', ARGS.head)
const MERGE_BASE = ARGS.mergeBase === true
let PATHS = []
if (ARGS.paths !== undefined) {
	const raw = typeof ARGS.paths === 'string' ? [ARGS.paths] : ARGS.paths
	if (!Array.isArray(raw)) throw new Error('review-diff: paths must be an array of pathspecs')
	PATHS = raw.map(checkPath)
}
const ANCHORED = PATHS.map(anchorPath)
let REFUTERS = 3
if (ARGS.refuters !== undefined) {
	if (!Number.isInteger(ARGS.refuters) || ARGS.refuters < 1 || ARGS.refuters > 5) {
		throw new Error('review-diff: refuters must be an integer 1..5')
	}
	REFUTERS = ARGS.refuters
}

// ── The revision spec every prompt uses (reviewers AND verifiers see the same diff)
// Every git command runs AT THE REPO ROOT (`git -C <root>`) with :(top)-anchored
// pathspecs, so output paths are root-relative whatever the agent's cwd. Until
// the preflight has frozen the root, the root is resolved in-shell.
const PATHSPEC = ANCHORED.length ? ` -- ${ANCHORED.map((a) => `'${a.spec}'`).join(' ')}` : ''
// `from` / `head` are FROZEN SHAS (or, inside the preflight only, a merge-base
// substitution over frozen shas — deterministic: two fixed commits have one
// merge base). Symbolic refs never reach a reviewer or verifier: BASE='HEAD' or a
// branch name re-resolved per agent would move under a concurrent commit and
// every later lens would review a different (often empty) diff.
function gitCommands(gitPrefix, from, head) {
	const range = head ? `${from} ${head}` : from
	return {
		diff: `${gitPrefix} diff ${range}${PATHSPEC}`,
		names: `${gitPrefix} diff --name-status ${range}${PATHSPEC}`,
		untracked: head ? null : `${gitPrefix} ls-files --others --exclude-standard${PATHSPEC}`,
	}
}
// Assigned by the preflight (root + shas frozen, then the file set frozen).
let ROOT = null
let BASE_SHA = null
let TIP_SHA = null // HEAD_REV's sha, or HEAD's sha at preflight in working-tree mode
let HEAD_SHA = null // HEAD_REV's sha; null in working-tree mode
let MERGE_BASE_SHA = null
let FROM_SHA = null // the diff's left side: MERGE_BASE_SHA ?? BASE_SHA
let DIFF_CMD = null
let NAMES_CMD = null
let UNTRACKED_CMD = null
let CHANGE_TEXT = null
let REPO_TEXT = null
const PINNED_MAX = 500

function buildChangeText(files) {
	const readRule = HEAD_SHA
		? `Read every file AS OF the reviewed revision with \`git -C '${ROOT}' show ${HEAD_SHA}:<path>\` — NEVER from the working tree (a mutation may be live there).`
		: `Read changed files from the working tree, by absolute path under ${ROOT}.`
	const revText = `- revisions FROZEN at preflight (never re-resolve a ref name): base ${BASE_SHA} (from '${BASE}')${MERGE_BASE_SHA ? `, merge-base ${MERGE_BASE_SHA} (diff left side)` : ''}${HEAD_SHA ? `, head ${HEAD_SHA} (from '${HEAD_REV}')` : `, right side = the LIVE working tree (HEAD was ${TIP_SHA} at preflight). A commit landing mid-run does not move the frozen base, but an EDIT to a frozen file mid-run (another writer) invalidates this round — if the diff you see no longer matches the frozen set, say so in your evidence instead of reviewing the new state`}`
	const scopeText = PATHS.length
		? `SCOPE: ONLY the frozen file set above (matched by the pathspec ${ANCHORED.map((a) => `'${a.spec}'`).join(' ')}). The working tree is shared with concurrent lanes: files outside it may carry OTHER lanes' uncommitted edits — read them only as context (callers, callees, specs), never report on them.`
		: 'SCOPE: the frozen file set above (the whole diff).'
	const pinned = files.slice(0, PINNED_MAX).map((f) => `  ${f.status}\t${f.path}`).join('\n')
	const more = files.length > PINNED_MAX ? `\n  … and ${files.length - PINNED_MAX} more (listing capped at ${PINNED_MAX}; the file-list command gives the rest)` : ''
	return `THE CHANGE UNDER REVIEW:
- repo root: ${ROOT} — EVERY path in this review is repo-root-relative (your cwd may be a subdirectory; never resolve a path against it)
${revText}
- file list: \`${NAMES_CMD}\`
- the diff: \`${DIFF_CMD}\` (per file: replace the pathspec with \` -- ':(top)<file>'\`)
${UNTRACKED_CMD ? `- untracked new files (part of the change — read them whole): \`${UNTRACKED_CMD}\`\n` : ''}- ${readRule}
- FROZEN FILE SET (preflight — reviewers and verifiers share exactly this set; status U = untracked new file). If the commands now print a different set (a concurrent lane edited or the integrator committed), review THIS set and say so in your evidence:
${pinned}${more}
${scopeText}
READ-ONLY: never edit files, never run git checkout/stash/reset/restore/apply, never run anything that writes a database, the media tree or git state. Other agents share this tree.`
}

// ── Schemas ──────────────────────────────────────────────────────────────────
const SEVERITY_TEXT = `Severity: S1 = reachable data loss/corruption, authorization or egress bypass, cross-request bleed, or a lying gate that hides one of those · S2 = real defect or latent debt on a reachable path (incl. a missing gate for a behavioural fix) · S3 = minor.`

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

const REVS_SCHEMA = {
	type: 'object',
	additionalProperties: false,
	required: ['root', 'base_sha', 'tip_sha'],
	properties: {
		root: { type: 'string' },
		base_sha: { type: 'string' },
		tip_sha: { type: 'string' },
	},
}

const PREFLIGHT_SCHEMA = {
	type: 'object',
	additionalProperties: false,
	required: ['merge_base', 'changed', 'untracked'],
	properties: {
		merge_base: { type: 'string' },
		changed: {
			type: 'array',
			items: {
				type: 'object',
				additionalProperties: false,
				required: ['status', 'path'],
				properties: { status: { type: 'string' }, path: { type: 'string' } },
			},
		},
		untracked: { type: 'array', items: { type: 'string' } },
	},
}

// ── The Dédalo invariant lenses ──────────────────────────────────────────────
// Each names the skills that define its invariants and the defect classes the
// audits reproduced. A generic reviewer misses these; they are what a green
// `verify` does NOT catch. Canon lives in the skills/specs — the lens is a
// pointer + checklist, not a second copy of the rule.
const DIMENSIONS = [
	{
		key: 'write-path',
		skills: ['dedalo-ts-write-path'],
		lens: `matrix-DB WRITE safety. Flag: a matrix/dd_ontology JSONB write NOT through encodeForJsonb (src/core/db/json_codec.ts — plain JSON.stringify drops undefined / NaN→null, double-encodes string scalars); a jsonb/array param bound WITHOUT $N::text::jsonb / string_to_array (the Bun.sql mis-encode / 08P01 trap); matrix DML (INSERT/UPDATE/DELETE on matrix_* or dd_ontology) outside src/core/db/matrix_write.ts / dd_ontology.ts (SQL confinement tiers, sql_confinement_tripwire); a multi-statement write NOT inside withTransaction, or a raw BEGIN (Bun pooled rejects it); a READ-MODIFY-WRITE of a matrix key or a tree invariant that relies on withTransaction ALONE — under READ COMMITTED a transaction does not stop a lost update: the read needs a row lock (SELECT … FOR UPDATE, readMatrixKeyForUpdate), or the ts_object node advisory locks (acquireNodeLock, pg_advisory_xact_lock) taken over the FULL, OVERLAPPING lock set of every writer BEFORE the read, or a single-statement per-key jsonb_set — flag same-key parent/order writes through updateMatrixKeysData whose re-read is protected only by an incidental lock, and an isAncestor cycle-guard re-check (relations/parent.ts) racing a concurrent move that locks a disjoint node set (withTransaction is necessary, not sufficient); SQL TEXT built by interpolating a value — tipo, alias_of, lang, operator, column/JSON-path segment, a number/date literal (builder_number / builder_date) — into a literal or identifier instead of a bound $N parameter or an explicit PER-SITE shape regex at that splice (e.g. TIPO_SHAPE in src/core/api/handlers/dd_mcp_api.ts) — the ONLY two guards that exist today: a SqlTipo-branded type and a DB CHECK on dd_ontology.tipo are PLANNED (audit follow-on), NOT guards yet (dd_ontology.tipo carries only a UNIQUE key), so neither a finding nor a refutation may rest on them; ONTOLOGY-SOURCED values (alias_of, tipo, properties) are UNTRUSTED here too — a privileged ontology writer is still an injection source, so a new \`\${tipo}\` splice into search/builder SQL is a finding even when the value "comes from the ontology"; work that must follow commit put in the wrong post-tx lane (registerCommitAction vs deferPostTransaction); an inline section_id/locator comparison instead of compareLocators (wrong-row write); a TM/data timestamp not from dbTimestamp; a record id minted outside insertMatrixRecordWithCounter / insertMatrixRecordWithExplicitId (counter must never go backwards — matrix_counter_monotonic_tripwire).`,
	},
	{
		key: 'obligation-door',
		skills: ['dedalo-ts-write-path', 'dedalo-observers-ts', 'dedalo-relations-ts'],
		lens: `post-write OBLIGATIONS — any write that goes AROUND the save chokepoint (section/record/save_component.ts saveComponentData, relations/save.ts, section_record/record_write.ts afterRecordWrite — THE post-write hook every persist*/create/duplicate writer calls). For every NEW or CHANGED writer of record data (restore, undelete, bulk revert, duplicate, tool writers, tree moves via updateMatrixKeyData, observer recompute persistRecordKeys, import, update transforms) check each obligation is honoured or explicitly, reasonedly not applicable. The CANON is the chokepoint itself — RecordWriteObligations / afterRecordWrite (src/core/section_record/record_write.ts) and the header of test/unit/write_obligations_tripwire.test.ts; read them, do not trust this restatement: the save event (cache fan-out, on the deferPostTransaction lane under an ambient tx — never cleared INSIDE the caller's tx), the security reaction for SECURITY_REACTIVE_SECTIONS (dd128 AND dd234 — clearSecurityCachesForWrite / invalidatePermissionsForWrite / revocation), the RAG index event (fireRagRecordEvent; obligations.rag 'index' for a content write, null only with a stated reason; kind 'delete' on removal), the dd197/dd201 modified stamps, the NEW/SAVE/DELETE activity row, the observer cascade. Beyond that hook, also: (1) OBSERVERS — the write DECLARES its observed change on afterRecordWrite ('observed': saved + the removed BEFORE-image, or kind 'none' with a reason) and the hook enqueues it on the OBLIGATION LEDGER (src/core/section_record/obligation_ledger.ts), which drains post-commit via registerCommitAction (cascade hops too, no self re-entry) — a door calling propagateToObservers itself, or a restored covered mirror propagated instead of recomputed, is a finding; (2) relation_search index — value-derived, written by the record-write chokepoint in the SAME UPDATE as the value (relations/save.ts deriveRelationSearch: the SAVE law for saves/restores/recomputes, the REMOVAL law for the three removal doors), never by a door; (3) files_info — the ONE locked media-key writer (src/core/media/tools/files_info_persist.ts transformStoredMediaItems: items read under the row lock, transformed, written in its own short transaction, lockWait declared), file work outside the lock, never a raw read-modify-write of the media column (lost update against a concurrent upload); (4) Time Machine row (TM-audited, dbTimestamp); (5) RECORD GENERATION — an explicit-id (re)birth opens a new epoch (record_generation.ts openEpochIfReborn, as create_record.ts does) so the prior life's TM history stays hidden behind withTmHistory / tmVisiblePredicate (CORE-10 class); (6) dd_ontology PROJECTION — deleting or undeleting a record of an ontology section must remove / re-project its dd_ontology node (tipo derived from requiredOntologyTld(sectionTipo)+sectionId, never the snapshot), else orphans (ONT-3 class); (7) diffusion/context-cache invalidation where the read path caches the value. A new door missing from the derived censuses (write_obligations_tripwire, dd128_write_census_tripwire) or added as a RAW_CALLER_EXEMPT row without a reason is a finding. An empty catch around an obligation is a finding (the obligation silently did not happen).`,
	},
	{
		key: 'security-authz',
		skills: ['dedalo-ts-foundation', 'dedalo-tools-ts'],
		lens: `server-side AUTHORIZATION at every door (client/** escaping and client state are the client-security lens) (HTTP dispatch actions, tool apiActions, MCP tools in src/ai/mcp/registry.ts + core/api/handlers/dd_mcp_api.ts, streams/downloads). A door that reads or writes a record must hold ALL of: the PAIR (section grant AND component grant — the human read's ddoIsAuthorized; record-addressed component levels through getRecordComponentPermission, which folds in the dd128 own-record downgrade resolveOwnUserRecordPermission — reading the RAW getPermissions level at a write door is the SEC-05 / SEC-03 hole); RECORD SCOPE (isRecordInScope / principalCanAccessRecord / assertRecordWriteTarget / filterLocatorsInScope — projects filter); the TOOL grant where a tool or the assistant is the door (getUserTools, assertActionPermission; the assistant needs the HTTP flag AND tool_assistant). Flag: a tipo/section_tipo/record id taken from the CLIENT and trusted without the pair on THAT tipo (e.g. a lifted ddo, a portal target, a media source); an admin/superuser bypass evaluated ABOVE a non-positive/invalid-id refusal; a conditional gate that fails OPEN (missing config/tipo ⇒ allowed); a read door returning component VALUES behind only a section grant (READ_DOOR_POSTURE in security/read_door.ts — a new action/MCP tool must get a posture row, 'open' only with a reason; read_door_acl_tripwire); a search/count door that lets a caller probe a section they hold 0 on (existence oracle); an inverse/relation walk that emits out-of-scope locators; a principal read outside the request context (currentPrincipal from a background job → backstop identity); an error body leaking internals (hashes, addresses, SQL) past the disclosure ladder.`,
	},
	{
		key: 'client-security',
		skills: ['dedalo-section-family-ts', 'dedalo-errors-ts'],
		lens: `the vanilla-JS CLIENT (client/**, tools/*/js/** — TS-owned primary source since the cutover, edited directly): output escaping and client-side state. Canon: client/dedalo/core/common/js/utils/render_escape.js (escape_html, render_value/render_class) and its ratcheted gate test/unit/render_escape_tripwire.test.ts; the server save sanitizer (src/core/security/html_sanitize.ts via save_component.ts — the ONE place rich text is cleaned); the CSP (APP_CSP in src/core/api/static_asset.ts, SVG_ENVELOPE_CSP in src/server.ts, site_builder_csp_tripwire). Flag: a stored/server/URL value interpolated into innerHTML / insertAdjacentHTML / outerHTML / a template string that becomes markup WITHOUT escape_html (or textContent); a render:'html' / render_class pass-through of a STORED value that the save sanitizer does not clean; an escape helper that misses any of < > & " ' (e.g. a markdown escaper escaping only md metachars — escape_md-style — whose output reaches innerHTML); a header/doc comment claiming an escaping guarantee the code does not deliver; relying on the CSP INSTEAD of escaping/sanitizing (CSP does not stop <meta http-equiv=refresh>, markup/fidelity mangling, attribute injection or form/link hijack — the sanitizer is the defence, CSP the backstop); a new raw-HTML sink not counted by the render_escape ratchet. CLIENT STATE: a queued save / retry / pending-changes buffer that SURVIVES a reload, logout or re-login and then commits under a DIFFERENT session or user (user A's queued edit saved as user B after relogin) — pending writes must be bound to the session/user that made them and dropped or re-confirmed when it changes; client-side caches (localStorage/sessionStorage/module state) keyed without the user and read after a user switch.`,
	},
	{
		key: 'ssrf-egress',
		skills: ['dedalo-ts-foundation'],
		lens: `OUTBOUND requests — canon engineering/OUTBOUND_SPEC.md (read it). The engine has THREE outbound doors on ONE guard (src/core/security/ssrf_guard.ts): fetchGuardedText (one API call, redirects REFUSED), fetchExternalJson (src/external/transport.ts, ontology-bound record services, src/external/ only), harvestFetch (src/core/harvest/, pages/files on other sites, redirects followed one vetted hop at a time, robots.txt, pace). Flag: any bare fetch / new socket / Bun.connect / http client call outside those doors (a fourth door); a private copy of a guard piece (address classification, Retry-After parsing, capped body reading, abort racing, reason strings — use isAddressRefusal); a URL that reaches a door without assertPublicUrl vetting, or a connect not pinned to the vetted address (DNS rebinding — pinToVettedAddress / fetchPinnedHop); redirect: 'follow' on an API door; no AbortSignal/deadline or no byte ceiling (readBytesCapped) on a response; fetchBoundedText used without the caller's OWN named address policy; a tool reading an error's .message from a door (it names the refused address — report toErrorBody(toDedaloError(e))); an https→http downgrade; credentials in the URL or attached before the host allowlist; user-controlled URLs (RDF URIs, pasted links, ontology api_config) choosing an internal host. Also file-system CONFINEMENT of anything derived from input: a path built from a tipo/filename/URL without normalisation + a root-containment check (../ traversal, absolute paths, symlinks), temp files outside core/files/temp_path.ts. Gates: ssrf_one_guard_tripwire, outbound_fetch_tripwire, external_outbound_tripwire, harvest_door_native. When ssrf_guard.ts ITSELF changes, audit the guard's OWN address classification, not only bypasses around it. The canon is the guard's own table headers (NON_PUBLIC_IPV4, WELL_KNOWN_IPV4_CARRIERS, TUNNEL_IPV6, NON_PUBLIC_GLOBAL_IPV6, the NAT64 declared/discovered block, isPrivateIpv6) — read them, do not trust a restatement. The shape they define: public IPv6 is an ALLOWLIST — 2000::/3 minus TUNNEL_IPV6 minus NON_PUBLIC_GLOBAL_IPV6; everything outside it (loopback, ::, ULA, link-local, site-local, multicast, IPv4-compatible ::/96, SIIT ::ffff:0:0:0/96) is refused BY BEING OUTSIDE, never by a blocklist row. ONLY the AUTHORITATIVE carriers — IPv4-mapped ::ffff:0:0/96, NAT64 well-known 64:ff9b::/96, and prefixes the operator DECLARED in DEDALO_NAT64_PREFIXES — are judged as their embedded IPv4 (embeddedIpv4). The tunnels 6to4 2002::/16 and Teredo 2001::/32 are refused WHOLE: the IPv4 inside 6to4 is the RELAY, not the destination, so vetting it "as the embedded IPv4" is a known bypass (it accepted 2002:5db8:d822::) — flag any change that reintroduces it, or that adds SIIT or local-use 64:ff9b:1::/48 as an implicit carrier (it would ACCEPT ::ffff:0:5db8:d822). RFC 7050 DISCOVERED prefixes only TIGHTEN (claimedIpv4s for refusing, never embeddedIpv4 for accepting — a lying resolver must not turn fd00::808:808 into 8.8.8.8). A zone id (%eth0) is refused. A declared prefix that does not parse fails ALL IPv6 CLOSED (nat64_config_invalid). Flag any divergence from this, and any classification-table change without a per-range NEGATIVE case (an address in the range that must be refused) in the guard's gate. Also OS-level egress CONFINEMENT: systemd/sandbox policy (publication/site_builder/src/drivers/confinement.ts — IPAddressAllow/IPAddressDeny, EGRESS_DENY) whose ordering or an allow=any lets a confined process reach loopback or RFC1918 (systemd: an address matched by BOTH lists is ALLOWED — allow wins).`,
	},
	{
		key: 'isolation-caching',
		skills: ['dedalo-ts-isolation-caching'],
		lens: `request isolation + caching (cross-request bleed class; canon engineering/REQUEST_ISOLATION.md). Flag: NEW module-level mutable state (let / Map / Set / mutated object) carrying request/principal/lang-scoped data (must go through createOntologyCache/createDataCache or the module_state_tripwire allowlist with a lifecycle reason); a cache whose KEY omits a dimension its VALUE depends on (tipo/lang/principal/profile/project); a current*() read (currentPrincipal / currentApplicationLang / currentDataLang) in a cache-key builder or a non-request context (setTimeout, module-level .then, scheduler, background job) where it returns the BACKSTOP default; a data-derived cache with no save/delete invalidation channel (stale-after-edit); identity not threaded into a detached job; a transaction-scoped store (withTransaction, runDetachedFromTransaction) read after the tx ended.`,
	},
	{
		key: 'wire-contract',
		skills: ['dedalo-parity-debugging', 'dedalo-errors-ts'],
		lens: `the WIRE CONTRACT. The engine is TS-only since the 2026-07-11 cutover; read-path parity REPLAYS a frozen fixture store (test/parity/fixtures/oracle_harvest/, ORACLE_MODE=fixtures) that can never be re-harvested; the wire law is engineering/WIRE_CONTRACT.md + one file per entry in engineering/wire_contract/. Flag: a client-facing shape change (API payload, context field, envelope, stream frame) WITHOUT a wire_contract entry — the vanilla-JS client has an exact contract and crashes silently; a frozen fixture edited without its same-day wire_contract entry; entries:null where the contract is entries:[] (WC-001); an envelope-v2 violation (a 'result' key, an error body not built by the ONE converter toErrorBody/toDedaloError, an untyped throw in a ZERO_TIER directory, a new code not in the closed registry); a normalization in a parity/differential test that could hide a real divergence; parity_baseline.json moved in the wrong direction; scope/behaviour SILENTLY NARROWED instead of throwing loudly + a ledger line (or a reasoned exemption next to the code when a gate must verify it).`,
	},
	{
		key: 'tripwire-integrity',
		skills: ['dedalo-ts-foundation', 'dedalo-ts-testing'],
		lens: `the "tripwire or delete" law (DEC-12). Flag: a NEW invariant stated in a header/README/spec with no mechanical gate (it will rot); a change that bypasses or should update an existing tripwire (SQL confinement, config no-process.env, module_state, import SCC, descriptor completeness, error taxonomy, labels, generic_tld, change_log) — engineering/TRIPWIRES.md and scripts/verify.ts TRIPWIRES must match EXACTLY; a process.env read outside src/config/ (bypasses ../private/.env + readEnv/the typed catalog); a config key added without its catalog declaration; a new static import that could close a cross-subsystem cycle (import_scc_tripwire — use boot-time registration); a ratchet baseline (unit_baseline.json, gate_vacuity_budget.json, generic_tld_baseline.json, error_throw_baseline.json, KNOWN_FAILING, *_EXEMPT lists) GROWN instead of shrunk, or grown without a reason; ANY gate, script or error message that reads a path under rewrite/ or audits/ (gitignored — absent on a clone); a coverage-state list duplicated in a header instead of linked; a reader-visible change without a changes/unreleased fragment (change_log_tripwire).`,
	},
	{
		key: 'gate-honesty',
		skills: ['dedalo-ts-testing'],
		lens: `does each NEW or CHANGED gate actually PROVE something? Flag: a gate that measures a SPELLING (a source-substring census, a symbol-presence check) where an OUTCOME is measurable — a rename or a wrapper defeats it; a gate that would stay GREEN if the fix hunk were reverted (not mutation-verifiable: name the revert and why the assertion still holds); vacuity — assertions that pass on an empty/degenerate result (length-only, subset, toBeDefined, loops over an empty list, expect inside a catch that never runs), a skipIf/describe.if/early return that silently passes when a precondition is absent (must fail loudly or be counted by gate_vacuity_tripwire), a derived census whose derivation can return an empty set; a test naming a specific install's TLD (numisdata, oh, tch, rsc, ich, mdcat…) or reading ambient DB records instead of BUILDING its situation on the generic 'test' TLD / zz* scratch TLDs (generic_tld_tripwire); a test-data write not preceded by assertTestDatabase() (dedalo_test_marker) or a media write outside a root marked .dedalo_test_media (DEDALO_TEST_MEDIA_ROOT, test/helpers/media_scratch_root.ts); asserting against a mutable production record; a gate whose exemption list is hand-maintained where it could be derived from the registry it guards.`,
	},
	{
		key: 'ops-durability',
		skills: ['dedalo-ts-ops-config'],
		lens: `operational durability (canon engineering/PRODUCTION.md). Flag: a file whose readers may see it half-written not written atomically (write to <final>.part / a temp in the SAME directory, fsync, then rename — see diffusion/writers/files.ts atomicWriteFile, core/files/temp_path.ts); a rename across filesystems (EXDEV) assumed atomic; a durability-critical write (ontology recovery file, backups, update swap, session store) with no fsync of file and directory; a schema migration / update transform / bulk rewrite NOT inside one transaction, or not idempotent/re-runnable after a crash mid-way; a long statement without its own statement_timeout policy (SET LOCAL statement_timeout inside the tx), or a lock taken without a lock_timeout; a spawned process, socket or fetch with no timeout/abort; a backup/export that can leave a zero-byte or truncated artifact looking valid (verify by a full read, not pg_restore --list); cleanup missing on the failure path (orphaned .part/temp files, leaked pool connections, a job left 'running'); failure-path cleanup that is TOO BROAD — deletes by a shared glob (.tmp-*, a whole temp dir) instead of only THIS session's own artifacts, destroying a concurrent session's work; JOB-STATE HONESTY — a resumable job/drain that can report completed/resumed WITHOUT re-deriving what actually finished (a crash mid-drain then reads 'completed' on resume); LEASES — a worker that writes after its lease/claim could have expired with no fencing token or generation check on the write (an unfenced batch can resurrect an unpublished/deleted record); a docstring claiming resume semantics that no gate exercises past depth 0 (e.g. every resume gate with maxLevels:0); graceful-shutdown/drain ignoring a new long-running task; unbounded memory (whole-table/whole-file reads where a stream exists); a config default that is unsafe in production.`,
	},
	{
		key: 'supply-ci',
		skills: ['dedalo-ts-ops-config', 'dedalo-ts-testing'],
		lens: `SUPPLY CHAIN + CI ASSURANCE (what reaches an install, and whether a gate really blocks). Covers edits to docker-compose*.yml, install.sh, Dockerfiles, .github/workflows/**, .gitlab-ci.yml, ci/image.json, scripts/ci/**, .gitleaks.toml, package.json/bun.lock/.bun-version, and any code that DOWNLOADS code, images, ontology or data. Flag: a container image or CI action NOT pinned by digest / commit SHA (ci/image.json is the one locked CI image; actions are SHA-pinned — a tag or :latest is a finding, e.g. an unpinned certbot image); a gitleaks/audit allowlist not scoped to its scan mode (an entry that exempts the working-tree or history scan wholesale instead of one reasoned path/rule) or widened without a reason; downloaded code, ontology or data applied without a sha256 (or signature) verify against a trusted manifest — mirror src/core/update/code_manifest.ts (archive sha256 from the manifest, refused on mismatch); a CI stage made ADVISORY / non-blocking ('|| true', '|| rc=$?' never raised, continue-on-error, allow_failure) or a new ADVISORY_STAGES row (test/unit/tier_wiring_tripwire.test.ts) without a measured reason and a restore criterion; a suite wired into tiers but SKIPPED in every one (all-skip twin — e.g. a real MariaDB/Postgres path that no tier provisions, so tier_wiring certifies a suite that asserts nothing); a script/doc claiming a gate blocks when the stage is advisory (verify.ts / db_tier.sh overclaim); a change to CI wiring without the matching ci_workflow_tripwire / tier_wiring_tripwire update; a dependency or image pinned OLDER than latest stable without a stated reason next to the pin (the CLAUDE.md premise + DEC-12: Dependabot proposes, scripts/ci/audit.ts ratchets advisories — never override toward older; SHA pins and .bun-version are exactness with an updater, not staleness).`,
	},
	{
		key: 'correctness',
		skills: ['dedalo-ts-foundation'],
		lens: `general correctness (the classic review lens). Flag: off-by-one, null/undefined mishandling, a swallowed error that hides a failure, a forgotten await, a wrong branch/condition, a resource not released, an unhandled rejection in a detached promise (kills the Bun process), a type-cast that lies, a virtual section resolved with a plain WHERE parent = sectionTipo instead of getSectionRealTipo / findSectionChildByModel, a caller's SQO mutated instead of deep-cloned. Give a concrete failing input → wrong output.`,
	},
	{
		key: 'tests',
		skills: ['dedalo-ts-testing'],
		lens: `test coverage + hygiene (gate-honesty covers whether a gate proves anything; this lens covers whether the gate EXISTS and behaves). Flag: a behavioural fix or new door shipped WITHOUT its gate; a gate not wired into any tier/manifest (it will never run — e.g. a client suite missing from its manifest); a mock.module without afterEach re-install (process-global leak reddens later files); scratch rows / scratch TLDs / media not torn down; order-dependent or timing-dependent assertions (flaky); a write-path contract tested only by a parity replay instead of a TS-native *_native gate; a DB test assuming a fixed section_id band (there is no reserved band — isolation is the marked suite DB).`,
	},
]

const KNOWN_LENSES = DIMENSIONS.map((d) => d.key)
let ACTIVE = DIMENSIONS
if (ARGS.lenses !== undefined) {
	if (!Array.isArray(ARGS.lenses) || ARGS.lenses.length === 0) {
		throw new Error(`review-diff: lenses must be a non-empty array of: ${KNOWN_LENSES.join(', ')}`)
	}
	const unknown = ARGS.lenses.filter((k) => !KNOWN_LENSES.includes(k))
	if (unknown.length) {
		throw new Error(`review-diff: unknown lens(es) ${unknown.join(', ')}; known: ${KNOWN_LENSES.join(', ')}`)
	}
	ACTIVE = DIMENSIONS.filter((d) => ARGS.lenses.includes(d.key))
	log(`lenses restricted to ${ACTIVE.map((d) => d.key).join(', ')} — skipped: ${KNOWN_LENSES.filter((k) => !ARGS.lenses.includes(k)).join(', ')}`)
}

const skillText = (skills) => skills.map((s) => `the ${s} skill`).join(', ')

const reviewPrompt = (d) => `You are the ${d.key} reviewer in an adversarial, Dédalo-aware review of a code change. ${REPO_TEXT}

FIRST: load ${skillText(d.skills)} (they define the invariants for your lens and name the real symbols). Then read the change.

${CHANGE_TEXT}

Review ONLY what the change adds or modifies — you are not auditing the whole repo. Follow callers/callees outside the diff only to judge the changed code.

YOUR LENS (report ONLY findings in this lens; other reviewers cover the rest):
${d.lens}

For each finding: severity, a one-line title, file:line (in the CHANGED code), a concrete failure SCENARIO (input/state → wrong result), the EVIDENCE (the offending line + why it violates the invariant, citing the skill/spec/tripwire), and a specific recommendation. ${SEVERITY_TEXT} Verify every symbol and path you cite exists. An empty findings array is a valid, good result — do not invent. Set dimension='${d.key}'.`

// Each refuter attacks from a different angle — diversity catches failure
// modes redundancy cannot. Cycled when refuters > angles.
const REFUTE_ANGLES = [
	{
		key: 'reproduce',
		text: 'REPRODUCE: re-read the cited code fresh and trace the scenario step by step. Is the quoted code real and as described at the reviewed revision? Does the claimed wrong outcome actually happen for the stated input/state?',
	},
	{
		key: 'reachability',
		text: 'REACHABILITY: which door/action/caller reaches this path, with what principal and config? Is it guarded upstream, behind a disabled flag, test-only, dead, or an INTENDED divergence recorded in engineering/wire_contract/ or a reasoned exemption next to the code?',
	},
	{
		key: 'invariant',
		text: 'INVARIANT: is the cited Dédalo invariant real and correctly stated? Load the relevant skill and find the spec/tripwire that defines it. Does the change actually violate it, or does an existing gate already catch this exact case (name it)?',
	},
]

const verifyPrompt = (f, d, i) => {
	const angle = REFUTE_ANGLES[i % REFUTE_ANGLES.length]
	return `You are adversarial verifier #${i + 1} (${angle.key}). Try to REFUTE this ${d.key} finding from a Dédalo code review. ${REPO_TEXT} Skills for this lens: ${skillText(d.skills)}.

FINDING [${f.severity}] ${f.title}
  at ${f.file_line}
  scenario: ${f.scenario}
  evidence: ${f.evidence}

${CHANGE_TEXT}

YOUR ANGLE — ${angle.text}

Do not reason from PHP-era behaviour: the PHP engine is decommissioned dead code, not an oracle. The frozen fixture store and the TS-native gates are the contract.

Verdict: CONFIRMED (you validated the defect is real and reachable), PLAUSIBLE (could not refute, could not fully confirm), or REFUTED (decisive evidence it is wrong / unreachable / intended — state it). corrected_severity: downgrade honestly ('not-a-bug' if refuted). ${SEVERITY_TEXT}`
}

// Majority rule over the votes that came back. A finding whose verifiers all
// died is kept as UNVERIFIED — never silently dropped.
const SEV_ORDER = ['S1', 'S2', 'S3', 'not-a-bug']
function aggregate(f, votes) {
	const got = votes.filter(Boolean)
	if (got.length === 0) {
		return { verdict: 'UNVERIFIED', corrected_severity: f.severity, votes: [] }
	}
	const refuted = got.filter((v) => v.verdict === 'REFUTED').length
	const confirmed = got.filter((v) => v.verdict === 'CONFIRMED').length
	const half = got.length / 2
	const verdict = refuted > half ? 'REFUTED' : confirmed > half ? 'CONFIRMED' : 'PLAUSIBLE'
	// Severity = median of the non-refuting votes' severities (tie → the more
	// severe), falling back to the reviewer's own severity.
	const sevs = got
		.filter((v) => v.verdict !== 'REFUTED' && v.corrected_severity !== 'not-a-bug')
		.map((v) => v.corrected_severity)
		.sort((a, b) => SEV_ORDER.indexOf(a) - SEV_ORDER.indexOf(b))
	const corrected_severity =
		verdict === 'REFUTED' ? 'not-a-bug' : sevs.length ? sevs[Math.floor((sevs.length - 1) / 2)] : f.severity
	return {
		verdict,
		corrected_severity,
		votes: got.map((v, i) => ({ angle: REFUTE_ANGLES[i % REFUTE_ANGLES.length].key, ...v })),
	}
}

// ── Preflight: freeze the root, the revisions (as SHAS) and the matched file
// set BEFORE any lens runs. An empty set (a pathspec typo, a cwd-relative spec, a
// lane the integrator already committed while base=HEAD) would make every lens
// return [] and the round report dry:true — the "review of the wrong diff that
// comes back clean" outcome. It THROWS instead. The revisions are frozen FIRST and
// the file set is listed against the frozen shas, so the set, the prompts' diff
// commands and the result all name the same commits.
phase('Preflight')
const SHA_RE = /^[0-9a-f]{40,64}$/
const TIP_REV = HEAD_REV || 'HEAD'
const revs = await agent(
	`Mechanical git preflight — run these commands VERBATIM (from any cwd inside the repo) and report their output exactly; do not interpret, filter or add anything.
1. \`git rev-parse --show-toplevel\` → root (the absolute path it prints).
2. \`git -C "$(git rev-parse --show-toplevel)" rev-parse --verify --end-of-options '${BASE}^{commit}'\` → base_sha (the hex it prints).
3. \`git -C "$(git rev-parse --show-toplevel)" rev-parse --verify --end-of-options '${TIP_REV}^{commit}'\` → tip_sha (the hex it prints).
If a command errors, put "ERROR: <its error text>" in that field. READ-ONLY: run nothing else.`,
	{ label: 'preflight:revs', phase: 'Preflight', schema: REVS_SCHEMA, effort: 'low' },
)
if (!revs) throw new Error('review-diff: preflight agent returned nothing — refusing to review an unknown revision')
const root = String(revs.root || '').trim()
if (!root.startsWith('/') || /['\n\r\0]/.test(root)) {
	throw new Error(`review-diff: preflight returned an unusable repo root ${JSON.stringify(revs.root)}`)
}
ROOT = root
function checkSha(name, rev, v) {
	const sha = String(v || '').trim()
	if (!SHA_RE.test(sha)) throw new Error(`review-diff: ${name} '${rev}' did not resolve to a commit sha: ${JSON.stringify(v)}`)
	return sha
}
BASE_SHA = checkSha('base', BASE, revs.base_sha)
TIP_SHA = checkSha(HEAD_REV ? 'head' : 'HEAD', TIP_REV, revs.tip_sha)
HEAD_SHA = HEAD_REV ? TIP_SHA : null

const GIT = `git -C '${ROOT}'`
// Inside the preflight only: the merge base as a substitution over FROZEN shas
// (deterministic); the prompts get the literal sha the preflight reports.
const PRE_CMDS = gitCommands(GIT, MERGE_BASE ? `$(${GIT} merge-base ${BASE_SHA} ${TIP_SHA})` : BASE_SHA, HEAD_SHA)
const pre = await agent(
	`Mechanical git preflight — run these commands VERBATIM (from any cwd) and report their output exactly; do not interpret, filter or add anything.
1. ${MERGE_BASE ? `\`${GIT} merge-base ${BASE_SHA} ${TIP_SHA}\` → merge_base (the hex it prints).` : 'merge_base: "" (not requested).'}
2. \`${PRE_CMDS.names}\` → changed: one entry per output line; status = the first tab-separated field (M, A, D, R100, C75, T…), path = the LAST tab-separated field (the destination path of a rename/copy). Empty output → [].
${PRE_CMDS.untracked ? `3. \`${PRE_CMDS.untracked}\` → untracked: one entry per output line, verbatim. Empty output → [].` : '3. untracked: [] (reviewing committed objects only).'}
If a command errors, report its error text as the single element of changed with status "ERROR". READ-ONLY: run nothing else that could write git state.`,
	{ label: 'preflight:files', phase: 'Preflight', schema: PREFLIGHT_SCHEMA, effort: 'low' },
)
if (!pre) throw new Error('review-diff: preflight agent returned nothing — refusing to review an unknown file set')
const errored = pre.changed.filter((f) => f.status === 'ERROR')
if (errored.length) throw new Error(`review-diff: preflight git command failed: ${errored.map((f) => f.path).join(' | ')}`)
MERGE_BASE_SHA = MERGE_BASE ? checkSha('merge-base', `${BASE_SHA} ${TIP_SHA}`, pre.merge_base) : null
FROM_SHA = MERGE_BASE_SHA || BASE_SHA
const FILES = [
	...pre.changed.map((f) => ({ status: String(f.status).trim(), path: String(f.path).trim() })),
	...(PRE_CMDS.untracked ? pre.untracked.map((p) => ({ status: 'U', path: String(p).trim() })) : []),
].filter((f) => f.path !== '')
if (FILES.length === 0) {
	throw new Error(
		`review-diff: the change is EMPTY — ${PRE_CMDS.names}${PRE_CMDS.untracked ? ' and the untracked listing' : ''} matched no file. A pathspec typo, or the lane's changes are already committed (pass base=<pre-item sha>). Refusing to report a clean review of nothing.`,
	)
}
const unmatched = ANCHORED.filter(
	(a) => a.literal && !FILES.some((f) => f.path === a.path || f.path.startsWith(a.path.endsWith('/') ? a.path : `${a.path}/`)),
).map((a) => a.spec)
if (unmatched.length) {
	throw new Error(
		`review-diff: literal path(s) ${unmatched.join(' ')} match no changed file (matched: ${FILES.map((f) => f.path).join(', ')}). A typo or an already-committed file — refusing to review a narrower set than asked.`,
	)
}
const FROZEN = gitCommands(GIT, FROM_SHA, HEAD_SHA)
DIFF_CMD = FROZEN.diff
NAMES_CMD = FROZEN.names
UNTRACKED_CMD = FROZEN.untracked
REPO_TEXT = `Repo root: ${ROOT} — the Dédalo v7 TS/Bun engine (the single engine since the 2026-07-11 cutover). Your cwd may be a subdirectory: resolve every path against the repo root.`
CHANGE_TEXT = buildChangeText(FILES)
if (FILES.length > PINNED_MAX) log(`frozen file set has ${FILES.length} files; prompts pin the first ${PINNED_MAX} (the rest via the file-list command)`)

log(
	`review-diff: ${DIFF_CMD}${UNTRACKED_CMD ? ' (+ untracked)' : ''} · ${FILES.length} file(s) · ${ACTIVE.length} lens(es) · ${REFUTERS} refuter(s)/finding`,
)

phase('Review')

// pipeline: each lens reviews, then each of its findings is verified by
// REFUTERS independent agents — no barrier between lenses (a fast lens's
// findings verify while a slow lens is still reading).
const uncoveredLenses = new Set()
const perDimension = await pipeline(
	ACTIVE,
	(d) =>
		agent(reviewPrompt(d), { label: `review:${d.key}`, phase: 'Review', schema: FINDINGS_SCHEMA }).then((r) => {
			if (!r) {
				uncoveredLenses.add(d.key)
				log(`review:${d.key} returned nothing — that lens is NOT covered`)
			}
			return r
		}),
	(review, d) => {
		const findings = (review && review.findings) || []
		if (findings.length === 0) return []
		return parallel(
			findings.map((f) => () =>
				parallel(
					Array.from({ length: REFUTERS }, (_, i) => () =>
						agent(verifyPrompt(f, d, i), {
							label: `verify:${d.key}#${i + 1}`,
							phase: 'Verify',
							schema: VERDICT_SCHEMA,
						}),
					),
				).then((votes) => ({ ...f, dimension: d.key, verdict: aggregate(f, votes) })),
			),
		)
	},
)

// A stage that throws drops its item to null — that lens did not run either.
ACTIVE.forEach((d, i) => {
	if (perDimension[i] === null) uncoveredLenses.add(d.key)
})
const uncovered = ACTIVE.map((d) => d.key).filter((k) => uncoveredLenses.has(k))
const all = perDimension.flat().filter(Boolean)
const surviving = all.filter((f) => f.verdict.verdict !== 'REFUTED')
const refuted = all.filter((f) => f.verdict.verdict === 'REFUTED')

const rank = { S1: 0, S2: 1, S3: 2, 'not-a-bug': 3 }
const statusRank = { CONFIRMED: 0, PLAUSIBLE: 1, UNVERIFIED: 2 }
surviving.sort(
	(a, b) =>
		(rank[a.verdict.corrected_severity] ?? 9) - (rank[b.verdict.corrected_severity] ?? 9) ||
		(statusRank[a.verdict.verdict] ?? 9) - (statusRank[b.verdict.verdict] ?? 9),
)

const counts = {}
for (const f of surviving) {
	const k = `${f.verdict.verdict}:${f.verdict.corrected_severity}`
	counts[k] = (counts[k] || 0) + 1
}
// "dry" = the P7 loop-exit condition for one round: no surviving S1/S2 and
// every lens actually ran.
const blocking = surviving.filter((f) => f.verdict.corrected_severity === 'S1' || f.verdict.corrected_severity === 'S2')
const dry = blocking.length === 0 && uncovered.length === 0

log(
	`Review complete: ${surviving.length} surviving (${blocking.length} S1/S2), ${refuted.length} refuted${uncovered.length ? `, UNCOVERED lenses: ${uncovered.join(', ')}` : ''}`,
)

return {
	base: BASE,
	base_sha: BASE_SHA,
	head: HEAD_REV,
	head_sha: HEAD_SHA,
	worktree_head_sha: HEAD_SHA ? null : TIP_SHA,
	merge_base: MERGE_BASE,
	merge_base_sha: MERGE_BASE_SHA,
	paths: PATHS,
	root: ROOT,
	diff_command: DIFF_CMD,
	files: FILES,
	lenses: ACTIVE.map((d) => d.key),
	uncovered_lenses: uncovered,
	refuters: REFUTERS,
	dry,
	counts,
	surviving: surviving.map((f) => ({
		severity: f.verdict.corrected_severity,
		status: f.verdict.verdict,
		dimension: f.dimension,
		title: f.title,
		file_line: f.file_line,
		scenario: f.scenario,
		evidence: f.evidence,
		recommendation: f.recommendation,
		votes: f.verdict.votes.map((v) => `${v.angle}: ${v.verdict}/${v.corrected_severity} — ${v.reasoning}`),
	})),
	refuted: refuted.map((f) => ({
		dimension: f.dimension,
		title: f.title,
		file_line: f.file_line,
		why: f.verdict.votes.filter((v) => v.verdict === 'REFUTED').map((v) => `${v.angle}: ${v.reasoning}`),
	})),
}
