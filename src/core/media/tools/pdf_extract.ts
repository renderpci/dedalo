/**
 * tool_pdf_extractor core (PHP tool_pdf_extractor::get_pdf_data → component_pdf
 * ::get_text_from_pdf). Reads the default-quality PDF and extracts text or html
 * for a page range. Read-only.
 */

import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { MediaTypeSpec } from '../../concepts/media.ts';
import { extractText } from '../engine/pdf.ts';
import { type MediaIdentity, type MediaPathOptions, buildMediaLocation } from '../path.ts';

export interface PdfExtractCoreOptions {
	method: 'text' | 'html';
	pageIn?: number | null;
	pageOut?: number | null;
}

/** Extract text/html from the record's default-quality PDF. Throws when absent. */
export async function extractPdfCore(
	spec: MediaTypeSpec,
	identity: MediaIdentity,
	pathOpts: MediaPathOptions,
	options: PdfExtractCoreOptions,
): Promise<string> {
	const source = buildMediaLocation(
		spec,
		identity,
		spec.defaultQuality,
		'pdf',
		pathOpts,
	).absolutePath;
	if (!existsSync(source)) {
		throw new Error('pdf extractor: default-quality PDF not found');
	}
	const outFile = join(
		tmpdir(),
		`dedalo_pdf_${process.pid}_${identity.sectionId}.${options.method === 'html' ? 'html' : 'txt'}`,
	);
	return extractText(source, outFile, {
		method: options.method,
		pageIn: options.pageIn ?? null,
		pageOut: options.pageOut ?? null,
	});
}
