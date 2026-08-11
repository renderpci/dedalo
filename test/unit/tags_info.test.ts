/**
 * TAGS_INFO GATE (dd_component_text_area_api::get_tags_info, ported 2026-07-30
 * — WC-077).
 *
 * `tool_tr_print` asks for this feed on open; the action was never registered
 * on the TS engine, so opening the print tool answered HTTP 400 ("Undefined or
 * unauthorized method") and the tool rendered nothing. These tests pin:
 *
 *   - the resolution itself: index/reference locators → term label, note marks
 *     in the TEXT → the note record's ddo values;
 *   - the WC-077 wire law the client matches marks against: STRING section_id
 *     and tag_id, literal note ddos as string[], a bool ddo as a real boolean;
 *   - the shapes the shipped client actually reads (`el.data.tag_id`,
 *     `note.title.join(' | ')`, `note.body`);
 *   - property gating: a type whose `properties.tags_*` is absent yields NO
 *     key (never an empty-array lie), and an unknown type is REPORTED, never
 *     silently dropped.
 *
 * Uses the REAL suite-DB ontology (rsc36 carries the shipped tags_index /
 * tags_reference / tags_notes config); all matrix rows are scratch, created
 * and deleted here.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import {
	buildTagsInfo,
	type NoteElement,
} from '../../src/core/components/component_text_area/tags_info.ts';
import {
	deleteMatrixRecord,
	insertMatrixRecordWithCounter,
} from '../../src/core/db/matrix_write.ts';
import { NOTE_PATTERN } from '../../src/core/resolve/tr_marks.ts';

const TABLE = 'matrix';
/** rsc326 (notes) lives in its OWN matrix table — the resolver knows, the test must too. */
const NOTE_TABLE = 'matrix_notes';
const HOST_SECTION = 'rsc167'; // the record the text_area lives on
const TEXT_AREA = 'rsc36'; // component_text_area (translatable)
const INDEX_PORTAL = 'rsc860'; // properties.tags_index.tipo
const REFERENCE_PORTAL = 'rsc1368'; // properties.tags_reference.tipo
const NOTE_SECTION = 'rsc326'; // properties.tags_notes key
const NOTE_TITLE = 'rsc328'; // ddo id 'title', type text
const NOTE_BODY = 'rsc329'; // ddo id 'body', type text
const NOTE_PUBLICATION = 'rsc399'; // ddo id 'publishable', type bool
const TERM_SECTION = 'rsc197'; // a section the term resolver can label
const LANG = 'lg-spa';

let noteId = 0;
let termId = 0;
let hostId = 0;
let bareHostId = 0; // host with no tags at all

/** The note mark the client writes into the text (JSON with ' for "). */
function noteMark(tagId: number, sectionId: number): string {
	const locator = {
		section_tipo: NOTE_SECTION,
		section_id: String(sectionId),
		component_tipo: NOTE_TITLE,
	};
	return `[note-a-${tagId}-data:${JSON.stringify(locator).replace(/"/g, "'")}:data]`;
}

beforeAll(async () => {
	termId = await insertMatrixRecordWithCounter(TABLE, TERM_SECTION, {
		string: {
			rsc85: [{ id: 1, lang: 'lg-nolan', value: 'Ada' }],
			rsc86: [{ id: 1, lang: 'lg-nolan', value: 'Lovelace' }],
		},
	});
	noteId = await insertMatrixRecordWithCounter(NOTE_TABLE, NOTE_SECTION, {
		string: {
			[NOTE_TITLE]: [{ id: 1, lang: LANG, value: 'Primera nota' }],
			[NOTE_BODY]: [{ id: 1, lang: LANG, value: 'El cuerpo de la nota.' }],
		},
		relation: {
			// component_publication: section_id '1' is the publishable term.
			[NOTE_PUBLICATION]: [{ id: 1, section_tipo: 'dd64', section_id: '1' }],
		},
	});
	hostId = await insertMatrixRecordWithCounter(TABLE, HOST_SECTION, {
		string: {
			[TEXT_AREA]: [
				{
					id: 1,
					lang: LANG,
					value: `<p>[index-n-7-t-data::data]texto${noteMark(3, noteId)} final[/index-n-7-t-data::data]</p>`,
				},
			],
		},
		relation: {
			[INDEX_PORTAL]: [
				{
					id: 1,
					type: 'dd96',
					tag_id: 7, // stored as a NUMBER on purpose — must serve '7'
					section_tipo: TERM_SECTION,
					section_id: termId,
					from_component_tipo: INDEX_PORTAL,
				},
			],
			[REFERENCE_PORTAL]: [
				{
					id: 1,
					type: 'dd605',
					tag_id: '1',
					section_tipo: TERM_SECTION,
					section_id: String(termId),
					from_component_tipo: REFERENCE_PORTAL,
				},
			],
		},
	});
	bareHostId = await insertMatrixRecordWithCounter(TABLE, HOST_SECTION, {});
});

afterAll(async () => {
	if (hostId > 0) await deleteMatrixRecord(TABLE, HOST_SECTION, hostId);
	if (bareHostId > 0) await deleteMatrixRecord(TABLE, HOST_SECTION, bareHostId);
	if (noteId > 0) await deleteMatrixRecord(NOTE_TABLE, NOTE_SECTION, noteId);
	if (termId > 0) await deleteMatrixRecord(TABLE, TERM_SECTION, termId);
});

const host = () => ({ tipo: TEXT_AREA, section_tipo: HOST_SECTION, section_id: hostId });

describe('buildTagsInfo — index / reference tags', () => {
	test('locators resolve to a term label, tag_id string / section_id int (WC-077)', async () => {
		const { tags_info } = await buildTagsInfo(['index', 'reference'], host(), LANG);
		const index = tags_info.tags_index ?? [];
		expect(index).toHaveLength(1);
		// The client filters with `el.data.tag_id === tag_id` against the STRING
		// it scraped out of the mark — a stored number must not leak through.
		expect(index[0]?.data.tag_id).toBe('7');
		// WC-2026-08-10-section-id-int-canonical: tag_id stays a STRING (it is a
		// mark token, not an address) — the record address is emitted as an INT.
		expect(index[0]?.data.section_id).toBe(termId);
		expect(index[0]?.label).toBe('Lovelace, Ada');
		// reference tags share the shape, from their own configured component
		const reference = tags_info.tags_reference ?? [];
		expect(reference).toHaveLength(1);
		expect(reference[0]?.data.tag_id).toBe('1');
		expect(reference[0]?.label).toBe('Lovelace, Ada');
	});

	test('a record with no tag data yields empty arrays, not a missing key', async () => {
		const { tags_info } = await buildTagsInfo(
			['index', 'reference'],
			{ tipo: TEXT_AREA, section_tipo: HOST_SECTION, section_id: bareHostId },
			LANG,
		);
		expect(tags_info.tags_index).toEqual([]);
		expect(tags_info.tags_reference).toEqual([]);
	});
});

describe('buildTagsInfo — annotations', () => {
	test('note marks in the text resolve through the tags_notes ddo_map', async () => {
		const { tags_info } = await buildTagsInfo(['note'], host(), LANG);
		const notes = tags_info.tags_notes ?? [];
		expect(notes).toHaveLength(1);
		const note = notes[0] as NoteElement;
		expect(note.data.section_tipo).toBe(NOTE_SECTION);
		// WC-2026-08-10-section-id-int-canonical: int address.
		expect(note.data.section_id).toBe(noteId);
		// Literal ddos are string[] — the client does title.join(' | ') and
		// concatenates body into a template (WC-077).
		expect(note.title).toEqual(['Primera nota']);
		expect(note.body).toEqual(['El cuerpo de la nota.']);
		// A bool ddo is a real boolean (publication section_id '1' = publishable).
		expect(note.publishable).toBe(true);
	});

	test('a malformed mark payload is skipped, not fatal', async () => {
		const brokenId = await insertMatrixRecordWithCounter(TABLE, HOST_SECTION, {
			string: {
				[TEXT_AREA]: [{ id: 1, lang: LANG, value: '<p>[note-a-1-data:{not json}:data]x</p>' }],
			},
		});
		try {
			const { tags_info } = await buildTagsInfo(
				['note'],
				{ tipo: TEXT_AREA, section_tipo: HOST_SECTION, section_id: brokenId },
				LANG,
			);
			expect(tags_info.tags_notes).toEqual([]);
		} finally {
			await deleteMatrixRecord(TABLE, HOST_SECTION, brokenId);
		}
	});

	test('notes are LANG-scoped: another lang slice resolves nothing', async () => {
		const { tags_info } = await buildTagsInfo(['note'], host(), 'lg-eng');
		expect(tags_info.tags_notes).toEqual([]);
	});
});

describe('buildTagsInfo — gating and honesty', () => {
	test('an unknown tag type is reported back, never silently dropped', async () => {
		const { tags_info, unknown_types } = await buildTagsInfo(['index', 'unicorn'], host(), LANG);
		expect(unknown_types).toEqual(['unicorn']);
		expect(tags_info.tags_index).toBeDefined();
	});

	test('a component whose ontology declares no tag config emits NO key', async () => {
		// rsc329 (the note body text_area) carries none of the tag properties.
		const { tags_info } = await buildTagsInfo(
			['index', 'note', 'reference', 'person'],
			{ tipo: NOTE_BODY, section_tipo: NOTE_SECTION, section_id: noteId },
			LANG,
		);
		expect(Object.keys(tags_info)).toEqual([]);
	});
});

describe('NOTE_PATTERN', () => {
	test('group 6 is the data payload of every note state', () => {
		const text = `a${noteMark(1, 5)}b[note-b-2-lbl-data:{'x':'y'}:data]c`;
		NOTE_PATTERN.lastIndex = 0;
		const payloads: string[] = [];
		let match = NOTE_PATTERN.exec(text);
		while (match !== null) {
			payloads.push(match[6] ?? '');
			match = NOTE_PATTERN.exec(text);
		}
		expect(payloads).toHaveLength(2);
		expect(JSON.parse(payloads[0]!.replace(/'/g, '"')).section_id).toBe('5');
		expect(payloads[1]).toBe("{'x':'y'}");
	});
});
