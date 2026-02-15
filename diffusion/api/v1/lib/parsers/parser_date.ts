/**
 * PARSER_DATE
 * Process diffusion object date values.
 * Port of PHP class.parser_date.php
 *
 * Converts Dédalo dd_date objects to formatted date strings.
 * Supports modes: date, range, time_range, period.
 */

import type { parser_options } from '../types';



/**
 * Data item containing date values from the PHP response.
 */
interface date_data_item {
	id?:    string | null;
	value:  date_value[];
	tipo?:  string;
	lang?:  string | null;
}

interface date_value {
	start?: dd_date_part;
	end?:   dd_date_part;
	period?: {
		year?:  number;
		month?: number;
		day?:   number;
	};
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
 * STRING_DATE
 * Generic date as string parser.
 * Converts dd_date objects to formatted strings based on configurable pattern and mode.
 *
 * @param data    - Array of data items containing date values
 * @param options - Configuration:
 *   - pattern:           Date format pattern (default 'Y-m-d')
 *   - records_separator: Separator between records (default ' | ')
 *   - fields_separator:  Separator between fields (default ', ')
 *   - date_mode:         One of 'date', 'range', 'time_range', 'period' (default 'date')
 * @returns Formatted date string or null
 */
export function string_date(data: date_data_item[] | null, options: parser_options): string | null {

	if (!data || data.length === 0) return null;

	const pattern            = (options.pattern as string)           ?? 'Y-m-d';
	const records_separator  = (options.records_separator as string) ?? ' | ';
	const fields_separator   = (options.fields_separator as string)  ?? ', ';
	const date_mode          = (options.date_mode as string)         ?? 'date';

	const ar_values: string[] = [];

	for (const data_item of data) {
		const item_values = data_item.value ?? [];

		for (const date_val of item_values) {
			switch (date_mode) {

				case 'range':
				case 'time_range': {
					const ar_date: string[] = [];
					if (date_val.start?.year !== undefined) {
						ar_date.push(format_dd_date(date_val.start, pattern));
					}
					if (date_val.end?.year !== undefined) {
						ar_date.push(format_dd_date(date_val.end, pattern));
					}
					if (ar_date.length > 0) {
						ar_values.push(ar_date.join(fields_separator));
					}
					break;
				}

				case 'period': {
					if (date_val.period) {
						const ar_period: string[] = [];
						if (date_val.period.year !== undefined) {
							ar_period.push(`${date_val.period.year} years`);
						}
						if (date_val.period.month !== undefined) {
							ar_period.push(`${date_val.period.month} months`);
						}
						if (date_val.period.day !== undefined) {
							ar_period.push(`${date_val.period.day} days`);
						}
						if (ar_period.length > 0) {
							ar_values.push(ar_period.join(fields_separator));
						}
					}
					break;
				}

				case 'date':
				default: {
					if (date_val.start?.year !== undefined) {
						ar_values.push(format_dd_date(date_val.start, pattern));
					}
					break;
				}
			}
		}
	}

	if (ar_values.length === 0) return null;

	return ar_values.join(records_separator);
}



/**
 * FORMAT_DD_DATE
 * Converts a dd_date_part object to a formatted string using PHP-style format tokens.
 * Supports: Y (4-digit year), m (2-digit month), d (2-digit day),
 *           H (2-digit hour), i (2-digit minute), s (2-digit second)
 *
 * @param date_part - The date components
 * @param pattern   - Format pattern (e.g., 'Y-m-d H:i:s')
 * @returns Formatted date string
 */
function format_dd_date(date_part: dd_date_part, pattern: string): string {

	const year   = date_part.year   ?? 0;
	const month  = date_part.month  ?? 1;
	const day    = date_part.day    ?? 1;
	const hour   = date_part.hour   ?? 0;
	const minute = date_part.minute ?? 0;
	const second = date_part.second ?? 0;

	let result = pattern;
	result = result.replace(/Y/g, String(year).padStart(4, '0'));
	result = result.replace(/m/g, String(month).padStart(2, '0'));
	result = result.replace(/d/g, String(day).padStart(2, '0'));
	result = result.replace(/H/g, String(hour).padStart(2, '0'));
	result = result.replace(/i/g, String(minute).padStart(2, '0'));
	result = result.replace(/s/g, String(second).padStart(2, '0'));

	return result;
}
