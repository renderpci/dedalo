<?php declare(strict_types=1);
// PHPUnit classes
use PHPUnit\Framework\TestCase;
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';



final class component_relation_children_test extends BaseTestCase {



	public static $model		= 'component_relation_children';
	public static $tipo			= 'test201';
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
	* TEST_SET_DATA
	* @return void
	*/
	public function test_set_data() {

		$component = $this->build_component_instance();

		$old_data = $component->get_data();

		$data	= null;
		$result	= $component->set_data($data);

		$this->assertTrue(
			gettype($result)==='boolean',
			'expected type boolean : ' . PHP_EOL
				. gettype($result)
		);

		// null case
			$updated_data = $component->get_data();
			$this->assertTrue(
				$updated_data===null,
				' (null case) expected null : ' . PHP_EOL
				.'component data: ' . to_string($updated_data) . PHP_EOL
				.'reference data: ' . to_string(null) . PHP_EOL
			);

		// object case
			$locator = json_decode('
				{
					"section_tipo": "test3",
					"section_id": "2",
					"from_component_tipo": "test201",
					"type": "dd48"
				}
			');

			$data	= [$locator];
			$result	= $component->set_data($data);
			$updated_data = $component->get_data();
			$this->assertTrue(
				json_encode($updated_data)===json_encode($data),
				' (array case) expected equal array : ' . PHP_EOL
				.'component get_data: ' . to_string($updated_data) . PHP_EOL
				.'reference data: ' . to_string($data) . PHP_EOL
			);

		// restore data
			$result	= $component->set_data($old_data);
			$updated_data = $component->get_data();
			$this->assertTrue(
				json_encode($updated_data)===json_encode($old_data),
				' (restore data case) expected old data : ' . PHP_EOL
				.'updated_data: ' . to_string($updated_data) . PHP_EOL
				.'reference data: ' . to_string($old_data) . PHP_EOL
			);
	}//end test_set_data


	/**
	* TEST_get_sortable
	* @return void
	*/
	public function test_get_sortable() {

		$component = $this->build_component_instance();

		$result = $component->get_sortable();

		$this->assertTrue(
			$result===false,
			'expected false : ' . PHP_EOL
				. to_string($result)
		);
	}//end test_get_sortable



	/**
	* TEST_resolve_query_object_sql
	* @return void
	*/
	public function test_resolve_query_object_sql() {

		$query_object = json_decode('
			{
			    "q": [
			        {
			            "section_tipo": "test3",
			            "section_id": "2",
			            "from_component_tipo": "test201"
			        }
			    ],
			    "path": [
			        {
			            "name": "relation_children",
			            "model": "component_relation_children",
			            "section_tipo": "test3",
			            "component_tipo": "test201"
			        }
			    ],
			    "q_split": false,
			    "type": "jsonb",
			    "component_path": [
			        "components",
			        "test201",
			        "dato"
			    ],
			    "lang": "all"
			}
		');

		$result = component_relation_children::resolve_query_object_sql(
			$query_object
		);

		$this->assertTrue(
			gettype($result)==='object',
			'expected type object : ' . PHP_EOL
				. gettype($result)
		);

		$reference_value = 'in_column';
		$this->assertTrue(
			$result->format===$reference_value,
			'expected \'in_column\' : ' . PHP_EOL
			.'$result->format: ' .  to_string($result->format) . PHP_EOL
			.'expected $reference_value: ' .  to_string($reference_value) . PHP_EOL
			.'result: ' . to_string($result)
		);
	}//end test_resolve_query_object_sql



}//end class component_relation_children_test
