<?php
/*
* CLASS COMPONENT_REFERENCE_COMMON
* Used as common base from all components that works with indirect data (locators)
* like component_autocomplete, component_portal, component_select, etc..
*/
class component_reference_common extends component_common {

	# Overwrite __construct var lang passed in this component
	#protected $lang = DEDALO_DATA_NOLAN;


	/**
	* __CONSTRUCT
	*//*
	function __construct($tipo=null, $parent=null, $modo='edit', $lang=DEDALO_DATA_NOLAN, $section_tipo=null) {

		# Force always DEDALO_DATA_NOLAN
		$lang = $this->lang;

		# relation_type
		# $this->relation_type = DEDALO_RELATION_TYPE_CHILDREN_TIPO;

		# Build the componente normally
		parent::__construct($tipo, $parent, $modo, $lang, $section_tipo);

		if(SHOW_DEBUG) {
			$traducible = $this->RecordObj_dd->get_traducible();
			if ($traducible=='si') {
				throw new Exception("Error Processing Request. Wrong component lang definition. This component $tipo (".get_class().") is not 'traducible'. Please fix this ASAP", 1);
			}
		}
	}//end __construct
	*/



	/**
	* GET_SELECT_QUERY
	* Build component specific sql portion query to inject in a global query
	* Note that this select_query is used only in indirect data components (with locators)
	* For components that use direct data see:
	* @see component_common->get_select_query
	* @return string $select_query
	*/
	public static function get_select_query($request_options) {

		$options = new stdClass();
			$options->json_field  = 'dato';
			$options->search_tipo = null;
			$options->lang 		  = null;
			$options->subquery 	  = true;		
			foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}

		$json_field = 'a.'.$options->json_field; // Add 'a.' for mandatory table alias search

		$lg_nolang = DEDALO_DATA_NOLAN; // Force always nolan

		$select_query  = '';

		#if ($options->subquery===true) {
			if(SHOW_DEBUG===true) {
				$select_query .= "\n  -- ".get_called_class().' > '.__METHOD__." $options->search_tipo . Select with_references ";
			}
			$select_query .= "\n  case when (jsonb_typeof({$json_field}#>'{components, $options->search_tipo, dato, $lg_nolang}') = 'array' AND {$json_field}#>'{components, $options->search_tipo, dato, $lg_nolang}' != '[]' ) \n";
			$select_query .= "  then jsonb_array_elements({$json_field}#>'{components, $options->search_tipo, dato, $lg_nolang}') \n";
			$select_query .= "  else {$json_field}#>'{components, $options->search_tipo, dato, $lg_nolang}' \n";
			$select_query .= "  end as {$options->search_tipo}_array_elements";
			if ($options->lang==='all') {
				$select_query .= "\n  ,{$json_field}#>'{components, $options->search_tipo, dato}' as $options->search_tipo";
			}else{
				$select_query .= "\n  ,{$json_field}#>'{components, $options->search_tipo, dato, $lg_nolang}' as $options->search_tipo";
			}
			
		#}else{
		#	if(SHOW_DEBUG===true) {
		#		$select_query .= "\n  -- ".get_called_class().' > '.__METHOD__." $options->search_tipo . Select with_references (subquery false) ";
		#	}
		#	$select_query .= "\n  {$json_field}#>'{components, $options->search_tipo, dato, $options->lang}' as $options->search_tipo";
		#}


		return $select_query;
	}//end get_select_query




	/**
	* GET_SEARCH_QUERY
	* Build search query for current component . Overwrite for different needs in other components 
	* (is static to enable direct call from section_records without construct component)
	* Params
	* @param string $json_field . JSON container column Like 'dato'
	* @param string $search_tipo . Component tipo Like 'dd421'
	* @param string $tipo_de_dato_search . Component dato container Like 'dato' or 'valor'
	* @param string $current_lang . Component dato lang container Like 'lg-spa' or 'lg-nolan'
	* @param string $search_value . Value received from search form request Like 'paco'
	* @param string $comparison_operator . SQL comparison operator Like 'ILIKE'
	*
	* @see class.section_records.php get_rows_data filter_by_search
	* @return string $search_query . POSTGRE SQL query (like 'datos#>'{components, oh21, dato, lg-nolan}' ILIKE '%paco%' )
	*/
	public static function get_search_query( $json_field, $search_tipo, $tipo_de_dato_search, $current_lang, $search_value, $comparison_operator='=') {
		
		$untouch_search_value = $search_value;

		$search_value = json_decode($search_value);
			if ( !$search_value || empty($search_value) ) {
				debug_log(__METHOD__." WARNING . Ignored invalid search_value (locator expected) ".to_string($untouch_search_value), logger::ERROR);
				return false;
			}

		if (is_object($search_value)) {
			$search_value = array($search_value);
		}

		$json_field = 'a.'.$json_field; // Add 'a.' for mandatory table alias search

		$search_query='';
		$ar_data = array();
		# Fixed
		$tipo_de_dato_search='dato';
		$current_lang=DEDALO_DATA_NOLAN;
		switch (true) {
			case $comparison_operator==='!=':
				$ar_data = array();
				foreach ((array)$search_value as $current_value) {
					$current_value = json_encode($current_value);
					$ar_data[] = " ($json_field#>'{components, $search_tipo, $tipo_de_dato_search, ". $current_lang ."}' @> '[$current_value]'::jsonb)=FALSE ";
				}
				break;

			case $comparison_operator==='=':
			default:
				foreach ((array)$search_value as $current_value) {
					$current_value = json_encode($current_value);
					$ar_data[] = " $json_field#>'{components, $search_tipo, $tipo_de_dato_search, ". $current_lang ."}' @> '[$current_value]'::jsonb ";
				}
				break;			
		}
		$search_query = implode(" OR \n",$ar_data);
		
		if(SHOW_DEBUG===true) {
			$search_query = " -- filter_by_search ".__METHOD__." $search_tipo ". get_called_class() ." \n".$search_query ;
			#dump($search_query, " search_query for search_value: ".to_string($search_value)); #return '';
		}
		

		return $search_query;
	}//end get_search_query


	

}//end component_reference_common
?>