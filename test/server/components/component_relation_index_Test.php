<?php declare(strict_types=1);
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';



final class component_relation_index_test extends BaseTestCase {



	public static $model		= 'component_relation_index';
	public static $tipo			= 'test25';
	public static $section_tipo	= 'test3';



	/**
	* BUILD_COMPONENT_INSTANCE
	* @return
	*/
	private function build_component_instance() {

		$this->user_login();

		$model			= self::$model;
		$tipo			= self::$tipo;
		$section_tipo	= self::$section_tipo;
		$section_id		= 1;
		$mode			= 'edit';
		$lang			= DEDALO_DATA_NOLAN;

		$component = component_common::get_instance(
			$model, // string model
			$tipo, // string tipo
			$section_id,
			$mode,
			$lang,
			$section_tipo
		);

		return $component;
	}//end build_component_instance



	/////////// ⬇︎ test start ⬇︎ ////////////////



	/**
	* TEST_GET_DATA
	* @return void
	*/
	public function test_get_data() {

		$component = $this->build_component_instance();

		$result	= $component->get_data();

		$this->assertTrue(
			gettype($result)==='array' || gettype($result)==='NULL',
			'expected type array|null : ' . PHP_EOL
				. gettype($result)
		);
	}//end test_get_data




	/**
	* TEST_set_data
	* @return void
	*/
	public function test_set_data() {

		$component = $this->build_component_instance();

		$old_data = $component->get_data();

		$data	= [];
		$result	= $component->set_data($data);

		$this->assertTrue(
			gettype($result)==='boolean',
			'expected type boolean : ' . PHP_EOL
				. gettype($result)
		);

		// empty array case
			$this->assertTrue(
				$component->get_data()===null,
				'expected null : ' . PHP_EOL
					. to_string($component->get_data())
			);

		// array case
			$locator = json_decode('
				{
					"type": "dd96",
					"section_tipo": "rsc167",
					"section_id": "1",
					"component_tipo": "rsc36",
					"tag_id": "30",
					"section_top_id": "1",
					"section_top_tipo": "oh1",
					"from_component_top_tipo": "rsc860",
					"from_component_tipo": "test25"
				}
			');
			$data	= [$locator];
			$result	= $component->set_data($data);
			$this->assertTrue(
				locator::in_array_locator($locator, $component->get_data()),
				'expected array : ' . PHP_EOL
					. to_string($component->get_data())
			);

		// restore dato
			$result	= $component->set_data($old_data);

			$this->assertTrue(
				json_encode($component->get_data())===json_encode($old_data),
				'expected old dato : ' . PHP_EOL
					. to_string($component->get_data())
			);
	}//end test_set_data



	/**
	* TEST_GET_SECTION_DATUM_FROM_LOCATOR
	* @return void
	*/
	public function test_get_section_datum_from_locator() {

		$component = $this->build_component_instance();

		$locator_base = json_decode('
			{
				"type": "dd96",
				"section_tipo": "rsc167",
				"section_id": "1",
				"component_tipo": "rsc36",
				"tag_id": "30",
				"section_top_id": "1",
				"section_top_tipo": "oh1",
				"from_component_top_tipo": "rsc860",
				"from_component_tipo": "test25"
			}
		');
		$locator = new locator($locator_base);

		$result	= $component->get_section_datum_from_locator(
			$locator
		);

		$this->assertTrue(
			gettype($result)==='object',
			'expected type object : ' . PHP_EOL
				. gettype($result)
		);
	}//end test_get_section_datum_from_locator



	/**
	* TEST_remove_locator
	* @return void
	*/
	public function test_remove_locator() {

		$component = $this->build_component_instance();

		$request_options = new stdClass();
			$request_options->locator = null;

		$result = $component->remove_locator($request_options);

		$this->assertTrue(
			$result===false,
			'expected result false for empty locator remove: '
				. to_string($result)
		);
	}//end test_remove_locator



	/**
	* TEST_get_references_to_section
	* @return void
	*/
	public function test_get_references_to_section() {

		$result = component_relation_index::get_references_to_section(
			'ts1' // section_tipo
		);

		$this->assertTrue(
			gettype($result)==='array',
			'expected type array : ' . PHP_EOL
				. gettype($result)
		);
	}//end test_get_references_to_section



	/**
	* TEST_get_referended_locators_with_cache
	* @return void
	*/
	public function test_get_referended_locators_with_cache() {

		$locator_base = json_decode('
			{
				"type": "dd96",
				"section_tipo": "rsc167",
				"section_id": "1",
				"component_tipo": "rsc36",
				"tag_id": "30",
				"section_top_id": "1",
				"section_top_tipo": "oh1",
				"from_component_top_tipo": "rsc860",
				"from_component_tipo": "test25"
			}
		');

		$result = component_relation_index::get_referended_locators_with_cache(
			$locator_base,
			DEDALO_RELATION_TYPE_INDEX_TIPO . '_' . self::$section_tipo . '_' . 1 // cache_key
		);

		$this->assertTrue(
			gettype($result)==='array',
			'expected type array : ' . PHP_EOL
				. gettype($result)
		);
	}//end test_get_referended_locators_with_cache



	/**
	* TEST_get_data_paginated
	* @return void
	*/
	public function test_get_data_paginated() {

		$component = $this->build_component_instance();

		$result = $component->get_data_paginated();

		$this->assertTrue(
			gettype($result)==='array',
			'expected type array : ' . PHP_EOL
				. gettype($result)
		);
	}//end test_get_data_paginated



	/**
	* TEST_parse_data
	* @return void
	*/
	public function test_parse_data() {

		// sample inverse locator-like object
		$dummy_locator = (object)[
			'type' => 'dd96',
			'from_section_tipo' => 'test3',
			'from_section_id' => '1',
			'tag_component_tipo' => 'test25',
			'tag_id' => '30',
			'section_top_id' => '1',
			'section_top_tipo' => 'oh1',
			'from_component_tipo' => 'test25'
		];

		$result = component_relation_index::parse_data([$dummy_locator]);

		$this->assertTrue(
			is_array($result) && !empty($result),
			'expected non-empty array'
		);
		$this->assertInstanceOf(
			locator::class,
			$result[0],
			'expected instance of locator'
		);
	}//end test_parse_data



	/**
	* TEST_count_data
	* @return void
	*/
	public function test_count_data() {

		$component = $this->build_component_instance();

		$result = $component->count_data();

		$this->assertTrue(
			gettype($result)==='integer',
			'expected type integer : ' . PHP_EOL
				. gettype($result)
		);
	}//end test_count_data



	/**
	* TEST_count_data_group_by
	* @return void
	*/
	public function test_count_data_group_by() {

		$component = $this->build_component_instance();

		$result = $component->count_data_group_by(['section_tipo']);

		$this->assertTrue(
			is_object($result),
			'expected type object : ' . PHP_EOL
				. gettype($result)
		);
	}//end test_count_data_group_by



	/**
	* TEST_get_related_section_context
	* @return void
	*/
	public function test_get_related_section_context() {

		$component = $this->build_component_instance();

		$result = $component->get_related_section_context();

		$this->assertTrue(
			gettype($result)==='array',
			'expected type array : ' . PHP_EOL
				. gettype($result)
		);
	}//end test_get_related_section_context



	/**
	* TEST_search_operators_info
	* @return void
	*/
	public function test_search_operators_info() {

		$component = $this->build_component_instance();

		$result = $component->search_operators_info();

		$this->assertTrue(
			gettype($result)==='array',
			'expected type array : ' . PHP_EOL
				. gettype($result)
		);
		$this->assertArrayHasKey('*', $result);
		$this->assertArrayHasKey('!*', $result);
	}//end test_search_operators_info



}//end class component_relation_index_test
