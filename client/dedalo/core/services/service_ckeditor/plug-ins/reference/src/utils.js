/**
 * @license Copyright (c) 2003-2022, CKSource Holding sp. z o.o. All rights reserved.
 * For licensing, see LICENSE.md or https://ckeditor.com/legal/ckeditor-oss-license
 */

/**
 * @module link/utils
 */

/**
 * UTILS (reference plugin)
 * Shared utility constants and predicate functions for the Dédalo CKEditor 5
 * "reference" inline-annotation plugin.
 *
 * Exports:
 *   - REFERENCE_KEYSTROKE — keyboard shortcut string bound to the toolbar button.
 *   - isLinkElement()     — view-layer guard: checks whether a node is a rendered
 *                           `<reference>` attribute element.
 *   - isLinkableElement() — model-layer guard: checks whether an element is permitted
 *                           by the schema to carry the `reference` model attribute.
 *
 * These helpers are consumed by:
 *   - reference_ui.js    → imports `isLinkElement` and `REFERENCE_KEYSTROKE`
 *   - reference_command.js → imports `isLinkableElement`
 *
 * Note: the `@module` tag above still uses the original CKEditor `link/utils` namespace
 * path; this is intentional to match the source template this plugin was adapted from.
 */

/* global window */


/**
 * Keyboard shortcut that activates the reference toolbar button.
 *
 * Bound to the CKEditor ButtonView via `button.keystroke` in reference_ui.js so that
 * CKEditor automatically renders the hint in the button tooltip. The commented-out
 * keystroke handler (Ctrl+K analogue) in reference_ui.js is not yet wired, so pressing
 * Ctrl+D does not currently fire `editor.execute('reference')` directly — only the
 * toolbar button click does.
 *
 * @var {string}
 */
export const REFERENCE_KEYSTROKE = 'Ctrl+D';

/**
 * IS_LINK_ELEMENT
 * Predicate for the CKEditor **view** layer: returns true when the given view node
 * is the `<reference>` attribute element created by the downcast converter in
 * reference_editing.js.
 *
 * The check uses the custom property `'reference'` that the downcast writer stamps
 * onto the attribute element — not a tag-name comparison — so it is resilient to
 * any future element-name changes.
 *
 * Used by reference_ui.js → `findLinkElementAncestor()` to locate the rendered
 * reference span closest to a given view position.
 *
 * @param {Object} node - a CKEditor view node (module:engine/view/node~Node)
 * @returns {boolean} true when `node` is a rendered reference attribute element
 */
export function isLinkElement( node ) {
	return node.is( 'attributeElement' ) && !!node.getCustomProperty( 'reference' );
}


/**
 * IS_LINKABLE_ELEMENT
 * Predicate for the CKEditor **model** layer: returns true when the given model
 * element is allowed by the schema to carry the `'reference'` attribute.
 *
 * Called from reference_command.refresh() to determine whether a selected inline
 * widget (non-text element) can be annotated. For plain text selections the command
 * uses `schema.checkAttributeInSelection()` instead; this guard only applies when
 * `selection.getSelectedElement()` returns a non-null element.
 *
 * Returns false immediately when `element` is null, avoiding a schema lookup on
 * a non-existent node (schema.checkAttribute throws on null input).
 *
 * @param {Object|null} element - a CKEditor model element (module:engine/model/element~Element), or null
 * @param {Object} schema - the editor's model schema (module:engine/model/schema~Schema)
 * @returns {boolean} true when `element` is non-null and its schema definition allows `'reference'`
 */
export function isLinkableElement( element, schema ) {
	if ( !element ) {
		return false;
	}

	return schema.checkAttribute( element.name, 'reference' );
}
