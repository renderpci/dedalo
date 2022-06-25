/**
 * @license Copyright (c) 2003-2022, CKSource Holding sp. z o.o. All rights reserved.
 * For licensing, see LICENSE.md.
 */

'use strict';

const path = require( 'path' );

/**
 * Transforms specified an array of plugin paths to an object contains plugin names
 * and paths to the plugins.
 *
 * Names of plugins returned in the object will be always unique.
 *
 * In case of two ore more plugins will have the same name:
 *   - typing => TypingPlugin
 *   - path/to/other/plugin/typing => Typing1Plugin
 *
 * @param {Array.<String>} pluginPaths
 * @returns {Object}
 */
module.exports = function getPlugins( pluginPaths ) {
	const plugins = {};

	pluginPaths.forEach( pathToFile => {
		const basePluginName = capitalize( path.basename( pathToFile, '.js' ) );
		let pluginName = basePluginName + 'Plugin';
		let i = 0;

		while ( pluginName in plugins ) {
			pluginName = basePluginName + ( ++i ).toString() + 'Plugin';
		}

		plugins[ pluginName ] = pathToFile;
	} );

	return plugins;
};

function capitalize( string ) {
	return string.charAt( 0 ).toUpperCase() + string.slice( 1 );
}
