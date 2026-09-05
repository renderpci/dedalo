// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global HTMLElement, MutationObserver, document, window*/

/**
 * A11Y
 * The ONE place the client makes a node operable and nameable.
 *
 * WHY IT EXISTS (audit 2026-08-26, CLI-10 / CLI-11 / CLI-22, row P1-18). The
 * cataloguing surface was built out of bare `div`/`span` nodes carrying a single
 * POINTER listener, so:
 *   - nothing in the thesaurus tree was reachable by keyboard at all, and
 *   - a retrofitted `tabindex` would not have helped, because keyboard
 *     activation dispatches `click` and those handlers listen for `mousedown`.
 * Both halves are fixed HERE, once: `make_activable` OWNS the wiring — it
 * attaches the pointer listener AND the Enter/Space listener to the SAME
 * callback, so the two can never drift apart again. That single ownership is
 * what `test/unit/client_keyboard_activation_tripwire.test.ts` scans for: a
 * pointer-activated non-native element that does NOT come through this helper is
 * an offender.
 *
 * The keyboard event is passed to the callback unchanged. A `KeyboardEvent`
 * carries `stopPropagation`, `preventDefault`, `target`, `altKey`, `metaKey` and
 * `shiftKey`, which is every property the existing pointer handlers read — that
 * is why routing both through one callback is a rewire, not a rewrite.
 *
 * NAMING. `label_group` is the label chokepoint's half of CLI-10: the label node
 * gets an id and the wrapper is announced as a named group, and every form
 * control inside it that has no name of its own is pointed at that label. The
 * controls arrive ASYNCHRONOUSLY (a component fills its `content_data` after its
 * own request resolves), so a one-shot pass cannot be the whole answer: ONE
 * document-level MutationObserver (never one per wrapper) names controls added
 * later. One observer for the document is the cheapest correct shape; a
 * per-wrapper observer would be thousands of them on a full record.
 *
 * FOCUS + ISOLATION. `trap_focus` and `inert_background` are the modal half
 * (CLI-22): move focus in, keep Tab inside BOTH trees a web component dialog has
 * (the slotted light DOM and its shadow chrome), make everything outside the
 * dialog inert ALONG THE WHOLE ANCESTOR CHAIN — the application never appends a
 * modal to `document.body`, so a body-children-only sweep isolates nothing — and
 * restore focus to the element that really had it (`deep_active_element`, which
 * sees through a shadow host, not the `document.activeElement` that stops at one).
 */

// NO IMPORTS, DELIBERATELY. This module is the bottom of the client's helper
// graph: `utils/index.js` re-exports through `ui.js`, so importing one line from
// it would drag the whole UI graph into every consumer — and would make this
// module unloadable outside a browser, which is exactly where its gate wants to
// execute it (test/unit/client_keyboard_activation_tripwire.test.ts runs
// make_activable against a fake element and asserts the KEY reaches the
// callback, instead of grepping for the spelling of a listener).
/**
 * STRIP_MARKUP
 * The ontology's labels are HTML; an accessible name is plain text.
 * @param {string} html
 * @return {string}
 */
const strip_tags = function (html) {
	return String(html).replace(/<[^>]*>/g, '');
};

/** Monotonic counter for generated ids. Per document; ids only need to be unique in one. */
let id_seq = 0;

/** Selector of the form controls a group label can name. */
const NAMEABLE_CONTROLS = 'input, textarea, select';

/** Controls that are named by their own surroundings, never by the component label. */
const CONTROL_TYPES_SKIPPED = new Set(['hidden', 'submit', 'button', 'reset']);

/** Attribute marking a wrapper whose controls must be named by `data-a11y-label-id`. */
const GROUP_ATTRIBUTE = 'data-a11y-label-id';

/**
 * Attribute marking a wrapper that IS a named group but renders NO label node.
 * The line views (`view_line_edit_*`, the shipped default of every column in a
 * portal row and of every section_record line) build their wrapper with
 * `label : null`: the column heading is drawn once by the list header, never per
 * cell, so there is no node to point an `aria-labelledby` at. The group is real
 * all the same — its controls are that component's — so the name is carried as
 * TEXT and stamped on the controls as `aria-label`.
 */
const GROUP_TEXT_ATTRIBUTE = 'data-a11y-label-text';

/** Any labelled group, by node or by text. The nearest one owns a control. */
const GROUP_SELECTOR = `[${GROUP_ATTRIBUTE}],[${GROUP_TEXT_ATTRIBUTE}]`;

/** Focusable candidates inside a trapped container (order = DOM order). */
const FOCUSABLE = [
	'a[href]',
	'button:not([disabled])',
	'input:not([disabled])',
	'select:not([disabled])',
	'textarea:not([disabled])',
	'[tabindex]:not([tabindex="-1"])',
	'[role="button"]:not([disabled])',
].join(',');

/** The one document observer (created on first `label_group`). */
let control_observer = null;

/**
 * GENERATE_ID
 * A collision-free id for a node that has none.
 * @param {string} prefix
 * @return {string}
 */
export const generate_id = function (prefix) {
	id_seq++;
	return `${prefix}_${id_seq}`;
}; //end generate_id

/**
 * IS_NATIVE_ACTIVABLE
 * True when the browser already gives the node keyboard activation and a role.
 * @param {HTMLElement} el
 * @return {boolean}
 */
export const is_native_activable = function (el) {
	if (!el || !el.tagName) return false;
	const tag = el.tagName.toLowerCase();
	return (
		tag === 'button' ||
		tag === 'input' ||
		tag === 'textarea' ||
		tag === 'select' ||
		(tag === 'a' && el.hasAttribute('href'))
	);
}; //end is_native_activable

/**
 * SET_LABEL
 * Give a node an accessible name, without touching one it already has.
 * Markup is stripped: these labels come from the ontology and are HTML.
 * @param {HTMLElement} el
 * @param {string} label
 * @return {void}
 */
export const set_label = function (el, label) {
	if (!el || !label || typeof label !== 'string') return;
	if (el.getAttribute('aria-label') || el.getAttribute('aria-labelledby')) return;
	const text = label.indexOf('<') !== -1 ? strip_tags(label) : label;
	if (text.trim() === '') return;
	el.setAttribute('aria-label', text.trim());
}; //end set_label

/**
 * MAKE_ACTIVABLE
 * Make a non-native node behave as a control: role, tab stop, accessible name,
 * and ONE callback reached by both pointer and keyboard.
 *
 * @param {HTMLElement} el
 * @param {Object} options
 *   {Function} on_activate    - the shared callback (receives the raw event)
 *   {string}   [role='button']
 *   {string}   [label]        - accessible name (icon-only controls NEED one)
 *   {number}   [tabindex=0]
 *   {string}   [pointer_event='click'] - 'click' or 'mousedown'; the pointer
 *                                        event the surface already used
 *   {boolean}  [expanded]     - sets aria-expanded when defined
 * @return {HTMLElement} el
 */
export const make_activable = function (el, options = {}) {
	if (!el) return el;

	const on_activate = options.on_activate;
	const role = options.role ?? 'button';
	const pointer_event = options.pointer_event === 'mousedown' ? 'mousedown' : 'click';

	// role / tab stop. A native control keeps its own semantics.
	if (!is_native_activable(el)) {
		if (role !== null && !el.getAttribute('role')) {
			el.setAttribute('role', role);
		}
		if (!el.hasAttribute('tabindex')) {
			el.setAttribute('tabindex', String(options.tabindex ?? 0));
		}
	}

	// accessible name
	if (options.label) {
		set_label(el, options.label);
	}

	// expanded state (arrows, disclosure toggles)
	if (options.expanded !== undefined && options.expanded !== null) {
		el.setAttribute('aria-expanded', options.expanded === true ? 'true' : 'false');
	}

	if (typeof on_activate !== 'function') return el;

	// pointer. The event the surface already used, so pointer timing (drag,
	// selection) is unchanged by this rewire.
	el.addEventListener(pointer_event, on_activate);

	// keyboard. Enter and Space are the button activation keys; the same
	// callback, the same event interface.
	el.addEventListener('keydown', (e) => {
		if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return;
		// only the node itself: a key pressed in a nested real control is its own
		if (e.target !== el) return;
		e.preventDefault();
		on_activate(e);
	});

	return el;
}; //end make_activable

/**
 * SET_EXPANDED
 * Project an open/closed state onto a node made activable as a disclosure.
 * @param {HTMLElement} el
 * @param {boolean} is_expanded
 * @return {void}
 */
export const set_expanded = function (el, is_expanded) {
	if (!el || !el.setAttribute) return;
	el.setAttribute('aria-expanded', is_expanded === true ? 'true' : 'false');
}; //end set_expanded

/**
 * NAME_CONTROLS
 * Point every unnamed form control inside `container` at the label node of the
 * group that OWNS it. Idempotent: a control that already has a name of its own
 * is left alone.
 *
 * (!) THE OWNER IS RESOLVED PER CONTROL, NEVER ONCE FOR THE CONTAINER. Component
 * groups NEST: a portal wrapper is a labelled group whose subtree holds one
 * labelled group per column component, each with its own label node. Naming the
 * whole subtree with the container's label — which is what a single
 * `container.getAttribute()` does — gave every column input in a portal row the
 * PORTAL's name ("Authors"), so adjacent fields became programmatically
 * indistinguishable (WCAG 1.3.1 / 3.3.2 / 4.1.2). The nearest labelled ancestor
 * of the control is the group that names it; that is the whole law here, and it
 * also makes the function safe to call on ANY ancestor: a coarse call and a
 * precise one produce the same names.
 *
 * @param {HTMLElement} container
 * @return {number} controls named
 */
export const name_controls = function (container) {
	if (!container || !container.getAttribute) return 0;

	const label_id = container.getAttribute(GROUP_ATTRIBUTE);
	const label_text = container.getAttribute(GROUP_TEXT_ATTRIBUTE);
	if (!label_id && !label_text) return 0;

	let named = 0;
	const controls = container.querySelectorAll(NAMEABLE_CONTROLS);
	for (let i = 0; i < controls.length; i++) {
		const control = controls[i];
		if (control.getAttribute('aria-label') || control.getAttribute('aria-labelledby')) continue;
		if (control.tagName.toLowerCase() === 'input' && CONTROL_TYPES_SKIPPED.has(control.type))
			continue;
		// the nearest labelled group ABOVE this control owns it; the container is
		// only the fallback (a control cannot be outside the container it was found in)
		const owner = control.closest ? control.closest(GROUP_SELECTOR) : null;
		const owner_id = owner ? owner.getAttribute(GROUP_ATTRIBUTE) : null;
		const owner_text = owner ? owner.getAttribute(GROUP_TEXT_ATTRIBUTE) : null;
		if (owner_id) {
			control.setAttribute('aria-labelledby', owner_id);
		} else if (owner_text) {
			control.setAttribute('aria-label', owner_text);
		} else if (label_id) {
			control.setAttribute('aria-labelledby', label_id);
		} else {
			control.setAttribute('aria-label', label_text);
		}
		named++;
	}

	return named;
}; //end name_controls

/**
 * ENSURE_CONTROL_OBSERVER
 * Create the ONE document-level observer that names controls appended after the
 * wrapper was built. Called lazily by `label_group`; a document that never builds
 * a labelled group never pays for it.
 * @return {void}
 */
const ensure_control_observer = function () {
	if (control_observer || typeof MutationObserver === 'undefined' || !document.body) return;

	const group_selector = GROUP_SELECTOR;
	control_observer = new MutationObserver((mutations) => {
		for (const mutation of mutations) {
			for (const node of mutation.addedNodes) {
				if (!node || node.nodeType !== 1) continue;
				// the closest labelled group ABOVE the insertion point (name_controls
				// resolves each control's own owner, so this covers nested groups too)
				const group = node.closest ? node.closest(group_selector) : null;
				if (group) {
					name_controls(group);
					continue;
				}
				// no labelled ancestor: the groups INSIDE the added subtree still own
				// their controls — a component committed under an unlabelled container
				// (a portal's list_body, a grouper) must not stay nameless.
				if (node.matches && node.matches(group_selector)) name_controls(node);
				if (node.querySelectorAll) {
					const nested = node.querySelectorAll(group_selector);
					for (let i = 0; i < nested.length; i++) name_controls(nested[i]);
				}
			}
		}
	});
	control_observer.observe(document.body, { childList: true, subtree: true });
}; //end ensure_control_observer

/**
 * LABEL_GROUP
 * The label chokepoint's half: give the label node an id, announce the wrapper as
 * a group named by it, and name the controls it contains (now and later).
 *
 * @param {HTMLElement} wrapper
 * @param {HTMLElement} label_el
 * @param {Object} [options] - {string} [prefix='component_label']
 * @return {HTMLElement} label_el
 */
export const label_group = function (wrapper, label_el, options = {}) {
	if (!wrapper || !label_el || !label_el.setAttribute) return label_el;

	if (!label_el.id) {
		label_el.id = generate_id(options.prefix || 'component_label');
	}

	if (!wrapper.getAttribute('role')) {
		wrapper.setAttribute('role', 'group');
	}
	if (!wrapper.getAttribute('aria-labelledby')) {
		wrapper.setAttribute('aria-labelledby', label_el.id);
	}
	wrapper.setAttribute(GROUP_ATTRIBUTE, label_el.id);

	name_controls(wrapper);
	ensure_control_observer();

	return label_el;
}; //end label_group

/**
 * LABEL_GROUP_TEXT
 * The SAME chokepoint for a group that renders NO label node.
 *
 * WHY IT EXISTS (audit 2026-08-26, CLI-10, reviewer-refuted first pass). Naming a
 * control by the nearest labelled ANCESTOR is only correct if the component the
 * control belongs to actually is one. The shipped line views are not: all 14
 * `view_line_edit_*` build their wrapper with `label : null`, so no label node,
 * no group attribute — and `closest()` then walked past the column and resolved
 * to the PORTAL, giving every field in a row the portal's name (and giving a
 * line-view control outside a portal no name at all). The label TEXT exists in
 * every case (`instance.label`, the ontology's own); only the NODE is missing.
 * So the group is declared with the text, and its controls are named with
 * `aria-label` instead of `aria-labelledby`. Same law, same chokepoint, one
 * attribute apart.
 *
 * @param {HTMLElement} wrapper
 * @param {string} label
 * @return {HTMLElement} wrapper
 */
export const label_group_text = function (wrapper, label) {
	if (!wrapper || !wrapper.setAttribute || !label || typeof label !== 'string') return wrapper;

	const text = (label.indexOf('<') !== -1 ? strip_tags(label) : label).trim();
	if (text === '') return wrapper;

	if (!wrapper.getAttribute('role')) {
		wrapper.setAttribute('role', 'group');
	}
	if (!wrapper.getAttribute('aria-label') && !wrapper.getAttribute('aria-labelledby')) {
		wrapper.setAttribute('aria-label', text);
	}
	wrapper.setAttribute(GROUP_TEXT_ATTRIBUTE, text);

	name_controls(wrapper);
	ensure_control_observer();

	return wrapper;
}; //end label_group_text

/**
 * DEEP_ACTIVE_ELEMENT
 * The element that REALLY has focus. `document.activeElement` stops at a shadow
 * host, so a control inside a web component's shadow chrome reads as the host —
 * which made the dialog trap compare the wrong node.
 * @return {HTMLElement|null}
 */
export const deep_active_element = function () {
	let active = document.activeElement;
	while (active && active.shadowRoot && active.shadowRoot.activeElement) {
		active = active.shadowRoot.activeElement;
	}
	return active;
}; //end deep_active_element

/**
 * INERT_BACKGROUND
 * Make everything outside `el` unreachable — pointer, Tab AND the AT virtual
 * cursor — by walking the ANCESTOR CHAIN and inerting each level's other
 * children, up to and including `document.body`.
 *
 * WHY THE WALK (audit P1-18 / CLI-22, reviewer-measured). Inerting only
 * `document.body.children` is a no-op for every dialog this application opens:
 * `ui.attach_to_modal` appends the modal into `.wrapper.page`, which lives inside
 * `#main`, so the ONE body child that is not the modal's ancestor is a hidden
 * debug div — the record surface behind the dialog stayed live. Isolation has to
 * be applied at every level between the dialog and the document.
 *
 * @param {HTMLElement} el
 * @return {Function} release - un-inerts exactly what this call inerted (idempotent)
 */
export const inert_background = function (el) {
	const inerted = [];
	if (el && el.parentElement) {
		let node = el;
		while (node && node.parentElement) {
			const parent = node.parentElement;
			const children = Array.from(parent.children);
			for (let i = 0; i < children.length; i++) {
				const child = children[i];
				// the ancestor chain itself is never inerted, and an element some
				// other dialog already inerted is left to that dialog to restore
				if (child === node || child.inert === true) continue;
				child.inert = true;
				inerted.push(child);
			}
			if (parent === document.body) break;
			node = parent;
		}
	}

	let released = false;
	return function release() {
		if (released) return;
		released = true;
		for (let i = 0; i < inerted.length; i++) {
			inerted[i].inert = false;
		}
		inerted.length = 0;
	};
}; //end inert_background

/**
 * TRAP_FOCUS
 * Dialog focus management: move focus in, keep Tab inside, restore it on release.
 *
 * The candidate list is read from EVERY root in `roots` (in order), because a web
 * component's dialog is two trees: the slotted LIGHT DOM (the caller's own header,
 * body and footer — where every real control lives) and the shadow chrome (close /
 * minimize). Reading only the shadow root, as this trap first did, left every
 * content control outside the candidate list, so Tab from the confirmation's
 * Delete button walked straight out into the page behind.
 *
 * @param {HTMLElement} container
 * @param {Object} [options]
 *   {HTMLElement} [restore_to]  - defaults to document.activeElement AT TRAP TIME
 *   {HTMLElement} [initial]     - node to focus first (default: first focusable)
 *   {Array} [roots]             - roots to read focusables from (default: [container])
 *   {Document|ShadowRoot} [scope] - single-root form of `roots` (kept for callers)
 *   {boolean} [trap=true]       - when false, focus is moved IN and restored on
 *                                 release, but Tab is NOT intercepted. This is what
 *                                 a NON-MODAL dialog owes its user: `remove_overlay`
 *                                 panels (find-and-replace over the text editor,
 *                                 tool_diffusion) are documented as leaving the page
 *                                 usable while they are open, so trapping Tab inside
 *                                 them would be the defect, not the fix.
 * @return {Function} release - removes the trap and restores focus (idempotent).
 *   Accepts `{restore:false}` to release WITHOUT moving focus — used when a dialog
 *   is PARKED (minimized) rather than closed: the page behind becomes usable again,
 *   but yanking focus back to whatever opened the dialog would be a surprise.
 */
export const trap_focus = function (container, options = {}) {
	if (!container) return () => {};

	const restore_to = options.restore_to ?? (deep_active_element() || null);

	const roots = options.roots ? options.roots : options.scope ? [options.scope] : [container];

	const focusables = () => {
		const found = [];
		for (let i = 0; i < roots.length; i++) {
			const root = roots[i];
			if (!root || !root.querySelectorAll) continue;
			const nodes = Array.from(root.querySelectorAll(FOCUSABLE));
			for (let j = 0; j < nodes.length; j++) {
				const node = nodes[j];
				if (found.indexOf(node) !== -1) continue;
				// a hidden candidate is not a tab stop. `getClientRects()` is the
				// check, not `offsetParent`: slotted content lives in one tree and
				// is laid out in another, and offsetParent's answer across a shadow
				// boundary is not a visibility statement. The currently focused node
				// counts even when the layout says it has no box.
				if (
					node.getClientRects &&
					node.getClientRects().length === 0 &&
					node !== deep_active_element()
				)
					continue;
				found.push(node);
			}
		}
		return found;
	};

	const keydown_handler = (e) => {
		if (e.key !== 'Tab') return;
		const nodes = focusables();
		if (nodes.length === 0) {
			e.preventDefault();
			return;
		}
		const first = nodes[0];
		const last = nodes[nodes.length - 1];
		const active = deep_active_element();
		const index = nodes.indexOf(active);
		if (index === -1) {
			// focus is somewhere the dialog does not own: pull it back in
			e.preventDefault();
			(e.shiftKey ? last : first).focus();
			return;
		}
		if (e.shiftKey && active === first) {
			e.preventDefault();
			last.focus();
		} else if (!e.shiftKey && active === last) {
			e.preventDefault();
			first.focus();
		}
	};

	const trapping = options.trap !== false;
	if (trapping) {
		container.addEventListener('keydown', keydown_handler);
	}

	// move focus in
	const initial = options.initial || focusables()[0] || container;
	if (initial && typeof initial.focus === 'function') {
		if (initial === container && !container.hasAttribute('tabindex')) {
			container.setAttribute('tabindex', '-1');
		}
		initial.focus();
	}

	let released = false;
	return function release(release_options = {}) {
		if (released) return;
		released = true;
		if (trapping) {
			container.removeEventListener('keydown', keydown_handler);
		}
		if (release_options.restore === false) return;
		if (restore_to && typeof restore_to.focus === 'function' && restore_to.isConnected !== false) {
			restore_to.focus();
		}
	};
}; //end trap_focus

export const a11y = {
	generate_id,
	is_native_activable,
	set_label,
	make_activable,
	set_expanded,
	name_controls,
	label_group,
	label_group_text,
	trap_focus,
	deep_active_element,
	inert_background,
	GROUP_ATTRIBUTE,
	GROUP_TEXT_ATTRIBUTE,
};
