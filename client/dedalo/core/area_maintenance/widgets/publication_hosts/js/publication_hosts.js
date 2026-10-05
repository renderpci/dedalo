// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global SHOW_DEBUG */
/*eslint no-undef: "error"*/

/**
 * PUBLICATION_HOSTS (module)
 * Area-maintenance widget for the separate publication machines this
 * installation controls (engineering/PUBLICATION_HOST_SPEC.md, phase 3).
 *
 * Data flow
 * ---------
 *   init() → build() → get_value() [area_maintenance.prototype.get_value]
 *     → server: src/core/area_maintenance/widgets/publication_hosts.ts getValue
 *     → { registry:{state, reason}, registry_path, engine_qualities, is_root,
 *         hosts:[HostPanelRow…] | null }
 *   Actions → widget_request(action, options)
 *     → dd_area_maintenance_api::widget_request → publication_hosts apiActions
 *     (apply_rules | probe | rollback_api | set_host_fields | remove_host),
 *     ALL root-only on the server; the server dials the agent through its one
 *     door (src/core/publication_host/transport.ts), never the browser.
 *
 * Hosts are ADDED only on the command line (scripts/publication_host_pair.ts):
 * an address typed into a web form is an SSRF and credential surface, so this
 * panel can edit a host's public fields and remove it, never create one.
 *
 * Prototype chain: publication_hosts ← widget_common (lifecycle)
 *                  ← area_maintenance (get_value) ← render_publication_hosts (view)
 */

import { area_maintenance } from '../../../../area_maintenance/js/area_maintenance.js';
// imports
import { data_manager } from '../../../../common/js/data_manager.js';
import { dd_request_idle_callback } from '../../../../common/js/events.js';
import { widget_common } from '../../../../widgets/widget_common/js/widget_common.js';
import { render_publication_hosts } from './render_publication_hosts.js';

/**
 * PUBLICATION_HOST_ACTIONS
 * The widget's closed action set: the server's apiActions, by name. A name
 * outside it is a programming error here, not a request.
 */
export const PUBLICATION_HOST_ACTIONS = Object.freeze([
	'apply_rules',
	'probe',
	'rollback_api',
	'set_host_fields',
	'remove_host',
]);

/**
 * PUBLICATION_HOSTS
 * Constructor for the widget instance.
 */
export const publication_hosts = function () {
	this.id;

	this.section_tipo;
	this.section_id;
	this.lang;
	this.mode;

	this.value;

	this.node;

	this.events_tokens = [];
	this.ar_instances = [];

	this.status;

	// the last action outcome (text), repainted into the new body_response
	// after a reload — a refresh rebuilds content_data from scratch
	this.last_outcome = null;
	// the ApiError of the last failed value read (get_value), or null
	this.read_error = null;
}; //end publication_hosts

// prototypes assign
// lifecycle
publication_hosts.prototype.init = widget_common.prototype.init;
publication_hosts.prototype.build = widget_common.prototype.build;
publication_hosts.prototype.render = widget_common.prototype.render;
publication_hosts.prototype.refresh = widget_common.prototype.refresh;
publication_hosts.prototype.destroy = widget_common.prototype.destroy;
publication_hosts.prototype.get_value = area_maintenance.prototype.get_value;
// render (one view for both modes)
publication_hosts.prototype.edit = render_publication_hosts.prototype.list;
publication_hosts.prototype.list = render_publication_hosts.prototype.list;

/**
 * WIDGET_REQUEST
 * Sends one widget action. ONE try: every action except probe changes the
 * publication host or the registry, so a blind resend is never safe.
 * @param {string} action - one of PUBLICATION_HOST_ACTIONS
 * @param {Object} options - action options ({name, …})
 * @returns {Promise<Object>} api_response (envelope v2)
 */
publication_hosts.prototype.widget_request = async function (action, options) {
	if (!PUBLICATION_HOST_ACTIONS.includes(action)) {
		throw new Error(`publication_hosts: unknown action '${action}'`);
	}

	const api_response = await data_manager.request({
		use_worker: true,
		body: {
			dd_api: 'dd_area_maintenance_api',
			action: 'widget_request',
			prevent_lock: true,
			source: {
				type: 'widget',
				model: 'publication_hosts',
				action: action,
			},
			options: options,
		},
		retries: 1, // one try only
		timeout: 120 * 1000, // the agent's own deadlines are shorter; covers a web-server reload
	});
	if (SHOW_DEBUG === true) {
		console.log(`publication_hosts ${action} api_response:`, api_response);
	}

	return api_response;
}; //end widget_request

/**
 * CONFIRM_ACTION
 * The operator's yes/no before an agent-changing action. A method (not an
 * inline confirm()) so the browser suite answers it without a native dialog.
 * @param {string} message
 * @returns {boolean}
 */
publication_hosts.prototype.confirm_action = function (message) {
	return window.confirm(message);
}; //end confirm_action

/**
 * RELOAD
 * Re-reads the widget value and repaints the body (after a successful action,
 * or the busy note's retry). A read that throws is kept as `read_error`, so the
 * view says so instead of repainting the previous value as if it were fresh.
 * @returns {Promise<void>}
 */
publication_hosts.prototype.reload = async function () {
	const self = this;

	try {
		self.value = await self.get_value();
	} catch (error) {
		console.error(error);
		self.read_error = error;
	}
	dd_request_idle_callback(() => {
		self.refresh({
			build_autoload: false, // value is already updated
			destroy: true,
		});
	});
}; //end reload

// @license-end
