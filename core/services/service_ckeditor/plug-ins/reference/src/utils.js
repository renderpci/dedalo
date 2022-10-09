/**
 * @license Copyright (c) 2003-2022, CKSource Holding sp. z o.o. All rights reserved.
 * For licensing, see LICENSE.md or https://ckeditor.com/legal/ckeditor-oss-license
 */

/**
 * @module link/utils
 */

/* global window */


/**
 * A keystroke used by the {@link module:link/linkui~LinkUI link UI feature}.
 */
export const REFERENCE_KEYSTROKE = 'Ctrl+D';

/**
 * Returns `true` if a given view node is the link element.
 *
 * @param {module:engine/view/node~Node} node
 * @returns {Boolean}
 */
export function isLinkElement( node ) {
	return node.is( 'attributeElement' ) && !!node.getCustomProperty( 'reference' );
}


/**
 * Returns `true` if the specified `element` can be linked (the element allows the `reference` attribute).
 *
 * @params {module:engine/model/element~Element|null} element
 * @params {module:engine/model/schema~Schema} schema
 * @returns {Boolean}
 */
export function isLinkableElement( element, schema ) {
	if ( !element ) {
		return false;
	}

	return schema.checkAttribute( element.name, 'reference' );
}
