/**
 * PARSER_DATE
 * Process diffusion object date values.
 * Port of PHP class.parser_date.php
 *
 * Converts Dédalo dd_date objects to formatted date strings.
 * Supports modes: date, range, time_range, period.
 */

import type { parser_options } from '../types';



// =====================================================
// Data item type
// =====================================================

interface data_item {
	id?:    string | null;
	value:  any;
	tipo?:  string;
	lang?:  string | null;
}

interface dd_date_part {
	year?:   number;
	month?:  number;
	day?:    number;
	hour?:   number;
	minute?: number;
	second?: number;
}



/**
 * SELECT_PROPERTIES
 * Extracts specified properties (start, end, period) from date objects.
 * Each date value is an object like { start: {...}, end: {...}, period: {...} }.
 * This parser selects only the requested properties and flattens them.
 *
 * Default: ["start"]
 *
 * @param data    - Array of data items containing date values
 * @param options - { properties: string[] }  e.g. ["start"] or ["start", "end"]
 * @returns Array of data items with extracted date parts
 */
export function select_properties(data: data_item[] | null, options: parser_options): data_item[] | null {

	if (!data || data.length === 0) return null;

	const properties: string[] = (options.properties as string[]) ?? ['start'];
	const result: data_item[] = [];

	for (const item of data) {
		const val = item.value;
		const values = Array.isArray(val) ? val : [val];

		const extracted: any[] = [];

		for (const date_obj of values) {
			if (!date_obj || typeof date_obj !== 'object') continue;

			for (const prop of properties) {
				if (date_obj[prop] !== undefined && date_obj[prop] !== null) {
					extracted.push(date_obj[prop]);
				}
			}
		}

		if (extracted.length > 0) {
			result.push({
				...item,
				value: extracted
			});
		}
	}

	return result.length > 0 ? result : null;
}



/**
 * SELECT_KEYS
 * Picks array elements by index. Pads missing month/day with 0 for SQL compatibility.
 *
 * Default keys: [0]
 *
 * @param data    - Array of data items whose value is an array of dd_date_parts
 * @param options - { keys: number[] }  e.g. [0] or [0, 1]
 * @returns Array of data items with selected elements
 */
export function select_keys(data: data_item[] | null, options: parser_options): data_item[] | null {

	if (!data || data.length === 0) return null;

	const keys: number[] = (options.keys as number[]) ?? [0];
	const result: data_item[] = [];

	for (const item of data) {
		const val = item.value;
		const values = Array.isArray(val) ? val : [val];

		const selected: any[] = [];

		for (const key_index of keys) {
			if (key_index < values.length && values[key_index] !== undefined) {
				const date_part = values[key_index];

				// Pad missing date fields with 0 for SQL compatibility
				if (date_part && typeof date_part === 'object') {
					if (date_part.month === undefined || date_part.month === null) {
						date_part.month = 0;
					}
					if (date_part.day === undefined || date_part.day === null) {
						date_part.day = 0;
					}
				}

				selected.push(date_part);
			}
		}

		if (selected.length > 0) {
			result.push({
				...item,
				value: selected
			});
		}
	}

	return result.length > 0 ? result : null;
}



/**
 * FORMAT_STRING_DATE
 * Formats dd_date_part objects to string using a pattern.
 *
 * Default pattern: "Y-m-d"
 * Default records_separator: " | "
 * Default fields_separator: ", "
 *
 * Supported tokens: Y (4-digit year), m (2-digit month), d (2-digit day),
 *                   H (2-digit hour), i (2-digit minute), s (2-digit second)
 *
 * @param data    - Array of data items whose value is an array of dd_date_parts
 * @param options - { pattern, records_separator, fields_separator }
 * @returns Array of data items with formatted string as value
 */
export function format_string_date(data: data_item[] | null, options: parser_options): data_item[] | null {

	if (!data || data.length === 0) return null;

	const pattern           = (options.pattern as string)           ?? 'Y-m-d';
	const records_separator = (options.records_separator as string) ?? ' | ';
	const fields_separator  = (options.fields_separator as string)  ?? ', ';

	const result: data_item[] = [];

	for (const item of data) {
		const val = item.value;
		const values = Array.isArray(val) ? val : [val];

		const formatted_parts: string[] = [];

		for (const date_part of values) {
			if (date_part && typeof date_part === 'object') {
				formatted_parts.push(format_dd_date(date_part as dd_date_part, pattern));
			}
		}

		if (formatted_parts.length > 0) {
			result.push({
				...item,
				value: formatted_parts.join(fields_separator)
			});
		}
	}

	// If multiple records, join them
	if (result.length > 1) {
		const combined = result.map(r => r.value).join(records_separator);
		return [{
			...result[0],
			value: combined
		}];
	}

	return result.length > 0 ? result : null;
}



/**
 * STRING_DATE
 * Global parser that chains: select_properties → select_keys → format_string_date.
 * All options are optional with sensible defaults.
 *
 * @param data    - Array of data items containing date values
 * @param options - Combined options for all three sub-parsers:
 *   - select:             string[] (default: ["start"])
 *   - keys:               number[] (default: [0])
 *   - pattern:            string   (default: "Y-m-d")
 *   - records_separator:  string   (default: " | ")
 *   - fields_separator:   string   (default: ", ")
 * @returns Array of data items with formatted date string
 */
export function string_date(data: data_item[] | null, options: parser_options): data_item[] | null {

	if (!data || data.length === 0) return null;

	// Merge defaults
	const merged_options: parser_options = {
		select:            ['start'],
		keys:              [0],
		pattern:           'Y-m-d',
		records_separator: ' | ',
		fields_separator:  ', ',
		...options
	};

	// Step 1: select_properties
	let result = select_properties(data, merged_options);

	// Step 2: select_keys
	result = select_keys(result, merged_options);

	// Step 3: format_string_date
	result = format_string_date(result, merged_options);

	return result;
}


/**
 * DEFAULT
 * Port of PHP component_date::get_diffusion_value().
 * Mode-aware parser that converts dd_date objects to a diffusion-ready string.
 *
 * Modes (resolved via options.date_mode):
 *   - 'range' | 'time_range' : "start_ts,end_ts"  (comma-separated, "Y-m-d H:i:s")
 *   - 'period'               : "N years N months N days" (human-readable, localized labels)
 *   - 'date' | default       : "Y-m-d H:i:s" of the start date-part
 *
 * Returns only the first collected value (mirrors PHP "Temporal !!" behaviour).
 * Returns null when data is empty or no valid date part is found.
 *
 * @param data    - Array of data items containing date values
 * @param options - { date_mode?: string }
 * @returns Array with a single data item whose value is the formatted string, or null
 */
export default function (data: data_item[] | null, options: parser_options): data_item[] | null {

	if (!data || data.length === 0) return null;

	const date_mode = (options.date_mode as string) ?? 'date';

	const ar_diffusion_values: string[]  = [];
	const ar_period_items:     data_item[] = []; // per-lang items for period mode

	for (const item of data) {
		const val    = item.value;
		const values = Array.isArray(val) ? val : [val];

		for (const date_obj of values) {
			if (!date_obj || typeof date_obj !== 'object') continue;

			switch (date_mode) {

				case 'range':
				case 'time_range': {
					const ar_date: string[] = [];
					if (date_obj.start && date_obj.start.year !== undefined) {
						ar_date.push(format_dd_date(date_obj.start as dd_date_part, 'Y-m-d H:i:s'));
					}
					if (date_obj.end && date_obj.end.year !== undefined) {
						ar_date.push(format_dd_date(date_obj.end as dd_date_part, 'Y-m-d H:i:s'));
					}
					if (ar_date.length > 0) {
						ar_diffusion_values.push(ar_date.join(','));
					}
					break;
				}

				case 'period': {
					if (date_obj.period) {
						const period = date_obj.period as dd_date_part;

						// Build the period string for a given lang code
						const build_period_string = (target_lang: string): string | null => {
							const parts: string[] = [];
							if (period.year  !== undefined) parts.push(period.year  + ' ' + get_label('years',  target_lang));
							if (period.month !== undefined) parts.push(period.month + ' ' + get_label('months', target_lang));
							if (period.day   !== undefined) parts.push(period.day   + ' ' + get_label('days',   target_lang));
							return parts.length > 0 ? parts.join(' ') : null;
						};

						const target_langs = langs_config.langs;

						if (target_langs.length > 0) {
							// Emit one result item per known lang
							for (const target_lang of target_langs) {
								const period_str = build_period_string(target_lang);
								if (period_str) {
									ar_period_items.push({ ...item, lang: target_lang, value: period_str });
								}
							}
						} 
					}
					break;
				}

				case 'date':
				default: {
					if (date_obj.start && date_obj.start.year !== undefined) {
						ar_diffusion_values.push(format_dd_date(date_obj.start as dd_date_part, 'Y-m-d H:i:s'));
					}
					break;
				}
			}
		}
	}// end for

	// Period mode: return per-lang items directly
	if (ar_period_items.length > 0) {
		return ar_period_items;
	}

	if (ar_diffusion_values.length === 0) return null;

	// Mirror PHP: only the first value is used ("Temporal !!")
	const diffusion_value = ar_diffusion_values[0] || null;

	if (!diffusion_value) return null;

	return [{
		...data[0],
		value: diffusion_value
	}];
}



/**
 * UNIX_TIMESTAMP
 * Converts dd_date objects to Unix timestamp (seconds since epoch).
 * Chains: select_properties → select_keys → convert to timestamp.
 *
 * Default: select=["start"], keys=[0]
 *
 * @param data    - Array of data items containing date values
 * @param options - { select: string[], keys: number[] }
 * @returns Array of data items with Unix timestamp (int) as value
 */
export function unix_timestamp(data: data_item[] | null, options: parser_options): data_item[] | null {

	if (!data || data.length === 0) return null;

	const merged_options: parser_options = {
		select: ['start'],
		keys:       [0],
		...options
	};

	// Step 1: select_properties
	let result = select_properties(data, merged_options);

	// Step 2: select_keys (also pads missing month/day with 0)
	result = select_keys(result, merged_options);

	if (!result || result.length === 0) return null;

	// Step 3: convert to unix timestamp
	const final_result: data_item[] = [];

	for (const item of result) {
		const val = item.value;
		const values = Array.isArray(val) ? val : [val];

		for (const date_part of values) {
			if (date_part && typeof date_part === 'object') {
				const ts = dd_date_to_unix(date_part as dd_date_part);
				final_result.push({
					...item,
					value: ts
				});
			}
		}
	}

	return final_result.length > 0 ? final_result : null;
}



// =====================================================
// Helpers
// =====================================================

/**
 * GET_LABEL
 * Returns a localized human-readable label for date period units.
 * Mirrors PHP's label::get_label() for the keys used by component_date.
 *
 * @param key  - 'years' | 'months' | 'days'
 * @param lang - Language code (e.g. 'en', 'es')
 * @returns Localized label string
 */
function get_label(key: 'years' | 'months' | 'days', lang: string): string {

	// Map Dédalo lang codes (e.g. "lg-spa") to the short key used in the label table.
	// Falls back to the lang string itself for direct short-code usage.
	const lang_code_map: Record<string, string> = {
		'lg-eng': 'en',
		'lg-spa': 'es',
		'lg-cat': 'ca',
		'lg-fra': 'fr',
		'lg-deu': 'de',
		'lg-por': 'pt',
		'lg-ita': 'it',
		'lg-nob': 'no',
		'lg-swe': 'sv',
		'lg-nld': 'nl',
	};
	const short = lang_code_map[lang] ?? lang;

	const labels: Record<string, Record<string, string>> = {
		years:  { en: 'years',  es: 'años',   ca: 'anys',  fr: 'ans',   de: 'Jahre',  pt: 'anos',  it: 'anni',  no: 'år',   sv: 'år',   nl: 'jaar'   },
		months: { en: 'months', es: 'meses',  ca: 'mesos', fr: 'mois',  de: 'Monate', pt: 'meses', it: 'mesi',  no: 'mnd',  sv: 'mån',  nl: 'maanden' },
		days:   { en: 'days',   es: 'días',   ca: 'dies',  fr: 'jours', de: 'Tage',   pt: 'dias',  it: 'giorni', no: 'dager', sv: 'dagar', nl: 'dagen' },
	};
	return labels[key]?.[short] ?? labels[key]?.['en'] ?? key;
}

/**
 * FORMAT_DD_DATE
 * Converts a dd_date_part object to a formatted string using PHP-style format tokens.
 *
 * @param date_part - The date components
 * @param pattern   - Format pattern (e.g., 'Y-m-d H:i:s')
 * @returns Formatted date string
 */
function format_dd_date(date_part: dd_date_part, pattern: string): string {

	const year   = date_part.year   ?? 0;
	const month  = date_part.month  ?? 0;
	const day    = date_part.day    ?? 0;
	const hour   = date_part.hour   ?? 0;
	const minute = date_part.minute ?? 0;
	const second = date_part.second ?? 0;

	// PHP sprintf('%04d', year) style padding
	let year_str = String(year);
	if (year < 0) {
		year_str = '-' + String(Math.abs(year)).padStart(3, '0');
	} else {
		year_str = year_str.padStart(4, '0');
	}

	let result = pattern;
	result = result.replace(/Y/g, year_str);
	result = result.replace(/m/g, String(month).padStart(2, '0'));
	result = result.replace(/d/g, String(day).padStart(2, '0'));
	result = result.replace(/H/g, String(hour).padStart(2, '0'));
	result = result.replace(/i/g, String(minute).padStart(2, '0'));
	result = result.replace(/s/g, String(second).padStart(2, '0'));

	return result;
}



/**
 * DD_DATE_TO_UNIX
 * Converts a dd_date_part to Unix timestamp (seconds since 1970-01-01).
 *
 * @param date_part - The date components
 * @returns Unix timestamp as integer
 */
function dd_date_to_unix(date_part: dd_date_part): number {

	const year   = date_part.year   ?? 1970;
	const month  = (date_part.month  ?? 1) - 1; // JS months are 0-indexed
	const day    = date_part.day    ?? 1;
	const hour   = date_part.hour   ?? 0;
	const minute = date_part.minute ?? 0;
	const second = date_part.second ?? 0;

	const date = new Date(Date.UTC(year, month, day, hour, minute, second));

	return Math.floor(date.getTime() / 1000);
}
