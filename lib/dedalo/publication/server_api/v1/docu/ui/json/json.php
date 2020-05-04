<?php
# Base common file in json
$file = 'swagger.json';

# Read the file
$json_content = file_get_contents($file);
#print_r( $json_content );

# Parse string as object to allow edit
$json_content = json_decode( $json_content );

# Edit json file vars onthefly
	include(__DIR__ . '/json_enviroment.php');

# Encode again
$json_content = json_encode($json_content, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

# Echo modified json file here
print( $json_content );