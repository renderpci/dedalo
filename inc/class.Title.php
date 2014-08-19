<?php

abstract class Title {
	
	
	public static function getTitles() {
		
		foreach($GLOBALS as $key => $value) {
			
			if(strpos($key,'_title')) $arTitles[$key] = $value ;
		}
		return($arTitles);			
	}
	
	public static function get_title($title) {
		
		return $GLOBALS[$title];
	}


}
?>