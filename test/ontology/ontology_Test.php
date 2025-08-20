<?php declare(strict_types=1);
// PHPUnit classes
use PHPUnit\Framework\TestCase;
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';



final class ontology_test extends TestCase {



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



	/**
	* GET_SAMPLE_DD_ROW
	* @return
	*/
	public static function get_sample_dd_row() {
		return json_decode('
			{
				"id": "16028305",
				"terminoID": "test102",
				"parent": "test45",
				"modelo": "dd1747",
				"is_model": false,
				"order_number": "28",
				"visible": "si",
				"norden": "28",
				"tld": "test",
				"is_translatable": false,
				"relations": "null",
				"propiedades": null,
				"properties": null,
				"term2": null,
				"term": "{\"lg-spa\": \"section_id\"}"
			}
		');
	}//end get_sample_dd_row



	/////////// ⬇︎ test start ⬇︎ ////////////////



	/**
	* TEST_class_vars
	* @return void
	*/
	public function test_class_vars() {

		// disable log
		logger_backend_activity::$enable_log = false;

		// ontology::$main_table
			$result		= ontology::$main_table;
			$expected	= 'matrix_ontology_main';
			$this->assertTrue(
				$result===$expected ,
				'expected:' . $expected . PHP_EOL
				.'result: ' .$result . PHP_EOL
			);

		// ontology::$main_section_tipo
			$result		= ontology::$main_section_tipo;
			$expected	= DEDALO_ONTOLOGY_SECTION_TIPO; // 'ontology35';
			$this->assertTrue(
				$result===$expected ,
				'expected:' . $expected . PHP_EOL
				.'result: ' .$result . PHP_EOL
			);
	}//end test_class_vars



	/**
	* TEST_create_ontology_records
	* @return void
	*/
	public function test_create_ontology_records() {

		$_ENV['DEDALO_LAST_ERROR'] = null; // reset

		$sample_dd_row = self::get_sample_dd_row();

		// force user id needed for search (filter by projects)
		$_SESSION['dedalo']['auth']['user_id'] = 1;

		$result = ontology::create_ontology_records( [$sample_dd_row] );

		$this->assertTrue(
			empty($_ENV['DEDALO_LAST_ERROR']),
			'expected running without errors. DEDALO_LAST_ERROR: ' .$_ENV['DEDALO_LAST_ERROR']
		);

		$expected = true;
		$this->assertTrue(
			$result===$expected ,
			'expected:' . to_string($expected) . PHP_EOL
			.'result: ' . to_string($result) . PHP_EOL
		);
	}//end test_create_ontology_records



	/**
	* TEST_add_section_record_from_jer_dd
	* @return void
	*/
	public function test_add_section_record_from_jer_dd() {

		$sample_dd_row = self::get_sample_dd_row();

		// force user id needed for search (filter by projects)
		$_SESSION['dedalo']['auth']['user_id'] = 1;

		$result = ontology::add_section_record_from_jer_dd( $sample_dd_row );

		$expected = true;
		$this->assertTrue(
			$result===$expected ,
			'expected:' . to_string($expected) . PHP_EOL
			.'result: ' . to_string($result) . PHP_EOL
		);
	}//end test_add_section_record_from_jer_dd



	/**
	* TEST_get_ontology_main_from_tld
	* @return void
	*/
	public function test_get_ontology_main_from_tld() {

		// test tld
			$tld = 'dd';

			$result = ontology::get_ontology_main_from_tld( $tld );

			$expected = 'object';
			$this->assertTrue(
				gettype($result)===$expected ,
				'expected:' . to_string($expected) . PHP_EOL
				.'result type: ' . gettype($result) . PHP_EOL
			);

			$expected = DEDALO_ONTOLOGY_SECTION_TIPO; // 'ontology35';
			$this->assertTrue(
				$result->section_tipo===$expected ,
				'expected:' . to_string($expected) . PHP_EOL
				.'result section_tipo: ' . $result->section_tipo . PHP_EOL
			);

		// nonexitingtld tld
			$tld = 'nonexitingtld';

			$result = ontology::get_ontology_main_from_tld( $tld );

			$expected = 'NULL';
			$this->assertTrue(
				gettype($result)===$expected ,
				'expected:' . to_string($expected) . PHP_EOL
				.'result type: ' . gettype($result) . PHP_EOL
			);
	}//end test_get_ontology_main_from_tld



	/**
	* TEST_get_ontology_main_form_target_section_tipo
	* @return void
	*/
	public function test_get_ontology_main_form_target_section_tipo() {

		// target_section_tipo
			$target_section_tipo = 'rsc0';

			$result = ontology::get_ontology_main_form_target_section_tipo( $target_section_tipo );

			$expected = 'object';
			$this->assertTrue(
				gettype($result)===$expected ,
				'expected:' . to_string($expected) . PHP_EOL
				.'result type: ' . gettype($result) . PHP_EOL
			);

			$expected = DEDALO_ONTOLOGY_SECTION_TIPO; // 'ontology35';
			$this->assertTrue(
				$result->section_tipo===$expected ,
				'expected:' . to_string($expected) . PHP_EOL
				.'result section_tipo: ' . $result->section_tipo . PHP_EOL
			);

			$expected = '7';
			$this->assertTrue(
				$result->section_id===$expected ,
				'expected:' . to_string($expected) . PHP_EOL
				.'result section_id: ' . $result->section_id . PHP_EOL
			);

		// nonexitingsectiontipo1 target_section_tipo
			$target_section_tipo = 'nonexitingsectiontipo1';

			$result = ontology::get_ontology_main_form_target_section_tipo( $target_section_tipo );

			$expected = 'NULL';
			$this->assertTrue(
				gettype($result)===$expected ,
				'expected:' . to_string($expected) . PHP_EOL
				.'result type: ' . gettype($result) . PHP_EOL
			);
	}//end test_get_ontology_main_form_target_section_tipo



	/**
	* TEST_assign_relations_from_jer_dd
	* @return void
	*/
	public function test_assign_relations_from_jer_dd() {

		// tld
			$tld = 'test';

			$result = ontology::assign_relations_from_jer_dd( $tld );

			$expected = 'boolean';
			$this->assertTrue(
				gettype($result)===$expected ,
				'expected:' . to_string($expected) . PHP_EOL
				.'result type: ' . gettype($result) . PHP_EOL
			);
	}//end test_assign_relations_from_jer_dd



	/**
	* TEST_reorder_nodes_from_jer_dd
	* @return void
	*/
	public function test_reorder_nodes_from_jer_dd() {

		// tld
			$tld = 'test';

			$result = ontology::reorder_nodes_from_jer_dd( $tld );

			$expected = 'boolean';
			$this->assertTrue(
				gettype($result)===$expected ,
				'expected:' . to_string($expected) . PHP_EOL
				.'result type: ' . gettype($result) . PHP_EOL
			);
	}//end test_reorder_nodes_from_jer_dd



	/**
	* TEST_add_main_section
	* @return void
	*/
	public function test_add_main_section() {

		// file_item
			$file_item = (object)[
				'tld' => 'test',
			];

			$result = ontology::add_main_section( $file_item );

			$expected = 'string';
			$this->assertTrue(
				gettype($result)===$expected ,
				'expected:' . to_string($expected) . PHP_EOL
				.'result type: ' . gettype($result) . PHP_EOL
				.'result: ' . to_string($result)
			);

			$expected = '8';
			$this->assertTrue(
				$result==$expected,
				'expected:' . to_string($expected) . PHP_EOL
					.'result: ' . to_string($result)
			);
	}//end test_add_main_section



	/**
	* TEST_create_jer_dd_local_ontology_section_node
	* @return void
	*/
	public function test_create_jer_dd_local_ontology_section_node() {

		// tld
			$file_item = (object)[
				'tld'			=> 'test',
				'typology_id'	=> 15,
				'name_data'		=> (object)[
					'lg-eng' => ['Test jer_dd_ontology_section_node EN'],
					'lg-spa' => ['Test jer_dd_ontology_section_node ES']
				],
				'parent_grouper_tipo' => null
			];

			// Call the method under test
			$result = ontology::create_jer_dd_ontology_section_node($file_item);

			$expected = 'string';
			$this->assertTrue(
				gettype($result)===$expected ,
				'expected:' . to_string($expected) . PHP_EOL
				.'result type: ' . gettype($result) . PHP_EOL
				.'result: ' . to_string($result)
			);

			$expected = 'test0';
			$this->assertTrue(
				$result==$expected,
				'expected:' . to_string($expected) . PHP_EOL
				.'result: ' . to_string($result)
			);

		// check jer_dd created record
			$ontology_node = new ontology_node($result);
				$ontology_node->use_cache = false;
				$term = $ontology_node->get_term();

				$expected = 'Test jer_dd_ontology_section_node ES';
				$lang = 'lg-spa';
				$this->assertTrue(
					$term->{$lang}==$expected,
					'expected [1]: ' . to_string($expected) . PHP_EOL
					.'result: ' . to_string($term->{$lang}) . PHP_EOL
					.'term: ' . to_string($term)
				);

		// Call the method under test 2
			$expected2 = 'Test jer_dd_ontology_section_node ES 2';
			// edit term value
			$file_item2 = clone $file_item;
			$file_item2->name_data->$lang = [$expected2];
			$result = ontology::create_jer_dd_ontology_section_node($file_item2);

		// check jer_dd created record
			$ontology_node2 = new ontology_node($result);
			$ontology_node2->use_cache = false;
				$term2 = $ontology_node2->get_term();
				$this->assertTrue(
					$term2->{$lang}===$expected2,
					'expected [2]: ' . to_string($expected2) . PHP_EOL
					.'result: ' . to_string($term2->{$lang}) . PHP_EOL
					.'term: ' . to_string($term2) . PHP_EOL
					.'file_item: ' . to_string($file_item)
				);
	}//end test_create_jer_dd_local_ontology_section_node



	/**
	* TEST_create_parent_grouper
	* @return void
	*/
	public function test_create_parent_grouper() {

		// tld
			$file_item = (object)[
				'tld'			=> 'test',
				'typology_id'	=> 15,
				'name_data'		=> (object)[
					'lg-eng' => ['Test jer_dd_ontology_section_node EN'],
					'lg-spa' => ['Test jer_dd_ontology_section_node ES']
				],
				'parent_grouper_tipo' => null
			];

			// Call the method under test
			$result = ontology::create_parent_grouper();

			$expected = 'string';
			$this->assertTrue(
				gettype($result)===$expected ,
				'expected:' . to_string($expected) . PHP_EOL
				.'result type: ' . gettype($result) . PHP_EOL
				.'result: ' . to_string($result)
			);

			$expected = 'ontologytype15';
			$this->assertTrue(
				$result===$expected,
				'expected:' . to_string($expected) . PHP_EOL
				.'result: ' . to_string($result)
			);

		// check jer_dd created record
			$ontology_node = new ontology_node($result);
				$ontology_node->use_cache = false;

				// term
				$term = $ontology_node->get_term();

				$expected = 'Others';
				$lang = 'lg-eng';
				$this->assertTrue(
					$term->{$lang}==$expected,
					'expected [1]: ' . to_string($expected) . PHP_EOL
					.'result: ' . to_string($term->{$lang}) . PHP_EOL
					.'term: ' . to_string($term)
				);

				// parent
				$parent = $ontology_node->get_parent();

				$expected = 'ontology40';
				$this->assertTrue(
					$parent===$expected,
					'expected [2]: ' . to_string($expected) . PHP_EOL
					.'parent: ' . to_string($parent) . PHP_EOL
					.'result: ' . to_string($result)
				);

				// tld
				$tld = $ontology_node->get_tld();

				$expected = 'ontologytype';
				$this->assertTrue(
					$tld===$expected,
					'expected [2]: ' . to_string($expected) . PHP_EOL
					.'tld: ' . to_string($tld) . PHP_EOL
					.'result: ' . to_string($result)
				);

				// model
				// $column_exists = DBi::check_column_exists('jer_dd', 'model');
				if (ontology_node::has_column('model')) {

					$model = $ontology_node->get_model();

					$expected = 'area';
					$this->assertTrue(
						$model===$expected,
						'expected [2]: ' . to_string($expected) . PHP_EOL
						.'model: ' . to_string($model) . PHP_EOL
						.'result: ' . to_string($result)
					);
				}
	}//end test_create_parent_grouper



	/**
	* TEST_map_tld_to_target_section_tipo
	* @return void
	*/
	public function test_map_tld_to_target_section_tipo() {

		$tld = 'test';
		$result = ontology::map_tld_to_target_section_tipo($tld);

		$this->assertTrue(
			gettype($result)==='string',
			'expected string ' . PHP_EOL
				. gettype($result)
		);

		$expected = $tld.'0';
		$this->assertTrue(
			$result===$expected,
			'expected: ' . to_string($expected) . PHP_EOL
			.'result: ' . to_string($result)
		);

		$tld = 'oh';
		$result = ontology::map_tld_to_target_section_tipo($tld);

		$expected = $tld.'0';
		$this->assertTrue(
			$result===$expected,
			'expected: ' . to_string($expected) . PHP_EOL
			.'result: ' . to_string($result)
		);
	}//end test_map_tld_to_target_section_tipo



	/**
	* TEST_map_target_section_tipo_to_tld
	* @return void
	*/
	public function test_map_target_section_tipo_to_tld() {

		$tld			= 'test';
		$section_tipo	= 'test0';
		$result = ontology::map_target_section_tipo_to_tld($section_tipo);

		$this->assertTrue(
			gettype($result)==='string',
			'expected string ' . PHP_EOL
				. gettype($result)
		);

		$expected = $tld;
		$this->assertTrue(
			$result===$expected,
			'expected: ' . to_string($expected) . PHP_EOL
			.'result: ' . to_string($result)
		);

		$tld			= 'rsc';
		$section_tipo	= 'rsc0';
		$result = ontology::map_target_section_tipo_to_tld($tld);

		$expected = $tld;
		$this->assertTrue(
			$result===$expected,
			'expected: ' . to_string($expected) . PHP_EOL
			.'result: ' . to_string($result)
		);
	}//end test_map_target_section_tipo_to_tld



	/**
	* TEST_get_all_ontology_sections
	* @return void
	*/
	public function test_get_all_ontology_sections() {

		$result = ontology::get_all_ontology_sections();

		$this->assertTrue(
			gettype($result)==='array',
			'expected array ' . PHP_EOL
				. gettype($result)
		);

		$expected = [
			// 'hierarchytype0',
			// 'hierarchymtype0',
			'uncertainty0',
			'utoponymy0',
			'hierarchy0',
			'ontologytype0',
			'dd0',
			'lg0',
			'rsc0',
			'tch0',
			'oh0',
			'test0'
		];
		$included = true;
		foreach ($expected as $value) {
			if (!in_array($value, $result)) {
				$included = false;
				break;
			}
		}
		$this->assertTrue(
			$included===true,
			'expected: ' . to_string(true) . PHP_EOL
			.'included: ' . to_string($included) . PHP_EOL
			.'result all_ontology_sections: ' . to_string($result) . PHP_EOL
		);
	}//end test_get_all_ontology_sections



	/**
	* TEST_get_all_main_ontology_records
	* @return void
	*/
	public function test_get_all_main_ontology_records() {

		$result = ontology::get_all_main_ontology_records();

		$this->assertTrue(
			gettype($result)==='array',
			'expected array ' . PHP_EOL
				. gettype($result)
		);

		$this->assertTrue(
			count($result) > 5,
			'expected: ' . to_string(true) . PHP_EOL
			.'result: ' . to_string( count($result) )
		);
	}//end test_get_all_main_ontology_records



	/**
	* TEST_get_active_elements
	* @return void
	*/
	public function test_get_active_elements() {

		$result = ontology::get_active_elements();

		$this->assertTrue(
			gettype($result)==='array',
			'expected array ' . PHP_EOL
				. gettype($result)
		);
	}//end test_get_active_elements



	/**
	* TEST_row_to_element
	* @return void
	*/
	public function test_row_to_element() {

		$rows	= ontology::get_all_main_ontology_records();
		$row	= array_find($rows, function($el){
			return $el->section_tipo==='ontology35';
		});

		$result = ontology::row_to_element($row);

		$this->assertTrue(
			gettype($result)==='object',
			'expected object ' . PHP_EOL
				. gettype($result)
		);

		$expected = 'ontologytype';
		$this->assertTrue(
			$result->tld===$expected,
			'expected: ' . to_string($expected) .  PHP_EOL
				. 'tld: ' . to_string($result->tld)
		);

		$expected = 'ontologytype0';
		$this->assertTrue(
			$result->target_section_tipo===$expected,
			'expected: ' . to_string($expected) .  PHP_EOL
				. 'target_section_tipo: ' . to_string($result->target_section_tipo)
		);

		$expected = false;
		$this->assertTrue(
			$result->active_in_thesaurus===$expected,
			'expected: ' . to_string($expected) .  PHP_EOL
				. 'active_in_thesaurus: ' . to_string($result->active_in_thesaurus)
		);
	}//end test_row_to_element



	/**
	* TEST_parse_section_record_to_jer_dd_record
	* @return void
	*/
	public function test_parse_section_record_to_jer_dd_record() {

		$section_tipo	= 'hierarchy0'; //'hierarchymtype0';
		$section_id		= '1';

		$result = ontology::parse_section_record_to_jer_dd_record(
			$section_tipo,
			$section_id
		);

		$this->assertTrue(
			gettype($result)==='object',
			'expected object ' . PHP_EOL
				. gettype($result)
		);

		// terminoID
			$expected = 'hierarchy1';
			$this->assertTrue(
				$result->get_terminoID()===$expected,
				'expected: ' . to_string($expected) .  PHP_EOL
					. 'result->get_terminoID(): ' . to_string($result->get_terminoID())
			);

		// parent
			$expected = 'dd100';
			$this->assertTrue(
				$result->get_parent()===$expected,
				'expected: ' . to_string($expected) .  PHP_EOL
					. 'result->get_parent(): ' . to_string($result->get_parent())
			);

		// modelo
			$expected = 'dd6';
			$this->assertTrue(
				$result->get_modelo()===$expected,
				'expected: ' . to_string($expected) .  PHP_EOL
					. 'result->get_modelo(): ' . to_string($result->get_modelo())
			);

		// is_model
			$expected = false;
			$this->assertTrue(
				$result->get_is_model()===$expected,
				'expected: ' . to_string($expected) .  PHP_EOL
					. 'result->get_is_model(): ' . to_string($result->get_is_model())
			);

		// order_number
			$expected = 'si';
			$this->assertTrue(
				$result->get_esdescriptor()===$expected,
				'expected: ' . to_string($expected) .  PHP_EOL
					. 'result->get_esdescriptor(): ' . to_string($result->get_esdescriptor())
			);

		// norden
			$expected = 3;
			$this->assertTrue(
				$result->get_order_number()==$expected,
				'expected: ' . to_string($expected) .  PHP_EOL
					. 'result->get_order_number(): ' . to_string($result->get_order_number())
			);

		// tld
			$expected = 'hierarchy';
			$this->assertTrue(
				$result->get_tld()===$expected,
				'expected: ' . to_string($expected) .  PHP_EOL
					. 'result->get_tld(): ' . to_string($result->get_tld())
			);

		// is_translatable
			$expected = false;
			$this->assertTrue(
				$result->get_is_translatable()===$expected,
				'expected: ' . to_string($expected) .  PHP_EOL
					. 'result->get_is_translatable(): ' . to_string($result->get_is_translatable())
			);

		// relations
			$expected = '[{"tipo":"dd423"}]';
			$this->assertTrue(
				json_encode($result->get_relations())==$expected,
				'expected: ' . $expected .  PHP_EOL
					. 'result->get_relations(): ' . json_encode($result->get_relations())
			);

		// propiedades
			$expected		= json_decode('{"info":"section_config es una propiedad NO estandarizada. Sólo en pruebas","section_config":{"list_line":"single"}}');
			$propiedades	= json_decode($result->get_propiedades());
			$this->assertTrue(
				json_encode($propiedades)===json_encode($expected),
				'expected: ' . to_string($expected) .  PHP_EOL
					. 'propiedades: ' . to_string($propiedades)
			);

		// properties
			// $expected = json_decode('{"info": "section_config es una propiedad NO estandarizada. Sólo en pruebas","section_config": {"list_line": "single"}}');
			$this->assertTrue(
				json_encode($result->get_properties(), JSON_UNESCAPED_UNICODE)==json_encode($expected, JSON_UNESCAPED_UNICODE),
				'expected: ' . to_string($expected) .  PHP_EOL
					. 'result->get_properties(): ' . to_string($result->get_properties())
			);

		// model
			$expected = 'section';
			$this->assertTrue(
				$result->get_model()===$expected,
				'expected: ' . to_string($expected) .  PHP_EOL
					. 'result->get_model(): ' . to_string($result->get_model())
			);
	}//end test_parse_section_record_to_jer_dd_record



	/**
	* TEST_get_term_id_from_locator
	* @return void
	*/
	public function test_get_term_id_from_locator() {

		$locator = new locator();
			$locator->set_section_tipo('hierarchy1');
			$locator->set_section_id(1);

		$result = ontology::get_term_id_from_locator($locator);

		$this->assertTrue(
			gettype($result)==='string',
			'expected string ' . PHP_EOL
				. gettype($result)
		);

		// hierarchy1 (tld + section_id)
		$expected = 'hierarchy1';
		$this->assertTrue(
			$result===$expected,
			'expected: ' . to_string($expected) .  PHP_EOL
				. 'term_id_from_locator: ' . to_string($result)
		);

		$locator = new locator();
			$locator->set_section_tipo('oh0');
			$locator->set_section_id(1);

		$result = ontology::get_term_id_from_locator($locator);

		$this->assertTrue(
			gettype($result)==='string',
			'expected string ' . PHP_EOL
				. gettype($result)
		);

		// oh1 (tld + section_id)
		$expected = 'oh1';
		$this->assertTrue(
			$result===$expected,
			'expected: ' . to_string($expected) .  PHP_EOL
				. 'term_id_from_locator: ' . to_string($result)
		);
	}//end test_get_term_id_from_locator



	/**
	* TEST_get_order_from_locator
	* @return void
	*/
	public function test_get_order_from_locator() {

		// 1
		$locator = new locator();
			$locator->set_section_tipo('hierarchy1');
			$locator->set_section_id(1);

		$siblings = [];

		$result = ontology::get_order_from_locator($locator, $siblings);

		$this->assertTrue(
			gettype($result)==='integer',
			'expected integer ' . PHP_EOL
				. gettype($result)
		);

		$expected = 1;
		$this->assertTrue(
			$result===$expected,
			'expected: ' . to_string($expected) .  PHP_EOL
				. 'term_id_from_locator: ' . to_string($result)
		);

		// documents rsc176
		$locator = new locator();
			$locator->set_section_tipo('rsc0');
			$locator->set_section_id('176');

		// resource dd14
		$siblings_locator = new locator();
			$siblings_locator->set_section_tipo('dd0');
			$siblings_locator->set_section_id('14');
		$siblings = ontology::get_siblings($siblings_locator);

		$result = ontology::get_order_from_locator($locator, $siblings);

		$expected = 6;
		$this->assertTrue(
			$result===$expected,
			'expected: ' . to_string($expected) .  PHP_EOL
				. 'term_id_from_locator: ' . to_string($result)
		);
	}//end test_get_order_from_locator



	/**
	* TEST_get_siblings
	* @return void
	*/
	public function test_get_siblings() {

		// media rsc1
		$siblings_locator = new locator();
			$siblings_locator->set_section_tipo('rsc0');
			$siblings_locator->set_section_id('1');

		$result = ontology::get_siblings($siblings_locator);

		$this->assertTrue(
			gettype($result)==='array',
			'expected array ' . PHP_EOL
				. gettype($result)
		);

		$found = array_find($result, function($el) {
			return $el->section_id == 4;
		});
		$children_tipo = ontology::$children_tipo; // ontology14
		$expected = json_decode('
			{
		        "section_tipo": "rsc0",
				"section_id": "4",
				"from_component_tipo": "'.$children_tipo.'",
				"type": "dd48"
		    }
		');
		$this->assertTrue(
			json_encode($found)===json_encode($expected),
			'expected: ' . to_string($expected) .  PHP_EOL
				. 'found: ' . to_string($found)
		);
	}//end test_get_siblings



	/**
	* TEST_insert_jer_dd_record
	* @return void
	*/
	public function test_insert_jer_dd_record() {

		$section_tipo	= 'oh0';
		$section_id		= 1;

		$result = ontology::insert_jer_dd_record(
			$section_tipo,
			$section_id
		);

		$this->assertTrue(
			gettype($result)==='string',
			'expected string ' . PHP_EOL
				. gettype($result)
		);

		$expected = 'oh1';
		$this->assertTrue(
			$result===$expected,
			'expected: ' . to_string($expected) .  PHP_EOL
				. 'term_id: ' . to_string($result)
		);
	}//end test_insert_jer_dd_record



	/**
	* TEST_set_records_in_jer_dd
	* @return void
	*/
	public function test_set_records_in_jer_dd() {

		$sqo = (object)[
			'section_tipo'	=> ['oh0'],
			'limit'			=> 3
		];

		$result = ontology::set_records_in_jer_dd(
			$sqo
		);

		$this->assertTrue(
			gettype($result)==='object',
			'expected object ' . PHP_EOL
				. gettype($result)
		);

		$expected = 3;
		$this->assertTrue(
			$result->total===$expected,
			'expected: ' . to_string($expected) .  PHP_EOL
				. 'term_id: ' . to_string($result->total)
		);
	}//end test_set_records_in_jer_dd



	/**
	* TEST_regenerate_records_in_jer_dd
	* @return void
	*/
	public function test_regenerate_records_in_jer_dd() {

		$tld = ['oh'];

		$result = ontology::regenerate_records_in_jer_dd(
			$tld
		);

		$this->assertTrue(
			gettype($result)==='object',
			'expected object ' . PHP_EOL
				. gettype($result)
		);

		$expected = 123;
		$this->assertTrue(
			$result->total_insert>=$expected,
			'expected: ' . to_string($expected) .  PHP_EOL
				. 'term_id: ' . to_string($result->total_insert)
		);
	}//end test_regenerate_records_in_jer_dd



	/**
	* TEST_delete_main
	* @return void
	*/
	public function test_delete_main() {

		$options = (object)[
			'section_id'	=> 9999999999999999, // do not delete nothing !
			'section_tipo'	=> 'ontology35'
		];

		$result = ontology::delete_main(
			$options
		);

		$this->assertTrue(
			gettype($result)==='object',
			'expected object ' . PHP_EOL
				. gettype($result)
		);

		$expected = false;
		$this->assertTrue(
			$result->result===$expected,
			'expected: ' . to_string($expected) .  PHP_EOL
				. 'result: ' . to_string($result->result)
		);
	}//end test_delete_main



	/**
	* TEST_get_main_tld
	* @return void
	*/
	public function test_get_main_tld() {

		// existing record
			$result = ontology::get_main_tld(
				8,
				'ontology35'
			);

			$this->assertTrue(
				gettype($result)==='string',
				'expected string ' . PHP_EOL
					. gettype($result)
			);

			$expected = true;
			$this->assertTrue(
				!empty($result)===$expected,
				'expected: ' . to_string($expected) .  PHP_EOL
					. 'result: ' . to_string(!empty($result))
			);

		// non existing record
			$result = ontology::get_main_tld(
				9999999999999999,
				'ontology35'
			);

			$expected = 'NULL';
			$this->assertTrue(
				gettype($result)===$expected,
				'expected: ' . to_string($expected) . PHP_EOL
					.'gettype: ' . gettype($result)
			);

			$expected = true;
			$this->assertTrue(
				is_null($result)===$expected,
				'expected: ' . to_string($expected) .  PHP_EOL
					. 'result: ' . to_string($result)
			);
	}//end test_get_main_tld



	/**
	* TEST_get_main_typology_id
	* @return void
	*/
	public function test_get_main_typology_id() {

		// existing record
			$result = ontology::get_main_typology_id(
				'test'
			);

			$this->assertTrue(
				gettype($result)==='integer',
				'expected integer ' . PHP_EOL
					. gettype($result)
			);

			$expected = 15;
			$this->assertTrue(
				$result===$expected,
				'expected: ' . to_string($expected) .  PHP_EOL
					. 'result: ' . to_string($result)
			);

		// non existing record
			$result = ontology::get_main_typology_id(
				'patatatld'
			);

			$this->assertTrue(
				gettype($result)==='NULL',
				'expected NULL ' . PHP_EOL
					. gettype($result)
			);

			$expected = NULL; // default typology
			$this->assertTrue(
				$result===$expected,
				'expected: ' . to_string($expected) .  PHP_EOL
					. 'result: ' . to_string($result)
			);
	}//end test_get_main_typology_id



	/**
	* TEST_get_main_name_data
	* @return void
	*/
	public function test_get_main_name_data() {

		// existing record
			$result = ontology::get_main_name_data(
				'test'
			);

			$this->assertTrue(
				gettype($result)==='object',
				'expected object ' . PHP_EOL
					. gettype($result)
			);

			$expected = ['test'];
			$this->assertTrue(
				json_encode($result->{DEDALO_STRUCTURE_LANG})===json_encode($expected),
				'expected: ' . to_string($expected) .  PHP_EOL
					. 'result: ' . to_string($result->{DEDALO_STRUCTURE_LANG})
			);

		// non existing record
			$result = ontology::get_main_name_data(
				'patatatld'
			);

			$this->assertTrue(
				gettype($result)==='NULL',
				'expected NULL ' . PHP_EOL
					. gettype($result)
			);

			$expected = NULL; // default typology
			$this->assertTrue(
				$result===$expected,
				'expected: ' . to_string($expected) .  PHP_EOL
					. 'result: ' . to_string($result)
			);
	}//end test_get_main_name_data



	/**
	* TEST_delete_ontology
	* @return void
	*/
	public function test_delete_ontology() {

		$tld			= 'tldtest';
		$section_tipo	= 'tldtest0';

		// 1 create a new one
		// matrix_ontology_main
			$file_item = (object)[
				'tld'			=> 'tldtest',
				'section_tipo'	=> $section_tipo,
				'typology_id'	=> 15,
				'name_data'		=> (object)['lg-spa' => ['TLD TEST']]
			];
			$section_id = ontology::add_main_section($file_item);

		// set permissions. Allow current user access to created default sections
			$set_permissions_result = component_security_access::set_section_permissions((object)[
				'ar_section_tipo'	=> [$section_tipo],
				'user_id'			=> TEST_USER_ID,
				'permissions'		=> 2
			]);
			$expected = true;
			$this->assertTrue(
				!empty($set_permissions_result)===$expected,
				'expected: ' . to_string($expected) .  PHP_EOL
					. 'set_permissions_result: ' . to_string(!empty($set_permissions_result))
			);

		// matrix_ontology
			$ar_id = [];
			for ($i=0; $i < 5; $i++) {

				$section = section::get_instance(
					null, // string|null section_id
					$section_tipo // string section_tipo
				);
				$section_id	= $section->Save(); // Section save, returns the created section_id

				// tld
					$tipo	= 'ontology7';
					$model_name	= ontology_node::get_modelo_name_by_tipo($tipo, true);
					$component	= component_common::get_instance(
						$model_name,
						$tipo,
						$section_id,
						'list',
						DEDALO_DATA_NOLAN,
						$section_tipo
					);
					$component->set_dato([$tld]);
					$component->Save();

				// model
					$tipo	= 'ontology6';
					$model_name	= ontology_node::get_modelo_name_by_tipo($tipo, true);
					$component	= component_common::get_instance(
						$model_name,
						$tipo,
						$section_id,
						'list',
						DEDALO_DATA_NOLAN,
						$section_tipo
					);
					$dato = json_decode('[{"type":"dd151","section_id":"4","section_tipo":"dd0","from_component_tipo":"ontology6"}]');
					$component->set_dato($dato);
					$component->Save();

				// parent
					$tipo		= 'ontology15';
					$model		= ontology_node::get_modelo_name_by_tipo($tipo, true);
					$component	= component_common::get_instance(
						$model,
						$tipo,
						$section_id,
						'list',
						DEDALO_DATA_NOLAN,
						$section_tipo
					);

					$locator = new locator();
						// $locator->set_type('dd151');
						$locator->set_section_id(100);
						$locator->set_section_tipo('dd0');
						$locator->set_from_component_tipo($tipo);

					$component->set_dato([$locator]);
					$component->Save();

				$ar_id[] = $section_id;
			}

		// jer_dd
			foreach ($ar_id as $currrent_section_id) {
				ontology::insert_jer_dd_record($section_tipo, $currrent_section_id);
			}

		// delete
			$response = ontology::delete_ontology($tld);

			$this->assertTrue(
				gettype($response)==='object',
				'expected object ' . PHP_EOL
					. gettype($response)
			);

			$this->assertTrue(
				gettype($response->result)==='boolean',
				'expected boolean ' . PHP_EOL
					. gettype($response->result)
			);

			$expected = true;
			$this->assertTrue(
				!empty($response->result)===$expected,
				'expected: ' . to_string($expected) .  PHP_EOL
					. 'result: ' . to_string(!empty($response->result)) .  PHP_EOL
					. 'response: ' . to_string($response)
			);

		// create a new one again
		// matrix_ontology_main
			$file_item = (object)[
				'tld'			=> 'tldtest',
				'section_tipo'	=> $section_tipo,
				'typology_id'	=> 15,
				'name_data'		=> (object)['lg-spa' => ['TLD TEST']]
			];
			$section_id = ontology::add_main_section($file_item);
	}//end test_delete_ontology



	/**
	* TEST_jer_dd_version_is_valid
	* @return void
	*/
	public function test_jer_dd_version_is_valid() {

		$min_date = '2025-11-01';

		$result = ontology::jer_dd_version_is_valid(
			$min_date
		);

		$this->assertTrue(
			gettype($result)==='boolean',
			'expected boolean ' . PHP_EOL
				. gettype($result)
		);

		$expected = false;
		$this->assertTrue(
			$result===$expected,
			'expected: ' . to_string($expected) .  PHP_EOL
				. 'result: ' . to_string($result) . PHP_EOL
				. 'min_date: ' . to_string($min_date)
		);


		$min_date = '2024-12-15';

		$result = ontology::jer_dd_version_is_valid(
			$min_date
		);

		$expected = true;
		$this->assertTrue(
			$result===$expected,
			'expected: ' . to_string($expected) . PHP_EOL
				. 'result: ' . to_string($result) . PHP_EOL
				. 'min_date: ' . to_string($min_date)
		);

	}//end test_jer_dd_version_is_valid



	/**
	* TEST_compare_jer_dd_to_matrix
	* This test compares jer_dd data to equivalent in Ontology matrix
	* to check the integrity of the Ontology data across all pipe line
	* @return void
	* @todo WORKING PROGRESS !
	*/
		// public function DES_test_compare_jer_dd_to_matrix() {

		// 	$section_tipo	= 'ontology40';
		// 	$section_id		= 78;

		// 	$response		= ontology_converter::matrix_to_jer_dd($section_tipo, $section_id);
		// 	$jer_dd_row		= $response->result;
		// 	$RecordObj_dd	= new RecordObj_dd($jer_dd_row->terminoID);
		// 	foreach ($jer_dd_row as $key => $value) {
		// 		if ($key==='terminoID') {
		// 			continue;
		// 		}
		// 		$method = 'set_' . $key;
		// 		$RecordObj_dd->{$method}($value);
		// 	}

		// 	$response = ontology_converter::jer_dd_to_matrix($jer_dd_row, DEDALO_SECTION_ID_TEMP.'1');
		// 	$section = $response->result;

		// 		// dump($section->dato, ' section->dato ++ '.to_string());
		// 		// dump($response, ' --------------- /// jer_dd_to_matrix response ++ '.to_string());

		// 	// $sql = 'SELECT * FROM "matrix_ontology" WHERE section_id = '.$section_id.' AND section_tipo = \''.$section_tipo.'\'';
		// 	// $matrix_result = pg_query(DBi::_getConnection(), $sql);
		// 	// while($matrix_row = pg_fetch_object($matrix_result)) {break;}



		// 	/*
		// 	$sql_query		= 'SELECT * FROM "jer_dd" ORDER BY tld, "terminoID" ';
		// 	$jer_dd_result	= pg_query(DBi::_getConnection(), $sql_query);

		// 	while($jer_dd_row = pg_fetch_object($jer_dd_result)) {

		// 		$tld		= get_tld_from_tipo($jer_dd_row->terminoID);
		// 		$section_id	= get_section_id_from_tipo($jer_dd_row->terminoID);

		// 		$sql = 'SELECT * FROM "matrix_ontology" WHERE section_id = '.$section_id.' AND datos#>>\'{components,ontology7,dato,lg-nolan}\' = \'["'.$tld.'"]\' LIMIT 1';
		// 		$term_result = pg_query(DBi::_getConnection(), $sql);
		// 		while($matrix_row = pg_fetch_object($term_result)) {break;}
		// 		if (!isset($matrix_row)) {
		// 			debug_log(__METHOD__
		// 				. " Error. term $tld - $section_id not found in matrix_ontology" . PHP_EOL
		// 				. ' terminoID: ' . to_string($jer_dd_row->terminoID) . PHP_EOL
		// 				. ' tld: ' . to_string($tld) . PHP_EOL
		// 				. ' section_id: ' . to_string($section_id) . PHP_EOL
		// 				, logger::DEBUG
		// 			);
		// 			continue;
		// 		}
		// 		dump($matrix_row, ' matrix_row ++ '.to_string());
		// 		$datos = json_decode($matrix_row->datos);
		// 				dump($datos, ' datos ++ '.to_string());

		// 		// parent
		// 			$jer_dd_parent = $jer_dd_row->parent;
		// 			$matrix_parent = array_find($matrix_row->relations ?? [], function($el){
		// 				return $el->from_component_tipo==='ontology15';
		// 			});


		// 		break;

		// 	}//end while
		// 	*/
		// }//end test_compare_jer_dd_to_matrix



}//end class
