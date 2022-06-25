/**
 * @license Copyright (c) 2003-2022, CKSource Holding sp. z o.o. All rights reserved.
 * For licensing, see LICENSE.md.
 */

'use strict';

/* eslint-env node */

/**
 * Returns a (CKEditor 5) package name the file belongs to.
 *
 * E.g., for the path to the file:
 *
 *        "/foo/ckeditor5/packages/ckeditor5-bar/baz.css"
 *
 * it outputs
 *
 *        "ckeditor5-bar"
 *
 * It always returns the last found package. Sometimes the whole project can be located
 * under path which starts with `ckeditor5-`. In this case it isn't a package and it doesn't make
 * sense to return the directory name. See #381.
 *
 * E.g., for the path from the build directory to the file:
 *
 *        "/foo/ckeditor5/packages/ckeditor5-build-classic/node_modules/@ckeditor/ckeditor5-bar/baz.css"
 *
 * it outputs
 *
 *        "ckeditor5-bar"
 *
 * @param {String} inputFilePath A path to the file.
 * @returns {String} The name of the package.
 */
module.exports = function getPackageName( inputFilePath ) {
	const match = inputFilePath.match( /^.+[/\\](ckeditor5-[^/\\]+)/ );

	if ( match ) {
		return match.pop();
	} else {
		return null;
	}
};
