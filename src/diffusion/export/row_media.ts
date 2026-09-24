/**
 * THE EXPORT'S MEDIA ADDRESSES — the out-of-band channel from the export walk
 * (grid.ts) to the tool_export spool (tools/tool_export/server/artifact_store.ts
 * `media.ndjson`), and from there to the media ZIP writer.
 *
 * WHY OUT OF BAND. A portal column whose targets hold images carries, in the
 * WIRE, either the portal's own model (`component_portal`, value / dedalo_raw)
 * or text that mixes media URLs with other child values joined by
 * per-component separators — the file addresses the walk READ are gone once a
 * cell is minted. The media ZIP must not guess them back out of URL text
 * (separators vary per component; `properties.image_id` renames make names
 * arbitrary), so the walk records each (section, id, component) it read media
 * on (relation_list.ts CellValueResolveOptions.onMediaRead) and hands them
 * here, attached to the record's FIRST row line under a SYMBOL key:
 *
 *   - JSON.stringify drops symbol keys, so the get_export_grid stream, the
 *     buffered envelope, the spool's grid.ndjson and the ndjson download stay
 *     byte-identical (the wire does not change);
 *   - the spool writer reads the symbol and appends ONE sidecar line per
 *     record, in the same write call as the row — committed with it.
 *
 * Only a capturing walk (ExportGridRunOptions.captureMedia — the tool_export
 * background build) attaches anything; every other consumer of the walk pays
 * nothing.
 *
 * AN ADDRESS IS A CLAIM, NOT A GRANT. The walk crosses into relation targets
 * asserting only the record key (no component check), so the media ZIP writer
 * re-authorizes EVERY address as the export's owner (component grant on that
 * record + the record scope) before a byte is read.
 */

/**
 * One captured media address of a row: [column ordinal, section_tipo,
 * section_id, component_tipo] — the column the value was placed in, and the
 * record + media component it was read on. The ordinal is NULL when the media
 * was read for a cell that shows nothing (an empty display value: only the
 * 'original' quality exists yet, or the export base is unset) — the walk READ
 * it in every data format, so the archive holds it in every format, but no
 * column carries it.
 */
export type ExportRowMediaAddress = [number | null, string, number, string];

/** The symbol key a record's first row line carries its media addresses under. */
export const EXPORT_ROW_MEDIA: unique symbol = Symbol('dedalo.export.row_media');

/** A row line that may carry captured media addresses. */
export type RowLineWithMedia = Record<string, unknown> & {
	[EXPORT_ROW_MEDIA]?: ExportRowMediaAddress[];
};

/** The captured addresses of a line (empty when it carries none). */
export function rowMediaOf(line: Record<string, unknown>): ExportRowMediaAddress[] {
	const media = (line as RowLineWithMedia)[EXPORT_ROW_MEDIA];
	return Array.isArray(media) ? media : [];
}

/**
 * A sidecar entry read back from disk, validated: a non-negative integer
 * column or null, non-empty tipos, a positive safe-integer record id. Anything else is
 * null (the spool is server-written, but a reader never trusts a shape it did
 * not check).
 */
export function parseRowMediaAddress(value: unknown): ExportRowMediaAddress | null {
	if (!Array.isArray(value) || value.length !== 4) return null;
	const [col, sectionTipo, sectionId, componentTipo] = value as unknown[];
	if (
		(col !== null && (!Number.isSafeInteger(col) || (col as number) < 0)) ||
		typeof sectionTipo !== 'string' ||
		sectionTipo === '' ||
		!Number.isSafeInteger(sectionId) ||
		(sectionId as number) < 1 ||
		typeof componentTipo !== 'string' ||
		componentTipo === ''
	) {
		return null;
	}
	return [col as number | null, sectionTipo, sectionId as number, componentTipo];
}
