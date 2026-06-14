<?php declare(strict_types=1);
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';
require_once DEDALO_ROOT_PATH . '/tools/tool_export/class.export_tabulator.php';



/**
* EXPORT_TABULATOR_TEST
* Pure unit tests (no DB): synthetic atoms covering the plan worked
* example — interview INT-5, portal informants (Maria: farmer, weaver;
* José: fisherman) — in all three breakdown modes, plus edge cases.
* Labels are resolved with an injected fake resolver.
*/
final class export_tabulator_test extends BaseTestCase {



	/**
	* FAKE LABELS by tipo
	*/
	private const LABELS = [
		'oh1'		=> 'Interview',
		'oh60'		=> 'Code',
		'oh52'		=> 'Informants',
		'rsc197'	=> 'Person',
		'rsc85'		=> 'Name',
		'rsc92'		=> 'Professions',
		'pr'		=> 'Profession list',
		'pr10'		=> 'Profession'
	];



	/**
	* BUILD_TABULATOR
	*/
	private function build_tabulator( string $data_format, string $breakdown='default', bool $fill_the_gaps=true ) : export_tabulator {

		return new export_tabulator((object)[
			'data_format'		=> $data_format,
			'breakdown'			=> $breakdown,
			'fill_the_gaps'		=> $fill_the_gaps,
			'label_resolver'	=> function(string $tipo) : ?string {
				return self::LABELS[$tipo] ?? null;
			}
		]);
	}//end build_tabulator



	/**
	* BUILD_WORKED_EXAMPLE
	* @return array ar_entries for record_lines
	*/
	private function build_worked_example() : array {

		$seg = function(string $section_tipo, string $component_tipo, ?array $options=null) : export_path_segment {
			return new export_path_segment($section_tipo, $component_tipo, $options ? (object)$options : null);
		};

		// code (input_text like leaf)
			$code_value = new export_value(
				[ new export_atom([$seg('oh1','oh60')], 'INT-5') ],
				'Code',
				'component_input_text'
			);

		// informants portal: name + nested professions portal
			$portal	= $seg('oh1','oh52', ['model'=>'component_portal']);
			$name	= fn(int $k, string $v) => new export_atom(
				[$portal, $seg('rsc197','rsc85', ['item_index'=>$k])],
				$v
			);
			$prof	= fn(int $k, int $j, string $v) => new export_atom(
				[$portal, $seg('rsc197','rsc92', ['item_index'=>$k, 'model'=>'component_portal']), $seg('pr','pr10', ['item_index'=>$j])],
				$v
			);
			$portal_value = new export_value(
				[
					$name(0, 'Maria'),
					$prof(0, 0, 'farmer'),
					$prof(0, 1, 'weaver'),
					$name(1, 'José'),
					$prof(1, 0, 'fisherman')
				],
				'Informants',
				'component_portal'
			);

		return [
			(object)['value'=>$code_value,		'section_tipo'=>'oh1', 'component_tipo'=>'oh60'],
			(object)['value'=>$portal_value,	'section_tipo'=>'oh1', 'component_tipo'=>'oh52']
		];
	}//end build_worked_example



	/**
	* HELPERS: split lines, project a row over the ordered columns
	*/
	private function split_lines( array $lines ) : object {

		$cols = [];
		$rows = [];
		foreach ($lines as $line) {
			if ($line->t==='col')		$cols[] = $line;
			elseif ($line->t==='row')	$rows[] = $line;
		}

		return (object)['cols'=>$cols, 'rows'=>$rows];
	}//end split_lines

	private function project_row( object $row, array $ordered_ordinals ) : array {

		$cells = (array)$row->c;
		return array_map(function($ordinal) use ($cells){
			return $cells[$ordinal] ?? '';
		}, $ordered_ordinals);
	}//end project_row



	/////////// ⬇︎ test start ⬇︎ ////////////////



	/**
	* TEST_ROWS_MODE
	* rows + fill_the_gaps: every relation level explodes vertically,
	* parent values repeated, static column set
	* @return void
	*/
	public function test_rows_mode() {

		$tabulator	= $this->build_tabulator('grid_value', 'rows', true);
		$lines		= $tabulator->record_lines($this->build_worked_example(), 45);
		$split		= $this->split_lines($lines);
		$end		= $tabulator->end_line();

		// static column set: code, name, profession (base keys, no suffixes)
			$this->assertSame(
				['oh1_oh60', 'oh1_oh52.rsc197_rsc85', 'oh1_oh52.rsc197_rsc92.pr_pr10'],
				array_map(fn($c) => $c->key, $split->cols)
			);

		// 3 rows (Maria height 2, José height 1)
			$this->assertCount(3, $split->rows);
			$ordered = $end->columns;
			$this->assertSame(['INT-5', 'Maria', 'farmer'],		$this->project_row($split->rows[0], $ordered));
			$this->assertSame(['INT-5', 'Maria', 'weaver'],		$this->project_row($split->rows[1], $ordered));
			$this->assertSame(['INT-5', 'José', 'fisherman'],	$this->project_row($split->rows[2], $ordered));

		// sub ordinals
			$this->assertSame([0,1,2], array_map(fn($r) => $r->sub, $split->rows));
			$this->assertSame([45,45,45], array_map(fn($r) => $r->rec, $split->rows));

		// end line totals
			$this->assertSame(3, $end->rows);
			$this->assertSame(1, $end->records);
	}//end test_rows_mode



	/**
	* TEST_ROWS_MODE_NO_FILL
	* fill_the_gaps=false: spanning values appear only on the first row of their span
	* @return void
	*/
	public function test_rows_mode_no_fill() {

		$tabulator	= $this->build_tabulator('grid_value', 'rows', false);
		$lines		= $tabulator->record_lines($this->build_worked_example(), 45);
		$split		= $this->split_lines($lines);
		$ordered	= $tabulator->end_line()->columns;

		$this->assertSame(['INT-5', 'Maria', 'farmer'],	$this->project_row($split->rows[0], $ordered));
		$this->assertSame(['', '', 'weaver'],			$this->project_row($split->rows[1], $ordered));
		$this->assertSame(['', 'José', 'fisherman'],	$this->project_row($split->rows[2], $ordered));
	}//end test_rows_mode_no_fill



	/**
	* TEST_COLUMNS_MODE
	* one row per record, per-segment '|n' suffixed columns (n=0 omitted)
	* @return void
	*/
	public function test_columns_mode() {

		$tabulator	= $this->build_tabulator('grid_value', 'columns', true);
		$lines		= $tabulator->record_lines($this->build_worked_example(), 45);
		$split		= $this->split_lines($lines);
		$end		= $tabulator->end_line();

		// single row
			$this->assertCount(1, $split->rows);

		// display order: base set of item 0 first, then exploded sets
			$ordered_keys = array_map(function($ordinal) use ($tabulator, $split){
				foreach ($split->cols as $col) {
					if ($col->i===$ordinal) return $col->key;
				}
				return null;
			}, $end->columns);
			$this->assertSame(
				[
					'oh1_oh60',
					'oh1_oh52.rsc197_rsc85',
					'oh1_oh52.rsc197_rsc92.pr_pr10',
					'oh1_oh52.rsc197_rsc92.pr_pr10|1',
					'oh1_oh52.rsc197_rsc85|1',
					'oh1_oh52.rsc197_rsc92|1.pr_pr10'
				],
				$ordered_keys,
				'expected deterministic ordering: item 0 set, then item 1 set'
			);

		// row content over the final order
			$this->assertSame(
				['INT-5', 'Maria', 'farmer', 'weaver', 'José', 'fisherman'],
				$this->project_row($split->rows[0], $end->columns)
			);

		// per-segment suffixes are collision-free: weaver (informant 0,
		// profession 1) and fisherman (informant 1, profession 0) mint
		// DIFFERENT columns (the legacy trailing-|N encoding collided)
			$this->assertNotSame($ordered_keys[3], $ordered_keys[5]);

		// suffixed labels number the suffixed segment
			$col_by_key = [];
			foreach ($split->cols as $col) $col_by_key[$col->key] = $col;
			$this->assertSame(
				'Informants | Professions 2 | Profession',
				$col_by_key['oh1_oh52.rsc197_rsc92|1.pr_pr10']->label
			);
			$this->assertSame(
				'Informants | Professions | Profession 2',
				$col_by_key['oh1_oh52.rsc197_rsc92.pr_pr10|1']->label
			);
	}//end test_columns_mode



	/**
	* TEST_DEFAULT_MODE
	* legacy semantics: first relation level -> rows, deeper -> '|n' columns
	* @return void
	*/
	public function test_default_mode() {

		$tabulator	= $this->build_tabulator('grid_value', 'default', true);
		$lines		= $tabulator->record_lines($this->build_worked_example(), 45);
		$split		= $this->split_lines($lines);
		$end		= $tabulator->end_line();

		// 2 rows (one per informant), 4 columns (code, name, prof, prof|1)
			$this->assertCount(2, $split->rows);
			$this->assertSame(
				['oh1_oh60', 'oh1_oh52.rsc197_rsc85', 'oh1_oh52.rsc197_rsc92.pr_pr10', 'oh1_oh52.rsc197_rsc92.pr_pr10|1'],
				array_map(fn($c) => $c->key, $split->cols)
			);

		// fill_the_gaps repeats the record-level code on both rows
			$this->assertSame(['INT-5', 'Maria', 'farmer', 'weaver'],	$this->project_row($split->rows[0], $end->columns));
			$this->assertSame(['INT-5', 'José', 'fisherman', ''],		$this->project_row($split->rows[1], $end->columns));

		// legacy label parity: suffix number lands on the LAST label ('Profession 2')
			$prof1 = null;
			foreach ($split->cols as $col) {
				if ($col->key==='oh1_oh52.rsc197_rsc92.pr_pr10|1') $prof1 = $col;
			}
			$this->assertSame('Informants | Professions | Profession 2', $prof1->label);
	}//end test_default_mode



	/**
	* TEST_VALUE_FORMAT
	* flat format: one column per ddo, atoms joined with legacy semantics
	* @return void
	*/
	public function test_value_format() {

		$tabulator	= $this->build_tabulator('value');
		$lines		= $tabulator->record_lines($this->build_worked_example(), 45);
		$split		= $this->split_lines($lines);
		$end		= $tabulator->end_line();

		$this->assertCount(1, $split->rows);
		$this->assertCount(2, $split->cols);
		$this->assertSame(
			['INT-5', 'Maria, farmer, weaver | José, fisherman'],
			$this->project_row($split->rows[0], $end->columns),
			'expected legacy flat join: nested items with fields_separator, top items with records_separator'
		);
	}//end test_value_format



	/**
	* TEST_DEDALO_RAW_FORMAT
	* pass-through: pre-encoded strings emitted verbatim, tipo headers
	* @return void
	*/
	public function test_dedalo_raw_format() {

		$seg = new export_path_segment('test3', 'test52', (object)['model'=>'component_input_text']);
		$raw_string = '{"dedalo_data":[{"value":"hola","lang":"lg-spa"}]}';
		$entries = [
			(object)[
				'value'			=> new export_value([ new export_atom([$seg], $raw_string, (object)['cell_type'=>'json']) ], 'Title', 'component_input_text'),
				'section_tipo'	=> 'test3',
				'component_tipo'=> 'test52'
			],
			(object)[
				'value'			=> new export_value([ new export_atom(
									[new export_path_segment('test3', 'test102', (object)['model'=>'component_section_id'])],
									7,
									(object)['cell_type'=>'section_id']
								  ) ], 'Id', 'component_section_id'),
				'section_tipo'	=> 'test3',
				'component_tipo'=> 'test102'
			]
		];

		$tabulator	= $this->build_tabulator('dedalo_raw');
		$lines		= $tabulator->record_lines($entries, 1);
		$split		= $this->split_lines($lines);

		// verbatim raw string (no cleaning, no joining) and int section_id
			$cells = (array)$split->rows[0]->c;
			$this->assertSame($raw_string, $cells[$split->cols[0]->i]);
			$this->assertSame(7, $cells[$split->cols[1]->i]);

		// raw headers: tipo / 'section_id' (import round-trip grammar)
			$this->assertSame('test52',		$split->cols[0]->label);
			$this->assertSame('section_id',	$split->cols[1]->label);
	}//end test_dedalo_raw_format



	/**
	* TEST_SIBLING_AXES_MAX_ALIGN
	* two top portals with 3 vs 2 items: 3 rows, no cartesian product
	* @return void
	*/
	public function test_sibling_axes_max_align() {

		$portal_a = new export_path_segment('oh1', 'oh52', (object)['model'=>'component_portal']);
		$portal_b = new export_path_segment('oh1', 'oh53', (object)['model'=>'component_portal']);
		$leaf = fn(export_path_segment $portal, string $tipo, int $k, string $v) => new export_atom(
			[$portal, new export_path_segment('rsc197', $tipo, (object)['item_index'=>$k])],
			$v
		);

		$entries = [
			(object)[
				'value' => new export_value([
					$leaf($portal_a, 'rsc85', 0, 'a0'),
					$leaf($portal_a, 'rsc85', 1, 'a1'),
					$leaf($portal_a, 'rsc85', 2, 'a2')
				]),
				'section_tipo'=>'oh1', 'component_tipo'=>'oh52'
			],
			(object)[
				'value' => new export_value([
					$leaf($portal_b, 'rsc86', 0, 'b0'),
					$leaf($portal_b, 'rsc86', 1, 'b1')
				]),
				'section_tipo'=>'oh1', 'component_tipo'=>'oh53'
			]
		];

		$tabulator	= $this->build_tabulator('grid_value', 'rows', true);
		$lines		= $tabulator->record_lines($entries, 9);
		$split		= $this->split_lines($lines);
		$ordered	= $tabulator->end_line()->columns;

		$this->assertCount(3, $split->rows, 'expected max-aligned rows (3), not cartesian (6)');
		$this->assertSame(['a0','b0'],	$this->project_row($split->rows[0], $ordered));
		$this->assertSame(['a1','b1'],	$this->project_row($split->rows[1], $ordered));
		$this->assertSame(['a2',''],	$this->project_row($split->rows[2], $ordered));
	}//end test_sibling_axes_max_align



	/**
	* TEST_EMPTY_RELATION_RECORD
	* a record with no atoms still emits one row (blank cells) and the
	* static columns exist in 'value' format
	* @return void
	*/
	public function test_empty_relation_record() {

		// declared ddo path of the portal column (passed by tool_export so
		// headers resolve even when the minting record has no atoms)
			$portal_ddo_path = [
				new export_path_segment('oh1', 'oh52', (object)['model'=>'component_portal']),
				new export_path_segment('rsc197', 'rsc85', (object)['model'=>'component_input_text'])
			];

		$entries = [
			(object)['value'=>new export_value([], 'Code', 'component_input_text'), 'section_tipo'=>'oh1', 'component_tipo'=>'oh60'],
			(object)['value'=>new export_value([], 'Informants', 'component_portal'), 'section_tipo'=>'oh1', 'component_tipo'=>'oh52', 'path'=>$portal_ddo_path]
		];

		// value format: static columns minted even with no atoms
			$tabulator	= $this->build_tabulator('value');
			$lines		= $tabulator->record_lines($entries, 3);
			$split		= $this->split_lines($lines);
			$this->assertCount(2, $split->cols);
			$this->assertCount(1, $split->rows);
			$this->assertSame([], (array)$split->rows[0]->c, 'expected sparse empty cells');

		// headers resolve from the ontology, NOT the raw identity key
		// (regression: empty columns leaked 'rsc197_rsc85'-style headers)
			$this->assertSame(
				'Code',
				$split->cols[0]->label,
				'expected resolved label for an empty leaf column'
			);
			$this->assertSame(
				'Informants | Name',
				$split->cols[1]->label,
				'expected the declared ddo path chain label for an empty portal column'
			);

		// dedalo_raw: header = top component tipo (import grammar), even empty
			$tabulator_raw	= $this->build_tabulator('dedalo_raw');
			$lines_raw		= $tabulator_raw->record_lines($entries, 3);
			$split_raw		= $this->split_lines($lines_raw);
			$this->assertSame(
				['oh60', 'oh52'],
				array_map(fn($c) => $c->label, $split_raw->cols),
				'expected raw tipo headers for empty columns'
			);

		// breakdown: data driven, no columns but still one row
			$tabulator2	= $this->build_tabulator('grid_value', 'rows');
			$lines2		= $tabulator2->record_lines($entries, 3);
			$split2		= $this->split_lines($lines2);
			$this->assertCount(0, $split2->cols);
			$this->assertCount(1, $split2->rows);
	}//end test_empty_relation_record



	/**
	* TEST_DETERMINISTIC_ORDER
	* shuffled atom arrival between records converges to the same end order
	* @return void
	*/
	public function test_deterministic_order() {

		// record 1 has only José (item 1), record 2 brings item 0 columns later
			$portal	= new export_path_segment('oh1', 'oh52', (object)['model'=>'component_portal']);
			$name	= fn(int $k, string $v) => new export_atom(
				[$portal, new export_path_segment('rsc197', 'rsc85', (object)['item_index'=>$k])],
				$v
			);
			$build_entries = fn(array $atoms) => [
				(object)['value'=>new export_value($atoms), 'section_tipo'=>'oh1', 'component_tipo'=>'oh52']
			];

		$tabulator = $this->build_tabulator('grid_value', 'columns');
		$tabulator->record_lines($build_entries([$name(1, 'solo-second')]), 1);
		$lines2 = $tabulator->record_lines($build_entries([$name(0, 'first'), $name(1, 'second')]), 2);

		// the |1 column was discovered FIRST (record 1) but the end order
		// places the base column before it (deterministic rule)
			$end			= $tabulator->end_line();
			$ordered_keys	= [];
			$all_cols		= [];
			foreach ([$lines2] as $lines) {
				foreach ($lines as $line) {
					if ($line->t==='col') $all_cols[$line->i] = $line->key;
				}
			}
			// register record 1 col too
			$this->assertSame(2, sizeof($end->columns));

		// base column ordinal is 1 (minted second) but ordered first
			$this->assertSame([1, 0], $end->columns, 'expected base column ordered before the |1 column despite later discovery');
	}//end test_deterministic_order



	/**
	* TEST_PARENTS_SUB_COLUMN
	* Atoms shaped like the relation 'value_with_parents' export option
	* (sub_id 'parents' segment, ' > ' join): the chain lands in a sibling
	* column next to the term, in default breakdown and flat value format
	* @return void
	*/
	public function test_parents_sub_column() {

		$portal	= new export_path_segment('oh1', 'rsc91', (object)['model'=>'component_autocomplete_hi']);
		$term	= new export_atom(
			[$portal, new export_path_segment('ts1', 'ts10', (object)['item_index'=>0])],
			'Valencia'
		);
		$parents_segment = new export_path_segment('ts1', 'rsc91', (object)[
			'sub_id'			=> 'parents',
			'item_index'		=> 0,
			'fields_separator'	=> ' > '
		]);
		$parents = [
			new export_atom([$portal, $parents_segment], 'València', (object)['value_index'=>0]),
			new export_atom([$portal, $parents_segment], 'Comunidad Valenciana', (object)['value_index'=>1]),
			new export_atom([$portal, $parents_segment], 'España', (object)['value_index'=>2])
		];

		$entries = [
			(object)[
				'value'			=> new export_value([$term, ...$parents], 'Municipality', 'component_autocomplete_hi'),
				'section_tipo'	=> 'oh1',
				'component_tipo'=> 'rsc91'
			]
		];

		// default breakdown: term column + sibling parents column, one row
			$tabulator	= $this->build_tabulator('grid_value', 'default', true);
			$lines		= $tabulator->record_lines($entries, 7);
			$split		= $this->split_lines($lines);
			$end		= $tabulator->end_line();

			$this->assertCount(1, $split->rows);
			$this->assertSame(
				['oh1_rsc91.ts1_ts10', 'oh1_rsc91.ts1_rsc91#parents'],
				array_map(fn($c) => $c->key, $split->cols),
				'expected the parents chain as a sibling sub-column'
			);
			$this->assertSame(
				['Valencia', 'València > Comunidad Valenciana > España'],
				$this->project_row($split->rows[0], $end->columns)
			);
			// sub_id label is used verbatim
			$this->assertStringEndsWith('| parents', $split->cols[1]->label);

		// flat value format: chain joins into the single portal cell
			$tabulator_flat	= $this->build_tabulator('value');
			$lines_flat		= $tabulator_flat->record_lines($entries, 7);
			$split_flat		= $this->split_lines($lines_flat);
			$this->assertSame(
				['Valencia, València > Comunidad Valenciana > España'],
				$this->project_row($split_flat->rows[0], $tabulator_flat->end_line()->columns)
			);
	}//end test_parents_sub_column



	/**
	* TEST_CLEAN_TEXT_VALUE
	* server-side paragraph/entity cleanup (legacy client parity)
	* @return void
	*/
	public function test_clean_text_value() {

		$this->assertSame(
			"first\nsecond",
			export_tabulator::clean_text_value('<p>first</p><p>second</p>')
		);
		$this->assertSame(
			'a & b "c" <d>',
			export_tabulator::clean_text_value('a &amp; b &quot;c&quot; &lt;d&gt;')
		);
		$this->assertSame(
			'plain',
			export_tabulator::clean_text_value('plain')
		);
	}//end test_clean_text_value



}//end class export_tabulator_test
