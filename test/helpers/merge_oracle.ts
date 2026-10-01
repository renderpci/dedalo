/**
 * FROZEN MERGE ORACLE — the in-memory rdf/xml consolidation as it stood before
 * the streamed merge (PERF-2/DIFF-4, audit 2026-09-26), copied VERBATIM from
 * src/diffusion/writers/rdf.ts `mergeRdfParts` and src/diffusion/writers/xml.ts
 * `mergeXmlParts` at 45b8c45162. Never edit: it IS the byte contract.
 *
 * The production writers stream their merge part by part (memory bounded by the
 * two largest parts); `diffusion_rdfxml_writers.test.ts` asserts the streamed
 * output equals this oracle over a case table and a seeded fuzz. Both were
 * themselves verbatim ports of the old engine's merge_rdf_parts /
 * merge_xml_parts (rdf_file_utils.ts:72-121).
 */

/** rdf: envelope from the FIRST part, inner blocks of every part joined by a blank line. */
export function mergeRdfPartsOracle(rawParts: string[]): string {
	const nonEmpty = rawParts.filter((part) => part && part.trim().length > 0);
	if (nonEmpty.length === 0) return '';
	if (nonEmpty.length === 1) return nonEmpty[0] as string;

	const first = nonEmpty[0] as string;
	const openingMatch = first.match(/<rdf:RDF[^>]*>/s);
	const openingTag = openingMatch ? openingMatch[0] : '<rdf:RDF>';

	const innerBlocks = nonEmpty
		.map((part) => {
			const open = part.match(/<rdf:RDF[^>]*>/s);
			const closeIndex = part.lastIndexOf('</rdf:RDF>');
			if (!open || closeIndex === -1) return '';
			const bodyStart = (open.index ?? 0) + open[0].length;
			return part.slice(bodyStart, closeIndex).trim();
		})
		.filter((block) => block.length > 0)
		.join('\n\n');

	return `<?xml version="1.0" encoding="utf-8"?>\n${openingTag}\n\n${innerBlocks}\n\n</rdf:RDF>\n`;
}

/** xml: root (name + attrs) from the FIRST part, every part's root-children under it. */
export function mergeXmlPartsOracle(rawParts: string[]): string {
	const nonEmpty = rawParts.filter((part) => part && part.trim().length > 0);
	if (nonEmpty.length === 0) return '';
	if (nonEmpty.length === 1) return nonEmpty[0] as string;

	const first = nonEmpty[0] as string;
	const rootMatch =
		first.match(/<\?xml[^>]*\?>\s*<([A-Za-z_][\w:.-]*)([^>]*)>/) ??
		first.match(/^\s*<([A-Za-z_][\w:.-]*)([^>]*)>/);
	if (!rootMatch) return nonEmpty.join('\n');

	const rootName = rootMatch[1] as string;
	const rootAttrs = rootMatch[2] ?? '';

	const innerBlocks = nonEmpty
		.map((part) => {
			const open = part.indexOf(`<${rootName}`);
			const openEnd = part.indexOf('>', open);
			const close = part.lastIndexOf(`</${rootName}>`);
			if (open === -1 || close === -1 || openEnd === -1 || close <= openEnd) return part.trim();
			return part.slice(openEnd + 1, close).trim();
		})
		.filter((block) => block.length > 0)
		.join('\n\n');

	return `<?xml version="1.0" encoding="utf-8"?>\n<${rootName}${rootAttrs}>\n\n${innerBlocks}\n\n</${rootName}>\n`;
}
