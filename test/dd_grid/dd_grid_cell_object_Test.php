<?php declare(strict_types=1);
// PHPUnit classes
use PHPUnit\Framework\TestCase;
use PHPUnit\Framework\Attributes\TestDox;
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';



final class dd_grid_cell_object_test extends TestCase {



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



	/////////// ⬇︎ test start ⬇︎ ////////////////



	/**
	* TEST___construct
	* @return void
	*/
	public function test___construct() {

		$options = null;

		$result = new dd_grid_cell_object(
			$options
		);

		$this->assertTrue(
			gettype($result)==='object' ,
			'expected object' . PHP_EOL
				. gettype($result)
		);
	}//end test___construct



	/**
	* TEST_resolve_value
	* @return void
	*/
	public function test_resolve_value() {

		$dd_grid_base = json_decode('
		{
		    "id": null,
		    "class_list": null,
		    "type": "column",
		    "label": "<mark>input_text</mark>",
		    "row_count": null,
		    "column_count": null,
		    "column_labels": null,
		    "fields_separator": null,
		    "records_separator": " | ",
		    "cell_type": "text",
		    "action": null,
		    "value": [
		        "Record one"
		    ],
		    "fallback_value": [
		        "Record one"
		    ],
		    "data": null,
		    "render_label": null,
		    "column": null,
		    "ar_columns_obj": [
		        {
		            "id": "test3_test52"
		        }
		    ]
		}
		');
		$dd_grid = new dd_grid_cell_object($dd_grid_base);

		$result = dd_grid_cell_object::resolve_value(
			$dd_grid
		);

		$this->assertTrue(
			gettype($result)==='string' ,
			'expected string' . PHP_EOL
				. gettype($result)
		);
	}//end test_resolve_value



}//end class dd_grid_cell_object
