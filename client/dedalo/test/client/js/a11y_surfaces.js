// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global document, window, KeyboardEvent*/

/**
 * A11Y_SURFACES
 * The NAMED set of cataloguing surfaces the accessibility gates judge, built by
 * the client's OWN builders — not by hand-written markup that would drift from
 * what a curator actually sees.
 *
 * ONE module, two consumers:
 *   - `test_a11y_keyboard.js` (browser Mocha suite) drives them with real key
 *     events and asserts operability;
 *   - the axe phase of `scripts/client_test_runner.ts` mounts them and runs
 *     axe-core over each, judged against the shrink-only budget in
 *     engineering/client_a11y_budget.json.
 *
 * WHY NOT DRIVE THE SPA. Opening the real application and navigating to a record
 * would make the gate depend on which record the suite database holds — the
 * generic-`test`-TLD law exists for exactly that reason. These surfaces are
 * built from repo-owned inputs, so they are the same on every machine.
 */

import { a11y } from '../../../core/common/js/a11y.js';
import { get_instance } from '../../../core/common/js/instances.js';
import { ui } from '../../../core/common/js/ui.js';
import '../../../core/common/js/dd-modal.js';

/**
 * MOUNT_HOST
 * A clean container for one surface.
 * @param {string} name
 * @return {HTMLElement}
 */
const mount_host = function (name) {
	const previous = document.getElementById('a11y_surface_' + name);
	if (previous) previous.remove();
	return ui.create_dom_element({
		element_type: 'div',
		id: 'a11y_surface_' + name,
		class_name: 'a11y_surface',
		dataset: { a11ySurface: name },
		parent: document.body,
	});
}; //end mount_host

/**
 * BUILD_COMPONENT_EDIT
 * A component wrapper in edit mode, through the ONE chokepoint every record edit
 * form goes through (ui.component.build_wrapper_edit) — the CLI-10 surface. The
 * input is appended AFTER the wrapper is built, which is the asynchronous shape
 * the real components have.
 * @return {HTMLElement}
 */
export const build_component_edit = function () {
	const host = mount_host('component_edit');

	const instance = {
		model: 'component_input_text',
		type: 'component',
		tipo: 'test1',
		section_tipo: 'test2',
		mode: 'edit',
		label: 'Title of the object',
		show_interface: { label: true },
		permissions: 2,
		context: { css: null, properties: {} },
		active: false,
		filter: null,
		paginator: null,
	};

	const content_data = ui.component.build_content_data(instance);
	const wrapper = ui.component.build_wrapper_edit(instance, { content_data: content_data });
	host.appendChild(wrapper);

	// the control arrives after the wrapper is in the document, exactly as a real
	// component's data does — the naming must survive that.
	const input = ui.create_dom_element({
		element_type: 'input',
		type: 'text',
		class_name: 'input_text',
		parent: content_data,
	});

	return { host, wrapper, input };
}; //end build_component_edit

/**
 * COMPONENT_INSTANCE
 * The minimum instance shape ui.component.build_wrapper_edit reads. Repo-owned,
 * generic-`test`-TLD tipos only.
 * @param {Object} options - {model, tipo, label}
 * @return {Object}
 */
const component_instance = function (options) {
	return {
		model: options.model,
		type: 'component',
		tipo: options.tipo,
		section_tipo: 'test2',
		mode: 'edit',
		label: options.label,
		show_interface: { label: true },
		permissions: 2,
		context: { css: null, properties: {} },
		active: false,
		filter: null,
		paginator: null,
	};
}; //end component_instance

/**
 * BUILD_COMPONENT_GROUP_NESTED
 * NESTED component groups — the portal row, which is the relational core of the
 * record-edit surface and the shape the flat `component_edit` surface could not
 * see.
 *
 * WHY IT EXISTS. `build_wrapper_edit` names the group BEFORE the content is
 * committed (`a11y.label_group(wrapper, component_label)` runs while the wrapper
 * is still empty), and the whole subtree then arrives in ONE append. A naming
 * pass that reads the group label once, for the container it was called on, gives
 * every control in that subtree the OUTERMOST label: each column of a portal row
 * announced the PORTAL's name, and adjacent fields became programmatically
 * indistinguishable (WCAG 1.3.1 / 3.3.2 / 4.1.2 — the clauses CLI-10 cites).
 *
 * The surface reproduces the shipped order exactly: both columns are built and
 * filled off-document, the portal wrapper is committed ONCE, and the second
 * column's control arrives AFTER the commit — the asynchronous half a real
 * column has. Both paths must end with each input named by ITS OWN label.
 *
 * @return {Object}
 */
export const build_component_group_nested = function () {
	const host = mount_host('component_group_nested');

	// two sibling column components, each with its own label node and its own group
	const title = component_instance({
		model: 'component_input_text',
		tipo: 'test3',
		label: 'Title',
	});
	const date = component_instance({ model: 'component_date', tipo: 'test4', label: 'Date' });

	const title_content = ui.component.build_content_data(title);
	const title_wrapper = ui.component.build_wrapper_edit(title, { content_data: title_content });
	const date_content = ui.component.build_content_data(date);
	const date_wrapper = ui.component.build_wrapper_edit(date, { content_data: date_content });

	const row = ui.create_dom_element({
		element_type: 'div',
		class_name: 'section_record',
	});
	row.appendChild(title_wrapper);
	row.appendChild(date_wrapper);

	const list_body = ui.create_dom_element({
		element_type: 'div',
		class_name: 'list_body',
	});
	list_body.appendChild(row);

	// the portal component that CONTAINS them — a labelled group of its own
	const portal = component_instance({
		model: 'component_portal',
		tipo: 'test5',
		label: 'Authors (portal)',
	});
	const portal_wrapper = ui.component.build_wrapper_edit(portal, { list_body: list_body });

	// the first column's control exists before the commit …
	const title_input = ui.create_dom_element({
		element_type: 'input',
		type: 'text',
		class_name: 'input_text',
		parent: title_content,
	});

	// … ONE append commits the whole subtree, exactly as the record edit does
	host.appendChild(portal_wrapper);

	// … and the second column's control arrives afterwards, the way a column that
	// resolves its own request later does.
	const date_input = ui.create_dom_element({
		element_type: 'input',
		type: 'text',
		class_name: 'input_text',
		parent: date_content,
	});

	return {
		host: host,
		portal_wrapper: portal_wrapper,
		portal_label: portal_wrapper.querySelector(':scope > .label'),
		title_wrapper: title_wrapper,
		date_wrapper: date_wrapper,
		title_label: title_wrapper.querySelector(':scope > .label'),
		date_label: date_wrapper.querySelector(':scope > .label'),
		title_input: title_input,
		date_input: date_input,
	};
}; //end build_component_group_nested

/**
 * BUILD_COMPONENT_LINE_ROW
 * THE SHIPPED PORTAL ROW — the columns as the application really builds them.
 *
 * WHY IT IS A SEPARATE SURFACE FROM `component_group_nested`. That one builds its
 * columns with a label NODE, which no shipped column has: all 14
 * `view_line_edit_*` (the view a portal row and a section_record line default to)
 * call `build_wrapper_edit` with `label : null`, because the column heading is
 * drawn once by the list header, never per cell. With no label node there was no
 * group, so the nearest labelled ancestor of a column input was the PORTAL and
 * every field in the row announced the portal's name — and a line column outside
 * a portal had no name at all. Judging only the label-node shape is judging a DOM
 * the application never renders, which is how the first pass of this row passed.
 *
 * Same two commit orders as the nested surface: one control present before the
 * single append, one arriving after it.
 *
 * @return {Object}
 */
export const build_component_line_row = function () {
	const host = mount_host('component_line_row');

	// two columns in the SHIPPED line view: label suppressed, no label node
	const title = component_instance({
		model: 'component_input_text',
		tipo: 'test6',
		label: 'Title',
	});
	const date = component_instance({ model: 'component_date', tipo: 'test7', label: 'Date' });

	const title_content = ui.component.build_content_data(title);
	const title_wrapper = ui.component.build_wrapper_edit(title, {
		content_data: title_content,
		label: null,
	});
	const date_content = ui.component.build_content_data(date);
	const date_wrapper = ui.component.build_wrapper_edit(date, {
		content_data: date_content,
		label: null,
	});

	const row = ui.create_dom_element({
		element_type: 'div',
		class_name: 'section_record',
	});
	row.appendChild(title_wrapper);
	row.appendChild(date_wrapper);

	const list_body = ui.create_dom_element({
		element_type: 'div',
		class_name: 'list_body',
	});
	list_body.appendChild(row);

	// the portal that CONTAINS them — the ancestor that used to steal their names
	const portal = component_instance({
		model: 'component_portal',
		tipo: 'test8',
		label: 'Authors (portal)',
	});
	const portal_wrapper = ui.component.build_wrapper_edit(portal, { list_body: list_body });

	const title_input = ui.create_dom_element({
		element_type: 'input',
		type: 'text',
		class_name: 'input_text',
		parent: title_content,
	});

	host.appendChild(portal_wrapper);

	const date_input = ui.create_dom_element({
		element_type: 'input',
		type: 'text',
		class_name: 'input_text',
		parent: date_content,
	});

	// a line column OUTSIDE any portal: the second half of the same defect
	const lone = component_instance({
		model: 'component_input_text',
		tipo: 'test9',
		label: 'Inventory number',
	});
	const lone_content = ui.component.build_content_data(lone);
	const lone_wrapper = ui.component.build_wrapper_edit(lone, {
		content_data: lone_content,
		label: null,
	});
	host.appendChild(lone_wrapper);
	const lone_input = ui.create_dom_element({
		element_type: 'input',
		type: 'text',
		class_name: 'input_text',
		parent: lone_content,
	});

	return {
		host: host,
		portal_wrapper: portal_wrapper,
		portal_label: portal_wrapper.querySelector(':scope > .label'),
		title_wrapper: title_wrapper,
		date_wrapper: date_wrapper,
		title_input: title_input,
		date_input: date_input,
		lone_input: lone_input,
	};
}; //end build_component_line_row

/**
 * BUILD_LOGIN_FORM
 * THE REAL LOGIN FORM, built by the login instance's own render — the first
 * surface every curator meets, and the one CLI-10 names in the same breath as the
 * record edit: its fields were labelled only by a `placeholder`, which vanishes on
 * the first keystroke and is not a name.
 *
 * It is built through `get_instance`/`build`/`render` (the construction
 * `render_relogin` uses), not from hand-written markup, so what the gate judges is
 * what a curator is served. The ontology behind it is the core `dd` login section
 * (dd229 / dd255 / dd256) that every install has — no install-specific TLD.
 *
 * @return {Promise<Object>}
 */
export const build_login_form = async function () {
	const host = mount_host('login_form');

	const login_instance = await get_instance({
		model: 'login',
		tipo: 'dd229',
		mode: 'edit',
		add_select_lang: false,
	});
	await login_instance.build(true);
	const login_node = await login_instance.render();
	host.appendChild(login_node);

	return {
		host: host,
		login_instance: login_instance,
		login_node: login_node,
		user_input: login_node.querySelector('#username'),
		auth_input: login_node.querySelector('#auth'),
	};
}; //end build_login_form

/**
 * BUILD_TOOLBAR
 * A row of icon-only controls built through ui.build_button — the accessible-name
 * surface (an icon lives in a ::before, invisible to the accessibility tree).
 * @return {HTMLElement}
 */
export const build_toolbar = function () {
	const host = mount_host('toolbar');

	const buttons = [
		ui.build_button({ icon: 'new', title_label: 'New record', parent: host, on_click: () => {} }),
		ui.build_button({
			icon: 'delete',
			title_label: 'Delete record',
			parent: host,
			on_click: () => {},
		}),
		ui.build_button({
			label: 'Search',
			class_name: 'warning search',
			parent: host,
			on_click: () => {},
		}),
	];

	return { host, buttons };
}; //end build_toolbar

/**
 * BUILD_TREE_ROW
 * The thesaurus row's controls, built the way render_ts_line builds them: an
 * icon-only expand arrow and a term, made operable through the shared helper.
 * This is the CLI-11 surface in miniature — the same helper, the same events.
 * @return {Object}
 */
export const build_tree_row = function () {
	const host = mount_host('tree_row');

	const row = ui.create_dom_element({
		element_type: 'div',
		class_name: 'wrap_ts_object',
		parent: host,
	});
	const state = { expanded: false, activations: 0 };

	const arrow = ui.create_dom_element({
		element_type: 'div',
		class_name: 'link_children unselectable',
		parent: row,
	});
	a11y.make_activable(arrow, {
		pointer_event: 'mousedown',
		label: 'Children',
		expanded: false,
		on_activate: () => {
			state.expanded = !state.expanded;
			a11y.set_expanded(arrow, state.expanded);
		},
	});

	const term = ui.create_dom_element({
		element_type: 'span',
		class_name: 'term_text unselectable',
		text_content: 'Amphora',
		parent: row,
	});
	a11y.make_activable(term, {
		on_activate: () => {
			state.activations++;
		},
	});

	return { host, row, arrow, term, state };
}; //end build_tree_row

/**
 * BUILD_MODAL
 * An OPEN dd-modal built THE WAY THE APPLICATION BUILDS ONE — the CLI-22 surface.
 *
 * (!) THROUGH `ui.attach_to_modal`, DELIBERATELY. The first version of this
 * surface created the `<dd-modal>` by hand, slotted the header, body and footer
 * into it and appended it LAST — the exact inverse of the only construction order
 * this client has, where the element is appended first (its `connectedCallback`
 * runs there, with no slotted content yet) and the content arrives after. A gate
 * built in an order no caller uses proves nothing about the caller: the dialog was
 * green here and permanently named "Dialog" in the application.
 *
 * The surface also mirrors the application's DOM DEPTH: `attach_to_modal` appends
 * into `.wrapper.page`, which is itself nested — a modal is never a child of
 * `document.body`. The background control at the shell level is what makes the
 * isolation testable: if the dialog only inerts `document.body.children`, that
 * button stays live and reachable behind the dialog.
 *
 * @param {Object} [options]
 *   {string} [name='modal']        - mount host suffix, so two dialog surfaces coexist
 *   {boolean} [remove_overlay=false] - build the NON-BLOCKING panel shape instead
 *   {boolean} [minimized=false]    - park the dialog in the strip, through its own
 *                                    keyboard path, before handing it back
 * @return {Object}
 */
export const build_modal = function (options = {}) {
	const name = options.name || 'modal';
	const remove_overlay = options.remove_overlay === true;
	const minimized = options.minimized === true;

	const host = mount_host(name);

	const shell = ui.create_dom_element({
		element_type: 'div',
		class_name: 'main_shell',
		parent: host,
	});
	// the record surface behind the dialog
	const background_button = ui.create_dom_element({
		element_type: 'button',
		text_content: 'Background record',
		parent: shell,
	});
	const page_wrapper = ui.create_dom_element({
		element_type: 'div',
		class_name: 'wrapper page',
		parent: shell,
	});

	// TWO content controls, in the shape a real confirmation has (Cancel / accept):
	// one Tab stop is not enough to tell a working trap from one that hijacks every
	// Tab, because with a single candidate both behaviours look identical.
	const footer = ui.create_dom_element({
		element_type: 'div',
		class_name: 'footer content',
	});
	const cancel_button = ui.create_dom_element({
		element_type: 'button',
		text_content: 'Cancel',
		parent: footer,
	});
	const confirm_button = ui.create_dom_element({
		element_type: 'button',
		text_content: 'Delete',
		parent: footer,
	});

	const modal = ui.attach_to_modal({
		modal_parent: page_wrapper,
		header: remove_overlay ? 'Find and replace' : 'Delete record',
		body: 'This action cannot be undone.',
		footer: footer,
		size: 'small',
		remove_overlay: remove_overlay,
		transient: true,
	});

	// Park it THROUGH ITS OWN KEYBOARD PATH (Enter on the '_' chrome control), not
	// by poking `mini` or calling a private method: what is under test is what the
	// user's keystroke does, and a surface that sets the flag by hand would stay
	// green with the minimize handler entirely disconnected.
	if (minimized) {
		const mini_control = modal.shadowRoot.querySelector('.mini_modal');
		mini_control.dispatchEvent(
			new KeyboardEvent('keydown', {
				key: 'Enter',
				bubbles: true,
				composed: true,
				cancelable: true,
			}),
		);
	}

	return { host, shell, page_wrapper, modal, background_button, cancel_button, confirm_button };
}; //end build_modal

/**
 * BUILD_MODAL_MINIMIZED
 * The SAME dialog, parked in the minimized strip — the state the audit's reviewer
 * found broken: minimize shrinks the overlay to a 15rem corner strip precisely so
 * the record surface behind stays usable, and an isolation released only on close
 * left the whole application inert, unclickable and out of the accessibility tree
 * behind a parked dialog.
 * @return {Object}
 */
export const build_modal_minimized = function () {
	return build_modal({ name: 'modal_minimized', minimized: true });
}; //end build_modal_minimized

/**
 * BUILD_MODAL_NON_BLOCKING
 * A `remove_overlay:true` dialog — the shape `render_text_editor`'s find-and-replace
 * and `tool_diffusion`'s panel use, documented as letting the user keep working on
 * the surface behind them. It is a dialog, and it is named, but it is NOT modal:
 * announcing aria-modal, inerting the editor behind it or trapping Tab inside it
 * would each contradict what the caller asked for.
 * @return {Object}
 */
export const build_modal_non_blocking = function () {
	return build_modal({ name: 'modal_non_blocking', remove_overlay: true });
}; //end build_modal_non_blocking

/**
 * SURFACE_BUILDERS
 * The named set. The axe phase iterates it; adding a surface here adds it to the
 * gate — which is the point of naming them in one place.
 */
export const SURFACE_BUILDERS = {
	component_edit: build_component_edit,
	component_group_nested: build_component_group_nested,
	component_line_row: build_component_line_row,
	login_form: build_login_form,
	toolbar: build_toolbar,
	tree_row: build_tree_row,
	modal: build_modal,
	modal_minimized: build_modal_minimized,
	modal_non_blocking: build_modal_non_blocking,
};

/**
 * BUILD_ALL_SURFACES
 * Mount every named surface into the document and return their names.
 * A builder may be async (the login form asks the server for its own context),
 * so every one of them is awaited — a surface half-built when axe reads it would
 * be a green run over an empty host.
 * @return {Promise<string[]>}
 */
export const build_all_surfaces = async function () {
	const built = [];
	for (const name of Object.keys(SURFACE_BUILDERS)) {
		await SURFACE_BUILDERS[name]();
		built.push(name);
	}
	return built;
}; //end build_all_surfaces

// Expose for the axe phase, which drives this module from puppeteer.
window.dd_a11y_surfaces = {
	SURFACE_BUILDERS: SURFACE_BUILDERS,
	build_all_surfaces: build_all_surfaces,
};
