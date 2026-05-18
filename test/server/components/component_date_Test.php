<?php declare(strict_types=1);
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';



final class component_date_test extends BaseTestCase {



	public static $model		= 'component_date';
	public static $tipo			= 'test145';	// date_mode: date
	public static $tipo_period	= 'test218';	// date_mode: period
	public static $section_tipo	= 'test3';



	/**
	* BUILD_COMPONENT_INSTANCE
	* @param string|null $tipo
	* @param int $section_id
	* @param string $mode
	* @return object
	*/
	private function build_component_instance( ?string $tipo=null, int $section_id=1, string $mode='edit' ) : object {

		$this->user_login();

		$component = component_common::get_instance(
			self::$model,
			$tipo ?? self::$tipo,
			$section_id,
			$mode,
			DEDALO_DATA_NOLAN,
			self::$section_tipo
		);

		return $component;
	}//end build_component_instance



	/**
	* TEST_set_data
	* @return void
	*/
	public function test_set_data() {

		$component = $this->build_component_instance();

		// 1 - null case
			$data	= null;
			$result	= $component->set_data($data);

			$this->assertTrue(
				gettype($result)==='boolean',
				'expected type boolean : ' . PHP_EOL
					. gettype($result)
			);

			$this->assertTrue(
				$component->get_data()===null,
					'expected get_data is null : ' . PHP_EOL
					.'result: ' . to_string($result)
			);

		// 2 - array case
			$data = json_decode('
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
			$result	= $component->set_data($data);

			$this->assertTrue(
				gettype($component->get_data())==='array',
				'expected type array : ' . PHP_EOL
					. gettype($component->get_data())
			);
	}//end test_set_data



	/**
	* TEST_save
	* @return void
	*/
	public function test_save() {

		$component = $this->build_component_instance();

		$data = json_decode('
			[
				{
					"start": {
						"day": 23,
						"year": 2015,
						"month": 12
					}
				}
			]
		');
		$component->set_data($data);

		$result = $component->save();

		$this->assertTrue(
			gettype($result)==='boolean' || gettype($result)==='integer',
			'expected type boolean or integer : ' . PHP_EOL
				. gettype($result)
		);
	}//end test_save



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
	* TEST_get_date_mode_static
	* @return void
	*/
	public function test_get_date_mode_static() {

		$result = component_date::get_date_mode_static( self::$tipo );

		$this->assertTrue(
			gettype($result)==='string',
			'expected type string : ' . PHP_EOL
				. gettype($result)
		);

		$this->assertTrue(
			$result==='date',
			'expected date : ' . PHP_EOL
				. to_string($result)
		);
	}//end test_get_date_mode_static



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
	* TEST_get_grid_value
	* @return void
	*/
	public function test_get_grid_value() {

		$component = $this->build_component_instance();

		$data = json_decode('
			[
				{
					"start": {
						"day": 23,
						"time": 513475200,
						"year": 2015,
						"month": 12
					}
				}
			]
		');
		$component->set_data($data);

		$result = $component->get_grid_value();

		$this->assertTrue(
			gettype($result)==='object',
			'expected type object : ' . PHP_EOL
				. gettype($result)
		);

		$this->assertTrue(
			get_class($result)==='dd_grid_cell_object',
			'expected class dd_grid_cell_object : ' . PHP_EOL
				. get_class($result)
		);

		$this->assertTrue(
			$result->value[0]==='2015/12/23',
			'expected 2015/12/23 : ' . PHP_EOL
				. to_string($result->value[0])
		);
	}//end test_get_grid_value



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

		$this->assertTrue(
			array_key_exists('>=', $result),
			'expected key >= exists'
		);
	}//end test_search_operators_info



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
		$dd_date_data = json_decode('
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
		$dd_date = new dd_date($dd_date_data);
		$expected = $dd_date;

		$this->assertTrue(
			json_encode($result)===json_encode($expected),
			'expected  : '.to_string($expected) . PHP_EOL
				. to_string($result)
		);
	}//end test_add_time



	/**
	* TEST_add_time_period_mode
	* @return void
	*/
	public function test_add_time_period_mode() {

		$data_item = json_decode('
			{
			    "period": {
			        "year": 2,
			        "month": 3,
			        "day": 5
			    }
			}
		');

		$result = component_date::add_time($data_item);

		$this->assertTrue(
			gettype($result) === 'object',
			'expected type object : ' . PHP_EOL
				. gettype($result)
		);

		$this->assertTrue(
			isset($result->period),
			'expected result->period to be set'
		);

		$this->assertTrue(
			get_class($result->period) === 'dd_date',
			'expected result->period class dd_date : ' . PHP_EOL
				. get_class($result->period)
		);

		// time = 2*32140800 + (3-1)*31*86400 + (5-1)*86400 = 69984000
		$this->assertTrue(
			$result->period->get_time() === 69984000,
			'expected time 69984000 : ' . PHP_EOL
				. to_string($result->period->get_time())
		);
	}//end test_add_time_period_mode



	/**
	* TEST_add_time_date_mode
	* @return void
	*/
	public function test_add_time_date_mode() {

		$data_item = json_decode('
			{
			    "start": {
			        "year": 2023,
			        "month": 7,
			        "day": 11
			    }
			}
		');

		$result = component_date::add_time($data_item);

		$this->assertTrue(
			gettype($result) === 'object',
			'expected type object : ' . PHP_EOL
				. gettype($result)
		);

		$this->assertTrue(
			isset($result->start),
			'expected result->start to be set'
		);

		$this->assertFalse(
			isset($result->end),
			'expected result->end NOT to be set'
		);

		$this->assertTrue(
			get_class($result->start) === 'dd_date',
			'expected result->start class dd_date : ' . PHP_EOL
				. get_class($result->start)
		);

		// time = 2023*32140800 + (7-1)*31*86400 + (11-1)*86400 = 65037772800
		$this->assertTrue(
			$result->start->get_time() === 65037772800,
			'expected time 65037772800 : ' . PHP_EOL
				. to_string($result->start->get_time())
		);
	}//end test_add_time_date_mode



	/**
	* TEST_add_time_range_mode
	* @return void
	*/
	public function test_add_time_range_mode() {

		$data_item = json_decode('
			{
			    "start": {
			        "year": 2020,
			        "month": 1,
			        "day": 1
			    },
			    "end": {
			        "year": 2020,
			        "month": 12,
			        "day": 31
			    }
			}
		');

		$result = component_date::add_time($data_item);

		$this->assertTrue(
			gettype($result) === 'object',
			'expected type object : ' . PHP_EOL
				. gettype($result)
		);

		$this->assertTrue(
			get_class($result->start) === 'dd_date',
			'expected result->start class dd_date : ' . PHP_EOL
				. get_class($result->start)
		);

		$this->assertTrue(
			get_class($result->end) === 'dd_date',
			'expected result->end class dd_date : ' . PHP_EOL
				. get_class($result->end)
		);

		// start time = 2020*32140800 + 0 + 0 = 64924416000
		$this->assertTrue(
			$result->start->get_time() === 64924416000,
			'expected start time 64924416000 : ' . PHP_EOL
				. to_string($result->start->get_time())
		);

		// end time = 2020*32140800 + (12-1)*31*86400 + (31-1)*86400 = 64956470400
		$this->assertTrue(
			$result->end->get_time() === 64956470400,
			'expected end time 64956470400 : ' . PHP_EOL
				. to_string($result->end->get_time())
		);
	}//end test_add_time_range_mode



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
	* TEST_get_stats_value_with_valor_arguments
	* @return void
	*/
	public function test_get_stats_value_with_valor_arguments() {

		$value = '[{"start":{"year":2023,"month":12,"day":18}}]';
		$valor_arguments = 'year';

		$result = component_date::get_stats_value_with_valor_arguments($value, $valor_arguments);

		$this->assertTrue(
			$result === 2023,
			'expected 2023 : ' . PHP_EOL
				. to_string($result)
		);
	}//end test_get_stats_value_with_valor_arguments



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

		// v7 format: date objects have 'start' property, NOT 'value'
		$this->assertTrue(
			is_object($response->result[0]),
			'expected first result item to be object (v7 format)'
		);
		$this->assertTrue(
			property_exists($response->result[0], 'start'),
			'expected date object to have "start" property'
		);
		$this->assertFalse(
			property_exists($response->result[0], 'value'),
			'expected date object to NOT have "value" property (dates use start/end)'
		);
		$this->assertEquals(
			2023,
			$response->result[0]->start->year,
			'expected start year to be 2023'
		);
		$this->assertEquals(
			12,
			$response->result[0]->start->month,
			'expected start month to be 12'
		);
		$this->assertEquals(
			17,
			$response->result[0]->start->day,
			'expected start day to be 17'
		);
	}//end test_conform_import_data



	/**
	* TEST_update_data_version
	* @return void
	*/
	public function test_update_data_version() {

		$request_options = (object)[
			'update_version' => [1,0,0]
		];

		$result = component_date::update_data_version($request_options);

		$this->assertTrue(
			gettype($result)==='object',
			'expected type object : ' . PHP_EOL
				. gettype($result)
		);
		$this->assertTrue(
			$result->result === 0,
			'expected result 0 : ' . PHP_EOL
				. to_string($result->result)
		);
	}//end test_update_data_version






	///////////// ⬇︎ LIFECYCLE TESTS ⬇︎ ////////////////



	/**
	* TEST_LIFECYCLE_DATE_MODE
	* Full lifecycle: create → add data → change data → remove data → verify clean state
	* @return void
	*/
	public function test_lifecycle_date_mode() {

		// CREATE: instantiate the component
			$component = $this->build_component_instance(self::$tipo);
			$original_data = $component->get_data();

			$this->assertTrue(
				get_class($component)==='component_date',
				'CREATE: expected class component_date'
			);

			$date_mode = $component->get_date_mode();
			$this->assertTrue(
				$date_mode==='date',
				'CREATE: expected date_mode date, got: ' . $date_mode
			);

		// ADD DATA: set a date value with start
			$add_data = [
				(object)[
					'id'	=> 1,
					'start'	=> (object)[
						'year'	=> 2023,
						'month'	=> 7,
						'day'	=> 15
					]
				]
			];
			$component->set_data($add_data);
			$component->save();

			$data = $component->get_data();
			$this->assertTrue(
				count($data)===1,
				'ADD: expected 1 element after add'
			);
			$this->assertTrue(
				isset($data[0]->start) && $data[0]->start->year===2023,
				'ADD: expected start year 2023'
			);
			$this->assertTrue(
				isset($data[0]->start->time),
				'ADD: expected time property to be set by save (add_time)'
			);

		// CHANGE DATA: update the date value
			$change_data = [
				(object)[
					'id'	=> 1,
					'start'	=> (object)[
						'year'	=> 2024,
						'month'	=> 12,
						'day'	=> 25
					]
				]
			];
			$component->set_data($change_data);
			$component->save();

			$data = $component->get_data();
			$this->assertTrue(
				$data[0]->start->year===2024,
				'CHANGE: expected year 2024'
			);
			$this->assertTrue(
				$data[0]->start->month===12,
				'CHANGE: expected month 12'
			);
			$this->assertTrue(
				$data[0]->start->day===25,
				'CHANGE: expected day 25'
			);

		// REMOVE DATA: remove all entries
			$component->set_data([]);
			$component->save();

			$data = $component->get_data();
			$this->assertTrue(
				empty($data),
				'REMOVE: expected empty data after remove'
			);

		// VERIFY CLEAN STATE: fresh instance should have no data
			$fresh = $this->build_component_instance(self::$tipo);
			$fresh_data = $fresh->get_data();
			$this->assertTrue(
				empty($fresh_data),
				'DESTROY: expected empty data on fresh instance after cleanup'
			);

		// RESTORE original data
			$component->set_data($original_data);
			$component->save();
	}//end test_lifecycle_date_mode



	/**
	* TEST_LIFECYCLE_RANGE_MODE
	* Full lifecycle for range mode (start + end dates)
	* @return void
	*/
	public function test_lifecycle_range_mode() {

		// CREATE: instantiate the component
			$component = $this->build_component_instance(self::$tipo);
			$original_data = $component->get_data();

		// ADD DATA: set a range value with start and end
			$add_data = [
				(object)[
					'id'	=> 1,
					'start'	=> (object)[
						'year'	=> 2020,
						'month'	=> 1,
						'day'	=> 1
					],
					'end'	=> (object)[
						'year'	=> 2020,
						'month'	=> 12,
						'day'	=> 31
					]
				]
			];
			$component->set_data($add_data);
			$component->save();

			$data = $component->get_data();
			$this->assertTrue(
				count($data)===1,
				'ADD: expected 1 element after add'
			);
			$this->assertTrue(
				isset($data[0]->start) && $data[0]->start->year===2020,
				'ADD: expected start year 2020'
			);
			$this->assertTrue(
				isset($data[0]->end) && $data[0]->end->year===2020,
				'ADD: expected end year 2020'
			);
			$this->assertTrue(
				isset($data[0]->start->time) && isset($data[0]->end->time),
				'ADD: expected time property on both start and end'
			);

		// CHANGE DATA: update the end date
			$change_data = [
				(object)[
					'id'	=> 1,
					'start'	=> (object)[
						'year'	=> 2020,
						'month'	=> 1,
						'day'	=> 1
					],
					'end'	=> (object)[
						'year'	=> 2021,
						'month'	=> 6,
						'day'	=> 30
					]
				]
			];
			$component->set_data($change_data);
			$component->save();

			$data = $component->get_data();
			$this->assertTrue(
				$data[0]->end->year===2021,
				'CHANGE: expected end year 2021'
			);
			$this->assertTrue(
				$data[0]->end->month===6,
				'CHANGE: expected end month 6'
			);

		// REMOVE DATA: remove all entries
			$component->set_data([]);
			$component->save();

			$data = $component->get_data();
			$this->assertTrue(
				empty($data),
				'REMOVE: expected empty data after remove'
			);

		// RESTORE original data
			$component->set_data($original_data);
			$component->save();
	}//end test_lifecycle_range_mode



	/**
	* TEST_LIFECYCLE_TIME_MODE
	* Full lifecycle for time mode (hour, minute, second)
	* @return void
	*/
	public function test_lifecycle_time_mode() {

		// CREATE: instantiate the component
			$component = $this->build_component_instance(self::$tipo);
			$original_data = $component->get_data();

		// ADD DATA: set a time value
			$add_data = [
				(object)[
					'id'	=> 1,
					'start'	=> (object)[
						'hour'		=> 14,
						'minute'	=> 30,
						'second'	=> 0
					]
				]
			];
			$component->set_data($add_data);
			$component->save();

			$data = $component->get_data();
			$this->assertTrue(
				count($data)===1,
				'ADD: expected 1 element after add'
			);
			$this->assertTrue(
				isset($data[0]->start->hour) && $data[0]->start->hour===14,
				'ADD: expected hour 14'
			);
			$this->assertTrue(
				isset($data[0]->start->time),
				'ADD: expected time property to be set by save (add_time)'
			);

		// CHANGE DATA: update the time value
			$change_data = [
				(object)[
					'id'	=> 1,
					'start'	=> (object)[
						'hour'		=> 9,
						'minute'	=> 15,
						'second'	=> 30
					]
				]
			];
			$component->set_data($change_data);
			$component->save();

			$data = $component->get_data();
			$this->assertTrue(
				$data[0]->start->hour===9,
				'CHANGE: expected hour 9'
			);
			$this->assertTrue(
				$data[0]->start->minute===15,
				'CHANGE: expected minute 15'
			);
			$this->assertTrue(
				$data[0]->start->second===30,
				'CHANGE: expected second 30'
			);

		// REMOVE DATA
			$component->set_data([]);
			$component->save();

			$data = $component->get_data();
			$this->assertTrue(
				empty($data),
				'REMOVE: expected empty data after remove'
			);

		// RESTORE original data
			$component->set_data($original_data);
			$component->save();
	}//end test_lifecycle_time_mode



	/**
	* TEST_LIFECYCLE_PERIOD_MODE
	* Full lifecycle for period mode (year, month, day as duration)
	* @return void
	*/
	public function test_lifecycle_period_mode() {

		// CREATE: instantiate the component with period tipo
			$component = $this->build_component_instance(self::$tipo_period);
			$original_data = $component->get_data();

			$this->assertTrue(
				get_class($component)==='component_date',
				'CREATE: expected class component_date'
			);

			$date_mode = $component->get_date_mode();
			$this->assertTrue(
				$date_mode==='period',
				'CREATE: expected date_mode period, got: ' . $date_mode
			);

		// ADD DATA: set a period value
			$add_data = [
				(object)[
					'id'		=> 1,
					'period'	=> (object)[
						'year'	=> 2,
						'month'	=> 3,
						'day'	=> 5
					]
				]
			];
			$component->set_data($add_data);
			$component->save();

			$data = $component->get_data();
			$this->assertTrue(
				count($data)===1,
				'ADD: expected 1 element after add'
			);
			$this->assertTrue(
				isset($data[0]->period),
				'ADD: expected period property to exist'
			);
			$this->assertTrue(
				$data[0]->period->year===2,
				'ADD: expected period year 2'
			);
			$this->assertTrue(
				$data[0]->period->month===3,
				'ADD: expected period month 3'
			);
			$this->assertTrue(
				$data[0]->period->day===5,
				'ADD: expected period day 5'
			);
			$this->assertTrue(
				isset($data[0]->period->time),
				'ADD: expected time property to be set by save (add_time)'
			);

		// CHANGE DATA: update the period value
			$change_data = [
				(object)[
					'id'		=> 1,
					'period'	=> (object)[
						'year'	=> 10,
						'month'	=> 6,
						'day'	=> 15
					]
				]
			];
			$component->set_data($change_data);
			$component->save();

			$data = $component->get_data();
			$this->assertTrue(
				$data[0]->period->year===10,
				'CHANGE: expected period year 10'
			);
			$this->assertTrue(
				$data[0]->period->month===6,
				'CHANGE: expected period month 6'
			);
			$this->assertTrue(
				$data[0]->period->day===15,
				'CHANGE: expected period day 15'
			);

		// REMOVE DATA
			$component->set_data([]);
			$component->save();

			$data = $component->get_data();
			$this->assertTrue(
				empty($data),
				'REMOVE: expected empty data after remove'
			);

		// VERIFY CLEAN STATE
			$fresh = $this->build_component_instance(self::$tipo_period);
			$fresh_data = $fresh->get_data();
			$this->assertTrue(
				empty($fresh_data),
				'DESTROY: expected empty data on fresh instance after cleanup'
			);

		// RESTORE original data
			$component->set_data($original_data);
			$component->save();
	}//end test_lifecycle_period_mode



	/**
	* TEST_LIFECYCLE_UPDATE_DATA_VALUE_DATE_MODE
	* Test update_data_value with 'update' action for date mode
	* @return void
	*/
	public function test_lifecycle_update_data_value_date_mode() {

		// CREATE
			$component = $this->build_component_instance(self::$tipo);
			$original_data = $component->get_data();

		// ADD DATA via set_data
			$add_data = [
				(object)[
					'id'	=> 1,
					'start'	=> (object)[
						'year'	=> 2023,
						'month'	=> 1,
						'day'	=> 1
					]
				]
			];
			$component->set_data($add_data);
			$component->save();

		// UPDATE via update_data_value (same as JS change_handler does)
			$changed_data = (object)[
				'action'	=> 'update',
				'id'		=> 1,
				'value'		=> (object)[
					'id'	=> 1,
					'start'	=> (object)[
						'year'	=> 2025,
						'month'	=> 3,
						'day'	=> 20
					]
				]
			];
			$result = $component->update_data_value($changed_data);
			$this->assertTrue(
				$result===true,
				'UPDATE: expected true on update_data_value'
			);

			$data = $component->get_data();
			$this->assertTrue(
				$data[0]->start->year===2025,
				'UPDATE: expected year 2025 after update_data_value'
			);

		// REMOVE via update_data_value
			$remove_data = (object)[
				'action'	=> 'remove',
				'id'		=> 1
			];
			$result = $component->update_data_value($remove_data);
			$this->assertTrue(
				$result===true,
				'REMOVE: expected true on update_data_value remove'
			);

			$data = $component->get_data();
			$this->assertTrue(
				empty($data),
				'REMOVE: expected empty data after remove'
			);

		// RESTORE
			$component->set_data($original_data);
			$component->save();
	}//end test_lifecycle_update_data_value_date_mode



	/**
	* TEST_LIFECYCLE_UPDATE_DATA_VALUE_PERIOD_MODE
	* Test update_data_value with 'update' action for period mode
	* Verifies that period key is preserved (not 'undefined')
	* @return void
	*/
	public function test_lifecycle_update_data_value_period_mode() {

		// CREATE
			$component = $this->build_component_instance(self::$tipo_period);
			$original_data = $component->get_data();

		// ADD DATA via set_data
			$add_data = [
				(object)[
					'id'		=> 1,
					'period'	=> (object)[
						'year'	=> 1,
						'month'	=> 0,
						'day'	=> 0
					]
				]
			];
			$component->set_data($add_data);
			$component->save();

		// UPDATE via update_data_value (same as JS change_handler does)
			$changed_data = (object)[
				'action'	=> 'update',
				'id'		=> 1,
				'value'		=> (object)[
					'id'		=> 1,
					'period'	=> (object)[
						'year'	=> 5,
						'month'	=> 10,
						'day'	=> 15
					]
				]
			];
			$result = $component->update_data_value($changed_data);
			$this->assertTrue(
				$result===true,
				'UPDATE: expected true on update_data_value'
			);

			$data = $component->get_data();
			$this->assertTrue(
				isset($data[0]->period),
				'UPDATE: expected period key to exist (not undefined)'
			);
			$this->assertFalse(
				isset($data[0]->{'undefined'}),
				'UPDATE: expected NO undefined key in data'
			);
			$this->assertTrue(
				$data[0]->period->year===5,
				'UPDATE: expected period year 5'
			);
			$this->assertTrue(
				$data[0]->period->month===10,
				'UPDATE: expected period month 10'
			);
			$this->assertTrue(
				$data[0]->period->day===15,
				'UPDATE: expected period day 15'
			);

		// REMOVE via update_data_value
			$remove_data = (object)[
				'action'	=> 'remove',
				'id'		=> 1
			];
			$result = $component->update_data_value($remove_data);
			$this->assertTrue(
				$result===true,
				'REMOVE: expected true on update_data_value remove'
			);

			$data = $component->get_data();
			$this->assertTrue(
				empty($data),
				'REMOVE: expected empty data after remove'
			);

		// RESTORE
			$component->set_data($original_data);
			$component->save();
	}//end test_lifecycle_update_data_value_period_mode



	/**
	* TEST_LIFECYCLE_INSERT_ACTION
	* Test insert action via update_data_value
	* @return void
	*/
	public function test_lifecycle_insert_action() {

		// CREATE
			$component = $this->build_component_instance(self::$tipo);
			$original_data = $component->get_data();

		// Ensure empty
			$component->set_data([]);
			$component->save();

		// INSERT via update_data_value
			$insert_data = (object)[
				'action'	=> 'insert',
				'id'		=> null,
				'value'		=> (object)[
					'start'	=> (object)[
						'year'	=> 2024,
						'month'	=> 6,
						'day'	=> 1
					]
				]
			];
			$result = $component->update_data_value($insert_data);
			$this->assertTrue(
				$result===true,
				'INSERT: expected true on update_data_value insert'
			);

			$data = $component->get_data();
			$this->assertTrue(
				count($data)===1,
				'INSERT: expected 1 element after insert'
			);
			$this->assertTrue(
				$data[0]->start->year===2024,
				'INSERT: expected year 2024'
			);

		// RESTORE
			$component->set_data($original_data);
			$component->save();
	}//end test_lifecycle_insert_action



	/**
	* TEST_LIFECYCLE_MULTI_VALUE
	* Test multiple entries (multi_value property)
	* @return void
	*/
	public function test_lifecycle_multi_value() {

		// CREATE
			$component = $this->build_component_instance(self::$tipo);
			$original_data = $component->get_data();

		// ADD multiple entries
			$add_data = [
				(object)[
					'id'	=> 1,
					'start'	=> (object)[
						'year'	=> 2020,
						'month'	=> 1,
						'day'	=> 1
					]
				],
				(object)[
					'id'	=> 2,
					'start'	=> (object)[
						'year'	=> 2021,
						'month'	=> 6,
						'day'	=> 15
					]
				]
			];
			$component->set_data($add_data);
			$component->save();

			$data = $component->get_data();
			$this->assertTrue(
				count($data)===2,
				'ADD: expected 2 elements after add'
			);
			$this->assertTrue(
				$data[0]->start->year===2020,
				'ADD: expected first entry year 2020'
			);
			$this->assertTrue(
				$data[1]->start->year===2021,
				'ADD: expected second entry year 2021'
			);

		// REMOVE first entry by id
			$remove_data = (object)[
				'action'	=> 'remove',
				'id'		=> 1
			];
			$result = $component->update_data_value($remove_data);
			$this->assertTrue(
				$result===true,
				'REMOVE: expected true on remove first entry'
			);

			$data = $component->get_data();
			$this->assertTrue(
				count($data)===1,
				'REMOVE: expected 1 element after removing first'
			);
			$this->assertTrue(
				$data[0]->start->year===2021,
				'REMOVE: expected remaining entry year 2021'
			);

		// RESTORE
			$component->set_data($original_data);
			$component->save();
	}//end test_lifecycle_multi_value



	/**
	* TEST_LIFECYCLE_SAVE_ADDS_TIME
	* Verify that save() automatically adds time property via add_time()
	* @return void
	*/
	public function test_lifecycle_save_adds_time() {

		// CREATE
			$component = $this->build_component_instance(self::$tipo);
			$original_data = $component->get_data();

		// ADD DATA without time property
			$add_data = [
				(object)[
					'id'	=> 1,
					'start'	=> (object)[
						'year'	=> 2023,
						'month'	=> 7,
						'day'	=> 15
					]
				]
			];
			$component->set_data($add_data);

			// Verify time is NOT set before save
			$data_before = $component->get_data();
			$this->assertFalse(
				isset($data_before[0]->start->time),
				'PRE-SAVE: time should NOT be set before save'
			);

			$component->save();

			// Verify time IS set after save
			$data_after = $component->get_data();
			$this->assertTrue(
				isset($data_after[0]->start->time),
				'POST-SAVE: time should be set after save (add_time)'
			);
			$this->assertTrue(
				gettype($data_after[0]->start->time)==='integer',
				'POST-SAVE: time should be integer'
			);

		// RESTORE
			$component->set_data($original_data);
			$component->save();
	}//end test_lifecycle_save_adds_time



	/**
	* TEST_LIFECYCLE_PERIOD_SAVE_ADDS_TIME
	* Verify that save() adds time property to period data via add_time()
	* @return void
	*/
	public function test_lifecycle_period_save_adds_time() {

		// CREATE
			$component = $this->build_component_instance(self::$tipo_period);
			$original_data = $component->get_data();

		// ADD DATA without time property
			$add_data = [
				(object)[
					'id'		=> 1,
					'period'	=> (object)[
						'year'	=> 2,
						'month'	=> 3,
						'day'	=> 5
					]
				]
			];
			$component->set_data($add_data);

			// Verify time is NOT set before save
			$data_before = $component->get_data();
			$this->assertFalse(
				isset($data_before[0]->period->time),
				'PRE-SAVE: period time should NOT be set before save'
			);

			$component->save();

			// Verify time IS set after save
			$data_after = $component->get_data();
			$this->assertTrue(
				isset($data_after[0]->period->time),
				'POST-SAVE: period time should be set after save (add_time)'
			);

		// RESTORE
			$component->set_data($original_data);
			$component->save();
	}//end test_lifecycle_period_save_adds_time



	/**
	* TEST_LIFECYCLE_DATA_ITEM_TO_VALUE_ALL_MODES
	* Verify data_item_to_value works for all date modes
	* @return void
	*/
	public function test_lifecycle_data_item_to_value_all_modes() {

		// date mode
			$data_item = (object)[
				'start' => (object)['year' => 2023, 'month' => 7, 'day' => 15]
			];
			$result = component_date::data_item_to_value($data_item, 'date');
			$this->assertTrue(
				gettype($result)==='string',
				'date: expected string result'
			);
			$this->assertTrue(
				strpos($result, '2023')!==false,
				'date: expected year 2023 in result'
			);

		// range mode
			$data_item = (object)[
				'start' => (object)['year' => 2020, 'month' => 1, 'day' => 1],
				'end'	=> (object)['year' => 2020, 'month' => 12, 'day' => 31]
			];
			$result = component_date::data_item_to_value($data_item, 'range');
			$this->assertTrue(
				strpos($result, '<>')!==false,
				'range: expected <> separator in result'
			);

		// period mode
			$data_item = (object)[
				'period' => (object)['year' => 2, 'month' => 3, 'day' => 5]
			];
			$result = component_date::data_item_to_value($data_item, 'period');
			$this->assertTrue(
				gettype($result)==='string',
				'period: expected string result'
			);
			$this->assertTrue(
				strpos($result, '2')!==false,
				'period: expected year 2 in result'
			);

		// time mode
			$data_item = (object)[
				'start' => (object)['hour' => 14, 'minute' => 30, 'second' => 0]
			];
			$result = component_date::data_item_to_value($data_item, 'time');
			$this->assertTrue(
				strpos($result, '14')!==false,
				'time: expected hour 14 in result'
			);
	}//end test_lifecycle_data_item_to_value_all_modes



}//end class component_date_test
