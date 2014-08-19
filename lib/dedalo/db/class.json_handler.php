<?php

class json_handler {
 
    protected static $_messages = array(
        JSON_ERROR_NONE => 'No error has occurred',
        JSON_ERROR_DEPTH => 'The maximum stack depth has been exceeded',
        JSON_ERROR_STATE_MISMATCH => 'Invalid or malformed JSON',
        JSON_ERROR_CTRL_CHAR => 'Control character error, possibly incorrectly encoded',
        JSON_ERROR_SYNTAX => 'Syntax error',
        JSON_ERROR_UTF8 => 'Malformed UTF-8 characters, possibly incorrectly encoded'
    );
 
    /**
    * JSON ENCODE
    */
    public static function encode($value, $options=JSON_UNESCAPED_UNICODE) {

        $result = json_encode($value, $options);
 
        if($result) {
            return $result;
        }
 
        throw new RuntimeException(static::$_messages[json_last_error()]);
    }
 
    /**
    * JSON DECODE
    */
    public static function decode($json, $assoc=false) {

        if(is_string($json))
        $json = stripslashes($json);

        # NORMAL FUNCTION
        if(SHOW_DEBUG!=true) {
            
            $result = json_decode($json, $assoc);

            return $result;

        # DEBUG JSON FUNCTION
        }else{

            try{
                $result = json_decode($json, $assoc);
                
                if($result) {
                    return $result;
                }
     
                if (json_last_error()!=JSON_ERROR_NONE) {                
                    throw new RuntimeException(static::$_messages[json_last_error()]. " -> $json");
                }

            }catch(Exception $e){

                $msg = "json_decode Message: " .$e->getMessage();
                #throw new Exception("$msg", 1);
                #dump($e); 
                trigger_error("$msg", E_USER_ERROR);           
                #throw new RuntimeException(static::$_messages[json_last_error()]);
            }

        } 
        
    }
 

}
?>