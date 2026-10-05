// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*eslint no-undef: "error"*/

/**
 * PROBE_FACTS
 * Pure: the public-URL probe facts (phase 6) one host row shows under its
 * `public_gate` check — when the gate was last probed and, when the server
 * gave one, why it is not proven. The check row itself (state + answers) is
 * the shared check_row; these are its two fact rows, as [label_key, fallback,
 * value] triples rendered by fact_row (TEXT, never HTML: the detail names
 * operator paths). A row without `public_probe` (an older server) shows none.
 * No imports: unit-tested from test/unit (publication_host_probe_client.test.ts).
 * @param {Object|null} row - one host row from get_value
 * @returns {Array<[string, string, string]>}
 */
export const probe_facts = (row) => {
	const probe = row && typeof row.public_probe === 'object' ? row.public_probe : null;
	if (probe === null) {
		return [];
	}
	const facts = [
		[
			'publication_hosts_probe_at',
			'Last public probe',
			typeof probe.at === 'string' ? probe.at : '',
		],
	];
	if (typeof probe.detail === 'string' && probe.detail.length > 0) {
		facts.push(['publication_hosts_probe_detail', 'Public gate detail', probe.detail]);
	}
	return facts;
}; //end probe_facts

// @license-end
