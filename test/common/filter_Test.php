<?php
declare(strict_types=1);
// PHPUnit classes
use PHPUnit\Framework\TestCase;
use PHPUnit\Framework\Attributes\TestDox;
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';



final class filter_test extends TestCase {



	/**
	* TEST_get_profiles_for_areas
	* @return void
	*/
	public function test_get_profiles_for_areas() {

		$ar_area_tipo = [
			"actv2",
			"unittest2",
			"object2",
			"rt2",
			"hp2",
			"scxibo2",
			"sclat2",
			"cont2",
			"technique2",
			"objet2",
			"xx2",
			"pt2",
			"terr2",
			"sccmk2",
			"vn2",
			"cd2",
			"ye2",
			"cu2",
			"ao2",
			"bo2",
			"sy2",
			"pr2",
			"tv2",
			"cr2",
			"uy2",
			"zm2",
			"aa2",
			"scell2",
			"by2",
			"ru2",
			"sv2",
			"unittest1",
			"object1",
			"rt1",
			"hp1",
			"scxibo1",
			"sclat1",
			"cont1",
			"technique1",
			"objet1",
			"sccmk1",
			"person1",
			"aa1",
			"tipos1",
			"ww1",
			"scell1",
			"mupreva2562",
			"dc1",
			"numisdata348",
			"on1",
			"mht60",
			"muvaet316",
			"ds1",
			"ts1",
			"xx1",
			"pt1",
			"terr1",
			"vn1",
			"cd1",
			"ye1",
			"cu1",
			"ao1",
			"bo1",
			"sy1",
			"pr1",
			"tv1",
			"cr1",
			"uy1",
			"zm1",
			"dk1",
			"se1",
			"gr1",
			"by1",
			"es1",
			"ad1",
			"us1",
			"af1",
			"fr1",
			"ca1",
			"ru1",
			"xk1",
			"sv1",
			"gt1",
			"co1",
			"dd101",
			"hierarchy56",
			"dd100",
			"oh85",
			"oh83",
			"oh81",
			"oh80",
			"dd35",
			"rsc326",
			"rsc245",
			"rsc204",
			"rsc684",
			"rsc205",
			"rsc332",
			"rsc179",
			"rsc202",
			"rsc176",
			"rsc302",
			"rsc170",
			"rsc167",
			"rsc420",
			"rsc106",
			"rsc194",
			"rsc197",
			"rsc203",
			"dd14",
			"actv1",
			"oh1",
			"dd323",
			"numisdata5",
			"numisdata1",
			"dd322",
			"dd349",
			"dd355",
			"dd242",
			"material1",
			"material2",
			"ps1",
			"ps2"
		];

		$result = filter::get_profiles_for_areas(
			$ar_area_tipo
		);

		$this->assertTrue(
			gettype($result)==='array',
			'expected type array : ' . PHP_EOL
				. gettype($result)
		);
	}//end test_get_profiles_for_areas



	/**
	* TEST_get_user_projects
	* @return void
	*/
	public function test_get_user_projects() {

		$user_id = 1;

		$result = filter::get_user_projects(
			$user_id
		);

		$this->assertTrue(
			gettype($result)==='array',
			'expected type array : ' . PHP_EOL
				. gettype($result)
		);
	}//end test_get_user_projects



	/**
	* TEST_get_user_authorized_projects_cache_key
	* @return void
	*/
	public function test_get_user_authorized_projects_cache_key() {

		$user_id = 1;

		$result = filter::get_user_authorized_projects_cache_key(
			$user_id,
			'test52'
		);

		$this->assertTrue(
			gettype($result)==='string',
			'expected type string : ' . PHP_EOL
				. gettype($result)
		);

		$eq = 'user_authorized_projects_1_test52';
		$this->assertTrue(
			$result===$eq,
			'expected equal : ' . PHP_EOL
				. to_string($result) . PHP_EOL
				. to_string($eq)
		);
	}//end test_get_user_authorized_projects_cache_key



	/**
	* TEST_clean_cache
	* @return void
	*/
	public function test_clean_cache() {

		$user_id = 1;

		$result = filter::clean_cache(
			$user_id,
			'test52'
		);

		$this->assertTrue(
			gettype($result)==='boolean',
			'expected type boolean : ' . PHP_EOL
				. gettype($result)
		);

		$eq = true;
		$this->assertTrue(
			$result===$eq,
			'expected equal : ' . PHP_EOL
				. to_string($result) . PHP_EOL
				. to_string($eq)
		);
	}//end test_clean_cache



	/**
	* TEST_get_user_authorized_projects
	* @return void
	*/
	public function test_get_user_authorized_projects() {

		$user_id = 1;

		$result = filter::get_user_authorized_projects(
			$user_id,
			'test52'
		);

		$this->assertTrue(
			gettype($result)==='array',
			'expected type array : ' . PHP_EOL
				. gettype($result)
		);
	}//end test_get_user_authorized_projects



	/**
	* TEST_get_filter_user_records_by_id
	* @return void
	*/
	public function test_get_filter_user_records_by_id() {

		$user_id = 1;

		$result = filter::get_filter_user_records_by_id(
			$user_id
		);

		$this->assertTrue(
			gettype($result)==='array',
			'expected type array : ' . PHP_EOL
				. gettype($result)
		);
	}//end test_get_filter_user_records_by_id



}//end class filter_test
