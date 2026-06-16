<?php declare(strict_types=1);
/**
* DIFFUSION_API_CLIENT
* Thin server-to-server HTTP client for the Bun diffusion engine.
* Used by PHP-side processes that must call the engine directly
* (e.g. diffusion_delete propagating record deletions to target databases).
*
* Endpoint resolution order:
*  1. DEDALO_DIFFUSION_SOCKET_PATH (unix socket, preferred: no Apache round-trip)
*  2. DEDALO_DIFFUSION_API_URL (HTTP, for installs where Bun runs remotely)
*
* Auth: forwards the current session cookie when a session exists, and the
* internal token (DEDALO_DIFFUSION_INTERNAL_TOKEN) when defined — the Bun
* side accepts either (see diffusion/api/v1/lib/auth.ts).
*/
class diffusion_api_client {


	/**
	 * Test hook: when set, forces the engine endpoint (unix socket path)
	 * regardless of config constants. Used by the test suite to simulate
	 * an unreachable engine (pending-deletion path). Never set in production.
	 * @var string|null $endpoint_override
	 */
	public static ?string $endpoint_override = null;



	/**
	* CALL
	* Executes a POST request against the Bun diffusion engine.
	* Never throws: connection failures are returned as result:false
	* so callers can convert them into pending/retryable state.
	*
	* @param object $body
	* 	Action body like {action: 'delete_record', targets: [...]}
	* @param int $timeout = 10
	* 	Seconds. Keep short: callers run inside user-facing flows
	* 	like section_record::delete and must not hang.
	* @return object $response
	* 	Decoded JSON from Bun, or {result: false, msg, errors} on failure
	*/
	public static function call(object $body, int $timeout=10) : object {

		// response default
			$response = new stdClass();
				$response->result	= false;
				$response->msg		= 'Error. Request failed ['.__METHOD__.']';
				$response->errors	= [];

		// headers
			$httpheader = ['Content-Type: application/json'];
			// session cookie (interactive contexts)
			if (session_id()) {
				$httpheader[] = 'Cookie: ' . session_name() . '=' . session_id();
			}
			// internal token (CLI/cron contexts without session)
			if (defined('DEDALO_DIFFUSION_INTERNAL_TOKEN') && !empty(DEDALO_DIFFUSION_INTERNAL_TOKEN)) {
				$httpheader[] = 'X-Diffusion-Internal-Token: ' . DEDALO_DIFFUSION_INTERNAL_TOKEN;
			}

		// curl options
			$curl_options = new stdClass();
				$curl_options->post				= true;
				$curl_options->postfields		= json_encode($body);
				$curl_options->httpheader		= $httpheader;
				$curl_options->header			= false; // body only (no response headers)
				$curl_options->followlocation	= false;
				$curl_options->timeout			= $timeout;

		// endpoint resolution: unix socket preferred, HTTP URL fallback
			// test hook: when $endpoint_override is set, force the socket path
			// (used by the test suite to simulate an unreachable engine)
			$socket_path = self::$endpoint_override
				?? (defined('DEDALO_DIFFUSION_SOCKET_PATH') ? DEDALO_DIFFUSION_SOCKET_PATH : null);
			if (self::$endpoint_override!==null || (!empty($socket_path) && file_exists($socket_path))) {
				// host is ignored by curl when using a unix socket, but a URL is still required
				$curl_options->url			= 'http://localhost/';
				$curl_options->unix_socket	= $socket_path;
			}else{
				if (!defined('DEDALO_DIFFUSION_API_URL') || empty(DEDALO_DIFFUSION_API_URL)) {
					$response->msg		= 'Error. Diffusion engine endpoint is not available (no socket, no URL)';
					$response->errors[]	= 'missing_endpoint';
					debug_log(__METHOD__
						. ' ' . $response->msg . PHP_EOL
						. ' socket_path: ' . to_string($socket_path)
						, logger::ERROR
					);
					return $response;
				}
				$curl_options->url = self::to_absolute_url(DEDALO_DIFFUSION_API_URL);
			}

		// request
			$curl_response = curl_request($curl_options);

		// connection / HTTP errors
			if (empty($curl_response->result) || $curl_response->code !== 200) {
				$response->msg = 'Error. Diffusion engine call failed'
					. ' [code: ' . to_string($curl_response->code) . ']'
					. ' [action: ' . ($body->action ?? 'unknown') . ']';
				$response->errors = array_merge(
					$response->errors,
					(array)($curl_response->errors ?? [])
				);
				debug_log(__METHOD__
					. ' ' . $response->msg . PHP_EOL
					. ' url: ' . $curl_options->url . PHP_EOL
					. ' error_info: ' . to_string($curl_response->error_info ?? null)
					, logger::ERROR
				);
				return $response;
			}

		// decode
			$decoded = json_decode((string)$curl_response->result);
			if (!is_object($decoded)) {
				$response->msg		= 'Error. Invalid JSON response from diffusion engine';
				$response->errors[]	= 'invalid_json';
				debug_log(__METHOD__
					. ' ' . $response->msg . PHP_EOL
					. ' raw: ' . substr((string)$curl_response->result, 0, 512)
					, logger::ERROR
				);
				return $response;
			}


		return $decoded;
	}//end call



	/**
	* TO_ABSOLUTE_URL
	* Promotes a browser-relative endpoint URL to an absolute one for server-side curl.
	* DEDALO_DIFFUSION_API_URL is configured relative (e.g. "/v7/diffusion/api/v1/")
	* because it is also published to JS clients, where the browser supplies the
	* origin. curl, running server-side, rejects a host-less URL ("No host part in
	* the URL"), so the scheme + host are prepended here. Already-absolute URLs
	* (remote Bun installs) and empty values pass through unchanged.
	*
	* @param string $url
	* @return string
	*/
	public static function to_absolute_url(string $url) : string {

		if ($url!=='' && strpos($url, '://')===false) {
			$url = DEDALO_PROTOCOL . DEDALO_HOST . $url;
		}

		return $url;
	}//end to_absolute_url



}//end class diffusion_api_client
