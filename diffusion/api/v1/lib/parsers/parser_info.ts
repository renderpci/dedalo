/**
 * PARSER_INFO
 * Process diffusion object info values.
 */

import type { parser_options, data_item } from '../types';




/**
 * WIDGET
 * Filters component_info dato items by widget name and id, then collects their values.
 * Port of PHP component_info::get_diffusion_dato().
 *
 * Each dato item is expected to have the shape:
 *   { widget: string, key: number, id: string, value: unknown }
 *
 * @param data    - Array of data_items whose `.value` is a widget-dato array (or a single object)
 * @param options - {
 *   widget_name: string[]   – list of widget function names to match (e.g. ["get_archive_weights"])
 *   select:      string[]   – parallel list of `id` values to select (e.g. ["media_diameter"])
 *   keys?:       number[]   – direct positional keys into the collected values array (e.g. [0] picks first, [0,2] picks first and third); omit to keep all
 * }
 * @returns Array of data_items with collected values, or null when nothing matches
 */
export function widget(data: data_item[] | null, options: parser_options): data_item[] | null {

	if (!data || data.length === 0) return null;

	const widget_name: string[] = (options.widget_name as string[]) ?? [];
	const select:      string[] = (options.select      as string[]) ?? [];
	const keys:        number[] | null = (options.keys as number[]) ?? null;

	const collected: unknown[] = [];

	for (const item of data) {
		// The raw dato may be stored as an array directly in item.value
		const data_array: any[] = Array.isArray(item.value) ? item.value : [item.value];

		for (let i = 0; i < widget_name.length; i++) {
			const current_widget_name = widget_name[i];
			const current_select      = select[i]      ?? null;

			// Filter dato items matching widget + id (mirrors PHP array_filter)
			const matched = data_array.filter(
				(el: any) => el?.widget === current_widget_name && el?.id === current_select
			);

			for (const el of matched) {
				collected.push(el.value);
			}
		}
	}

	if (collected.length === 0) return null;

	// Apply keys selector
	const final_values: unknown[] = keys
		? keys.filter(i => i < collected.length).map(i => collected[i])
		: collected;

	// Re-wrap as data_items, preserving metadata from the first source item
	return final_values.map(v => ({
		...data[0],
		value: v
	}));
}



/**
 * DEFAULT
 * Port of PHP component_info::get_diffusion_value().
 * Processes a component_info diffusion value:
 *   1. Skips null/empty values.
 *   2. Strips <mark> / </mark> tags (untranslated markers) from the string.
 *   3. Applies keys index-based slicing when provided:
 *        - Splits the value by `record_separator` (default ", "),
 *        - Keeps only the parts whose 0-based index is listed in `keys`,
 *        - Rejoins them with the same record_separator.
 *
 * Options:
 *   keys?:  number[]  – 0-based indices to keep after splitting
 *   record_separator?:   string    – delimiter used to split/join (default ", ")
 *
 * @param data    - Array of data items whose `.value` is a string
 * @param options - Parser options (keys, record_separator)
 * @returns Array of processed data items, or null when nothing remains
 */
export default function (data: data_item[] | null, options: parser_options): data_item[] | null {

	if (!data || data.length === 0) return null;

	const keys: number[] | null = Array.isArray(options.keys)
		? (options.keys as number[])
		: null;
	const record_separator: string = (options.record_separator as string) ?? ', ';

	const result: data_item[] = [];

	for (const item of data) {

		// null/empty guard
		const raw = item.value;
		if (raw === null || raw === undefined || raw === '') continue;

		// Coerce to string (mirrors PHP to_string())
		let value = typeof raw === 'string' ? raw : String(raw);

		// Strip <mark> / </mark> tags (PHP: preg_replace("/<\/?mark>/", "", …))
		value = value.replace(/<\/?mark>/g, '');

		if (value === '') continue;

		// keys slicing (mirrors PHP case isset($option_obj->keys))
		if (keys !== null) {
			const beats = value.split(record_separator);
			const selection = beats.filter((_part, index) => keys.includes(index));
			value = selection.join(record_separator);
		}

		if (value === '') continue;

		result.push({
			...item,
			value
		});
	}

	return result.length > 0 ? result : null;
}


