/**
 * @license Copyright (c) 2003-2022, CKSource Holding sp. z o.o. All rights reserved.
 * For licensing, see LICENSE.md.
 */

'use strict';

/* eslint-env node */

const fs = require( 'fs' );
const path = require( 'path' );
const postcss = require( 'postcss' );
const chalk = require( 'chalk' );
const log = require( '../logger' )();
const getPackageName = require( './utils/getpackagename' );

/**
 * A PostCSS plugin that loads a theme files from specified path.
 *
 * For any CSS file processed by the PostCSS, this plugin tries to find a complementary
 * theme file and load it (knowing the path to the theme). Theme files must be organized
 * to reflect the structure of the CSS files in editor packages,
 *
 * E.g., if the path to the theme is:
 * `/foo/bar/ckeditor5-theme-foo/theme/theme.css`
 *
 * and the CSS to be themed is:
 * `/baz/qux/ckeditor5-qux/theme/components/button.css`
 *
 * the theme file for `button.css` should be located under:
 * `/foo/bar/ckeditor5-theme-foo/ckeditor5-qux/theme/components/button.css`
 *
 * See the `ThemeImporterOptions` to learn about importer options.
 *
 * To learn more about PostCSS plugins, please refer to the API
 * [documentation](http://api.postcss.org/postcss.html#.plugin) of the project.
 *
 * @param {ThemeImporterOptions} pluginOptions
 * @returns {Function} A PostCSS plugin.
 */
module.exports = ( pluginOptions = {} ) => {
	return {
		postcssPlugin: 'postcss-ckeditor5-theme-importer',
		Once( root, { result } ) {
			// Clone the options, don't alter the original options object.
			const options = Object.assign( {}, pluginOptions, {
				debug: pluginOptions.debug || false,
				postCssOptions: {
					plugins: [
						require( 'postcss-import' )(),
						require( './themelogger' )()
					]
				},
				root, result
			} );

			return importThemeFile( options );
		}
	};
};

module.exports.postcss = true;

/**
 * Imports a complementary theme file corresponding with a CSS file being processed by
 * PostCSS, if such theme file exists.
 *
 * @private
 * @param {Options} Plugin options.
 * @returns {Promise}
 */
function importThemeFile( options ) {
	const inputFilePath = options.root.source.input.file;

	// A corresponding theme file e.g. "/foo/bar/ckeditor5-theme-baz/theme/ckeditor5-qux/components/button.css".
	const themeFilePath = getThemeFilePath( options.themePath, inputFilePath );

	if ( themeFilePath ) {
		if ( options.debug ) {
			log.info( `[ThemeImporter] Loading for "${ chalk.cyan( inputFilePath ) }".` );
		}

		options.fileToImport = themeFilePath;
		options.fileToImportParent = inputFilePath;

		return importFile( options );
	}
}

/**
 * Imports a CSS file specified in the options using the postcss-import
 * plugin and appends its content to the css tree (root).
 *
 * @private
 * @param {Options} Plugin options.
 * @returns {Promise}
 */
function importFile( options ) {
	const { root, result, sourceMap } = options;
	const file = options.fileToImport;
	const parent = options.fileToImportParent;
	const processingOptions = {
		from: file,
		to: file,
		map: sourceMap ? { inline: true } : false
	};

	if ( !fs.existsSync( file ) ) {
		if ( options.debug ) {
			log.info( `[ThemeImporter] Failed to find "${ chalk.yellow( file ) }".` );
		}

		return;
	}

	return postcss( options.postCssOptions )
		.process( `@import "${ file }";`, processingOptions )
		.then( importResult => {
			// Merge the CSS trees.
			root.append( importResult.root.nodes );

			// Let the watcher know that the theme file should be observed too.
			result.messages.push( {
				file, parent,
				type: 'dependency'
			} );

			// `importResult` contains references to all dependencies that were used.
			// We need to inform the base file (the file which imports the *.css file) that these dependencies should be watched too.
			importResult.messages.forEach( message => {
				result.messages.push( message );
			} );

			if ( options.debug ) {
				log.info( `[ThemeImporter] Loaded "${ chalk.green( file ) }".` );
			}
		} )
		.catch( error => {
			throw error;
		} );
}

/**
 * For given path to the theme, and a path to the CSS file processed by
 * PostCSS, it returns a path to the complementary file in the theme.
 *
 * E.g., if the path to the theme is:
 * `/foo/bar/ckeditor5-theme-foo/theme/theme.css`
 *
 * and the CSS to be themed is:
 * `/baz/qux/ckeditor5-qux/theme/components/button.css`
 *
 * this helper will return:
 * `/foo/bar/ckeditor5-theme-foo/ckeditor5-qux/theme/components/button.css`
 *
 * @private
 * @param {String} themePath Path to the theme.
 * @param {String} inputFilePath Path to the CSS file which is to be themed.
 * @returns {String}
 */
function getThemeFilePath( themePath, inputFilePath ) {
	// ckeditor5-theme-foo/theme/theme.css -> ckeditor5-theme-foo/theme
	themePath = path.dirname( themePath );

	// "ckeditor5-qux"
	const packageName = getPackageName( inputFilePath );

	// Don't load theme file for files not belonging to a "ckeditor5-*" package.
	if ( !packageName ) {
		return;
	}

	// "components/button.css"
	const inputFileName = inputFilePath.split( path.join( packageName, 'theme', path.sep ) )[ 1 ];

	// Don't load theme file for files not belonging to "ckeditor5-*/theme" folder.
	if ( !inputFileName ) {
		return;
	}

	// A corresponding theme file e.g. "/foo/bar/ckeditor5-theme-baz/theme/ckeditor5-qux/components/button.css".
	return path.resolve( themePath, packageName, inputFileName );
}

/**
 * The configuration of the "postcss-ckeditor5-theme-importer" plugin.
 *
 * @interface ThemeImporterOptions
 */

/**
 * The path to any file belonging to the theme as resolved by `require.resolve()`.
 * E.g.
 *
 *	{
 *		...
 *		themePath: require.resolve( '@ckeditor/ckeditor5-theme-lark' ),
 *		...
 *	}
 *
 * @member {String} [ThemeImporterOptions#themePath]
 */

/**
 * When `true` it enables debug logs in the console.
 *
 * @member {String} [ThemeImporterOptions#debug=false]
 */
