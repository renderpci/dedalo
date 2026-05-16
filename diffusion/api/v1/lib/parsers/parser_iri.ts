/**
 * PARSER_IRI
 * Process diffusion object IRI values (component_iri).
 *
 * Each data item value is expected to have the shape:
 *   { iri: string, title?: string }
 *
 * Example input:
 *   [
 *     { iri: "https://dedalo.dev",  title: "Official Dédalo web" },
 *     { iri: "https://other.es",    title: "other" }
 *   ]
 *
 * Example output (default options):
 *   "Official Dédalo web, https://dedalo.dev | other, https://other.es"
 */

import type { parser_options, data_item } from '../types';




/**
 * Shape of the IRI value object stored in data_item.value.
 */
interface iri_value {
	iri:    string;
	title?: string | null;
}



/**
 * FLAT
 * Joins IRI records into a flat string.
 *
 * For each data item whose `.value` is an `{ iri, title? }` object (or an
 * array of such objects), the function formats each entry as:
 *   "<title><fields_separator><iri>"   when a non-empty title is present
 *   "<iri>"                             when there is no title
 *
 * Individual formatted IRI entries (whether from a single object or an array)
 * are joined with `records_separator`.
 *
 * @param data    - Array of data items; each value may be an iri_value or iri_value[].
 * @param options - {
 *   fields_separator?:  string  – separates title and iri within one entry  (default ", ")
 *   records_separator?: string  – separates records (data items)             (default " | ")
 * }
 * @returns Formatted string wrapped in a data_item array, or null.
 *
 * @example
 *   const data = [
 *     { value: [{ iri: "https://dedalo.dev", title: "Official Dédalo web" },
 *               { iri: "https://other.es",   title: "other" }] 
 * 		}
 *   ];
 *   flat(data, {});
 *   // → [{ value: "Official Dédalo web, https://dedalo.dev | other, https://other.es" }]
 */
export function flat(data: data_item[] | null, options: parser_options): any {

	if (!data || data.length === 0) return null;

	const fields_separator  = (options.fields_separator  as string) ?? ', ';
	const records_separator = (options.records_separator as string) ?? ' | ';

	const all_formatted_entries: string[] = [];

	for (const item of data) {

		const raw = item.value;
		if (raw === null || raw === undefined) continue;

		// Normalise to array so both single objects and arrays are handled uniformly
		const entries: iri_value[] = Array.isArray(raw)
			? (raw as iri_value[])
			: [raw as iri_value];

		for (const entry of entries) {
			if (!entry || typeof entry !== 'object') continue;

			const iri   = entry.iri?.trim()   ?? '';
			const title = entry.title?.trim() ?? '';

			if (!iri) continue;

			// Build "title<sep>iri" or just "iri" when title is absent
			const formatted = title
				? `${title}${fields_separator}${iri}`
				: iri;

			all_formatted_entries.push(formatted);
		}
	}

	if (all_formatted_entries.length === 0) return null;

	return [{
		id:    null,
		value: all_formatted_entries.join(records_separator),
		tipo:  data[0].tipo,
		lang:  data[0].lang
	}];
}
