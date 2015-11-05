<?php
require_once(DEDALO_LIB_BASE_PATH . '/common/class.Accessors.php');



# DEBUG
abstract class debug extends Accessors {
	
	

	public static function get_time_from_ar_debug($ar_value, $pattern=NULL) {		
	
		if(empty($pattern))	$pattern	= '/\[(.{6,10}) ms\]/';
		
		$total_time	= 0;
		
		foreach($ar_value as $mykey => $string) {
																				
			preg_match($pattern, $string, $matches);	#var_dump($matches);
			
			if(!empty($matches[1]))			
				$total_time += $matches[1];
		}
		#echo " $total_time ms";														
		
		return $total_time;														
	}
	
	
	
	
		
}
?>