<?php declare(strict_types=1);
// PHPUnit classes
use PHPUnit\Framework\TestCase;
use PHPUnit\Framework\Attributes\TestDox;
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';



final class component_date_test extends TestCase {



	public static $model		= 'component_date';
	public static $tipo			= 'test145';
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



	/**
	* TEST_set_dato
	* @return void
	*/
	public function test_set_dato() {

		$component = $this->build_component_instance();

		// null
			$dato	= null;
			$result	= $component->set_dato($dato);

			$this->assertTrue(
				gettype($result)==='boolean',
				'expected type boolean : ' . PHP_EOL
					. gettype($result)
			);

			$this->assertTrue(
				$component->dato===null,
				'expected null : ' . PHP_EOL
					. to_string($result)
			);

		// object
			$dato = json_decode('
					{
						"start": {
							"day": 23,
							"time": 513475200,
							"year": 15,
							"month": 12
						}
					}
			');
			$result	= $component->set_dato($dato);

			$this->assertTrue(
				gettype($component->dato)==='array',
				'expected type array : ' . PHP_EOL
					. gettype($component->dato)
			);

		// array
			$dato = json_decode('
				[
					{
						"start": {
							"day": 23,
							"time": 513475200,
							"year": 15,
							"month": 12
						}
					}
				]
			');
			$result	= $component->set_dato($dato);

			$this->assertTrue(
				gettype($component->dato)==='array',
				'expected type array : ' . PHP_EOL
					. gettype($component->dato)
			);
	}//end test_set_dato



	/**
	* TEST_get_date_mode
	* @return void
	*/
	public function test_get_date_mode() {

		$component = $this->build_component_instance();

		$result = $component->get_date_mode();

		$this->assertTrue(
			gettype($result)==='string',
			'expected type string : ' . PHP_EOL
				. gettype($result)
		);

		$this->assertTrue(
			$result==='date',
			'expected true : ' . PHP_EOL
				. to_string($result)
		);
	}//end test_get_date_mode



	/**
	* TEST_get_date_now
	* @return void
	*/
	public function test_get_date_now() {

		$component = $this->build_component_instance();

		$result = $component->get_date_now();

		// sample expected
			// {
			//     "year": 2023,
			//     "month": 12,
			//     "day": 18,
			//     "hour": 9,
			//     "minute": 42,
			//     "second": 15,
			//     "time": 65051804535
			// }


		$this->assertTrue(
			gettype($result)==='object',
			'expected type object : ' . PHP_EOL
				. gettype($result)
		);
	}//end test_get_date_now



	/**
	* TEST_data_item_to_value
	* @return void
	*/
	public function test_data_item_to_value() {

		$component = $this->build_component_instance();

		// range single
			$data_item = json_decode('
				{
				    "start": {
				        "day": 8,
				        "hour": 12,
				        "time": 64638475292,
				        "year": 2011,
				        "month": 2,
				        "minute": 1,
				        "second": 32
				    }
				}
			');

			$result = $component->data_item_to_value(
				$data_item,
				'range'
			);

			$this->assertTrue(
				gettype($result)==='string',
				'expected type string : ' . PHP_EOL
					. gettype($result)
			);
			// 2011/02/08
			$this->assertTrue(
				$result==='2011/02/08',
				'expected 2011/02/08 : ' . PHP_EOL
					. to_string($result)
			);

		// range double
			$data_item = json_decode('
				{
				    "start": {
				        "day": 8,
				        "hour": 12,
				        "time": 64638475292,
				        "year": 2011,
				        "month": 2,
				        "minute": 1,
				        "second": 32
				    },
				     "end": {
				        "day": 9,
				        "hour": 12,
				        "time": 64638475292,
				        "year": 2011,
				        "month": 2,
				        "minute": 1,
				        "second": 32
				    }
				}
			');

			$result = $component->data_item_to_value(
				$data_item,
				'range'
			);

			$this->assertTrue(
				gettype($result)==='string',
				'expected type string : ' . PHP_EOL
					. gettype($result)
			);
			// 2011/02/08 <> 2011/02/09
			$this->assertTrue(
				$result==='2011/02/08 <> 2011/02/09',
				'expected 2011/02/08 <> 2011/02/09 : ' . PHP_EOL
					. to_string($result)
			);


		// time_range
			$data_item = json_decode('
				{
				    "start": {
				        "day": 8,
				        "hour": 12,
				        "time": 64638475292,
				        "year": 2011,
				        "month": 2,
				        "minute": 1,
				        "second": 32
				    },
				     "end": {
				        "day": 9,
				        "hour": 12,
				        "time": 64638475292,
				        "year": 2011,
				        "month": 2,
				        "minute": 1,
				        "second": 32
				    }
				}
			');

			$result = $component->data_item_to_value(
				$data_item,
				'time_range'
			);

			$this->assertTrue(
				gettype($result)==='string',
				'expected type string : ' . PHP_EOL
					. gettype($result)
			);
			// 12:01:32 <> 12:01:32
			$this->assertTrue(
				$result==='12:01:32 <> 12:01:32',
				'expected 12:01:32 <> 12:01:32 : ' . PHP_EOL
					. to_string($result)
			);

		// period
			$data_item = json_decode('
				{
				    "period": {
				        "day": 8,
				        "year": 2011,
				        "month": 2
				    }
				}
			');

			$result = $component->data_item_to_value(
				$data_item,
				'period'
			);

			$this->assertTrue(
				gettype($result)==='string',
				'expected type string : ' . PHP_EOL
					. gettype($result)
			);
			// 2011 years 2 months 8 days
			switch (DEDALO_DATA_LANG) {
				case 'lg-spa':
					$compare = '2011 años 2 meses 8 días';
					break;

				case 'lg-eng':
				default:
					$compare = '2011 years 2 months 8 days';
					break;
			}
			$this->assertTrue(
				$result===$compare,
				'expected '.$compare.' : ' . PHP_EOL
					. to_string($result)
			);

		// time
			$data_item = json_decode('
				{
				    "start": {
				        "day": 8,
				        "hour": 12,
				        "time": 64638475292,
				        "year": 2011,
				        "month": 2,
				        "minute": 1,
				        "second": 32
				    }
				}
			');

			$result = $component->data_item_to_value(
				$data_item,
				'time'
			);

			$this->assertTrue(
				gettype($result)==='string',
				'expected type string : ' . PHP_EOL
					. gettype($result)
			);
			// 12:01:32
			$this->assertTrue(
				$result==='12:01:32',
				'expected 12:01:32 : ' . PHP_EOL
					. to_string($result)
			);

		// date_time
			$data_item = json_decode('
				{
				    "start": {
				        "day": 8,
				        "hour": 12,
				        "time": 64638475292,
				        "year": 2011,
				        "month": 2,
				        "minute": 1,
				        "second": 32
				    }
				}
			');

			$result = $component->data_item_to_value(
				$data_item,
				'date_time'
			);

			$this->assertTrue(
				gettype($result)==='string',
				'expected type string : ' . PHP_EOL
					. gettype($result)
			);
			// 2011/02/08 12:01:32
			$this->assertTrue(
				$result==='2011/02/08 12:01:32',
				'expected 2011/02/08 12:01:32 : ' . PHP_EOL
					. to_string($result)
			);

		// date
			$data_item = json_decode('
				{
				    "start": {
				        "day": 8,
				        "hour": 12,
				        "time": 64638475292,
				        "year": 2011,
				        "month": 2,
				        "minute": 1,
				        "second": 32
				    }
				}
			');

			$result = $component->data_item_to_value(
				$data_item,
				'date'
			);

			$this->assertTrue(
				gettype($result)==='string',
				'expected type string : ' . PHP_EOL
					. gettype($result)
			);
			// 2011/02/08
			$this->assertTrue(
				$result==='2011/02/08',
				'expected 2011/02/08 : ' . PHP_EOL
					. to_string($result)
			);
	}//end test_data_item_to_value



	/**
	* TEST_get_valor
	* @return void
	*/
	public function test_get_valor() {

		$component = $this->build_component_instance();

		$result = $component->get_valor();

		$this->assertTrue(
			gettype($result)==='string',
			'expected type string : ' . PHP_EOL
				. gettype($result)
		);
	}//end test_get_valor



	/**
	* TEST_get_valor_local
	* @return void
	*/
	public function test_get_valor_local() {

		$component = $this->build_component_instance();

		$data_item = json_decode('
			{
		        "day": 8,
		        "hour": 12,
		        "time": 64638475292,
		        "year": 2011,
		        "month": 2,
		        "minute": 1,
		        "second": 32
			}
		');
		$dd_date = new dd_date($data_item);

		$result = $component->get_valor_local($dd_date);

		$this->assertTrue(
			gettype($result)==='string',
			'expected type string : ' . PHP_EOL
				. gettype($result)
		);
	}//end test_get_valor_local



	/**
	* TEST_get_valor_export
	* @return void
	*/
	public function test_get_valor_export() {

		$component = $this->build_component_instance();

		$result = $component->get_valor_export();

		$this->assertTrue(
			gettype($result)==='string',
			'expected type string : ' . PHP_EOL
				. gettype($result)
		);
	}//end test_get_valor_export



	/**
	* TEST_resolve_query_object_sql
	* @return void
	*/
	public function test_resolve_query_object_sql() {

		$query_object = json_decode('
		{
		    "q": [
		        {
		            "mode": "start",
		            "start": {
		                "year": 2023,
		                "month": 12,
		                "day": 13
		            }
		        }
		    ],
		    "q_operator": null,
		    "path": [
		        {
		            "name": "date",
		            "model": "component_date",
		            "section_tipo": "test3",
		            "component_tipo": "test145"
		        }
		    ],
		    "type": "jsonb",
		    "component_path": [
		        "components",
		        "test145",
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
	* TEST_get_final_search_range_seconds
	* @return void
	*/
	public function test_get_final_search_range_seconds() {

		$time_item = json_decode('
			{
		        "day": 8,
		        "hour": 12,
		        "time": 64638475292,
		        "year": 2011,
		        "month": 2,
		        "minute": 1,
		        "second": 32
		    }
		');

		$dd_date = new dd_date($time_item);

		$result = component_date::get_final_search_range_seconds( $dd_date );

		$this->assertTrue(
			gettype($result)==='integer',
			'expected type integer : ' . PHP_EOL
				. gettype($result)
		);
		// 64638561691
		$this->assertTrue(
			$result===64638561691,
			'expected 64638561691 : ' . PHP_EOL
				. to_string($result)
		);
	}//end test_get_final_search_range_seconds



	/**
	* TEST_add_time
	* @return void
	*/
	public function test_add_time() {

		$time_item = json_decode('
			{
		        "day": 8,
		        "hour": 12,
		        "year": 2011,
		        "month": 2,
		        "minute": 1,
		        "second": 32
		    }
	    ');

		$dd_date = new dd_date($time_item);

		$result = component_date::add_time( $dd_date );

		$this->assertTrue(
			gettype($result)==='object',
			'expected type object : ' . PHP_EOL
				. gettype($result)
		);

		// expected:
		$expected = json_decode('
			{
			    "day": 8,
			    "hour": 12,
			    "year": 2011,
			    "month": 2,
			    "minute": 1,
			    "second": 32,
			    "time": 64638475292
			}
		');

		$this->assertTrue(
			json_encode($result)===json_encode($expected),
			'expected  : '.to_string($expected) . PHP_EOL
				. to_string($result)
		);
	}//end test_add_time



	/**
	* TEST_get_calculation_data
	* @return void
	*/
	public function test_get_calculation_data() {

		$component = $this->build_component_instance();

		$result = $component->get_calculation_data((object)[
			'select' => 'start'
		]);

		if (!empty($result)) {
			$this->assertTrue(
				gettype($result)==='integer',
				'expected type integer : ' . PHP_EOL
					. gettype($result)
			);
		}
	}//end test_get_calculation_data



	/**
	* TEST_data_to_text
	* @return void
	*/
	public function test_data_to_text() {

		$time_item = json_decode('{
			"start": {
		        "day": 8,
		        "hour": 12,
		        "time": 64638475292,
		        "year": 2011,
		        "month": 2,
		        "minute": 1,
		        "second": 32
			}
		}');

		$result = component_date::data_to_text( $time_item );

		$this->assertTrue(
			gettype($result)==='string',
			'expected type string : ' . PHP_EOL
				. gettype($result)
		);
		// 2011-02-08
		$this->assertTrue(
			$result==='2011-02-08',
			'expected 2011-02-08 : ' . PHP_EOL
				. to_string($result)
		);
	}//end test_data_to_text



	/**
	* TEST_get_order_path
	* @return void
	*/
	public function test_get_order_path() {

		$component = $this->build_component_instance();

		$result = $component->get_order_path(
			'test145',
			'test3'
		);

		$this->assertTrue(
			gettype($result)==='array',
			'expected type array : ' . PHP_EOL
				. gettype($result)
		);
		$this->assertTrue(
			gettype($result[0])==='object',
			'expected $result[0] type object : ' . PHP_EOL
				. gettype($result[0])
		);
	}//end test_get_order_path



	/**
	* TEST_get_list_value
	* @return void
	*/
	public function test_get_list_value() {

		$component = $this->build_component_instance();

		$result = $component->get_list_value();

		$this->assertTrue(
			gettype($result)==='array' || gettype($result)==='NULL',
			'expected type array|NULL : ' . PHP_EOL
				. gettype($result)
		);
	}//end test_get_list_value



	/**
	* TEST_conform_import_data
	* @return void
	*/
	public function test_conform_import_data() {

		$component = $this->build_component_instance();

		$response = $component->conform_import_data(
			'17-12-2023', // import_value
			self::$tipo . '_dmy' // column_name
		);

		$this->assertTrue(
			gettype($response)==='object',
			'expected type object : ' . PHP_EOL
				. gettype($response)
		);
		$this->assertTrue(
			gettype($response->result)==='array',
			'expected type array : ' . PHP_EOL
				. gettype($response->result)
		);
		$this->assertTrue(
			gettype($response->errors)==='array',
			'expected type array : ' . PHP_EOL
				. gettype($response->errors)
		);
		$this->assertTrue(
			empty($response->errors),
			'expected empty errors : ' . PHP_EOL
				. to_string($response->errors)
		);
	}//end test_conform_import_data



}//end class component_date_Test
