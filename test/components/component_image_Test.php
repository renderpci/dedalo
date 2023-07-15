<?php
declare(strict_types=1);
use PHPUnit\Framework\TestCase;
use PHPUnit\Framework\Attributes\TestDox;

// require_once dirname(dirname(__FILE__)). '/lib/vendor/autoload.php';
	require_once dirname(dirname(dirname(__FILE__))) . '/config/config.php';
	require_once dirname(dirname(__FILE__)) . '/login/login_Test.php';
	require_once 'data.php';
	require_once 'elements.php';

// check is development server. if not, throw to prevent malicious access
	if (!defined('DEVELOPMENT_SERVER') || DEVELOPMENT_SERVER!==true) {
		throw new Exception("Error. Only development servers can use this method", 1);
	}



final class component_image_test extends TestCase {



	public static $model		= 'component_image';
	public static $tipo			= 'test99';
	public static $section_tipo	= 'test3';



	/**
	* TEST_get_dato
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
	}//end test_get_dato



	/**
	* TEST_Save
	* @return void
	*/
	public function test_Save() {

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
	}//end test_Save



	/**
	* TEST_get_id
	* @return void
	*/
	public function test_get_id() {

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

		$result = $component->get_id();

		// sample result
			// 'test99_test3_1'

		$this->assertTrue(
			gettype($result)==='string',
			'expected type string : ' . PHP_EOL
				. gettype($result)
		);

		$this->assertTrue(
			$result===($tipo.'_'.$section_tipo.'_'.$section_id),
			'expected test99_test3_1 ' . PHP_EOL
				. $result
		);
	}//end test_get_id



	/**
	* TEST_get_url
	* @return void
	*/
	public function test_get_url() {

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

		// default
			$result = $component->get_url(
				DEDALO_IMAGE_QUALITY_DEFAULT,
				false, // test_file
				false, // absolute
				false // default_add
			);

			// expected sample
			// /media/image/1.5MB/test99_test3_1.jpg

			$this->assertTrue(
				gettype($result)==='string',
				'expected type string : ' . PHP_EOL
					. gettype($result)
			);

			$this->assertTrue(
				strpos($result, DEDALO_IMAGE_QUALITY_DEFAULT)!==false,
				'expected contains ' .DEDALO_IMAGE_QUALITY_DEFAULT. PHP_EOL
					. $result
			);

		// test_file
			$result = $component->get_url(
				DEDALO_IMAGE_QUALITY_DEFAULT,
				true, // test_file
				false, // absolute
				false // default_add
			);

			// expected sample
			// /media/image/1.5MB/test99_test3_1.jpg

			$this->assertTrue(
				gettype($result)==='string',
				'expected type string : ' . PHP_EOL
					. gettype($result)
			);

			$this->assertTrue(
				strpos($result, DEDALO_IMAGE_QUALITY_DEFAULT)!==false,
				'expected contains ' .DEDALO_IMAGE_QUALITY_DEFAULT. PHP_EOL
					. $result
			);

		// test_file
			$result = $component->get_url(
				DEDALO_IMAGE_QUALITY_DEFAULT,
				true, // test_file
				false, // absolute
				false // default_add
			);

			$this->assertTrue(
				gettype($result)==='string' || gettype($result)==='NULL',
				'expected type string|null : ' . PHP_EOL
					. gettype($result)
			);

		// absolute
			$result = $component->get_url(
				DEDALO_IMAGE_QUALITY_DEFAULT,
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
				strpos($result, DEDALO_PROTOCOL . DEDALO_HOST)!==false,
				'expected contains ' .DEDALO_PROTOCOL . DEDALO_HOST. PHP_EOL
					. $result
			);

		// default_add
			$component = component_common::get_instance(
				$model, // string model
				$tipo, // string tipo
				9999999,
				$mode,
				$lang,
				$section_tipo
			);
			$result = $component->get_url(
				DEDALO_IMAGE_QUALITY_DEFAULT,
				true, // test_file
				false, // absolute
				true // default_add
			);

			$this->assertTrue(
				$result==='/core/themes/default/0.jpg',
				'expected /core/themes/default/0.jpg : ' . PHP_EOL
					. $result
			);
	}//end test_get_url



	/**
	* TEST_get_external_source
	* @return void
	*/
	public function test_get_external_source() {

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

		$result = $component->get_external_source();

		$this->assertTrue(
			gettype($result)==='string' || gettype($result)==='NULL',
			'expected type string|null : ' . PHP_EOL
				. gettype($result)
		);

		$this->assertTrue(
			$result===null,
			'expected null ' . PHP_EOL
				. json_encode($result)
		);
	}//end test_get_external_source



	/**
	* TEST_get_default_quality
	* @return void
	*/
	public function test_get_default_quality() {

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

		$result = $component->get_default_quality();

		$this->assertTrue(
			gettype($result)==='string',
			'expected type string : ' . PHP_EOL
				. gettype($result)
		);

		$this->assertTrue(
			$result===DEDALO_IMAGE_QUALITY_DEFAULT,
			'expected DEDALO_IMAGE_QUALITY_DEFAULT ' . PHP_EOL
				. $result
		);
	}//end test_get_default_quality



	/**
	* TEST_get_ar_quality
	* @return void
	*/
	public function test_get_ar_quality() {

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

		$result = $component->get_ar_quality();

		$this->assertTrue(
			gettype($result)==='array',
			'expected type array : ' . PHP_EOL
				. gettype($result)
		);

		$this->assertTrue(
			$result===DEDALO_IMAGE_AR_QUALITY,
			'expected DEDALO_IMAGE_AR_QUALITY ' . PHP_EOL
				. json_encode($result)
		);
	}//end test_get_ar_quality



	/**
	* TEST_get_target_filename
	* @return void
	*/
	public function test_get_target_filename() {

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

		$result = $component->get_target_filename();

		$this->assertTrue(
			gettype($result)==='string',
			'expected type string : ' . PHP_EOL
				. gettype($result)
		);

		$name = $tipo.'_'.$section_tipo.'_'.$section_id;

		$this->assertTrue(
			$result===($name.'.jpg'),
			'expected ' .$name.'.jpg'. PHP_EOL
				. $result
		);
	}//end test_get_target_filename



	/**
	* TEST_convert_quality
	* @return void
	*/
	public function test_convert_quality() {

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

		$original_quality	= $component->get_original_quality();
		$target_quality		= '6MB';
		$result				= $component->convert_quality(
			$original_quality,
			$target_quality
		);

		$this->assertTrue(
			gettype($result)==='boolean',
			'expected type boolean : ' . PHP_EOL
				. gettype($result)
		);

		$media_filepath = $component->get_media_filepath($target_quality);

		$this->assertTrue(
			file_exists($media_filepath),
			'expected  file_exists '. PHP_EOL
				. $media_filepath
		);
	}//end test_convert_quality



	/**
	* TEST_set_quality
	* @return void
	*/
	public function test_set_quality() {

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

		$target_quality	= '6MB';
		$result			= $component->set_quality(
			$target_quality
		);

		$this->assertTrue(
			gettype($result)==='boolean',
			'expected type boolean : ' . PHP_EOL
				. gettype($result)
		);

		$this->assertTrue(
			$result===true,
			'expected true value : true ' . PHP_EOL
				. json_encode($result)
		);

		$this->assertTrue(
			$component->quality===$target_quality,
			'expected  component quality '. $target_quality . PHP_EOL
				. $result
		);

		// invalid value
			$target_quality	= 'invalid value!';
			$result			= $component->set_quality(
				$target_quality
			);

			$this->assertTrue(
				$result===false,
				'expected false value : ' . PHP_EOL
					. to_string($result)
			);

			$this->assertTrue(
				$component->quality!==$target_quality,
				'expected  component quality distinct of '. $target_quality . PHP_EOL
					. $result
			);
	}//end test_set_quality



	/**
	* TEST_generate_default_quality_file
	* @return void
	*/
	public function test_generate_default_quality_file() {

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

		$result = $component->generate_default_quality_file((object)[
			'overwrite' => true
		]);

		$this->assertTrue(
			gettype($result)==='boolean',
			'expected type boolean : ' . PHP_EOL
				. gettype($result)
		);

		$this->assertTrue(
			$result===true,
			'expected true value : true ' . PHP_EOL
				. json_encode($result)
		);

		$result = $component->generate_default_quality_file((object)[
			'overwrite'	=> true,
			'from'		=> 'original_real'
		]);

		$this->assertTrue(
			$result===true,
			'expected true value : true (generate_default_quality_file from original_real) ' . PHP_EOL
				. json_encode($result)
		);
	}//end test_generate_default_quality_file



	/**
	* TEST_generate_thumb
	* @return void
	*/
	public function test_generate_thumb() {

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

		$result = $component->generate_thumb();

		if (!is_null($result)) {

			$this->assertTrue(
				gettype($result)==='object',
				'expected type object : ' . PHP_EOL
					. gettype($result)
			);

			$this->assertTrue(
				!empty($result->path),
				'expected !empty($result->path) ' . PHP_EOL
					. empty($result)
			);

			$this->assertTrue(
				!empty($result->url),
				'expected !empty($result->url) ' . PHP_EOL
					. empty($result)
			);
		}
	}//end test_generate_thumb



	/**
	* TEST_get_thumb_url
	* @return void
	*/
	public function test_get_thumb_url() {

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

		$result = $component->get_thumb_url();

		$this->assertTrue(
			gettype($result)==='string',
			'expected type string : ' . PHP_EOL
				. gettype($result)
		);
	}//end test_get_thumb_url



	/**
	* TEST_get_thumb_path
	* @return void
	*/
	public function test_get_thumb_path() {

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

		$result = $component->get_thumb_path();

		$this->assertTrue(
			gettype($result)==='string',
			'expected type string : ' . PHP_EOL
				. gettype($result)
		);
	}//end test_get_thumb_path



	/**
	* TEST_get_image_print_dimensions
	* @return void
	*/
	public function test_get_image_print_dimensions() {

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

		$quality = $component->get_default_quality();

		$result = $component->get_image_print_dimensions($quality);

		// sample
		// [
		//     "8,67cm",
		//     "8,67cm"
		// ]

		$this->assertTrue(
			gettype($result)==='array',
			'expected type array : ' . PHP_EOL
				. gettype($result)
		);
		$this->assertTrue(
			!empty($result[0]),
			'expected !empty($result[0]) : ' . PHP_EOL
				. empty($result[0])
		);
		$this->assertTrue(
			!empty($result[1]),
			'expected !empty($result[1]) : ' . PHP_EOL
				. empty($result[1])
		);
	}//end test_get_image_print_dimensions



	/**
	* TEST_regenerate_component
	* @return void
	*/
	public function test_regenerate_component() {

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

		$result = $component->regenerate_component();

		$this->assertTrue(
			gettype($result)==='boolean',
			'expected type boolean : ' . PHP_EOL
				. gettype($result)
		);
	}//end test_regenerate_component



}//end class component_image_test
