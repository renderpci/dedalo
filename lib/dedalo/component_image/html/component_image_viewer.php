<?php
include( dirname(dirname(dirname(__FILE__))).'/config/config4.php');
$f = common::setVar('f');
$page_title = pathinfo($f, PATHINFO_BASENAME);
# BOOTSTRAP_CSS_URL
?>
<html>
<head>
<meta name="viewport" content="width=device-width, minimum-scale=0.1">
<link href="<?php echo BOOTSTRAP_CSS_URL ?>" rel="stylesheet">
<script type="text/javascript" src="../../../background-color-theif/background-color-theif.js"></script>
<title><?php echo $page_title ?></title>
</head>
<body style="margin:0">
<?php 
/*
position: fixed;top: 50%;left: 50%;transform: translate(-50%, -50%);
*/ ?>
<img id="image_current" src="<?php echo $f ?>" onload="getBackgroundColor(this)" style="max-width:100%;" onMouseUp="window.close()">
<button type="submit" class="btn btn-primary start" style="position:fixed;right: 10px;bottom: 10px;z-index: 9999" onclick="download_original_image(this, event)">
    <i class="glyphicon glyphicon-download"></i>
    <span> </span>
</button>
<?php /*
<div id="image_container" style="position:absolute;opacity:1;background-image:url(<?php echo $f ?>);background-repeat:no-repeat;width: 100%;height: 100%;background-size: contain;background-position: center;"></div>
*/ ?>
</body>
</html>
<script type="text/javascript">
var SHOW_DEBUG = <?php echo json_encode(SHOW_DEBUG) ?>;
function getBackgroundColor(img) {

	// Image size	
  	const height = img.height;
  	const width  = img.width;
  		//console.log(height+" - "+width)

    const tool_bar_height = (window.outerHeight - window.innerHeight) || 50
   
  	window.resizeTo(width, height+tool_bar_height)

  	//document.getElementById('image_container').style.opacity = 1
  
    var colorThief = new BackgroundColorTheif();  
    var rgb = colorThief.getBackGroundColor( document.getElementById('image_current') );  // document.getElementsByTagName('body')
    if(SHOW_DEBUG===true) {
      console.log('[getBackgroundColor] set background-color = '+rgb);
    }    
    document.body.style.backgroundColor = 'rgb(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] +')';

  return rgb
}
function download_original_image(button_obj, event) {
    event.stopPropagation()
    event.preventDefault()
    if(SHOW_DEBUG===true) {
      console.log("[download_original_image] event:",event);
    }     

    let url = '<?php echo $f ?>';
    let default_quality = '<?php echo DEDALO_IMAGE_QUALITY_DEFAULT ?>'
    
    let original_url = url.replace(default_quality, 'original')
        original_url = original_url.split('?')[0]
        //console.log("original_url:",original_url);

    let name = original_url.split('original')[1]

    // Create a temporal a element and click
    let pom = document.createElement('a');
      //pom.setAttribute('href', 'data:application/octet-stream,' + encodeURIComponent("text"));
      pom.href = original_url
      pom.setAttribute('download', name);
      pom.style.display = 'none';
      document.body.appendChild(pom);
      pom.click();
      document.body.removeChild(pom);

      return true
}
</script>