// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global it, describe, assert */
/*eslint no-undef: "error"*/

import { component_common } from '../../../core/component_common/js/component_common.js';

/**
 * COMPONENT_COMMON UPDATE_DATUM
 * Drives the SHIPPED `component_common.prototype.update_datum` on a plain object
 * as `this` (no backend): the merge of an API response into the datum shared with
 * the section.
 *
 * THE ORDER CONTRACT: unseen data/context items are appended in the order the
 * server emitted them. The merge loop runs backwards and used to `push`, so new
 * items landed REVERSED. The server emits one component once per ddo naming it
 * (WC-2026-08-05-multi-engine-ddo-expansion) — a dataframe rating frame child as
 * [edit (with datalist), solved] — and after a tool_time_machine apply the portal
 * refresh stored [solved, edit]; the first-match reader (get_rating) took the
 * datalist-less one and the chip threw, killing the refresh.
 *
 * THE UPDATE CONTRACT (unchanged): an item matching an existing one by (tipo,
 * section_tipo, section_id, mode [, id_key + main_component_tipo]) is updated IN
 * PLACE (entries + fallback_value; same object, same position), never appended.
 */
describe('COMPONENT_COMMON UPDATE_DATUM', () => {
	const SECTION_TIPO = 'test6100';
	const RATING_TIPO = 'test6746';

	// a data item of the rating component in `mode`
	const item = (mode, section_id, entries, extra = {}) =>
		Object.assign(
			{
				tipo: RATING_TIPO,
				section_tipo: SECTION_TIPO,
				section_id: section_id,
				mode: mode,
				entries: entries,
			},
			extra,
		);

	// a context item
	const ctx = (tipo, mode) => ({
		tipo: tipo,
		section_tipo: SECTION_TIPO,
		mode: mode,
		lang: 'lg-nolan',
	});

	// minimal `this`: the datum plus the identity fields update_datum reads
	const make_self = (data = [], context = []) => ({
		tipo: 'test6744',
		section_tipo: 'test6099',
		section_id: 7,
		mode: 'list',
		data: {},
		datum: { data: data, context: context },
	});

	const update_datum = (self, new_datum) =>
		component_common.prototype.update_datum.call(self, new_datum);

	it('unseen data items keep the server emission order [edit, solved]', async () => {
		const pre = item('list', 1, [{ v: 'other' }], { tipo: 'test6745' });
		const self = make_self([pre]);

		await update_datum(self, {
			data: [
				item('edit', 1, [{ section_id: 3 }], { datalist: [] }),
				item('solved', 1, [{ section_id: 3 }]),
				item('list', 2, [{ section_id: 4 }]),
			],
			context: [],
		});

		assert.deepEqual(
			self.datum.data.map((el) => el.mode + ':' + el.section_id),
			['list:1', 'edit:1', 'solved:1', 'list:2'],
			'pre-existing item first, then the new ones in emission order',
		);
		assert.strictEqual(self.datum.data[0], pre, 'the pre-existing item is untouched');
	});

	it('existing items are updated IN PLACE (same object, same position), new ones appended in order', async () => {
		const existing_solved = item('solved', 1, [{ section_id: 1 }]);
		const existing_list = item('list', 9, [{ section_id: 9 }]);
		const self = make_self([existing_solved, existing_list]);

		await update_datum(self, {
			data: [
				item('edit', 1, [{ section_id: 3 }], { datalist: [] }),
				item('solved', 1, [{ section_id: 3 }], { fallback_value: ['x'] }),
				item('edit', 2, [{ section_id: 5 }]),
			],
			context: [],
		});

		assert.strictEqual(self.datum.data.length, 4, 'one update, two appends');
		assert.strictEqual(
			self.datum.data[0],
			existing_solved,
			'the matched item keeps its object and position',
		);
		assert.deepEqual(existing_solved.entries, [{ section_id: 3 }], 'entries updated in place');
		assert.deepEqual(existing_solved.fallback_value, ['x'], 'fallback_value updated in place');
		assert.strictEqual(self.datum.data[1], existing_list, 'the unrelated item is untouched');
		assert.deepEqual(
			self.datum.data.slice(2).map((el) => el.mode + ':' + el.section_id),
			['edit:1', 'edit:2'],
			'new items appended in emission order',
		);
	});

	it('unseen context items keep the server emission order', async () => {
		const pre = ctx('test6745', 'list');
		const self = make_self([], [pre]);

		await update_datum(self, {
			data: [],
			context: [ctx(RATING_TIPO, 'edit'), ctx(RATING_TIPO, 'solved'), ctx('test6745', 'list')],
		});

		assert.deepEqual(
			self.datum.context.map((el) => el.tipo + ':' + el.mode),
			['test6745:list', RATING_TIPO + ':edit', RATING_TIPO + ':solved'],
			'an already-known context is not duplicated; the new ones keep their order',
		);
		assert.strictEqual(self.datum.context[0], pre);
	});
});

// @license-end
