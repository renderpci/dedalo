<?php declare(strict_types=1);
/**
* EXPORT_TABULATOR
* Stateful accumulator that converts per-record export atoms into the
* flat-table NDJSON wire protocol consumed by flat_table.js.
*
* The tabulator is pure: atoms in, line objects out. No DB access and no
* output side effects (ontology label lookups are injected as a resolver
* callable so unit tests run without a database).
*
* Caller contract (tool_export::get_export_grid):
*   1. Construct once per export run with the chosen options.
*   2. Emit meta_line() as the first NDJSON line.
*   3. For each record call record_lines(), which returns zero or more 'col'
*      lines (newly discovered columns) followed by one or more 'row' lines.
*      Stream every line to the client as NDJSON immediately.
*   4. After all records call end_line() and stream it as the final line.
* The single-pass design means 'col' lines can arrive mid-stream; the
* authoritative display order is the 'columns' array in the 'end' line.
*
* Wire protocol (one JSON object per NDJSON line, discriminated by 't'):
* - {"t":"meta", v, data_format, breakdown, fill_the_gaps, section_tipo, total}
* - {"t":"col",  i, key, group, path, label, ar_labels, cell_type, model, after}
*   Emitted before the first row that uses the column; breakdown columns
*   can appear mid-stream (single pass). 'i' is a stable ordinal cells
*   reference; 'after' is a live-insert hint; the authoritative display
*   order arrives in the 'end' line.
* - {"t":"row",  rec, sub, c:{ordinal: scalar, ...}}
*   Sparse ordinal-keyed cells: misalignment is structurally impossible
*   because every cell references a column by its stable ordinal integer.
* - {"t":"end",  columns:[ordinals in display order], rows, records}
* Unknown 't' values are reserved (clients must ignore them).
*
* Breakdown modes (relation item explosion, decided here from the
* item_index carried by atom path segments — components know nothing):
* - 'default': first indexed level -> extra rows (legacy grid rows);
*   deeper indexed levels -> '|n' suffixed columns (legacy sub_columns_division).
* - 'rows': every indexed level explodes vertically; static column set.
*   Sibling axes are max-aligned (no cartesian product), matching the
*   legacy row_count = max(...) semantics.
* - 'columns': one row per record; every indexed level mints '|n'
*   suffixed columns (suffix omitted for n=0), per-segment and therefore
*   collision-free for portal-in-portal.
*
* Data formats:
* - 'value': one column per top ddo, atoms joined to a single flat string.
* - 'grid_value': breakdown explosion as configured.
* - 'dedalo_raw': pass-through, one column per ddo, pre-encoded
*   {"dedalo_data":...} strings emitted verbatim (import round-trip).
*
* Column ordering is deterministic: depth-first by (top ddo position,
* index vector lexicographic, atom arrival order). Replaces the legacy
* group-splice loops of tool_export / component_relation_common (and
* fixes the position-0 falsy splice bug instead of porting it).
*
* Relationships:
* - Instantiated by tool_export::get_export_grid() (tools/tool_export/class.tool_export.php).
* - Consumes export_value / export_atom / export_path_segment (core/dd_grid/).
* - Consumed by flat_table.js (tools/tool_export/js/flat_table.js).
* - Tested by test/server/tools/export_tabulator_Test.php.
*
* @package Dédalo
* @subpackage tool_export
*/
class export_tabulator {



	/**
	 * Active export format, validated against the allowlist in __construct.
	 * Drives column minting strategy and cell serialisation:
	 * - 'value'      — one flat-joined string cell per top ddo.
	 * - 'grid_value' — relation items exploded by $breakdown mode.
	 * - 'dedalo_raw' — verbatim {"dedalo_data":…} pass-through per ddo.
	 * @var string $data_format
	 */
	private string $data_format;

	/**
	 * Explosion strategy for 'grid_value' format; no effect on 'value'/'dedalo_raw'.
	 * - 'default' — first relation level → rows, deeper levels → '|n' columns.
	 * - 'rows'    — every level → rows (max-aligned siblings, no cartesian product).
	 * - 'columns' — every level → '|n' suffixed columns; always one row per record.
	 * @var string $breakdown
	 */
	private string $breakdown;

	/**
	 * When true, a spanning (parent) value is repeated on every exploded sub-row
	 * it logically covers. Only meaningful for 'grid_value' + 'rows'/'default'.
	 * Mirrors the legacy tool_export "fill the gaps" checkbox.
	 * @var bool $fill_the_gaps
	 */
	private bool $fill_the_gaps;

	/**
	 * Ontology label resolver injected at construction time.
	 * Signature: fn(string $tipo): ?string
	 * The default implementation calls ontology_node::get_term_by_tipo() with the
	 * application language; tests inject a stub to avoid a live DB connection.
	 * Stored as untyped property because PHP does not allow `callable` as a
	 * declared property type.
	 * @var callable $label_resolver
	 */
	private $label_resolver;

	/**
	 * Primary column registry, keyed by the column's stable string key.
	 * Each value is a column object with shape:
	 *   { i: int (ordinal), key: string, group: string,
	 *     path: export_path_segment[]|null,
	 *     label: string, ar_labels: string[],
	 *     cell_type: string, model: ?string,
	 *     sort_key: array, seq: int }
	 * Columns are registered on first encounter and never removed.
	 * @var array $columns
	 */
	private array $columns = [];

	/**
	 * Ordered list of column keys maintained in deterministic display order
	 * by register_column(). The authoritative display order emitted in the
	 * 'end' line is derived from this array by mapping keys to ordinals.
	 * @var array $order
	 */
	private array $order = [];

	/**
	 * Secondary index: ordinal (int) => column object for O(1) lookup during
	 * row building. Populated in lockstep with $columns; never modified after
	 * registration. Access via column_by_ordinal() which throws on unknown ordinals.
	 * @var array $columns_by_ordinal
	 */
	private array $columns_by_ordinal = [];

	/**
	 * Monotonically increasing ordinal assigned to each new column.
	 * Ordinals are compact (0, 1, 2, …) within one tabulator instance and
	 * serve as the stable integer column identifier on the wire ('i' field
	 * of 'col' lines; key of 'c' cell objects in 'row' lines).
	 * @var int $next_ordinal
	 */
	private int $next_ordinal	= 0;

	/**
	 * Arrival-order counter used as a tiebreaker in compare_columns() when two
	 * columns share the same (ddo_index, index_vector) sort key. Ensures that
	 * columns encountered first in atom order always sort before later ones,
	 * giving a deterministic display order even for atoms with equal sort keys.
	 * @var int $next_seq
	 */
	private int $next_seq		= 0;

	/**
	 * Running count of 'row' protocol lines emitted so far, incremented once
	 * per row in record_lines(). Reported in the 'end' line so the client can
	 * display a total-rows count without re-counting from the stream.
	 * @var int $rows_emitted
	 */
	private int $rows_emitted	= 0;

	/**
	 * Running count of records processed via record_lines(). One record can
	 * expand into multiple rows (breakdown explosion), so rows_emitted >= records_count.
	 * Reported in the 'end' line as the authoritative record count.
	 * @var int $records_count
	 */
	private int $records_count	= 0;



	/**
	* __CONSTRUCT
	* Initialise the tabulator with the chosen export options.
	* Unknown values for data_format and breakdown are rejected with an error
	* log and silently replaced by safe defaults so the export can still run.
	* @param ?object $options = null - export configuration; all keys optional:
	*   - data_format    string 'value'|'grid_value'|'dedalo_raw' (default 'value')
	*   - breakdown      string 'default'|'rows'|'columns' (default 'default')
	*   - fill_the_gaps  bool   repeat spanning values on exploded rows (default true)
	*   - label_resolver callable fn(string $tipo): ?string
	*                    injected label resolver; default uses the live ontology DB
	* @return void
	*/
	public function __construct( ?object $options=null ) {

		$data_format	= $options->data_format ?? 'value';
		$breakdown		= $options->breakdown ?? 'default';

		// allowlist validation
			if (!in_array($data_format, ['value','grid_value','dedalo_raw'], true)) {
				debug_log(__METHOD__ ." Invalid data_format '$data_format'. Fallback to 'value'", logger::ERROR);
				$data_format = 'value';
			}
			if (!in_array($breakdown, ['default','rows','columns'], true)) {
				debug_log(__METHOD__ ." Invalid breakdown '$breakdown'. Fallback to 'default'", logger::ERROR);
				$breakdown = 'default';
			}

		$this->data_format		= $data_format;
		$this->breakdown		= $breakdown;
		$this->fill_the_gaps	= $options->fill_the_gaps ?? true;
		$this->label_resolver	= $options->label_resolver ?? function(string $tipo) : ?string {
			return ontology_node::get_term_by_tipo($tipo, DEDALO_APPLICATION_LANG, true);
		};
	}//end __construct



	/**
	* META_LINE
	* Build the 'meta' protocol line that must be the first line emitted in the
	* NDJSON stream. The client uses this line to configure the flat_table renderer
	* before any column or row data arrives; unknown 'v' values must be rejected.
	* Wire shape: {"t":"meta", "v":1, "data_format":…, "breakdown":…,
	*              "fill_the_gaps":…, "section_tipo":…, "total":…}
	* @param string $section_tipo - ontology tipo of the exported section (e.g. "oh1")
	* @param ?int $total = null   - total record count when known from the SQO result,
	*   or null when not yet known (streaming starts before the count is available)
	* @return object - the line object, ready for json_encode()
	*/
	public function meta_line( string $section_tipo, ?int $total=null ) : object {

		return (object)[
			't'				=> 'meta',
			'v'				=> 1,
			'data_format'	=> $this->data_format,
			'breakdown'		=> $this->breakdown,
			'fill_the_gaps'	=> $this->fill_the_gaps,
			'section_tipo'	=> $section_tipo,
			'total'			=> $total
		];
	}//end meta_line



	/**
	* RECORD_LINES
	* Tabulate one record and return all protocol lines it generates.
	* The returned array contains, in order:
	*   1. Zero or more 'col' lines for columns seen for the first time in this record.
	*      These are prepended so clients can register the column before encountering
	*      its cells; in breakdown mode new '|n' columns can appear on any record.
	*   2. One or more 'row' lines (one per exploded sub-row; always at least one).
	* Callers must stream each returned line as a single NDJSON line immediately.
	*
	* Side effects: increments $records_count and $rows_emitted; may expand
	* $columns, $order, and $columns_by_ordinal via register_column().
	* @param array $ar_entries - one entry object per top-level export ddo, in ddo
	*   (user-selected column) order; each entry has shape:
	*   { value: export_value, section_tipo: string, component_tipo: string,
	*     path?: export_path_segment[] }
	* @param int|string $rec_id - record identifier: section_id (int) for normal
	*   records, or a TM row identifier (string) for time-machine rows
	* @return array - ordered list of protocol line objects (col* then row*)
	*/
	public function record_lines( array $ar_entries, int|string $rec_id ) : array {

		$this->records_count++;

		$new_col_lines	= [];
		$cell_groups	= []; // row_index => [ordinal => [atoms]]
		$raw_cells		= []; // dedalo_raw only: row 0 ordinal => scalar
		$record_height	= 1;

		// rows / default modes need the record item tree for heights/offsets.
		// default mode only explodes the FIRST indexed level into rows
		// (deeper levels become columns), so its tree is depth-limited.
		// columns mode never explodes vertically (height 1, no tree).
			$item_tree = ($this->data_format==='grid_value' && $this->breakdown!=='columns')
				? $this->build_item_tree($ar_entries, $this->breakdown==='default')
				: null;
			if ($item_tree!==null) {
				$record_height = $item_tree->height;
			}

		foreach ($ar_entries as $ddo_index => $entry) {

			$export_value	= $entry->value;
			$atoms			= $export_value->atoms;

			// static column modes mint the top ddo column even with no atoms
			// (a fully empty column still appears in the CSV).
			// When the minting record has no atoms, a synthetic single-segment
			// path is built from the ddo entry so the header label resolves
			// from the ontology instead of falling back to the raw identity
			// key ('rsc197_rsc85'); columns register once, so a null path here
			// would leak the key as header even when later records have data.
				if ($this->data_format==='value' || $this->data_format==='dedalo_raw') {
					$base_key	= $entry->section_tipo.'_'.$entry->component_tipo;
					// label path precedence for the no-atoms case:
					// - value: the declared ddo path (entry->path) so the header
					//   chain matches data-minted columns ('Informants | Name')
					// - dedalo_raw: single own segment (raw atoms never recurse,
					//   their header is the top component tipo)
					$base_path	= !empty($atoms)
						? $atoms[0]->path
						: ($this->data_format!=='dedalo_raw' && !empty($entry->path ?? null)
							? $entry->path
							: [ new export_path_segment($entry->section_tipo, $entry->component_tipo, (object)[
									'model' => $export_value->model
							  ]) ]);
					$column = $this->register_column(
						$base_key,
						$base_key, // group
						$base_path,
						[], // suffix map (none)
						$ddo_index,
						[], // sort vector tail
						!empty($atoms) ? $atoms[0]->cell_type : 'text',
						$export_value->model,
						$new_col_lines
					);

					if ($this->data_format==='dedalo_raw') {
						// pass-through: single pre-encoded scalar, emitted verbatim
						$raw_value = $atoms[0]->value ?? null;
						if ($raw_value!==null) {
							$raw_cells[$column->i] = $raw_value;
						}
					}else{
						// flat join of all the component atoms
						$flat = export_value::join($atoms);
						if ($flat!=='') {
							$raw_cells[$column->i] = self::clean_text_value($flat);
						}
					}
					continue;
				}

			// grid_value (breakdown): place every atom
				foreach ($atoms as $atom) {
					$placement	= $this->place_atom($atom, $ddo_index, $item_tree, $new_col_lines);
					$ordinal	= $placement->column->i;

					foreach ($placement->rows as $row_index) {
						$cell_groups[$row_index][$ordinal][] = $atom;
					}
				}
		}//end foreach ($ar_entries as $ddo_index => $entry)

		// build row lines
		// New col lines are prepended so the client can register a column
		// before it sees cell values referencing its ordinal.
			$lines = $new_col_lines;

			if ($this->data_format==='value' || $this->data_format==='dedalo_raw') {
				$line = (object)[
					't'		=> 'row',
					'rec'	=> $rec_id,
					'sub'	=> 0,
					'c'		=> (object)$raw_cells
				];
				$lines[] = $line;
				$this->rows_emitted++;
			}else{
				for ($row_index = 0; $row_index < $record_height; $row_index++) {
					$cells = [];
					foreach ($cell_groups[$row_index] ?? [] as $ordinal => $cell_atoms) {
						$cell_column	= $this->column_by_ordinal($ordinal);
						$cell_value		= $this->join_cell($cell_atoms, $cell_column);
						if ($cell_value!=='' && $cell_value!==null) {
							$cells[$ordinal] = $cell_value;
						}
					}
					$lines[] = (object)[
						't'		=> 'row',
						'rec'	=> $rec_id,
						'sub'	=> $row_index,
						'c'		=> (object)$cells
					];
					$this->rows_emitted++;
				}
			}


		return $lines;
	}//end record_lines



	/**
	* END_LINE
	* Build the 'end' protocol line that must be the last line in the NDJSON stream.
	* The 'columns' array is the AUTHORITATIVE display order for the client: it
	* contains every column ordinal in the deterministic sort order computed by
	* register_column() / compare_columns(). Although 'col' lines carry an 'after'
	* live-insert hint, clients must re-sort on 'end' because mid-stream inserts
	* may shift positions. flat_table.js re-renders the table header on receipt.
	* Wire shape: {"t":"end", "columns":[int,…], "rows":int, "records":int}
	* @return object - the line object, ready for json_encode()
	*/
	public function end_line() : object {

		$ordinals = array_map(function($key){
			return $this->columns[$key]->i;
		}, $this->order);

		return (object)[
			't'			=> 'end',
			'columns'	=> array_values($ordinals),
			'rows'		=> $this->rows_emitted,
			'records'	=> $this->records_count
		];
	}//end end_line



	/**
	* PLACE_ATOM
	* Resolve the target column and the set of output row indexes for a single
	* export atom, according to the active breakdown mode. This is the central
	* dispatch point that translates the atom's index vector into either a
	* column suffix ('|n'), a row expansion, or both.
	*
	* The method does NOT write anything to $cell_groups; that is the caller's
	* responsibility. It only returns the resolved column object and the row
	* indexes. If the column is new, a 'col' line is appended to $new_col_lines.
	*
	* Column key construction: identity keys of each path segment joined with '.';
	* when a segment contributes to the column dimension (suffix_map), its key
	* gets a '|n' suffix for n > 0 (n=0 is omitted — item 0 shares the base column
	* with no suffix, keeping legacy column-header parity).
	* @param export_atom $atom          - the atom to place; must have at least one path segment
	* @param int $ddo_index             - 0-based position of the top ddo in ar_entries;
	*   used as the primary sort key so columns appear in user-selected ddo order
	* @param ?object $item_tree         - pre-built item tree from build_item_tree(), or null
	*   when the breakdown mode does not need vertical expansion (columns mode / value format)
	* @param array &$new_col_lines      - accumulator for newly registered 'col' protocol
	*   lines; appended in-place so the caller can prepend them before the 'row' lines
	* @return object - {column: object, rows: int[]} where 'rows' is the list of
	*   output row indexes this atom's value should be written into
	*/
	private function place_atom( export_atom $atom, int $ddo_index, ?object $item_tree, array &$new_col_lines ) : object {

		// indexed positions: [{pos: segment position, axis_chain_key, index}]
		// Walk the atom path once to collect every segment that carries an item_index
		// (i.e. every hop that was reached by traversing a relation locator).
		// axis_key captures the identity chain BEFORE this segment so that the
		// item tree can look up the right node (axis is identified by the parent chain).
			$indexed = [];
			$identity_chain = [];
			foreach ($atom->path as $pos => $segment) {
				if ($segment->item_index!==null) {
					$indexed[] = (object)[
						'pos'		=> $pos,
						'axis_key'	=> implode('.', array_slice($identity_chain, 0, $pos)), // identities BEFORE the segment
						'index'		=> $segment->item_index
					];
				}
				$identity_chain[] = $segment->get_identity_key();
			}

		// column suffixes and row dimension per mode
		// $suffix_map  maps segment position => index for the column dimension.
		// $row_chain   accumulates (axis_key, index) pairs for the row dimension.
		// The two are mutually exclusive per segment: each indexed segment goes
		// to one dimension only, decided by the active breakdown mode.
			$suffix_map	= []; // segment position => index (column dimension)
			$row_chain	= []; // list of (axis_key, index) pairs (row dimension)
			switch ($this->breakdown) {
				case 'columns':
					foreach ($indexed as $ix) {
						$suffix_map[$ix->pos] = $ix->index;
					}
					break;

				case 'rows':
					foreach ($indexed as $ix) {
						$row_chain[] = $ix;
					}
					break;

				case 'default':
				default:
					foreach ($indexed as $i => $ix) {
						if ($i===0) {
							$row_chain[] = $ix;
						}else{
							$suffix_map[$ix->pos] = $ix->index;
						}
					}
					break;
			}

		// column key: identities joined '.', '|n' suffix per column-dimension
		// segment (omitted for n=0: item 0 shares the base column)
			$ar_key_parts = [];
			foreach ($atom->path as $pos => $segment) {
				$part = $segment->get_identity_key();
				if (isset($suffix_map[$pos]) && $suffix_map[$pos] > 0) {
					$part .= '|'.$suffix_map[$pos];
				}
				$ar_key_parts[] = $part;
			}
			$column_key	= implode('.', $ar_key_parts);
			$group		= $atom->path[0]->get_identity_key();

		// sort vector: index vector with column-dimension semantics only.
		// Suffix indexes order the exploded column sets after their base column
		// (|0 first, then |1, |2, …); rows-mode columns have no column-dimension
		// indexes and therefore sort by arrival order (seq) only.
			$sort_tail = [];
			foreach ($indexed as $ix) {
				if (isset($suffix_map[$ix->pos])) {
					$sort_tail[] = $suffix_map[$ix->pos];
				}
			}

		$column = $this->register_column(
			$column_key,
			$group,
			$atom->path,
			$suffix_map,
			$ddo_index,
			$sort_tail,
			$atom->cell_type,
			null, // model: taken from the leaf segment
			$new_col_lines
		);

		// output rows
		// When no row_chain exists, the atom is a static (non-exploded) value
		// that belongs to the first row. With fill_the_gaps it is written to
		// every row so spanning values (e.g. a parent field) appear on all
		// sub-rows of the record, matching the legacy "fill the gaps" checkbox.
			if (empty($row_chain)) {
				// record-level value: first row, or the whole record span when filling
				$rows = ($this->fill_the_gaps && $item_tree!==null && $item_tree->height > 1 && $this->breakdown!=='columns')
					? range(0, $item_tree->height - 1)
					: [0];
			}else{
				$rows = $this->resolve_item_rows($row_chain, $item_tree);
			}

		return (object)[
			'column'	=> $column,
			'rows'		=> $rows
		];
	}//end place_atom



	/**
	* RESOLVE_ITEM_ROWS
	* Translate an atom's row_chain — a sequence of (axis_key, index) pairs
	* built by place_atom — into the concrete output row indexes where the atom's
	* value should be written.
	*
	* The item tree is walked depth-first using the axis_key / index pairs:
	* each step adds the item's pre-computed offset (the number of rows occupied
	* by sibling items that precede it within its axis) to the running total.
	* The final node's 'height' is the span of rows the item occupies; when
	* fill_the_gaps is true the value is copied to every row in that span, so
	* parent-level fields appear repeated beside every child sub-row.
	* @param array $row_chain  - list of (object){axis_key: string, index: int} pairs,
	*   root first; produced by the place_atom() breakdown switch
	* @param ?object $item_tree - root item tree node from build_item_tree(), or null
	*   (treated as a trivially flat single-row record)
	* @return array - list of 0-based output row indexes; always at least [0]
	*/
	private function resolve_item_rows( array $row_chain, ?object $item_tree ) : array {

		if ($item_tree===null) {
			return [0];
		}

		$row_offset	= 0;
		$node		= $item_tree;
		foreach ($row_chain as $ix) {
			$item = $node->axes[$ix->axis_key][$ix->index] ?? null;
			if ($item===null) {
				// unknown item (defensive): land on the current offset
				return [$row_offset];
			}
			$row_offset	+= $item->offset;
			$node		= $item;
		}

		// span: the item subtree height (fill repeats the value on every row)
			$span = max(1, $node->height);

		return $this->fill_the_gaps
			? range($row_offset, $row_offset + $span - 1)
			: [$row_offset];
	}//end resolve_item_rows



	/**
	* BUILD_ITEM_TREE
	* Build the record-level relation item tree by scanning the index vectors
	* of all atoms across all entries for the current record. The resulting
	* tree drives vertical row expansion in 'rows' and 'default' breakdown modes.
	*
	* Tree node shape:
	*   { height: int, offset: int, axes: { axis_key: { index: node } } }
	* - 'height': total row span of this subtree; equals max over axes of the sum
	*   of child item heights (max-alignment, NOT cartesian product). This mirrors
	*   the legacy tool_export row_count = max(count of items per field) rule.
	* - 'offset': row offset of this item within its parent axis (computed by
	*   compute_node_layout after the tree is fully built).
	* - 'axes': child axes indexed by axis_key (the identity chain of segments
	*   ABOVE this level, joined with '.'); each axis maps item_index => child node.
	*
	* The tree must be built before placing atoms so that all item heights and
	* offsets are known when resolve_item_rows() is called.
	* @param array $ar_entries  - same ar_entries passed to record_lines()
	* @param bool $first_only = false  - when true, only the FIRST indexed level per
	*   atom path is registered; used in 'default' breakdown mode where deeper levels
	*   become columns and do not contribute to the row tree
	* @return object - root tree node with height = total rows for this record
	*/
	private function build_item_tree( array $ar_entries, bool $first_only=false ) : object {

		$root = (object)['height'=>1, 'offset'=>0, 'axes'=>[]];

		// register every item chain found in the atoms
			foreach ($ar_entries as $entry) {
				foreach ($entry->value->atoms as $atom) {

					$node = $root;
					$identity_chain = [];
					foreach ($atom->path as $pos => $segment) {
						if ($segment->item_index!==null) {
							$axis_key	= implode('.', array_slice($identity_chain, 0, $pos));
							$index		= $segment->item_index;
							if (!isset($node->axes[$axis_key])) {
								$node->axes[$axis_key] = [];
							}
							if (!isset($node->axes[$axis_key][$index])) {
								$node->axes[$axis_key][$index] = (object)['height'=>1, 'offset'=>0, 'axes'=>[]];
							}
							$node = $node->axes[$axis_key][$index];

							if ($first_only) {
								break;
							}
						}
						$identity_chain[] = $segment->get_identity_key();
					}
				}
			}

		// compute heights (bottom-up) and offsets (items stack sequentially)
			self::compute_node_layout($root);

		return $root;
	}//end build_item_tree



	/**
	* COMPUTE_NODE_LAYOUT
	* Recursively compute the 'height' and 'offset' of every node in the item tree
	* using a post-order (bottom-up) depth-first traversal.
	*
	* Within each axis, items are sorted by their item_index (ksort) and stacked
	* sequentially: item N's offset equals the sum of heights of items 0…N-1.
	* The axis height is the sum of all its items' heights (they stack, not overlap).
	*
	* The parent node's height is the MAXIMUM across all its axes rather than their
	* sum, because axes are independent parallel fields that all share the same row
	* span (max-alignment). This is the "row_count = max(...)" rule from the legacy
	* grid: if one portal has 3 items and a sibling portal has 2, the record spans
	* 3 rows and the shorter portal's last row is blank (or filled via fill_the_gaps).
	* @param object $node - tree node to process in-place (children are recursed first)
	* @return void
	*/
	private static function compute_node_layout( object $node ) : void {

		$max_axis_height = 1;
		foreach ($node->axes as $axis_key => $items) {
			// items stack sequentially inside their axis
			ksort($items);
			$node->axes[$axis_key] = $items;

			$offset = 0;
			foreach ($items as $item) {
				self::compute_node_layout($item);
				$item->offset = $offset;
				$offset += $item->height;
			}
			// axis height = sum of its item heights
			if ($offset > $max_axis_height) {
				$max_axis_height = $offset;
			}
		}

		$node->height = $max_axis_height;
	}//end compute_node_layout



	/**
	* REGISTER_COLUMN
	* Get an existing column from the registry by key, or create, position, and
	* return a new one. This is the single point of column creation: every
	* code path that needs a column calls this method.
	*
	* When a new column is created:
	* - Labels are resolved via resolve_labels().
	* - The model is taken from the leaf path segment when not supplied explicitly.
	* - The column is assigned the next available ordinal (stable across the run).
	* - It is inserted into $this->order at the position determined by
	*   compare_columns() so the display order remains deterministic.
	* - A 'col' protocol line is appended to $new_col_lines so the caller can
	*   stream it before the first 'row' line that references this column.
	* - The 'after' field on the 'col' line is the ordinal of the column that
	*   immediately precedes the new one in display order (null when first), giving
	*   the client a live-insert hint for progressive rendering without waiting for
	*   the authoritative 'end' order.
	*
	* (!) The $key parameter must be identical across atoms that share the same
	* structural column. Inconsistent key construction would mint duplicate columns.
	* @param string $key         - stable unique column key (see place_atom key construction)
	* @param string $group       - identity key of the top path segment; groups
	*   all sub-columns of the same top ddo under one header in the preview table
	* @param ?array $path        - ordered list of export_path_segment, root first;
	*   null only for synthetic columns with no ontology path
	* @param array $suffix_map   - segment position => item_index for the column
	*   dimension; used by resolve_labels() to append ' N+1' label suffixes
	* @param int $ddo_index      - 0-based index of the top ddo in ar_ddo_to_export,
	*   used as the primary sort key to preserve user-selected column order
	* @param array $sort_tail    - secondary sort vector (column-dimension indexes),
	*   appended after ddo_index in the sort_key; empty for non-exploded columns
	* @param string $cell_type   - rendering hint from the atom: 'text'|'img'|'av'|
	*   'iri'|'section_id'|'json'
	* @param ?string $model      - PHP class name of the component; when null,
	*   resolved from the leaf path segment's model property
	* @param array &$new_col_lines - accumulator for new 'col' protocol lines
	* @return object - the column object (existing or newly created)
	*/
	private function register_column( string $key, string $group, ?array $path, array $suffix_map, int $ddo_index, array $sort_tail, string $cell_type, ?string $model, array &$new_col_lines ) : object {

		if (isset($this->columns[$key])) {
			return $this->columns[$key];
		}

		// labels
			$labels = $this->resolve_labels($path, $suffix_map, $key);

		// model: explicit or from the leaf segment
			if ($model===null && !empty($path)) {
				$leaf	= $path[sizeof($path)-1];
				$model	= $leaf->model;
			}

		// column object
			$column = (object)[
				'i'			=> $this->next_ordinal++,
				'key'		=> $key,
				'group'		=> $group,
				'path'		=> $path,
				'label'		=> $labels->label,
				'ar_labels'	=> $labels->ar_labels,
				'cell_type'	=> $cell_type,
				'model'		=> $model,
				'sort_key'	=> [$ddo_index, ...$sort_tail],
				'seq'		=> $this->next_seq++
			];
			$this->columns[$key] = $column;
			$this->columns_by_ordinal[$column->i] = $column;

		// ordered insert (deterministic rule, see class doc)
		// Linear scan is acceptable: column counts are in the hundreds at most.
			$insert_pos = sizeof($this->order);
			for ($i = 0; $i < sizeof($this->order); $i++) {
				$other = $this->columns[$this->order[$i]];
				if (self::compare_columns($column, $other) < 0) {
					$insert_pos = $i;
					break;
				}
			}
			array_splice($this->order, $insert_pos, 0, [$key]);

		// after: live-insert hint for the client
		// Null when the column is the very first (no predecessor in display order).
			$after = ($insert_pos > 0)
				? $this->columns[$this->order[$insert_pos-1]]->i
				: null;

		// protocol line
			$new_col_lines[] = (object)[
				't'			=> 'col',
				'i'			=> $column->i,
				'key'		=> $column->key,
				'group'		=> $column->group,
				'path'		=> $column->path,
				'label'		=> $column->label,
				'ar_labels'	=> $column->ar_labels,
				'cell_type'	=> $column->cell_type,
				'model'		=> $column->model,
				'after'		=> $after
			];

		return $column;
	}//end register_column



	/**
	* COMPARE_COLUMNS
	* Three-tier deterministic comparator used by register_column() to maintain
	* the display order of $this->order.
	*
	* Sort tiers (earlier tiers take priority):
	*   1. sort_key lexicographic comparison (element by element): the first
	*      element is always ddo_index (user-selected column order); subsequent
	*      elements are the column-dimension item_indexes (|n suffix sequence).
	*   2. Shorter sort_key first on a common-prefix tie: a base column (no suffix,
	*      shorter key) always sorts before its exploded siblings (|1, |2, …),
	*      so the base column header appears to the left of its variants.
	*   3. Arrival order (seq) as final tiebreaker: two atoms that map to different
	*      columns but share the same (ddo_index, index_vector) retain the order
	*      they were first seen during the record scan.
	* @param object $a - column object with sort_key: array and seq: int
	* @param object $b - column object with sort_key: array and seq: int
	* @return int - negative when $a sorts before $b, positive when after, 0 when equal
	*/
	private static function compare_columns( object $a, object $b ) : int {

		$ka = $a->sort_key;
		$kb = $b->sort_key;
		$len = min(sizeof($ka), sizeof($kb));
		for ($i = 0; $i < $len; $i++) {
			if ($ka[$i]!==$kb[$i]) {
				return $ka[$i] <=> $kb[$i];
			}
		}
		if (sizeof($ka)!==sizeof($kb)) {
			// shorter first: base columns precede their exploded sets
			return sizeof($ka) <=> sizeof($kb);
		}

		return $a->seq <=> $b->seq;
	}//end compare_columns



	/**
	* RESOLVE_LABELS
	* Build the display label and the flat ar_labels array for a column from
	* its structured path and suffix map. Called once per new column at
	* registration time.
	*
	* Label construction per data_format:
	* - 'value' / 'grid_value':
	*     Each path segment contributes a section label and a component label,
	*     resolved via $this->label_resolver (ontology term lookup by default).
	*     Sub_id segments bypass the resolver and use the sub_id string verbatim
	*     (e.g. 'dates', 'duration' for component_info widget outputs).
	*     A '|n' column-suffix on a segment appends ' N+1' to the component label
	*     for legacy parity ('Profession 2' for the second Profession column);
	*     suffix 0 is omitted ('Profession' not 'Profession 1').
	*     The composite label is the component labels joined with ' | '
	*     ('Informants | Name').
	* - 'dedalo_raw':
	*     Section tipo and component tipo are emitted raw (no ontology lookup)
	*     to stay byte-compatible with the tool_import_dedalo_csv header grammar.
	*     component_section_id is aliased to 'section_id' because that is what
	*     the import tool expects as the record key column header.
	*
	* ar_labels keeps the full [section_label, component_label, …] alternation
	* that the legacy dd_grid exposed, used by the flat_table.js preview and the
	* 'show_tipo_in_label' decoration option.
	* @param ?array $path          - ordered list of export_path_segment, root first;
	*   null or empty when no path is available (synthetic columns)
	* @param array $suffix_map     - segment position => item_index for column-dimension
	*   segments; used to append ' N+1' label suffixes
	* @param string $fallback_key  - raw column key to use when path is unavailable,
	*   ensuring the column still gets a non-empty header
	* @return object - {label: string, ar_labels: string[]}
	*/
	private function resolve_labels( ?array $path, array $suffix_map, string $fallback_key ) : object {

		if (empty($path)) {
			return (object)['label'=>$fallback_key, 'ar_labels'=>[$fallback_key]];
		}

		$ar_labels	= [];
		$ar_compact	= [];
		foreach ($path as $pos => $segment) {

			if ($this->data_format==='dedalo_raw') {
				$section_label		= $segment->section_tipo;
				$component_label	= ($segment->model==='component_section_id')
					? 'section_id'
					: $segment->component_tipo;
			}else{
				$resolver = $this->label_resolver;
				$section_label		= $resolver($segment->section_tipo) ?? $segment->section_tipo;
				$component_label	= isset($segment->sub_id)
					? $segment->sub_id
					: ($resolver($segment->component_tipo) ?? $segment->component_tipo);
			}

			// suffix number on column-suffixed segments ('Profession 2')
				if (isset($suffix_map[$pos]) && $suffix_map[$pos] > 0) {
					$component_label .= ' ' . ($suffix_map[$pos] + 1);
				}

			// ar_labels keeps the [section, component] alternation the legacy
			// grid exposed (used by the preview / show_tipo option)
				$ar_labels[] = $section_label;
				$ar_labels[] = $component_label;

			$ar_compact[] = $component_label;
		}

		return (object)[
			'label'		=> implode(' | ', $ar_compact),
			'ar_labels'	=> $ar_labels
		];
	}//end resolve_labels



	/**
	* JOIN_CELL
	* Reduce the list of atoms that have been assigned to one output cell into
	* the final scalar value stored in the 'row' line's 'c' map.
	*
	* A cell can receive multiple atoms when fill_the_gaps causes the same atom
	* to be written to multiple rows, or when a multi-value leaf component
	* produces several atoms for the same structural column and row. The static
	* export_value::join() handles the multi-atom case with the same separator
	* semantics as the flat 'value' format.
	*
	* Special case: a single section_id atom whose value is already an int is
	* returned as-is (not cast to string). Spreadsheet applications and the
	* import round-trip both benefit from a native integer type for the record
	* key column rather than a string-encoded number.
	* @param ?array $cell_atoms - list of export_atom that landed in this cell;
	*   null or empty returns null (empty cell, omitted from the sparse 'c' map)
	* @param object $column     - the column this cell belongs to (unused in the
	*   current implementation but kept in the signature for future cell-type dispatch)
	* @return string|int|null   - the cell scalar, or null for an empty cell
	*/
	private function join_cell( ?array $cell_atoms, object $column ) : string|int|null {

		if (empty($cell_atoms)) {
			return null;
		}

		// single int section_id case
			if (sizeof($cell_atoms)===1
				&& $cell_atoms[0]->cell_type==='section_id'
				&& is_int($cell_atoms[0]->value)) {
				return $cell_atoms[0]->value;
			}

		$joined = export_value::join($cell_atoms);

		return self::clean_text_value($joined);
	}//end join_cell



	/**
	* COLUMN_BY_ORDINAL
	* Look up a column object by its stable integer ordinal using the
	* $columns_by_ordinal secondary index for O(1) access.
	* Called during row building to retrieve the column needed for join_cell().
	* @param int $ordinal - the column's 'i' value as assigned in register_column()
	* @return object      - the column object
	* @throws RuntimeException if the ordinal is not found, which indicates a logic
	*   error in place_atom (an ordinal was stored in cell_groups without
	*   being registered in columns_by_ordinal)
	*/
	private function column_by_ordinal( int $ordinal ) : object {

		if (!isset($this->columns_by_ordinal[$ordinal])) {
			throw new RuntimeException(__METHOD__ . " Unknown column ordinal: $ordinal");
		}

		return $this->columns_by_ordinal[$ordinal];
	}//end column_by_ordinal



	/**
	* CLEAN_TEXT_VALUE
	* Server-side text normalisation: convert paragraph HTML markup to newlines
	* and decode a fixed set of HTML entities, producing plain WYSIWYG text.
	*
	* This is the single chokepoint that replaces the legacy client-side logic
	* in view_csv_dd_grid::get_text_column(). Moving it server-side ensures that
	* CSV, TSV, ODS, XLSX, and HTML downloads all receive identical cell text
	* without each download renderer duplicating the transformation.
	*
	* Transformation steps:
	* 1. Early-return if the string contains neither '<' nor '&' — the strpos
	*    short-circuit avoids both regex and strtr overhead on plain-text values.
	* 2. Paragraph joins: '</p><p>' → '\n', then strip the outer <p>…</p> wrapper
	*    (the first opening <p> and the last closing </p> only) so the exported
	*    text reads like the visible content without surrounding empty lines.
	* 3. Entity decode: a fixed strtr map covering the seven common XML entities
	*    plus their numeric equivalents (&amp;/&#38;, &lt;/&#60;, etc.).
	*    (!) html_entity_decode() is NOT used because it would also decode named
	*    entities that the legacy client intentionally preserved. This map
	*    reproduces the exact legacy client set — do not extend it without
	*    checking parity test export_value_parity_Test.php.
	* @param string $value - raw joined string that may contain HTML markup
	* @return string       - cleaned plain-text string
	*/
	public static function clean_text_value( string $value ) : string {

		if ($value==='' || strpos($value, '<')===false && strpos($value, '&')===false) {
			return $value;
		}

		// paragraphs to returns, strip first/last p tags (legacy client parity)
			$value = str_replace('</p><p>', "\n", $value);
			$value = preg_replace('/^<p>/', '', $value);
			$value = preg_replace('/<\/p>$/', '', $value);

		// decode basic escaped entities (legacy client map)
			$value = strtr($value, [
				'&nbsp;'	=> ' ',
				'&amp;'		=> '&',
				'&#38;'		=> '&',
				'&lt;'		=> '<',
				'&#60;'		=> '<',
				'&gt;'		=> '>',
				'&#62;'		=> '>',
				'&apos;'	=> "'",
				'&#39;'		=> "'",
				'&quot;'	=> '"',
				'&#34;'		=> '"'
			]);

		return $value;
	}//end clean_text_value



}//end class export_tabulator
