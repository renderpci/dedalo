/**
 * Parity gate: the import filename grammar (tool_import_files::get_file_data
 * regex) matches the PHP oracle byte-for-byte. The PHP uses a PCRE CONDITIONAL
 * regex that JS cannot express; the TS reimplementation (parseFilename) must
 * agree. Expected values were produced by running the EXACT PHP regex
 *   /^(\d*)?-?(?(?=.\.)|(.*?))(?(?=-)-([a-zA-Z]{1,2})|)\.([a-zA-Z]{3,4})$/
 * against each input (see the fn_oracle.php probe in the commit notes).
 */

import { describe, expect, test } from 'bun:test';
import { parseFilename } from '../../tools/tool_import_files/server/filename_grammar.ts';

// input → PHP oracle regex_data (full_name/section_id/base_name/letter/extension).
const ORACLE: Record<
	string,
	[string | null, string | null, string | null, string | null, string | null]
> = {
	'73-my image-A.tiff': ['73-my image-A.tiff', '73', 'my image', 'A', 'tiff'],
	'73-A.tiff': ['73-A.tiff', '73', '', 'A', 'tiff'],
	'73.jpg': ['73.jpg', '73', '', '', 'jpg'],
	'73-my image.tif': ['73-my image.tif', '73', 'my image', '', 'tif'],
	'My image-A.tiff': ['My image-A.tiff', '', 'My image', 'A', 'tiff'],
	'My image.tiff': ['My image.tiff', '', 'My image', '', 'tiff'],
	'foo-AB.jpg': ['foo-AB.jpg', '', 'foo', 'AB', 'jpg'],
	'2024 photo.png': ['2024 photo.png', '2024', ' photo', '', 'png'], // leading space preserved
	noext: [null, null, null, null, null],
	'a.b': [null, null, null, null, null], // 1-char ext → no match
	'archive.tar': ['archive.tar', '', 'archive', '', 'tar'],
	'12-.png': ['12-.png', '12', '', '', 'png'],
};

describe('import filename grammar (parity with PHP get_file_data)', () => {
	for (const [input, [full, id, base, letter, ext]] of Object.entries(ORACLE)) {
		test(`parseFilename(${JSON.stringify(input)})`, () => {
			const out = parseFilename(input);
			expect(out.full_name).toBe(full);
			expect(out.section_id).toBe(id);
			expect(out.base_name).toBe(base);
			expect(out.letter).toBe(letter);
			expect(out.extension).toBe(ext);
		});
	}
});
