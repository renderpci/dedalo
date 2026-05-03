<?php declare(strict_types=1);
/**
 * RESPONSE_BUILDER
 * Captures Dédalo API output and constructs PSR-7 responses.
 *
 * Handles: output buffering, PHP header capture, Content-Type defaults,
 * sanity checks for malformed output, and body writing.
 *
 * @package Dedalo
 * @subpackage RoadRunner
 */
namespace Dedalo\RoadRunner;

use Nyholm\Psr7\Response;
use Psr\Http\Message\ResponseInterface;

final class response_builder {

	/**
	 * CAPTURE_OUTPUT
	 * Executes the Dédalo API entry point inside output buffering and returns
	 * the captured output string. Uses a closure to prevent variable leakage
	 * between requests in the persistent RoadRunner process.
	 *
	 * @param callable $app Callable that executes the Dédalo API
	 * @return string Captured output
	 */
	public static function capture_output(callable $app) : string {

		ob_start();

		try {
			$app();
		} catch (\Throwable $e) {
			// SEC-016: never expose stack traces unless SHOW_DEBUG is true
			error_log('RR Worker EXCEPTION: ' . $e->getMessage() . PHP_EOL . $e->getTraceAsString());

			if (ob_get_level() > 0) {
				$error_payload = [
					'result' => false,
					'msg'    => (defined('SHOW_DEBUG') && SHOW_DEBUG === true)
						? 'Dédalo Catch Error: ' . $e->getMessage()
						: 'Internal server error. Contact your admin.',
				];
				if (defined('SHOW_DEBUG') && SHOW_DEBUG === true) {
					$error_payload['trace'] = $e->getTraceAsString();
				}
				echo json_encode($error_payload);
			}
		}

		$output = ob_get_clean() ?: '';
		return trim($output);
	}

	/**
	 * BUILD
	 * Constructs a PSR-7 response from captured output, applying PHP headers
	 * captured during execution, default Content-Type, and session cookie.
	 *
	 * @param string $output Captured API output
	 * @return ResponseInterface
	 */
	public static function build(string $output) : ResponseInterface {

		// Sanity check: detect potential multiple JSON objects
		if (strpos($output, '}{') !== false) {
			error_log('RR Worker WARNING: Potential multiple JSON objects detected in output. Fix at source.');
		}

		// Capture headers set via PHP's header() function
		$php_headers = headers_list();
		worker_bootstrap::debug_log('RR Worker: Captured PHP Headers: ' . json_encode($php_headers));
		header_remove(); // Clear for next request

		// Build base response
		$response = new Response();

		// Apply captured PHP headers
		$response = self::apply_php_headers($response, $php_headers);

		// Fallback for empty output
		if ($output === '') {
			$output = '{}';
		}

		// Write body
		$response->getBody()->write($output);

		// Ensure default Content-Type if not set by Dédalo
		$response = self::ensure_content_type($response);

		return $response;
	}

	/**
	 * APPLY_PHP_HEADERS
	 * Transfers headers captured via headers_list() to the PSR-7 response.
	 * Skips Content-Length (handled by RoadRunner/PSR-7).
	 *
	 * @param ResponseInterface $response
	 * @param array $php_headers
	 * @return ResponseInterface
	 */
	private static function apply_php_headers(ResponseInterface $response, array $php_headers) : ResponseInterface {

		foreach ($php_headers as $header) {
			if (!str_contains($header, ':')) {
				continue;
			}
			[$name, $value] = explode(':', $header, 2);
			// Skip Content-Length — RoadRunner handles it
			if (strtolower(trim($name)) === 'content-length') {
				continue;
			}
			$response = $response->withHeader(trim($name), trim($value));
		}

		return $response;
	}

	/**
	 * ENSURE_CONTENT_TYPE
	 * Sets default JSON Content-Type if none was specified.
	 *
	 * @param ResponseInterface $response
	 * @return ResponseInterface
	 */
	private static function ensure_content_type(ResponseInterface $response) : ResponseInterface {

		if (!$response->hasHeader('Content-Type')) {
			$response = $response->withHeader('Content-Type', 'application/json; charset=utf-8');
		}

		return $response;
	}
}
