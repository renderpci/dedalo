<?php
/*
	CONTROLLER
	Controller set specific page vars and create document content. 
*/
require_once(dirname(dirname(__FILE__)) .'/config_api/client_config_api.php');

	/*
	
		#
		# SEARCH OPTIONS AND DEFAULTS	
		#

		# TABLE : Set target query table like 'images'
		$options->table 		 	 = null;		 string mandatory

		# AR_FIELDS : Database fields required. Default is all fields: array('*')
		$options->ar_fields 	 	 = array('*');	 array

		# SQL_FILTER : Custom filter to use in current query. Default is empty
		$options->sql_filter 	 	 = "";			string

		# LANG : Filter records by lang. Default is WEB_CURRENT_LANG_CODE (lg-eng) . 
		# Langs are defined as prefix 'lg' and langs ISO 3 length like 'spa' conformed as 'lg-spa', 'lg-eng', 'lg-cat', et..
		$options->lang 			 	= WEB_CURRENT_LANG_CODE; 		string

		# ORDER : Order to apply in current query. Default: `section_id` ASC
		$options->order 		 	= '`section_id` ASC';	string

		# LIMIT : maximun records required. Default is 10. Set to 0 to avoid limit
		$options->limit 		 	= 10;	int

		# GROUP : Group results by field. Like 'GROUP BY color' Default is null
		$options->group 		 	= null;	  string

		# OFFSET : Apply an offset to result query. Used on pagination
		$options->offset 		 	 = null;	int

		# COUNT : Retrieve total records info for this query. Used on pagination
		$options->count 		 	 = false;	bool

		# RESOLVE_PORTALS : Resolve all portals (recursive). Default is false
		$options->resolve_portals 	 = false;	bool

		# RESOLVE_PORTALS_CUSTOM : Resolve specific portals. Default is false
		$options->resolve_portals_custom = false;	Mixed bool|array

	*/
	
	
	#
	# SAMPLE GET ALL RECORDS UNFILTERED FROM TABLE
		# If is received a request 'get', var 't', is used as 'table'. Else default table is used
		$table = !empty($_GET['t']) ? $_GET['t'] : WEB_DEFAULT_TABLE;

		$options = new stdClass();
			$options->dedalo_get 	 = 'records';
			$options->table 	 	 = $table;
			$options->lang  	 	 = WEB_CURRENT_LANG_CODE;
			$options->order 		 = '`section_id` ASC';
			$options->resolve_portal = true; //  Note that this param set as true forces resolve all portals inside
			
		#
		# DATA RETRIEVING
		# Get data with current options
		$search_data_records = json_web_data::get_data($options);

		
		#
		# SHOW DATA
		# If you need see the data structure, uncomment this dump line
		 #dump($search_data_records, ' search_data_records ++ '.to_string()); die("Stop");



# HTML CONTENT
	# Current directory path like '/home/site/sample'
	$cwd = basename(__DIR__);
# Get specifig body content of current page
	ob_start();
	include ( __WEB_ROOT__ .'/'. $cwd . '/html/' . $cwd . '.phtml');
	$html = ob_get_clean();
	echo wrap_html($html,$cwd);
?>