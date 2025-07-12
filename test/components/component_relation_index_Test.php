<?php declare(strict_types=1);
// PHPUnit classes
use PHPUnit\Framework\TestCase;
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';



final class component_relation_index_test extends TestCase {



	public static $model		= 'component_relation_index';
	public static $tipo			= 'test25';
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
	* TEST_get_dato_full
	* @return void
	*/
	public function test_get_dato_full() {

		$component = $this->build_component_instance();

		$result	= $component->get_dato_full();

		$this->assertTrue(
			gettype($result)==='array' || gettype($result)==='NULL',
			'expected type array|null : ' . PHP_EOL
				. gettype($result)
		);
	}//end test_get_dato_full



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
			$this->assertTrue(
				$component->dato===[],
				'expected [] : ' . PHP_EOL
					. to_string($component->dato)
			);

		// object case
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
			$dato	= $locator;
			$result	= $component->set_dato($dato);

			$this->assertTrue(
				json_encode($component->dato)===json_encode([$dato]),
				'expected array : ' . PHP_EOL
					. to_string($component->dato)
			);

		// array case
			$dato	= [$locator];
			$result	= $component->set_dato($dato);
			$this->assertTrue(
				json_encode($component->dato)===json_encode($dato),
				'expected array : ' . PHP_EOL
					. to_string($component->dato)
			);

		// restore dato
			$result	= $component->set_dato($old_dato);

			$this->assertTrue(
				json_encode($component->dato)===json_encode($old_dato),
				'expected old dato : ' . PHP_EOL
					. to_string($component->dato)
			);
	}//end test_set_dato



	/**
	* TEST_get_section_datum_from_locator
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
	* TEST_get_diffusion_value
	* @return void
	*/
	public function test_get_diffusion_value() {

		$component = $this->build_component_instance();

		$result = $component->get_diffusion_value();

		$this->assertTrue(
			gettype($result)==='string' || gettype($result)==='NULL',
			'expected type string|null : ' . PHP_EOL
				. gettype($result)
		);
	}//end test_get_diffusion_value



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
	* TEST_resolve_query_object_sql
	* @return void
	*/
	public function test_resolve_query_object_sql() {

		$query_object = json_decode('
		{
		    "q": "only_operator",
		    "q_operator": "*",
		    "path": [
		        {
		            "name": "relation_index",
		            "model": "component_relation_index",
		            "section_tipo": "test3",
		            "component_tipo": "test25"
		        }
		    ],
		    "type": "jsonb",
		    "component_path": [
		        "components",
		        "test25",
		        "dato"
		    ],
		    "lang": "all"
		}
		');

		$result = component_date::resolve_query_object_sql( $query_object );

		$this->assertTrue(
			gettype($result)==='object',
			'expected type object : ' . PHP_EOL
				. gettype($result)
		);
	}//end test_resolve_query_object_sql



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



}//end class component_relation_index_test
