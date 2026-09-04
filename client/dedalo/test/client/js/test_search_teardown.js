// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global it, describe, assert */
/*eslint no-undef: "error"*/

import { event_manager } from '../../../core/common/js/event_manager.js';
import {
	get_all_instances,
	get_instance,
	get_instance_by_id,
} from '../../../core/common/js/instances.js';
import { search } from '../../../core/search/js/search.js';
import { lang, section_id, section_tipo } from './elements.js';

/**
 * TEST_SEARCH_TEARDOWN
 * Removing a search filter node tears down every instance in its subtree
 * (P2-2 / CLI-19).
 *
 * The filter panel's GROUP close button removed the model node and the DOM node
 * and nothing else, while the ROW close button also spliced and destroyed. So a
 * removed group left every component instance inside it in the global registry
 * with its subscriptions alive, and `search.reset` then refreshed the orphans.
 *
 * `remove_model_node` is now THE teardown door: it walks the removed subtree,
 * splices each bound instance from `ar_instances` and destroys it. This suite
 * BUILDS the situation on the generic `test` TLD (real component instances on
 * the test3 playground, each holding a live subscription) and measures the
 * registry and the event table before and after — the audit's own repro.
 *
 * And `reset()` must REJECT, never hang, when an instance's refresh throws:
 * the old `new Promise(async …)` executor swallowed the throw and left
 * Promise.all waiting forever.
 */

describe('SEARCH_TEARDOWN', function () {
	this.timeout(30000);

	// make_search — a bare search controller with the model machinery only
	// (no caller, no DOM): the door under test needs `ar_instances` and the
	// node counter, nothing from init()
	const make_search = () => {
		const self = new search();
		self.id = `search_teardown_${Date.now()}`;
		self.ar_instances = [];
		self.model_node_counter = 0;
		self.events_tokens = [];
		return self;
	};

	// make_component — a REAL registered instance with one live subscription
	const make_component = async (suffix) => {
		const instance = await get_instance({
			model: 'component_input_text',
			tipo: 'test52',
			section_tipo: section_tipo,
			section_id: section_id,
			mode: 'search',
			lang: lang,
			id_variant: `search_teardown_${suffix}_${Date.now()}`,
		});
		// the kind of subscription a rendered filter row holds
		instance.events_tokens.push(event_manager.subscribe(`render_${instance.id}`, () => {}));
		return instance;
	};

	describe('remove_model_node tears down the whole subtree', () => {
		it('a group with two rows: instances and events return to baseline', async () => {
			const baseline_instances = get_all_instances().length;
			const baseline_events = event_manager.get_events().length;

			const self = make_search();
			const root = self.create_group_model_node('$and', null, null);
			const group = self.create_group_model_node('$or', root, null);

			const a = await make_component('a');
			const b = await make_component('b');
			self.ar_instances.push(a, b);
			self.create_component_model_node({ instance: a, parent_node: group });
			self.create_component_model_node({ instance: b, parent_node: group });

			// the situation is built: two more instances, two more events
			assert.equal(
				get_all_instances().length,
				baseline_instances + 2,
				'precondition: both registered',
			);
			// each instance subscribes its own init events plus the one added above
			assert.isAtLeast(
				event_manager.get_events().length,
				baseline_events + 2,
				'precondition: both subscribed',
			);
			assert.equal(self.ar_instances.length, 2);

			try {
				// the group close button's model call
				const removed = self.remove_model_node(group);
				assert.equal(removed, true);
				assert.equal(root.children.length, 0, 'the group left the model');

				// destroy is async inside the walk: let it settle
				await new Promise((resolve) => setTimeout(resolve, 50));

				assert.equal(self.ar_instances.length, 0, 'ar_instances no longer lists the orphans');
				assert.equal(get_instance_by_id(a.id), null, 'row a left the registry');
				assert.equal(get_instance_by_id(b.id), null, 'row b left the registry');
				assert.equal(get_all_instances().length, baseline_instances, 'registry back to baseline');
				assert.equal(
					event_manager.get_events().length,
					baseline_events,
					'event table back to baseline',
				);
			} finally {
				// safety net: never leave orphans for the next suite
				for (const instance of [a, b]) {
					if (get_instance_by_id(instance.id)) {
						await instance.destroy(true, true, true);
					}
				}
			}
		});

		it('a nested group is walked too', async () => {
			const baseline_instances = get_all_instances().length;

			const self = make_search();
			const root = self.create_group_model_node('$and', null, null);
			const outer = self.create_group_model_node('$or', root, null);
			const inner = self.create_group_model_node('$and', outer, null);

			const deep = await make_component('deep');
			self.ar_instances.push(deep);
			self.create_component_model_node({ instance: deep, parent_node: inner });

			try {
				self.remove_model_node(outer);
				await new Promise((resolve) => setTimeout(resolve, 50));
				assert.equal(
					get_instance_by_id(deep.id),
					null,
					'the instance two levels down was destroyed',
				);
				assert.equal(get_all_instances().length, baseline_instances);
				assert.equal(self.ar_instances.length, 0);
			} finally {
				if (get_instance_by_id(deep.id)) {
					await deep.destroy(true, true, true);
				}
			}
		});

		it('the row close path is idempotent: a second splice/destroy finds nothing', async () => {
			const self = make_search();
			const root = self.create_group_model_node('$and', null, null);
			const row = await make_component('row');
			self.ar_instances.push(row);
			const node = self.create_component_model_node({ instance: row, parent_node: root });

			try {
				self.remove_model_node(node);
				await new Promise((resolve) => setTimeout(resolve, 30));
				// what render_search's row handler does next
				const index = self.ar_instances.findIndex((instance) => instance.id === row.id);
				assert.equal(index, -1, 'the door already spliced it');
				assert.equal(get_instance_by_id(row.id), null);
				// a second destroy on the same instance is the base class's no-op
				const again = await row.destroy(true);
				assert.deepEqual(again, {}, 'double-destroy protection');
			} finally {
				if (get_instance_by_id(row.id)) {
					await row.destroy(true, true, true);
				}
			}
		});

		it('a detached node (no parent) is refused without touching anything', async () => {
			const self = make_search();
			const lone = await make_component('lone');
			self.ar_instances.push(lone);
			const node = self.create_component_model_node({ instance: lone, parent_node: null });
			try {
				assert.equal(self.remove_model_node(node), false);
				assert.notEqual(get_instance_by_id(lone.id), null, 'nothing destroyed');
				assert.equal(self.ar_instances.length, 1);
			} finally {
				await lone.destroy(true, true, true);
			}
		});
	}); //end describe remove_model_node

	describe('reset never hangs', () => {
		it('a throwing refresh REJECTS reset (no async Promise executor)', async () => {
			const self = make_search();
			// a fake filter row whose refresh throws
			self.ar_instances.push({
				id: 'throwing_row',
				data: { entries: ['x'] },
				refresh: async () => {
					throw new Error('refresh exploded');
				},
			});

			const outcome = await Promise.race([
				self.reset().then(
					() => 'resolved',
					(error) => `rejected:${error.message}`,
				),
				new Promise((resolve) => setTimeout(() => resolve('hung'), 2000)),
			]);
			assert.equal(
				outcome,
				'rejected:refresh exploded',
				'the throw must surface as a rejection, not a hang',
			);
		});
	}); //end describe reset
}); //end describe SEARCH_TEARDOWN
