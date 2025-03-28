<?php declare(strict_types=1);
// PHPUnit classes
use PHPUnit\Framework\TestCase;
// use PHPUnit\Framework\Attributes\TestDox;
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';



final class hierarchy_test extends TestCase {



	public static $model	= 'hierarchy';
	public static $tipo		= 'dd88';



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



	/////////// ⬇︎ test start ⬇︎ ////////////////



	/**
	* TEST_class_vars
	* @return void
	*/
	public function test_class_vars() {

		// main_table
			$result = hierarchy::$main_table;

			$this->assertTrue(
				gettype($result)==='string' ,
				'expected string' . PHP_EOL
					. gettype($result)
			);
			$this->assertTrue(
				$result==='matrix_hierarchy_main' ,
				'expected matrix_hierarchy_main' . PHP_EOL
					. to_string($result)
			);

		// main_section_tipo
			$result = hierarchy::$main_section_tipo;

			$this->assertTrue(
				gettype($result)==='string' ,
				'expected string' . PHP_EOL
					. gettype($result)
			);
			$this->assertTrue(
				$result==='hierarchy1' ,
				'expected hierarchy1' . PHP_EOL
					. to_string($result)
			);
	}//end test_class_vars



	/**
	* TEST_get_default_section_tipo_term
	* @return void
	*/
	public function test_get_default_section_tipo_term() {

		$tld = 'test';

		$result = hierarchy::get_default_section_tipo_term(
			$tld
		);

		$this->assertTrue(
			gettype($result)==='string' ,
			'expected string' . PHP_EOL
				. gettype($result)
		);
		$this->assertTrue(
			$result==='test1' ,
			'expected test1' . PHP_EOL
				. to_string($result)
		);

		$tld = 'RSC';

		$result = hierarchy::get_default_section_tipo_term(
			$tld
		);

		$this->assertTrue(
			gettype($result)==='string' ,
			'expected string' . PHP_EOL
				. gettype($result)
		);
		$this->assertTrue(
			$result==='rsc1' ,
			'expected rsc1' . PHP_EOL
				. to_string($result)
		);
	}//end test_get_default_section_tipo_term



	/**
	* TEST_get_default_section_tipo_model
	* @return void
	*/
	public function test_get_default_section_tipo_model() {

		$tld = 'test';

		$result = hierarchy::get_default_section_tipo_model(
			$tld
		);

		$this->assertTrue(
			gettype($result)==='string' ,
			'expected string' . PHP_EOL
				. gettype($result)
		);
		$this->assertTrue(
			$result==='test2' ,
			'expected test2' . PHP_EOL
				. to_string($result)
		);

		$tld = 'OH';

		$result = hierarchy::get_default_section_tipo_model(
			$tld
		);

		$this->assertTrue(
			gettype($result)==='string' ,
			'expected string' . PHP_EOL
				. gettype($result)
		);
		$this->assertTrue(
			$result==='oh2' ,
			'expected oh2' . PHP_EOL
				. to_string($result)
		);
	}//end test_get_default_section_tipo_model



	/**
	* TEST_generate_virtual_section
	* @return void
	*/
	public function test_generate_virtual_section() {

		$active_hierarchies = hierarchy::get_active_elements();

		// unittest TLD (inactive)
			$unittest_item = array_find($active_hierarchies, function($el){
				return $el->tld==='unittest';
			});
			if (!empty($unittest_item)) {

				$options = (object)[
					'section_id'	=> $unittest_item->section_id,
					'section_tipo'	=> 'hierarchy1'
				];

				$response = hierarchy::generate_virtual_section(
					$options
				);

				$this->assertTrue(
					gettype($response)==='object' ,
					'expected object' . PHP_EOL
						. gettype($response)
				);
				$this->assertTrue(
					gettype($response->result)==='boolean' ,
					'expected boolean' . PHP_EOL
						. gettype($response->result)
				);
				$this->assertTrue(
					gettype($response->msg)==='string' ,
					'expected string' . PHP_EOL
						. gettype($response->msg)
				);
				// could already exists or not
				// $this->assertTrue(
				// 	$response->result===false ,
				// 	'expected false' . PHP_EOL
				// 		. to_string($response->result)
				// );
			}

		// actv TLD (active - already created)
			$actv_item = array_find($active_hierarchies, function($el){
				return $el->tld==='actv';
			});
			if (!empty($actv_item)) {

				$options = (object)[
					'section_id'	=> $actv_item->section_id,
					'section_tipo'	=> 'hierarchy1'
				];

				$response = hierarchy::generate_virtual_section(
					$options
				);

				$this->assertTrue(
					gettype($response)==='object' ,
					'expected object' . PHP_EOL
						. gettype($response). PHP_EOL
						. 'response: '. to_string($response)
				);
				$this->assertTrue(
					gettype($response->result)==='boolean' ,
					'expected boolean' . PHP_EOL
						. gettype($response->result). PHP_EOL
						. 'response: '. to_string($response)
				);
				$this->assertTrue(
					gettype($response->msg)==='string' ,
					'expected string' . PHP_EOL
						. gettype($response->msg). PHP_EOL
						. 'response: '. to_string($response)
				);
				$this->assertTrue(
					$response->result===true ,
					'expected true' . PHP_EOL
						. to_string($response->result) . PHP_EOL
						. 'result: '  . to_string($response->result) . PHP_EOL
						. 'response: '. to_string($response)
				);
			}
	}//end test_generate_virtual_section



	/**
	* TEST_get_main_lang
	* @return void
	*/
	public function test_get_main_lang() {

		// lg1
			$result = hierarchy::get_main_lang(
				'lg1'
			);

			$this->assertTrue(
				gettype($result)==='string',
				'expected string ' . PHP_EOL
					. gettype($result)
			);
			$this->assertTrue(
				$result==='lg-eng' ,
				'expected lg-eng' . PHP_EOL
					. to_string($result)
			);

		// test1
			$result = hierarchy::get_main_lang(
				'test1'
			);

			$this->assertTrue(
				gettype($result)==='string',
				'expected string ' . PHP_EOL
					. gettype($result)
			);
			$this->assertTrue(
				$result==='lg-eng' ,
				'expected lg-eng' . PHP_EOL
					. to_string($result)
			);

		// es1
			$result = hierarchy::get_main_lang(
				'es1'
			);

			$this->assertTrue(
				gettype($result)==='string',
				'expected string ' . PHP_EOL
					. gettype($result)
			);
			$this->assertTrue(
				$result==='lg-spa' ,
				'expected lg-spa' . PHP_EOL
					. to_string($result)
			);
	}//end test_get_main_lang



	/**
	* TEST_get_all_tables
	* @return void
	*/
	public function test_get_all_tables() {

		$result = hierarchy::get_all_tables(
			['lg1','ts1','ontology1','es1'] // ar_section_tipo
		);

		$this->assertTrue(
			gettype($result)==='array',
			'expected array ' . PHP_EOL
				. gettype($result)
		);

		$reference = [
			'matrix_langs',
			'matrix_hierarchy',
			'matrix_ontology'
		];

		$this->assertTrue(
			json_encode($result)===json_encode($reference),
			'expected equal true ' . PHP_EOL
				. to_string($result) . PHP_EOL
				. to_string($reference)
		);
	}//end test_get_all_tables



	/**
	* TEST_get_element_tipo_from_section_map
	* @return void
	*/
	public function test_get_element_tipo_from_section_map() {

		$result = hierarchy::get_element_tipo_from_section_map(
			'lg1', // section_tipo
			'term'
		);

		$this->assertTrue(
			gettype($result)==='string' || gettype($result)==='NULL',
			'expected string|null ' . PHP_EOL
				. gettype($result)
		);

		$reference = 'hierarchy25';

		$this->assertTrue(
			$result===$reference,
			'expected equal true ' . PHP_EOL
				. to_string($result) . PHP_EOL
				. to_string($reference)
		);
	}//end test_get_element_tipo_from_section_map



	/**
	* TEST_get_section_map_elemets
	* @return void
	*/
	public function test_get_section_map_elemets() {

		$result = hierarchy::get_section_map_elemets(
			'lg1', // section_tipo
		);

		$this->assertTrue(
			gettype($result)==='array',
			'expected array ' . PHP_EOL
				. gettype($result)
		);

		$reference = json_decode('
			{
			    "thesaurus": {
			        "term": "hierarchy25",
			        "model": "hierarchy27",
			        "order": "hierarchy48",
			        "parent": "hierarchy36",
			        "is_indexable": "hierarchy24",
			        "is_descriptor": "hierarchy23"
			    }
			}
		');

		$this->assertTrue(
			json_encode($result)===json_encode($reference),
			'expected equal true ' . PHP_EOL
			. 'result: ' . json_encode($result) . PHP_EOL
			. 'reference: ' . json_encode($reference)
		);
	}//end test_get_section_map_elemets



	/**
	* TEST_get_hierarchy_section
	* @return void
	*/
	public function test_get_hierarchy_section() {

		$response = hierarchy::get_hierarchy_section(
			'dc1', // section_tipo (Chronological descriptors)
			DEDALO_HIERARCHY_TARGET_SECTION_TIPO
		);

		$this->assertTrue(
			gettype($response)==='integer' || gettype($response)==='NULL',
			'expected integer|null ' . PHP_EOL
				. gettype($response)
		);

		$response = hierarchy::get_hierarchy_section(
			'ts1', // section_tipo (Chronological descriptors)
			DEDALO_HIERARCHY_TARGET_SECTION_TIPO
		);

		$this->assertTrue(
			$response===1,
			'expected equal 1 ' . PHP_EOL
				. to_string($response)
		);
	}//end test_get_hierarchy_section



	/**
	* TEST_get_hierarchy_by_tld
	* @return void
	*/
	public function test_get_hierarchy_by_tld() {

		$response = hierarchy::get_hierarchy_by_tld(
			'ts'
		);

		$this->assertTrue(
			gettype($response)==='object',
			'expected object ' . PHP_EOL
				. gettype($response)
		);

		$this->assertTrue(
			$response->result==1,
			'expected equal 1 ' . PHP_EOL
				.' gettype: ' . gettype($response->result) . PHP_EOL
				.' response: ' . to_string($response) . PHP_EOL
				.' tld: ts'
		);
	}//end test_get_hierarchy_by_tld



	/**
	* TEST_export_hierarchy
	* @return void
	*/
	public function test_export_hierarchy() {

		$response = hierarchy::export_hierarchy(
			'ad1'
		);

		$this->assertTrue(
			gettype($response)==='object',
			'expected object ' . PHP_EOL
				. gettype($response)
		);

		$this->assertTrue(
			$response->result===true,
			'expected equal true ' . PHP_EOL
				.' gettype: ' . gettype($response->result) . PHP_EOL
				.' response: ' . to_string($response) . PHP_EOL
		);
	}//end test_export_hierarchy



	/**
	* TEST_get_simple_schema_of_sections
	* @return void
	*/
	public function test_get_simple_schema_of_sections() {

		$result = hierarchy::get_simple_schema_of_sections();
			// dump($result, ' result ++ '.count($result));

		$this->assertTrue(
			gettype($result)==='array',
			'expected array ' . PHP_EOL
				. gettype($result)
		);
	}//end test_get_simple_schema_of_sections



	/**
	* TEST_build_simple_schema_changes
	* @return void
	*/
	public function test_build_simple_schema_changes() {

		$old_schema = hierarchy::get_simple_schema_of_sections();
		$new_schema = $old_schema; // copy
		// fake section info
		$new_schema['es1'] = [
			'hierarchy21999',
			'hierarchy22',
			'hierarchy23'
		];

		$result = hierarchy::build_simple_schema_changes(
			$old_schema,
			$new_schema
		);

		$this->assertTrue(
			gettype($result)==='array',
			'expected array ' . PHP_EOL
				. gettype($result)
		);

		$expected = json_decode('
			[
			    {
			        "tipo": "es1",
			        "children_added": [
			            "hierarchy21999"
			        ]
			    }
			]
		');
		$this->assertTrue(
			json_encode($result)===json_encode($expected),
			'expected equal result ' . PHP_EOL
				.' gettype: ' . gettype($result) . PHP_EOL
				.' result: ' . to_string($result) . PHP_EOL
				.' expected: ' . to_string($expected)
		);
	}//end test_build_simple_schema_changes



	/**
	* TEST_get_simple_schema_changes_files
	* @return void
	*/
	public function test_get_simple_schema_changes_files() {

		$result = hierarchy::get_simple_schema_changes_files();
			// dump($result, ' result ++ '.count($result));

		$this->assertTrue(
			gettype($result)==='array',
			'expected array ' . PHP_EOL
				. gettype($result)
		);
	}//end test_get_simple_schema_changes_files



	/**
	* TEST_parse_simple_schema_changes_file
	* @return void
	*/
	public function test_parse_simple_schema_changes_file() {

		$file_names = hierarchy::get_simple_schema_changes_files();
		$file_name = end($file_names);

		$result = hierarchy::parse_simple_schema_changes_file(
			$file_name
		);
			// dump($result, ' result ++ '.count($result));

		$this->assertTrue(
			gettype($result)==='array',
			'expected array ' . PHP_EOL
				. gettype($result)
		);
	}//end test_parse_simple_schema_changes_file



	/**
	* TEST_save_simple_schema_file
	* @return void
	*/
	public function test_save_simple_schema_file() {

		$old_schema = hierarchy::get_simple_schema_of_sections();

		$response = hierarchy::save_simple_schema_file(
			(object)[
				'old_simple_schema_of_sections' => $old_schema
			]
		);

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
	}//end test_save_simple_schema_file



	/**
	* TEST_get_typology_locator_from_tld
	* @return void
	*/
	public function test_get_typology_locator_from_tld() {

		$tld = 'es';
		$result = hierarchy::get_typology_locator_from_tld(
			$tld
		);

		$this->assertTrue(
			gettype($result)==='object' || gettype($result)==='NULL',
			'expected object|null ' . PHP_EOL
				. gettype($result)
		);

		$expected = 'dd151';
		$this->assertTrue(
			$result->type===$expected,
			'expected type '.$expected . PHP_EOL
				. to_string($result)
		);

		$expected = 'hierarchy9';
		$this->assertTrue(
			$result->from_component_tipo===$expected,
			'expected from_component_tipo '.$expected . PHP_EOL
				. to_string($result)
		);
	}//end test_get_typology_locator_from_tld



	/**
	* TEST_get_active_elements
	* @return void
	*/
	public function test_get_active_elements() {

		$result = hierarchy::get_active_elements();

		$this->assertTrue(
			gettype($result)==='array',
			'expected array ' . PHP_EOL
				. gettype($result)
		);
	}//end test_get_active_elements



}//end class hierarchy
