/**
 * TRIPWIRE: `permission: null` is a NAMED EXEMPTION, and the set of actions that
 * take it is SHRINK-ONLY (P2-8(a), 2026-08-24).
 *
 * Gate 7 in src/core/tools/dispatch.ts runs the action's declarative permission
 * gate. For `permission: null` that gate is `return {ok:true}` — a no-op — and
 * until this census existed NOTHING in the tree proved the handler gated instead.
 * 34 specs had chosen null; reading them one by one showed that several gate
 * nothing at all. The type change (module.ts ExemptToolActionSpec) makes the
 * author write down what they rely on; this gate makes the written-down set a
 * ratchet:
 *
 *  - a NEW `permission: null` spec fails here until it is added to CENSUS with a
 *    reason (so the exemption can never be taken silently again);
 *  - an action CONVERTED to a declarative kind must be REMOVED from CENSUS —
 *    a stale entry is red, so the list cannot quietly become fiction;
 *  - every entry must carry substantive `gatedInHandler` prose, and where that
 *    prose names an authorization symbol, the symbol must exist in the declared
 *    source and be CALLED on the handler's entry path (a transitive walk of the
 *    functions defined in the declared files);
 *  - an entry declared UNGATED must not in fact call any authorization symbol
 *    (the ratchet runs in BOTH directions: growing a real gate without saying so
 *    is red too), except for tokens explicitly exempted with a reason.
 *
 *  - a gate is CALLED DIRECTLY, never through an optional seam: an injectable
 *    replacement for the permission check makes the check optional by
 *    construction, and the liveness walk below would see `gateRecord(` and
 *    count it as called. Read STRUCTURALLY, not by spelling (review r0,
 *    2026-10-23 — the first version matched `?? gateRecord` and let an
 *    arrow-wrapped default, a destructuring default, a local wrapper, an early
 *    return and an alias through). "Gate-reaching" is a closure: the tokens,
 *    every function whose body reaches one, every `const` alias and every
 *    import of one, across files. Refused: a gate-reaching FUNCTION VALUE in any
 *    position a different value can take (a default, a `??`/`||`/`&&` operand, a
 *    ternary arm, a `let`, an assignment, a property a later spread overrides,
 *    an array pick…); a gate call CONTROL-DEPENDENT on the presence of a
 *    callable the same function calls (if/else, ternary, `||`/`&&`/`??`, or an
 *    exiting `if` that runs that callable first). Scanned over EVERY tool server
 *    source, not only the exempt ones (tool_transcription carried the shape
 *    until badbff1fc0).
 *
 * THE HONEST LIMIT — this proves an authorization symbol is CALLED on the
 * handler's entry path. It does NOT prove that it is the RIGHT check, that it
 * precedes every side effect of the action, or that no branch reaches those side
 * effects around it. It is a census with a liveness check, not an authorization
 * proof; only a declarative `permission` kind is enforced by the framework.
 * The seam rule is a source scan, not data flow: a gate function parked in a
 * data structure and looked up through it, a helper that CHOOSES between its
 * arguments, or a gate RESULT cached in caller-supplied state (a memo) are not
 * followed.
 *
 * Idiom: the same credless source scan as human_write_scope_tripwire.test.ts,
 * with comments stripped (test/helpers/strip_comments.ts) so the module headers
 * that DISCUSS `permission: null` are never mistaken for a site.
 */

import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Glob } from 'bun';
import { stripComments } from '../helpers/strip_comments.ts';

const ROOT = join(import.meta.dir, '..', '..');
const read = (rel: string): string => readFileSync(join(ROOT, rel), 'utf8');

/**
 * The files that may declare a ToolActionSpec: every tool package's server entry
 * plus the ONE framework-owned spec (the media job-status wire, which is mounted
 * on a tool but lives in core). Discovered, never hand-listed, so a new tool
 * cannot be born outside the census.
 */
const JOB_STATUS_FILE = 'src/core/tools/job_status.ts';
function specFiles(): string[] {
	const tools = readdirSync(join(ROOT, 'tools'))
		.filter((name) => /^tool_[a-z0-9_]+$/.test(name))
		.map((name) => join('tools', name, 'server', 'index.ts'))
		.filter((rel) => {
			try {
				readFileSync(join(ROOT, rel));
				return true;
			} catch {
				return false;
			}
		})
		.sort();
	// Non-vacuity for the DISCOVERY half: a mis-globbed scan must not pass.
	expect(
		tools.length,
		'no tool server modules found under tools/ — the scan is broken',
	).toBeGreaterThan(10);
	return [...tools, JOB_STATUS_FILE];
}

/** One `permission: null` spec literal found in the source. */
interface ExemptSite {
	/** `<tool>:<action>` — or `<file>#<const>` for the framework-owned spec. */
	key: string;
	file: string;
	/** The `gatedInHandler` string literal, or null when the field is absent. */
	prose: string | null;
}

/**
 * Walk from `open` (an index pointing at `{`) to its matching `}`.
 * Comment-stripped source only, so a brace inside a comment cannot mislead it;
 * braces inside string literals are the residual risk and none of the census
 * strings contains one.
 */
function objectBody(src: string, open: number): string {
	let depth = 0;
	for (let i = open; i < src.length; i++) {
		const ch = src[i];
		if (ch === '{') depth++;
		else if (ch === '}') {
			depth--;
			if (depth === 0) return src.slice(open, i + 1);
		}
	}
	throw new Error(`unbalanced object literal at index ${open}`);
}

/**
 * The census KEY of a spec literal, read from what precedes its `{`:
 *  - `get_status: {` → the apiActions map key, i.e. the wire action name;
 *  - `schedule(loaded, BACKGROUND_POLL_ACTION, {` → the action ARGUMENT of a
 *    background-only spec (unroutable from the wire, but still an exemption);
 *  - `export const MEDIA_JOB_STATUS_ACTION: ToolActionSpec = {` → the const name.
 * Anything else throws: an unnameable exemption must stop the suite, never be
 * skipped (never silently narrow scope).
 */
function siteName(before: string, file: string): string {
	const head = before.replace(/\s+$/, '');
	const asProperty = head.match(/([A-Za-z0-9_$.]+)\s*[,:]$/);
	if (asProperty !== null) return asProperty[1] as string;
	const asConst = head.match(/\b(?:const|let|var)\s+([A-Za-z0-9_$]+)\s*(?::[^=]*)?=$/);
	if (asConst !== null) return asConst[1] as string;
	throw new Error(
		`${file}: a 'permission: null' spec whose name cannot be read from the source (…${head.slice(-80)}). Name it, or the census cannot key it.`,
	);
}

/**
 * The `gatedInHandler` string of one spec literal, or null when the field is
 * absent. Both quote styles are read (biome rewrites a string containing an
 * apostrophe to double quotes), and a TEMPLATE literal is REFUSED rather than
 * skipped: an interpolated census string cannot be read statically, and a site
 * this scanner cannot read is a site nobody is checking.
 */
function proseOf(body: string, key: string): string | null {
	const field = body.match(/gatedInHandler:\s*\n?\s*(.)/);
	if (field === null) return null;
	if (field[1] === '`') {
		throw new Error(
			`${key}: gatedInHandler is a template literal. Write it as a plain string — the census must be readable from the source alone.`,
		);
	}
	const literal = body.match(
		/gatedInHandler:\s*\n?\s*'((?:[^'\\]|\\.)*)'|gatedInHandler:\s*\n?\s*"((?:[^"\\]|\\.)*)"/,
	);
	if (literal === null) return null;
	return ((literal[1] ?? literal[2]) as string).replace(/\\(['"])/g, '$1');
}

/** Every `permission: null` spec literal in the tree, keyed and with its prose. */
function scanExemptSites(): ExemptSite[] {
	const sites: ExemptSite[] = [];
	for (const file of specFiles()) {
		const src = stripComments(read(file));
		const prefix =
			file === JOB_STATUS_FILE ? `${JOB_STATUS_FILE}#` : `${file.split('/')[1] as string}:`;
		for (const match of src.matchAll(/permission:\s*null\b/g)) {
			const at = match.index as number;
			// The `{` that opens the literal holding this property.
			const open = src.lastIndexOf('{', at);
			if (open === -1) throw new Error(`${file}: 'permission: null' outside an object literal`);
			const body = objectBody(src, open);
			const name = siteName(src.slice(0, open), file);
			sites.push({ key: `${prefix}${name}`, file, prose: proseOf(body, `${prefix}${name}`) });
		}
	}
	return sites.sort((a, b) => a.key.localeCompare(b.key));
}

/**
 * A census entry. `gate` is the token the prose must name AND that must be
 * called on the handler's entry path; `null` means the entry claims no
 * authorization happens (`UNGATED`) or that none is possible to trace.
 */
interface CensusEntry {
	/** Function whose body starts the reachability walk. Null = not traceable (see `why`). */
	entry: string | null;
	/** Extra source files joined to the walk (the declaring file is always in it). */
	files?: string[];
	/** The authorization token that must appear on the entry path. */
	gate: string | null;
	/** For an UNGATED entry: authorization tokens present for a NON-gating reason. */
	allow?: readonly string[];
	/** Why `gate`/`entry` is null, or why `allow` is legitimate. Required when either is used. */
	why?: string;
}

/**
 * THE CENSUS — exactly today's `permission: null` set, seeded 2026-08-24 by
 * reading every one of these handlers. SHRINK-ONLY: remove an entry when the
 * action gains a declarative kind; adding one is a deliberate act that must be
 * argued for in review, not a side effect of typing four characters.
 */
const CENSUS: Record<string, CensusEntry> = {
	// --- tool_sitebuilder: no ontology target exists (a site slug is not a tipo),
	// and the one target-free declarative kind ('developer') would strip global
	// admins — so the fourteen stay exempt. What P2-8(b) (2026-08-24) changed is
	// that the exemption is no longer a hole: every action now runs the publisher
	// gate, and the four session doors additionally run the ownership check that
	// keeps one user out of another user's agent session.
	'tool_sitebuilder:get_status': { entry: 'getStatus', gate: 'assertPublisher' },
	'tool_sitebuilder:list_sites': { entry: 'listSites', gate: 'assertPublisher' },
	'tool_sitebuilder:create_site': { entry: 'createSite', gate: 'assertPublisher' },
	'tool_sitebuilder:delete_site': { entry: 'deleteSite', gate: 'assertPublisher' },
	'tool_sitebuilder:session_start': { entry: 'sessionStart', gate: 'assertPublisher' },
	'tool_sitebuilder:session_message': { entry: 'sessionMessage', gate: 'assertPublisher' },
	'tool_sitebuilder:session_stop': { entry: 'sessionStop', gate: 'assertPublisher' },
	'tool_sitebuilder:session_history': { entry: 'sessionHistory', gate: 'assertPublisher' },
	'tool_sitebuilder:session_stream': { entry: 'sessionStream', gate: 'assertPublisher' },
	'tool_sitebuilder:build': { entry: 'build', gate: 'assertPublisher' },
	'tool_sitebuilder:get_build': { entry: 'getBuild', gate: 'assertPublisher' },
	'tool_sitebuilder:preview': { entry: 'preview', gate: 'assertPublisher' },
	'tool_sitebuilder:publish': { entry: 'publish', gate: 'assertPublisher' },
	'tool_sitebuilder:get_audit': { entry: 'getAudit', gate: 'assertPublisher' },

	// --- tool_transcription: the target is a NESTED media_ddo, so the gate is
	// lifted inside the handler; the model actions are install-wide, hence admin.
	'tool_transcription:get_model_sources': { entry: 'getModelSources', gate: null },
	'tool_transcription:download_model': { entry: 'downloadModelAction', gate: 'isGlobalAdmin' },
	'tool_transcription:verify_model': { entry: 'verifyModelAction', gate: 'isGlobalAdmin' },
	'tool_transcription:repair_model': { entry: 'repairModelAction', gate: 'isGlobalAdmin' },
	'tool_transcription:create_transcribable_audio_file': {
		entry: 'createTranscribableAudioFile',
		gate: 'gateRecord',
	},
	'tool_transcription:delete_transcribable_audio_file': {
		entry: 'deleteTranscribableAudioFile',
		gate: 'gateRecord',
	},
	'tool_transcription:automatic_transcription': {
		entry: 'automaticTranscription',
		gate: 'gateRecord',
	},
	'tool_transcription:check_server_transcriber_status': {
		entry: 'checkServerTranscriberStatus',
		gate: 'gateRecord',
	},
	'tool_transcription:build_subtitles_file': {
		entry: 'buildSubtitlesFile',
		gate: 'gateRecord',
	},
	'tool_transcription:BACKGROUND_POLL_ACTION': {
		entry: 'backgroundTranscriberPoll',
		gate: 'authorizeRecordAccess',
		why: 'background-only: absent from apiActions, so unroutable from the wire; the enqueuing wire action gated first, and the SAVE re-runs the write door (closure Step 3, TOOLS-3 revocation)',
	},
	'tool_transcription:input.action': {
		entry: null,
		gate: null,
		why: 'the spec is built from `input.handler` inside scheduleModelJob, so no single handler is nameable at this site; both callers (downloadModelAction/repairModelAction) are isGlobalAdmin-gated above and neither action is in apiActions',
	},

	// --- tool_import_dedalo_csv: staging-area actions on the caller's OWN files.
	'tool_import_dedalo_csv:get_csv_files': { entry: 'getCsvFiles', gate: 'importDir' },
	'tool_import_dedalo_csv:delete_csv_file': { entry: 'deleteCsvFile', gate: 'importDir' },
	'tool_import_dedalo_csv:process_uploaded_file': {
		entry: 'processUploadedFile',
		gate: 'sanitizeSegment',
	},

	// --- one-action tools.
	'tool_error_report:send_report': { entry: 'sendReport', gate: 'isGlobalAdmin' },
	'tool_dev_template:status': { entry: 'status', gate: null },
	'tool_lang:automatic_translation': {
		entry: 'runAutomaticTranslation',
		files: ['src/core/tools/translation.ts'],
		gate: 'authorizeRecordAccess',
	},
	'tool_lang_multi:automatic_translation': {
		entry: 'runAutomaticTranslation',
		files: ['src/core/tools/translation.ts'],
		gate: 'authorizeRecordAccess',
	},
	'tool_propagate_component_data:propagate_component_data': {
		entry: 'propagateComponentData',
		gate: 'principalCanAccessRecord',
	},

	// --- the framework-owned spec.
	[`${JOB_STATUS_FILE}#MEDIA_JOB_STATUS_ACTION`]: {
		entry: 'mediaJobStatus',
		gate: 'mayStreamJob',
	},
};

/**
 * The tokens that MEAN authorization in this tree. Used for the reverse check:
 * an entry that claims UNGATED must not be calling one of these.
 */
const AUTHORIZATION_TOKENS: readonly string[] = [
	'assertActionPermission',
	'getPermissions',
	'isRecordInScope',
	'principalCanAccessRecord',
	'mayStreamJob',
	'assertPublisher',
	'gateRecord',
	'gateRecordWrite',
	'authorizeRecordAccess',
	'authorizeSectionTarget',
	'isGlobalAdmin',
	'isDeveloper',
	'assertTranslationPermissions',
];

/** From an index just past a `(`, the index of its matching `)`. */
function closeParen(src: string, afterOpen: number): number {
	let depth = 1;
	for (let i = afterOpen; i < src.length; i++) {
		if (src[i] === '(') depth++;
		else if (src[i] === ')') {
			depth--;
			if (depth === 0) return i;
		}
	}
	return -1;
}

/**
 * Every function BODY defined in a source, keyed by name — `function f(…) {…}`,
 * `const f = (…) => {…}` and the method-less arrow forms these files use.
 * Deliberately shallow: it is a reachability aid, not a type-aware call graph.
 *
 * The body is taken from the first `{` AFTER the parameter list closes, not the
 * first `{` after the name: these files annotate parameters with inline object
 * TYPES (`ctx: { options: …; principal: Principal }`), and taking that brace
 * would make the walk read a type as if it were the function — which is exactly
 * how this scanner first reported a real gate as absent.
 */
function functionBodies(src: string): Map<string, string> {
	const bodies = new Map<string, string>();
	const declaration =
		/(?:function\s+([A-Za-z0-9_$]+)\s*(?:<[^(]*>)?\s*\(|(?:const|let|var)\s+([A-Za-z0-9_$]+)\s*(?::[^=;]*)?=\s*(?:async\s*)?(?:function\s*\*?\s*)?\()/g;
	for (const match of src.matchAll(declaration)) {
		const name = (match[1] ?? match[2]) as string;
		const paramsEnd = closeParen(src, (match.index as number) + match[0].length);
		if (paramsEnd === -1) continue;
		const open = src.indexOf('{', paramsEnd);
		if (open === -1) continue;
		try {
			bodies.set(name, objectBody(src, open));
		} catch {
			// An unbalanced tail is not this gate's business to repair; the entry
			// simply does not resolve, and the caller reports that loudly.
		}
	}
	return bodies;
}

/** Identifiers CALLED inside a body (`name(`), plus property reads of interest. */
function calledNames(body: string): Set<string> {
	const names = new Set<string>();
	for (const m of body.matchAll(/([A-Za-z0-9_$]+)\s*\(/g)) names.add(m[1] as string);
	for (const m of body.matchAll(/\.([A-Za-z0-9_$]+)\b/g)) names.add(m[1] as string);
	return names;
}

/** The union of every token reachable from `entry` through same-file calls. */
function reachableTokens(bodies: Map<string, string>, entry: string): Set<string> {
	const seen = new Set<string>();
	const tokens = new Set<string>();
	const queue = [entry];
	while (queue.length > 0) {
		const name = queue.pop() as string;
		if (seen.has(name)) continue;
		seen.add(name);
		const body = bodies.get(name);
		if (body === undefined) continue;
		for (const called of calledNames(body)) {
			tokens.add(called);
			if (bodies.has(called)) queue.push(called);
		}
	}
	return tokens;
}

const SITES = scanExemptSites();

/**
 * The census entry for a scanned site. A site with no entry is a LOUD failure
 * here rather than an undefined-property crash three lines later: the set test
 * above already named the drift, and this keeps every other assertion readable.
 */
function censusEntry(key: string): CensusEntry {
	const entry = CENSUS[key];
	if (entry === undefined) {
		throw new Error(`${key}: no CENSUS entry — a new 'permission: null' exemption was taken`);
	}
	return entry;
}

describe('P2-8(a) — the `permission: null` census is exact and shrink-only', () => {
	test('the scan found sites at all (positive control)', () => {
		// Without this a broken regex would report an empty set and "pass" every
		// assertion below by vacuity — the classic silent-green tripwire failure.
		expect(SITES.length, 'the scan matched no `permission: null` site at all').toBeGreaterThan(20);
		expect(
			SITES.some((s) => s.key === 'tool_sitebuilder:publish'),
			'the scan must find the known-good exemplar tool_sitebuilder:publish',
		).toBe(true);
		expect(
			SITES.filter((s) => s.file === JOB_STATUS_FILE).map((s) => s.key),
			'the framework-owned spec must be found with its own key form',
		).toEqual([`${JOB_STATUS_FILE}#MEDIA_JOB_STATUS_ACTION`]);
	});

	test('the set of exempt actions is EXACTLY the census (new = red, stale = red)', () => {
		const found = [...new Set(SITES.map((s) => s.key))].sort();
		const declared = Object.keys(CENSUS).sort();
		expect(
			found,
			'`permission: null` set has drifted. A NEW entry means an action opted out of the declarative gate — add it to CENSUS only with a reason. A MISSING one means a census entry is now fiction — delete it.',
		).toEqual(declared);
	});

	test('every exempt site carries substantive gatedInHandler prose', () => {
		for (const site of SITES) {
			expect(
				site.prose,
				`${site.key}: gatedInHandler is missing or not a plain string literal`,
			).not.toBeNull();
			// Long enough to be a sentence about a mechanism, not a shrug.
			expect(
				(site.prose as string).length,
				`${site.key}: gatedInHandler must SAY what the handler does (or that it does nothing)`,
			).toBeGreaterThan(60);
		}
	});

	test('an UNGATED claim says so, and a gate claim names its symbol', () => {
		for (const site of SITES) {
			const entry = censusEntry(site.key);
			const prose = site.prose as string;
			if (entry.gate === null) {
				expect(
					/UNGATED/.test(prose),
					`${site.key}: the census records no in-handler gate, so the prose must say UNGATED`,
				).toBe(true);
			} else {
				expect(
					prose.includes(entry.gate),
					`${site.key}: the prose must name the gate symbol '${entry.gate}' it stands on`,
				).toBe(true);
			}
			if (entry.gate === null || entry.allow !== undefined) {
				expect(
					typeof entry.why === 'string' || entry.gate === null,
					`${site.key}: an exemption needs a reason`,
				).toBe(true);
			}
		}
	});

	test('a named gate symbol is really called on the handler entry path', () => {
		let checked = 0;
		for (const site of SITES) {
			const entry = censusEntry(site.key);
			if (entry.entry === null || entry.gate === null) continue;
			const sources = [site.file, ...(entry.files ?? [])].map((f) => stripComments(read(f)));
			const bodies = functionBodies(sources.join('\n'));
			expect(
				bodies.has(entry.entry),
				`${site.key}: the declared entry function '${entry.entry}' is not defined in ${[site.file, ...(entry.files ?? [])].join(', ')}`,
			).toBe(true);
			const tokens = reachableTokens(bodies, entry.entry);
			expect(
				tokens.has(entry.gate),
				`${site.key}: '${entry.gate}' is not called anywhere reachable from ${entry.entry}() — the gatedInHandler string claims a gate the handler does not run`,
			).toBe(true);
			checked++;
		}
		// Positive control for THIS assertion: it must have proved something.
		expect(
			checked,
			'no gate symbol was resolved — the reachability walk is broken',
		).toBeGreaterThan(10);
	});

	test('an UNGATED entry has not quietly grown a gate', () => {
		for (const site of SITES) {
			const entry = censusEntry(site.key);
			if (entry.gate !== null || entry.entry === null) continue;
			const sources = [site.file, ...(entry.files ?? [])].map((f) => stripComments(read(f)));
			const bodies = functionBodies(sources.join('\n'));
			if (!bodies.has(entry.entry)) continue; // reported by the test above
			const tokens = reachableTokens(bodies, entry.entry);
			const unexpected = AUTHORIZATION_TOKENS.filter(
				(token) => tokens.has(token) && !(entry.allow ?? []).includes(token),
			);
			expect(
				unexpected,
				`${site.key}: declared UNGATED but calls ${unexpected.join(', ')}. Either it now gates (say so in gatedInHandler and give the census a gate), or the token is there for another reason (add it to \`allow\` with a \`why\`).`,
			).toEqual([]);
		}
	});

	test('the walker itself refuses a symbol that is not there (negative control)', () => {
		const bodies = functionBodies(stripComments(read('tools/tool_sitebuilder/server/index.ts')));
		expect(reachableTokens(bodies, 'publish').has('assertPublisher')).toBe(true);
		// The ungated exemplar used to be listSites; P2-8(b) gave every action of that
		// tool the publisher gate, so the control moved to a helper that genuinely does
		// no authorization (requireSlug is input validation) — a negative control has to
		// point at something that is actually negative, or it proves nothing.
		expect(reachableTokens(bodies, 'requireSlug').has('assertPublisher')).toBe(false);
		expect(reachableTokens(bodies, 'publish').has('assertNoSuchGateExists')).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// THE DIRECT-CALL RULE — a gate is never reached through an optional seam.
// ---------------------------------------------------------------------------

/** Same length, newlines kept: offsets and line numbers survive a blanking. */
const blankOut = (text: string): string => text.replace(/[^\n]/g, ' ');

/**
 * The code a gate can live in: comments stripped AND string contents blanked
 * (a gatedInHandler sentence naming `gateRecord(` is prose, not a call), and the
 * import/export-from clauses blanked (naming a gate in an import is not using it).
 */
function gateScanCode(src: string): string {
	return stripComments(src, { blankStrings: true }).replace(
		/\b(?:import|export)\s+(?:type\s+)?(?:\{[^}]*\}|\*\s+as\s+[\w$]+|[\w$]+(?:\s*,\s*\{[^}]*\})?)\s*from\s*(['"])[^'"]*\1/g,
		blankOut,
	);
}

const escapeName = (name: string): string => name.replace(/\$/g, '\\$');
/** A FREE occurrence of `token`: not a property read (`principal.isGlobalAdmin`). */
const freeToken = (token: string): RegExp =>
	new RegExp(`(?<![\\w$.])${escapeName(token)}(?![\\w$])`, 'g');
const containsFreeToken = (text: string, token: string): boolean => freeToken(token).test(text);
/** A free CALL of `name` (`name(`, `name<T>(`, `name?.(`, `name.call(`). */
const CALL_SUFFIX = /^\s*(?:<[^<>()]*>\s*)?(?:\?\.\s*)?(?:\.\s*(?:call|apply|bind)\s*)?\(/;

const isIdent = (c: string | undefined): boolean => c !== undefined && /[\w$]/.test(c);
const isOpener = (c: string | undefined): boolean => c === '(' || c === '[' || c === '{';
const isCloser = (c: string | undefined): boolean => c === ')' || c === ']' || c === '}';
const isArrowAt = (code: string, i: number): boolean => code[i] === '>' && code[i - 1] === '=';
function prevNonSpace(code: string, i: number): number {
	let j = i;
	while (j >= 0 && /\s/.test(code[j] as string)) j--;
	return j;
}
function nextNonSpace(code: string, i: number): number {
	let j = i;
	while (j < code.length && /\s/.test(code[j] as string)) j++;
	return j;
}
/** The identifier that ENDS at `end` (inclusive). */
function wordEndingAt(code: string, end: number): string {
	let k = end;
	while (k >= 0 && isIdent(code[k])) k--;
	return code.slice(k + 1, end + 1);
}
/** From a closer, its matching opener (-1 when unbalanced). */
function matchBack(code: string, close: number): number {
	let depth = 0;
	for (let i = close; i >= 0; i--) {
		if (isCloser(code[i])) depth++;
		else if (isOpener(code[i]) && --depth === 0) return i;
	}
	return -1;
}
/** From an opener, its matching closer (-1 when unbalanced). */
function matchForward(code: string, open: number): number {
	let depth = 0;
	for (let i = open; i < code.length; i++) {
		if (isOpener(code[i])) depth++;
		else if (isCloser(code[i]) && --depth === 0) return i;
	}
	return -1;
}
/** The innermost opener still open at `from` (inclusive), or -1 at module level. */
function enclosingOpener(code: string, from: number): number {
	let depth = 0;
	for (let i = from; i >= 0; i--) {
		if (isCloser(code[i])) depth++;
		else if (isOpener(code[i])) {
			if (depth === 0) return i;
			depth--;
		}
	}
	return -1;
}
/** From `from`, the end of an expression: the first depth-0 `,` `;` or unmatched closer. */
function expressionEnd(code: string, from: number): number {
	let depth = 0;
	for (let i = from; i < code.length; i++) {
		const ch = code[i];
		if (isOpener(ch)) depth++;
		else if (isCloser(ch)) {
			if (depth === 0) return i;
			depth--;
		} else if (depth === 0 && (ch === ',' || ch === ';')) return i;
	}
	return code.length;
}

/** A word that ends a TYPE annotation's text can never be one of these. */
const NOT_A_TYPE_END = new Set([
	'else',
	'try',
	'finally',
	'do',
	'return',
	'in',
	'of',
	'typeof',
	'async',
	'await',
	'new',
	'case',
	'yield',
]);

/**
 * `j` is the last char of a return-type annotation (`(…): T` before `=>` or `{`):
 * the index of the `)` closing the parameter list, else -1. Return types are why
 * "the `{` after `)`" is not enough (`): Promise<{ ok: boolean }> {`).
 */
function annotationParen(code: string, j: number): number {
	const end = code[j];
	if (!(isIdent(end) || end === '>' || end === ']' || end === '}')) return -1;
	if (isIdent(end) && NOT_A_TYPE_END.has(wordEndingAt(code, j))) return -1;
	let depth = 0;
	for (let i = j; i >= 0; i--) {
		const ch = code[i] as string;
		if (isArrowAt(code, i)) {
			i--;
			continue;
		}
		if (isCloser(ch) || ch === '>') depth++;
		else if (isOpener(ch) || ch === '<') {
			if (depth-- === 0) return -1;
		} else if (depth > 0) continue;
		else if (ch === ':') {
			const p = prevNonSpace(code, i - 1);
			return code[p] === ')' ? p : -1;
		} else if (!(isIdent(ch) || /\s/.test(ch) || '|&.\'"'.includes(ch))) return -1;
	}
	return -1;
}

/** `open` is a parameter list's `(`: the function's start (`async` when present). */
function withAsync(code: string, open: number): number {
	const p = prevNonSpace(code, open - 1);
	return wordEndingAt(code, p) === 'async' ? p - 4 : open;
}

/** `arrowAt` is the `=` of a `=>`: where that arrow function starts, or -1. */
function arrowStart(code: string, arrowAt: number): number {
	const j = prevNonSpace(code, arrowAt - 1);
	const close = code[j] === ')' ? j : annotationParen(code, j);
	if (close === -1) {
		if (!isIdent(code[j])) return -1;
		return withAsync(code, j - wordEndingAt(code, j).length + 1); // `x => …`
	}
	const open = matchBack(code, close);
	return open === -1 ? -1 : withAsync(code, open);
}

/** One function in the source: an arrow, a `function`, or a method. */
interface FunctionUnit {
	/** Where it starts (`async`, `function`, the `(`, a bare parameter, a method name). */
	start: number;
	/** One past its last char. */
	end: number;
	kind: 'arrow' | 'function' | 'method';
	/** The name of a `function name` / method; null for an arrow or anonymous function. */
	name: string | null;
	/** Its body text. */
	body: string;
}

const CONTROL_HEADS = new Set(['if', 'for', 'while', 'switch', 'catch', 'with', 'await']);

/** The `{` at `brace` opens a function body: that function, else null. */
function braceFunction(code: string, brace: number): FunctionUnit | null {
	const close = matchForward(code, brace);
	const end = close === -1 ? code.length : close + 1;
	const body = code.slice(brace, end);
	const p = prevNonSpace(code, brace - 1);
	if (isArrowAt(code, p)) {
		const start = arrowStart(code, p - 1);
		return start === -1 ? null : { start, end, kind: 'arrow', name: null, body };
	}
	const paramsClose = code[p] === ')' ? p : annotationParen(code, p);
	if (paramsClose === -1) return null;
	const paramsOpen = matchBack(code, paramsClose);
	if (paramsOpen === -1) return null;
	const head = code.slice(Math.max(0, paramsOpen - 160), paramsOpen);
	const fn = head.match(/\b(?:async\s+)?function\b\s*\*?\s*([\w$]*)\s*(?:<[^()]*>)?\s*$/);
	if (fn !== null)
		return { start: paramsOpen - fn[0].length, end, kind: 'function', name: fn[1] || null, body };
	const method = head.match(/([\w$]+)\s*(?:<[^()]*>)?\s*$/);
	if (method === null || CONTROL_HEADS.has(method[1] as string)) return null;
	return {
		start: paramsOpen - method[0].length,
		end,
		kind: 'method',
		name: method[1] as string,
		body,
	};
}

/** `arrowAt` is the `>` of an EXPRESSION-bodied arrow: that function, else null. */
function expressionArrow(code: string, arrowAt: number): FunctionUnit | null {
	const bodyStart = nextNonSpace(code, arrowAt + 1);
	if (code[bodyStart] === '{') return null; // a block body: braceFunction owns it
	const start = arrowStart(code, arrowAt - 1);
	if (start === -1) return null;
	const end = expressionEnd(code, bodyStart);
	return { start, end, kind: 'arrow', name: null, body: code.slice(bodyStart, end) };
}

/** Every function in `code`, in source order. */
function functionUnits(code: string): FunctionUnit[] {
	const units: FunctionUnit[] = [];
	for (let i = 0; i < code.length; i++) {
		const unit =
			code[i] === '{'
				? braceFunction(code, i)
				: isArrowAt(code, i)
					? expressionArrow(code, i)
					: null;
		if (unit !== null) units.push(unit);
	}
	return units;
}

/** The innermost function containing index `at`, or null at module level. */
function enclosingFunction(units: readonly FunctionUnit[], at: number): FunctionUnit | null {
	let best: FunctionUnit | null = null;
	for (const unit of units) {
		if (unit.start <= at && at < unit.end && (best === null || unit.start >= best.start))
			best = unit;
	}
	return best;
}

/** The binding a function is DECLARED under: `function f`, `const f = …`, a method. */
function declaredName(code: string, unit: FunctionUnit): string | null {
	if (unit.name !== null) return unit.name;
	const head = code.slice(Math.max(0, unit.start - 200), unit.start);
	return head.match(/\b(?:const|let|var)\s+([\w$]+)\s*(?::[^=;]*)?=\s*$/)?.[1] ?? null;
}

/** `import { a, b as c } from './x.ts'` → local name → [resolved file, exported name]. */
function relativeImports(file: string, src: string): Map<string, [string, string]> {
	const out = new Map<string, [string, string]>();
	const dir = file.split('/').slice(0, -1);
	for (const m of stripComments(src).matchAll(
		/\bimport\s+(?:type\s+)?\{([^}]*)\}\s*from\s*['"](\.[^'"]*)['"]/g,
	)) {
		const parts = [...dir];
		for (const seg of (m[2] as string).split('/')) {
			if (seg === '..') parts.pop();
			else if (seg !== '.') parts.push(seg);
		}
		for (const spec of (m[1] as string).split(',')) {
			const named = spec
				.trim()
				.replace(/^type\s+/, '')
				.match(/^([\w$]+)(?:\s+as\s+([\w$]+))?$/);
			if (named !== null)
				out.set((named[2] ?? named[1]) as string, [parts.join('/'), named[1] as string]);
		}
	}
	return out;
}

/** One scanned source: raw text, scan code, and its functions. */
interface GateSource {
	file: string;
	src: string;
	code: string;
	units: FunctionUnit[];
}

const gateSource = (file: string, src: string): GateSource => {
	const code = gateScanCode(src);
	return { file, src, code, units: functionUnits(code) };
};

/** Does `text` reach a gate: CALL a gate-reaching name, or read an authorization token property? */
function reachesGate(text: string, names: ReadonlySet<string>, tokens: readonly string[]): boolean {
	for (const name of names) {
		for (const m of text.matchAll(freeToken(name))) {
			if (CALL_SUFFIX.test(text.slice((m.index as number) + name.length))) return true;
		}
	}
	return tokens.some((token) => new RegExp(`\\.${token}(?![\\w$])`).test(text));
}

/**
 * The GATE-REACHING names of every source: the authorization tokens; every
 * function DECLARED in that file (`function f`, `const f = (…) =>`, a method)
 * whose body reaches one; every `const g = f` alias of one; and every name
 * IMPORTED from another scanned file where it is gate-reaching — to a fixpoint.
 * So a wrapper of a wrapper of gateRecord, lifted into a helper module and
 * renamed on import, is still a gate.
 */
function gateReachingNames(
	sources: readonly GateSource[],
	tokens: readonly string[],
): Map<string, Set<string>> {
	const reaching = new Map(sources.map((s) => [s.file, new Set(tokens)] as const));
	const imports = new Map(sources.map((s) => [s.file, relativeImports(s.file, s.src)] as const));
	let grew = true;
	while (grew) {
		grew = false;
		for (const { file, code, units } of sources) {
			const names = reaching.get(file) as Set<string>;
			const add = (name: string | null): void => {
				if (name !== null && !names.has(name)) {
					names.add(name);
					grew = true;
				}
			};
			for (const [local, [target, exported]] of imports.get(file) as Map<
				string,
				[string, string]
			>) {
				if (reaching.get(target)?.has(exported) === true) add(local);
			}
			for (const unit of units) {
				if (reachesGate(unit.body, names, tokens)) add(declaredName(code, unit));
			}
			for (const m of code.matchAll(
				/\b(?:const|let|var)\s+([\w$]+)\s*(?::[^=;]*)?=\s*([\w$]+)\s*[;,\n]/g,
			)) {
				if (names.has(m[2] as string)) add(m[1] as string);
			}
		}
	}
	return reaching;
}

const NOT_A_CALLEE = new Set([
	'if',
	'for',
	'while',
	'switch',
	'catch',
	'with',
	'return',
	'typeof',
	'await',
	'in',
	'of',
	'new',
	'void',
	'delete',
	'instanceof',
	'yield',
	'case',
	'do',
	'else',
	'throw',
]);

/** Does the `(` at `open` start a call's argument list (not a group, not a control head)? */
function isCallParen(code: string, open: number): boolean {
	const p = prevNonSpace(code, open - 1);
	const ch = code[p];
	if (ch === ')' || ch === ']') return true;
	if (ch === '.' && code[p - 1] === '?') return true; // fn?.(
	if (ch === '>' && !isArrowAt(code, p)) return true; // fn<T>(
	return isIdent(ch) && !NOT_A_CALLEE.has(wordEndingAt(code, p));
}

/** Is the `{` at `open` an OBJECT LITERAL (not a block, a class body or a type)? */
function isObjectLiteral(code: string, open: number): boolean {
	const p = prevNonSpace(code, open - 1);
	const ch = code[p];
	if (p < 0 || ch === ')' || ch === ';' || ch === '{' || ch === '}' || isArrowAt(code, p))
		return false;
	if (isIdent(ch)) {
		const word = wordEndingAt(code, p);
		return word === 'return' || word === 'yield' || word === 'await' || word === 'default';
	}
	return true;
}

/** Is the `{` at `open` a class body? */
const isClassBody = (code: string, open: number): boolean =>
	/\bclass\b(?:\s+[\w$]+)?(?:\s*<[^>]*>)?(?:\s+extends\s+[^{]+)?(?:\s+implements\s+[^{]+)?\s*$/.test(
		code.slice(Math.max(0, open - 200), open),
	);

/**
 * Where the expression at [start, end) sits, as a function VALUE: null when that
 * position cannot be swapped for a caller-supplied value, else the label of the
 * position that can.
 *
 * Fixed (null): a `const` binding; a statement; an argument of a call (a
 * callback the callee runs); `return` / an arrow's expression body (a factory);
 * a property of an object literal — or an element of an array literal — that
 * itself sits in a fixed position and has no spread AFTER the property (a
 * later spread overrides it); a read (`!g`, `g === x`, `typeof`).
 * Swappable (a label): a parameter or destructuring DEFAULT, any other `=`
 * (`let`, a member assignment), a `??` / `||` / `&&` operand, a ternary arm, a
 * spread, an index, a `let` binding — every place a different value can stand
 * in for the gate.
 */
function valuePosition(code: string, start: number, end: number, hops = 0): string | null {
	if (hops > 64) return 'nested beyond the scanner';
	const q = prevNonSpace(code, start - 1);
	const prev = code[q] as string;
	if (q < 0 || prev === ';' || prev === '}') return null;
	if (code.slice(Math.max(0, q - 2), q + 1) === '...') return 'spread';
	if (prev === '(' || prev === ',' || prev === '[' || prev === '{') {
		const open = isOpener(prev) ? q : enclosingOpener(code, q);
		if (open === -1) return null;
		const close = matchForward(code, open);
		if (code[open] === '(') {
			if (isCallParen(code, open)) return null;
			// a group: `(gateFn)`, `(async () => …)` — where the GROUP sits decides;
			// called on the spot (an IIFE) it is a call, not a value.
			if (close !== -1 && code[nextNonSpace(code, close + 1)] === '(') return null;
			return close === -1 ? 'unbalanced group' : valuePosition(code, open, close + 1, hops + 1);
		}
		if (code[open] === '[') {
			const before = code[prevNonSpace(code, open - 1)];
			if (isIdent(before) && !NOT_A_CALLEE.has(wordEndingAt(code, prevNonSpace(code, open - 1))))
				return 'index';
			if (before === ')' || before === ']') return 'index';
			const after = code[nextNonSpace(code, close + 1)];
			if (after === '.' || after === '[') return 'array read in place';
			return valuePosition(code, open, close + 1, hops + 1);
		}
		if (!isObjectLiteral(code, open)) {
			return isClassBody(code, open) || prev === '{' ? null : 'block';
		}
		return objectPosition(code, open, end, hops);
	}
	if (prev === ':') {
		const open = enclosingOpener(code, q);
		if (open !== -1 && code[open] === '{' && isObjectLiteral(code, open)) {
			// `key: value` unless a depth-0 `?` sits between the last separator and the `:`.
			let i = q - 1;
			let depth = 0;
			for (; i > open; i--) {
				const ch = code[i] as string;
				if (isCloser(ch)) depth++;
				else if (isOpener(ch)) depth--;
				else if (depth === 0 && (ch === ',' || ch === '?')) break;
			}
			if (code[i] !== '?') return objectPosition(code, open, end, hops);
		}
		return 'ternary arm';
	}
	if ((prev === '?' || prev === '|' || prev === '&') && code[q - 1] === prev)
		return `'${prev}${prev}' operand`;
	if (prev === '?') return 'ternary arm';
	if (prev === '>' && isArrowAt(code, q)) return null;
	if (prev === '=') {
		const before = code[q - 1] as string;
		if ('=!<>'.includes(before)) return null; // a comparison is a read
		if ('?|&'.includes(before)) return `'${code.slice(q - 2, q + 1).trim()}' fallback`;
		const head = code.slice(Math.max(0, q - 200), q + 1);
		if (/\bconst\s+[\w$]+\s*(?::[^=;]*)?=$/.test(head)) return null;
		if (/\b(?:let|var)\s+[\w$]+\s*(?::[^=;]*)?=$/.test(head)) return 'reassignable binding';
		return 'default / assignment';
	}
	if (isIdent(prev)) {
		const word = wordEndingAt(code, q);
		if (
			[
				'return',
				'yield',
				'await',
				'default',
				'export',
				'typeof',
				'void',
				'in',
				'instanceof',
				'case',
			].includes(word)
		)
			return null;
	}
	return null; // an operator operand (`!g`, `g + …`): a read
}

/** Where a property VALUE of the object literal at `open` sits. */
function objectPosition(code: string, open: number, valueEnd: number, hops: number): string | null {
	const close = matchForward(code, open);
	if (close === -1) return 'unbalanced object';
	// A spread AFTER the property overrides it: `{ gate: defaultGate, ...seams }`.
	let depth = 0;
	for (let i = valueEnd; i < close; i++) {
		const ch = code[i];
		if (isOpener(ch)) depth++;
		else if (isCloser(ch)) depth--;
		else if (depth === 0 && code.startsWith('...', i))
			return 'object property overridden by a later spread';
	}
	return valuePosition(code, open, close + 1, hops + 1);
}

/** A dotted path or bare identifier, `?.` normalised to `.`. */
const PATH = /(?<![\w$.?])[A-Za-z_$][\w$]*(?:\s*\??\.\s*[A-Za-z_$][\w$]*)*/g;
const RESERVED = new Set([
	...NOT_A_CALLEE,
	'true',
	'false',
	'null',
	'undefined',
	'this',
	'const',
	'let',
	'var',
	'function',
	'async',
	'super',
	'class',
	'break',
	'continue',
]);

/**
 * The paths a condition tests for PRESENCE: a path that is not called
 * (`seams.gate`, `!g`, `typeof seams.gate === …`) or is called OPTIONALLY
 * (`seams.gate?.(…)`). A plain call (`isValid(x)`) tests a result, not a presence.
 */
function testedPaths(condition: string): string[] {
	const found = new Set<string>();
	for (const m of condition.matchAll(PATH)) {
		const raw = m[0];
		if (!raw.includes('.') && RESERVED.has(raw)) continue;
		const after = condition.slice((m.index as number) + raw.length);
		if (/^\s*\(/.test(after)) continue;
		found.add(raw.replace(/\s+/g, '').replace(/\?\./g, '.'));
	}
	return [...found];
}

/** Is `path` CALLED in `text` — `p(`, `p?.(`, `p.call(` / `.apply(` / `.bind(`? */
function callsPath(text: string, path: string): boolean {
	const body = path.split('.').map(escapeName).join('\\s*\\??\\.\\s*');
	return new RegExp(`(?<![\\w$.])${body}${CALL_SUFFIX.source.slice(1)}`).test(text);
}

/** From `close` (just before a `?`/operator), where the condition expression starts. */
function conditionStart(code: string, close: number): number {
	let depth = 0;
	for (let i = close; i >= 0; i--) {
		const ch = code[i] as string;
		if (isCloser(ch)) depth++;
		else if (isOpener(ch)) {
			if (depth === 0) return i + 1;
			depth--;
		} else if (
			depth === 0 &&
			(ch === ',' || ch === ';' || ch === '=' || ch === ':' || ch === '?')
		) {
			const prev = code[i - 1] ?? '';
			const next = code[i + 1] ?? '';
			if (ch === '=' && (next === '=' || '=!<>'.includes(prev) || next === '>')) continue;
			if (ch === '?' && (next === '?' || next === '.' || prev === '?')) continue;
			return i + 1;
		}
	}
	return 0;
}

/** A ternary `?` — not `??`, not `?.`, not an optional member `x?:`/`x?)`/`x?,`/`x?=`. */
const TERNARY = /(?<![?\w$])\?(?![?.:])|(?<=[\w$)\]])\s\?(?![?.:])/g;

/** [start, end) of the statement or block that begins at `from` (after `if (…)` / `else`). */
function armExtent(code: string, from: number): [number, number] {
	const at = nextNonSpace(code, from);
	if (code[at] === '{') {
		const close = matchForward(code, at);
		return [at, close === -1 ? code.length : close + 1];
	}
	if (code.startsWith('if', at) && !isIdent(code[at + 2])) {
		const open = code.indexOf('(', at);
		const close = closeParen(code, open + 1);
		const then = armExtent(code, close + 1);
		const elseAt = nextNonSpace(code, then[1]);
		if (code.startsWith('else', elseAt) && !isIdent(code[elseAt + 4]))
			return [at, armExtent(code, elseAt + 4)[1]];
		return [at, then[1]];
	}
	const end = expressionEnd(code, at);
	return [at, code[end] === ';' ? end + 1 : end];
}

/** A statement that leaves the current flow. */
const EXIT = /(?<![\w$.])(?:return|throw|break|continue)(?![\w$])/;

/** One `if`: its condition and arms, as offsets into the code. */
interface IfStatement {
	condition: string;
	arms: [number, number][];
	end: number;
}

function ifStatements(code: string, from: number, to: number): IfStatement[] {
	const out: IfStatement[] = [];
	for (const m of code.slice(from, to).matchAll(/(?<![\w$.])if\s*\(/g)) {
		const condOpen = from + (m.index as number) + m[0].length;
		const condClose = closeParen(code, condOpen);
		if (condClose === -1) continue;
		const then = armExtent(code, condClose + 1);
		const arms: [number, number][] = [then];
		const elseAt = nextNonSpace(code, then[1]);
		if (code.startsWith('else', elseAt) && !isIdent(code[elseAt + 4]))
			arms.push(armExtent(code, elseAt + 4));
		const end = (arms[arms.length - 1] as [number, number])[1];
		out.push({ condition: code.slice(condOpen, condClose), arms, end });
	}
	return out;
}

/** One place a gate token is reachable only through an optional fallback. */
interface SeamFallbackSite {
	file: string;
	line: number;
	token: string;
	shape: string;
}

/**
 * THE DIRECT-CALL RULE, structurally. `names` are the GATE-REACHING names of
 * this source (gateReachingNames: the tokens plus every wrapper, alias and
 * import of one, transitively). Three refusals:
 *
 *  R1 — a gate-reaching FUNCTION VALUE in a swappable position. The values: a
 *       gate-reaching name that is not called, and any function expression
 *       whose body reaches a gate (`(d) => gateRecord(d, ctx)`, a block arrow,
 *       an object-literal method). The position is read by valuePosition — a
 *       parameter/destructuring default, a `??`/`||`/`&&` operand, a ternary
 *       arm, a `let`, an assignment, a property a later spread overrides, …
 *       Whatever the spelling, a function value that can be replaced is refused.
 *       An AUTHORIZATION TOKEN is stricter: taken as a value anywhere at all.
 *  R2 — a gate reached on the right of `??` (`x ?? gateRecord(d)`): the gate
 *       runs only when something else is absent.
 *  R3 — a gate call CONTROL-DEPENDENT on the presence of a callable the same
 *       function calls: inside an if/else arm, a ternary arm or the right side
 *       of `||`/`&&` whose condition tests that callable, or after an `if` on it
 *       that exits (`if (seams.gate) { await seams.gate(d); return; }`). The
 *       callable may be a member path or a bare alias (`const g = seams.gate`).
 */
function seamFallbackSites(
	file: string,
	src: string,
	tokens: readonly string[],
	names: ReadonlySet<string> = new Set(tokens),
	parsed: GateSource = gateSource(file, src),
): SeamFallbackSite[] {
	const { code, units } = parsed;
	const lineOf = (index: number): number => code.slice(0, index).split('\n').length;
	const sites: SeamFallbackSite[] = [];
	const report = (index: number, token: string, shape: string): void => {
		sites.push({ file, line: lineOf(index), token, shape });
	};
	const tokenProperty = new RegExp(`\\.(${tokens.join('|')})(?![\\w$])`, 'g');

	// Every gate SITE: a call of a gate-reaching name, or a token property read.
	const gateSites: { at: number; name: string }[] = [];
	for (const name of names) {
		for (const m of code.matchAll(freeToken(name))) {
			const at = m.index as number;
			const after = code.slice(at + name.length);
			const before = code.slice(Math.max(0, at - 40), at);
			if (/\b(?:function\s*\*?|const|let|var|class)\s+$/.test(before)) continue; // its declaration
			if (CALL_SUFFIX.test(after)) {
				gateSites.push({ at, name });
				continue;
			}
			// R1 (names): taken as a value.
			if (/\btypeof\s+$/.test(before)) continue; // a type position
			const prev = code[prevNonSpace(code, at - 1)];
			if (/^\s*\??:/.test(after) && (prev === '{' || prev === ',' || prev === ';')) continue; // a key
			if (/^\s*=[^=>]/.test(after) || /^\s*\?\s*:/.test(after)) continue; // a binding / parameter name being declared
			const position = tokens.includes(name)
				? 'gate taken as a value'
				: valuePosition(code, at, at + name.length);
			if (position !== null)
				report(at, name, tokens.includes(name) ? position : `gate value in ${position}`);
		}
	}
	for (const m of code.matchAll(tokenProperty))
		gateSites.push({ at: (m.index as number) + 1, name: m[1] as string });

	// R1 (function expressions): an anonymous function whose body reaches a gate.
	for (const unit of units) {
		if (!reachesGate(unit.body, names, tokens)) continue;
		if (unit.kind === 'function' && unit.name !== null) {
			const p = code[prevNonSpace(code, unit.start - 1)];
			if (
				p === undefined ||
				p === ';' ||
				p === '{' ||
				p === '}' ||
				/\bexport(?:\s+default)?\s*$/.test(code.slice(Math.max(0, unit.start - 20), unit.start))
			)
				continue; // a declaration
		}
		let position: string | null;
		if (unit.kind === 'method') {
			const open = enclosingOpener(code, unit.start - 1);
			position =
				open !== -1 && isObjectLiteral(code, open) ? objectPosition(code, open, unit.end, 0) : null;
		} else position = valuePosition(code, unit.start, unit.end);
		if (position !== null) {
			const reached =
				[...names].find((n) => containsFreeToken(unit.body, n)) ??
				(unit.body.match(tokenProperty)?.[0].slice(1) as string);
			report(unit.start, reached, `gate-reaching function in ${position}`);
		}
	}

	// R2: an AUTHORIZATION TOKEN on the right of `??` (a call, a value, a property).
	for (const match of code.matchAll(/\?\?=?/g)) {
		const start = (match.index as number) + match[0].length;
		let end = expressionEnd(code, start);
		for (const t of code.slice(start, end).matchAll(TERNARY)) {
			end = Math.min(end, start + (t.index as number));
		}
		const operand = code.slice(start, end);
		for (const token of tokens) {
			if (containsFreeToken(operand, token))
				report(match.index as number, token, `${match[0]} fallback`);
		}
		for (const t of operand.matchAll(tokenProperty))
			report(match.index as number, t[1] as string, `${match[0]} fallback`);
	}

	// R3: a gate site control-dependent on an optional callable.
	for (const { at, name } of gateSites) {
		const fn = enclosingFunction(units, at);
		const [from, to] = fn === null ? [0, code.length] : [fn.start, fn.end];
		const scope = code.slice(from, to);
		const optional = (condition: string): string | undefined =>
			testedPaths(condition).find((path) => callsPath(scope, path));
		for (const stmt of ifStatements(code, from, to)) {
			const inside = stmt.arms.some(([a, b]) => a <= at && at < b);
			if (inside) {
				const path = optional(stmt.condition);
				if (path !== undefined) report(at, name, `if/else on ${path}`);
			} else if (stmt.end <= at) {
				// An `if` the gate comes AFTER: refused when an arm that EXITS runs the
				// tested callable first — the replacement answers, the gate never runs.
				// (`if (processor === null) throw …` exits WITHOUT calling it: a guard.)
				const path = testedPaths(stmt.condition).find((p) =>
					stmt.arms.some(([a, b]) => {
						const arm = code.slice(a, b);
						return EXIT.test(arm) && callsPath(arm, p);
					}),
				);
				if (path !== undefined) report(at, name, `early exit on ${path}`);
			}
		}
		for (const t of scope.matchAll(TERNARY)) {
			const q = from + (t.index as number) + t[0].indexOf('?');
			if (q >= at) continue;
			if (/^\s*[),=]/.test(code.slice(q + 1))) continue; // an optional parameter
			if (at >= expressionEnd(code, q + 1)) continue;
			const path = optional(code.slice(conditionStart(code, q - 1), q));
			if (path !== undefined) report(at, name, `ternary on ${path}`);
		}
		for (const o of scope.matchAll(/\|\||&&|\?\?/g)) {
			const op = from + (o.index as number);
			if (op >= at || at >= expressionEnd(code, op + 2)) continue;
			const path = optional(code.slice(conditionStart(code, op - 1), op));
			if (path !== undefined) report(at, name, `'${o[0]}' on ${path}`);
		}
	}

	return sites;
}

/**
 * Every source that can hold a tool action's authorization: every tool package's
 * server tree (helpers included — a gate lifted into `server/lib/x.ts` is still
 * the action's gate), the framework's tool layer (src/core/tools/), and any extra
 * file a census entry joins to its walk. Discovered, never hand-listed.
 */
function gateSourceFiles(): string[] {
	const found = new Set<string>();
	for (const pattern of ['tools/*/server/**/*.ts', 'src/core/tools/**/*.ts']) {
		for (const rel of new Glob(pattern).scanSync({ cwd: ROOT })) found.add(rel);
	}
	for (const entry of Object.values(CENSUS)) for (const rel of entry.files ?? []) found.add(rel);
	return [...found].filter((rel) => !rel.includes('/tests/') && !rel.endsWith('.test.ts')).sort();
}

/** Parse a set of sources together: gate-reaching names cross file boundaries. */
function scanSources(files: Readonly<Record<string, string>>): SeamFallbackSite[] {
	const sources = Object.entries(files).map(([file, src]) => gateSource(file, src));
	const names = gateReachingNames(sources, AUTHORIZATION_TOKENS);
	return sources.flatMap((s) =>
		seamFallbackSites(s.file, s.src, AUTHORIZATION_TOKENS, names.get(s.file) as Set<string>, s),
	);
}

const LIVE_FILES = gateSourceFiles();
const LIVE_SOURCES = LIVE_FILES.map((rel) => gateSource(rel, read(rel)));
const LIVE_NAMES = gateReachingNames(LIVE_SOURCES, AUTHORIZATION_TOKENS);

describe('a tool action gate is called directly, never through an optional seam', () => {
	test('no tool server source reaches an authorization token through a seam fallback', () => {
		// Non-vacuity for the discovery: a mis-globbed scan must not pass.
		expect(LIVE_FILES.length, 'no tool server sources found — the scan is broken').toBeGreaterThan(
			50,
		);
		expect(LIVE_FILES).toContain('tools/tool_transcription/server/index.ts');
		const sites = LIVE_SOURCES.flatMap((s) =>
			seamFallbackSites(
				s.file,
				s.src,
				AUTHORIZATION_TOKENS,
				LIVE_NAMES.get(s.file) as Set<string>,
				s,
			),
		);
		expect(
			sites.map((s) => `${s.file}:${s.line} ${s.token} (${s.shape})`),
			'a gate reached through an optional seam is a gate a caller can replace — call it directly (gateRecord(…) as a statement of the handler) and drive the test through a principal the door really grants (see tool_transcription, badbff1fc0)',
		).toEqual([]);
	});

	test('the scanner sees the census gates it is meant to protect (positive control)', () => {
		// The gate tokens ARE present in the scanned code as direct calls; a broken
		// blanker that erased them would make the rule above pass by vacuity. Read
		// through the scanner's OWN view (function units + reachesGate), so what is
		// proved is that the rule sees the call, not that a spelling exists.
		const parsed = LIVE_SOURCES.find((s) => s.file === 'tools/tool_transcription/server/index.ts');
		expect(parsed).toBeDefined();
		const { code, units } = parsed as GateSource;
		expect(containsFreeToken(code, 'gateRecord')).toBe(true);
		const direct = units.filter(
			(u) =>
				declaredName(code, u) === 'createTranscribableAudioFile' &&
				reachesGate(u.body, new Set(AUTHORIZATION_TOKENS), AUTHORIZATION_TOKENS),
		);
		expect(
			direct.length,
			'the handler that calls gateRecord directly was not seen calling it',
		).toBe(1);
	});

	test('gate-reaching names close over wrappers and imports (positive control)', () => {
		// The closure is what makes R1/R3 structural: without it a rename or a
		// wrapper is invisible again. Pinned on real code, three ways:
		//  - a handler that calls the token directly;
		//  - a declared handler two hops from the token (sitebuilder's publish →
		//    assertPublisher through the proxy helpers);
		//  - a name that is gate-reaching only THROUGH AN IMPORT from a sibling file.
		const names = (file: string): Set<string> => LIVE_NAMES.get(file) as Set<string>;
		expect(
			names('tools/tool_transcription/server/index.ts').has('createTranscribableAudioFile'),
		).toBe(true);
		expect(names('tools/tool_sitebuilder/server/index.ts').has('publish')).toBe(true);
		expect(names('tools/tool_export/server/export_job.ts').has('exportStillReadable')).toBe(true);
		// and the parser found functions at all, everywhere it looked.
		const units = LIVE_SOURCES.reduce((sum, s) => sum + s.units.length, 0);
		expect(units, 'the function parser found almost nothing — it is broken').toBeGreaterThan(1000);
		// a non-gate name stays out: the closure is not "everything".
		expect(names('tools/tool_sitebuilder/server/index.ts').has('requireSlug')).toBe(false);
	});

	describe('negative controls: every refused shape is detected, every legitimate one passes', () => {
		const scan = (snippet: string): string[] =>
			scanSources({ 'fixture.ts': snippet }).map((s) => s.shape);

		const REFUSED: readonly [string, string][] = [
			[
				'?? arrow fallback (the census-passing shape)',
				'async function h(ctx, seams = {}) {\n\tconst gate = seams.gate ?? (() => gateRecord(ddo, ctx, "read"));\n\tawait gate();\n}',
			],
			[
				'?? async block-bodied fallback',
				'async function h(ctx, seams = {}) {\n\tconst gate = seams.gate ?? (async (d, c) => {\n\t\treturn gateRecord(d, c);\n\t});\n}',
			],
			['?? bare reference', 'function h(seams) {\n\tconst gate = seams.gate ?? gateRecord;\n}'],
			[
				'?? over an optional call',
				'async function h(d, seams) {\n\tconst g = (await seams.gate?.(d)) ?? (await gateRecord(d));\n}',
			],
			[
				'|| function value',
				'function h(seams) {\n\tconst gate = seams.gate || ((d) => gateRecord(d));\n}',
			],
			['default parameter', 'async function h(ctx, gate = gateRecord) {\n\tawait gate(ctx);\n}'],
			['seam map value', 'const seams = { gate: authorizeRecordAccess };'],
			[
				'ternary on the seam',
				'async function h(d, seams) {\n\tconst g = seams.gate ? await seams.gate(d) : await gateRecord(d);\n}',
			],
			[
				'negated ternary on the seam',
				'async function h(d, seams) {\n\tconst g = !seams.gate ? await gateRecord(d) : await seams.gate(d);\n}',
			],
			[
				'if/else on the seam',
				'async function h(d, seams) {\n\tif (seams.gate) {\n\t\tawait seams.gate(d);\n\t} else {\n\t\tawait gateRecord(d);\n\t}\n}',
			],
			// review r0: the five shapes the spelling-matched rule let through.
			[
				'arrow-wrapped default parameter',
				'async function h(ctx, gate = (d) => gateRecord(d, ctx)) {\n\tawait gate(ctx);\n}',
			],
			[
				'destructuring default',
				'async function h(ctx, seams) {\n\tconst { gate = (d) => gateRecord(d, ctx) } = seams;\n\tawait gate(ctx);\n}',
			],
			[
				'?? a local wrapper of the gate',
				'const defaultGate = (d) => gateRecord(d);\nasync function h(d, seams) {\n\tconst gate = seams.gate ?? defaultGate;\n\tawait gate(d);\n}',
			],
			[
				'if on the seam with an early return, no else',
				'async function h(d, seams) {\n\tif (seams.gate) {\n\t\tawait seams.gate(d);\n\t\treturn;\n\t}\n\tawait gateRecord(d);\n}',
			],
			[
				'ternary on an alias of the seam',
				'async function h(d, seams) {\n\tconst g = seams.gate;\n\tg ? await g(d) : await gateRecord(d);\n}',
			],
			// the same idea, other spellings.
			[
				'brace-less early return',
				'async function h(d, seams) {\n\tif (seams.gate) return seams.gate(d);\n\tawait gateRecord(d);\n}',
			],
			[
				'destructured alias, early return, .call',
				'async function h(d, seams) {\n\tconst { gate } = seams;\n\tif (gate !== undefined) {\n\t\tawait gate.call(null, d);\n\t\treturn;\n\t}\n\tawait gateRecord(d);\n}',
			],
			[
				'|| over an optional call',
				'async function h(d, seams) {\n\t(await seams.gate?.(d)) || (await gateRecord(d));\n}',
			],
			[
				'a wrapper of a wrapper as a default',
				'function inner(d) {\n\treturn gateRecord(d);\n}\nconst outer = (d) => inner(d);\nasync function h(d, gate = outer) {\n\tawait gate(d);\n}',
			],
			[
				'a const alias of a wrapper in ??',
				'function check(d) {\n\treturn gateRecord(d);\n}\nconst g = check;\nasync function h(d, seams) {\n\tawait (seams.gate ?? g)(d);\n}',
			],
			[
				'a let binding a seam reassigns',
				'async function h(d, seams) {\n\tlet gate = (x) => gateRecord(x);\n\tif (seams.gate) gate = seams.gate;\n\tawait gate(d);\n}',
			],
			[
				'a property a later spread overrides',
				'async function h(d, seams) {\n\tconst { gate } = { gate: (x) => gateRecord(x), ...seams };\n\tawait gate(d);\n}',
			],
			[
				'an object method in a default seam map',
				'async function h(d, seams = { gate(x) {\n\treturn gateRecord(x);\n} }) {\n\tawait seams.gate(d);\n}',
			],
			[
				'a named function expression as the fallback',
				'async function h(d, seams) {\n\tconst gate = seams.gate ?? function check(x) {\n\t\treturn gateRecord(x);\n\t};\n\tawait gate(d);\n}',
			],
			[
				'an admin-property check as a default arrow',
				'async function h(ctx, isAdmin = (p) => p.isGlobalAdmin) {\n\tif (!isAdmin(ctx.principal)) throw new Error("x");\n}',
			],
			[
				'a gate arrow assigned to a member',
				'function h(target) {\n\ttarget.gate = (d) => gateRecord(d);\n}',
			],
			[
				'an array pick between the seam and the gate',
				'async function h(d, seams) {\n\tconst gate = [seams.gate, (x) => gateRecord(x)].find(Boolean);\n\tawait gate(d);\n}',
			],
		];
		for (const [label, snippet] of REFUSED) {
			test(`refused: ${label}`, () => {
				expect(scan(snippet).length, `${label} was not detected:\n${snippet}`).toBeGreaterThan(0);
			});
		}

		test('refused: a wrapper lifted into a sibling file and renamed on import', () => {
			const sites = scanSources({
				'tools/x/server/gates.ts':
					'export async function liftedGate(d) {\n\treturn authorizeRecordAccess(d);\n}',
				'tools/x/server/index.ts':
					"import { liftedGate as g } from './gates.ts';\nasync function h(d, seams) {\n\tconst gate = seams.gate ?? g;\n\tawait gate(d);\n}",
			});
			expect(sites.map((s) => `${s.file} ${s.token}`)).toEqual(['tools/x/server/index.ts g']);
		});

		const ACCEPTED: readonly [string, string][] = [
			[
				'a direct call statement',
				'async function h(ctx) {\n\tconst grant = await gateRecord(readDdo(ctx.options) ?? null, ctx, "write");\n}',
			],
			[
				'a boolean deny condition over call results',
				'async function h(p, s) {\n\tif (s === "" || (await getPermissions(p, s, s)) < 1) throw new Error("x");\n}',
			],
			['a property read', 'function h(p) {\n\treturn p.isDeveloper || p.isGlobalAdmin ? 1 : 0;\n}'],
			['an import', "import { gateRecord, isGlobalAdmin } from './x.ts';"],
			['a type position', 'type G = ReturnType<typeof gateRecord>;'],
			['prose in a string', 'const s = "seams.gate ?? gateRecord is refused";'],
			[
				'a non-gate seam fallback',
				'async function h(seams) {\n\tconst cfg = await (seams.config ?? readConfig)();\n}',
			],
			[
				'both ternary branches call the gate',
				'async function h(d, mode) {\n\treturn mode.write ? gateRecord(d, "write") : gateRecord(d, "read");\n}',
			],
			// the structural rule must not refuse the shapes the tools legitimately use.
			[
				'a named wrapper called directly',
				'const check = async (d) => gateRecord(d);\nasync function h(d) {\n\tawait check(d);\n}',
			],
			[
				'an action-spec handler',
				'async function getStatus(ctx) {\n\tassertPublisher(ctx);\n}\nexport const tool = { apiActions: { get_status: { permission: null, handler: getStatus } } };',
			],
			[
				'callback arguments',
				'async function h(ds, ctx) {\n\tawait Promise.all(ds.map((d) => gateRecord(d, ctx)));\n\tawait withTransaction(async () => {\n\t\tawait gateRecord(ds[0], ctx);\n\t});\n}',
			],
			[
				'a callback bundle whose spreads come BEFORE the gated property',
				'function h(ctx, seams) {\n\treturn poll(ctx, {\n\t\t...(seams.a === undefined ? {} : { a: seams.a }),\n\t\tsave: async (input) => {\n\t\t\tawait gateRecord(input, ctx);\n\t\t},\n\t});\n}',
			],
			[
				'a guard that exits without calling the callable it tests',
				'async function h(d, name) {\n\tconst processor = lookup(name);\n\tif (processor === null) throw new Error("x");\n\tawait gateRecord(d);\n\treturn processor(d);\n}',
			],
			[
				'a deny chain over local refusals',
				'async function h(d, m) {\n\treturn tagRefusal(m) ?? (await writeRefusal(d));\n}\nasync function writeRefusal(d) {\n\treturn gateRecord(d);\n}',
			],
			[
				'a factory returning a gated handler',
				'function build(deps) {\n\treturn async function send(ctx) {\n\t\tif (!ctx.principal.isGlobalAdmin) throw new Error("x");\n\t};\n}',
			],
			[
				'an optional callback that does not skip the gate',
				'async function h(d, opts) {\n\tif (opts.onProgress) opts.onProgress(0);\n\tawait gateRecord(d);\n}',
			],
			['a class method', 'class Door {\n\tasync check(d) {\n\t\treturn gateRecord(d);\n\t}\n}'],
			[
				'a return-typed arrow',
				'const check = async (d: D): Promise<{ ok: boolean }> => {\n\treturn gateRecord(d);\n};\nasync function h(d) {\n\tawait check(d);\n}',
			],
		];
		for (const [label, snippet] of ACCEPTED) {
			test(`accepted: ${label}`, () => {
				expect(scan(snippet), `${label} was wrongly flagged:\n${snippet}`).toEqual([]);
			});
		}
	});
});
