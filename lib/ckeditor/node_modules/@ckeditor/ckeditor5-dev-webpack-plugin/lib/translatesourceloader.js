/**
 * @license Copyright (c) 2003-2022, CKSource Holding sp. z o.o. All rights reserved.
 * For licensing, see LICENSE.md.
 */

'use strict';

/**
 * Very simple loader that runs the translateSource function only on the source.
 * translateSource is provided by the CKEditorWebpackPlugin.
 *
 * @param {String} source Source which will be translated.
 * @returns {String}
 */
module.exports = function translateSourceLoader( source ) {
	return this.query.translateSource( source, this.resourcePath );
};
