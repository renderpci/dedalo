/**
 * @license Copyright (c) 2003-2022, CKSource Holding sp. z o.o. All rights reserved.
 * For licensing, see LICENSE.md.
 */

'use strict';

const PO = require( 'pofile' );

/**
 * Returns translations stripped from the personal data, but with an added banner
 * containing information where to add new translations or fix the existing ones.
 *
 * @param {String} poFileContent Content of the translation file.
 * @param {Object} [options={}]
 * @param {Boolean} [options.simplifyLicenseHeader] Whether to skip adding the contribute URL in the header.
 * @returns {String}
 */
module.exports = function cleanPoFileContent( poFileContent, options = {} ) {
	const po = PO.parse( poFileContent );

	// Remove personal data from headers.
	po.headers = {
		Language: po.headers.Language,
		'Language-Team': po.headers[ 'Language-Team' ],
		'Plural-Forms': po.headers[ 'Plural-Forms' ]
	};

	const copyright = po.comments.find( comment => comment.includes( 'Copyright' ) );

	// Clean comments.
	po.comments = [
		'                                    !!! IMPORTANT !!!',
		'',
		'        Before you edit this file, please keep in mind that contributing to the project',
		'               translations is possible ONLY via the Transifex online service.',
		''
	];

	if ( copyright ) {
		po.comments.unshift( copyright, '' );
	}

	if ( !options.simplifyLicenseHeader ) {
		po.comments.push(
			'        To submit your translations, visit https://www.transifex.com/ckeditor/ckeditor5.',
			'',
			'                  To learn more, check out the official contributor\'s guide:',
			'    https://ckeditor.com/docs/ckeditor5/latest/framework/guides/contributing/contributing.html',
			''
		);
	}

	return po.toString();
};
