<?php declare(strict_types=1);
/**
* EXPORT_TABULATOR
*
* Converts the atoms based component export contract (export_value /
* export_atom, see core/dd_grid/) into a flat table: a column manifest
* plus rows of scalar cells, emitted as NDJSON-ready line objects.
*
* The tabulator is pure: atoms in, line objects out. No DB access and no
* output side effects (ontology label lookups are injected as a resolver
* callable so unit tests run without a database).
*
* Wire protocol (one JSON object per NDJSON line, discriminated by 't'):
* - {"t":"meta", v, data_format, breakdown, fill_the_gaps, section_tipo, total}
* - {"t":"col",  i, key, group, path, label, ar_labels, cell_type, model, after}
*   Emitted before the first row that uses the column; breakdown columns
*   can appear mid-stream (single pass). 'i' is a stable ordinal cells
*   reference; 'after' is a live-insert hint; the authoritative display
*   order arrives in the 'end' line.
* - {"t":"row",  rec, sub, c:{ordinal: scalar, ...}}
*   Sparse ordinal-keyed cells: misalignment is structurally impossible.
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
*/
class export_tabulator {



	/**
	 * @var string $data_format  'value' | 'grid_value' | 'dedalo_raw'
	 */
	private string $data_format;

	/**
	 * @var string $breakdown  'default' | 'rows' | 'columns'
	 */
	private string $breakdown;

	/**
	 * @var bool $fill_the_gaps  repeat spanning values on every exploded row
	 */
	private bool $fill_the_gaps;

	/**
	 * Label resolver: fn(string $tipo): ?string
	 * Injected so the tabulator stays DB-free in unit tests.
	 * @var callable $label_resolver
	 */
	private $label_resolver;

	/**
	 * Column registry: key => column object
	 * {i, key, group, path, label, ar_labels, cell_type, model, sort_key, seq}
	 * @var array $columns
	 */
	private array $columns = [];

	/**
	 * Display order: list of column keys, maintained sorted
	 * @var array $order
	 */
	private array $order = [];

	/**
	 * Ordinal => column object fast lookup
	 * @var array $columns_by_ordinal
	 */
	private array $columns_by_ordinal = [];

	private int $next_ordinal	= 0;
	private int $next_seq		= 0;
	private int $rows_emitted	= 0;
	private int $records_count	= 0;



	/**
	* __CONSTRUCT
	* @param object $options
	* 	- data_format: string 'value'|'grid_value'|'dedalo_raw' (default 'value')
	* 	- breakdown: string 'default'|'rows'|'columns' (default 'default')
	* 	- fill_the_gaps: bool (default true)
	* 	- label_resolver: callable fn(string $tipo): ?string (default ontology lookup)
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
	* First protocol line
	* @param string $section_tipo
	* @param int|null $total = null
	* 	total records expected (when known)
	* @return object
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
	* Tabulate one record. Returns the protocol lines for the record:
	* the 'col' lines of any newly discovered columns followed by the
	* record 'row' line(s).
	* @param array $ar_entries
	* 	One entry per top-level export ddo, in ddo order:
	* 	{value: export_value, section_tipo: string, component_tipo: string}
	* @param int|string $rec_id
	* 	record identifier (section_id, or TM row id)
	* @return array
	* 	list of line objects
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
	* Last protocol line: authoritative column display order
	* @return object
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
	* Resolve the column and the output row indexes of one atom according
	* to the breakdown mode.
	* @param export_atom $atom
	* @param int $ddo_index
	* @param object|null $item_tree
	* @param array &$new_col_lines
	* @return object {column: object, rows: array}
	*/
	private function place_atom( export_atom $atom, int $ddo_index, ?object $item_tree, array &$new_col_lines ) : object {

		// indexed positions: [{pos: segment position, axis_chain_key, index}]
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

		// sort vector: index vector with column-dimension semantics
		// (rows-mode columns have no index dimension; suffix indexes order
		// the exploded sets after their base set)
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
	* Map an atom row chain ((axis,index) pairs) to output row indexes
	* using the record item tree offsets/heights.
	* @param array $row_chain
	* @param object|null $item_tree
	* @return array
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
	* Build the record relation item tree from all atom index vectors.
	* Nodes: {height, offset, axes: {axis_key: {index: node}}}
	* Sibling axes inside one node are max-aligned: height(node) =
	* max over axes of sum(child item heights), min 1 (legacy
	* row_count = max(...) semantics, no cartesian product).
	* @param array $ar_entries
	* @param bool $first_only = false
	* 	register only the first indexed level per atom (default mode:
	* 	deeper levels become columns, every row item has height 1)
	* @return object root node
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
	* @param object $node
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
	* Get or create a column in the registry. New columns compute their
	* deterministic display position and append a 'col' protocol line.
	* @return object the column
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
	* Deterministic display order: (ddo position, index vector
	* lexicographic with shorter-first on tie prefix, arrival order)
	* @param object $a
	* @param object $b
	* @return int
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
	* Build label / ar_labels from the structured path.
	* - standard formats: ontology component labels joined ' | ', with
	*   ' N+1' appended on column-suffixed segments (legacy parity:
	*   'Profession 2'); sub_id segments use the sub_id verbatim.
	* - dedalo_raw: 'section_id' for component_section_id, else the tipo
	*   (byte-compatible with the tool_import_dedalo_csv header grammar).
	* @param array|null $path
	* @param array $suffix_map segment position => index
	* @param string $fallback_key used when no path is available
	* @return object {label: string, ar_labels: array}
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
	* Join the atoms that land in one output cell into the final scalar.
	* section_id single values stay int (spreadsheet/import friendliness)
	* @param array|null $cell_atoms
	* @param object $column
	* @return string|int|null
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
	* @param int $ordinal
	* @return object
	*/
	private function column_by_ordinal( int $ordinal ) : object {

		if (!isset($this->columns_by_ordinal[$ordinal])) {
			throw new RuntimeException(__METHOD__ . " Unknown column ordinal: $ordinal");
		}

		return $this->columns_by_ordinal[$ordinal];
	}//end column_by_ordinal



	/**
	* CLEAN_TEXT_VALUE
	* Server-side text cleanup, single chokepoint replacing the legacy
	* client logic (view_csv_dd_grid get_text_column): paragraphs become
	* newlines and basic HTML entities are decoded, so CSV/TSV/HTML/XLSX
	* all receive the same WYSIWYG text.
	* @param string $value
	* @return string
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
