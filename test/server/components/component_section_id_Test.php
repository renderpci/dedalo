<?php declare(strict_types=1);
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';



final class component_section_id_test extends BaseTestCase {



	public static $model		= 'component_section_id';
	public static $tipo			= 'test102';
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
	* TEST_GET_DATa
	* @return void
	*/
	public function test_get_data() {

		$component = $this->build_component_instance();

		$result	= $component->get_data();

		$this->assertTrue(
			gettype($result)==='array',
			'expected type array ' . PHP_EOL
				. gettype($result)
		);
	}//end test_get_data



	/**
	* TEST_SET_DATA
	* @return void
	*/
	public function test_set_data() {

		$component = $this->build_component_instance();

		$old_data = $component->get_data();

		$data	= [1];
		$result	= $component->set_data($data);
		$test_data	= $component->get_data();
		// check result
		$this->assertTrue(
			gettype($result)==='boolean',
			'expected type boolean : ' . PHP_EOL
				. gettype($result)
		);
		// check data
		$this->assertEquals(
			$old_data, $test_data,
			'expected old data : ' . PHP_EOL 
			. to_string($test_data)
		);

		// null case
		// take account that this component is read only dont't save or set data
		// so the data is not changed
			$result		= $component->set_data(null);
			$test_data	= $component->get_data();
			$this->assertTrue(
				$test_data===$old_data,
				'expected old data : ' . PHP_EOL
					. to_string($test_data)
			);

		// restore data
		// take account that this component is read only dont't save or set data
		// so the data is not changed
			$result		= $component->set_data($old_data);
			$test_data	= $component->get_data();
			$this->assertTrue(
				json_encode($test_data)===json_encode($old_data),
				'expected old dato : ' . PHP_EOL
					. to_string($test_data)
			);
	}//end test_set_data



	/**
	* TEST_GET_GRID_VALUE
	* @return void
	*/
	public function test_get_grid_value() {

		$component = $this->build_component_instance();

		$result	= $component->get_grid_value();

		$this->assertTrue(
			gettype($result)==='object',
			'expected type object : ' . PHP_EOL
				. gettype($result)
		);
		$this->assertTrue(
			$result->value===1,
			'expected type object : ' . PHP_EOL
				. to_string($result->value)
		);
	}//end test_get_grid_value



	/**
	* TEST_GET_TOOLS
	* @return void
	*/
	public function test_get_tools() {

		$component = $this->build_component_instance();

		$result	= $component->get_tools();

		$this->assertTrue(
			gettype($result)==='array',
			'expected type array : ' . PHP_EOL
				. gettype($result)
		);
		$this->assertTrue(
			$result===[],
			'expected type object : ' . PHP_EOL
				. to_string($result)
		);
	}//end test_get_tools



	/**
	* TEST_RESOLVE_QUERY_OBJECT_SQL
	* @return void
	*/
	public function test_resolve_query_object_sql() {

		$query_object = json_decode('
		{
		    "q": [
		        "1"
		    ],
		    "q_operator": null,
		    "path": [
		        {
		            "name": "section_id",
		            "model": "component_section_id",
		            "section_tipo": "test3",
		            "component_tipo": "test102"
		        }
		    ],
		    "type": "jsonb",
		    "lang": "all"
		}
		');

		$result = component_section_id::resolve_query_object_sql( $query_object );

		$this->assertTrue(
			gettype($result)==='object',
			'expected type object : ' . PHP_EOL
				. gettype($result)
		);

		$this->assertTrue(
			$result->sentence==='.section_id::integer = _Q1_',
			'expected sentence : .section_id::integer = _Q1_' . PHP_EOL
				. to_string($result->sentence)
		);
	}//end test_resolve_query_object_sql



	/**
	* TEST_SEARCH_OPERATORS_INFO
	* @return void
	*/
	public function test_search_operators_info() {

		$component = $this->build_component_instance();

		$result	= $component->search_operators_info();

		$this->assertTrue(
			gettype($result)==='array',
			'expected type array : ' . PHP_EOL
				. gettype($result)
		);
		$this->assertTrue(
			!empty($result),
			'expected no empty result : ' . PHP_EOL
				. to_string($result)
		);
	}//end test_search_operators_info



	/**
	* TEST_GET_DIFFUSION_DATA
	* @return void
	*/
	public function test_get_diffusion_data() {

		$component = $this->build_component_instance();

		$ddo = (object)[
			'id' => '1',
			'tipo' => 'test102'
		];

		$result = $component->get_diffusion_data($ddo);

		$this->assertTrue(
			gettype($result)==='array',
			'expected type array : ' . PHP_EOL
				. gettype($result)
		);
		$this->assertTrue(
			!empty($result),
			'expected non empty result : ' . PHP_EOL
				. to_string($result)
		);
		if (!empty($result)) {
			$this->assertTrue(
				gettype($result[0])==='object',
				'expected first element to be object : ' . PHP_EOL
					. gettype($result[0])
			);
		}
	}//end test_get_diffusion_data



}//end class component_section_id_test
