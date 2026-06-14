/**
 * @license Copyright (c) 2003-2022, CKSource Holding sp. z o.o. All rights reserved.
 * For licensing, see LICENSE.md or https://ckeditor.com/legal/ckeditor-oss-license
 */

/**
 * @module link/reference_command
 */

/**
 * REFERENCE_COMMAND
 * CKEditor Command that drives the Dédalo "reference" inline annotation feature.
 *
 * This command is registered under the name `'reference'` by {@link module:link/reference_editing}
 * and wired to the toolbar button created in {@link module:link/reference_ui}. When the button is
 * pressed, CKEditor calls `execute()`, which in practice is a no-op here: the real work is done
 * by the `service_ckeditor.setup_button_reference()` listener that subscribes to the command's
 * `'execute'` event externally (see core/services/service_ckeditor/js/service_ckeditor.js).
 *
 * The `'reference'` model attribute stores an object with the following shape:
 * ```
 * {
 *   id:     string  – unique element id of the <reference> DOM node
 *   type:   string  – always 'reference' (legacy v5 records may omit this)
 *   tag_id: string  – sequential integer-as-string, e.g. '1', '2', …
 *   state:  string  – lifecycle state, e.g. 'n' (new), 'published', …
 *   label:  string  – human-readable label shown in the editor
 *   data:   string  – serialised reference payload (may be empty)
 * }
 * ```
 *
 * The command's `value` property is set to this object (or `undefined`) by `refresh()`
 * so that the toolbar button can reflect whether the caret is inside an existing reference.
 *
 * @extends module:core/command~Command
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
	 * REFRESH
	 * Synchronise the command's `value` and `isEnabled` state with the current editor
	 * selection. Called automatically by CKEditor whenever the selection or model changes.
	 *
	 * Two paths are handled:
	 * 1. **Linkable element selected** (e.g. an inline widget that allows the `reference`
	 *    attribute): read the attribute from the element itself and check schema permission
	 *    on the element.
	 * 2. **Text / collapsed selection**: read the attribute from the selection's inherited
	 *    text attributes and check schema permission via `checkAttributeInSelection`.
	 *
	 * After this call:
	 * - `this.value` is the reference object `{id, type, tag_id, state, label, data}` when
	 *   the selection sits inside an existing reference span, or `undefined` otherwise.
	 * - `this.isEnabled` reflects whether the schema allows the `'reference'` attribute at
	 *   the current selection (controls toolbar-button enabled/disabled state).
	 *
	 * @returns {void}
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
	 * EXECUTE
	 * Fires the CKEditor `'execute'` event for the `'reference'` command.
	 *
	 * The method body is intentionally empty: this command acts as a pure event source.
	 * The actual reference-insertion logic lives in `service_ckeditor.setup_button_reference()`,
	 * which registers an external `on('execute', …)` listener on this command. That listener
	 * handles tag creation and opens the reference modal (see
	 * core/services/service_ckeditor/js/service_ckeditor.js → `setup_button_reference`).
	 *
	 * This pattern decouples CKEditor's toolbar lifecycle from Dédalo's domain logic.
	 *
	 * @returns {void}
	 */
	execute() {
	}

}
