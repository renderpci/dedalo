/**
 * @license Copyright (c) 2003-2022, CKSource Holding sp. z o.o. All rights reserved.
 * For licensing, see LICENSE.md.
 */

'use strict';

const path = require( 'path' );
const webpack = require( 'webpack' );
const TerserPlugin = require( 'terser-webpack-plugin' );
const bundler = require( '../bundler' );
const styles = require( '../styles' );
const tools = require( '../tools' );
const CKEditorWebpackPlugin = require( '@ckeditor/ckeditor5-dev-webpack-plugin' );

/**
 * Returns a webpack configuration that creates a bundle file for the specified package. Thanks to that, plugins exported
 * by the package can be added to DLL builds.
 *
 * @param {Object} options
 * @param {String} options.themePath An absolute path to the theme package.
 * @param {String} options.packagePath An absolute path to the root directory of the package.
 * @param {String} options.manifestPath An absolute path to the CKEditor 5 DLL manifest file.
 * @param {Boolean} [options.isDevelopmentMode=false] Whether to build a dev mode of the package.
 * @returns {Object}
 */
module.exports = function getDllPluginWebpackConfig( options ) {
	const packageName = tools.readPackageName( options.packagePath );

	const webpackConfig = {
		mode: options.isDevelopmentMode ? 'development' : 'production',

		performance: { hints: false },

		entry: path.join( options.packagePath, 'src', 'index.js' ),

		output: {
			library: [ 'CKEditor5', getGlobalKeyForPackage( packageName ) ],

			path: path.join( options.packagePath, 'build' ),
			filename: getIndexFileName( packageName ),
			libraryTarget: 'window'
		},

		optimization: {
			minimize: false
		},

		plugins: [
			new CKEditorWebpackPlugin( {
				// UI language. Language codes follow the https://en.wikipedia.org/wiki/ISO_639-1 format.
				language: 'en',
				additionalLanguages: 'all',
				sourceFilesPattern: /^src[/\\].+\.js$/,
				skipPluralFormFunction: true
			} ),
			new webpack.BannerPlugin( {
				banner: bundler.getLicenseBanner(),
				raw: true
			} ),
			new webpack.DllReferencePlugin( {
				manifest: require( options.manifestPath ),
				scope: 'ckeditor5/src',
				name: 'CKEditor5.dll'
			} )
		],

		resolve: {
			extensions: [ '.ts', '.js', '.json' ]
		},

		module: {
			rules: [
				{
					test: /\.svg$/,
					use: [ 'raw-loader' ]
				},
				{
					test: /\.css$/,
					use: [
						{
							loader: 'style-loader',
							options: {
								injectType: 'singletonStyleTag',
								attributes: {
									'data-cke': true
								}
							}
						},
						'css-loader',
						{
							loader: 'postcss-loader',
							options: {
								postcssOptions: styles.getPostCssConfig( {
									themeImporter: {
										themePath: options.themePath
									},
									minify: true
								} )
							}
						}
					]
				},
				{
					test: /\.ts$/,
					use: [ 'ts-loader' ]
				}
			]
		}
	};

	if ( options.isDevelopmentMode ) {
		webpackConfig.devtool = 'source-map';
	} else {
		webpackConfig.optimization.minimize = true;

		webpackConfig.optimization.minimizer = [
			new TerserPlugin( {
				terserOptions: {
					output: {
						// Preserve CKEditor 5 license comments.
						comments: /^!/
					}
				},
				extractComments: false
			} )
		];
	}

	return webpackConfig;
};

/**
 * Transforms the package name (`@ckeditor/ckeditor5-foo-bar`) to the name that will be used while
 * exporting the library into the global scope.
 *
 * @param {String} packageName
 * @returns {String}
 */
function getGlobalKeyForPackage( packageName ) {
	return packageName
		.replace( /^@ckeditor\/ckeditor5?-/, '' )
		.replace( /-([a-z])/g, ( match, p1 ) => p1.toUpperCase() );
}

/**
 * Extracts the main file name from the package name.
 *
 * @param packageName
 * @returns {String}
 */
function getIndexFileName( packageName ) {
	return packageName.replace( /^@ckeditor\/ckeditor5?-/, '' ) + '.js';
}
