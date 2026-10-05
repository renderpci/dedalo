// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*eslint no-undef: "error"*/

/**
 * HAS_MEDIA_COPY
 * Pure: does this publication-host panel row carry a `media_copy` check?
 * The server appends that check to every host except one its agent says (live
 * media_mode) or said is not a copy host and that holds nothing
 * (src/core/publication_host/media_copy_status.ts),
 * so its presence is the "Reconcile media copy" button's condition.
 * No imports: unit-tested from test/unit (publication_host_media_copy_client.test.ts).
 * @param {Object|null} row - one host row from get_value
 * @returns {boolean}
 */
export const has_media_copy = (row) => {
	const checks = row && Array.isArray(row.checks) ? row.checks : [];
	return checks.some(
		(check) => check !== null && typeof check === 'object' && check.id === 'media_copy',
	);
}; //end has_media_copy

// @license-end
