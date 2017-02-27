<?php
session_start();

if (isset($_GET['f'])) {
	$file_name = $_GET['f'];
}else{
	# Missing vars
	header('HTTP/1.0 401 Unauthorized');
	echo 'No file_name is received'; 
	exit();
}

if( empty($_SESSION['dedalo4']['auth']['user_id']) || 
	empty($_SESSION['dedalo4']['auth']['is_logged']) || 
	empty($_SESSION['dedalo4']['auth']['salt_secure'])) {

	# User if not logged. Exit here
	header('HTTP/1.0 401 Unauthorized'); 
	echo 'Sorry, you must login to view media'; 
	exit();
}

# Compose full apache path (is not real file path but apache perpective path)
$script_filename = $_SERVER['SCRIPT_FILENAME'];
$base_dir 		 = pathinfo($script_filename, PATHINFO_DIRNAME);
$full_path 		 = $base_dir .'/'. $file_name;
#die($full_path);

// Sendfile
header( 'X-Sendfile: ' . $full_path );

// The Content-Disposition header allows you to tell the browser if
// it should download the file or display it. Use "inline" instead of
// "attachment" if you want it to display in the browser. You can
// also set the filename the browser should use.
header('Content-Disposition: inline; filename="somefile.mp4"');

// The Content-Type header tells the browser what type of file it is.
header("Content-Type: video/mp4");
?>