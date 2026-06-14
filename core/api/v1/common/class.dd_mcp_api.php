<?php declare(strict_types=1);
/**
* CLASS DD_MCP_API
* Server-side proxy that forwards JSON-RPC 2.0 requests from the browser to
* the dedalo-work-mcp Node.js/TypeScript server via cURL.
*
* The Dédalo AI Assistant (tool_assistant) cannot reach the MCP server directly
* from the browser because:
*  - The MCP server runs on a private port (default 3001) with no CORS headers.
*  - The `Mcp-Session-Id` header returned by the server must be stored server-side
*    so that the stateful MCP session survives page reloads.
*
* Request flow:
*  Browser → data_manager.request() → dd_manager → dd_mcp_api::mcp_proxy()
*           → cURL POST → dedalo-work-mcp HTTP server (JSON-RPC 2.0)
*
* Security model:
*  - Only the four MCP lifecycle methods listed in ALLOWED_MCP_METHODS may be
*    forwarded; all others are rejected with an HTTP-level 'method_not_allowed' error.
*  - Only `mcp_proxy` is listed in API_ACTIONS, so dd_manager enforces that no
*    other method on this class can be reached over HTTP (SEC-024).
*  - SSL peer verification is enforced for non-localhost targets.
*
* Session handling:
*  The MCP protocol assigns a session ID in the `Mcp-Session-Id` response header
*  after the first `initialize` call. That ID is stored in $_SESSION['dedalo']['mcp_session_id']
*  and re-sent on every subsequent request so the server can route the call to the
*  correct server-side agent context. If the session is lost but the server reports
*  "already initialized", the response is treated as a success to allow reconnection.
*
* MCP server response format:
*  The dedalo-work-mcp server may reply with plain JSON or with Server-Sent Events
*  (SSE) depending on the Accept negotiation. parse_mcp_response() handles both.
*
* Configuration:
*  DEDALO_MCP_PROXY_URL — base URL of the MCP server, e.g. 'http://localhost:3001'.
*                         Define in config.php; defaults to 'http://localhost:3001'
*                         when undefined. The constant is declared in sample.config.php.
*
* @package Dédalo
* @subpackage API
*/
class dd_mcp_api {



	/**
	* SEC-024: explicit allowlist of methods callable via dd_manager dispatch.
	* Only `mcp_proxy` is exposed over HTTP. Every other method on this class
	* is a private helper and is intentionally absent from this list.
	* Enforced in class.dd_manager.php before any action is dispatched.
	* @var array<int, string>
	*/
	public const API_ACTIONS = [
		'mcp_proxy'
	];



	/**
	* MCP lifecycle methods that the proxy is permitted to forward.
	* The allowlist covers the minimal JSON-RPC 2.0 handshake and tool execution
	* surface of the MCP protocol (version 2025-03-26):
	*  - initialize           : capability negotiation, triggers Mcp-Session-Id assignment
	*  - notifications/initialized : fire-and-forget client-ready notification
	*  - tools/list           : enumerate registered tools on the MCP server
	*  - tools/call           : invoke a named tool with JSON arguments
	* Any method not listed here is rejected before the cURL request is made.
	* @var array<int, string>
	*/
	private const ALLOWED_MCP_METHODS = [
		'initialize',
		'notifications/initialized',
		'tools/list',
		'tools/call'
	];



	/**
	* MCP_PROXY
	* Forwards a single JSON-RPC 2.0 envelope to the dedalo-work-mcp server
	* and relays the response back to the browser.
	*
	* The caller (mcp_client.js) passes the full JSON-RPC envelope fields
	* (jsonrpc, method, id, params) inside $rqo->options. This method:
	*  1. Validates the options shape and rejects unknown MCP methods.
	*  2. Rebuilds a clean JSON-RPC envelope to avoid header injection.
	*  3. Attaches the stored Mcp-Session-Id to the outgoing cURL request.
	*  4. Stores the Mcp-Session-Id received from the MCP server in $_SESSION.
	*  5. Handles the "already initialized" recoverable error for session reconnect.
	*  6. Delegates body parsing to parse_mcp_response() for SSE/JSON duality.
	*
	* On success, $response->data holds the parsed JSON-RPC response object
	* and $response->mcp_session_id (if available) echoes the session ID back to
	* the browser so mcp_client.js can cache it for the current page session.
	*
	* Error codes set in $response->errors[]:
	*  invalid_options     — $rqo->options is missing or not an object/array
	*  missing_method      — options.method is empty
	*  method_not_allowed  — method is not in ALLOWED_MCP_METHODS
	*  proxy_error         — cURL transport failure (network down, wrong port, etc.)
	*  mcp_http_error      — MCP server returned HTTP 4xx/5xx
	*  session_lost        — "already initialized" response but no stored session ID
	*  parse_error         — response body could not be decoded as JSON or SSE
	*
	* @param object $rqo - Request query object from dd_manager; must contain
	*                      $rqo->options with at minimum {jsonrpc, method, id}
	* @return object - Standard Dédalo response envelope {result, msg, errors[],
	*                  data?, mcp_session_id?}
	*/
	public static function mcp_proxy(object $rqo) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';
			$response->errors	= [];

		// validate options
		// mcp_client.js sends the full JSON-RPC envelope inside $rqo->options.
		// Both object and array are accepted because the PHP JSON decoder can
		// produce either depending on the decode flags used upstream.
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
		// Allowlist check happens here before any network I/O, so unknown methods
		// never reach the MCP server even if ALLOWED_MCP_METHODS is extended later.
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
		// Reconstruct a clean envelope from validated fields rather than forwarding
		// the raw $options object verbatim, to prevent parameter injection.
		// params is optional (notifications and tools/list omit it).
		$envelope = new stdClass();
		$envelope->jsonrpc = $options->jsonrpc ?? '2.0';
		$envelope->method	= $method;
		$envelope->id		= $options->id ?? 1;
		if (isset($options->params)) {
			$envelope->params = $options->params;
		}

		// resolve proxy URL
		// DEDALO_MCP_PROXY_URL may be undefined in installations that use the
		// default localhost port; rtrim avoids double-slash on path concatenation
		// if the constant is defined with a trailing slash.
		$proxy_url = defined('DEDALO_MCP_PROXY_URL')
			? DEDALO_MCP_PROXY_URL
			: 'http://localhost:3001';
		$proxy_url = rtrim($proxy_url, '/');

		// build headers
		// Accept includes text/event-stream because the MCP server may respond
		// with SSE (see parse_mcp_response). The Content-Type must be application/json
		// for the MCP server to parse the POST body.
		$headers = [
			'Content-Type: application/json',
			'Accept: application/json, text/event-stream'
		];

		// forward stored MCP session ID if available
		// The MCP protocol requires the client to echo the session ID on every
		// request after initialization so the server can route to the right agent.
		// The ID may arrive from: (a) $rqo->mcp_session_id (client cached it in
		// the current page session via a previous response), or (b) $_SESSION
		// (persisted across page loads). If found, it is written back into the PHP
		// session to ensure consistency regardless of which path supplied it.
		$session_id = $rqo->mcp_session_id ?? ($_SESSION['dedalo']['mcp_session_id'] ?? null);
		if (!empty($session_id)) {
			$headers[] = 'Mcp-Session-Id: ' . $session_id;
			if (!isset($_SESSION['dedalo'])) {
				$_SESSION['dedalo'] = [];
			}
			$_SESSION['dedalo']['mcp_session_id'] = $session_id;
		}

		// execute curl request with header capture
		// CURLOPT_TIMEOUT of 30 s is intentionally generous to accommodate
		// slow tool invocations on the MCP server. SSL verification is enforced;
		// if the proxy URL is non-HTTPS (e.g. localhost) the peer cert check is
		// a no-op but the flag is set defensively for production TLS targets.
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
		// The MCP-Session-Id returned by the server is a plain response header,
		// not part of the JSON body, so we must capture it via HEADERFUNCTION.
		// All names are lowercased for case-insensitive lookup below.
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
		// curl_exec() returns false only on transport errors (connection refused,
		// DNS failure, timeout). HTTP 4xx/5xx still return the body as a string.
		if ($body === false) {
			$response->msg		= 'Error. MCP proxy curl failed: ' . $curl_error;
			$response->errors[]	= 'proxy_error';
			return $response;
		}

		// store MCP session ID from response
		// The MCP server sends Mcp-Session-Id on the initialize response (and may
		// re-send it on reconnect). Store it in $_SESSION so the next page load can
		// resume the same server-side agent context without a fresh initialize.
		if (isset($response_headers['mcp-session-id'])) {
			if (!isset($_SESSION['dedalo'])) {
				$_SESSION['dedalo'] = [];
			}
			$_SESSION['dedalo']['mcp_session_id'] = $response_headers['mcp-session-id'];
			$session_id = $response_headers['mcp-session-id'];
		}

		// handle non-2xx responses
		// (!) HTTP 4xx/5xx from the MCP server are not necessarily fatal.
		// One recoverable case: a second initialize call returns HTTP 409 or 400
		// with "already initialized" in the error message. If we already hold a
		// valid session ID we can treat this as success and reuse the session.
		if ($http_code >= 400) {

			// parse error body for structured JSON-RPC error
			// The error body may still be a valid JSON-RPC error object even on 4xx,
			// so attempt to parse it to extract the human-readable error message.
			$error_data = self::parse_mcp_response($body);
			$error_msg = '';
			if ($error_data && isset($error_data->error) && isset($error_data->error->message)) {
				$error_msg = $error_data->error->message;
			}

			// "already initialized" is recoverable if we have a stored session ID
			// This happens when the browser reconnects to a long-lived MCP server that
			// was initialized in a previous PHP session but still holds the agent state.
			if ($method === 'initialize' && str_contains($error_msg, 'already initialized')) {
				if (!empty($session_id)) {
					// we have a session ID already — treat as success
					$response->result	= true;
					$response->msg		= 'OK. MCP server already initialized';
					$response->data		= $error_data;
					$response->mcp_session_id = $session_id;
					return $response;
				} else {
					// no session ID — server needs restart
					// Without a session ID we cannot address the existing MCP agent.
					// The operator must restart dedalo-work-mcp to create a fresh session.
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
		// The MCP server negotiates SSE when the client sends Accept: text/event-stream.
		// parse_mcp_response() transparently handles both wire formats.
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
		if (!empty($session_id)) {
			$response->mcp_session_id = $session_id;
		}

		return $response;
	}//end mcp_proxy



	/**
	* PARSE_MCP_RESPONSE
	* Extracts a JSON-RPC response object from the raw MCP server body.
	*
	* The MCP server can respond in two formats depending on HTTP content
	* negotiation:
	*  1. Plain JSON  — the body is a single JSON-RPC 2.0 object.
	*  2. SSE (Server-Sent Events) — the body contains lines of the form
	*       "data: {json}"
	*     A single event stream may carry multiple data lines; the last
	*     non-empty data line is used because it represents the final result
	*     after any intermediate progress events.
	*
	* Returns null when neither format yields a valid object; the caller maps
	* this to a 'parse_error' response and includes the raw body for debugging.
	*
	* @param string $body - Raw HTTP response body from the MCP server
	* @return object|null - Decoded JSON-RPC response object, or null on failure
	*/
	private static function parse_mcp_response(string $body) : ?object {

		// try direct JSON parse first
		// Fast path for the common case where the server sends plain JSON.
		$parsed = json_decode($body);
		if (json_last_error() === JSON_ERROR_NONE && is_object($parsed)) {
			return $parsed;
		}

		// extract from SSE format: data: {json}
		// SSE lines have the form "data: <payload>". Only data-carrying lines
		// are collected; blank lines, "event:", "id:", and "retry:" are skipped.
		// The last data line is chosen because SSE streams may emit intermediate
		// partial events before the final result.
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
