<?php
declare(strict_types=1);
// PHPUnit classes
use PHPUnit\Framework\TestCase;
use PHPUnit\Framework\Attributes\TestDox;
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';



final class component_media_common_test extends TestCase {



	/**
	 * Note that only static methods are checked here !
	 */



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
	* TEST_get_media_components
	* @return void
	*/
	public function test_get_media_components() {

		$result = component_media_common::get_media_components();

		$this->assertTrue(
			is_array($result) ,
			'expected is_array = true '. to_string(is_array($result))
		);
	}//end test_get_media_components



	/**
	* TEST_GET_DATO
	* @return void
	*/
	public function test_get_dato() {

		foreach (get_elements() as $element) {

			if (!in_array($element->model, component_media_common::get_media_components())) {
				continue;
			}

			$_ENV['DEDALO_LAST_ERROR'] = null; // reset

			$component = component_common::get_instance(
				$element->model, // string model
				$element->tipo, // string tipo
				$element->section_id, // string section_id
				$element->mode, // string mode
				$element->lang, // string lang
				$element->section_tipo // string section_tipo
			);

			$value = $component->get_dato();
			// dump($value, ' value ++ '.to_string());

			// sample:
				// {
			    //     "files_info": [
			    //         {
			    //             "quality": "original",
			    //             "file_exist": true,
			    //             "file_name": "test99_test3_1.jpg",
			    //             "file_path": "/Users/paco/Trabajos/Dedalo/v6/master_dedalo/media/media_development/image/original/test99_test3_1.jpg",
			    //             "file_url": "//media/media_development/image/original/test99_test3_1.jpg",
			    //             "file_size": 620888,
			    //             "file_time": {
			    //                 "year": 2021, ...
			    //             }
			    //         },
			    //         {
			    //             "quality": "1.5MB",
			    //             "file_exist": true,
			    //             "file_name": "test99_test3_1.jpg",
			    //             "file_path": "/Users/paco/Trabajos/Dedalo/v6/master_dedalo/media/media_development/image/1.5MB/test99_test3_1.jpg",
			    //             "file_url": "//media/media_development/image/1.5MB/test99_test3_1.jpg",
			    //             "file_size": 158123,
			    //             "file_time": {
			    //                 "year": 2023, ...
			    //             }
			    //         },
			    //         {
			    //             "quality": "thumb",
			    //             "file_exist": true,
			    //             "file_name": "test99_test3_1.jpg",
			    //             "file_path": "/Users/paco/Trabajos/Dedalo/v6/master_dedalo/media/media_development/image/thumb/test99_test3_1.jpg",
			    //             "file_url": "//media/media_development/image/thumb/test99_test3_1.jpg",
			    //             "file_size": 20690,
			    //             "file_time": {
			    //                 "year": 2023, ...
			    //             }
			    //         }
			    //     ],
			    //     "lib_data": null
			    // }

			$this->assertTrue(
				gettype($value)==='array' || gettype($value)==='NULL',
				'expected type array|null : ' . PHP_EOL
					. gettype($value)
			);

			if (!empty($value)) {
				$this->assertTrue(
					isset($value[0]->files_info),
					'expected isset($value[0]->files_info : ' . PHP_EOL
						. to_string(isset($value[0]->files_info))
				);
				$this->assertTrue(
					gettype($value[0]->files_info)==='array',
					'expected type array : ' . PHP_EOL
						. gettype($value[0]->files_info)
				);
			}
		}
	}//end test_get_dato



	/**
	* TEST_get_grid_value
	* @return void
	*/
	public function test_get_grid_value() {

		foreach (get_elements() as $element) {

			if (!in_array($element->model, component_media_common::get_media_components())) {
				continue;
			}

			$_ENV['DEDALO_LAST_ERROR'] = null; // reset

			$component = component_common::get_instance(
				$element->model, // string model
				$element->tipo, // string tipo
				$element->section_id, // string section_id
				$element->mode, // string mode
				$element->lang, // string lang
				$element->section_tipo // string section_tipo
			);

			$result = $component->get_grid_value();

			$this->assertTrue(
				gettype($result)==='object',
				'expected type object : ' . PHP_EOL
					. gettype($result)
			);

			$this->assertTrue(
				$result->type==='column' ,
				'expected result->type = column '. PHP_EOL
				. to_string($result)
			);

			$this->assertTrue(
				$result->cell_type==='img' ,
				'expected result->cell_type = img '. PHP_EOL
				. to_string($result)
			);

			$this->assertTrue(
				gettype($result->ar_columns_obj)==='array',
				'expected type array : ' . PHP_EOL
					. gettype($result->ar_columns_obj)
			);
		}
	}//end test_get_grid_value



	/**
	* TEST_GET_VALOR
	* @return void
	*/
	public function test_get_valor() {

		foreach (get_elements() as $element) {

			if (!in_array($element->model, component_media_common::get_media_components())) {
				continue;
			}

			$_ENV['DEDALO_LAST_ERROR'] = null; // reset

			$component = component_common::get_instance(
				$element->model, // string model
				$element->tipo, // string tipo
				$element->section_id, // string section_id
				$element->mode, // string mode
				$element->lang, // string lang
				$element->section_tipo // string section_tipo
			);

			$result = $component->get_valor();

			$this->assertTrue(
				gettype($result)==='string',
				'expected type string : ' . PHP_EOL
				. gettype($result)
			);

			$this->assertTrue(
				strpos($result, '.'.$component->get_extension())!==false,
				'expected contains extension '.$component->get_extension() . PHP_EOL
					. to_string($result) . PHP_EOL
					. to_string( strpos($result, '.'.$component->get_extension()) )
			);
		}
	}//end test_get_valor



	/**
	* test_get_valor_export
	* @return void
	*/
	public function test_get_valor_export() {

		foreach (get_elements() as $element) {

			if (!in_array($element->model, component_media_common::get_media_components())) {
				continue;
			}

			$_ENV['DEDALO_LAST_ERROR'] = null; // reset

			$component = component_common::get_instance(
				$element->model, // string model
				$element->tipo, // string tipo
				$element->section_id, // string section_id
				$element->mode, // string mode
				$element->lang, // string lang
				$element->section_tipo // string section_tipo
			);

			$result = $component->get_valor_export();

			$this->assertTrue(
				gettype($result)==='string' || gettype($result)==='NULL',
				'expected type string|null : ' . PHP_EOL
					. gettype($result)
			);
			// if (!is_null($result)) {
			// 	$this->assertTrue(
			// 		strpos($result, 'http')!==false,
			// 		'expected value contains http ' . PHP_EOL . PHP_EOL
			// 			. to_string($result)
			// 	);
			// }
		}
	}//end test_get_valor_export



	/**
	* TEST_GET_DIFFUSION_VALUE
	* @return void
	*/
	public function test_get_diffusion_value() {

		foreach (get_elements() as $element) {

			if (!in_array($element->model, component_media_common::get_media_components())) {
				continue;
			}

			$_ENV['DEDALO_LAST_ERROR'] = null; // reset

			$component = component_common::get_instance(
				$element->model, // string model
				$element->tipo, // string tipo
				$element->section_id, // string section_id
				$element->mode, // string mode
				$element->lang, // string lang
				$element->section_tipo // string section_tipo
			);

			$result = $component->get_diffusion_value();
			$this->assertTrue(
				gettype($result)==='string' || gettype($result)==='NULL',
				'expected type string|null : ' . PHP_EOL
					. gettype($result)
			);
			if (!is_null($result)) {
				$this->assertTrue(
					strpos($result, '.'.$component->get_extension())!==false,
					'expected value contains extension: '. $component->get_extension() . PHP_EOL . PHP_EOL
						. to_string($result)
				);
			}
		}
	}//end test_get_diffusion_value



	/**
	* TEST_get_id
	* @return void
	*/
	public function test_get_id() {

		foreach (get_elements() as $element) {

			if (!in_array($element->model, component_media_common::get_media_components())) {
				continue;
			}

			$_ENV['DEDALO_LAST_ERROR'] = null; // reset

			// section id case
				$component = component_common::get_instance(
					$element->model, // string model
					$element->tipo, // string tipo
					null, // string section_id
					$element->mode, // string mode
					$element->lang, // string lang
					$element->section_tipo // string section_tipo
				);

				$result = $component->get_id();

				$this->assertTrue(
					gettype($result)==='NULL',
					'expected type NULL : ' . PHP_EOL
						. gettype($result)
				);

			// normal case
			$component = component_common::get_instance(
				$element->model, // string model
				$element->tipo, // string tipo
				$element->section_id, // string section_id
				$element->mode, // string mode
				$element->lang, // string lang
				$element->section_tipo // string section_tipo
			);

			$result = $component->get_id();

			// sample result
			// 'test99_test3_1'

			$this->assertTrue(
				gettype($result)==='string',
				'expected type string : ' . PHP_EOL
					. gettype($result)
			);

			$this->assertTrue(
				$result===($element->tipo.'_'.$element->section_tipo.'_'.$element->section_id),
				'expected as test99_test3_1 ' . PHP_EOL
					. $result
			);
		}
	}//end test_get_id



	/**
	* TEST_get_name
	* @return void
	*/
	public function test_get_name() {

		// $this->test_get_id();

		foreach (get_elements() as $element) {

			if (!in_array($element->model, component_media_common::get_media_components())) {
				continue;
			}

			$_ENV['DEDALO_LAST_ERROR'] = null; // reset

			// section id case
				$component = component_common::get_instance(
					$element->model, // string model
					$element->tipo, // string tipo
					null, // string section_id
					$element->mode, // string mode
					$element->lang, // string lang
					$element->section_tipo // string section_tipo
				);

				$result = $component->get_name();

				$this->assertTrue(
					gettype($result)==='NULL',
					'expected type NULL : ' . PHP_EOL
						. gettype($result)
				);

			// normal case
			$component = component_common::get_instance(
				$element->model, // string model
				$element->tipo, // string tipo
				$element->section_id, // string section_id
				$element->mode, // string mode
				$element->lang, // string lang
				$element->section_tipo // string section_tipo
			);

			$result = $component->get_name();

			// sample result
			// 'test99_test3_1'

			$this->assertTrue(
				gettype($result)==='string',
				'expected type string : ' . PHP_EOL
					. gettype($result)
			);

			$this->assertTrue(
				$result===($element->tipo.'_'.$element->section_tipo.'_'.$element->section_id),
				'expected as test99_test3_1 ' . PHP_EOL
					. $result
			);
		}
	}//end test_get_name



	/**
	* TEST_get_initial_media_path
	* @return void
	*/
	public function test_get_initial_media_path() {

		foreach (get_elements() as $element) {

			if (!in_array($element->model, component_media_common::get_media_components())) {
				continue;
			}

			$_ENV['DEDALO_LAST_ERROR'] = null; // reset

			// normal case
			$component = component_common::get_instance(
				$element->model, // string model
				$element->tipo, // string tipo
				$element->section_id, // string section_id
				$element->mode, // string mode
				$element->lang, // string lang
				$element->section_tipo // string section_tipo
			);

			$result = $component->get_initial_media_path();

			$this->assertTrue(
				gettype($result)==='string' || gettype($result)==='NULL',
				'expected type string|null : ' . PHP_EOL
					. gettype($result)
			);
		}
	}//end test_get_initial_media_path



	/**
	* TEST_get_additional_path
	* @return void
	*/
	public function test_get_additional_path() {

		foreach (get_elements() as $element) {

			if (!in_array($element->model, component_media_common::get_media_components())) {
				continue;
			}

			$_ENV['DEDALO_LAST_ERROR'] = null; // reset

			// normal case
			$component = component_common::get_instance(
				$element->model, // string model
				$element->tipo, // string tipo
				$element->section_id, // string section_id
				$element->mode, // string mode
				$element->lang, // string lang
				$element->section_tipo // string section_tipo
			);

			$result = $component->get_additional_path();

			$this->assertTrue(
				gettype($result)==='string' || gettype($result)==='NULL',
				'expected type string|null : ' . PHP_EOL
					. gettype($result)
			);

			$this->assertTrue(
				strpos($result, '/')!==false,
				'expected contains / ' . PHP_EOL
					. json_encode($result)
			);
		}
	}//end test_get_additional_path



	/**
	* TEST_get_best_extensions
	* @return void
	*/
	public function test_get_best_extensions() {

		foreach (get_elements() as $element) {

			if (!in_array($element->model, component_media_common::get_media_components())) {
				continue;
			}

			$_ENV['DEDALO_LAST_ERROR'] = null; // reset

			// normal case
			$component = component_common::get_instance(
				$element->model, // string model
				$element->tipo, // string tipo
				$element->section_id, // string section_id
				$element->mode, // string mode
				$element->lang, // string lang
				$element->section_tipo // string section_tipo
			);

			$result = $component->get_best_extensions();

			$this->assertTrue(
				gettype($result)==='array',
				'expected type array : ' . PHP_EOL
					. gettype($result)
			);
		}
	}//end test_get_best_extensions



	/**
	* TEST_quality_file_exist
	* @return void
	*/
	public function test_quality_file_exist() {

		foreach (get_elements() as $element) {

			if (!in_array($element->model, component_media_common::get_media_components())) {
				continue;
			}

			$_ENV['DEDALO_LAST_ERROR'] = null; // reset

			// normal case
			$component = component_common::get_instance(
				$element->model, // string model
				$element->tipo, // string tipo
				$element->section_id, // string section_id
				$element->mode, // string mode
				$element->lang, // string lang
				$element->section_tipo // string section_tipo
			);

			$quality = $component->get_default_quality();
			$result = $component->quality_file_exist($quality);

			$this->assertTrue(
				gettype($result)==='boolean',
				'expected type boolean : ' . PHP_EOL
					. gettype($result)
			);
		}
	}//end test_quality_file_exist



	/**
	* TEST_add_file
	* @return void
	*/
	public function test_add_file() {

		foreach (get_elements() as $element) {

			if (!in_array($element->model, component_media_common::get_media_components())) {
				continue;
			}

			$_ENV['DEDALO_LAST_ERROR'] = null; // reset

			// normal case
			$component = component_common::get_instance(
				$element->model, // string model
				$element->tipo, // string tipo
				$element->section_id, // string section_id
				$element->mode, // string mode
				$element->lang, // string lang
				$element->section_tipo // string section_tipo
			);

			$options = new stdClass();
				$options->tmp_dir = null;
			$result = $component->add_file($options);

			$this->assertTrue(
				gettype($result)==='object',
				'expected type object : ' . PHP_EOL
					. gettype($result)
			);
			$this->assertTrue(
				gettype($result->result)==='boolean',
				'expected type boolean : ' . PHP_EOL
					. gettype($result->result)
			);
			$this->assertTrue(
				$result->result===false,
				'expected false for result->result  : ' . PHP_EOL
					. json_encode($result->result)
			);

			$options = new stdClass();
				$options->tmp_dir	= 'DEDALO_UPLOAD_TMP_DIR';
				$options->key_dir	= '/fake_key_dir';
				$options->tmp_name	= 'fake_temp_name';
			$result = $component->add_file($options);

			$this->assertTrue(
				$result->result===false,
				'expected false for result->result  : ' . PHP_EOL
					. json_encode($result->result)
			);
			$this->assertTrue(
				in_array('source file not found', $result->errors),
				'expected error "source file not found" : ' . PHP_EOL
					. json_encode($result->errors)
			);
		}
	}//end test_add_file



	/**
	* TEST_move_zip_file
	* @return void
	*/
	public function test_move_zip_file() {

		foreach (get_elements() as $element) {

			if (!in_array($element->model, component_media_common::get_media_components())) {
				continue;
			}

			$_ENV['DEDALO_LAST_ERROR'] = null; // reset

			// normal case
			$component = component_common::get_instance(
				$element->model, // string model
				$element->tipo, // string tipo
				$element->section_id, // string section_id
				$element->mode, // string mode
				$element->lang, // string lang
				$element->section_tipo // string section_tipo
			);

			$result = $component::move_zip_file(
				'fake_tmp_name',
				'fake_folder_path',
				'fale_file_name'
			);

			$this->assertTrue(
				gettype($result)==='object',
				'expected type object : ' . PHP_EOL
					. gettype($result)
			);
			$this->assertTrue(
				gettype($result->result)==='boolean',
				'expected type boolean : ' . PHP_EOL
					. gettype($result->result)
			);
		}
	}//end test_move_zip_file



	/**
	* TEST_DIRECT_MOVE_ZIP_FILE
	* @return void
	*/
	public function test_direct_move_zip_file() {

		$response = component_media_common::move_zip_file(
			'fake_tipo1',
			'fake_folder_path',
			'fake_file_name'
		);

		$this->assertTrue(
			$response->result===false ,
			'expected result = false '. to_string($response->result===false)
		);
	}//end test_direct_move_zip_file



	/**
	* TEST_rename_old_files
	* @return void
	*/
	public function test_rename_old_files() {

		foreach (get_elements() as $element) {

			if (!in_array($element->model, component_media_common::get_media_components())) {
				continue;
			}

			$_ENV['DEDALO_LAST_ERROR'] = null; // reset

			// normal case
			$component = component_common::get_instance(
				$element->model, // string model
				$element->tipo, // string tipo
				$element->section_id, // string section_id
				$element->mode, // string mode
				$element->lang, // string lang
				$element->section_tipo // string section_tipo
			);

			$result = $component->rename_old_files(
				'fake_tmp_name',
				'fake_folder_path'
			);

			$this->assertTrue(
				gettype($result)==='object',
				'expected type object : ' . PHP_EOL
					. gettype($result)
			);
			$this->assertTrue(
				$result->result===false,
				'expected result->result false : ' . PHP_EOL
					. json_encode($result->result)
			);
			$this->assertTrue(
				in_array('invalid folder path', $result->errors),
				'expected error "invalid folder path" : ' . PHP_EOL
					. json_encode($result->errors)
			);
		}
	}//end test_rename_old_files



	/**
	* TEST_valid_file_extension
	* @return void
	*/
	public function test_valid_file_extension() {

		foreach (get_elements() as $element) {

			if (!in_array($element->model, component_media_common::get_media_components())) {
				continue;
			}

			$_ENV['DEDALO_LAST_ERROR'] = null; // reset

			// normal case
			$component = component_common::get_instance(
				$element->model, // string model
				$element->tipo, // string tipo
				$element->section_id, // string section_id
				$element->mode, // string mode
				$element->lang, // string lang
				$element->section_tipo // string section_tipo
			);

			$result = $component->valid_file_extension(
				'fake_extension'
			);

			$this->assertTrue(
				gettype($result)==='boolean',
				'expected type boolean : ' . PHP_EOL
					. gettype($result)
			);
			$this->assertTrue(
				$result===false,
				'expected result false : ' . PHP_EOL
					. json_encode($result)
			);
		}
	}//end test_valid_file_extension



	/**
	* TEST_get_alternative_extensions
	* @return void
	*/
	public function test_get_alternative_extensions() {

		foreach (get_elements() as $element) {

			if (!in_array($element->model, component_media_common::get_media_components())) {
				continue;
			}

			$_ENV['DEDALO_LAST_ERROR'] = null; // reset

			// normal case
			$component = component_common::get_instance(
				$element->model, // string model
				$element->tipo, // string tipo
				$element->section_id, // string section_id
				$element->mode, // string mode
				$element->lang, // string lang
				$element->section_tipo // string section_tipo
			);

			$result = $component->get_alternative_extensions();

			$this->assertTrue(
				gettype($result)==='array' || gettype($result)==='NULL',
				'expected type array|NULL : ' . PHP_EOL
					. gettype($result)
			);
			// $this->assertTrue(
			// 	$result===false,
			// 	'expected result false : ' . PHP_EOL
			// 	. $element->model . ' - ' . json_encode($result)
			// );
		}
	}//end test_get_alternative_extensions



	/**
	* TEST_process_uploaded_file
	* @return void
	*/
	public function test_process_uploaded_file() {

		foreach (get_elements() as $element) {

			if (!in_array($element->model, component_media_common::get_media_components())) {
				continue;
			}

			$_ENV['DEDALO_LAST_ERROR'] = null; // reset

			// normal case
			$component = component_common::get_instance(
				$element->model, // string model
				$element->tipo, // string tipo
				$element->section_id, // string section_id
				$element->mode, // string mode
				$element->lang, // string lang
				$element->section_tipo // string section_tipo
			);

			$fake_options = new stdClass();
				$fake_options->original_file_name	= 'fake_original_file_name';
				$fake_options->full_file_path		= 'fake_full_file_path';
				$fake_options->full_file_name		= 'fake_full_file_name';

			$result = $component->process_uploaded_file($fake_options);

			$this->assertTrue(
				gettype($result)==='object',
				'expected type object : ' . PHP_EOL
					. gettype($result)
			);
			$this->assertTrue(
				$result->result===false,
				'expected result false : ' . PHP_EOL
				. $element->model . ' - ' . json_encode($result)
			);
		}
	}//end test_process_uploaded_file



	/**
	* TEST_get_files_info
	* @return void
	*/
	public function test_get_files_info() {

		foreach (get_elements() as $element) {

			if (!in_array($element->model, component_media_common::get_media_components())) {
				continue;
			}

			$_ENV['DEDALO_LAST_ERROR'] = null; // reset

			// normal case
			$component = component_common::get_instance(
				$element->model, // string model
				$element->tipo, // string tipo
				$element->section_id, // string section_id
				$element->mode, // string mode
				$element->lang, // string lang
				$element->section_tipo // string section_tipo
			);

			$result = $component->get_files_info();

			$this->assertTrue(
				gettype($result)==='array',
				'expected type array : ' . PHP_EOL
					. gettype($result)
			);
		}
	}//end test_get_files_info



	/**
	* TEST_get_datalist
	* @return void
	*/
	public function test_get_datalist() {

		foreach (get_elements() as $element) {

			if (!in_array($element->model, component_media_common::get_media_components())) {
				continue;
			}

			$_ENV['DEDALO_LAST_ERROR'] = null; // reset

			// normal case
			$component = component_common::get_instance(
				$element->model, // string model
				$element->tipo, // string tipo
				$element->section_id, // string section_id
				$element->mode, // string mode
				$element->lang, // string lang
				$element->section_tipo // string section_tipo
			);

			$result = $component->get_datalist();

			$this->assertTrue(
				gettype($result)==='array',
				'expected type array : ' . PHP_EOL
					. gettype($result)
			);
		}
	}//end test_get_datalist



	/**
	* TEST_get_list_value
	* @return void
	*/
	public function test_get_list_value() {

		foreach (get_elements() as $element) {

			if (!in_array($element->model, component_media_common::get_media_components())) {
				continue;
			}

			$_ENV['DEDALO_LAST_ERROR'] = null; // reset

			// normal case
			$component = component_common::get_instance(
				$element->model, // string model
				$element->tipo, // string tipo
				$element->section_id, // string section_id
				$element->mode, // string mode
				$element->lang, // string lang
				$element->section_tipo // string section_tipo
			);

			$result = $component->get_list_value();

			$this->assertTrue(
				gettype($result)==='array' || gettype($result)==='NULL',
				'expected type array|NULL : ' . PHP_EOL
					. gettype($result)
			);
		}
	}//end test_get_list_value



	/**
	* TEST_get_quality
	* @return void
	*/
	public function test_get_quality() {

		foreach (get_elements() as $element) {

			if (!in_array($element->model, component_media_common::get_media_components())) {
				continue;
			}

			$_ENV['DEDALO_LAST_ERROR'] = null; // reset

			// normal case
			$component = component_common::get_instance(
				$element->model, // string model
				$element->tipo, // string tipo
				$element->section_id, // string section_id
				$element->mode, // string mode
				$element->lang, // string lang
				$element->section_tipo // string section_tipo
			);

			$result = $component->get_quality();

			$this->assertTrue(
				gettype($result)==='string',
				'expected type string : ' . PHP_EOL
					. gettype($result)
			);
		}
	}//end test_get_quality



	/**
	* TEST_get_thumb_quality
	* @return void
	*/
	public function test_get_thumb_quality() {

		foreach (get_elements() as $element) {

			if (!in_array($element->model, component_media_common::get_media_components())) {
				continue;
			}

			$_ENV['DEDALO_LAST_ERROR'] = null; // reset

			// normal case
			$component = component_common::get_instance(
				$element->model, // string model
				$element->tipo, // string tipo
				$element->section_id, // string section_id
				$element->mode, // string mode
				$element->lang, // string lang
				$element->section_tipo // string section_tipo
			);

			$result = $component->get_thumb_quality();

			$this->assertTrue(
				gettype($result)==='string',
				'expected type string : ' . PHP_EOL
					. gettype($result)
			);
			$this->assertTrue(
				$result==='thumb',
				'expected thumb : ' . PHP_EOL
					. json_encode($result)
			);
		}
	}//end test_get_thumb_quality



	/**
	* TEST_get_thumb_path
	* @return void
	*/
	public function test_get_thumb_path() {

		foreach (get_elements() as $element) {

			if (!in_array($element->model, component_media_common::get_media_components())) {
				continue;
			}

			$_ENV['DEDALO_LAST_ERROR'] = null; // reset

			// normal case
			$component = component_common::get_instance(
				$element->model, // string model
				$element->tipo, // string tipo
				$element->section_id, // string section_id
				$element->mode, // string mode
				$element->lang, // string lang
				$element->section_tipo // string section_tipo
			);

			$result = $component->get_thumb_path();

			$this->assertTrue(
				gettype($result)==='string',
				'expected type string : ' . PHP_EOL
					. gettype($result)
			);
			// $this->assertTrue(
			// 	$result==='thumb',
			// 	'expected thumb : ' . PHP_EOL
			// 		. json_encode($result)
			// );
		}
	}//end test_get_thumb_path



	/**
	* TEST_get_thumb_extension
	* @return void
	*/
	public function test_get_thumb_extension() {

		foreach (get_elements() as $element) {

			if (!in_array($element->model, component_media_common::get_media_components())) {
				continue;
			}

			$_ENV['DEDALO_LAST_ERROR'] = null; // reset

			// normal case
			$component = component_common::get_instance(
				$element->model, // string model
				$element->tipo, // string tipo
				$element->section_id, // string section_id
				$element->mode, // string mode
				$element->lang, // string lang
				$element->section_tipo // string section_tipo
			);

			$result = $component->get_thumb_extension();

			$this->assertTrue(
				gettype($result)==='string',
				'expected type string : ' . PHP_EOL
					. gettype($result)
			);
			$this->assertTrue(
				$result==='jpg',
				'expected jpg : ' . PHP_EOL
					. json_encode($result)
			);
		}
	}//end test_get_thumb_extension



	/**
	* TEST_delete_file
	* @return void
	*/
	public function test_delete_file() {

		foreach (get_elements() as $element) {

			if (!in_array($element->model, component_media_common::get_media_components())) {
				continue;
			}

			$_ENV['DEDALO_LAST_ERROR'] = null; // reset

			// normal case
			$component = component_common::get_instance(
				$element->model, // string model
				$element->tipo, // string tipo
				$element->section_id, // string section_id
				$element->mode, // string mode
				$element->lang, // string lang
				$element->section_tipo // string section_tipo
			);

			$result = $component->delete_file(
				'fake_quality'
			);

			$this->assertTrue(
				gettype($result)==='object',
				'expected type object : ' . PHP_EOL
					. gettype($result)
			);
			$this->assertTrue(
				$result->result===false,
				'expected result->result false : ' . PHP_EOL
					. json_encode($result->result)
			);
			$this->assertTrue(
				in_array('invalid quality', $result->errors),
				'expected error invalid quality : ' . PHP_EOL
					. json_encode($result)
			);
		}
	}//end test_delete_file



	/**
	* TEST_remove_component_media_files
	* @return void
	*/
	public function test_remove_component_media_files() {

		foreach (get_elements() as $element) {

			if (!in_array($element->model, component_media_common::get_media_components())) {
				continue;
			}

			$_ENV['DEDALO_LAST_ERROR'] = null; // reset

			// normal case
			$component = component_common::get_instance(
				$element->model, // string model
				$element->tipo, // string tipo
				$element->section_id, // string section_id
				$element->mode, // string mode
				$element->lang, // string lang
				$element->section_tipo // string section_tipo
			);

			$result = $component->remove_component_media_files(
				['fake_quality1','fake_quality2']
			);

			$this->assertTrue(
				gettype($result)==='boolean',
				'expected type boolean : ' . PHP_EOL
					. gettype($result)
			);
			$this->assertTrue(
				$result===false,
				'expected result->result false : ' . PHP_EOL
					. json_encode($result)
			);
			// $this->assertTrue(
			// 	in_array('invalid quality', $result->errors),
			// 	'expected error invalid quality : ' . PHP_EOL
			// 		. json_encode($result)
			// );
		}
	}//end test_remove_component_media_files



	/**
	* TEST_get_sortable
	* @return void
	*/
	public function test_get_sortable() {

		foreach (get_elements() as $element) {

			if (!in_array($element->model, component_media_common::get_media_components())) {
				continue;
			}

			$_ENV['DEDALO_LAST_ERROR'] = null; // reset

			// normal case
			$component = component_common::get_instance(
				$element->model, // string model
				$element->tipo, // string tipo
				$element->section_id, // string section_id
				$element->mode, // string mode
				$element->lang, // string lang
				$element->section_tipo // string section_tipo
			);

			$result = $component->get_sortable();

			$this->assertTrue(
				gettype($result)==='boolean',
				'expected type boolean : ' . PHP_EOL
					. gettype($result)
			);
			$this->assertTrue(
				$result===false,
				'expected result->result false : ' . PHP_EOL
					. json_encode($result)
			);
			// $this->assertTrue(
			// 	in_array('invalid quality', $result->errors),
			// 	'expected error invalid quality : ' . PHP_EOL
			// 		. json_encode($result)
			// );
		}
	}//end test_get_sortable



	/**
	* TEST_get_quality_files
	* @return void
	*/
	public function test_get_quality_files() {

		foreach (get_elements() as $element) {

			if (!in_array($element->model, component_media_common::get_media_components())) {
				continue;
			}

			$_ENV['DEDALO_LAST_ERROR'] = null; // reset

			// original case
				$component = component_common::get_instance(
					$element->model, // string model
					$element->tipo, // string tipo
					$element->section_id, // string section_id
					$element->mode, // string mode
					$element->lang, // string lang
					$element->section_tipo // string section_tipo
				);

				$result = $component->get_quality_files(
					$component->get_original_quality()
				);

				$this->assertTrue(
					gettype($result)==='array',
					'expected type array : ' . PHP_EOL
						. gettype($result)
				);


			// default quality case
				$component = component_common::get_instance(
					$element->model, // string model
					$element->tipo, // string tipo
					$element->section_id, // string section_id
					$element->mode, // string mode
					$element->lang, // string lang
					$element->section_tipo // string section_tipo
				);

				$result = $component->get_quality_files(
					$component->get_original_quality()
				);

				$this->assertTrue(
					gettype($result)==='array',
					'expected type array : ' . PHP_EOL
						. gettype($result)
				);
		}
	}//end test_get_quality_files



	/**
	* TEST_get_normalized_name_from_files
	* @return void
	*/
	public function test_get_normalized_name_from_files() {

		foreach (get_elements() as $element) {

			if (!in_array($element->model, component_media_common::get_media_components())) {
				continue;
			}

			$_ENV['DEDALO_LAST_ERROR'] = null; // reset

			// normal case
			$component = component_common::get_instance(
				$element->model, // string model
				$element->tipo, // string tipo
				$element->section_id, // string section_id
				$element->mode, // string mode
				$element->lang, // string lang
				$element->section_tipo // string section_tipo
			);

			$result = $component->get_normalized_name_from_files(
				$component->get_original_quality()
			);

			$this->assertTrue(
				gettype($result)==='string' || gettype($result)==='NULL',
				'expected type string|null : ' . PHP_EOL
					. gettype($result)
			);
			// $this->assertTrue(
			// 	$result===false,
			// 	'expected result->result false : ' . PHP_EOL
			// 		. json_encode($result)
			// );
			// $this->assertTrue(
			// 	in_array('invalid quality', $result->errors),
			// 	'expected error invalid quality : ' . PHP_EOL
			// 		. json_encode($result)
			// );
		}
	}//end test_get_normalized_name_from_files



	/**
	* TEST_get_uploaded_file
	* @return void
	*/
	public function test_get_uploaded_file() {

		foreach (get_elements() as $element) {

			if (!in_array($element->model, component_media_common::get_media_components())) {
				continue;
			}

			$_ENV['DEDALO_LAST_ERROR'] = null; // reset

			// normal case
			$component = component_common::get_instance(
				$element->model, // string model
				$element->tipo, // string tipo
				$element->section_id, // string section_id
				$element->mode, // string mode
				$element->lang, // string lang
				$element->section_tipo // string section_tipo
			);

			$result = $component->get_uploaded_file(
				$component->get_original_quality()
			);

			$this->assertTrue(
				gettype($result)==='string' || gettype($result)==='NULL',
				'expected type string|null : ' . PHP_EOL
					. gettype($result)
			);
			// $this->assertTrue(
			// 	$result===false,
			// 	'expected result->result false : ' . PHP_EOL
			// 		. json_encode($result)
			// );
			// $this->assertTrue(
			// 	in_array('invalid quality', $result->errors),
			// 	'expected error invalid quality : ' . PHP_EOL
			// 		. json_encode($result)
			// );
		}
	}//end test_get_uploaded_file



	/**
	* TEST_get_quality_file_info
	* @return void
	*/
	public function test_get_quality_file_info() {

		foreach (get_elements() as $element) {

			if (!in_array($element->model, component_media_common::get_media_components())) {
				continue;
			}

			$_ENV['DEDALO_LAST_ERROR'] = null; // reset

			// normal case
				$component = component_common::get_instance(
					$element->model, // string model
					$element->tipo, // string tipo
					$element->section_id, // string section_id
					$element->mode, // string mode
					$element->lang, // string lang
					$element->section_tipo // string section_tipo
				);

				$ar_quality = [
					$component->get_original_quality(),
					$component->get_default_quality()
				];
				foreach($ar_quality as $quality) {

					$result = $component->get_quality_file_info(
						$quality
					);

					$this->assertTrue(
						gettype($result)==='object',
						'expected type object : ' . PHP_EOL
							. gettype($result)
					);

				}
			// $this->assertTrue(
			// 	$result===false,
			// 	'expected result->result false : ' . PHP_EOL
			// 		. json_encode($result)
			// );
			// $this->assertTrue(
			// 	in_array('invalid quality', $result->errors),
			// 	'expected error invalid quality : ' . PHP_EOL
			// 		. json_encode($result)
			// );
		}
	}//end test_get_quality_file_info



	/**
	* TEST_get_target_filename
	* @return void
	*/
	public function test_get_target_filename() {

		foreach (get_elements() as $element) {

			if (!in_array($element->model, component_media_common::get_media_components())) {
				continue;
			}

			$_ENV['DEDALO_LAST_ERROR'] = null; // reset

			// normal case
				$component = component_common::get_instance(
					$element->model, // string model
					$element->tipo, // string tipo
					$element->section_id, // string section_id
					$element->mode, // string mode
					$element->lang, // string lang
					$element->section_tipo // string section_tipo
				);
				$result = $component->get_target_filename();

				$this->assertTrue(
					gettype($result)==='string',
					'expected type string : ' . PHP_EOL
						. gettype($result)
				);

			// $this->assertTrue(
			// 	$result===false,
			// 	'expected result->result false : ' . PHP_EOL
			// 		. json_encode($result)
			// );
			// $this->assertTrue(
			// 	in_array('invalid quality', $result->errors),
			// 	'expected error invalid quality : ' . PHP_EOL
			// 		. json_encode($result)
			// );
		}
	}//end test_get_target_filename



	/**
	* TEST_get_source_quality_to_build
	* @return void
	*/
	public function test_get_source_quality_to_build() {

		foreach (get_elements() as $element) {

			if (!in_array($element->model, component_media_common::get_media_components())) {
				continue;
			}

			$_ENV['DEDALO_LAST_ERROR'] = null; // reset

			// normal case
				$component = component_common::get_instance(
					$element->model, // string model
					$element->tipo, // string tipo
					$element->section_id, // string section_id
					$element->mode, // string mode
					$element->lang, // string lang
					$element->section_tipo // string section_tipo
				);
				$result = $component->get_source_quality_to_build(
					$component->get_default_quality()
				);

				$this->assertTrue(
					gettype($result)==='string' || gettype($result)==='NULL',
					'expected type string|null : ' . PHP_EOL
						. gettype($result)
				);

			// $this->assertTrue(
			// 	$result===false,
			// 	'expected result->result false : ' . PHP_EOL
			// 		. json_encode($result)
			// );
			// $this->assertTrue(
			// 	in_array('invalid quality', $result->errors),
			// 	'expected error invalid quality : ' . PHP_EOL
			// 		. json_encode($result)
			// );
		}
	}//end test_get_source_quality_to_build



	/**
	* TEST_get_original_extension
	* @return void
	*/
	public function test_get_original_extension() {

		foreach (get_elements() as $element) {

			if (!in_array($element->model, component_media_common::get_media_components())) {
				continue;
			}

			$_ENV['DEDALO_LAST_ERROR'] = null; // reset

			// normal case
				$component = component_common::get_instance(
					$element->model, // string model
					$element->tipo, // string tipo
					$element->section_id, // string section_id
					$element->mode, // string mode
					$element->lang, // string lang
					$element->section_tipo // string section_tipo
				);
				$result = $component->get_original_extension();

				$this->assertTrue(
					gettype($result)==='string' || gettype($result)==='NULL',
					'expected type string|null : ' . PHP_EOL
						. gettype($result)
				);
		}
	}//end test_get_original_extension



	/**
	* TEST_get_original_file_path
	* @return void
	*/
	public function test_get_original_file_path() {

		foreach (get_elements() as $element) {

			if (!in_array($element->model, component_media_common::get_media_components())) {
				continue;
			}

			$_ENV['DEDALO_LAST_ERROR'] = null; // reset

			// normal case
				$component = component_common::get_instance(
					$element->model, // string model
					$element->tipo, // string tipo
					$element->section_id, // string section_id
					$element->mode, // string mode
					$element->lang, // string lang
					$element->section_tipo // string section_tipo
				);
				$result = $component->get_original_file_path();

				$this->assertTrue(
					gettype($result)==='string' || gettype($result)==='NULL',
					'expected type string|null : ' . PHP_EOL
						. gettype($result)
				);

			// $this->assertTrue(
			// 	$result===false,
			// 	'expected result->result false : ' . PHP_EOL
			// 		. json_encode($result)
			// );
			// $this->assertTrue(
			// 	in_array('invalid quality', $result->errors),
			// 	'expected error invalid quality : ' . PHP_EOL
			// 		. json_encode($result)
			// );
		}
	}//end test_get_original_file_path



	/**
	* TEST_get_media_path_dir
	* @return void
	*/
	public function test_get_media_path_dir() {

		foreach (get_elements() as $element) {

			if (!in_array($element->model, component_media_common::get_media_components())) {
				continue;
			}

			$_ENV['DEDALO_LAST_ERROR'] = null; // reset

			// normal case
				$component = component_common::get_instance(
					$element->model, // string model
					$element->tipo, // string tipo
					$element->section_id, // string section_id
					$element->mode, // string mode
					$element->lang, // string lang
					$element->section_tipo // string section_tipo
				);
				$result = $component->get_media_path_dir(
					$component->get_default_quality()
				);

				$this->assertTrue(
					gettype($result)==='string',
					'expected type string : ' . PHP_EOL
						. gettype($result)
				);

			// $this->assertTrue(
			// 	$result===false,
			// 	'expected result->result false : ' . PHP_EOL
			// 		. json_encode($result)
			// );
			// $this->assertTrue(
			// 	in_array('invalid quality', $result->errors),
			// 	'expected error invalid quality : ' . PHP_EOL
			// 		. json_encode($result)
			// );
		}
	}//end test_get_media_path_dir



	/**
	* TEST_get_media_url_dir
	* @return void
	*/
	public function test_get_media_url_dir() {

		// default dato
		foreach (get_elements() as $element) {
			$_ENV['DEDALO_LAST_ERROR'] = null; // reset

			// ignore non media components
			if (!in_array($element->model, component_media_common::get_media_components())) {
				continue;
			}

			$component = component_common::get_instance(
				$element->model, // string model
				$element->tipo, // string tipo
				$element->section_id, // string section_id
				$element->mode, // string mode
				$element->lang, // string lang
				$element->section_tipo, // string section_tipo
				false
			);

			$quality = $component->get_default_quality();

			$result = $component->get_media_url_dir( $quality );

			$this->assertTrue(
				gettype($result)==='string',
				'expected type string : ' . PHP_EOL
					. gettype($result)
			);

			$this->assertTrue(
				strpos($result, 'http')!==0,
				'unexpected http protocol in relative URL : ' . PHP_EOL
					. to_string($result)
			);
		}//end foreach (get_elements() as $element)
	}//end test_get_media_url_dir



	/**
	* TEST_get_url
	* @return void
	*/
	public function test_get_url() {

		foreach (get_elements() as $element) {

			if (!in_array($element->model, component_media_common::get_media_components())) {
				continue;
			}

			$_ENV['DEDALO_LAST_ERROR'] = null; // reset

			// normal case
				$component = component_common::get_instance(
					$element->model, // string model
					$element->tipo, // string tipo
					$element->section_id, // string section_id
					$element->mode, // string mode
					$element->lang, // string lang
					$element->section_tipo // string section_tipo
				);

				$result = $component->get_url(
					$component->get_default_quality()
				);

				$this->assertTrue(
					gettype($result)==='string',
					'expected type string : ' . PHP_EOL
						. gettype($result)
				);

			// absolute
				$result = $component->get_url(
					$component->get_default_quality(),
					false, // test_file
					true, // absolute
					false // default_add
				);

				$this->assertTrue(
					gettype($result)==='string',
					'expected type string : ' . PHP_EOL
						. gettype($result)
				);
				$this->assertTrue(
					strpos($result, 'http')!==false,
					'expected http : ' . PHP_EOL
						. json_encode($result)
				);

			// $this->assertTrue(
			// 	$result===false,
			// 	'expected result->result false : ' . PHP_EOL
			// 		. json_encode($result)
			// );
			// $this->assertTrue(
			// 	in_array('invalid quality', $result->errors),
			// 	'expected error invalid quality : ' . PHP_EOL
			// 		. json_encode($result)
			// );
		}
	}//end test_get_url



	/**
	* test_get_thumb_url
	* @return void
	*/
	public function test_get_thumb_url() {

		foreach (get_elements() as $element) {

			if (!in_array($element->model, component_media_common::get_media_components())) {
				continue;
			}

			$_ENV['DEDALO_LAST_ERROR'] = null; // reset

			$component = component_common::get_instance(
				$element->model, // string model
				$element->tipo, // string tipo
				$element->section_id, // string section_id
				$element->mode, // string mode
				$element->lang, // string lang
				$element->section_tipo // string section_tipo
			);

			$result = $component->get_thumb_url();

			$this->assertTrue(
				gettype($result)==='string' || gettype($result)==='NULL',
				'expected type string|null : ' . PHP_EOL
					. gettype($result)
			);
			if (!empty($result)) {
				$this->assertTrue(
					strpos($result, 'http')!==0,
					'unexpected http protocol in relative URL : ' . PHP_EOL
						. to_string($result)
				);
			}
		}
	}//end test_get_thumb_url



	/**
	* TEST_regenerate_component
	* @return void
	*/
	public function test_regenerate_component() {

		foreach (get_elements() as $element) {

			if (!in_array($element->model, component_media_common::get_media_components())) {
				continue;
			}

			$_ENV['DEDALO_LAST_ERROR'] = null; // reset

			// normal case
				$component = component_common::get_instance(
					$element->model, // string model
					$element->tipo, // string tipo
					$element->section_id, // string section_id
					$element->mode, // string mode
					$element->lang, // string lang
					$element->section_tipo // string section_tipo
				);

				$dato = $component->get_dato();

				$result = $component->regenerate_component();

				$this->assertTrue(
					gettype($result)==='boolean',
					'expected type boolean : ' . PHP_EOL
						. gettype($result)
				);

				if (!empty($dato)) {
					$this->assertTrue(
						$result === true,
						'expected true : ' . PHP_EOL
							. json_encode($result)
					);
				}

			// $this->assertTrue(
			// 	$result===false,
			// 	'expected result->result false : ' . PHP_EOL
			// 		. json_encode($result)
			// );
			// $this->assertTrue(
			// 	in_array('invalid quality', $result->errors),
			// 	'expected error invalid quality : ' . PHP_EOL
			// 		. json_encode($result)
			// );
		}
	}//end test_regenerate_component



	/**
	* TEST_get_media_filepath
	* @return void
	*/
	public function test_get_media_filepath() {

		// default dato
		foreach (get_elements() as $element) {
			$_ENV['DEDALO_LAST_ERROR'] = null; // reset

			// ignore non media components
			if (!in_array($element->model, component_media_common::get_media_components())) {
				continue;
			}

			$component = component_common::get_instance(
				$element->model, // string model
				$element->tipo, // string tipo
				$element->section_id, // string section_id
				$element->mode, // string mode
				$element->lang, // string lang
				$element->section_tipo, // string section_tipo
				false
			);

			$result = $component->get_media_filepath();

			$this->assertTrue(
				gettype($result)==='string',
				'expected type string : ' . PHP_EOL
					. gettype($result)
			);
		}//end foreach (get_elements() as $element)
	}//end test_get_media_filepath



	/**
	* TEST_set_quality
	* @return void
	*/
	public function test_set_quality() {

		// default dato
		foreach (get_elements() as $element) {
			$_ENV['DEDALO_LAST_ERROR'] = null; // reset

			// ignore non media components
			if (!in_array($element->model, component_media_common::get_media_components())) {
				continue;
			}

			$component = component_common::get_instance(
				$element->model, // string model
				$element->tipo, // string tipo
				$element->section_id, // string section_id
				$element->mode, // string mode
				$element->lang, // string lang
				$element->section_tipo, // string section_tipo
				false
			);

			$result = $component->set_quality('patata');

			$this->assertTrue(
				gettype($result)==='boolean',
				'expected type boolean : ' . PHP_EOL
					. gettype($result)
			);

			$this->assertTrue(
				$result===false,
				'expected false : ' . PHP_EOL
					. to_string($result)
			);

			$result = $component->set_quality('original');

			$this->assertTrue(
				$result===true,
				'expected true : ' . PHP_EOL
					. to_string($result)
			);
		}//end foreach (get_elements() as $element)
	}//end test_set_quality



	/**
	* TEST_get_size
	* @return void
	*/
	public function test_get_size() {

		// default dato
		foreach (get_elements() as $element) {
			$_ENV['DEDALO_LAST_ERROR'] = null; // reset

			// ignore non media components
			if (!in_array($element->model, component_media_common::get_media_components())) {
				continue;
			}

			$component = component_common::get_instance(
				$element->model, // string model
				$element->tipo, // string tipo
				$element->section_id, // string section_id
				$element->mode, // string mode
				$element->lang, // string lang
				$element->section_tipo, // string section_tipo
				false
			);

			$quality = $component->get_default_quality();

			$result = $component->get_size( $quality );

			$this->assertTrue(
				gettype($result)==='string' || gettype($result)==='NULL',
				'expected type string or NULL : ' . PHP_EOL
					. gettype($result)
			);
		}//end foreach (get_elements() as $element)
	}//end test_get_size



	/**
	* TEST_restore_component_media_files
	* @return void
	*/
	public function test_restore_component_media_files() {

		// default dato
		foreach (get_elements() as $element) {
			$_ENV['DEDALO_LAST_ERROR'] = null; // reset

			// ignore non media components
			if (!in_array($element->model, component_media_common::get_media_components())) {
				continue;
			}

			$component = component_common::get_instance(
				$element->model, // string model
				$element->tipo, // string tipo
				$element->section_id, // string section_id
				$element->mode, // string mode
				$element->lang, // string lang
				$element->section_tipo // string section_tipo
			);

			$result = $component->restore_component_media_files();

			$this->assertTrue(
				gettype($result)==='boolean',
				'expected type boolean : ' . PHP_EOL
					. gettype($result)
			);
		}//end foreach (get_elements() as $element)
	}//end test_restore_component_media_files



	/**
	* TEST_build_version
	* @return void
	*/
	public function test_build_version() {

		// default dato
		foreach (get_elements() as $element) {
			$_ENV['DEDALO_LAST_ERROR'] = null; // reset

			// ignore non media components
			if (!in_array($element->model, component_media_common::get_media_components())) {
				continue;
			}

			$component = component_common::get_instance(
				$element->model, // string model
				$element->tipo, // string tipo
				$element->section_id, // string section_id
				$element->mode, // string mode
				$element->lang, // string lang
				$element->section_tipo // string section_tipo
			);

			$quality = $component->get_default_quality();

			$result = $component->build_version( $quality );

			$this->assertTrue(
				gettype($result)==='object',
				'expected type object : ' . PHP_EOL
					. gettype($result)
			);
		}//end foreach (get_elements() as $element)
	}//end test_build_version



	/**
	* TEST_update_component_dato_files_info
	* @return void
	*/
	public function test_update_component_dato_files_info() {

		// default dato
		foreach (get_elements() as $element) {
			$_ENV['DEDALO_LAST_ERROR'] = null; // reset

			// ignore non media components
			if (!in_array($element->model, component_media_common::get_media_components())) {
				continue;
			}

			$component = component_common::get_instance(
				$element->model, // string model
				$element->tipo, // string tipo
				$element->section_id, // string section_id
				$element->mode, // string mode
				$element->lang, // string lang
				$element->section_tipo, // string section_tipo
				false
			);

			$result = $component->update_component_dato_files_info();

			$this->assertTrue(
				gettype($result)==='boolean',
				'expected type boolean : ' . PHP_EOL
					. gettype($result)
			);
		}//end foreach (get_elements() as $element)
	}//end test_update_component_dato_files_info



	/**
	* TEST_SAVE
	* @return void
	*/
	public function test_Save() {

		foreach (get_elements() as $element) {

			if (!in_array($element->model, component_media_common::get_media_components())) {
				continue;
			}

			$_ENV['DEDALO_LAST_ERROR'] = null; // reset

			$section_id = 1;

			$component = component_common::get_instance(
				$element->model, // string model
				$element->tipo, // string tipo
				$section_id, // string section_id
				$element->mode, // string mode
				$element->lang, // string lang
				$element->section_tipo // string section_tipo
			);

			$result = $component->Save();

			$this->assertTrue(
				gettype($result)==='integer' || gettype($result)==='NULL',
				'expected type integer|null : ' . PHP_EOL
					. gettype($result)
			);

			$this->assertTrue(
				$result===$section_id,
				'expected integer '.$section_id . PHP_EOL
					. to_string($result)
			);
		}
	}//end test_Save



	/**
	* TEST_resolve_query_object_sql
	* @return void
	*/
	public function test_resolve_query_object_sql() {

		// default dato
		foreach (get_elements() as $element) {
			$_ENV['DEDALO_LAST_ERROR'] = null; // reset

			// ignore non media components
			if (!in_array($element->model, component_media_common::get_media_components())) {
				continue;
			}

			$component = component_common::get_instance(
				$element->model, // string model
				$element->tipo, // string tipo
				$element->section_id, // string section_id
				$element->mode, // string mode
				$element->lang, // string lang
				$element->section_tipo, // string section_tipo
				false
			);

			$query_object = (object)[
				'fake_query_object' => true
			];

			$result = $component->resolve_query_object_sql( $query_object );

			$this->assertTrue(
				gettype($result)==='object',
				'expected type object : ' . PHP_EOL
					. gettype($result)
			);
		}//end foreach (get_elements() as $element)
	}//end test_resolve_query_object_sql

















}//end class component_media_common_test
