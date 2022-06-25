/**
 * @license Copyright (c) 2003-2022, CKSource Holding sp. z o.o. All rights reserved.
 * For licensing, see LICENSE.md.
 */

'use strict';

const path = require( 'path' );
const PassThrough = require( 'stream' ).PassThrough;
const through = require( 'through2' );

const stream = {
	/**
	 * Creates a simple duplex stream.
	 *
	 * @param {Function} [callback] A callback which will be executed with each chunk.
	 * The callback can return a Promise to perform async actions before other chunks are accepted.
	 * @returns {Stream}
	 */
	noop( callback ) {
		if ( !callback ) {
			return new PassThrough( { objectMode: true } );
		}

		return through( { objectMode: true }, ( chunk, encoding, throughCallback ) => {
			const callbackResult = callback( chunk );

			if ( callbackResult instanceof Promise ) {
				callbackResult
					.then( () => {
						throughCallback( null, chunk );
					} )
					.catch( err => {
						throughCallback( err );
					} );
			} else {
				throughCallback( null, chunk );
			}
		} );
	},

	/**
	 * Checks whether a file is a test file.
	 *
	 * @param {Vinyl} file
	 * @returns {Boolean}
	 */
	isTestFile( file ) {
		// TODO this should be based on bender configuration (config.tests.*.paths).
		if ( !file.relative.startsWith( 'tests' + path.sep ) ) {
			return false;
		}

		const dirFrags = file.relative.split( path.sep );

		return !dirFrags.some( dirFrag => {
			return dirFrag.startsWith( '_' ) && dirFrag != '_utils-tests';
		} );
	},

	/**
	 * Checks whether a file is a source file.
	 *
	 * @param {Vinyl} file
	 * @returns {Boolean}
	 */
	isSourceFile( file ) {
		return !stream.isTestFile( file );
	},

	/**
	 * Checks whether a file is a JS file.
	 *
	 * @param {Vinyl} file
	 * @returns {Boolean}
	 */
	isJSFile( file ) {
		return file.path.endsWith( '.js' );
	}
};

module.exports = stream;
