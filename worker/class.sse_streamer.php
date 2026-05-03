<?php declare(strict_types=1);
/**
 * SSE_STREAMER
 * Handles Server-Sent Events (SSE) streaming for RoadRunner worker.
 *
 * Detects when the Dédalo API returns a Generator (SSE stream) and forwards
 * yielded chunks directly to RoadRunner via HttpWorker::respond() with a
 * Generator body, which triggers respondStream() for true chunk-by-chunk
 * delivery to the client.
 *
 * This enables existing Generator-based endpoints like `sse_ping` and
 * `get_process_status_stream` to work natively under RoadRunner.
 *
 * @package Dedalo
 * @subpackage RoadRunner
 */
namespace Dedalo\RoadRunner;

use Spiral\RoadRunner\Http\PSR7Worker;
use Spiral\RoadRunner\Http\HttpWorker;
use Psr\Http\Message\ServerRequestInterface;

final class sse_streamer {

	/**
	 * Actions that are known to produce SSE/Generator responses.
	 * Used for fast-path detection without needing to inspect the response.
	 *
	 * @var array<string,bool>
	 */
	private const SSE_ACTIONS = [
		'sse_ping'                   => true,
		'get_process_status'        => true,
		'get_process_status_stream' => true,
	];

	/**
	 * IS_STREAM_REQUEST
	 * Determines if the request should be handled as an SSE stream.
	 *
	 * Checks:
	 * 1. The `is_stream` flag in the request body
	 * 2. Known SSE action names
	 *
	 * @param object|null $rqo Parsed request object (from JSON body)
	 * @return bool
	 */
	public static function is_stream_request(?object $rqo) : bool {

		if ($rqo === null) {
			return false;
		}

		// Explicit is_stream flag
		if (isset($rqo->is_stream) && $rqo->is_stream === true) {
			return true;
		}

		// Known SSE actions
		$action = $rqo->action ?? null;
		if (is_string($action) && isset(self::SSE_ACTIONS[$action])) {
			return true;
		}

		return false;
	}

	/**
	 * STREAM
	 * Executes the Dédalo API and streams Generator output via RoadRunner.
	 *
	 * Uses HttpWorker::respond() with a Generator body, which triggers
	 * respondStream() for true chunk-by-chunk delivery. Each yielded SSE
	 * chunk ("data:\n{json}\n\n") is sent as a separate frame to the client.
	 *
	 * @param PSR7Worker $psr7_worker
	 * @param callable $app Callable that returns a Generator or mixed
	 * @param ServerRequestInterface $request
	 * @param cors_middleware $cors
	 * @return void
	 */
	public static function stream(
		PSR7Worker $psr7_worker,
		callable $app,
		ServerRequestInterface $request,
		cors_middleware $cors
	) : void {

		// Execute the API — it should return a Generator for SSE actions
		$response = $app();

		if (!($response instanceof \Generator)) {
			// Fallback: if the API didn't return a Generator, treat as normal response
			worker_bootstrap::debug_log('RR Worker SSE: Expected Generator, got ' . gettype($response) . '. Falling back to normal response.');

			$output = is_string($response) ? $response : json_encode($response);
			$psr7_response = new \Nyholm\Psr7\Response();
			$psr7_response->getBody()->write($output ?: '{}');
			if (!$psr7_response->hasHeader('Content-Type')) {
				$psr7_response = $psr7_response->withHeader('Content-Type', 'application/json; charset=utf-8');
			}
			$psr7_response = $cors->apply($psr7_response, $request);
			$psr7_worker->respond($psr7_response);
			return;
		}

		// Build SSE headers for the initial response frame
		$sse_headers = [
			'Content-Type'      => ['text/event-stream'],
			'Cache-Control'     => ['no-cache, must-revalidate'],
			'Connection'        => ['keep-alive'],
			'X-Accel-Buffering' => ['no'],
		];

		// Apply CORS headers
		$cors_response = $cors->apply(new \Nyholm\Psr7\Response(200), $request);
		foreach ($cors_response->getHeaders() as $name => $values) {
			$sse_headers[$name] = $values;
		}

		// Use HttpWorker::respond() with Generator body for true streaming.
		// HttpWorker::respond() detects Generator instances and delegates to
		// respondStream(), which sends each yielded chunk as a separate frame.
		$http_worker = $psr7_worker->getHttpWorker();
		$http_worker->respond(
			200,              // status
			$response,        // Generator body — triggers respondStream()
			$sse_headers      // headers (sent with first chunk)
		);
	}
}
