/**
 * @license Copyright (c) 2003-2022, CKSource Holding sp. z o.o. All rights reserved.
 * For licensing, see LICENSE.md or https://ckeditor.com/legal/ckeditor-oss-license
 */

/**
 * @module link/reference_command
 */

import { Command } from 'ckeditor5/src/core';
import { findAttributeRange } from 'ckeditor5/src/typing';
import { Collection, first, toMap } from 'ckeditor5/src/utils';

import { isLinkableElement } from './utils';

/**
 * The link command. It is used by the {@link module:link/link~Link link feature}.
 *
 * @extends module:core/command~Command
 */
export default class reference_command extends Command {
	/**
	 * The value of the `'reference'` attribute if the start of the selection is located in a node with this attribute.
	 *
	 * @observable
	 * @readonly
	 * @member {Object|undefined} #value
	 */

	constructor( editor ) {
		super( editor );
	}

	/**
	 * Refresh
	 * Update the state of the command to get if the toolbar button could be enable or active
	 */
	refresh() {
		const model = this.editor.model;
		const selection = model.document.selection;
		const selectedElement = selection.getSelectedElement() || first( selection.getSelectedBlocks() );

		// A check for any integration that allows linking elements (e.g. `LinkImage`).
		// Currently the selection reads attributes from text nodes only. See #7429 and #7465.
		if ( isLinkableElement( selectedElement, model.schema ) ) {
			this.value = selectedElement.getAttribute( 'reference' );
			this.isEnabled = model.schema.checkAttribute( selectedElement, 'reference' );
		} else {
			this.value = selection.getAttribute( 'reference' );
			this.isEnabled = model.schema.checkAttributeInSelection( selection, 'reference' );
		}
	}

	/**
	 * Executes the command.
	 * this command is set in service_ckditor:
	 * setup_button_reference()
	 * it's used with ckInlineEditor standard toolbar and ddEditor toolbar
	 */
	execute() {
	}

}
