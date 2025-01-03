<?php declare(strict_types=1);
// PHPUnit classes
use PHPUnit\Framework\TestCase;
use PHPUnit\Framework\Attributes\TestDox;
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
	* TEST_ar_tables_with_relations
	* @return void
	*/
	public function test_ar_tables_with_relations() {

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
	}//end test_ar_tables_with_relations



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
					// dump($response, ' response ++ '.to_string());

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
					gettype($response->msg)==='array' ,
					'expected array' . PHP_EOL
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
					gettype($response->msg)==='array' ,
					'expected array' . PHP_EOL
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
	* TEST_create_term
	* @return void
	*/
	public function test_create_term() {

		$options = (object)[
			'terminoID' => 'unittest1',
			'section_id' => 1
		];

		$response = hierarchy::create_term(
			$options
		);
			// dump($response, ' response ++ '.to_string());

		$this->assertTrue(
			gettype($response)==='object' ,
			'expected object' . PHP_EOL
				. gettype($response)
		);
		$this->assertTrue(
			$response->result===true ,
			'expected true' . PHP_EOL
				. to_string($response->result) .PHP_EOL
				. ' failed unittest1 term creation'
		);
	}//end test_create_term



	/**
	* TEST_get_main_lang
	* @return void
	*/
	public function test_get_main_lang() {

		$result = hierarchy::get_main_lang(
			'test1'
		);

		$this->assertTrue(
			gettype($result)==='string' || gettype($result)==='NULL',
			'expected string|null ' . PHP_EOL
				. gettype($result)
		);
		$this->assertTrue(
			$result==='lg-eng' ,
			'expected lg-eng' . PHP_EOL
				. to_string($result)
		);
	}//end test_get_main_lang



	/**
	* TEST_get_actives
	* @return void
	*/
	public function test_get_actives() {

		$result = hierarchy::get_active_elements();
			// dump($result, ' result ++ '.count($result));

		$this->assertTrue(
			gettype($result)==='array',
			'expected array ' . PHP_EOL
				. gettype($result)
		);
	}//end test_get_actives



	/**
	* TEST_get_all_tables
	* @return void
	*/
	public function test_get_all_tables() {

		$result = hierarchy::get_all_tables(
			['lg1','ts1'] // ar_section_tipo
		);

		$this->assertTrue(
			gettype($result)==='array',
			'expected array ' . PHP_EOL
				. gettype($result)
		);

		$reference = json_decode('
			[
				"matrix_langs",
				"matrix_hierarchy"
			]
		');

		$this->assertTrue(
			json_encode($result)===json_encode($reference),
			'expected equal true ' . PHP_EOL
				. to_string($result) . PHP_EOL
				. to_string($reference)
		);
	}//end test_get_all_tables



	/**
	* TEST_get_all_term_tipo_by_map
	* @return void
	*/
	public function test_get_all_term_tipo_by_map() {

		$result = hierarchy::get_all_term_tipo_by_map(
			['lg1','ts1'] // ar_section_tipo
		);

		$this->assertTrue(
			gettype($result)==='array',
			'expected array ' . PHP_EOL
				. gettype($result)
		);

		$reference = json_decode('
			{
				"matrix_langs": [
					"hierarchy25"
				],
				"matrix_hierarchy": [
					"hierarchy25"
				]
			}
		');

		$this->assertTrue(
			json_encode($result)===json_encode($reference),
			'expected equal true ' . PHP_EOL
				. to_string($result) . PHP_EOL
				. to_string($reference)
		);
	}//end test_get_all_term_tipo_by_map



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
				. to_string($result) . PHP_EOL
				. to_string($reference)
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

		$this->assertTrue(
			$response===252,
			'expected equal 252 ' . PHP_EOL
				. to_string($response)
		);
	}//end test_get_hierarchy_section



}//end class hierarchy
