<?php declare(strict_types=1);
/**
 * REQUEST_CONTEXT
 * Value object holding per-request PHP globals hydrated from a PSR-7 request.
 *
 * Centralizes the PSR-7 → $_SERVER, $_GET, $_POST, $_COOKIE, $_FILES,
 * $_REQUEST, and raw body extraction that Dédalo's legacy code expects.
 *
 * @package Dedalo
 * @subpackage RoadRunner
 */
namespace Dedalo\RoadRunner;

use Psr\Http\Message\ServerRequestInterface;

final class request_context {

	public array $server;
	public array $get;
	public array $post;
	public array $cookie;
	public array $files;
	public array $request;
	public ?string $raw_body;
	public bool $is_multipart;

	/**
	 * Private constructor — use fromRequest() factory.
	 */
	private function __construct(
		array $server,
		array $get,
		array $post,
		array $cookie,
		array $files,
		array $request,
		?string $raw_body,
		bool $is_multipart
	) {
		$this->server       = $server;
		$this->get          = $get;
		$this->post         = $post;
		$this->cookie       = $cookie;
		$this->files        = $files;
		$this->request      = $request;
		$this->raw_body     = $raw_body;
		$this->is_multipart = $is_multipart;
	}

	/**
	 * FROM_REQUEST
	 * Hydrates all PHP globals from a PSR-7 request and returns a context object.
	 *
	 * @param ServerRequestInterface $request
	 * @param file_upload_normalizer $upload_normalizer
	 * @return self
	 */
	public static function from_request(
		ServerRequestInterface $request,
		file_upload_normalizer $upload_normalizer
	) : self {

		// Core globals from PSR-7
		$server = $request->getServerParams();
		$get    = $request->getQueryParams();
		$post  = $request->getParsedBody() ?? [];
		$cookie = $request->getCookieParams();

		// Populate $_REQUEST (GET + POST)
		$request_vars = array_merge($get, is_array($post) ? $post : []);

		// Ensure essential server variables for Dédalo
		$server['REQUEST_TIME_FLOAT'] = $server['REQUEST_TIME_FLOAT'] ?? microtime(true);
		// AUTH-04: do NOT default a missing peer address to loopback. 127.0.0.1 must
		// never appear here as it could be (mis)treated as a trusted proxy by
		// get_client_ip_trusted; leave it empty so no trust is inferred.
		$server['REMOTE_ADDR']        = $server['REMOTE_ADDR'] ?? '';
		$host_header = $request->getHeaderLine('Host');
		if (!empty($host_header)) {
			$server['HTTP_HOST'] = $host_header;
		}

		// Normalize uploaded files
		$files = [];
		$uploadedFiles = $request->getUploadedFiles();
		if (!empty($uploadedFiles)) {
			$files = $upload_normalizer->normalize($uploadedFiles);
		}

		// Raw body handling
		$content_type = $request->getHeaderLine('Content-Type');
		$is_multipart = stripos($content_type, 'multipart/form-data') !== false;
		$body         = (string)$request->getBody();
		$raw_body     = ($body !== '' && !$is_multipart) ? $body : null;

		return new self(
			$server,
			$get,
			$post,
			$cookie,
			$files,
			$request_vars,
			$raw_body,
			$is_multipart
		);
	}

	/**
	 * HYDRATE_GLOBALS
	 * Writes the context values into PHP superglobals so Dédalo's legacy code
	 * can access them via $_SERVER, $_GET, etc.
	 *
	 * @return void
	 */
	public function hydrate_globals() : void {

		$_SERVER  = $this->server;
		$_GET     = $this->get;
		$_POST    = $this->post;
		$_COOKIE  = $this->cookie;
		$_FILES   = $this->files;
		$_REQUEST = $this->request;

		$GLOBALS['DEDALO_RAW_BODY'] = $this->raw_body;
	}
}
