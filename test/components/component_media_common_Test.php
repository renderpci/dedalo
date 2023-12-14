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

		$user_id = TEST_USER_ID; // Defined in boostrap

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
	* TEST_move_zip_file
	* @return void
	*/
	public function test_move_zip_file() {

		$response = component_media_common::move_zip_file(
			'fake_tipo1',
			'fake_folder_path',
			'fake_file_name'
		);

		$this->assertTrue(
			$response->result===false ,
			'expected result = false '. to_string($response->result===false)
		);
	}//end test_move_zip_file



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
					. gettype($result)
			);
		}
	}//end test_Save



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
		}
	}//end test_get_valor_export



	/**
	* test_get_thumb_path
	* @return void
	*/
	public function test_get_thumb_path() {

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

			$result = $component->get_thumb_path();

			$this->assertTrue(
				gettype($result)==='string',
				'expected type string : ' . PHP_EOL
					. gettype($result)
			);
		}
	}//end test_get_thumb_path



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

			$quality = $component->get_default_quality();

			$result = $component->update_component_dato_files_info( $quality );

			$this->assertTrue(
				gettype($result)==='boolean',
				'expected type boolean : ' . PHP_EOL
					. gettype($result)
			);
		}//end foreach (get_elements() as $element)
	}//end test_update_component_dato_files_info



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
	* TEST_get_media_path_dir
	* @return void
	*/
	public function test_get_media_path_dir() {

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

			$result = $component->get_media_path_dir( $quality );

			$this->assertTrue(
				gettype($result)==='string',
				'expected type string : ' . PHP_EOL
					. gettype($result)
			);
		}//end foreach (get_elements() as $element)
	}//end test_get_media_path_dir



	/**
	* TEST_get_target_dir
	* @return void
	*/
	public function test_get_target_dir() {

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

			$result = $component->get_target_dir( $quality );

			$this->assertTrue(
				gettype($result)==='string',
				'expected type string : ' . PHP_EOL
					. gettype($result)
			);

			$this->assertTrue(
				gettype($result)==='string',
				'expected type string : ' . PHP_EOL
					. gettype($result)
			);
		}//end foreach (get_elements() as $element)
	}//end test_get_target_dir



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
	* TEST_build_version
	* @return void
	*/
		// public function DES_test_build_version() {

		// 	// default dato
		// 	foreach (get_elements() as $element) {
		// 		$_ENV['DEDALO_LAST_ERROR'] = null; // reset

		// 		// ignore non media components
		// 		if (!in_array($element->model, component_media_common::get_media_components())) {
		// 			continue;
		// 		}

		// 		$component = component_common::get_instance(
		// 			$element->model, // string model
		// 			$element->tipo, // string tipo
		// 			$element->section_id, // string section_id
		// 			$element->mode, // string mode
		// 			$element->lang, // string lang
		// 			$element->section_tipo, // string section_tipo
		// 			false
		// 		);

		// 		$quality = $component->get_default_quality();

		// 		$result = $component->build_version( $quality );

		// 		$this->assertTrue(
		// 			gettype($result)==='object',
		// 			'expected type object : ' . PHP_EOL
		// 				. gettype($result)
		// 		);
		// 	}//end foreach (get_elements() as $element)
		// }//end test_build_version




}//end class component_media_common_test
