<?php
/**
* CLASS ERROR
*
*
*/
class dd_error {



	/**
	* CATCH-ABLE ERRORS : captureError
	*/
	public static function captureError( $number, $message, $file, $line ) : void {

		// Insert all in one table
		$error = array(
			'type'		=> $number,
			'message'	=> $message,
			'file'		=> $file,
			'line'		=> $line
		);

		$info = print_r($error, true);

		// $error_to_show['user']	= 'Ops.. [Error]             ' . $message;
		// $error_to_show['debug']	= 'Ops.. [Error] '.$number.' ' . $message;
		// $error_to_show['dump']	= print_r($error, true);

		// PHP-APACHE LOG
		// error_log('ERROR: '.$error_to_show['debug'].$error_to_show['dump']);

		// print CLI. Echo the text msg as line and flush object buffers
			// only if current environment is CLI
			if ( SHOW_DEBUG===true && running_in_cli()===true ) {
				// send to output
				print_cli((object)[
					'msg'		=> $message ?? 'Unknown error',
					'errors'	=> ['captureError']
				]);
			}

		// error_log('ERROR [dd_error::captureError]: '. print_r($error, true));
		$error_msg = sprintf("\033[43m%s\033[0m", 'ERROR [dd_error::captureError]: '.$info);
		error_log($error_msg);

		// DEDALO_ERRORS ADD
		$_ENV['DEDALO_LAST_ERROR'] = $info;
	}//end captureError



	/**
	* EXCEPTIONS : captureException
	*/
	public static function captureException( $exception ) : void {

		try {

			$message = safe_xss($exception->getMessage());
			// Display content $exception variable
			// $error_to_show['user']	= "<span class='error'>Ops.. [Exception] " . $message ."</span>";
			// $error_to_show['debug']	= "<span class='error'>Ops.. [Exception] " . $message ."</span>";
			// $error_to_show['dump']	= '<pre>' . print_r($exception,true) . '</pre>';
			$error_to_show['user']	= 'Ops.. [Exception] ' . $message;
			$error_to_show['debug']	= 'Ops.. [Exception] ' . $message;
			$error_to_show['dump']	= print_r($exception,true);

			// print CLI. Echo the text msg as line and flush object buffers
			// only if current environment is CLI
			if ( SHOW_DEBUG===true && running_in_cli()===true ) {
				// send to output
				print_cli((object)[
					'msg'		=> $message ?? 'Unknown error',
					'errors'	=> ['captureException']
				]);
			}

			error_log('Exception [dd_error::captureException] '.$error_to_show['debug'] . $error_to_show['dump']);
		}
		catch (Exception $exception2) {
			// Another uncaught exception was thrown while handling the first one.

			$message2 = safe_xss($exception2->getMessage());

			// Display content $exception variable
			// $error_to_show['user']	= "<span class='error'>Ops2.. [Exception2] " . $message2 ."</span>";
			// $error_to_show['debug']	= "<span class='error'>Ops.. [Exception2] " . $message ."</span>" . "<span class='error'>Ops2.. [Exception2] " . $message2 ."</span>";
			// $error_to_show['dump']	= '<pre><h1>Additional uncaught exception thrown while handling exception.</h1>'.print_r($exception,true).'<hr>'.print_r($exception2,true).'</pre>';

			$error_to_show['user']	= "Ops2.. [Exception2] " . $message2 ;
			$error_to_show['debug']	= "Ops.. [Exception2]  " . $message .PHP_EOL." Ops2.. [Exception2] " . $message2;
			$error_to_show['dump']	= 'Additional uncaught exception thrown while handling exception.'.print_r($exception,true).PHP_EOL.print_r($exception2,true);

			error_log('Exception 2 [dd_error::captureException]: '.$message2);
		}

		// PHP-APACHE LOG
		error_log('ERROR [dd_error::captureException]:' . $error_to_show['debug'].$error_to_show['dump']);
	}//end captureException



	/**
	* UNCATCHABLE ERRORS : captureShutdown
	*/
	public static function captureShutdown() : void {

		$error = error_get_last();
		if( $error ) {

			## IF YOU WANT TO CLEAR ALL BUFFER, UNCOMMENT NEXT LINE:
			# ob_end_clean( );

			// Display content $exception variable
			$error_to_show['user']	= 'Ops.. [Fatal Error] ' . $error['message'];
			$error_to_show['debug']	= 'Ops.. [Fatal Error] ' . $error['message'];
			$error_to_show['dump']	= print_r($error,true);

			// print CLI. Echo the text msg as line and flush object buffers
			// only if current environment is CLI
			if ( SHOW_DEBUG===true && running_in_cli()===true ) {
				// send to output
				print_cli((object)[
					'msg'		=> $error['message'] ?? 'Unknown error',
					'errors'	=> ['captureShutdown']
				]);
			}

			error_log('ERROR [dd_error::captureShutdown]: '. print_r($error_to_show, true));

			// PHP-APACHE LOG
			error_log('ERROR [dd_error::captureShutdown]: '.$error_to_show['debug'].$error_to_show['dump']);
		}
	}//end captureShutdown



}//end class dd_error



if(SHOW_DEBUG===true) {

	ini_set( 'display_errors', 0 ); // Default 0
	// Report all errors
	error_reporting(E_ALL);

}else{

	ini_set( 'display_errors', 0 ); // Default 0
	// Turn off all error reporting
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
