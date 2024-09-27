<?php
# GeoIp2 load by composer
// require_once DEDALO_ROOT_PATH . '/autoload.php';
#use GeoIp2\Database\Reader;



/**
* CLASS COMPONENT IP
*/
class component_ip extends component_common {



	/**
	* __CONSTRUCT
	*/
	protected function __construct( string $tipo, mixed $section_id=null, string $mode='list', string $lang=DEDALO_DATA_NOLAN, ?string $section_tipo=null, bool $cache=true ) {

		$this->lang = DEDALO_DATA_NOLAN;

		parent::__construct($tipo, $section_id, $mode, $this->lang, $section_tipo, $cache);
	}//end __construct



	/**
	* GET_GEOIP_INFO
	* https://github.com/maxmind/GeoIP2-php
	* @param string $ip
	* @return object $geoip_info
	*/
		// public static function get_geoip_info( $ip, $mode='city' ) {
		// 	#$ip='188.79.248.133';
		// 	$geoip_info = new stdClass();
		// 		$geoip_info->city 	 	 = null;
		// 		$geoip_info->country 	 = null;
		// 		$geoip_info->code 	 	 = 'A1';
		// 		$geoip_info->region_name = null;
		// 		$geoip_info->continent 	 = null;

		// 	try {

		// 		switch ($mode) {
		// 			case 'city':
		// 				$db_file = DEDALO_ROOT_PATH . '/vendor/maxmind-db/db/GeoLite2-City.mmdb';
		// 				$reader  = new Reader($db_file);

		// 				$record = $reader->city($ip);
		// 					#dump($record, ' $record ++ '.to_string());

		// 				$geoip_info->city 	 	 = $record->city->names['en'];
		// 				$geoip_info->country 	 = $record->country->name;
		// 				$geoip_info->code 	 	 = $record->country->isoCode;
		// 				$geoip_info->region_name = $record->mostSpecificSubdivision->name;
		// 				$geoip_info->continent 	 = $record->continent->names['en'];
		// 				break;

		// 			default:
		// 				$db_file = DEDALO_ROOT_PATH . '/vendor/maxmind-db/db/GeoLite2-Country.mmdb';
		// 				$reader  = new Reader($db_file);

		// 				$record  = $reader->country($ip);
		// 					#dump($record, ' $record ++ '.to_string());

		// 				$geoip_info->city 	 	 = null;
		// 				$geoip_info->country 	 = $record->country->names['en'];
		// 				$geoip_info->code 	 	 = $record->country->isoCode;
		// 				$geoip_info->region_name = null;
		// 				$geoip_info->continent 	 = null;
		// 				break;
		// 		}

		// 	} catch (Exception $e) {
		// 	    #echo 'Caught exception: ',  $e->getMessage(), "\n";
		// 	}


		// 	return $geoip_info;
		// }//end get_geoip_info



	/**
	* RESOLVE_QUERY_OBJECT_SQL
	* @return object $query_object
	*/
	public static function resolve_query_object_sql( object $query_object ) : object {

    	# Always set fixed values
		$query_object->type				= 'string';
		$query_object->unaccent			= false;
		$query_object->component_path[]	= 'lg-nolan';

		$q = $query_object->q;
		$q = pg_escape_string(DBi::_getConnection(), stripslashes($q));

        switch (true) {
        	# IS NULL
			case ($q==='!*'):
				$operator = 'IS NULL';
				$q_clean  = '';
				$query_object->operator = $operator;
    			$query_object->q_parsed	= $q_clean;
				break;
			# IS NOT NULL
			case ($q==='*'):
				$operator = 'IS NOT NULL';
				$q_clean  = '';
				$query_object->operator = $operator;
    			$query_object->q_parsed	= $q_clean;
				break;
			# IS DIFFERENT
			case (strpos($q, '!=')===0):
				$operator = '!=';
				$q_clean  = str_replace($operator, '', $q);
				$query_object->operator = '!~';
    			$query_object->q_parsed	= '\''.$q_clean.'\'';
				break;
			# CONTAIN
			case (substr($q, 0, 1)==='*' && substr($q, -1)==='*'):
				$operator = '~';
				$q_clean  = str_replace('*', '', $q);
				$query_object->operator = $operator;
    			$query_object->q_parsed	= '\'.*'.$q_clean.'.*\'';
				break;
			# NOT CONTAIN
			case (strpos($q, '-')===0):
				$operator = '!~';
				$q_clean  = str_replace('-', '', $q);
				$query_object->operator = $operator;
    			$query_object->q_parsed	= '\''.$q_clean.'\'';
				break;
			# BEGINS WITH
			case (substr($q, 0, 1)!=='*' && substr($q, -1)==='*'):
				$operator = '~';
				$q_clean  = str_replace('*', '', $q);
				$query_object->operator = $operator;
    			#$query_object->q_parsed	= '\''.$q_clean.'.*\'';
    			$query_object->q_parsed	= '\'^'.$q_clean.'\'';
				break;
			# ENDS WITH
			case (substr($q, 0, 1)==='*' && substr($q, -1)!=='*'):
				$operator = '~';
				$q_clean  = str_replace('*', '', $q);
				$query_object->operator = $operator;
    			$query_object->q_parsed	= '\''.$q_clean.'$\'';
				break;
			default:
				$operator = '~';
				$q_clean  = $q;
				$query_object->operator = $operator;
    			$query_object->q_parsed	= '\''.$q_clean.'\'';
				break;
		}//end switch (true) {


        return $query_object;
	}//end resolve_query_object_sql



	/**
	* SEARCH_OPERATORS_INFO
	* Return valid operators for search in current component
	* @return array $ar_operators
	*/
	public function search_operators_info() : array {

		$ar_operators = [
			'*'			=> 'no_empty', // not null
			'!*'		=> 'empty', // null
			'='			=> 'similar_to',
			'!='		=> 'different_from',
			'-'			=> 'does_not_contain',
			'*text*'	=> 'contains',
			'text*'		=> 'begins_with',
			'*text'		=> 'end_with'
		];

		return $ar_operators;
	}//end search_operators_info



}//end class component_ip
