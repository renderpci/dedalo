<?php
/*
* CLASS ERROR
*/


class dd_error {

	/**
	* CATCHABLE ERRORS : captureError
	*/
	public static function captureError( $number, $message, $file, $line ) {

		// Insert all in one table
		$error = array( 'type' 	  => $number,
						'message' => $message,
						'file' 	  => $file,
						'line' 	  => $line
					  );

		$message = safe_xss($message);

		$error_to_show['user']   = "<span class='error'>Ops.. [Error]        " . $message ."</span>";
		$error_to_show['debug']  = "<span class='error'>Ops.. [Error]$number " . $message ."</span>";
		$error_to_show['dump']   = '<pre>' . print_r($error,true) . '</pre>';

	   
		if(SHOW_DEBUG===true) {
			$GLOBALS['log_messages'][] = $error_to_show['debug'].$error_to_show['dump'];
		}else{
			#$GLOBALS['log_messages'][] = $error_to_show['user'];
		}
		

		# DEDALO FILE LOGGER
		if ( class_exists('logger') && isset(logger::$obj['error']) ) {
			logger::$obj['error']->log_message($error_to_show['debug'].$error_to_show['dump'], logger::ERROR, __METHOD__);
		}        
		# PHP-APACHE LOG
		error_log('ERROR: '.$error_to_show['debug'].$error_to_show['dump']);

	}//end captureError




	/**
	* EXCEPTIONS : captureException
	*/
	public static function captureException( $exception ) {
		
		try {

			$message = safe_xss($exception->getMessage());
			// Display content $exception variable
			$error_to_show['user']   = "<span class='error'>Ops.. [Exception] " . $message ."</span>";
			$error_to_show['debug']  = "<span class='error'>Ops.. [Exception] " . $message ."</span>";
			$error_to_show['dump']   = '<pre>' . print_r($exception,true) . '</pre>';
			
			if(SHOW_DEBUG===true) {
				$GLOBALS['log_messages'][] = $error_to_show['debug'].$error_to_show['dump'];
			}else{
				$GLOBALS['log_messages'][] = $error_to_show['user'];
			}

			$log_messages 	= self::wrap_error( implode('<br>', $GLOBALS['log_messages']) );
			print trim($log_messages);

			error_log($error_to_show['debug'].$error_to_show['dump']);
		}
		catch (Exception $exception2) {
			// Another uncaught exception was thrown while handling the first one.

			$message2 = safe_xss($exception2->getMessage());

			// Display content $exception variable
			$error_to_show['user']  = "<span class='error'>Ops2.. [Exception2] " . $message2 ."</span>";
			$error_to_show['debug'] = "<span class='error'>Ops.. [Exception2] " . $message ."</span>" . "<span class='error'>Ops2.. [Exception2] " . $message2 ."</span>";
			$error_to_show['dump']  = '<pre><h1>Additional uncaught exception thrown while handling exception.</h1>'.print_r($exception,true).'<hr>'.print_r($exception2,true).'</pre>';

			if(SHOW_DEBUG===true) {
				$GLOBALS['log_messages'][] = $error_to_show['debug'].$error_to_show['dump'];
			}else{
				$GLOBALS['log_messages'][] = $error_to_show['user'];
			}

			#print self::wrap_error( implode('<br>', $GLOBALS['log_messages']) );
			$log_messages 	= self::wrap_error( implode('<br>', $GLOBALS['log_messages']) );
			print safe_xss($log_messages);
		}

		
		# DEDALO FILE LOGGER
		if ( isset(logger::$obj['error']) ) {
			logger::$obj['error']->log_message($error_to_show['debug'].$error_to_show['dump'], logger::CRITICAL, __METHOD__);
		}
		# PHP-APACHE LOG
		error_log($error_to_show['debug'].$error_to_show['dump']);

	}//end captureException




	/**
	* UNCATCHABLE ERRORS : captureShutdown
	*/
	public static function captureShutdown() {

		$error = error_get_last( );
		if( $error ) {

			## IF YOU WANT TO CLEAR ALL BUFFER, UNCOMMENT NEXT LINE:
			# ob_end_clean( );

			// Display content $exception variable
			$error_to_show['user']   = "<span class='error'>Ops.. [Fatal Error] " . $error['message'] ." </span>";
			$error_to_show['debug']  = "<span class='error'>Ops.. [Fatal Error] " . $error['message'] ." </span>";
			$error_to_show['dump']   = '<pre>' . print_r($error,true) . '</pre>';

		   
			if(SHOW_DEBUG===true) {
				$GLOBALS['log_messages'][] = $error_to_show['debug'].$error_to_show['dump'];
			}else{
				$GLOBALS['log_messages'][] = $error_to_show['user'];
			}

			print self::wrap_error( implode('<br>', $GLOBALS['log_messages']) );

		} else {
			return true;
		}

		# DEDALO FILE LOGGER
		if ( isset(logger::$obj['error']) ) {
			logger::$obj['error']->log_message($error_to_show['debug'].$error_to_show['dump'], logger::CRITICAL, __METHOD__);
		}
		# PHP-APACHE LOG
		error_log($error_to_show['debug'].$error_to_show['dump']);

	}//end captureShutdown




	/**
	* WRAP_ERROR
	*/
	public static function wrap_error($string_error, $show_option=true, $span_error_class=null) {

		$html = '';
		$html .= '<!DOCTYPE html>';
		$html .= '<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="en-US" lang="en-US">';
		$html .= '<head>';
		$html .= ' <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />';
		$html .= ' <link rel="stylesheet" href="'.DEDALO_LIB_BASE_URL.'/common/css/common.css" type="text/css" />';
		$html .= ' <link rel="stylesheet" href="'.DEDALO_LIB_BASE_URL.'/html_page/css/html_page.css" type="text/css" />';
		$html .= '</head>';
		$html .= '<body style="padding:20px">';

		$html .= " <span class='$span_error_class'>".$string_error."</span>";

		if($show_option) {
			$html .= '
					<div class="" style="padding:0px">
					<a href="'.DEDALO_LIB_BASE_URL.'/main/?home" style="padding:5px">Home</a>
					<a href="javascript:history.go(-1)" style="padding:5px">Back</a> Sorry, an error was found
					<img src="'.DEDALO_LIB_BASE_URL.'/themes/default/favicon.ico" style="position:relative;top:1px" />
					</div>';
		}

		$html .= '</body>';
		$html .= '</html>';

		return $html;

	}//end wrap_error



};//end class



if(SHOW_DEBUG===true) {

	ini_set( 'display_errors', 1 );     // Default 1
	#error_reporting(E_ALL);             // Default -1 or E_ALL (Report all PHP errors)
	error_reporting(E_ALL ^ E_DEPRECATED);

}else{

	ini_set( 'display_errors', 0 );     // Default 0
	#error_reporting(E_ALL ^ E_NOTICE);  // Default E_ALL ^ E_NOTICE
	error_reporting(0);
}

# SET ERROR HANDLERS
set_error_handler( array( 'dd_error', 'captureError' ) );
set_exception_handler( array( 'dd_error', 'captureException' ) );
register_shutdown_function( array( 'dd_error', 'captureShutdown' ) );


// PHP set_error_handler TEST
#IMAGINE_CONSTANT;

// PHP set_exception_handler TEST
#throw new Exception( 'Imagine Exception' );

// PHP register_shutdown_function TEST ( IF YOU WANT TEST THIS, DELETE PREVIOUS LINE )
#imagine_function( );



/* OPTIONS:

	// Turn off all error reporting
	error_reporting(0);

	// Report simple running errors
	error_reporting(E_ERROR | E_WARNING | E_PARSE);

	// Reporting E_NOTICE can be good too (to report uninitialized
	// variables or catch variable name misspellings ...)
	error_reporting(E_ERROR | E_WARNING | E_PARSE | E_NOTICE);

	// Report all errors except E_NOTICE
	// This is the default value set in php.ini
	error_reporting(E_ALL ^ E_NOTICE);

	// Report all PHP errors (see changelog)
	error_reporting(E_ALL);

	// Report all PHP errors
	error_reporting(-1);

	// Same as error_reporting(E_ALL);
	ini_set('error_reporting', E_ALL);

*/

?>
