<?php
$f = $_GET['f'];
$page_title = pathinfo($f,PATHINFO_BASENAME);
?>
<html>
<head>
<meta name="viewport" content="width=device-width, minimum-scale=0.1">
<script type="text/javascript" src="../../../background-color-theif/background-color-theif.js"></script>
<title><?php echo $page_title ?></title>
</head>
<body style="margin:0" onMouseUp="window.close()">
<img id="image_current" src="<?php echo $f ?>" onload="getBackgroundColor(this)" style="position: fixed;top: 50%;left: 50%;transform: translate(-50%, -50%);">
<?php /*
<div id="image_container" style="position:absolute;opacity:1;background-image:url(<?php echo $f ?>);background-repeat:no-repeat;width: 100%;height: 100%;background-size: contain;background-position: center;"></div>
*/ ?>
</body>
</html>
<script type="text/javascript">
function getBackgroundColor(img) {

	// Image size	
  	var height = img.height;
  	var width  = img.width;
  		//console.log(height+" - "+width)

  	var tool_bar = 51
  	if (typeof window.chrome=="undefined") {
  		tool_bar = 22
  	}
  	window.resizeTo(width, height+tool_bar);

  	//document.getElementById('image_container').style.opacity = 1
  
    var colorThief = new BackgroundColorTheif();  
    var rgb = colorThief.getBackGroundColor( document.getElementById('image_current') );  // document.getElementsByTagName('body')
    console.log('background-color = '+rgb);
    document.body.style.backgroundColor = 'rgb(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] +')';  return

}
</script>