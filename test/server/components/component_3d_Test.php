<?php declare(strict_types=1);
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';



final class component_3d_test extends BaseTestCase {



	public static $model		= 'component_3d';
	public static $tipo			= 'test26';
	public static $section_tipo	= 'test3';



	/**
	* BUILD_COMPONENT_INSTANCE
	* @return
	*/
	private function build_component_instance() {

		$this->user_login();

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
	* TEST_get_ar_quality
	* @return void
	*/
	public function test_get_ar_quality() {

		$component = $this->build_component_instance();

		$result = $component->get_ar_quality();

		$this->assertTrue(
			gettype($result)==='array',
			'expected type array : ' . PHP_EOL
				. gettype($result)
		);

		$this->assertTrue(
			$result===DEDALO_3D_AR_QUALITY,
			'expected DEDALO_3D_AR_QUALITY ' . PHP_EOL
				. json_encode($result)
		);
	}//end test_get_ar_quality



	/**
	* TEST_get_default_quality
	* @return void
	*/
	public function test_get_default_quality() {

		$component = $this->build_component_instance();

		$result = $component->get_default_quality();

		$this->assertTrue(
			gettype($result)==='string',
			'expected type string : ' . PHP_EOL
				. gettype($result)
		);

		$this->assertTrue(
			$result===DEDALO_3D_QUALITY_DEFAULT,
			'expected DEDALO_3D_QUALITY_DEFAULT ' . PHP_EOL
				. json_encode($result)
		);
	}//end test_get_default_quality



	/**
	* TEST_get_original_quality
	* @return void
	*/
	public function test_get_original_quality() {

		$component = $this->build_component_instance();

		$result = $component->get_original_quality();

		$this->assertTrue(
			gettype($result)==='string',
			'expected type string : ' . PHP_EOL
				. gettype($result)
		);

		$this->assertTrue(
			$result===DEDALO_3D_QUALITY_ORIGINAL,
			'expected DEDALO_3D_QUALITY_ORIGINAL ' . PHP_EOL
				. json_encode($result)
		);
	}//end test_get_original_quality



	/**
	* TEST_get_extension
	* @return void
	*/
	public function test_get_extension() {

		$component = $this->build_component_instance();

		$result = $component->get_extension();

		$this->assertTrue(
			gettype($result)==='string',
			'expected type string : ' . PHP_EOL
				. gettype($result)
		);

		$this->assertTrue(
			$result===DEDALO_3D_EXTENSION,
			'expected DEDALO_3D_EXTENSION ' . PHP_EOL
				. json_encode($result)
		);

		// set custom value
		$component->extension = '3ds';

		$result = $component->get_extension();

		$this->assertTrue(
			$result==='3ds',
			'expected 3ds ' . PHP_EOL
				. json_encode($result)
		);
		// restore extension
		$component->extension = DEDALO_3D_EXTENSION;
	}//end test_get_extension



	/**
	* TEST_get_allowed_extensions
	* @return void
	*/
	public function test_get_allowed_extensions() {

		$component = $this->build_component_instance();

		$result = $component->get_allowed_extensions();

		$this->assertTrue(
			gettype($result)==='array',
			'expected type array : ' . PHP_EOL
				. gettype($result)
		);

		$this->assertTrue(
			$result===DEDALO_3D_EXTENSIONS_SUPPORTED,
			'expected DEDALO_3D_EXTENSIONS_SUPPORTED ' . PHP_EOL
				. json_encode($result)
		);
	}//end test_get_allowed_extensions



	/**
	* TEST_get_folder
	* @return void
	*/
	public function test_get_folder() {

		$component = $this->build_component_instance();

		$result = $component->get_folder();

		$this->assertTrue(
			gettype($result)==='string',
			'expected type string : ' . PHP_EOL
				. gettype($result)
		);

		$this->assertTrue(
			$result===DEDALO_3D_FOLDER,
			'expected DEDALO_3D_FOLDER ' . PHP_EOL
				. json_encode($result)
		);

		$original_folder = $component->get_folder();

		// set custom

		$component->folder = '/4d';

		$result = $component->get_folder();

		$this->assertTrue(
			$result==='/4d',
			'expected /4d ' . PHP_EOL
				. json_encode($result)
		);

		// restore
		$component->folder = $original_folder;
	}//end test_get_folder



	/**
	* TEST_get_grid_value
	* @return void
	*/
	public function test_get_grid_value() {

		$component = $this->build_component_instance();

		$result = $component->get_grid_value();

		$this->assertTrue(
			gettype($result)==='object',
			'expected type object : ' . PHP_EOL
				. gettype($result)
		);
	}//end test_get_grid_value



	/**
	* TEST_get_url
	* @return void
	*/
	public function test_get_url() {

		$component = $this->build_component_instance();

		$result = $component->get_url();

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
	}//end test_get_url



	/**
	* TEST_get_posterframe_file_name
	* @return void
	*/
	public function test_get_posterframe_file_name() {

		$component = $this->build_component_instance();

		$result = $component->get_posterframe_file_name();

		$this->assertTrue(
			gettype($result)==='string',
			'expected type string : ' . PHP_EOL
				. gettype($result)
		);

		$reference = "{$component->tipo}_{$component->section_tipo}_{$component->section_id}.jpg";

		$this->assertTrue(
			$result===$reference,
			'expected value : ' . $reference . PHP_EOL
				. to_string($result)
		);
	}//end test_get_posterframe_file_name



	/**
	* TEST_GET_POSTERFRAME_FILEPATH
	* @return void
	*/
	public function test_get_posterframe_filepath() {

		$component = $this->build_component_instance();

		$result = $component->get_posterframe_filepath();

		$this->assertTrue(
			gettype($result)==='string',
			'expected type string : ' . PHP_EOL
				. gettype($result)
		);
	}//end test_get_posterframe_filepath



	/**
	* TEST_get_posterframe_url
	* @return void
	*/
	public function test_get_posterframe_url() {

		$component = $this->build_component_instance();

		$result = $component->get_posterframe_url();

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
	}//end test_get_posterframe_url




	/**
	* TEST_create_posterframe
	* @return void
	*/
	public function test_create_posterframe() {

		$component = $this->build_component_instance();

		$result = $component->create_posterframe(0);

		$this->assertTrue(
			gettype($result)==='boolean',
			'expected type boolean : ' . PHP_EOL
				. gettype($result)
		);

		$this->assertTrue(
			$result===false,
			'unexpected result false : ' . PHP_EOL
				. to_string($result)
		);
	}//end test_create_posterframe



	/**
	* TEST_delete_posterframe
	* @return void
	*/
	public function test_delete_posterframe() {

		$component = $this->build_component_instance();

		// duplicate file
			$file = DEDALO_MEDIA_PATH .
				$component->get_folder() .
				'/posterframe' .
				$component->additional_path .'/'.
				$component->get_posterframe_file_name();

			if (file_exists($file)) {

				$duplicate = DEDALO_MEDIA_PATH .
					$component->get_folder() .
					'/posterframe' .
					$component->additional_path .'/'.
					'duplicate_'.$component->get_posterframe_file_name();

				copy($file, $duplicate);

				$result = $component->delete_posterframe();

				$this->assertTrue(
					gettype($result)==='boolean',
					'expected type boolean : ' . PHP_EOL
						. gettype($result)
				);

				$this->assertTrue(
					$result===true,
					'expected true : ' . PHP_EOL
						. to_string($result)
				);

				if (!file_exists($file)) {
					copy($duplicate, $file);
				}
			}else{

				$result = $component->delete_posterframe();

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
			}
	}//end test_delete_posterframe



	/**
	* TEST_get_original_file_path
	* @return void
	*/
	public function test_get_original_file_path() {

		$component = $this->build_component_instance();

		$quality = $component->get_original_quality();

		$result = $component->get_original_file_path( $quality );

		$this->assertTrue(
			gettype($result)==='string' || gettype($result)==='NULL',
			'expected type string|null : ' . PHP_EOL
				. gettype($result)
		);
	}//end test_get_original_file_path



	/**
	* TEST_remove_component_media_files
	* @return void
	*/
	public function test_remove_component_media_files() {

		$component = $this->build_component_instance();

		$result = $component->remove_component_media_files();

		$this->assertTrue(
			gettype($result)==='boolean',
			'expected type boolean : ' . PHP_EOL
				. gettype($result)
		);
	}//end test_remove_component_media_files



	/**
	* TEST_restore_component_media_files
	* @return void
	*/
	public function test_restore_component_media_files() {

		$component = $this->build_component_instance();

		$result = $component->restore_component_media_files();

		$this->assertTrue(
			gettype($result)==='boolean',
			'expected type boolean : ' . PHP_EOL
				. gettype($result)
		);
	}//end test_restore_component_media_files



	/**
	* TEST_process_uploaded_file
	* @return void
	*/
	public function test_process_uploaded_file() {

		$component = $this->build_component_instance();

		$response = $component->process_uploaded_file(
			(object)[
				'empty_vars' => null,
			],
			null
		);
		$result = $response->result;

		$this->assertTrue(
			gettype($result)==='boolean',
			'expected type boolean : ' . PHP_EOL
				. gettype($result)
		);
	}//end test_process_uploaded_file



	/**
	* TEST_delete_file
	* @return void
	*/
	public function test_delete_file() {

		$component = $this->build_component_instance();

		$quality = 'fake_quality'; // $component->get_default_quality();

		$response	= $component->delete_file($quality);

		$result		= $response->result;

		$this->assertTrue(
			gettype($response)==='object',
			'expected type object : ' . PHP_EOL
				. gettype($response)
		);
		$this->assertTrue(
			gettype($result)==='boolean',
			'expected type boolean : ' . PHP_EOL
				. gettype($result)
		);
	}//end test_delete_file



	/**
	* TEST_update_data_version
	* @return void
	*/
	public function test_update_data_version() {

		$response = component_3d::update_data_version((object)[
			'update_version' => [99,99,99]
		]);

		$result = $response->result;

		$this->assertTrue(
			gettype($response)==='object',
			'expected type object : ' . PHP_EOL
				. gettype($response)
		);

		$this->assertTrue(
			gettype($result)==='integer',
			'expected type integer : ' . PHP_EOL
				. gettype($result)
		);

		$this->assertTrue(
			$result===0,
			'expected 0 : ' . PHP_EOL
				. to_string($result)
		);
	}//end test_update_data_version



	/**
	* TEST_get_normalized_ar_quality
	* @return void
	*/
	public function test_get_normalized_ar_quality() {

		$component = $this->build_component_instance();

		$result = $component->get_normalized_ar_quality();

		$this->assertTrue(
			gettype($result)==='array',
			'expected type array : ' . PHP_EOL
				. gettype($result)
		);

		$default_quality = $component->get_default_quality();
		$this->assertTrue(
			$result===[$default_quality],
			'expected array with default quality : ' . PHP_EOL
				. to_string($result)
		);
	}//end test_get_normalized_ar_quality



	/**
	* TEST_get_best_extensions
	* @return void
	*/
	public function test_get_best_extensions() {

		$component = $this->build_component_instance();

		$result = $component->get_best_extensions();

		$this->assertTrue(
			gettype($result)==='array',
			'expected type array : ' . PHP_EOL
				. gettype($result)
		);

		$this->assertTrue(
			$result===['glb'],
			'expected [\'glb\'] : ' . PHP_EOL
				. to_string($result)
		);
	}//end test_get_best_extensions



	/**
	* TEST_create_thumb
	* @return void
	*/
	public function test_create_thumb() {

		$component = $this->build_component_instance();

		// Test create_thumb
		$result = $component->create_thumb();

		$this->assertTrue(
			gettype($result)==='boolean',
			'expected type boolean : ' . PHP_EOL
				. gettype($result)
		);

		// Result depends on whether posterframe exists
		// If posterframe exists, it should return true
		// If posterframe doesn't exist, it should return false
		$posterframe_exists = file_exists($component->get_posterframe_filepath());

		if ($posterframe_exists) {
			$this->assertTrue(
				$result===true,
				'expected true when posterframe exists : ' . PHP_EOL
					. to_string($result)
			);
		} else {
			$this->assertTrue(
				$result===false,
				'expected false when posterframe does not exist : ' . PHP_EOL
					. to_string($result)
			);
		}
	}//end test_create_thumb



	/**
	* TEST_get_media_attributes
	* @return void
	*/
	public function test_get_media_attributes() {

		$component = $this->build_component_instance();

		$file_path = '/fake/path/to/file.glb';

		// This method is not implemented yet, so we just test it doesn't throw
		$result = $component->get_media_attributes($file_path);

		// Method returns null currently (not implemented)
		$this->assertTrue(
			true,
			'method executed without throwing exception'
		);
	}//end test_get_media_attributes



	/**
	* TEST_get_id
	* @return void
	*/
	public function test_get_id() {

		$component = $this->build_component_instance();

		$result = $component->get_id();

		$this->assertTrue(
			gettype($result)==='string',
			'expected type string : ' . PHP_EOL
				. gettype($result)
		);

		$expected = $component->tipo . '_' . $component->section_tipo . '_' . $component->section_id;
		$this->assertTrue(
			$result===$expected,
			'expected id format tipo_section_tipo_section_id : ' . PHP_EOL
				. to_string($result)
		);
	}//end test_get_id



	/**
	* TEST_get_media_filepath
	* @return void
	*/
	public function test_get_media_filepath() {

		$component = $this->build_component_instance();

		$quality = $component->get_default_quality();

		$result = $component->get_media_filepath($quality);

		$this->assertTrue(
			gettype($result)==='string',
			'expected type string : ' . PHP_EOL
				. gettype($result)
		);

		$this->assertTrue(
			strpos($result, DEDALO_MEDIA_PATH)===0,
			'expected path to start with DEDALO_MEDIA_PATH : ' . PHP_EOL
				. to_string($result)
		);
	}//end test_get_media_filepath



	/**
	* TEST_quality_file_exist
	* @return void
	*/
	public function test_quality_file_exist() {

		$component = $this->build_component_instance();

		$quality = $component->get_default_quality();

		$result = $component->quality_file_exist($quality);

		$this->assertTrue(
			gettype($result)==='boolean',
			'expected type boolean : ' . PHP_EOL
				. gettype($result)
		);
	}//end test_quality_file_exist



	/**
	* TEST_get_thumb_quality
	* @return void
	*/
	public function test_get_thumb_quality() {

		$component = $this->build_component_instance();

		$result = $component->get_thumb_quality();

		$this->assertTrue(
			gettype($result)==='string',
			'expected type string : ' . PHP_EOL
				. gettype($result)
		);

		$this->assertTrue(
			$result===DEDALO_QUALITY_THUMB,
			'expected DEDALO_QUALITY_THUMB : ' . PHP_EOL
				. to_string($result)
		);
	}//end test_get_thumb_quality



	/**
	* TEST_get_thumb_extension
	* @return void
	*/
	public function test_get_thumb_extension() {

		$component = $this->build_component_instance();

		$result = $component->get_thumb_extension();

		$this->assertTrue(
			gettype($result)==='string',
			'expected type string : ' . PHP_EOL
				. gettype($result)
		);

		$this->assertTrue(
			in_array($result, ['jpg', 'jpeg', 'png', 'webp']),
			'expected common image extension : ' . PHP_EOL
				. to_string($result)
		);
	}//end test_get_thumb_extension



	/**
	* TEST_get_posterframe_url_with_absolute
	* @return void
	*/
	public function test_get_posterframe_url_with_absolute() {

		$component = $this->build_component_instance();

		// Test with absolute URL
		$result = $component->get_posterframe_url(false, true);

		$this->assertTrue(
			gettype($result)==='string',
			'expected type string : ' . PHP_EOL
				. gettype($result)
		);

		$this->assertTrue(
			strpos($result, DEDALO_PROTOCOL . DEDALO_HOST)===0,
			'expected absolute URL with protocol and host : ' . PHP_EOL
				. to_string($result)
		);
	}//end test_get_posterframe_url_with_absolute



	/**
	* TEST_get_posterframe_url_with_cache_buster
	* @return void
	*/
	public function test_get_posterframe_url_with_cache_buster() {

		$component = $this->build_component_instance();

		// Test with cache buster
		$result = $component->get_posterframe_url(false, false, true);

		$this->assertTrue(
			gettype($result)==='string',
			'expected type string : ' . PHP_EOL
				. gettype($result)
		);

		$this->assertTrue(
			strpos($result, '?t=')!==false,
			'expected URL with cache buster parameter : ' . PHP_EOL
				. to_string($result)
		);
	}//end test_get_posterframe_url_with_cache_buster



	/////////// ⬇︎ Lifecycle tests ⬇︎ ////////////////



	/**
	* TEST_get_data
	* Retrieve current component data and verify structure
	* @return void
	*/
	public function test_get_data() {

		$component = $this->build_component_instance();

		$data = $component->get_data();

		$this->assertTrue(
			gettype($data)==='array',
			'expected type array : ' . PHP_EOL
				. gettype($data)
		);

		// if data exists, check structure of first item
		if (!empty($data) && isset($data[0]) && is_object($data[0])) {

			$item = $data[0];

			// files_info must be present
			$this->assertTrue(
				property_exists($item, 'files_info'),
				'expected files_info property in data item'
			);

			// files_info must be array
			$this->assertTrue(
				gettype($item->files_info)==='array',
				'expected files_info as array : ' . PHP_EOL
					. gettype($item->files_info)
			);

			// each files_info entry must have quality
			foreach ($item->files_info as $file_info) {
				$this->assertTrue(
					property_exists($file_info, 'quality'),
					'expected quality property in files_info entry'
				);
				$this->assertTrue(
					in_array($file_info->quality, DEDALO_3D_AR_QUALITY) || $file_info->quality===DEDALO_QUALITY_THUMB,
					'unexpected quality in files_info : ' . $file_info->quality
				);
			}
		}
	}//end test_get_data



	/**
	* TEST_set_data
	* Set data on the component and verify it was stored
	* @return void
	*/
	public function test_set_data() {

		$component = $this->build_component_instance();

		// backup original data
		$original_data = $component->get_data();

		// create test data
		$test_data = [(object)[
			'files_info'				=> [],
			'original_file_name'		=> 'test_file.glb',
			'original_normalized_name'	=> 'test26_test3_1.glb',
			'original_upload_date'		=> component_date::get_date_now()
		]];

		// set data
		$component->set_data($test_data);

		// verify data was set
		$result_data = $component->get_data();

		$this->assertTrue(
			gettype($result_data)==='array',
			'expected type array after set_data : ' . PHP_EOL
				. gettype($result_data)
		);

		$this->assertTrue(
			count($result_data)===1,
			'expected 1 data item after set_data : ' . PHP_EOL
				. count($result_data)
		);

		$this->assertTrue(
			$result_data[0]->original_file_name==='test_file.glb',
			'expected original_file_name to match : ' . PHP_EOL
				. to_string($result_data[0]->original_file_name)
		);

		// restore original data
		if (!empty($original_data)) {
			$component->set_data($original_data);
		}
	}//end test_set_data



	/**
	* TEST_set_data_empty
	* Set empty data and verify component handles it
	* @return void
	*/
	public function test_set_data_empty() {

		$component = $this->build_component_instance();

		// backup original data
		$original_data = $component->get_data();

		// set empty data
		$component->set_data([]);

		$result = $component->get_data();

		// get_data returns ?array, empty data may result in null or empty array
		$this->assertTrue(
			$result===null || (gettype($result)==='array' && count($result)===0),
			'expected null or empty array after set_data empty : ' . PHP_EOL
				. to_string($result)
		);

		// restore original data
		if (!empty($original_data)) {
			$component->set_data($original_data);
		}
	}//end test_set_data_empty



	/**
	* TEST_regenerate_component
	* Test that regenerate_component rebuilds derived qualities from original
	* @return void
	*/
	public function test_regenerate_component() {

		$component = $this->build_component_instance();

		$result = $component->regenerate_component();

		$this->assertTrue(
			gettype($result)==='boolean',
			'expected type boolean : ' . PHP_EOL
				. gettype($result)
		);

		// if original file exists, regenerate should succeed
		$original_file = $component->get_media_filepath($component->get_original_quality());
		if (file_exists($original_file)) {
			$this->assertTrue(
				$result===true,
				'expected true when original file exists : ' . PHP_EOL
					. to_string($result)
			);

			// after regeneration, default quality file should exist
			$default_file = $component->get_media_filepath($component->get_default_quality());
			$this->assertTrue(
				file_exists($default_file),
				'expected default quality file to exist after regenerate : ' . PHP_EOL
					. to_string($default_file)
			);
		}
	}//end test_regenerate_component



	/**
	* TEST_regenerate_component_no_delete
	* Test regenerate_component with delete_normalized_files=false
	* @return void
	*/
	public function test_regenerate_component_no_delete() {

		$component = $this->build_component_instance();

		$result = $component->regenerate_component((object)[
			'delete_normalized_files' => false
		]);

		$this->assertTrue(
			gettype($result)==='boolean',
			'expected type boolean : ' . PHP_EOL
				. gettype($result)
		);
	}//end test_regenerate_component_no_delete



	/**
	* TEST_delete_normalized_files
	* Test that delete_normalized_files moves normalized quality files to deleted folder
	* @return void
	*/
	public function test_delete_normalized_files() {

		$component = $this->build_component_instance();

		// backup: ensure default quality file exists for testing
		$default_quality	= $component->get_default_quality();
		$default_file		= $component->get_media_filepath($default_quality);
		$default_existed	= file_exists($default_file);

		// if default file exists, duplicate it so we can test deletion without losing data
		$duplicate_file = null;
		if ($default_existed) {
			$duplicate_file = $default_file . '.bak_test';
			copy($default_file, $duplicate_file);
		}

		$result = $component->delete_normalized_files();

		$this->assertTrue(
			gettype($result)==='boolean',
			'expected type boolean : ' . PHP_EOL
				. gettype($result)
		);

		// restore backup if it was made
		if ($default_existed && $duplicate_file && file_exists($duplicate_file)) {
			if (!file_exists($default_file)) {
				rename($duplicate_file, $default_file);
			}else{
				unlink($duplicate_file);
			}
		}
	}//end test_delete_normalized_files



	/**
	* TEST_build_version
	* Test that build_version creates the default quality from original
	* @return void
	*/
	public function test_build_version() {

		$component = $this->build_component_instance();

		$default_quality = $component->get_default_quality();
		$original_file	= $component->get_media_filepath($component->get_original_quality());

		// backup default file if it exists
		$default_file	= $component->get_media_filepath($default_quality);
		$duplicate_file	= null;
		if (file_exists($default_file)) {
			$duplicate_file = $default_file . '.bak_test';
			copy($default_file, $duplicate_file);
			unlink($default_file);
		}

		// only test if original file exists (build_version needs source)
		if (file_exists($original_file)) {

			$response = $component->build_version($default_quality, true, false);

			$this->assertTrue(
				gettype($response)==='object',
				'expected type object : ' . PHP_EOL
					. gettype($response)
			);

			$this->assertTrue(
				property_exists($response, 'result'),
				'expected result property in response'
			);

			// after build, default file should exist
			$this->assertTrue(
				file_exists($default_file),
				'expected default quality file to exist after build_version : ' . PHP_EOL
					. to_string($default_file)
			);
		}

		// restore backup
		if ($duplicate_file && file_exists($duplicate_file)) {
			if (file_exists($default_file)) {
				unlink($default_file);
			}
			rename($duplicate_file, $default_file);
		}
	}//end test_build_version



	/**
	* TEST_process_uploaded_file_empty_data
	* Test process_uploaded_file with empty/invalid data
	* @return void
	*/
	public function test_process_uploaded_file_empty_data() {

		$component = $this->build_component_instance();

		// empty file_data
		$response = $component->process_uploaded_file(null, null);

		$this->assertTrue(
			gettype($response)==='object',
			'expected type object : ' . PHP_EOL
				. gettype($response)
		);

		$this->assertTrue(
			$response->result===false,
			'expected result false with empty data : ' . PHP_EOL
				. to_string($response->result)
		);

		// missing fields
		$response = $component->process_uploaded_file((object)['original_file_name' => 'test.glb'], null);

		$this->assertTrue(
			$response->result===false,
			'expected result false with incomplete data : ' . PHP_EOL
				. to_string($response->result)
		);

		// non-existent file path
		$response = $component->process_uploaded_file((object)[
			'original_file_name'	=> 'test.glb',
			'full_file_name'		=> 'test26_test3_1.glb',
			'full_file_path'		=> '/non/existent/path/test26_test3_1.glb'
		], null);

		$this->assertTrue(
			$response->result===false,
			'expected result false with non-existent file path : ' . PHP_EOL
				. to_string($response->result)
		);
	}//end test_process_uploaded_file_empty_data



	/**
	* TEST_quality_file_exist_all_qualities
	* Test quality_file_exist for all configured qualities
	* @return void
	*/
	public function test_quality_file_exist_all_qualities() {

		$component = $this->build_component_instance();

		$ar_quality = $component->get_ar_quality();

		foreach ($ar_quality as $quality) {

			$result = $component->quality_file_exist($quality);

			$this->assertTrue(
				gettype($result)==='boolean',
				'expected type boolean for quality ' . $quality . ' : ' . PHP_EOL
					. gettype($result)
			);
		}
	}//end test_quality_file_exist_all_qualities



	/**
	* TEST_get_media_filepath_all_qualities
	* Test get_media_filepath returns valid paths for all qualities
	* @return void
	*/
	public function test_get_media_filepath_all_qualities() {

		$component = $this->build_component_instance();

		$ar_quality = $component->get_ar_quality();

		foreach ($ar_quality as $quality) {

			$result = $component->get_media_filepath($quality);

			$this->assertTrue(
				gettype($result)==='string',
				'expected type string for quality ' . $quality . ' : ' . PHP_EOL
					. gettype($result)
			);

			$this->assertTrue(
				strpos($result, DEDALO_MEDIA_PATH)===0,
				'expected path to start with DEDALO_MEDIA_PATH for quality ' . $quality . ' : ' . PHP_EOL
					. to_string($result)
			);

			$this->assertTrue(
				strpos($result, $quality)!==false,
				'expected path to contain quality name ' . $quality . ' : ' . PHP_EOL
					. to_string($result)
			);
		}
	}//end test_get_media_filepath_all_qualities



	/**
	* TEST_get_url_all_qualities
	* Test get_url returns valid URLs for all qualities
	* @return void
	*/
	public function test_get_url_all_qualities() {

		$component = $this->build_component_instance();

		$ar_quality = $component->get_ar_quality();

		foreach ($ar_quality as $quality) {

			$result = $component->get_url($quality);

			$this->assertTrue(
				gettype($result)==='string',
				'expected type string for quality ' . $quality . ' : ' . PHP_EOL
					. gettype($result)
			);

			$this->assertTrue(
				strpos($result, DEDALO_MEDIA_URL)===0,
				'expected URL to start with DEDALO_MEDIA_URL for quality ' . $quality . ' : ' . PHP_EOL
					. to_string($result)
			);
		}
	}//end test_get_url_all_qualities



	/**
	* TEST_get_uploaded_file
	* Test get_uploaded_file returns correct paths from component data
	* @return void
	*/
	public function test_get_uploaded_file() {

		$component = $this->build_component_instance();

		$ar_quality = $component->get_ar_quality();

		foreach ($ar_quality as $quality) {

			$result = $component->get_uploaded_file($quality);

			// result can be string or null depending on data state
			$this->assertTrue(
				gettype($result)==='string' || gettype($result)==='NULL',
				'expected type string|null for quality ' . $quality . ' : ' . PHP_EOL
					. gettype($result)
			);
		}
	}//end test_get_uploaded_file



	/**
	* TEST_component_instance_modes
	* Test component instantiation in different modes
	* @return void
	*/
	public function test_component_instance_modes() {

		$this->user_login();

		$ar_modes = ['edit', 'list', 'search'];

		foreach ($ar_modes as $mode) {

			$component = component_common::get_instance(
				self::$model,
				self::$tipo,
				1, // section_id
				$mode,
				DEDALO_DATA_NOLAN,
				self::$section_tipo
			);

			$this->assertTrue(
				$component->get_mode()===$mode,
				'expected mode ' . $mode . ' : ' . PHP_EOL
					. to_string($component->get_mode())
			);

			$this->assertTrue(
				gettype($component->get_tipo())==='string',
				'expected tipo as string'
			);

			$this->assertTrue(
				$component->get_section_id()===1,
				'expected section_id 1'
			);
		}
	}//end test_component_instance_modes



	/**
	* TEST_save_and_reload
	* Test that data survives a save/reload cycle
	* @return void
	*/
	public function test_save_and_reload() {

		$component = $this->build_component_instance();

		// backup original data
		$original_data = $component->get_data();

		// set test data
		$test_data = [(object)[
			'files_info'				=> [],
			'original_file_name'		=> 'save_reload_test.glb',
			'original_normalized_name'	=> 'test26_test3_1.glb',
			'original_upload_date'		=> component_date::get_date_now()
		]];
		$component->set_data($test_data);

		// save
		$component->Save();

		// reload with new instance
		$component2 = component_common::get_instance(
			self::$model,
			self::$tipo,
			1,
			'edit',
			DEDALO_DATA_NOLAN,
			self::$section_tipo
		);
		$reloaded_data = $component2->get_data();

		$this->assertTrue(
			count($reloaded_data) >= 1,
			'expected at least 1 data item after reload : ' . PHP_EOL
				. count($reloaded_data)
		);

		if (isset($reloaded_data[0]) && is_object($reloaded_data[0])) {
			$this->assertTrue(
				$reloaded_data[0]->original_file_name==='save_reload_test.glb',
				'expected original_file_name to survive save/reload : ' . PHP_EOL
					. to_string($reloaded_data[0]->original_file_name)
			);
		}

		// restore original data
		if (!empty($original_data)) {
			$component2->set_data($original_data);
			$component2->Save();
		}
	}//end test_save_and_reload



	/**
	* TEST_is_empty
	* Test is_empty and is_empty_data with various data states
	* Note: component_common::is_empty checks only the 'value' key.
	* Media components like component_3d store data in 'files_info' not 'value',
	* so is_empty_data returns true for data without a 'value' key by design.
	* @return void
	*/
	public function test_is_empty() {

		$component = $this->build_component_instance();

		// backup original data
		$original_data = $component->get_data();

		// test is_empty_data with null/empty data
		$result = $component->is_empty_data(null);
		$this->assertTrue(
			$result===true,
			'expected true with null data : ' . PHP_EOL
				. to_string($result)
		);

		$result = $component->is_empty_data([]);
		$this->assertTrue(
			$result===true,
			'expected true with empty array : ' . PHP_EOL
				. to_string($result)
		);

		// test is_empty with null
		$result = $component->is_empty(null);
		$this->assertTrue(
			$result===true,
			'expected true with null item : ' . PHP_EOL
				. to_string($result)
		);

		// test is_empty with object without value key (media component data)
		$media_item = (object)[
			'files_info'			=> [(object)['quality' => 'original']],
			'original_file_name'	=> 'test.glb'
		];
		$result = $component->is_empty($media_item);
		// is_empty only checks 'value' key, so media items without it are considered empty
		$this->assertTrue(
			$result===true,
			'expected true for media data item without value key : ' . PHP_EOL
				. to_string($result)
		);

		// test is_empty with object with non-empty value key
		$item_with_value = (object)[
			'value' => 'some_value'
		];
		$result = $component->is_empty($item_with_value);
		$this->assertTrue(
			$result===false,
			'expected false for data item with non-empty value : ' . PHP_EOL
				. to_string($result)
		);

		// test is_empty with object with empty value key
		$item_empty_value = (object)[
			'value' => ''
		];
		$result = $component->is_empty($item_empty_value);
		$this->assertTrue(
			$result===true,
			'expected true for data item with empty value : ' . PHP_EOL
				. to_string($result)
		);

		// restore original data
		if (!empty($original_data)) {
			$component->set_data($original_data);
		}
	}//end test_is_empty



	/**
	* TEST_get_identifier
	* Test get_identifier returns expected format
	* @return void
	*/
	public function test_get_identifier() {

		$component = $this->build_component_instance();

		$result = $component->get_identifier();

		$this->assertTrue(
			gettype($result)==='string',
			'expected type string : ' . PHP_EOL
				. gettype($result)
		);

		$expected = $component->tipo . '_' . $component->section_tipo . '_' . $component->section_id;
		$this->assertTrue(
			$result===$expected,
			'expected identifier format tipo_section_tipo_section_id : ' . PHP_EOL
				. 'expected: ' . $expected . PHP_EOL
				. 'result: ' . $result
		);
	}//end test_get_identifier



}//end class component_3d_test
