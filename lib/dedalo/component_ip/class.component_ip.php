<?php
# GeoIp2 load by composer
require_once DEDALO_ROOT . '/autoload.php';
use GeoIp2\Database\Reader;



/*
* CLASS COMPONENT IP
*/
class component_ip extends component_common {

	
	# Overwrite __construct var lang passed in this component
	protected $lang = DEDALO_DATA_NOLAN;


	# GET DATO
	public function get_dato() {
		$dato = parent::get_dato();
		return (string)$dato;
	}

	# SET_DATO
	public function set_dato($dato) {
		parent::set_dato( (string)$dato );
	}



	/**
	* GET_GEOIP_INFO
	* https://github.com/maxmind/GeoIP2-php
	* @param string $ip
	* @return object $geoip_info
	*/
	public static function get_geoip_info( $ip, $mode='city' ) {
		#$ip='188.79.248.133';
		$geoip_info = new stdClass(); 
			$geoip_info->city 	 	 = null;
			$geoip_info->country 	 = null;
			$geoip_info->code 	 	 = 'A1';
			$geoip_info->region_name = null;
			$geoip_info->continent 	 = null;
		
		try {

			switch ($mode) {
				case 'city':
					$db_file = DEDALO_ROOT . '/vendor/maxmind-db/db/GeoLite2-City.mmdb';
					$reader  = new Reader($db_file);

					$record = $reader->city($ip);
						#dump($record, ' $record ++ '.to_string());
					
					$geoip_info->city 	 	 = $record->city->names['en'];
					$geoip_info->country 	 = $record->country->name;
					$geoip_info->code 	 	 = $record->country->isoCode;
					$geoip_info->region_name = $record->mostSpecificSubdivision->name;
					$geoip_info->continent 	 = $record->continent->names['en'];		
					break;
				
				default:
					$db_file = DEDALO_ROOT . '/vendor/maxmind-db/db/GeoLite2-Country.mmdb';
					$reader  = new Reader($db_file);

					$record  = $reader->country($ip);
						#dump($record, ' $record ++ '.to_string());
					
					$geoip_info->city 	 	 = null;
					$geoip_info->country 	 = $record->country->names['en'];
					$geoip_info->code 	 	 = $record->country->isoCode;
					$geoip_info->region_name = null;
					$geoip_info->continent 	 = null;						
					break;
			}			

		} catch (Exception $e) {
		    #echo 'Caught exception: ',  $e->getMessage(), "\n";		  	
		}
		#dump($geoip_info, ' $geoip_info ++ '.to_string());

		return $geoip_info;

	}#end get_geoip_info

}
?>