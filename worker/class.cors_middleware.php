<?php declare(strict_types=1);
/**
 * CORS_MIDDLEWARE
 * Applies CORS headers to PSR-7 responses based on DEDALO_CORS configuration.
 *
 * SEC-003: only echoes the Origin if it matches the configured allowlist;
 * never reflects arbitrary origins together with Allow-Credentials: true.
 *
 * @package Dedalo
 * @subpackage RoadRunner
 */
namespace Dedalo\RoadRunner;

use Nyholm\Psr7\Response;
use Psr\Http\Message\RequestInterface;
use Psr\Http\Message\ResponseInterface;

final class cors_middleware {

	/** @var array Resolved CORS config (cached on first access) */
	private ?array $config = null;

	/**
	 * Resolved CORS configuration from DEDALO_CORS constant.
	 * Cached after first call to avoid repeated constant lookups.
	 *
	 * @return array
	 */
	private function get_config() : array {

		if ($this->config !== null) {
			return $this->config;
		}

		$this->config = [
			'allowed_origins'  => (defined('DEDALO_CORS') && isset(DEDALO_CORS['allowed_origins']))
				? (array)DEDALO_CORS['allowed_origins']
				: [],
			'allowed_methods'  => (defined('DEDALO_CORS') && isset(DEDALO_CORS['allowed_methods']))
				? implode(', ', (array)DEDALO_CORS['allowed_methods'])
				: 'GET, POST, OPTIONS, PUT, DELETE',
			'allowed_headers'  => (defined('DEDALO_CORS') && isset(DEDALO_CORS['allowed_headers']))
				? implode(', ', (array)DEDALO_CORS['allowed_headers'])
				: 'Content-Type, Content-Range, Authorization, X-Requested-With',
			'max_age'          => (defined('DEDALO_CORS') && isset(DEDALO_CORS['max_age']))
				? (string)DEDALO_CORS['max_age']
				: '86400',
		];

		return $this->config;
	}

	/**
	 * HANDLE_PREFLIGHT
	 * Returns a preflight response for OPTIONS requests, or null for other methods.
	 *
	 * @param RequestInterface $request
	 * @return ResponseInterface|null Null if not OPTIONS
	 */
	public function handle_preflight(RequestInterface $request) : ?ResponseInterface {

		if ($request->getMethod() !== 'OPTIONS') {
			return null;
		}

		return $this->apply(new Response(200), $request);
	}

	/**
	 * APPLY
	 * Applies CORS headers to the given response based on the request Origin.
	 *
	 * @param ResponseInterface $response
	 * @param RequestInterface $request
	 * @return ResponseInterface
	 */
	public function apply(ResponseInterface $response, RequestInterface $request) : ResponseInterface {

		$config = $this->get_config();
		$origin = $request->getHeaderLine('Origin');

		$response = $response
			->withHeader('Access-Control-Allow-Methods', $config['allowed_methods'])
			->withHeader('Access-Control-Allow-Headers', $config['allowed_headers'])
			->withHeader('Access-Control-Max-Age', $config['max_age'])
			->withHeader('Vary', 'Origin');

		if ($origin !== '' && in_array($origin, $config['allowed_origins'], true)) {
			$response = $response
				->withHeader('Access-Control-Allow-Origin', $origin)
				->withHeader('Access-Control-Allow-Credentials', 'true');
		}

		return $response;
	}
}
