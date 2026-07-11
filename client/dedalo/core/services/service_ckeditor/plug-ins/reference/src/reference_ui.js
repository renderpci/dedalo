/**
 * @license Copyright (c) 2003-2022, CKSource Holding sp. z o.o. All rights reserved.
 * For licensing, see LICENSE.md or https://ckeditor.com/legal/ckeditor-oss-license
 */

/**
 * @module link/reference_ui
 */

/**
 * REFERENCE_UI
 * CKEditor 5 UI sub-plugin for the Dédalo "reference" inline-annotation feature.
 *
 * Responsibilities:
 * - Registers a `'reference'` toolbar button via the CKEditor component factory.
 * - Binds the button's `isEnabled` and `isOn` state to the `reference_command` so that
 *   the toolbar reflects whether the cursor is inside an existing reference span.
 * - Listens to the button's `'execute'` event and delegates to the `reference` command,
 *   which in turn fires its own `'execute'` event where the Dédalo host code
 *   (`service_ckeditor.setup_button_reference`) intercepts and opens the reference modal.
 *
 * This plugin is a lightweight orchestrator: it owns no modal, no form view, and no
 * balloon.  The commented-out Ctrl+K keystroke and formView tear-down stubs are preserved
 * from the CKEditor link plugin template and left for future implementation.
 *
 * Consumed by:
 *   reference.js → lists this class in `static get requires()`
 */

import { Plugin } from 'ckeditor5/src/core';
import { ClickObserver } from 'ckeditor5/src/engine';
import { ButtonView } from 'ckeditor5/src/ui';
import { isWidget } from 'ckeditor5/src/widget';

import { isLinkElement, REFERENCE_KEYSTROKE } from './utils';

import linkIcon from '../theme/icons/link.svg';

/**
 * Marker name used by the CKEditor UI infrastructure to track the visual
 * selection highlight while a contextual balloon is open.
 * Reserved for future balloon-based UI (currently no balloon is shown).
 *
 * @var {string}
 */
const VISUAL_SELECTION_MARKER_NAME = 'link-ui';

/**
 * REFERENCE_UI
 * CKEditor 5 Plugin that wires the Dédalo reference feature's toolbar button.
 *
 * Introduces a single `'reference'` button in the editor's component factory.
 * The button is bound to the `reference_command` command so its enabled/toggled
 * state tracks the command automatically.  No contextual balloon or form view is
 * managed here — those are left for future extension.
 *
 * @extends module:core/plugin~Plugin
 */
export default class reference_ui extends Plugin {

	/**
	 * PLUGINNAME
	 * Canonical name used by CKEditor to look up this plugin instance via
	 * `editor.plugins.get( 'reference_ui' )`.
	 *
	 * @returns {string} The registered plugin name.
	 * @inheritDoc
	 */
	static get pluginName() {
		return 'reference_ui';
	}

	/**
	 * INIT
	 * CKEditor lifecycle hook called once the editor is fully assembled.
	 *
	 * Registers the ClickObserver on the editing view (required for detecting
	 * user click events that may later be used to show contextual UI), then
	 * delegates toolbar-button creation to `_createToolbarLinkButton`.
	 *
	 * @returns {void}
	 * @inheritDoc
	 */
	init() {
		const editor = this.editor;

		editor.editing.view.addObserver( ClickObserver );

		// Create toolbar buttons.
		this._createToolbarLinkButton();
	}

	/**
	 * DESTROY
	 * CKEditor lifecycle hook called when the editor is destroyed.
	 *
	 * Delegates to the parent plugin teardown and provides a stub for future
	 * form-view cleanup.  CKEditor does not automatically destroy UI components
	 * that are created outside of a View's template binding, so any balloon or
	 * form view added in the future must be explicitly destroyed here.
	 *
	 * See https://github.com/ckeditor/ckeditor5/issues/1341 for the upstream issue.
	 *
	 * @returns {void}
	 * @inheritDoc
	 */
	destroy() {
		super.destroy();

		// Destroy created UI components as they are not automatically destroyed (see ckeditor5#1341).
		// this.formView.destroy();
	}


	/**
	 * _CREATETOOLBARLINKBUTTON
	 * Registers the `'reference'` button in CKEditor's UI component factory and
	 * wires its state and execute behaviour to the `reference_command`.
	 *
	 * The button is created lazily by the factory each time CKEditor builds a
	 * toolbar, so this method only registers the factory callback — it does not
	 * create a ButtonView itself.
	 *
	 * Button properties set at creation time:
	 * - `isEnabled`     — initially forced to `true`, then overridden by the
	 *                     binding below; the initial assignment has no lasting
	 *                     effect because `bind` replaces it immediately.
	 * - `label`         — static string 'Reference' (not localised via `t()`).
	 * - `icon`          — link SVG icon imported from the theme directory.
	 * - `keystroke`     — Ctrl+D (defined in utils.js as REFERENCE_KEYSTROKE);
	 *                     displayed in the tooltip but NOT registered as a global
	 *                     keystroke handler (the commented-out block below).
	 * - `tooltip`       — true: CKEditor renders an accessible tooltip automatically.
	 * - `isToggleable`  — true: the button can appear in a pressed/active state
	 *                     when the cursor is inside an existing reference.
	 *
	 * State bindings (live, automatic):
	 * - `button.isEnabled` ← `reference_command.isEnabled`
	 *   (disabled when schema forbids `reference` at the current selection)
	 * - `button.isOn`      ← `!!reference_command.value`
	 *   (toggled when the caret is inside an existing reference span)
	 *
	 * Execute flow:
	 *   button 'execute' → editor.execute('reference') → reference_command.execute()
	 *   → fires command 'execute' event → service_ckeditor.setup_button_reference
	 *   listener opens the Dédalo reference-picker modal.
	 *
	 * (!) The Ctrl+D global keystroke handler is commented out.  Re-enabling it
	 *     requires uncommenting the `editor.keystrokes.set(…)` block and adding
	 *     browser-focus prevention for Firefox/Chrome/Edge (see ckeditor5#4811).
	 *
	 * @private
	 * @returns {void}
	 */
	_createToolbarLinkButton() {
		const editor = this.editor;
		const reference_command = editor.commands.get( 'reference' );
		// const t = editor.t;

		// // Handle the `Ctrl+K` keystroke and show the panel.
		// editor.keystrokes.set( REFERENCE_KEYSTROKE, ( keyEvtData, cancel ) => {
		// 	// Prevent focusing the search bar in FF, Chrome and Edge. See https://github.com/ckeditor/ckeditor5/issues/4811.
		// 	cancel();

		// 	if ( reference_command.isEnabled ) {
		// 		editor.execute( 'reference' );
		// 	}
		// } );

		editor.ui.componentFactory.add( 'reference', locale => {
			const button = new ButtonView( locale );

			button.isEnabled = true;
			button.label = 'Reference';
			button.icon = linkIcon;
			button.keystroke = REFERENCE_KEYSTROKE;
			button.tooltip = true;
			button.isToggleable = true;

			// Bind button to the command.
			button.bind( 'isEnabled' ).to( reference_command, 'isEnabled' );
			button.bind( 'isOn' ).to( reference_command, 'value', value => !!value );

			// Show the panel on button click.
			this.listenTo( button, 'execute', () => {
				editor.execute( 'reference' );
			} );

			return button;
		} );
	}



	/**
	 * _GETSELECTEDLINKELEMENT
	 * Returns the `<reference>` AttributeElement that is currently selected in the
	 * editing view, or `null` when the selection does not coincide with a reference
	 * element.
	 *
	 * Three cases are handled:
	 *
	 * 1. **Collapsed selection** — walks up the ancestor chain from the caret
	 *    position and returns the nearest `<reference>` AttributeElement (or null).
	 *
	 * 2. **Widget selected** (e.g. an inline image inside a reference) — same
	 *    ancestor walk from the widget's position.  `isWidget` is used to detect
	 *    CKEditor-managed widget wrappers.
	 *
	 * 3. **Non-collapsed text selection** — the reference element is returned only
	 *    when the selection **fully** covers exactly one reference element and that
	 *    element is the **only** thing selected.  Partial selections and selections
	 *    spanning multiple elements both return `null`.
	 *    Implementation: trim whitespace-only boundary nodes from both ends of the
	 *    range, walk up from start and end to find their respective ancestor
	 *    `<reference>` elements, confirm they are the same node, then verify that
	 *    a range spanning the interior of that element (also trimmed) is equal to
	 *    the selection range.
	 *
	 * (!) This method is defined but currently unused within this file.  It was
	 *     retained from the CKEditor link plugin template for potential future use
	 *     (e.g. a contextual balloon or inline toolbar).
	 *
	 * @private
	 * @returns {Object|null|undefined} The CKEditor AttributeElement for the selected reference,
	 *   `null` when a non-collapsed selection does not fully cover exactly one reference, or
	 *   `undefined` when no ancestor reference element is found (propagated from `findLinkElementAncestor`).
	 */
	_getSelectedLinkElement() {
		const view = this.editor.editing.view;
		const selection = view.document.selection;
		const selectedElement = selection.getSelectedElement();

		// The selection is collapsed or some widget is selected (especially inline widget).
		if ( selection.isCollapsed || selectedElement && isWidget( selectedElement ) ) {
			return findLinkElementAncestor( selection.getFirstPosition() );
		} else {
			// The range for fully selected link is usually anchored in adjacent text nodes.
			// Trim it to get closer to the actual link element.
			const range = selection.getFirstRange().getTrimmed();
			const startLink = findLinkElementAncestor( range.start );
			const endLink = findLinkElementAncestor( range.end );

			if ( !startLink || startLink != endLink ) {
				return null;
			}

			// Check if the link element is fully selected.
			if ( view.createRangeIn( startLink ).getTrimmed().isEqual( range ) ) {
				return startLink;
			} else {
				return null;
			}
		}
	}

}

/**
 * FINDLINKELEMENTANCESTOR
 * Walks the ancestor chain of a view Position upward and returns the first
 * node that is a Dédalo `<reference>` AttributeElement, or `undefined` when
 * none is found.
 *
 * Uses `isLinkElement` from `./utils` which checks both that the node is a
 * CKEditor `attributeElement` AND that it carries the `'reference'` custom
 * property set during downcast conversion.
 *
 * Called by `_getSelectedLinkElement` to resolve the enclosing reference from
 * any position within the editing view tree.
 *
 * @private
 * @param {Object} position - CKEditor view Position whose ancestor chain is searched.
 * @returns {Object|undefined} The nearest ancestor AttributeElement that qualifies
 *   as a reference element, or `undefined` if no such ancestor exists.
 */
function findLinkElementAncestor( position ) {
	return position.getAncestors().find( ancestor => isLinkElement( ancestor ) );
}
