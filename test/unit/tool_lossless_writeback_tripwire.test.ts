/**
 * TRIPWIRE — A TOOL ACTION THAT WRITES BACK OVER A STORED COMPONENT VALUE IS
 * EITHER LOSSLESS OR CONFIRMED (P0-12; CLI-14 + CLI-24, both S2 CONFIRMED).
 *
 * THE DEFECT CLASS. A tool reads a curated value, transforms it, and writes the
 * transform back. When the transform loses part of the value the curator is not asked
 * and is not told — the tool reports success. That is the worst class of defect this
 * system can have: the records are irreplaceable and the loss is silent. Two instances
 * were live until 2026-08-30:
 *
 *   CLI-14  tool_lang in-browser translation: `browser_transformer.js` SKIPS a block
 *           that fails and keeps translating (its own comment: "Skip this block —
 *           accumulated_text stays unchanged"), then posts a byte-identical `end` for a
 *           complete run and for one that lost half its paragraphs. The main thread
 *           painted "Translation completed" and SAVED the short text over the target
 *           language's existing — possibly human — translation, resolving {result:true}.
 *   CLI-24  tool_transcription "Rebuild paragraphs": the round-trip through
 *           `transcribers/lib/paragraphs.js` ran `.replace(/<[^>]*>/g,'')` over the
 *           stored value — deleting the archivist's emphasis, foreign-word marking and
 *           uncertain-reading formatting from the RICH-TEXT component — and re-escaped
 *           every `&`, so an entity outside escape_html's four compounded on every
 *           press (`&#39;` → `&amp;#39;` → `&amp;amp;#39;`). The docblock claimed the
 *           operation "cannot change a single word". There was no confirmation.
 *
 * WHY THEY SURVIVED: NOTHING GATED tools/**\/js BEHAVIOUR AT ALL. `biome.jsonc` excludes
 * `**\/tools\/**\/*\/js`, the client suite does not drive these tools, and the server
 * suite never imported them. This file is the first gate that does.
 *
 * WHAT IT IS. Three behavioural legs and a DERIVED census:
 *
 *   1. the transcription round-trip really is markup-, entity- and idempotence-
 *      preserving, over several real-shaped transcript values (CLI-24);
 *   2. a translation run that loses ONE BLOCK saves nothing, reports no success and
 *      leaves the target component's stored value byte-unchanged (CLI-14);
 *   3. the one other census row that claims a LOSSLESS transform over a stored value —
 *      tool_tc's timecode offset — really only rewrites the marks.
 *
 *   4. THE CENSUS IS TOTAL BY DERIVATION. Every tool ACTION (file + enclosing top-level
 *      symbol) that calls a component-value write door, across `tools/**\/js/**` and
 *      `tools/**\/server/**`, must carry a row with a verdict and a written reason. A new
 *      one fails this gate. Verdicts are checked against the source, in BOTH directions,
 *      so neither a fix nor a regression can land silently.
 *
 * THE VERDICTS, and what is mechanically checked for each:
 *
 *   lossless        — a read-transform-write cycle whose transform preserves the stored
 *                     content. CHECKED: rows with `proof` are proved by a behavioural leg
 *                     above (the proof names it); rows without one must say "verified by
 *                     reading" in the reason, so an unproven claim is visible as such.
 *   confirmed       — the operator confirms before the write, with the loss NAMED.
 *                     CHECKED: `confirm(` appears in the action's own body.
 *   refuses         — the action refuses to write a degraded result rather than saving
 *                     it. CHECKED: the row's `must_contain` symbol is in the body.
 *   operator-value  — NOT a write-back: the value written did not derive from the value
 *                     it replaces (a locator the curator just picked, an import mapping
 *                     the operator declared, a Time Machine version they chose). The rule
 *                     is about read-transform-write cycles and does not reach these.
 *   new-record      — the write lands on a record CREATED in the same call (a bulk-process
 *                     row, a preset, a portal's new media record). Nothing stored is
 *                     replaced.
 *   no-persist      — the door only sets the instance's in-memory value; persistence is a
 *                     separate, operator-driven save.
 *   not-a-component-write — the derivation's own false positive: the token is a `.save(`
 *                     on something that is not a component.
 *   PENDING         — a real write-back that is neither lossless, confirmed nor refusing.
 *                     CHECKED: `confirm(` is ABSENT from the body, so adding one FAILS
 *                     this gate and forces the row to move. SHRINK-ONLY.
 *
 * WHAT THIS GATE DOES NOT PROVE — stated because an unstated gap reads as coverage:
 *   - it does not prove the two fixed tools are lossless for EVERY input. The
 *     transcription round-trip is proved for the well-formed shapes listed below;
 *     unbalanced markup is REPAIRED, not reproduced, and a fragment with markup but no
 *     words is still dropped — which is why the action's verdict is `confirmed`, not
 *     `lossless`;
 *   - the translation leg drives the REAL `translate_component_browser` through the REAL
 *     worker protocol, but `markdown_utils.js` needs a DOM (`DOMParser`) that Bun has
 *     not, so its three functions are replaced by identity in this run. The leg is about
 *     the save/refusal decision on `end`, not about markdown conversion;
 *   - the verdicts other than `confirmed`, `refuses` and the proved `lossless` ones are
 *     READ, not executed. The derivation is what makes forgetting an action impossible;
 *     the reason is what makes a wrong verdict a reviewable claim;
 *   - the relation link/unlink doors (P0-11, CLI-02/CLI-03) are a different write and are
 *     not this rule's subject.
 */

import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const ROOT = resolve(import.meta.dir, '../..');

// ---------------------------------------------------------------------------
// LEG 1 — the transcription round-trip (CLI-24)
// ---------------------------------------------------------------------------

import {
	parse_transcript,
	segments_to_html,
} from '../../tools/tool_transcription/transcribers/lib/paragraphs.js';

/**
 * Real-shaped stored transcript values: Dédalo TC marks plus the markup and the
 * entities an oral-history transcript actually carries. Each one is a value a curator
 * could be looking at right now; before 2026-08-30 one press of "Rebuild paragraphs"
 * returned all of them stripped of markup and with the entities doubled.
 */
const TRANSCRIPTS: Record<string, string> = {
	'inline emphasis + a non-escape_html entity':
		'<p>[TC_00:00:00.000_TC]Empezamos en <em>A Coru&ntilde;a</em>, en el a&ntilde;o 1936.</p>',
	'the compounding-ampersand shape (&#39; and a literal &amp;)':
		'<p>[TC_00:00:12.500_TC]Dijo: &#39;non sei&#39; &amp; call&oacute;. Era <i>morri&ntilde;a</i>.</p>',
	'a typed line break and an attributed uncertain-reading span':
		'<p>[TC_00:01:00.000_TC]Primera l&iacute;nea<br>segunda l&iacute;nea, con <span class="uncertain" title="dudosa">lectura dudosa</span>.</p>',
	'two paragraphs, five minutes apart, each with its own markup':
		'<p>[TC_00:00:00.000_TC]Uno. <strong>Dos</strong> &#8212; tres.</p><p>[TC_00:05:00.000_TC]Cuatro <em>cinco</em>.</p>',
};

/** The three timecode modes the tool can rebuild with (paragraphs.js DEFAULT_OPTIONS). */
const TC_MODES = ['paragraph_anchors', 'paragraph', 'segment'] as const;

describe('LEG 1 — rebuilding paragraphs preserves the archivist’s markup (CLI-24)', () => {
	for (const [name, stored] of Object.entries(TRANSCRIPTS)) {
		for (const tc_mode of TC_MODES) {
			test(`${name} — round-trips unchanged [${tc_mode}]`, () => {
				const once = segments_to_html(parse_transcript(stored), { tc_mode });
				expect(once, 'the rebuild changed a value it had nothing to regroup').toBe(stored);
			});

			test(`${name} — is idempotent, so nothing compounds [${tc_mode}]`, () => {
				// The shape that made `&#39;` grow an `&amp;` on EVERY press. Twice must
				// equal once: a transform that is stable under repetition cannot compound.
				const once = segments_to_html(parse_transcript(stored), { tc_mode });
				const twice = segments_to_html(parse_transcript(once), { tc_mode });
				const thrice = segments_to_html(parse_transcript(twice), { tc_mode });
				expect(twice).toBe(once);
				expect(thrice).toBe(once);
				expect(thrice, 'an entity gained an escape on a rebuild').not.toContain('&amp;#');
				expect(thrice, 'an entity gained an escape on a rebuild').not.toContain('&amp;amp;');
			});
		}
	}

	test('the markup is really there — the assertions above are not comparing two strippings', () => {
		// Anti-vacuity: if parse/emit both deleted the markup, equality would still hold
		// for a stored value that had none. These values HAVE it, and it must be in the
		// output, tag by tag.
		for (const [name, stored] of Object.entries(TRANSCRIPTS)) {
			const rebuilt = segments_to_html(parse_transcript(stored), {});
			for (const tag of ['<em>', '<i>', '<strong>', '<span', '<br>']) {
				if (!stored.includes(tag)) continue;
				expect(rebuilt, `${name}: ${tag} is gone from the rebuilt value`).toContain(tag);
			}
			for (const entity of ['&ntilde;', '&#39;', '&amp;', '&oacute;', '&iacute;', '&#8212;']) {
				if (!stored.includes(entity)) continue;
				expect(rebuilt, `${name}: ${entity} did not survive the rebuild`).toContain(entity);
			}
		}
	});

	test('a recogniser segment (plain text, no stored fragment) is still ESCAPED — SEC-031', () => {
		// The fidelity override must not become a hole on the ASR path, where the text is
		// model output and has never been HTML. `html` is absent on those segments, so the
		// escaping branch must still run.
		const html = segments_to_html(
			[{ text: 'dijo <script>alert(1)</script> y calló', start: 0, end: 3 }],
			{},
		);
		expect(html).toContain('&lt;script&gt;');
		expect(html).not.toContain('<script>');
	});

	test('a FORGED fidelity override from a remote transcriber is ignored — SEC-031', () => {
		// THE HOLE THIS EXISTS FOR, found by adversarial review 2026-08-30 and closed
		// the same day. The override was a plain `html` STRING KEY, and
		// `src/core/tools/transcription_asr.ts` passes a REMOTE transcriber's JSON
		// `segments` array through to `save()`. `TranscriptionSegment` declares no
		// `html` field, but TypeScript strips nothing at runtime — so a hostile or
		// compromised transcription service could answer
		//     { text: 'hola', html: '<img src=x onerror=alert(1)>' }
		// and have that tag stored, UNESCAPED, in a heritage record's transcription.
		// Measured before the fix: the tag came out intact while the plain path
		// escaped correctly, so nothing looked wrong.
		//
		// The override is a module-private Symbol now (paragraphs.js), which JSON
		// cannot carry, and the ASR seam narrows every remote segment to the four
		// declared fields. This asserts the FIRST half — a string `html` key from
		// anywhere outside the module buys nothing at all.
		const forged = segments_to_html(
			[{ text: 'hola', start: 0, end: 2, html: '<img src=x onerror=alert(1)>' } as never],
			{},
		);
		expect(forged, 'a forged `html` key was emitted verbatim').not.toContain('<img');
		expect(forged, 'a forged `html` key survived at all').not.toContain('onerror');
		// ...and the segment's real text is still rendered, escaped as usual: the
		// forgery is IGNORED, not treated as a reason to drop the content.
		expect(forged).toContain('hola');
	});

	test('the fidelity override is not a string-keyed field at all (structural)', () => {
		// Belt to the behavioural brace above: if someone re-introduces a string key
		// the assertion above still passes for THIS input while the channel is open
		// again for every other. `parse_transcript` must not put an enumerable `html`
		// property on a segment, because an enumerable property is what JSON carries.
		const parsed = parse_transcript('<p>[TC_00:00:00.000_TC]a <em>b</em></p>');
		expect(parsed.length).toBeGreaterThan(0);
		for (const segment of parsed) {
			expect(
				Object.keys(segment as object),
				'a parsed segment carries an enumerable `html` key — a remote JSON segment can forge it',
			).not.toContain('html');
		}
		// And the round-trip still works, so the Symbol really is carrying it.
		expect(segments_to_html(parsed, {})).toContain('<em>b</em>');
	});
});

// ---------------------------------------------------------------------------
// LEG 2 — a translation that lost a block saves NOTHING (CLI-14)
// ---------------------------------------------------------------------------

/**
 * `tools/tool_lang/js/browser_translation.js` is served from a root where `tools/` and
 * `core/` are siblings, so its `../../../core/common/js/…` specifiers do not resolve on
 * disk (the client lives under `client/dedalo/core/`). This plugin supplies the two
 * imported client modules — and `markdown_utils.js`, which needs a DOM Bun has not — as
 * stubs, and ONLY for an importer inside `tools/tool_lang/js/`: the guard matters because
 * a Bun plugin is process-global and the same specifiers are used by real client modules
 * that other files in this tier import.
 */
Bun.plugin({
	name: 'tool-lang-served-root',
	setup(build) {
		const importerIsToolLang = (importer: string): boolean =>
			importer.includes(`${join('tools', 'tool_lang', 'js')}${'/'}`);
		build.onResolve({ filter: /core\/common\/js\/(utils\/index|tr)\.js$/ }, (args) =>
			importerIsToolLang(args.importer)
				? { path: 'client-stub', namespace: 'tool-lang-client-stub' }
				: undefined,
		);
		build.onLoad({ filter: /.*/, namespace: 'tool-lang-client-stub' }, () => ({
			// clone IS structuredClone in the client (core/common/js/utils/util.js:50), which
			// is what makes the pre-run snapshot a real copy rather than a live alias.
			contents:
				'export const clone = (value) => (value === undefined || value === null ? value : structuredClone(value));\n' +
				'export const get_json_langs = async () => [];\n' +
				'export const tr = { get_mark_pattern: () => /(?!)/g };\n',
			loader: 'js',
		}));
		// SUFFIX-matched, not `^\.\/…` (2026-08-31). A plugin `filter` is tested against
		// the specifier as the resolver hands it over, and anchoring on the leading
		// `./` asserted it arrives VERBATIM from the source. On the Linux CI runner it
		// does not, so this hook alone stopped firing and the REAL module loaded:
		//   ReferenceError: DOMParser is not defined
		//     at html_to_markdown (tools/tool_lang/js/markdown_utils.js:67)
		// The gate was green on macOS and red on every GitHub run — one of the two
		// reasons the hermetic tier stayed red after its lint and tripwire debt was
		// paid. The client-stub hook above never had the problem because it was
		// already suffix-matched; this is the same shape, and the importer guard (not
		// the anchor) is what keeps the hook confined to tools/tool_lang/js.
		build.onResolve({ filter: /markdown_utils\.js$/ }, (args) =>
			importerIsToolLang(args.importer)
				? { path: 'markdown-stub', namespace: 'tool-lang-md-stub' }
				: undefined,
		);
		build.onLoad({ filter: /.*/, namespace: 'tool-lang-md-stub' }, () => ({
			contents:
				'export const html_to_markdown = (html) => String(html);\n' +
				'export const markdown_to_html = (markdown) => String(markdown);\n' +
				'export const group_markdown_into_chunks = (markdown) => String(markdown).split(/(?=<p>)/).filter(Boolean);\n',
			loader: 'js',
		}));
	},
});

/** A DOM node with only what the tool's status/overlay writes touch. */
function fakeNode(): Record<string, any> {
	const node: Record<string, any> = {
		className: '',
		textContent: '',
		innerHTML: '',
		innerText: '',
		children: [] as unknown[],
		classList: { add: () => {}, remove: () => {} },
		appendChild: (child: unknown) => {
			node.children.push(child);
		},
		replaceChildren: (...children: unknown[]) => {
			node.children = children;
		},
	};
	return node;
}

/** Every line of text the status area ended up carrying, flattened. */
function statusLines(container: Record<string, any>): string[] {
	const lines: string[] = [];
	for (const child of container.children as Record<string, any>[]) {
		if (typeof child.textContent === 'string' && child.textContent !== '')
			lines.push(child.textContent);
		for (const line of (child.children ?? []) as Record<string, any>[]) {
			if (typeof line.textContent === 'string') lines.push(line.textContent);
		}
	}
	if (typeof container.innerHTML === 'string' && container.innerHTML !== '')
		lines.push(container.innerHTML);
	if (typeof container.innerText === 'string' && container.innerText !== '')
		lines.push(container.innerText);
	return lines;
}

describe('LEG 2 — a translation run that lost a block writes nothing (CLI-14)', () => {
	/** The stored, human-made Spanish text the run must not overwrite. */
	const STORED = '<p>El texto humano existente, revisado por la archivera.</p>';

	async function runTranslation(messages: { status: string; data: Record<string, unknown> }[]) {
		const globals = globalThis as Record<string, any>;
		const savedDocument = globals.document;
		const savedWorker = globals.Worker;
		let worker: Record<string, any> | null = null;
		globals.document = { createElement: () => fakeNode() };
		globals.Worker = class {
			onmessage: ((event: { data: unknown }) => void) | null = null;
			onerror: ((event: unknown) => void) | null = null;
			posted: unknown[] = [];
			constructor() {
				worker = this as unknown as Record<string, any>;
			}
			postMessage(message: unknown) {
				this.posted.push(message);
			}
			terminate() {}
		};
		try {
			const { translate_component_browser, dispose_browser_worker } = await import(
				'../../tools/tool_lang/js/browser_translation.js'
			);
			// the worker is a MODULE-LEVEL singleton (it caches the ~1.5 GB model), so a
			// second run in this file would reuse the first run's stub and never construct
			// one. dispose_browser_worker is the tool's own way of dropping it.
			dispose_browser_worker();
			const saves: unknown[] = [];
			const target: Record<string, any> = {
				data: { value: [STORED], entries: [{ id: 7, value: STORED }] },
				save: (items: unknown) => {
					saves.push(items);
					return Promise.resolve({ result: true });
				},
				refresh: () => Promise.resolve(true),
			};
			const status = fakeNode();
			const promise = translate_component_browser({
				source_component: { data: { entries: [{ id: 7, value: '<p>One.</p><p>Two.</p>' }] } },
				target_component: target,
				source_lang: 'lg-eng',
				target_lang: 'lg-spa',
				// the .d.ts types this as an HTMLElement; the fake carries exactly the
				// properties the tool writes to and nothing else.
				status_container: status as unknown as HTMLElement,
				// get_label returns null for an unknown key in the real client
				// (tools_common/js/tool_common.js get_tool_label), which is what makes the
				// English literals fire.
				get_label: () => null,
			});
			// the orchestrator awaits get_json_langs before it builds the worker
			await new Promise((done) => setTimeout(done, 20));
			if (worker === null) throw new Error('the tool never created its worker');
			for (const message of messages) {
				(worker as Record<string, any>).onmessage({ data: message });
			}
			let rejected = false;
			let resolved: unknown = null;
			await promise.then(
				(value: unknown) => {
					resolved = value;
				},
				() => {
					rejected = true;
				},
			);
			return { saves, target, status, rejected, resolved };
		} finally {
			globals.document = savedDocument;
			globals.Worker = savedWorker;
		}
	}

	test('one failed block: no save, no success, the stored value byte-unchanged', async () => {
		const { saves, target, status, rejected } = await runTranslation([
			// the partial translation is streamed into the LIVE instance data first —
			// leaving it there would hand the next save of that component a machine-made
			// fragment to persist, which is the same overwrite, deferred
			{ status: 'on_chunk', data: { remaining: 1, accumulated_text: '<p>Uno.</p>' } },
			{ status: 'on_block_error', data: { block: 2, total: 2, message: 'inference timeout' } },
			// `end` is byte-identical to a complete run's: the worker says nothing about
			// the block it skipped. Only the main thread's own count knows.
			{ status: 'end', data: { remaining: 0, accumulated_text: '<p>Uno.</p>' } },
		]);

		expect(saves, 'the tool SAVED a translation that lost a block').toEqual([]);
		expect(target.data.value, 'the stored value did not come back').toEqual([STORED]);
		expect(target.data.entries).toEqual([{ id: 7, value: STORED }]);
		expect(rejected, 'the run resolved — both callers count a resolve as success').toBe(true);

		const lines = statusLines(status).join('\n');
		expect(lines, 'the operator was told it completed').not.toContain('completed');
		expect(lines).toContain('2/2');
		expect(lines, 'the operator is not told the existing text is intact').toContain(
			'Nothing was saved',
		);
	});

	test('the same run WITHOUT a failed block saves — the refusal is not a blanket refusal', async () => {
		// The counterfactual. A gate that only proves "it did not save" would also pass on
		// a tool that never saves anything.
		const { saves, rejected, resolved } = await runTranslation([
			{ status: 'on_chunk', data: { remaining: 1, accumulated_text: '<p>Uno.</p>' } },
			{ status: 'end', data: { remaining: 0, accumulated_text: '<p>Uno.</p><p>Dos.</p>' } },
		]);
		expect(rejected).toBe(false);
		expect(saves.length, 'a complete run must still save').toBe(1);
		expect((resolved as { result?: boolean } | null)?.result).toBe(true);
	});

	test('an empty result is refused too — it would BLANK the target language', async () => {
		const { saves, target, rejected } = await runTranslation([
			{ status: 'end', data: { remaining: 0, accumulated_text: '' } },
		]);
		expect(saves).toEqual([]);
		expect(target.data.value).toEqual([STORED]);
		expect(rejected).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// LEG 3 — the one other transform this census calls LOSSLESS really is
// ---------------------------------------------------------------------------

import { replaceTimecodes } from '../../src/core/media/tools/timecode.ts';

describe('LEG 3 — tool_tc rewrites the marks and nothing else', () => {
	test('markup, entities and text survive a timecode offset byte-exactly', () => {
		const stored =
			'<p>[TC_00:00:10.000_TC]Dijo <em>&#39;non sei&#39;</em> &amp; call&oacute;.<br>Sigui&oacute;.</p>' +
			'<p>[TC_00:00:40.000_TC]Y <span class="uncertain">lectura dudosa</span>.</p>';
		const { text } = replaceTimecodes(stored, 5);
		// every non-mark character is identical: strip the marks from both sides.
		const withoutMarks = (value: string) => value.replace(/\[TC_[^\]]*_TC\]/g, '[TC]');
		expect(withoutMarks(text)).toBe(withoutMarks(stored));
		// and the marks really moved, or the assertion above is vacuous
		expect(text).toContain('[TC_00:00:15.000_TC]');
		expect(text).toContain('[TC_00:00:45.000_TC]');
	});
});

// ---------------------------------------------------------------------------
// LEG 4 — THE CENSUS
// ---------------------------------------------------------------------------

/**
 * The component-VALUE write doors, per tier. A tool action that calls one of these
 * writes a component's value, which is the only definition of "write-back door" that
 * cannot be gamed by renaming a handler.
 *
 * `.set_value(` is in the client list because the P0-12 action itself goes through it:
 * `component_text_area.prototype.set_value` (client/dedalo/core/component_text_area/js/
 * component_text_area.js:554) builds an `update` atom and calls `change_value`, i.e. it
 * saves. On other models it does not — `component_json.prototype.set_value` only stages
 * the value — which is what the `no-persist` verdict is for.
 */
const CLIENT_DOORS = ['.save(', '.change_value(', '.set_value('];
const SERVER_DOORS = [
	'saveComponentData(',
	'persistRecordKeys(',
	'persistRecordColumns(',
	'deletePortalLocator(',
];

type Verdict =
	| 'lossless'
	| 'confirmed'
	| 'refuses'
	| 'operator-value'
	| 'new-record'
	| 'no-persist'
	| 'not-a-component-write'
	| 'PENDING';

interface CensusRow {
	verdict: Verdict;
	reason: string;
	/** Required for 'refuses': a symbol that must appear in the action's own body. */
	must_contain?: string;
	/** For 'lossless': the behavioural leg in THIS file that proves it. */
	proof?: string;
}

/**
 * The census. The key is `<file> :: <top-level symbol enclosing the door call>` — the
 * ACTION, not the file: P0-12 is exactly the shape where one action in a file is lossy
 * and another beside it is not (tool_transcription's regroup_paragraphs vs
 * save_transcription).
 */
const CENSUS: Record<string, CensusRow> = {
	// --- THE TWO P0-12 ACTIONS -------------------------------------------
	'tools/tool_transcription/js/tool_transcription.js :: tool_transcription.prototype.regroup_paragraphs':
		{
			verdict: 'confirmed',
			reason:
				'CLI-24. The rebuild is now markup- and entity-preserving (LEG 1 above), but not for every shape a stored value can take: unbalanced markup is REPAIRED rather than reproduced, and a fragment with markup but no words is dropped. So the rebuilt value is MEASURED against the current one and the operator confirms, with the words/tags that would be lost named in the dialog.',
			must_contain: 'confirm(',
		},
	'tools/tool_lang/js/browser_translation.js :: translate_component_browser': {
		verdict: 'refuses',
		reason:
			'CLI-14. The worker skips a failed block and posts an `end` indistinguishable from a complete run, so the main thread counts the on_block_error messages itself and REFUSES: nothing is saved, the streamed partial is put back, the lost blocks are named and the promise rejects (a resolve would be counted as ok by both callers). Proved by LEG 2 above.',
		must_contain: 'refuse_run(',
	},

	'tools/tool_lang/js/render_tool_lang.js :: get_content_data_edit': {
		verdict: 'confirmed',
		reason:
			'the "copy value" button of tool_lang writes the SOURCE language\u2019s value over the target language\u2019s, verbatim (no transform), and only after a confirm() in the same handler \u2014 the operator is asking for the overwrite.',
		must_contain: 'confirm(',
	},

	// --- LOSSLESS ---------------------------------------------------------
	'tools/tool_tc/server/index.ts :: changeAllTimecodes': {
		verdict: 'lossless',
		reason:
			'the timecode offset rewrites ONLY the [TC_…_TC] marks (replaceTimecodes is a mark-for-mark substitution over the raw string) and clones every element of the slice it does not touch verbatim, so no other character of the transcription can change.',
		proof: 'LEG 3 — tool_tc rewrites the marks and nothing else',
	},
	'tools/tool_update_cache/server/index.ts :: updateCache': {
		verdict: 'lossless',
		reason:
			'verified by reading: the regenerate re-saves the items it just READ from the record (readComponentItems → groupItemsByLang → set_data per lang group); the value is unchanged and the run is an identity write, which is why it also disables the Time Machine for the sweep.',
	},

	// --- OPERATOR-VALUE (not a write-back) --------------------------------
	'tools/tool_cataloging/js/tool_cataloging.js :: tool_cataloging.prototype.init': {
		verdict: 'operator-value',
		reason:
			'inserts the locator of the thesaurus term the curator just created into the portal (action:insert). The written value comes from that pick, not from the value it joins, and nothing stored is replaced.',
	},
	'tools/tool_identify/js/tool_identify.js :: tool_identify.prototype.accept_proposal': {
		verdict: 'operator-value',
		reason:
			'writes the identification proposal the curator explicitly accepted, through the changed_data atom the component itself would have built. The value is the proposal, never a transform of what the component already held.',
	},
	'tools/tool_identify/js/tool_identify.js :: tool_identify.prototype.name_type_record': {
		verdict: 'operator-value',
		reason:
			'writes the operator-supplied name into the FIRST EMPTY entry of the component, appending when there is none — it selects an empty slot precisely so it never overwrites an existing value.',
	},
	'tools/tool_identify/js/tool_identify.js :: tool_identify.prototype.attach_members': {
		verdict: 'operator-value',
		reason:
			'inserts the locator of the type record the operator is attaching (action:insert, with from_component_tipo). The engine drops a duplicate; no stored value is read, transformed or replaced.',
	},
	'tools/tool_numisdata_order_coins/js/tool_numisdata_order_coins.js :: tool_numisdata_order_coins.prototype.assign_element':
		{
			verdict: 'operator-value',
			reason:
				'inserts the locator of the element the operator assigned in the ordering UI (action:insert on the caller component). Nothing that is stored is read back and rewritten.',
		},
	'tools/tool_numisdata_order_coins/js/tool_numisdata_order_coins.js :: tool_numisdata_order_coins.prototype.set_original_copy':
		{
			verdict: 'operator-value',
			reason:
				'writes the original/copy classification the operator set on the screen: a fixed discard locator per record and the equivalents list built from the nodes they ticked. The values come from the UI state, not from the stored ones they replace.',
		},
	'tools/tool_import_files/server/index.ts :: setComponentsData': {
		verdict: 'operator-value',
		reason:
			'writes the values the import run itself carries — target_filename, target_date and the operator-declared input-component mapping — into the destination record. The written value comes from the imported file and the mapping, never from the destination value it replaces.',
	},
	'tools/tool_propagate_component_data/js/tool_propagate_component_data.js :: tool_propagate_component_data.prototype.get_component_to_propagate':
		{
			verdict: 'operator-value',
			reason:
				'saves the entries the operator composed into the tool’s OWN temporal (tmp-section) component, which is the scratch surface the propagation value is edited on — not a curated record.',
		},
	'tools/tool_propagate_component_data/server/index.ts :: propagateComponentData': {
		verdict: 'operator-value',
		reason:
			'writes the single value the operator chose across the records their SQO matched — the operation they asked for, not a transform of each target. Each overwritten value is recorded in the Time Machine in the same call (recordTimeMachine beside the persistRecordKeys), so a propagation is recoverable per record.',
	},
	'tools/tool_subtitles/js/render_tool_subtitles.js :: get_custom_buttons': {
		verdict: 'operator-value',
		reason:
			'the editor’s Save button writes what the operator typed in the subtitle CKEditor of this very session. The value is their edit, not a machine transform applied behind them.',
	},
	'tools/tool_time_machine/server/tool_time_machine.ts :: toolTimeMachineApplyValue': {
		verdict: 'operator-value',
		reason:
			'restores the component value of the Time Machine version the operator picked. Overwriting the current value IS the operation, the replaced value stays in the Time Machine, and the restored value is a stored version — nothing is derived or reshaped.',
	},
	'tools/tool_time_machine/server/tool_time_machine.ts :: restoreSection': {
		verdict: 'operator-value',
		reason:
			'the whole-record restore of an operator-picked Time Machine version, written through persistRecordColumns. Same shape as apply_value: a stored version replaces the current one and the current one remains in the Time Machine.',
	},
	'tools/tool_time_machine/server/dataframe_restore.ts :: applyDataframeRestore': {
		verdict: 'operator-value',
		reason:
			'the dataframe half of the same operator-chosen restore: it writes the frames of the picked version back through persistRecordKeys. No transform of the current value takes place.',
	},
	'tools/tool_time_machine/server/bulk_revert.ts :: toolTimeMachineBulkRevert': {
		verdict: 'operator-value',
		reason:
			'reverts the records of an operator-selected bulk process to their stored pre-process versions. The value written is a Time Machine version, and the revert itself is recorded, so the operation is reversible in turn.',
	},

	// --- NEW RECORD -------------------------------------------------------
	'tools/tool_export/js/export_user_presets.js :: create_new_export_preset': {
		verdict: 'new-record',
		reason:
			'three inserts (section tipo, owner, config blob) into the preset record this same function has just created. There is no prior value on that record for the write to replace.',
	},
	'tools/tool_print/js/print_layout_presets.js :: create_new_layout': {
		verdict: 'new-record',
		reason:
			'writes the layout blob into the dd25 record created a few lines above (action:insert on a component of a brand-new section_id). Nothing stored is replaced.',
	},
	'tools/tool_posterframe/server/index.ts :: createIdentifyingImage': {
		verdict: 'new-record',
		reason:
			'creates and links a NEW media record through the portal (add_new_element). The posterframe never lands on top of an existing image record’s value.',
	},
	'tools/tool_import_files/server/index.ts :: importFiles': {
		verdict: 'new-record',
		reason:
			'the portal branch: it creates the media record through add_new_element and links it. The write targets the record it just created, so no stored value is overwritten by it.',
	},
	'tools/tool_import_dedalo_csv/server/index.ts :: createBulkProcessRecord': {
		verdict: 'new-record',
		reason:
			'writes the run label into the dd800 bulk-process record created in the same function — the run’s own audit row, never a curated record.',
	},
	'tools/tool_propagate_component_data/server/index.ts :: createBulkProcess': {
		verdict: 'new-record',
		reason:
			'the same bulk-process audit row for a propagation run: label and metadata onto the dd800 record this function just created.',
	},
	'tools/tool_time_machine/server/bulk_revert.ts :: createRevertBulkProcess': {
		verdict: 'new-record',
		reason:
			'the bulk-process audit row of a revert run, written onto the dd800 record created in the same call.',
	},

	// --- NO PERSIST -------------------------------------------------------
	'tools/tool_dd_label/js/tool_dd_label.js :: tool_dd_label.prototype.update_data': {
		verdict: 'no-persist',
		reason:
			'flushes the label matrix into the caller component_json’s in-memory value. component_json.prototype.set_value stages a changed_data item and, as its own docblock states, does NOT auto-save — the operator saves the component themselves. The array it writes is the parsed array itself, mutated in place, so entries and object keys the matrix does not display survive.',
	},

	// --- NOT A COMPONENT WRITE -------------------------------------------
	'tools/tool_assistant/js/assistant_controller.js :: assistant_controller': {
		verdict: 'not-a-component-write',
		reason:
			'`this._store.save(...)` is conversation_store, the assistant’s localStorage thread persistence (v2 blob). It touches no component and no record; the derivation cannot tell the two `.save(` apart, so the row says which it is.',
	},

	// --- PENDING (real, unconfirmed write-backs) --------------------------
	'tools/tool_transcription/js/tool_transcription.js :: tool_transcription.prototype.save_transcription':
		{
			verdict: 'PENDING',
			reason:
				'an automatic-transcription result is written to item 1 of the component’s current language, "replacing whatever it held" (its own docblock), with no confirmation and no comparison against what is there — so launching a re-transcription over a record whose transcript a curator has already edited replaces that work. The previous text does go to the Time Machine. Left open here because the fix is a UI decision on the transcription tool, outside the change that wrote this gate.',
		},
};

/** PINNED. Shrink-only: this may go DOWN, never up. */
const PENDING_COUNT = 1;

/**
 * A top-level declaration: `function x`, `const x =`, `x.prototype.y =`, `obj.y =`.
 * Anchored at column 0 — these files put every action at the left margin, and matching
 * indented lines would name an `if` or a `for` as the enclosing action.
 */
const DECLARATION =
	/^(?:export\s+)?(?:async\s+)?(?:function\s+([A-Za-z0-9_$]+)|(?:const|let|var)\s+([A-Za-z0-9_$]+)\s*=|([A-Za-z0-9_$]+(?:\.prototype)?\.[A-Za-z0-9_$]+)\s*=)/;

function walk(dir: string, acc: string[] = []): string[] {
	for (const entry of readdirSync(dir)) {
		const path = join(dir, entry);
		if (statSync(path).isDirectory()) walk(path, acc);
		else acc.push(path);
	}
	return acc;
}

/** The files under scan: every tool's client JS and every tool's server TS. */
function scannedFiles(): { path: string; doors: string[] }[] {
	const files: { path: string; doors: string[] }[] = [];
	for (const path of walk(join(ROOT, 'tools'))) {
		// `-min.js` is a build artefact of the file beside it, not a second source.
		if (path.endsWith('.js') && !path.endsWith('-min.js') && path.includes('/js/')) {
			files.push({ path, doors: CLIENT_DOORS });
		} else if (path.endsWith('.ts') && path.includes('/server/')) {
			files.push({ path, doors: SERVER_DOORS });
		}
	}
	return files;
}

/**
 * Walks a file line by line, tracking the nearest top-level declaration, and returns
 * every `<file> :: <symbol>` whose body calls a write door. Comment lines are skipped:
 * a docblock that MENTIONS `saveComponentData(` is not a door, and several of these
 * files discuss the write path at length.
 */
function deriveActions(): Map<string, string[]> {
	const actions = new Map<string, string[]>();
	for (const { path, doors } of scannedFiles()) {
		const rel = relative(ROOT, path);
		const lines = readFileSync(path, 'utf8').split('\n');
		let symbol = '(module top level)';
		let inBlockComment = false;
		for (const line of lines) {
			const wasInBlockComment = inBlockComment;
			if (/^\s*\/\*/.test(line)) inBlockComment = true;
			if (/\*\//.test(line)) inBlockComment = false;
			if (wasInBlockComment || inBlockComment || /^\s*(\/\/|\*)/.test(line)) continue;
			const declaration = DECLARATION.exec(line);
			if (declaration !== null) {
				symbol = declaration[1] ?? declaration[2] ?? declaration[3] ?? symbol;
			}
			const hits = doors.filter((door) => line.includes(door));
			if (hits.length === 0) continue;
			const key = `${rel} :: ${symbol}`;
			actions.set(key, [...new Set([...(actions.get(key) ?? []), ...hits])]);
		}
	}
	return actions;
}

/**
 * The source of ONE action: from its declaration line to the line before the next
 * top-level declaration. This is what the per-verdict checks read, so a `confirm(`
 * elsewhere in the same file cannot vouch for an action that has none — the exact
 * confusion that let a file hold a confirmed rebuild and an unconfirmed overwrite.
 */
function actionBody(key: string): string {
	const [rel, symbol] = key.split(' :: ') as [string, string];
	const lines = readFileSync(join(ROOT, rel), 'utf8').split('\n');
	let start = -1;
	let end = lines.length;
	for (let index = 0; index < lines.length; index++) {
		const declaration = DECLARATION.exec(lines[index] as string);
		if (declaration === null) continue;
		const name = declaration[1] ?? declaration[2] ?? declaration[3];
		if (start === -1) {
			if (name === symbol) start = index;
		} else {
			end = index;
			break;
		}
	}
	if (start === -1) return '';
	return lines.slice(start, end).join('\n');
}

const derived = deriveActions();

describe('LEG 4 — the tool write-back census is TOTAL by derivation', () => {
	test('the derivation actually found actions (the scan is not silently empty)', () => {
		// Without this floor a broken walk() would make every assertion below vacuous.
		expect(derived.size).toBeGreaterThan(25);
		// and it found the two P0-12 actions specifically, by their real names
		expect([...derived.keys()]).toContain(
			'tools/tool_transcription/js/tool_transcription.js :: tool_transcription.prototype.regroup_paragraphs',
		);
		expect([...derived.keys()]).toContain(
			'tools/tool_lang/js/browser_translation.js :: translate_component_browser',
		);
	});

	test('every door token is a REAL write door, not a typo', () => {
		// A door token that matches nothing shrinks the census to silence. A token with no
		// caller in tools/ today is fine — a token that no longer names anything is not, so
		// each one is checked against the module that DEFINES it.
		expect(CLIENT_DOORS.length).toBe(3);
		expect(SERVER_DOORS.length).toBe(4);
		const componentCommon = readFileSync(
			join(ROOT, 'client/dedalo/core/component_common/js/component_common.js'),
			'utf8',
		);
		for (const door of CLIENT_DOORS) {
			const name = door.slice(1, -1);
			expect(
				componentCommon.includes(`component_common.prototype.${name} =`),
				`${door} is not a component_common write door any more`,
			).toBe(true);
		}
		const srcSources = walk(join(ROOT, 'src'))
			.filter((path) => path.endsWith('.ts'))
			.map((path) => readFileSync(path, 'utf8'));
		for (const door of SERVER_DOORS) {
			const name = door.slice(0, -1);
			expect(
				srcSources.some((source) =>
					new RegExp(`export (?:async )?function ${name}\\(`).test(source),
				),
				`${door} is not exported by src/ any more — is the token still right?`,
			).toBe(true);
		}
	});

	test('every derived action has a census row', () => {
		const missing = [...derived.keys()].filter((key) => CENSUS[key] === undefined).sort();
		expect(
			missing,
			`Tool action(s) writing a component value with no census row:\n  ${missing.join('\n  ')}\nAdd a row with a verdict and a written reason. If it reads a stored value, transforms it and writes it back, the verdict is 'lossless', 'confirmed' or 'refuses' — never a silent overwrite.`,
		).toEqual([]);
	});

	test('no census row names an action that no longer writes (stale rows)', () => {
		const stale = Object.keys(CENSUS)
			.filter((key) => !derived.has(key))
			.sort();
		expect(
			stale,
			`Census row(s) for actions that no longer call a write door (renamed? removed?):\n  ${stale.join('\n  ')}`,
		).toEqual([]);
	});

	test('every row carries a real reason, not a placeholder', () => {
		for (const [key, row] of Object.entries(CENSUS)) {
			expect(row.reason.length, `${key}: the reason is too short to be a reason`).toBeGreaterThan(
				60,
			);
		}
	});
});

describe('LEG 4 — the verdicts are true of the source, not just of the table', () => {
	test("every 'confirmed' action really asks before writing", () => {
		for (const [key, row] of Object.entries(CENSUS)) {
			if (row.verdict !== 'confirmed') continue;
			const body = actionBody(key);
			expect(body.length, `${key}: could not locate the action's body`).toBeGreaterThan(0);
			expect(
				body.includes(row.must_contain ?? 'confirm('),
				`${key} is marked 'confirmed' but its own body never calls confirm()`,
			).toBe(true);
		}
	});

	test("every 'refuses' action really carries its refusal", () => {
		for (const [key, row] of Object.entries(CENSUS)) {
			if (row.verdict !== 'refuses') continue;
			expect(row.must_contain, `${key}: a 'refuses' row must name the refusal symbol`).toBeString();
			const body = actionBody(key);
			expect(
				body.includes(row.must_contain as string),
				`${key} is marked 'refuses' but ${row.must_contain} is not in its body`,
			).toBe(true);
		}
	});

	test("every 'lossless' claim is either PROVED here or declared as read-verified", () => {
		// The honesty rule: a lossless verdict is the strongest claim in the table, so it
		// may not be a bare assertion. Either a behavioural leg in this file proves it —
		// and the row names that leg, which must exist in this file's own source — or the
		// reason says out loud that it was verified by reading.
		const ownSource = readFileSync(
			join(ROOT, 'test/unit/tool_lossless_writeback_tripwire.test.ts'),
			'utf8',
		);
		for (const [key, row] of Object.entries(CENSUS)) {
			if (row.verdict !== 'lossless') continue;
			if (row.proof !== undefined) {
				expect(
					ownSource.includes(row.proof),
					`${key}: names the proof '${row.proof}', which is not a describe/test in this file`,
				).toBe(true);
				continue;
			}
			expect(
				row.reason.includes('verified by reading'),
				`${key} claims 'lossless' with no proof in this file — say "verified by reading" in the reason, or add the behavioural leg`,
			).toBe(true);
		}
	});

	test("every 'PENDING' action really has NO confirmation — so a fix cannot land silently", () => {
		for (const [key, row] of Object.entries(CENSUS)) {
			if (row.verdict !== 'PENDING') continue;
			const body = actionBody(key);
			expect(body.length, `${key}: could not locate the action's body`).toBeGreaterThan(0);
			expect(
				body.includes('confirm('),
				`${key} now confirms before writing — move its row to 'confirmed' and lower PENDING_COUNT.`,
			).toBe(false);
		}
	});

	test('the PENDING list is SHRINK-ONLY', () => {
		const pending = Object.values(CENSUS).filter((row) => row.verdict === 'PENDING').length;
		expect(
			pending,
			`PENDING grew (${pending} > ${PENDING_COUNT}). A new tool action that writes back over a stored component value must be LOSSLESS or CONFIRMED, not added to the backlog.`,
		).toBeLessThanOrEqual(PENDING_COUNT);
		expect(
			pending,
			`PENDING shrank to ${pending} — lower PENDING_COUNT so the ratchet keeps biting.`,
		).toBe(PENDING_COUNT);
	});
});
