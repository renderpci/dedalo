<?php declare(strict_types=1);
/**
 * SESSION_MANAGER
 * Handles per-request session lifecycle for RoadRunner worker.
 *
 * Manages: session close from previous request, cookie-based session ID
 * detection, save handler setup (redis/roadrunner KV), session_start_manager()
 * invocation, session write-close, and manual Set-Cookie injection for CLI.
 *
 * @package Dedalo
 * @subpackage RoadRunner
 */
namespace Dedalo\RoadRunner;

use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Message\ResponseInterface;
use Spiral\RoadRunner\KeyValue\Factory as KvFactory;

final class session_manager {

	/** @var KvFactory|null For RoadRunner KV session handler */
	private ?KvFactory $kv_factory;

	/**
	 * @param KvFactory|null $kv_factory
	 */
	public function __construct(?KvFactory $kv_factory) {

		$this->kv_factory = $kv_factory;
	}

	/**
	 * START
	 * Initializes session for the current request.
	 *
	 * Flow:
	 * 1. Close any active session from previous request
	 * 2. Detect session ID from cookies
	 * 3. Setup save handler (redis or roadrunner KV)
	 * 4. Start session via session_start_manager()
	 *
	 * @param ServerRequestInterface $request
	 * @return void
	 */
	public function start(ServerRequestInterface $request) : void {

		// Close any active session from previous request
		if (session_status() === PHP_SESSION_ACTIVE) {
			session_write_close();
		}

		// Detect session ID from cookies BEFORE starting manager
		// WORKER-04: key the '_ssl' suffix off the same HTTPS predicate as
		// cookie_secure (DEDALO_PROTOCOL) so the session name and the cookie's
		// Secure flag cannot disagree (isset($_SERVER['HTTPS']) is true even for "off").
		$dedalo_session_name = 'dedalo_' . DEDALO_MAJOR_VERSION . '_' . DEDALO_ENTITY
			. (DEDALO_PROTOCOL === 'https://' ? '_ssl' : '');
		$dedalo_session_name = str_replace([',', '.'], '_', $dedalo_session_name);

		// AUTH-05: log cookie names only, never their values (one is the session id).
		worker_bootstrap::debug_log('RR Worker: Incoming Cookie names: ' . implode(',', array_keys($_COOKIE)));
		worker_bootstrap::debug_log('RR Worker: Target Session Name: ' . $dedalo_session_name);

		$cookies = $request->getCookieParams();
		if (isset($cookies[$dedalo_session_name])) {
			worker_bootstrap::debug_log('RR Worker: Found session cookie: ' . $cookies[$dedalo_session_name]);
			session_id($cookies[$dedalo_session_name]);
		}

		// Save handler configuration
		$save_handler = defined('DEDALO_SESSION_HANDLER') ? DEDALO_SESSION_HANDLER : 'redis';
		$save_path    = defined('DEDALO_SESSION_SAVE_PATH') ? DEDALO_SESSION_SAVE_PATH : 'tcp://127.0.0.1:6379';

		// Support legacy RoadRunner KV if explicitly configured
		if ($save_handler === 'roadrunner' && $this->kv_factory !== null) {
			try {
				$storage = $this->kv_factory->select('dedalo_sessions');

				require_once __DIR__ . '/class.roadrunner_session_handler.php';
				$rr_handler = new RoadRunnerSessionHandler($storage, intval(8 * 3600));
				session_set_save_handler($rr_handler, true);

				worker_bootstrap::debug_log('RR Worker: RoadRunner KV Session Handler registered (BoltDB)');
			} catch (\Throwable $e) {
				error_log('RR Worker ERROR: Failed to initialize KV Session Handler: ' . $e->getMessage());
			}
		}

		// Start session via Dédalo's session_start_manager
		\session_start_manager([
			'save_handler'         => $save_handler,
			'timeout_seconds'     => intval(8 * 3600),
			'save_path'           => $save_path,
			'session_name'        => $dedalo_session_name,
			'cookie_secure'       => (DEDALO_PROTOCOL === 'https://'),
			'cookie_samesite'     => (DEVELOPMENT_SERVER === true) ? 'Lax' : 'Strict',
			'prevent_session_lock' => defined('PREVENT_SESSION_LOCK') ? PREVENT_SESSION_LOCK : false,
		]);

		// AUTH-05: never log session/cookie secrets verbatim (the session id IS the
		// auth token; $_SESSION holds csrf/salt_secure). Log only a short id hash and
		// the set of keys, so leaving debug on does not leak forgeable credentials.
		worker_bootstrap::debug_log('RR Worker: Session started. ID#: ' . substr(hash('sha256', (string)session_id()), 0, 8));
		worker_bootstrap::debug_log('RR Worker: Session keys after start: ' . implode(',', array_keys($_SESSION ?? [])));
	}

	/**
	 * CLOSE
	 * Closes the session if currently active.
	 *
	 * @return void
	 */
	public function close() : void {

		if (session_status() === PHP_SESSION_ACTIVE) {
			session_write_close();
		}
	}

	/**
	 * INJECT_COOKIE
	 * Manually injects the session Set-Cookie header into the PSR-7 response.
	 *
	 * PHP CLI doesn't always emit session cookies to headers_list(),
	 * so we must construct the Set-Cookie header manually.
	 *
	 * @param ResponseInterface $response
	 * @return ResponseInterface
	 */
	public function inject_cookie(ResponseInterface $response) : ResponseInterface {

		if (session_id() === '') {
			return $response;
		}

		$params      = session_get_cookie_params();
		$cookie_name = session_name();
		$cookie_val  = session_id();

		$parts = [
			sprintf('%s=%s', $cookie_name, $cookie_val),
			sprintf('Path=%s', $params['path']),
		];

		if (!empty($params['domain'])) {
			$parts[] = sprintf('Domain=%s', $params['domain']);
		}

		$max_age = $params['lifetime'] > 0 ? $params['lifetime'] : 8 * 3600;
		$parts[] = sprintf('Max-Age=%d', $max_age);

		if ($params['secure']) {
			$parts[] = 'Secure';
		}
		if ($params['httponly']) {
			$parts[] = 'HttpOnly';
		}
		// AUTH-09: always emit SameSite; fall back to a safe default when the
		// session cookie params don't carry one (Strict in prod, Lax in dev), so the
		// cookie is never sent without a SameSite policy.
		$samesite = !empty($params['samesite'])
			? $params['samesite']
			: ((defined('DEVELOPMENT_SERVER') && DEVELOPMENT_SERVER===true) ? 'Lax' : 'Strict');
		$parts[] = sprintf('SameSite=%s', $samesite);

		$cookie_str = implode('; ', $parts);
		// AUTH-05: do not log the cookie value (the session id); log the name only.
		worker_bootstrap::debug_log('RR Worker: Injecting Set-Cookie for: ' . $cookie_name);

		return $response->withAddedHeader('Set-Cookie', $cookie_str);
	}
}
