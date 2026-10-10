/**
 * EMIT ROW — the host row identity a data item is emitted for.
 *
 * Two different questions share one row, and a HOST section answers them
 * differently:
 *
 *  - `section_tipo`/`section_id` is what the item BINDS to. The client matches a
 *    cell's data to its context by an exact (tipo, mode, section_tipo) triple,
 *    so this is the row the cell is LISTED under.
 *  - `config_owner` is the record the component BELONGS to — the address its
 *    request_config resolves against ('self', `field_value`, a fixed_filter
 *    `component_data`, datalists, declared column order). Set only when it
 *    differs from the binding row.
 *
 * They differ for the Time Machine (dd15): it lists a record's components as its
 * own columns, so a cell binds to dd15/<tm row id> while its component belongs
 * to hierarchy1/<record id>. Resolving the config against dd15 asks dd15's table
 * for records it does not hold — `field_value` read `matrix_time_machine` for an
 * `hierarchy45` column and died on `column t.string does not exist`.
 *
 * Read the config side ONLY through {@link configOwnerOf}; never re-derive it
 * from the binding row.
 */

export interface EmitRowAddress {
	section_tipo: string;
	section_id: number;
}

export interface EmitRow extends EmitRowAddress {
	/** The component's own record when the row is listed under a host (dd15). */
	config_owner?: EmitRowAddress;
}

/** The record a cell's request_config resolves against. */
export function configOwnerOf(row: EmitRow): EmitRowAddress {
	return row.config_owner ?? row;
}
