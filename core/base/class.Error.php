<?php
/**
 * CLASS DD_ERROR
 *
 * Centralized error and exception handling for Dédalo.
 * Provides consistent error capture, logging, and reporting across different environments.
 *
 * @package Dédalo
 * @subpackage base
 */
class dd_error {

	// ANSI color codes for terminal output
	private const ANSI_YELLOW_BG = "\033[43m%s\033[0m";
	private const ANSI_RESET = "\033[0m";

	// Error type constants
	private const ERROR_TYPE_ERROR = 'error';
	private const ERROR_TYPE_EXCEPTION = 'exception';
	private const ERROR_TYPE_SHUTDOWN = 'shutdown';



	/**
	 * Initialize error handlers
	 * Call this method explicitly to register all error handlers
	 * @return void
	 */
	public static function initialize() : void {

		// Configure error reporting based on debug mode
		if (SHOW_DEBUG === true) {
			ini_set('display_errors', '0'); // Don't display errors to browser
			error_reporting(E_ALL); // Report all errors
		} else {
			ini_set('display_errors', '0');
			error_reporting(0); // Turn off all error reporting
		}

		// Register error handlers
		set_error_handler([self::class, 'captureError']);
		set_exception_handler([self::class, 'captureException']);
		register_shutdown_function([self::class, 'captureShutdown']);
	}//end initialize



	/**
	 * CAPTURE ERROR
	 * Handles catchable PHP errors (warnings, notices, etc.)
	 *
	 * @param int $number - Error number/level
	 * @param string $message - Error message
	 * @param string $file - File where error occurred
	 * @param int $line - Line number where error occurred
	 * @return void
	 */
	public static function captureError(int $number, string $message, string $file, int $line) : void {

		$error_data = [
			'type'		=> $number,
			'message'	=> $message,
			'file'		=> $file,
			'line'		=> $line
		];

		// Log the error
		self::log_error(
			self::ERROR_TYPE_ERROR,
			$message,
			$error_data
		);

		// Store in environment for later retrieval
		$_ENV['DEDALO_LAST_ERROR'] = print_r($error_data, true);
	}//end captureError



	/**
	 * CAPTURE EXCEPTION
	 * Handles uncaught exceptions
	 *
	 * @param Throwable $exception - The exception to handle
	 * @return void
	 */
	public static function captureException(Throwable $exception) : void {

		try {
			$message = safe_xss($exception->getMessage());

			$error_data = [
				'message'	=> $message,
				'file'		=> $exception->getFile(),
				'line'		=> $exception->getLine(),
				'trace'		=> $exception->getTraceAsString(),
				'code'		=> $exception->getCode()
			];

			// Log the exception
			self::log_error(
				self::ERROR_TYPE_EXCEPTION,
				$message,
				$error_data
			);

			// Log full exception dump for debugging
			error_log(print_r($exception, true));

		} catch (Throwable $nested_exception) {
			// Handle exceptions that occur while processing the original exception
			self::handle_nested_exception($exception, $nested_exception);
		}
	}//end captureException



	/**
	 * CAPTURE SHUTDOWN
	 * Handles fatal errors that occur during shutdown
	 *
	 * @return void
	 */
	public static function captureShutdown() : void {

		$error = error_get_last();

		// Only process if there was actually an error
		if ($error === null) {
			return;
		}

		$error_data = [
			'type'		=> $error['type'],
			'message'	=> $error['message'],
			'file'		=> $error['file'],
			'line'		=> $error['line']
		];

		// Log the shutdown error
		self::log_error(
			self::ERROR_TYPE_SHUTDOWN,
			$error['message'],
			$error_data
		);
	}//end captureShutdown



	/**
	 * LOG ERROR
	 * Centralized error logging with consistent formatting
	 *
	 * @param string $error_type - Type of error (error|exception|shutdown)
	 * @param string $message - Error message
	 * @param array $error_data - Additional error data
	 * @return void
	 */
	private static function log_error(string $error_type, string $message, array $error_data) : void {

		$handler_name = self::get_handler_name($error_type);

		// Output to CLI if in debug mode and running in CLI environment
		if (SHOW_DEBUG === true && running_in_cli() === true) {
			self::output_cli_error($message, $handler_name);
		}

		// Format and log to error log
		$formatted_message = self::format_error_message($handler_name, $message);
		error_log($formatted_message);

		// Log detailed error data
		$error_dump = print_r($error_data, true);
		error_log($error_dump);
	}//end log_error



	/**
	 * HANDLE NESTED EXCEPTION
	 * Handles exceptions that occur while processing another exception
	 *
	 * @param Throwable $original_exception - The original exception
	 * @param Throwable $nested_exception - The exception that occurred during handling
	 * @return void
	 */
	private static function handle_nested_exception(Throwable $original_exception, Throwable $nested_exception) : void {

		$original_message = safe_xss($original_exception->getMessage());
		$nested_message = safe_xss($nested_exception->getMessage());

		$combined_message = sprintf(
			"Nested exception occurred while handling original exception.\nOriginal: %s\nNested: %s",
			$original_message,
			$nested_message
		);

		error_log('ERROR [dd_error::captureException - nested]: ' . $combined_message);
		error_log('Original exception: ' . print_r($original_exception, true));
		error_log('Nested exception: ' . print_r($nested_exception, true));
	}//end handle_nested_exception



	/**
	 * OUTPUT CLI ERROR
	 * Outputs error information to CLI
	 *
	 * @param string $message - Error message
	 * @param string $handler_name - Name of the handler that caught the error
	 * @return void
	 */
	private static function output_cli_error(string $message, string $handler_name) : void {

		print_cli((object)[
			'msg'		=> $message ?? 'Unknown error',
			'errors'	=> [$handler_name]
		]);
	}//end output_cli_error



	/**
	 * FORMAT ERROR MESSAGE
	 * Formats error message with ANSI colors for terminal output
	 *
	 * @param string $handler_name - Name of the handler
	 * @param string $message - Error message
	 * @return string - Formatted error message
	 */
	private static function format_error_message(string $handler_name, string $message) : string {

		$prefix = sprintf('ERROR [dd_error::%s]: ', $handler_name);
		return sprintf(self::ANSI_YELLOW_BG, $prefix . $message);
	}//end format_error_message



	/**
	 * GET HANDLER NAME
	 * Returns the handler method name based on error type
	 *
	 * @param string $error_type - Type of error
	 * @return string - Handler method name
	 */
	private static function get_handler_name(string $error_type) : string {

		return match($error_type) {
			self::ERROR_TYPE_ERROR		=> 'captureError',
			self::ERROR_TYPE_EXCEPTION	=> 'captureException',
			self::ERROR_TYPE_SHUTDOWN	=> 'captureShutdown',
			default						=> 'unknown'
		};
	}//end get_handler_name



}//end class dd_error



// Initialize error handlers
dd_error::initialize();
