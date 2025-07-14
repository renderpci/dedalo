<?php
// health
header('Content-Type: application/json; charset=utf-8');

// PUBLIC API HEADERS (!) TEMPORAL 16-11-2022
// Allow CORS
header('Access-Control-Allow-Origin: *');

echo json_encode(['status' => 'ok', 'timestamp' => time()]);
