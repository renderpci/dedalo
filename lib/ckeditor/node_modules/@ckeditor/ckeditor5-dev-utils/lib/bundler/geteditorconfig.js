/**
 * @license Copyright (c) 2003-2022, CKSource Holding sp. z o.o. All rights reserved.
 * For licensing, see LICENSE.md.
 */

'use strict';

const javascriptStringify = require( 'javascript-stringify' );

/**
 * Transforms specified configuration to a string that match to our code style.
 *
 * @param {Object} config
 * @returns {String}
 */
module.exports = function getEditorConfig( config ) {
	if ( !config ) {
		return '{}';
	}

	return javascriptStringify( config, null, '\t' )
		// Indent all but the first line (so it can be easily concatenated with `config = ${ editorConfig }`).
		.replace( /\n/g, '\n\t' );
};
