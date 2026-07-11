/**
 * SectionReadSource — the pluggable row/record acquisition strategy for the
 * generic section read (readSectionRows). It swaps ONLY the two matrix-coupled
 * points of the read: where the rows come from, and how each row becomes a
 * MatrixRecord. Everything downstream (emitDdoData, the envelope, subdatum,
 * structure-context) is record-shape-only and reused unchanged.
 *
 * PHP parity: this is the TS expression of PHP's polymorphic
 * `search::get_instance()` (mode 'tm' → search_tm, a swappable SQL backend over
 * matrix_time_machine) + the per-row `tm_record::get_section_record()`
 * materialization inside the otherwise-generic sections_json loop. The whole
 * point (class.tm_record.php:533-535) is that the STANDARD pipeline renders
 * Time Machine history "without any special-cased UI code" — so dd15 is served
 * as a normal section, only its row/record acquisition (and its per-ddo cell
 * policy) differ.
 *
 * The default `matrixReadSource` is the ordinary matrix path verbatim; a
 * `tmReadSource` (src/core/resolve/read_tm.ts) serves the virtual dd15 section.
 */

import type { Ddo } from '../concepts/ddo.ts';
import { SELF_SENTINEL } from '../concepts/ddo.ts';
import type { Rqo } from '../concepts/rqo.ts';
import type { Sqo } from '../concepts/sqo.ts';
import { readMatrixRecord } from '../db/matrix.ts';
import type { MatrixRecord } from '../db/matrix.ts';
import { sql } from '../db/postgres.ts';
import { getMatrixTableFromTipo } from '../ontology/resolver.ts';
import type { EmissionContext } from '../resolve/component_data.ts';
import type { StructureContextEntry } from '../resolve/structure_context.ts';
import { buildSearchSql } from '../search/sql_assembler.ts';
import type { Principal } from '../security/permissions.ts';

/**
 * One matched row. `section_tipo`/`section_id` are the envelope + record
 * coordinates; `envelopeExtra` carries source-specific fields that must ride on
 * the envelope entry (the TM source adds matrix_id, timestamp, caller_* etc. — all
 * client-consumed and byte-gated by tm_read_differential). `raw` is the source's
 * own full row object, handed back to emitRow (the TM source reads its flat
 * matrix_time_machine columns from it).
 */
export interface SectionRow {
	section_tipo: string;
	section_id: number;
	envelopeExtra?: Record<string, unknown>;
	raw?: unknown;
}

/** The shared per-ddo emitter (section/read.ts emitDdoData), passed in to avoid a cycle. */
export type EmitDdo = (
	ddo: Ddo,
	ddoMap: Ddo[],
	record: MatrixRecord,
	row: { section_tipo: string; section_id: number },
	defaultMode: string,
	defaultLang: string,
	callerTipo: string,
	emission: EmissionContext,
) => Promise<void>;

/** Everything a source needs to emit ONE row's data items. */
export interface EmitRowContext {
	row: SectionRow;
	ddoMap: Ddo[];
	mode: string;
	lang: string;
	callerTipo: string;
	/** The per-read emission context: items array + stamp ledger (S2-29). */
	emission: EmissionContext;
	/** The shared emitter (emitDdoData) — sources call it for generic components. */
	emitDdo: EmitDdo;
}

/**
 * A read strategy: fetch the matched rows, count them, and emit each row's data.
 * The sections envelope + structure-context are built generically by
 * readSectionRows from getRows; the per-row emission is the source's own — the
 * matrix source runs the standard direct-child ddo loop, the TM source runs its
 * who/when/where/what + cell-mode policy.
 */
export interface SectionReadSource {
	getRows(sqo: Sqo, principal?: Principal): Promise<SectionRow[]>;
	count(sqo: Sqo, principal?: Principal): Promise<number>;
	emitRow(context: EmitRowContext): Promise<void>;
	/**
	 * When present, OWNS the read's structure-context (readSection skips its
	 * generic context building). The TM source uses this: dd15's columns are the
	 * CLIENT's chosen components (not ontology-driven), so its request_config
	 * ddo_map must be built from rqo.show.ddo_map — a dd15-specific massaging the
	 * generic builder can't produce.
	 */
	buildContext?(rqo: Rqo, principal: Principal): Promise<StructureContextEntry[]>;
}

/**
 * The default matrix read source — the ordinary section path (buildSearchSql →
 * rows, readMatrixRecord → record, the standard direct-child ddo emit loop).
 * Behavior-identical to the pre-seam readSectionRows / count code.
 */
export const matrixReadSource: SectionReadSource = {
	async getRows(sqo, principal) {
		const { sql: builtSql, params } = await buildSearchSql(sqo, { principal });
		return (await sql.unsafe(builtSql, params as (string | number | null)[])) as SectionRow[];
	},

	async count(sqo, principal) {
		const countSqo = { ...(sqo as Record<string, unknown>), full_count: true } as Sqo;
		const { sql: builtSql, params } = await buildSearchSql(countSqo, { principal });
		const rows = (await sql.unsafe(builtSql, params as (string | number | null)[])) as {
			full_count: number | string;
		}[];
		// Multi-section UNION yields one count row per branch — sum them (PHP trait.count).
		return rows.reduce((sum, row) => sum + Number(row.full_count), 0);
	},

	async emitRow({ row, ddoMap, mode, lang, callerTipo, emission, emitDdo }) {
		// One matrix read per row for value extraction (Phase 4: reuse the search
		// SELECT's jsonb columns once column projection is plumbed).
		const record = await readMatrixRecord(
			(await getMatrixTableFromTipo(row.section_tipo)) ?? 'matrix',
			row.section_tipo,
			row.section_id,
		);
		if (record === null) return;
		for (const ddo of ddoMap) {
			const parentRef = ddo.parent ?? SELF_SENTINEL;
			if (parentRef !== SELF_SENTINEL && parentRef !== callerTipo) {
				continue; // non-direct children resolve under their own parent
			}
			await emitDdo(ddo, ddoMap, record, row, mode, lang, callerTipo, emission);
			// value_with_parents ddo → the row also carries its ancestor
			// breadcrumb (PHP common::get_subdatum → get_ddinfo_parents :2802-05:
			// {tipo:'ddinfo', section_id, section_tipo, value:[parents…,hierarchy
			// label], parent:<caller tipo>}, appended AFTER the row-stamp loop so
			// it carries NO row_section_id/parent_tipo — mirrored via markStamped).
			// The autocomplete picker renders the term's thesaurus chain from it
			// ("Parcieux, Ain, Rhône-Alpes, France" — rsc92, 2026-07-09).
			if ((ddo as { value_with_parents?: unknown }).value_with_parents === true) {
				const { buildDdInfoChain } = await import('../resolve/dd_info.ts');
				// withHierarchyLabel=false: the rows breadcrumb ends at the root
				// TERM (byte-diffed vs the oracle) — the trailing registry label
				// belongs to the portal-cell ddinfo only.
				const chain = await buildDdInfoChain(row.section_tipo, row.section_id, lang, false);
				const ddInfoItem = {
					tipo: 'ddinfo',
					section_id: row.section_id,
					section_tipo: row.section_tipo,
					value: chain.length > 0 ? chain : null,
					parent: row.section_tipo,
				};
				emission.markStamped(ddInfoItem as never);
				emission.items.push(ddInfoItem as never);
			}
		}
	},
};

/**
 * Select the read source for a request. `mode === 'tm'` → the dd15 Time Machine
 * source (loaded lazily to avoid a static cycle with read_tm.ts); everything
 * else → the default matrix source.
 */
export async function pickReadSource(mode: string | undefined): Promise<SectionReadSource> {
	if (mode === 'tm') {
		const { tmReadSource } = await import('../resolve/read_tm.ts');
		return tmReadSource;
	}
	return matrixReadSource;
}
