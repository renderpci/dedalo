/**
 * @license Copyright (c) 2003-2022, CKSource Holding sp. z o.o. All rights reserved.
 * For licensing, see LICENSE.md.
 */

'use strict';

const fs = require( 'fs' );
const getPlugins = require( './getplugins' );
const getEditorConfig = require( './geteditorconfig' );

/**
 * Generates an entry file which can be compiled by bundler, e.g. Webpack or Rollup.
 *
 * @param {String} destinationPath A path where entry file will be saved.
 * @param {Object} options
 * @param {Array.<String>} options.plugins An array with paths to the plugins for the editor.
 * @param {String} options.moduleName Name of exported UMD module.
 * @param {String} options.editor A path to class which defined the editor.
 * @param {Object} options.config Additional editor's configuration which will be built-in.
 */
module.exports = function createEntryFile( destinationPath, options ) {
	const entryFileContent = renderEntryFile( options );

	fs.writeFileSync( destinationPath, entryFileContent );
};

function renderEntryFile( options ) {
	const plugins = getPlugins( options.plugins );
	const date = new Date();

	let content = `/**
 * @license Copyright (c) 2003-${ date.getFullYear() }, CKSource Holding sp. z o.o. All rights reserved.
 * For licensing, see LICENSE.md.
 */

import ${ options.moduleName }Base from '${ options.editor }';
`;

	for ( const pluginName of Object.keys( plugins ) ) {
		content += `import ${ pluginName } from '${ plugins[ pluginName ] }';\n`;
	}

	content += `
export default class ${ options.moduleName } extends ${ options.moduleName }Base {}

${ options.moduleName }.build = {
	plugins: [
		${ Object.keys( plugins ).join( ',\n\t\t' ) }
	],
	config: ${ getEditorConfig( options.config ) }
};
`;

	return content;
}
