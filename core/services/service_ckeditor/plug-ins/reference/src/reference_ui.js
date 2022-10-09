/**
 * @license Copyright (c) 2003-2022, CKSource Holding sp. z o.o. All rights reserved.
 * For licensing, see LICENSE.md or https://ckeditor.com/legal/ckeditor-oss-license
 */

/**
 * @module link/reference_ui
 */

import { Plugin } from 'ckeditor5/src/core';
import { ClickObserver } from 'ckeditor5/src/engine';
import { ButtonView } from 'ckeditor5/src/ui';
import { isWidget } from 'ckeditor5/src/widget';

import { isLinkElement, REFERENCE_KEYSTROKE } from './utils';

import linkIcon from '../theme/icons/link.svg';

const VISUAL_SELECTION_MARKER_NAME = 'link-ui';

/**
 * The link UI plugin. It introduces the `'link'` and `'unlink'` buttons and support for the <kbd>Ctrl+K</kbd> keystroke.
 *
 * It uses the
 * {@link module:ui/panel/balloon/contextualballoon~ContextualBalloon contextual balloon plugin}.
 *
 * @extends module:core/plugin~Plugin
 */
export default class reference_ui extends Plugin {

	/**
	 * @inheritDoc
	 */
	static get pluginName() {
		return 'reference_ui';
	}

	/**
	 * @inheritDoc
	 */
	init() {
		const editor = this.editor;

		editor.editing.view.addObserver( ClickObserver );

		// Create toolbar buttons.
		this._createToolbarLinkButton();
	}

	/**
	 * @inheritDoc
	 */
	destroy() {
		super.destroy();

		// Destroy created UI components as they are not automatically destroyed (see ckeditor5#1341).
		// this.formView.destroy();
	}


	/**
	 * Creates a toolbar Link button. Clicking this button will show
	 * a {@link #_balloon} attached to the selection.
	 *
	 * @private
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
	 * Returns the link {@link module:engine/view/attributeelement~AttributeElement} under
	 * the {@link module:engine/view/document~Document editing view's} selection or `null`
	 * if there is none.
	 *
	 * **Note**: For a non–collapsed selection, the link element is returned when **fully**
	 * selected and the **only** element within the selection boundaries, or when
	 * a linked widget is selected.
	 *
	 * @private
	 * @returns {module:engine/view/attributeelement~AttributeElement|null}
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

// Returns a link element if there's one among the ancestors of the provided `Position`.
//
// @private
// @param {module:engine/view/position~Position} View position to analyze.
// @returns {module:engine/view/attributeelement~AttributeElement|null} Link element at the position or null.
function findLinkElementAncestor( position ) {
	return position.getAncestors().find( ancestor => isLinkElement( ancestor ) );
}
