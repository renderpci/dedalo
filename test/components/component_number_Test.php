<?php
declare(strict_types=1);
// PHPUnit classes
use PHPUnit\Framework\TestCase;
use PHPUnit\Framework\Attributes\TestDox;
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';



final class component_number_test extends TestCase {



	public static $model		= 'component_number';
	public static $tipo			= 'test211';
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
	* TEST_IS_EMPTY
	* @return void
	*/
	public function test_is_empty() {

		$component = $this->build_component_instance();

		// null
			$value = null;
			$result = $component->is_empty($value);
			$this->assertTrue(
				gettype($result)==='boolean',
				'expected type boolean : ' . PHP_EOL
					. gettype($result)
			);
			$this->assertTrue(
				$result===true,
				'expected value : true' . PHP_EOL
					. to_string($value)
			);

		// empty array
			$value = [];
			$result = $component->is_empty($value);
			$this->assertTrue(
				$result===true,
				'expected value : true' . PHP_EOL
					. to_string($result)
			);

		// empty array 2
			$value = [null];
			$result = $component->is_empty($value);
			$this->assertTrue(
				$result===true,
				'expected value : true' . PHP_EOL
					. to_string($result)
			);

		// non empty array 3
			$value = [14,null,89];
			$result = $component->is_empty($value);
			$this->assertTrue(
				$result===false,
				'expected value : false' . PHP_EOL
					. to_string($result)
			);

		// non empty array 4
			$value = [0];
			$result = $component->is_empty($value);
			$this->assertTrue(
				$result===false,
				'expected value : false' . PHP_EOL
					. to_string($result)
			);

		// empty 0
			$value = 0;
			$result = $component->is_empty($value);
			$this->assertTrue(
				$result===false,
				'expected value : false' . PHP_EOL
					. to_string($result)
			);

		// non empty 0
			$value = 0;
			$result = $component->is_empty($value);
			$this->assertTrue(
				$result===false,
				'expected value : false' . PHP_EOL
					. to_string($result)
			);

		// non empty '0'
			$value = '0';
			$result = $component->is_empty($value);
			$this->assertTrue(
				$result===false,
				'expected value : false' . PHP_EOL
					. to_string($result)
			);
	}//end test_is_empty



	/**
	* TEST_GET_DATO
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

		$result = $component->get_dato();
		$this->assertTrue(
			gettype($result)==='array' || gettype($result)==='NULL',
			'expected type array or NULL : ' . PHP_EOL
				. gettype($result)
		);

		// set empty values
			$component->set_dato(null);
			$result = $component->get_dato();
			$this->assertTrue(
				$result===null,
				'expected value : null' . PHP_EOL
					. to_string($result)
			);

			$component->set_dato([null]);
			$result = $component->get_dato();
			$this->assertTrue(
				$result===null,
				'expected value : null' . PHP_EOL
					. to_string($result)
			);

			$component->set_dato([0]);
			$result = $component->get_dato();
			$this->assertTrue(
				$result[0]===0.0, // float here !
				'expected first value : 0' . PHP_EOL
					. to_string($result[0])
			);
	}//end test_get_dato



	/**
	* TEST_SET_DATO
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
			$section_tipo
		);

		$result = $component->set_dato([]);
		$this->assertTrue(
			gettype($result)==='boolean',
			'expected type boolean : ' . PHP_EOL
				. gettype($result)
		);

		// float
			$component->set_properties((object)[
				'type' => 'float',
				'precision' => 4
			]);
			// $properties	= $component->get_properties();
			// dump($properties, ' properties->type ++ '.to_string());

		// dato
			$result = $component->get_dato();
			$this->assertTrue(
				$result===null,
				'expected value : null' . PHP_EOL
					. to_string($result)
			);

			$component->set_dato([null]);
			$result = $component->get_dato();
			$this->assertTrue(
				$result===null,
				'expected value : null' . PHP_EOL
					. to_string($result)
			);

			$component->set_dato([0]);
			$result = $component->get_dato();
			$this->assertTrue(
				$result[0]===0.0, // float here !
				'expected value : 0' . PHP_EOL
					. to_string($result[0])
			);

			$component->set_dato(33);
			$result = $component->get_dato();
			$this->assertTrue(
				$result[0]===33.0, // double here !
				'expected value : 33' . PHP_EOL
					. to_string($result[0])
			);
			$this->assertTrue(
				gettype($result[0])==='double',
				'expected type double : ' . PHP_EOL
					. gettype($result[0])
			);

		// int
			$component->set_properties((object)[
				'type' => 'int'
			]);
			// $properties	= $component->get_properties();
			// dump($properties, ' properties->type ++ '.to_string());

		// dato
			$component->set_dato([0]);
			$result = $component->get_dato();
			$this->assertTrue(
				$result[0]===0, // float here !
				'expected value : 0' . PHP_EOL
					. to_string($result[0])
			);

			$component->set_dato(33);
			$result = $component->get_dato();
			$this->assertTrue(
				$result[0]===33, // double here !
				'expected value : 33' . PHP_EOL
					. to_string($result[0])
			);
			$this->assertTrue(
				gettype($result[0])==='integer',
				'expected type integer : ' . PHP_EOL
					. gettype($result[0])
			);
	}//end test_set_dato



	/**
	* TEST_SET_FORMAT_FORM_TYPE
	* @return void
	*/
	public function test_set_format_form_type() {

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

		// float
			$component->set_properties((object)[
				'type' => 'float',
				'precision' => 4
			]);

			$dato_value = 0;
			$result = $component->set_format_form_type( $dato_value );
			$this->assertTrue(
				gettype($result)==='double' ,
				'expected type double : ' . PHP_EOL
					. gettype($result)
			);

			$dato_value = null;
			$result = $component->set_format_form_type( $dato_value );
			$this->assertTrue(
				gettype($result)==='NULL' ,
				'expected type NULL : ' . PHP_EOL
					. gettype($result)
			);

			$dato_value = '';
			$result = $component->set_format_form_type( $dato_value );
			$this->assertTrue(
				gettype($result)==='NULL' ,
				'expected type NULL : ' . PHP_EOL
					. gettype($result)
			);

			$dato_value = 'abc';
			$result = $component->set_format_form_type( $dato_value );
			$this->assertTrue(
				gettype($result)==='double' ,
				'expected type double : ' . PHP_EOL
					. gettype($result)
			);

		// int
			$component->set_properties((object)[
				'type' => 'int'
			]);

			$dato_value = 0;
			$result = $component->set_format_form_type( $dato_value );
			$this->assertTrue(
				gettype($result)==='integer' ,
				'expected type integer : ' . PHP_EOL
					. gettype($result)
			);

			$dato_value = null;
			$result = $component->set_format_form_type( $dato_value );
			$this->assertTrue(
				gettype($result)==='NULL' ,
				'expected type NULL : ' . PHP_EOL
					. gettype($result)
			);

			$dato_value = '';
			$result = $component->set_format_form_type( $dato_value );
			$this->assertTrue(
				gettype($result)==='NULL' ,
				'expected type NULL : ' . PHP_EOL
					. gettype($result)
			);

			$dato_value = 'abc';
			$result = $component->set_format_form_type( $dato_value );
			$this->assertTrue(
				gettype($result)==='integer' ,
				'expected type integer : ' . PHP_EOL
					. gettype($result)
			);
	}//end test_set_format_form_type



	/**
	* TEST_NUMBER_TO_STRING
	* @return void
	*/
	public function test_number_to_string() {

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

		// float
			$component->set_properties((object)[
				'type' => 'float',
				'precision' => 4
			]);

			$dato_value = 13.8;
			$result = $component->number_to_string( $dato_value );
			$this->assertTrue(
				gettype($result)==='string' ,
				'expected type string : ' . PHP_EOL
					. gettype($result)
			);
			$this->assertTrue(
				$result==='13.8000' ,
				'expected type 13.8000 : ' . PHP_EOL
					. to_string($result)
			);

			$dato_value = '13,8';
			$result = $component->number_to_string( $dato_value );
			$this->assertTrue(
				$result==='13.8',
				'expected type 13.8 : ' . PHP_EOL
					. to_string($result)
			);

		// int
			$component->set_properties((object)[
				'type' => 'int'
			]);

			$dato_value = 13.8;
			$result = $component->number_to_string( $dato_value );
			$this->assertTrue(
				gettype($result)==='string' ,
				'expected type string : ' . PHP_EOL
					. gettype($result)
			);
			$this->assertTrue(
				$result==='13.8' ,
				'expected type 13.8 : ' . PHP_EOL
					. to_string($result)
			);

			$dato_value = '13,8';
			$result = $component->number_to_string( $dato_value );
			$this->assertTrue(
				$result==='13.8',
				'expected type 13.8 : ' . PHP_EOL
					. to_string($result)
			);
	}//end test_number_to_string



	/**
	* TEST_STRING_TO_NUMBER
	* @return void
	*/
	public function test_string_to_number() {

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

		// float
			$component->set_properties((object)[
				'type' => 'float',
				'precision' => 4
			]);

			$dato_value = '13.8';
			$result = $component->string_to_number( $dato_value );
			$this->assertTrue(
				gettype($result)==='double' ,
				'expected type double : ' . PHP_EOL
					. gettype($result)
			);
			$this->assertTrue(
				$result===13.8 ,
				'expected type 13.8 : ' . PHP_EOL
					. to_string($result)
			);

			$dato_value = '13,8';
			$result = $component->string_to_number( $dato_value );
			$this->assertTrue(
				gettype($result)==='double' ,
				'expected type double : ' . PHP_EOL
					. gettype($result)
			);
			$this->assertTrue(
				$result===138.0,
				'expected type 138.0 : ' . PHP_EOL
					. to_string($result)
			);

		// int
			$component->set_properties((object)[
				'type' => 'int'
			]);

			$dato_value = '13.8';
			$result = $component->string_to_number( $dato_value );
			$this->assertTrue(
				gettype($result)==='integer' ,
				'expected type integer : ' . PHP_EOL
					. gettype($result)
			);
			$this->assertTrue(
				$result===13 ,
				'expected type 13 : ' . PHP_EOL
					. to_string($result)
			);

			$dato_value = '13,8';
			$result = $component->string_to_number( $dato_value );
			$this->assertTrue(
				gettype($result)==='integer' ,
				'expected type integer : ' . PHP_EOL
					. gettype($result)
			);
			$this->assertTrue(
				$result===138,
				'expected type 138 : ' . PHP_EOL
					. to_string($result)
			);
	}//end test_string_to_number



}//end class component_number_test
