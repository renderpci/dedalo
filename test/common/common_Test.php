<?php declare(strict_types=1);
// PHPUnit classes
use PHPUnit\Framework\TestCase;
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';



final class common_test extends TestCase {



	/////////// ⬇︎ static methods ⬇︎ ////////////////



	/**
	* TEST_get_permissions
	* @return void
	*/
	public function test_get_permissions() {

		$result = common::get_permissions(
			'oh1',
			'oh27'
		);

		$this->assertTrue(
			gettype($result)==='integer',
			'expected type integer : ' . PHP_EOL
				. gettype($result)
		);
	}//end test_get_permissions



	/**
	* TEST_get_matrix_table_from_tipo
	* @return void
	*/
	public function test_get_matrix_table_from_tipo() {

		$result = common::get_matrix_table_from_tipo(
			'test3'
		);

		$this->assertTrue(
			gettype($result)==='string',
			'expected type string : ' . PHP_EOL
				. gettype($result)
		);

		$this->assertTrue(
			$result==='matrix_test',
			'expected  matrix_test : ' . PHP_EOL
				. to_string($result)
		);
	}//end test_get_matrix_table_from_tipo



	/**
	* TEST_get_main_lang
	* @return void
	*/
	public function test_get_main_lang() {

		$result = common::get_main_lang(
			'test3'
		);

		$this->assertTrue(
			gettype($result)==='string',
			'expected type string : ' . PHP_EOL
				. gettype($result)
		);
	}//end test_get_main_lang



	/**
	* TEST_setVar
	* @return void
	*/
	public function test_setVar() {

		$result = common::setVar(
			'my_var'
		);

		$this->assertTrue(
			gettype($result)==='string' || gettype($result)==='boolean',
			'expected type string : ' . PHP_EOL
				. gettype($result)
		);
	}//end test_setVar



	/**
	* TEST_setVarData
	* @return void
	*/
	public function test_setVarData() {

		$result = common::setVarData(
			'prop',
			(object)['prop' => 'a']
		);

		$this->assertTrue(
			gettype($result)==='string' || gettype($result)==='boolean',
			'expected type string : ' . PHP_EOL
				. gettype($result)
		);
	}//end test_setVarData



	/**
	* TEST_get_ar_all_langs
	* @return void
	*/
	public function test_get_ar_all_langs() {

		$result = common::get_ar_all_langs();

		$this->assertTrue(
			gettype($result)==='array',
			'expected type array : ' . PHP_EOL
				. gettype($result)
		);

		$this->assertTrue(
			in_array('lg-eng', $result),
			'expected  true : ' . PHP_EOL
				. to_string($result)
		);
	}//end test_get_ar_all_langs



	/**
	* TEST_get_ar_all_langs_resolved
	* @return void
	*/
	public function test_get_ar_all_langs_resolved() {

		$result = common::get_ar_all_langs_resolved(DEDALO_DATA_LANG);

		$this->assertTrue(
			gettype($result)==='array',
			'expected type array : ' . PHP_EOL
				. gettype($result)
		);

		$this->assertTrue(
			isset($result['lg-eng']),
			'expected  true : ' . PHP_EOL
				. to_string($result)
		);
	}//end test_get_ar_all_langs_resolved



	/**
	* TEST_get_ar_related_by_model
	* @return void
	*/
	public function test_get_ar_related_by_model() {

		$result = common::get_ar_related_by_model(
			'component_input_text',
			'test80' // portal
		);

		$this->assertTrue(
			gettype($result)==='array',
			'expected type array : ' . PHP_EOL
				. gettype($result)
		);

		$this->assertTrue(
			$result===['test52'],
			'expected  true : ' . PHP_EOL
				. to_string($result)
		);
	}//end test_get_ar_related_by_model



	/**
	* TEST_get_allowed_relation_types
	* @return void
	*/
	public function test_get_allowed_relation_types() {

		$result = common::get_allowed_relation_types();

		$this->assertTrue(
			gettype($result)==='array',
			'expected type array : ' . PHP_EOL
				. gettype($result)
		);

		$this->assertTrue(
			in_array(DEDALO_RELATION_TYPE_LINK, $result),
			'expected  true : ' . PHP_EOL
				. to_string($result)
		);
	}//end test_get_allowed_relation_types



	/**
	* TEST_truncate_text
	* @return void
	*/
	public function test_truncate_text() {

		$result = common::truncate_text(
			'loooong text heeeeeereeeeeee ç Ñ ? ï ...... !!!!',
			36
		);

		$this->assertTrue(
			gettype($result)==='string',
			'expected type string : ' . PHP_EOL
				. gettype($result)
		);

		$this->assertTrue(
			$result==='loooong text heeeeeereeeeeee ç Ñ ?...',
			'expected  true : ' . PHP_EOL
				. to_string($result)
		);
	}//end test_truncate_text



	/**
	* TEST_truncate_html
	* @return void
	*/
	public function test_truncate_html() {

		$result = common::truncate_html(
			36,
			'loooong text <br> heeeeeereeeeeee ç Ñ ? ï ...... !!!!',
		);

		$this->assertTrue(
			gettype($result)==='string',
			'expected type string : ' . PHP_EOL
				. gettype($result)
		);

		$this->assertTrue(
			$result==='loooong text <br> heeeeeereeeeeee ç...',
			'expected  true : ' . PHP_EOL
				. to_string($result)
		);
	}//end test_truncate_html



	/**
	* TEST_build_element_json_output
	* @return void
	*/
	public function test_build_element_json_output() {

		$result = common::build_element_json_output(
			[],
			[],
		);

		$this->assertTrue(
			gettype($result)==='object',
			'expected type object : ' . PHP_EOL
				. gettype($result)
		);
	}//end test_build_element_json_output



	/**
	* TEST_get_ddinfo_parents
	* @return void
	*/
	public function test_get_ddinfo_parents() {

		$locator = (object)[
			"type"					=> "dd151",
			"section_id"			=> "6519",
			"section_tipo"			=> "es1",
			"from_component_tipo"	=> "oh19"
		];
		$source_component_tipo = 'oh19';

		$result = common::get_ddinfo_parents(
			$locator,
			$source_component_tipo,
		);

		$this->assertTrue(
			gettype($result)==='object',
			'expected type object : ' . PHP_EOL
				. gettype($result)
		);

		$this->assertTrue(
			$result->parent===$source_component_tipo,
			'expected  true : ' . PHP_EOL
				. to_string($result)
		);
	}//end test_get_ddinfo_parents



	/**
	* TEST_get_element_lang
	* @return void
	*/
	public function test_get_element_lang() {

		$component_tipo = 'oh19';

		$result = common::get_element_lang(
			$component_tipo
		);

		$this->assertTrue(
			gettype($result)==='string',
			'expected type string : ' . PHP_EOL
				. gettype($result)
		);

		$this->assertTrue(
			$result===DEDALO_DATA_NOLAN,
			'expected  true : ' . PHP_EOL
				. to_string($result)
		);
	}//end test_get_element_lang



	/**
	* TEST_get_section_elements_context
	* @return void
	*/
	public function test_get_section_elements_context() {

		// search options
		$options = json_decode('
			{
			    "context_type": "simple",
			    "ar_section_tipo": [
			        "dd234"
			    ],
			    "use_real_sections": false,
			    "skip_permissions": true,
			    "ar_components_exclude": [
			        "component_password",
			        "component_image",
			        "component_av",
			        "component_pdf",
			        "component_security_administrator",
			        "component_geolocation",
			        "component_info",
			        "component_state",
			        "component_semantic_node",
			        "component_inverse",
			        "section_tab"
			    ]
			}
		');

		$result = common::get_section_elements_context(
			$options
		);

		$this->assertTrue(
			gettype($result)==='array',
			'expected type array : ' . PHP_EOL
				. gettype($result)
		);
	}//end test_get_section_elements_context



	/**
	* TEST_resolve_view
	* @return void
	*/
	public function test_resolve_view() {

		// search options
		$options = (object)[
			'model' => 'component_portal',
			'tipo' => 'test80'
		];

		$result = common::resolve_view(
			$options
		);

		$this->assertTrue(
			gettype($result)==='string' || gettype($result)==='NULL',
			'expected type string|null : ' . PHP_EOL
				. gettype($result)
		);

		$this->assertTrue(
			$result==='default',
			'expected  true : ' . PHP_EOL
				. to_string($result)
		);
	}//end test_resolve_view



}//end class common_test
