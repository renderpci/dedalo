/**
 * truncate_html — faithful port of PHP component_string_common::truncate_html
 * (:537-686). Used by text_area list values (max_chars 130 by default; the
 * fallback list path uses 200).
 *
 * Behavior contract (must match PHP byte-for-byte on real data):
 * - if the PLAIN text (tags stripped) fits in `length`, return input unchanged;
 * - scan tag/text pairs; tags are appended uncounted; void elements ignored
 *   for the open-tag stack; comments passed through;
 * - text length counts HTML entities as ONE character;
 * - cut at the last word boundary (space) unless `exact`;
 * - append `ending` ('...') and close all still-open tags in stack order.
 */

const VOID_ELEMENT_PATTERN =
	/^<(\s*.+?\/\s*|\s*(area|base|basefont|br|col|embed|frame|hr|img|input|isindex|link|meta|param|source|track|wbr|command|keygen|menuitem)(\s.+?)?)>$/is;
const ENTITY_PATTERN = /&[0-9a-z]{2,8};|&#[0-9]{1,7};|&#x[0-9a-f]{1,6};/gi;

export function truncateHtml(
	length: number,
	text: string,
	considerHtml = true,
	ending = '...',
	exact = false,
): string {
	let truncate = '';
	let openTags: string[] = [];

	if (considerHtml) {
		// Whole text fits? (plain length, tags stripped)
		if (text.replace(/<.*?>/g, '').length <= length) {
			return text;
		}
		// Split into (tag?, text) pairs — PHP preg_match_all('/(<.+?>)?([^<>]*)/s').
		const lines = [...text.matchAll(/(<.+?>)?([^<>]*)/gs)];
		let totalLength = ending.length;

		for (const lineMatch of lines) {
			const tag = lineMatch[1];
			const content = lineMatch[2] ?? '';
			if (tag !== undefined && tag !== '') {
				if (/^<!--.*?-->$/s.test(tag)) {
					truncate += tag; // comments pass through
				} else if (VOID_ELEMENT_PATTERN.test(tag)) {
					truncate += tag; // void element: no stack effect
				} else {
					const closing = /^<\s*\/([^\s]+?)\s*>$/s.exec(tag);
					if (closing !== null) {
						const position = openTags.indexOf((closing[1] as string).toLowerCase());
						if (position !== -1) openTags.splice(position, 1);
						truncate += tag;
					} else {
						const opening = /^<\s*([^\s>!]+).*?>$/s.exec(tag);
						if (opening !== null) openTags.unshift((opening[1] as string).toLowerCase());
						truncate += tag;
					}
				}
			}
			// Plain-length of this text chunk; entities count as one char.
			const contentLength = content.replace(ENTITY_PATTERN, ' ').length;
			if (totalLength + contentLength > length) {
				let left = length - totalLength;
				let entitiesLength = 0;
				for (const entity of content.matchAll(ENTITY_PATTERN)) {
					if ((entity.index as number) + 1 - entitiesLength <= left) {
						left--;
						entitiesLength += entity[0].length;
					} else {
						break;
					}
				}
				truncate += content.slice(0, left + entitiesLength);
				break;
			}
			truncate += content;
			totalLength += contentLength;
			if (totalLength >= length) break;
		}
	} else {
		if (text.length <= length) return text;
		truncate = text.slice(0, length - ending.length);
	}

	// Word-boundary cut.
	if (!exact) {
		const plainTruncate = considerHtml ? truncate.replace(/<.*?>/gs, '') : truncate;
		const spacePosition = plainTruncate.lastIndexOf(' ');
		if (spacePosition !== -1) {
			if (considerHtml) {
				// Map the plain-text space position back to the HTML string.
				let charCount = 0;
				let htmlPosition = 0;
				let inTag = false;
				for (let index = 0; index < truncate.length; index++) {
					const char = truncate[index];
					if (char === '<') inTag = true;
					if (!inTag) {
						if (charCount === spacePosition) {
							htmlPosition = index;
							break;
						}
						charCount++;
					}
					if (char === '>') inTag = false;
				}
				if (htmlPosition > 0) {
					truncate = truncate.slice(0, htmlPosition);
					// Rebuild the open-tags stack from the shortened content.
					openTags = [];
					for (const match of truncate.matchAll(/<([^\s>/]+)(?:\s[^>]*)?>|<\/([^\s>]+)>/gs)) {
						const fullTag = match[0];
						const isVoid = VOID_ELEMENT_PATTERN.test(fullTag);
						if (isVoid || fullTag.startsWith('<!--')) continue;
						if (match[1] !== undefined) {
							openTags.unshift(match[1].toLowerCase());
						} else if (match[2] !== undefined) {
							const position = openTags.indexOf(match[2].toLowerCase());
							if (position !== -1) openTags.splice(position, 1);
						}
					}
				}
			} else {
				truncate = truncate.slice(0, spacePosition);
			}
		}
	}

	truncate += ending;
	if (considerHtml) {
		for (const tag of openTags) {
			truncate += `</${tag}>`;
		}
	}
	return truncate;
}
