import type { data_item, parser_options } from '../types';

/**
 * MERGE_COLUMNS
 * Merges the values of specified columns into a single string.
 *
 * Receives the full row entries as data_items where item.id = column_tipo.
 * The processor injects the full row when this parser is detected.
 *
 * @param data    - Array of data items with item.id set to column tipo
 * @param options - Parser options containing 'columns' array and 'fields_separator'
 * @returns Merged string or null
 */
export function merge_columns(data: data_item[] | null, options: parser_options): string | null {
	const raw_columns = (options as any).columns;
	const columns: string[] = Array.isArray(raw_columns) ? raw_columns : (raw_columns ? [String(raw_columns)] : []);
	const fields_separator = (options as any).fields_separator !== undefined
		? String((options as any).fields_separator)
		: ' ';

	if (!data || data.length === 0 || columns.length === 0) {
		return null;
	}

	const merged: string[] = [];

	for (const item of data) {
		// item.id is the column tipo (e.g. 'actv63') injected by the processor
		if (!item || !item.id || !columns.includes(item.id)) continue;

		const val = item.value;
		if (val === undefined || val === null || val === '') continue;

		if (Array.isArray(val)) {
			const mapped = val
				.map((v) => {
					if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
						return String(v);
					}
					return JSON.stringify(v);
				})
				.filter((v) => v !== '');

			if (mapped.length > 0) {
				merged.push(mapped.join(fields_separator));
			}
		} else if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') {
			merged.push(String(val));
		} else {
			merged.push(JSON.stringify(val));
		}
	}

	return merged.length > 0 ? merged.join(fields_separator) : null;
}

let _cached_publication_timestamp: number | null = null;

/**
 * PUBLICATION_UNIX_TIMESTAMP
 * Generates a unique UNIX timestamp (seconds since epoch) for the entire diffusion process.
 * The value is memoized upon first call so that all rows receive the exact same timestamp.
 *
 * @param data    - Ignored
 * @param options - Ignored
 * @returns UNIX timestamp as an integer
 */
export function publication_unix_timestamp(data: data_item[] | null, options: parser_options): number {
	if (_cached_publication_timestamp === null) {
		_cached_publication_timestamp = Math.floor(Date.now() / 1000);
	}
	return _cached_publication_timestamp;
}

