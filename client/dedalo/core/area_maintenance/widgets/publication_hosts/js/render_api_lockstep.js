// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global */
/*eslint no-undef: "error"*/

// imports
import { ui } from '../../../../common/js/ui.js';

/**
 * RENDER_API_LOCKSTEP
 * The publication_hosts widget's Publication API block (publication host phase 4):
 * the engine's last verified release (and when it was checked) against each host's
 * v2/v1 release, the last push, and — for root — the push button. A pure view: the
 * click is handed to `on_push(button)` (render_publication_hosts.js runs it through
 * its one action path, run_action: confirm → spinner → request → outcome → reload).
 *
 * Every server string reaches the DOM through text_content (SEC-XSS): refusals name
 * tree paths, errors are codes, release ids are agent-reported.
 *
 * Server peer: src/core/publication_host/api_reconcile.ts (apiLockstepPanel), served
 * as get_value `api_lockstep` (WC-2026-10-03-publication-hosts-widget, phase-4 addendum).
 */

const STATE_CHIP = Object.freeze({
	ok: 'state_ok',
	mismatch: 'state_warning',
	unknown: 'state_warning',
	failed: 'state_danger',
	// a v2-only site serves no Publication API v1: a plain badge, never a warning or red
	not_served: '',
});
const STATE_TEXT = Object.freeze({
	ok: 'In step',
	mismatch: 'Behind the engine',
	unknown: 'Unknown',
	failed: 'Push failed',
	not_served: 'Not served',
});

/**
 * LAST_PUSH_TEXT
 * @param {Object|null} last_push - {state, release, error, at} or null
 * @returns {string}
 */
const last_push_text = function (last_push) {
	if (!last_push || !last_push.at) {
		return 'Never';
	}
	const error = last_push.error ? ` — ${last_push.error}` : '';
	return `${last_push.state} ${last_push.release || ''} ${last_push.at}${error}`;
}; //end last_push_text

/**
 * ENGINE_TEXT
 * @param {Object} panel - {engine_release, refused, checked_at}
 * @returns {string}
 */
const engine_text = function (panel) {
	if (!panel.checked_at) {
		return 'Engine release: not verified yet (Push API releases verifies the tree first; the hourly publication_apis check also verifies it)';
	}
	const release = panel.engine_release || 'none (this tree has no verified release)';
	return `Engine release: ${release} (checked ${panel.checked_at})`;
}; //end engine_text

/**
 * RENDER_RUNTIME_INVALID
 * The runtime results file could not be read: the panel still renders, with this red note.
 * @param {string} reason - RuntimeStateError reason from get_value.runtime_invalid
 * @returns {HTMLElement}
 */
export const render_runtime_invalid = function (reason) {
	return ui.create_dom_element({
		element_type: 'div',
		class_name: 'dd_note state_danger runtime_invalid',
		text_content: `The publication host results file cannot be read (${reason}). Results are not shown or recorded until it is fixed; deleting it is safe (every result is re-derived).`,
	});
}; //end render_runtime_invalid

/**
 * RENDER_ROWS
 * host · API · engine release · host release · last push · state
 * @param {Array} rows - ApiLockstepRow[]
 * @param {HTMLElement} parent
 */
const render_rows = function (rows, parent) {
	const table = ui.create_dom_element({
		element_type: 'div',
		class_name: 'lockstep_table dd_table',
		parent: parent,
	});
	const header = ui.create_dom_element({
		element_type: 'div',
		class_name: 'dd_tr header',
		parent: table,
	});
	for (const text of ['Host', 'API', 'Engine release', 'Host release', 'Last push', 'State']) {
		ui.create_dom_element({
			element_type: 'div',
			class_name: 'dd_th',
			text_content: text,
			parent: header,
		});
	}
	for (const row of rows) {
		const tr = ui.create_dom_element({
			element_type: 'div',
			class_name: 'dd_tr lockstep_row',
			parent: table,
		});
		const cells = [
			row.host,
			row.api,
			row.engine || '—',
			row.host_current || '—',
			last_push_text(row.last_push),
		];
		for (const text of cells) {
			ui.create_dom_element({
				element_type: 'div',
				class_name: 'dd_td',
				text_content: String(text),
				parent: tr,
			});
		}
		const state_cell = ui.create_dom_element({
			element_type: 'div',
			class_name: 'dd_td',
			parent: tr,
		});
		ui.create_dom_element({
			element_type: 'span',
			class_name: `dd_badge ${STATE_CHIP[row.state] ?? 'state_warning'}`.trim(),
			text_content: STATE_TEXT[row.state] || String(row.state),
			parent: state_cell,
		});
	}
}; //end render_rows

/**
 * RENDER_API_LOCKSTEP
 * @param {Object} panel - {engine_release, refused, checked_at, rows}
 * @param {Object} [options]
 * @param {boolean} [options.is_root] - the push button renders for root only
 * @param {Function} [options.on_push] - (button) => Promise, the click handler
 * @returns {HTMLElement}
 */
export const render_api_lockstep = function (panel, options = {}) {
	const rows = Array.isArray(panel.rows) ? panel.rows : [];

	const wrap = ui.create_dom_element({
		element_type: 'div',
		class_name: 'api_lockstep',
	});
	ui.create_dom_element({
		element_type: 'div',
		class_name: 'dd_eyebrow',
		text_content: 'Publication API releases',
		parent: wrap,
	});
	ui.create_dom_element({
		element_type: 'div',
		class_name: 'dd_note engine_release',
		text_content: engine_text(panel),
		parent: wrap,
	});
	if (panel.refused) {
		const checked = panel.checked_at ? ` (checked ${panel.checked_at})` : '';
		ui.create_dom_element({
			element_type: 'div',
			class_name: 'dd_note state_danger lockstep_refused',
			text_content: `Push refused${checked}: ${panel.refused}. Fix the tree and push again — the push verifies it first.`,
			parent: wrap,
		});
	}
	if (rows.length > 0) {
		render_rows(rows, wrap);
	}

	if (options.is_root === true) {
		const button = ui.create_dom_element({
			element_type: 'button',
			class_name: 'light push_apis',
			text_content: 'Push API releases',
			parent: wrap,
		});
		// Disabled only when there is nothing to push to. A refusal is the LAST round's
		// verdict (it refreshes only on the next round — hourly, or never with the
		// scheduler off): disabling on it would lock root out after fixing the tree.
		// Safe to keep enabled: the push re-verifies the tree before sending anything.
		button.disabled = rows.length === 0;
		button.addEventListener('click', async (e) => {
			e.stopPropagation();
			if (typeof options.on_push === 'function') {
				await options.on_push(button);
			}
		});
	}

	return wrap;
}; //end render_api_lockstep

// @license-end
