<?php
###############################################################
# File Download 1.31
###############################################################
# Visit http://www.zubrag.com/scripts/ for updates
###############################################################
# Sample call:
#    download.php?f=phptutorial.zip
#
# Sample call (browser will try to save with new file name):
#    download.php?f=phptutorial.zip&fc=php123tutorial.zip
###############################################################

// Allow direct file download (hotlinking)?
// Empty - allow hotlinking
// If set to nonempty value (Example: example.com) will only allow downloads when referrer contains this text
define('ALLOWED_REFERRER', $allowed_referrer);	#define('ALLOWED_REFERRER', '');


// Download folder, i.e. folder where you keep all files for download.
// MUST end with slash (i.e. "/" )
define('BASE_DIR',$base_dir);

// log downloads?  true/false
define('LOG_DOWNLOADS',true);

// log file name
define('LOG_FILE', DEDALO_LOGS_DIR .'/dedalo_file_downloads.log');

// Allowed extensions list in format 'extension' => 'mime type'
// If myme type is set to empty string then script will try to detect mime type 
// itself, which would only work if you have Mimetype or Fileinfo extensions
// installed on server.
$allowed_ext = array (
	
	/*
	// archives
	'zip' => 'application/zip',
	
	// documents
	'pdf' => 'application/pdf',
	'doc' => 'application/msword',
	'xls' => 'application/vnd.ms-excel',
	'ppt' => 'application/vnd.ms-powerpoint',
	
	// executables
	'exe' => 'application/octet-stream',
	
	// images
	'gif' => 'image/gif',
	'png' => 'image/png',
	'tif' => 'image/jpeg',
	'jpeg' => 'image/jpeg',
	
	// audio
	'mp3' => 'audio/mpeg',
	'wav' => 'audio/x-wav',
	
	// video
	'mpeg' => 'video/mpeg',
	'mpg' => 'video/mpeg',
	'mpe' => 'video/mpeg',
	'avi' => 'video/x-msvideo',
	*/
  
	'mov' => 'video/quicktime',	
	'mp4' => 'video/mp4',
  
  # images
  'jpg' => 'image/jpeg',
  'jpeg' => 'image/jpeg',
  'png' => 'image/png',
  'gif' => 'image/gif',
  'tif' => 'image/tif',
  'psd' => 'image/psd',
  'bmp' => 'image/bmp',  
  'pdf' => 'application/pdf',

    // archives
  'zip' => 'application/zip',
);



####################################################################
###  DO NOT CHANGE BELOW
####################################################################

// If hotlinking not allowed then make hackers think there are some server problems
if (ALLOWED_REFERRER !== ''
&& (!isset($_SERVER['HTTP_REFERER']) || strpos(strtoupper($_SERVER['HTTP_REFERER']),strtoupper(ALLOWED_REFERRER)) === false)
) {
  die("Internal server error. Please contact system administrator (err1).");
}

// Make sure program execution doesn't time out
// Set maximum script execution time in seconds (0 means no limit)
set_time_limit(0);

if (!isset($file_name) || empty($file_name)) {
  die("Please specify file name for download.");
}

// Nullbyte hack fix
if (strpos($file_name, "\0") !== FALSE) die('');

// Get real file name.
// Remove any path info to avoid hacking by adding relative path, etc.
$fname = basename($file_name);


// Check if the file exists
// Check in subfolders too
function find_file ($dirname, $fname, &$file_path) {

  $dir = @opendir($dirname); if(!is_resource($dir)) die("Internal server error. Please contact system administrator.(err2)");

  while ($file = readdir($dir)) {
    if (empty($file_path) && $file != '.' && $file != '..') {
      if (is_dir($dirname.'/'.$file)) {
        find_file($dirname.'/'.$file, $fname, $file_path);
      }
      else {
        if (file_exists($dirname.'/'.$fname)) {
          $file_path = $dirname.'/'.$fname;
          return;
        }
      }
    }
  }

} // find_file

// get full file path (including subfolders)
$file_path = '';
find_file(BASE_DIR, $fname, $file_path);
 # dump(BASE_DIR.$image_id, ' BASE_DIR.$video_id ++ '.to_string());

if(isset($video_id) && is_dir(BASE_DIR.$video_id)){
  $org_folder = BASE_DIR.$video_id;
  $zip_folder = BASE_DIR.'zip/'.$video_id;
  $comand = 'zip -rj '.$zip_folder.'.zip '.$org_folder;
  exec($comand);
  $file_path = $zip_folder.'.zip';
  $fname = $video_id.'.zip';
  $file_name_showed = 'media_downloaded_' . substr(strrchr($fname, "_"), 1);

  if (!is_file($file_path)) {
    die("File does not exist. Make sure you specified correct file name."); 
  }
}




// file size in bytes
$fsize = filesize($file_path); 
// file extension
$fext = strtolower(substr(strrchr($fname,"."),1));

  // check if allowed extension
if (!array_key_exists($fext, $allowed_ext)) {
  die("Not allowed file type."); 
}


// get mime type
if ($allowed_ext[$fext] == '') {
  $mtype = '';
  // mime type is not set, get from server settings
  if (function_exists('mime_content_type')) {
    $mtype = mime_content_type($file_path);
  }
  else if (function_exists('finfo_file')) {
    $finfo = finfo_open(FILEINFO_MIME); // return mime type
    $mtype = finfo_file($finfo, $file_path);
    finfo_close($finfo);  
  }
  if ($mtype == '') {
    $mtype = "application/force-download";
  }
}
else {
  // get mime type defined by admin
  $mtype = $allowed_ext[$fext];
}

// Browser will try to save file with this filename, regardless original filename.
// You can override it if needed.

if (!isset($file_name_showed) || empty($file_name_showed)) {
  $asfname = $fname;
}
else {
  // remove some bad chars
  $asfname = str_replace(array('"',"'",'\\','/'), '', $file_name_showed);
  if ($asfname === '') $asfname = 'NoName';
}
// set headers
header("Pragma: public");
header("Expires: 0");
header("Cache-Control: must-revalidate, post-check=0, pre-check=0");
header("Cache-Control: public");
header("Content-Description: File Transfer");
header("Content-Type: $mtype");
header("Content-Disposition: attachment; filename=\"$asfname\"");
header("Content-Transfer-Encoding: binary");
header("Content-Length: " . $fsize);

// download
// @readfile($file_path);
$file = @fopen($file_path,"rb");
if ($file) {
  while(!feof($file)) {
    print(fread($file, 1024*8));
    flush();
    if (connection_status()!=0) {
      @fclose($file);
      die();
    }
  }
  @fclose($file);
}

if($fext == 'zip'){
  unlink($file_path);
}

// log downloads
if (!LOG_DOWNLOADS) die();

$f = @fopen(LOG_FILE, 'a+');
if ($f) {
  @fputs($f, date("d.m.Y g:ia")."  ".$_SERVER['REMOTE_ADDR']."  ".$fname."\n");
  @fclose($f);
}

?>