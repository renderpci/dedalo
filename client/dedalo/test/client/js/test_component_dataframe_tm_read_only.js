// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global it, describe, afterEach, assert */
/*eslint no-undef: "error"*/

/**
 * TEST_COMPONENT_DATAFRAME_TM_READ_ONLY
 * A dataframe shown inside a Time Machine surface is HISTORY, never the live
 * editable record (WC-2026-09-29-tm-preview-frame-children-as-of).
 *
 *  1. The list chip (view_default_list_dataframe) is inert where the slot is not
 *     the live editable record — permissions < 2, a dd15 history-list cell, a
 *     tool preview (data_source 'tm' / matrix_id anywhere up the caller chain).
 *     Its only door, open_target_section, opens the LIVE target in an EDITABLE
 *     modal whose Delete unlinks at the slot's coordinates — in a dd15 cell those
 *     are (host section, dd15 row id) — and whose close refreshes from the live
 *     store. Read-only: no handler, no add button, 'read_only' state.
 *  2. Every descendant of a TM surface skips the live sync_data subscription —
 *     not only instances carrying data_source 'tm' or sitting one/two levels
 *     under dd15: a frame child (the rating inside the preview dataframe's
 *     section_record) was still subscribed, so a live save overwrote the
 *     historical value on screen.
 *
 * NO BACKEND, BY CONSTRUCTION. Plain objects carrying exactly what the view /
 * events_subscription read; the modal door is observed through the document
 * (a modal node appearing) and a spy refresh.
 */

// imports
import { event_manager } from '../../../core/common/js/event_manager.js';
import {
	events_subscription,
	is_time_machine_view,
} from '../../../core/component_common/js/events_subscription.js';
import { view_default_list_dataframe } from '../../../core/component_dataframe/js/view_default_list_dataframe.js';

// fixtures
const HOST_TIPO = 'test6099';
const SLOT_TIPO = 'test6744';
const FRAME_TIPO = 'test6100';
const RATING_TIPO = 'test6746';

// a list-mode dataframe slot with one frame entry
const make_slot = function (extra = {}) {
	return Object.assign(
		{
			model: 'component_dataframe',
			type: 'component',
			mode: 'list',
			tipo: SLOT_TIPO,
			section_tipo: HOST_TIPO,
			section_id: 7,
			permissions: 2,
			show_interface: {},
			context: {},
			properties: { label: 'R' },
			target_section: [{ tipo: FRAME_TIPO, label: 'Frame' }],
			request_config_object: { hide: { ddo_map: [] } },
			data: { entries: [{ section_tipo: FRAME_TIPO, section_id: 1, id_key: 1 }] },
			datum: { data: [] },
			get_rating() {
				return null;
			},
			refreshed: 0,
			refresh() {
				this.refreshed++;
			},
		},
		extra,
	);
};

const render = async (self) => view_default_list_dataframe.render(self, { render_level: 'content' });

const mousedown = (node) =>
	node.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));

const modal_count = () => document.querySelectorAll('dd-modal').length;

// a sync_data subscription for this id_base/lang
const sync_tokens = (self) =>
	event_manager.get_events().filter((ev) => ev.event_name === `sync_data_${self.id_base}_${self.lang}`);

describe('component_dataframe — Time Machine surfaces are read-only history', function () {
	const created_tokens = [];
	afterEach(function () {
		for (const t of created_tokens.splice(0)) event_manager.unsubscribe(t);
		for (const m of document.querySelectorAll('dd-modal')) m.remove();
	});

	describe('is_time_machine_view (the whole caller chain)', function () {
		it('a live instance is not a TM view', function () {
			const page = { model: 'section', section_tipo: HOST_TIPO };
			assert.strictEqual(is_time_machine_view({ caller: { caller: page } }), false);
			assert.strictEqual(is_time_machine_view(null), false);
		});

		it('data_source tm / matrix_id / dd15 at ANY depth marks it', function () {
			const leaf = (root) => ({ caller: { caller: { caller: { caller: root } } } });
			assert.strictEqual(is_time_machine_view(leaf({ data_source: 'tm' })), true);
			assert.strictEqual(is_time_machine_view(leaf({ matrix_id: 42 })), true);
			assert.strictEqual(is_time_machine_view(leaf({ section_tipo: 'dd15' })), true);
		});

		it('is cycle-safe', function () {
			const a = { section_tipo: HOST_TIPO };
			const b = { section_tipo: HOST_TIPO, caller: a };
			a.caller = b;
			assert.strictEqual(is_time_machine_view(a), false);
		});
	});

	describe('the list chip', function () {
		it('LIVE editable slot: the chip is wired (control — the door exists)', async function () {
			// entries empty: the live mousedown reveals the add button instead of
			// opening the modal (the modal would build a real target section)
			const self = make_slot({ data: { entries: [] } });
			const node = await render(self);
			const chip = node.querySelector('.button.activate');
			const add = node.querySelector('.button.add');
			assert.ok(chip, 'chip rendered');
			assert.ok(add, 'live slot renders the add button');
			assert.notOk(node.querySelector('.content_value.read_only'));
			assert.strictEqual(view_default_list_dataframe.is_read_only(self), false);
			mousedown(chip);
			assert.ok(chip.classList.contains('hide'), 'the live chip handled the mousedown');
			assert.notOk(add.classList.contains('hide'), 'the add button is revealed');
		});

		const read_only_cases = {
			'permissions < 2': () => make_slot({ permissions: 1 }),
			'show_interface.read_only': () => make_slot({ show_interface: { read_only: true } }),
			'a dd15 history-list cell (host section, dd15 row id)': () =>
				make_slot({
					section_id: 5501,
					caller: { model: 'section_record', section_tipo: HOST_TIPO, caller: { model: 'section', section_tipo: 'dd15' } },
				}),
			'inside a tool preview (data_source tm up the chain)': () =>
				make_slot({ caller: { model: 'section_record', caller: { model: 'component_portal', data_source: 'tm' } } }),
			'inside a tool preview (matrix_id on the slot)': () => make_slot({ matrix_id: 900 }),
		};

		for (const [name, build] of Object.entries(read_only_cases)) {
			it(`${name}: inert chip — no modal, no add button, no refresh, read_only state`, async function () {
				const self = build();
				assert.strictEqual(view_default_list_dataframe.is_read_only(self), true);
				const node = await render(self);
				const chip = node.querySelector('.button.activate');
				assert.ok(chip, 'the chip still renders (label + rating colour)');
				assert.strictEqual(chip.textContent, 'R');
				assert.ok(node.querySelector('.content_value.read_only'), 'read_only state');
				assert.notOk(node.querySelector('.button.add'), 'no add button');
				const before = modal_count();
				mousedown(chip);
				await new Promise((r) => setTimeout(r, 0));
				assert.strictEqual(modal_count(), before, 'no modal opened (no live editable target)');
				assert.strictEqual(self.refreshed, 0, 'no refresh from the live store');
			});
		}

		it('a read-only chip still paints the rating colour', async function () {
			const self = make_slot({
				permissions: 1,
				request_config_object: { hide: { ddo_map: [{ tipo: RATING_TIPO, role: 'rating' }] } },
				datum: {
					data: [
						{
							tipo: RATING_TIPO,
							from_component_tipo: SLOT_TIPO,
							section_tipo: FRAME_TIPO,
							section_id: 1,
							entries: [{ section_id: 3 }],
							datalist: [{ section_id: 3, hide: [{ literal: '#ff0000' }] }],
						},
					],
				},
			});
			// get_rating lives on the component prototype; the plain slot borrows it
			const { component_dataframe } = await import('../../../core/component_dataframe/js/component_dataframe.js');
			self.get_rating = component_dataframe.prototype.get_rating;
			const node = await render(self);
			assert.strictEqual(node.querySelector('.button.activate').style.backgroundColor, 'rgb(255, 0, 0)');
		});
	});

	describe('live sync_data subscription', function () {
		const make_component = (caller, extra = {}) =>
			Object.assign(
				{
					id: `c_${Math.random()}`,
					id_base: `${FRAME_TIPO}_1_${RATING_TIPO}_${Math.random()}`,
					lang: 'lg-nolan',
					mode: 'edit',
					section_tipo: FRAME_TIPO,
					caller: caller,
					events_tokens: [],
				},
				extra,
			);

		it('a live component subscribes (the path exists)', function () {
			const self = make_component({ model: 'section_record', caller: { model: 'section', section_tipo: HOST_TIPO } });
			events_subscription(self);
			created_tokens.push(...self.events_tokens);
			assert.strictEqual(sync_tokens(self).length, 1);
		});

		it('a frame child deep inside a tool preview (no tm marker of its own) does NOT subscribe', function () {
			// preview main (data_source tm) -> its section_record -> dataframe -> frame section_record -> rating
			const preview_main = { model: 'component_portal', data_source: 'tm', matrix_id: 900 };
			const dataframe = { model: 'component_dataframe', caller: { model: 'section_record', caller: preview_main } };
			const frame_record = { model: 'section_record', caller: dataframe };
			const self = make_component(frame_record);
			events_subscription(self);
			created_tokens.push(...self.events_tokens);
			assert.strictEqual(sync_tokens(self).length, 0, 'the frame child must not follow live saves');
		});

		it('a cell three levels under a dd15 list does NOT subscribe', function () {
			const dd15 = { model: 'section', section_tipo: 'dd15' };
			const self = make_component({ model: 'section_record', caller: { model: 'component_portal', caller: { caller: dd15 } } });
			events_subscription(self);
			created_tokens.push(...self.events_tokens);
			assert.strictEqual(sync_tokens(self).length, 0);
		});

		// get_dataframe (component_common/js/dataframe.js) sets `frame.caller = main`
		// only AFTER get_instance, i.e. after events_subscription ran in init: a
		// literal main's frame in a dd15 cell subscribes with NO caller chain (and no
		// data_source / matrix_id — dd15 cells carry neither). The publish-time
		// re-check is the only thing keeping a live save off that historical frame.
		describe('caller injected after subscription (get_dataframe shape)', function () {
			const make_spied = () => {
				const self = make_component(null);
				self.updated = 0;
				self.refreshed = 0;
				self.update_data_value = function () {
					this.updated++;
				};
				self.refresh = function () {
					this.refreshed++;
				};
				return self;
			};
			const publish_live_save = (self) =>
				event_manager.publish(`sync_data_${self.id_base}_${self.lang}`, {
					caller: { id: 'foreign_live_instance' },
					changed_data: { key: 0, value: 'LIVE', action: 'update' },
				});

			it('control: a live chain injected post-init still follows live saves', function () {
				const self = make_spied();
				events_subscription(self);
				created_tokens.push(...self.events_tokens);
				assert.strictEqual(sync_tokens(self).length, 1, 'no chain at init: it subscribes');
				self.caller = { model: 'component_input_text', caller: { model: 'section_record', caller: { model: 'section', section_tipo: HOST_TIPO } } };
				publish_live_save(self);
				assert.strictEqual(self.updated, 1);
				assert.strictEqual(self.refreshed, 1);
			});

			for (const [name, tail] of [
				['dd15 list', { model: 'section', section_tipo: 'dd15' }],
				['tool preview (data_source tm)', { model: 'component_input_text', data_source: 'tm' }],
			]) {
				it(`${name} injected post-init: a live save neither updates nor refreshes it`, function () {
					const self = make_spied();
					events_subscription(self);
					created_tokens.push(...self.events_tokens);
					assert.strictEqual(sync_tokens(self).length, 1, 'no chain at init: it subscribes');
					// frame -> literal main -> section_record -> <TM surface>
					self.caller = { model: 'component_input_text', caller: { model: 'section_record', caller: tail } };
					publish_live_save(self);
					assert.strictEqual(self.updated, 0, 'update_data_value must not run');
					assert.strictEqual(self.refreshed, 0, 'refresh must not run');
				});
			}
		});
	});
});

// @license-end
