<?php declare(strict_types=1);
/**
 * WORKER_BOOTSTRAP
 * One-time initialization for the RoadRunner worker process.
 *
 * Handles: autoload, RR worker/PSR-7 creation, RPC + KV Factory init,
 * Dédalo config loading, persistent connections, error reporting setup.
 *
 * @package Dedalo
 * @subpackage RoadRunner
 */
namespace Dedalo\RoadRunner;

use Spiral\RoadRunner;
use Nyholm\Psr7;

final class worker_bootstrap {

	/**
	 * Context object holding all initialized services.
	 */
	public readonly RoadRunner\Worker $worker;
	public readonly RoadRunner\Http\PSR7Worker $psr7_worker;
	public readonly ?\Spiral\Goridge\RPC\RPC $rpc;
	public readonly ?RoadRunner\KeyValue\Factory $kv_factory;

	/**
	 * Private constructor — use init() factory method.
	 */
	private function __construct(
		RoadRunner\Worker $worker,
		RoadRunner\Http\PSR7Worker $psr7_worker,
		?\Spiral\Goridge\RPC\RPC $rpc,
		?RoadRunner\KeyValue\Factory $kv_factory
	) {
		$this->worker       = $worker;
		$this->psr7_worker  = $psr7_worker;
		$this->rpc          = $rpc;
		$this->kv_factory   = $kv_factory;
	}

	/**
	 * INIT
	 * Performs all one-time bootstrap steps and returns a populated context.
	 *
	 * @return self
	 * @throws \RuntimeException If autoload or config is missing
	 */
	public static function init() : self {

		// Mark that we are running inside RoadRunner
		if (!defined('DEDALO_RR_WORKER')) {
			define('DEDALO_RR_WORKER', true);
		}
		if (!defined('DEDALO_RR_DEBUG')) {
			define('DEDALO_RR_DEBUG', false);
		}

		// Autoload — APP_ROOT is defined in worker/index.php before this call
		$autoload = rtrim(APP_ROOT, '/') . '/vendor/autoload.php';
		if (!file_exists($autoload)) {
			throw new \RuntimeException("Autoload not found at $autoload. Run composer install.");
		}
		require $autoload;

		// RoadRunner worker + PSR-7
		$worker = RoadRunner\Worker::create();
		$psr7_worker = new RoadRunner\Http\PSR7Worker(
			$worker,
			new Psr7\Factory\Psr17Factory(),
			new Psr7\Factory\Psr17Factory(),
			new Psr7\Factory\Psr17Factory()
		);

		// RPC + KV Factory (optional — may fail if RR not configured)
		$rpc        = null;
		$kv_factory = null;
		try {
			$rpc = \Spiral\Goridge\RPC\RPC::create('tcp://127.0.0.1:6001');
			$kv_factory = new RoadRunner\KeyValue\Factory($rpc);
		} catch (\Throwable $e) {
			error_log('RR Worker WARNING: Failed to initialize KV Factory: ' . $e->getMessage());
		}

		// Dédalo config — APP_ROOT is defined in worker/index.php before init()
		$config_path = APP_ROOT . '/config/bootstrap.php';
		if (!file_exists($config_path)) {
			throw new \RuntimeException("Config not found at $config_path");
		}
		require $config_path;

		// Persistent DB connections for RR worker loops
		if (!defined('PERSISTENT_CONNECTION')) {
			define('PERSISTENT_CONNECTION', true);
		}

		// Suppress deprecation warnings (e.g. protobuf) and ensure clean output
		error_reporting(E_ALL & ~E_DEPRECATED & ~E_USER_DEPRECATED);
		ini_set('display_errors', '0');

		return new self($worker, $psr7_worker, $rpc, $kv_factory);
	}

	/**
	 * Debug log helper — only logs when DEDALO_RR_DEBUG is true.
	 *
	 * @param string $message
	 * @return void
	 */
	public static function debug_log(string $message) : void {

		if (defined('DEDALO_RR_DEBUG') && DEDALO_RR_DEBUG === true) {
			error_log($message);
		}
	}
}
