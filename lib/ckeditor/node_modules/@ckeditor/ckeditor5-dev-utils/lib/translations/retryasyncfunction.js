/**
 * @license Copyright (c) 2003-2022, CKSource Holding sp. z o.o. All rights reserved.
 * For licensing, see LICENSE.md.
 */

'use strict';

const logger = require( '../logger' )();

/**
 * Runs hazardous function few times until the function's promise succeed.
 *
 * @param {Function} fn Function which will be called few times until the function's promise succeed.
 * @param {Object} [options={ times:5, delay:100 }] Options.
 * @param {Number} [options.times=5] Times of retrying.
 * @param {Number} [options.delay=100] Delay between fn calls. Useful for testing.
 * @returns {Promise}
 */
module.exports = function retryAsyncFunction( fn, { times = 5, delay = 100 } = {} ) {
	return new Promise( ( res, rej ) => {
		retry();

		function retry() {
			const result = fn();
			times--;

			if ( times === 0 ) {
				return result.then( res ).catch( rej );
			}

			result.then( res )
				.catch( err => {
					logger.error( err );
					logger.info( `Trying again after ${ delay }ms...` );

					wait( delay ).then( retry );
				} );
		}
	} );
};

function wait( milliseconds ) {
	return new Promise( res => setTimeout( res, milliseconds ) );
}
