<?php declare(strict_types=1);
/**
 * CLASS DD_MCP_API
 * Proxy endpoint for Dédalo AI Assistant to communicate with the MCP server.
 *
 * Forwards JSON-RPC 2.0 requests from the browser to the dedalo-work-mcp
 * server via curl. Manages MCP session ID in PHP session state.
 *
 * Configuration:
 * - DEDALO_MCP_PROXY_URL: base URL of the MCP server (default http://localhost:3001)
 *
 * @package Dedalo
 * @subpackage API
 */
class dd_mcp_api {



	/**
	 * SEC-024: explicit allowlist of methods callable via dd_manager dispatch.
	 */
	public const API_ACTIONS = [
		'mcp_proxy'
	];



	/**
	 * MCP methods allowed through the proxy.
	 */
	private const ALLOWED_MCP_METHODS = [
		'initialize',
		'notifications/initialized',
		'tools/list',
		'tools/call'
	];



	/**
	 * MCP_PROXY
	 * Proxies a JSON-RPC 2.0 request to the dedalo-work-mcp server.
	 *
	 * @param object $rqo Request query object from dd_manager
	 * @return object Response with proxied MCP result or error
	 */
	public static function mcp_proxy(object $rqo) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';
			$response->errors	= [];

		// validate options
			$options = $rqo->options ?? null;
			if (!is_object($options) && !is_array($options)) {
				$response->msg		= 'Error. Invalid options parameter';
				$response->errors[]	= 'invalid_options';
				return $response;
			}
			if (is_array($options)) {
				$options = (object)$options;
			}

		// validate jsonrpc method
			$method = $options->method ?? null;
			if (empty($method)) {
				$response->msg		= 'Error. Missing MCP method';
				$response->errors[]	= 'missing_method';
				return $response;
			}
			if (!in_array($method, self::ALLOWED_MCP_METHODS, true)) {
				$response->msg		= 'Error. MCP method not allowed: ' . $method;
				$response->errors[]	= 'method_not_allowed';
				return $response;
			}

		// build the JSON-RPC envelope to forward
			$envelope = new stdClass();
			$envelope->jsonrpc = $options->jsonrpc ?? '2.0';
			$envelope->method	= $method;
			$envelope->id		= $options->id ?? 1;
			if (isset($options->params)) {
				$envelope->params = $options->params;
			}

		// resolve proxy URL
			$proxy_url = defined('DEDALO_MCP_PROXY_URL')
				? DEDALO_MCP_PROXY_URL
				: 'http://localhost:3001';
			$proxy_url = rtrim($proxy_url, '/');

		// build headers
			$headers = [
				'Content-Type: application/json',
				'Accept: application/json, text/event-stream'
			];

		// forward stored MCP session ID if available
			$session_id = $_SESSION['dedalo']['mcp_session_id'] ?? null;
			if (!empty($session_id)) {
				$headers[] = 'Mcp-Session-Id: ' . $session_id;
			}

		// execute curl request with header capture
			$ch = curl_init();
			curl_setopt($ch, CURLOPT_URL, $proxy_url);
			curl_setopt($ch, CURLOPT_POST, true);
			curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($envelope));
			curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
			curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
			curl_setopt($ch, CURLOPT_TIMEOUT, 30);
			curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);
			curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, 2);

			// capture response headers
			$response_headers = [];
			curl_setopt($ch, CURLOPT_HEADERFUNCTION, function($ch, $header) use (&$response_headers) {
				$len = strlen($header);
				$parts = explode(':', $header, 2);
				if (count($parts) === 2) {
					$response_headers[strtolower(trim($parts[0]))] = trim($parts[1]);
				}
				return $len;
			});

			$body = curl_exec($ch);
			$http_code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
			$curl_error = curl_error($ch);

		// handle curl failure
			if ($body === false) {
				$response->msg		= 'Error. MCP proxy curl failed: ' . $curl_error;
				$response->errors[]	= 'proxy_error';
				return $response;
			}

		// store MCP session ID from response
			if (isset($response_headers['mcp-session-id'])) {
				if (!isset($_SESSION['dedalo'])) {
					$_SESSION['dedalo'] = [];
				}
				$_SESSION['dedalo']['mcp_session_id'] = $response_headers['mcp-session-id'];
			}

		// handle non-2xx responses
			if ($http_code >= 400) {

				// parse error body for structured JSON-RPC error
				$error_data = self::parse_mcp_response($body);
				$error_msg = '';
				if ($error_data && isset($error_data->error) && isset($error_data->error->message)) {
					$error_msg = $error_data->error->message;
				}

				// "already initialized" is recoverable if we have a stored session ID
				if ($method === 'initialize' && str_contains($error_msg, 'already initialized')) {
					if (!empty($session_id)) {
						// we have a session ID already — treat as success
						$response->result	= true;
						$response->msg		= 'OK. MCP server already initialized';
						$response->data		= $error_data;
						return $response;
					} else {
						// no session ID — server needs restart
						$response->msg		= 'Error. MCP server already initialized but session lost. Restart the MCP server.';
						$response->errors[]	= 'session_lost';
						$response->raw		= $body;
						return $response;
					}
				}

				$response->msg		= 'Error. MCP server returned HTTP ' . $http_code . ($error_msg ? ': ' . $error_msg : '');
				$response->errors[]	= 'mcp_http_error';
				$response->raw		= $body;
				return $response;
			}

		// parse MCP server response (SSE or plain JSON)
			$mcp_response = self::parse_mcp_response($body);

			if ($mcp_response === null) {
				$response->msg		= 'Error. Could not parse MCP response';
				$response->errors[]	= 'parse_error';
				$response->raw		= $body;
				return $response;
			}

		// build success response
			$response->result	= true;
			$response->msg		= 'OK. MCP proxy request done';
			$response->data		= $mcp_response;

		return $response;
	}//end mcp_proxy



	/**
	 * PARSE_MCP_RESPONSE
	 * Extracts JSON from MCP server response (plain JSON or SSE format).
	 *
	 * @param string $body Raw response body
	 * @return object|null Parsed JSON-RPC response or null
	 */
	private static function parse_mcp_response(string $body) : ?object {

		// try direct JSON parse first
			$parsed = json_decode($body);
			if (json_last_error() === JSON_ERROR_NONE && is_object($parsed)) {
				return $parsed;
			}

		// extract from SSE format: data: {json}
			$lines = explode("\n", $body);
			$data_lines = [];
			foreach ($lines as $line) {
				$trimmed = trim($line);
				if (str_starts_with($trimmed, 'data:')) {
					$data_lines[] = trim(substr($trimmed, 5));
				}
			}

			if (!empty($data_lines)) {
				$json_str = end($data_lines);
				$parsed = json_decode($json_str);
				if (json_last_error() === JSON_ERROR_NONE && is_object($parsed)) {
					return $parsed;
				}
			}

		return null;
	}//end parse_mcp_response



}//end class dd_mcp_api