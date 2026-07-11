/**
 * Format-writer registry (DIFFUSION_SPEC §4.3) — keyed by the ontology
 * `properties->diffusion->type` string. Unknown format = LOUD, typed error
 * surfaced by the `validate` action; NEVER a silent no-op (spec: adding a
 * community format = ontology extension + one entry here).
 *
 * 'socrata' is a dormant alias of the sql writer (old-engine posture kept
 * until the P0 ask-the-user liveness question is settled — spec §4.3).
 * File-format writers (rdf/xml/markdown/csv/json) register here in P3.
 */

import { csvWriter } from './csv.ts';
import { jsonWriter } from './json.ts';
import { mariadbSqlWriter } from './mariadb_sql.ts';
import { markdownWriter } from './markdown.ts';
import { rdfWriter } from './rdf.ts';
import type { DiffusionWriter } from './types.ts';
import { xmlWriter } from './xml.ts';

/** Thrown by getDiffusionWriter for a format no writer serves. */
export class UnknownDiffusionFormatError extends Error {
	readonly format: string;

	constructor(format: string) {
		const knownFormats = [...WRITER_REGISTRY.keys()].join(', ');
		super(
			`No diffusion writer registered for format '${format}' (known formats: ${knownFormats}). Check the element ontology properties->diffusion->type.`,
		);
		this.name = 'UnknownDiffusionFormatError';
		this.format = format;
	}
}

/** The registry — immutable Map, populated at module load. */
export const WRITER_REGISTRY: ReadonlyMap<string, DiffusionWriter> = new Map<
	string,
	DiffusionWriter
>([
	['sql', mariadbSqlWriter],
	// Dormant alias: Socrata published through the same SQL tables historically.
	['socrata', mariadbSqlWriter],
	// Tabular file writers (P3 slice 1) — layouts in writers/files.ts.
	['csv', csvWriter],
	['json', jsonWriter],
	['markdown', markdownWriter],
	// Document file writers (P3 final slice) — PHP diffusion_rdf/diffusion_xml.
	['rdf', rdfWriter],
	['xml', xmlWriter],
]);

/** Resolve a writer by format — throws UnknownDiffusionFormatError (loud). */
export function getDiffusionWriter(format: string): DiffusionWriter {
	const writer = WRITER_REGISTRY.get(format);
	if (writer === undefined) {
		throw new UnknownDiffusionFormatError(format);
	}
	return writer;
}
