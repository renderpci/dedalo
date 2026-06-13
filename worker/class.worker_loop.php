<?php declare(strict_types=1);
/**
 * WORKER_LOOP
 * Orchestrates the RoadRunner request cycle, tying all modular components together.
 *
 * Flow per request:
 * 1. Cache reset (SEC-023)
 * 2. PSR-7 → PHP globals hydration
 * 3. CORS preflight check
 * 4. Session start
 * 5. SSE stream detection → stream or normal response
 * 6. Output capture → PSR-7 response build
 * 7. Session cookie injection + CORS application
 * 8. Respond to RoadRunner
 * 9. Session close
 *
 * @package Dedalo
 * @subpackage RoadRunner
 */
namespace Dedalo\RoadRunner;

use Spiral\RoadRunner\Http\PSR7Worker;

final class worker_loop {

	private worker_bootstrap $bootstrap;
	private cors_middleware $cors;
	private session_manager $session;
	private cache_manager $cache;
	private file_upload_normalizer $upload_normalizer;

	/** @var int Request counter for worker restart */
	private int $request_count = 0;

	/** @var int Max requests before worker restart (prevents memory leaks) */
	private int $max_requests;

	/**
	 * Constructor.
	 *
	 * @param worker_bootstrap $bootstrap
	 * @param cors_middleware $cors
	 * @param session_manager $session
	 * @param cache_manager $cache
	 * @param file_upload_normalizer $upload_normalizer
	 * @param int $max_requests Max requests before worker restart (default 50000)
	 */
	public function __construct(
		worker_bootstrap $bootstrap,
		cors_middleware $cors,
		session_manager $session,
		cache_manager $cache,
		file_upload_normalizer $upload_normalizer,
		int $max_requests = 50000
	) {
		$this->bootstrap         = $bootstrap;
		$this->cors              = $cors;
		$this->session           = $session;
		$this->cache             = $cache;
		$this->upload_normalizer = $upload_normalizer;
		$this->max_requests      = $max_requests;
	}

	/**
	 * FROM_CONTEXT
	 * Factory that creates a worker_loop with all default components from bootstrap.
	 *
	 * @param worker_bootstrap $bootstrap
	 * @return self
	 */
	public static function from_context(worker_bootstrap $bootstrap) : self {

		return new self(
			$bootstrap,
			new cors_middleware(),
			new session_manager($bootstrap->kv_factory),
			new cache_manager(),
			new file_upload_normalizer()
		);
	}

	/**
	 * RUN
	 * Main worker loop — processes requests until RoadRunner stops the worker
	 * or the max request count is reached.
	 *
	 * @return void
	 */
	public function run() : void {

		$psr7_worker = $this->bootstrap->psr7_worker;

		while ($request = $psr7_worker->waitRequest()) {
			try {
				$this->handle_request($psr7_worker, $request);
			} catch (\Throwable $e) {
				$this->bootstrap->worker->error((string)$e);
			}

			// Restart worker periodically to prevent memory leaks
			$this->request_count++;
			if ($this->request_count >= $this->max_requests) {
				worker_bootstrap::debug_log('RR Worker: Restarting after ' . $this->request_count . ' requests');
				exit(0); // RoadRunner will restart the worker
			}
		}
	}

	/**
	 * HANDLE_REQUEST
	 * Processes a single request through the full pipeline.
	 *
	 * @param PSR7Worker $psr7_worker
	 * @param \Psr\Http\Message\ServerRequestInterface $request
	 * @return void
	 */
	private function handle_request(PSR7Worker $psr7_worker, $request) : void {

		// 1. Reset per-request state
		$this->cache->reset();
		// Clear any header() state left by the previous request for EVERY branch
		// (normal/SSE/preflight). The SSE branch never reaches response_builder::build(),
		// so without this a header()/Set-Cookie emitted while streaming would bleed
		// into the next request's response. (WORKER-02)
		if (!headers_sent()) {
			header_remove();
		}

		// 2. Hydrate PHP globals from PSR-7
		$ctx = request_context::from_request($request, $this->upload_normalizer);
		$ctx->hydrate_globals();

		// 3. CORS preflight — short-circuit OPTIONS requests
		$preflight_response = $this->cors->handle_preflight($request);
		if ($preflight_response !== null) {
			$psr7_worker->respond($preflight_response);
			return;
		}

		// 4. Session start
		$this->session->start($request);

		// 5. Check for SSE stream request
		$rqo = $this->parse_request_object($ctx->raw_body);
		if (sse_streamer::is_stream_request($rqo)) {
			$this->handle_sse_request($psr7_worker, $request);
			$this->session->close();
			return;
		}

		// 6. Normal request: capture output + build response
		$response = $this->handle_normal_request($psr7_worker);

		// 7. Apply session cookie + CORS
		$response = $this->session->inject_cookie($response);
		$response = $this->cors->apply($response, $request);

		worker_bootstrap::debug_log('RR Worker: Request Origin: ' . $request->getHeaderLine('Origin'));
		worker_bootstrap::debug_log('RR Worker: Request Host: ' . $request->getHeaderLine('Host'));

		// 8. Respond
		$psr7_worker->respond($response);

		// 9. Session close
		$this->session->close();
	}

	/**
	 * HANDLE_NORMAL_REQUEST
	 * Captures Dédalo API output and builds a PSR-7 response.
	 *
	 * @param PSR7Worker $psr7_worker
	 * @return \Psr\Http\Message\ResponseInterface
	 */
	private function handle_normal_request(PSR7Worker $psr7_worker) : \Psr\Http\Message\ResponseInterface {

		$output = response_builder::capture_output(function() : void {
			// Execute Dédalo API entry point in isolated scope
			(function() : void {
				require APP_ROOT . '/core/api/v1/json/index.php';
			})();
		});

		$this->session->close();

		return response_builder::build($output);
	}

	/**
	 * HANDLE_SSE_REQUEST
	 * Handles an SSE/streaming request using the sse_streamer.
	 *
	 * @param PSR7Worker $psr7_worker
	 * @param \Psr\Http\Message\ServerRequestInterface $request
	 * @return void
	 */
	private function handle_sse_request(PSR7Worker $psr7_worker, $request) : void {

		sse_streamer::stream(
			$psr7_worker,
			function() : mixed {
				// Execute Dédalo API — may return a Generator for SSE actions
				// We need to capture the response object from dd_manager
				return $this->execute_api_for_stream();
			},
			$request,
			$this->cors
		);
	}

	/**
	 * EXECUTE_API_FOR_STREAM
	 * Executes the Dédalo API and returns the response object (possibly a Generator).
	 *
	 * Unlike the normal path which captures echo output, this method needs
	 * the actual return value from dd_manager to detect Generators.
	 *
	 * @return mixed Response object or Generator
	 */
	private function execute_api_for_stream() : mixed {

		// Parse the request body to get the rqo
		$str_json = $GLOBALS['DEDALO_RAW_BODY'] ?? '';
		$rqo = !empty($str_json) ? json_decode($str_json) : null;

		if ($rqo === null) {
			return (object)['result' => false, 'msg' => 'Invalid JSON for SSE request'];
		}

		// SQO + ddo_map security scrub. This is an untrusted HTTP entry point, exactly
		// like core/api/v1/json/index.php; without this scrub a client could smuggle
		// raw SQL fields or flip skip_projects_filter through the stream path. Shared
		// gate so the two entry points cannot drift. (WORKER-01)
		// @see dd_manager::sanitize_client_rqo
		$rqo = \dd_manager::sanitize_client_rqo($rqo);

		// Replicate the API entry point logic minimally for streaming
		// CSRF bootstrap
		if (class_exists('\dd_manager') && method_exists('\dd_manager', 'bootstrap_csrf_token')) {
			\dd_manager::bootstrap_csrf_token();
		}

		// Close session for streaming (prevent lock)
		$this->session->close();

		// Execute via dd_manager directly to get the response object
		$manager  = new \dd_manager();
		$response = $manager->manage_request($rqo);

		return $response;
	}

	/**
	 * PARSE_REQUEST_OBJECT
	 * Parses the raw JSON body into a request object for SSE detection.
	 *
	 * @param string|null $raw_body
	 * @return object|null
	 */
	private function parse_request_object(?string $raw_body) : ?object {

		if (empty($raw_body)) {
			return null;
		}

		$decoded = json_decode($raw_body);
		return is_object($decoded) ? $decoded : null;
	}
}
