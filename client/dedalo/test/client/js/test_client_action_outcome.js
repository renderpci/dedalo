// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global it, describe, assert, before, after */
/*eslint no-undef: "error"*/

import { ApiError, is_api_error } from '../../../core/common/js/api_error.js';
import { event_manager } from '../../../core/common/js/event_manager.js';
import { ui } from '../../../core/common/js/ui.js';
import { commit_selection } from '../../../core/services/service_autocomplete/js/view_default_autocomplete.js';

/**
 * TEST_CLIENT_ACTION_OUTCOME
 * A client action READS its own outcome (P2-2 / CLI-16, CLI-17, CLI-18).
 *
 * Three surfaces that once played the visual grammar of success (or of nothing)
 * without waiting for the answer:
 *
 *  - ui.load_item_with_spinner: a THROWING loader used to leave the container
 *    it had already emptied EMPTY, console-only. It must now hold the engine's
 *    own error panel (`.api_error_panel`) where the node would have gone.
 *  - attach_to_modal size 'big': the scroll-offset restore was a GLOBAL one-shot
 *    'modal_close' subscription; a nested confirm's Cancel consumed it and
 *    scrolled the page back under the still-open big modal. It must fire only
 *    when the BIG modal itself closes.
 *  - service_autocomplete's default pick: `link_record` was fired and forgotten.
 *    A refusal from the caller's `link_records` door must reach the cataloguer.
 *
 * Backend-free: a synthetic loader, a stubbed window.scrollTo, and a fake caller
 * whose link_records answers a refusal.
 */

describe('CLIENT_ACTION_OUTCOME', function () {
	this.timeout(20000);

	describe("a throwing loader renders the engine's failure surface (CLI-17)", () => {
		it('leaves the error panel in the container, never an empty node', async () => {
			const container = ui.create_dom_element({
				element_type: 'div',
				class_name: 'test_spinner_container',
				parent: document.body,
			});
			container.appendChild(document.createTextNode('previous content'));

			const boom = new Error('loader exploded');
			// console noise is expected here (the helper logs the throw): silence it for the run
			const real_console_error = console.error;
			console.error = () => {};
			let returned;
			try {
				returned = await ui.load_item_with_spinner({
					container: container,
					label: 'test',
					callback: async () => {
						throw boom;
					},
				});
			} finally {
				console.error = real_console_error;
			}

			try {
				const panel = container.querySelector('.api_error_panel');
				assert.notEqual(panel, null, 'the container must hold the engine error panel');
				assert.equal(returned, panel, 'the helper returns the node it placed');
				assert.equal(
					panel.dataset.code,
					'client.render_failed',
					'a plain throw is minted as client.render_failed',
				);
				assert.notEqual(container.textContent.trim(), '', 'the container is not empty');
				assert.equal(
					container.textContent.includes('previous content'),
					false,
					'the old content was replaced, not preserved',
				);
				assert.equal(
					container.querySelector('.container_placeholder'),
					null,
					'the spinner placeholder is gone',
				);
			} finally {
				container.remove();
			}
		});

		it("keeps an ApiError's own code (the panel's affordance depends on it)", async () => {
			const container = ui.create_dom_element({
				element_type: 'div',
				parent: document.body,
			});
			const real_console_error = console.error;
			console.error = () => {};
			try {
				await ui.load_item_with_spinner({
					container: container,
					callback: async () => {
						throw new ApiError({ code: 'auth.not_logged' });
					},
				});
				const panel = container.querySelector('.api_error_panel');
				assert.notEqual(panel, null);
				assert.equal(panel.dataset.code, 'auth.not_logged');
				assert.equal(
					panel.classList.contains('not_logged_error'),
					true,
					'an auth.* code keeps the reload affordance',
				);
			} finally {
				console.error = real_console_error;
				container.remove();
			}
		});

		it("replace_container: the panel takes the CONTAINER's place", async () => {
			const parent = ui.create_dom_element({
				element_type: 'div',
				parent: document.body,
			});
			const container = ui.create_dom_element({
				element_type: 'div',
				class_name: 'to_be_replaced',
				parent: parent,
			});
			const real_console_error = console.error;
			console.error = () => {};
			try {
				await ui.load_item_with_spinner({
					container: container,
					replace_container: true,
					callback: async () => {
						throw new Error('x');
					},
				});
				assert.equal(
					parent.querySelector('.to_be_replaced'),
					null,
					'the container itself was replaced',
				);
				assert.notEqual(parent.querySelector('.api_error_panel'), null, 'by the error panel');
			} finally {
				console.error = real_console_error;
				parent.remove();
			}
		});
	}); //end describe CLI-17

	describe("the big modal's scroll restore is keyed to ITS OWN close (CLI-18)", () => {
		let real_scroll_to;
		const calls = [];

		before(() => {
			real_scroll_to = window.scrollTo;
			window.scrollTo = (arg) => {
				calls.push(arg);
			};
		});
		after(() => {
			window.scrollTo = real_scroll_to;
		});

		it("a nested confirm's Cancel does not restore the scroll; the big modal's close does", async () => {
			calls.length = 0;

			// the big modal (transient: it hosts no editable data, so close() skips
			// the page-wide unsaved-data guard)
			const big = ui.attach_to_modal({
				header: 'big',
				body: ui.create_dom_element({ element_type: 'div', text_content: 'big body' }),
				size: 'big',
				transient: true,
			});
			assert.equal(big.dataset.size, 'big');

			// a confirm opened from inside it, then cancelled
			const confirmed = ui.confirm({ header: 'nested', body: 'cancel me' });
			// the confirm's footer is light DOM slotted into its own <dd-modal>
			await new Promise((resolve) => requestAnimationFrame(resolve));
			const confirm_modal = document.querySelector('dd-modal.dd_confirm');
			assert.notEqual(confirm_modal, null, 'the confirm dialog opened');
			const button_cancel = confirm_modal.querySelector('button.secondary');
			assert.notEqual(button_cancel, null, 'the confirm has a cancel button');
			button_cancel.click();
			const answer = await confirmed;
			assert.equal(answer, false, 'cancel resolves false');
			// let the confirm's own close sequence finish
			await new Promise((resolve) => setTimeout(resolve, 50));

			assert.equal(
				calls.length,
				0,
				"the nested dialog's close must not restore the page scroll under the still-open big modal",
			);
			assert.equal(big.isConnected, true, 'the big modal is still open');

			// now the big modal itself closes
			await big.close();
			await new Promise((resolve) => setTimeout(resolve, 50));
			assert.equal(calls.length, 1, "the big modal's own close restores the scroll exactly once");
			assert.equal(typeof calls[0].top, 'number');
		});

		it('a normal-size modal restores nothing', async () => {
			calls.length = 0;
			const normal = ui.attach_to_modal({
				header: 'normal',
				body: 'body',
				transient: true,
			});
			await normal.close();
			await new Promise((resolve) => setTimeout(resolve, 30));
			assert.equal(calls.length, 0);
		});
	}); //end describe CLI-18

	describe("the autocomplete pick surfaces the door's refusal (CLI-16)", () => {
		it('a refused link_records reaches the cataloguer with its reason', async () => {
			const locator = { section_tipo: 'test3', section_id: 7, label: 'Seven' };
			const seen = [];
			const fake_caller = {
				link_records: async (values) => {
					seen.push(values);
					return {
						linked: [],
						refused: [{ locator: values[0], reason: 'duplicate — already linked' }],
						total: 3,
					};
				},
			};
			const self = { caller: fake_caller };

			const notifications = [];
			const token = event_manager.subscribe('notification', (payload) =>
				notifications.push(payload),
			);
			try {
				const outcome = await commit_selection(self, locator);
				assert.equal(seen.length, 1, 'the door was called once');
				assert.deepEqual(
					seen[0],
					[locator],
					'with the picked locator as the one-element selection',
				);
				assert.equal(outcome.refused.length, 1, 'the outcome is returned to the handler');
				assert.equal(notifications.length, 1, 'ONE notification for the refusal');
				assert.equal(
					notifications[0].msg.includes('duplicate — already linked'),
					true,
					'carrying the reason',
				);
				assert.equal(notifications[0].msg.includes('test3_7'), true, 'and the locator');
			} finally {
				event_manager.unsubscribe(token);
			}
		});

		it('a landed pick says nothing', async () => {
			const fake_caller = {
				link_records: async (values) => ({ linked: values, refused: [], total: 1 }),
			};
			const notifications = [];
			const token = event_manager.subscribe('notification', (payload) =>
				notifications.push(payload),
			);
			try {
				const outcome = await commit_selection(
					{ caller: fake_caller },
					{ section_tipo: 'test3', section_id: 1 },
				);
				assert.equal(outcome.linked.length, 1);
				assert.equal(notifications.length, 0, 'no toast on success');
			} finally {
				event_manager.unsubscribe(token);
			}
		});

		it('a caller without the door is refused loudly, never dropped', async () => {
			const real_console_error = console.error;
			console.error = () => {};
			try {
				const outcome = await commit_selection(
					{ caller: null },
					{ section_tipo: 'test3', section_id: 1 },
				);
				assert.equal(outcome.linked.length, 0);
				assert.equal(outcome.refused.length, 1);
				assert.equal(outcome.refused[0].reason, 'caller_without_link_records');
			} finally {
				console.error = real_console_error;
			}
		});
	}); //end describe CLI-16

	describe('sanity: the client error model used above', () => {
		it('an ApiError is recognised as one', () => {
			assert.equal(is_api_error(new ApiError({ code: 'client.render_failed' })), true);
		});
	});
}); //end describe CLIENT_ACTION_OUTCOME
