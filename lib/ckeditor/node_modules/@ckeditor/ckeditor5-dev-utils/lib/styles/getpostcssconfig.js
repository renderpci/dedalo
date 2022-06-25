/**
 * @license Copyright (c) 2003-2022, CKSource Holding sp. z o.o. All rights reserved.
 * For licensing, see LICENSE.md.
 */

'use strict';

/* eslint-env node */

/**
 * Returns a PostCSS configuration to build the editor styles (e.g. used by postcss-loader).
 *
 * @param {Object} options
 * @param {Boolean} options.sourceMap When true, an inline source map will be built into the output CSS.
 * @param {Boolean} options.minify When true, the output CSS will be minified.
 * @param {ThemeImporterOptions} options.themeImporter Configuration of the theme-importer PostCSS plugin.
 * See the plugin to learn more.
 * @returns {Object} A PostCSS configuration object, e.g. to be used by the postcss-loader.
 */
module.exports = function getPostCssConfig( options = {} ) {
	const config = {
		plugins: [
			require( 'postcss-import' )(),
			require( './themeimporter' )( options.themeImporter ),
			require( 'postcss-mixins' )(),
			require( 'postcss-nesting' )( {
				// https://github.com/ckeditor/ckeditor5/issues/11730
				noIsPseudoSelector: true
			} ),
			require( './themelogger' )()
		]
	};

	if ( options.sourceMap ) {
		config.sourceMap = 'inline';
	}

	if ( options.minify ) {
		config.plugins.push( require( 'cssnano' )( {
			preset: 'default',
			autoprefixer: false,
			reduceIdents: false
		} ) );
	}

	return config;
};
