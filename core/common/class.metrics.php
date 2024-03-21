<?php
declare(strict_types=1);
/**
* METRICS CLASS
* Class to centralize performance info like permissions calculation, etc.
*/
final class metrics {


	// permissions. Time to calculate user permissions
		static $security_permissions_table_time = 0;
		static $security_permissions_table_count = 0;
		static $security_permissions_total_time = 0;
		static $security_permissions_total_calls = 0;

	// search
		static $search_total_time = 0;
		static $search_total_calls = 0;

	// ontology
		static $ontology_total_time = 0;
		static $ontology_total_calls = 0;

	// matrix
		static $matrix_total_time = 0;
		static $matrix_total_calls = 0;


}//end class metrics
