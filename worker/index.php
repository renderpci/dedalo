<?php declare(strict_types=1);
/**
 * Dédalo RoadRunner Worker — Thin Entry Point
 *
 * Bootstraps the RoadRunner environment and delegates request processing
 * to the modular worker_loop class. All per-request logic (CORS, session,
 * caching, SSE streaming, response building) lives in worker/.
 *
 * @see worker/class.worker_loop.php
 * @see worker/class.worker_bootstrap.php
 */

use Dedalo\RoadRunner\worker_bootstrap;
use Dedalo\RoadRunner\worker_loop;

// Define APP_ROOT before bootstrap (project root, one level up from worker/)
define('APP_ROOT', dirname(__DIR__));

// Load RoadRunner worker classes (no PSR-4 autoload in composer.json)
require_once __DIR__ . '/class.worker_bootstrap.php';
require_once __DIR__ . '/class.cors_middleware.php';
require_once __DIR__ . '/class.file_upload_normalizer.php';
require_once __DIR__ . '/class.request_context.php';
require_once __DIR__ . '/class.session_manager.php';
require_once __DIR__ . '/class.cache_manager.php';
require_once __DIR__ . '/class.response_builder.php';
require_once __DIR__ . '/class.sse_streamer.php';
require_once __DIR__ . '/class.worker_loop.php';

// Bootstrap: autoload, RR worker, RPC/KV, Dédalo config, error reporting
$context = worker_bootstrap::init();

// Create the worker loop with all default components
$loop = worker_loop::from_context($context);

// Run the main request loop
$loop->run();
