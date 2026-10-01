// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label */
/*eslint no-undef: "error"*/

/**
 * REQUEST_ACTIVITY_INDICATOR
 * The ONE slow-server cue of the page: paints data_manager's `request_activity`
 * state (see common/js/request_activity.js for the model).
 *
 *   idle      → nothing in the DOM is visible
 *   slow      → a thin indeterminate bar along the top edge, no text
 *   very_slow → the bar plus ONE sentence (role=status, announced politely)
 *
 * It is a state, never a bubble: it does not stack, it does not linger after the
 * last request settles, and it does not compete with save/error bubbles in
 * .bubbles_notification_container. Failures still arrive there, as toasts.
 *
 * Document-level and idempotent: the page wrapper is rebuilt on every area
 * change, and the cue must survive that (a read in flight across navigation is
 * exactly when it matters).
 */

// imports
import { request_activity } from '../../common/js/data_manager.js';
import { event_manager } from '../../common/js/event_manager.js';

const NODE_ID = 'request_activity';

/**
 * MOUNT_REQUEST_ACTIVITY_INDICATOR
 * @return {HTMLElement} the indicator node
 */
export const mount_request_activity_indicator = () => {
	const existing = document.getElementById(NODE_ID);
	if (existing) {
		return existing;
	}

	const node = document.createElement('div');
	node.id = NODE_ID;
	node.className = 'request_activity idle';

	const bar = document.createElement('div');
	bar.className = 'request_activity_bar';
	node.appendChild(bar);

	const text = document.createElement('div');
	text.className = 'request_activity_text';
	text.setAttribute('role', 'status');
	text.setAttribute('aria-live', 'polite');
	node.appendChild(text);

	document.body.appendChild(node);

	const paint = (level) => {
		node.classList.remove('idle', 'slow', 'very_slow');
		node.classList.add(level);
		// the text exists only at very_slow, so the live region announces once
		text.textContent =
			level === 'very_slow'
				? (typeof get_label !== 'undefined' && get_label.server_slow_response) ||
					'The server is taking longer than usual…'
				: '';
	};

	paint(request_activity.level());
	event_manager.subscribe('request_activity', (state) => paint(state.level));

	return node;
}; //end mount_request_activity_indicator

// @license-end
