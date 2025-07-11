<?php declare(strict_types=1);
// PHPUnit classes
use PHPUnit\Framework\TestCase;
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';



final class component_relation_children_test extends TestCase {



	public static $model		= 'component_relation_children';
	public static $tipo			= 'test201';
	public static $section_tipo	= 'test3';



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
	* BUILD_COMPONENT_INSTANCE
	* @return
	*/
	private function build_component_instance() {

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
	* TEST_get_dato
	* @return void
	*/
	public function test_get_dato() {

		$component = $this->build_component_instance();

		$result	= $component->get_dato();

		$this->assertTrue(
			gettype($result)==='array' || gettype($result)==='NULL',
			'expected type array|null : ' . PHP_EOL
				. gettype($result)
		);
	}//end test_get_dato



	/**
	* TEST_set_dato
	* @return void
	*/
	public function test_set_dato() {

		$component = $this->build_component_instance();

		$old_dato = $component->get_dato();

		$dato	= null;
		$result	= $component->set_dato($dato);

		$this->assertTrue(
			gettype($result)==='boolean',
			'expected type boolean : ' . PHP_EOL
				. gettype($result)
		);

		// null case
			$updated_dato = $component->get_dato();
			$this->assertTrue(
				$component->dato===[],
				' (null case) expected [] : ' . PHP_EOL
				.'component dato: ' . to_string($updated_dato) . PHP_EOL
				.'reference dato: ' . to_string([]) . PHP_EOL
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
			$reference_dato	= $locator;
			$result			= $component->set_dato($reference_dato);
			$updated_dato	= $component->get_dato();
			$this->assertTrue(
				json_encode($updated_dato)===json_encode([$reference_dato]),
				' (object case) expected equal array : ' . PHP_EOL
				.'component updated_dato: ' . to_string($updated_dato) . PHP_EOL
				.'reference dato (array with locator): ' . to_string($reference_dato) . PHP_EOL
				.'updated_dato: ' . to_string($updated_dato) . PHP_EOL
			);

		// array case
			$dato	= [$locator];
			$result	= $component->set_dato($dato);
			$updated_dato = $component->get_dato();
			$this->assertTrue(
				json_encode($updated_dato)===json_encode($dato),
				' (array case) expected equal array : ' . PHP_EOL
				.'component get_dato: ' . to_string($updated_dato) . PHP_EOL
				.'reference dato: ' . to_string($dato) . PHP_EOL
			);

		// restore dato
			$result	= $component->set_dato($old_dato);
			$updated_dato = $component->get_dato();
			$this->assertTrue(
				json_encode($updated_dato)===json_encode($old_dato),
				' (restore dato case) expected old dato : ' . PHP_EOL
				.'updated_dato: ' . to_string($updated_dato) . PHP_EOL
				.'reference dato: ' . to_string($old_dato) . PHP_EOL
			);
	}//end test_set_dato



	/**
	* TEST_get_valor
	* @return void
	*/
	public function test_get_valor() {

		$component = $this->build_component_instance();

		$result = $component->get_valor();

		$this->assertTrue(
			gettype($result)==='string' || gettype($result)==='NULL',
			'expected type string|null : ' . PHP_EOL
				. gettype($result)
		);
	}//end test_get_valor



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
