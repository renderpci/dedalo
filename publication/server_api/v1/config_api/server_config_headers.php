<?php
// PUBLIC API HEADERS
	// Allow CORS — the publication API is intentionally world-readable
	// (its only auth gate is the shared `code` parameter), so a wildcard
	// origin is correct here. Credentials must NEVER be enabled on this
	// origin (`Access-Control-Allow-Credentials: true`) because that
	// combination would allow any site to issue authenticated requests
	// on behalf of the visitor.
	header("Access-Control-Allow-Origin: *");

	$allow_headers = ['Content-Type'];
	header("Access-Control-Allow-Headers: ". implode(', ', $allow_headers));

	// SEC-105: dropped the dead reflective-CORS sample block that lived
	// here as commented-out code. Reflecting `$_SERVER['HTTP_ORIGIN']`
	// (and worse, `$_SERVER['HTTP_ACCESS_CONTROL_REQUEST_HEADERS']`) is
	// a documented anti-pattern: it lets any origin pass the same-origin
	// check by claiming to be that origin, and the snippet paired it
	// with `Access-Control-Allow-Credentials: true`, which would expose
	// publication content with the visitor's cookies attached. The
	// pattern was never enabled (the `cors()` function call was
	// commented out), so we delete it outright to avoid future revival.