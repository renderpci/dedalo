<?php
declare(strict_types=1);
// PHPUnit classes
use PHPUnit\Framework\TestCase;
use PHPUnit\Framework\Attributes\TestDox;
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';



final class tool_import_dedalo_csv_Test extends TestCase {



	/**
	* GET_TEST_FILES_PATH
	* Source path of test files
	* @return string
	*/
	private function get_test_files_path() : string {

		return dirname(dirname(__FILE__)) . '/files/import_csv';
	}//end get_test_files_path



	/**
	* GET_TEST_FILE_name
	* @return array
	*/
	private function get_test_file_names() : array {

		return [
			'export_test_unit-test3.csv',
			'export_test_unit-simple-test3.csv'
		];
	}//end get_test_file_name



	/**
	* GET_IMPORT_FILES_OPTIONS
	* @return object $options
	*/
	private function get_import_files_options($file_name) : object {

		$options = json_handler::decode('
		{
	        "files": [
	            {
	                "file": "'.$file_name.'",
	                "section_tipo": "test3",
	                "bulk_process_label": "import test",
	                "ar_columns_map": [
	                    {
	                        "tipo": "section_id",
	                        "label": "",
	                        "model": "section_id",
	                        "column_name": "section_id",
	                        "checked": true,
	                        "map_to": "test102"
	                    },
	                    {
	                        "tipo": "test26",
	                        "label": "<mark>3d</mark>",
	                        "model": "component_3d",
	                        "checked": true,
	                        "map_to": "test26",
	                        "column_name": "test26"
	                    },
	                    {
	                        "tipo": "test94",
	                        "label": "<mark>av</mark>",
	                        "model": "component_av",
	                        "column_name": "test94",
	                        "checked": true,
	                        "map_to": "test94"
	                    },
	                    {
	                        "tipo": "test88",
	                        "label": "<mark>check_box</mark>",
	                        "model": "component_check_box",
	                        "column_name": "test88",
	                        "checked": true,
	                        "map_to": "test88"
	                    },
	                    {
	                        "tipo": "test145",
	                        "label": "<mark>date</mark>",
	                        "model": "component_date",
	                        "column_name": "test145",
	                        "checked": true,
	                        "map_to": "test145"
	                    },
	                    {
	                        "tipo": "test208",
	                        "label": "<mark>email</mark>",
	                        "model": "component_email",
	                        "column_name": "test208",
	                        "checked": true,
	                        "map_to": "test208"
	                    },
	                    {
	                        "tipo": "test101",
	                        "label": "<mark>filter</mark>",
	                        "model": "component_filter",
	                        "column_name": "test101",
	                        "checked": true,
	                        "map_to": "test101"
	                    },
	                    {
	                        "tipo": "test70",
	                        "label": "<mark>filter_master</mark>",
	                        "model": "component_filter_master",
	                        "column_name": "test70",
	                        "checked": true,
	                        "map_to": "test70"
	                    },
	                    {
	                        "tipo": "test69",
	                        "label": "<mark>filter_records</mark>",
	                        "model": "component_filter_records",
	                        "column_name": "test69",
	                        "checked": true,
	                        "map_to": "test69"
	                    },
	                    {
	                        "tipo": "test100",
	                        "label": "<mark>geolocation</mark>",
	                        "model": "component_geolocation",
	                        "column_name": "test100",
	                        "checked": true,
	                        "map_to": "test100"
	                    },
	                    {
	                        "tipo": "test99",
	                        "label": "<mark>image</mark>",
	                        "model": "component_image",
	                        "column_name": "test99",
	                        "checked": true,
	                        "map_to": "test99"
	                    },
	                    {
	                        "tipo": "test52",
	                        "label": "<mark>input_text</mark>",
	                        "model": "component_input_text",
	                        "column_name": "test52",
	                        "checked": true,
	                        "map_to": "test52"
	                    },
	                    {
	                        "tipo": "test68",
	                        "label": "<mark>inverse</mark>",
	                        "model": "component_inverse",
	                        "column_name": "test68",
	                        "checked": true,
	                        "map_to": "test68"
	                    },
	                    {
	                        "tipo": "test140",
	                        "label": "<mark>iri</mark>",
	                        "model": "component_iri",
	                        "column_name": "test140",
	                        "checked": true,
	                        "map_to": "test140"
	                    },
	                    {
	                        "tipo": "test18",
	                        "label": "<mark>json</mark>",
	                        "model": "component_json",
	                        "column_name": "test18",
	                        "checked": true,
	                        "map_to": "test18"
	                    },
	                    {
	                        "tipo": "test211",
	                        "label": "<mark>number</mark>",
	                        "model": "component_number",
	                        "column_name": "test211",
	                        "checked": true,
	                        "map_to": "test211",
	                        "decimal": "."
	                    },
	                    {
	                        "tipo": "test85",
	                        "label": "<mark>pdf</mark>",
	                        "model": "component_pdf",
	                        "column_name": "test85",
	                        "checked": true,
	                        "map_to": "test85"
	                    },
	                    {
	                        "tipo": "test80",
	                        "label": "<mark>portal</mark>",
	                        "model": "component_portal",
	                        "column_name": "test80",
	                        "checked": true,
	                        "map_to": "test80"
	                    },
	                    {
	                        "tipo": "test92",
	                        "label": "<mark>publication</mark>",
	                        "model": "component_publication",
	                        "column_name": "test92",
	                        "checked": true,
	                        "map_to": "test92"
	                    },
	                    {
	                        "tipo": "test87",
	                        "label": "<mark>radio_button</mark>",
	                        "model": "component_radio_button",
	                        "column_name": "test87",
	                        "checked": true,
	                        "map_to": "test87"
	                    },
	                    {
	                        "tipo": "test201",
	                        "label": "<mark>relation_children</mark>",
	                        "model": "component_relation_children",
	                        "column_name": "test201",
	                        "checked": true,
	                        "map_to": "test201"
	                    },
	                    {
	                        "tipo": "test25",
	                        "label": "<mark>relation_index</mark>",
	                        "model": "component_relation_index",
	                        "column_name": "test25",
	                        "checked": true,
	                        "map_to": "test25"
	                    },
	                    {
	                        "tipo": "test169",
	                        "label": "<mark>relation_model</mark>",
	                        "model": "component_relation_model",
	                        "column_name": "test169",
	                        "checked": true,
	                        "map_to": "test169"
	                    },
	                    {
	                        "tipo": "test71",
	                        "label": "<mark>relation_parent</mark>",
	                        "model": "component_relation_parent",
	                        "column_name": "test71",
	                        "checked": true,
	                        "map_to": "test71"
	                    },
	                    {
	                        "tipo": "test54",
	                        "label": "<mark>relation_related</mark>",
	                        "model": "component_relation_related",
	                        "column_name": "test54",
	                        "checked": true,
	                        "map_to": "test54"
	                    },
	                    {
	                        "tipo": "test157",
	                        "label": "<mark>security_access</mark>",
	                        "model": "component_security_access",
	                        "column_name": "test157",
	                        "checked": true,
	                        "map_to": "test157"
	                    },
	                    {
	                        "tipo": "test91",
	                        "label": "<mark>select</mark>",
	                        "model": "component_select",
	                        "column_name": "test91",
	                        "checked": true,
	                        "map_to": "test91"
	                    },
	                    {
	                        "tipo": "test89",
	                        "label": "<mark>select_lang</mark>",
	                        "model": "component_select_lang",
	                        "column_name": "test89",
	                        "checked": true,
	                        "map_to": "test89"
	                    },
	                    {
	                        "tipo": "test177",
	                        "label": "<mark>svg</mark>",
	                        "model": "component_svg",
	                        "column_name": "test177",
	                        "checked": true,
	                        "map_to": "test177"
	                    },
	                    {
	                        "tipo": "test17",
	                        "label": "<mark>text_area</mark>",
	                        "model": "component_text_area",
	                        "column_name": "test17",
	                        "checked": true,
	                        "map_to": "test17"
	                    },
	                    {
	                        "tipo": "dd200",
	                        "label": "Created by user",
	                        "model": "component_select",
	                        "column_name": "dd200",
	                        "checked": true,
	                        "map_to": "dd200"
	                    },
	                    {
	                        "tipo": "dd199",
	                        "label": "Creation date",
	                        "model": "component_date",
	                        "column_name": "dd199",
	                        "checked": true,
	                        "map_to": "dd199"
	                    },
	                    {
	                        "tipo": "dd197",
	                        "label": "Modified by user",
	                        "model": "component_select",
	                        "column_name": "dd197",
	                        "checked": true,
	                        "map_to": "dd197"
	                    },
	                    {
	                        "tipo": "dd201",
	                        "label": "Modification date",
	                        "model": "component_date",
	                        "column_name": "dd201",
	                        "checked": true,
	                        "map_to": "dd201"
	                    },
	                    {
	                        "tipo": "dd271",
	                        "label": "First publication",
	                        "model": "component_date",
	                        "column_name": "dd271",
	                        "checked": true,
	                        "map_to": "dd271"
	                    },
	                    {
	                        "tipo": "dd1223",
	                        "label": "Last publication",
	                        "model": "component_date",
	                        "column_name": "dd1223",
	                        "checked": true,
	                        "map_to": "dd1223"
	                    },
	                    {
	                        "tipo": "dd1224",
	                        "label": "First publication user",
	                        "model": "component_select",
	                        "column_name": "dd1224",
	                        "checked": true,
	                        "map_to": "dd1224"
	                    },
	                    {
	                        "tipo": "dd1225",
	                        "label": "Last publication user",
	                        "model": "component_select",
	                        "column_name": "dd1225",
	                        "checked": true,
	                        "map_to": "dd1225"
	                    },
	                    {
	                        "tipo": "dd1596",
	                        "label": "Relations",
	                        "model": "component_inverse",
	                        "column_name": "dd1596",
	                        "checked": true,
	                        "map_to": "dd1596"
	                    }
	                ]
	            }
	        ],
	        "time_machine_save": false
	    }
		');


		return $options;
	}//end get_import_files_options



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
	* TEST_get_files_path
	* @return void
	*/
	public function test_get_files_path() {

		$result = tool_import_dedalo_csv::get_files_path();

		$this->assertTrue(
			gettype($result)==='string',
			'expected gettype result is string'
				.' and is : '.gettype($result)
		);
	}//end test_get_files_path



	/**
	* TEST_copy_test_csv_file
	* @return void
	*/
	public function test_copy_test_csv_file() {

		$file_names = $this->get_test_file_names();

		foreach ($file_names as $file_name) {

			// test file
				$source_test_file = $this->get_test_files_path() .'/'. $file_name;

				$result = file_exists($source_test_file);
				$this->assertTrue(
					$result===true,
					'expected true'
						.' and result is : '.to_string($result)
				);

			// target file
				$target_dir		= tool_import_dedalo_csv::get_files_path();
				$target_file	= $target_dir .'/'. $file_name;

			// target directory
				if (!is_dir($target_dir)) {
					if( !mkdir($target_dir, 0750, true) ) {
						debug_log(__METHOD__
							. " Error. Unable to create directory " . PHP_EOL
							. ' target_dir: ' . to_string($target_dir)
							, logger::ERROR
						);
					}
				}

				$copy = copy($source_test_file, $target_file);
				if (!$copy) {
					debug_log(__METHOD__
						." Error copying file ". PHP_EOL
						.' source_test_file: ' . $source_test_file . PHP_EOL
						.' target_file: ' . $target_file . PHP_EOL
						.' sourcefile_exists: ' . to_string( file_exists($source_test_file) )
						, logger::ERROR
					);
				}

				$result = file_exists($target_file);
				$this->assertTrue(
					$result===true,
					'expected true'
						.' and result is : '.to_string($result)
				);
		}
	}//end test_copy_test_csv_file



	/**
	* TEST_get_csv_files
	* @return void
	*/
	public function test_get_csv_files() {

		$response = tool_import_dedalo_csv::get_csv_files((object)[
			// 'files_path' => $this->get_test_files_path()
		]);

		$this->assertTrue(
			gettype($response)==='object',
			'expected gettype result is object'
				.' and is : '.gettype($response)
		);
		$this->assertTrue(
			gettype($response->result)==='array',
			'expected gettype result is array'
				.' and is : '.gettype($response->result)
		);
		$this->assertTrue(
			gettype($response->msg)==='string',
			'expected gettype msg is string'
				.' and is : '.gettype($response->msg)
		);
		$this->assertTrue(
			gettype($response->error)==='string' || gettype($response->error)==='NULL',
			'expected gettype error is string|null'
				.' and is : '.gettype($response->error)
		);
	}//end test_get_csv_files



	/**
	* TEST_import_files
	* @return void
	*/
	public function test_import_files() {

		$file_names = $this->get_test_file_names();

		foreach ($file_names as $file_name) {

			$options = $this->get_import_files_options(
				$file_name
			);

			$response = tool_import_dedalo_csv::import_files(
				$options
			);

			$this->assertTrue(
				gettype($response)==='object',
				'expected gettype result is object'
					.' and is : '.gettype($response)
			);
			$this->assertTrue(
				gettype($response->result)==='array',
				'expected gettype result is array'
					.' and is : '.gettype($response->result)
			);
			$this->assertTrue(
				gettype($response->msg)==='string',
				'expected gettype msg is string'
					.' and is : '.gettype($response->msg)
			);

			foreach ($response->result as $value) {

				$this->assertTrue(
					gettype($value->result)==='boolean',
					'expected gettype result is boolean'
						.' and is : '.gettype($value->result)
				);
				$this->assertTrue(
					$value->result===true,
					'expected result is true'
						.' and is : '.to_string($value->result)
				);
				$this->assertTrue(
					$value->updated_rows[0]===1,
					'expected updated_rows[0] is 1'
						.' and is : '.to_string($value->updated_rows[0])
				);
				$this->assertTrue(
					gettype($value->errors)==='array',
					'expected gettype errors is array'
						.' and is : '.gettype($value->errors)
				);
			}
		}//end foreach
	}//end test_import_files



	/**
	* TEST_delete_csv_file
	* 	Execute this function at end to clean temporal file (!)
	* @return void
	*/
	public function test_delete_csv_file() {

		$file_names = $this->get_test_file_names();

		foreach ($file_names as $file_name) {

			$file_full_path	= tool_import_dedalo_csv::get_files_path() .'/'. $file_name;

			$response = tool_import_dedalo_csv::delete_csv_file((object)[
				// 'files_path'	=> $files_path,
				'file_name'		=> $file_name
			]);

			$this->assertTrue(
				gettype($response)==='object',
				'expected gettype result is object'
					.' and is : '.gettype($response)
			);
			$this->assertTrue(
				gettype($response->result)==='boolean',
				'expected gettype result is boolean'
					.' and is : '.gettype($response->result)
			);
			$this->assertTrue(
				gettype($response->msg)==='string',
				'expected gettype msg is string'
					.' and is : '.gettype($response->msg)
			);

			$result = file_exists($file_full_path);
			$this->assertTrue(
				$result===false,
				'expected false'
					.' and is : '. to_string($result)
			);
		}//end foreach
	}//end test_delete_csv_file



}//end class tool_import_dedalo_csv_Test
