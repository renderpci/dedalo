<?php
/*
* CLASS APP
*/

class app {


    private static $options = array(
        'app_id' => 'Dedalo',
    )





    /**
    * CONFIG
    */
    public static function config($key=false) {
    	
    	if(!$key) return self::$config;

        return self::$config[$key];
    }







}
?>