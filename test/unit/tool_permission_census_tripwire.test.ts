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
 * THE HONEST LIMIT — this proves an authorization symbol is CALLED on the
 * handler's entry path. It does NOT prove that it is the RIGHT check, that it
 * precedes every side effect of the action, or that no branch reaches those side
 * effects around it. It is a census with a liveness check, not an authorization
 * proof; only a declarative `permission` kind is enforced by the framework.
 *
 * Idiom: the same credless source scan as human_write_scope_tripwire.test.ts,
 * with comments stripped (test/helpers/strip_comments.ts) so the module headers
 * that DISCUSS `permission: null` are never mistaken for a site.
 */

import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
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
		gate: 'gateRecordWrite',
	},
	'tool_transcription:delete_transcribable_audio_file': {
		entry: 'deleteTranscribableAudioFile',
		gate: 'gateRecordWrite',
	},
	'tool_transcription:automatic_transcription': {
		entry: 'automaticTranscription',
		gate: 'gateRecordWrite',
	},
	'tool_transcription:check_server_transcriber_status': {
		entry: 'checkServerTranscriberStatus',
		gate: 'gateRecord',
	},
	'tool_transcription:build_subtitles_file': {
		entry: 'buildSubtitlesFile',
		gate: 'assertActionPermission',
	},
	'tool_transcription:BACKGROUND_POLL_ACTION': {
		entry: 'backgroundTranscriberPoll',
		gate: null,
		why: 'background-only: absent from apiActions, so unroutable from the wire; the enqueuing wire action gated first',
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
		gate: 'assertTranslationPermissions',
	},
	'tool_lang_multi:automatic_translation': {
		entry: 'runAutomaticTranslation',
		files: ['src/core/tools/translation.ts'],
		gate: 'assertTranslationPermissions',
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
