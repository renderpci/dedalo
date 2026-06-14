<?php declare(strict_types=1);
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';



/**
* GRID_VALUE_SNAPSHOT_TEST
* Shape-snapshot harness for the grid/atoms convergence (Phase B).
*
* Pins the dd_grid_cell_object shapes the VISUAL consumers depend on
* (thesaurus indexation grid, time machine matrix, descriptors widget)
* before the atoms->dd_grid adapter replaces the per-component
* get_grid_value overrides. Snapshots are self-priming: a missing
* baseline file is written and the test passes; subsequent runs compare
* byte-exact. To intentionally re-baseline after an allowlisted shape
* deviation (see the convergence plan), delete the snapshot file and
* commit the regenerated one with the code change.
*
* Determinism: leaf components are exercised with FIXED set_data values
* (not DB reads — lifecycle tests mutate the fixture records), and
* volatile per-item 'id' keys inside raw 'data' payloads are stripped.
* The indexation grid snapshot uses real cont1 thesaurus data (stable
* user data in the dev DB; re-baseline if that section is edited).
*/
final class grid_value_snapshot_test extends BaseTestCase {



	/**
	* TEST_USER_LOGIN
	* @return void
	*/
	public function test_user_login() {

		$user_id = TEST_USER_ID; // Defined in bootstrap

		if (login::is_logged()===false) {
			login_test::force_login($user_id);
		}

		$this->assertTrue(
			login::is_logged()===true ,
			'expected login true'
		);
	}//end test_user_login



	/////////// ⬇︎ snapshot machinery ⬇︎ ////////////////



	/**
	* ASSERT_SNAPSHOT
	* Self-priming byte-exact JSON snapshot
	* @param string $name
	* @param mixed $payload
	* @return void
	*/
	private function assert_snapshot( string $name, $payload ) : void {

		$dir = __DIR__ . '/snapshots';
		if (!is_dir($dir)) {
			mkdir($dir, 0775, true);
		}
		$file = $dir . '/' . $name . '.json';

		$normalized	= $this->normalize_payload(
			json_decode(json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), true)
		);
		$json = json_encode($normalized, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

		if (!file_exists($file)) {
			// baseline priming run
			file_put_contents($file, $json);
			$this->addToAssertionCount(1);
			return;
		}

		$this->assertSame(
			file_get_contents($file),
			$json,
			"snapshot mismatch: $name — review against the convergence allowlist; delete the file to re-baseline intentionally"
		);
	}//end assert_snapshot



	/**
	* NORMALIZE_PAYLOAD
	* Strip volatile per-item 'id' keys inside raw 'data' payloads
	* (counter-assigned, not stable across runs). Structural ids
	* (column_obj->id) are preserved.
	* @param mixed $payload
	* @return mixed
	*/
	private function normalize_payload( $payload ) {

		if (!is_array($payload)) {
			return $payload;
		}

		foreach ($payload as $key => $value) {
			if ($key==='data' && is_array($value)) {
				foreach ($value as $k => $item) {
					if (is_array($item) && array_key_exists('id', $item)) {
						unset($payload[$key][$k]['id']);
					}
				}
				continue;
			}
			if ($key==='value' && is_array($value)) {
				// base get_grid_value json_encodes object items into strings:
				// strip the counter-assigned volatile 'id' inside them too
				foreach ($value as $k => $item) {
					if (is_string($item) && strpos($item, '"id"')!==false) {
						$decoded = json_decode($item, true);
						if (is_array($decoded) && array_key_exists('id', $decoded)) {
							unset($decoded['id']);
							$payload[$key][$k] = json_encode($decoded, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
						}
					}
				}
				// fall through: items can also be nested cells (relation trees)
			}
			$payload[$key] = $this->normalize_payload($payload[$key]);
		}

		return $payload;
	}//end normalize_payload



	/**
	* BUILD_WITH_DATA
	* Component with fixed injected data (deterministic, no DB read)
	*/
	private function build_with_data( string $model, string $tipo, ?array $data, string $lang=DEDALO_DATA_NOLAN ) : component_common {

		$component = component_common::get_instance(
			$model,
			$tipo,
			'1', // section_id (data injected below; record content irrelevant)
			'list',
			$lang,
			'test3',
			false // bool cache
		);
		if ($data!==null) {
			$component->set_data($data);
		}

		return $component;
	}//end build_with_data



	/////////// ⬇︎ snapshots ⬇︎ ////////////////



	/**
	* TEST_LEAF_GRID_SHAPES
	* Per-model get_grid_value() shape with fixed data — the cells the
	* visual consumers (indexation grid leaves, TM, descriptors) render
	* @return void
	*/
	public function test_leaf_grid_shapes() {

		$this->user_login();

		$cases = [
			// migrating overrides (B2 set)
			'input_text'	=> ['component_input_text',	'test52',	['alpha', 'beta'], DEDALO_DATA_LANG],
			'text_area'		=> ['component_text_area',	'test17',	['<p>first</p>', '<p>second</p>'], DEDALO_DATA_LANG],
			'date'			=> ['component_date',		'test145',	[ (object)['start'=>(object)['year'=>2000,'month'=>6,'day'=>2]] ]],
			'section_id'	=> ['component_section_id',	'test102',	[7]],
			'password'		=> ['component_password',	'test152',	null],
			'image'			=> ['component_image',		'test99',	null], // media URL derives from tipo+section_id (DB data)
			'av'			=> ['component_av',			'test94',	null],
			'3d'			=> ['component_3d',			'test26',	null],
			'iri'			=> ['component_iri',		'test140',	[ (object)['id'=>1, 'iri'=>'https://dedalo.dev', 'title'=>'Site', 'lang'=>DEDALO_DATA_LANG] ], DEDALO_DATA_LANG],
			// base implementation models
			'number'		=> ['component_number',		'test211',	[42]],
			'email'			=> ['component_email',		'test208',	['mail@example.org']],
		];

		foreach ($cases as $name => $case) {
			$model	= $case[0];
			$tipo	= $case[1];
			$data	= $case[2];
			$lang	= $case[3] ?? DEDALO_DATA_NOLAN;

			$component	= $this->build_with_data($model, $tipo, $data, $lang);
			$grid_value	= $component->get_grid_value();

			$this->assertInstanceOf(dd_grid_cell_object::class, $grid_value, "($name)");
			$this->assert_snapshot('leaf_'.$name, $grid_value);
		}
	}//end test_leaf_grid_shapes



	/**
	* TEST_RELATION_GRID_SHAPE
	* Portal grid tree (kept override, but its leaf children will hit the
	* adapter): fixed locator into the hierarchical fixture record
	* @return void
	*/
	public function test_relation_grid_shape() {

		$this->user_login();

		$portal = component_common::get_instance(
			'component_portal', 'test80', '2', 'list', DEDALO_DATA_NOLAN, 'test3', false
		);
		$portal->set_data([ (object)['section_tipo'=>'test3', 'section_id'=>'1'] ]);

		// inject the export-style request_config so the tree resolves a known child
			$show = new stdClass();
				$show->ddo_map = [ (function(){
					$ddo = new dd_object();
						$ddo->set_tipo('test102');
						$ddo->set_section_tipo('test3');
						$ddo->set_model('component_section_id');
						$ddo->set_parent('test80');
						$ddo->set_label('Id');
					return $ddo;
				})() ];
			$request_config = new stdClass();
				$request_config->api_engine	= 'dedalo';
				$request_config->type		= 'main';
				$request_config->show		= $show;
			$portal->request_config = [$request_config];

		$grid_value = $portal->get_grid_value();

		$this->assertInstanceOf(dd_grid_cell_object::class, $grid_value);
		$this->assert_snapshot('relation_portal', $grid_value);
	}//end test_relation_grid_shape



	/**
	* TEST_INDEXATION_GRID_SHAPE
	* Full consumer snapshot: thesaurus indexation grid over real cont1
	* data (the get_indexation_grid request verified in production use)
	* @return void
	*/
	public function test_indexation_grid_shape() {

		$this->user_login();

		$sqo = json_handler::decode('{
			"mode": "related",
			"section_tipo": ["rsc205", "tchi1"],
			"limit": 5,
			"offset": 0,
			"filter_by_locators": [
				{"section_tipo": "cont1", "section_id": "1", "tipo": "hierarchy40"}
			]
		}');

		$indexation_grid	= new indexation_grid('cont1', '1', 'hierarchy40', null);
		$grid				= $indexation_grid->build_indexation_grid($sqo);

		$this->assertIsArray($grid);
		if (empty($grid)) {
			$this->markTestSkipped('no cont1 indexation data in this DB: indexation snapshot unavailable');
		}
		$this->assert_snapshot('indexation_grid_cont1', $grid);
	}//end test_indexation_grid_shape



	/**
	* TEST_TM_COMPOSE_SHAPE
	* Time machine matrix row compose: get_grid_value + get_data_item on a
	* set_data component (mirrors common.php matrix rendering)
	* @return void
	*/
	public function test_tm_compose_shape() {

		$this->user_login();

		$component = $this->build_with_data('component_input_text', 'test52', ['tm fixed value'], DEDALO_DATA_LANG);

		$grid_value	= $component->get_grid_value();
		$data_item	= $component->get_data_item($grid_value);

		$this->assert_snapshot('tm_compose_input_text', $data_item);
	}//end test_tm_compose_shape



}//end class grid_value_snapshot_test
