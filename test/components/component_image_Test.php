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
			dump($result, ' result ++ '.to_string());

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


}//end class component_image_test
