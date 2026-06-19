<?php declare(strict_types=1);
/**
 * CLASS DD_ERROR
 * Centralized PHP error and exception handler for the Dédalo platform.
 *
 * Registers three PHP handler hooks (set_error_handler, set_exception_handler,
 * register_shutdown_function) that funnel all runtime failures into a single
 * log_error() pipeline. The pipeline:
 *   1. Optionally writes a colorized summary to STDOUT via print_cli() (CLI + debug only).
 *   2. Writes a one-line PREFIX + message to the PHP error log via error_log().
 *   3. Writes a structured dump of the error context (file, line, trace …) via error_log().
 *
 * The class is intentionally stateless — every method is static. There is no
 * public state or instance API. All three handler types converge on the same
 * log_error() / format_error_message() path so the output format stays uniform.
 *
 * The file auto-registers by calling dd_error::initialize() at the bottom of
 * the file. Callers that need to alter PHP's error-reporting level (e.g. unit
 * tests) must call initialize() again after including this file.
 *
 * Dependencies:
 *   - Global function safe_xss()        (shared/core_functions.php) — XSS-strips exception messages.
 *   - Global function running_in_cli()   (shared/core_functions.php) — detects CLI vs. web SAPI.
 *   - Global function print_cli()        (shared/core_functions.php) — JSON-encodes a status object to STDOUT.
 *   - Global constant SHOW_DEBUG         (defined by the application bootstrap).
 *
 * @package Dédalo
 * @subpackage base
 */
class dd_error {

	// ANSI color codes for terminal output
	// The sprintf format string wraps the inserted text in a yellow-background ANSI escape.
	// Used only in error_log() output — the PHP error_log target may or may not render ANSI.
	private const ANSI_YELLOW_BG = "\033[43m%s\033[0m";

	// Error type constants
	// Internal discriminator values passed to log_error() and resolved to method
	// names by get_handler_name(). Kept as constants so the match table in
	// get_handler_name() is exhaustive and grep-able.
	private const ERROR_TYPE_ERROR = 'error';
	private const ERROR_TYPE_EXCEPTION = 'exception';
	private const ERROR_TYPE_SHUTDOWN = 'shutdown';



	/**
	 * INITIALIZE
	 * Registers all PHP error/exception/shutdown handlers and configures error_reporting.
	 *
	 * Must be called once during application bootstrap (the file auto-calls it at the
	 * bottom). Re-calling is safe — each call replaces the previously registered handlers.
	 *
	 * Behavior differs by SHOW_DEBUG:
	 *   - SHOW_DEBUG === true  : error_reporting(E_ALL); errors are never echoed to the browser
	 *     (display_errors=0) but ARE written to the log and printed to CLI in debug mode.
	 *   - SHOW_DEBUG === false : error_reporting(0); errors are silenced entirely except for
	 *     shutdown/fatal errors which bypass error_reporting.
	 *
	 * (!) display_errors is always set to '0' regardless of SHOW_DEBUG. Browser exposure of
	 * raw PHP errors is never acceptable in Dédalo's deployment model.
	 *
	 * @return void
	 */
	public static function initialize() : void {

		self::apply_reporting();

		// Register error handlers
		set_error_handler([self::class, 'captureError']);
		set_exception_handler([self::class, 'captureException']);
		register_shutdown_function([self::class, 'captureShutdown']);
	}//end initialize

	/**
	* (Re)apply error_reporting from the SHOW_DEBUG flag. Safe to call BEFORE SHOW_DEBUG is
	* defined — the P0 error-handler init runs before the request-state phase (P14) that defines
	* it — so an undefined flag is treated as false (production-safe: reporting off). The
	* request-state phase calls this again once SHOW_DEBUG is known, honouring developer reporting.
	* display_errors stays '0' always: raw PHP errors are never exposed to the browser.
	*
	* @return void
	*/
	public static function apply_reporting() : void {
		ini_set('display_errors', '0');
		$debug = defined('SHOW_DEBUG') && SHOW_DEBUG === true;
		error_reporting($debug ? E_ALL : 0);
	}//end apply_reporting



	/**
	 * CAPTURE ERROR
	 * Handles catchable PHP errors (warnings, notices, etc.) registered via set_error_handler().
	 *
	 * Builds a structured error_data array from the four arguments PHP passes to the
	 * custom error handler, forwards the data to log_error(), and then stores the
	 * JSON-encoded context in $_ENV['DEDALO_LAST_ERROR'] so that the active API response
	 * handler can include it in the response payload if needed.
	 *
	 * (!) This method does NOT call the default PHP error handler. Returning without
	 * returning false suppresses PHP's built-in error output for the matched error levels.
	 *
	 * (!) Low-severity diagnostics (deprecations and notices) are logged but are NOT
	 * written to $_ENV['DEDALO_LAST_ERROR']. That slot is read by API response
	 * assemblers and by control-flow checks (e.g. dd_core_api detecting DB-connection
	 * failures) as "the request's actionable error". A PHP deprecation emitted by a
	 * third-party library (e.g. PHP 8.x nullable-parameter deprecations in vendored
	 * guzzle/promises) is not a request failure and must not populate that slot.
	 *
	 * @param int    $number  - PHP error level constant (E_WARNING, E_NOTICE, etc.)
	 * @param string $message - Human-readable error description
	 * @param string $file    - Absolute path of the file that triggered the error
	 * @param int    $line    - Line number within $file
	 * @return void
	 */
	public static function captureError(int $number, string $message, string $file, int $line) : void {

		// Respect explicit error suppression. A custom error handler is invoked for
		// every level regardless of error_reporting(), so masked diagnostics must be
		// skipped here. This honours both an explicit error_reporting() mask and the
		// @ operator (PHP 8 narrows error_reporting() to a non-zero fatal-only bitmask
		// while @ is active, so a suppressed warning/notice/deprecation is masked out).
		//
		// (!) The $er !== 0 guard is deliberate: initialize() sets error_reporting(0)
		// in production (SHOW_DEBUG === false), yet captureError MUST keep populating
		// $_ENV['DEDALO_LAST_ERROR'] there — json/index.php uses its presence as the
		// "a server error occurred" signal to the client. Applying the mask only when
		// it is non-zero preserves that production behaviour.
		$er = error_reporting();
		if ($er !== 0 && ($er & $number) === 0) {
			return;
		}

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

		// Store in environment for later retrieval, but ONLY for actionable error levels.
		// $_ENV['DEDALO_LAST_ERROR'] is a string slot readable by API response assemblers
		// and control-flow checks that treat a non-empty value as "the request errored".
		// Deprecations and notices are non-actionable noise (often from third-party libs)
		// and must not pollute that slot.
		$non_actionable = E_DEPRECATED | E_USER_DEPRECATED | E_NOTICE | E_USER_NOTICE;
		if (($number & $non_actionable) === 0) {
			$_ENV['DEDALO_LAST_ERROR'] = json_encode($error_data);
		}
	}//end captureError



	/**
	 * CAPTURE EXCEPTION
	 * Handles uncaught exceptions registered via set_exception_handler().
	 *
	 * The exception message is sanitized with safe_xss() before logging to prevent
	 * attacker-controlled strings from injecting markup into any log viewer that renders HTML.
	 *
	 * An inner try/catch guards against exceptions thrown by safe_xss() or log_error()
	 * themselves (e.g. a database-backed logger going down). If a nested exception occurs,
	 * handle_nested_exception() is called so both the original and the nested failure are
	 * preserved in error_log() without re-entering this handler recursively.
	 *
	 * After log_error(), the full raw exception object is also dumped via error_log(print_r())
	 * to capture fields not present in getTraceAsString() (e.g. exception chaining via $previous).
	 *
	 * @param Throwable $exception - The uncaught exception or error to handle
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
			// print_r() of the Throwable captures chained $previous exceptions
			// and additional public properties not exposed by the interface methods.
			error_log(print_r($exception, true));

		} catch (Throwable $nested_exception) {
			// Handle exceptions that occur while processing the original exception
			// A nested Throwable here usually means safe_xss() or log_error() failed
			// (e.g. db-backed logger unavailable). Delegate to avoid infinite recursion.
			self::handle_nested_exception($exception, $nested_exception);
		}
	}//end captureException



	/**
	 * CAPTURE SHUTDOWN
	 * Handles fatal errors that occur during PHP shutdown, registered via register_shutdown_function().
	 *
	 * PHP's shutdown function runs after script execution ends, catching fatal errors
	 * (E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR) that bypass set_error_handler().
	 * error_get_last() is checked first; if no error occurred during the request the
	 * function returns immediately to avoid generating spurious log entries.
	 *
	 * (!) This handler fires for both clean shutdowns and fatal-error shutdowns.
	 * The null-guard on error_get_last() is the only way to distinguish between them.
	 *
	 * @return void
	 */
	public static function captureShutdown() : void {

		$error = error_get_last();

		// Only process if there was actually an error
		// A null return from error_get_last() means the script ended cleanly.
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
	 * LOG_ERROR
	 * Centralized error logging pipeline shared by all three capture handlers.
	 *
	 * Produces two error_log() lines for every error:
	 *   1. A colorized one-line summary: "ERROR [dd_error::<handler>]: <message>"
	 *   2. A print_r() dump of the full $error_data array (file, line, trace, etc.)
	 *
	 * When running in CLI with SHOW_DEBUG enabled, also emits the summary to STDOUT
	 * via print_cli() so that background worker processes can surface errors inline.
	 *
	 * @param string $error_type - One of ERROR_TYPE_* constants ('error'|'exception'|'shutdown')
	 * @param string $message    - Human-readable error message (should be XSS-clean for exceptions)
	 * @param array  $error_data - Structured error context (type, file, line, trace, code …)
	 * @return void
	 */
	private static function log_error(string $error_type, string $message, array $error_data) : void {

		$handler_name = self::get_handler_name($error_type);

		// Output to CLI if in debug mode and running in CLI environment
		// Skipped for web requests — print_cli() is a no-op outside CLI anyway,
		// but the guard here avoids the function call overhead in web context.
		if (SHOW_DEBUG === true && running_in_cli() === true) {
			self::output_cli_error($message, $handler_name);
		}

		// Format and log to error log
		// The ANSI escape codes are part of the formatted string but are harmless in
		// plain-text log files; they render as colored output in terminal-based log viewers.
		$formatted_message = self::format_error_message($handler_name, $message);
		error_log($formatted_message);

		// Log detailed error data
		// A second error_log() call with the full context array gives developers
		// file/line/trace without truncating the one-liner summary above.
		$error_dump = print_r($error_data, true);
		error_log($error_dump);
	}//end log_error



	/**
	 * HANDLE_NESTED_EXCEPTION
	 * Handles exceptions that occur while processing another exception inside captureException().
	 *
	 * This is a last-resort fallback: when log_error() or safe_xss() throws, the outer
	 * try/catch in captureException() delegates here. Both the original and nested
	 * exceptions are serialized directly via error_log() without going through log_error()
	 * again, to avoid the risk of a further cascade.
	 *
	 * (!) Do not call log_error() from this method — doing so risks infinite recursion
	 * if the logging subsystem itself is the source of the failure.
	 *
	 * @param Throwable $original_exception - The exception that captureException() was handling
	 * @param Throwable $nested_exception   - The exception thrown during that handling
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
	 * OUTPUT_CLI_ERROR
	 * Emits a structured error summary to STDOUT via print_cli() for CLI consumers.
	 *
	 * Constructs a minimal stdClass with 'msg' and 'errors' keys that matches the
	 * shape expected by print_cli() (shared/core_functions.php), which JSON-encodes
	 * it and writes to STDOUT with a trailing newline.
	 *
	 * Called only when SHOW_DEBUG === true and running_in_cli() === true, so this
	 * never emits output in web-request or production CLI contexts.
	 *
	 * (!) $message is typed non-nullable (string), so the null-coalescing operator
	 * '?? "Unknown error"' in the object literal is unreachable for valid callers
	 * within this class. It acts as a defensive guard if the method is ever called
	 * from outside the class or if strict_types coercion changes.
	 *
	 * @param string $message      - Error message to display
	 * @param string $handler_name - Handler method name used as an error tag (e.g. 'captureError')
	 * @return void
	 */
	private static function output_cli_error(string $message, string $handler_name) : void {

		print_cli((object)[
			'msg'		=> $message ?? 'Unknown error',
			'errors'	=> [$handler_name]
		]);
	}//end output_cli_error



	/**
	 * FORMAT_ERROR_MESSAGE
	 * Produces the one-line log prefix formatted with ANSI yellow-background highlighting.
	 *
	 * Output shape: "\033[43mERROR [dd_error::<handler>]: <message>\033[0m"
	 *
	 * The ANSI escape sequence is always included. Whether it renders as color depends
	 * on the log viewer or terminal attached to PHP's error_log() target.
	 *
	 * @param string $handler_name - Method name of the handling function (e.g. 'captureError')
	 * @param string $message      - Human-readable error or exception message
	 * @return string - ANSI-colored single-line log entry
	 */
	private static function format_error_message(string $handler_name, string $message) : string {

		$prefix = sprintf('ERROR [dd_error::%s]: ', $handler_name);
		return sprintf(self::ANSI_YELLOW_BG, $prefix . $message);
	}//end format_error_message



	/**
	 * GET_HANDLER_NAME
	 * Maps an ERROR_TYPE_* constant value to the corresponding public handler method name.
	 *
	 * The returned string is used both as a human-readable log tag and as the 'errors'
	 * array entry passed to print_cli(). It always matches the actual method name on
	 * this class, making log entries grep-able back to source.
	 *
	 * Returns 'unknown' for any value not covered by the three ERROR_TYPE_* constants;
	 * this is a defensive fallback and should never occur in normal operation.
	 *
	 * @param string $error_type - One of ERROR_TYPE_ERROR | ERROR_TYPE_EXCEPTION | ERROR_TYPE_SHUTDOWN
	 * @return string - Handler method name or 'unknown' for unrecognised types
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
// (!) Auto-registration: this call runs when the file is first included by the
// application bootstrap. All three PHP handler hooks are installed immediately.
// Re-including the file (e.g. in tests) is safe — initialize() replaces the
// previously registered handlers rather than stacking them.
dd_error::initialize();
