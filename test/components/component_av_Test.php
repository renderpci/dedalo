<?php declare(strict_types=1);
// PHPUnit classes
use PHPUnit\Framework\TestCase;
use PHPUnit\Framework\Attributes\TestDox;
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';



final class component_av_test extends TestCase {



	public static $model		= 'component_av';
	public static $tipo			= 'test94';
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
			$result===DEDALO_AV_AR_QUALITY,
			'expected DEDALO_AV_AR_QUALITY ' . PHP_EOL
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
			$result===DEDALO_AV_QUALITY_DEFAULT,
			'expected DEDALO_AV_QUALITY_DEFAULT ' . PHP_EOL
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
			$result===DEDALO_AV_QUALITY_ORIGINAL,
			'expected DEDALO_AV_QUALITY_ORIGINAL ' . PHP_EOL
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
			$result===DEDALO_AV_EXTENSION,
			'expected DEDALO_AV_EXTENSION ' . PHP_EOL
				. json_encode($result)
		);

		// set custom value
		$component->extension = 'kyt';

		$result = $component->get_extension();

		$this->assertTrue(
			$result==='kyt',
			'expected kyt ' . PHP_EOL
				. json_encode($result)
		);

		// restore extension
		$component->extension = DEDALO_AV_EXTENSION;
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
			$result===DEDALO_AV_EXTENSIONS_SUPPORTED,
			'expected DEDALO_AV_EXTENSIONS_SUPPORTED ' . PHP_EOL
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
			$result===DEDALO_AV_FOLDER,
			'expected DEDALO_AV_FOLDER ' . PHP_EOL
				. json_encode($result)
		);

		$original_folder = $component->get_folder();

		// set custom

		$component->folder = '/atke';

		$result = $component->get_folder();

		$this->assertTrue(
			$result==='/atke',
			'expected /atke ' . PHP_EOL
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
	* TEST_get_valor_export
	* @return void
	*/
	public function test_get_valor_export() {

		$component = $this->build_component_instance();

		$result = $component->get_valor_export();

		$this->assertTrue(
			gettype($result)==='string' || gettype($result)==='NULL',
			'expected type string|null : ' . PHP_EOL
				. gettype($result)
		);
	}//end test_get_valor_export



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

		$tipo			= $component->get_tipo();
		$section_tipo	= $component->get_section_tipo();
		$section_id		= $component->get_section_id();

		$reference_value = $tipo .'_'. $section_tipo .'_'. $section_id .'.'. DEDALO_AV_POSTERFRAME_EXTENSION;

		$this->assertTrue(
			$result===$reference_value,
			'expected value : ' . $reference_value . PHP_EOL
				. to_string($result)
		);
	}//end test_get_posterframe_file_name



	/**
	* TEST_get_posterframe_filepath
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

		$result = $component->create_posterframe(0, 'fake_quality');

		$this->assertTrue(
			gettype($result)==='boolean',
			'expected type boolean : ' . PHP_EOL
				. gettype($result)
		);

		// $this->assertTrue(
		// 	$result===false,
		// 	'unexpected result false : ' . PHP_EOL
		// 		. to_string($result)
		// );
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
	* TEST_get_subtitles_path
	* @return void
	*/
	public function test_get_subtitles_path() {

		$component = $this->build_component_instance();

		$result = $component->get_subtitles_path();

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
	}//end test_get_subtitles_path



	/**
	* TEST_get_subtitles_url
	* @return void
	*/
	public function test_get_subtitles_url() {

		$component = $this->build_component_instance();

		$result = $component->get_subtitles_url();

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
	}//end test_get_subtitles_url



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
	* TEST_get_video_size
	* @return void
	*/
	public function test_get_video_size() {

		$component = $this->build_component_instance();

		$quality = $component->get_original_quality();

		$result = $component->get_video_size( $quality );

		$this->assertTrue(
			gettype($result)==='string' || gettype($result)==='NULL',
			'expected type string|null : ' . PHP_EOL
				. gettype($result)
		);
	}//end test_get_video_size



	/**
	* TEST_get_duration
	* @return void
	*/
	public function test_get_duration() {

		$component = $this->build_component_instance();

		$quality = null; // $component->get_original_quality();

		$result = $component->get_duration( $quality );

		$this->assertTrue(
			gettype($result)==='double',
			'expected type double : ' . PHP_EOL
				. gettype($result)
		);
	}//end test_get_duration



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
	* TEST_move_zip_file
	* @return void
	*/
	public function test_move_zip_file() {

		$component = $this->build_component_instance();

		$result = $component->move_zip_file('', '', '');

		$this->assertTrue(
			gettype($result)==='object',
			'expected type object : ' . PHP_EOL
				. gettype($result)
		);
	}//end test_move_zip_file



	/**
	* TEST_process_uploaded_file
	* @return void
	*/
	public function test_process_uploaded_file() {

		$component = $this->build_component_instance();

		$response = $component->process_uploaded_file(
			(object)[
				'empty_vars' => null
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
	* TEST_get_media_streams
	* @return void
	*/
	public function test_get_media_streams() {

		$component = $this->build_component_instance();

		$quality = $component->get_default_quality();

		$result = $component->get_media_streams( $quality );

		$this->assertTrue(
			gettype($result)==='object' || gettype($result)==='NULL',
			'expected type object|NULL : ' . PHP_EOL
				. gettype($result)
		);
	}//end test_get_media_streams



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
	* TEST_build_version
	* @return void
	*/
	public function test_build_version() {

		$component = $this->build_component_instance();

		$quality = 'fake_quality'; // $component->get_default_quality();

		$response	= $component->build_version($quality);
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
	}//end test_build_version



	/**
	* TEST_conform_headers
	* @return void
	*/
	public function test_conform_headers() {

		$component = $this->build_component_instance();

		$quality = 'fake_quality'; // $component->get_default_quality();

		$response	= $component->conform_headers($quality);
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
	}//end test_conform_headers



	/**
	* TEST_get_media_attributes
	* @return void
	*/
	public function test_get_media_attributes() {

		$component = $this->build_component_instance();

		$response	= $component->get_media_attributes('fake_path');

		$this->assertTrue(
			gettype($response)==='object' || gettype($response)==='NULL',
			'expected type object|null : ' . PHP_EOL
				. gettype($response)
		);
	}//end test_get_media_attributes



	/**
	* TEST_update_dato_version
	* @return void
	*/
	public function test_update_dato_version() {

		$response = component_av::update_dato_version((object)[
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
	}//end test_update_dato_version



}//end class component_av_test
