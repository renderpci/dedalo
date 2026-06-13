<?php declare(strict_types=1);
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';



final class tool_import_dedalo_csv_test extends BaseTestCase {


	protected function setUp(): void   {
		parent::setUp();
		// $this->markTestSkipped(
		// 	'Disabled !'
		// );
	}



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

		$files_path = DEDALO_ROOT_PATH . '/test/server/files/import_csv';

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
	        "time_machine_save": false,
			"files_path": "'.$files_path.'"
	    }
		');


		return $options;
	}//end get_import_files_options



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
			gettype($response->errors)==='array' || gettype($response->errors)==='NULL',
			'expected gettype error is array|null'
				.' and is : '.gettype($response->errors)
		);
	}//end test_get_csv_files



	/**
	* TEST_import_files
	* @return void
	*/
	public function test_import_files() {

		$this->user_login();

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
					'expected gettype value->result is boolean'
						.' and is : '.gettype($value->result)
				);
				$this->assertTrue(
					$value->result===true,
					'expected value->result is true'
						.' and is: '.json_encode($value->result) . PHP_EOL
						. ' value: ' . json_encode($value, JSON_PRETTY_PRINT)
				);
				$this->assertTrue(
					$value->updated_rows[0]===1,
					'expected value->updated_rows[0] is 1'
						.' and is : '.json_encode($value->updated_rows[0])
				);
				$this->assertTrue(
					gettype($value->errors)==='array',
					'expected gettype value->errors is array'
						.' and is : '.gettype($value->errors)
				);
			}
		}//end foreach
	}//end test_import_files



	/**
	* TEST_import_files_v7_formats
	* End to end import exercising the v7 input formats:
	* dedalo_data wrapper, flat date, multiple flat emails, flat geolocation
	* coordinates, arbitrary JSON value and select_lang lang code.
	* Self-contained: copies its own fixture, imports it and deletes it.
	* @return void
	*/
	public function test_import_files_v7_formats() {

		$this->user_login();

		$file_name = 'import_v7_formats-test3.csv';

		// copy the fixture to the user CSV import directory
			$source_file = $this->get_test_files_path() . '/' . $file_name;
			$target_dir  = tool_import_dedalo_csv::get_files_path();
			$target_file = $target_dir . '/' . $file_name;
			$this->assertTrue(
				copy($source_file, $target_file),
				'expected fixture file copied to: '.$target_file
			);

		// import options
		// note that 'tipo' must match the raw CSV header name (head comparison),
		// including suffixed headers as 'test145_dmy'; 'map_to' is the component tipo
			$build_column = function(string $header, string $model, string $map_to) {
				return (object)[
					'tipo'			=> $header,
					'label'			=> $map_to,
					'model'			=> $model,
					'column_name'	=> $header,
					'checked'		=> true,
					'map_to'		=> $map_to
				];
			};
			$ar_columns_map = [
				(object)[
					'tipo'			=> 'section_id',
					'label'			=> '',
					'model'			=> 'section_id',
					'column_name'	=> 'section_id',
					'checked'		=> true,
					'map_to'		=> 'test102'
				],
				$build_column('test52',      'component_input_text',  'test52'),
				$build_column('test145_dmy', 'component_date',        'test145'),
				$build_column('test208',     'component_email',       'test208'),
				$build_column('test100',     'component_geolocation', 'test100'),
				$build_column('test18',      'component_json',        'test18'),
				$build_column('test89',      'component_select_lang', 'test89')
			];
			$options = (object)[
				'files' => [(object)[
					'file'					=> $file_name,
					'section_tipo'			=> 'test3',
					'bulk_process_label'	=> 'import v7 formats test',
					'ar_columns_map'		=> $ar_columns_map
				]],
				'time_machine_save' => false
			];

		// import
			$response = tool_import_dedalo_csv::import_files($options);

			$this->assertIsObject($response);
			$this->assertIsArray($response->result);

			$file_result = $response->result[0];
			$this->assertTrue(
				$file_result->result===true,
				'expected file import result true: ' . json_encode($file_result, JSON_PRETTY_PRINT)
			);
			$this->assertTrue(
				empty($file_result->failed_rows),
				'expected empty failed_rows: ' . json_encode($file_result->failed_rows ?? null, JSON_PRETTY_PRINT)
			);

		// verify saved data per component
			$get_component_data = function(string $model, string $tipo, string $lang) {
				$component = component_common::get_instance(
					$model,
					$tipo,
					1,
					'list',
					$lang,
					'test3',
					false // cache
				);
				return $component->get_data();
			};

			// input_text. Wrapped dedalo_data flat multi-language array (raw export shape):
			// every item carries its own lang and all the translations must be preserved
			$data = $get_component_data('component_input_text', 'test52', DEDALO_DATA_LANG);
			$lang_values = [];
			foreach ($data ?? [] as $item) {
				$lang_values[$item->lang ?? ''][] = $item->value;
			}
			$this->assertContains('WrappedHello', $lang_values['lg-eng'] ?? [], 'expected lg-eng wrapped value saved');
			$this->assertContains('HolaEnvuelto', $lang_values['lg-spa'] ?? [], 'expected lg-spa wrapped value saved');

			// date. Flat dmy string
			$data = $get_component_data('component_date', 'test145', DEDALO_DATA_NOLAN);
			$this->assertEquals(2023, $data[0]->start->year ?? null, 'expected date year saved');
			$this->assertEquals(10,   $data[0]->start->month ?? null, 'expected date month saved');
			$this->assertEquals(26,   $data[0]->start->day ?? null, 'expected date day saved');

			// email. Multiple flat values with ' | ' separator
			$data = $get_component_data('component_email', 'test208', DEDALO_DATA_NOLAN);
			$values = array_map(function($item){ return $item->value; }, $data ?? []);
			$this->assertContains('a@b.com', $values, 'expected first email saved');
			$this->assertContains('c@d.com', $values, 'expected second email saved');

			// geolocation. Flat 'lat, lon, zoom' string
			$data = $get_component_data('component_geolocation', 'test100', DEDALO_DATA_NOLAN);
			$this->assertEquals(39.4625, $data[0]->lat ?? null, 'expected geolocation lat saved');
			$this->assertEquals(-0.3762, $data[0]->lon ?? null, 'expected geolocation lon saved');
			$this->assertEquals(15, $data[0]->zoom ?? null, 'expected geolocation zoom saved');

			// json. Arbitrary JSON value goes entirely inside 'value'
			$data = $get_component_data('component_json', 'test18', DEDALO_DATA_NOLAN);
			$this->assertEquals(1, $data[0]->value->config->a ?? null, 'expected json value saved');

			// select_lang. Lang code resolved to locator (when languages section is available)
			if (lang::get_section_id_from_code('lg-spa')!==null) {
				$data = $get_component_data('component_select_lang', 'test89', DEDALO_DATA_NOLAN);
				$this->assertEquals(
					DEDALO_LANGS_SECTION_TIPO,
					$data[0]->section_tipo ?? null,
					'expected select_lang locator saved'
				);
			}

		// clean. Delete the fixture from the user CSV import directory
			$delete_response = tool_import_dedalo_csv::delete_csv_file((object)[
				'file_name' => $file_name
			]);
			$this->assertTrue(
				$delete_response->result!==false,
				'expected fixture file deleted'
			);
	}//end test_import_files_v7_formats



	/**
	* BUILD_IMPORT_COLUMNS_MAP
	* Helper. Builds the ar_columns_map for a simple header list where every
	* header name matches its component tipo (plus the mandatory section_id column)
	* @param array $ar_components as [tipo => model]
	* @return array $ar_columns_map
	*/
	private function build_import_columns_map(array $ar_components) : array {

		$ar_columns_map = [
			(object)[
				'tipo'			=> 'section_id',
				'label'			=> '',
				'model'			=> 'section_id',
				'column_name'	=> 'section_id',
				'checked'		=> true,
				'map_to'		=> 'test102'
			]
		];
		foreach ($ar_components as $tipo => $model) {
			$ar_columns_map[] = (object)[
				'tipo'			=> $tipo,
				'label'			=> $tipo,
				'model'			=> $model,
				'column_name'	=> $tipo,
				'checked'		=> true,
				'map_to'		=> $tipo
			];
		}

		return $ar_columns_map;
	}//end build_import_columns_map



	/**
	* CANONICALIZE_DATA
	* Helper. Converts a dato to a normalized array form with recursively sorted
	* object keys, so datos can be compared ignoring property order.
	* The data is JSON round-tripped first to apply the same serialization used
	* by the DB storage (e.g. dd_date::jsonSerialize), because in-memory datos
	* can contain live class instances as dd_date
	* @param mixed $data
	* @return mixed
	*/
	private function canonicalize_data( $data ) {

		// serialize as the DB storage does (resolves JsonSerializable instances)
		$data = json_decode( json_encode($data) );

		$sort_keys = null;
		$sort_keys = function($data) use (&$sort_keys) {
			if (is_object($data)) {
				$vars = (array)$data;
				ksort($vars);
				$result = [];
				foreach ($vars as $k => $v) {
					$result[$k] = $sort_keys($v);
				}
				return $result;
			}
			if (is_array($data)) {
				return array_map($sort_keys, $data);
			}
			return $data;
		};

		return $sort_keys($data);
	}//end canonicalize_data



	/**
	* TEST_import_files_raw_export_round_trip
	* Critical workflow: data exported in 'dedalo_raw' format (dedalo_data wrapper,
	* produced by component_common::get_raw_value) must re-import producing EXACTLY
	* the same stored datos. Builds a CSV from the real raw export values of record 1
	* and verifies every component dato is unchanged after the import.
	* @return void
	*/
	public function test_import_files_raw_export_round_trip() {

		$this->user_login();

		$section_tipo	= 'test3';
		$section_id		= 1;
		$file_name		= 'import_round_trip-test3.csv';

		$ar_test_components = [
			'test52'  => 'component_input_text',
			'test145' => 'component_date',
			'test208' => 'component_email',
			'test100' => 'component_geolocation',
			'test18'  => 'component_json',
			'test89'  => 'component_select_lang',
			'test88'  => 'component_check_box'
		];

		// snapshot current datos and build the CSV cells from the REAL
		// raw export values (get_raw_value is the 'dedalo_raw' chokepoint)
			$snapshots	= [];
			$header		= ['section_id'];
			$cells		= [(string)$section_id];
			foreach ($ar_test_components as $tipo => $model) {

				$component = component_common::get_instance(
					$model,
					$tipo,
					$section_id,
					'list',
					DEDALO_DATA_LANG,
					$section_tipo,
					false
				);
				$snapshots[$tipo] = json_encode( $this->canonicalize_data($component->get_data()) );

				$raw_value	= $component->get_raw_value();
				$cell_data	= $raw_value->value; // ['dedalo_data' => dato] | null
				$cell_string = is_null($cell_data)
					? ''
					: json_encode($cell_data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

				$header[]	= $tipo;
				$cells[]	= $cell_string;
			}

		// build the CSV file (delimiter ';', RFC 4180 quoting)
			$quote = function(string $v) : string {
				return (strpos($v, ';')!==false || strpos($v, '"')!==false || strpos($v, "\n")!==false)
					? '"'.str_replace('"', '""', $v).'"'
					: $v;
			};
			$csv_content = implode(';', array_map($quote, $header)) . "\n"
						 . implode(';', array_map($quote, $cells))  . "\n";

			$target_file = tool_import_dedalo_csv::get_files_path() . '/' . $file_name;
			$this->assertNotFalse(
				file_put_contents($target_file, $csv_content),
				'expected round trip CSV file written'
			);

		// import
			$options = (object)[
				'files' => [(object)[
					'file'					=> $file_name,
					'section_tipo'			=> $section_tipo,
					'bulk_process_label'	=> 'import raw export round trip test',
					'ar_columns_map'		=> $this->build_import_columns_map($ar_test_components)
				]],
				'time_machine_save' => false
			];
			$response = tool_import_dedalo_csv::import_files($options);

			$file_result = $response->result[0] ?? null;
			$this->assertTrue(
				($file_result->result ?? null)===true,
				'expected file import result true: ' . json_encode($file_result, JSON_PRETTY_PRINT)
			);
			$this->assertTrue(
				empty($file_result->failed_rows),
				'expected empty failed_rows: ' . json_encode($file_result->failed_rows ?? null, JSON_PRETTY_PRINT)
			);

		// verify every dato is EXACTLY the same as before the round trip
			foreach ($ar_test_components as $tipo => $model) {

				$component = component_common::get_instance(
					$model,
					$tipo,
					$section_id,
					'list',
					DEDALO_DATA_LANG,
					$section_tipo,
					false
				);
				$this->assertEquals(
					$snapshots[$tipo],
					json_encode( $this->canonicalize_data($component->get_data()) ),
					"round trip dato changed for $tipo ($model)"
				);
			}

		// clean
			tool_import_dedalo_csv::delete_csv_file((object)[
				'file_name' => $file_name
			]);
	}//end test_import_files_raw_export_round_trip



	/**
	* TEST_import_files_lang_keyed_object
	* End to end import of the multi-language lang keyed object format:
	* {"lg-eng":"...","lg-spa":"..."} saved per lang via set_data_lang
	* @return void
	*/
	public function test_import_files_lang_keyed_object() {

		$this->user_login();

		$file_name = 'import_lang_keyed-test3.csv';

		// CSV with a lang keyed object cell for component_input_text test52
			$csv_content = 'section_id;test52' . "\n"
				. '1;"{""lg-eng"":""KeyedHello"",""lg-spa"":""HolaClave""}"' . "\n";

			$target_file = tool_import_dedalo_csv::get_files_path() . '/' . $file_name;
			$this->assertNotFalse(
				file_put_contents($target_file, $csv_content),
				'expected lang keyed CSV file written'
			);

		// import
			$options = (object)[
				'files' => [(object)[
					'file'					=> $file_name,
					'section_tipo'			=> 'test3',
					'bulk_process_label'	=> 'import lang keyed object test',
					'ar_columns_map'		=> $this->build_import_columns_map([
						'test52' => 'component_input_text'
					])
				]],
				'time_machine_save' => false
			];
			$response = tool_import_dedalo_csv::import_files($options);

			$file_result = $response->result[0] ?? null;
			$this->assertTrue(
				($file_result->result ?? null)===true,
				'expected file import result true: ' . json_encode($file_result, JSON_PRETTY_PRINT)
			);
			$this->assertTrue(
				empty($file_result->failed_rows),
				'expected empty failed_rows: ' . json_encode($file_result->failed_rows ?? null, JSON_PRETTY_PRINT)
			);

		// verify both langs saved
			$component = component_common::get_instance(
				'component_input_text',
				'test52',
				1,
				'list',
				DEDALO_DATA_LANG,
				'test3',
				false
			);
			$data = $component->get_data();
			$lang_values = [];
			foreach ($data ?? [] as $item) {
				$lang_values[$item->lang ?? ''][] = $item->value;
			}
			$this->assertContains('KeyedHello', $lang_values['lg-eng'] ?? [], 'expected lg-eng keyed value saved');
			$this->assertContains('HolaClave', $lang_values['lg-spa'] ?? [], 'expected lg-spa keyed value saved');

		// clean
			tool_import_dedalo_csv::delete_csv_file((object)[
				'file_name' => $file_name
			]);
	}//end test_import_files_lang_keyed_object



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



	/**
	* TEST_import_dedalo_csv_file_empty_csv_data
	* Test that empty CSV data returns error
	* @return void
	*/
	public function test_import_dedalo_csv_file_empty_csv_data() {

		$this->user_login();

		$options = new stdClass();
			$options->section_tipo		= 'test3';
			$options->ar_csv_data		= [];
			$options->time_machine_save	= false;
			$options->ar_columns_map	= [];
			$options->current_file		= 'test_empty.csv';
			$options->bulk_process_label	= 'test empty csv';

		$response = tool_import_dedalo_csv::import_dedalo_csv_file($options);

		$this->assertTrue(
			gettype($response)==='object',
			'expected gettype result is object'
				.' and is : '.gettype($response)
		);
		$this->assertTrue(
			$response->result===false,
			'expected result is false'
				.' and is : '.json_encode($response->result)
		);
		$this->assertTrue(
			gettype($response->msg)==='string',
			'expected gettype msg is string'
				.' and is : '.gettype($response->msg)
		);
		$this->assertTrue(
			gettype($response->errors)==='array',
			'expected gettype errors is array'
				.' and is : '.gettype($response->errors)
		);
	}//end test_import_dedalo_csv_file_empty_csv_data



	/**
	* TEST_import_dedalo_csv_file_missing_section_id
	* Test that CSV without section_id column fails
	* @return void
	*/
	public function test_import_dedalo_csv_file_missing_section_id() {

		$this->user_login();

		// CSV data without section_id column
		$ar_csv_data = [
			['test52', 'test17'],
			['test value', 'text area value']
		];

		$ar_columns_map = [
			(object)[
				'tipo' => 'test52',
				'label' => 'input_text',
				'model' => 'component_input_text',
				'column_name' => 'test52',
				'checked' => true,
				'map_to' => 'test52'
			],
			(object)[
				'tipo' => 'test17',
				'label' => 'text_area',
				'model' => 'component_text_area',
				'column_name' => 'test17',
				'checked' => true,
				'map_to' => 'test17'
			]
		];

		$options = new stdClass();
			$options->section_tipo		= 'test3';
			$options->ar_csv_data		= $ar_csv_data;
			$options->time_machine_save	= false;
			$options->ar_columns_map	= $ar_columns_map;
			$options->current_file		= 'test_no_section_id.csv';
			$options->bulk_process_label	= 'test missing section_id';

		$response = tool_import_dedalo_csv::import_dedalo_csv_file($options);

		$this->assertTrue(
			gettype($response)==='object',
			'expected gettype result is object'
				.' and is : '.gettype($response)
		);
		$this->assertTrue(
			$response->result===false,
			'expected result is false'
				.' and is : '.json_encode($response->result)
		);
		$this->assertTrue(
			strpos($response->msg, 'component_section_id')!==false,
			'expected msg to mention component_section_id error'
				.' and msg is : '.$response->msg
		);
	}//end test_import_dedalo_csv_file_missing_section_id



	/**
	* TEST_import_files_nonexistent_file
	* Test importing a non-existent file
	* @return void
	*/
	public function test_import_files_nonexistent_file() {

		$this->user_login();

		$options = new stdClass();
			$options->files = [
				(object)[
					'file' => 'nonexistent_file_xyz.csv',
					'section_tipo' => 'test3',
					'bulk_process_label' => 'test nonexistent',
					'ar_columns_map' => []
				]
			];
			$options->time_machine_save = false;

		$response = tool_import_dedalo_csv::import_files($options);

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
		// Check that the file was not found
		foreach ($response->result as $value) {
			$this->assertTrue(
				$value->result===false,
				'expected value->result is false for nonexistent file'
					.' and is: '.json_encode($value->result)
			);
			$this->assertTrue(
				strpos($value->msg, 'not found')!==false,
				'expected msg to mention file not found'
					.' and msg is: '.$value->msg
			);
		}
	}//end test_import_files_nonexistent_file



	/**
	* TEST_import_files_empty_files_list
	* Test importing with empty files list
	* @return void
	*/
	public function test_import_files_empty_files_list() {

		$this->user_login();

		$options = new stdClass();
			$options->files = [];
			$options->time_machine_save = false;

		$response = tool_import_dedalo_csv::import_files($options);

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
			empty($response->result),
			'expected empty result array'
				.' and is : '.json_encode($response->result)
		);
		$this->assertTrue(
			$response->msg==='Request done',
			'expected msg is Request done'
				.' and is : '.$response->msg
		);
	}//end test_import_files_empty_files_list



	/**
	* TEST_verify_csv_map_invalid_component_tipo
	* Test verify_csv_map with invalid component tipo
	* @return void
	*/
	public function test_verify_csv_map_invalid_component_tipo() {

		$this->user_login();

		// CSV map with non-existent component tipo
		$csv_map = [
			(object)[
				'tipo' => 'section_id',
				'label' => 'Section ID',
				'model' => 'section_id',
				'column_name' => 'section_id',
				'checked' => true,
				'map_to' => 'section_id'
			],
			(object)[
				'tipo' => 'xyz999',
				'label' => 'Invalid Component',
				'model' => 'component_input_text',
				'column_name' => 'xyz999',
				'checked' => true,
				'map_to' => 'xyz999' // Non-existent tipo
			]
		];

		$response = tool_import_dedalo_csv::verify_csv_map($csv_map, 'test3');

		$this->assertTrue(
			gettype($response)==='object',
			'expected gettype result is object'
				.' and is : '.gettype($response)
		);
		$this->assertTrue(
			$response->result===false,
			'expected result is false for invalid component'
				.' and is : '.json_encode($response->result)
		);
		$this->assertTrue(
			strpos($response->msg, 'not found')!==false || strpos($response->msg, 'xyz999')!==false,
			'expected msg to mention invalid component'
				.' and msg is : '.$response->msg
		);
	}//end test_verify_csv_map_invalid_component_tipo



	/**
	* TEST_verify_csv_map_valid_mapping
	* Test verify_csv_map with valid component tipos
	* @return void
	*/
	public function test_verify_csv_map_valid_mapping() {

		$this->user_login();

		// CSV map with valid component tipos from test3 section
		$csv_map = [
			(object)[
				'tipo' => 'section_id',
				'label' => 'Section ID',
				'model' => 'section_id',
				'column_name' => 'section_id',
				'checked' => true,
				'map_to' => 'section_id'
			],
			(object)[
				'tipo' => 'test52',
				'label' => 'input_text',
				'model' => 'component_input_text',
				'column_name' => 'test52',
				'checked' => true,
				'map_to' => 'test52'
			]
		];

		$response = tool_import_dedalo_csv::verify_csv_map($csv_map, 'test3');

		$this->assertTrue(
			gettype($response)==='object',
			'expected gettype result is object'
				.' and is : '.gettype($response)
		);
		$this->assertTrue(
			$response->result===true,
			'expected result is true for valid components'
				.' and is : '.json_encode($response->result)
		);
		$this->assertTrue(
			$response->msg==='OK. Request done successfully',
			'expected success msg'
				.' and is : '.$response->msg
		);
	}//end test_verify_csv_map_valid_mapping



	/**
	* TEST_import_dedalo_csv_file_unchecked_columns
	* Test that unchecked columns are not processed
	* @return void
	*/
	public function test_import_dedalo_csv_file_unchecked_columns() {

		$this->user_login();

		// CSV data with section_id
		$ar_csv_data = [
			['section_id', 'test52', 'test17'],
			['1', 'input value', 'text area value']
		];

		// Columns map with test52 unchecked
		$ar_columns_map = [
			(object)[
				'tipo' => 'section_id',
				'label' => 'Section ID',
				'model' => 'section_id',
				'column_name' => 'section_id',
				'checked' => true,
				'map_to' => 'section_id'
			],
			(object)[
				'tipo' => 'test52',
				'label' => 'input_text',
				'model' => 'component_input_text',
				'column_name' => 'test52',
				'checked' => false, // unchecked
				'map_to' => 'test52'
			],
			(object)[
				'tipo' => 'test17',
				'label' => 'text_area',
				'model' => 'component_text_area',
				'column_name' => 'test17',
				'checked' => true,
				'map_to' => 'test17'
			]
		];

		$options = new stdClass();
			$options->section_tipo		= 'test3';
			$options->ar_csv_data		= $ar_csv_data;
			$options->time_machine_save	= false;
			$options->ar_columns_map	= $ar_columns_map;
			$options->current_file		= 'test_unchecked.csv';
			$options->bulk_process_label	= 'test unchecked columns';

		$response = tool_import_dedalo_csv::import_dedalo_csv_file($options);

		$this->assertTrue(
			gettype($response)==='object',
			'expected gettype result is object'
				.' and is : '.gettype($response)
		);
		$this->assertTrue(
			$response->result===true,
			'expected result is true'
				.' and is : '.json_encode($response->result)
		);
	}//end test_import_dedalo_csv_file_unchecked_columns



	/**
	* TEST_get_csv_files_with_custom_path
	* TOOLS-02 (2026-06 audit): a client-supplied files_path MUST be ignored.
	* get_csv_files always reads the caller's own per-user import dir; honouring an
	* arbitrary files_path was an authenticated arbitrary-directory read. This test
	* now asserts the secure contract: passing a custom files_path yields the same
	* result as not passing one (the custom directory's contents are never leaked).
	* @return void
	*/
	public function test_get_csv_files_with_custom_path() {

		// a custom files_path pointing at the test fixture dir (which has CSVs)
		$with_custom = tool_import_dedalo_csv::get_csv_files((object)[
			'files_path' => $this->get_test_files_path()
		]);
		// the same call without any custom path (per-user dir only)
		$without_custom = tool_import_dedalo_csv::get_csv_files((object)[]);

		$this->assertSame(
			'object',
			gettype($with_custom),
			'expected response object'
		);
		$this->assertSame(
			'array',
			gettype($with_custom->result),
			'expected result array'
		);
		// the client files_path must be ignored: same file set as the default call.
		$this->assertSame(
			count($without_custom->result),
			count($with_custom->result),
			'TOOLS-02: a client-supplied files_path must be ignored (must not read an arbitrary directory)'
		);
	}//end test_get_csv_files_with_custom_path



	/**
	* TEST_conform_import_data_input_text_v7_format
	* Verify component_input_text::conform_import_data() produces v7-compliant data
	* Plain strings must be wrapped into objects with 'value' property
	* @return void
	*/
	public function test_conform_import_data_input_text_v7_format() {

		$this->user_login();

		$component = component_common::get_instance(
			'component_input_text',
			'test52',
			1,
			'edit',
			DEDALO_DATA_NOLAN,
			'test3'
		);

		// Case 1: plain string → must return [(object)['value' => 'Hello']]
		$response = $component->conform_import_data('Hello', 'test52');
		$this->assertTrue(
			$response->result !== null,
			'Expected non-null result for plain string input'
		);
		$this->assertTrue(
			is_array($response->result),
			'Expected array result for plain string input'
		);
		$this->assertTrue(
			is_object($response->result[0]),
			'Expected first item to be object (v7 format)'
		);
		$this->assertTrue(
			property_exists($response->result[0], 'value'),
			'Expected first item to have "value" property (v7 format)'
		);
		$this->assertEquals(
			'Hello',
			$response->result[0]->value,
			'Expected value property to match input string'
		);

		// Case 2: JSON array of strings → must normalize to objects with 'value' property
		$response = $component->conform_import_data('["Hello","World"]', 'test52');
		$this->assertTrue(
			is_array($response->result),
			'Expected array result for JSON array input'
		);
		$this->assertEquals(
			2,
			count($response->result),
			'Expected 2 items in result'
		);
		$this->assertTrue(
			property_exists($response->result[0], 'value'),
			'Expected first item to have "value" property (v7 format)'
		);
		$this->assertEquals(
			'Hello',
			$response->result[0]->value,
			'Expected first value to be "Hello"'
		);
		$this->assertEquals(
			'World',
			$response->result[1]->value,
			'Expected second value to be "World"'
		);

		// Case 3: empty string → must return null
		$response = $component->conform_import_data('', 'test52');
		$this->assertNull(
			$response->result,
			'Expected null result for empty string input'
		);
	}//end test_conform_import_data_input_text_v7_format



	/**
	* TEST_conform_import_data_text_area_v7_format
	* Verify component_text_area::conform_import_data() produces v7-compliant data
	* Plain strings must be wrapped into objects with 'value' property and HTML normalized
	* @return void
	*/
	public function test_conform_import_data_text_area_v7_format() {

		$this->user_login();

		$component = component_common::get_instance(
			'component_text_area',
			'test17',
			1,
			'edit',
			DEDALO_DATA_NOLAN,
			'test3'
		);

		// Case 1: plain string → must return [(object)['value' => '<p>Hello</p>']]
		$response = $component->conform_import_data('Hello', 'test17');
		$this->assertTrue(
			is_array($response->result),
			'Expected array result for plain string input'
		);
		$this->assertTrue(
			is_object($response->result[0]),
			'Expected first item to be object (v7 format)'
		);
		$this->assertTrue(
			property_exists($response->result[0], 'value'),
			'Expected first item to have "value" property (v7 format)'
		);
		$this->assertTrue(
			strpos($response->result[0]->value, '<p>') === 0,
			'Expected value to be wrapped in <p> tags'
		);

		// Case 2: JSON array of strings → must normalize to objects with 'value' property
		$response = $component->conform_import_data('["Hello","World"]', 'test17');
		$this->assertTrue(
			is_array($response->result),
			'Expected array result for JSON array input'
		);
		$this->assertTrue(
			property_exists($response->result[0], 'value'),
			'Expected first item to have "value" property (v7 format)'
		);
	}//end test_conform_import_data_text_area_v7_format



	/**
	* TEST_conform_import_data_email_v7_format
	* Verify component_email::conform_import_data() produces v7-compliant data
	* Plain strings must be wrapped into objects with 'value' property
	* @return void
	*/
	public function test_conform_import_data_email_v7_format() {

		$this->user_login();

		$component = component_common::get_instance(
			'component_email',
			'test208',
			1,
			'edit',
			DEDALO_DATA_NOLAN,
			'test3'
		);

		// Case 1: plain string email → must return [(object)['value' => 'test@example.com']]
		$response = $component->conform_import_data('test@example.com', 'test208');
		$this->assertTrue(
			is_array($response->result),
			'Expected array result for plain string input'
		);
		$this->assertTrue(
			is_object($response->result[0]),
			'Expected first item to be object (v7 format)'
		);
		$this->assertTrue(
			property_exists($response->result[0], 'value'),
			'Expected first item to have "value" property (v7 format)'
		);
		$this->assertEquals(
			'test@example.com',
			$response->result[0]->value,
			'Expected value property to match input email'
		);

		// Case 2: JSON array of strings → must normalize to objects with 'value' property
		$response = $component->conform_import_data('["a@b.com","c@d.com"]', 'test208');
		$this->assertTrue(
			is_array($response->result),
			'Expected array result for JSON array input'
		);
		$this->assertEquals(
			2,
			count($response->result),
			'Expected 2 items in result'
		);
		$this->assertTrue(
			property_exists($response->result[0], 'value'),
			'Expected first item to have "value" property (v7 format)'
		);
	}//end test_conform_import_data_email_v7_format



	/**
	* TEST_conform_import_data_number_v7_format
	* Verify component_number::conform_import_data() produces v7-compliant data
	* Plain numbers must be wrapped into objects with 'value' property
	* @return void
	*/
	public function test_conform_import_data_number_v7_format() {

		$this->user_login();

		$component = component_common::get_instance(
			'component_number',
			'test211',
			1,
			'edit',
			DEDALO_DATA_NOLAN,
			'test3'
		);

		// Case 1: plain number string → must return [(object)['value' => 5.87]]
		$response = $component->conform_import_data('5.87', 'test211');
		$this->assertTrue(
			is_array($response->result),
			'Expected array result for plain number input'
		);
		$this->assertTrue(
			is_object($response->result[0]),
			'Expected first item to be object (v7 format)'
		);
		$this->assertTrue(
			property_exists($response->result[0], 'value'),
			'Expected first item to have "value" property (v7 format)'
		);
		$this->assertEquals(
			5.87,
			$response->result[0]->value,
			'Expected value property to match input number'
		);

		// Case 2: JSON array of numbers → must normalize to objects with 'value' property
		$response = $component->conform_import_data('[9.76, 10]', 'test211');
		$this->assertTrue(
			is_array($response->result),
			'Expected array result for JSON array input'
		);
		$this->assertEquals(
			2,
			count($response->result),
			'Expected 2 items in result'
		);
		$this->assertTrue(
			property_exists($response->result[0], 'value'),
			'Expected first item to have "value" property (v7 format)'
		);
	}//end test_conform_import_data_number_v7_format



	/**
	* TEST_conform_import_data_set_data_lang_compatibility
	* Verify that conform_import_data() results are compatible with set_data_lang()
	* set_data_lang() skips non-object items, so all items must be objects
	* @return void
	*/
	public function test_conform_import_data_set_data_lang_compatibility() {

		$this->user_login();

		$component = component_common::get_instance(
			'component_input_text',
			'test52',
			1,
			'edit',
			DEDALO_DATA_LANG,
			'test3'
		);

		// Get conformed data from a plain string
		$response = $component->conform_import_data('Hello', 'test52');
		$conformed_value = $response->result;

		// Verify all items are objects (required by set_data_lang)
		if (is_array($conformed_value)) {
			foreach ($conformed_value as $key => $item) {
				$this->assertTrue(
					is_object($item),
					"Expected item $key to be object for set_data_lang() compatibility"
				);
			}
		}

		// Verify set_data_lang() doesn't silently drop items
		// Note that get_data() returns all langs data: previous values of other langs
		// may exist in the test DB, so locate the item by DEDALO_DATA_LANG instead of
		// asserting on a fixed position
		$component->set_data_lang($conformed_value, DEDALO_DATA_LANG);
		$saved_data = $component->get_data();
		$this->assertTrue(
			!empty($saved_data),
			'Expected data to be saved (not silently dropped by set_data_lang)'
		);
		$lang_item = null;
		foreach ($saved_data as $item) {
			if (is_object($item) && ($item->lang ?? null)===DEDALO_DATA_LANG) {
				$lang_item = $item;
				break;
			}
		}
		$this->assertTrue(
			is_object($lang_item),
			'Expected a saved data item with lang DEDALO_DATA_LANG'
		);
		$this->assertTrue(
			property_exists($lang_item, 'value'),
			'Expected saved data item to have "value" property'
		);
		$this->assertEquals(
			'Hello',
			$lang_item->value,
			'Expected saved value to match input'
		);
	}//end test_conform_import_data_set_data_lang_compatibility



	/**
	* TEST_conform_import_data_date_v7_format
	* Verify component_date::conform_import_data() produces v7-compliant data
	* Date objects use 'start'/'end' properties (NO 'value' property)
	* @return void
	*/
	public function test_conform_import_data_date_v7_format() {

		$this->user_login();

		$component = component_common::get_instance(
			'component_date',
			'test145',
			1,
			'edit',
			DEDALO_DATA_NOLAN,
			'test3'
		);

		// Case 1: plain string date → must return array of objects with 'start' property
		$response = $component->conform_import_data('2023/10/26', 'test145');
		$this->assertTrue(
			is_array($response->result),
			'Expected array result for plain date string input'
		);
		$this->assertTrue(
			is_object($response->result[0]),
			'Expected first item to be object (v7 format)'
		);
		$this->assertTrue(
			property_exists($response->result[0], 'start'),
			'Expected first item to have "start" property (date v7 format)'
		);
		$this->assertFalse(
			property_exists($response->result[0], 'value'),
			'Expected date item to NOT have "value" property (dates use start/end)'
		);
		$this->assertEquals(
			2023,
			$response->result[0]->start->year,
			'Expected start year to be 2023'
		);

		// Case 2: JSON date → must return array of date objects
		$response = $component->conform_import_data('[{"start":{"year":2023,"month":10,"day":26}}]', 'test145');
		$this->assertTrue(
			is_array($response->result),
			'Expected array result for JSON date input'
		);
		$this->assertTrue(
			property_exists($response->result[0], 'start'),
			'Expected first item to have "start" property'
		);

		// Case 3: range date → must have start and end
		$response = $component->conform_import_data('2023/10/26<>2023/10/27', 'test145');
		$this->assertTrue(
			is_array($response->result),
			'Expected array result for range date input'
		);
		$this->assertTrue(
			property_exists($response->result[0], 'start'),
			'Expected range date to have "start" property'
		);
		$this->assertTrue(
			property_exists($response->result[0], 'end'),
			'Expected range date to have "end" property'
		);

		// Case 4: multi-value date → must return 2 items
		$response = $component->conform_import_data('2023/10/26|1853/02/18', 'test145');
		$this->assertTrue(
			is_array($response->result),
			'Expected array result for multi-value date input'
		);
		$this->assertEquals(
			2,
			count($response->result),
			'Expected 2 items for multi-value date'
		);
	}//end test_conform_import_data_date_v7_format



	/**
	* TEST_conform_import_data_iri_v7_format
	* Verify component_iri::conform_import_data() produces v7-compliant data
	* IRI objects use 'iri' property (NO 'value' property)
	* @return void
	*/
	public function test_conform_import_data_iri_v7_format() {

		$this->user_login();

		$component = component_common::get_instance(
			'component_iri',
			'test140',
			1,
			'edit',
			DEDALO_DATA_NOLAN,
			'test3'
		);

		// Case 1: plain URL string → must return array of objects with 'iri' property
		$response = $component->conform_import_data('https://dedalo.dev', 'test140');
		$this->assertTrue(
			is_array($response->result),
			'Expected array result for plain URL input'
		);
		$this->assertTrue(
			is_object($response->result[0]),
			'Expected first item to be object (v7 format)'
		);
		$this->assertTrue(
			property_exists($response->result[0], 'iri'),
			'Expected first item to have "iri" property (IRI v7 format)'
		);
		$this->assertFalse(
			property_exists($response->result[0], 'value'),
			'Expected IRI item to NOT have "value" property (IRIs use iri)'
		);
		$this->assertEquals(
			'https://dedalo.dev',
			$response->result[0]->iri,
			'Expected iri property to match input URL'
		);

		// Case 2: JSON object → must return array with iri property
		$response = $component->conform_import_data('{"iri":"https://dedalo.dev"}', 'test140');
		$this->assertTrue(
			is_array($response->result),
			'Expected array result for JSON object input'
		);
		$this->assertEquals(
			'https://dedalo.dev',
			$response->result[0]->iri,
			'Expected iri property to match input'
		);

		// Case 3: JSON translatable → must return object with lg-* keys
		$response = $component->conform_import_data('{"lg-spa":[{"iri":"https://es.wikipedia.org"}]}', 'test140');
		$this->assertTrue(
			is_object($response->result),
			'Expected object result for translatable IRI input'
		);
		$this->assertTrue(
			property_exists($response->result, 'lg-spa'),
			'Expected result to have "lg-spa" key'
		);
		$this->assertEquals(
			'https://es.wikipedia.org',
			$response->result->{'lg-spa'}[0]->iri,
			'Expected lg-spa IRI to match input'
		);

		// Case 4: multiple values with separator
		$response = $component->conform_import_data('https://dedalo.dev | https://dedalo.dev/docs', 'test140');
		$this->assertTrue(
			is_array($response->result),
			'Expected array result for multi-value IRI input'
		);
		$this->assertEquals(
			2,
			count($response->result),
			'Expected 2 items for multi-value IRI'
		);
		$this->assertEquals(
			'https://dedalo.dev',
			$response->result[0]->iri,
			'Expected first iri to match'
		);
	}//end test_conform_import_data_iri_v7_format



	/**
	* TEST_conform_import_data_relation_common_v7_format
	* Verify component_relation_common::conform_import_data() produces v7-compliant data
	* Relation objects are locators with section_id, section_tipo, from_component_tipo (NO 'value' property)
	* @return void
	*/
	public function test_conform_import_data_relation_common_v7_format() {

		$this->user_login();

		$component = component_common::get_instance(
			'component_relation_index',
			'test25',
			1,
			'edit',
			DEDALO_DATA_NOLAN,
			'test3'
		);

		// Case 1: comma-separated IDs with target section_tipo in column name
		$response = $component->conform_import_data('1,4,6', 'test25_test3');
		$this->assertTrue(
			is_array($response->result),
			'Expected array result for comma-separated IDs input'
		);
		$this->assertEquals(
			3,
			count($response->result),
			'Expected 3 locators for 3 IDs'
		);
		$this->assertTrue(
			is_object($response->result[0]),
			'Expected first item to be object (locator)'
		);
		$this->assertTrue(
			property_exists($response->result[0], 'section_id'),
			'Expected locator to have "section_id" property'
		);
		$this->assertTrue(
			property_exists($response->result[0], 'section_tipo'),
			'Expected locator to have "section_tipo" property'
		);
		$this->assertTrue(
			property_exists($response->result[0], 'from_component_tipo'),
			'Expected locator to have "from_component_tipo" property'
		);
		$this->assertFalse(
			property_exists($response->result[0], 'value'),
			'Expected locator to NOT have "value" property'
		);

		// Case 2: JSON locator array
		$response = $component->conform_import_data('[{"section_id":"2","section_tipo":"test3"}]', 'test25');
		$this->assertTrue(
			is_array($response->result),
			'Expected array result for JSON locator input'
		);
		$this->assertTrue(
			property_exists($response->result[0], 'section_id'),
			'Expected locator to have "section_id" property'
		);
		$this->assertEquals(
			'2',
			$response->result[0]->section_id,
			'Expected section_id to match input'
		);
	}//end test_conform_import_data_relation_common_v7_format



}//end class tool_import_dedalo_csv_Test
