<?php
declare(strict_types=1);
use PHPUnit\Framework\TestCase;
use PHPUnit\Framework\Attributes\TestDox;

// require_once dirname(dirname(__FILE__)). '/lib/vendor/autoload.php';
	require_once dirname(dirname(dirname(__FILE__))) . '/config/config.php';
	require_once dirname(dirname(__FILE__)) . '/login/login_Test.php';
	require_once 'data.php';
	require_once 'elements.php';

// check is development server. if not, throw to prevent malicious access
	if (!defined('DEVELOPMENT_SERVER') || DEVELOPMENT_SERVER!==true) {
		throw new Exception("Error. Only development servers can use this method", 1);
	}



final class component_input_text_test extends TestCase {



	public static $model		= 'component_input_text';
	public static $tipo			= 'test52';
	public static $section_tipo	= 'test3';



	/**
	* TEST_get_dato
	* @return void
	*/
	public function test_get_dato() {

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

		$value = $component->get_dato();

		$this->assertTrue(
			gettype($value)==='array',
			'expected type array : ' . PHP_EOL
				. gettype($value)
		);
	}//end test_get_dato



	/**
	* TEST_set_dato
	* @return void
	*/
	public function test_set_dato() {

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
			$section_tipo,
			false
		);

		$value = $component->set_dato(null);

		$this->assertTrue(
			$value===true,
			'expected true : ' . PHP_EOL
				. to_string($value)
		);

		$value = $component->set_dato('["patata"]');

		$this->assertTrue(
			$value===true,
			'expected true : ' . PHP_EOL
				. to_string($value)
		);

		$value = $component->set_dato('patata');

		$this->assertTrue(
			$value===true,
			'expected true : ' . PHP_EOL
				. to_string($value)
		);
	}//end test_set_dato



	/**
	* TEST_is_empty
	* @return void
	*/
	public function test_is_empty() {

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
			$section_tipo,
			false
		);

		$value = $component->is_empty(null);

		$this->assertTrue(
			gettype($value)==='boolean',
			'expected type boolean : ' . PHP_EOL
				. gettype($value)
		);
		$this->assertTrue(
			$value===true,
			'expected empty : ' . PHP_EOL
				. to_string($value)
		);

		$value = $component->is_empty('');

		$this->assertTrue(
			$value===true,
			'expected empty : ' . PHP_EOL
				. to_string($value)
		);

		$value = $component->is_empty(' ');

		$this->assertTrue(
			$value===true,
			'expected empty : ' . PHP_EOL
				. to_string($value)
		);

		$value = $component->is_empty("\n");

		$this->assertTrue(
			$value===true,
			'expected empty : ' . PHP_EOL
				. to_string($value)
		);
	}//end test_is_empty



	/**
	* TEST_get_grid_value
	* @return void
	*/
	public function test_get_grid_value() {

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
			$section_tipo,
			false
		);

		$value = $component->get_grid_value(null);

		$this->assertTrue(
			gettype($value->value)==='array',
			'expected type array : ' . PHP_EOL
				. gettype($value->value)
		);
		$this->assertTrue(
			gettype($value->fallback_value)==='array',
			'expected type array : ' . PHP_EOL
				. gettype($value->fallback_value)
		);
		$this->assertTrue(
			$value->type==='column',
			'expected type array : ' . PHP_EOL
				. gettype($value->type)
		);
		$this->assertTrue(
			$value->cell_type==='text',
			'expected cell_type text : ' . PHP_EOL
				. to_string($value->cell_type)
		);
	}//end test_get_grid_value



	/**
	* TEST_get_valor
	* @return void
	*/
	public function test_get_valor() {

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
			$section_tipo,
			false
		);

		$value = $component->get_valor();

		$this->assertTrue(
			gettype($value)==='string',
			'expected type string : ' . PHP_EOL
				. gettype($value)
		);
	}//end test_get_valor



	/**
	* TEST_get_valor_export
	* @return void
	*/
	public function test_get_valor_export() {

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
			$section_tipo,
			false
		);

		$value = $component->get_valor_export();

		$this->assertTrue(
			gettype($value)==='string',
			'expected type string : ' . PHP_EOL
				. gettype($value)
		);
	}//end test_get_valor_export



	/**
	* TEST_update_dato_version
	* @return void
	*/
	public function test_update_dato_version() {

		$model			= self::$model;
		$tipo			= self::$tipo;
		$section_tipo	= self::$section_tipo;
		$section_id		= 1;
		$mode			= 'list';
		$lang			= DEDALO_DATA_LANG;

		// $component = component_common::get_instance(
		// 	$model, // string model
		// 	$tipo, // string tipo
		// 	$section_id,
		// 	$mode,
		// 	$lang,
		// 	$section_tipo,
		// 	false
		// );

		$options = new stdClass();
			$options->update_version = [6,0,0];
			$options->dato_unchanged = null;

		$value = component_input_text::update_dato_version($options);

		// expected sample
			//  {
			//     "result": 0,
			//     "msg": "This component component_input_text don't have update to this version (6.0.0). Ignored action"
			// }

		$this->assertTrue(
			gettype($value->result)==='integer',
				'expected value do not match:' . PHP_EOL
				.' expected: integer' . PHP_EOL
				.' value: '.gettype($value->result)
		);
		$this->assertTrue(
			$value->result===0,
				'expected value do not match:' . PHP_EOL
				.' expected: 0' . PHP_EOL
				.' value: '.to_string($value->result)
		);
	}//end test_update_dato_version



	/**
	* TEST_resolve_query_object_sql
	* @return void
	*/
	public function test_resolve_query_object_sql() {

		// $model			= self::$model;
		// $tipo			= self::$tipo;
		// $section_tipo	= self::$section_tipo;
		// $section_id		= 1;
		// $mode			= 'list';
		// $lang			= DEDALO_DATA_LANG;

		// $component = component_common::get_instance(
		// 	$model, // string model
		// 	$tipo, // string tipo
		// 	$section_id,
		// 	$mode,
		// 	$lang,
		// 	$section_tipo,
		// 	false
		// );

		$query_object = json_decode('{
			    "q": [
			        "as"
			    ],
			    "q_operator": null,
			    "path": [
			        {
			            "section_tipo": "test3",
			            "component_tipo": "test52",
			            "model": "component_input_text",
			            "name": "Title"
			        }
			    ],
			    "type": "jsonb",
			    "component_path": [
			        "components",
			        "test3",
			        "dato"
			    ],
			    "lang": "all"
			}
		');

		$value = component_text_area::resolve_query_object_sql(
			$query_object
		);
		// dump($value, ' value ++ '.to_string());

		$this->assertTrue(
			$value->operator==='~*',
				'expected value do not match:' . PHP_EOL
				.' expected: ~*' . PHP_EOL
				.' value: '.to_string($value->operator)
		);
		$this->assertTrue(
			$value->q_parsed==="'.*\".*as.*'",
				'expected value do not match:' . PHP_EOL
				.' expected: '. "'.*\".*as.*'" . PHP_EOL
				.' value: '.to_string($value->q_parsed)
		);
		$this->assertTrue(
			$value->unaccent===true,
				'expected value do not match:' . PHP_EOL
				.' expected: true' . PHP_EOL
				.' value: '.to_string($value->unaccent)
		);
	}//end test_resolve_query_object_sql



	/**
	* TEST_search_operators_info
	* @return void
	*/
	public function test_search_operators_info() {

		$model			= self::$model;
		$tipo			= self::$tipo;
		$section_tipo	= self::$section_tipo;
		$section_id		= 1;
		$mode			= 'list';
		$lang			= DEDALO_DATA_LANG;

		$component = component_common::get_instance(
			$model, // string model
			$tipo, // string tipo
			$section_id,
			$mode,
			$lang,
			$section_tipo,
			false
		);

		$value = $component->search_operators_info();

		$this->assertTrue(
			gettype($value)==='array',
				'expected value do not match:' . PHP_EOL
				.' expected: array' . PHP_EOL
				.' value: '.gettype($value)
		);
		$this->assertTrue(
			!empty($value),
				'expected value do not match:' . PHP_EOL
				.' expected: !empty()' . PHP_EOL
				.' value: '.to_string($value)
		);
	}//end test_search_operators_info



	/**
	* TEST_get_diffusion_value
	* @return void
	*/
	public function test_get_diffusion_value() {

		$model			= self::$model;
		$tipo			= self::$tipo;
		$section_tipo	= self::$section_tipo;
		$section_id		= 1;
		$mode			= 'list';
		$lang			= DEDALO_DATA_LANG;

		$component = component_common::get_instance(
			$model, // string model
			$tipo, // string tipo
			$section_id,
			$mode,
			$lang,
			$section_tipo,
			false
		);

		$value = $component->get_diffusion_value();

		$this->assertTrue(
			gettype($value)==='string',
				'expected value do not match:' . PHP_EOL
				.' expected type: string' . PHP_EOL
				.' type: '.gettype($value)
		);

		$this->assertTrue(
			!empty($value),
				'expected value do not match:' . PHP_EOL
				.' expected: !empty()' . PHP_EOL
				.' value: '.to_string($value)
		);
	}//end test_get_diffusion_value



}//end class
