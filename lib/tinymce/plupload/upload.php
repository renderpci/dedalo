<?php
require_once( dirname(dirname(dirname(__FILE__))) .'/dedalo/config/config4.php'); 
if(login::is_logged()!==true) {
    $string_error = "Auth error: please login";
    print dd_error::wrap_error($string_error);
    die();
}

  /*******************************************************
   * Only these origins will be allowed to upload images *
   ******************************************************/
  $accepted_origins = array("localhost", DEDALO_HOST);
 
  
  /*********************************************
   * Change this line to set the upload folder *
   *********************************************/
  #$imageFolder = "images/";
  $image_folder_path = DEDALO_MEDIA_BASE_PATH . DEDALO_IMAGE_FOLDER . DEDALO_IMAGE_WEB_FOLDER . '/';
  $image_folder_url  = DEDALO_MEDIA_BASE_URL  . DEDALO_IMAGE_FOLDER . DEDALO_IMAGE_WEB_FOLDER . '/';

  reset ($_FILES);
  $temp = current($_FILES);
  if (is_uploaded_file($temp['tmp_name'])){
    if (isset($_SERVER['HTTP_HOST'])) {
      // same-origin requests won't set an origin. If the origin is set, it must be valid.
      if (in_array($_SERVER['HTTP_HOST'], $accepted_origins)) {
        header('Access-Control-Allow-Origin: ' . $_SERVER['HTTP_HOST']);
      } else {
        header("HTTP/1.0 403 Origin Denied");
        return;
      }
    }

    /*
      If your script needs to receive cookies, set images_upload_credentials : true in
      the configuration and enable the following two headers.
    */
    // header('Access-Control-Allow-Credentials: true');
    // header('P3P: CP="There is no P3P policy."');

    // Sanitize input
    if (preg_match("/([^\w\s\d\-_~,;:\[\]\(\).])|([\.]{2,})/", $temp['name'])) {
        header("HTTP/1.0 500 Invalid file name.");
        return;
    }

    // Verify extension
    if (!in_array(strtolower(pathinfo($temp['name'], PATHINFO_EXTENSION)), array("gif", "jpg", "png"))) {
        header("HTTP/1.0 500 Invalid extension.");
        return;
    }

    // Accept upload if there was no origin, or if it is an accepted origin
    $filetowrite = $image_folder_path . $temp['name'];
    move_uploaded_file($temp['tmp_name'], $filetowrite);

    // Respond to the successful upload with JSON.
    // Use a location key to specify the path to the saved image resource.
    // { location : '/your/uploaded/image/file'}
    #echo json_encode(array('location' => $filetowrite));
    $filetoshow = $image_folder_url . $temp['name'];
    echo $filetoshow;
  } else {
    // Notify editor that the upload failed
    header("HTTP/1.0 500 Server Error");
  }
?>