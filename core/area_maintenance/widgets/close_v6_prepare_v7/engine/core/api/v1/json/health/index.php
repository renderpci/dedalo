<?php
/**
* HEALTH ENDPOINT
* Lightweight liveness probe for the Dédalo JSON API.
*
* Responds to any HTTP request with a minimal JSON object indicating that
* the PHP process is running and able to serve requests. It is intentionally
* dependency-free: it loads no config, no classes, and performs no database
* access, so it remains available even when config.php or the database layer
* is broken.
*
* Response shape:
*   {"status":"ok","timestamp":<unix-seconds>}
*
* Typical callers:
*   - Load-balancer health checks (HAProxy, nginx upstream, AWS ALB).
*   - Container orchestration readiness/liveness probes (Docker, Kubernetes).
*   - Monitoring services that need a cheap is-the-server-alive ping.
*
* @package Dédalo
* @subpackage API
*/

// health
header('Content-Type: application/json; charset=utf-8');

// PUBLIC API HEADERS (!) TEMPORAL 16-11-2022
// Allow CORS
// (!) Unconditional wildcard CORS: added as a temporary measure on 16-11-2022.
// The main API entry point (core/api/v1/json/index.php) uses the stricter
// DEDALO_CORS config-based origin allowlist introduced in SEC-012. This health
// endpoint predates that mechanism and still uses the open wildcard. It should
// be migrated to the same config-driven CORS logic, or remain open only if the
// health check is explicitly intended to be publicly accessible with no
// credential sharing.
header('Access-Control-Allow-Origin: *');

// Emit the liveness payload.
// time() returns the current Unix timestamp in seconds; consumers may use it
// to detect stale cached responses from a CDN or intermediary proxy.
echo json_encode(['status' => 'ok', 'timestamp' => time()]);
